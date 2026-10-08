import { loadJavaParser } from './loadJavaParser';

/**
 * A single Javadoc comment extracted from the CST.
 */
export interface JavadocComment {
  /** 1-based line the comment starts on. */
  startLine: number;
  /** 1-based line the comment ends on. */
  endLine: number;
  /** The raw comment text including the Javadoc delimiters. */
  image: string;
}

/**
 * Index of Javadoc comments keyed by the declaration line they precede.
 */
export interface JavadocIndex {
  /**
   * Return the Javadoc body whose `endLine` is the nearest one strictly above
   * `line`, or `undefined` when no Javadoc comment precedes that line.
   */
  forLine(line: number): string | undefined;
  /**
   * Return the first non-empty, non-`@` line of the Javadoc body that precedes
   * `line` (the summary), or `undefined` when there is none.
   */
  summaryFor(line: number): string | undefined;
  /**
   * Summary of the Javadoc whose `endLine` is EXACTLY `line - 1` (immediately
   * adjacent to the declaration) — prevents an earlier declaration's Javadoc
   * leaking into a later one.
   */
  summaryForAdjacent(line: number): string | undefined;
  /** Full body of the immediately adjacent Javadoc (same adjacency rule). */
  bodyForAdjacent(line: number): string | undefined;
}

const JAVADOC_START = '/**';
const JAVADOC_END = '*/';

/** True when the comment is a Javadoc block (not a line or plain block comment). */
function isJavadoc(image: string): boolean {
  return image.startsWith(JAVADOC_START);
}

/**
 * Strip the `/**` and `*\/` delimiters and any leading `*` decoration from a
 * Javadoc comment, returning the body lines.
 */
function bodyLines(image: string): string[] {
  const inner = image
    .slice(JAVADOC_START.length, image.length - JAVADOC_END.length)
    .replace(/\r\n/g, '\n');
  return inner
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * Build a Javadoc index from the CST `parse().comments` array.
 *
 * Only Javadoc block comments count; line and plain block comments are ignored.
 * The parser reports comments as top-level `{ startLine, endLine, image }` entries.
 */
export function buildJavadocIndex(source: string): JavadocIndex {
  const parser = loadJavaParser();
  const parsed = parser.parse(source);
  const comments: JavadocComment[] = (parsed.comments || [])
    .filter((c: { image?: string }) => c.image && isJavadoc(c.image))
    .map((c: { startLine: number; endLine: number; image: string }) => ({
      startLine: c.startLine,
      endLine: c.endLine,
      image: c.image,
    }))
    .sort((a, b) => a.endLine - b.endLine);

  function forLine(line: number): string | undefined {
    let best: JavadocComment | undefined;
    for (const c of comments) {
      if (c.endLine < line) {
        best = c;
      } else {
        break;
      }
    }
    if (!best) {
      return undefined;
    }
    return bodyLines(best.image).join('\n');
  }

  function summaryFor(line: number): string | undefined {
    const body = forLine(line);
    if (body === undefined) {
      return undefined;
    }
    const first = body.split('\n').find((l) => l.length > 0 && !l.startsWith('@'));
    return first;
  }

  function adjacent(line: number): JavadocComment | undefined {
    return comments.find((c) => c.endLine === line - 1);
  }

  function summaryForAdjacent(line: number): string | undefined {
    const c = adjacent(line);
    if (!c) {
      return undefined;
    }
    const body = bodyLines(c.image).join('\n');
    return body.split('\n').find((l) => l.length > 0 && !l.startsWith('@'));
  }

  function bodyForAdjacent(line: number): string | undefined {
    const c = adjacent(line);
    return c ? bodyLines(c.image).join('\n') : undefined;
  }

  return { forLine, summaryFor, summaryForAdjacent, bodyForAdjacent };
}