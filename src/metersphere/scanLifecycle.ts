/**
 * Scan lifecycle guard for the Sync panel.
 *
 * Guarantees that every scan entry point posts **exactly one** terminal
 * `scanComplete` message per invocation - on success, on a thrown error,
 * and on a hard timeout - so the webview can never remain in the
 * "Scanning..." state indefinitely.
 */

import { DebugLogger } from './debugLogger'

/** Default hard bound for a scan before it is declared timed out. */
export const DEFAULT_SCAN_HARD_TIMEOUT_MS = 60_000

/** Options for {@link runScanWithTerminalMessage}. */
export interface ScanLifecycleOptions {
  /** The scan to run; resolves with the discovered file paths. */
  scan: () => Promise<string[]>
  /** Terminal-message sink (typically `SidebarView.postMessage`). */
  post: (msg: Record<string, unknown>) => void
  /** Identifier of the scan entry point, used for error context. */
  label: string
  /** Hard bound in ms before the scan is declared timed out (default 60s). */
  hardTimeoutMs?: number
  /** Optional observer invoked with the original error on failure/timeout. */
  onError?: (e: unknown) => void
}

/**
 * Coerce a caller-supplied hard timeout to a usable value.
 *
 * `setTimeout` misbehaves for `NaN`, `0`, negative, and `Infinity` delays
 * (they fire immediately or warn), so anything that is not a positive
 * finite number falls back to {@link DEFAULT_SCAN_HARD_TIMEOUT_MS}.
 */
function resolveHardTimeoutMs(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SCAN_HARD_TIMEOUT_MS
}

/**
 * Run `scan` and post exactly one terminal `scanComplete` message.
 *
 * - Success: `post({ command: 'scanComplete', data: { files } })`.
 * - Thrown error: `post({ command: 'scanComplete', data: { files: [], error } })`
 *   followed by `onError(e)` with the original error.
 * - Hard timeout (`scan` not settled within `hardTimeoutMs`):
 *   `post({ command: 'scanComplete', data: { files: [], error: 'scan timed out' } })`.
 *
 * A late settlement after the timeout is ignored - the `settled` flag
 * makes a double post impossible. The message envelope field names
 * (`command` + `data`) are fixed and must not change.
 *
 * Robustness guarantees:
 * - A SYNCHRONOUS throw from `scan()` is converted to a rejection (the scan is
 *   invoked via `Promise.resolve().then(() => scan())`), so the outer promise
 *   always settles instead of leaving the webview "Scanning..." forever.
 * - `post` (webview panel may be disposed) and `onError` throwing never
 *   prevent `resolve()` - each side effect is individually guarded.
 * - An invalid `hardTimeoutMs` (NaN/0/negative/Infinity) falls back to
 *   {@link DEFAULT_SCAN_HARD_TIMEOUT_MS}.
 *
 * @returns The resolved files array, or `[]` on failure/timeout.
 */
export async function runScanWithTerminalMessage(opts: ScanLifecycleOptions): Promise<string[]> {
  const { scan, post, label, onError } = opts
  const hardTimeoutMs = resolveHardTimeoutMs(opts.hardTimeoutMs)

  DebugLogger.log('Sync', 'Scan started', { label })

  let settled = false
  return new Promise<string[]>(resolve => {
    /** Run a settle side effect; a throw must never strand the caller. */
    const guard = (what: string, fn: () => void): void => {
      try {
        fn()
      } catch (e) {
        try {
          DebugLogger.error('Sync', `Terminal-scan ${what} threw; continuing`, {
            label,
            error: String(e),
          })
        } catch {
          // Logging itself is unavailable - swallow so resolve() is still reached.
        }
      }
    }

    const settle = (files: string[], error?: string, originalError?: unknown): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error !== undefined) {
        guard('log', () => DebugLogger.error('Sync', 'Scan failed', { label, error }))
        guard('post', () => post({ command: 'scanComplete', data: { files: [], error } }))
        if (onError) guard('onError', () => onError(originalError ?? new Error(error)))
        resolve([])
      } else {
        guard('log', () => DebugLogger.log('Sync', 'Scan finished', { label, fileCount: files.length }))
        guard('post', () => post({ command: 'scanComplete', data: { files } }))
        resolve(files)
      }
    }

    const timer = setTimeout(() => {
      settle([], 'scan timed out', new Error(`scan (${label}) timed out`))
    }, hardTimeoutMs)

    // `Promise.resolve().then(() => scan())` turns a SYNCHRONOUS throw from
    // scan() into a rejection routed through `settle` below. Calling
    // `scan().then(...)` directly would throw inside this executor and leave
    // the outer promise permanently pending.
    Promise.resolve()
      .then(() => scan())
      .then(
        files => settle(files),
        (e: unknown) => settle([], e instanceof Error ? e.message : String(e), e)
      )
  })
}
