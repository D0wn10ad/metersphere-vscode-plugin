import { CommandRouter } from '../src/metersphere/commandRouter'
import { ConnectionManager, ConnectionState } from '../src/metersphere/connectionManager'
import { SidebarView } from '../src/metersphere/views/sidebarView'
import { JavaFileScanner } from '../src/metersphere/javaFileScanner'
import { NodeType, NavigatorNode } from '../src/metersphere/models/navigatorNode'
import { NavigatorTreeDataProvider } from '../src/metersphere/navigatorTreeProvider'
import { NavigatorEngine } from '../src/metersphere/navigatorEngine'
import { SettingsManager } from '../src/metersphere/settingsManager'
import { applyNavigatorSelection } from '../src/metersphere/extension'
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
      getState: () => ConnectionState.Connected,
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

  test('uploadFromFileExplorer folder -> folder-scoped scan via findJavaFilesInProject', async () => {
    ;(JavaFileScanner.findJavaFilesInProject as jest.Mock).mockResolvedValue(['/proj/src/C.java'])

    await commands.get('metersphere.uploadFromFileExplorer')?.([new FakeUri('/proj/src')])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: ['/proj/src/C.java'] } })
    expect(JavaFileScanner.findJavaFilesInProject).toHaveBeenCalledWith('/proj/src', expect.any(Function))
  })

  test('uploadFromFileExplorer MIXED selection (file + folder) -> file passes through AND folder is scanned (TC-03)', async () => {
    ;(JavaFileScanner.findJavaFilesInProject as jest.Mock).mockResolvedValue(['/proj/src/B.java', '/proj/src/A.java'])

    await commands.get('metersphere.uploadFromFileExplorer')?.([
      new FakeUri('/proj/src/A.java'),
      new FakeUri('/proj/src'),
    ])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    const files = (calls[0].data as { files: unknown[] }).files
    expect(files).toEqual(['/proj/src/A.java', '/proj/src/B.java'])
    expect(JavaFileScanner.findJavaFilesInProject).toHaveBeenCalledTimes(1)
    expect(JavaFileScanner.findJavaFilesInProject).toHaveBeenCalledWith('/proj/src', expect.any(Function))
  })

  test('uploadFromFileExplorer MIXED selection with duplicate results -> union deduped', async () => {
    ;(JavaFileScanner.findJavaFilesInProject as jest.Mock).mockResolvedValue(['/proj/src/A.java'])

    await commands.get('metersphere.uploadFromFileExplorer')?.([
      new FakeUri('/proj/src/A.java'),
      new FakeUri('/proj/src'),
    ])

    const calls = scanCompleteCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ command: 'scanComplete', data: { files: ['/proj/src/A.java'] } })
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

