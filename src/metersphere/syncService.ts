import { ParseResult, ParsedApi } from './javaParser';
import { OpenApiBuilder } from './openApiBuilder';
import { applyContextPathToPaths, prependContextPath } from './contextPath';

export interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: Array<{ key: string; value: string }>;
    url: {
      raw: string;
      host: string[];
      path: string[];
      variable?: Array<{ key: string; value: string }>;
    };
    body?: {
      mode: string;
      raw: string;
      options?: {
        raw: { language: string };
      };
    };
  };
}

export interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: string;
  };
  item: PostmanItem[];
}

export class SyncService {
  /**
   * Resolve the collection name for an upload: a non-empty `exportName` from
   * the Sync panel wins; otherwise fall back to the single file's stem or a
   * generic plural name. The name becomes the Postman `info.name`, which the
   * server turns into the target module path.
   */
  static resolveCollectionName(exportName: unknown, files: string[]): string {
    const trimmed = typeof exportName === 'string' ? exportName.trim() : '';
    if (trimmed !== '') {
      return trimmed;
    }
    return files.length === 1
      ? files[0].split(/[/\\]/).pop()?.replace('.java', '') || 'Java API'
      : 'Java APIs';
  }

  static toPostmanCollection(parseResult: ParseResult, name: string): PostmanCollection {
    const collection: PostmanCollection = {
      info: {
        name,
        description: `Exported from Java Spring controllers`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [],
    };

    const apis = parseResult.apis.length > 0
      ? parseResult.apis
      : parseResult.classes.flatMap(c => c.apis);

    for (const api of apis) {
      const item = SyncService.apiToPostmanItem(api);
      collection.item.push(item);
    }

    return collection;
  }

  static apiToPostmanItem(api: ParsedApi): PostmanItem {
    const hasBody = api.parameters?.some(p => p.in === 'body') ?? false;
    const hasPathParams = api.parameters?.some(p => p.in === 'path') ?? false;

    const urlRaw = (api.fullPath as string) || (api.path as string) || '';
    // Server contract: MeterSphere's PostmanDefinitionParser uses url.raw VERBATIM
    // as the imported API path, so raw must stay a pure {param} path — never a
    // full URL with a host prefix. Normalize to guarantee one leading slash.
    const normalizedRaw = urlRaw ? '/' + urlRaw.split('/').filter(Boolean).join('/') : '';
    const pathParts = normalizedRaw
      ? normalizedRaw.split('/').filter(Boolean).map(part => part.replace(/^{(.+)}$/, ':$1'))
      : []

    const variables: Array<{ key: string; value: string }> = [];
    if (hasPathParams && api.parameters) {
      for (const param of (api.parameters as Array<any>).filter(p => p?.in === 'path')) {
        variables.push({ key: param.name || '', value: '' });
      }
    }

    const item: PostmanItem = {
      name: api.summary || `${api.method} ${api.path || 'unknown'}`,
      request: {
        method: api.method || 'GET',
        header: [],
        url: {
          raw: normalizedRaw,
          host: ['{{baseUrl}}'],
          path: pathParts,
        },
      },
    };

    // Propagate header parameters from API metadata into Postman headers
    if (api.parameters && api.parameters.length > 0) {
      const headerParams = (api.parameters as Array<any>).filter(p => p.in === 'header');
      if (headerParams.length > 0) {
        item.request.header = headerParams.map((p: any) => {
          const name = p.name || '';
          return { key: name, value: '' };
        });
      } else {
        item.request.header = [];
      }
    }

    if (variables.length > 0) {
      item.request.url.variable = variables;
    }

    if (hasBody && (api.method === 'POST' || api.method === 'PUT' || api.method === 'PATCH')) {
      item.request.body = {
        mode: 'raw',
        raw: '{}',
        options: {
          raw: { language: 'json' },
        },
      };
    }

    return item;
  }

  static toOpenApiCollection(parseResult: ParseResult, name: string): string {
    const doc = OpenApiBuilder.build(parseResult, name)
    return JSON.stringify(doc, null, 2)
  }

  /**
   * Build the upload plan: one document per target branch.
   * 'both' + placement → two documents (iapi first, then eapi) targeting the
   * SAME module; the iapi copy's paths carry the managed prefix. The branch is
   * expressed in URL shape only — never in module-tree tags.
   */
  static buildUploadPlan(options: {
    parseResult: ParseResult
    name: string
    format: 'swagger2' | 'postman'
    contextPath?: string
    serviceRootPath?: string
    branch: 'eapi' | 'iapi' | 'both' | 'none'
    managedPrefix?: string
  }): Array<{ json: string; filename: string; branch: 'eapi' | 'iapi' | 'none' }> {
    const { parseResult, name, format } = options
    const manualCtx = (options.contextPath ?? '').trim()
    const effectiveCtx = manualCtx || (options.serviceRootPath ?? '')
    const prefix = options.managedPrefix ?? '/managed'
    const joinPrefix = (p: string, ctx: string): string => {
      if (!p) return ctx
      if (!ctx) return p
      return `${p.replace(/\/+$/, '')}/${ctx.replace(/^\/+/, '')}`
    }
    const serialize = (ctx: string): string => {
      if (format === 'swagger2') {
        const doc = JSON.parse(SyncService.toOpenApiCollection(parseResult, name))
        doc.paths = applyContextPathToPaths(doc.paths, ctx)
        return JSON.stringify(doc, null, 2)
      }
      const postmanCollection = SyncService.toPostmanCollection(parseResult, name)
      for (const item of postmanCollection.item) {
        const joined = (item.request.url.path || []).join('/')
        const prefixed = prependContextPath('/' + joined, ctx)
        item.request.url.raw = prefixed
        item.request.url.path = prefixed.split('/').filter(Boolean)
      }
      return JSON.stringify(postmanCollection, null, 2)
    }
    if (options.branch === 'both') {
      return [
        { json: serialize(joinPrefix(prefix, effectiveCtx)), filename: `${name}-iapi.json`, branch: 'iapi' as const },
        { json: serialize(effectiveCtx), filename: `${name}-eapi.json`, branch: 'eapi' as const },
      ]
    }
    if (options.branch === 'iapi') {
      return [{ json: serialize(joinPrefix(prefix, effectiveCtx)), filename: `${name}.json`, branch: 'iapi' as const }]
    }
    return [{ json: serialize(effectiveCtx), filename: `${name}.json`, branch: 'none' as const }]
  }
}
