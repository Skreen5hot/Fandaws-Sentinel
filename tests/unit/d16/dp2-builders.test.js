/**
 * Unit tests — DP-2.2 explanation-builder + provenance-builder +
 * production canonical record assembly through the writer.
 */

import {
  buildEntailedExplanation,
  buildPlausibleExplanation,
  buildInconsistentExplanation,
  buildNotApplicableExplanation,
} from '../../../src/core/d16/explanation-builder.js';
import {
  buildProvenance,
  buildReconciliationEntry,
} from '../../../src/core/d16/provenance-builder.js';
import {
  writeCanonicalRecord,
  buildProductionCanonicalRecord,
} from '../../../src/core/d16/canonical-record-writer.js';
import {
  resetForTests as resetAxiomDict,
  dictionarySize,
} from '../../../src/core/d16/axiom-dictionary.js';

beforeEach(() => resetAxiomDict());

const SESSION = 'test-sess-001';
const CAU = 'ex:TestCAU';

// ── explanation-builder ────────────────────────────────────────────

describe('buildEntailedExplanation', () => {
  it('produces structured explanation with dictionary-backed axiom evidence', async () => {
    const exp = await buildEntailedExplanation({
      cauIRI: CAU,
      sessionId: SESSION,
      bfoCategory: 'bfo:Process',
      satisfiedNCs: [
        {
          iri: 'bfo:ProcessNC1',
          axioms: [{ iri: 'ex:hasParticipant', kind: 'restriction', target: 'bfo:Continuant', weight: 'High' }],
          bfoCategoryAffected: 'bfo:Process',
        },
      ],
      alternativesConsidered: [{ bfoCategory: 'bfo:Occurrent', result: 'rejected: narrower winner' }],
    });
    expect(exp.axiomEvidence.length).toBeGreaterThanOrEqual(1);
    expect(exp.axiomEvidence[0].axiomIRI).toMatch(/^[0-9a-f]{64}$/); // dictionary ID
    expect(exp.axiomEvidence[0].contributionRole).toBe('satisfiedNecessaryCondition');
    expect(exp.validationState).toBe('not_inherited');
    expect(exp.conflictAnnotation).toBeNull();
    expect(exp.reconciliationHistory).toEqual([]);
    expect(exp.alternativesConsidered).toHaveLength(1);
  });

  it('rejects empty satisfiedNCs', async () => {
    await expect(buildEntailedExplanation({
      cauIRI: CAU, sessionId: SESSION, bfoCategory: 'bfo:Process', satisfiedNCs: [],
    })).rejects.toThrow();
  });

  it('rejects terminal validationState=provisional (F3)', async () => {
    await expect(buildEntailedExplanation({
      cauIRI: CAU, sessionId: SESSION, bfoCategory: 'bfo:Process',
      satisfiedNCs: [{ axioms: [{ iri: 'x' }] }],
      validationState: 'provisional',
    })).rejects.toThrow(/provisional/);
  });
});

