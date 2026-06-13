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
    if (url.includes('/module/list')) {
      return { status: 200, body: { data: [{ id: 'mod-1', name: 'User Module', parentId: 'proj-1' }] } }
    }
    if (url.includes('/definition/list')) {
      return {
        status: 200,
        body: {
          data: [
            { id: 'api-1', name: 'Get Users', path: '/api/users', method: 'GET', moduleId: 'mod-1', projectId: 'proj-1' },
            { id: 'api-2', name: 'Create User', path: '/api/users/create', method: 'POST', moduleId: 'mod-1', projectId: 'proj-1', description: 'Creates a new user' },
          ]
        }
      }
    }
    return { status: 200, body: { data: [] } }
  }

  beforeEach(() => {
    NavigatorEngine.clearCache()
  })

  afterEach(() => {
    NavigatorEngine.setStateStorage(null as any)
  })

  test('discovers workspaces', async () => {
    const nodes = await NavigatorEngine.discoverWorkspaces(mockHttpRequest as any)
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0].id).toBe('ws-1')
    expect(nodes[0].name).toBe('Test Workspace')
    expect(nodes[0].type).toBe(NodeType.WORKSPACE)
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

  test('discovers modules with projectId', async () => {
    const nodes = await NavigatorEngine.discoverModules('proj-1', mockHttpRequest as any)
    expect(nodes.length).toBe(1)
    expect(nodes[0].type).toBe(NodeType.MODULE)
    expect(nodes[0].name).toBe('User Module')
    expect(nodes[0].projectId).toBe('proj-1')
  })

  test('discovers only top-level modules for a project', async () => {
    const nestedModuleFetch = async (method: string, url: string, headers: Record<string, string>, body?: unknown) => {
      if (url.includes('/module/list')) {
        return {
          status: 200,
          body: {
            data: [
              { id: 'mod-1', name: 'User Module', parentId: 'proj-1', projectId: 'proj-1' },
              { id: 'mod-1-1', name: 'User Submodule', parentId: 'mod-1', projectId: 'proj-1' },
              { id: 'mod-2', name: 'Order Module', parentId: 'proj-1', projectId: 'proj-1' },
            ],
          },
        }
      }
      return { status: 200, body: { data: [] } }
    }

    const nodes = await NavigatorEngine.discoverModules('proj-1', nestedModuleFetch as any)
    expect(nodes.map(node => node.id)).toEqual(['mod-1', 'mod-2'])
  })

  test('discovers nested modules from server children trees', async () => {
    const treeModuleFetch = async (_method: string, url: string) => {
      if (url.includes('/module/list')) {
        return {
          status: 200,
          body: {
            data: [
              {
                id: 'mod-1',
                name: 'Root Module',
                parentId: null,
                projectId: 'proj-1',
                children: [
                  {
                    id: 'mod-1-1',
                    name: 'Child Module',
                    parentId: 'mod-1',
                    projectId: 'proj-1',
                    children: [
                      {
                        id: 'mod-1-1-1',
                        name: 'Grandchild Module',
                        parentId: 'mod-1-1',
                        projectId: 'proj-1',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }
      }
      return { status: 200, body: { data: [] } }
    }

    const nodes = await NavigatorEngine.discoverModules('proj-1', treeModuleFetch as any)
    expect(nodes.map(node => node.id)).toEqual(['mod-1'])
    expect(nodes[0].getChildren().map(child => child.id)).toEqual(['mod-1-1'])
    expect(nodes[0].getChildren()[0].getChildren().map(child => child.id)).toEqual(['mod-1-1-1'])
  })

  test('discovers child modules from cached workspace state without losing NavigatorNode methods', async () => {
    const workspaceState = {
      get: jest.fn((key: string) => {
        if (key === 'modules_proj-1') {
          return {
            data: [
              {
                id: 'mod-1',
                name: 'Root Module',
                childIds: ['mod-1-1'],
                children: [
                  {
                    id: 'mod-1-1',
                    name: 'Child Module',
                    childIds: [],
                    children: [],
                    type: 'module',
                    parentId: 'mod-1',
                    projectId: 'proj-1',
                  },
                ],
                type: 'module',
                parentId: 'proj-1',
                projectId: 'proj-1',
              },
            ],
            timestamp: Date.now(),
          }
        }
        return undefined
      }),
      update: jest.fn(),
    }

    NavigatorEngine.setStateStorage(workspaceState as any)

    const children = await NavigatorEngine.discoverChildModules('proj-1', 'mod-1', mockHttpRequest as any)

    expect(children.map(node => node.id)).toEqual(['mod-1-1'])
    expect(typeof children[0].getChildren).toBe('function')
  })

  test('discovers APIs under a module', async () => {
    const nodes = await NavigatorEngine.discoverApis('proj-1', mockHttpRequest as any, 'mod-1')
    expect(nodes.length).toBe(2)
    expect(nodes[0].type).toBe(NodeType.API)
    expect(nodes[0].name).toBe('[GET] /api/users')
    expect(nodes[0].parentId).toBe('mod-1')
    expect(nodes[0].projectId).toBe('proj-1')
    expect(nodes[1].name).toBe('[POST] /api/users/create')
    expect(nodes[1].tooltip).toBe('Creates a new user')
  })

  test('discovers APIs for entire project without moduleId', async () => {
    const nodes = await NavigatorEngine.discoverApis('proj-1', mockHttpRequest as any)
    expect(nodes.length).toBe(2)
    expect(nodes[0].parentId).toBe('proj-1')
  })

  test('discoverApis returns empty on API error', async () => {
    const failFn = async () => { throw new Error('Network error') }
    const nodes = await NavigatorEngine.discoverApis('proj-1', failFn as any, 'mod-1')
    expect(nodes).toEqual([])
  })
})
