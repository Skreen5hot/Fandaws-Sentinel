/**
 * Pre-Filter — Stage 1 validation gates for IVNE compilation.
 *
 * The pre-filter runs during the Flattening phase (τ_F) and rejects or
 * downgrades axioms that cannot be represented in the Fandaws Fragment.
 *
 * Each gate function returns a result object indicating whether the
 * axiom should be:
 *   - 'pass': Proceed with compilation
 *   - 'reject': Drop axiom entirely, emit SemanticLossRecord
 *   - 'flag': Compile but attach a warning/loss record
 *   - 'dual': Compile with dual representation (P8 cardinality)
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 9.1
 */

import { LOSS_TYPES, SEVERITY, createLoss } from './semantic-loss.js';

// ── Gate Result Factories ──

function pass() {
  return { action: 'pass', lossRecord: null };
}

function reject(lossRecord) {
  return { action: 'reject', lossRecord };
}

function flag(lossRecord) {
  return { action: 'flag', lossRecord };
}

function dual(lossRecord) {
  return { action: 'dual', lossRecord };
}

// ── Gate Functions ──

/**
 * Gate: OneOf (enumerated class) detection.
 *
 * Fandaws does not support closed-world enumeration.
 * Enumerated classes are rejected entirely.
 *
 * @param {object} axiom - Parsed axiom object
 * @param {string} axiom.type - Axiom type
 * @param {string[]} [axiom.individuals] - Enumerated individuals
 * @param {object} context - Compilation context
 * @param {string} context.sourceOntology - Source ontology IRI
 * @param {string} context.ivneRunId - Run ID
 * @returns {object} Gate result
 */
export function gateOneOf(axiom, context = {}) {
  if (axiom.type !== 'OneOf') return pass();

  const individuals = axiom.individuals || [];
  return reject(
    createLoss(LOSS_TYPES.enumerationDrop, {
      affectedConcepts: axiom.affectedClass ? [axiom.affectedClass] : [],
      sourceAxiom: axiom.sourceAxiom || `OneOf({${individuals.join(', ')}})`,
      compiledForm: '(dropped)',
      lostSemantics: `Enumerated class with ${individuals.length} individuals dropped. Fandaws does not support closed-world enumeration.`,
      sourceOntology: context.sourceOntology || '',
      ivneRunId: context.ivneRunId || '',
    }),
  );
}

/**
 * Gate: ComplementOf detection.
 *
 * The IVNE cannot represent negation-as-failure. Complement expressions
 * in subject or object position are rejected.
 *
 * @param {object} axiom - Parsed axiom object
 * @param {object} context - Compilation context
 * @returns {object} Gate result
 */
export function gateComplement(axiom, context = {}) {
  if (axiom.type !== 'ComplementOf') return pass();

  return reject(
    createLoss(LOSS_TYPES.complementDrop, {
      affectedConcepts: axiom.affectedClass ? [axiom.affectedClass] : [],
      sourceAxiom: axiom.sourceAxiom || `ComplementOf(${axiom.complement || '?'})`,
      compiledForm: '(dropped)',
      lostSemantics: 'Complement expression dropped. The IVNE cannot represent negation-as-failure.',
      sourceOntology: context.sourceOntology || '',
      ivneRunId: context.ivneRunId || '',
    }),
  );
}

/**
 * Gate: Property chain complexity check.
 *
 * Chains exceeding the configured threshold are flagged but retained.
 * No chain is rejected solely for length.
 *
 * @param {object} axiom - Parsed axiom with chain property
 * @param {object} context - Compilation context
 * @param {object} config - IVNE configuration
 * @param {number} [config.chainComplexityThreshold=3] - Max chain length before flagging
 * @returns {object} Gate result
 */
export function gatePropertyChain(axiom, context = {}, config = {}) {
  if (axiom.type !== 'PropertyChain') return pass();

  const { chainComplexityThreshold = 3 } = config;
  const chainLength = axiom.chain ? axiom.chain.length : 0;

  if (chainLength <= chainComplexityThreshold) return pass();

  return flag(
    createLoss(LOSS_TYPES.chainComplexityFlag, {
      affectedConcepts: [],
      sourceAxiom: axiom.sourceAxiom || `PropertyChain(${(axiom.chain || []).join(' ∘ ')})`,
      compiledForm: `owl:propertyChainAxiom with ${chainLength} hops (retained with complexity warning)`,
      lostSemantics: `Property chain has ${chainLength} hops, exceeding threshold of ${chainComplexityThreshold}. Retained but flagged for manual review.`,
      sourceOntology: context.sourceOntology || '',
      ivneRunId: context.ivneRunId || '',
    }),
  );
}

