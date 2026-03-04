import { PostmanCollection, PostmanItem, PostmanRequest, PostmanUrl, PostmanBody, PostmanResponse, PostmanHeader } from '../types';
import { ParsedEndpoint, JavaParser } from './javaParser';

export class Exporter {
  generateCollection(endpoints: ParsedEndpoint[], projectName: string): PostmanCollection {
    const items: PostmanItem[] = endpoints.map(endpoint => this.endpointToItem(endpoint));
    
    return {
      info: {
        name: projectName,
        description: `Exported from VSCode at ${new Date().toISOString()}`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: items
    };
  }
  
  private endpointToItem(endpoint: ParsedEndpoint): PostmanItem {
    // Build URL path
    const pathParts = endpoint.path.split('/').filter(p => p);
    
    const url: PostmanUrl = {
      raw: endpoint.path,
      host: ['{{baseUrl}}'],
      path: pathParts
    };
    
    // Add path variables to URL
    const pathParams = endpoint.parameters.filter(p => p.annotation === 'path');
    if (pathParams.length > 0) {
      url.variable = pathParams.map(p => ({ key: p.name, value: '' }));
      url.path = url.path.map(segment => 
        segment.startsWith('{') ? `:${segment.slice(1, -1)}` : segment
      );
      url.raw = endpoint.path.replace(/{([^}]+)}/g, ':$1');
    }
    
    // Add query parameters
    const queryParams = endpoint.parameters.filter(p => p.annotation === 'query');
    if (queryParams.length > 0) {
      url.query = queryParams.map(p => ({ key: p.name, value: '' }));
    }
    
    const request: PostmanRequest = {
      method: endpoint.method,
      url,
      header: [
        { key: 'Content-Type', value: 'application/json' }
      ]
    };
    
    // Add request body for POST/PUT/PATCH
    if (endpoint.method !== 'GET' && endpoint.requestBody) {
      request.body = {
        mode: 'raw',
        raw: this.generateExampleBody(endpoint.requestBody.type)
      };
    }
    
    const response: PostmanResponse = {
      name: `${endpoint.name} Example`,
      status: 'OK',
      code: 200,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: this.generateExampleBody(endpoint.responseType),
      originalRequest: request
    };
    
    return {
      name: endpoint.name,
      request,
      response: [response]
    };
  }
  
  private generateExampleBody(type: string | undefined): string {
    if (!type || type === 'void') return '{}';
    
    // Simple type mapping to example
    if (type.includes('String')) return '{"key": "value"}';
    if (type.includes('Integer') || type.includes('Long') || type.includes('Int')) return '{"count": 0}';
    if (type.includes('Boolean')) return '{"active": true}';
    if (type.includes('List') || type.includes('Array') || type === '[]') return '[]';
    if (type.includes('Map') || type.includes('Object')) return '{"key": "value"}';
    
    // Default to empty object
    return '{}';
  }
  
  async parseAndExport(code: string, projectName: string): Promise<PostmanCollection> {
    const parser = new JavaParser(code);
    const endpoints = parser.parse();
    return this.generateCollection(endpoints, projectName);
  }
}
