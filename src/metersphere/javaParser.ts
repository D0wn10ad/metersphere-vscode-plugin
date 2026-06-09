import * as vscode from 'vscode';

export interface ValidationConstraint {
  type: string;
  value?: string | number;
  message?: string;
}

export interface ParsedApi {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  fullPath: string;
  summary?: string;
  description?: string;
  parameters: ParsedParameter[];
  position?: { line: number; column: number };
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'body' | 'header';
  required?: boolean;
  type?: string;
  description?: string;
  validation?: ValidationConstraint[];
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

function extractSummaryFromApiOperation(annotationContent: string): string | null {
  if (!annotationContent) return null;
  return extractOperationValue(annotationContent, 'value') ||
         extractOperationValue(annotationContent, 'summary');
}

function extractDescription(annotationContent: string): string | null {
  if (!annotationContent) return null;
  return extractOperationValue(annotationContent, 'value') ||
         extractOperationValue(annotationContent, 'description');
}

function extractNumericValue(content: string, key: string): number | null {
  if (!content) return null;
  const pattern = new RegExp(`${key}\\s*=\\s*(\\d+)`);
  const match = content.match(pattern);
  return match ? parseInt(match[1], 10) : null;
}

function extractAnnotationValueAny(content: string, ...keys: string[]): string | null {
  if (!content) return null;
  for (const key of keys) {
    const namedPattern = new RegExp(`${key}\\s*=\\s*"([^"]+)"`);
    const match = content.match(namedPattern);
    if (match) return match[1];
  }
  return null;
}

function extractValidationConstraints(annotationName: string, annotationContent: string): ValidationConstraint | null {
  if (!annotationName) return null;
  const type = annotationName.replace('@', '');
  let value: string | number | undefined;

  if (annotationContent) {
    if (type === 'Size') {
      const minVal = extractNumericValue(annotationContent, 'min');
      const maxVal = extractNumericValue(annotationContent, 'max');
      if (minVal !== null || maxVal !== null) {
        value = minVal !== null && maxVal !== null ? `${minVal}-${maxVal}` :
                minVal !== null ? `${minVal}+` : `0-${maxVal}`;
      } else {
        const msg = extractAnnotationValueAny(annotationContent, 'message');
        if (msg) value = msg;
      }
    } else if (type === 'Min' || type === 'Max') {
      const numVal = extractNumericValue(annotationContent, 'value');
      if (numVal !== null) {
        value = numVal;
      } else {
        const msg = extractAnnotationValueAny(annotationContent, 'message');
        if (msg) value = msg;
      }
    } else if (type === 'Pattern') {
      const regexp = extractAnnotationValueAny(annotationContent, 'regexp');
      if (regexp) value = regexp;
    }
  }

  let message: string | undefined;
  if (annotationContent) {
    const msgVal = extractAnnotationValueAny(annotationContent, 'message');
    if (msgVal) message = msgVal;
  }

  return { type, value, message };
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
  apiResponses: /@ApiResponses(?:\s*\(([^)]*)\))?/g,
  apiResponse: /@ApiResponse(?:\s*\(([^)]*)\))?/g,
  api: /@Api(?:\s*\(([^)]*)\))?/g,
  apiModel: /@ApiModel(?:\s*\(([^)]*)\))?/g,
  apiModelProperty: /@ApiModelProperty(?:\s*\(([^)]*)\))?/g,
  apiParam: /@ApiParam(?:\s*\(([^)]*)\))?/g,
  parameter: /@Parameter(?:\s*\(([^)]*)\))?/g,
  schema: /@Schema(?:\s*\(([^)]*)\))?/g,
  description: /@Description(?:\s*\(([^)]*)\))?/g,
  notNull: /@NotNull(?:\([^)]*\))?/g,
  notEmpty: /@NotEmpty(?:\([^)]*\))?/g,
  notBlank: /@NotBlank(?:\([^)]*\))?/g,
  size: /@Size(?:\s*\(([^)]*)\))?/g,
  min: /@Min(?:\s*\(([^)]*)\))?/g,
  max: /@Max(?:\s*\(([^)]*)\))?/g,
  email: /@Email(?:\([^)]*\))?/g,
  pattern: /@Pattern(?:\s*\(([^)]*)\))?/g,
  valid: /@Valid(?:\([^)]*\))?/g,
  validated: /@Validated(?:\([^)]*\))?/g,
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

    // Find class body opening brace to distinguish class-level vs method-level annotations
    const classDeclEnd = code.indexOf('{', code.indexOf('class'));
    const classBodyStart = classDeclEnd > 0 ? classDeclEnd + 1 : 0;

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
        let path = extractPathFromAnnotation(annotationContent);
        if (!path) path = '';
        
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

        // Priority chain: @Operation(summary) > @ApiOperation(value|summary) > path
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

        if (!api.summary) {
          const apiOpRegex = /@ApiOperation(?:\s*\(([^)]*)\))?/g;
          let apiOpMatch;
          while ((apiOpMatch = apiOpRegex.exec(code)) !== null) {
            if (apiOpMatch.index < match.index && match.index - apiOpMatch.index < 200) {
              const apiOpContent = apiOpMatch[1] || '';
              const summary = extractSummaryFromApiOperation(apiOpContent);
              if (summary) {
                api.summary = summary;
                break;
              }
            }
          }
        }

        // @Description fallback (swagger-core)
        if (!api.summary) {
          const descRegex = /@Description(?:\s*\(([^)]*)\))?/g;
          let descMatch;
          while ((descMatch = descRegex.exec(code)) !== null) {
            if (descMatch.index < match.index && match.index - descMatch.index < 200) {
              const descContent = descMatch[1] || '';
              const desc = extractDescription(descContent);
              if (desc) {
                api.summary = desc;
                break;
              }
            }
          }
        }

        if (!api.summary) {
          api.summary = `${method} ${path || '/'}`;
        }

        const methodStart = annotationEnd;

        // Helper: extract full parameter section (all annotations + type + name) before a comma or closing paren
        function getFullParamSection(source: string, annIndex: number): string {
          let start = Math.max(0, annIndex - 200);
          let bdepth = 0;
          for (let i = annIndex - 1; i >= Math.max(0, annIndex - 200); i--) {
            if (source[i] === ')') {
              bdepth++;
            } else if (source[i] === '(') {
              if (bdepth > 0) {
                bdepth--;
              } else {
                start = i + 1;
                for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
                  if (source[j] === '@') {
                    start = j;
                    break;
                  }
                }
                break;
              }
            } else if (source[i] === ',' && bdepth === 0) {
              start = i + 1;
              break;
            }
          }
          let end = Math.min(annIndex + 150, source.length);
          let depth = 0;
          for (let i = annIndex; i < source.length; i++) {
            if (source[i] === '(') depth++;
            else if (source[i] === ')') {
              if (depth === 0) {
                end = i;
                break;
              }
              depth--;
            } else if (source[i] === ',' && depth === 0) {
              end = i;
              break;
            }
          }
          return source.substring(start, Math.min(end, source.length));
        }

        // Extract annotations and param name from a full parameter section
        function extractAnnotationsFromParamSection(fullSection: string): {
          description?: string;
          validation?: ValidationConstraint[];
          paramName: string;
        } {
          let description: string | undefined;
          const validation: ValidationConstraint[] = [];
          let paramName = '';

          // Try @ApiParam (positional args like @ApiParam("desc") are common)
          const apiParamMatch = fullSection.match(/@ApiParam\s*\(([^)]*)\)/);
          if (apiParamMatch) {
            const desc = extractAnnotationValueAny(apiParamMatch[1], 'value') ||
                         extractAnnotationValue(apiParamMatch[1], 'value');
            if (desc) description = desc;
          }

          // Try @Parameter (OpenAPI 3.0)
          const paramAnnMatch = fullSection.match(/@Parameter\s*\(([^)]*)\)/);
          if (paramAnnMatch) {
            const desc = extractAnnotationValueAny(paramAnnMatch[1], 'description');
            if (!description && desc) description = desc;
          }

          // JSR303 validation
          const validationTypes = ['NotNull', 'NotEmpty', 'NotBlank', 'Size', 'Min', 'Max', 'Email', 'Pattern'];
          for (const vType of validationTypes) {
            const vRegex = new RegExp(`@${vType}(?:\\(([^)]*)\\))?`);
            const vMatch = fullSection.match(vRegex);
            if (vMatch) {
              const constraint = extractValidationConstraints(`@${vType}`, vMatch[1] || '');
              if (constraint) validation.push(constraint);
            }
          }

          // Extract Java parameter name: the last identifier before comma or closing paren
          const clean = fullSection.replace(/@\w+(?:\([^)]*\))?\s*/g, '').trim();
          const nameMatch = clean.match(/(\w+)\s*$/);
          if (nameMatch) paramName = nameMatch[1];

          return { description, validation, paramName };
        }

        function extractBooleanValue(content: string, key: string): boolean | null {
          if (!content) return null;
          const qPattern = new RegExp(`${key}\\s*=\\s*"([^"]+)"`);
          const qMatch = content.match(qPattern);
          if (qMatch) return qMatch[1] === 'true';
          const uqPattern = new RegExp(`${key}\\s*=\\s*(\\w+)`);
          const uqMatch = content.match(uqPattern);
          if (uqMatch) return uqMatch[1] === 'true';
          return null;
        }

        function extractParamNameFromAnnotation(annContent: string): string | null {
          if (!annContent) return null;
          const named = extractAnnotationValueAny(annContent, 'value', 'name');
          if (named) return named;
          // Positional: "name" (first quoted string)
          const positional = annContent.match(/"([^"]+)"/);
          return positional ? positional[1] : null;
        }

        // @RequestBody
        const requestBodyRegex = /@RequestBody/;
        if (requestBodyRegex.test(code.substring(methodStart, methodEnd > 0 ? methodEnd : code.length))) {
          api.parameters.push({
            name: 'body',
            in: 'body',
          });
        }

        // @PathVariable
        const pathVariableRegex = /@PathVariable(?:\s*\(([^)]*)\))?/g;
        let paramMatch;
        while ((paramMatch = pathVariableRegex.exec(code)) !== null) {
          if (paramMatch.index >= methodStart && paramMatch.index <= methodEnd) {
            const fullSection = getFullParamSection(code, paramMatch.index);
            const annInfo = extractAnnotationsFromParamSection(fullSection);

            let paramName = extractParamNameFromAnnotation(paramMatch[1] || '') || annInfo.paramName || 'path';
            const param: ParsedParameter = {
              name: paramName,
              in: 'path',
              required: true,
            };

            if (annInfo.description) param.description = annInfo.description;
            if (annInfo.validation && annInfo.validation.length > 0) param.validation = annInfo.validation;

            api.parameters.push(param);
          }
        }

        // @RequestParam
        const requestParamRegex = /@RequestParam(?:\s*\(([^)]*)\))?/g;
        while ((paramMatch = requestParamRegex.exec(code)) !== null) {
          if (paramMatch.index >= methodStart && paramMatch.index <= methodEnd) {
            const fullSection = getFullParamSection(code, paramMatch.index);
            const annInfo = extractAnnotationsFromParamSection(fullSection);

            let paramName = extractParamNameFromAnnotation(paramMatch[1] || '') || annInfo.paramName || 'param';
            const param: ParsedParameter = {
              name: paramName,
              in: 'query',
            };

            if (paramMatch[1]) {
              const requiredVal = extractBooleanValue(paramMatch[1], 'required');
              if (requiredVal !== null) param.required = requiredVal;
            }

            if (annInfo.description) param.description = annInfo.description;
            if (annInfo.validation && annInfo.validation.length > 0) param.validation = annInfo.validation;

            api.parameters.push(param);
          }
        }

        // @RequestHeader
        const requestHeaderRegex = /@RequestHeader(?:\s*\(([^)]*)\))?/g;
        let headerMatch;
        while ((headerMatch = requestHeaderRegex.exec(code)) !== null) {
          if (headerMatch.index >= methodStart && headerMatch.index <= methodEnd) {
            const fullSection = getFullParamSection(code, headerMatch.index);
            const annInfo = extractAnnotationsFromParamSection(fullSection);

            let headerName = extractParamNameFromAnnotation(headerMatch[1] || '') || annInfo.paramName || 'header';
            const param: ParsedParameter = {
              name: headerName,
              in: 'header',
            };

            if (headerMatch[1]) {
              const requiredVal = extractBooleanValue(headerMatch[1], 'required');
              if (requiredVal !== null) param.required = requiredVal;
            }

            api.parameters.push(param);
          }
        }

        parsedClass.apis.push(api);
        result.apis.push(api);
      }
    }

    // Handle method-level @RequestMapping (only inside class body to distinguish from class-level)
    let rmMatch;
    const requestMappingMethodRegex = new RegExp(ANNOTATION_PATTERNS.requestMapping.source, 'g');
    while ((rmMatch = requestMappingMethodRegex.exec(code)) !== null) {
      if (rmMatch.index < classBodyStart) continue;
      const rmContent = rmMatch[1] || '';
      let path = extractPathFromAnnotation(rmContent);
      if (!path) path = '';

      // Extract explicit method from @RequestMapping(method = RequestMethod.X)
      let method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET';
      const methodMatch = rmContent.match(/method\s*=\s*RequestMethod\.(\w+)/);
      if (methodMatch) {
        const m = methodMatch[1].toUpperCase();
        if (m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') {
          method = m;
        }
      }

      const api: ParsedApi = {
        method,
        path,
        fullPath: basePath + path,
        parameters: [],
        position: { line: 0, column: rmMatch.index },
      };

      const annotationEnd = rmMatch.index + rmMatch[0].length;
      let methodEnd = -1;
      const openBrace = code.indexOf('{', annotationEnd);
      if (openBrace > 0) {
        let braceCount = 0;
        for (let i = openBrace; i < code.length; i++) {
          if (code[i] === '{') braceCount++;
          else if (code[i] === '}') {
            braceCount--;
            if (braceCount === 0) { methodEnd = i; break; }
          }
        }
      }
      if (methodEnd < 0) {
        const nextAnnotation = code.indexOf('@', rmMatch.index + 20);
        methodEnd = nextAnnotation > 0 ? nextAnnotation : code.length;
      }

      const methodBodyArea = code.substring(Math.max(0, rmMatch.index - 200), methodEnd > 0 ? methodEnd : code.length);

      const operationRegex = /@Operation(?:\s*\(([^)]*)\))?/g;
      let opMatch;
      while ((opMatch = operationRegex.exec(code)) !== null) {
        if (opMatch.index < rmMatch.index && rmMatch.index - opMatch.index < 200) {
          const opContent = opMatch[1] || '';
          const summary = extractOperationValue(opContent, 'summary');
          if (summary) { api.summary = summary; break; }
        }
      }

      if (!api.summary) {
        const apiOpRegex = /@ApiOperation(?:\s*\(([^)]*)\))?/g;
        let apiOpMatch;
        while ((apiOpMatch = apiOpRegex.exec(code)) !== null) {
          if (apiOpMatch.index < rmMatch.index && rmMatch.index - apiOpMatch.index < 200) {
            const summary = extractSummaryFromApiOperation(apiOpMatch[1] || '');
            if (summary) { api.summary = summary; break; }
          }
        }
      }

      if (!api.summary) api.summary = `${method} ${path || '/'}`;

      parsedClass.apis.push(api);
      result.apis.push(api);
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
      if (!api.position) continue;

      // Only override auto-generated summaries with javadoc
      const autoGenerated = `${api.method} ${api.path || '/'}`;
      if (api.summary === autoGenerated) {
        const javadoc = await JavaParser.extractJavadoc(docUri, new Position(api.position.line, api.position.column));
        if (javadoc) {
          api.summary = javadoc;
        }
      }
    }
    
    return parseResult;
  }
}
