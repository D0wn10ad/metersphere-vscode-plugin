import { parse } from 'java-ast';
import * as vscode from 'vscode';
import { ParsedApi, ParsedParameter, ParsedClass, ParseResult, ValidationConstraint } from './javaParser';

interface AstNode {
  children?: AstNode[];
  text?: string;
  constructor: { name: string };
}

function getNodeText(node: AstNode): string {
  if (!node.children) return '';
  return node.children.map(c => c.text || '').join('').trim();
}

function extractPath(annotationText: string): string | null {
  if (!annotationText) return null;
  
  const valueMatch = annotationText.match(/value\s*=\s*"([^"]+)"/);
  if (valueMatch) return valueMatch[1];
  
  const pathMatch = annotationText.match(/path\s*=\s*"([^"]+)"/);
  if (pathMatch) return pathMatch[1];
  
  const simpleMatch = annotationText.match(/"([^"]+)"/);
  if (simpleMatch) return simpleMatch[1];
  
  return null;
}

function extractSummary(annotationText: string): string | null {
  if (!annotationText) return null;
  
  const summaryMatch = annotationText.match(/summary\s*=\s*"([^"]+)"/);
  if (summaryMatch) return summaryMatch[1];
  
  const valueMatch = annotationText.match(/value\s*=\s*"([^"]+)"/);
  if (valueMatch) return valueMatch[1];

  const descMatch = annotationText.match(/description\s*=\s*"([^"]+)"/);
  if (descMatch) return descMatch[1];
  
  return null;
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

function extractNumericValue(content: string, key: string): number | null {
  if (!content) return null;
  const pattern = new RegExp(`${key}\\s*=\\s*(\\d+)`);
  const match = content.match(pattern);
  return match ? parseInt(match[1], 10) : null;
}

function extractValidationConstraint(annotationName: string, annotationContent: string): ValidationConstraint | null {
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
      }
    } else if (type === 'Min' || type === 'Max') {
      const numVal = extractNumericValue(annotationContent, 'value');
      if (numVal !== null) value = numVal;
    } else if (type === 'Pattern') {
      const regexp = extractAnnotationValueAny(annotationContent, 'regexp');
      if (regexp) value = regexp;
    }
  }

  return { type, value };
}

function getHttpMethod(annName: string): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | null {
  const map: Record<string, 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'> = {
    'GetMapping': 'GET',
    'PostMapping': 'POST', 
    'PutMapping': 'PUT',
    'DeleteMapping': 'DELETE',
    'PatchMapping': 'PATCH',
    'RequestMapping': 'GET',
  };
  return map[annName] || null;
}

function isRestController(annotations: string[]): boolean {
  return annotations.some(a => a.includes('@RestController'));
}

function isController(annotations: string[]): boolean {
  return annotations.some(a => a.includes('@RestController') || a.includes('@Controller'));
}

function extractAnnotationsAndMethods(code: string): { classAnnotations: string[]; methods: { name: string; annotations: string[] }[] } {
  const classAnnotations: string[] = [];
  const methods: { name: string; annotations: string[] }[] = [];

  const classBodyMatch = code.match(/(?:@\w+(?:\([^)]*\))?\s+)*class\s+\w+/);
  if (!classBodyMatch) {
    return { classAnnotations: [], methods: [] };
  }

  const classStart = classBodyMatch.index || 0;
  const classBodyStart = code.indexOf('{', classStart);
  if (classBodyStart < 0) return { classAnnotations: [], methods: [] };
  const classHeader = code.substring(0, classBodyStart);

  // Extract class-level annotations
  const classAnnRegex = /@(\w+)(?:\(([^)]*)\))?/g;
  let cMatch;
  while ((cMatch = classAnnRegex.exec(classHeader)) !== null) {
    const full = '@' + cMatch[1] + (cMatch[2] ? '(' + cMatch[2] + ')' : '');
    classAnnotations.push(full);
  }

  // Filter to keep relevant annotations
  const filteredClassAnns: string[] = [];
  for (const ann of classAnnotations) {
    const name = ann.replace(/^@(\w+).*/, '$1');
    if (['RestController', 'Controller', 'RequestMapping', 'Api'].includes(name)) {
      filteredClassAnns.push(ann);
    }
  }

  const classBody = code.substring(classBodyStart + 1);

  // Find method annotations and declarations
  const methodRegex = /((?:@\w+(?:\([^)]*\))?\s+)*)(?:public|private|protected|)\s+([\w<>[\]]+)\s+(\w+)\s*\(/g;
  let mMatch;
  while ((mMatch = methodRegex.exec(classBody)) !== null) {
    const annBlock = mMatch[1].trim();
    const returnType = mMatch[2];
    const methodName = mMatch[3];

    if (returnType === 'class' || methodName === 'class') continue;

    const methodAnnotations: string[] = [];
    if (annBlock) {
      const annRegex = /@(\w+)(?:\(([^)]*)\))?/g;
      let aMatch;
      while ((aMatch = annRegex.exec(annBlock)) !== null) {
        const full = '@' + aMatch[1] + (aMatch[2] ? '(' + aMatch[2] + ')' : '');
        methodAnnotations.push(full);
      }
    }

    methods.push({
      name: methodName,
      annotations: methodAnnotations,
    });
  }

  return { classAnnotations: filteredClassAnns, methods };
}

