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

const result = await build({
  entryPoints: [resolve(root, 'src', 'index.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: resolve(outdir, 'fandaws.js'),
  minify: false,
  sourcemap: true,
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)
  .find((o) => o.entryPoint)?.bytes ?? 0;

console.log(`Built docs/dist/fandaws.js (${(bytes / 1024).toFixed(1)} KB)`);
