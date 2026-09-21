jest.mock('../src/metersphere/settingsManager', () => ({
  SettingsManager: {
    getMsUrl: jest.fn(() => 'http://ms.example.com'),
    getAccessKey: jest.fn(() => 'ak'),
    getSecretKey: jest.fn(() => 'sk'),
    buildAuthHeaders: jest.fn(() => ({
      'Content-Type': 'application/json',
      accessKey: 'ak',
      signature: 'sig',
    })),
    getWorkspaceId: jest.fn(),
    setWorkspaceId: jest.fn(),
    getProjectId: jest.fn(),
    setProjectId: jest.fn(),
    getCurrentUserId: jest.fn(),
  },
}))

jest.mock('../src/metersphere/debugLogger', () => ({
  DebugLogger: {
    log: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('../src/metersphere/javaParser', () => ({
  JavaParser: {
    parseSource: jest.fn(),
    enhanceWithJavadoc: jest.fn(),
  },
}))

jest.mock('../src/metersphere/syncService', () => ({
  SyncService: {
    toOpenApiCollection: jest.fn(),
    toPostmanCollection: jest.fn(),
  },
}))

jest.mock('../src/metersphere/contextHolder', () => ({
  ContextHolder: {
    getContext: jest.fn(),
  },
}))

import { SidebarView } from '../src/metersphere/views/sidebarView'

describe('SidebarView.loadProjectModules', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as any
    jest.spyOn(SidebarView, 'postMessage').mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('auto-discovers and persists the first workspace and project when none are saved', async () => {
    const { SettingsManager } = require('../src/metersphere/settingsManager')
    ;(SettingsManager.getWorkspaceId as jest.Mock).mockReturnValue(undefined)
    ;(SettingsManager.getProjectId as jest.Mock).mockReturnValue(undefined)
    ;(SettingsManager.getCurrentUserId as jest.Mock).mockReturnValue('user-1')

    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'ws-1', name: 'Workspace One' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: 'proj-1', name: 'Project One' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'mod-1', name: 'Module One' }],
        }),
      })

    await SidebarView.loadProjectModules()

    expect(SettingsManager.setWorkspaceId).toHaveBeenCalledWith('ws-1')
    expect(SettingsManager.setProjectId).toHaveBeenCalledWith('proj-1')
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://ms.example.com/api/workspace/list/userworkspace',
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://ms.example.com/api/project/list/related',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Object),
        body: JSON.stringify({ workspaceIds: ['ws-1'], userId: 'user-1' }),
      })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'http://ms.example.com/api/api/module/list/proj-1/HTTP',
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(SidebarView.postMessage).toHaveBeenCalledWith({
      command: 'projectLoaded',
      name: 'Project One',
      data: { modules: [{ id: 'proj-1:mod-1', name: 'Module One' }] },
    })
  })

  it('keeps the saved project when it exists in the returned project list', async () => {
    const { SettingsManager } = require('../src/metersphere/settingsManager')
    ;(SettingsManager.getWorkspaceId as jest.Mock).mockReturnValue('ws-1')
    ;(SettingsManager.getProjectId as jest.Mock).mockReturnValue('proj-2')
    ;(SettingsManager.getCurrentUserId as jest.Mock).mockReturnValue(undefined)

    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            { id: 'proj-1', name: 'Project One' },
            { id: 'proj-2', name: 'Project Two' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'mod-9', name: 'Module Nine' }],
        }),
      })

    await SidebarView.loadProjectModules()

    expect(SettingsManager.setWorkspaceId).not.toHaveBeenCalled()
    expect(SettingsManager.setProjectId).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://ms.example.com/api/project/list/related',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workspaceIds: ['ws-1'] }),
      })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://ms.example.com/api/api/module/list/proj-2/HTTP',
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(SidebarView.postMessage).toHaveBeenCalledWith({
      command: 'projectLoaded',
      name: 'Project Two',
      data: { modules: [{ id: 'proj-2:mod-9', name: 'Module Nine' }] },
    })
  })

  it('posts an error when no workspace can be resolved', async () => {
    const { SettingsManager } = require('../src/metersphere/settingsManager')
    ;(SettingsManager.getWorkspaceId as jest.Mock).mockReturnValue(undefined)
    ;(SettingsManager.getProjectId as jest.Mock).mockReturnValue(undefined)

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    })

    await SidebarView.loadProjectModules()

    expect(SidebarView.postMessage).toHaveBeenCalledWith({
      command: 'loadProjectError',
      data: { message: 'No workspace selected. Use Navigator to select a workspace.' },
    })
  })
})
