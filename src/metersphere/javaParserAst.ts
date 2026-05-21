import { parse } from 'java-ast';
import * as vscode from 'vscode';
import { ParsedApi, ParsedParameter, ParsedClass, ParseResult } from './javaParser';

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
  
  const descMatch = annotationText.match(/description\s*=\s*"([^"]+)"/);
  if (descMatch) return descMatch[1];
  
  return null;
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
  
  const classDeclMatch = code.match(/@RestController|@Controller/);
  if (!classDeclMatch) {
    return { classAnnotations: [], methods: [] };
  }
  
  const classStart = code.indexOf(classDeclMatch[0]);
  const classBodyStart = code.indexOf('{', classStart);
  const classBodyEnd = code.indexOf('}', classBodyStart);
  const classHeader = code.substring(0, classBodyStart);
  const classBody = code.substring(classBodyStart + 1, classBodyEnd);
  
  const classAnns = classHeader.match(/@\w+[^@\n]*$/gm) || [];
  for (const ann of classAnns) {
    const trimmed = ann.trim().replace(/\n/g, ' ').trim();
    if (trimmed.startsWith('@')) {
      classAnnotations.push(trimmed.split(/\s+/)[0]);
    }
  }
  
  // Keep only @Controller and @RequestMapping for class level
  const filteredClassAnns: string[] = [];
  for (const ann of classAnnotations) {
    if (ann.includes('@RestController') || ann.includes('@Controller') || ann.includes('@RequestMapping')) {
      filteredClassAnns.push(ann);
    }
  }
  
  const methodPattern = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)([^)]*\))?\s+(?:public|private|protected)\s+[\w<>]+\s+(\w+)\s*\(/g;
  
  for (const match of classBody.matchAll(methodPattern)) {
    const methodAnnotation = '@' + match[1] + (match[2] ? match[2] : '');
    const methodName = match[3];
    
    methods.push({
      name: methodName,
      annotations: methodAnnotation ? [methodAnnotation] : []
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
        const allMethodAnnotations = [...classAnnotations.filter(a => a.includes('@RequestMapping')), method.annotations[0]].filter(Boolean);
        
        for (const methodAnn of allMethodAnnotations) {
          const annName = methodAnn.replace(/^@(\w+).*/, '$1');
          
          const httpMethod = getHttpMethod(annName);
          if (!httpMethod) continue;
          
          const path = extractPath(methodAnn);
          if (!path) continue;
          
          const api: ParsedApi = {
            method: httpMethod,
            path,
            fullPath: basePath + path,
            parameters: [],
            position: { line: 0, column: 0 },
          };
          
          for (const prevAnn of method.annotations) {
            if (prevAnn === methodAnn) break;
            const prevAnnName = prevAnn.replace(/^@(\w+).*/, '$1');
            if (prevAnnName === 'Operation' || prevAnnName === 'ApiOperation') {
              const summary = extractSummary(prevAnn);
              if (summary) {
                api.summary = summary;
                break;
              }
            }
          }
          
          const afterAnn = code.indexOf(methodAnn);
          const nextMethod = code.indexOf('public ', afterAnn + methodAnn.length);
          const nextAnnIdx = code.indexOf('@', afterAnn + methodAnn.length);
          const methodEnd = Math.min(
            nextMethod > 0 && nextMethod < 500 ? nextMethod : 999999,
            nextAnnIdx > 0 && nextAnnIdx < 500 ? nextAnnIdx : 999999
          );
          const methodBody = code.substring(afterAnn, methodEnd < code.length ? methodEnd : code.length);
          
          const pvRegex = /@PathVariable(?:\s*\(([^)]*)\))?/g;
          let pvMatch;
          while ((pvMatch = pvRegex.exec(methodBody)) !== null) {
            const paramName = extractPath(pvMatch[1]);
            if (paramName) {
              api.parameters.push({ name: paramName, in: 'path' });
            }
          }
          
          const rpRegex = /@RequestParam(?:\s*\(([^)]*)\))?/g;
          let rpMatch;
          while ((rpMatch = rpRegex.exec(methodBody)) !== null) {
            const paramName = extractPath(rpMatch[1]);
            if (paramName) {
              api.parameters.push({ name: paramName, in: 'query' });
            }
          }
          
          if (/@RequestBody/.test(methodBody)) {
            api.parameters.push({ name: 'body', in: 'body' });
          }

          // Extract @RequestHeader parameters
          const requestHeaderRegex = /@RequestHeader(?:\s*\(([^)]*)\))?/g;
          let headerMatch;
          while ((headerMatch = requestHeaderRegex.exec(methodBody)) !== null) {
            const headerName = extractPath(headerMatch[1]);
            if (headerName) {
              api.parameters.push({ name: headerName, in: 'header' });
            }
          }
          
          parsedClass.apis.push(api);
          result.apis.push(api);
          break;
        }
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
      if (api.summary && api.position) {
        const javadoc = await JavaParserAst.extractJavadoc(docUri, new Position(api.position.line, api.position.column));
        if (javadoc) {
          api.summary = javadoc;
        }
      }
    }
    
    return parseResult;
  }
}
