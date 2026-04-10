import { SyncService, PostmanCollection } from '../src/metersphere/syncService';
import { ParseResult } from '../src/metersphere/javaParser';

describe('SyncService', () => {
  it('should convert parsed APIs to Postman format', () => {
    const parseResult: ParseResult = {
      classes: [{
        name: 'UserController',
        isRestController: true,
        isController: true,
        basePath: '/api',
        apis: [{
          method: 'GET',
          path: '/users',
          fullPath: '/api/users',
          parameters: [],
        }],
      }],
      apis: [{
        method: 'GET',
        path: '/users',
        fullPath: '/api/users',
        parameters: [],
      }],
    };

    const postman = SyncService.toPostmanCollection(parseResult, 'User APIs');
    expect(postman.info.name).toBe('User APIs');
    expect(postman.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
    expect(postman.item).toHaveLength(1);
    expect(postman.item[0].request.method).toBe('GET');
  });

  it('should handle multiple APIs with different methods', () => {
    const parseResult: ParseResult = {
      classes: [{
        name: 'UserController',
        isRestController: true,
        isController: true,
        basePath: '/api',
        apis: [
          { method: 'GET', path: '/users', fullPath: '/api/users', parameters: [] },
          { method: 'POST', path: '/users', fullPath: '/api/users', parameters: [] },
          { method: 'GET', path: '/users/:id', fullPath: '/api/users/:id', parameters: [{ name: 'id', in: 'path', required: true, type: 'Long' }] },
        ],
      }],
      apis: [],
    };

    const postman = SyncService.toPostmanCollection(parseResult, 'User APIs');
    expect(postman.item).toHaveLength(3);
    expect(postman.item[0].request.method).toBe('GET');
    expect(postman.item[1].request.method).toBe('POST');
    expect(postman.item[2].request.method).toBe('GET');
  });

  it('should include URL with path parameters', () => {
    const parseResult: ParseResult = {
      classes: [],
      apis: [
        { method: 'GET', path: '/users/:id', fullPath: '/api/users/:id', parameters: [{ name: 'id', in: 'path', required: true }] },
      ],
    };

    const postman = SyncService.toPostmanCollection(parseResult, 'Test API');
    expect(postman.item[0].request.url.raw).toBe('/api/users/:id');
    expect(postman.item[0].request.url.path).toEqual(['api', 'users', ':id']);
  });

  it('should include request body for POST/PUT', () => {
    const parseResult: ParseResult = {
      classes: [],
      apis: [
        { method: 'POST', path: '/users', fullPath: '/api/users', parameters: [{ name: 'body', in: 'body' }] },
        { method: 'PUT', path: '/users/:id', fullPath: '/api/users/:id', parameters: [{ name: 'id', in: 'path' }, { name: 'body', in: 'body' }] },
      ],
    };

    const postman = SyncService.toPostmanCollection(parseResult, 'Test API');
    expect(postman.item[0].request.body).toBeDefined();
    expect(postman.item[0].request.body!.mode).toBe('raw');
    expect(postman.item[1].request.body).toBeDefined();
  });
});