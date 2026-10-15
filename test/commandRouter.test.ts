import { CommandRouter } from '../src/metersphere/commandRouter'
import { ConnectionManager } from '../src/metersphere/connectionManager'
import { SidebarView } from '../src/metersphere/views/sidebarView'
import { JavaFileScanner } from '../src/metersphere/javaFileScanner'
import { NodeType } from '../src/metersphere/models/navigatorNode'
import { NavigatorTreeDataProvider } from '../src/metersphere/navigatorTreeProvider'
import type * as vscodeTypes from 'vscode'

jest.mock('../src/metersphere/views/sidebarView', () => ({
  SidebarView: {
    showEnvironment: jest.fn(),
    showHistory: jest.fn(),
    showSettings: jest.fn(),
    showSync: jest.fn(),
    loadProjectModules: jest.fn(),
    postMessage: jest.fn(),
  },
}))

jest.mock('../src/metersphere/javaFileScanner', () => ({
  JavaFileScanner: {
    findProjectRoot: jest.fn(),
    getCommonProjectPaths: jest.fn(),
    findJavaFilesInProject: jest.fn(),
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

describe('CommandRouter scan handlers (single terminal scanComplete)', () => {
  const vscode = require('vscode')

  class FakeUri {
    path: string
    constructor(public fsPath: string) {
      this.path = fsPath
    }
  }

  let commands: Map<string, (...args: unknown[]) => unknown>
  let origUri: unknown
  let registerSpy: jest.SpyInstance

  const register = (): void => {
    commands = new Map()
    const disposables: unknown[] = []
    const mockContext = {
      subscriptions: { push: (d: unknown) => disposables.push(d) },
    } as unknown as vscodeTypes.ExtensionContext
    CommandRouter.registerAll(mockContext, {
      navigatorProvider: { setRoots: () => {} } as unknown as NavigatorTreeDataProvider,
      httpRequest: () => Promise.resolve({ status: 200, body: { data: [] } }),
      getActiveWebviewPanel: () => undefined,
      connectionManager: { update: () => {} } as unknown as ConnectionManager,
    })
  }

  const scanCompleteCalls = (): Record<string, unknown>[] =>
    (SidebarView.postMessage as jest.Mock).mock.calls
      .map(c => c[0] as Record<string, unknown>)
      .filter(m => m.command === 'scanComplete')

  const flushMicrotasks = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }

  beforeEach(() => {
    origUri = vscode.Uri
    vscode.Uri = FakeUri
    registerSpy = jest.spyOn(vscode.commands, 'registerCommand').mockImplementation((...args: unknown[]) => {
      const [name, cb] = args as [string, (...commandArgs: unknown[]) => unknown]
      commands.set(name, cb)
      return { dispose: jest.fn() }
    })
    register()
  })

  afterEach(() => {
    vscode.Uri = origUri
    registerSpy.mockRestore()
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  test('uploadFromFileExplorer single file -> scanComplete carries that file only (no project scan)', async () => {
    await commands.get('metersphere.uploadFromFileExplorer')?.([new FakeUri('/proj/src/A.java')])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: ['/proj/src/A.java'] } })
    expect(JavaFileScanner.findJavaFilesInProject).not.toHaveBeenCalled()
  })

  test('uploadFromFileExplorer multi-select (clickedUri, selectedUris) -> scans BOTH files, no undefined entries', async () => {
    await commands.get('metersphere.uploadFromFileExplorer')?.([
      new FakeUri('/proj/src/A.java'),
      [new FakeUri('/proj/src/B.java')],
    ])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    const files = (calls[0].data as { files: unknown[] }).files
    expect(files).toEqual(['/proj/src/A.java', '/proj/src/B.java'])
    expect(files.every(f => typeof f === 'string')).toBe(true)
  })

  test('uploadFromFileExplorer single-select (uri, [sameUri]) -> deduplicates to ONE file entry', async () => {
    await commands.get('metersphere.uploadFromFileExplorer')?.([
      new FakeUri('/proj/src/A.java'),
      [new FakeUri('/proj/src/A.java')],
    ])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    const files = (calls[0].data as { files: unknown[] }).files
    expect(files).toEqual(['/proj/src/A.java'])
  })

  test('uploadFromFileExplorer folder with no controllers -> exactly one scanComplete with files:[] + error', async () => {
    ;(JavaFileScanner.findProjectRoot as jest.Mock).mockResolvedValue('/proj')
    ;(JavaFileScanner.getCommonProjectPaths as jest.Mock).mockReturnValue(['/src'])
    ;(JavaFileScanner.findJavaFilesInProject as jest.Mock).mockResolvedValue([])

    await commands.get('metersphere.uploadFromFileExplorer')?.([new FakeUri('/proj/src')])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'No @RestController found' } })
  })

  test('uploadFromFileExplorer folder failure: no project root -> exact terminal error', async () => {
    ;(JavaFileScanner.findProjectRoot as jest.Mock).mockResolvedValue(null)

    await commands.get('metersphere.uploadFromFileExplorer')?.([new FakeUri('/proj/docs')])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'Could not find project root' } })
  })

  test('uploadFromFileExplorer no uris: exactly one terminal scanComplete ("No files selected")', async () => {
    await commands.get('metersphere.uploadFromFileExplorer')?.([])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'No files selected' } })
  })

  test('uploadFromNavigator happy: exactly one scanComplete with the file list', async () => {
    ;(JavaFileScanner.findProjectRoot as jest.Mock).mockResolvedValue('/proj')
    ;(JavaFileScanner.getCommonProjectPaths as jest.Mock).mockReturnValue(['/src'])
    ;(JavaFileScanner.findJavaFilesInProject as jest.Mock).mockResolvedValue(['A.java'])

    const node = { type: NodeType.PROJECT, uri: new FakeUri('/proj'), name: 'MyProj' }
    await commands.get('metersphere.uploadFromNavigator')?.(node)

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: ['A.java'] } })
  })

  test('uploadFromNavigator failure: no project root -> exact terminal error text preserved', async () => {
    ;(JavaFileScanner.findProjectRoot as jest.Mock).mockResolvedValue(null)

    const node = { type: NodeType.PROJECT, uri: new FakeUri('/proj'), name: 'MyProj' }
    await commands.get('metersphere.uploadFromNavigator')?.(node)

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      command: 'scanComplete',
      data: { files: [], error: 'Could not find project root (no pom.xml or build.gradle found)' },
    })
  })

  test('syncFolder happy: quickpick file scope -> exactly one scanComplete with the single file', async () => {
    await commands.get('metersphere.syncFolder')?.(new FakeUri('/x/A.java'))

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: ['/x/A.java'] } })
  })

  test('scan entry point: a never-settling scan is terminated at the 60s hard timeout with exactly one scanComplete', async () => {
    jest.useFakeTimers()
    ;(JavaFileScanner.findProjectRoot as jest.Mock).mockResolvedValue('/proj')
    ;(JavaFileScanner.getCommonProjectPaths as jest.Mock).mockReturnValue(['/src'])
    ;(JavaFileScanner.findJavaFilesInProject as jest.Mock).mockReturnValue(new Promise<string[]>(() => {}))

    const done = commands.get('metersphere.uploadFromFileExplorer')?.([new FakeUri('/proj/src')])
    await flushMicrotasks()
    jest.advanceTimersByTime(60_001)
    await done

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'scan timed out' } })
  })
})
