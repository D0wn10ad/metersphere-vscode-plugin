/**
 * Fetch helper that bounds any network wait with an abort-based timeout.
 *
 * Mirrors the timeout concern of `httpClient.ts` (which uses `Promise.race`)
 * but aborts the underlying request via `AbortController` so a stalled
 * connection cannot outlive the timer, and rethrows a typed
 * {@link FetchTimeoutError} instead of a generic error so callers can
 * distinguish "timed out" from any other network failure.
 */

/** Upper bound applied by {@link fetchWithTimeout} when no explicit timeout is given. */
export const DEFAULT_FETCH_TIMEOUT_MS = 12_000

/**
 * Error thrown when a fetch does not settle within the configured timeout.
 * Carries the URL and the applied bound so callers can log or surface both.
 */
export class FetchTimeoutError extends Error {
  constructor(
    public readonly url: string,
    public readonly timeoutMs: number
  ) {
    super(`Fetch timed out after ${timeoutMs}ms: ${url}`)
    this.name = 'FetchTimeoutError'
  }
}

/**
 * Perform a `fetch` that is guaranteed to settle within `timeoutMs`.
 *
 * On timeout the in-flight request is aborted and the returned promise
 * rejects with {@link FetchTimeoutError}. Any other rejection is passed
 * through unchanged. On success the resolved `Response` is returned as-is.
 *
 * @param url - Target URL, forwarded to the underlying fetch untouched.
 * @param init - Request init (method/headers/body); merged with the abort signal.
 * @param timeoutMs - Upper bound in milliseconds (default 12s).
 * @param fetchImpl - Fetch implementation; injectable for tests.
 * @returns The resolved `Response` unchanged.
 * @throws {FetchTimeoutError} When the response does not arrive within `timeoutMs`.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController()
  let timerFired = false
  const timer = setTimeout(() => {
    timerFired = true
    controller.abort()
  }, timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (timerFired) {
      throw new FetchTimeoutError(url, timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
