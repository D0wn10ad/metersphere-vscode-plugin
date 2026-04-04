import * as vscode from 'vscode'
import { WebViewController } from './webviewController'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { CommandRouter } from './commandRouter'
import { httpRequest } from './httpClient'
import { SettingsManager } from './settingsManager'
import { NavigatorNode, NodeType } from './models/navigatorNode'
import { ConnectionManager, ConnectionState } from './connectionManager'

export function activate(context: vscode.ExtensionContext): void {
  const wvc = new WebViewController(context)
  context.subscriptions.push(
    vscode.commands.registerCommand('metersphere.openDebugger', () => wvc.open())
  )

  // Connection manager — single source of truth for connection state
  const connectionManager = new ConnectionManager(context)

  const navigatorProvider = new NavigatorTreeDataProvider(connectionManager)
  navigatorProvider.setFetchFn(httpRequest)

  const treeView = vscode.window.createTreeView('metersphere.navigator.view', {
    treeDataProvider: navigatorProvider,
  })

  // Wire auto-sync for workspace/project selection
  // Note: onDidChangeSelection may not be available in all VSCode versions/mock
  if ('onDidChangeSelection' in treeView && typeof (treeView as any).onDidChangeSelection === 'function') {
    (treeView as any).onDidChangeSelection((e: { selection: NavigatorNode[] }) => {
      const node = e.selection[0]
      if (node) {
        if (node.type === NodeType.WORKSPACE) {
          SettingsManager.setWorkspaceId(node.id)
        } else if (node.type === NodeType.PROJECT) {
          SettingsManager.setProjectId(node.id)
        }
      }
    })
  }

  const getActivePanel = (): vscode.WebviewPanel | undefined => {
    return (globalThis as Record<string, unknown>).__activeMsPanel as vscode.WebviewPanel | undefined
  }

  CommandRouter.registerAll(context, {
    navigatorProvider,
    httpRequest,
    getActiveWebviewPanel: getActivePanel,
    connectionManager,
  })

  context.subscriptions.push(treeView)

  // Test connection on activation if configured
  if (SettingsManager.isConfigured()) {
    connectionManager.update(ConnectionState.Connecting)
    NavigatorEngine.clearCache()
    NavigatorEngine.discoverWorkspaces(httpRequest).then(roots => {
      navigatorProvider.setRoots(roots)
      connectionManager.update(ConnectionState.Connected, SettingsManager.getMsUrl())
    }).catch(() => {
      connectionManager.update(ConnectionState.Disconnected)
    })
  }
}

export function deactivate() {}
