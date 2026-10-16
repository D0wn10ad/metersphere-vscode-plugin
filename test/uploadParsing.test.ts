/**
 * Tests for the upload parsing seam.
 *
 * `parseUploadedFiles` runs the CST-first dispatcher per file and accumulates the
 * {classes, apis} union. The injected `readText` IS the seam — no webview or
 * dispatcher spy needed.
 */

import { parseUploadedFiles } from '../src/metersphere/uploadParsing';
import { OpenApiBuilder, getUploadSymbolIndex, resetUploadSymbolIndex } from '../src/metersphere/openApiBuilder';
import type * as javaParserDispatch from '../src/metersphere/javaParserDispatch';

const controllerSrc = (path: string): string =>
  [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    '@RestController',
    'public class C {',
    `  @GetMapping("${path}")`,
    '  public String h() { return "x"; }',
    '}',
  ].join('\n');

describe('uploadParsing', () => {
  it('invokes readText exactly once per file and aggregates the union of all APIs', async () => {
    const pathsByFile: Record<string, string> = {
      'a.java': '/alpha',
      'b.java': '/beta',
      'c.java': '/gamma',
    };
    const readCalls: string[] = [];
    const readText = async (p: string): Promise<string> => {
      readCalls.push(p);
      return controllerSrc(pathsByFile[p]);
    };

    const { result, fileCount, files } = await parseUploadedFiles(
      ['a.java', 'b.java', 'c.java'],
      readText,
    );

    expect(readCalls).toHaveLength(3);
    expect(fileCount).toBe(3);
    expect(files).toEqual(['a.java', 'b.java', 'c.java']);
    expect(result.apis).toHaveLength(3);
    expect(result.apis.map((a) => a.path)).toEqual(['/alpha', '/beta', '/gamma']);
  });

  it('accumulates classes from multiple files', async () => {
    const readText = async (p: string): Promise<string> => controllerSrc(`/${p}`);
    const { result } = await parseUploadedFiles(['x.java', 'y.java'], readText);
    expect(result.classes).toHaveLength(2);
    expect(result.classes.map((c) => c.name)).toEqual(['C', 'C']);
  });

  it('returns an empty aggregate for a non-controller file (the zero-API guard then fires upstream)', async () => {
    const nonController = 'package com.example.demo;\npublic class Plain { public void m() {} }';
    const { result } = await parseUploadedFiles(['plain.java'], async () => nonController);
    expect(result.apis).toEqual([]);
    expect(result.classes).toEqual([]);
  });

  it('returns an empty aggregate for zero files', async () => {
    const { result, fileCount } = await parseUploadedFiles([], async () => '');
    expect(fileCount).toBe(0);
    expect(result.classes).toEqual([]);
    expect(result.apis).toEqual([]);
  });

  it('registers parsed sources so the OpenAPI builder resolves DTO types from uploaded files', async () => {
    resetUploadSymbolIndex();
    const dtoSrc = [
      'package com.example.dto;',
      'public class EdgeDTO {',
      '  private String name;',
      '  private int count;',
      '}',
    ].join('\n');
    const controllerSrc = [
      'package com.example.demo;',
      'import org.springframework.web.bind.annotation.*;',
      '@RestController',
      'public class C {',
      '  @PostMapping("/e")',
      '  public String e(@RequestBody EdgeDTO dto) { return "x"; }',
      '}',
    ].join('\n');
    const sources: Record<string, string> = { 'c.java': controllerSrc, 'dto.java': dtoSrc };

    await parseUploadedFiles(['c.java', 'dto.java'], async (p) => sources[p]);

    // The seam registered both files; the builder's sync lookup now resolves EdgeDTO.
    const dto = getUploadSymbolIndex().resolveSync('EdgeDTO');
    expect(dto).toBeDefined();
    expect(dto!.fields.map((f) => f.name)).toEqual(['name', 'count']);
    resetUploadSymbolIndex();
  });

  it('cross-upload isolation: a type registered by upload 1 does NOT resolve during upload 2', async () => {
    resetUploadSymbolIndex();
    const fooSrc = [
      'package com.example.dto;',
      'public class Foo {',
      '  private String name;',
      '}',
    ].join('\n');

    // Upload 1 declares Foo (no API in the file — registration is per-file).
    await parseUploadedFiles(['file:///up1/Foo.java'], async () => fooSrc, true);
    expect(getUploadSymbolIndex().resolveSync('Foo')).toBeDefined();

    // Upload 2 is an unrelated controller that never declares Foo.
    await parseUploadedFiles(['file:///up2/C.java'], async () => controllerSrc('/iso'), true);
    expect(getUploadSymbolIndex().resolveSync('Foo')).toBeUndefined();
    resetUploadSymbolIndex();
  });
});

