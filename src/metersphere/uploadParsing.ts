/**
 * Upload parsing seam: runs the CST-first dispatcher per file and accumulates the
 * {classes, apis} union. Pure and exported so the ~1400-line webview controller's
 * `handleUpload` loop is replaced by one injected call — the injected `readText`
 * IS the seam (no webview or dispatcher spy needed for tests).
 */

import { ParseResult } from './javaParser';
import { parseJava } from './javaParserDispatch';

export interface UploadedParse {
  result: ParseResult;
  fileCount: number;
  /** The resolved file list, surfaced so every file reaches the Javadoc step. */
  files: string[];
}

/** Parse every file through the dispatcher and accumulate the union. */
export async function parseUploadedFiles(
  filePaths: string[],
  readText: (p: string) => Promise<string>,
): Promise<UploadedParse> {
  const result: ParseResult = { classes: [], apis: [] };
  for (const filePath of filePaths) {
    const code = await readText(filePath);
    const parsed = parseJava(code, filePath);
    result.classes.push(...parsed.result.classes);
    result.apis.push(...parsed.result.apis);
  }
  return { result, fileCount: filePaths.length, files: [...filePaths] };
}