export class JavaParserAst {
  static parseSource(code: string, uri: string): ParseResult {
    const result: ParseResult = { classes: [], apis: [] };
    
    try {
      const { classAnnotations, methods } = extractAnnotationsAndMethods(code);
      
      if (!isController(classAnnotations)) {
        return result;
      }
      
      const classNameMatch = code.match(/class\s+(\w+)/);
      const className = classNameMatch ? classNameMatch[1] : 'Unknown';
      
      let basePath = '';
      for (const ann of classAnnotations) {
        const annName = ann.replace(/^@(\w+).*/, '$1');
        if (annName === 'RequestMapping') {
          basePath = extractPath(ann) || '';
        }
      }
      
      const parsedClass: ParsedClass = {
        name: className,
        isRestController: isRestController(classAnnotations),
        isController: isController(classAnnotations),
        basePath,
        apis: [],
      };
      
      for (const method of methods) {
        let methodAnn = method.annotations.find(a => {
          const name = a.replace(/^@(\w+).*/, '$1');
          return ['GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'PatchMapping', 'RequestMapping'].includes(name);
        });
        if (!methodAnn) continue;

        const annName = methodAnn.replace(/^@(\w+).*/, '$1');
        let httpMethod = getHttpMethod(annName);
        if (!httpMethod) continue;

        // Extract method from @RequestMapping(method = RequestMethod.X)
        if (annName === 'RequestMapping') {
          const methodMatch = methodAnn.match(/method\s*=\s*RequestMethod\.(\w+)/);
          if (methodMatch) {
            const m = methodMatch[1].toUpperCase();
            if (m === 'GET' || m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') {
              httpMethod = m;
            }
          }
        }
        
        let path = extractPath(methodAnn);
        if (!path) path = '';
        
        const api: ParsedApi = {
          method: httpMethod,
          path,
          fullPath: basePath + path,
          parameters: [],
          position: { line: 0, column: 0 },
        };

        // Priority chain: @Operation(summary) > @ApiOperation(value|summary) > @Description > auto
        for (const ann of method.annotations) {
          const name = ann.replace(/^@(\w+).*/, '$1');
          if (name === 'Operation') {
            const summary = extractSummary(ann);
            if (summary) { api.summary = summary; break; }
          }
        }
        if (!api.summary) {
          for (const ann of method.annotations) {
            const name = ann.replace(/^@(\w+).*/, '$1');
            if (name === 'ApiOperation') {
              const summary = extractSummary(ann);
              if (summary) { api.summary = summary; break; }
            }
          }
        }
        if (!api.summary) {
          for (const ann of method.annotations) {
            const name = ann.replace(/^@(\w+).*/, '$1');
            if (name === 'Description') {
              const desc = extractAnnotationValueAny(ann.replace(/^@\w+/, ''), 'value');
              if (desc) { api.summary = desc; break; }
            }
          }
        }
        if (!api.summary) api.summary = `${httpMethod} ${path || '/'}`;
        
        // Find method body for parameter extraction
        const methodIdx = code.indexOf(' ' + method.name + '(');
        const afterStart = methodIdx > 0 ? methodIdx : 0;
        let methodEnd = code.length;
        const mbOpen = code.indexOf('{', afterStart);
        if (mbOpen > 0) {
          let braceCount = 0;
          for (let i = mbOpen; i < code.length; i++) {
            if (code[i] === '{') braceCount++;
            else if (code[i] === '}') {
              braceCount--;
              if (braceCount === 0) { methodEnd = i; break; }
            }
          }
        }
        const methodBody = code.substring(method.annotations.length > 0 ? code.indexOf(method.annotations[0]) : afterStart, methodEnd < code.length ? methodEnd + 1 : code.length);
        
        // @RequestBody
        if (/@RequestBody/.test(methodBody)) {
          api.parameters.push({ name: 'body', in: 'body' });
        }

        const paramAnnRegex = /@(PathVariable|RequestParam|RequestHeader)(?:\s*\(([^)]*)\))?/g;
        let pMatch;
        let pvIdx = 0, rpIdx = 0, hdrIdx = 0;
        while ((pMatch = paramAnnRegex.exec(methodBody)) !== null) {
          const annType = pMatch[1];
          const annContent = pMatch[2] || '';

          let paramName = extractPath(annContent);
          if (!paramName) {
            const sigEnd = methodBody.indexOf(',', pMatch.index);
            const parenEnd = methodBody.indexOf(')', pMatch.index);
            const closestEnd = sigEnd > 0 && parenEnd > 0 ? Math.min(sigEnd, parenEnd) : (sigEnd > 0 ? sigEnd : parenEnd);
            const paramSig = methodBody.substring(pMatch.index, closestEnd > 0 ? closestEnd : pMatch.index + 80);
            const afterAnn = paramSig.replace(/@\w+(?:\([^)]*\))?\s*/g, '').trim();
            const javaParam = afterAnn.match(/(\w+)\s*[,)]?\s*$/);
            paramName = javaParam ? javaParam[1] : `param${rpIdx}`;
          }

          const paramSection = methodBody.substring(pMatch.index, Math.min(pMatch.index + 100, methodBody.length));

          let paramIn: 'path' | 'query' | 'header';
          if (annType === 'PathVariable') { paramIn = 'path'; pvIdx++; }
          else if (annType === 'RequestParam') { paramIn = 'query'; rpIdx++; }
          else { paramIn = 'header'; hdrIdx++; }

          const param: ParsedParameter = {
            name: paramName,
            in: paramIn,
          };

          // Extract required
          if (annContent) {
            const requiredVal = extractAnnotationValueAny(annContent, 'required');
            if (requiredVal !== null) param.required = requiredVal === 'true';
          }

          // @ApiParam / @Parameter description
          const apiParamMatch = paramSection.match(/@ApiParam\s*\(([^)]*)\)/);
          if (apiParamMatch) {
            const desc = extractAnnotationValueAny(apiParamMatch[1], 'value');
            if (desc) param.description = desc;
          }
          const paramAnnMatch = paramSection.match(/@Parameter\s*\(([^)]*)\)/);
          if (paramAnnMatch) {
            const desc = extractAnnotationValueAny(paramAnnMatch[1], 'description');
            if (desc) param.description = desc;
          }

          // JSR303 validation
          const validationTypes = ['NotNull', 'NotEmpty', 'NotBlank', 'Size', 'Min', 'Max', 'Email', 'Pattern'];
          for (const vType of validationTypes) {
            const vRegex = new RegExp(`@${vType}(?:\\(([^)]*)\\))?`);
            const vMatch = paramSection.match(vRegex);
            if (vMatch) {
              const constraint = extractValidationConstraint(`@${vType}`, vMatch[1] || '');
              if (constraint) {
                if (!param.validation) param.validation = [];
                param.validation.push(constraint);
              }
            }
          }

          api.parameters.push(param);
        }
        
        parsedClass.apis.push(api);
        result.apis.push(api);
      }
      
      result.classes.push(parsedClass);
      
    } catch (error) {
      console.error('java-ast parsing error:', error);
    }
    
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
      // Hover failed
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
      const autoGenerated = `${api.method} ${api.path || '/'}`;
      if (api.summary === autoGenerated) {
        const javadoc = await JavaParserAst.extractJavadoc(docUri, new Position(api.position.line, api.position.column));
        if (javadoc) {
          api.summary = javadoc;
        }
      }
    }
    
    return parseResult;
  }
}
