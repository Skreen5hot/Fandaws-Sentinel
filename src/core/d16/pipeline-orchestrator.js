/**
 * Pipeline Orchestrator — D1.6 DP-2 integration layer.
 *
 * Composes pure reasoning-module outputs into canonical records and routes
 * them through the DP-2 write-path chokepoint. Preserves CLAUDE.md core-
 * module discipline: reasoning modules (`three-state-evaluator`,
 * `inheritance-cascade`, `reactive-engine`, `dp1-diagnostic`,
 * `iteration-mechanics`) stay pure. This orchestrator is the integration
 * boundary where pure reasoning meets pluggable adapter persistence.
 *
 * Wired per SME-D16-X3 §3 (v2 "Pipeline Orchestrator Scoping" memo).
 *
 * Five public functions per v2 §3.1, one F4 audit call site each:
 *   - orchestrateThreeStateTerminal — initial classification (Entailed/Plausible/Inconsistent)
 *   - orchestrateInheritance         — axiom-poor CAU: NA-1.1 + NA-1.2 composition (F3-preserving)
 *   - orchestrateReactive            — NA-1.4 mutation-triggered re-evaluation
 *   - orchestrateNotApplicable       — NotApplicable routing (automatic/default_axiom_poor/manual)
 *   - orchestrateAnalystOverride     — human override of prior automated classification (NET-NEW)
 *
 * Each function:
 *   1. Composes reasoning-module output (or delegates to another orchestrator).
 *   2. Builds a canonical record via buildProductionCanonicalRecord.
 *   3. Calls persistCanonicalRecordViaChokepoint exactly once.
 *   4. Returns the funnel envelope (for causedBy threading; caller captures).
 *
 * DP2NonConformanceError is NOT caught here — propagates to the pipeline
 * boundary per v2 §3.7. Partial-cascade-failure semantics (v2 §3.8) are the
 * caller's concern; this module emits or throws, nothing in between.
 *
 * Adapter injection: explicit per-call parameter (developer ACK on §3.9.1
 * — see module-level JSDoc below for rationale).
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §7.1
 * Design: specs/d16/sme-d16-x3-pipeline-orchestrator-memo-v2.md
 */

import { evaluateCAU, disjointWith } from './three-state-evaluator.js';
import {
  applyProvisionalInheritance,
  reconcileSignal,
} from './inheritance-cascade.js';
import { buildProductionCanonicalRecord } from './canonical-record-writer.js';
import { persistCanonicalRecordViaChokepoint } from './record-persistence.js';
import { evaluateNCSatisfaction } from './nc-dispatcher.js';

// ── Adapter injection rationale (SME-D16-X3 v2 §3.9.1 developer ACK) ──
//
// Adopting EXPLICIT per-call adapter parameter (not SME's session-scoped
// holder lean). Three reasons:
//
// 1. Mirrors persistCanonicalRecordViaChokepoint(record, context, adapter)
//    directly — zero new API concept. Orchestrator functions read as thin
//    composition layers above the funnel; no closure indirection.
//
// 2. F4 audit is mechanically cleaner: every orchestrator function
//    signature has adapter as 4th parameter; no closure introspection
//    needed to determine which adapter a given call would use.
//
// 3. CLAUDE.md discipline — a session-scoped holder closure carries bound
//    state (the adapter). Explicit per-call has zero hidden state. Since
//    sessionId is already per-call via context, adapter-per-call is the
//    symmetric pattern.
//
// Counter to SME's "matches v1.1.0 sessionId threading" point: sessionId
// is NOT bound in closure either — it's passed in context per call. If
// sessionId is per-call, adapter should be too for consistency. Callers
// that want session-level ceremony can build their own closure wrapper
// over this API; this module doesn't prescribe that.

// ── Context shape ────────────────────────────────────────────────────
//
// All orchestrator functions accept a `context` argument with:
//   phase:       'production' | 'scaffold' — required
//   sessionId:   string — required, threaded to funnel + builders
//   mechanism:   string — optional at entry; orchestrator SETS this before
//                calling funnel. Per-family mechanism values locked in
//                memo §3.2–§3.6. Caller's `mechanism` value is ignored.
//   causedBy:    <entry ID> | null — F1 immediate-predecessor semantics
//                per memo §4.2. Null for initial classifications.
//
// The orchestrator never mutates the caller's context; it constructs a
// new context object with the family-specific mechanism before calling
// the funnel.

