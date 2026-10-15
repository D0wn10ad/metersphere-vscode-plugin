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

import { ParseResult } from './javaParser'
import { TypeResolver } from './typeResolver'
import { SchemaGenerator } from './schemaGenerator'
import { ProjectSymbolIndex, ResolvedDto } from './javaAst/projectSymbolIndex'

export interface OpenApiDocument {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, any>>
  components?: { schemas: Record<string, any> }
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

export class OpenApiBuilder {
  static build(parseResult: ParseResult, title: string, version?: string): OpenApiDocument {
    const paths: Record<string, Record<string, any>> = {}
    const schemas: Record<string, any> = {}

    const apis = parseResult.apis.length > 0
      ? parseResult.apis
      : parseResult.classes.flatMap(c => c.apis)

    for (const api of apis) {
      const method = (api.method || 'GET').toLowerCase()
      const path = api.fullPath || api.path || '/'

      const operation: any = {
        summary: api.summary || `${api.method} ${api.path}`,
        parameters: [],
        responses: {
          '200': { description: 'OK' },
        },
      }

      if (api.parameters) {
        for (const param of api.parameters) {
          if (param.in === 'body') {
            operation.requestBody = {
              content: {
                'application/json': { schema: OpenApiBuilder.bodySchema(param.type, schemas) },
              },
            }
          } else {
            operation.parameters.push({
              name: param.name,
              in: param.in,
              required: param.required ?? (param.in === 'path'),
              schema: OpenApiBuilder.primitiveSchema(param.type),
            })
          }
        }
      }

      if (!paths[path]) paths[path] = {}
      paths[path][method] = operation
    }

    const doc: OpenApiDocument = {
      openapi: '3.0.3',
      info: {
        title,
        version: version || '1.0.0',
      },
      paths,
    }
    if (Object.keys(schemas).length > 0) {
      doc.components = { schemas }
    }
    return doc
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
    const properties: Record<string, any> = {}
    for (const field of dto.fields) {
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
