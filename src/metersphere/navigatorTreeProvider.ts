import * as vscode from 'vscode'
import { NavigatorNode, NodeType } from './models/navigatorNode'
import { HttpResponse } from './httpClient'
import { NavigatorEngine } from './navigatorEngine'
import { ConnectionManager, ConnectionState } from './connectionManager'
import { DebugLogger } from './debugLogger'

export class NavigatorTreeDataProvider implements vscode.TreeDataProvider<NavigatorNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NavigatorNode | undefined>()
  readonly onDidChangeTreeData: vscode.Event<NavigatorNode | undefined> = this._onDidChangeTreeData.event

  private roots: NavigatorNode[] = []

  private fetchFn: ((method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>) | null = null

  private connectionManager?: ConnectionManager

  constructor(connectionManager?: ConnectionManager) {
    this.connectionManager = connectionManager
  }

  setFetchFn(fn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>): void {
    this.fetchFn = fn
  }

  setRoots(roots: NavigatorNode[]): void {
    this.roots = roots
    this._onDidChangeTreeData.fire(undefined)
  }

  async getChildren(element?: NavigatorNode): Promise<NavigatorNode[]> {
    DebugLogger.log('TreeProvider', 'getChildren called', { elementType: element?.type, elementId: element?.id, elementName: element?.name })
    
    if (!element) {
      DebugLogger.log('TreeProvider', 'Returning roots', { count: this.roots.length })
      return this.roots
    }
    if (element.type === NodeType.WORKSPACE && this.fetchFn) {
      DebugLogger.log('TreeProvider', 'Expanding workspace', { workspaceId: element.id })
      try {
        const projects = await NavigatorEngine.discoverProjects(element.id, this.fetchFn)
        DebugLogger.log('TreeProvider', 'Workspace expanded', { projectCount: projects.length })
        return projects
      } catch (error) {
        DebugLogger.error('TreeProvider', 'Failed to expand workspace', error)
        this.connectionManager?.update(ConnectionState.Disconnected)
        return []
      }
    }
    if (element.type === NodeType.PROJECT && this.fetchFn) {
      DebugLogger.log('TreeProvider', 'Expanding project', { projectId: element.id, projectName: element.name })
      try {
        const modules = await NavigatorEngine.discoverModules(element.id, this.fetchFn)
        DebugLogger.log('TreeProvider', 'Project expanded', { moduleCount: modules.length })
        return modules
      } catch (error) {
        DebugLogger.error('TreeProvider', 'Failed to expand project', error)
        this.connectionManager?.update(ConnectionState.Disconnected)
        return []
      }
    }
    if (element.type === NodeType.MODULE) {
      return []  // TODO: fetch API list
    }
    return element.getChildren()
  }

  getTreeItem(element: NavigatorNode): vscode.TreeItem {
    return {
      id: element.id,
      label: element.name,
      collapsibleState: element.collapsibleState as vscode.TreeItemCollapsibleState,
      tooltip: element.tooltip,
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }
}