/**
 * orchestrateThreeStateTerminal — CAU initial classification via
 * three-state-evaluator (Entailed / Plausible / Inconsistent). If the
 * evaluator's NotApplicable-axiom-poor branch fires, delegates to
 * orchestrateNotApplicable.
 *
 * @param {string} cauIRI
 * @param {object} inputs
 * @param {object} inputs.evaluatorInput - signature + targetCategory + satisfiedNCs for evaluateCAU
 * @param {object} inputs.explanationInput - disposition-specific payload (see explanation-builder)
 * @param {object} inputs.iterationState  - rounds[]
 * @param {object} inputs.sessionState    - backgroundTheoryVersion, compatibilityDegraded
 * @param {object} context
 * @param {object} adapter - StateAdapter with persistCanonicalRecord method (optional for dry-run)
 * @returns {Promise<{ok: true, record: object, phase: string, persisted: boolean}>}
 */
export async function orchestrateThreeStateTerminal(cauIRI, inputs, context, adapter) {
  assertContext(context);
  const { evaluatorInput, explanationInput, iterationState, sessionState } = inputs;

  // Step 1: call three-state evaluator (pure). If the caller provides
  // dispatcher-facing inputs (cauSignature + bfoSignatureReference +
  // targetCategory), the orchestrator runs the dispatcher for target +
  // disjoint categories before invoking evaluateCAU. Otherwise (legacy
  // path used by SYNTHETIC_NC_SATISFACTION allowlist tests and by direct-
  // synthetic-allowlist test harnesses), evaluateCAU is called with the
  // legacy satisfiedNCs Set as before.
  const evalResult = await runEvaluationWithOptionalDispatcher(evaluatorInput);

  // Step 2: branch on disposition — NotApplicable delegates to its orchestrator
  if (evalResult.disposition === 'NotApplicable') {
    return orchestrateNotApplicable(cauIRI, {
      routingMechanism: 'default_axiom_poor',
      triggerAxiom: {
        iri: 'd16:axiom-poor-trigger',
        kind: 'notApplicableTrigger',
      },
      triggerRule: 'D1.6-L13',
      iterationState,
      sessionState,
    }, context, adapter);
  }

  // Step 3: derive mechanism from disposition (locked in memo §3.2)
  const mechanism = `three_state_${evalResult.disposition.toLowerCase()}`;

  // Step 4: build record via production composition
  const record = await buildProductionCanonicalRecord({
    cauIRI,
    sessionId: context.sessionId,
    disposition: evalResult.disposition,
    bfoCategory: evalResult.bfoCategory,
    explanationInput,
    iterationState,
    sessionState,
  });

  // Step 5: single funnel call with constructed context
  return persistCanonicalRecordViaChokepoint(
    record,
    { ...context, mechanism, causedBy: null },
    adapter,
  );
}

/**
 * orchestrateInheritance — axiom-poor CAU with inheritable parent.
 *
 * F3-preserving composition: NA-1.1 (provisional inheritance) output NEVER
 * traverses the chokepoint alone. NA-1.2 (reconcileSignal) transitions
 * validationState from 'provisional' to a terminal value within this
 * function before emission. A persisted record with terminal validationState
 * of 'provisional' is an F3 defect (I2a rejects it); the orchestrator's
 * single-function composition ensures this cannot happen.
 *
 * @param {string} cauIRI
 * @param {object} inputs
 * @param {string} inputs.parentIRI
 * @param {object} inputs.parentPriorPlacement - {disposition, bfoCategory}
 * @param {string} [inputs.signalStrength='weak'] - 'weak' | 'strong' per reconcileSignal
 * @param {string} [inputs.contradictionSeverity] - 'hard' | 'soft' | null
 * @param {string} [inputs.signalType]
 * @param {object} inputs.iterationState
 * @param {object} inputs.sessionState
 * @param {object} context
 * @param {object} adapter
 */
