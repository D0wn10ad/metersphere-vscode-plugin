/**
 * Tests for the project symbol index (cross-file DTO resolution).
 *
 * Resolution order: (1) same-file registration, (2) the time-boxed
 * vscode.executeWorkspaceSymbolProvider LSP call, (3) a bounded on-disk scan of the
 * getCommonProjectPaths roots. Results cache in a Map. A genuinely-missing type
 * returns undefined without hanging.
 */

import { ProjectSymbolIndex } from '../src/metersphere/javaAst/projectSymbolIndex';
import { OpenApiBuilder, getUploadSymbolIndex, resetUploadSymbolIndex } from '../src/metersphere/openApiBuilder';
import { ParseResult } from '../src/metersphere/javaParser';

interface MockConfig {
  hover?: (...args: never[]) => unknown;
  symbols?: (...args: never[]) => unknown;
  extensions?: Array<{ id: string }>;
  documents?: Record<string, string>;
  delayMs?: number;
}

function setMock(cfg: MockConfig): void {
  (globalThis as unknown as { __vscodeMock?: MockConfig }).__vscodeMock = {
    extensions: [],
    documents: {},
    delayMs: 0,
    ...cfg,
  };
}

afterEach(() => {
  (globalThis as unknown as { __vscodeMock?: MockConfig }).__vscodeMock = undefined;
});

const controllerWithDto = [
  'package com.example.demo;',
  'import org.springframework.web.bind.annotation.*;',
  '@RestController',
  'public class C {',
  '  @PostMapping("/e")',
  '  public String e(@RequestBody EdgeDTO dto) { return "x"; }',
  '}',
  '',
  'class EdgeDTO {',
  '  private String name;',
  '  private int count;',
  '}',
].join('\n');

const controllerWithoutDto = [
  'package com.example.demo;',
  'import org.springframework.web.bind.annotation.*;',
  '@RestController',
  'public class C {',
  '  @PostMapping("/e")',
  '  public String e(@RequestBody EdgeDTO dto) { return "x"; }',
  '}',
].join('\n');

const dtoSrc = [
  'package com.example.dto;',
  'public class EdgeDTO {',
  '  private String name;',
  '  private int count;',
  '  public List<String> tags;',
  '}',
].join('\n');

describe('projectSymbolIndex', () => {
  it('(a) resolves a same-file type from the local registration without any LSP call', async () => {
    const spyCalls: string[] = [];
    setMock({
      symbols: (query: string) => {
        spyCalls.push(query);
        return [];
      },
    });
    const idx = new ProjectSymbolIndex(50);
    idx.register(controllerWithDto, 'file:///C.java');

    const resolved = await idx.resolve('EdgeDTO');

    expect(resolved).toBeDefined();
    expect(resolved!.name).toBe('EdgeDTO');
    expect(resolved!.fields.map((f) => f.name)).toEqual(['name', 'count']);
    expect(resolved!.fields.map((f) => f.javaType)).toEqual(['String', 'int']);
    expect(spyCalls).toEqual([]); // no LSP call for a same-file type
  });

  it('(b) resolves a cross-file type via the mocked symbol provider, then CST-parses the target fields', async () => {
    setMock({
      symbols: (query: string) => [
        { name: query, kind: 'Class', location: { uri: 'file:///dto.java' } },
      ],
      documents: { 'file:///dto.java': dtoSrc },
    });
    const idx = new ProjectSymbolIndex(50);
    idx.register(controllerWithoutDto, 'file:///C.java');

    const resolved = await idx.resolve('EdgeDTO');

    expect(resolved).toBeDefined();
    expect(resolved!.name).toBe('EdgeDTO');
    expect(resolved!.fields.map((f) => f.name)).toEqual(['name', 'count', 'tags']);
    expect(resolved!.fields[2].javaType).toBe('List<String>');
  });

  it('(c) returns undefined for a genuinely-missing type after the bounded scan and does not hang', async () => {
    setMock({ symbols: () => [] });
    const idx = new ProjectSymbolIndex(50);
    idx.register(controllerWithoutDto, 'file:///C.java');

    const resolved = await idx.resolve('MissingDto');

    expect(resolved).toBeUndefined();
  });

  it('(d) abandons an LSP call that resolves too late at the timeout and falls through to the scan', async () => {
    setMock({
      symbols: (query: string) => [{ name: query, kind: 'Class', location: { uri: 'file:///dto.java' } }],
      documents: { 'file:///dto.java': dtoSrc },
      delayMs: 500, // resolves AFTER the 50ms timeout
    });
    const idx = new ProjectSymbolIndex(50);
    idx.register(controllerWithoutDto, 'file:///C.java');

    const resolved = await idx.resolve('EdgeDTO');

    // The late LSP result is abandoned; the bounded scan finds nothing in the test env.
    expect(resolved).toBeUndefined();
  });

  it('(d2) abandons an LSP call that never resolves and falls through to the scan', async () => {
    setMock({
      symbols: () => new Promise(() => undefined), // never resolves
    });
    const idx = new ProjectSymbolIndex(50);
    idx.register(controllerWithoutDto, 'file:///C.java');

    const resolved = await idx.resolve('EdgeDTO');

    expect(resolved).toBeUndefined();
  });

  it('QA: with the symbol provider mocked to reject, resolution returns undefined (never throws)', async () => {
    setMock({
      symbols: () => {
        throw new Error('LSP exploded');
      },
    });
    const idx = new ProjectSymbolIndex(50);
    idx.register(controllerWithoutDto, 'file:///C.java');

    const resolved = await idx.resolve('EdgeDTO');

    expect(resolved).toBeUndefined();
  });

  it('caches resolved types (the second resolve does not re-invoke the LSP)', async () => {
    const spyCalls: string[] = [];
    setMock({
      symbols: (query: string) => {
        spyCalls.push(query);
        return [{ name: query, kind: 'Class', location: { uri: 'file:///dto.java' } }];
      },
      documents: { 'file:///dto.java': dtoSrc },
    });
    const idx = new ProjectSymbolIndex(50);
    idx.register(controllerWithoutDto, 'file:///C.java');

    await idx.resolve('EdgeDTO');
    await idx.resolve('EdgeDTO');

    expect(spyCalls).toHaveLength(1); // the second resolve hit the cache
  });
});

