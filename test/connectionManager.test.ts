jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => undefined,
      update: () => Promise.resolve()
    })
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  window: {
    createStatusBarItem: (alignment: any, priority: any) => ({
      text: '',
      tooltip: undefined,
      color: undefined,
      command: undefined,
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    createWebviewPanel: () => ({
      viewType: 'test',
      title: 'test',
      webview: { html: '', onDidReceiveMessage: () => ({ dispose: () => {} }), postMessage: () => Promise.resolve(true) },
      onDidDispose: { addListener: () => ({ dispose: () => {} }) },
      dispose: () => {},
      reveal: () => {},
    }),
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  EventEmitter: class {
    event = (listener: any) => ({ dispose: () => {} })
    fire() {}
    dispose() {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(),
  },
}), { virtual: true })

jest.mock('../src/metersphere/httpClient', () => ({
  httpRequest: jest.fn(),
}))

jest.mock('../src/metersphere/settingsManager', () => ({
  SettingsManager: {
    getMsUrl: jest.fn(),
    getAccessKey: jest.fn(),
    getSecretKey: jest.fn(),
    generateSignature: jest.fn(() => 'mock-signature'),
  },
}))

import { ConnectionManager, ConnectionState } from '../src/metersphere/connectionManager'

describe('ConnectionManager', () => {
  let cm: ConnectionManager
  let mockContext: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockContext = { subscriptions: [] }
    cm = new ConnectionManager(mockContext)
  })

  describe('update()', () => {
    it('sets Unconfigured state with correct icon and text', () => {
      cm.update(ConnectionState.Unconfigured)
      expect(cm.getState()).toBe(ConnectionState.Unconfigured)
    })

    it('sets Connected state with hostname', () => {
      cm.update(ConnectionState.Connected, 'http://ms.example.com/api')
      expect(cm.getState()).toBe(ConnectionState.Connected)
    })

    it('sets Connecting state', () => {
      cm.update(ConnectionState.Connecting)
      expect(cm.getState()).toBe(ConnectionState.Connecting)
    })

    it('sets Disconnected state', () => {
      cm.update(ConnectionState.Disconnected, 'timeout')
      expect(cm.getState()).toBe(ConnectionState.Disconnected)
    })
  })

  describe('testConnection()', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('returns success when /currentUser returns 200', async () => {
      const { httpRequest } = require('../src/metersphere/httpClient')
      ;(httpRequest as jest.Mock).mockResolvedValueOnce({ status: 200, body: {} })
      const { SettingsManager } = require('../src/metersphere/settingsManager')
      ;(SettingsManager.getMsUrl as jest.Mock).mockReturnValueOnce('http://ms.example.com')
      ;(SettingsManager.getAccessKey as jest.Mock).mockReturnValueOnce('ak')
      ;(SettingsManager.getSecretKey as jest.Mock).mockReturnValueOnce('sk')

      const result = await cm.testConnection()
      expect(result.success).toBe(true)
      expect(result.url).toBe('http://ms.example.com')
    })

    it('returns error when /currentUser returns 401', async () => {
      const { httpRequest } = require('../src/metersphere/httpClient')
      ;(httpRequest as jest.Mock).mockResolvedValueOnce({ status: 401, body: {} })
      const { SettingsManager } = require('../src/metersphere/settingsManager')
      ;(SettingsManager.getMsUrl as jest.Mock).mockReturnValueOnce('http://ms.example.com')
      ;(SettingsManager.getAccessKey as jest.Mock).mockReturnValueOnce('ak')
      ;(SettingsManager.getSecretKey as jest.Mock).mockReturnValueOnce('sk')

      const result = await cm.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBe('HTTP 401')
    })

    it('returns error when /currentUser throws', async () => {
      const { httpRequest } = require('../src/metersphere/httpClient')
      ;(httpRequest as jest.Mock).mockRejectedValueOnce(new Error('fetch failed'))
      const { SettingsManager } = require('../src/metersphere/settingsManager')
      ;(SettingsManager.getMsUrl as jest.Mock).mockReturnValueOnce('http://ms.example.com')
      ;(SettingsManager.getAccessKey as jest.Mock).mockReturnValueOnce('ak')
      ;(SettingsManager.getSecretKey as jest.Mock).mockReturnValueOnce('sk')

      const result = await cm.testConnection()
      expect(result.success).toBe(false)
      // String(error) on an Error object gives "Error: message"
      expect(result.error).toBe('Error: fetch failed')
    })

    it('returns success with custom credentials', async () => {
      const { httpRequest } = require('../src/metersphere/httpClient')
      ;(httpRequest as jest.Mock).mockResolvedValueOnce({ status: 200, body: {} })

      const result = await cm.testConnection('http://custom.example.com', 'custom-ak', 'custom-sk')
      expect(result.success).toBe(true)
      expect(result.url).toBe('http://custom.example.com')
    })

    it('passes caller-provided credentials to httpRequest (not empty ones)', async () => {
      const { httpRequest } = require('../src/metersphere/httpClient')
      ;(httpRequest as jest.Mock).mockResolvedValueOnce({ status: 200, body: {} })
      const { SettingsManager } = require('../src/metersphere/settingsManager')
      ;(SettingsManager.getMsUrl as jest.Mock).mockReturnValueOnce('http://ms.example.com')
      ;(SettingsManager.getAccessKey as jest.Mock).mockReturnValueOnce('old-ak')
      ;(SettingsManager.getSecretKey as jest.Mock).mockReturnValueOnce('old-sk')

      await cm.testConnection('http://custom.example.com', 'new-ak', 'new-sk')

      const call = (httpRequest as jest.Mock).mock.calls[0]
      expect(call[0]).toBe('GET')
      expect(call[1]).toBe('http://custom.example.com/api/currentUser')
      expect(call[2]).toMatchObject({
        accessKey: 'new-ak',
        signature: 'mock-signature',
      })
    })
  })
})
