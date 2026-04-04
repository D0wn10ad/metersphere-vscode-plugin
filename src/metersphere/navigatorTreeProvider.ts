import * as vscode from 'vscode'
import { NavigatorNode } from './models/navigatorNode'

export class NavigatorTreeDataProvider implements vscode.TreeDataProvider<NavigatorNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NavigatorNode | undefined>()
  readonly onDidChangeTreeData: vscode.Event<NavigatorNode | undefined> = this._onDidChangeTreeData.event

  private roots: NavigatorNode[] = []

  setRoots(roots: NavigatorNode[]): void {
    this.roots = roots
    this._onDidChangeTreeData.fire(undefined)
  }

  getChildren(element?: NavigatorNode): NavigatorNode[] {
    if (!element) {
      return this.roots
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
