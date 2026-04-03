import { Uri } from 'vscode';
import fetch from 'node-fetch';
import { TokenManager } from './metersphere/tokenManager';

export interface HttpResponse {
  status: number
  headers: any
  body: any
  durationMs: number
}

export async function httpRequest(method: string, url: string, headers: Record<string, string> = {}, body?: any): Promise<HttpResponse> {
  const start = Date.now()
  // Apply token if present
  TokenManager.applyAuth(headers)
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const durationMs = Date.now() - start
  const contentType = res.headers.get('content-type') || ''
  let parsed: any
  if (contentType.includes('application/json')) {
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
