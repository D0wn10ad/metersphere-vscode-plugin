import * as vscode from 'vscode';

export interface ParsedApi {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  fullPath: string;
  summary?: string;
  parameters: ParsedParameter[];
  position?: { line: number; column: number };
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

function extractAnnotationValue(content: string, ...keys: string[]): string | null {
  if (!content) return null;
  
  for (const key of keys) {
    const namedPattern = new RegExp(`${key}\\s*=\\s*"([^"]+)"`);
    const match = content.match(namedPattern);
    if (match) return match[1];
  }
  
  const positionalPattern = /"([^"]+)"/;
  const match = content.match(positionalPattern);
  return match ? match[1] : null;
}

function extractPathFromAnnotation(annotationContent: string): string | null {
  return extractAnnotationValue(annotationContent, 'value', 'path');
}

function extractOperationValue(annotationContent: string, key: string): string | null {
  if (!annotationContent) return null;
  
  const pattern = new RegExp(`${key}\\s*=\\s*"([^"]+)"`);
  const match = annotationContent.match(pattern);
  return match ? match[1] : null;
}

const ANNOTATION_PATTERNS = {
  restController: /@RestController(?:\([^)]*\))?/g,
  controller: /@Controller(?:\([^)]*\))?/g,
  requestMapping: /@RequestMapping(?:\s*\(([^)]*)\))?/g,
  getMapping: /@GetMapping(?:\s*\(([^)]*)\))?/g,
  postMapping: /@PostMapping(?:\s*\(([^)]*)\))?/g,
  putMapping: /@PutMapping(?:\s*\(([^)]*)\))?/g,
  deleteMapping: /@DeleteMapping(?:\s*\(([^)]*)\))?/g,
  patchMapping: /@PatchMapping(?:\s*\(([^)]*)\))?/g,
  pathVariable: /@PathVariable(?:\s*\(([^)]*)\))?/g,
  requestParam: /@RequestParam(?:\s*\(([^)]*)\))?/g,
  requestBody: /@RequestBody(?:\([^)]*\))?/g,
  requestHeader: /@RequestHeader(?:\s*\(([^)]*)\))?/g,
  operation: /@Operation(?:\s*\(([^)]*)\))?/g,
  apiOperation: /@ApiOperation(?:\s*\(([^)]*)\))?/g,
  apiOperationSupport: /@ApiOperationSupport(?:\s*\(([^)]*)\))?/g,
  apiResponse: /@ApiResponse(?:\s*\(([^)]*)\))?/g,
};

