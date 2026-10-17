import * as vscode from 'vscode'

// Storage keys (global settings)
const TOKEN_KEY = 'metersphere.apiToken'

export class TokenManager {
  static setToken(token: string): void {
    vscode.workspace.getConfiguration().update(TOKEN_KEY, token, vscode.ConfigurationTarget.Global)
  }

  static getToken(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(TOKEN_KEY)
  }

  static applyAuth(headers: Record<string, string>): void {
    const t = this.getToken()
    if (t && t.trim().length > 0) {
      headers['Authorization'] = `Bearer ${t}`
    }
  }

  static clearToken(): void {
    vscode.workspace.getConfiguration().update(TOKEN_KEY, undefined, vscode.ConfigurationTarget.Global)
  }
}
