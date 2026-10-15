/**
 * Tests for the CST-based parameter extractor (java-parser / Chevrotain).
 *
 * `parseParameters` walks real `formalParameter` nodes — the name comes from the
 * declarator (never the last-identifier-wins trick), the type from `text()` of the
 * type node (nested generics preserved), and only REAL annotation nodes count
 * (a `@RequestBody` inside a comment is not a parameter; `@Valid` is not a kind).
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseParameters } from '../src/metersphere/javaAst/cstParamParser';
import { loadJavaParser } from '../src/metersphere/javaAst/loadJavaParser';
import { CstNode, findAll, locationOf } from '../src/metersphere/javaAst/cstWalk';
import { buildJavadocIndex } from '../src/metersphere/javaAst/javadocIndex';

const fixture = (name: string): string =>
  fs.readFileSync(path.join(__dirname, 'fixtures', 'java', name), 'utf8');

function firstMethodOf(src: string): { node: CstNode; source: string } {
  const tree = loadJavaParser().parse(src) as unknown as CstNode;
  const md = findAll(tree, 'methodDeclaration')[0];
  if (!md) {
    throw new Error('no methodDeclaration in source');
  }
  return { node: md, source: src };
}

const controller = (signature: string, body = '// nothing'): string =>
  [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    'import org.springframework.web.bind.annotation.RequestMethod;',
    '@RestController',
    'public class C {',
    `  @GetMapping("/x")`,
    `  public void h(${signature}) {`,
    `    ${body}`,
    '  }',
    '}',
  ].join('\n');

describe('cstParamParser', () => {
  describe('killer-probe fixture (method 1)', () => {
    let params: ReturnType<typeof parseParameters>;

    beforeAll(() => {
      const src = fixture('killer-probe.java');
      const tree = loadJavaParser().parse(src) as unknown as CstNode;
      const methods = findAll(tree, 'methodDeclaration');
      params = parseParameters(methods[0], src);
    });

    it('extracts the query param with defaultValue exactly "x,y(z)"', () => {
      const q = params.find((p) => p.name === 'q');
      expect(q).toBeDefined();
      expect(q!.in).toBe('query');
      expect(q!.defaultValue).toBe('x,y(z)');
      expect(q!.type).toBe('String');
    });

    it('yields required false for the query param and true for the body param', () => {
      const q = params.find((p) => p.name === 'q');
      const dtos = params.find((p) => p.name === 'dtos');
      expect(q!.required).toBe(false);
      expect(dtos!.required).toBe(true);
    });

    it('yields the body param type containing List<EdgeDTO>', () => {
      const dtos = params.find((p) => p.name === 'dtos');
      expect(dtos!.in).toBe('body');
      expect(dtos!.type).toContain('List<EdgeDTO>');
    });

    it('produces a Size constraint from @Size(min=1,max=10)', () => {
      const dtos = params.find((p) => p.name === 'dtos');
      expect(dtos!.validation).toHaveLength(1);
      expect(dtos!.validation![0].type).toBe('Size');
      expect(dtos!.validation![0].value).toBe('1-10');
    });

    it('does not treat @Valid as a parameter kind', () => {
      expect(params.find((p) => p.in === ('Valid' as never))).toBeUndefined();
      expect(params).toHaveLength(2);
    });
  });

  describe('annotation-driven behavior', () => {
    it('maps @PathVariable to in:path with required true', () => {
      const { node, source } = firstMethodOf(controller('@PathVariable String id'));
      const params = parseParameters(node, source);
      expect(params).toHaveLength(1);
      expect(params[0].name).toBe('id');
      expect(params[0].in).toBe('path');
      expect(params[0].required).toBe(true);
    });

    it('maps @RequestHeader to in:header with required false by default', () => {
      const { node, source } = firstMethodOf(controller('@RequestHeader String auth'));
      const params = parseParameters(node, source);
      expect(params).toHaveLength(1);
      expect(params[0].in).toBe('header');
      expect(params[0].required).toBe(false);
    });

    it('honors a positional @PathVariable("id") name override', () => {
      const { node, source } = firstMethodOf(controller('@PathVariable("uid") String id'));
      const params = parseParameters(node, source);
      expect(params[0].name).toBe('uid');
    });

    it('honors required = true override on @RequestParam', () => {
      const { node, source } = firstMethodOf(controller('@RequestParam(required = true) String q'));
      const params = parseParameters(node, source);
      expect(params[0].required).toBe(true);
    });

    it('reads @ApiParam description', () => {
      const { node, source } = firstMethodOf(
        controller('@ApiParam(value = "The user id") @RequestParam String uid', ''),
      );
      const params = parseParameters(node, source);
      expect(params[0].description).toBe('The user id');
    });

    it('extracts multiple validation constraints', () => {
      const { node, source } = firstMethodOf(
        controller('@NotNull @Size(min = 1, max = 50) @RequestParam("name") String name'),
      );
      const params = parseParameters(node, source);
      expect(params[0].validation!.length).toBeGreaterThanOrEqual(2);
      const types = params[0].validation!.map((v) => v.type);
      expect(types).toContain('NotNull');
      expect(types).toContain('Size');
    });

    it('skips a param carrying only @Valid (constraint modifier, not a kind)', () => {
      const { node, source } = firstMethodOf(controller('@Valid EdgeDTO dto'));
      const params = parseParameters(node, source);
      expect(params).toEqual([]);
    });

    it('skips plain unannotated parameters (regex parity)', () => {
      const { node, source } = firstMethodOf(controller('String plain'));
      const params = parseParameters(node, source);
      expect(params).toEqual([]);
    });
  });

  describe('comment safety', () => {
    it('yields no body param when the method BODY comment mentions @RequestBody', () => {
      const { node, source } = firstMethodOf(
        controller('String q', '// TODO: accept @RequestBody List<EdgeDTO> later'),
      );
      const params = parseParameters(node, source);
      expect(params.find((p) => p.in === 'body')).toBeUndefined();
    });
  });

  describe('zero parameters', () => {
    it('yields [] for a method with no parameters', () => {
      const src = [
        'package com.example.demo;',
        'import org.springframework.web.bind.annotation.*;',
        '@RestController',
        'public class C {',
        '  @GetMapping("/none")',
        '  public void none() { }',
        '}',
      ].join('\n');
      const tree = loadJavaParser().parse(src) as unknown as CstNode;
      const md = findAll(tree, 'methodDeclaration')[0];
      expect(parseParameters(md, src)).toEqual([]);
    });
  });
});

describe('cstParamParser — positional constraints + javadoc @param (T3)', () => {
  const javadocController = (signature: string, extraImports: string[] = []): string =>
    [
      'package com.example.demo;',
      'import org.springframework.web.bind.annotation.*;',
      'import javax.validation.constraints.Min;',
      'import javax.validation.constraints.Size;',
      ...extraImports,
      '@RestController',
      'public class C {',
      '  /**',
      '   * List items.',
      '   * @param page the page',
      '   */',
      '  @GetMapping("/x")',
      `  public void h(${signature}) { }`,
      '}',
    ].join('\n');

  it('captures positional @Min(1) as a NUMBER value', () => {
    const src = javadocController('@RequestParam(defaultValue = "1", required = false) @Min(1) int page');
    const { node, source } = firstMethodOf(src);
    const params = parseParameters(node, source);
    expect(params).toHaveLength(1);
    expect(params[0].defaultValue).toBe('1');
    expect(params[0].required).toBe(false);
    expect(params[0].validation).toEqual([{ type: 'Min', value: 1 }]);
    expect(params[0].validation![0].value).toBe(1); // number, not string
  });

  it('captures the single-element array form @Size({1, 10}) as the "1-10" range', () => {
    const src = javadocController('@RequestParam @Size({1, 10}) String name');
    const { node, source } = firstMethodOf(src);
    const params = parseParameters(node, source);
    expect(params[0].validation).toEqual([{ type: 'Size', value: '1-10' }]);
  });

  it('keeps named @Size(min = 1, max = 10) working (regression)', () => {
    const src = javadocController('@RequestParam @Size(min = 1, max = 10) String name');
    const { node, source } = firstMethodOf(src);
    const params = parseParameters(node, source);
    expect(params[0].validation).toEqual([{ type: 'Size', value: '1-10' }]);
  });

  it('fills description from the adjacent javadoc @param when no @ApiParam/@Parameter exists', () => {
    const src = javadocController('@RequestParam int page');
    const { node, source } = firstMethodOf(src);
    const line = locationOf(node)!.startLine;
    const params = parseParameters(node, source, buildJavadocIndex(source), line);
    expect(params[0].description).toBe('the page');
  });

  it('prefers an explicit @ApiParam description over the javadoc @param', () => {
    const src = javadocController(
      '@ApiParam("explicit desc") @RequestParam int page',
      ['import io.swagger.annotations.ApiParam;'],
    );
    const { node, source } = firstMethodOf(src);
    const line = locationOf(node)!.startLine;
    const params = parseParameters(node, source, buildJavadocIndex(source), line);
    expect(params[0].description).toBe('explicit desc');
  });

  it('omits description when no javadoc index is passed (backward compatible)', () => {
    const src = javadocController('@RequestParam int page');
    const { node, source } = firstMethodOf(src);
    const params = parseParameters(node, source);
    expect(params[0].description).toBeUndefined();
  });
});
