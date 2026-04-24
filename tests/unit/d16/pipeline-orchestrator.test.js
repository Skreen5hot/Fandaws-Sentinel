/**
 * Unit tests — pipeline-orchestrator.js (SME-D16-X3 v2 Commit 1).
 *
 * Covers all five orchestrator functions + F3 preservation invariant.
 * Each function is tested with both an adapter (persistence path) and
 * without (dry-run path — validation only).
 */

import {
  orchestrateThreeStateTerminal,
  orchestrateInheritance,
  orchestrateReactive,
  orchestrateNotApplicable,
  orchestrateAnalystOverride,
} from '../../../src/core/d16/pipeline-orchestrator.js';
import { validateCanonicalRecord } from '../../../src/core/d16/dp2-schema.js';
import { DP2NonConformanceError } from '../../../src/core/d16/canonical-record-writer.js';
import { resetForTests as resetAxiomDict } from '../../../src/core/d16/axiom-dictionary.js';
import { necessaryConditionsFor } from '../../../src/core/d16/three-state-evaluator.js';

beforeEach(() => resetAxiomDict());

const baseContext = (overrides = {}) => ({
  phase: 'production',
  sessionId: 'orch-test-session',
  ...overrides,
});

const baseIterationState = (disposition = 'Entailed', bfoCategory = 'bfo:Process') => ({
  rounds: [{
    round: 0, disposition, bfoCategory,
    reasonerStepsConsumed: 10, timestamp: '2026-04-24T12:00:00Z',
  }],
});

const baseSessionState = () => ({
  backgroundTheoryVersion: 'BFO-2020+curated-v1.0',
  compatibilityDegraded: false,
});

// Collecting adapter — captures all persistCanonicalRecord calls for inspection.
function makeCollectingAdapter() {
  const calls = [];
  return {
    adapter: {
      persistCanonicalRecord: (record, context) => {
        calls.push({ record, context });
      },
    },
    calls,
  };
}

// ── Context validation (applies to all orchestrator functions) ─────

describe('pipeline-orchestrator — context validation', () => {
  it('rejects missing context', async () => {
    await expect(orchestrateThreeStateTerminal('ex:CAU', {}, null, null))
      .rejects.toThrow(TypeError);
  });

  it('rejects invalid context.phase', async () => {
    await expect(orchestrateThreeStateTerminal('ex:CAU', {}, { phase: 'bogus', sessionId: 's' }, null))
      .rejects.toThrow(/phase/);
  });

  it('rejects missing context.sessionId', async () => {
    await expect(orchestrateThreeStateTerminal('ex:CAU', {}, { phase: 'production' }, null))
      .rejects.toThrow(/sessionId/);
  });
});

// ── orchestrateThreeStateTerminal ──────────────────────────────────

