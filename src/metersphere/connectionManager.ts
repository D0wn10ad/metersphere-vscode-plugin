import * as vscode from 'vscode'
import { httpRequest } from './httpClient'
import { SettingsManager } from './settingsManager'

export enum ConnectionState {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Unconfigured = 'unconfigured',
}

export class ConnectionManager {
  private statusBarItem: vscode.StatusBarItem
  private state: ConnectionState = ConnectionState.Unconfigured
  private lastError?: string
  private currentUrl?: string

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    )
    context.subscriptions.push(this)
    this.statusBarItem.show()
    this.update(ConnectionState.Unconfigured)
  }

  update(state: ConnectionState, message?: string): void {
    this.state = state
    switch (state) {
      case ConnectionState.Unconfigured:
        this.statusBarItem.text = '$(circle-slash) MeterSphere: Not configured'
        this.statusBarItem.command = undefined
        break
      case ConnectionState.Connecting:
        this.statusBarItem.text = '$(sync~spin) MeterSphere: Connecting...'
        this.statusBarItem.command = undefined
        break
      case ConnectionState.Connected:
        this.statusBarItem.text = '$(check) ' + this.extractHostname(message ?? '')
        this.statusBarItem.command = 'metersphere.statusBarMenu'
        break
      case ConnectionState.Disconnected:
        this.statusBarItem.text = '$(error) MeterSphere: Connection failed'
        this.statusBarItem.command = 'metersphere.statusBarMenu'
        break
    }
  }

  async testConnection(
    url?: string,
    accessKey?: string,
    secretKey?: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const msUrl = url ?? SettingsManager.getMsUrl()
    const ak = accessKey ?? SettingsManager.getAccessKey()
    const sk = secretKey ?? SettingsManager.getSecretKey()

    if (!msUrl || !ak || !sk) {
      return { success: false, error: 'Not configured' }
    }

    const signature = SettingsManager.generateSignature(ak, sk)
    const headers: Record<string, string> = {
      accessKey: ak,
      signature: signature,
    }

    const doTest = async () => {
      try {
        const resp = await httpRequest('GET', `${msUrl}/currentUser`, headers)
        if (resp.status === 200) {
          this.currentUrl = msUrl
          this.update(ConnectionState.Connected, msUrl)
          return { success: true, url: msUrl }
        } else {
          this.update(ConnectionState.Disconnected)
          return { success: false, error: `HTTP ${resp.status}` }
        }
      } catch (error) {
        this.update(ConnectionState.Disconnected)
        return { success: false, error: String(error) }
      }
    }

    const timeoutMs = 15_000
    const timeout = new Promise<{ success: boolean; url?: string; error: string }>((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs / 1000}s`)), timeoutMs)
    )

    try {
      return await Promise.race([doTest(), timeout])
    } catch (error) {
      this.update(ConnectionState.Disconnected)
      return { success: false, error: String(error) }
    }
  }

  getState(): ConnectionState {
    return this.state
  }

  dispose(): void {
    this.statusBarItem.dispose()
  }

  private extractHostname(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }
}
