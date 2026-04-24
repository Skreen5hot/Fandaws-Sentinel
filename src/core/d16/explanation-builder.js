/**
 * Explanation Builder — D1.6 §7.2.
 *
 * Per-disposition production emitters producing structured (machine-readable
 * JSON only, no prose) explanations that satisfy DP-2-R1 + I2a.
 *
 * Axiom evidence references the session's axiomDictionary by ID rather than
 * inlining axiom text per DP-2-R5 + I4 (Dictionary Discipline).
 *
 * Per `dp2-explanation-mandatory-plausible` negative assertion, Plausible
 * explanations MUST NOT contain free-form prose — only structured JSON.
 *
 * v1.1.0 extension fields (validationState, conflictAnnotation,
 * reconciliationHistory) are populated per §7.2 v1.1.0 schema discipline.
 *
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §4.2
 * Decisions: D2.1 (axiomDictionary content-hash), D2.3 (reconciliationHistory),
 *            D2.4 (NotApplicable mechanism closed enum), F3 (no terminal provisional)
 */

import { internAxiom } from './axiom-dictionary.js';

const NA_ROUTING_MECHANISMS = new Set(['automatic', 'default_axiom_poor', 'manual']);

/**
 * Entailed: necessary conditions satisfied. Explanation carries the axiom
 * evidence supporting each satisfied NC plus alternatives rejected.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {string} input.bfoCategory - the Entailed category
 * @param {Array<object>} input.satisfiedNCs - [{iri, axioms: [axiom], bfoCategoryAffected}]
 * @param {Array<object>} [input.alternativesConsidered] - [{bfoCategory, result}]
 * @param {Array<object>} [input.reasoningSteps] - reasoner trace entries
 * @param {string} [input.validationState] - defaults to 'not_inherited'
 * @param {object | null} [input.conflictAnnotation] - defaults to null
 * @param {Array<object>} [input.reconciliationHistory] - defaults to []
 * @returns {Promise<object>} explanation per §7.2
 */
export async function buildEntailedExplanation(input) {
  const {
    cauIRI, sessionId, bfoCategory, satisfiedNCs,
    alternativesConsidered = [], reasoningSteps = [],
    validationState = 'not_inherited',
    conflictAnnotation = null,
    reconciliationHistory = [],
  } = input;

  assertBfoCategory(bfoCategory);
  assertSatisfiedNCs(satisfiedNCs);
  assertTerminalValidationState(validationState);

  const axiomEvidence = [];
  for (const nc of satisfiedNCs) {
    for (const axiom of (nc.axioms || [])) {
      const { id } = await internAxiom({ sessionId, axiom });
      axiomEvidence.push({
        axiomIRI: id,
        axiomKind: axiom.kind || 'necessaryConditionAxiom',
        contributionRole: 'satisfiedNecessaryCondition',
        bfoCategoryAffected: nc.bfoCategoryAffected || bfoCategory,
        weight: axiom.weight || 'High',
      });
    }
  }

  assertAxiomEvidenceNonEmpty(axiomEvidence, 'Entailed');

  return {
    dispositionReason: `CAU ${cauIRI} Entailed at ${bfoCategory} via satisfaction of ${satisfiedNCs.length} necessary condition(s).`,
    axiomEvidence,
    reasoningSteps,
    alternativesConsidered,
    validationState,
    conflictAnnotation,
    reconciliationHistory,
  };
}

/**
 * Plausible: structured per-category evidence; machine-readable JSON only.
 * No prose fields per `dp2-explanation-mandatory-plausible` negative assertion.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {Array<object>} input.candidateBFOCategories - per-category evidence
 *   Each: {category, conditionsSatisfied, conditionsTotal, satisfiedConditionIRIs,
 *          unsatisfiedConditionIRIs, axiomsContributing}
 * @param {Array<object>} [input.heuristicSignals] - weak signals (advisory:true)
 * @param {object | null} [input.subsumptionResolution] - §4.6 overlap resolution
 * @param {string} [input.validationState]
 * @param {object | null} [input.conflictAnnotation]
 * @param {Array<object>} [input.reconciliationHistory]
 * @returns {Promise<object>} explanation per §7.2 + §4.3 Plausible schema
 */
