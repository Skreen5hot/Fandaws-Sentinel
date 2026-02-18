/**
 * IVNE Type Factories — JSON-LD types for ontology import results.
 *
 * Follows the createX() factory pattern from routing-record.js and concept.js.
 * All types produce JSON-LD objects with @id and @type fields.
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md
 */

// ── IVNE Configuration Defaults ──

const IVNE_DEFAULTS = {
  locale: 'en',
  abbreviationTable: {},
  labelExtractionPriority: ['rdfs:label', 'skos:prefLabel', 'uriFragment'],
  hashPrefixLength: 12,
  chainComplexityThreshold: 3,
  defaultTrustLevel: 'experimental',
  defaultStaleCopyAction: 'fork',
  importRoots: null,
  excludePatterns: [],
  bfoAlignmentMode: 'auto',
  maxConcepts: 50000,
  fnsrChainSupport: false,
  oceChainSupport: false,
};

// ── Factory Functions ──

/**
 * Create an IVNEConfiguration with defaults merged.
 *
 * @param {object} [overrides={}] - Configuration overrides
 * @returns {object} Merged configuration object
 */
export function createIVNEConfiguration(overrides = {}) {
  return {
    '@type': 'ivne:Configuration',
    ...IVNE_DEFAULTS,
    ...overrides,
  };
}

/**
 * Create an OntologyImportResult — the top-level IVNE output.
 *
 * @param {object} params
 * @param {string} params.sourceIRI - Origin of the imported ontology
 * @param {object[]} [params.concepts=[]] - Compiled Fandaws concepts
 * @param {object[]} [params.relationships=[]] - Compiled relationships
 * @param {object[]} [params.unmappedEntities=[]] - Entities that could not be mapped
 * @param {string} [params.importMethod='owl'] - Source format
 * @param {object} params.reductionManifest - Compilation audit trail
 * @param {object[]} [params.cardinalityConstraints=[]] - Extracted cardinality constraints
 * @param {object[]} [params.semanticLossRecords=[]] - All loss records
 * @param {object} [params.scopeEntry=null] - Pre-configured ScopeEntry
 * @returns {object} JSON-LD OntologyImportResult
 */
export function createOntologyImportResult({
  sourceIRI,
  concepts = [],
  relationships = [],
  unmappedEntities = [],
  importMethod = 'owl',
  reductionManifest,
  cardinalityConstraints = [],
  semanticLossRecords = [],
  scopeEntry = null,
}) {
  return {
    '@type': 'fandaws:OntologyImportResult',
    'fandaws:sourceIRI': sourceIRI,
    'fandaws:concepts': concepts,
    'fandaws:relationships': relationships,
    'fandaws:unmappedEntities': unmappedEntities,
    'fandaws:importMethod': importMethod,
    'fandaws:reductionManifest': reductionManifest,
    'fandaws:cardinalityConstraints': cardinalityConstraints,
    'fandaws:semanticLossRecords': semanticLossRecords,
    'fandaws:scopeEntry': scopeEntry,
  };
}

/**
 * Create a SemanticLossRecord — documents a specific semantic loss during compilation.
 *
 * @param {object} params
 * @param {string} params.lossType - Loss category (from LOSS_TYPES enum)
 * @param {string} params.severity - 'informational' | 'degraded' | 'lossy'
 * @param {string[]} [params.affectedConcepts=[]] - IRIs of affected concepts
 * @param {string} params.sourceAxiom - Original OWL axiom (Manchester Syntax)
 * @param {string} params.compiledForm - What the axiom was compiled to
 * @param {string} params.lostSemantics - Human-readable description of what was lost
 * @param {object} [params.downstreamImpact={}] - Machine-readable impact per consumer
 * @param {string} [params.sourceOntology=''] - Source ontology IRI
 * @param {string} [params.ivneRunId=''] - IVNE compilation run ID
 * @returns {object} JSON-LD SemanticLossRecord
 */
export function createSemanticLossRecord({
  lossType,
  severity,
  affectedConcepts = [],
  sourceAxiom,
  compiledForm,
  lostSemantics,
  downstreamImpact = {},
  sourceOntology = '',
  ivneRunId = '',
}) {
  return {
    '@type': 'fandaws:SemanticLossRecord',
    'fandaws:lossType': lossType,
    'fandaws:severity': severity,
    'fandaws:affectedConcepts': affectedConcepts,
    'fandaws:sourceAxiom': sourceAxiom,
    'fandaws:compiledForm': compiledForm,
    'fandaws:lostSemantics': lostSemantics,
    'fandaws:downstreamImpact': downstreamImpact,
    'fandaws:sourceOntology': sourceOntology,
    'fandaws:ivneRunId': ivneRunId,
  };
}

