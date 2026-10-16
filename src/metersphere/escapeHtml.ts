/**
 * HTML escaping helpers shared by server-side HTML generation and the
 * browser-side webview scripts.
 *
 * `escapeHtml` is the TypeScript implementation used when building webview
 * HTML strings on the extension host. `escapeHtmlJs` is a dependency-free
 * function-declaration string injected verbatim into every webview `<script>`
 * so browser-side sinks (innerHTML driven by postMessage data) can escape
 * untrusted values with identical semantics.
 */

/**
 * Escape `&`, `<`, `>`, `"` and `'` for safe interpolation into HTML text and
 * quoted attribute contexts. `&` is replaced first so already-escaped input is
 * not double-decoded. Non-string values are coerced; `null`/`undefined` become
 * the empty string.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Browser-side twin of {@link escapeHtml}, as a function-declaration source
 * string. Injected into webview `<script>` blocks. Kept free of backticks and
 * `${` so it can be embedded inside a template literal without escaping.
 */
export const escapeHtmlJs = `function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}`
