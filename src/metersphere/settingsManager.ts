import * as vscode from 'vscode'
import * as crypto from 'crypto'

/**
 * Derive exactly 16 bytes from a credential string for AES-128-CBC.
 *
 * MeterSphere access/secret keys are normally 16 ASCII characters, and the
 * server derives its key/IV as the raw UTF-8 bytes of the stored credentials.
 * When the input is already 16 bytes, this returns those bytes VERBATIM
 * (no hashing, padding, or truncation) so live-server authentication is
 * byte-for-byte unchanged.
 *
 * For any other length (which can never authenticate against a real server,
 * since the server uses the credential's raw 16 bytes), this produces a
 * deterministic 16-byte buffer instead of letting `crypto.createCipheriv`
 * throw an opaque "Invalid key length" / "Invalid IV length" error:
 * - longer than 16 bytes → the first 16 bytes (`subarray(0, 16)`)
 * - shorter than 16 bytes → zero-padded to 16 bytes
 */
export function toAes128Bytes(credential: string): Buffer {
  const raw = Buffer.from(credential, 'utf8')
  if (raw.length === 16) {
    return raw
  }
  if (raw.length > 16) {
    return raw.subarray(0, 16)
  }
  const padded = Buffer.alloc(16)
  raw.copy(padded, 0)
  return padded
}

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
  static CURRENT_USER_ID_KEY = 'metersphere.currentUserId'

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
    const stored = vscode.workspace.getConfiguration().get<string>(SettingsManager.EXPORT_FORMAT_KEY) ?? 'swagger3'
    // Legacy mapping: a stored 'swagger2' always produced OpenAPI 3.0.3 anyway.
    return stored === 'swagger2' ? 'swagger3' : stored
  }

  static setExportFormat(format: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.EXPORT_FORMAT_KEY, format, vscode.ConfigurationTarget.Global)
  }

  static getServerVersion(): string {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.SERVER_VERSION_KEY) ?? 'v3'
  }

  static isRejectUnauthorized(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>(SettingsManager.REJECT_UNAUTHORIZED_KEY) ?? true
  }

  static setRejectUnauthorized(value: boolean): void {
    vscode.workspace.getConfiguration().update(SettingsManager.REJECT_UNAUTHORIZED_KEY, value, vscode.ConfigurationTarget.Global)
  }

  static getCurrentUserId(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.CURRENT_USER_ID_KEY)
  }

  static setCurrentUserId(id: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.CURRENT_USER_ID_KEY, id, vscode.ConfigurationTarget.Global)
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
    const key = toAes128Bytes(sk)
    const iv = toAes128Bytes(ak)
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