describe('buildPlausibleExplanation', () => {
  it('produces structured per-category evidence (no prose fields)', async () => {
    const exp = await buildPlausibleExplanation({
      cauIRI: CAU,
      sessionId: SESSION,
      candidateBFOCategories: [
        {
          category: 'bfo:Process',
          conditionsSatisfied: 3,
          conditionsTotal: 5,
          satisfiedConditionIRIs: ['bfo:ProcessNC1', 'bfo:ProcessNC2', 'bfo:ProcessNC3'],
          unsatisfiedConditionIRIs: ['bfo:ProcessNC4', 'bfo:ProcessNC5'],
          axiomsContributing: [{ iri: 'ex:axiom1' }, { iri: 'ex:axiom2' }],
        },
        {
          category: 'bfo:Occurrent',
          conditionsSatisfied: 2,
          conditionsTotal: 3,
          satisfiedConditionIRIs: ['bfo:OccurrentNC1', 'bfo:OccurrentNC2'],
          unsatisfiedConditionIRIs: ['bfo:OccurrentNC3'],
          axiomsContributing: [{ iri: 'ex:axiom3' }],
        },
      ],
    });
    expect(exp.candidateBFOCategories).toHaveLength(2);
    expect(exp.candidateBFOCategories[0].axiomsContributingByID[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(exp.axiomEvidence.length).toBeGreaterThanOrEqual(3);
    // No prose anywhere in the candidate summaries
    for (const cat of exp.candidateBFOCategories) {
      for (const value of Object.values(cat)) {
        if (typeof value === 'string' && value !== cat.category) {
          // IRI strings are fine; arbitrary prose sentences are not expected
          expect(value.length).toBeLessThan(200);
        }
      }
    }
  });

  it('tags heuristicSignals with advisory:true', async () => {
    const exp = await buildPlausibleExplanation({
      cauIRI: CAU, sessionId: SESSION,
      candidateBFOCategories: [{ category: 'bfo:Process', axiomsContributing: [{ iri: 'x' }] }],
      heuristicSignals: [{ signal: 'lexical_match_to_bfo_process', weight: 'low' }],
    });
    expect(exp.heuristicSignals[0].advisory).toBe(true);
  });
});

describe('buildInconsistentExplanation', () => {
  it('names disjointness axiom and conflicting categories', async () => {
    const exp = await buildInconsistentExplanation({
      cauIRI: CAU,
      sessionId: SESSION,
      disjointnessViolation: {
        axiom: { iri: 'bfo:ContinuantOccurrentDisjoint', kind: 'disjointness' },
        conflictingCategories: ['bfo:IndependentContinuant', 'bfo:Occurrent'],
      },
    });
    expect(exp.axiomEvidence).toHaveLength(1);
    expect(exp.axiomEvidence[0].contributionRole).toBe('triggeredDisjointness');
    expect(exp.disjointnessViolation.conflictingCategories).toEqual([
      'bfo:IndependentContinuant', 'bfo:Occurrent',
    ]);
    expect(exp.disjointnessViolation.axiomIRI).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requires at least 2 conflicting categories', async () => {
    await expect(buildInconsistentExplanation({
      cauIRI: CAU, sessionId: SESSION,
      disjointnessViolation: {
        axiom: { iri: 'ax' }, conflictingCategories: ['bfo:Only'],
      },
    })).rejects.toThrow(/conflictingCategories/);
  });
});

describe('buildNotApplicableExplanation', () => {
  it.each(['automatic', 'default_axiom_poor', 'manual'])(
    'accepts routing mechanism %s with single-element evidence (DP-2.1.D3 floor)',
    async (mech) => {
      const exp = await buildNotApplicableExplanation({
        cauIRI: CAU,
        sessionId: SESSION,
        routingMechanism: mech,
        triggerAxiom: { iri: 'ex:skos:Concept', kind: 'nonBfoDeclaration' },
      });
      expect(exp.axiomEvidence).toHaveLength(1);
      expect(exp.axiomEvidence[0].contributionRole).toBe('routingTrigger');
      expect(exp.routingMechanism).toBe(mech);
    },
  );

  it('rejects routing mechanism outside closed enum (D2.4)', async () => {
    await expect(buildNotApplicableExplanation({
      cauIRI: CAU, sessionId: SESSION,
      routingMechanism: 'curated_list_match',
      triggerAxiom: { iri: 'x' },
    })).rejects.toThrow(/Closed enum/);
  });

  it('requires triggerAxiom (single-element floor)', async () => {
    await expect(buildNotApplicableExplanation({
      cauIRI: CAU, sessionId: SESSION,
      routingMechanism: 'automatic',
    })).rejects.toThrow(/triggerAxiom/);
  });
});

// ── provenance-builder ─────────────────────────────────────────────

describe('buildProvenance', () => {
  const validInput = () => ({
    cauIRI: CAU,
    sessionId: SESSION,
    iterationState: {
      rounds: [{ round: 0, disposition: 'Entailed', bfoCategory: 'bfo:Process', reasonerStepsConsumed: 42, timestamp: '2026-04-24T00:00:00Z' }],
    },
    sessionState: { backgroundTheoryVersion: 'BFO-2020 + curated-v1.0' },
  });

  it('emits §7.3-shape provenance with iteration history', () => {
    const p = buildProvenance(validInput());
    expect(p.sessionId).toBe(SESSION);
    expect(p.iterationHistory).toHaveLength(1);
    expect(p.iterationHistory[0]).toEqual(expect.objectContaining({
      round: 0, disposition: 'Entailed', bfoCategory: 'bfo:Process', reasonerStepsConsumed: 42, timestamp: '2026-04-24T00:00:00Z',
    }));
    expect(p.reasonerState.backgroundTheoryVersion).toBe('BFO-2020 + curated-v1.0');
    expect(p.reasonerState.stepCountConsumed).toBe(42);
    expect(p.reasonerState.fallbackInvoked).toBe(false);
    expect(p.compatibilityDegraded).toBe(false);
    expect(p.analystOverride).toBe(false);
  });

  it('multi-round iteration sets fallbackInvoked=true', () => {
    const input = validInput();
    input.iterationState.rounds.push({ round: 1, disposition: 'Entailed', bfoCategory: 'bfo:Process', reasonerStepsConsumed: 30 });
    const p = buildProvenance(input);
    expect(p.iterationHistory).toHaveLength(2);
    expect(p.reasonerState.fallbackInvoked).toBe(true);
    expect(p.reasonerState.stepCountConsumed).toBe(72);
  });

  it('rejects empty iterationHistory (DP-2-R2)', () => {
    const input = validInput();
    input.iterationState.rounds = [];
    expect(() => buildProvenance(input)).toThrow(/non-empty/);
  });

  it('propagates compatibilityDegraded session flag (DP-1 sticky)', () => {
    const input = validInput();
    input.sessionState.compatibilityDegraded = true;
    const p = buildProvenance(input);
    expect(p.compatibilityDegraded).toBe(true);
  });

  it('surfaces analystOverride with originalDisposition', () => {
    const input = validInput();
    input.overrideInfo = { analystOverride: true, originalDisposition: 'Inconsistent' };
    const p = buildProvenance(input);
    expect(p.analystOverride).toEqual({ analystOverride: true, originalDisposition: 'Inconsistent' });
  });
});

describe('buildReconciliationEntry (D2.3 + F1)', () => {
  it('builds entry with causedBy=null for independent event', () => {
    const entry = buildReconciliationEntry({
      priorPlacement: { disposition: 'Plausible', bfoCategory: null },
      triggeringEvent: 'analyst_override',
      updatedPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
    });
    expect(entry.causedBy).toBeNull();
    expect(entry.triggeringEvent).toBe('analyst_override');
  });

  it('F1: captures causedBy for cascade-chained events', () => {
    const entry = buildReconciliationEntry({
      priorPlacement: { disposition: 'Plausible', bfoCategory: null },
      triggeringEvent: 'na14_mutation',
      updatedPlacement: { disposition: 'Plausible', bfoCategory: null },
      causedBy: 0, // single prior entry case — causedBy is the immediate predecessor
    });
    expect(entry.causedBy).toBe(0);
  });

  it('F1 immediate-predecessor semantic: multi-step cascade preserves chain-walk', () => {
    // NA-1.3 cascade root: parent reconciliation (causedBy:null)
    const rootEntry = buildReconciliationEntry({
      priorPlacement: { disposition: 'Plausible', bfoCategory: null },
      triggeringEvent: 'parent_reconciliation',
      updatedPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
      causedBy: null,
    });
    // Descendant reconciles in response — immediate predecessor is the root at index 0
    const descendantEntry = buildReconciliationEntry({
      priorPlacement: { disposition: 'Plausible', bfoCategory: null },
      triggeringEvent: 'parent_reconciliation',
      updatedPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
      causedBy: 0,
    });
    // NA-1.4 mutation cascade fires from the descendant — causedBy is descendant (index 1),
    // NOT the root (index 0). This is the load-bearing semantic.
    const reactiveEntry = buildReconciliationEntry({
      priorPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
      triggeringEvent: 'na14_mutation',
      updatedPlacement: { disposition: 'Entailed', bfoCategory: 'bfo:Process' },
      causedBy: 1,
    });

    const chain = [rootEntry, descendantEntry, reactiveEntry];

    // Walk backward from reactiveEntry via causedBy — must reach root at null.
    const walked = [];
    let idx = chain.length - 1;
    while (idx !== null && idx !== undefined) {
      walked.push(idx);
      idx = chain[idx].causedBy;
    }
    expect(walked).toEqual([2, 1, 0]); // full chain walkable
    expect(chain[walked[walked.length - 1]].causedBy).toBeNull(); // root reached
  });

  it('rejects invalid triggeringEvent', () => {
    expect(() => buildReconciliationEntry({
      priorPlacement: {}, triggeringEvent: 'bogus_trigger', updatedPlacement: {},
    })).toThrow(TypeError);
  });
});

// ── Production record assembly end-to-end ──────────────────────────

describe('buildProductionCanonicalRecord + writer integration', () => {
  const baseSessionState = () => ({ backgroundTheoryVersion: 'BFO-2020', compatibilityDegraded: false });
  const baseIterationState = (disposition, bfoCategory) => ({
    rounds: [{ round: 0, disposition, bfoCategory, reasonerStepsConsumed: 10, timestamp: '2026-04-24T00:00:00Z' }],
  });

  it('Entailed production record passes I1 + I2a', async () => {
    const record = await buildProductionCanonicalRecord({
      cauIRI: CAU,
      sessionId: SESSION,
      disposition: 'Entailed',
      bfoCategory: 'bfo:Process',
      explanationInput: {
        satisfiedNCs: [{ iri: 'bfo:ProcessNC1', axioms: [{ iri: 'ex:hp', target: 'bfo:Continuant' }] }],
      },
      iterationState: baseIterationState('Entailed', 'bfo:Process'),
      sessionState: baseSessionState(),
    });
    expect(writeCanonicalRecord(record, { phase: 'production' }).ok).toBe(true);
    expect(dictionarySize(SESSION)).toBeGreaterThanOrEqual(1);
  });

  it('Plausible production record passes + dictionary-IDs present', async () => {
    const record = await buildProductionCanonicalRecord({
      cauIRI: CAU,
      sessionId: SESSION,
      disposition: 'Plausible',
      bfoCategory: null,
      explanationInput: {
        candidateBFOCategories: [
          { category: 'bfo:Process', conditionsSatisfied: 3, conditionsTotal: 5,
            satisfiedConditionIRIs: ['nc1', 'nc2', 'nc3'], unsatisfiedConditionIRIs: ['nc4', 'nc5'],
            axiomsContributing: [{ iri: 'ex:a1' }] },
        ],
      },
      iterationState: baseIterationState('Plausible', null),
      sessionState: baseSessionState(),
    });
    expect(writeCanonicalRecord(record, { phase: 'production' }).ok).toBe(true);
    expect(record.explanation.candidateBFOCategories[0].axiomsContributingByID[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Inconsistent production record passes', async () => {
    const record = await buildProductionCanonicalRecord({
      cauIRI: CAU,
      sessionId: SESSION,
      disposition: 'Inconsistent',
      bfoCategory: null,
      explanationInput: {
        disjointnessViolation: {
          axiom: { iri: 'bfo:disjoint-IC-Occ' },
          conflictingCategories: ['bfo:IndependentContinuant', 'bfo:Occurrent'],
        },
      },
      iterationState: baseIterationState('Inconsistent', null),
      sessionState: baseSessionState(),
    });
    expect(writeCanonicalRecord(record, { phase: 'production' }).ok).toBe(true);
  });

  it('NotApplicable production record passes with single-element evidence', async () => {
    const record = await buildProductionCanonicalRecord({
      cauIRI: CAU,
      sessionId: SESSION,
      disposition: 'NotApplicable',
      bfoCategory: null,
      explanationInput: {
        routingMechanism: 'default_axiom_poor',
        triggerAxiom: { iri: 'ex:insufficient-axioms' },
      },
      iterationState: baseIterationState('NotApplicable', null),
      sessionState: baseSessionState(),
    });
    expect(writeCanonicalRecord(record, { phase: 'production' }).ok).toBe(true);
    expect(record.explanation.axiomEvidence).toHaveLength(1);
  });

  it('sets compatibilityDegraded from sessionState', async () => {
    const record = await buildProductionCanonicalRecord({
      cauIRI: CAU,
      sessionId: SESSION,
      disposition: 'Entailed',
      bfoCategory: 'bfo:Process',
      explanationInput: {
        satisfiedNCs: [{ axioms: [{ iri: 'x' }] }],
      },
      iterationState: baseIterationState('Entailed', 'bfo:Process'),
      sessionState: { backgroundTheoryVersion: 'BFO-2020', compatibilityDegraded: true },
    });
    expect(record.provenance.compatibilityDegraded).toBe(true);
  });
});