export async function buildPlausibleExplanation(input) {
  const {
    cauIRI, sessionId,
    candidateBFOCategories,
    heuristicSignals = [],
    subsumptionResolution = null,
    validationState = 'not_inherited',
    conflictAnnotation = null,
    reconciliationHistory = [],
  } = input;

  if (!Array.isArray(candidateBFOCategories) || candidateBFOCategories.length === 0) {
    throw new TypeError('buildPlausibleExplanation: candidateBFOCategories must be non-empty.');
  }
  assertTerminalValidationState(validationState);

  const axiomEvidence = [];
  const candidateSummaries = [];

  for (const cat of candidateBFOCategories) {
    assertBfoCategory(cat.category);
    const categoryAxiomIds = [];
    for (const axiom of (cat.axiomsContributing || [])) {
      const { id } = await internAxiom({ sessionId, axiom });
      categoryAxiomIds.push(id);
      axiomEvidence.push({
        axiomIRI: id,
        axiomKind: axiom.kind || 'plausibleSupportingAxiom',
        contributionRole: 'partialNCSupport',
        bfoCategoryAffected: cat.category,
        weight: axiom.weight || 'Medium',
      });
    }

    candidateSummaries.push({
      category: cat.category,
      conditionsSatisfied: cat.conditionsSatisfied ?? 0,
      conditionsTotal: cat.conditionsTotal ?? 0,
      satisfiedConditionIRIs: (cat.satisfiedConditionIRIs || []).slice(),
      unsatisfiedConditionIRIs: (cat.unsatisfiedConditionIRIs || []).slice(),
      axiomsContributingByID: categoryAxiomIds,
    });
  }

  assertAxiomEvidenceNonEmpty(axiomEvidence, 'Plausible');

  return {
    dispositionReason: `CAU ${cauIRI} Plausible across ${candidateBFOCategories.length} candidate category(ies).`,
    axiomEvidence,
    reasoningSteps: [],
    alternativesConsidered: [],
    validationState,
    conflictAnnotation,
    reconciliationHistory,
    // Structured per-category block — machine-readable, no prose. Matches §4.3 schema.
    candidateBFOCategories: candidateSummaries,
    heuristicSignals: heuristicSignals.map((s) => ({ ...s, advisory: true })),
    subsumptionResolution,
  };
}

/**
 * Inconsistent: CAU's axioms contradict every BFO category (disjointness
 * violation or similar). Explanation names the specific disjointness axiom
 * or contradiction.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {object} input.disjointnessViolation - {axiom, conflictingCategories, ...}
 * @param {Array<object>} [input.reasoningSteps]
 * @param {string} [input.validationState]
 * @param {object | null} [input.conflictAnnotation]
 * @param {Array<object>} [input.reconciliationHistory]
 * @returns {Promise<object>} explanation per §7.2
 */
export async function buildInconsistentExplanation(input) {
  const {
    cauIRI, sessionId,
    disjointnessViolation,
    reasoningSteps = [],
    validationState = 'not_inherited',
    conflictAnnotation = null,
    reconciliationHistory = [],
  } = input;

  if (!disjointnessViolation || !disjointnessViolation.axiom) {
    throw new TypeError('buildInconsistentExplanation: disjointnessViolation.axiom is required.');
  }
  assertTerminalValidationState(validationState);

  const conflictingCategories = disjointnessViolation.conflictingCategories || [];
  if (!Array.isArray(conflictingCategories) || conflictingCategories.length < 2) {
    throw new TypeError(
      'buildInconsistentExplanation: disjointnessViolation.conflictingCategories must be an array of at least 2 BFO category IRIs.'
    );
  }

  const { id: violationAxiomId } = await internAxiom({
    sessionId,
    axiom: disjointnessViolation.axiom,
  });

  const axiomEvidence = [{
    axiomIRI: violationAxiomId,
    axiomKind: 'disjointnessAxiom',
    contributionRole: 'triggeredDisjointness',
    bfoCategoryAffected: conflictingCategories[0],
    weight: 'High',
  }];

  return {
    dispositionReason: `CAU ${cauIRI} Inconsistent: disjointness violation across ${conflictingCategories.join(' / ')}.`,
    axiomEvidence,
    reasoningSteps,
    alternativesConsidered: [],
    validationState,
    conflictAnnotation,
    reconciliationHistory,
    disjointnessViolation: {
      axiomIRI: violationAxiomId,
      conflictingCategories: conflictingCategories.slice(),
    },
  };
}