export class JavaParser {
  static parseSource(code: string, uri: string): ParseResult {
    const result: ParseResult = { classes: [], apis: [] };
    
    const restControllerRegex = /@RestController(?:\([^)]*\))?/;
    const controllerRegex = /@Controller(?:\([^)]*\))?/;
    const restControllerMatch = restControllerRegex.test(code);
    const controllerMatch = controllerRegex.test(code);
    const isRestController = restControllerMatch;
    const isController = controllerMatch || isRestController;
    
    if (!isController) {
      return result;
    }

    const classMatch = code.match(/class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : 'Unknown';

    const requestMappingRegex = /@RequestMapping(?:\s*\(([^)]*)\))?/;
    const requestMappingExec = requestMappingRegex.exec(code);
    const basePath = requestMappingExec && requestMappingExec[1]
      ? extractPathFromAnnotation(requestMappingExec[1]) || ''
      : '';

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
        const annotationContent = match[1] || '';
        const path = extractPathFromAnnotation(annotationContent);
        
        if (!path) continue;
        
        const api: ParsedApi = {
          method,
          path,
          fullPath: basePath + path,
          parameters: [],
          position: { line: 0, column: match.index },
        };

        let methodEnd = -1;
        const annotationEnd = match.index + match[0].length;
        const openBrace = code.indexOf('{', annotationEnd);
        if (openBrace > 0) {
          let braceCount = 0;
          for (let i = openBrace; i < code.length; i++) {
            if (code[i] === '{') braceCount++;
            else if (code[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                methodEnd = i;
                break;
              }
            }
          }
        }
        
        if (methodEnd < 0) {
          const nextAnnotation = code.indexOf('@', match.index + 20);
          methodEnd = nextAnnotation > 0 ? nextAnnotation : code.length;
        }
        
        const methodBodyArea = code.substring(Math.max(0, match.index - 200), methodEnd > 0 ? methodEnd : code.length);
        
        const operationRegex = /@Operation(?:\s*\(([^)]*)\))?/g;
        let opMatch;
        while ((opMatch = operationRegex.exec(code)) !== null) {
          if (opMatch.index < match.index && match.index - opMatch.index < 200) {
            const opContent = opMatch[1] || '';
            const summary = extractOperationValue(opContent, 'summary');
            if (summary) {
              api.summary = summary;
              break;
            }
          }
        }
        // Removed legacy ApiOperation-based naming to enforce: Operation > Javadoc > path

        const methodStart = annotationEnd;
        const pathVariableRegex = /@PathVariable(?:\s*\(([^)]*)\))?/g;
        let paramMatch;
        while ((paramMatch = pathVariableRegex.exec(code)) !== null) {
          if (paramMatch.index >= methodStart && paramMatch.index <= methodEnd) {
            const paramName = extractPathFromAnnotation(paramMatch[1]);
            if (paramName) {
              api.parameters.push({
                name: paramName,
                in: 'path',
              });
            }
          }
        }

        const requestParamRegex = /@RequestParam(?:\s*\(([^)]*)\))?/g;
        while ((paramMatch = requestParamRegex.exec(code)) !== null) {
          if (paramMatch.index >= methodStart && paramMatch.index <= methodEnd) {
            const paramName = extractPathFromAnnotation(paramMatch[1]);
            if (paramName) {
              api.parameters.push({
                name: paramName,
                in: 'query',
              });
            }
          }
        }

        const requestBodyRegex = /@RequestBody/;
        if (requestBodyRegex.test(methodBodyArea)) {
          api.parameters.push({
            name: 'body',
            in: 'body',
          });
        }

        const requestHeaderRegex = /@RequestHeader(?:\s*\(([^)]*)\))?/g;
        let headerMatch;
        while ((headerMatch = requestHeaderRegex.exec(code)) !== null) {
          if (headerMatch.index >= methodStart && headerMatch.index <= methodEnd) {
            const headerName = extractPathFromAnnotation(headerMatch[1]);
            if (headerName) {
              api.parameters.push({
                name: headerName,
                in: 'header',
              });
            }
          }
        }

        parsedClass.apis.push(api);
        result.apis.push(api);
      }
    }

    result.classes.push(parsedClass);
    return result;
  }
  
  static async extractJavadoc(uri: vscode.Uri, position: vscode.Position): Promise<string | null> {
    const { commands, extensions } = require('vscode');
    
    const javaExts = ['redhat.java', 'georgewfraser.vscode-javac'];
    const hasJavaExt = extensions.all.some((ext: vscode.Extension<unknown>) => javaExts.includes(ext.id));
    
    if (!hasJavaExt) {
      return null;
    }

    try {
      const hovers = await commands.executeCommand(
        'vscode.executeHoverProvider',
        uri,
        position
      ) as vscode.Hover[];
      
      if (hovers && hovers[0]?.contents) {
        const contents = hovers[0].contents;
        const md = Array.isArray(contents) ? contents[0] : contents;
        const lines = md.value.split('\n');
        return lines[0] || null;
      }
    } catch {
      // Hover failed, return null
    }
    
    return null;
  }

  static async enhanceWithJavadoc(
    parseResult: ParseResult,
    uri: string
  ): Promise<ParseResult> {
    const { Uri, Position } = require('vscode');
    const docUri = Uri.parse(uri);
    
    for (const api of parseResult.apis) {
      if (api.summary && api.position) {
        const javadoc = await JavaParser.extractJavadoc(docUri, new Position(api.position.line, api.position.column));
        if (javadoc) {
          api.summary = javadoc;
        }
      }
    }
    
    return parseResult;
  }
}