describe('projectSymbolIndex — enum/record/interface extraction + field annotations (T6)', () => {
  const enumSrc = [
    'package com.example.dto;',
    'public enum Status {',
    '  ACTIVE, INACTIVE',
    '}',
  ].join('\n');

  const annotatedDtoSrc = [
    'package com.example.dto;',
    'import javax.validation.constraints.*;',
    'import io.swagger.v3.oas.annotations.media.Schema;',
    'public class UserDto {',
    '  @Schema(description = "the name")',
    '  @NotNull',
    '  @Size(min = 1, max = 10)',
    '  private String name;',
    '  @Min(1)',
    '  private int count;',
    '}',
  ].join('\n');

  const recordSrc = [
    'package com.example.dto;',
    'public record Point(int x, String label) {}',
  ].join('\n');

  const interfaceSrc = [
    'package com.example.dto;',
    'public interface Shape {',
    '  int MAX = 10;',
    '  String name();',
    '  double area();',
    '}',
  ].join('\n');

  it('(e) registers an enum source as {kind:"enum", values:[...]} with an empty fields array', () => {
    setMock({ symbols: () => [] });
    const idx = new ProjectSymbolIndex(50);
    idx.register(enumSrc, 'file:///Status.java');

    const resolved = idx.resolveSync('Status');

    expect(resolved).toBeDefined();
    expect(resolved!.kind).toBe('enum');
    expect(resolved!.values).toEqual(['ACTIVE', 'INACTIVE']);
    expect(resolved!.fields).toEqual([]); // guarded: never undefined
  });

  it('(f) attaches validation constraints and @Schema description to fields', () => {
    setMock({ symbols: () => [] });
    const idx = new ProjectSymbolIndex(50);
    idx.register(annotatedDtoSrc, 'file:///UserDto.java');

    const resolved = idx.resolveSync('UserDto');

    expect(resolved).toBeDefined();
    const name = resolved!.fields.find((f) => f.name === 'name');
    expect(name).toBeDefined();
    expect(name!.description).toBe('the name');
    expect(name!.validation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'NotNull' }),
        expect.objectContaining({ type: 'Size' }),
      ]),
    );
    const count = resolved!.fields.find((f) => f.name === 'count');
    expect(count!.validation).toEqual([expect.objectContaining({ type: 'Min' })]);
  });

  it('(g) extracts record components as fields with kind "record"', () => {
    setMock({ symbols: () => [] });
    const idx = new ProjectSymbolIndex(50);
    idx.register(recordSrc, 'file:///Point.java');

    const resolved = idx.resolveSync('Point');

    expect(resolved).toBeDefined();
    expect(resolved!.kind).toBe('record');
    expect(resolved!.fields.map((f) => [f.name, f.javaType])).toEqual([
      ['x', 'int'],
      ['label', 'String'],
    ]);
  });

  it('(h) extracts interface methods AND constants as best-effort fields with kind "interface"', () => {
    setMock({ symbols: () => [] });
    const idx = new ProjectSymbolIndex(50);
    idx.register(interfaceSrc, 'file:///Shape.java');

    const resolved = idx.resolveSync('Shape');

    expect(resolved).toBeDefined();
    expect(resolved!.kind).toBe('interface');
    const byName = new Map(resolved!.fields.map((f) => [f.name, f.javaType]));
    // methods ride on methodHeader→result→unannType (T1 caveat); constants are constantDeclaration nodes
    expect(byName.get('name')).toBe('String');
    expect(byName.get('area')).toBe('double');
    expect(byName.get('MAX')).toBe('int');
  });

  it('(i) building a doc whose body field resolves to an enum does not throw', () => {
    setMock({ symbols: () => [] });
    resetUploadSymbolIndex();
    const idx = getUploadSymbolIndex();
    idx.register(enumSrc, 'file:///Status.java');
    idx.register(
      [
        'package com.example.dto;',
        'public class TaskDto {',
        '  private Status status;',
        '  private String title;',
        '}',
      ].join('\n'),
      'file:///TaskDto.java',
    );

    const parseResult: ParseResult = {
      classes: [],
      apis: [
        {
          method: 'POST',
          path: '/tasks',
          fullPath: '/tasks',
          summary: 'Create task',
          parameters: [{ name: 'body', in: 'body', type: 'TaskDto' }],
        },
      ],
    };

    expect(() => OpenApiBuilder.build(parseResult, 'Enum Doc')).not.toThrow();
    const doc = OpenApiBuilder.build(parseResult, 'Enum Doc');
    expect(doc.components?.schemas).toBeDefined();
  });
});
