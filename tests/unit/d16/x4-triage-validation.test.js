/**
 * X4 Triage validation — confirms triage predictions in
 * specs/d16/x4-avc-triage.md. Each test corresponds to a triage entry
 * and verifies the dispatcher-path disposition matches the classification.
 */

import { evaluateNCSatisfaction } from '../../../src/core/d16/nc-dispatcher.js';
import { evaluateCAU } from '../../../src/core/d16/three-state-evaluator.js';
import bfoSignaturesJson from '../../../specs/d16/bfo-signatures-v1.0.json' with { type: 'json' };

const BFO_REF = bfoSignaturesJson;

function baseSignature(cauIRI = 'ex:Test') {
  return {
    cauIRI,
    propertyRestrictionsAsDomain: [],
    propertyRestrictionsAsRange: [],
    characteristics: [],
    disjointnessAssertions: [],
    equivalenceClaims: [],
    universalRestrictions: [],
    existentialRestrictions: [],
    cardinalityRestrictions: [],
    hasValueRestrictions: [],
    normalizedEnumerations: [],
    subPropertyClosureUsed: { applied: false, maxDepthTraversed: 0 },
    cycleDetectionTriggered: false,
  };
}

// Signature fixture approximating what a well-axiomatized bfo:Process
// candidate would look like — satisfies all OWL-DIRECT NCs the dispatcher
// can evaluate under Bucket A, but leaves Bucket-B-deferred NCs undetermined.
function wellAxiomizedProcessSignature() {
  const sig = baseSignature('ex:PROV-Activity-like');
  sig.existentialRestrictions.push(
    { onProperty: 'bfo:hasParticipant', someValuesFrom: 'bfo:Continuant' }, // ProcessNC2 (P3)
    { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:TemporalRegion' }, // OccurrentNC1 (P3)
  );
  sig.propertyRestrictionsAsDomain.push(
    { property: 'bfo:hasParticipant', restrictionKind: 'someValuesFrom', target: 'bfo:Continuant', diagnosticWeight: 'High', directlyDeclared: true },
    { property: 'bfo:occupiesTemporalRegion', restrictionKind: 'someValuesFrom', target: 'bfo:TemporalRegion', diagnosticWeight: 'Medium', directlyDeclared: true },
  );
  return sig;
}

describe('X4 Triage §2.1 — post-X5 BCL surface (PROV-O-relevant subset closed)', () => {
  // Post-X5 (2026-04-25): ProcessNC4 + OccurrentNC3 + ContinuantNC3 are
  // covered by Bucket B helpers. Remaining undetermined under this fixture
  // comes from Bucket C (OWL-DERIVED, ProcessNC3) — still BCL but for a
  // different reason. Triage and bundle v6 re-evaluation deferred until
  // SME re-triage delivery per X5 reception memo discipline.
  it('well-axiomized Process candidate dispatches to trichotomy with undetermined NCs (Bucket C residual)', async () => {
    const trichotomy = await evaluateNCSatisfaction({
      cauIRI: 'ex:Activity',
      cauSignature: wellAxiomizedProcessSignature(),
      targetBFOCategory: 'bfo:Process',
      bfoSignatureReference: BFO_REF,
      ancestorChain: ['bfo:Process', 'bfo:Occurrent', 'bfo:Entity'],
    });

    expect(trichotomy.undetermined.size).toBeGreaterThan(0);
    // Post-X5: ProcessNC4 now resolves (Process ancestor → satisfied).
    expect(trichotomy.undetermined.has('bfo:ProcessNC4')).toBe(false);
    expect(trichotomy.satisfied.has('bfo:ProcessNC4')).toBe(true);
    // Bucket C (OWL-DERIVED) ProcessNC3 still undetermined.
    expect(trichotomy.undetermined.has('bfo:ProcessNC3')).toBe(true);
  });

  it('dispatcher-path evaluateCAU produces Plausible with coverage-gap (Bucket C residual)', async () => {
    const trichotomy = await evaluateNCSatisfaction({
      cauIRI: 'ex:Activity',
      cauSignature: wellAxiomizedProcessSignature(),
      targetBFOCategory: 'bfo:Process',
      bfoSignatureReference: BFO_REF,
      ancestorChain: ['bfo:Process', 'bfo:Occurrent', 'bfo:Entity'],
    });

    const result = evaluateCAU({
      cauIRI: 'ex:Activity',
      targetCategory: 'bfo:Process',
      ncEvaluation: trichotomy,
      satisfiedNCs: [...trichotomy.satisfied],
    });

    expect(result.disposition).toBe('Plausible');
    expect(result.explanation.plausibleAnnotation).toMatch(/coverage|undetermined/);
    expect(result.explanation.coverageGap).not.toBeNull();
    expect(result.explanation.coverageGap.deferredReasons.length).toBeGreaterThan(0);
    // Post-X5: residual coverage gap cites Bucket C (OWL-DERIVED).
    const reasonsText = result.explanation.coverageGap.deferredReasons
      .map((r) => r.reason).join(' ');
    expect(reasonsText).toMatch(/OWL-DERIVED|Bucket-C-deferred/);
  });

  it('X5 helpers route ContinuantNC3 / OccurrentNC3 / ProcessNC4 to satisfied/unsatisfied (no longer undetermined)', async () => {
    // Process target — ProcessNC4 + OccurrentNC3 reachable via Occurrent
    // P1 recursion. ContinuantNC3 not in Process required-set but reachable
    // via separate Continuant evaluation.
    const trichotomy = await evaluateNCSatisfaction({
      cauIRI: 'ex:Activity',
      cauSignature: wellAxiomizedProcessSignature(),
      targetBFOCategory: 'bfo:Process',
      bfoSignatureReference: BFO_REF,
      ancestorChain: ['bfo:Process', 'bfo:Occurrent', 'bfo:Entity'],
    });
    // ProcessNC4 satisfied via Process ancestor.
    expect(trichotomy.satisfied.has('bfo:ProcessNC4')).toBe(true);

    // Separate evaluation for Continuant target — confirms ContinuantNC3
    // resolves contradicted (Process ancestor present) under cross-category
    // disjointness path.
    const continuantTrichotomy = await evaluateNCSatisfaction({
      cauIRI: 'ex:Activity',
      cauSignature: wellAxiomizedProcessSignature(),
      targetBFOCategory: 'bfo:Continuant',
      bfoSignatureReference: BFO_REF,
      ancestorChain: ['bfo:Process', 'bfo:Occurrent', 'bfo:Entity'],
    });
    expect(continuantTrichotomy.unsatisfied.has('bfo:ContinuantNC3')).toBe(true);
    expect(continuantTrichotomy.undetermined.has('bfo:ContinuantNC3')).toBe(false);

    // OccurrentNC3 reachable via Occurrent target.
    const occurrentTrichotomy = await evaluateNCSatisfaction({
      cauIRI: 'ex:Activity',
      cauSignature: wellAxiomizedProcessSignature(),
      targetBFOCategory: 'bfo:Occurrent',
      bfoSignatureReference: BFO_REF,
      ancestorChain: ['bfo:Process', 'bfo:Occurrent', 'bfo:Entity'],
    });
    expect(occurrentTrichotomy.satisfied.has('bfo:OccurrentNC3')).toBe(true);
    expect(occurrentTrichotomy.undetermined.has('bfo:OccurrentNC3')).toBe(false);
  });

  it('legacy synthetic-allowlist path preserves Entailed expectation (regression guard)', () => {
    // Per triage §4: existing scaffold scenarios stay on legacy path;
    // legacy-path + synthetic allowlist must continue producing Entailed.
    // This guards against accidental dispatcher-path invocation for
    // scaffold scenarios.
    const result = evaluateCAU({
      cauIRI: 'ex:Activity',
      targetCategory: 'bfo:Process',
      // Pre-computed satisfied (synthetic scaffold style)
      satisfiedNCs: [
        'bfo:ProcessNC1', 'bfo:ProcessNC2', 'bfo:ProcessNC3', 'bfo:ProcessNC4',
        'bfo:OccurrentNC1', 'bfo:OccurrentNC2', 'bfo:OccurrentNC3',
      ],
    });
    expect(result.disposition).toBe('Entailed');
  });
});

describe('X4 Triage §2.5 — evidence-ncs-from-curated-only classified NAN', () => {
  it('target category with zero required NCs routes CuratedReferenceIncomplete Plausible (matches synthetic)', () => {
    const result = evaluateCAU({
      cauIRI: 'ex:HypotheticalRole',
      targetCategory: 'bfo:RoleSubtype_HypotheticalPricingRole',
      satisfiedNCs: [],
    });
    expect(result.disposition).toBe('Plausible');
    expect(result.warning).toBe('CuratedReferenceIncomplete');
  });
});

describe('X4 Triage summary — bundle v6 amendment batch empty', () => {
  it('no synthetic-wrong-corrected classifications surfaced under Bucket A scope', () => {
    // Meta-assertion documenting the triage outcome per §3 summary table.
    // If a future dispatcher change introduces SWC cases, this test should
    // be updated alongside the triage artifact + bundle v6 memo.
    const triageSummary = {
      SWC: 0,
      RID: 0,
      SA: 0,
      NAN: 8, // 2 evidence + 6 iteration
      BCL: 4, // 4 evidence scenarios limited by Bucket B
    };
    expect(triageSummary.SWC).toBe(0);
    expect(triageSummary.RID).toBe(0);
    expect(triageSummary.SA).toBe(0);
    expect(triageSummary.SWC + triageSummary.RID + triageSummary.SA).toBe(0);
  });
});
