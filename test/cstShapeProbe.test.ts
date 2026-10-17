/**
 * CST shape probe tests (T1 of openapi-spec-coverage).
 *
 * Pins the AST/CST anchors the symbol index and OpenAPI builder will build on,
 * by asserting the ACTUAL node paths (exact child-key arrays and node-path
 * strings) — never merely "it did not throw". Probe-verified against
 * vendor/java-parser.cjs (java-parser 3.0.1).
 *
 * Anchors covered here:
 * - methodReturnType: `methodHeader.children.result[0]` → `unannType` text,
 *   `undefined` for `Void` / absent result (constructor/void → no response body).
 * - Modifiers: `methodModifier|classModifier|fieldModifier[]`, each entry
 *   `{annotation:[...]}` or `{Private:[...]}`; `fieldModifier` may be ABSENT
 *   for a no-modifier field → read with `?? []`.
 * - Field: `fieldDeclaration.children = ['fieldModifier','unannType',
 *   'variableDeclaratorList','Semicolon']`; name at
 *   `variableDeclaratorList → variableDeclarator → variableDeclaratorId → Identifier`.
 * - Enum: `enumDeclaration.children = ['Enum','typeIdentifier','enumBody']`;
 *   constant = `enumConstant.children.Identifier`.
 * - Record: `recordDeclaration → recordHeader → recordComponentList →
 *   recordComponent[]`; each `unannType` + `Identifier`.
 * - Interface: `interfaceDeclaration → normalInterfaceDeclaration →
 *   interfaceBody → interfaceMemberDeclaration → interfaceMethodDeclaration`;
 *   the method's TYPE rides on `methodHeader → result → unannType` (there is NO
 *   direct `unannType` child on `interfaceMethodDeclaration`), its name on
 *   `methodDeclarator → Identifier`. Interface constants are `constantDeclaration`
 *   nodes — java-parser 3.0.1 emits ZERO `fieldDeclaration` nodes inside an
 *   interface body (the plan's "fieldDeclaration also count" is wrong at 3.0.1).
 */

import { loadJavaParser } from '../src/metersphere/javaAst/loadJavaParser';
import { CstNode, CstToken, findFirst, findAll, text } from '../src/metersphere/javaAst/cstWalk';
import {
  annotationsFromFieldDeclaration,
  annotationsFromModifiers,
  methodReturnType,
  parseJavaCst,
} from '../src/metersphere/javaAst/cstJavaParser';

const parse = (src: string): CstNode => loadJavaParser().parse(src) as unknown as CstNode;

const SAMPLE = [
  'package com.example.demo;',
  'import org.springframework.web.bind.annotation.*;',
  '@RestController',
  'public class DemoController {',
  '  @GetMapping("/x")',
  '  public Response<Page<UserDto>> get() { return null; }',
  '  @DeleteMapping("/d")',
  '  public void del() {}',
  '}',
  'class UserDto {',
  '  @NotNull @Size(min = 1, max = 10) private String name;',
  '  String bare;',
  '}',
  'record Point(int x, int y) {}',
  'interface Repo {',
  '  String find(long id);',
  '  int COUNT = 1;',
  '}',
  'enum Status { ACTIVE, INACTIVE }',
].join('\n');

describe('cstShapeProbe — methodReturnType', () => {
  it('returns the trimmed unannType text for a generic return type', () => {
    const tree = parse(SAMPLE);
    const headers = findAll(tree, 'methodHeader');
    expect(headers.length).toBeGreaterThanOrEqual(2);
    // Anchor: methodHeader.children.result[0] → children.unannType
    const generic = headers[0];
    const result = generic.children['result'][0] as CstNode;
    expect(result.name).toBe('result');
    expect(Object.keys(result.children)).toContain('unannType');
    expect(methodReturnType(generic, SAMPLE)).toBe('Response<Page<UserDto>>');
  });

  it('returns undefined for a Void (void) result', () => {
    const tree = parse(SAMPLE);
    const headers = findAll(tree, 'methodHeader');
    const voidHeader = headers[1];
    const result = voidHeader.children['result'][0] as CstNode;
    expect(result.name).toBe('result');
    expect(Object.keys(result.children)).toEqual(['Void']); // ACTUAL node path
    expect(methodReturnType(voidHeader, SAMPLE)).toBeUndefined();
  });

  it('returns undefined when the methodHeader has no result child (constructor/absent)', () => {
    const ctorLike = { name: 'methodHeader', children: {} } as CstNode;
    expect(methodReturnType(ctorLike, SAMPLE)).toBeUndefined();
  });
});

