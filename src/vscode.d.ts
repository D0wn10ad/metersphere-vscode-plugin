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

  export namespace window {
    function createWebviewPanel(
      id: string,
      title: string,
      viewColumn: ViewColumn,
      options?: { enableScripts?: boolean }
    ): WebviewPanel
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

  export namespace commands {
    function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable
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

  export const workspace: typeof workspace
  export const window: typeof window
  export const commands: typeof commands
}
