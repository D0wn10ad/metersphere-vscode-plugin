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
 * @returns The resolved files array, or `[]` on failure/timeout.
 */
export async function runScanWithTerminalMessage(opts: ScanLifecycleOptions): Promise<string[]> {
  const { scan, post, label, hardTimeoutMs = DEFAULT_SCAN_HARD_TIMEOUT_MS, onError } = opts

  DebugLogger.log('Sync', 'Scan started', { label })

  let settled = false
  return new Promise<string[]>(resolve => {
    const settle = (files: string[], error?: string, originalError?: unknown): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error !== undefined) {
        DebugLogger.error('Sync', 'Scan failed', { label, error })
        post({ command: 'scanComplete', data: { files: [], error } })
        if (onError) onError(originalError ?? new Error(error))
        resolve([])
      } else {
        DebugLogger.log('Sync', 'Scan finished', { label, fileCount: files.length })
        post({ command: 'scanComplete', data: { files } })
        resolve(files)
      }
    }

    const timer = setTimeout(() => {
      settle([], 'scan timed out', new Error(`scan (${label}) timed out`))
    }, hardTimeoutMs)

    scan().then(
      files => settle(files),
      (e: unknown) => settle([], e instanceof Error ? e.message : String(e), e)
    )
  })
}
