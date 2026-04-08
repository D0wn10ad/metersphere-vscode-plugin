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
  iconPath?: string
  tooltip?: string
}

export class NavigatorNode {
  public readonly id: string
  public readonly name: string
  public readonly type: NodeType
  public readonly parentId?: string
  public readonly iconPath?: string
  public readonly tooltip?: string
  public children: NavigatorNode[] = []
  public collapsibleState: number = 0

  constructor(options: NavigatorNodeOptions) {
    this.id = options.id
    this.name = options.name
    this.type = options.type
    this.parentId = options.parentId
    this.iconPath = options.iconPath
    this.tooltip = options.tooltip
    if (options.type === NodeType.FOLDER || options.type === NodeType.PROJECT || options.type === NodeType.WORKSPACE) {
      this.collapsibleState = 2 // Expanded
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
