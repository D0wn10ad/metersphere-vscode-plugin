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

  describe('Map + emission formats (T5)', () => {
    const userSrc = [
      'package com.example.dto;',
      'public class User {',
      '  private String name;',
      '}',
    ].join('\n')

    const eventSrc = [
      'package com.example.dto;',
      'public class Event {',
      '  private LocalDateTime createdAt;',
      '  private UUID id;',
      '}',
    ].join('\n')

    const bodyOf = (type: string): ParseResult => ({
      classes: [],
      apis: [
        { method: 'POST', path: '/m', fullPath: '/m', parameters: [{ name: 'body', in: 'body', type }] },
      ],
    })

    const schemaOf = (doc: ReturnType<typeof OpenApiBuilder.build>) =>
      doc.paths['/m'].post.requestBody.content['application/json'].schema

    beforeEach(() => {
      resetUploadSymbolIndex()
      getUploadSymbolIndex().register(userSrc, 'file:///user.java')
      getUploadSymbolIndex().register(eventSrc, 'file:///event.java')
    })

    afterEach(() => {
      resetUploadSymbolIndex()
    })

    test('Map<String,List<User>> emits additionalProperties as an array of the User $ref', () => {
      const doc = OpenApiBuilder.build(bodyOf('Map<String,List<User>>'), 'Test')
      expect(schemaOf(doc)).toEqual({
        type: 'object',
        additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/User' } },
      })
      expect(doc.components?.schemas?.User).toBeDefined()
    })

    test('Map<String,String> emits additionalProperties as a string schema', () => {
      const doc = OpenApiBuilder.build(bodyOf('Map<String,String>'), 'Test')
      expect(schemaOf(doc)).toEqual({ type: 'object', additionalProperties: { type: 'string' } })
    })

    test('Map<String,Object> emits a plain object additionalProperties', () => {
      const doc = OpenApiBuilder.build(bodyOf('Map<String,Object>'), 'Test')
      expect(schemaOf(doc)).toEqual({ type: 'object', additionalProperties: { type: 'object' } })
    })

    test('LocalDateTime and UUID fields carry date-time / uuid formats', () => {
      const doc = OpenApiBuilder.build(bodyOf('Event'), 'Test')
      const props = doc.components?.schemas?.Event.properties
      expect(props.createdAt).toEqual({ type: 'string', format: 'date-time' })
      expect(props.id).toEqual({ type: 'string', format: 'uuid' })
    })

    test('LocalDateTime query param carries date-time format', () => {
      const api: ParseResult = {
        classes: [],
        apis: [
          { method: 'GET', path: '/q', fullPath: '/q', parameters: [{ name: 'since', in: 'query', type: 'LocalDateTime' }] },
        ],
      }
      const doc = OpenApiBuilder.build(api, 'Test')
      expect(doc.paths['/q'].get.parameters[0].schema).toEqual({ type: 'string', format: 'date-time' })
    })

    test('int and double params carry NO format', () => {
      const api: ParseResult = {
        classes: [],
        apis: [
          {
            method: 'GET',
            path: '/n',
            fullPath: '/n',
            parameters: [
              { name: 'count', in: 'query', type: 'int' },
              { name: 'rate', in: 'query', type: 'double' },
            ],
          },
        ],
      }
      const doc = OpenApiBuilder.build(api, 'Test')
      const params = doc.paths['/n'].get.parameters
      expect(params[0].schema).toEqual({ type: 'integer' })
      expect(params[1].schema).toEqual({ type: 'number' })
      expect(params[0].schema.format).toBeUndefined()
      expect(params[1].schema.format).toBeUndefined()
    })

    test('unbalanced generic falls back to a plain object without throwing', () => {
      let doc: ReturnType<typeof OpenApiBuilder.build> | undefined
      expect(() => {
        doc = OpenApiBuilder.build(bodyOf('Map<String,List<User>'), 'Test')
      }).not.toThrow()
      expect(schemaOf(doc!)).toEqual({ type: 'object' })
    })
  })
})

