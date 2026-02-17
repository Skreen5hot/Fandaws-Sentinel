#!/usr/bin/env node
/**
 * IRI Migration Script — migrate old-format IRIs to new UUID v5 format.
 *
 * Replaces:
 *   fandaws:concept/SLUG        → fandaws:class/{uuid5}/SLUG
 *   fandaws:restriction/SLUG    → fandaws:restriction/{uuid5}/SLUG
 *   fandaws:rel/SLUG            → fandaws:rel/{uuid5}/SLUG
 *   fandaws:property/SLUG       → fandaws:property/{uuid5}/SLUG
 *
 * UUID v5 inputs match the generators in iri-generator.js, so runtime
 * output is consistent with migrated test expectations.
 *
 * Usage:
 *   node scripts/migrate-iris.js              # Run migration
 *   node scripts/migrate-iris.js --dry-run    # Report changes without writing
 *   node scripts/migrate-iris.js --verify     # Check for remaining old-format IRIs
 *
 * Idempotent: running twice produces no changes on second run.
 *
 * @see iri-generator.js for the canonical IRI generation logic
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uuid5, FANDAWS_NAMESPACE } from '../src/core/knowledge-engine/uuid5.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_SCOPE = 'fandaws:scope/default';
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify');

// ── Directories to skip ──

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
const SKIP_RELATIVE = new Set([path.join('docs', 'dist')]);

// ── File Discovery ──

function findFiles(dir, exts = ['.js', '.json']) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const rel = path.relative(ROOT, fullPath);
      if (SKIP_RELATIVE.has(rel)) continue;
      results.push(...findFiles(fullPath, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      if (fullPath === __filename) continue;
      results.push(fullPath);
    }
  }
  return results;
}

// ── Slug Utilities ──

/** Reverse slugification: hyphens → spaces */
function deSlugify(slug) {
  return slug.replace(/-/g, ' ');
}

// ── New IRI Generators (matching iri-generator.js logic) ──

function migrateConceptIri(slug) {
  const canonical = deSlugify(slug);
  const hash = uuid5(FANDAWS_NAMESPACE, DEFAULT_SCOPE + ':' + canonical);
  return 'fandaws:class/' + hash + '/' + slug;
}

function migrateRestrictionIri(slug) {
  // Split on --, de-slugify each part, rejoin for UUID input
  const parts = slug.split('--');
  const canonical = parts.map(deSlugify).join('--');
  const hash = uuid5(FANDAWS_NAMESPACE, DEFAULT_SCOPE + ':' + canonical);
  return 'fandaws:restriction/' + hash + '/' + slug;
}

function migrateRelIri(slug) {
  const parts = slug.split('--');
  const canonical = parts.map(deSlugify).join('--');
  const hash = uuid5(FANDAWS_NAMESPACE, DEFAULT_SCOPE + ':' + canonical);
  return 'fandaws:rel/' + hash + '/' + slug;
}

function migratePropertyIri(slug) {
  const canonical = deSlugify(slug);
  const hash = uuid5(FANDAWS_NAMESPACE, DEFAULT_SCOPE + ':property:' + canonical);
  return 'fandaws:property/' + hash + '/' + slug;
}

// ── IRI Detection ──
//
// Slug character class: [a-z0-9-] but must start and end with [a-z0-9].
// Greedy match stops at first non-slug character (/, ', ", }, etc.).

const SLUG_PATTERN = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';

const CONCEPT_RE = new RegExp('fandaws:concept/(' + SLUG_PATTERN + ')', 'g');
const RESTRICTION_RE = new RegExp('fandaws:restriction/(' + SLUG_PATTERN + ')', 'g');
const REL_RE = new RegExp('fandaws:rel/(' + SLUG_PATTERN + ')', 'g');
const PROPERTY_RE = new RegExp('fandaws:property/(' + SLUG_PATTERN + ')', 'g');

/** Check if a slug looks like an already-migrated UUID prefix */
function isUuidPrefix(slug) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]/.test(slug);
}

// ── Migration Logic ──

