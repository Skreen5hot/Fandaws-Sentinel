/**
 * Canonical Record Writer — D1.6 §7.5 (DP-2 write-path chokepoint)
 *
 * The single point through which every canonical record flows on its way to
 * persistence. Enforces the DP-2 invariants at record emission time:
 *   - I1  (Schema Gate)             — enforced from DP-2.1
 *   - I2a (Shape-Level Content Val) — enforced from DP-2.1
 *   - I2b (Hash-Value Correctness)  — activates at DP-2.3.2 (not this module)
 *   - I4  (Dictionary Discipline)   — activates at DP-2.2 (not this module)
 *
 * Explicit phase routing (per SME-DP2-P1 resolution): `context.phase` is a
 * required field with value `'scaffold' | 'production'`. Absence-based
 * routing is a defect; callers must name their phase explicitly.
 *
 * Scaffold emitter functions are exposed alongside the writer — callers
 * producing scaffold records invoke them directly to construct schema-
 * conformant placeholder payloads that satisfy I1 + I2a while DP-2.2 and
 * DP-2.3 production emitters are under construction. Scaffold hash records
 * carry `_scaffold: true` sentinel which I2b removes at DP-2.3.2 landing.
 *
 * Pure-function discipline: the writer validates and returns the record; it
 * does NOT persist. Persistence is the caller's responsibility. This keeps
 * the writer testable without StateAdapter coupling and matches the existing
 * D1.6 module conventions (cau-signature, three-state-evaluator, etc.).
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §7
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §3 (DP-2.1)
 * Decisions: specs/d16/dp2-locked-decisions.md (D1.D1, D1.D2, D1.D3 locked)
 */

import { validateCanonicalRecord, validNotApplicableRoutingMechanisms } from './dp2-schema.js';

const SCAFFOLD_HASH_PLACEHOLDER = '0000000000000000000000000000000000000000000000000000000000000000';

const FINAL_HASH_INPUTS_CANONICAL_LABELS = [
  'CAU IRI',
  'Final Signature hash',
  'BFO version identifier',
  'Curated BFO additions version identifier',
  'session configuration hash',
  'final iteration round number',
];

/**
 * Structured DP-2 non-conformance error. Carries the first-failing rule,
 * path, and human-readable message derived from the validator. Full error
 * list available via the `errors` property for callers that want to surface
 * all failures simultaneously (e.g. the Phase 1 Review panel).
 */
export class DP2NonConformanceError extends Error {
  constructor(errors) {
    const primary = errors[0] || { rule: 'DP-2', path: '', message: 'DP-2 non-conformant (no details)' };
    super(primary.message);
    this.name = 'DP2NonConformanceError';
    this.rule = primary.rule;
    this.path = primary.path;
    this.errors = errors;
  }
}

/**
 * Write a canonical record through the DP-2 chokepoint.
 *
 * Runs I1 (schema gate) + I2a (shape-level content validation). On pass,
 * returns `{ ok: true, record, phase }`. On fail, throws
 * `DP2NonConformanceError` with the full error list.
 *
 * Phase routing is explicit per SME-DP2-P1: the caller states its phase.
 * The writer does not attempt to infer phase from record shape.
 *
 * @param {object} record  - the canonical record candidate
 * @param {object} context - must include `phase: 'scaffold' | 'production'`
 * @returns {{ ok: true, record: object, phase: string }}
 * @throws {DP2NonConformanceError} when validation fails
 * @throws {TypeError} when context.phase is missing or invalid
 */
export function writeCanonicalRecord(record, context) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    throw new TypeError(
      'writeCanonicalRecord: context is required and must be an object carrying an explicit phase. Per SME-DP2-P1 resolution, absence-based routing is a defect.',
    );
  }
  if (context.phase !== 'scaffold' && context.phase !== 'production') {
    throw new TypeError(
      `writeCanonicalRecord: context.phase is required and must be 'scaffold' or 'production'. Got: ${JSON.stringify(context.phase)}.`,
    );
  }

  const { ok, errors } = validateCanonicalRecord(record);
  if (!ok) {
    throw new DP2NonConformanceError(errors);
  }

  return { ok: true, record, phase: context.phase };
}