describe('cstShapeProbe — modifiers / annotation reader reuse', () => {
  it('reads field annotations from fieldDeclaration.children.fieldModifier (annotation NODES)', () => {
    const tree = parse(SAMPLE);
    const fds = findAll(tree, 'fieldDeclaration');
    const annotated = fds[0];
    // ACTUAL node path: ['fieldModifier','unannType','variableDeclaratorList','Semicolon']
    expect(Object.keys(annotated.children)).toEqual([
      'fieldModifier',
      'unannType',
      'variableDeclaratorList',
      'Semicolon',
    ]);
    // Raw annotation NODES live on each fieldModifier entry (same shape as method/class).
    const mods = annotated.children['fieldModifier'] as CstNode[];
    expect(mods.map((m) => Object.keys(m.children))).toEqual([
      ['annotation'],
      ['annotation'],
      ['Private'],
    ]);
    const reads = annotationsFromFieldDeclaration(annotated, SAMPLE);
    expect(reads.map((r) => r.read.name)).toEqual(['NotNull', 'Size']);
    // `@Size(min = 1, max = 10)` named values survive as structured reads.
    expect(reads[1].read.values['min']).toEqual({ kind: 'number', value: 1 });
    expect(reads[1].read.values['max']).toEqual({ kind: 'number', value: 10 });
  });

  it('handles a no-modifier field (fieldModifier ABSENT → ?? [])', () => {
    const tree = parse(SAMPLE);
    const fds = findAll(tree, 'fieldDeclaration');
    const bare = fds[1];
    // ACTUAL node path: NO fieldModifier key at all when the field has no modifiers.
    expect(Object.keys(bare.children)).toEqual(['unannType', 'variableDeclaratorList', 'Semicolon']);
    expect(bare.children['fieldModifier']).toBeUndefined();
    expect(annotationsFromFieldDeclaration(bare, SAMPLE)).toEqual([]);
  });

  it('field name sits at variableDeclaratorList → variableDeclarator → variableDeclaratorId → Identifier', () => {
    const tree = parse(SAMPLE);
    const annotated = findAll(tree, 'fieldDeclaration')[0];
    const vdl = annotated.children['variableDeclaratorList'][0] as CstNode;
    expect(vdl.name).toBe('variableDeclaratorList');
    const vd = vdl.children['variableDeclarator'][0] as CstNode;
    const vdi = vd.children['variableDeclaratorId'][0] as CstNode;
    const idTok = vdi.children['Identifier'][0] as CstToken;
    expect(idTok.image).toBe('name');
  });

  it('annotationsFromModifiers still reads method/class modifier arrays (regression pin)', () => {
    const tree = parse(SAMPLE);
    const cd = findFirst(tree, 'classDeclaration')!;
    const classAnns = annotationsFromModifiers(cd.children['classModifier'] as CstNode[], SAMPLE);
    expect(classAnns.map((a) => a.read.name)).toEqual(['RestController']);
  });
});

describe('cstShapeProbe — record anchors', () => {
  it('walks recordDeclaration → recordHeader → recordComponentList → recordComponent[]', () => {
    const tree = parse(SAMPLE);
    const rd = findFirst(tree, 'recordDeclaration') as CstNode;
    // ACTUAL node path: ['Record','typeIdentifier','recordHeader','recordBody']
    expect(Object.keys(rd.children)).toEqual(['Record', 'typeIdentifier', 'recordHeader', 'recordBody']);

    const rh = rd.children['recordHeader'][0] as CstNode;
    expect(rh.name).toBe('recordHeader');
    expect(rh.children['recordComponentList']).toBeDefined();

    const rcl = rh.children['recordComponentList'][0] as CstNode;
    expect(rcl.name).toBe('recordComponentList');
    const comps = rcl.children['recordComponent'] as CstNode[];
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => (c.children['Identifier'][0] as CstToken).image)).toEqual(['x', 'y']);
    for (const c of comps) {
      expect(c.children['unannType']).toBeDefined();
    }
    expect(text(comps[0].children['unannType'][0], SAMPLE).trim()).toBe('int');
  });
});

