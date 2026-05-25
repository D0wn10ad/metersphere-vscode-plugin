import * as vscode from 'vscode'
import * as crypto from 'crypto'

export class SettingsManager {
  // Global keys (user settings)
  static ACCESS_KEY_KEY = 'metersphere.accessKey'
  static SECRET_KEY_KEY = 'metersphere.secretKey'
  static WORKSPACE_KEY = 'metersphere.workspaceId'
  static PROJECT_KEY = 'metersphere.projectId'
  static SYNC_KEY = 'metersphere.syncEnabled'
  static DEBUG_KEY = 'metersphere.debugEnabled'
  static MS_URL_KEY = 'metersphere.msUrl'
  static EXPORT_FORMAT_KEY = 'metersphere.exportFormat'
  static SERVER_VERSION_KEY = 'metersphere.serverVersion'
  static REJECT_UNAUTHORIZED_KEY = 'metersphere.rejectUnauthorized'

  static getMsUrl(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.MS_URL_KEY)
  }

  static setMsUrl(url: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.MS_URL_KEY, url, vscode.ConfigurationTarget.Global)
  }

  static getAccessKey(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.ACCESS_KEY_KEY)
  }

  static setAccessKey(key: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.ACCESS_KEY_KEY, key, vscode.ConfigurationTarget.Global)
  }

  static getSecretKey(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.SECRET_KEY_KEY)
  }

  static setSecretKey(key: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.SECRET_KEY_KEY, key, vscode.ConfigurationTarget.Global)
  }

  static getWorkspaceId(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.WORKSPACE_KEY)
  }

  static setWorkspaceId(id: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.WORKSPACE_KEY, id, vscode.ConfigurationTarget.Global)
  }

  static getProjectId(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.PROJECT_KEY)
  }

  static setProjectId(id: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.PROJECT_KEY, id, vscode.ConfigurationTarget.Global)
  }

  static isSyncEnabled(): boolean {
    const v = vscode.workspace.getConfiguration().get<boolean>(SettingsManager.SYNC_KEY)
    return v ?? true
  }

  static setSyncEnabled(enabled: boolean): void {
    vscode.workspace.getConfiguration().update(SettingsManager.SYNC_KEY, enabled, vscode.ConfigurationTarget.Global)
  }

  static isDebugEnabled(): boolean {
    const v = vscode.workspace.getConfiguration().get<boolean>(SettingsManager.DEBUG_KEY)
    return v ?? false
  }

  static setDebugEnabled(enabled: boolean): void {
    vscode.workspace.getConfiguration().update(SettingsManager.DEBUG_KEY, enabled, vscode.ConfigurationTarget.Global)
  }

  static getExportFormat(): string {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.EXPORT_FORMAT_KEY) ?? 'postman'
  }

  static getServerVersion(): string {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.SERVER_VERSION_KEY) ?? 'v2'
  }

  static isRejectUnauthorized(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(SettingsManager.REJECT_UNAUTHORIZED_KEY) ?? true
  }

  static isConfigured(): boolean {
    const msUrl = SettingsManager.getMsUrl()
    const accessKey = SettingsManager.getAccessKey()
    const secretKey = SettingsManager.getSecretKey()
    return msUrl !== undefined && msUrl !== '' &&
           accessKey !== undefined && accessKey !== '' &&
           secretKey !== undefined && secretKey !== ''
  }

  static generateSignature(accessKey?: string, secretKey?: string): string {
    const ak = accessKey ?? SettingsManager.getAccessKey()
    const sk = secretKey ?? SettingsManager.getSecretKey()
    if (!ak || !sk) {
      return ''
    }
    const uuid = crypto.randomUUID()
    const timestamp = Date.now()
    const plaintext = `${ak}|${uuid}|${timestamp}`
    const key = Buffer.from(sk, 'utf8')
    const iv = Buffer.from(ak, 'utf8')
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv)
    let sig = cipher.update(plaintext, 'utf8', 'base64')
    sig += cipher.final('base64')
    return sig
  }

  static buildAuthHeaders(contentType?: string): Record<string, string> {
    const ak = SettingsManager.getAccessKey()
    const sk = SettingsManager.getSecretKey()
    if (!ak || !sk) {
      return {}
    }
    const headers: Record<string, string> = {
      accessKey: ak,
      signature: SettingsManager.generateSignature(ak, sk),
    }
    if (contentType) {
      headers['Content-Type'] = contentType
    }
    return headers
  }
}