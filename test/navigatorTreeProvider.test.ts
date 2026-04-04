import { NavigatorTreeDataProvider } from '../src/metersphere/navigatorTreeProvider'
import { NavigatorNode, NodeType } from '../src/metersphere/models/navigatorNode'

describe('NavigatorTreeDataProvider', () => {
  let provider: NavigatorTreeDataProvider

  beforeEach(() => {
    provider = new NavigatorTreeDataProvider()
  })

  test('getChildren returns empty array when no roots set', () => {
    const children = provider.getChildren(undefined) as NavigatorNode[]
    expect(Array.isArray(children)).toBe(true)
    expect(children.length).toBe(0)
  })

  test('getChildren returns root nodes after setRoots', () => {
    const wsNode = new NavigatorNode({ id: 'ws-1', name: 'WS', type: NodeType.WORKSPACE })
    provider.setRoots([wsNode])
    const children = provider.getChildren(undefined) as NavigatorNode[]
    expect(children.length).toBe(1)
    expect(children[0].id).toBe('ws-1')
  })

  test('getChildren returns children of a node', () => {
    const folder = new NavigatorNode({ id: 'folder-1', name: 'User APIs', type: NodeType.FOLDER })
    const apiNode = new NavigatorNode({ id: 'api-1', name: 'Get Users', type: NodeType.API })
    folder.addChild(apiNode)
    provider.setRoots([folder])
    const children = provider.getChildren(folder) as NavigatorNode[]
    expect(children.length).toBe(1)
    expect(children[0].id).toBe('api-1')
  })

  test('getTreeItem returns correct tree item shape', async () => {
    const node = new NavigatorNode({ id: 'api-1', name: 'Get Users', type: NodeType.API })
    const item = await provider.getTreeItem(node)
    expect(item.id).toBe('api-1')
    expect(item.label).toBe('Get Users')
  })
})
