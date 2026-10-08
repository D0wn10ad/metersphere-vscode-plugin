import * as fs from 'fs';
import * as path from 'path';
import { loadJavaParser } from '../src/metersphere/javaAst/loadJavaParser';
import { findAll, findFirst } from '../src/metersphere/javaAst/cstWalk';
import { readAnnotation, firstString, asStringArray, booleanValue, AnnotationResult } from '../src/metersphere/javaAst/annotationReader';

const fixture = path.join(__dirname, 'fixtures', 'java', 'killer-probe.java');
const source = fs.readFileSync(fixture, 'utf8');

function parseFixture() {
  const jp = loadJavaParser();
  return jp.parse(source);
}

function annotations(): AnnotationResult[] {
  const cst = parseFixture();
  return findAll(cst, 'annotation').map((n) => readAnnotation(n, source));
}

function byName(name: string): AnnotationResult {
  const found = annotations().find((a) => a.name === name);
  if (!found) {
    throw new Error(`annotation ${name} not found`);
  }
  return found;
}

describe('annotationReader', () => {
  it('reads @GetMapping value array as two strings', () => {
    const gm = byName('GetMapping');
    const v = gm.values['value'];
    expect(v).toBeDefined();
    expect(v!.kind).toBe('array');
    if (v!.kind === 'array') {
      expect(v!.value.map((x) => x.value)).toEqual(['/a', '/b']);
      expect(v!.value.every((x) => x.kind === 'string')).toBe(true);
    }
  });

  it('reads @RequestParam defaultValue exactly including comma and parens', () => {
    const rp = byName('RequestParam');
    expect(firstString(rp.values['defaultValue'])).toBe('x,y(z)');
    expect(firstString(rp.values['name'])).toBe('q');
  });

  it('reads @RequestMapping method enum set as qualified identifiers', () => {
    // killer-probe has TWO @RequestMapping: class-level (value="/api", no method) and
    // method-level (value="/legacy", method={GET,HEAD}). Pick the one with a `method` key.
    const rm = annotations().find((a) => a.name === 'RequestMapping' && a.values['method']);
    expect(rm).toBeDefined();
    if (!rm) {
      return;
    }
    const m = rm.values['method'];
    expect(m).toBeDefined();
    expect(m!.kind).toBe('array');
    if (m!.kind === 'array') {
      expect(m!.value).toEqual([
        { kind: 'identifier', value: 'RequestMethod.GET' },
        { kind: 'identifier', value: 'RequestMethod.HEAD' },
      ]);
    }
    expect(firstString(rm.values['value'])).toBe('/legacy');
  });

  it('booleanValue handles bare false and string "true"', () => {
    const rp = byName('RequestParam');
    expect(booleanValue(rp.values['required'])).toBe(false);
    // string "true" form
    expect(booleanValue({ kind: 'string', value: 'true' })).toBe(true);
    expect(booleanValue({ kind: 'string', value: 'false' })).toBe(false);
    expect(booleanValue(undefined)).toBeUndefined();
  });

  it('asStringArray flattens array and single string', () => {
    const gm = byName('GetMapping');
    expect(asStringArray(gm.values['value'])).toEqual(['/a', '/b']);
    expect(asStringArray({ kind: 'string', value: 'x' })).toEqual(['x']);
    expect(asStringArray(undefined)).toEqual([]);
  });

  it('annotation with no parens yields empty values and positional without throwing', () => {
    const rb = byName('RequestBody');
    expect(rb.values).toEqual({});
    expect(rb.positional).toEqual([]);
  });

  it('reads @Operation summary string', () => {
    const op = byName('Operation');
    expect(firstString(op.values['summary'])).toBe('Get a cart');
  });

  it('reads @Size numeric pairs', () => {
    const sz = byName('Size');
    const min = sz.values['min'];
    const max = sz.values['max'];
    expect(min && min.kind === 'number' ? min.value : undefined).toBe(1);
    expect(max && max.kind === 'number' ? max.value : undefined).toBe(10);
  });
});