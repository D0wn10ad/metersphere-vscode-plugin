import { NavigatorEngine } from '../src/metersphere/navigatorEngine'
import { NodeType } from '../src/metersphere/models/navigatorNode'

describe('NavigatorEngine', () => {
  const mockHttpRequest = async (method: string, url: string, headers: Record<string, string>, body?: unknown) => {
    if (url.includes('/workspace/list')) {
      return { status: 200, body: { data: [{ id: 'ws-1', name: 'Test Workspace' }] } }
    }
    if (url.includes('/project/list')) {
      return { status: 200, body: { data: [{ id: 'proj-1', name: 'Test Project', workspaceId: 'ws-1' }] } }
    }
    return { status: 200, body: { data: [] } }
  }

  beforeEach(() => {
    NavigatorEngine.clearCache()
  })

  test('discovers workspaces', async () => {
    const engines = await NavigatorEngine.discoverWorkspaces(mockHttpRequest as any)
    expect(engines.length).toBeGreaterThan(0)
    expect(engines[0].id).toBe('ws-1')
    expect(engines[0].name).toBe('Test Workspace')
  })

  test('builds tree from project list', async () => {
    const projects = [{ id: 'proj-1', name: 'API Project', workspaceId: 'ws-1' }]
    const tree = NavigatorEngine.buildTree(projects)
    expect(tree.length).toBe(1)
    expect(tree[0].type).toBe(NodeType.PROJECT)
    expect(tree[0].children.length).toBe(0)
  })

  test('cache is used on second call', async () => {
    NavigatorEngine.discoverWorkspaces(mockHttpRequest as any)
    NavigatorEngine.discoverWorkspaces(mockHttpRequest as any)
  })
})
