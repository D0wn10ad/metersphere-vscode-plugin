import * as vscode from 'vscode'
import { WebViewController } from './webviewController'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { CommandRouter } from './commandRouter'
import { httpRequest } from './httpClient'
import { SettingsManager } from './settingsManager'

export function activate(context: vscode.ExtensionContext): void {
  const wvc = new WebViewController(context)
  context.subscriptions.push(
    vscode.commands.registerCommand('metersphere.openDebugger', () => wvc.open())
  )

  const navigatorProvider = new NavigatorTreeDataProvider()
  const treeView = vscode.window.createTreeView('metersphere.navigator.view', {
    treeDataProvider: navigatorProvider,
  })

  const getActivePanel = (): vscode.WebviewPanel | undefined => {
    return (globalThis as Record<string, unknown>).__activeMsPanel as vscode.WebviewPanel | undefined
  }

  CommandRouter.registerAll(context, {
    navigatorProvider,
    httpRequest,
    getActiveWebviewPanel: getActivePanel,
  })

  context.subscriptions.push(treeView)

  if (SettingsManager.isConfigured()) {
    NavigatorEngine.clearCache()
    NavigatorEngine.discoverWorkspaces(httpRequest).then(roots => {
      navigatorProvider.setRoots(roots)
    })
  }
}

export function deactivate() {}
