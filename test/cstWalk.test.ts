import * as fs from 'fs';
import * as path from 'path';
import { loadJavaParser } from '../src/metersphere/javaAst/loadJavaParser';
import {
  leaves,
  text,
  findAll,
  findFirst,
  locationOf,
  CstNode,
  CstToken,
} from '../src/metersphere/javaAst/cstWalk';

const parse = loadJavaParser().parse;

const FIXTURE = path.resolve(__dirname, 'fixtures/java/killer-probe.java');
const fixtureSource = fs.readFileSync(FIXTURE, 'utf8');

/** Minimal nested-generic source used for the source-order regression guard. */
const GENERIC_SOURCE = `class G {
  java.util.Map<String, java.util.List<java.util.Map<String, Integer>>> field;
}`;

describe('cstWalk', () => {
  describe('text()', () => {
    it('returns the EXACT nested generic string (source-order regression guard)', () => {
      const root = parse(GENERIC_SOURCE);
      // Find the field type node: walk to the fieldDeclaration -> type.
      const fieldDecl = findFirst(root, 'fieldDeclaration');
      expect(fieldDecl).toBeDefined();
      const typeNode = findFirst(fieldDecl as CstNode, 'unannType');
      expect(typeNode).toBeDefined();
      const got = text(typeNode as CstNode, GENERIC_SOURCE);
      expect(got).toBe('java.util.Map<String, java.util.List<java.util.Map<String, Integer>>>');
    });

    it('returns "" for a node with zero leaves rather than throwing', () => {
      // A synthetic empty node has no children and no leaves.
      const empty: CstNode = { name: 'empty', children: {} };
      expect(text(empty, GENERIC_SOURCE)).toBe('');
    });
  });

  describe('leaves()', () => {
    it('returns >0 tokens in strictly ascending startOffset with numeric startLine', () => {
      const root = parse('class C { void m() {} }');
      const ls = leaves(root);
      expect(ls.length).toBeGreaterThan(0);
      for (let i = 1; i < ls.length; i++) {
        expect(ls[i].startOffset).toBeGreaterThan(ls[i - 1].startOffset);
      }
      for (const t of ls) {
        expect(typeof t.startLine).toBe('number');
        expect(Number.isFinite(t.startLine)).toBe(true);
      }
    });
  });

  describe('locationOf()', () => {
    it('reports the correct 1-based startLine for a method @GetMapping node', () => {
      const root = parse(fixtureSource);
      const getMapping = findAll(root, 'annotation').find((a) =>
        text(a, fixtureSource).startsWith('@GetMapping')
      );
      expect(getMapping).toBeDefined();
      const loc = locationOf(getMapping as CstNode);
      expect(loc).toBeDefined();
      // The @GetMapping line in killer-probe.java is line 26 (1-based).
      expect((loc as { startLine: number }).startLine).toBe(26);
    });
  });

  describe('findAll()', () => {
    it('finds NINE annotation nodes on the killer-probe fixture with the expected name set', () => {
      const root = parse(fixtureSource);
      const anns = findAll(root, 'annotation');
      expect(anns).toHaveLength(9);
      const names = anns.map((a) => text(a, fixtureSource)).sort();
      expect(names).toEqual(
        [
          '@RestController',
          '@RequestMapping("/api")',
          '@Operation(summary = "Get a cart")',
          '@GetMapping(value = { "/a", "/b" }, produces = MediaType.APPLICATION_JSON_VALUE)',
          '@RequestParam(name = "q", required = false, defaultValue = "x,y(z)")',
          '@RequestBody',
          '@Valid',
          '@Size(min = 1, max = 10)',
          '@RequestMapping(value = "/legacy", method = { RequestMethod.GET, RequestMethod.HEAD })',
        ].sort()
      );
    });
  });
});