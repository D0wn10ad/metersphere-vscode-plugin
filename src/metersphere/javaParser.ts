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
  returnType?: string;
  responseStatus?: number;
  responseHeaders?: { name: string; description?: string }[];
  extraResponses?: { code: string; description?: string }[];
  secured?: boolean;
  permitAll?: boolean;
  securityScheme?: { name: string; type: string };
  securityRequirement?: string;
  methodName?: string;
  className?: string;
  /** Raw Javadoc `@category` (method-level preferred, class-level fallback); validated by categoryResolver. */
  category?: string;
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'body' | 'header' | 'cookie';
  /** True when the param is a multipart part (@RequestPart), not a JSON body. */
  part?: boolean;
  required?: boolean;
  type?: string;
  description?: string;
  validation?: ValidationConstraint[];
  defaultValue?: string;
}

export interface ParsedClass {
  name: string;
  isRestController: boolean;
  isController: boolean;
  basePath: string;
  apis: ParsedApi[];
  secured?: boolean;
  securityScheme?: { name: string; type: string };
  securityRequirement?: string;
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

/**
 * Join a class-level base path and a method path with the CST engine's
 * joinPath semantics: trailing slashes on the base and leading slashes on the
 * sub are collapsed, and the result always starts with '/'. Keeps the regex
 * fallback engine byte-identical to the CST engine (no `/api//x`).
 */
function joinFullPath(base: string, sub: string): string {
  const b = base.replace(/\/+$/, '');
  const subPath = sub.replace(/^\/+/, '');
  const combined = subPath === '' ? b : `${b}/${subPath}`;
  return combined.startsWith('/') ? combined : `/${combined}`;
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

interface AnnotationHit {
  index: number;
  content: string;
}

/** Collect every match of an annotation regex in ONE pass over the source. */
function collectAnnotationMatches(code: string, pattern: RegExp): AnnotationHit[] {
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const hits: AnnotationHit[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    hits.push({ index: match.index, content: match[1] || '' });
  }
  return hits;
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

// String-literal-aware: parens inside "..." / '...' do not affect depth.
function findMatchingParen(code: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function buildProtectedMask(code: string): Uint8Array {
  const mask = new Uint8Array(code.length);
  const n = code.length;
  let i = 0;
  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && code[i] !== '\n') { mask[i] = 1; i++; }
      continue;
    }
    if (ch === '/' && next === '*') {
      mask[i] = 1; mask[i + 1] = 1; i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { mask[i] = 1; i++; }
      if (i < n) { mask[i] = 1; if (i + 1 < n) mask[i + 1] = 1; i += 2; }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      mask[i] = 1; i++;
      while (i < n) {
        if (code[i] === '\\') { mask[i] = 1; if (i + 1 < n) mask[i + 1] = 1; i += 2; continue; }
        mask[i] = 1;
        if (code[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    i++;
  }
  return mask;
}

interface AnnotationHit {
  index: number;
  content: string;
}

function findAnnotationHits(code: string, name: string, mask: Uint8Array): AnnotationHit[] {
  const hits: AnnotationHit[] = [];
  const regex = new RegExp(`@${name}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(code)) !== null) {
    if (mask[m.index]) continue;
    let content = '';
    let j = m.index + m[0].length;
    while (j < code.length && /\s/.test(code[j])) j++;
    if (code[j] === '(') {
      const close = findMatchingParen(code, j);
      if (close >= 0) content = code.substring(j + 1, close);
    }
    hits.push({ index: m.index, content });
  }
  return hits;
}

function findMethodSignatureStart(code: string, from: number): number {
  let i = from;
  while (i < code.length) {
    while (i < code.length && /\s/.test(code[i])) i++;
    if (code[i] !== '@') break;
    i++;
    while (i < code.length && /[\w.]/.test(code[i])) i++;
    while (i < code.length && /\s/.test(code[i])) i++;
    if (code[i] === '(') {
      const close = findMatchingParen(code, i);
      i = close >= 0 ? close + 1 : code.length;
    }
  }
  return i;
}

function nearestAnnotationValue(
  hits: AnnotationHit[],
  windowStart: number,
  windowEnd: number,
  extract: (content: string) => string | null
): string | null {
  const inWindow = hits.filter(h => h.index >= windowStart && h.index < windowEnd);
  inWindow.sort((a, b) => b.index - a.index);
  for (const hit of inWindow) {
    const value = extract(hit.content);
    if (value) return value;
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

/** Extract the raw `@category <value>` from a Javadoc block, if present. */
function extractJavadocCategoryFromBlock(block: string): string | undefined {
  const m = /@category\s+([A-Za-z0-9_.-]+)/.exec(block);
  return m ? m[1] : undefined;
}

/**
 * Nearest Javadoc `@category` above `anchorIdx` (a mapping-annotation index).
 * The Javadoc must be contiguous with the annotation — no `}` between its end
 * and the anchor — so a previous method's Javadoc is never picked up.
 */
function findMethodJavadocCategory(code: string, anchorIdx: number): string | undefined {
  const windowStart = Math.max(0, anchorIdx - 400);
  const window = code.slice(windowStart, anchorIdx);
  const endIdx = window.lastIndexOf('*/');
  if (endIdx < 0) return undefined;
  const blockStart = window.lastIndexOf('/**', endIdx);
  if (blockStart < 0) return undefined;
  const between = window.slice(endIdx + 2);
  if (between.includes('}')) return undefined; // crossed a method boundary
  return extractJavadocCategoryFromBlock(window.slice(blockStart, endIdx + 2));
}

/** Class-level Javadoc `@category` (contiguous Javadoc immediately before the class declaration). */
function findClassJavadocCategory(code: string, classDeclIdx: number): string | undefined {
  const windowStart = Math.max(0, classDeclIdx - 600);
  const window = code.slice(windowStart, classDeclIdx);
  const endIdx = window.lastIndexOf('*/');
  if (endIdx < 0) return undefined;
  const blockStart = window.lastIndexOf('/**', endIdx);
  if (blockStart < 0) return undefined;
  const between = window.slice(endIdx + 2);
  if (/[};]/.test(between)) return undefined; // crossed a boundary
  return extractJavadocCategoryFromBlock(window.slice(blockStart, endIdx + 2));
}

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
    const classDeclIdx = classMatch?.index;
    const classCategory = typeof classDeclIdx === 'number' && classDeclIdx > 0
      ? findClassJavadocCategory(code, classDeclIdx)
      : undefined;

    // Anchor the class-body boundary to the SAME class declaration used for
    // className — a bare indexOf('class') can land inside a string, a comment,
    // or an earlier helper class, misclassifying method-level annotations.
    const classDeclIndex = classMatch?.index ?? -1;
    const classDeclEnd = classDeclIndex >= 0 ? code.indexOf('{', classDeclIndex) : -1;
    const classBodyStart = classDeclEnd > 0 ? classDeclEnd + 1 : 0;

    // basePath comes ONLY from a class-level @RequestMapping (before the class
    // body brace); a method-level @RequestMapping must never become the basePath.
    const requestMappingRegex = /@RequestMapping(?:\s*\(([^)]*)\))?/;
    const requestMappingExec = requestMappingRegex.exec(code);
    const basePath = requestMappingExec && requestMappingExec[1] && requestMappingExec.index < classBodyStart
      ? extractPathFromAnnotation(requestMappingExec[1]) || ''
      : '';

    const protectedMask = buildProtectedMask(code);
    const operationHits = findAnnotationHits(code, 'Operation', protectedMask);
    const apiOperationHits = findAnnotationHits(code, 'ApiOperation', protectedMask);
    const descriptionHits = findAnnotationHits(code, 'Description', protectedMask);
    const methods = [
      { regex: ANNOTATION_PATTERNS.getMapping, method: 'GET' as const },
      { regex: ANNOTATION_PATTERNS.postMapping, method: 'POST' as const },
      { regex: ANNOTATION_PATTERNS.putMapping, method: 'PUT' as const },
      { regex: ANNOTATION_PATTERNS.deleteMapping, method: 'DELETE' as const },
      { regex: ANNOTATION_PATTERNS.patchMapping, method: 'PATCH' as const },
    ];

    // One pass per annotation kind up front; the per-method loops below walk
    // these arrays instead of rescanning the whole file for every match.

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
        if (protectedMask[match.index]) continue;
        const annotationContent = match[1] || '';
        let path = extractPathFromAnnotation(annotationContent);
        if (!path) path = '';
        
        const api: ParsedApi = {
          method,
          path,
          fullPath: joinFullPath(basePath, path),
          parameters: [],
          position: { line: 0, column: match.index },
          category: findMethodJavadocCategory(code, match.index) ?? classCategory,
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

        // Priority chain: @Operation(summary) > @ApiOperation(value|summary) > @Description > path
        const signatureStart = findMethodSignatureStart(code, annotationEnd);
        const windowStart = Math.max(0, match.index - 200);

        const opSummary = nearestAnnotationValue(
          operationHits, windowStart, signatureStart,
          c => extractOperationValue(c, 'summary')
        );
        if (opSummary) api.summary = opSummary;

        if (!api.summary) {
          const apiOpSummary = nearestAnnotationValue(
            apiOperationHits, windowStart, signatureStart,
            extractSummaryFromApiOperation
          );
          if (apiOpSummary) api.summary = apiOpSummary;
        }

        if (!api.summary) {
          const desc = nearestAnnotationValue(
            descriptionHits, windowStart, signatureStart,
            c => extractAnnotationValue(c, 'value', 'description')
          );
          if (desc) api.summary = desc;
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

        // @RequestBody lives in the parameter list — between the mapping
        // annotation and the method body's opening brace. Scanning past the
        // body brace would bind @RequestBody mentions from comments, strings,
        // or later methods to this API.
        let paramListEnd = methodEnd > 0 ? methodEnd : code.length;
        if (openBrace > 0) {
          paramListEnd = openBrace;
        }
        const requestBodyRegex = /@RequestBody/;
        if (requestBodyRegex.test(code.substring(methodStart, paramListEnd))) {
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
      if (protectedMask[rmMatch.index]) continue;
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
        fullPath: joinFullPath(basePath, path),
        parameters: [],
        position: { line: 0, column: rmMatch.index },
        category: findMethodJavadocCategory(code, rmMatch.index) ?? classCategory,
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

      const signatureStart = findMethodSignatureStart(code, annotationEnd);
      const windowStart = Math.max(0, rmMatch.index - 200);

      const opSummary = nearestAnnotationValue(
        operationHits, windowStart, signatureStart,
        c => extractOperationValue(c, 'summary')
      );
      if (opSummary) api.summary = opSummary;

      if (!api.summary) {
        const apiOpSummary = nearestAnnotationValue(
          apiOperationHits, windowStart, signatureStart,
          extractSummaryFromApiOperation
        );
        if (apiOpSummary) api.summary = apiOpSummary;
      }

      if (!api.summary) api.summary = `${method} ${path || '/'}`;

      parsedClass.apis.push(api);
      result.apis.push(api);
    }

    // Dedupe composed + plain mappings: the same (method, fullPath) pair can
    // be produced by both the shorthand loop and the method-level
    // @RequestMapping loop; keep the first occurrence.
    const seenMappings = new Set<string>();
    const dedupedApis = parsedClass.apis.filter(api => {
      const key = `${api.method} ${api.fullPath}`;
      if (seenMappings.has(key)) return false;
      seenMappings.add(key);
      return true;
    });
    parsedClass.apis = dedupedApis;
    result.apis = dedupedApis;

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
        // Guard the MarkdownString | MarkedString union: MarkedString can be a
        // plain string or {language, value}; only MarkdownString has .value.
        const value = typeof md === 'string' ? md : md?.value;
        const lines = (value ?? '').split('\n');
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
        // ParsedApi.position.line is stored 1-based (T6); VSCode's Position.line is
        // 0-based — forward line - 1 (never below 0), otherwise the hover lands one
        // line too low.
        const pos = new Position(Math.max(0, api.position.line - 1), api.position.column);
        const javadoc = await JavaParser.extractJavadoc(docUri, pos);
        if (javadoc) {
          api.summary = javadoc;
        }
      }
    }
    
    return parseResult;
  }
}
