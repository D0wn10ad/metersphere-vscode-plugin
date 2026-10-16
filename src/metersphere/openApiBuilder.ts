/**
 * OpenAPI 3.0 document builder with a real component-schema pipeline.
 *
 * Body parameters become `{ $ref: '#/components/schemas/<Type>' }` (array-wrapped
 * for collections) when the type resolves through the shared ProjectSymbolIndex;
 * unresolvable DTOs fall back to a plain `{type:'object'}` with no $ref and no
 * apology text. Query/path/header parameters get real primitive schemas derived
 * from their Java type (integer/number/boolean) instead of a blanket string. Every
 * referenced schema is accumulated into `components.schemas` so each `$ref` resolves.
 */

import { ParseResult, ParsedApi, ParsedParameter } from './javaParser'
import { DebugLogger } from './debugLogger'
import { TypeResolver } from './typeResolver'
import { ProjectSymbolIndex, ResolvedDto } from './javaAst/projectSymbolIndex'
import { applyValidation } from './validationSchema'

export interface OpenApiDocument {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, any>>
  components?: { schemas?: Record<string, any>; securitySchemes?: Record<string, any> }
  security?: Record<string, string[]>[]
}

// Module-level shared symbol index: the upload flow registers the parsed files
// into it; build() consumes the SYNC registration/cache paths (build itself is
// sync and its public signature cannot change or await).
let sharedSymbolIndex = new ProjectSymbolIndex()

export function getUploadSymbolIndex(): ProjectSymbolIndex {
  return sharedSymbolIndex
}

export function resetUploadSymbolIndex(): void {
  sharedSymbolIndex = new ProjectSymbolIndex()
}

