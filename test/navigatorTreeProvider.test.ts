import { NavigatorTreeDataProvider } from '../src/metersphere/navigatorTreeProvider'
import { NavigatorNode, NodeType } from '../src/metersphere/models/navigatorNode'

describe('NavigatorTreeDataProvider', () => {
  let provider: NavigatorTreeDataProvider

  beforeEach(() => {
    provider = new NavigatorTreeDataProvider()
  })

  test('getChildren returns empty array when no roots set', async () => {
    const children = await provider.getChildren(undefined)
    expect(Array.isArray(children)).toBe(true)
    expect(children.length).toBe(0)
  })

  test('getChildren returns root nodes after setRoots', async () => {
    const wsNode = new NavigatorNode({ id: 'ws-1', name: 'WS', type: NodeType.WORKSPACE })
    provider.setRoots([wsNode])
    const children = await provider.getChildren(undefined)
    expect(children.length).toBe(1)
    expect(children[0].id).toBe('ws-1')
  })

  test('getChildren returns children of a node', async () => {
    const folder = new NavigatorNode({ id: 'folder-1', name: 'User APIs', type: NodeType.FOLDER })
    const apiNode = new NavigatorNode({ id: 'api-1', name: 'Get Users', type: NodeType.API })
    folder.addChild(apiNode)
    provider.setRoots([folder])
    const children = await provider.getChildren(folder)
    expect(children.length).toBe(1)
    expect(children[0].id).toBe('api-1')
  })

  test('getTreeItem returns correct tree item shape', async () => {
    const node = new NavigatorNode({ id: 'api-1', name: 'Get Users', type: NodeType.API })
    const item = await provider.getTreeItem(node)
    expect(item.id).toBe('api-1')
    expect(item.label).toBe('Get Users')
  })

  test('project expansion returns only top-level modules', async () => {
    provider.setFetchFn(async (_method, url) => {
      if (url.includes('/module/list/')) {
        return {
          status: 200,
          headers: {},
          durationMs: 0,
          body: {
            data: [
              { id: 'mod-1', name: 'User Module', parentId: 'proj-1', projectId: 'proj-1' },
              { id: 'mod-1-1', name: 'User Submodule', parentId: 'mod-1', projectId: 'proj-1' },
            ],
          },
        }
      }
      return { status: 200, headers: {}, durationMs: 0, body: { data: [] } }
    })

    const project = new NavigatorNode({ id: 'proj-1', name: 'Project', type: NodeType.PROJECT })
    const children = await provider.getChildren(project)
    expect(children.map(child => child.id)).toEqual(['mod-1'])
  })

  test('module expansion returns child modules before APIs', async () => {
    provider.setFetchFn(async (method, url, _headers, body) => {
      if (url.includes('/module/list/')) {
        return {
          status: 200,
          headers: {},
          durationMs: 0,
          body: {
            data: [
              { id: 'mod-1', name: 'User Module', parentId: 'proj-1', projectId: 'proj-1' },
              { id: 'mod-1-1', name: 'User Submodule', parentId: 'mod-1', projectId: 'proj-1' },
            ],
          },
        }
      }

      if (method === 'POST' && url.includes('/definition/list/all') && (body as any)?.moduleIds?.[0] === 'mod-1') {
        return {
          status: 200,
          headers: {},
          durationMs: 0,
          body: {
            data: [
              { id: 'api-1', name: 'Get Users', path: '/api/users', method: 'GET', moduleId: 'mod-1', projectId: 'proj-1' },
            ],
          },
        }
      }

      return { status: 200, headers: {}, durationMs: 0, body: { data: [] } }
    })

    const moduleNode = new NavigatorNode({
      id: 'mod-1',
      name: 'User Module',
      type: NodeType.MODULE,
      projectId: 'proj-1',
    })

    const children = await provider.getChildren(moduleNode)
    expect(children.map(child => child.id)).toEqual(['mod-1-1', 'api-1'])
  })

  test('module expansion returns stored recursive child modules before APIs', async () => {
    provider.setFetchFn(async (method, url, _headers, body) => {
      if (method === 'POST' && url.includes('/definition/list/all') && (body as any)?.moduleIds?.[0] === 'mod-1') {
        return {
          status: 200,
          headers: {},
          durationMs: 0,
          body: {
            data: [
              { id: 'api-1', name: 'Get Users', path: '/api/users', method: 'GET', moduleId: 'mod-1', projectId: 'proj-1' },
            ],
          },
        }
      }

      return { status: 200, headers: {}, durationMs: 0, body: { data: [] } }
    })

    const moduleNode = new NavigatorNode({
      id: 'mod-1',
      name: 'Root Module',
      type: NodeType.MODULE,
      projectId: 'proj-1',
    })
    const childNode = new NavigatorNode({
      id: 'mod-1-1',
      name: 'Child Module',
      type: NodeType.MODULE,
      parentId: 'mod-1',
      projectId: 'proj-1',
    })
    const grandchildNode = new NavigatorNode({
      id: 'mod-1-1-1',
      name: 'Grandchild Module',
      type: NodeType.MODULE,
      parentId: 'mod-1-1',
      projectId: 'proj-1',
    })
    childNode.addChild(grandchildNode)
    moduleNode.addChild(childNode)

    const children = await provider.getChildren(moduleNode)
    expect(children.map(child => child.id)).toEqual(['mod-1-1', 'api-1'])
    expect(children[0].getChildren().map(child => child.id)).toEqual(['mod-1-1-1'])
  })
})
