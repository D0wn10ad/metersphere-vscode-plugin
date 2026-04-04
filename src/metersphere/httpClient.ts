import { SettingsManager } from './settingsManager'

const REQUEST_TIMEOUT_MS = 10_000

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
    const nf = require('node-fetch')
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
  _tokenOverride?: string
): Promise<HttpResponse> {
  const start = Date.now()
  const accessKey = SettingsManager.getAccessKey()
  const secretKey = SettingsManager.getSecretKey()
  if (accessKey && secretKey) {
    headers['accessKey'] = accessKey
    headers['signature'] = SettingsManager.generateSignature()
  }
  const fetchFn = getFetch()
  if (!fetchFn) {
    throw new Error('Fetch API is not available in this environment')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetchFn(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
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
      durationMs,
    }
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)
    }
    throw error
  }
}