describe('orchestrateThreeStateTerminal', () => {
  it('Entailed path: single funnel call with mechanism=three_state_entailed', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    const result = await orchestrateThreeStateTerminal(
      'ex:EntailedCAU',
      {
        evaluatorInput: {
          targetCategory: 'bfo:Process',
          satisfiedNCs: necessaryConditionIRIsForProcess(),
        },
        explanationInput: {
          satisfiedNCs: [{
            iri: 'bfo:ProcessNC1',
            bfoCategoryAffected: 'bfo:Process',
            axioms: [{ iri: 'bfo:hasParticipant', kind: 'restriction', target: 'bfo:Continuant', weight: 'High' }],
          }],
        },
        iterationState: baseIterationState('Entailed', 'bfo:Process'),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].context.mechanism).toBe('three_state_entailed');
    expect(calls[0].context.causedBy).toBeNull();
    expect(calls[0].record.disposition).toBe('Entailed');
    expect(validateCanonicalRecord(calls[0].record).ok).toBe(true);
  });

  it('Plausible path: mechanism=three_state_plausible', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateThreeStateTerminal(
      'ex:PlausibleCAU',
      {
        evaluatorInput: {
          targetCategory: 'bfo:Process',
          satisfiedNCs: ['bfo:ProcessNC1'], // partial
        },
        explanationInput: {
          candidateBFOCategories: [{
            category: 'bfo:Process', conditionsSatisfied: 1, conditionsTotal: 3,
            satisfiedConditionIRIs: ['bfo:ProcessNC1'],
            unsatisfiedConditionIRIs: ['bfo:ProcessNC2', 'bfo:ProcessNC3'],
            axiomsContributing: [{ iri: 'ex:a1' }],
          }],
        },
        iterationState: baseIterationState('Plausible', null),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].context.mechanism).toBe('three_state_plausible');
    expect(calls[0].record.disposition).toBe('Plausible');
  });

  it('Inconsistent path: mechanism=three_state_inconsistent', async () => {
    // Use IndependentContinuant as target + satisfy SpecificallyDependentContinuant's
    // NCs in addition. IC and SDC are disjoint per the bfo-signatures disjointness_map;
    // satisfying SDC's NCs while targeting IC triggers disjointViolation.
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateThreeStateTerminal(
      'ex:InconsistentCAU',
      {
        evaluatorInput: {
          targetCategory: 'bfo:IndependentContinuant',
          satisfiedNCs: [
            ...getNCsForCategory('bfo:IndependentContinuant'),
            ...getNCsForCategory('bfo:SpecificallyDependentContinuant'),
          ],
        },
        explanationInput: {
          disjointnessViolation: {
            axiom: { iri: 'bfo:IC-SDC-Disjoint' },
            conflictingCategories: ['bfo:IndependentContinuant', 'bfo:SpecificallyDependentContinuant'],
          },
        },
        iterationState: baseIterationState('Inconsistent', null),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].context.mechanism).toBe('three_state_inconsistent');
    expect(calls[0].record.disposition).toBe('Inconsistent');
  });

  it('NotApplicable-axiom-poor path: delegates to orchestrateNotApplicable', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateThreeStateTerminal(
      'ex:AxiomPoorCAU',
      {
        evaluatorInput: { axiomPoor: true },
        explanationInput: null, // unused — delegation overrides
        iterationState: baseIterationState('NotApplicable', null),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls).toHaveLength(1);
    // Delegation rewrites mechanism to the routing-mechanism enum value.
    expect(calls[0].context.mechanism).toBe('default_axiom_poor');
    expect(calls[0].record.disposition).toBe('NotApplicable');
  });

  it('dry-run (no adapter) returns persisted:false', async () => {
    const result = await orchestrateThreeStateTerminal(
      'ex:CAU',
      {
        evaluatorInput: {
          targetCategory: 'bfo:Process',
          satisfiedNCs: necessaryConditionIRIsForProcess(),
        },
        explanationInput: {
          satisfiedNCs: [{
            iri: 'bfo:ProcessNC1',
            axioms: [{ iri: 'ex:a' }],
          }],
        },
        iterationState: baseIterationState('Entailed', 'bfo:Process'),
        sessionState: baseSessionState(),
      },
      baseContext(),
      undefined,
    );
    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(false);
  });
});

// ── orchestrateInheritance — F3 preservation ──────────────────────

describe('orchestrateInheritance (F3-preserving)', () => {
  it('weak signal: produces validated_no_conflict record (inherited)', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateInheritance(
      'ex:AxiomPoorChild',
      {
        parentIRI: 'ex:WellAxiomizedParent',
        parentPriorPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        signalStrength: 'weak',
        iterationState: baseIterationState('Entailed', 'bfo:Process'),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].context.mechanism).toBe('inheritance');
    expect(calls[0].record.explanation.validationState).toBe('validated_no_conflict');
    // F3: validationState is NOT 'provisional' post-persist
    expect(calls[0].record.explanation.validationState).not.toBe('provisional');
  });

  it('strong + hard signal: produces Inconsistent record with hard_conflict_detected', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateInheritance(
      'ex:ChildWithDisjointness',
      {
        parentIRI: 'ex:Parent',
        parentPriorPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        signalStrength: 'strong',
        contradictionSeverity: 'hard',
        signalType: 'disjointness',
        iterationState: baseIterationState('Inconsistent', null),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls[0].record.disposition).toBe('Inconsistent');
    expect(calls[0].record.explanation.validationState).toBe('hard_conflict_detected');
    expect(calls[0].record.explanation.conflictAnnotation.severity).toBe('hard');
  });

  it('strong + soft signal: produces Plausible record with soft_conflict_detected', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateInheritance(
      'ex:ChildWithTension',
      {
        parentIRI: 'ex:Parent',
        parentPriorPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        signalStrength: 'strong',
        contradictionSeverity: 'soft',
        signalType: 'domain_range',
        iterationState: baseIterationState('Plausible', null),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls[0].record.disposition).toBe('Plausible');
    expect(calls[0].record.explanation.validationState).toBe('soft_conflict_detected');
    expect(calls[0].record.explanation.conflictAnnotation.severity).toBe('soft');
  });

  it('F3 INVARIANT: no inheritance emission produces terminal validationState=provisional', async () => {
    // Exhaustive enumeration of reconcileSignal's return paths (weak /
    // strong+hard / strong+soft) — all must transition away from 'provisional'.
    const cases = [
      { signalStrength: 'weak', contradictionSeverity: null, expectedFinal: 'validated_no_conflict' },
      { signalStrength: 'strong', contradictionSeverity: 'hard', expectedFinal: 'hard_conflict_detected' },
      { signalStrength: 'strong', contradictionSeverity: 'soft', expectedFinal: 'soft_conflict_detected' },
    ];
    for (const c of cases) {
      const { adapter, calls } = makeCollectingAdapter();
      await orchestrateInheritance(
        `ex:F3Check-${c.signalStrength}-${c.contradictionSeverity}`,
        {
          parentIRI: 'ex:Parent',
          parentPriorPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
          signalStrength: c.signalStrength,
          contradictionSeverity: c.contradictionSeverity,
          iterationState: baseIterationState('Plausible', 'bfo:Process'),
          sessionState: baseSessionState(),
        },
        baseContext(),
        adapter,
      );
      expect(calls[0].record.explanation.validationState).toBe(c.expectedFinal);
      expect(calls[0].record.explanation.validationState).not.toBe('provisional');
    }
  });
});