/**
 * Create a ReductionManifest — top-level compilation audit trail.
 *
 * @param {object} params
 * @param {string} params.ivneRunId - Unique run identifier
 * @param {string} [params.ivneVersion='2.1'] - IVNE spec version
 * @param {string} params.sourceOntology - Source ontology IRI
 * @param {string} params.sourceHash - SHA-256 of source input
 * @param {string} params.compiledAt - ISO 8601 timestamp
 * @param {object} params.statistics - ManifestStatistics
 * @param {object[]} [params.lossRecords=[]] - All loss records
 * @param {object[]} [params.rejectedAxioms=[]] - Rejected axioms
 * @param {object[]} [params.validationFailures=[]] - Validator rejections
 * @param {object[]} [params.iriMappings=[]] - Source → Fandaws IRI mappings
 * @param {string[]} [params.generatedConcepts=[]] - Hash-based IRIs created
 * @param {object} [params.configUsed={}] - Configuration used for this run
 * @param {boolean} [params.chainConsumptionReady=false] - Whether FNSR/OCE support chains
 * @returns {object} JSON-LD ReductionManifest
 */
export function createReductionManifest({
  ivneRunId,
  ivneVersion = '2.1',
  sourceOntology,
  sourceHash,
  compiledAt,
  statistics,
  lossRecords = [],
  rejectedAxioms = [],
  validationFailures = [],
  iriMappings = [],
  generatedConcepts = [],
  configUsed = {},
  chainConsumptionReady = false,
}) {
  return {
    '@type': 'fandaws:ReductionManifest',
    'fandaws:ivneRunId': ivneRunId,
    'fandaws:ivneVersion': ivneVersion,
    'fandaws:sourceOntology': sourceOntology,
    'fandaws:sourceHash': sourceHash,
    'fandaws:compiledAt': compiledAt,
    'fandaws:statistics': statistics,
    'fandaws:lossRecords': lossRecords,
    'fandaws:rejectedAxioms': rejectedAxioms,
    'fandaws:validationFailures': validationFailures,
    'fandaws:iriMappings': iriMappings,
    'fandaws:generatedConcepts': generatedConcepts,
    'fandaws:configUsed': configUsed,
    'fandaws:chainConsumptionReady': chainConsumptionReady,
  };
}

/**
 * Create a CardinalityConstraint — P8 dual representation structural property.
 *
 * Enforces the consistency invariant from IVNE v2.1 Section 3.4:
 *   1. If exactCardinality is non-null, min and max must equal exact.
 *   2. If both min and max are non-null, min <= max.
 *   3. If min is non-null, min >= 0.
 *   4. If max is non-null, max >= 1.
 *
 * @param {object} params
 * @param {string} params.property - Property IRI being constrained
 * @param {string} params.constrainedClass - Class IRI the constraint is on
 * @param {number|null} [params.minCardinality=null] - Minimum count
 * @param {number|null} [params.maxCardinality=null] - Maximum count
 * @param {number|null} [params.exactCardinality=null] - Exact count
 * @param {string|null} [params.qualifiedOver=null] - Qualifier class IRI
 * @param {string} [params.sourceAxiom=''] - Original OWL axiom
 * @param {string} [params.reductionNote=''] - Human-readable reduction note
 * @returns {object} JSON-LD CardinalityConstraint
 * @throws {Error} If consistency invariant is violated
 */
export function createCardinalityConstraint({
  property,
  constrainedClass,
  minCardinality = null,
  maxCardinality = null,
  exactCardinality = null,
  qualifiedOver = null,
  sourceAxiom = '',
  reductionNote = '',
}) {
  // Consistency invariant (IVNE v2.1 Section 3.4)
  if (exactCardinality !== null) {
    if (minCardinality !== null && minCardinality !== exactCardinality) {
      throw new Error(
        `CardinalityConstraint invariant violated: exactCardinality=${exactCardinality} but minCardinality=${minCardinality}`,
      );
    }
    if (maxCardinality !== null && maxCardinality !== exactCardinality) {
      throw new Error(
        `CardinalityConstraint invariant violated: exactCardinality=${exactCardinality} but maxCardinality=${maxCardinality}`,
      );
    }
  }
  if (minCardinality !== null && maxCardinality !== null && minCardinality > maxCardinality) {
    throw new Error(
      `CardinalityConstraint invariant violated: minCardinality=${minCardinality} > maxCardinality=${maxCardinality}`,
    );
  }
  if (minCardinality !== null && minCardinality < 0) {
    throw new Error(
      `CardinalityConstraint invariant violated: minCardinality=${minCardinality} < 0`,
    );
  }
  if (maxCardinality !== null && maxCardinality < 1) {
    throw new Error(
      `CardinalityConstraint invariant violated: maxCardinality=${maxCardinality} < 1`,
    );
  }

  return {
    '@type': 'fandaws:CardinalityConstraint',
    'fandaws:property': property,
    'fandaws:constrainedClass': constrainedClass,
    'fandaws:minCardinality': exactCardinality !== null ? exactCardinality : minCardinality,
    'fandaws:maxCardinality': exactCardinality !== null ? exactCardinality : maxCardinality,
    'fandaws:exactCardinality': exactCardinality,
    'fandaws:qualifiedOver': qualifiedOver,
    'fandaws:sourceAxiom': sourceAxiom,
    'fandaws:reductionNote': reductionNote,
  };
}
