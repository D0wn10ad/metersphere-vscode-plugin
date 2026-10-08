/**
 * Tests for the upload parsing seam.
 *
 * `parseUploadedFiles` runs the CST-first dispatcher per file and accumulates the
 * {classes, apis} union. The injected `readText` IS the seam — no webview or
 * dispatcher spy needed.
 */

import { parseUploadedFiles } from '../src/metersphere/uploadParsing';

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
});
