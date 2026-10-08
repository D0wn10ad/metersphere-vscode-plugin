import { OpenApiBuilder, getUploadSymbolIndex, resetUploadSymbolIndex } from '../src/metersphere/openApiBuilder'
import { ParseResult } from '../src/metersphere/javaParser'

const mockParseResult: ParseResult = {
  classes: [],
  apis: [
    {
      method: 'GET',
      path: '/{id}',
      fullPath: '/cart/configuration/{id}',
      summary: 'Get config by ID',
      parameters: [
        { name: 'id', in: 'path', required: true },
        { name: 'sid', in: 'header' },
      ],
    },
    {
      method: 'POST',
      path: '/cart',
      fullPath: '/cart/configuration',
      summary: 'Update config',
      parameters: [
        { name: 'body', in: 'body' },
      ],
    },
  ],
}

describe('OpenApiBuilder', () => {
  test('builds valid OpenAPI 3.0 document', () => {
    const doc = OpenApiBuilder.build(mockParseResult, 'Test API')
    expect(doc.openapi).toBe('3.0.3')
    expect(doc.info.title).toBe('Test API')
  })

  test('creates path entries for each API endpoint', () => {
    const doc = OpenApiBuilder.build(mockParseResult, 'Test')
    expect(doc.paths['/cart/configuration/{id}']).toBeDefined()
    expect(doc.paths['/cart/configuration']).toBeDefined()
  })

  test('sets HTTP method as key under path', () => {
    const doc = OpenApiBuilder.build(mockParseResult, 'Test')
    expect(doc.paths['/cart/configuration/{id}'].get).toBeDefined()
    expect(doc.paths['/cart/configuration'].post).toBeDefined()
  })

  test('includes path and header parameters', () => {
    const doc = OpenApiBuilder.build(mockParseResult, 'Test')
    const params = doc.paths['/cart/configuration/{id}'].get.parameters
    expect(params).toContainEqual(expect.objectContaining({ name: 'id', in: 'path' }))
    expect(params).toContainEqual(expect.objectContaining({ name: 'sid', in: 'header' }))
  })

  test('creates requestBody for body parameters', () => {
    const doc = OpenApiBuilder.build(mockParseResult, 'Test')
    expect(doc.paths['/cart/configuration'].post.requestBody).toBeDefined()
  })

  test('uses summary from API', () => {
    const doc = OpenApiBuilder.build(mockParseResult, 'Test API')
    expect(doc.paths['/cart/configuration/{id}'].get.summary).toBe('Get config by ID')
  })

  describe('component schemas (T13)', () => {
    const cartItemSrc = [
      'package com.example.dto;',
      'public class CartItem {',
      '  private String productId;',
      '  private int quantity;',
      '}',
    ].join('\n')

    const bodyApi: ParseResult = {
      classes: [],
      apis: [
        {
          method: 'POST',
          path: '/c',
          fullPath: '/c',
          parameters: [{ name: 'item', in: 'body', type: 'CartItem' }],
        },
      ],
    }

    const listBodyApi: ParseResult = {
      classes: [],
      apis: [
        {
          method: 'POST',
          path: '/l',
          fullPath: '/l',
          parameters: [{ name: 'items', in: 'body', type: 'List<CartItem>' }],
        },
      ],
    }

    const primitiveApi: ParseResult = {
      classes: [],
      apis: [
        {
          method: 'GET',
          path: '/p',
          fullPath: '/p',
          parameters: [
            { name: 'count', in: 'query', type: 'int' },
            { name: 'rate', in: 'query', type: 'double' },
          ],
        },
      ],
    }

    const unresolvableApi: ParseResult = {
      classes: [],
      apis: [
        {
          method: 'POST',
          path: '/u',
          fullPath: '/u',
          parameters: [{ name: 'thing', in: 'body', type: 'UnknownDto' }],
        },
      ],
    }

    beforeEach(() => {
      resetUploadSymbolIndex()
      getUploadSymbolIndex().register(cartItemSrc, 'file:///cart-item.java')
    })

    afterEach(() => {
      resetUploadSymbolIndex()
    })

    test('(a) CartItem body produces $ref and components.schemas.CartItem', () => {
      const doc = OpenApiBuilder.build(bodyApi, 'Test')
      const schema = doc.paths['/c'].post.requestBody.content['application/json'].schema
      expect(schema.$ref).toBe('#/components/schemas/CartItem')
      expect(doc.components?.schemas?.CartItem).toBeDefined()
      expect(doc.components?.schemas?.CartItem.properties.productId).toEqual({ type: 'string' })
      expect(doc.components?.schemas?.CartItem.properties.quantity).toEqual({ type: 'integer' })
    })

    test('(b) List<CartItem> body produces an array of that $ref', () => {
      const doc = OpenApiBuilder.build(listBodyApi, 'Test')
      const schema = doc.paths['/l'].post.requestBody.content['application/json'].schema
      expect(schema.type).toBe('array')
      expect(schema.items.$ref).toBe('#/components/schemas/CartItem')
    })

    test('(c) int query param produces integer, double produces number', () => {
      const doc = OpenApiBuilder.build(primitiveApi, 'Test')
      const params = doc.paths['/p'].get.parameters
      expect(params[0].schema).toEqual({ type: 'integer' })
      expect(params[1].schema).toEqual({ type: 'number' })
    })

    test('(d) every $ref in the output resolves to a components.schemas key', () => {
      const doc = OpenApiBuilder.build(listBodyApi, 'Test')
      const refs: string[] = []
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return
        const obj = node as Record<string, unknown>
        if (typeof obj.$ref === 'string') refs.push(obj.$ref)
        for (const v of Object.values(obj)) walk(v)
      }
      walk(doc)
      expect(refs.length).toBeGreaterThan(0)
      for (const ref of refs) {
        const key = ref.replace('#/components/schemas/', '')
        expect(doc.components?.schemas?.[key]).toBeDefined()
      }
    })

    test('QA: an unresolvable DTO emits a plain object schema with no $ref and no apology text', () => {
      const doc = OpenApiBuilder.build(unresolvableApi, 'Test')
      const schema = doc.paths['/u'].post.requestBody.content['application/json'].schema
      expect(schema).toEqual({ type: 'object' })
      expect(schema.$ref).toBeUndefined()
      expect(JSON.stringify(doc)).not.toContain('Red Hat')
    })
  })
})
