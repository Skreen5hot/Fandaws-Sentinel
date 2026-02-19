/**
 * Semantic Loss — enums, severity mappings, and helper factories.
 *
 * Every lossy IVNE transformation produces a SemanticLossRecord.
 * This module provides the enumeration of loss types, their default
 * severity levels, and downstream impact templates.
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 4
 */

import { createSemanticLossRecord, TRANSFORMATION_TYPE } from '../../types/ivne-types.js';

// ── Loss Type Enumeration ──

export const LOSS_TYPES = {
  intersectionFlattening: 'intersectionFlattening',
  unionGeneralization: 'unionGeneralization',
  cardinalityWeakening: 'cardinalityWeakening',
  complementDrop: 'complementDrop',
  enumerationDrop: 'enumerationDrop',
  vacuousDrop: 'vacuousDrop',
  universalWeakening: 'universalWeakening',
  chainComplexityFlag: 'chainComplexityFlag',
  cycleDrop: 'cycleDrop',
};

// ── Severity Enumeration ──

export const SEVERITY = {
  informational: 'informational',
  degraded: 'degraded',
  lossy: 'lossy',
};

// ── Default Severity per Loss Type ──

export const LOSS_SEVERITY_MAP = {
  [LOSS_TYPES.intersectionFlattening]: SEVERITY.informational,
  [LOSS_TYPES.unionGeneralization]: SEVERITY.lossy,
  [LOSS_TYPES.cardinalityWeakening]: SEVERITY.degraded,
  [LOSS_TYPES.complementDrop]: SEVERITY.lossy,
  [LOSS_TYPES.enumerationDrop]: SEVERITY.lossy,
  [LOSS_TYPES.vacuousDrop]: SEVERITY.informational,
  [LOSS_TYPES.universalWeakening]: SEVERITY.degraded,
  [LOSS_TYPES.chainComplexityFlag]: SEVERITY.degraded,
  [LOSS_TYPES.cycleDrop]: SEVERITY.lossy,
};

// ── Transformation Type Mapping ──

export const TRANSFORMATION_MAP = {
  [LOSS_TYPES.intersectionFlattening]: TRANSFORMATION_TYPE.MONOTONIC_REDUCTION,
  [LOSS_TYPES.unionGeneralization]: TRANSFORMATION_TYPE.GENERALIZATION,
  [LOSS_TYPES.cardinalityWeakening]: TRANSFORMATION_TYPE.STRUCTURAL_SHIFT,
  [LOSS_TYPES.complementDrop]: TRANSFORMATION_TYPE.REJECTION,
  [LOSS_TYPES.enumerationDrop]: TRANSFORMATION_TYPE.REJECTION,
  [LOSS_TYPES.vacuousDrop]: TRANSFORMATION_TYPE.CONSERVATIVE_EXTENSION,
  [LOSS_TYPES.universalWeakening]: TRANSFORMATION_TYPE.STRUCTURAL_SHIFT,
  [LOSS_TYPES.chainComplexityFlag]: TRANSFORMATION_TYPE.STRUCTURAL_SHIFT,
  [LOSS_TYPES.cycleDrop]: TRANSFORMATION_TYPE.REJECTION,
};

// ── Downstream Impact Templates ──

