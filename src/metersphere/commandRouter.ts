import * as vscode from 'vscode'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { NavigatorNode } from './models/navigatorNode'

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
