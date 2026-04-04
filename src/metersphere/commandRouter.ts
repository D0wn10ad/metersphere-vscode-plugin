import * as vscode from 'vscode'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { NavigatorNode } from './models/navigatorNode'
import { SettingsManager } from './settingsManager'

export class CommandRouter {
  static registerAll(
    context: vscode.ExtensionContext,
    deps: {
      navigatorProvider: NavigatorTreeDataProvider
      httpRequest: unknown
      getActiveWebviewPanel: () => vscode.WebviewPanel | undefined
    }
  ): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.refreshNavigator', async () => {
        NavigatorEngine.clearCache()
        const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
        deps.navigatorProvider.setRoots(roots)
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
        // Step 1: Prompt for MeterSphere URL
        const url = await vscode.window.showInputBox({
          title: 'MeterSphere Server URL',
          placeholder: 'http://localhost:8080',
          prompt: 'Enter your MeterSphere server URL',
        })

        // Step 2: Check if cancelled or empty
        if (url === undefined || url.trim() === '') {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        // Step 3: Prompt for Access Key
        const accessKey = await vscode.window.showInputBox({
          title: 'MeterSphere Access Key',
          password: true,
          prompt: 'Enter your MeterSphere Access Key',
        })

        // Step 4: Check if cancelled
        if (accessKey === undefined) {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        // Step 5: Prompt for Secret Key
        const secretKey = await vscode.window.showInputBox({
          title: 'MeterSphere Secret Key',
          password: true,
          prompt: 'Enter your MeterSphere Secret Key',
        })

        // Step 6: Check if cancelled
        if (secretKey === undefined) {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        // Step 7: Save all values
        SettingsManager.setMsUrl(url.trim())
        SettingsManager.setAccessKey(accessKey.trim())
        SettingsManager.setSecretKey(secretKey.trim())

        // Step 8: Show success message
        vscode.window.showInformationMessage('MeterSphere configured successfully!')

        // Step 9: Refresh navigator tree
        NavigatorEngine.clearCache()
        const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
        deps.navigatorProvider.setRoots(roots)
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
