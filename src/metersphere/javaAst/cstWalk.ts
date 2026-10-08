/**
 * CST traversal primitives over the java-parser (Chevrotain) concrete syntax tree.
 *
 * java-parser nodes are `CstNode`s: they carry a `name` and a `children` dictionary
 * keyed by GRAMMAR-RULE NAME, but NO `image`/`startLine` of their own. Only the leaf
 * `IToken`s (which have an `image`) expose offsets and line/column positions. Because
 * `node.children` is keyed by rule name, iterating those keys does NOT yield leaves in
 * source order — every order-sensitive primitive here sorts by `startOffset`.
 */

/** A leaf token produced by the lexer (has an `image`). */
export interface CstToken {
  image: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

/** A CST node: a `name` plus a dictionary of child arrays (nodes and/or tokens). */
export interface CstNode {
  name: string;
  children: Record<string, Array<CstNode | CstToken>>;
}

export type CstElement = CstNode | CstToken;

/** True when the element is a leaf token (has an `image`). */
export function isToken(el: CstElement): el is CstToken {
  return (el as CstToken).image !== undefined;
}

/**
 * Recursively collect every leaf token under `node`, returned in SOURCE ORDER
 * (ascending `startOffset`). `node.children` is keyed by grammar-rule name, so a
 * naive key-order walk is NOT source-ordered — we sort explicitly.
 */
export function leaves(node: CstElement): CstToken[] {
  const acc: CstToken[] = [];
  collectLeaves(node, acc);
  return acc.sort((a, b) => a.startOffset - b.startOffset);
}

function collectLeaves(el: CstElement, acc: CstToken[]): void {
  if (isToken(el)) {
    acc.push(el);
    return;
  }
  for (const key of Object.keys(el.children)) {
    for (const child of el.children[key]) {
      collectLeaves(child, acc);
    }
  }
}

/**
 * Return the exact source text spanned by `node`, by slicing the ORIGINAL source
 * between the node's min `startOffset` and max `endOffset + 1`. This preserves
 * delimiters and whitespace exactly (concatenating `leaves().map(t => t.image)`
 * would reorder delimiters and corrupt nested generics like `Map<String, List<Integer>>`).
 */
export function text(node: CstElement, source: string): string {
  const ls = leaves(node);
  if (ls.length === 0) {
    return '';
  }
  const min = Math.min(...ls.map((t) => t.startOffset));
  const max = Math.max(...ls.map((t) => t.endOffset));
  return source.slice(min, max + 1);
}

/**
 * Recursively find every descendant (including `root` itself) whose `name` equals
 * `name`. Returns nodes in document order.
 */
export function findAll(root: CstElement, name: string): CstNode[] {
  const acc: CstNode[] = [];
  collectByName(root, name, acc);
  return acc;
}

function collectByName(el: CstElement, name: string, acc: CstNode[]): void {
  if (isToken(el)) {
    return;
  }
  if (el.name === name) {
    acc.push(el);
  }
  for (const key of Object.keys(el.children)) {
    for (const child of el.children[key]) {
      collectByName(child, name, acc);
    }
  }
}

/** Return the first descendant (or `root` itself) whose `name` equals `name`. */
export function findFirst(root: CstElement, name: string): CstNode | undefined {
  return findAll(root, name)[0];
}

export interface CstLocation {
  startLine: number;
  startColumn: number;
  startOffset: number;
  endLine: number;
  endColumn: number;
  endOffset: number;
}

/**
 * Compute the source location of `node` from its MIN-`startOffset` and MAX-`endOffset`
 * leaf tokens (NOT the first/last child-array entries, which are not source-ordered).
 * Returns `undefined` when the node has no leaves.
 */
export function locationOf(node: CstElement): CstLocation | undefined {
  const ls = leaves(node);
  if (ls.length === 0) {
    return undefined;
  }
  const start = ls.reduce((a, b) => (b.startOffset < a.startOffset ? b : a));
  const end = ls.reduce((a, b) => (b.endOffset > a.endOffset ? b : a));
  return {
    startLine: start.startLine,
    startColumn: start.startColumn,
    startOffset: start.startOffset,
    endLine: end.endLine,
    endColumn: end.endColumn,
    endOffset: end.endOffset,
  };
}