/**
 * Gate: Cardinality restriction handling.
 *
 * Cardinality restrictions use dual representation (P8):
 * - Existential component compiled as P5
 * - Full constraint preserved as CardinalityConstraint
 *
 * Min-cardinality-0 axioms (vacuously true) are dropped entirely.
 *
 * @param {object} axiom - Parsed cardinality restriction
 * @param {object} context - Compilation context
 * @returns {object} Gate result
 */
export function gateCardinality(axiom, context = {}) {
  if (axiom.type !== 'Cardinality') return pass();

  const min = axiom.minCardinality ?? null;
  const max = axiom.maxCardinality ?? null;
  const exact = axiom.exactCardinality ?? null;

  // Vacuous drop: min-cardinality-0 with no other constraints
  if (min === 0 && max === null && exact === null) {
    return reject(
      createLoss(LOSS_TYPES.vacuousDrop, {
        affectedConcepts: axiom.affectedClass ? [axiom.affectedClass] : [],
        sourceAxiom: axiom.sourceAxiom || `${axiom.affectedClass || '?'} SubClassOf (${axiom.property || '?'} min 0 ${axiom.filler || '?'})`,
        compiledForm: '(dropped)',
        lostSemantics: 'Min-cardinality-0 constraint is vacuously true. No semantic content lost.',
        sourceOntology: context.sourceOntology || '',
        ivneRunId: context.ivneRunId || '',
      }),
    );
  }

  // Dual representation for all other cardinality restrictions.
  // Loss record is emitted by the restriction-lifter, not the pre-filter.
  return dual(null);
}

/**
 * Gate: Cycle detection during expression traversal.
 *
 * @param {string} classIri - Current class being processed
 * @param {Set<string>} visitedSet - Set of previously visited class expression hashes
 * @param {object} context - Compilation context
 * @returns {object} Gate result
 */
export function gateCycle(classIri, visitedSet, context = {}) {
  if (!visitedSet.has(classIri)) return pass();

  return reject(
    createLoss(LOSS_TYPES.cycleDrop, {
      affectedConcepts: [classIri],
      sourceAxiom: `Cycle detected involving ${classIri}`,
      compiledForm: '(cyclic branch dropped)',
      lostSemantics: `Cyclic reference involving ${classIri} detected during expression traversal. The cyclic branch is dropped; non-cyclic components are compiled normally.`,
      sourceOntology: context.sourceOntology || '',
      ivneRunId: context.ivneRunId || '',
    }),
  );
}

/**
 * Gate: Maximum concepts safety limit.
 *
 * Prevents runaway memory consumption on large ontologies.
 *
 * @param {number} currentCount - Current number of compiled concepts
 * @param {object} config - IVNE configuration
 * @param {number} [config.maxConcepts=50000] - Safety limit
 * @returns {object} Gate result with action 'pass' or 'error'
 */
export function gateMaxConcepts(currentCount, config = {}) {
  const { maxConcepts = 50000 } = config;

  if (currentCount < maxConcepts) return pass();

  return {
    action: 'error',
    lossRecord: null,
    message: `Import exceeds maxConcepts limit (${maxConcepts}). Aborting compilation.`,
  };
}

// ── Helper ──

function formatCardinalityAxiom(axiom) {
  const cls = axiom.affectedClass || '?';
  const prop = axiom.property || '?';
  const filler = axiom.filler || '?';

  if (axiom.exactCardinality != null) {
    return `${cls} SubClassOf (${prop} exactly ${axiom.exactCardinality} ${filler})`;
  }
  if (axiom.minCardinality != null && axiom.maxCardinality != null) {
    return `${cls} SubClassOf (${prop} min ${axiom.minCardinality} max ${axiom.maxCardinality} ${filler})`;
  }
  if (axiom.minCardinality != null) {
    return `${cls} SubClassOf (${prop} min ${axiom.minCardinality} ${filler})`;
  }
  if (axiom.maxCardinality != null) {
    return `${cls} SubClassOf (${prop} max ${axiom.maxCardinality} ${filler})`;
  }
  return `${cls} SubClassOf (${prop} cardinality ${filler})`;
}
