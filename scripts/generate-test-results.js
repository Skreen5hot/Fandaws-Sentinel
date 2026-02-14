/**
 * Parses Jest JSON output → docs/data/test-results.json for the stakeholder UI.
 *
 * Usage: npm run test:json && node scripts/generate-test-results.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const inputPath = resolve(root, 'test-results.json');
const outputDir = resolve(root, 'docs', 'data');
const outputPath = resolve(outputDir, 'test-results.json');

let raw;
try {
  raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
} catch {
  console.error('No test-results.json found. Run `npm run test:json` first.');
  process.exit(1);
}

const suites = raw.testResults.map((suite) => {
  const name = suite.name
    .replace(/\\/g, '/')
    .split('tests/')[1] || suite.name;

  return {
    name,
    passed: suite.numPassingTests,
    failed: suite.numFailingTests,
    skipped: suite.numPendingTests,
    duration: suite.perfStats
      ? suite.perfStats.end - suite.perfStats.start
      : 0,
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  success: raw.success,
  totalSuites: raw.numTotalTestSuites,
  passedSuites: raw.numPassedTestSuites,
  failedSuites: raw.numFailedTestSuites,
  totalTests: raw.numTotalTests,
  passedTests: raw.numPassedTests,
  failedTests: raw.numFailedTests,
  skippedTests: raw.numPendingTests,
  suites,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(summary, null, 2));
console.log(
  `Generated docs/data/test-results.json (${summary.passedTests}/${summary.totalTests} passed)`
);
