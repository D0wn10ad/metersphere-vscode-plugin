import * as fs from 'fs';
import * as path from 'path';
import type * as JavaParserModule from 'java-parser';

/**
 * Loads the java-parser CST engine from the vendored CommonJS bundle.
 *
 * java-parser@3.x is ESM-only: its package.json "exports" maps "." to ./src/index.js,
 * which is an ES module, so a direct `require('java-parser')` throws
 * `ERR_REQUIRE_ESM` / `Cannot use import statement outside a module`. We therefore
 * vendor a CommonJS build at vendor/java-parser.cjs (see scripts/build-cst-vendor.mjs)
 * and load it here with require().
 *
 * The bundle is committed and ships in the VSIX, so it is present in BOTH the jest
 * harness (ts-jest compiles from src/) and the packaged extension (compiled to out/).
 * The two candidate paths below cover those two layouts:
 *   - ts-jest:  src/metersphere/javaAst/  -> ../../../vendor/java-parser.cjs  (repo root)
 *   - compiled: out/src/metersphere/javaAst/ -> ../../../../vendor/java-parser.cjs (repo root)
 */
export function loadJavaParser(): typeof JavaParserModule {
  const candidates = [
    path.resolve(__dirname, '../../../vendor/java-parser.cjs'),
    path.resolve(__dirname, '../../../../vendor/java-parser.cjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(candidate) as typeof JavaParserModule;
    }
  }

  throw new Error(
    'java-parser CST bundle not found. Run `npm run build:cst-vendor` to generate vendor/java-parser.cjs.'
  );
}