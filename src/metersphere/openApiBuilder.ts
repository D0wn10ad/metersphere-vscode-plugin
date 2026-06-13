import { ParseResult } from './javaParser'

export interface OpenApiDocument {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, any>>
  components?: { schemas: Record<string, any> }
}

export class OpenApiBuilder {
  static build(parseResult: ParseResult, title: string, version?: string): OpenApiDocument {
    const paths: Record<string, Record<string, any>> = {}

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
                'application/json': { schema: { type: 'object' } },
              },
            }
          } else {
            operation.parameters.push({
              name: param.name,
              in: param.in,
              required: param.required ?? (param.in === 'path'),
              schema: { type: 'string' },
            })
          }
        }
      }

      if (!paths[path]) paths[path] = {}
      paths[path][method] = operation
    }

    return {
      openapi: '3.0.3',
      info: {
        title,
        version: version || '1.0.0',
      },
      paths,
    }
  }
}
