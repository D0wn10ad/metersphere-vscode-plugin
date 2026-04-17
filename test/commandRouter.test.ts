import { CommandRouter } from '../src/metersphere/commandRouter'
import { ConnectionManager } from '../src/metersphere/connectionManager'

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
    expect(disposables.length).toBe(15)
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
})
