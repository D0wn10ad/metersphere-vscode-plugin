/**
 * CST-based Java parser: class and endpoint extraction over the java-parser
 * (Chevrotain) concrete syntax tree.
 *
 * This is the CST port of `JavaParser.parseSource` (regex-based). It walks real
 * annotation NODES (never substring tests), reads each class's OWN annotation list
 * (never a file-wide first-@RequestMapping scan), and emits the SAME public
 * `ParseResult` shape as `../javaParser`. Parameters are T7's job — this module
 * deliberately emits `parameters: []`.
 *
 * CST shapes relied on (verified against java-parser 3.0.1):
 * - `ordinaryCompilationUnit.children.typeDeclaration[]` — top-level types only
 *   (inner classes are `classDeclaration` under `classMemberDeclaration`, NOT
 *   `typeDeclaration`, so the recursive walk cannot double-count them).
 * - `classDeclaration.children` = `['classModifier', 'normalClassDeclaration']` —
 *   ALL class modifiers (annotations AND keywords like `Public`) live under
 *   `classModifier`; each entry is either `{annotation: [...]}` or `{Public: [...]}`.
 * - `normalClassDeclaration.children` = `['Class', 'typeIdentifier', 'classBody']` —
 *   the class NAME is under `typeIdentifier` (not `Identifier`).
 * - `methodDeclaration.children` = `['methodModifier', 'methodHeader', 'methodBody']`.
 */

import { ParsedApi, ParsedClass, ParseResult } from '../javaParser';
import { loadJavaParser } from './loadJavaParser';
import { CstNode, CstToken, findAll, findFirst, locationOf, text } from './cstWalk';
import { AnnotationResult, AnnotationValue, firstString, readAnnotation } from './annotationReader';
import { parseParameters } from './cstParamParser';
import { buildJavadocIndex, JavadocIndex } from './javadocIndex';

/** HTTP verbs representable in `ParsedApi.method` (HEAD/OPTIONS collapse to GET). */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Specific Spring mapping annotations and the verb each implies. */
const MAPPING_VERBS: Record<string, HttpMethod> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
};

/**
 * Verb collapse priority for `@RequestMapping(method = {...})`: the first verb
 * present in POST > PUT > DELETE > PATCH > GET wins; HEAD/OPTIONS are not
 * representable in `ParsedApi.method`, so a lone HEAD (or an empty/absent
 * `method`) collapses to 'GET' — never 'POST'.
 */
const VERB_PRIORITY: HttpMethod[] = ['POST', 'PUT', 'DELETE', 'PATCH', 'GET'];

/** An annotation CST node paired with its structured read result. */
interface ReadAnnotation {
  node: CstNode;
  read: AnnotationResult;
}

/**
 * Collect annotations from a `classModifier`/`methodModifier` array. Each modifier
 * entry is either `{annotation: [...]}` (keep) or a keyword wrapper like
 * `{Public: [...]}` (skip — no `annotation` child).
 */
function annotationsFromModifiers(mods: CstNode[], source: string): ReadAnnotation[] {
  const out: ReadAnnotation[] = [];
  for (const mod of mods) {
    const anns = (mod.children['annotation'] || []) as CstNode[];
    for (const ann of anns) {
      out.push({ node: ann, read: readAnnotation(ann, source) });
    }
  }
  return out;
}

/** Resolve the path from a mapping annotation: `value=` > `path=` > positional, ARRAY first-element form. */
function mappingPath(ann: AnnotationResult): string {
  return (
    firstString(ann.values['value']) ??
    firstString(ann.values['path']) ??
    firstString(ann.positional[0]) ??
    ''
  );
}

/** Pull every verb name out of a `method = {...}` value (identifiers like RequestMethod.GET). */
function verbNames(v: AnnotationValue | undefined): string[] {
  if (!v) {
    return [];
  }
  if (v.kind === 'array') {
    return v.value
      .map((x) => (x.kind === 'identifier' || x.kind === 'string' ? x.value : ''))
      .filter((s) => s !== '');
  }
  if (v.kind === 'identifier' || v.kind === 'string') {
    return [v.value];
  }
  return [];
}

/** Resolve the HTTP verb for a method-level @RequestMapping (collapse rule). */
function requestMappingVerb(ann: AnnotationResult): HttpMethod {
  const verbs = verbNames(ann.values['method']).map((v) => v.split('.').pop() ?? v);
  return VERB_PRIORITY.find((p) => verbs.includes(p)) ?? 'GET';
}

/**
 * Summary priority chain: @Operation(summary) > @ApiOperation(value|summary) >
 * [@Description] — returns undefined when nothing matched so the caller can apply
 * the Javadoc baseline and the generated fallback. Regex parity: the specific-verb
 * chain includes the @Description fallback; the method-level @RequestMapping
 * chain does NOT (javaParser.ts:284-298 vs :554-565).
 */
function resolveSummary(
  anns: AnnotationResult[],
  method: HttpMethod,
  path: string,
  hasDescriptionFallback: boolean,
): string | undefined {
  const op = anns.find((a) => a.name === 'Operation');
  if (op) {
    const s = firstString(op.values['summary']);
    if (s !== undefined) {
      return s;
    }
  }
  const apiOp = anns.find((a) => a.name === 'ApiOperation');
  if (apiOp) {
    const s = firstString(apiOp.values['value'] ?? apiOp.values['summary']);
    if (s !== undefined) {
      return s;
    }
  }
  if (hasDescriptionFallback) {
    const desc = anns.find((a) => a.name === 'Description');
    if (desc) {
      const s = firstString(desc.values['value'] ?? desc.positional[0]);
      if (s !== undefined) {
        return s;
      }
    }
  }
  return undefined;
}