/**
 * NotApplicable: terminal disposition. Explanation names the routing
 * mechanism ('automatic' | 'default_axiom_poor' | 'manual') and traces to
 * the NotApplicable trigger per §7.5 Content Validation (single-element
 * axiom evidence floor per DP-2.1.D3 lock).
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {string} input.routingMechanism - closed enum per D2.4 lock
 * @param {object} input.triggerAxiom - axiom that triggered NotApplicable routing
 * @param {string} [input.triggerRule] - the rule identifier (e.g., 'NA-1', 'NA-1.2 hard_conflict')
 * @param {string} [input.validationState]
 * @param {object | null} [input.conflictAnnotation]
 * @param {Array<object>} [input.reconciliationHistory]
 * @returns {Promise<object>} explanation per §7.2 + §7.5
 */
export async function buildNotApplicableExplanation(input) {
  const {
    cauIRI, sessionId,
    routingMechanism,
    triggerAxiom,
    triggerRule = 'NA-1',
    validationState = 'not_inherited',
    conflictAnnotation = null,
    reconciliationHistory = [],
  } = input;

  if (!NA_ROUTING_MECHANISMS.has(routingMechanism)) {
    throw new TypeError(
      `buildNotApplicableExplanation: routingMechanism must be one of {${Array.from(NA_ROUTING_MECHANISMS).join(', ')}}. ` +
      `Got: ${JSON.stringify(routingMechanism)}. Closed enum per D2.4 lock.`
    );
  }
  if (!triggerAxiom) {
    throw new TypeError('buildNotApplicableExplanation: triggerAxiom is required (single-element floor per DP-2.1.D3).');
  }
  assertTerminalValidationState(validationState);

  const { id } = await internAxiom({ sessionId, axiom: triggerAxiom });

  // Single-element evidence floor per DP-2.1.D3.
  const axiomEvidence = [{
    axiomIRI: id,
    axiomKind: 'notApplicableTrigger',
    contributionRole: 'routingTrigger',
    bfoCategoryAffected: null,
    weight: 'High',
  }];

  return {
    dispositionReason: `CAU ${cauIRI} NotApplicable via routing mechanism '${routingMechanism}' (rule: ${triggerRule}).`,
    axiomEvidence,
    reasoningSteps: [],
    alternativesConsidered: [],
    validationState,
    conflictAnnotation,
    reconciliationHistory,
    routingMechanism,
    triggerRule,
  };
}

// ── Internals ──────────────────────────────────────────────────────

function assertBfoCategory(bfoCategory) {
  if (typeof bfoCategory !== 'string' || bfoCategory.length === 0) {
    throw new TypeError('explanation-builder: bfoCategory must be a non-empty string IRI.');
  }
}

function assertSatisfiedNCs(satisfiedNCs) {
  if (!Array.isArray(satisfiedNCs) || satisfiedNCs.length === 0) {
    throw new TypeError('buildEntailedExplanation: satisfiedNCs must be a non-empty array.');
  }
}

function assertAxiomEvidenceNonEmpty(axiomEvidence, disposition) {
  if (axiomEvidence.length === 0) {
    throw new Error(
      `explanation-builder: ${disposition} explanation produced zero-element axiomEvidence. ` +
      `§7.5 Content Validation (I2a) requires non-empty evidence for all non-NotApplicable dispositions.`
    );
  }
}

function assertTerminalValidationState(validationState) {
  if (validationState === 'provisional') {
    throw new TypeError(
      'explanation-builder: validationState=\'provisional\' is a defect at explanation-build time per F3 resolution ' +
      '(NA architecture Commitment 2). `provisional` is reconciliation-pending / in-flight only — NA-1.2 must complete ' +
      'before explanation is built and record persisted.'
    );
  }
}