describe('uploadParsing — async DTO pre-pass (T11)', () => {
  const controllerWithExternal = [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    '@RestController',
    'public class C {',
    '  @PostMapping("/e")',
    '  public ExternalDto h(@RequestBody ExternalDto dto) { return dto; }',
    '}',
  ].join('\n');

  const setSymbolMock = (documents: Record<string, string>, calls: string[]): void => {
    (globalThis as unknown as { __vscodeMock?: unknown }).__vscodeMock = {
      extensions: [],
      documents,
      delayMs: 0,
      symbols: (query: string) => {
        calls.push(query);
        const uri = Object.keys(documents).find((u) => documents[u].includes(`class ${query}`) || documents[u].includes(`enum ${query}`));
        return uri ? [{ name: query, kind: 'Class', location: { uri } }] : [];
      },
    };
  };

  afterEach(() => {
    resetUploadSymbolIndex();
    (globalThis as unknown as { __vscodeMock?: unknown }).__vscodeMock = undefined;
  });

  it('pre-pass resolves a DTO defined in a NON-uploaded file → built doc contains its $ref', async () => {
    const calls: string[] = [];
    setSymbolMock(
      { 'file:///ext/ExternalDto.java': 'package ext;\npublic class ExternalDto { private String name; }' },
      calls,
    );
    resetUploadSymbolIndex();
    const { result } = await parseUploadedFiles(['file:///virtual/c.java'], async () => controllerWithExternal, true);
    expect(calls).toContain('ExternalDto');
    const doc = OpenApiBuilder.build(result, 'T11');
    const schema = doc.paths['/e'].post.requestBody.content['application/json'].schema;
    expect(schema.$ref).toBe('#/components/schemas/ExternalDto');
    expect(doc.components?.schemas?.ExternalDto.properties.name).toEqual({ type: 'string' });
  });

  it('provider unavailable → upload completes, payload falls back to a generic object', async () => {
    (globalThis as unknown as { __vscodeMock?: unknown }).__vscodeMock = {
      extensions: [],
      documents: {},
      delayMs: 0,
      symbols: () => [],
    };
    resetUploadSymbolIndex();
    const { result } = await parseUploadedFiles(['file:///virtual/c.java'], async () => controllerWithExternal, true);
    const doc = OpenApiBuilder.build(result, 'T11');
    const schema = doc.paths['/e'].post.requestBody.content['application/json'].schema;
    expect(schema).toEqual({ type: 'object' });
  });

  it('Postman path (isOpenApi=false) does NOT invoke the pre-pass', async () => {
    const calls: string[] = [];
    setSymbolMock(
      { 'file:///ext/ExternalDto.java': 'package ext;\npublic class ExternalDto { private String name; }' },
      calls,
    );
    resetUploadSymbolIndex();
    await parseUploadedFiles(['file:///virtual/c.java'], async () => controllerWithExternal, false);
    expect(calls).toEqual([]);
  });

  it('stale-cache guard: upload B re-registering modified source yields a FRESH schema', async () => {
    const calls: string[] = [];
    const v1 = 'package ext;\npublic class ExternalDto { private String name; }';
    const v2 = 'package ext;\npublic class ExternalDto { private String name; private int age; }';
    setSymbolMock({ 'file:///ext/ExternalDto.java': v1 }, calls);
    resetUploadSymbolIndex();
    const uploadA = await parseUploadedFiles(['file:///virtual/c.java'], async () => controllerWithExternal, true);
    let doc = OpenApiBuilder.build(uploadA.result, 'T11');
    expect(doc.components?.schemas?.ExternalDto.properties.age).toBeUndefined();

    // Upload B: the external file changed on disk
    setSymbolMock({ 'file:///ext/ExternalDto.java': v2 }, calls);
    const uploadB = await parseUploadedFiles(['file:///virtual/c.java'], async () => controllerWithExternal, true);
    doc = OpenApiBuilder.build(uploadB.result, 'T11');
    expect(doc.components?.schemas?.ExternalDto.properties.age).toEqual({ type: 'integer' });
  });
});

describe('uploadParsing — per-file error isolation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    resetUploadSymbolIndex();
  });

  it('a file that throws during read is skipped by name; the next file still yields its APIs', async () => {
    const readText = async (p: string): Promise<string> => {
      if (p === 'bad.java') {
        throw new Error('file vanished');
      }
      return controllerSrc('/good');
    };

    const { result, fileCount, files } = await parseUploadedFiles(['bad.java', 'good.java'], readText);

    expect(result.apis).toHaveLength(1);
    expect(result.apis[0].path).toBe('/good');
    expect(result.classes).toHaveLength(1);
    expect(fileCount).toBe(1);
    expect(files).toEqual(['good.java']);
  });

  it('a file whose parseJava throws does not abort the upload; the second file still yields its APIs (OpenAPI pre-pass runs on the consistent result)', async () => {
    const dispatch = require('../src/metersphere/javaParserDispatch') as typeof javaParserDispatch;
    const realParseJava = dispatch.parseJava;
    jest
      .spyOn(dispatch, 'parseJava')
      .mockImplementation((code: string, uri: string) => {
        if (uri.endsWith('bad.java')) {
          throw new Error('parse exploded');
        }
        return realParseJava(code, uri);
      });

    const { result, fileCount, files } = await parseUploadedFiles(
      ['bad.java', 'good.java'],
      async p => controllerSrc(`/${p}`),
      true,
    );

    expect(result.apis).toHaveLength(1);
    expect(result.apis[0].path).toBe('/good.java');
    expect(result.classes).toHaveLength(1);
    expect(fileCount).toBe(1);
    expect(files).toEqual(['good.java']);
  });
});
