import * as fs from 'fs';
import * as path from 'path';
import { buildJavadocIndex } from '../src/metersphere/javaAst/javadocIndex';

const FIXTURE = path.join(__dirname, 'fixtures', 'java', 'killer-probe.java');
const source = fs.readFileSync(FIXTURE, 'utf8');

describe('buildJavadocIndex', () => {
  const index = buildJavadocIndex(source);

  it('resolves the method Javadoc whose endLine is nearest strictly above the declaration', () => {
    // The method Javadoc `/** Get a cart by id. */` is on line 24; the method
    // declaration (`@Operation`) starts on line 25.
    const body = index.forLine(25);
    expect(body).toBe('Get a cart by id.');
  });

  it('summaryFor returns the first non-empty, non-@ line', () => {
    expect(index.summaryFor(25)).toBe('Get a cart by id.');
  });

  it('resolves the class Javadoc for the class declaration', () => {
    // The class Javadoc `/** Cart REST API. */` is on line 19; the class
    // declaration (`@RestController`) starts on line 20.
    const body = index.forLine(20);
    expect(body).toBe('Cart REST API.');
  });

  it('ignores a line comment (//) and non-Javadoc block comments', () => {
    // Build an index over a source that contains only a `//` line comment and a
    // `/* */` block comment — neither should be returned.
    const src = [
      '// a line comment',
      '/* a block comment */',
      'class Foo {}',
    ].join('\n');
    const idx = buildJavadocIndex(src);
    expect(idx.forLine(3)).toBeUndefined();
    expect(idx.summaryFor(3)).toBeUndefined();
  });

  it('returns undefined for a file with zero comments', () => {
    const idx = buildJavadocIndex('class Foo {}');
    expect(idx.forLine(1)).toBeUndefined();
    expect(idx.summaryFor(1)).toBeUndefined();
  });

  it('returns undefined when no Javadoc precedes the requested line', () => {
    // Line 1 is above every comment, so nothing precedes it.
    expect(index.forLine(1)).toBeUndefined();
  });
});
describe('buildJavadocIndex — robustness + multi-line @param', () => {
  it('does not throw on malformed source and degrades to an empty index', () => {
    const idx = buildJavadocIndex('class @@@ {{{ not java');
    expect(idx.forLine(1)).toBeUndefined();
    expect(idx.summaryFor(1)).toBeUndefined();
  });

  it('joins a multi-line @param description up to the next @tag', () => {
    const src = [
      'class C {',
      '  /**',
      '   * Does something.',
      '   * @param id the identifier',
      '   *     which spans multiple lines',
      '   * @return nothing',
      '   */',
      '  void m(int id) {}',
      '}',
    ].join('\n');
    const idx = buildJavadocIndex(src);
    expect(idx.paramForAdjacent(8, 'id')).toBe('the identifier which spans multiple lines');
  });

  it('stops the multi-line description at the next @tag', () => {
    const src = [
      'class C {',
      '  /**',
      '   * @param id first line',
      '   * @param other second param',
      '   */',
      '  void m(int id, int other) {}',
      '}',
    ].join('\n');
    const idx = buildJavadocIndex(src);
    expect(idx.paramForAdjacent(6, 'id')).toBe('first line');
    expect(idx.paramForAdjacent(6, 'other')).toBe('second param');
  });
});
