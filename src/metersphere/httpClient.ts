// Lightweight HTTP client with configurable fetch implementation
// Prefer global fetch, with a runtime fallback to node-fetch if available at runtime.
import { TokenManager } from './tokenManager';

export interface HttpResponse {
  status: number
  headers: any
  body: any
  durationMs: number
}

function getFetch(): any {
  const globalFetch = (globalThis as any).fetch
  if (typeof globalFetch === 'function') return globalFetch
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nf = require('node-fetch')
    // node-fetch v3 is ESM; handle default export if present
    return nf?.default ?? nf
  } catch {
    return null
  }
}

export async function httpRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: any,
  tokenOverride?: string
): Promise<HttpResponse> {
  const start = Date.now()
  // Apply token if present; allow override for tests
  if (tokenOverride) {
    headers['Authorization'] = `Bearer ${tokenOverride}`
  } else {
    TokenManager.applyAuth(headers)
  }
  const fetchFn = getFetch()
  if (!fetchFn) {
    throw new Error('Fetch API is not available in this environment')
  }
  const res = await fetchFn(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const durationMs = Date.now() - start
  let contentType = ''
  try {
    contentType = res.headers?.get?.('content-type') ?? (res.headers?.['content-type'] ?? '')
  } catch {
    contentType = ''
  }
  let parsed: any
  if (contentType && contentType.includes('application/json')) {
    parsed = await res.json()
  } else {
    parsed = await res.text()
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: parsed,
    durationMs
  }
}