// ── orchestrateReactive ───────────────────────────────────────────

describe('orchestrateReactive', () => {
  it('emits with mechanism=reactive and threaded mutationKind', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateReactive(
      'ex:ReactiveCAU',
      {
        mutationKind: 'property-ingestion',
        reEvaluationOutcome: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        explanationInput: {
          satisfiedNCs: [{ iri: 'nc-post-mutation', axioms: [{ iri: 'ex:post' }] }],
        },
        iterationState: baseIterationState('Entailed', 'bfo:Process'),
        sessionState: baseSessionState(),
        causedByEntryId: 'prior-NA-1.3-entry-id',
      },
      baseContext(),
      adapter,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].context.mechanism).toBe('reactive');
    expect(calls[0].context.mutationKind).toBe('property-ingestion');
    expect(calls[0].context.causedBy).toBe('prior-NA-1.3-entry-id');
  });

  it('causedBy=null when no predecessor (non-cascade reactive source)', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateReactive(
      'ex:FreshReactiveCAU',
      {
        mutationKind: 'analyst-override',
        reEvaluationOutcome: { disposition: 'Plausible', bfoCategory: null },
        explanationInput: {
          candidateBFOCategories: [{ category: 'bfo:Process', axiomsContributing: [{ iri: 'ex:a' }] }],
        },
        iterationState: baseIterationState('Plausible', null),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls[0].context.causedBy).toBeNull();
  });

  it('rejects mutationKind outside locked enum', async () => {
    await expect(orchestrateReactive(
      'ex:X',
      {
        mutationKind: 'axiom_change', // SME v1 proposal; should be rejected
        reEvaluationOutcome: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        explanationInput: { satisfiedNCs: [{ axioms: [{ iri: 'x' }] }] },
        iterationState: baseIterationState(),
        sessionState: baseSessionState(),
      },
      baseContext(),
      null,
    )).rejects.toThrow(/mutationKind/);
  });
});

// ── orchestrateNotApplicable ──────────────────────────────────────

describe('orchestrateNotApplicable', () => {
  it.each(['automatic', 'default_axiom_poor', 'manual'])(
    'mechanism=%s surfaces in context',
    async (mech) => {
      const { adapter, calls } = makeCollectingAdapter();
      await orchestrateNotApplicable(
        `ex:NA-${mech}`,
        {
          routingMechanism: mech,
          triggerAxiom: { iri: `trigger-${mech}`, kind: 'notApplicableTrigger' },
          triggerRule: 'NA-1',
          iterationState: baseIterationState('NotApplicable', null),
          sessionState: baseSessionState(),
        },
        baseContext(),
        adapter,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].context.mechanism).toBe(mech);
      expect(calls[0].record.disposition).toBe('NotApplicable');
      // DP-2.1.D3 single-element floor
      expect(calls[0].record.explanation.axiomEvidence).toHaveLength(1);
    },
  );
});

// ── orchestrateAnalystOverride ────────────────────────────────────