function joinContextPath(contextPath: string | undefined, path: string): string {
  if (!contextPath) return path
  const prefix = contextPath.replace(/\/+$/, '')
  if (!prefix || prefix === '/') return path
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${prefix}${suffix}`
}

export class OpenApiBuilder {
  static build(
    parseResult: ParseResult,
    title: string,
    version?: string,
    contextPath?: string
  ): OpenApiDocument {
    const paths: Record<string, Record<string, any>> = {}
    const schemas: Record<string, any> = {}
    const operationIdCounts = new Map<string, number>()

    const apis = parseResult.apis.length > 0
      ? parseResult.apis
      : parseResult.classes.flatMap(c => c.apis)

    for (const api of apis) {
      const method = (api.method || 'GET').toLowerCase()
      const path = joinContextPath(contextPath, api.fullPath || api.path || '/')

      const operation: any = {
        summary: api.summary || `${api.method} ${api.path}`,
        parameters: [],
      }
      const baseId = api.methodName || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`
      const seen = operationIdCounts.get(baseId) ?? 0
      operationIdCounts.set(baseId, seen + 1)
      operation.operationId = seen === 0 ? baseId : `${baseId}_${seen + 1}`
      if (api.className) {
        operation.tags = [api.className]
      }

      if (api.parameters) {
        const bodyParams: ParsedParameter[] = []
        for (const param of api.parameters) {
          if (param.in === 'body') {
            bodyParams.push(param)
            continue
          }
          let schema: any = OpenApiBuilder.primitiveSchema(param.type)
            if (param.validation && param.validation.length > 0) {
              schema = applyValidation(schema, param.validation, param.type ?? '')
            }
            const entry: any = {
              name: param.name,
              in: param.in,
              required: param.required ?? (param.in === 'path'),
              schema,
            }
            if (param.description !== undefined) {
              entry.description = param.description
            }
            if (param.defaultValue !== undefined) {
              const t = schema.type
              const numeric = t === 'integer' || t === 'number'
              entry.default =
                numeric && typeof param.defaultValue === 'string' && param.defaultValue.trim() !== ''
                  ? Number(param.defaultValue)
                  : param.defaultValue
            }
            operation.parameters.push(entry)
        }
        if (bodyParams.length > 0) {
          operation.requestBody = OpenApiBuilder.requestBodyFor(bodyParams, schemas)
        }
      }

      if (api.permitAll) {
        operation.security = []
      }
      if (!paths[path]) paths[path] = {}
      paths[path][method] = OpenApiBuilder.withResponses(operation, api, schemas)
    }

    const doc: OpenApiDocument = {
      openapi: '3.0.3',
      info: {
        title,
        version: version || '1.0.0',
      },
      paths,
    }
    const security = OpenApiBuilder.deriveSecurity(parseResult)
    const components: { schemas?: Record<string, any>; securitySchemes?: Record<string, any> } = {}
    if (Object.keys(schemas).length > 0) {
      components.schemas = schemas
    }
    if (security) {
      components.securitySchemes = security.schemes
      doc.security = security.security
    }
    if (Object.keys(components).length > 0) {
      doc.components = components
    }
    return doc
  }

  /** Springdoc scheme types → OpenAPI securityScheme objects (default: bearer JWT). */
  private static schemeObject(scheme: { name: string; type: string }): any {
    if (scheme.type === 'apiKey') {
      return { type: 'apiKey', name: scheme.name, in: 'header' }
    }
    if (scheme.type === 'oauth2') {
      return { type: 'oauth2', flows: {} }
    }
    return { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
  }

  /**
   * Derive document-level security from Spring Security annotations. A springdoc
   * @SecurityScheme/@SecurityRequirement overrides; otherwise any
   * @PreAuthorize/@Secured/@RolesAllowed yields the default bearer-JWT scheme.
   * No annotation anywhere → undefined (no securitySchemes key at all).
   *
   * OpenAPI 3 forbids a security requirement referencing an unregistered scheme,
   * so the requirement key is derived once and every key it can produce is
   * guaranteed to be registered: a @SecurityRequirement(name="X") with no matching
   * @SecurityScheme gets X registered with the default bearer-JWT shape, and a
   * custom scheme whose name differs from the requirement gets both registered.
   */
  private static deriveSecurity(
    parseResult: ParseResult
  ): { schemes: Record<string, any>; security: Record<string, string[]>[] } | undefined {
    const classes = parseResult.classes
    const apis =
      parseResult.apis.length > 0 ? parseResult.apis : classes.flatMap((c) => c.apis)
    const customScheme =
      classes.find((c) => c.securityScheme)?.securityScheme ??
      apis.find((a) => a.securityScheme)?.securityScheme
    const customRequirement =
      classes.find((c) => c.securityRequirement)?.securityRequirement ??
      apis.find((a) => a.securityRequirement)?.securityRequirement
    const anySecured = classes.some((c) => c.secured) || apis.some((a) => a.secured)
    if (!customScheme && !customRequirement && !anySecured) {
      return undefined
    }
    const schemeKey = customScheme?.name || 'bearerAuth'
    const requirementKey = customRequirement ?? schemeKey
    const schemes: Record<string, any> = {}
    if (customScheme) {
      schemes[schemeKey] = OpenApiBuilder.schemeObject(customScheme)
    }
    if (!schemes[requirementKey]) {
      schemes[requirementKey] = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    }
    return {
      schemes,
      security: [{ [requirementKey]: [] }],
    }
  }

  /**
   * Request body from the collected body params: any @RequestPart part makes it
   * multipart/form-data with per-part schemas (parts win — @RequestBody alongside
   * parts is invalid Spring, logged and ignored); otherwise JSON as before.
   */
  private static requestBodyFor(bodyParams: ParsedParameter[], schemas: Record<string, any>): any {
    const parts = bodyParams.filter((p) => p.part)
    if (parts.length === 0) {
      return {
        content: {
          'application/json': { schema: OpenApiBuilder.bodySchema(bodyParams[0].type, schemas) },
        },
      }
    }
    if (parts.length !== bodyParams.length) {
      DebugLogger.log('Sync', 'Method mixes @RequestBody with @RequestPart parts; emitting parts only', {
        ignored: bodyParams.length - parts.length,
      })
    }
    const properties: Record<string, any> = {}
    for (const part of parts) {
      properties[part.name] =
        part.type?.trim() === 'MultipartFile'
          ? { type: 'string', format: 'binary' }
          : OpenApiBuilder.bodySchema(part.type, schemas)
    }
    return {
      content: {
        'multipart/form-data': { schema: { type: 'object', properties } },
      },
    }
  }

  /**
   * Non-collection response wrappers stripped before schema emission. Page/IPage
   * unwrap FULLY to the payload type (no synthetic Page_T composite); collection
   * wrappers (List/Collection) are left for fieldSchema, which array-wraps them.
   */
  private static readonly RESPONSE_WRAPPERS = new Set([
    'Response',
    'Result',
    'R',
    'HttpEntity',
    'ResponseEntity',
    'Optional',
    'Page',
    'IPage',
  ])

  private static unwrapPayload(raw: string | undefined): string | undefined {
    let type = raw?.trim() || ''
    if (!type) {
      return undefined
    }
    for (let i = 0; i < 8; i++) {
      const parsed = TypeResolver.parseGeneric(type)
      if (!parsed || !OpenApiBuilder.RESPONSE_WRAPPERS.has(parsed.head)) {
        break
      }
      type = parsed.args[0]?.trim() || ''
      if (!type) {
        return undefined
      }
    }
    return type || undefined
  }

  /** Attach the success response (status + body + headers) and any @ApiResponse extras. */
  private static withResponses(operation: any, api: ParsedApi, schemas: Record<string, any>): any {
    const successCode = String(api.responseStatus ?? 200)
    const success: any = { description: 'OK' }
    const payload = OpenApiBuilder.unwrapPayload(api.returnType)
    if (payload) {
      success.content = { 'application/json': { schema: OpenApiBuilder.fieldSchema(payload, schemas) } }
    }
    if (api.responseHeaders && api.responseHeaders.length > 0) {
      const headers: Record<string, any> = {}
      for (const h of api.responseHeaders) {
        headers[h.name] = { description: h.description ?? '', schema: { type: 'string' } }
      }
      success.headers = headers
    }
    const responses: Record<string, any> = { [successCode]: success }
    for (const extra of api.extraResponses ?? []) {
      if (!responses[extra.code]) {
        responses[extra.code] = { description: extra.description ?? '' }
      }
    }
    operation.responses = responses
    return operation
  }

  /**
   * Body schema: a `$ref` for resolvable object types (array-wrapped for
   * collections), a plain `{type:'object'}` fallback otherwise.
   */
  private static bodySchema(rawType: string | undefined, schemas: Record<string, any>): any {
    const type = rawType?.trim() || ''
    if (!type) {
      return { type: 'object' }
    }
    return OpenApiBuilder.fieldSchema(type, schemas)
  }

  /**
   * Unified recursive field schema: collections wrap their item schema; known
   * primitives inline; non-primitives emit a `$ref` (accumulating the expanded
   * schema into `components.schemas`) when resolvable, a plain object otherwise.
   * Placing the entry before expanding breaks reference cycles (A→B→A).
   */
  private static fieldSchema(raw: string, schemas: Record<string, any>): any {
    const generic = TypeResolver.parseGeneric(raw)
    if (generic && generic.head === 'Map') {
      const valueType = generic.args[1]
      return {
        type: 'object',
        additionalProperties: valueType ? OpenApiBuilder.fieldSchema(valueType, schemas) : { type: 'object' },
      }
    }
    if (TypeResolver.isCollection(raw)) {
      const item = TypeResolver.extractTypeName(raw) ?? 'string'
      return { type: 'array', items: OpenApiBuilder.fieldSchema(item, schemas) }
    }
    const resolved = TypeResolver.extractTypeName(raw) ?? raw
    const primitive = TypeResolver.primitiveSchemaWithFormat(raw)
    if (primitive) {
      return primitive
    }
    const dto = sharedSymbolIndex.resolveSync(resolved)
    if (dto) {
      if (!schemas[resolved]) {
        schemas[resolved] = OpenApiBuilder.expandedSchema(dto, schemas)
      }
      return { $ref: `#/components/schemas/${resolved}` }
    }
    return { type: 'object' }
  }

  /** Expand a ResolvedDto into `properties` (each field through fieldSchema). */
  private static expandedSchema(dto: ResolvedDto, schemas: Record<string, any>): any {
    if (dto.kind === 'enum') {
      return { type: 'string', enum: dto.values ?? [] }
    }
    const properties: Record<string, any> = {}
    const fields = dto.fields ?? []
    for (const field of fields) {
      properties[field.name] = OpenApiBuilder.fieldSchema(field.javaType, schemas)
    }
    return { type: 'object', properties }
  }

  /** Primitive schema from the Java type — never a blanket string for known primitives. */
  private static primitiveSchema(rawType: string | undefined): any {
    const type = rawType?.trim() || ''
    const schema = TypeResolver.primitiveSchemaWithFormat(type)
    if (schema) {
      return schema
    }
    // Unmapped Java type (e.g. a custom class used as a query param).
    return { type: 'string' }
  }
}
