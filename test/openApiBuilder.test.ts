import { OpenApiBuilder } from '../src/metersphere/openApiBuilder'
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
    const doc = OpenApiBuilder.build(mockParseResult, 'Test')
    expect(doc.paths['/cart/configuration/{id}'].get.summary).toBe('Get config by ID')
  })
})