export async function orchestrateInheritance(cauIRI, inputs, context, adapter) {
  assertContext(context);
  const {
    parentIRI, parentPriorPlacement,
    signalStrength = 'weak', contradictionSeverity = null, signalType,
    iterationState, sessionState,
  } = inputs;

  // Step 1: NA-1.1 — apply provisional inheritance (returns validationState='provisional')
  const provisional = applyProvisionalInheritance({ cauIRI, parentIRI, parentPriorPlacement });

  // Step 2: NA-1.2 — reconcile local signals; transitions 'provisional' to terminal
  const reconciled = reconcileSignal({
    cauIRI,
    inheritedPlacement: {
      disposition: provisional.disposition,
      bfoCategory: provisional.bfoCategory,
    },
    signalStrength,
    contradictionSeverity,
    signalType,
  });

  // F3 safety net: post-reconcile validationState must not be terminal-provisional.
  // reconcileSignal's return paths always produce a terminal state, but this guard
  // catches any future regression.
  if (reconciled.validationState === 'provisional') {
    throw new Error(
      'orchestrateInheritance: NA-1.2 produced terminal provisional validationState. ' +
      'F3 invariant violated — fix reconcileSignal, not this guard (per memo §6.3 honest-admission rule).',
    );
  }

  // Step 3: determine final disposition + bfoCategory from reconciliation
  const finalDisposition = reconciled.disposition || provisional.disposition;
  const finalBfoCategory = reconciled.bfoCategory ?? reconciled.bfoCategoryHint ?? provisional.bfoCategory;

  // Step 4: build explanationInput per disposition
  const explanationInput = buildInheritanceExplanationInput({
    cauIRI, parentIRI, provisional, reconciled, finalDisposition,
  });

  // Step 5: compose record with reconciled validationState
  const baseRecord = await buildProductionCanonicalRecord({
    cauIRI,
    sessionId: context.sessionId,
    disposition: finalDisposition,
    bfoCategory: finalBfoCategory,
    explanationInput,
    iterationState,
    sessionState,
  });
  // Override validationState + conflictAnnotation with reconciled values
  // (buildProductionCanonicalRecord used defaults; inheritance needs the real reconciled state).
  baseRecord.explanation.validationState = reconciled.validationState;
  baseRecord.explanation.conflictAnnotation = reconciled.conflictAnnotation || null;

  // Step 6: single funnel call
  return persistCanonicalRecordViaChokepoint(
    baseRecord,
    { ...context, mechanism: 'inheritance', causedBy: null },
    adapter,
  );
}

/**
 * orchestrateReactive — NA-1.4 mutation-triggered re-evaluation.
 *
 * Current implementation uses writeFreshRecord semantics (produces a fresh
 * record with full history composed in-memory). When the appendReconciliation-
 * Entry API lands (v2 §2.3), this function transitions to true append
 * semantics without changing its signature.
 *
 * @param {string} cauIRI
 * @param {object} inputs
 * @param {string} inputs.mutationKind - 'analyst-override' | 'property-ingestion' | 'placement-change'
 * @param {object} inputs.reEvaluationOutcome - post-mutation disposition data
 * @param {object} inputs.explanationInput
 * @param {object} inputs.iterationState
 * @param {object} inputs.sessionState
 * @param {string | null} [inputs.causedByEntryId] - F1 immediate predecessor per §4.3
 * @param {object} context
 * @param {object} adapter
 */
export async function orchestrateReactive(cauIRI, inputs, context, adapter) {
  assertContext(context);
  const {
    mutationKind, reEvaluationOutcome,
    explanationInput, iterationState, sessionState,
    causedByEntryId = null,
  } = inputs;

  assertMutationKind(mutationKind);

  const record = await buildProductionCanonicalRecord({
    cauIRI,
    sessionId: context.sessionId,
    disposition: reEvaluationOutcome.disposition,
    bfoCategory: reEvaluationOutcome.bfoCategory,
    explanationInput,
    iterationState,
    sessionState,
  });

  return persistCanonicalRecordViaChokepoint(
    record,
    {
      ...context,
      mechanism: 'reactive',
      mutationKind,
      causedBy: causedByEntryId,
    },
    adapter,
  );
}

