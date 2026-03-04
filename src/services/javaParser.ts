export interface ParsedEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  name: string;
  description?: string;
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responseType?: string;
}

export interface ParsedParameter {
  name: string;
  type: string;
  annotation: 'path' | 'request' | 'query' | 'unknown';
}

export interface ParsedRequestBody {
  type: string;
  required: boolean;
}

export class JavaParser {
  private code: string;
  
  constructor(code: string) {
    this.code = code;
  }
  
  parse(): ParsedEndpoint[] {
    const endpoints: ParsedEndpoint[] = [];
    
    try {
      // Simple regex-based parsing for common Spring REST annotations
      // Find class-level @RequestMapping or @RestController
      const classMatch = this.code.match(/@(RestController|Controller)\s*(?:\(\s*)?(?:class\s+(\w+))?/);
      if (!classMatch) return endpoints;
      
      // Get base path from class @RequestMapping
      let basePath = '';
      const classRequestMapping = this.code.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
      if (classRequestMapping) {
        basePath = classRequestMapping[1];
      }
      
      // Find all method-level HTTP mappings
      const httpMethods = [
        { annotation: '@GetMapping', method: 'GET' as const },
        { annotation: '@PostMapping', method: 'POST' as const },
        { annotation: '@PutMapping', method: 'PUT' as const },
        { annotation: '@DeleteMapping', method: 'DELETE' as const },
        { annotation: '@PatchMapping', method: 'PATCH' as const },
        { annotation: '@RequestMapping', method: 'GET' as const }
      ];
      
      for (const httpMethod of httpMethods) {
        const methodRegex = new RegExp(
          httpMethod.annotation + '(?:\\s*\\(\\s*(?:value|path)\\s*=\\s*["\']([^"\']+)["\']\\s*)?)\\s*(?:public|private|protected)?\\s+\\w+(?:<[^>]+>)?\\s+(\\w+)\\s*\\(([^)]*)\\)',
          'g'
        );
        
        let match;
        while ((match = methodRegex.exec(this.code)) !== null) {
          const methodPath = match[1] || '';
          const methodName = match[2];
          const paramsStr = match[3] || '';
          
          const endpoint: ParsedEndpoint = {
            path: (basePath + '/' + methodPath).replace(/\/+/g, '/').replace(/\/$/, ''),
            method: httpMethod.method,
            name: methodName,
            parameters: this.parseParameters(paramsStr)
          };
          
          // Check for @RequestBody
          const requestBodyParam = endpoint.parameters.find(p => p.annotation === 'request');
          if (requestBodyParam) {
            endpoint.requestBody = {
              type: requestBodyParam.type,
              required: true
            };
          }
          
          // Try to determine response type from method return type
          const methodDefRegex = new RegExp(
            `(?:public|private|protected)?\\s+\\w+(?:<[^>]+>)?\\s+${methodName}\\s*\\([^)]*\\)\\s*(?:throws\\s+\\w+)?\\s*\\{[^}]*(?:return\\s+([^;]+);)?`,
            'g'
          );
          const methodDefMatch = methodDefRegex.exec(this.code);
          if (methodDefMatch) {
            // Look for return type before method name
            const returnTypeMatch = this.code.match(
              new RegExp(`(public|private|protected)?\\s+(\\w+(?:<[^>]+>)?)\\s+${methodName}\\s*\\(`)
            );
            if (returnTypeMatch) {
              endpoint.responseType = returnTypeMatch[2];
            }
          }
          
          endpoints.push(endpoint);
        }
      }
      
      return endpoints;
    } catch (error) {
      console.error('Java parsing error:', error);
      return [];
    }
  }
  
  private parseParameters(paramsStr: string): ParsedParameter[] {
    const parameters: ParsedParameter[] = [];
    
    if (!paramsStr.trim()) return parameters;
    
    // Split by comma but handle generics
    const params = this.splitParams(paramsStr);
    
    for (const param of params) {
      const paramMatch = param.match(/(?:@(\w+)\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)/);
      if (paramMatch) {
        const annotation = paramMatch[1];
        let paramAnnotation: 'path' | 'request' | 'query' | 'unknown' = 'unknown';
        
        if (annotation === 'PathVariable') paramAnnotation = 'path';
        else if (annotation === 'RequestBody') paramAnnotation = 'request';
        else if (annotation === 'RequestParam') paramAnnotation = 'query';
        
        parameters.push({
          name: paramMatch[3],
          type: paramMatch[2],
          annotation: paramAnnotation
        });
      }
    }
    
    return parameters;
  }
  
  private splitParams(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of paramsStr) {
      if (char === '<') depth++;
      else if (char === '>') depth--;
      else if (char === ',' && depth === 0) {
        params.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    
    if (current.trim()) {
      params.push(current.trim());
    }
    
    return params;
  }
}