describe('OpenApiBuilder — enriched parameters (T7)', () => {
  const buildWith = (parameters: any[]): any =>
    OpenApiBuilder.build(
      {
        classes: [],
        apis: [{ method: 'GET', path: '/p', fullPath: '/p', summary: 's', parameters }],
      } as unknown as ParseResult,
      'T7',
    )

  test('numeric default is coerced and validation keywords land in schema', () => {
    const doc = buildWith([
      {
        name: 'page',
        in: 'query',
        required: false,
        type: 'int',
        defaultValue: '1',
        validation: [{ type: 'Min', value: 1 }],
      },
    ])
    const p = doc.paths['/p'].get.parameters[0]
    expect(p.required).toBe(false)
    expect(p.schema).toEqual({ type: 'integer', minimum: 1 })
    expect(p.default).toBe(1)
  })

  test('header param carries its description', () => {
    const doc = buildWith([{ name: 'sid', in: 'header', type: 'String', description: 'session id' }])
    const p = doc.paths['/p'].get.parameters[0]
    expect(p.description).toBe('session id')
    expect(p.schema).toEqual({ type: 'string' })
  })

  test('param with no constraints emits a clean primitive schema (no empty keyword objects)', () => {
    const doc = buildWith([{ name: 'q', in: 'query', type: 'String' }])
    const p = doc.paths['/p'].get.parameters[0]
    expect(p.schema).toEqual({ type: 'string' })
    expect(Object.keys(p.schema)).toEqual(['type'])
    expect(p.default).toBeUndefined()
    expect(p.description).toBeUndefined()
  })

  test('string default stays a string on the parameter object', () => {
    const doc = buildWith([{ name: 'sort', in: 'query', type: 'String', defaultValue: 'asc' }])
    const p = doc.paths['/p'].get.parameters[0]
    expect(p.schema).toEqual({ type: 'string' })
    expect(p.default).toBe('asc')
  })
})

describe('OpenApiBuilder — real responses (T8)', () => {
  const buildWith = (api: Record<string, unknown>): any =>
    OpenApiBuilder.build({ classes: [], apis: [api] } as unknown as ParseResult, 'T8')

  test('Response<Page<UserDto>> unwraps to a UserDto $ref', () => {
    resetUploadSymbolIndex()
    getUploadSymbolIndex().register(
      'public class UserDto { private String name; }',
      'file:///UserDto.java',
    )
    const doc = buildWith({
      method: 'GET',
      path: '/u',
      fullPath: '/u',
      returnType: 'Response<Page<UserDto>>',
      parameters: [],
    })
    const resp = doc.paths['/u'].get.responses['200']
    expect(resp.content['application/json'].schema.$ref).toBe('#/components/schemas/UserDto')
    resetUploadSymbolIndex()
  })

  test('void (no returnType) emits code only, no content', () => {
    const doc = buildWith({ method: 'GET', path: '/v', fullPath: '/v', parameters: [] })
    const resp = doc.paths['/v'].get.responses['200']
    expect(resp.description).toBe('OK')
    expect(resp.content).toBeUndefined()
  })

  test('@ResponseStatus(CREATED) becomes the 201 key', () => {
    const doc = buildWith({
      method: 'POST',
      path: '/c',
      fullPath: '/c',
      responseStatus: 201,
      returnType: 'String',
      parameters: [],
    })
    expect(doc.paths['/c'].post.responses['201']).toBeDefined()
    expect(doc.paths['/c'].post.responses['200']).toBeUndefined()
  })

  test('@ResponseHeader captured headers land under the success response', () => {
    const doc = buildWith({
      method: 'GET',
      path: '/h',
      fullPath: '/h',
      responseHeaders: [{ name: 'X-Trace', description: 'trace id' }],
      parameters: [],
    })
    const headers = doc.paths['/h'].get.responses['200'].headers
    expect(headers['X-Trace']).toBeDefined()
    expect(headers['X-Trace'].description).toBe('trace id')
  })

  test('@ApiResponse extras emit additional response codes without clobbering success', () => {
    const doc = buildWith({
      method: 'GET',
      path: '/e',
      fullPath: '/e',
      responseStatus: 200,
      extraResponses: [{ code: '404', description: 'Not found' }],
      parameters: [],
    })
    const responses = doc.paths['/e'].get.responses
    expect(responses['200']).toBeDefined()
    expect(responses['404'].description).toBe('Not found')
  })

  test('List<UserDto> payload is array-wrapped', () => {
    resetUploadSymbolIndex()
    getUploadSymbolIndex().register(
      'public class UserDto { private String name; }',
      'file:///UserDto.java',
    )
    const doc = buildWith({
      method: 'GET',
      path: '/l',
      fullPath: '/l',
      returnType: 'List<UserDto>',
      parameters: [],
    })
    const schema = doc.paths['/l'].get.responses['200'].content['application/json'].schema
    expect(schema.type).toBe('array')
    expect(schema.items.$ref).toBe('#/components/schemas/UserDto')
    resetUploadSymbolIndex()
  })
})

