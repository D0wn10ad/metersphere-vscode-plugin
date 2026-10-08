/**
 * Tests for the CST-first dual-parser dispatcher.
 *
 * Asserts the deterministic precedence: CST first, regex fallback ONLY on a CST
 * throw or a suspicious zero-API result (controller annotation present), and every
 * fallback logged via DebugLogger (never silent).
 */

import { parseJava } from '../src/metersphere/javaParserDispatch';
import { DebugLogger } from '../src/metersphere/debugLogger';

const VALID_CONTROLLER = [
  'package com.example.demo;',
  'import org.springframework.web.bind.annotation.*;',
  '@RestController',
  '@RequestMapping("/api")',
  'public class C {',
  '  @GetMapping("/x")',
  '  public String x() { return "x"; }',
  '}',
].join('\n');

const MALFORMED = 'this is not java @@@';

describe('javaParserDispatch', () => {
  it('reports engine === "cst" for a valid controller file', () => {
    const { result, engine } = parseJava(VALID_CONTROLLER, 'file:///C.java');
    expect(engine).toBe('cst');
    expect(result.apis).toHaveLength(1);
    expect(result.apis[0].path).toBe('/x');
    expect(result.apis[0].fullPath).toBe('/api/x');
  });

  it('falls back to regex when the CST throws, and logs the fallback', () => {
    const spy = jest.spyOn(DebugLogger, 'log').mockImplementation(() => {});
    const { engine } = parseJava(MALFORMED, 'file:///bad.java');
    expect(engine).toBe('regex');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('yields a ParseResult via regex for a syntactically invalid file rather than propagating the throw', () => {
    const { result, engine } = parseJava(MALFORMED, 'file:///bad.java');
    expect(engine).toBe('regex');
    expect(result).toBeDefined();
    expect(result.classes).toEqual([]);
    expect(result.apis).toEqual([]);
  });

  it('does NOT fall back when the CST legitimately finds zero APIs on a non-controller file', () => {
    const spy = jest.spyOn(DebugLogger, 'log').mockImplementation(() => {});
    const src = 'package com.example.demo;\npublic class Plain { public void m() {} }';
    const { engine } = parseJava(src, 'file:///Plain.java');
    expect(engine).toBe('cst');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('falls back when the CST returns zero APIs despite a controller annotation', () => {
    const spy = jest.spyOn(DebugLogger, 'log').mockImplementation(() => {});
    const src = [
      'package com.example.demo;',
      'import org.springframework.web.bind.annotation.*;',
      '@RestController',
      'public class NoMappings {',
      '  public void plain() { }',
      '}',
    ].join('\n');
    const { engine } = parseJava(src, 'file:///NoMappings.java');
    expect(engine).toBe('regex');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
