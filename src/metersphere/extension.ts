import * as vscode from 'vscode'
import { WebViewController } from './webviewController'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { CommandRouter } from './commandRouter'
import { httpRequest } from './httpClient'
import { SettingsManager } from './settingsManager'
import { NavigatorNode, NodeType } from './models/navigatorNode'
import { ConnectionManager, ConnectionState } from './connectionManager'
import { ContextHolder } from './contextHolder'
import { DebugLogger } from './debugLogger'
import { SidebarView } from './views/sidebarView'

class ControlPanelViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = SidebarView.getControlPanelHtml()
    webviewView.webview.onDidReceiveMessage(msg => SidebarView.handleMessage(msg, 'controlPanel'))
    SidebarView.registerView('controlPanel', webviewView)
    webviewView.onDidDispose(() => SidebarView.unregisterView('controlPanel'))
  }
}

export function activate(context: vscode.ExtensionContext): void {
  ContextHolder.setContext(context)

  context.subscriptions.push(vscode.window.registerWebviewViewProvider('metersphere.controlPanel', new ControlPanelViewProvider()))

  const wvc = new WebViewController(context)
  context.subscriptions.push(
    vscode.commands.registerCommand('metersphere.openDebugger', () => wvc.open())
  )

  const connectionManager = new ConnectionManager(context)

  const navigatorProvider = new NavigatorTreeDataProvider(connectionManager)
  navigatorProvider.setFetchFn(httpRequest)

  const treeView = vscode.window.createTreeView('metersphere.navigator', {
    treeDataProvider: navigatorProvider,
  })

  if ('onDidChangeSelection' in treeView && typeof (treeView as any).onDidChangeSelection === 'function') {
    (treeView as any).onDidChangeSelection((e: { selection: NavigatorNode[] }) => {
      const node = e.selection[0]
      if (node) {
        if (node.type === NodeType.WORKSPACE) {
          SettingsManager.setWorkspaceId(node.id)
          SettingsManager.setProjectId('')
          DebugLogger.log('Navigator', `Workspace selected: ${node.id}`, {})
        } else if (node.type === NodeType.PROJECT) {
          SettingsManager.setProjectId(node.id)
          DebugLogger.log('Navigator', `Project selected: ${node.id}`, {})
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