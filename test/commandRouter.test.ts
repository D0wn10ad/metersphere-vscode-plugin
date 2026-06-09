import { CommandRouter } from '../src/metersphere/commandRouter'
import { ConnectionManager } from '../src/metersphere/connectionManager'
import { SidebarView } from '../src/metersphere/views/sidebarView'

jest.mock('../src/metersphere/views/sidebarView', () => ({
  SidebarView: {
    showEnvironment: jest.fn(),
    showHistory: jest.fn(),
    showSettings: jest.fn(),
    showSync: jest.fn(),
    loadProjectModules: jest.fn(),
  },
}))

describe('CommandRouter', () => {
  test('registers all Phase 2 commands', () => {
    const disposables: unknown[] = []
    const mockContext = {
      subscriptions: { push: (d: unknown) => disposables.push(d) }
    }
    const mockProvider = { setRoots: () => {} }
    const mockConnectionManager = {
      update: () => {},
      testConnection: () => Promise.resolve({ success: true, url: 'http://localhost:8080' }),
    } as unknown as ConnectionManager
    CommandRouter.registerAll(mockContext as any, {
      navigatorProvider: mockProvider as any,
      httpRequest: () => Promise.resolve({ status: 200, body: { data: [] } }),
      getActiveWebviewPanel: () => undefined,
      connectionManager: mockConnectionManager,
    } as any)
    expect(disposables.length).toBe(16)
  })

  test('prefillFromNode dispatches to webview', () => {
    const webviewPost: unknown[] = []
    const webview = {
      postMessage: (msg: unknown) => { webviewPost.push(msg); return Promise.resolve(true) }
    }
    CommandRouter.prefillFromNode(
      { id: 'api-1', name: 'Test', tooltip: '/api/test' } as any,
      webview as any
    )
    expect(webviewPost.length).toBe(1)
    expect((webviewPost[0] as any).command).toBe('prefill')
    expect((webviewPost[0] as any).name).toBe('Test')
  })

  test('testConnection command auto-loads project data on success', async () => {
    const commands = new Map<string, (...args: unknown[]) => unknown>()
    const disposables: unknown[] = []
    const mockContext = {
      subscriptions: { push: (d: unknown) => disposables.push(d) },
    }
    const mockProvider = { setRoots: () => {} }
    const mockConnectionManager = {
      update: () => {},
      testConnection: () => Promise.resolve({ success: true, url: 'http://localhost:8080' }),
    } as unknown as ConnectionManager

    const vscode = require('vscode')
    const registerSpy = jest.spyOn(vscode.commands, 'registerCommand').mockImplementation((...args: unknown[]) => {
      const [name, cb] = args as [string, (...commandArgs: unknown[]) => unknown]
      commands.set(name, cb)
      return { dispose: jest.fn() }
    })
    jest.spyOn(vscode.window, 'showInformationMessage').mockImplementation(() => Promise.resolve(undefined))

    CommandRouter.registerAll(mockContext as any, {
      navigatorProvider: mockProvider as any,
      httpRequest: () => Promise.resolve({ status: 200, body: { data: [] } }),
      getActiveWebviewPanel: () => undefined,
      connectionManager: mockConnectionManager,
    } as any)

    await commands.get('metersphere.testConnection')?.()

    expect(SidebarView.loadProjectModules).toHaveBeenCalled()
    registerSpy.mockRestore()
  })
})
