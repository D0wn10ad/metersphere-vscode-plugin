/**
 * Structured reader for Java annotation CST nodes (java-parser / Chevrotain).
 *
 * An `annotation` node's children are `['At','typeName','LBrace','elementValuePairList','RBrace']`
 * (named pairs) or `['At','typeName','LBrace','elementValue','RBrace']` (a single positional value)
 * or `['At','typeName']` (no arguments). The annotation NAME is read from the `typeName` child.
 *
 * Each `elementValue`'s actual value lives under a `conditionalExpression` child. We classify the
 * value by inspecting the descendant CST structure (array initializer, nested annotation, literal,
 * or a qualified/identifier name) rather than regex-scraping the annotation text.
 */

import { CstNode, CstToken, findFirst, findAll, text } from './cstWalk';

export type AnnotationValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'identifier'; value: string }
  | { kind: 'array'; value: AnnotationValue[] }
  | {
      kind: 'annotation';
      value: { name: string; values: Record<string, AnnotationValue>; positional: AnnotationValue[] };
    };

export interface AnnotationResult {
  name: string;
  values: Record<string, AnnotationValue>;
  positional: AnnotationValue[];
}

/** Read a single `elementValue` node into a typed `AnnotationValue`. */
function readElementValue(ev: CstNode, source: string): AnnotationValue {
  // Array literal: elementValue -> elementValueArrayInitializer DIRECTLY (no conditionalExpression
  // wrapper). Must be checked BEFORE the conditionalExpression lookup, otherwise the whole
  // `{ /a, /b }` text is misread as a single identifier/string.
  const arrInit = findFirst(ev, 'elementValueArrayInitializer');
  if (arrInit) {
    const items = findAll(arrInit, 'elementValue').map((e) => readElementValue(e, source));
    return { kind: 'array', value: items };
  }

  const cond = findFirst(ev, 'conditionalExpression');
  if (!cond) {
    return { kind: 'identifier', value: text(ev, source).trim() };
  }

  // Nested annotation value
  const nested = findFirst(cond, 'annotation');
  if (nested) {
    return { kind: 'annotation', value: readAnnotation(nested, source) };
  }

  // Literal: string / boolean / number
  const lit = findFirst(cond, 'literal');
  if (lit) {
    const img = text(lit, source).trim();
    if (img.startsWith('"')) {
      return { kind: 'string', value: img.slice(1, -1) };
    }
    if (img === 'true' || img === 'false') {
      return { kind: 'boolean', value: img === 'true' };
    }
    const num = Number(img);
    if (!Number.isNaN(num)) {
      return { kind: 'number', value: num };
    }
    return { kind: 'identifier', value: img };
  }

  // Qualified name / enum reference (e.g. RequestMethod.GET) or bare identifier
  return { kind: 'identifier', value: text(cond, source).trim() };
}

/**
 * Read an `annotation` CST node into `{ name, values, positional }`.
 * `values` maps each `elementValuePair` name to its typed value; `positional` collects any
 * single unnamed `elementValue` children (e.g. `@Foo("bar")`).
 */
export function readAnnotation(annotationNode: CstNode, source: string): AnnotationResult {
  const typeName = findFirst(annotationNode, 'typeName');
  const name = typeName ? text(typeName, source).trim() : '';

  const values: Record<string, AnnotationValue> = {};
  const positional: AnnotationValue[] = [];

  const pairs = findAll(annotationNode, 'elementValuePair');
  for (const pair of pairs) {
    const keyTok = pair.children['Identifier']?.[0] as CstToken | undefined;
    if (!keyTok) {
      continue;
    }
    const ev = findFirst(pair, 'elementValue');
    if (ev) {
      values[keyTok.image] = readElementValue(ev, source);
    }
  }

  const posEvs = (annotationNode.children['elementValue'] || []) as CstNode[];
  for (const ev of posEvs) {
    positional.push(readElementValue(ev, source));
  }

  return { name, values, positional };
}

/** Return the string value of `v`, or the first string of an array value. */
export function firstString(v: AnnotationValue | undefined): string | undefined {
  if (!v) {
    return undefined;
  }
  if (v.kind === 'string') {
    return v.value;
  }
  if (v.kind === 'array') {
    const first = v.value[0];
    return first && first.kind === 'string' ? first.value : undefined;
  }
  return undefined;
}

/** Return every string in an array value (or a single string value as a one-element array). */
export function asStringArray(v: AnnotationValue | undefined): string[] {
  if (!v) {
    return [];
  }
  if (v.kind === 'array') {
    return v.value.filter((x): x is { kind: 'string'; value: string } => x.kind === 'string').map((x) => x.value);
  }
  if (v.kind === 'string') {
    return [v.value];
  }
  return [];
}

/** Interpret a value as a boolean, handling BOTH `required = "true"` (string) and `required = true`. */
export function booleanValue(v: AnnotationValue | undefined): boolean | undefined {
  if (!v) {
    return undefined;
  }
  if (v.kind === 'boolean') {
    return v.value;
  }
  if (v.kind === 'string') {
    return v.value === 'true';
  }
  return undefined;
}