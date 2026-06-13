import { SchemaGenerator } from '../src/metersphere/schemaGenerator'

describe('SchemaGenerator', () => {
  test('complex type generates $ref', () => {
    expect(SchemaGenerator.generateSchema('IDDShoppingModel')).toEqual({ $ref: '#/components/schemas/IDDShoppingModel' })
  })

  test('primitive generates inline schema', () => {
    expect(SchemaGenerator.generateSchema('string')).toEqual({ type: 'string' })
  })

  test('generateArraySchema creates array with $ref items', () => {
    expect(SchemaGenerator.generateArraySchema('CartItem')).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/CartItem' },
    })
  })

  test('stubObjectSchema returns object type with description', () => {
    const stub = SchemaGenerator.stubObjectSchema('Foo')
    expect(stub.type).toBe('object')
    expect(stub.description).toContain('Red Hat')
  })

  test('registerType adds to registry', () => {
    const registry: Record<string, any> = {}
    SchemaGenerator.registerType(registry, 'IDDShoppingModel')
    expect(registry.IDDShoppingModel).toBeDefined()
    expect(registry.IDDShoppingModel.type).toBe('object')
  })
})