const IMPACT_TEMPLATES = {
  [LOSS_TYPES.intersectionFlattening]: {
    fnsr: { des: 'noImpact', css: 'noImpact', aps: 'noImpact', mdre: 'noImpact' },
    oce: 'noImpact',
    iee: 'noImpact',
    shml: 'noImpact',
  },
  [LOSS_TYPES.unionGeneralization]: {
    fnsr: { des: 'suppress', css: 'flagAsApproximate', aps: 'reduceStructuralSimilarityWeight', mdre: 'noImpact' },
    oce: 'advisoryOnly',
    iee: 'flagAsWeaklyGrounded',
    shml: 'markProvisional',
  },
  [LOSS_TYPES.cardinalityWeakening]: {
    fnsr: { des: 'useCardinalityConstraint', css: 'useCardinalityConstraint', aps: 'noImpact', mdre: 'noImpact' },
    oce: 'useCardinalityConstraint',
    iee: 'useCardinalityConstraint',
    shml: 'noImpact',
  },
  [LOSS_TYPES.complementDrop]: {
    fnsr: { des: 'suppress', css: 'flagAsApproximate', aps: 'reduceStructuralSimilarityWeight', mdre: 'noImpact' },
    oce: 'advisoryOnly',
    iee: 'flagAsWeaklyGrounded',
    shml: 'markProvisional',
  },
  [LOSS_TYPES.enumerationDrop]: {
    fnsr: { des: 'suppress', css: 'flagAsApproximate', aps: 'reduceStructuralSimilarityWeight', mdre: 'noImpact' },
    oce: 'advisoryOnly',
    iee: 'flagAsWeaklyGrounded',
    shml: 'markProvisional',
  },
  [LOSS_TYPES.vacuousDrop]: {
    fnsr: { des: 'noImpact', css: 'noImpact', aps: 'noImpact', mdre: 'noImpact' },
    oce: 'noImpact',
    iee: 'noImpact',
    shml: 'noImpact',
  },
  [LOSS_TYPES.universalWeakening]: {
    fnsr: { des: 'noImpact', css: 'noImpact', aps: 'noImpact', mdre: 'noImpact' },
    oce: 'advisoryOnly',
    iee: 'noImpact',
    shml: 'noImpact',
  },
  [LOSS_TYPES.chainComplexityFlag]: {
    fnsr: { des: 'noImpact', css: 'noImpact', aps: 'noImpact', mdre: 'materializeIfNeeded' },
    oce: 'advisoryOnly',
    iee: 'noImpact',
    shml: 'noImpact',
  },
  [LOSS_TYPES.cycleDrop]: {
    fnsr: { des: 'suppress', css: 'flagAsApproximate', aps: 'reduceStructuralSimilarityWeight', mdre: 'noImpact' },
    oce: 'advisoryOnly',
    iee: 'flagAsWeaklyGrounded',
    shml: 'markProvisional',
  },
};

// ── Public API ──

/**
 * Get the default downstream impact template for a loss type.
 *
 * @param {string} lossType - From LOSS_TYPES enum
 * @returns {object} Impact object with fnsr, oce, iee, shml keys
 */
export function defaultDownstreamImpact(lossType) {
  return IMPACT_TEMPLATES[lossType] || {
    fnsr: { des: 'noImpact', css: 'noImpact', aps: 'noImpact', mdre: 'noImpact' },
    oce: 'noImpact',
    iee: 'noImpact',
    shml: 'noImpact',
  };
}

/**
 * Create a SemanticLossRecord with auto-populated severity and downstream impact.
 *
 * Convenience wrapper around createSemanticLossRecord that fills in
 * severity from LOSS_SEVERITY_MAP and impact from templates.
 *
 * @param {string} lossType - From LOSS_TYPES enum
 * @param {object} params - Additional SemanticLossRecord params
 * @param {string[]} [params.affectedConcepts=[]] - IRIs of affected concepts
 * @param {string} params.sourceAxiom - Original OWL axiom
 * @param {string} params.compiledForm - What it was compiled to
 * @param {string} params.lostSemantics - Description of what was lost
 * @param {string} [params.sourceOntology=''] - Source ontology IRI
 * @param {string} [params.ivneRunId=''] - Run ID
 * @returns {object} SemanticLossRecord JSON-LD
 */
export function createLoss(lossType, params) {
  const severity = LOSS_SEVERITY_MAP[lossType];
  if (!severity) {
    throw new Error(`Unknown loss type: ${lossType}`);
  }

  let transformationType = TRANSFORMATION_MAP[lossType];
  if (transformationType === undefined) {
    console.warn(`[IVNE] Unknown lossType '${lossType}' — defaulting transformationType to 'rejection'`);
    transformationType = TRANSFORMATION_TYPE.REJECTION;
  }

  return createSemanticLossRecord({
    lossType,
    severity,
    transformationType,
    downstreamImpact: defaultDownstreamImpact(lossType),
    ...params,
  });
}
