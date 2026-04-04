import * as vscode from 'vscode'
import { NavigatorNode, NodeType } from './models/navigatorNode'
import { HttpResponse } from './httpClient'
import { NavigatorEngine } from './navigatorEngine'

export class NavigatorTreeDataProvider implements vscode.TreeDataProvider<NavigatorNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NavigatorNode | undefined>()
  readonly onDidChangeTreeData: vscode.Event<NavigatorNode | undefined> = this._onDidChangeTreeData.event

  private roots: NavigatorNode[] = []

  private fetchFn: ((method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>) | null = null

  setFetchFn(fn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>): void {
    this.fetchFn = fn
  }

  setRoots(roots: NavigatorNode[]): void {
    this.roots = roots
    this._onDidChangeTreeData.fire(undefined)
  }

  getChildren(element?: NavigatorNode): NavigatorNode[] | Promise<NavigatorNode[]> | null {
    if (!element) {
      return this.roots
    }
    if (element.type === NodeType.WORKSPACE && this.fetchFn) {
      return NavigatorEngine.discoverProjects(element.id, this.fetchFn)
    }
    if (element.type === NodeType.PROJECT && this.fetchFn) {
      return NavigatorEngine.discoverModules(element.id, this.fetchFn)
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
