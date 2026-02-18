/**
 * Restriction Lifter (τ_R) — reifies anonymous restrictions into named/inlined nodes.
 *
 * After the Flattener (τ_F) produces restriction descriptors, this module
 * determines whether each restriction should be:
 *   1. Inlined as a property on the parent concept (simple, singly-referenced)
 *   2. Named as a generated concept with its own IRI (complex or multiply-referenced)
 *
 * The Safe Re-folding Rule (spec Section 7.2) governs this decision.
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 7
 */

import { generateUniqueHashIri } from './ivne-iri-generator.js';
import { generatePropertyIri } from '../knowledge-engine/iri-generator.js';
import { simplify } from '../identity/identity-simplification.js';
import { LOSS_TYPES, createLoss } from './semantic-loss.js';
import { createCardinalityConstraint } from '../../types/ivne-types.js';

// ── Reference Counting ──

/**
 * Count how many concepts reference each restriction descriptor.
 *
 * @param {object[]} restrictions - Restriction descriptors from flattener
 * @returns {Map<string, number>} Map of restriction key → reference count
 */
function countReferences(restrictions) {
  const counts = new Map();
  for (const r of restrictions) {
    const key = restrictionKey(r);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * Compute a stable key for a restriction descriptor.
 */
function restrictionKey(restriction) {
  return `${restriction.classIri}|${restriction.property}|${restriction.filler}|${restriction.quantifier}`;
}

// ── Anchor Detection ──

/**
 * Check whether a restriction is anchored (referenced in disjointness,
 * equivalence, property chain, domain/range, or another restriction's filler).
 *
 * Anchored restrictions MUST remain as named nodes.
 *
 * @param {object} restriction - Restriction descriptor
 * @param {object} context - Lift context with anchored set
 * @returns {boolean}
 */
function isAnchored(restriction, context) {
  const key = restrictionKey(restriction);
  return context.anchoredRestrictions.has(key);
}

/**
 * Check whether a restriction carries a lossy SemanticLossRecord.
 *
 * Lossy restrictions MUST remain as named nodes so downstream consumers
 * can identify them.
 *
 * @param {object} restriction - Restriction descriptor
 * @param {object[]} lossRecords - All loss records from flattening
 * @returns {boolean}
 */
function isLossCarrying(restriction, lossRecords) {
  return lossRecords.some(
    (lr) =>
      lr['fandaws:severity'] === 'lossy' &&
      lr['fandaws:affectedConcepts'] &&
      lr['fandaws:affectedConcepts'].includes(restriction.classIri),
  );
}

// ── Safe Re-folding Rule ──

/**
 * Determine whether a restriction can be safely re-folded inline.
 *
 * A restriction MAY be inlined IF AND ONLY IF:
 *   1. Reference count == 1 (only one parent class)
 *   2. Not anchored (not in disjointness, equivalence, chain, domain/range, filler)
 *   3. Not loss-carrying (no lossy SemanticLossRecord)
 *
 * @param {object} restriction - Restriction descriptor
 * @param {object} context - Lift context
 * @returns {boolean} True if safe to inline
 */
function canRefold(restriction, context) {
  const key = restrictionKey(restriction);
  const refCount = context.refCounts.get(key) || 0;

  if (refCount !== 1) return false;
  if (isAnchored(restriction, context)) return false;
  if (isLossCarrying(restriction, context.lossRecords)) return false;

  return true;
}

// ── Property Inlining ──

/**
 * Inline a restriction as a property on its parent concept.
 *
 * @param {object} restriction - Restriction descriptor
 * @param {Map<string, object>} conceptMap - IRI → concept node
 * @param {object} config - IVNE config
 * @param {object} runContext - Run context
 */
function inlineRestriction(restriction, conceptMap, config, runContext) {
  const concept = conceptMap.get(restriction.classIri);
  if (!concept) return;

  const scope = runContext.scope || 'fandaws:scope/default';
  const { canonicalLabel: propLabel } = simplify(restriction.property, {
    locale: config.locale || 'en',
  });
  const propIri = generatePropertyIri(propLabel, scope);

  const property = {
    '@type': 'fandaws:Property',
    '@id': propIri,
    'fandaws:canonicalLabel': propLabel,
    'fandaws:displayLabel': restriction.property,
    'fandaws:value': restriction.filler,
    'fandaws:quantifier': restriction.quantifier || 'existential',
    'shml:epistemicStatus': 'imported',
  };

  concept['fandaws:properties'].push(property);
}

// ── Named Restriction Creation ──

/**
 * Create a named restriction node with its own hash-based IRI.
 *
 * @param {object} restriction - Restriction descriptor
 * @param {object} hashContext - Hash IRI generation context
 * @param {object} config - IVNE config
 * @param {object} runContext - Run context
 * @returns {object} Named restriction node
 */
function nameRestriction(restriction, hashContext, config, runContext) {
  const { iri, expression } = generateUniqueHashIri(
    'restriction',
    [restriction.property, restriction.filler || ''],
    hashContext,
  );

  return {
    '@id': iri,
    '@type': 'fandaws:RestrictionNode',
    'fandaws:onClass': restriction.classIri,
    'fandaws:onProperty': restriction.property,
    'fandaws:filler': restriction.filler,
    'fandaws:quantifier': restriction.quantifier || 'existential',
    'fandaws:generatedFrom': expression,
    'fandaws:sourceAxiom': restriction.sourceAxiom || '',
    'shml:epistemicStatus': 'imported',
    'fandaws:sourceOntology': runContext.sourceOntology || '',
  };
}

// ── Cardinality Dual Representation ──

/**
 * Create a CardinalityConstraint for a cardinality restriction.
 *
 * @param {object} restriction - Restriction descriptor with cardinality info
 * @param {object} runContext - Run context
 * @returns {object|null} CardinalityConstraint or null if not a cardinality restriction
 */
function createCardinalityFromRestriction(restriction, runContext) {
  if (!restriction.cardinality) return null;

  const { min, max, exact, qualifiedOver } = restriction.cardinality;

  return createCardinalityConstraint({
    property: restriction.property,
    constrainedClass: restriction.classIri,
    minCardinality: exact !== null ? exact : min,
    maxCardinality: exact !== null ? exact : max,
    exactCardinality: exact,
    qualifiedOver: qualifiedOver || null,
    sourceAxiom: restriction.sourceAxiom || '',
    reductionNote: 'Existential component compiled as P5. Full cardinality preserved for OCE/IEE consumption.',
  });
}

// ── Public API ──

/**
 * Lift restriction descriptors into named or inlined property nodes.
 *
 * This is the τ_R phase of the IVNE transformation pipeline.
 *
 * @param {object[]} restrictions - Restriction descriptors from flattener
 * @param {Map<string, object>} conceptMap - IRI → concept node
 * @param {object[]} lossRecords - Loss records from flattening
 * @param {object} config - IVNE configuration
 * @param {object} runContext - Compilation context
 * @param {Set<string>} [anchoredRestrictions=new Set()] - Keys of anchored restrictions
 * @returns {object} Lift result
 */
export function liftRestrictions(restrictions, conceptMap, lossRecords, config, runContext, anchoredRestrictions = new Set()) {
  const refCounts = countReferences(restrictions);

  const context = {
    refCounts,
    anchoredRestrictions,
    lossRecords,
  };

  const hashContext = {
    existing: new Set(),
    generatedFromMap: new Map(),
    config,
  };

  const namedRestrictions = [];
  const cardinalityConstraints = [];
  const newLossRecords = [];
  const inlinedCount = { value: 0 };
  const namedCount = { value: 0 };

  for (const restriction of restrictions) {
    // Handle cardinality dual representation
    if (restriction.cardinality) {
      const cc = createCardinalityFromRestriction(restriction, runContext);
      if (cc) {
        cardinalityConstraints.push(cc);
      }
      // The existential component is still processed below as a normal restriction
    }

    // Emit universalWeakening loss for P6 universal restrictions
    if (restriction.quantifier === 'universal') {
      newLossRecords.push(
        createLoss(LOSS_TYPES.universalWeakening, {
          affectedConcepts: [restriction.classIri],
          sourceAxiom: restriction.sourceAxiom || '',
          compiledForm: `${restriction.classIri} fandaws:Property(${restriction.property}, universal, ${restriction.filler})`,
          lostSemantics: 'Universal quantifier weakened. OWL "only" constraint compiled as advisory universal property; open-world assumption not enforceable in Fandaws single-tree model.',
          sourceOntology: runContext.sourceOntology || '',
          ivneRunId: runContext.ivneRunId || '',
        }),
      );
    }

    if (canRefold(restriction, context)) {
      // Safe to inline
      inlineRestriction(restriction, conceptMap, config, runContext);
      inlinedCount.value++;
    } else {
      // Must name
      const named = nameRestriction(restriction, hashContext, config, runContext);
      namedRestrictions.push(named);
      namedCount.value++;
    }
  }

  return {
    namedRestrictions,
    cardinalityConstraints,
    lossRecords: newLossRecords,
    statistics: {
      totalRestrictions: restrictions.length,
      inlined: inlinedCount.value,
      named: namedCount.value,
      cardinalityConstraints: cardinalityConstraints.length,
    },
  };
}
