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