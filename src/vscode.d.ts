declare module 'vscode' {
  export const ConfigurationTarget: {
    Global: number
    Workspace: number
    WorkspaceFolder: number
  }

  export namespace workspace {
    const rootPath: string | undefined
    function getConfiguration(): Configuration &
      Readonly<{
        get<T>(key: string): T | undefined
        update(key: string, value: unknown, target?: number): Promise<void>
      }>
  }

  export interface Configuration {
    get<T>(key: string): T | undefined
    update(key: string, value: unknown, target?: number): Promise<void>
  }

  export interface InputBoxOptions {
    title?: string
    placeholder?: string
    prompt?: string
    password?: boolean
    value?: string
  }

  export namespace window {
    function createWebviewPanel(
      id: string,
      title: string,
      viewColumn: ViewColumn,
      options?: { enableScripts?: boolean }
    ): WebviewPanel
    function createTreeView<T>(viewId: string, options: { treeDataProvider: TreeDataProvider<T> }): TreeView<T>
    function showInputBox(options?: InputBoxOptions): Promise<string | undefined>
    function showInformationMessage(message: string): Promise<void>
    function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem
    function showQuickPick<T>(
      items: T[] | Thenable<T[]>,
      options?: { placeHolder?: string; title?: string }
    ): Thenable<T | undefined>
  }

  export class WebviewPanel {
    readonly viewType: string
    readonly title: string
    webview: Webview
    onDidDispose: { (listener: () => void): Disposable }
    dispose(): void
    reveal(viewColumn: ViewColumn): void
  }

  export interface WebviewMessage {
    command: string
    payload: unknown
  }

  export interface Webview {
    html: string
    onDidReceiveMessage: (callback: (message: WebviewMessage) => void) => Disposable
    postMessage(message: unknown): Promise<boolean>
  }

  export enum ViewColumn {
    One = 1,
    Two = 2,
    Three = 3
  }

  export enum StatusBarAlignment {
    Left = -1,
    Right = 1,
  }

  export namespace commands {
    // eslint-disable-next-line @typescript-eslint/ban-types
    function registerCommand(command: string, callback: Function): Disposable
    function executeCommand(command: string, ...args: unknown[]): Thenable<unknown>
  }

  export interface Disposable {
    dispose(): void
  }

  export interface StatusBarItem extends Disposable {
    text: string
    tooltip?: string
    color?: string
    command?: string
    show(): void
    hide(): void
  }

  export interface ExtensionContext {
    subscriptions: Disposable[]
    workspaceState: Memento
    globalState: Memento
    extensionPath: string
    asAbsolutePath(relativePath: string): string
    get vscodeAPI(): unknown
  }

  export interface Memento {
    get<T>(key: string, defaultValue?: T): T | undefined
    update(key: string, value: unknown): Promise<void>
  }

  export const workspace: typeof workspace
  export const window: typeof window
  export const commands: typeof commands

  export type TreeItemCollapsibleState = 0 | 1 | 2

  export interface TreeItem {
    id?: string
    label?: string
    collapsibleState?: TreeItemCollapsibleState
    tooltip?: string
    command?: unknown
    iconPath?: unknown
    contextValue?: string
    children?: TreeItem[]
  }

  export interface TreeDataProvider<T> {
    getTreeItem(element: T): TreeItem | Thenable<TreeItem>
    getChildren(element?: T): T[] | Thenable<T[]> | null | Thenable<null>
    onDidChangeTreeData?: Event<T | undefined | null>
  }

  export function createTreeView<T>(viewId: string, options: { treeDataProvider: TreeDataProvider<T> }): TreeView<T>

  export interface TreeView<T> extends Disposable {
    readonly treeDataProvider: TreeDataProvider<T>
    readonly selection: T[]
    dispose(): void
  }

  export class EventEmitter<T> {
    constructor()
    event: Event<T>
    fire(data?: T): void
    dispose(): void
  }

  export type Event<T> = (listener: (e: T) => void) => Disposable
}
