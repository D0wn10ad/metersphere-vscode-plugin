/**
 * Upload parsing seam: runs the CST-first dispatcher per file and accumulates the
 * {classes, apis} union. Pure and exported so the ~1400-line webview controller's
 * `handleUpload` loop is replaced by one injected call — the injected `readText`
 * IS the seam (no webview or dispatcher spy needed for tests).
 */

import { ParseResult } from './javaParser';
import { parseJava } from './javaParserDispatch';
import { getUploadSymbolIndex } from './openApiBuilder';
import { DebugLogger } from './debugLogger';
import { TypeResolver } from './typeResolver';

export interface UploadedParse {
  result: ParseResult;
  fileCount: number;
  /** Successfully parsed files only, surfaced so every one reaches the Javadoc step. */
  files: string[];
}

/** Upper bound on distinct type names resolved per upload (bounded pre-pass). */
const PRE_PASS_TYPE_CAP = 64;

/**
 * Collect the non-primitive type names referenced by the parsed APIs (return
 * types + parameter types), generics stripped, deduped, capped.
 */
function collectPrePassTypes(result: ParseResult): string[] {
  const names = new Set<string>();
  for (const api of result.apis) {
    const candidates = [api.returnType, ...(api.parameters ?? []).map((p) => p.type)];
    for (const raw of candidates) {
      if (!raw) {
        continue;
      }
      const name = TypeResolver.extractTypeName(raw);
      if (!name || name === 'Map') {
        continue;
      }
      if (TypeResolver.primitiveSchemaWithFormat(name)) {
        continue; // primitives need no resolution
      }
      names.add(name);
      if (names.size >= PRE_PASS_TYPE_CAP) {
        return [...names];
      }
    }
  }
  return [...names];
}

/**
 * Async DTO resolution pre-pass (OpenAPI export path ONLY): resolves referenced
 * types through the symbol index (LSP → bounded scan) so the results sit in the
 * cache when the sync build() runs. The resolved cache is cleared FIRST so a DTO
 * cached during a prior upload cannot shadow this upload's freshly registered
 * source. Bounded and best-effort: never throws, one debug line on partial failure.
 */
async function resolveDependencyTypes(result: ParseResult): Promise<void> {
  const symbolIndex = getUploadSymbolIndex();
  symbolIndex.clearResolvedCache();
  const names = collectPrePassTypes(result);
  let failures = 0;
  for (const name of names) {
    try {
      const resolved = await symbolIndex.resolve(name);
      if (!resolved) {
        failures++;
      }
    } catch {
      failures++;
    }
  }
  if (failures > 0) {
    DebugLogger.log('Sync', 'DTO pre-pass finished with unresolved types; they export as generic objects', {
      unresolved: failures,
      attempted: names.length,
    });
  }
}

/** Parse every file through the dispatcher and accumulate the union. */
export async function parseUploadedFiles(
  filePaths: string[],
  readText: (p: string) => Promise<string>,
  isOpenApi = false,
): Promise<UploadedParse> {
  const result: ParseResult = { classes: [], apis: [] };
  const parsedFiles: string[] = [];
  const symbolIndex = getUploadSymbolIndex();
  // Start each upload from a clean index so a type registered (or resolved) by a
  // prior upload cannot leak into this one.
  symbolIndex.clearAll();
  for (const filePath of filePaths) {
    try {
      const code = await readText(filePath);
      try {
        // Register the source so OpenApiBuilder's DTO expansion can resolve types
        // declared in any uploaded file (same-file and cross-file alike).
        symbolIndex.register(code, filePath);
      } catch (err) {
        DebugLogger.log('Sync', 'Symbol registration failed for file; DTO expansion may be limited', {
          filePath,
          error: String(err),
        });
      }
      const parsed = parseJava(code, filePath);
      result.classes.push(...parsed.result.classes);
      result.apis.push(...parsed.result.apis);
      parsedFiles.push(filePath);
    } catch (err) {
      // One malformed/unreadable file must not abort the whole upload: log it
      // by name and continue with the remaining files. The pre-pass below runs
      // on the accumulated result, so it never sees types from the skipped file.
      DebugLogger.error('Sync', 'Skipping file after parse failure', {
        filePath,
        error: String(err),
      });
    }
  }
  if (isOpenApi) {
    await resolveDependencyTypes(result);
  }
  return { result, fileCount: parsedFiles.length, files: parsedFiles };
}
