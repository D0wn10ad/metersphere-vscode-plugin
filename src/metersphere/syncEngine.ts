import { HttpResponse } from './httpClient'

export enum SyncDirection {
  PULL = 'pull',
  PUSH = 'push',
}

interface SyncItem {
  id: string
  version: number
  body: unknown
  updatedAt?: string
}

export class SyncEngine {
  static detectConflict(local: SyncItem, remote: SyncItem): boolean {
    if (local.version !== remote.version) return true
    return JSON.stringify(local.body) !== JSON.stringify(remote.body)
  }

  static async pull(
    resourceId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const { SettingsManager } = require('./settingsManager')
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080'
    return fetchFn('GET', `${baseUrl}/api/definition/${resourceId}`, {})
  }

  static async push(
    resourceId: string,
    body: unknown,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body: unknown) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const { SettingsManager } = require('./settingsManager')
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080'
    return fetchFn('PUT', `${baseUrl}/api/definition/${resourceId}`, {}, body)
  }
}
