import { ParseResult, ParsedApi } from './javaParser';

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
    const pathParts = typeof urlRaw === 'string'
      ? urlRaw.split('/').filter(Boolean).map(part => part.replace(/^{(.+)}$/, ':$1'))
      : []

    const variables: Array<{ key: string; value: string }> = [];
    if (hasPathParams && api.parameters) {
      for (const param of (api.parameters as Array<any>).filter(p => p?.in === 'path')) {
        variables.push({ key: param.name || '', value: '' });
      }
    }

    const item: PostmanItem = {
      name: `${api.method} ${api.path || 'unknown'}`,
      request: {
        method: api.method || 'GET',
        header: [],
        url: {
          raw: urlRaw,
          host: ['{{baseUrl}}'],
          path: pathParts,
        },
      },
    };

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
}