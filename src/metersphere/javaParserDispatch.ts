/**
 * CST-first dual-parser dispatcher with deterministic precedence.
 *
 * Rule: run the CST parser first. Fall back to the regex `JavaParser.parseSource`
 * ONLY when (a) the CST throws (malformed Java), or (b) the CST returns zero APIs
 * while the source still declares a controller annotation (a suspicious empty — the
 * regex may find what the CST missed). A zero-API result on a file with NO controller
 * is a correct empty result, NOT a failure — no fallback. Every fallback is logged
 * via DebugLogger with the reason and the URI (never silent).
 */

import { JavaParser, ParseResult } from './javaParser';
import { hasControllerAnnotation, parseJavaCst } from './javaAst/cstJavaParser';
import { DebugLogger } from './debugLogger';

export type ParseEngine = 'cst' | 'regex';

export interface DispatchResult {
  result: ParseResult;
  engine: ParseEngine;
}

/** Run exactly one engine by name — the test seam for the shared expectation table. */
export function parseJavaWithEngine(source: string, uri: string, engine: ParseEngine): ParseResult {
  return engine === 'cst' ? parseJavaCst(source, uri) : JavaParser.parseSource(source, uri);
}

/** CST-first dispatch with deterministic regex fallback. */
export function parseJava(source: string, uri: string): DispatchResult {
  try {
    const result = parseJavaCst(source, uri);
    if (result.apis.length === 0 && hasControllerAnnotation(source)) {
      DebugLogger.log('Parser', 'CST found no APIs despite a controller annotation; falling back to regex', { uri });
      return { result: JavaParser.parseSource(source, uri), engine: 'regex' };
    }
    return { result, engine: 'cst' };
  } catch (err) {
    DebugLogger.log('Parser', 'CST parse failed; falling back to regex', { uri, error: String(err) });
    return { result: JavaParser.parseSource(source, uri), engine: 'regex' };
  }
}