// ── Scaffold emitters ─────────────────────────────────────────────
//
// Distinct named entry points per SME-DP2-P1. Each produces a schema-
// conformant placeholder satisfying I1 + I2a while DP-2.2 / DP-2.3
// production emitters are under construction.

/**
 * Build a scaffold explanation object satisfying I1 + I2a.
 *
 * NotApplicable records receive a single-element axiom evidence list
 * naming the routing trigger (per DP-2.1.D3 floor). All other dispositions
 * receive a single-element trigger-noting stub adequate for I2a shape
 * validation; DP-2.2 production builders populate full structured content.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.disposition      - one of Entailed | Plausible | Inconsistent | NotApplicable
 * @param {string} [input.routingMechanism] - required when disposition is NotApplicable
 * @returns {object} explanation object
 */
export function buildScaffoldExplanation({ cauIRI, disposition, routingMechanism }) {
  if (disposition === 'NotApplicable') {
    const valid = validNotApplicableRoutingMechanisms();
    if (!valid.includes(routingMechanism)) {
      throw new TypeError(
        `buildScaffoldExplanation: NotApplicable requires routingMechanism in {${valid.join(', ')}}. Got: ${JSON.stringify(routingMechanism)}.`,
      );
    }
  }

  const triggerEvidence = disposition === 'NotApplicable'
    ? {
      axiomIRI: `scaffold:notapplicable-trigger/${routingMechanism}`,
      axiomKind: 'notApplicableTrigger',
      contributionRole: 'routingTrigger',
      bfoCategoryAffected: null,
      weight: 'High',
    }
    : {
      axiomIRI: `scaffold:placeholder-trigger/${disposition}`,
      axiomKind: 'scaffoldPlaceholder',
      contributionRole: 'scaffoldTrigger',
      bfoCategoryAffected: null,
      weight: 'Low',
    };

  return {
    dispositionReason: disposition === 'NotApplicable'
      ? `Scaffold NotApplicable placement for ${cauIRI} via routing mechanism '${routingMechanism}'. Production emitter pending DP-2.2.`
      : `Scaffold ${disposition} placement for ${cauIRI}. Production emitter pending DP-2.2.`,
    axiomEvidence: [triggerEvidence],
    reasoningSteps: [],
    alternativesConsidered: [],
    validationState: 'not_inherited',
    conflictAnnotation: null,
    reconciliationHistory: [],
  };
}

/**
 * Build a scaffold provenance object satisfying I1 + I2a.
 *
 * Emits a single round-0 iteration history entry adequate for shape
 * validation; DP-2.2 populates real iteration dynamics.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {string} input.disposition
 * @param {string} [input.bfoCategory]
 * @param {boolean} [input.compatibilityDegraded] - defaults to false
 * @param {string} [input.authorTimestamp] - defaults to new Date().toISOString()
 * @returns {object} provenance object
 */
export function buildScaffoldProvenance({
  cauIRI,
  sessionId,
  disposition,
  bfoCategory = null,
  compatibilityDegraded = false,
  authorTimestamp,
}) {
  const ts = authorTimestamp || new Date().toISOString();
  return {
    sessionId,
    iterationHistory: [
      {
        round: 0,
        disposition,
        bfoCategory,
        reasonerStepsConsumed: 0,
        timestamp: ts,
      },
    ],
    crossCAUInfluences: [],
    propertyAlignmentsConsumed: [],
    reasonerState: {
      backgroundTheoryVersion: 'scaffold:pending-dp2.2',
      stepCountConsumed: 0,
      fallbackInvoked: false,
    },
    authorTimestamp: ts,
    compatibilityDegraded,
    analystOverride: false,
  };
}

/**
 * Build a scaffold reproducibility-hash object satisfying I1 + I2a.
 *
 * Hash values are placeholder zeros; the object carries `_scaffold: true`
 * sentinel which I2a recognizes as the interim I2b bypass. DP-2.3.2
 * replaces this with real SHA-256 computation and verifies no persisted
 * record retains the sentinel (I2b activation).
 *
 * @param {object} input
 * @param {string} input.cauIRI - included in finalHash inputsHashed listing
 * @returns {object} reproducibilityHash object
 */