/**
 * orchestrateNotApplicable — explicit NotApplicable routing with one of the
 * three closed-enum mechanisms. Enforces DP-2.1.D3 single-element evidence
 * floor via buildNotApplicableExplanation (which the production builder
 * routes to).
 *
 * @param {string} cauIRI
 * @param {object} inputs
 * @param {string} inputs.routingMechanism - 'automatic' | 'default_axiom_poor' | 'manual'
 * @param {object} inputs.triggerAxiom - single-element axiom evidence per §7.5
 * @param {string} [inputs.triggerRule='NA-1']
 * @param {object} inputs.iterationState
 * @param {object} inputs.sessionState
 * @param {object} context
 * @param {object} adapter
 */
export async function orchestrateNotApplicable(cauIRI, inputs, context, adapter) {
  assertContext(context);
  const {
    routingMechanism, triggerAxiom, triggerRule = 'NA-1',
    iterationState, sessionState,
  } = inputs;

  const record = await buildProductionCanonicalRecord({
    cauIRI,
    sessionId: context.sessionId,
    disposition: 'NotApplicable',
    bfoCategory: null,
    explanationInput: { routingMechanism, triggerAxiom, triggerRule },
    iterationState,
    sessionState,
  });

  // Per memo §3.5: mechanism carries the routing-mechanism value; sub-
  // mechanism coverage is traced via context, one call site for NotApplicable.
  return persistCanonicalRecordViaChokepoint(
    record,
    { ...context, mechanism: routingMechanism, causedBy: null },
    adapter,
  );
}

/**
 * orchestrateAnalystOverride — NET-NEW production path for human override
 * of a prior automated classification.
 *
 * Initial-implementation schema (developer-ACK v1, pending SME review per
 * memo §3.6 PENDING-DEVELOPER-ACK):
 *   - analystId:   string (required)
 *   - timestamp:   ISO-8601 string (required; defaults to new Date().toISOString())
 *   - rationale:   string (required; non-empty)
 *   - priorAutomatedDisposition: string (required; for audit)
 *   - priorAutomatedBfoCategory: string | null (required if applicable)
 *
 * Override-result fields provided by caller (override determines the outcome):
 *   - disposition: new disposition after override
 *   - bfoCategory: new category after override
 *
 * Uses writeFreshRecord semantics until appendReconciliationEntry API lands
 * (per v2 §3.6 transition note).
 *
 * @param {string} cauIRI
 * @param {object} inputs
 * @param {object} inputs.overrideMetadata - {analystId, timestamp?, rationale, priorAutomatedDisposition, priorAutomatedBfoCategory}
 * @param {object} inputs.overrideResult - {disposition, bfoCategory}
 * @param {object} inputs.explanationInput
 * @param {object} inputs.iterationState
 * @param {object} inputs.sessionState
 * @param {object} context
 * @param {object} adapter
 */
export async function orchestrateAnalystOverride(cauIRI, inputs, context, adapter) {
  assertContext(context);
  const { overrideMetadata, overrideResult, explanationInput, iterationState, sessionState } = inputs;

  assertOverrideMetadata(overrideMetadata);

  const record = await buildProductionCanonicalRecord({
    cauIRI,
    sessionId: context.sessionId,
    disposition: overrideResult.disposition,
    bfoCategory: overrideResult.bfoCategory,
    explanationInput,
    iterationState,
    sessionState,
    overrideInfo: {
      analystOverride: true,
      originalDisposition: overrideMetadata.priorAutomatedDisposition,
    },
    authorTimestamp: overrideMetadata.timestamp,
  });

  return persistCanonicalRecordViaChokepoint(
    record,
    {
      ...context,
      mechanism: 'analyst_override',
      causedBy: null,
      overrideMetadata: {
        analystId: overrideMetadata.analystId,
        rationale: overrideMetadata.rationale,
        priorAutomatedDisposition: overrideMetadata.priorAutomatedDisposition,
        priorAutomatedBfoCategory: overrideMetadata.priorAutomatedBfoCategory ?? null,
      },
    },
    adapter,
  );
}