/** Parse one methodDeclaration into a ParsedApi, or null when it has no mapping annotation. */
function parseMethod(md: CstNode, source: string, basePath: string, javadoc: JavadocIndex): ParsedApi | null {
  const mods = (md.children['methodModifier'] || []) as CstNode[];
  const anns = annotationsFromModifiers(mods, source);

  const specific = anns.find((a) => MAPPING_VERBS[a.read.name] !== undefined);
  const requestMapping = anns.find((a) => a.read.name === 'RequestMapping');
  if (!specific && !requestMapping) {
    return null;
  }

  const mapping = (specific ?? requestMapping)!;
  const method: HttpMethod = specific
    ? MAPPING_VERBS[specific.read.name]
    : requestMappingVerb(requestMapping!.read);
  const path = mappingPath(mapping.read);

  // Javadoc baseline: the ADJACENT Javadoc (endLine === declarationLine - 1) is the
  // default summary when no explicit annotation provides one; explicit annotations
  // always win, and the Javadoc beats the generated fallback.
  const methodLine = locationOf(md)?.startLine;
  const javadocSummary = methodLine !== undefined ? javadoc.summaryForAdjacent(methodLine) : undefined;
  const summary =
    resolveSummary(anns.map((a) => a.read), method, path, specific !== undefined) ??
    javadocSummary ??
    `${method} ${path || '/'}`;

  // description: the Javadoc body when there is no @Operation/@ApiOperation
  const hasApiOperation = anns.some((a) => a.read.name === 'Operation' || a.read.name === 'ApiOperation');
  const description =
    !hasApiOperation && methodLine !== undefined ? javadoc.bodyForAdjacent(methodLine) : undefined;

  const api: ParsedApi = {
    method,
    path,
    fullPath: basePath + path,
    summary,
    parameters: parseParameters(md, source),
  };
  if (description !== undefined) {
    api.description = description;
  }
  // REAL position from the mapping annotation node (1-based line — the STORED
  // shape; the hover consumer subtracts 1, see T10). Never a bogus 0 line.
  const loc = locationOf(mapping.node);
  if (loc) {
    api.position = { line: loc.startLine, column: loc.startColumn };
  }
  return api;
}

/**
 * True when the source declares @RestController or @Controller on a top-level class.
 * Reuses the CST (real annotation nodes, never a substring test). Throws on malformed
 * Java — callers run it inside their own try/catch.
 */
export function hasControllerAnnotation(source: string): boolean {
  const tree = loadJavaParser().parse(source) as unknown as CstNode;
  const ocu = findFirst(tree, 'ordinaryCompilationUnit');
  if (!ocu) {
    return false;
  }
  const typeDecls = (ocu.children['typeDeclaration'] || []) as CstNode[];
  for (const td of typeDecls) {
    const cd = findFirst(td, 'classDeclaration');
    if (!cd) {
      continue;
    }
    const mods = (cd.children['classModifier'] || []) as CstNode[];
    for (const mod of mods) {
      for (const ann of (mod.children['annotation'] || []) as CstNode[]) {
        const tn = findFirst(ann, 'typeName');
        const name = tn ? text(tn, source).trim() : '';
        if (name === 'RestController' || name === 'Controller') {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Parse a Java source file into controller classes and their endpoints using the
 * real CST. Throws on malformed Java (the dispatcher in T8 catches and falls back
 * to the regex parser — this module never swallows parse failures).
 *
 * @param source - Full Java source text.
 * @param uri - File URI; reserved for T8/T12 (error context / symbol indexing).
 */
export function parseJavaCst(source: string, uri: string): ParseResult {
  void uri;
  const result: ParseResult = { classes: [], apis: [] };
  // java-parser's own CstNode type is deeply recursive; comparing it against our
  // shallow CstElement union exceeds TS's stack-depth limit (TS2321). Sever the
  // deep type with a double cast — the runtime shape IS our CstNode.
  const tree = loadJavaParser().parse(source) as unknown as CstNode;
  const javadoc = buildJavadocIndex(source);
  const ocu = findFirst(tree, 'ordinaryCompilationUnit');
  if (!ocu) {
    return result;
  }

  const typeDecls = (ocu.children['typeDeclaration'] || []) as CstNode[];
  for (const td of typeDecls) {
    const cd = findFirst(td, 'classDeclaration');
    if (!cd) {
      continue; // interfaces / enums / records are not controllers
    }
    const classAnns = annotationsFromModifiers((cd.children['classModifier'] || []) as CstNode[], source);
    const isRestController = classAnns.some((a) => a.read.name === 'RestController');
    const isController = isRestController || classAnns.some((a) => a.read.name === 'Controller');
    if (!isController) {
      continue; // per-class check: a @Service class is never a controller
    }

    const ncd = findFirst(cd, 'normalClassDeclaration');
    const nameTok = ncd
      ? (findFirst(ncd, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined)
      : undefined;
    const name = nameTok?.image ?? 'Unknown';

    // Class-level @RequestMapping base path — from the CLASS's OWN annotation
    // list, never re-derived from the first @RequestMapping in the file.
    const classRm = classAnns.find((a) => a.read.name === 'RequestMapping');
    const basePath = classRm ? mappingPath(classRm.read) : '';

    const parsedClass: ParsedClass = { name, isRestController, isController, basePath, apis: [] };
    const classBody = ncd ? findFirst(ncd, 'classBody') : undefined;
    if (classBody) {
      for (const md of findAll(classBody, 'methodDeclaration')) {
        const api = parseMethod(md, source, basePath, javadoc);
        if (api) {
          parsedClass.apis.push(api);
          result.apis.push(api);
        }
      }
    }
    result.classes.push(parsedClass);
  }

  return result;
}
