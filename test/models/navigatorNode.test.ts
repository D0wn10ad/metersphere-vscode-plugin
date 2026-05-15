import { NavigatorNode, NodeType } from '../../src/metersphere/models/navigatorNode'

describe('NavigatorNode', () => {
  test('creates leaf node with correct properties', () => {
    const node = new NavigatorNode({
      id: 'api-123',
      name: 'Get Users',
      type: NodeType.API,
      parentId: undefined,
    })
    expect(node.id).toBe('api-123')
    expect(node.name).toBe('Get Users')
    expect(node.type).toBe(NodeType.API)
    expect(node.parentId).toBeUndefined()
    expect(node.children).toEqual([])
    expect(node.collapsibleState).toBe(0) // None for leaf
  })

  test('creates folder node with children', () => {
    const folder = new NavigatorNode({
      id: 'folder-1',
      name: 'User APIs',
      type: NodeType.FOLDER,
      parentId: undefined,
    })
    folder.addChild(new NavigatorNode({ id: 'api-1', name: 'Get', type: NodeType.API, parentId: 'folder-1' }))
    expect(folder.children.length).toBe(1)
    expect(folder.collapsibleState).toBe(1) // Collapsed
  })
})