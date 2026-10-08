/**
 * Tests for the project symbol index (cross-file DTO resolution).
 *
 * Resolution order: (1) same-file registration, (2) the time-boxed
 * vscode.executeWorkspaceSymbolProvider LSP call, (3) a bounded on-disk scan of the
 * getCommonProjectPaths roots. Results cache in a Map. A genuinely-missing type
 * returns undefined without hanging.
 */

import { ProjectSymbolIndex } from '../src/metersphere/javaAst/projectSymbolIndex';

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
