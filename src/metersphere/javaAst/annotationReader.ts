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

/**
 * Decode the escape sequences of a Java string literal body (the text between the
 * surrounding quotes). Handles the standard escapes plus `\uXXXX`; an unknown
 * escape keeps the escaped character verbatim (e.g. `\q` → `q`).
 */
function decodeJavaString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      out += '\\';
      break;
    }
    switch (next) {
      case 'n':
        out += '\n';
        i++;
        break;
      case 'r':
        out += '\r';
        i++;
        break;
      case 't':
        out += '\t';
        i++;
        break;
      case 'b':
        out += '\b';
        i++;
        break;
      case 'f':
        out += '\f';
        i++;
        break;
      case '"':
        out += '"';
        i++;
        break;
      case "'":
        out += "'";
        i++;
        break;
      case '\\':
        out += '\\';
        i++;
        break;
      case 'u': {
        const hex = raw.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          out += 'u';
          i++;
        }
        break;
      }
      default:
        out += next;
        i++;
        break;
    }
  }
  return out;
}

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

  // Nested annotation value: elementValue -> annotation DIRECTLY (no
  // conditionalExpression wrapper). Must be checked BEFORE the
  // conditionalExpression lookup, which would otherwise descend INTO the
  // nested annotation and misread its inner literal as this value.
  const directAnnotation = (ev.children['annotation'] || [])[0] as CstNode | undefined;
  if (directAnnotation) {
    return { kind: 'annotation', value: readAnnotation(directAnnotation, source) };
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
      return { kind: 'string', value: decodeJavaString(img.slice(1, -1)) };
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

  // Only the annotation's OWN pairs: `elementValuePairList` is a direct child, and
  // its `elementValuePair` children are the direct pairs. A recursive findAll would
  // also collect pairs belonging to a NESTED annotation value (e.g. `@Foo(bar = @Baz(x = 1))`
  // would leak `x` into Foo's values).
  const pairLists = (annotationNode.children['elementValuePairList'] || []) as CstNode[];
  const pairs: CstNode[] = [];
  for (const pl of pairLists) {
    pairs.push(...((pl.children['elementValuePair'] || []) as CstNode[]));
  }
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