describe('CommandRouter connection lifecycle (status settling + stale IDs)', () => {
  const vscode = require('vscode')
  const SETTINGS_KEYS = [
    'metersphere.msUrl',
    'metersphere.accessKey',
    'metersphere.secretKey',
    'metersphere.workspaceId',
    'metersphere.projectId',
  ]

  let commands: Map<string, (...args: unknown[]) => unknown>
  let registerSpy: jest.SpyInstance
  let setRoots: jest.Mock

  const trackedConnectionManager = (testConnection: jest.Mock) => {
    let state: ConnectionState = ConnectionState.Unconfigured
    const cm = {
      update: (s: ConnectionState) => {
        state = s
      },
      testConnection,
      getState: () => state,
    }
    return { cm: cm as unknown as ConnectionManager, state: () => state }
  }

  const register = (cm: ConnectionManager): void => {
    commands = new Map()
    setRoots = jest.fn()
    registerSpy = jest.spyOn(vscode.commands, 'registerCommand').mockImplementation((...args: unknown[]) => {
      const [name, cb] = args as [string, (...commandArgs: unknown[]) => unknown]
      commands.set(name, cb)
      return { dispose: jest.fn() }
    })
    CommandRouter.registerAll({ subscriptions: { push: () => {} } } as any, {
      navigatorProvider: { setRoots } as any,
      httpRequest: () => Promise.resolve({ status: 200, body: { success: true, data: [] } }),
      getActiveWebviewPanel: () => undefined,
      connectionManager: cm,
    } as any)
  }

  const queueInputBoxes = (): void => {
    jest.spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('http://new-server:8080')
      .mockResolvedValueOnce('new-ak')
      .mockResolvedValueOnce('new-sk')
  }

  const seedSetting = (key: string, value: string | undefined): void => {
    vscode.workspace.getConfiguration().update(key, value)
  }

  afterEach(() => {
    ;(SidebarView.loadProjectModules as jest.Mock).mockReset().mockResolvedValue(undefined)
    registerSpy?.mockRestore()
    jest.restoreAllMocks()
    for (const key of SETTINGS_KEYS) {
      seedSetting(key, undefined)
    }
  })

  test('configure: testConnection rejection settles Disconnected with surfaced error, resolves (no unhandled rejection)', async () => {
    const { cm, state } = trackedConnectionManager(jest.fn().mockRejectedValue(new Error('network down')))
    register(cm)
    queueInputBoxes()
    const errSpy = jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined)

    await expect(commands.get('metersphere.configure')?.()).resolves.toBeUndefined()

    expect(state()).toBe(ConnectionState.Disconnected)
    expect(errSpy).toHaveBeenCalledWith('Configure failed: network down')
  })

  test('configure: discoverWorkspaces throwing AFTER settings save → error surfaced + settled Disconnected, IDs already cleared', async () => {
    const { cm, state } = trackedConnectionManager(
      jest.fn().mockResolvedValue({ success: true, url: 'http://new-server:8080' })
    )
    register(cm)
    queueInputBoxes()
    jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined)
    jest.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined)
    jest.spyOn(NavigatorEngine, 'discoverWorkspaces').mockRejectedValue(new Error('discovery failed'))

    seedSetting('metersphere.workspaceId', 'ws-old')
    seedSetting('metersphere.projectId', 'proj-old')

    await expect(commands.get('metersphere.configure')?.()).resolves.toBeUndefined()

    expect(state()).toBe(ConnectionState.Disconnected)
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Configure failed: discovery failed')
    expect(SettingsManager.getMsUrl()).toBe('http://new-server:8080')
    expect(SettingsManager.getWorkspaceId()).toBe('')
    expect(SettingsManager.getProjectId()).toBe('')
  })

  test('configure: success clears stale workspace/project IDs from the previous server', async () => {
    const { cm, state } = trackedConnectionManager(
      jest.fn().mockResolvedValue({ success: true, url: 'http://new-server:8080' })
    )
    register(cm)
    queueInputBoxes()
    jest.spyOn(vscode.window, 'showInformationMessage').mockResolvedValue(undefined)
    jest.spyOn(NavigatorEngine, 'discoverWorkspaces').mockResolvedValue([])

    seedSetting('metersphere.workspaceId', 'ws-old')
    seedSetting('metersphere.projectId', 'proj-old')
    expect(SettingsManager.getWorkspaceId()).toBe('ws-old')

    await expect(commands.get('metersphere.configure')?.()).resolves.toBeUndefined()

    expect(state()).toBe(ConnectionState.Connected)
    expect(SettingsManager.getWorkspaceId()).toBe('')
    expect(SettingsManager.getProjectId()).toBe('')
    expect(SettingsManager.getAccessKey()).toBe('new-ak')
    expect(SettingsManager.getSecretKey()).toBe('new-sk')
    expect(setRoots).toHaveBeenCalledWith([])
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('MeterSphere configured successfully!')
  })

  test('testConnection: rejection settles Disconnected with surfaced error, never stuck on Connecting', async () => {
    const { cm, state } = trackedConnectionManager(jest.fn().mockRejectedValue(new Error('socket hang up')))
    register(cm)
    jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined)

    await expect(commands.get('metersphere.testConnection')?.()).resolves.toBeUndefined()

    expect(state()).toBe(ConnectionState.Disconnected)
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Connection failed: socket hang up')
  })

  test('testConnection: success=false without internal update (Not configured) → finally flips Connecting to Disconnected', async () => {
    const { cm, state } = trackedConnectionManager(
      jest.fn().mockResolvedValue({ success: false, error: 'Not configured' })
    )
    register(cm)
    jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined)

    await commands.get('metersphere.testConnection')?.()

    expect(state()).toBe(ConnectionState.Disconnected)
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Connection failed: Not configured')
  })

  test('testConnection: loadProjectModules rejection still settles Disconnected', async () => {
    const { cm, state } = trackedConnectionManager(
      jest.fn().mockResolvedValue({ success: true, url: 'http://host' })
    )
    register(cm)
    jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined)
    ;(SidebarView.loadProjectModules as jest.Mock).mockRejectedValue(new Error('modules boom'))

    await expect(commands.get('metersphere.testConnection')?.()).resolves.toBeUndefined()

    expect(state()).toBe(ConnectionState.Disconnected)
  })
})

describe('Navigator selection invariant (workspaceId/projectId)', () => {
  const vscode = require('vscode')

  const seed = (workspaceId?: string, projectId?: string): void => {
    vscode.workspace.getConfiguration().update('metersphere.workspaceId', workspaceId)
    vscode.workspace.getConfiguration().update('metersphere.projectId', projectId)
  }

  afterEach(() => seed(undefined, undefined))

  test('workspace selection replaces workspaceId and clears the previous project', () => {
    seed('ws-1', 'proj-1')
    applyNavigatorSelection(new NavigatorNode({ id: 'ws-2', name: 'WS2', type: NodeType.WORKSPACE }))
    expect(SettingsManager.getWorkspaceId()).toBe('ws-2')
    expect(SettingsManager.getProjectId()).toBe('')
  })

  test('project selection under another workspace syncs workspaceId (projectId never orphaned)', () => {
    seed('ws-1', '')
    applyNavigatorSelection(
      new NavigatorNode({ id: 'proj-9', name: 'P9', type: NodeType.PROJECT, parentId: 'ws-2' })
    )
    expect(SettingsManager.getWorkspaceId()).toBe('ws-2')
    expect(SettingsManager.getProjectId()).toBe('proj-9')
  })

  test('project selection with no resolvable workspace drops projectId', () => {
    seed(undefined, undefined)
    applyNavigatorSelection(new NavigatorNode({ id: 'proj-9', name: 'P9', type: NodeType.PROJECT }))
    expect(SettingsManager.getProjectId()).toBe('')
  })

  test('project selection with no parentId keeps an existing workspace pairing', () => {
    seed('ws-1', undefined)
    applyNavigatorSelection(new NavigatorNode({ id: 'proj-5', name: 'P5', type: NodeType.PROJECT }))
    expect(SettingsManager.getWorkspaceId()).toBe('ws-1')
    expect(SettingsManager.getProjectId()).toBe('proj-5')
  })
})
