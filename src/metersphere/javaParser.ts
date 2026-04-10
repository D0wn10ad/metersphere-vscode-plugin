export interface ParsedApi {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  fullPath: string;
  summary?: string;
  parameters: ParsedParameter[];
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'body' | 'header';
  required?: boolean;
  type?: string;
  description?: string;
}

export interface ParsedClass {
  name: string;
  isRestController: boolean;
  isController: boolean;
  basePath: string;
  apis: ParsedApi[];
}

export interface ParseResult {
  classes: ParsedClass[];
  apis: ParsedApi[];
}

const ANNOTATION_PATTERNS = {
  restController: /@RestController\s*\(\s*\)/g,
  controller: /@Controller\s*\(\s*\)/g,
  requestMapping: /@RequestMapping\s*\(\s*"([^"]+)"\s*\)/g,
  getMapping: /@GetMapping\s*\(\s*"([^"]+)"\s*\)/g,
  postMapping: /@PostMapping\s*\(\s*"([^"]+)"\s*\)/g,
  putMapping: /@PutMapping\s*\(\s*"([^"]+)"\s*\)/g,
  deleteMapping: /@DeleteMapping\s*\(\s*"([^"]+)"\s*\)/g,
  patchMapping: /@PatchMapping\s*\(\s*"([^"]+)"\s*\)/g,
  pathVariable: /@PathVariable\s*\(\s*"([^"]+)"\s*\)/g,
  requestParam: /@RequestParam\s*\(\s*"([^"]+)"\s*\)/g,
  requestBody: /@RequestBody\s*\(\s*\)/g,
  requestHeader: /@RequestHeader\s*\(\s*"([^"]+)"\s*\)/g,
};

export class JavaParser {
  static parseSource(code: string, uri: string): ParseResult {
    const result: ParseResult = { classes: [], apis: [] };
    
    const restControllerMatch = code.match(ANNOTATION_PATTERNS.restController);
    const controllerMatch = code.match(ANNOTATION_PATTERNS.controller);
    const isRestController = restControllerMatch !== null;
    const isController = controllerMatch !== null || isRestController;
    
    if (!isController) {
      return result;
    }

    const classMatch = code.match(/class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : 'Unknown';

    const requestMappingMatch = code.match(ANNOTATION_PATTERNS.requestMapping);
    const basePath = requestMappingMatch ? requestMappingMatch[1] : '';

    const methods = [
      { regex: ANNOTATION_PATTERNS.getMapping, method: 'GET' as const },
      { regex: ANNOTATION_PATTERNS.postMapping, method: 'POST' as const },
      { regex: ANNOTATION_PATTERNS.putMapping, method: 'PUT' as const },
      { regex: ANNOTATION_PATTERNS.deleteMapping, method: 'DELETE' as const },
      { regex: ANNOTATION_PATTERNS.patchMapping, method: 'PATCH' as const },
    ];

    const parsedClass: ParsedClass = {
      name: className,
      isRestController,
      isController,
      basePath,
      apis: [],
    };

    for (const { regex, method } of methods) {
      let match;
      while ((match = regex.exec(code)) !== null) {
        const path = match[1];
        const api: ParsedApi = {
          method,
          path,
          fullPath: basePath + path,
          parameters: [],
        };

        const apiEnd = code.indexOf('}', match.index);
        const methodBody = code.substring(match.index, apiEnd > 0 ? apiEnd : code.length);
        
        let paramMatch;
        while ((paramMatch = ANNOTATION_PATTERNS.pathVariable.exec(methodBody)) !== null) {
          api.parameters.push({
            name: paramMatch[1],
            in: 'path',
          });
        }

        while ((paramMatch = ANNOTATION_PATTERNS.requestParam.exec(methodBody)) !== null) {
          api.parameters.push({
            name: paramMatch[1],
            in: 'query',
          });
        }

        if (ANNOTATION_PATTERNS.requestBody.test(methodBody)) {
          api.parameters.push({
            name: 'body',
            in: 'body',
          });
        }

        parsedClass.apis.push(api);
        result.apis.push(api);
      }
    }

    result.classes.push(parsedClass);
    return result;
  }
}