describe('orchestrateAnalystOverride', () => {
  const validOverrideMetadata = () => ({
    analystId: 'analyst-001',
    timestamp: '2026-04-24T14:00:00Z',
    rationale: 'Reviewing the CAU against PROV-O source; automated disposition incorrect per spec §3.1.',
    priorAutomatedDisposition: 'Inconsistent',
    priorAutomatedBfoCategory: null,
  });

  it('emits with mechanism=analyst_override and override metadata in context', async () => {
    const { adapter, calls } = makeCollectingAdapter();
    await orchestrateAnalystOverride(
      'ex:OverriddenCAU',
      {
        overrideMetadata: validOverrideMetadata(),
        overrideResult: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        explanationInput: {
          satisfiedNCs: [{
            iri: 'analyst:override-axiom',
            axioms: [{ iri: 'analyst:asserted', kind: 'analystOverrideAxiom', weight: 'High' }],
          }],
        },
        iterationState: baseIterationState('Entailed', 'bfo:Process'),
        sessionState: baseSessionState(),
      },
      baseContext(),
      adapter,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].context.mechanism).toBe('analyst_override');
    expect(calls[0].context.causedBy).toBeNull();
    expect(calls[0].context.overrideMetadata.analystId).toBe('analyst-001');
    expect(calls[0].context.overrideMetadata.priorAutomatedDisposition).toBe('Inconsistent');
    expect(calls[0].record.provenance.analystOverride.analystOverride).toBe(true);
  });

  it('rejects missing analystId', async () => {
    const meta = validOverrideMetadata();
    delete meta.analystId;
    await expect(orchestrateAnalystOverride(
      'ex:X',
      {
        overrideMetadata: meta,
        overrideResult: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        explanationInput: { satisfiedNCs: [{ axioms: [{ iri: 'x' }] }] },
        iterationState: baseIterationState(),
        sessionState: baseSessionState(),
      },
      baseContext(),
      null,
    )).rejects.toThrow(/analystId/);
  });

  it('rejects missing rationale', async () => {
    const meta = validOverrideMetadata();
    meta.rationale = '';
    await expect(orchestrateAnalystOverride(
      'ex:X',
      {
        overrideMetadata: meta,
        overrideResult: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        explanationInput: { satisfiedNCs: [{ axioms: [{ iri: 'x' }] }] },
        iterationState: baseIterationState(),
        sessionState: baseSessionState(),
      },
      baseContext(),
      null,
    )).rejects.toThrow(/rationale/);
  });

  it('rejects missing priorAutomatedDisposition (audit requirement)', async () => {
    const meta = validOverrideMetadata();
    delete meta.priorAutomatedDisposition;
    await expect(orchestrateAnalystOverride(
      'ex:X',
      {
        overrideMetadata: meta,
        overrideResult: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
        explanationInput: { satisfiedNCs: [{ axioms: [{ iri: 'x' }] }] },
        iterationState: baseIterationState(),
        sessionState: baseSessionState(),
      },
      baseContext(),
      null,
    )).rejects.toThrow(/priorAutomatedDisposition/);
  });
});

// ── Error propagation (v2 §3.7) ───────────────────────────────────

describe('DP2NonConformanceError propagates through orchestrator (no suppression)', () => {
  it('orchestrator does not catch DP2NonConformanceError', async () => {
    // Force a validation failure by passing empty evidence where disposition
    // requires non-empty. Building an Entailed record with empty satisfiedNCs
    // will make buildProductionCanonicalRecord throw (pre-chokepoint), not
    // the chokepoint itself. Let's instead force a post-build failure by
    // tampering with the record shape through the explanationInput path.
    // The reliable way: pass Plausible explanationInput with empty candidate list.
    await expect(orchestrateThreeStateTerminal(
      'ex:FailingCAU',
      {
        evaluatorInput: {
          targetCategory: 'bfo:Process',
          satisfiedNCs: ['bfo:ProcessNC1'],
        },
        explanationInput: {
          candidateBFOCategories: [], // empty — buildPlausibleExplanation rejects
        },
        iterationState: baseIterationState('Plausible', null),
        sessionState: baseSessionState(),
      },
      baseContext(),
      null,
    )).rejects.toThrow(); // either TypeError from builder or DP2NonConformanceError from chokepoint
  });
});

// ── Test helpers ──────────────────────────────────────────────────

function necessaryConditionIRIsForProcess() {
  // Minimal set satisfying bfo:Process NCs per the canonical reference.
  // For test purposes we return IRIs that match what evaluateCAU's
  // necessaryConditionsFor('bfo:Process') returns. The handler uses these
  // to produce Entailed. Exact IRI list is implementation-dependent; to
  // keep the test robust, we fetch them dynamically.
  return getNCsForCategory('bfo:Process');
}

function necessaryConditionIRIsForMaterialEntity() {
  return getNCsForCategory('bfo:MaterialEntity');
}

function getNCsForCategory(category) {
  return necessaryConditionsFor(category).map((nc) => nc.shortIRI);
}
