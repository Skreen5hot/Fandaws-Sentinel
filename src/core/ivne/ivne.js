/**
 * IVNE — Ingestion, Validation & Normalization Engine.
 *
 * Entry point: compile(parsedOntology, config)
 *
 * A deterministic compiler that maps OWL axioms into the Fandaws data model.
 * Pure function — holds no state between invocations.
 *
 * Transformation pipeline: τ = τ_N ∘ τ_R ∘ τ_F
 *   1. τ_F (Flatten): Compile class expressions into flat concept graphs
 *   2. τ_R (Lift): Reify restrictions into named or inlined properties
 *   3. τ_N (Normalize): Enforce canonical ordering and structural hashing
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md
 */

import { createIVNEConfiguration, createOntologyImportResult } from '../../types/ivne-types.js';
import { createScopeEntry } from '../../types/scope-configuration.js';
import { flatten } from './flattener.js';
import { liftRestrictions } from './restriction-lifter.js';
import { normalize } from './normalizer.js';
import { ManifestBuilder } from './reduction-manifest.js';
import { sha256Hex } from './sha256.js';
import { uuid5, FANDAWS_NAMESPACE } from '../knowledge-engine/uuid5.js';

// ── Input Validation ──

/**
 * Validate the parsedOntology input shape.
 *
 * @param {object} parsedOntology
 * @throws {Error} If input is invalid
 */
function validateInput(parsedOntology) {
  if (!parsedOntology || typeof parsedOntology !== 'object') {
    throw new Error('compile() requires a parsedOntology object');
  }
  if (!parsedOntology.ontologyIRI || typeof parsedOntology.ontologyIRI !== 'string') {
    throw new Error('parsedOntology must have an ontologyIRI string');
  }
  if (!Array.isArray(parsedOntology.classes)) {
    throw new Error('parsedOntology must have a classes array');
  }
}

// ── Public API ──

/**
 * Compile a parsed OWL ontology into Fandaws data model.
 *
 * @param {object} parsedOntology - Parsed OWL ontology
 * @param {string} parsedOntology.ontologyIRI - Source ontology IRI
 * @param {object[]} parsedOntology.classes - Named OWL classes
 * @param {object[]} [parsedOntology.properties=[]] - ObjectProperty declarations
 * @param {object[]} [parsedOntology.restrictions=[]] - Restriction axioms
 * @param {object[]} [parsedOntology.disjointness=[]] - Disjointness axioms
 * @param {object[]} [parsedOntology.equivalences=[]] - Equivalence axioms
 * @param {object[]} [parsedOntology.expressions=[]] - Compound class expressions
 * @param {object} [config={}] - IVNE configuration overrides
 * @returns {object} OntologyImportResult JSON-LD
 */
export function compile(parsedOntology, config = {}) {
  // Merge config with defaults
  const mergedConfig = createIVNEConfiguration(config);

  // Validate input
  validateInput(parsedOntology);

  // Create deterministic run context
  const runTimestamp = config.runTimestamp || new Date().toISOString();
  const ivneRunId = `ivne:run/${uuid5(FANDAWS_NAMESPACE, parsedOntology.ontologyIRI + ':' + runTimestamp)}`;
  const sourceHash = sha256Hex(JSON.stringify(parsedOntology));

  const context = {
    runTimestamp,
    ivneRunId,
    sourceOntology: parsedOntology.ontologyIRI,
    scope: config.scope || 'fandaws:scope/default',
  };

  // Initialize manifest builder
  const manifest = new ManifestBuilder({
    ivneRunId,
    sourceOntology: parsedOntology.ontologyIRI,
    sourceHash,
    compiledAt: runTimestamp,
    configUsed: mergedConfig,
  });

  // ── Phase 1: τ_F (Flattening) ──
  const flatResult = flatten(parsedOntology, mergedConfig, context);

  manifest.recordLosses(flatResult.lossRecords);
  manifest.recordRejections(flatResult.rejectedAxioms);
  manifest.recordIriMappings(flatResult.iriMappings);
  manifest.recordGeneratedConcepts(flatResult.generatedConcepts);

  // ── Phase 2: τ_R (Restriction Lifting) ──
  const conceptMap = new Map();
  for (const concept of flatResult.concepts) {
    conceptMap.set(concept['@id'], concept);
  }

  const liftResult = liftRestrictions(
    flatResult.restrictions,
    conceptMap,
    flatResult.lossRecords,
    mergedConfig,
    context,
  );

  manifest.recordLosses(liftResult.lossRecords);

  // ── Assemble output ──
  const concepts = flatResult.concepts;
  const relationships = []; // Populated from property entities in future phases

  // Count source axioms
  const totalSourceAxioms =
    (parsedOntology.classes || []).length +
    (parsedOntology.properties || []).length +
    (parsedOntology.restrictions || []).length +
    (parsedOntology.disjointness || []).length +
    (parsedOntology.equivalences || []).length +
    (parsedOntology.expressions || []).length;

  manifest.setStatistics({
    totalSourceAxioms,
    totalCompiledConcepts: concepts.length,
    totalProperties: flatResult.propertyEntities.length + liftResult.statistics.inlined,
    totalRelationships: relationships.length,
    totalPropertyChains: 0,
  });

  // Build reduction manifest
  const reductionManifest = manifest.build({
    fnsrChainSupport: mergedConfig.fnsrChainSupport,
    oceChainSupport: mergedConfig.oceChainSupport,
  });

  // Build scope entry
  const scopeEntry = createScopeEntry({
    graphId: `fandaws:graph/import/${uuid5(FANDAWS_NAMESPACE, parsedOntology.ontologyIRI)}`,
    label: `Import: ${parsedOntology.ontologyIRI}`,
    priority: 99,
    trustLevel: mergedConfig.defaultTrustLevel,
    staleCopyAction: mergedConfig.defaultStaleCopyAction,
  });

  // Assemble OntologyImportResult
  const result = createOntologyImportResult({
    sourceIRI: parsedOntology.ontologyIRI,
    concepts,
    relationships,
    unmappedEntities: flatResult.rejectedAxioms.map((r) => ({
      '@type': 'fandaws:UnmappedEntity',
      'fandaws:reason': r.reason,
      'fandaws:axiom': r.axiom,
    })),
    importMethod: 'owl',
    reductionManifest,
    cardinalityConstraints: liftResult.cardinalityConstraints,
    semanticLossRecords: [
      ...flatResult.lossRecords,
      ...liftResult.lossRecords,
    ],
    scopeEntry,
  });

  // Attach P2 equivalence merge descriptors for downstream Termidium
  if (flatResult.equivalenceDescriptors && flatResult.equivalenceDescriptors.length > 0) {
    result['fandaws:mergeDescriptors'] = flatResult.equivalenceDescriptors;
  }

  // ── Phase 3: τ_N (Normalization) ──
  const { normalized, canonicalJson, outputHash } = normalize(result, runTimestamp);

  // Attach output hash to the manifest within the normalized result
  normalized['fandaws:reductionManifest']['fandaws:outputHash'] = outputHash;

  return {
    result: normalized,
    canonicalJson,
    outputHash,
  };
}
