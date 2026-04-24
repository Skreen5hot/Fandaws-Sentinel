#!/usr/bin/env node
/**
 * D1.6 Signature Extraction + Production Routing Demo — CCO Core subset
 *
 * Week 7 extension: adds end-to-end Band 4 scaffold-to-production hardening
 * validation. After Signature extraction, realizable-entity CAUs (those with
 * bfo:isRealizedIn restrictions) are routed through
 * routeRealizableCAUViaCuratedLists — the SME-approved production path per
 * Week 6 Checkbox 1 signoff.
 *
 * For SME Checkpoint 2 (Week 3) through Week 7 hardening.
 *
 * Run: node scripts/d16-cco-demo.js
 * Run a specific class: node scripts/d16-cco-demo.js cco:AgentRole
 *
 * Output format:
 *   - One block per CAU: Signature fields, reproducibility hash
 *   - For realizable CAUs: additional block showing curated-list routing
 *   - Overall timing summary at the end
 *
 * Replacement path: point FIXTURE_PATH at the real CCO Core module for
 * production-scale calibration (expect ~100 classes, ~60s extraction on
 * standard hardware per spec §2.5 performance expectation).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { extractCAUSignature, hashSignature } from '../src/core/d16/cau-signature.js';
import { turtleToTriples, compactSignature, compactIRI } from '../src/core/d16/turtle-to-triples.js';
import { routeRealizableCAUViaCuratedLists, evaluateAllHelpers } from '../src/core/d16/critical-nc-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = resolve(__dirname, '../specs/d16/fixtures/cco-core-demo-subset.ttl');

async function main() {
  const targetCAU = process.argv[2]; // optional: limit to one class

  console.log('='.repeat(78));
  console.log('D1.6 CAU Signature Extraction Demo — CCO Core subset');
  console.log('Fixture:', FIXTURE_PATH);
  console.log('='.repeat(78));

  const turtle = readFileSync(FIXTURE_PATH, 'utf8');
  const parseStart = Date.now();
  const { triples, prefixes } = await turtleToTriples(turtle);
  const parseTime = Date.now() - parseStart;
  console.log(`\nParsed ${triples.length} triples in ${parseTime}ms.`);
  console.log(`Namespaces: ${Object.keys(prefixes).join(', ')}\n`);

  const ccoClasses = discoverCAUs(triples, prefixes, 'cco');
  const candidates = targetCAU
    ? ccoClasses.filter(c => c.compact === targetCAU || c.full === targetCAU)
    : ccoClasses;

  if (candidates.length === 0) {
    console.error(`No CAUs matched ${targetCAU ? `target: ${targetCAU}` : 'discovery filter'}`);
    process.exit(1);
  }

  console.log(`Extracting Signatures for ${candidates.length} CAU${candidates.length === 1 ? '' : 's'}:\n`);

  const extractStart = Date.now();
  for (const cau of candidates) {
    await printSignatureBlock(cau.full, cau.compact, triples, prefixes);
  }
  const extractTime = Date.now() - extractStart;

  console.log('='.repeat(78));
  console.log(`Extracted ${candidates.length} Signatures in ${extractTime}ms.`);
  console.log(`Average: ${(extractTime / candidates.length).toFixed(1)}ms per CAU.`);
  console.log('='.repeat(78));
}

function discoverCAUs(triples, prefixes, prefixFilter) {
  const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  const expansion = prefixes[prefixFilter];
  const classes = new Set();
  for (const t of triples) {
    if (t.predicate === RDF_TYPE && t.object === OWL_CLASS) {
      if (!expansion || t.subject.startsWith(expansion)) classes.add(t.subject);
    }
  }
  return [...classes].sort().map(full => ({
    full,
    compact: compactIRI(full, prefixes),
  }));
}

async function printSignatureBlock(fullIRI, compactIRI, triples, prefixes) {
  const rawSig = extractCAUSignature(fullIRI, triples);
  const cycleTrace = rawSig._cycleTrace;
  const droppedAxioms = rawSig._droppedAxioms;
  delete rawSig._cycleTrace;
  delete rawSig._droppedAxioms;
  const sig = compactSignature({ ...rawSig, cauIRI: compactIRI }, prefixes);
  const hash = await hashSignature(sig);

  console.log('─'.repeat(78));
  console.log(`CAU: ${compactIRI}  (${fullIRI})`);
  console.log('─'.repeat(78));

  printField('propertyRestrictionsAsDomain', sig.propertyRestrictionsAsDomain);
  printField('propertyRestrictionsAsRange', sig.propertyRestrictionsAsRange);
  printField('disjointnessAssertions', sig.disjointnessAssertions);
  printField('equivalenceClaims', sig.equivalenceClaims);
  printField('existentialRestrictions', sig.existentialRestrictions);
  printField('universalRestrictions', sig.universalRestrictions);
  printField('cardinalityRestrictions', sig.cardinalityRestrictions);
  printField('hasValueRestrictions', sig.hasValueRestrictions);
  printField('characteristics', sig.characteristics);
  printField('normalizedEnumerations', sig.normalizedEnumerations);
  console.log(`  subPropertyClosureUsed: ${JSON.stringify(sig.subPropertyClosureUsed)}`);
  console.log(`  cycleDetectionTriggered: ${sig.cycleDetectionTriggered}`);
  if (cycleTrace) console.log(`  cycleTrace (internal): ${JSON.stringify(cycleTrace)}`);
  if (droppedAxioms) console.log(`  droppedAxioms (internal): ${JSON.stringify(droppedAxioms)}`);
  console.log(`  reproducibilityHash (SHA-256): ${hash}`);

  // Band 4 scaffold-to-production hardening: if this CAU has isRealizedIn
  // restrictions, route it through routeRealizableCAUViaCuratedLists to show
  // end-to-end production path (Signature extraction → curated-list routing).
  const realizationTargets = extractRealizationTargets(sig);
  if (realizationTargets.length > 0) {
    const helperResults = evaluateAllHelpers({ realizationTargets });
    const routing = routeRealizableCAUViaCuratedLists({ realizationTargets });
    console.log('');
    console.log(`  ── Production routing (SME-approved curated-list path) ──`);
    console.log(`  realizationTargets: ${JSON.stringify(realizationTargets)}`);
    console.log(`  helper results:`);
    console.log(`    social_institutional (RoleNC3): ${helperResults.social.result}`);
    console.log(`    design_expected (FunctionNC3):  ${helperResults.design.result}`);
    console.log(`    causal_triggering (DispositionNC3): ${helperResults.causal.result}`);
    console.log(`  matchCount: ${helperResults.matchCount}${helperResults.multiCategory ? ' (MULTI-CATEGORY)' : ''}`);
    console.log(`  routing decision: ${routing.disposition}${routing.bfoCategory ? ' → ' + routing.bfoCategory : ''}`);
    if (routing.routedBy) console.log(`  routedBy: ${routing.routedBy}`);
    if (routing.multiCategoryOverlapDetected) console.log(`  multiCategoryOverlapDetected: true (routed to Plausible with analyst note per SME 2026-04-22)`);
  }
  console.log('');
}

/**
 * Extract realization-target IRIs from a Signature by scanning
 * existentialRestrictions for entries whose onProperty is bfo:isRealizedIn
 * (symbolic or numeric form).
 */
function extractRealizationTargets(signature) {
  const IS_REALIZED_IN_IRIS = new Set([
    'bfo:0000054',
    'bfo:isRealizedIn',
    'http://purl.obolibrary.org/obo/BFO_0000054',
  ]);
  const targets = [];
  for (const r of signature.existentialRestrictions || []) {
    if (IS_REALIZED_IN_IRIS.has(r.onProperty)) {
      targets.push(r.someValuesFrom);
    }
  }
  return targets;
}

function printField(name, value) {
  if (Array.isArray(value) && value.length === 0) {
    console.log(`  ${name}: []`);
    return;
  }
  console.log(`  ${name}:`);
  if (Array.isArray(value)) {
    for (const entry of value) {
      console.log(`    - ${JSON.stringify(entry)}`);
    }
  } else {
    console.log(`    ${JSON.stringify(value)}`);
  }
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
