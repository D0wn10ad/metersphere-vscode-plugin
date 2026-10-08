/**
 * Confined micro-build: bundle `java-parser@3.x` (ESM-only) into a committed
 * CommonJS file `vendor/java-parser.cjs` so the CommonJS extension host and the
 * ts-jest harness can `require()` it via `src/metersphere/javaAst/loadJavaParser.ts`.
 *
 * This is the ONLY permitted esbuild usage in this repo — the extension itself
 * ships as compiled `out/`, not as an esbuild bundle.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'node_modules', 'java-parser', 'src', 'index.js');
const outfile = path.join(root, 'vendor', 'java-parser.cjs');
const esbuildBin = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'
);

if (!existsSync(entry)) {
  console.error(
    `build:cst-vendor: missing entry ${entry}\n` +
      'Run `npm install` first (java-parser must be present in node_modules).'
  );
  process.exit(1);
}
if (!existsSync(esbuildBin)) {
  console.error(
    `build:cst-vendor: missing esbuild binary ${esbuildBin}\n` +
      'Run `npm install` first (esbuild is a devDependency).'
  );
  process.exit(1);
}

mkdirSync(path.dirname(outfile), { recursive: true });

const args = [
  entry,
  '--bundle',
  '--platform=node',
  '--format=cjs',
  `--outfile=${outfile}`,
];
const result = spawnSync(esbuildBin, args, { stdio: 'inherit', cwd: root });

if (result.error) {
  console.error(`build:cst-vendor: failed to launch esbuild: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`build:cst-vendor: esbuild exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}
console.log(`build:cst-vendor: wrote ${path.relative(root, outfile)}`);
