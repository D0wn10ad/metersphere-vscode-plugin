/**
 * Tests for the CST-based Java parser (java-parser / Chevrotain).
 *
 * `parseJavaCst` walks real annotation NODES (never substring tests), reads each
 * class's OWN annotation list (never a file-wide first-@RequestMapping scan), and
 * reproduces the public `ParseResult` shape from `../javaParser`. Parameters are
 * T7's job — `parseJavaCst` deliberately emits `parameters: []`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseJavaCst } from '../src/metersphere/javaAst/cstJavaParser';
import { ParseResult } from '../src/metersphere/javaParser';

const fixture = (name: string): string =>
  fs.readFileSync(path.join(__dirname, 'fixtures', 'java', name), 'utf8');

const controller = (mapping: string, extraImports: string[] = []): string =>
  [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    'import org.springframework.web.bind.annotation.RequestMethod;',
    ...extraImports,
    '@RestController',
    'public class C {',
    `  ${mapping}`,
    '  public void h() { }',
    '}',
  ].join('\n');

describe('cstJavaParser', () => {
  describe('killer-probe fixture', () => {
    let result: ParseResult;

    beforeAll(() => {
      result = parseJavaCst(fixture('killer-probe.java'), 'file:///killer-probe.java');
    });

    it('extracts the controller class with its base path', () => {
      expect(result.classes).toHaveLength(1);
      const cls = result.classes[0];
      expect(cls.name).toBe('CartController');
      expect(cls.isRestController).toBe(true);
      expect(cls.isController).toBe(true);
      expect(cls.basePath).toBe('/api');
    });

    it('yields path === "/a" from the ARRAY first-element form', () => {
      expect(result.apis).toHaveLength(2);
      expect(result.apis[0].path).toBe('/a');
      expect(result.apis[0].fullPath).toBe('/api/a');
    });

    it('collapses {GET, HEAD} to GET, never POST', () => {
      const legacy = result.apis[1];
      expect(legacy.method).toBe('GET');
      expect(legacy.method).not.toBe('POST');
      expect(legacy.path).toBe('/legacy');
      expect(legacy.fullPath).toBe('/api/legacy');
    });

    it('prefers @Operation(summary) for the summary', () => {
      expect(result.apis[0].summary).toBe('Get a cart');
    });

    it('falls back to "METHOD /path" when no summary annotation exists', () => {
      expect(result.apis[1].summary).toBe('GET /legacy');
    });

    it('emits a REAL position (1-based line, never 0)', () => {
      for (const api of result.apis) {
        expect(api.position).toBeDefined();
        expect(api.position!.line).toBeGreaterThan(0);
        expect(api.position!.column).toBeGreaterThanOrEqual(0);
      }
      expect(result.apis[0].position!.line).toBe(26); // @GetMapping line
      expect(result.apis[1].position!.line).toBe(33); // @RequestMapping line
    });

    it('extracts parameters via the composed param parser (T7+T8)', () => {
      expect(result.apis[0].parameters).toHaveLength(2);
      expect(result.apis[0].parameters[0].name).toBe('q');
      expect(result.apis[0].parameters[0].in).toBe('query');
      expect(result.apis[1].parameters).toEqual([]); // method 2 has no parameters
    });
  });

  describe('class detection', () => {
    it('skips a @Service class that has @RequestMapping (no false positive)', () => {
      const src = [
        'package com.example.demo;',
        'import org.springframework.stereotype.Service;',
        'import org.springframework.web.bind.annotation.RequestMapping;',
        '@Service',
        '@RequestMapping("/svc")',
        'public class HelperService {',
        '  @RequestMapping("/do")',
        '  public void doWork() {',
        '  }',
        '}',
      ].join('\n');
      const result = parseJavaCst(src, 'file:///HelperService.java');
      expect(result.classes).toEqual([]);
      expect(result.apis).toEqual([]);
    });

    it('recognizes plain @Controller (non-REST) classes', () => {
      const src = [
        'package com.example.demo;',
        'import org.springframework.stereotype.Controller;',
        '@Controller',
        'public class PageController {',
        '}',
      ].join('\n');
      const result = parseJavaCst(src, 'file:///PageController.java');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].isController).toBe(true);
      expect(result.classes[0].isRestController).toBe(false);
      expect(result.apis).toEqual([]);
    });

    it('extracts only the controller class from a multi-class file (per-class check)', () => {
      const src = [
        'package com.example.demo;',
        'import org.springframework.stereotype.Service;',
        'import org.springframework.web.bind.annotation.GetMapping;',
        'import org.springframework.web.bind.annotation.RestController;',
        '@Service',
        'public class HelperService {',
        '}',
        '@RestController',
        'public class RealController {',
        '  @GetMapping("/x")',
        '  public String x() { return "x"; }',
        '}',
      ].join('\n');
      const result = parseJavaCst(src, 'file:///multi.java');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('RealController');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('/x');
    });

    it('returns empty for a file with only an interface', () => {
      const src = [
        'package com.example.demo;',
        'public interface Foo {',
        '  void bar();',
        '}',
      ].join('\n');
      const result = parseJavaCst(src, 'file:///Foo.java');
      expect(result.classes).toEqual([]);
      expect(result.apis).toEqual([]);
    });
  });

  describe('mapping annotations and verbs', () => {
    it.each([
      ['@GetMapping("/g")', 'GET'],
      ['@PostMapping("/p")', 'POST'],
      ['@PutMapping("/pu")', 'PUT'],
      ['@DeleteMapping("/d")', 'DELETE'],
      ['@PatchMapping("/pa")', 'PATCH'],
    ])('maps %s to %s', (mapping, verb) => {
      const result = parseJavaCst(controller(mapping), 'file:///C.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe(verb);
    });

    it('resolves method = RequestMethod.POST on a method-level @RequestMapping', () => {
      const result = parseJavaCst(
        controller('@RequestMapping(value = "/m", method = RequestMethod.POST)'),
        'file:///C.java',
      );
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('POST');
    });

    it('collapses a lone RequestMethod.HEAD to GET', () => {
      const result = parseJavaCst(
        controller('@RequestMapping(value = "/h", method = RequestMethod.HEAD)'),
        'file:///C.java',
      );
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
    });

    it('defaults a method-level @RequestMapping without method to GET', () => {
      const result = parseJavaCst(controller('@RequestMapping("/n")'), 'file:///C.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
    });

    it('reads the path= named form for both class and method mappings', () => {
      const src = [
        'package com.example.demo;',
        'import org.springframework.web.bind.annotation.*;',
        '@RestController',
        '@RequestMapping(path = "/base")',
        'public class C {',
        '  @GetMapping(path = "/item")',
        '  public void i() { }',
        '}',
      ].join('\n');
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.classes[0].basePath).toBe('/base');
      expect(result.apis[0].path).toBe('/item');
      expect(result.apis[0].fullPath).toBe('/base/item');
    });

    it('handles a mapping annotation with no path (pathless)', () => {
      const src = [
        'package com.example.demo;',
        'import org.springframework.web.bind.annotation.*;',
        '@RestController',
        '@RequestMapping("/base")',
        'public class C {',
        '  @GetMapping',
        '  public void p() { }',
        '}',
      ].join('\n');
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('');
      expect(result.apis[0].fullPath).toBe('/base');
      expect(result.apis[0].summary).toBe('GET /');
    });
  });

  describe('summary chain', () => {
    it('uses @Description as the summary fallback (swagger-core)', () => {
      const result = parseJavaCst(
        controller('@GetMapping("/t")', ['import io.swagger.v3.oas.annotations.tags.Description;']).replace(
          '  @GetMapping("/t")',
          '  @Description("Does the thing")\n  @GetMapping("/t")',
        ),
        'file:///C.java',
      );
      expect(result.apis[0].summary).toBe('Does the thing');
    });

    it('prefers @ApiOperation(value) over the fallback', () => {
      const result = parseJavaCst(
        controller('@GetMapping("/l")', ['import io.swagger.annotations.ApiOperation;']).replace(
          '  @GetMapping("/l")',
          '  @ApiOperation(value = "Legacy op")\n  @GetMapping("/l")',
        ),
        'file:///C.java',
      );
      expect(result.apis[0].summary).toBe('Legacy op');
    });

    it('prefers @Operation(summary) over @ApiOperation', () => {
      const result = parseJavaCst(
        controller('@GetMapping("/o")', [
          'import io.swagger.annotations.ApiOperation;',
          'import io.swagger.v3.oas.annotations.Operation;',
        ]).replace(
          '  @GetMapping("/o")',
          '  @Operation(summary = "V3 op")\n  @ApiOperation(value = "Legacy op")\n  @GetMapping("/o")',
        ),
        'file:///C.java',
      );
      expect(result.apis[0].summary).toBe('V3 op');
    });
  });

  describe('returnType + responseStatus (T2)', () => {
    const parse = (methodDecl: string, imports: string[] = []): ParseResult =>
      parseJavaCst(
        [
          'package com.example.demo;',
          'import org.springframework.web.bind.annotation.*;',
          'import org.springframework.http.HttpStatus;',
          'import org.springframework.web.bind.annotation.ResponseStatus;',
          ...imports,
          '@RestController',
          'public class C {',
          methodDecl,
          '}',
        ].join('\n'),
        'file:///C.java',
      );

    it('captures the declared return type text', () => {
      const result = parse('  @GetMapping("/x")\n  public Response<X> m() { return null; }');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].returnType).toBe('Response<X>');
    });

    it('captures @ResponseStatus(HttpStatus.CREATED) as 201 (positional identifier)', () => {
      const result = parse(
        '  @ResponseStatus(HttpStatus.CREATED)\n  @PostMapping("/x")\n  public X m() { return null; }',
      );
      expect(result.apis[0].responseStatus).toBe(201);
    });

    it('captures the named form @ResponseStatus(code = HttpStatus.NOT_FOUND) as 404', () => {
      const result = parse(
        '  @ResponseStatus(code = HttpStatus.NOT_FOUND)\n  @GetMapping("/x")\n  public void m() { }',
      );
      expect(result.apis[0].responseStatus).toBe(404);
    });

    it('leaves returnType undefined for void methods', () => {
      const result = parse('  @GetMapping("/x")\n  public void m() { }');
      expect(result.apis[0].returnType).toBeUndefined();
    });

    it('leaves responseStatus undefined for an unknown status enum name', () => {
      const result = parse(
        '  @ResponseStatus(HttpStatus.SOMETHING_ELSE)\n  @GetMapping("/x")\n  public X m() { return null; }',
      );
      expect(result.apis[0].responseStatus).toBeUndefined();
    });

    it('omits both fields entirely when no @ResponseStatus and void (regex-parser parity: no crash)', () => {
      const result = parse('  @GetMapping("/x")\n  public void m() { }');
      expect(result.apis[0]).not.toHaveProperty('responseStatus');
    });
  });
});

describe('cstJavaParser — auth annotation capture (T9)', () => {
  const parse = (methodAnnotations: string, classAnnotations = '@RestController'): ParseResult =>
    parseJavaCst(
      [
        'package com.example.demo;',
        'import org.springframework.web.bind.annotation.*;',
        'import org.springframework.security.access.prepost.PreAuthorize;',
        'import javax.annotation.security.PermitAll;',
        'import org.springframework.security.access.annotation.Secured;',
        classAnnotations,
        'public class C {',
        `  ${methodAnnotations}`,
        '  @GetMapping("/x")',
        '  public void m() { }',
        '}',
      ].join('\n'),
      'file:///C.java',
    )

  it('captures @PreAuthorize on a method as secured', () => {
    const result = parse('@PreAuthorize("hasRole(\'ADMIN\')")')
    expect(result.apis[0].secured).toBe(true)
  })

  it('captures @PermitAll as permitAll', () => {
    const result = parse('@PermitAll')
    expect(result.apis[0].permitAll).toBe(true)
  })

  it('captures class-level @Secured on the class, not the api', () => {
    const result = parse('', '@RestController @Secured("ROLE_ADMIN")')
    expect(result.classes[0].secured).toBe(true)
    expect(result.apis[0].secured).toBeUndefined()
  })

  it('no auth annotations → neither flag set', () => {
    const result = parse('')
    expect(result.apis[0].secured).toBeUndefined()
    expect(result.apis[0].permitAll).toBeUndefined()
    expect(result.classes[0].secured).toBeUndefined()
  })
})