describe('OpenApiBuilder — security schemes (T9)', () => {
  const buildWith = (apis: any[], classes: any[] = []): any =>
    OpenApiBuilder.build({ classes, apis } as unknown as ParseResult, 'T9')

  test('secured api → bearerAuth scheme + document security', () => {
    const doc = buildWith([{ method: 'GET', path: '/s', fullPath: '/s', secured: true, parameters: [] }])
    expect(doc.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    expect(doc.security).toEqual([{ bearerAuth: [] }])
  })

  test('permitAll operation gets an empty security array', () => {
    const doc = buildWith([{ method: 'GET', path: '/o', fullPath: '/o', permitAll: true, parameters: [] }])
    expect(doc.paths['/o'].get.security).toEqual([])
  })

  test('no auth annotation anywhere → no securitySchemes key', () => {
    const doc = buildWith([{ method: 'GET', path: '/n', fullPath: '/n', parameters: [] }])
    expect(doc.components?.securitySchemes).toBeUndefined()
    expect(doc.security).toBeUndefined()
  })

  test('springdoc apiKey @SecurityScheme overrides (no bearer)', () => {
    const doc = buildWith(
      [{ method: 'GET', path: '/k', fullPath: '/k', parameters: [] }],
      [{ name: 'C', isRestController: true, isController: true, basePath: '', securityScheme: { name: 'apiKeyAuth', type: 'apiKey' } }],
    )
    expect(doc.components?.securitySchemes?.apiKeyAuth).toEqual({ type: 'apiKey', name: 'apiKeyAuth', in: 'header' })
    expect(doc.components?.securitySchemes?.bearerAuth).toBeUndefined()
    expect(doc.security).toEqual([{ apiKeyAuth: [] }])
  })

  test('class-level secured counts even when the method is unannotated', () => {
    const doc = buildWith(
      [{ method: 'GET', path: '/c', fullPath: '/c', parameters: [] }],
      [{ name: 'C', isRestController: true, isController: true, basePath: '', secured: true }],
    )
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined()
  })
})

describe('OpenApiBuilder — security requirement keys are always registered schemes', () => {
  const buildWith = (apis: any[], classes: any[] = []): any =>
    OpenApiBuilder.build({ classes, apis } as unknown as ParseResult, 'sec')

  /**
   * Document-level sanity: every key appearing in doc.security AND in any
   * operation.security must exist in components.securitySchemes (OpenAPI 3
   * forbids referencing an unregistered security scheme).
   */
  const expectSecurityInvariant = (doc: any): void => {
    const registered = Object.keys(doc.components?.securitySchemes ?? {})
    const keysOf = (reqs: unknown): string[] =>
      Array.isArray(reqs) ? reqs.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])) : []
    for (const key of keysOf(doc.security)) {
      expect(registered).toContain(key)
    }
    for (const pathItem of Object.values(doc.paths ?? {}) as any[]) {
      for (const op of Object.values(pathItem ?? {}) as any[]) {
        for (const key of keysOf(op?.security)) {
          expect(registered).toContain(key)
        }
      }
    }
  }

  test('@SecurityRequirement(name="X") without @SecurityScheme registers X instead of dangling', () => {
    const doc = buildWith([
      { method: 'GET', path: '/x', fullPath: '/x', securityRequirement: 'X', parameters: [] },
    ])
    expect(doc.security).toEqual([{ X: [] }])
    expect(doc.components?.securitySchemes?.X).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    expectSecurityInvariant(doc)
  })

  test('@SecurityScheme(name=apiKeyAuth) + @SecurityRequirement(name=otherAuth) registers BOTH keys', () => {
    const doc = buildWith(
      [{ method: 'GET', path: '/k', fullPath: '/k', parameters: [] }],
      [
        {
          name: 'C',
          isRestController: true,
          isController: true,
          basePath: '',
          securityScheme: { name: 'apiKeyAuth', type: 'apiKey' },
          securityRequirement: 'otherAuth',
        },
      ],
    )
    expect(doc.security).toEqual([{ otherAuth: [] }])
    expect(doc.components?.securitySchemes?.apiKeyAuth).toEqual({
      type: 'apiKey',
      name: 'apiKeyAuth',
      in: 'header',
    })
    expect(doc.components?.securitySchemes?.otherAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    expectSecurityInvariant(doc)
  })

  test('default bearer case is unchanged: security=[{bearerAuth:[]}] + schemes.bearerAuth', () => {
    const doc = buildWith([{ method: 'GET', path: '/s', fullPath: '/s', secured: true, parameters: [] }])
    expect(doc.security).toEqual([{ bearerAuth: [] }])
    expect(doc.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    expectSecurityInvariant(doc)
  })

  test('invariant holds across generated documents (doc-level and operation-level security)', () => {
    const securedOp = { method: 'GET', path: '/s', fullPath: '/s', secured: true, parameters: [] }
    const permitAllOp = { method: 'GET', path: '/o', fullPath: '/o', permitAll: true, parameters: [] }
    const requirementOnlyOp = {
      method: 'POST',
      path: '/r',
      fullPath: '/r',
      securityRequirement: 'signedAuth',
      parameters: [],
    }
    const apiKeyClass = {
      name: 'C',
      isRestController: true,
      isController: true,
      basePath: '',
      securityScheme: { name: 'apiKeyAuth', type: 'apiKey' },
      securityRequirement: 'otherAuth',
    }
    const docs = [
      buildWith([securedOp]),
      buildWith([permitAllOp, securedOp]),
      buildWith([requirementOnlyOp]),
      buildWith([{ method: 'GET', path: '/k', fullPath: '/k', parameters: [] }], [apiKeyClass]),
      buildWith([{ method: 'GET', path: '/n', fullPath: '/n', parameters: [] }]),
    ]
    for (const doc of docs) {
      expectSecurityInvariant(doc)
    }
    const withSecurity = docs.filter((d) => Array.isArray(d.security) && d.security.length > 0)
    expect(withSecurity.length).toBe(4)
  })
})

