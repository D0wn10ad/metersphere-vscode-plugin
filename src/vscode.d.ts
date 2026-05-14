declare module 'vscode' {
  export const ConfigurationTarget: {
    Global: number
    Workspace: number
    WorkspaceFolder: number
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

  export interface StatusBarItem extends Disposable {
    text: string
    tooltip?: string
    color?: string
    command?: string
    show(): void
    hide(): void
  }

  export enum StatusBarAlignment {
    Left = -1,
    Right = 1,
  }

  export interface QuickPickOptions {
    placeHolder?: string
    title?: string
  }

  export interface WebviewMessage {
    command: string
    payload: unknown
  }

  export interface Webview {
    html: string
    options?: { enableScripts?: boolean }
    onDidReceiveMessage: (callback: (message: WebviewMessage) => void) => Disposable
    postMessage(message: unknown): Promise<boolean>
  }

  export enum ViewColumn {
    One = 1,
    Two = 2,
    Three = 3
  }

  export interface Disposable {
    dispose(): void
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

  export type Thenable<T> = Promise<T>

  export interface WebviewPanel {
    readonly viewType: string
    readonly title: string
    webview: Webview
    onDidDispose: { (listener: () => void): Disposable }
    dispose(): void
    reveal(viewColumn: ViewColumn): void
  }

  export interface OutputChannel {
    name: string
    append(message: string): void
    appendLine(message: string): void
    show(preserveFocus?: boolean): void
    hide(): void
    dispose(): void
  }

  export interface WindowExtra {
    registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProvider
    ): Disposable
  }

export interface Window extends WindowExtra {
    createWebviewPanel(
      id: string,
      title: string,
      viewColumn: ViewColumn,
      options?: { enableScripts?: boolean }
    ): WebviewPanel
    createTreeView<T>(viewId: string, options: { treeDataProvider: TreeDataProvider<T> }): TreeView<T>
    createOutputChannel(name: string): OutputChannel
    showInputBox(options?: InputBoxOptions): Promise<string | undefined>
    showInformationMessage(message: string): Promise<void>
    showErrorMessage(message: string): Promise<void>
    createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem
    showQuickPick<T>(
      items: T[] | Thenable<T[]>,
      options?: QuickPickOptions
    ): Thenable<T | undefined>
    registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProvider
    ): Disposable
    showOpenDialog(options: {
      canSelectMany?: boolean
      filters?: Record<string, string[]>
      title?: string
    }): Promise<{ fsPath: string }[]>
    activeTextEditor: { document: { uri: { fsPath: string } } } | undefined
  }

  export interface Workspace {
    readonly rootPath: string | undefined
    getConfiguration(section?: string): Configuration
    openTextDocument(path: string): Promise<TextDocument>
  }

  export interface TextDocument {
    getText(): string
  }

  export interface Commands {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCommand(command: string, callback: (...args: any[]) => any): Disposable
    executeCommand(command: string, ...args: unknown[]): Thenable<unknown>
  }

  export const workspace: Workspace
  export const window: Window
  export const commands: Commands
  export const extensions: Extensions

  export class Position {
    constructor(line: number, character: number)
    readonly line: number
    readonly character: number
  }

  export class Uri {
    static parse(uri: string): Uri
    readonly scheme: string
    readonly authority: string
    readonly path: string
    readonly query: string
    readonly fragment: string
  }

  export class Hover {
    constructor(contents: MarkdownString | MarkdownString[])
    contents: MarkdownString | MarkdownString[]
  }

  export class MarkdownString {
    constructor(value?: string)
    value: string
  }

  export interface Extension<T = unknown> {
    id: string
    packageJSON: unknown
    extensionPath: string
  }

  export interface Extensions {
    all: Extension[]
  }

  export interface WebviewView {
    webview: Webview
    onDidDispose: { (listener: () => void): Disposable }
  }

  export interface WebviewViewProvider {
    resolveWebviewView(webviewView: WebviewView): void | Thenable<void>
  }

  export interface WindowExtra {
    registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProvider
    ): Disposable
  }
}
