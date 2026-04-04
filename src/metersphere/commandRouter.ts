import * as vscode from 'vscode'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { NavigatorNode } from './models/navigatorNode'
import { SettingsManager } from './settingsManager'
import { ConnectionManager, ConnectionState } from './connectionManager'

export class CommandRouter {
  static registerAll(
    context: vscode.ExtensionContext,
    deps: {
      navigatorProvider: NavigatorTreeDataProvider
      httpRequest: unknown
      getActiveWebviewPanel: () => vscode.WebviewPanel | undefined
      connectionManager: ConnectionManager
    }
  ): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.refreshNavigator', async () => {
        deps.connectionManager.update(ConnectionState.Connecting)
        NavigatorEngine.clearCache()
        try {
          const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
          deps.navigatorProvider.setRoots(roots)
          deps.connectionManager.update(ConnectionState.Connected, SettingsManager.getMsUrl())
        } catch (error) {
          deps.connectionManager.update(ConnectionState.Disconnected, String(error))
        }
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.openNavigator', () => {
        vscode.commands.executeCommand('metersphere.navigator.view.focus')
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.prefillFromNode', (node: NavigatorNode) => {
        const panel = deps.getActiveWebviewPanel()
        if (panel) {
          panel.webview.postMessage({
            command: 'prefill',
            name: node.name,
            method: 'GET',
            url: node.tooltip ?? '',
          })
        }
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.configure', async () => {
        const url = await vscode.window.showInputBox({
          title: 'MeterSphere Server URL',
          placeholder: 'http://localhost:8080',
          prompt: 'Enter your MeterSphere server URL',
        })

        if (url === undefined || url.trim() === '') {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        const accessKey = await vscode.window.showInputBox({
          title: 'MeterSphere Access Key',
          prompt: 'Enter your MeterSphere Access Key',
        })

        if (accessKey === undefined) {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        const secretKey = await vscode.window.showInputBox({
          title: 'MeterSphere Secret Key',
          prompt: 'Enter your MeterSphere Secret Key',
        })

        if (secretKey === undefined) {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        deps.connectionManager.update(ConnectionState.Connecting)

        const result = await deps.connectionManager.testConnection(
          url.trim(),
          accessKey.trim(),
          secretKey.trim()
        )

        if (!result.success) {
          deps.connectionManager.update(ConnectionState.Disconnected)
          try {
            vscode.window.showErrorMessage(
              'Connection failed: ' + (result.error ?? 'Unknown error')
            )
          } catch {
            // notification can throw if VSCode is shutting down
          }
          return
        }

        SettingsManager.setMsUrl(url.trim())
        SettingsManager.setAccessKey(accessKey.trim())
        SettingsManager.setSecretKey(secretKey.trim())

        deps.connectionManager.update(ConnectionState.Connected, result.url)
        NavigatorEngine.clearCache()
        const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
        deps.navigatorProvider.setRoots(roots)
        vscode.window.showInformationMessage('MeterSphere configured successfully!')
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.testConnection', async () => {
        deps.connectionManager.update(ConnectionState.Connecting)
        const result = await deps.connectionManager.testConnection()
        if (result.success) {
          const url = result.url ?? ''
          let hostname = url
          try { hostname = new URL(url).hostname } catch { /* use as-is */ }
          vscode.window.showInformationMessage('Connected to ' + hostname)
        } else {
          vscode.window.showErrorMessage('Connection failed: ' + (result.error ?? 'Unknown error'))
        }
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.statusBarMenu', async () => {
        const choice = await vscode.window.showQuickPick(
          [
            'Test Connection',
            'Configure...',
            'Refresh Navigator',
            'Open Navigator',
          ],
          { placeHolder: 'MeterSphere', title: 'MeterSphere' }
        )

        if (!choice) return

        switch (choice) {
          case 'Test Connection':
            vscode.commands.executeCommand('metersphere.testConnection')
            break
          case 'Configure...':
            vscode.commands.executeCommand('metersphere.configure')
            break
          case 'Refresh Navigator':
            vscode.commands.executeCommand('metersphere.refreshNavigator')
            break
          case 'Open Navigator':
            vscode.commands.executeCommand('metersphere.openNavigator')
            break
        }
      })
    )
  }

  static prefillFromNode(node: NavigatorNode, webview: vscode.Webview): Promise<boolean> {
    return webview.postMessage({
      command: 'prefill',
      name: node.name,
      method: 'GET',
      url: node.tooltip ?? '',
    })
  }
}
