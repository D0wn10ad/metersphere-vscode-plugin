/**
 * Tests for the CST Javadoc baseline and the corrected LSP enrichment.
 *
 * The CST parser path defaults each ParsedApi.summary to the ADJACENT Javadoc
 * summary (the Javadoc whose endLine is exactly declarationLine - 1) when no
 * explicit annotation provides one, and description to the Javadoc body when there
 * is no @Operation/@ApiOperation. JavaParser.enhanceWithJavadoc stays an OPTIONAL
 * LSP enrichment layer, fixed to pass a 0-based Position (line - 1) to the hover
 * provider and to guard the MarkdownString | MarkedString union.
 */

import { parseJavaCst } from '../src/metersphere/javaAst/cstJavaParser';
import { JavaParser, ParseResult } from '../src/metersphere/javaParser';

interface MockConfig {
  hover?: (...args: unknown[]) => unknown;
  symbols?: (...args: unknown[]) => unknown;
  extensions?: Array<{ id: string }>;
  documents?: Record<string, string>;
  delayMs?: number;
}

function setMock(cfg: MockConfig): void {
  (globalThis as unknown as { __vscodeMock?: MockConfig }).__vscodeMock = {
    extensions: [],
    documents: {},
    delayMs: 0,
    ...cfg,
  };
}

afterEach(() => {
  (globalThis as unknown as { __vscodeMock?: MockConfig }).__vscodeMock = undefined;
});

const controller = (body: string): string =>
  [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    'import io.swagger.v3.oas.annotations.Operation;',
    '@RestController',
    'public class C {',
    body,
    '}',
  ].join('\n');

describe('javadocEnrichment', () => {
  describe('CST Javadoc baseline', () => {
    it('defaults the summary to the adjacent Javadoc summary when there is no @Operation', () => {
      const src = controller(
        ['/** Get a cart by id. */', '  @GetMapping("/a")', '  public String a() { return "x"; }'].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.apis[0].summary).toBe('Get a cart by id.');
    });

    it('lets an explicit @Operation(summary) win over Javadoc', () => {
      const src = controller(
        [
          '/** Javadoc summary. */',
          '  @Operation(summary = "Operation wins")',
          '  @GetMapping("/b")',
          '  public String b() { return "x"; }',
        ].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.apis[0].summary).toBe('Operation wins');
    });

    it('falls back to the generated summary when neither Javadoc nor @Operation exists', () => {
      const src = controller(
        ['  @GetMapping("/c")', '  public String c() { return "x"; }'].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.apis[0].summary).toBe('GET /c');
    });

    it('does not leak an earlier method Javadoc into a later method (adjacency)', () => {
      const src = controller(
        [
          '/** First method docs. */',
          '  @GetMapping("/one")',
          '  public String one() { return "x"; }',
          '',
          '  @GetMapping("/two")',
          '  public String two() { return "x"; }',
        ].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.apis[0].summary).toBe('First method docs.');
      expect(result.apis[1].summary).toBe('GET /two');
    });

    it('sets description to the Javadoc body when there is no @Operation/@ApiOperation', () => {
      const src = controller(
        [
          '/** First line summary.',
          '   * Second line body.',
          '   */',
          '  @GetMapping("/d")',
          '  public String d() { return "x"; }',
        ].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.apis[0].summary).toBe('First line summary.');
      expect(result.apis[0].description).toContain('Second line body.');
    });

    it('does not set description from Javadoc when an @Operation is present', () => {
      const src = controller(
        [
          '/** Javadoc body. */',
          '  @Operation(summary = "Op summary")',
          '  @GetMapping("/e")',
          '  public String e() { return "x"; }',
        ].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      expect(result.apis[0].summary).toBe('Op summary');
      expect(result.apis[0].description).toBeUndefined();
    });
  });

  describe('LSP enrichment (optional layer)', () => {
    it('passes a 0-based Position (line - 1) to the hover provider, never the raw 1-based line', async () => {
      const captured: unknown[][] = [];
      setMock({
        extensions: [{ id: 'redhat.java' }],
        hover: (...args: unknown[]) => {
          captured.push(args);
          return [{ contents: [{ value: 'Hover summary' }] }];
        },
      });
      const src = controller(
        ['  @GetMapping("/h")', '  public String h() { return "x"; }'].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      const methodLine1Based = result.apis[0].position!.line;
      expect(methodLine1Based).toBeGreaterThan(0);

      const enhanced = await JavaParser.enhanceWithJavadoc(result, 'file:///C.java');

      expect(captured).toHaveLength(1);
      const [uri, position] = captured[0] as [{ fsPath: string }, { line: number; character: number }];
      expect(uri.fsPath).toBe('file:///C.java');
      expect(position.line).toBe(methodLine1Based - 1);
      expect(position.line).not.toBe(methodLine1Based);
      expect(position.line).not.toBe(0);
      expect(enhanced.apis[0].summary).toBe('Hover summary');
    });

    it('guards the MarkdownString | MarkedString union (plain string content)', async () => {
      setMock({
        extensions: [{ id: 'redhat.java' }],
        hover: () => [{ contents: ['Plain string hover'] }],
      });
      const src = controller(
        ['  @GetMapping("/s")', '  public String s() { return "x"; }'].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      const enhanced = await JavaParser.enhanceWithJavadoc(result, 'file:///C.java');
      expect(enhanced.apis[0].summary).toBe('Plain string hover');
    });

    it('returns the CST result unchanged and never throws when the java extension is absent', async () => {
      setMock({ extensions: [] });
      const src = controller(
        ['  @GetMapping("/n")', '  public String n() { return "x"; }'].join('\n'),
      );
      const result: ParseResult = parseJavaCst(src, 'file:///C.java');
      const before = result.apis[0].summary;
      const enhanced = await JavaParser.enhanceWithJavadoc(result, 'file:///C.java');
      expect(enhanced.apis[0].summary).toBe(before);
    });

    it('never overrides an explicit @Operation summary via the LSP layer', async () => {
      setMock({
        extensions: [{ id: 'redhat.java' }],
        hover: () => [{ contents: [{ value: 'Hover should not win' }] }],
      });
      const src = controller(
        [
          '  @Operation(summary = "Explicit op")',
          '  @GetMapping("/o")',
          '  public String o() { return "x"; }',
        ].join('\n'),
      );
      const result = parseJavaCst(src, 'file:///C.java');
      const enhanced = await JavaParser.enhanceWithJavadoc(result, 'file:///C.java');
      expect(enhanced.apis[0].summary).toBe('Explicit op');
    });
  });
});
