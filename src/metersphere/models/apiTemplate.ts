import { NavigatorNode } from './navigatorNode'

export enum Method {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

export interface ApiTemplateOptions {
  name: string
  method: Method | string
  url: string
  path?: string
  moduleId?: string
  projectId?: string
  headers?: Record<string, string>
  body?: unknown
  description?: string
}

export interface WebviewPayload {
  command: 'prefill'
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
  description?: string
}

export class ApiTemplate {
  public readonly name: string
  public readonly method: string
  public readonly url: string
  public readonly path?: string
  public readonly moduleId?: string
  public readonly projectId?: string
  public headers: Record<string, string>
  public body?: unknown
  public description?: string

  constructor(options: ApiTemplateOptions) {
    this.name = options.name
    this.method = typeof options.method === 'string' ? options.method.toUpperCase() : options.method
    this.url = options.url
    this.path = options.path
    this.moduleId = options.moduleId
    this.projectId = options.projectId
    this.headers = options.headers ?? {}
    this.body = options.body
    this.description = options.description
  }

  toWebviewPayload(): WebviewPayload {
    return {
      command: 'prefill',
      name: this.name,
      method: this.method,
      url: this.url,
      headers: this.headers,
      body: this.body,
      description: this.description,
    }
  }

  static fromNavigatorNode(node: NavigatorNode, baseUrl: string): ApiTemplate {
    return new ApiTemplate({
      name: node.name,
      method: Method.GET,
      url: baseUrl + (node.tooltip ?? ''),
    })
  }
}