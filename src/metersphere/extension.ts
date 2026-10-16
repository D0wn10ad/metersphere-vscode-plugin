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
  private messageHandler: vscode.Disposable | undefined

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = SidebarView.getControlPanelHtml()
    this.messageHandler?.dispose()
    this.messageHandler = webviewView.webview.onDidReceiveMessage(msg => SidebarView.handleMessage(msg, 'controlPanel'))
    SidebarView.registerView('controlPanel', webviewView)
    webviewView.onDidDispose(() => {
      SidebarView.unregisterView('controlPanel')
      this.messageHandler = undefined
    })
  }
}

/**
 * Persist the Navigator selection while keeping the invariant that a non-empty
 * projectId always belongs to the current workspaceId:
 * - workspace selected → projectId must be cleared (it belonged to the old workspace);
 * - project selected → workspaceId is synced to the project's parent workspace
 *   (project nodes carry their workspace in `parentId`), so switching directly
 *   to a project under another workspace can never pair the new projectId with
 *   the old workspaceId; without a resolvable workspace the projectId is dropped.
 */
export function applyNavigatorSelection(node: NavigatorNode): void {
  if (node.type === NodeType.WORKSPACE) {
    SettingsManager.setWorkspaceId(node.id)
    SettingsManager.setProjectId('')
    DebugLogger.log('Navigator', `Workspace selected: ${node.id}`, {})
  } else if (node.type === NodeType.PROJECT) {
    if (node.parentId) {
      SettingsManager.setWorkspaceId(node.parentId)
      SettingsManager.setProjectId(node.id)
    } else if (SettingsManager.getWorkspaceId()) {
      SettingsManager.setProjectId(node.id)
    } else {
      SettingsManager.setProjectId('')
    }
    DebugLogger.log('Navigator', `Project selected: ${node.id}`, {})
  }
}

export function activate(context: vscode.ExtensionContext): void {
  ContextHolder.setContext(context)
  NavigatorEngine.setStateStorage(context.workspaceState)

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
        applyNavigatorSelection(node)
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