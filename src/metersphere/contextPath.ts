/**
 * Context-path helper shared by BOTH upload branches (Postman url.path segments and
 * OpenAPI paths keys) — one implementation, unit-testable without a webview.
 *
 * Empty/undefined contextPath leaves every path untouched; an already-prefixed path
 * is never double-prefixed; servers[].url is never touched (only path keys/segments).
 */

/** Prefix `contextPath` onto a single path (leading-slash or joined-segment shape). */
export function prependContextPath(path: string, contextPath?: string): string {
  if (!contextPath) {
    return path;
  }
  const cp = contextPath.replace(/^\//, '');
  if (!cp) {
    return path;
  }
  if (path === '/' + cp || path.startsWith('/' + cp + '/')) {
    return path;
  }
  return '/' + cp + (path.startsWith('/') ? path : '/' + path);
}

/** Prefix `contextPath` onto every key of an OpenAPI `paths` map (input not mutated). */
export function applyContextPathToPaths(
  paths: Record<string, unknown>,
  contextPath?: string,
): Record<string, unknown> {
  if (!contextPath) {
    return paths;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(paths)) {
    out[prependContextPath(key, contextPath)] = paths[key];
  }
  return out;
}