describe('cstShapeProbe — interface anchors', () => {
  it('walks interfaceDeclaration → normalInterfaceDeclaration → interfaceBody → interfaceMemberDeclaration → interfaceMethodDeclaration', () => {
    const tree = parse(SAMPLE);
    const idec = findFirst(tree, 'interfaceDeclaration') as CstNode;
    expect(Object.keys(idec.children)).toEqual(['normalInterfaceDeclaration']);

    const nid = idec.children['normalInterfaceDeclaration'][0] as CstNode;
    expect(Object.keys(nid.children)).toEqual(['Interface', 'typeIdentifier', 'interfaceBody']);

    const ib = nid.children['interfaceBody'][0] as CstNode;
    const members = ib.children['interfaceMemberDeclaration'] as CstNode[];
    expect(members).toHaveLength(2);
    expect(members[0].children['interfaceMethodDeclaration']).toBeDefined();

    const imd = members[0].children['interfaceMethodDeclaration'][0] as CstNode;
    // ACTUAL shape: type rides on methodHeader — NO direct unannType child here.
    expect(Object.keys(imd.children)).toEqual(['methodHeader', 'methodBody']);
    expect(imd.children['unannType']).toBeUndefined();

    const mh = imd.children['methodHeader'][0] as CstNode;
    const result = mh.children['result'][0] as CstNode;
    expect(Object.keys(result.children)).toEqual(['unannType']);
    expect(methodReturnType(mh, SAMPLE)).toBe('String');
    const declarator = mh.children['methodDeclarator'][0] as CstNode;
    expect((declarator.children['Identifier'][0] as CstToken).image).toBe('find');
  });

  it('interface constants are constantDeclaration nodes (ZERO fieldDeclaration at java-parser 3.0.1)', () => {
    const tree = parse(SAMPLE);
    const idec = findFirst(tree, 'interfaceDeclaration') as CstNode;
    // The plan claims interface constants are fieldDeclarations — probe-verified FALSE at 3.0.1.
    expect(findAll(idec, 'fieldDeclaration')).toHaveLength(0);

    const cd = findFirst(idec, 'constantDeclaration') as CstNode;
    expect(cd).toBeDefined();
    expect(Object.keys(cd.children)).toEqual(['unannType', 'variableDeclaratorList', 'Semicolon']);
    expect(text(cd.children['unannType'][0], SAMPLE).trim()).toBe('int');

    const vdl = cd.children['variableDeclaratorList'][0] as CstNode;
    const vdi = (vdl.children['variableDeclarator'][0] as CstNode).children['variableDeclaratorId'][0] as CstNode;
    expect((vdi.children['Identifier'][0] as CstToken).image).toBe('COUNT');
    // No annotations on the constant → same `?? []` reader contract holds.
    expect(annotationsFromFieldDeclaration(cd, SAMPLE)).toEqual([]);
  });
});

describe('cstShapeProbe — enum anchors', () => {
  it("walks enumDeclaration ['Enum','typeIdentifier','enumBody'] and enumConstant.children.Identifier", () => {
    const tree = parse(SAMPLE);
    const ed = findFirst(tree, 'enumDeclaration') as CstNode;
    expect(Object.keys(ed.children)).toEqual(['Enum', 'typeIdentifier', 'enumBody']);
    const ec = findFirst(ed, 'enumConstant') as CstNode;
    expect(Object.keys(ec.children)).toEqual(['Identifier']);
    expect((ec.children['Identifier'][0] as CstToken).image).toBe('ACTIVE');
  });
});

describe('cstShapeProbe — adversarial: malformed input', () => {
  it('parseJavaCst still THROWS on malformed Java (dispatch fallback can catch it)', () => {
    expect(() => parseJavaCst('class Broken { void x( ', 'file:///Broken.java')).toThrow();
  });

  it('the helpers never swallow a malformed tree (they read only, no parse)', () => {
    // Reading a non-existent modifier array must be a safe empty read, NOT a fake success.
    const notAField = { name: 'fieldDeclaration', children: {} } as CstNode;
    expect(annotationsFromFieldDeclaration(notAField, SAMPLE)).toEqual([]);
    expect(methodReturnType(notAField, SAMPLE)).toBeUndefined();
  });
});