describe('OpenApiBuilder — operationId, tags, enum/record schemas (T10)', () => {
  afterEach(() => {
    resetUploadSymbolIndex()
  })

  test('enum-typed body field emits a $ref to a {type:string, enum:[...]} schema', () => {
    resetUploadSymbolIndex()
    const idx = getUploadSymbolIndex()
    idx.register('public enum Status { ACTIVE, INACTIVE }', 'file:///Status.java')
    idx.register(
      'public class TaskDto { private Status status; private String title; }',
      'file:///TaskDto.java',
    )
    const doc = OpenApiBuilder.build(
      {
        classes: [],
        apis: [
          { method: 'POST', path: '/t', fullPath: '/t', parameters: [{ name: 'body', in: 'body', type: 'TaskDto' }] },
        ],
      } as unknown as ParseResult,
      'T10',
    )
    const status = doc.components?.schemas?.Status
    expect(status).toEqual({ type: 'string', enum: ['ACTIVE', 'INACTIVE'] })
    const bodySchema = doc.paths['/t'].post.requestBody.content['application/json'].schema
    expect(bodySchema.$ref).toBe('#/components/schemas/TaskDto')
    expect(doc.components?.schemas?.TaskDto.properties.status.$ref).toBe('#/components/schemas/Status')
  })

  test('every operation gets operationId and tags from its class', () => {
    const doc = OpenApiBuilder.build(
      {
        classes: [],
        apis: [
          { method: 'GET', path: '/a', fullPath: '/a', methodName: 'listAll', className: 'TaskController', parameters: [] },
        ],
      } as unknown as ParseResult,
      'T10',
    )
    const op = doc.paths['/a'].get
    expect(op.operationId).toBe('listAll')
    expect(op.tags).toEqual(['TaskController'])
  })

  test('colliding method names get unique operationIds', () => {
    const doc = OpenApiBuilder.build(
      {
        classes: [],
        apis: [
          { method: 'POST', path: '/a', fullPath: '/a', methodName: 'create', className: 'AController', parameters: [] },
          { method: 'POST', path: '/b', fullPath: '/b', methodName: 'create', className: 'BController', parameters: [] },
        ],
      } as unknown as ParseResult,
      'T10',
    )
    const ids = [doc.paths['/a'].post.operationId, doc.paths['/b'].post.operationId]
    expect(new Set(ids).size).toBe(2)
    expect(ids[0]).toBe('create')
    expect(ids[1]).toBe('create_2')
  })

  test('two enums with the same simple name: last-registered-wins, schema well-formed', () => {
    resetUploadSymbolIndex()
    const idx = getUploadSymbolIndex()
    idx.register('public enum State { ON, OFF }', 'file:///a/State.java')
    idx.register('public enum State { OPEN, CLOSED }', 'file:///b/State.java')
    const doc = OpenApiBuilder.build(
      {
        classes: [],
        apis: [
          { method: 'GET', path: '/s', fullPath: '/s', returnType: 'State', parameters: [] },
        ],
      } as unknown as ParseResult,
      'T10',
    )
    const schema = doc.components?.schemas?.State
    expect(schema).toBeDefined()
    expect(schema.type).toBe('string')
    expect(Array.isArray(schema.enum)).toBe(true)
    expect(schema.enum.length).toBeGreaterThan(0)
  })

  test('record DTO expands to an object schema from its components', () => {
    resetUploadSymbolIndex()
    getUploadSymbolIndex().register('public record Point(int x, String label) {}', 'file:///Point.java')
    const doc = OpenApiBuilder.build(
      {
        classes: [],
        apis: [
          { method: 'GET', path: '/p', fullPath: '/p', returnType: 'Point', parameters: [] },
        ],
      } as unknown as ParseResult,
      'T10',
    )
    const point = doc.components?.schemas?.Point
    expect(point).toBeDefined()
    expect(point.properties).toEqual({
      x: { type: 'integer' },
      label: { type: 'string' },
    })
  })
})

