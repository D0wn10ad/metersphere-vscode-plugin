import * as vscode from 'vscode'

export class SettingsManager {
  // Global keys (user settings)
  static TOKEN_KEY = 'metersphere.apiToken'
  static WORKSPACE_KEY = 'metersphere.workspaceId'
  static PROJECT_KEY = 'metersphere.projectId'
  static SYNC_KEY = 'metersphere.syncEnabled'
  static MS_URL_KEY = 'metersphere.msUrl'

  static getMsUrl(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.MS_URL_KEY)
  }

  static setMsUrl(url: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.MS_URL_KEY, url, vscode.ConfigurationTarget.Global)
  }

  static getToken(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(SettingsManager.TOKEN_KEY)
  }

  static setToken(token: string): void {
    vscode.workspace.getConfiguration().update(SettingsManager.TOKEN_KEY, token, vscode.ConfigurationTarget.Global)
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
}