// ── Dispatcher integration seam — DUAL-MODE (SME-D16-X8 Commit 1) ─
//
// DUAL-MODE: dispatcher path requires prologSession (post-X8 collapse per
// SME-D16-X8 §4 Option I lock 2026-04-25); legacy iteration-mechanics path
// stays per X4 §2.7 (SYNTHETIC_ITERATION via handleRunPhase1, out of
// dispatcher scope).
//
// Distinction from DP-2-P1 explicit-phase-routing discipline: that lock
// prevents ambiguity between legitimately-different production modes
// (scaffold vs production emission) which are both permanent. THIS seam
// is a dual-mode branch between dispatcher path (NC inference) and the
// iteration-mechanics legacy path (out of dispatcher scope per X4 §2.7).
// Both modes produce identical production disposition output; only the
// inference path differs.
//
// Dispatcher-path semantics (post-X8 contract):
// - Caller supplies cauSignature + bfoSignatureReference + prologSession.
// - Dispatcher evaluates target category + each disjoint category, combines
//   satisfied sets for Inconsistent-via-disjoint-full-satisfaction detection,
//   and passes trichotomy + combined satisfied to evaluateCAU.
// - prologSession is REQUIRED for OWL-DERIVED inference (Bucket C); absence
//   throws TypeError per X8 §4 Option I (collapse from prior TEMPORARY
//   MIGRATION SUPPORT seam — see git history for the X3-era affordance).
//
// Legacy-path semantics: caller does NOT supply cauSignature; evaluateCAU
// runs against caller's pre-computed satisfiedNCs Set (the iteration-mechanics
// path used by SYNTHETIC_ITERATION scenarios per X4 §2.7).
async function runEvaluationWithOptionalDispatcher(evaluatorInput) {
  if (!evaluatorInput.cauSignature || !evaluatorInput.bfoSignatureReference) {
    // Iteration-mechanics legacy path (X4 §2.7) — unchanged behavior.
    return evaluateCAU(evaluatorInput);
  }

  // Dispatcher path — prologSession is required per X8 §4 Option I.
  if (!evaluatorInput.prologSession) {
    throw new TypeError(
      'runEvaluationWithOptionalDispatcher: prologSession required when invoking dispatcher path. ' +
      'Per SME-D16-X8 §4 Option I (LOCKED 2026-04-25), all dispatcher-path callers must supply prologSession ' +
      'from initBucketCPrologSession. Use the iteration-mechanics legacy path (omit cauSignature/bfoSignatureReference) ' +
      'if dispatcher invocation is not required.',
    );
  }

  const {
    cauIRI, cauSignature, targetCategory, bfoSignatureReference,
    ancestorChain = [], axiomPoor, prologSession,
  } = evaluatorInput;

  const targetTrichotomy = await evaluateNCSatisfaction({
    cauIRI, cauSignature, targetBFOCategory: targetCategory,
    bfoSignatureReference, ancestorChain, prologSession,
  });

  // Cross-category disjointness: call dispatcher for each disjoint
  // category and union their satisfied sets into a combined Set.
  // evaluateCAU's disjointness-full-satisfaction check operates on this
  // combined set to detect Inconsistent.
  const combinedSatisfied = new Set(targetTrichotomy.satisfied);
  const disjointCategories = disjointWith(targetCategory);
  for (const dc of disjointCategories) {
    const dcTrichotomy = await evaluateNCSatisfaction({
      cauIRI, cauSignature, targetBFOCategory: dc,
      bfoSignatureReference, ancestorChain, prologSession,
    });
    for (const s of dcTrichotomy.satisfied) combinedSatisfied.add(s);
  }

  return evaluateCAU({
    cauIRI,
    targetCategory,
    axiomPoor,
    // Trichotomy for target category (drives coverage-gap routing)
    ncEvaluation: targetTrichotomy,
    // Combined satisfied across target + disjoint categories (drives
    // Inconsistent-via-disjoint-full-satisfaction detection)
    satisfiedNCs: [...combinedSatisfied],
  });
}

// ── Internals ─────────────────────────────────────────────────────