describe('OpenApiBuilder — multipart parts + cookie params (T12)', () => {
  const buildWith = (parameters: any[]): any =>
    OpenApiBuilder.build(
      { classes: [], apis: [{ method: 'POST', path: '/u', fullPath: '/u', parameters }] } as unknown as ParseResult,
      'T12',
    )

  test('two @RequestPart parts → multipart/form-data with per-part schemas', () => {
    const doc = buildWith([
      { name: 'file', in: 'body', part: true, type: 'MultipartFile' },
      { name: 'meta', in: 'body', part: true, type: 'Meta' },
    ])
    const body = doc.paths['/u'].post.requestBody.content['multipart/form-data'].schema
    expect(body.properties.file).toEqual({ type: 'string', format: 'binary' })
    expect(body.properties.meta).toEqual({ type: 'object' })
    expect(doc.paths['/u'].post.requestBody.content['application/json']).toBeUndefined()
  })

  test('@RequestBody-only op unchanged (JSON)', () => {
    const doc = buildWith([{ name: 'body', in: 'body', type: 'Meta' }])
    expect(doc.paths['/u'].post.requestBody.content['application/json']).toBeDefined()
    expect(doc.paths['/u'].post.requestBody.content['multipart/form-data']).toBeUndefined()
  })

  test('mixed @RequestBody + parts → parts win (multipart), JSON dropped', () => {
    const doc = buildWith([
      { name: 'body', in: 'body', type: 'Meta' },
      { name: 'file', in: 'body', part: true, type: 'MultipartFile' },
    ])
    const content = doc.paths['/u'].post.requestBody.content
    expect(content['multipart/form-data']).toBeDefined()
    expect(content['application/json']).toBeUndefined()
  })

  test('@CookieValue param emits in:cookie', () => {
    const doc = OpenApiBuilder.build(
      {
        classes: [],
        apis: [
          {
            method: 'GET',
            path: '/c',
            fullPath: '/c',
            parameters: [{ name: 'sid', in: 'cookie', type: 'String' }],
          },
        ],
      } as unknown as ParseResult,
      'T12',
    )
    expect(doc.paths['/c'].get.parameters[0]).toMatchObject({ name: 'sid', in: 'cookie' })
  })
})