export function buildScaffoldReproducibilityHash({ cauIRI }) {
  return {
    algorithm: 'SHA-256',
    perRoundHashes: [
      {
        round: 0,
        hash: SCAFFOLD_HASH_PLACEHOLDER,
        inputsHashed: [],
      },
    ],
    finalHash: {
      hash: SCAFFOLD_HASH_PLACEHOLDER,
      authoritative: true,
      inputsHashed: [...FINAL_HASH_INPUTS_CANONICAL_LABELS],
    },
    _scaffold: true,
  };
}

/**
 * Assemble a complete scaffold canonical record. Convenience wrapper
 * composing the three scaffold emitters.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {string} input.disposition
 * @param {string} [input.bfoCategory]
 * @param {string} [input.routingMechanism] - required when disposition is NotApplicable
 * @param {boolean} [input.compatibilityDegraded]
 * @param {string} [input.authorTimestamp]
 * @returns {object} canonical record
 */
export function buildScaffoldCanonicalRecord(input) {
  const { cauIRI, sessionId, disposition, bfoCategory = null, routingMechanism, compatibilityDegraded, authorTimestamp } = input;
  return {
    cauIRI,
    disposition,
    bfoCategory,
    explanation: buildScaffoldExplanation({ cauIRI, disposition, routingMechanism }),
    provenance: buildScaffoldProvenance({
      cauIRI,
      sessionId,
      disposition,
      bfoCategory,
      compatibilityDegraded,
      authorTimestamp,
    }),
    reproducibilityHash: buildScaffoldReproducibilityHash({ cauIRI }),
  };
}

/**
 * Assemble a complete PRODUCTION canonical record by composing DP-2.2
 * explanation + provenance builders with the scaffold reproducibility hash
 * (I2b bypass sentinel active until DP-2.3.2 lands).
 *
 * The explanation source shape varies by disposition — caller passes the
 * disposition-specific payload to the appropriate builder via
 * `explanationInput`. Provenance is built from iteration + session state.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {string} input.disposition
 * @param {string | null} [input.bfoCategory]
 * @param {object} input.explanationInput - disposition-specific explanation payload
 * @param {object} input.iterationState    - { rounds: [...], crossCAUInfluences?, propertyAlignmentsConsumed? }
 * @param {object} input.sessionState      - { backgroundTheoryVersion, compatibilityDegraded? }
 * @param {object} [input.overrideInfo]    - { analystOverride: true, originalDisposition? }
 * @param {string} [input.authorTimestamp]
 * @returns {Promise<object>} canonical record satisfying I1 + I2a
 */
export async function buildProductionCanonicalRecord(input) {
  const {
    cauIRI, sessionId, disposition, bfoCategory = null,
    explanationInput, iterationState, sessionState, overrideInfo, authorTimestamp,
  } = input;

  const { buildEntailedExplanation, buildPlausibleExplanation, buildInconsistentExplanation, buildNotApplicableExplanation } =
    await import('./explanation-builder.js');
  const { buildProvenance } = await import('./provenance-builder.js');

  let explanation;
  switch (disposition) {
    case 'Entailed':
      explanation = await buildEntailedExplanation({ cauIRI, sessionId, bfoCategory, ...explanationInput });
      break;
    case 'Plausible':
      explanation = await buildPlausibleExplanation({ cauIRI, sessionId, ...explanationInput });
      break;
    case 'Inconsistent':
      explanation = await buildInconsistentExplanation({ cauIRI, sessionId, ...explanationInput });
      break;
    case 'NotApplicable':
      explanation = await buildNotApplicableExplanation({ cauIRI, sessionId, ...explanationInput });
      break;
    default:
      throw new TypeError(`buildProductionCanonicalRecord: unknown disposition ${JSON.stringify(disposition)}.`);
  }

  const provenance = buildProvenance({
    cauIRI,
    sessionId,
    iterationState,
    sessionState,
    overrideInfo,
    authorTimestamp,
  });

  return {
    cauIRI,
    disposition,
    bfoCategory,
    explanation,
    provenance,
    // DP-2.3.2 will replace this with real SHA-256 Final Hash computation;
    // until then, production records carry the scaffold sentinel so I2a
    // shape-validation passes while I2b remains bypassed.
    reproducibilityHash: buildScaffoldReproducibilityHash({ cauIRI }),
  };
}