function migrateContent(content) {
  const replacements = new Map();

  // Concept IRIs: fandaws:concept/SLUG → fandaws:class/{uuid}/SLUG
  for (const match of content.matchAll(CONCEPT_RE)) {
    const oldIri = match[0];
    const slug = match[1];
    if (!replacements.has(oldIri)) {
      replacements.set(oldIri, migrateConceptIri(slug));
    }
  }

  // Restriction IRIs (skip already-migrated)
  for (const match of content.matchAll(RESTRICTION_RE)) {
    const oldIri = match[0];
    const slug = match[1];
    if (isUuidPrefix(slug)) continue;
    if (!replacements.has(oldIri)) {
      replacements.set(oldIri, migrateRestrictionIri(slug));
    }
  }

  // Relationship IRIs (skip already-migrated)
  for (const match of content.matchAll(REL_RE)) {
    const oldIri = match[0];
    const slug = match[1];
    if (isUuidPrefix(slug)) continue;
    if (!replacements.has(oldIri)) {
      replacements.set(oldIri, migrateRelIri(slug));
    }
  }

  // Property IRIs (skip already-migrated)
  for (const match of content.matchAll(PROPERTY_RE)) {
    const oldIri = match[0];
    const slug = match[1];
    if (isUuidPrefix(slug)) continue;
    if (!replacements.has(oldIri)) {
      replacements.set(oldIri, migratePropertyIri(slug));
    }
  }

  if (replacements.size === 0) {
    return { content, changeCount: 0 };
  }

  // Sort by old IRI length (longest first) to avoid substring conflicts
  const sorted = [...replacements.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );

  let modified = content;
  let changeCount = 0;

  for (const [oldIri, newIri] of sorted) {
    const parts = modified.split(oldIri);
    const count = parts.length - 1;
    if (count > 0) {
      modified = parts.join(newIri);
      changeCount += count;
    }
  }

  return { content: modified, changeCount };
}

// ── Verification ──

function verifyContent(content, relPath) {
  const violations = [];

  // Old-format concept IRIs (should all be migrated to fandaws:class/)
  for (const match of content.matchAll(/fandaws:concept\/[a-z0-9][a-z0-9-]*/g)) {
    violations.push({ file: relPath, pattern: match[0] });
  }

  // Old-format restriction IRIs (no UUID between prefix and slug)
  for (const match of content.matchAll(RESTRICTION_RE)) {
    if (!isUuidPrefix(match[1])) {
      violations.push({ file: relPath, pattern: match[0] });
    }
  }

  // Old-format rel IRIs
  for (const match of content.matchAll(REL_RE)) {
    if (!isUuidPrefix(match[1])) {
      violations.push({ file: relPath, pattern: match[0] });
    }
  }

  // Old-format property IRIs
  for (const match of content.matchAll(PROPERTY_RE)) {
    if (!isUuidPrefix(match[1])) {
      violations.push({ file: relPath, pattern: match[0] });
    }
  }

  return violations;
}

// ── Main ──

function main() {
  const files = findFiles(ROOT);
  console.log('Found ' + files.length + ' files to process.\n');

  if (VERIFY_ONLY) {
    let totalViolations = 0;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(ROOT, file);
      const violations = verifyContent(content, relPath);
      for (const v of violations) {
        console.log('  VIOLATION: ' + v.file + ' → ' + v.pattern);
        totalViolations++;
      }
    }
    console.log('\nVerification complete: ' + totalViolations + ' remaining old-format IRIs.');
    process.exit(totalViolations > 0 ? 1 : 0);
  }

  // Migration mode
  let totalChanges = 0;
  let filesChanged = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const { content: migrated, changeCount } = migrateContent(content);

    if (changeCount > 0) {
      const relPath = path.relative(ROOT, file);
      console.log('  ' + relPath + ': ' + changeCount + ' replacements');
      totalChanges += changeCount;
      filesChanged++;

      if (!DRY_RUN) {
        fs.writeFileSync(file, migrated, 'utf-8');
      }
    }
  }

  const mode = DRY_RUN ? '[DRY RUN] ' : '';
  console.log('\n' + mode + 'Migration complete: ' + totalChanges + ' replacements across ' + filesChanged + ' files.');

  if (!DRY_RUN) {
    console.log('Run with --verify to confirm no old-format IRIs remain.');
  }
}

main();
