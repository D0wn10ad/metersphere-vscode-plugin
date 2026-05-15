export enum NodeType {
  ROOT = 'root',
  WORKSPACE = 'workspace',
  PROJECT = 'project',
  MODULE = 'module',
  API = 'api',
  CASE = 'case',
  SCENARIO = 'scenario',
  FOLDER = 'folder',
}

export interface NavigatorNodeOptions {
  id: string
  name: string
  type: NodeType
  parentId?: string
  projectId?: string
  iconPath?: string
  tooltip?: string
  uri?: { fsPath: string }
  contextValue?: string
}

export class NavigatorNode {
  public readonly id: string
  public readonly name: string
  public readonly type: NodeType
  public readonly parentId?: string
  public readonly projectId?: string
  public readonly iconPath?: string
  public readonly tooltip?: string
  public readonly uri?: { fsPath: string }
  public readonly contextValue?: string
  public children: NavigatorNode[] = []
  public collapsibleState: number = 0

  constructor(options: NavigatorNodeOptions) {
    this.id = options.id
    this.name = options.name
    this.type = options.type
    this.parentId = options.parentId
    this.projectId = options.projectId
    this.iconPath = options.iconPath
    this.tooltip = options.tooltip
    this.uri = options.uri
    this.contextValue = options.contextValue ?? options.type
    if (options.type === NodeType.FOLDER || options.type === NodeType.PROJECT || options.type === NodeType.WORKSPACE) {
      this.collapsibleState = 1 // Collapsed
    }
  }

  addChild(child: NavigatorNode): void {
    this.children.push(child)
  }

  getChildren(): NavigatorNode[] {
    return this.children
  }

  isLeaf(): boolean {
    return this.children.length === 0
  }
}
