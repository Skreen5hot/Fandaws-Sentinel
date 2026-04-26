/**
 * Build script for Fandaws Sentinel.
 *
 * Uses esbuild to bundle src/index.js → docs/dist/fandaws.js
 * ESM format, browser target, no minification (readability for stakeholder review).
 */

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outdir = resolve(root, 'docs', 'dist');

// Ensure output directory exists
mkdirSync(outdir, { recursive: true });

// Externalize Node-only built-ins. The crypto-shim has a runtime fallback
// `await import('node:crypto')` for Node consumers; in the browser the
// Web Crypto path executes first and the Node import is never reached at
// runtime, but esbuild's static analysis still tries to resolve it. Marking
// node:* + bare 'fs'/'path'/etc. as external leaves the import as-is in
// the output (browser never executes the Node branch).
const NODE_EXTERNALS = [
  'node:crypto', 'node:fs', 'node:path', 'node:os', 'node:url', 'node:child_process',
  'fs', 'path', 'os', 'crypto', 'child_process', 'readline-sync',
];

const result = await build({
  entryPoints: [resolve(root, 'src', 'index.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: resolve(outdir, 'fandaws.js'),
  minify: false,
  sourcemap: true,
  metafile: true,
  external: NODE_EXTERNALS,
});

const bytes = Object.values(result.metafile.outputs)
  .find((o) => o.entryPoint)?.bytes ?? 0;

console.log(`Built docs/dist/fandaws.js (${(bytes / 1024).toFixed(1)} KB)`);