function assertContext(context) {
  if (!context || typeof context !== 'object') {
    throw new TypeError('pipeline-orchestrator: context object is required.');
  }
  if (context.phase !== 'production' && context.phase !== 'scaffold') {
    throw new TypeError(
      `pipeline-orchestrator: context.phase must be 'production' or 'scaffold'. Got: ${JSON.stringify(context.phase)}. ` +
      'Per SME-DP2-P1, absence-based phase routing is a defect.',
    );
  }
  if (typeof context.sessionId !== 'string' || context.sessionId.length === 0) {
    throw new TypeError('pipeline-orchestrator: context.sessionId must be a non-empty string.');
  }
}

const VALID_MUTATION_KINDS = new Set(['analyst-override', 'property-ingestion', 'placement-change']);
function assertMutationKind(mk) {
  if (!VALID_MUTATION_KINDS.has(mk)) {
    throw new TypeError(
      `orchestrateReactive: mutationKind must be one of {${Array.from(VALID_MUTATION_KINDS).join(', ')}}. ` +
      `Got: ${JSON.stringify(mk)}. Per memo §3.4, this enum is locked against Band 5 AVC scenarios.`,
    );
  }
}

function assertOverrideMetadata(meta) {
  if (!meta || typeof meta !== 'object') {
    throw new TypeError('orchestrateAnalystOverride: overrideMetadata is required.');
  }
  if (typeof meta.analystId !== 'string' || meta.analystId.length === 0) {
    throw new TypeError('orchestrateAnalystOverride: overrideMetadata.analystId must be a non-empty string.');
  }
  if (typeof meta.rationale !== 'string' || meta.rationale.length === 0) {
    throw new TypeError('orchestrateAnalystOverride: overrideMetadata.rationale must be a non-empty string.');
  }
  if (typeof meta.priorAutomatedDisposition !== 'string' || meta.priorAutomatedDisposition.length === 0) {
    throw new TypeError('orchestrateAnalystOverride: overrideMetadata.priorAutomatedDisposition must be a non-empty string (for audit).');
  }
}

// Adapt reconciled + provisional state into the appropriate explanation
// payload for the disposition. Centralized here so each inheritance
// emission produces a consistent explanation shape.
function buildInheritanceExplanationInput({ cauIRI, parentIRI, provisional, reconciled, finalDisposition }) {
  switch (finalDisposition) {
    case 'Entailed':
      // Reconciled inheritance produced clean Entailed: synthesize a
      // single inheritance-trace evidence axiom.
      return {
        satisfiedNCs: [{
          iri: 'inheritance:NA-1.1',
          bfoCategoryAffected: reconciled.bfoCategory || provisional.bfoCategory,
          axioms: [{
            iri: `inheritance:from/${parentIRI}`,
            kind: 'inheritanceTrace',
            target: reconciled.bfoCategory || provisional.bfoCategory,
            weight: 'High',
          }],
        }],
        alternativesConsidered: [],
      };

    case 'Plausible':
      // Soft-conflict or bfoCategoryHint case: Plausible with inheritance as one candidate.
      return {
        candidateBFOCategories: [{
          category: reconciled.bfoCategoryHint || provisional.bfoCategory,
          conditionsSatisfied: 0,
          conditionsTotal: 0,
          satisfiedConditionIRIs: [],
          unsatisfiedConditionIRIs: [],
          axiomsContributing: [{
            iri: `inheritance:from/${parentIRI}`,
            kind: 'inheritanceTrace',
            weight: 'Medium',
          }],
        }],
        heuristicSignals: [],
        subsumptionResolution: null,
      };

    case 'Inconsistent':
      // Hard contradiction during reconciliation.
      return {
        disjointnessViolation: {
          axiom: {
            iri: 'inheritance:NA-1.2-hard-conflict',
            kind: 'strongSignalContradiction',
          },
          conflictingCategories: [
            provisional.bfoCategory || 'bfo:Unknown',
            reconciled.bfoCategory || 'bfo:Inconsistent',
          ],
        },
      };

    default:
      throw new Error(`buildInheritanceExplanationInput: unexpected disposition ${finalDisposition}.`);
  }
}
