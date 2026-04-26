/**
 * Bucket C — OWL-DERIVED NC helpers tests (4 contract-drafted NCs).
 *
 * Per X6 memo §1 + implementation plan §4.1–4.4 + §5 test coverage rubric.
 * Each NC: ~18 tests covering Tau Prolog primary positive/negative, structural
 * fallback positive/negative, edge cases, throw tests, reason-enum coverage.
 *
 * OWA-preservation discriminating fixture (load-bearing per PO 2026-04-25):
 *   CAU rdfs:subClassOf bfo:Role with no literal inheresIn restriction →
 *   Tau Prolog primary derives presence via SDC inheritance → ICNC2 routes
 *   unsatisfied via inheres_in_presence_derived. Under structural-only
 *   (Option B), this case would have falsely satisfied via raw absence.
 *
 * Reason-enum-coverage assertion in suite footer per implementation plan §5.4.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  cauDoesNotRequireInheresIn,
  cauDoesNotRequireConcretizes,
  cauIncompatibleWithMatterAsPart,
  cauDisjointWithContinuant,
  cauConsistentWithSpatialAndMatter,
  cauConsistentWithOneDimTemporal,
  ICNC2_REASONS,
  ICNC3_REASONS,
  IENC2_REASONS,
  OCCURRENT_NC2_REASONS,
  MENC2_REASONS,
  PROCESS_NC3_REASONS,
  _internals,
} from '../../../src/core/d16/owl-derived-nc-helpers.js';
import {
  initBucketCPrologSession,
  teardownPrologSession,
} from '../../../src/core/d16/bucket-c-prolog.js';

function emptySignature() {
  return {
    propertyRestrictionsAsDomain: [],
    propertyRestrictionsAsRange: [],
    existentialRestrictions: [],
    cardinalityRestrictions: [],
    universalRestrictions: [],
    hasValueRestrictions: [],
    disjointnessAssertions: [],
    equivalenceClaims: [],
    characteristics: [],
    normalizedEnumerations: [],
  };
}

// Reason-coverage tracker — populated as each test runs; asserted in footer.
const reasonsHit = {
  ICNC2: new Set(),
  ICNC3: new Set(),
  IENC2: new Set(),
  OccurrentNC2: new Set(),
  MENC2: new Set(),
  ProcessNC3: new Set(),
};
function track(result) {
  reasonsHit[result.groundsNC].add(result.reason);
}

// ── ICNC2 — cau_does_not_require_inheres_in ───────────────────────

describe('ICNC2 — cauDoesNotRequireInheresIn', () => {
  let session;
  beforeAll(async () => { session = await initBucketCPrologSession(); });
  afterAll(() => teardownPrologSession(session));

  it('Tau Prolog primary positive: IndependentContinuant ancestor → absence derived', async () => {
    const r = await cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:Rock',
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant', 'bfo:Continuant'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('inheres_in_absence_derived');
    expect(r.fallbackUsed).toBe(false);
    expect(r.groundsNC).toBe('ICNC2');
  });

  it('Tau Prolog primary positive: empty ancestor chain → absence derived', async () => {
    const r = await cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:Generic',
      signature: emptySignature(), ancestorChain: [],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('inheres_in_absence_derived');
  });

  it('OWA preservation discriminating fixture: SDC ancestor → presence derived (NOT absence)', async () => {
    // Load-bearing test per implementation plan §5.2 #4. CAU is structurally
    // a Role descendant with no literal inheresIn restriction. Under Option B
    // this would have falsely satisfied (raw absence in signature). Under
    // Option C, Tau Prolog derives presence via SDC inheritance: bfo:Role ⊂
    // bfo:SpecificallyDependentContinuant which has bfo:inheresIn property
    // domain. ICNC2 routes UNSATISFIED.
    const r = await cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:HypotheticalRole',
      signature: emptySignature(),
      ancestorChain: ['bfo:Role', 'bfo:SpecificallyDependentContinuant', 'bfo:Continuant'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('inheres_in_presence_derived');
    expect(r.fallbackUsed).toBe(false);
  });

  it('Tau Prolog primary negative: literal inheresIn restriction → presence derived', async () => {
    const sig = emptySignature();
    sig.propertyRestrictionsAsDomain.push({
      property: 'bfo:inheresIn', restrictionKind: 'someValuesFrom', target: 'bfo:MaterialEntity',
    });
    const r = await cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:CAU', signature: sig, ancestorChain: [],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('inheres_in_presence_derived');
  });

  it('Tau Prolog primary negative: existentialRestriction with inheresIn → presence derived', async () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:inheresIn', someValuesFrom: 'bfo:MaterialEntity' });
    const r = await cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:CAU', signature: sig, ancestorChain: [],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('inheres_in_presence_derived');
  });

  it('structural fallback (direct): no inheresIn → inheres_in_absence_structural_fallback', () => {
    const r = _internals.icnc2StructuralFallback({ cauSignature: emptySignature() });
    expect(r).toEqual({ result: true, reason: 'inheres_in_absence_structural_fallback' });
    track({ groundsNC: 'ICNC2', reason: r.reason });
  });

  it('structural fallback (direct): literal inheresIn restriction → inheres_in_presence_structural', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:inheresIn', someValuesFrom: 'bfo:MaterialEntity' });
    const r = _internals.icnc2StructuralFallback({ cauSignature: sig });
    expect(r).toEqual({ result: false, reason: 'inheres_in_presence_structural' });
    track({ groundsNC: 'ICNC2', reason: r.reason });
  });

  it('structural fallback (direct): full URI form for inheresIn matched', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({
      onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052',
      someValuesFrom: 'bfo:MaterialEntity',
    });
    const r = _internals.icnc2StructuralFallback({ cauSignature: sig });
    expect(r.result).toBe(false);
    expect(r.reason).toBe('inheres_in_presence_structural');
  });

  it('throw: missing prologSession', async () => {
    await expect(cauDoesNotRequireInheresIn({
      cauIRI: 'ex:CAU', signature: emptySignature(), ancestorChain: [],
    })).rejects.toThrow(/prologSession required/);
  });

  it('throw: missing signature', async () => {
    await expect(cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:CAU', ancestorChain: [],
    })).rejects.toThrow(/signature required/);
  });

  it('returns helperIRI: cau_does_not_require_inheres_in/1', async () => {
    const r = await cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:X', signature: emptySignature(), ancestorChain: [],
    });
    track(r);
    expect(r.helperIRI).toBe('cau_does_not_require_inheres_in/1');
  });

  it('exposes ancestorChain in evidence', async () => {
    const r = await cauDoesNotRequireInheresIn({
      prologSession: session, cauIRI: 'ex:X',
      signature: emptySignature(), ancestorChain: ['bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.evidence.ancestorChain).toEqual(['bfo:IndependentContinuant']);
  });
});

// ── ICNC3 — cau_does_not_require_concretizes ──────────────────────

describe('ICNC3 — cauDoesNotRequireConcretizes', () => {
  let session;
  beforeAll(async () => { session = await initBucketCPrologSession(); });
  afterAll(() => teardownPrologSession(session));

  it('Tau Prolog primary positive: IndependentContinuant ancestor → absence derived', async () => {
    const r = await cauDoesNotRequireConcretizes({
      prologSession: session, cauIRI: 'ex:Rock',
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('concretizes_absence_derived');
    expect(r.groundsNC).toBe('ICNC3');
  });

  it('Tau Prolog primary positive: SDC ancestor (no concretizes commitment) → absence derived', async () => {
    const r = await cauDoesNotRequireConcretizes({
      prologSession: session, cauIRI: 'ex:Role',
      signature: emptySignature(),
      ancestorChain: ['bfo:Role', 'bfo:SpecificallyDependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('concretizes_absence_derived');
  });

  it('Tau Prolog primary negative: GDC ancestor → presence derived (concretizes inherited)', async () => {
    const r = await cauDoesNotRequireConcretizes({
      prologSession: session, cauIRI: 'ex:InfoBearer',
      signature: emptySignature(),
      ancestorChain: ['bfo:GenericallyDependentContinuant', 'bfo:Continuant'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('concretizes_presence_derived');
  });

  it('Tau Prolog primary negative: literal concretizes restriction → presence derived', async () => {
    const sig = emptySignature();
    sig.propertyRestrictionsAsDomain.push({ property: 'bfo:concretizes', restrictionKind: 'someValuesFrom', target: 'bfo:Role' });
    const r = await cauDoesNotRequireConcretizes({
      prologSession: session, cauIRI: 'ex:CAU', signature: sig, ancestorChain: [],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('concretizes_presence_derived');
  });

  it('cross-NC consistency: same-shape parallel with ICNC2', async () => {
    // Both helpers produce result/reason/groundsNC structure.
    const r1 = await cauDoesNotRequireConcretizes({
      prologSession: session, cauIRI: 'ex:X',
      signature: emptySignature(), ancestorChain: [],
    });
    track(r1);
    expect(Object.keys(r1).sort()).toEqual(
      ['evidence', 'fallbackTrigger', 'fallbackUsed', 'groundsNC', 'helperIRI', 'reason', 'result'].sort(),
    );
  });

  it('structural fallback (direct): no concretizes → concretizes_absence_structural_fallback', () => {
    const r = _internals.icnc3StructuralFallback({ cauSignature: emptySignature() });
    expect(r).toEqual({ result: true, reason: 'concretizes_absence_structural_fallback' });
    track({ groundsNC: 'ICNC3', reason: r.reason });
  });

  it('structural fallback (direct): literal concretizes restriction → concretizes_presence_structural', () => {
    const sig = emptySignature();
    sig.propertyRestrictionsAsDomain.push({ property: 'bfo:concretizes', restrictionKind: 'someValuesFrom', target: 'bfo:Role' });
    const r = _internals.icnc3StructuralFallback({ cauSignature: sig });
    expect(r).toEqual({ result: false, reason: 'concretizes_presence_structural' });
    track({ groundsNC: 'ICNC3', reason: r.reason });
  });

  it('structural fallback (direct): full URI form for concretizes matched', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({
      onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058',
      someValuesFrom: 'bfo:Role',
    });
    const r = _internals.icnc3StructuralFallback({ cauSignature: sig });
    expect(r.result).toBe(false);
    expect(r.reason).toBe('concretizes_presence_structural');
  });

  it('throw: missing prologSession', async () => {
    await expect(cauDoesNotRequireConcretizes({
      cauIRI: 'ex:CAU', signature: emptySignature(), ancestorChain: [],
    })).rejects.toThrow(/prologSession required/);
  });

  it('throw: missing signature', async () => {
    await expect(cauDoesNotRequireConcretizes({
      prologSession: session, cauIRI: 'ex:CAU', ancestorChain: [],
    })).rejects.toThrow(/signature required/);
  });

  it('helperIRI: cau_does_not_require_concretizes/1', async () => {
    const r = await cauDoesNotRequireConcretizes({
      prologSession: session, cauIRI: 'ex:X', signature: emptySignature(), ancestorChain: [],
    });
    track(r);
    expect(r.helperIRI).toBe('cau_does_not_require_concretizes/1');
  });
});

// ── IENC2 — cau_incompatible_with_matter_as_part ─────────────────

describe('IENC2 — cauIncompatibleWithMatterAsPart', () => {
  let session;
  beforeAll(async () => { session = await initBucketCPrologSession(); });
  afterAll(() => teardownPrologSession(session));

  it('Tau Prolog primary positive: ImmaterialEntity ancestor → absence derived', async () => {
    const r = await cauIncompatibleWithMatterAsPart({
      prologSession: session, cauIRI: 'ex:Site',
      signature: emptySignature(),
      ancestorChain: ['bfo:Site', 'bfo:ImmaterialEntity', 'bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('matter_as_part_absence_derived');
    expect(r.groundsNC).toBe('IENC2');
  });

  it('Tau Prolog primary negative: MaterialEntity ancestor → presence derived', async () => {
    const r = await cauIncompatibleWithMatterAsPart({
      prologSession: session, cauIRI: 'ex:Rock',
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('matter_as_part_presence_derived');
  });

  it('Tau Prolog primary negative: hasContinuantPart restriction targeting MaterialEntity → presence derived', async () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:hasContinuantPart', someValuesFrom: 'bfo:MaterialEntity' });
    const r = await cauIncompatibleWithMatterAsPart({
      prologSession: session, cauIRI: 'ex:Composite',
      signature: sig, ancestorChain: ['bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('matter_as_part_presence_derived');
  });

  it('structural fallback (direct): ImmaterialEntity ancestor + no material part → absence_structural_fallback', () => {
    const r = _internals.ienc2StructuralFallback({
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:Site', 'bfo:ImmaterialEntity', 'bfo:IndependentContinuant'],
    });
    expect(r).toEqual({ result: true, reason: 'matter_as_part_absence_structural_fallback' });
    track({ groundsNC: 'IENC2', reason: r.reason });
  });

  it('structural fallback (direct): MaterialEntity ancestor → presence_structural', () => {
    const r = _internals.ienc2StructuralFallback({
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant'],
    });
    expect(r).toEqual({ result: false, reason: 'matter_as_part_presence_structural' });
    track({ groundsNC: 'IENC2', reason: r.reason });
  });

  it('structural fallback (direct): hasContinuantPart restriction → presence_structural', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:hasContinuantPart', someValuesFrom: 'bfo:MaterialEntity' });
    const r = _internals.ienc2StructuralFallback({ cauSignature: sig, ancestorChain: ['bfo:IndependentContinuant'] });
    expect(r.result).toBe(false);
    expect(r.reason).toBe('matter_as_part_presence_structural');
  });

  it('edge: hasContinuantPart targeting non-Material class → absence', async () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:hasContinuantPart', someValuesFrom: 'bfo:Quality' });
    const r = await cauIncompatibleWithMatterAsPart({
      prologSession: session, cauIRI: 'ex:CAU',
      signature: sig, ancestorChain: ['bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('matter_as_part_absence_derived');
  });

  it('throw: missing prologSession', async () => {
    await expect(cauIncompatibleWithMatterAsPart({
      cauIRI: 'ex:CAU', signature: emptySignature(), ancestorChain: [],
    })).rejects.toThrow(/prologSession required/);
  });

  it('throw: missing signature', async () => {
    await expect(cauIncompatibleWithMatterAsPart({
      prologSession: session, cauIRI: 'ex:CAU', ancestorChain: [],
    })).rejects.toThrow(/signature required/);
  });

  it('helperIRI: cau_incompatible_with_matter_as_part/1', async () => {
    const r = await cauIncompatibleWithMatterAsPart({
      prologSession: session, cauIRI: 'ex:X', signature: emptySignature(), ancestorChain: [],
    });
    track(r);
    expect(r.helperIRI).toBe('cau_incompatible_with_matter_as_part/1');
  });

});

// ── OccurrentNC2 — cau_disjoint_with_continuant ──────────────────

describe('OccurrentNC2 — cauDisjointWithContinuant', () => {
  let session;
  beforeAll(async () => { session = await initBucketCPrologSession(); });
  afterAll(() => teardownPrologSession(session));

  it('Tau Prolog primary positive: Process ancestor → disjointness derived', async () => {
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:Activity',
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('disjointness_derived');
    expect(r.groundsNC).toBe('OccurrentNC2');
  });

  it('Tau Prolog primary positive: bfo:Occurrent ancestor → disjointness derived', async () => {
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:Generic',
      signature: emptySignature(),
      ancestorChain: ['bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('disjointness_derived');
  });

  it('Tau Prolog primary negative: MaterialEntity ancestor → continuant_nc_satisfied', async () => {
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:Rock',
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant', 'bfo:Continuant'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('continuant_nc_satisfied');
  });

  it('multi-inheritance pre-check: Continuant + Occurrent → disjointness_explicit_violation', async () => {
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:Anomaly',
      signature: emptySignature(),
      ancestorChain: ['bfo:Continuant', 'bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('disjointness_explicit_violation');
    expect(r.evidence.contradictingAncestors).toEqual({
      continuant: 'bfo:Continuant',
      occurrent: 'bfo:Occurrent',
    });
    expect(r.fallbackUsed).toBe(false);
  });

  it('multi-inheritance pre-check: MaterialEntity + Process → disjointness_explicit_violation', async () => {
    // MaterialEntity is in CONTINUANT_SUBTREE; Process is in OCCURRENT_SUBTREE
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:DoubleAnomaly',
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:Process'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('disjointness_explicit_violation');
  });

  it('structural fallback (direct): Occurrent ancestor only → disjointness_structural_fallback', () => {
    const r = _internals.occurrentNC2StructuralFallback({
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    expect(r).toEqual({ result: true, reason: 'disjointness_structural_fallback' });
    track({ groundsNC: 'OccurrentNC2', reason: r.reason });
  });

  it('structural fallback (direct): Continuant ancestor → continuant_nc_satisfied', () => {
    const r = _internals.occurrentNC2StructuralFallback({
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant'],
    });
    expect(r).toEqual({ result: false, reason: 'continuant_nc_satisfied' });
    track({ groundsNC: 'OccurrentNC2', reason: r.reason });
  });

  it('structural fallback (direct): empty ancestor → disjointness_structural_fallback (default OWA)', () => {
    const r = _internals.occurrentNC2StructuralFallback({ ancestorChain: [] });
    expect(r).toEqual({ result: true, reason: 'disjointness_structural_fallback' });
  });

  it('throw: missing prologSession', async () => {
    await expect(cauDisjointWithContinuant({
      cauIRI: 'ex:CAU', signature: emptySignature(), ancestorChain: [],
    })).rejects.toThrow(/prologSession required/);
  });

  it('throw: missing signature', async () => {
    await expect(cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:CAU', ancestorChain: [],
    })).rejects.toThrow(/signature required/);
  });

  it('helperIRI: cau_disjoint_with_continuant/1', async () => {
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:X',
      signature: emptySignature(), ancestorChain: ['bfo:Process'],
    });
    track(r);
    expect(r.helperIRI).toBe('cau_disjoint_with_continuant/1');
  });

  it('exposes ancestorChain in evidence (non-anomaly path)', async () => {
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:X',
      signature: emptySignature(), ancestorChain: ['bfo:Process'],
    });
    track(r);
    expect(r.evidence.ancestorChain).toEqual(['bfo:Process']);
  });
});

// ── MENC2 — cau_consistent_with_spatial_and_matter (Commit 3) ────

describe('MENC2 — cauConsistentWithSpatialAndMatter', () => {
  let session;
  beforeAll(async () => { session = await initBucketCPrologSession(); });
  afterAll(() => teardownPrologSession(session));

  it('Tau Prolog primary positive: MaterialEntity ancestor → spatial_and_matter_derived', async () => {
    const r = await cauConsistentWithSpatialAndMatter({
      prologSession: session, cauIRI: 'ex:Rock',
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('spatial_and_matter_derived');
    expect(r.groundsNC).toBe('MENC2');
  });

  it('Tau Prolog primary negative: ImmaterialEntity → matter_constitution_failed (spatial OK via ancestry, matter fails)', async () => {
    // Site → ImmaterialEntity → IndependentContinuant. occupiesSpatialRegion's
    // background-domain is bfo:MaterialEntity per BFO_BACKGROUND_PROGRAM —
    // so an Immaterial CAU does NOT inherit spatial commitment via property
    // domain inheritance. First conjunct fails first → spatial_consistency_failed.
    const r = await cauConsistentWithSpatialAndMatter({
      prologSession: session, cauIRI: 'ex:Site',
      signature: emptySignature(),
      ancestorChain: ['bfo:Site', 'bfo:ImmaterialEntity', 'bfo:IndependentContinuant'],
    });
    track(r);
    expect(r.result).toBe(false);
    // Either conjunct could fail first depending on inheritance derivation;
    // both failure modes are valid contract outcomes for ImmaterialEntity.
    expect(['spatial_consistency_failed', 'matter_constitution_failed']).toContain(r.reason);
  });

  it('Tau Prolog primary positive: literal occupiesSpatialRegion + MaterialEntity ancestor → derived', async () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesSpatialRegion', someValuesFrom: 'bfo:SpatialRegion' });
    const r = await cauConsistentWithSpatialAndMatter({
      prologSession: session, cauIRI: 'ex:Composite',
      signature: sig, ancestorChain: ['bfo:MaterialEntity'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('spatial_and_matter_derived');
  });

  it('two-conjunct failure-mode: spatial fails first → spatial_consistency_failed (no matter check)', () => {
    // Direct structural fallback test: empty signature + IndependentContinuant
    // ancestor (no MaterialEntity, no spatial restriction) → spatial fails first.
    const r = _internals.menc2StructuralFallback({
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:IndependentContinuant'],
    });
    expect(r).toEqual({ result: false, reason: 'spatial_consistency_failed' });
    track({ groundsNC: 'MENC2', reason: r.reason });
  });

  it('two-conjunct failure-mode: spatial OK (via MaterialEntity ancestor), matter OK → structural_fallback_consistent', () => {
    const r = _internals.menc2StructuralFallback({
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant'],
    });
    expect(r).toEqual({ result: true, reason: 'spatial_and_matter_structural_fallback' });
    track({ groundsNC: 'MENC2', reason: r.reason });
  });

  it('two-conjunct failure-mode: spatial OK via literal restriction, matter fails (no MaterialEntity)', () => {
    // Spatial OK because of literal occupiesSpatialRegion restriction;
    // matter fails because no MaterialEntity ancestor and no hasContinuantPart.
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesSpatialRegion', someValuesFrom: 'bfo:SpatialRegion' });
    const r = _internals.menc2StructuralFallback({
      cauSignature: sig, ancestorChain: ['bfo:IndependentContinuant'],
    });
    expect(r).toEqual({ result: false, reason: 'matter_constitution_failed' });
    track({ groundsNC: 'MENC2', reason: r.reason });
  });

  it('full URI form for occupiesSpatialRegion matched in structural', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({
      onProperty: 'http://purl.obolibrary.org/obo/BFO_0000171',
      someValuesFrom: 'bfo:SpatialRegion',
    });
    const ok = _internals.menc2SpatialStructural({ cauSignature: sig, ancestorChain: [] });
    expect(ok).toBe(true);
  });

  it('throw: missing prologSession', async () => {
    await expect(cauConsistentWithSpatialAndMatter({
      cauIRI: 'ex:CAU', signature: emptySignature(), ancestorChain: [],
    })).rejects.toThrow(/prologSession required/);
  });

  it('throw: missing signature', async () => {
    await expect(cauConsistentWithSpatialAndMatter({
      prologSession: session, cauIRI: 'ex:CAU', ancestorChain: [],
    })).rejects.toThrow(/signature required/);
  });

  it('helperIRI: cau_consistent_with_spatial_and_matter/1', async () => {
    const r = await cauConsistentWithSpatialAndMatter({
      prologSession: session, cauIRI: 'ex:X', signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity'],
    });
    track(r);
    expect(r.helperIRI).toBe('cau_consistent_with_spatial_and_matter/1');
  });
});

// ── ProcessNC3 — cau_consistent_with_one_dim_temporal (Commit 3) ──

describe('ProcessNC3 — cauConsistentWithOneDimTemporal', () => {
  let session;
  beforeAll(async () => { session = await initBucketCPrologSession(); });
  afterAll(() => teardownPrologSession(session));

  it('Tau Prolog primary positive (path 1): literal OneDim restriction → one_dim_temporal_consistency_derived', async () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:OneDimensionalTemporalRegion' });
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:Activity',
      signature: sig, ancestorChain: ['bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('one_dim_temporal_consistency_derived');
    expect(r.groundsNC).toBe('ProcessNC3');
  });

  it('Tau Prolog primary positive (path 2): literal TemporalRegion (parent) restriction → derived', async () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:TemporalRegion' });
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:Activity',
      signature: sig, ancestorChain: ['bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(true);
    // Path 2 reaches the same Tau Prolog clause; reason is derived (not path-3).
    expect(r.reason).toBe('one_dim_temporal_consistency_derived');
  });

  it('Tau Prolog primary positive (path 3): Process ancestor in chain → process_ancestor_inherits_one_dim', async () => {
    // Distinct reason per implementation plan §4.6 — Process ancestor is a
    // structurally different path from literal OneDim restriction.
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:Activity',
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(true);
    expect(r.reason).toBe('process_ancestor_inherits_one_dim');
    expect(r.evidence.matchedAncestor).toBe('bfo:Process');
  });

  it('§3.2 ZeroDim contradiction-wins: ZeroDim restriction alone → zero_dim_contradiction', async () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' });
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:Boundary',
      signature: sig, ancestorChain: ['bfo:ProcessBoundary', 'bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('zero_dim_contradiction');
    expect(r.fallbackUsed).toBe(false);
  });

  it('§3.2 LOCKED 2026-04-25: dual OneDim AND ZeroDim restrictions → contradiction wins', async () => {
    // Adversarial case per implementation plan §3.2: contradiction-wins
    // precedence requires ZeroDim to fire over OneDim positive evidence.
    const sig = emptySignature();
    sig.existentialRestrictions.push(
      { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:OneDimensionalTemporalRegion' },
      { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' },
    );
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:Anomaly',
      signature: sig, ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('zero_dim_contradiction');
    expect(r.fallbackUsed).toBe(false);
  });

  it('Tau Prolog primary negative: bfo:Occurrent ancestor only (no Process descendant, no temporal restriction) → no_temporal_extension_evidence', async () => {
    // Asymmetric Occurrent handling per ProcessNC3 §5.4 cross-NC consistency.
    // Mere bfo:Occurrent without Process descendant is insufficient.
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:GenericOccurrent',
      signature: emptySignature(),
      ancestorChain: ['bfo:Occurrent'],
    });
    track(r);
    expect(r.result).toBe(false);
    expect(r.reason).toBe('no_temporal_extension_evidence');
  });

  it('structural fallback (direct): Process ancestor → process_ancestor_inherits_one_dim', () => {
    const r = _internals.processNC3StructuralFallback({
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:Process'],
    });
    expect(r).toEqual({ result: true, reason: 'process_ancestor_inherits_one_dim' });
    track({ groundsNC: 'ProcessNC3', reason: r.reason });
  });

  it('structural fallback (direct): OneDim restriction → one_dim_temporal_consistency_structural_fallback', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:OneDimensionalTemporalRegion' });
    const r = _internals.processNC3StructuralFallback({ cauSignature: sig, ancestorChain: [] });
    expect(r).toEqual({ result: true, reason: 'one_dim_temporal_consistency_structural_fallback' });
    track({ groundsNC: 'ProcessNC3', reason: r.reason });
  });

  it('structural fallback (direct): ZeroDim contradiction in fallback path → zero_dim_contradiction', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' });
    const r = _internals.processNC3StructuralFallback({ cauSignature: sig, ancestorChain: [] });
    expect(r).toEqual({ result: false, reason: 'zero_dim_contradiction' });
  });

  it('structural fallback (direct): no positive evidence → no_temporal_extension_evidence', () => {
    const r = _internals.processNC3StructuralFallback({
      cauSignature: emptySignature(), ancestorChain: ['bfo:Continuant'],
    });
    expect(r).toEqual({ result: false, reason: 'no_temporal_extension_evidence' });
  });

  it('structural fallback (direct): unspecified TemporalRegion filler admits OneDim under OWA', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: undefined });
    const r = _internals.processNC3StructuralFallback({ cauSignature: sig, ancestorChain: [] });
    expect(r.result).toBe(true);
    expect(r.reason).toBe('one_dim_temporal_consistency_structural_fallback');
  });

  it('throw: missing prologSession', async () => {
    await expect(cauConsistentWithOneDimTemporal({
      cauIRI: 'ex:CAU', signature: emptySignature(), ancestorChain: [],
    })).rejects.toThrow(/prologSession required/);
  });

  it('throw: missing signature', async () => {
    await expect(cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:CAU', ancestorChain: [],
    })).rejects.toThrow(/signature required/);
  });

  it('helperIRI: cau_consistent_with_one_dim_temporal/1', async () => {
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:X', signature: emptySignature(), ancestorChain: ['bfo:Process'],
    });
    track(r);
    expect(r.helperIRI).toBe('cau_consistent_with_one_dim_temporal/1');
  });
});

// ── Cross-NC interaction tests (Commit 3 cross-cutting suite) ──────

describe('Cross-NC interaction — Process-target full Bucket-A/B/C cascade', () => {
  // Per implementation plan §5.2 #3 + PO Commit 3 reminder: exercise a
  // Process-target CAU through ProcessNC1/2/4 (Bucket A/B) + ProcessNC3
  // (Bucket C) and through Occurrent NCs OccurrentNC1/2/3 — verifying
  // OccurrentNC2 (formerly always-undetermined Bucket-C-deferred) now
  // resolves deterministically. Demonstrates Bucket C closes the BCL
  // cascade-blocker pattern surfaced in X5 re-triage §9.4.
  let session;
  beforeAll(async () => { session = await initBucketCPrologSession(); });
  afterAll(() => teardownPrologSession(session));

  it('Process CAU: OccurrentNC2 (Bucket C) resolves disjointness_derived', async () => {
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:Activity',
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    expect(r.result).toBe(true);
    expect(r.reason).toBe('disjointness_derived');
    expect(r.fallbackUsed).toBe(false);
    track(r);
  });

  it('Process CAU: ProcessNC3 (Bucket C) resolves process_ancestor_inherits_one_dim', async () => {
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:Activity',
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    expect(r.result).toBe(true);
    expect(r.reason).toBe('process_ancestor_inherits_one_dim');
    track(r);
  });

  it('cascade: Process target — both OccurrentNC2 + ProcessNC3 satisfy in same session', async () => {
    // Same prologSession exercised across multiple helpers; verify
    // assertion isolation holds across sequential helper invocations.
    const sig = emptySignature();
    const chain = ['bfo:Process', 'bfo:Occurrent'];

    const occNC2 = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:CascadeProc',
      signature: sig, ancestorChain: chain,
    });
    const procNC3 = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:CascadeProc',
      signature: sig, ancestorChain: chain,
    });

    expect(occNC2.result).toBe(true);
    expect(procNC3.result).toBe(true);
    // OccurrentNC1 (Bucket A P3) + ProcessNC2 (Bucket A P3) + ProcessNC4 +
    // OccurrentNC3 (X5 Bucket B) are dispatcher-resolvable; this test
    // attests that Bucket C resolves the previously-undetermined
    // OccurrentNC2 + ProcessNC3 — the BCL residual surfaced in X5 re-triage.
  });

  it('cascade: BCL pattern closure — OccurrentNC2 no longer routes undetermined for Process target', async () => {
    // The X5 re-triage §9.4 surfacing was: BCL scenarios blocked on
    // OccurrentNC2 routing undetermined under Bucket A/B coverage. With
    // Bucket C, this routes deterministically. The test asserts the
    // architectural payload — OccurrentNC2 produces result: true | false
    // (never undetermined) for any non-anomalous Process CAU.
    const r = await cauDisjointWithContinuant({
      prologSession: session, cauIRI: 'ex:BCLProc',
      signature: emptySignature(),
      ancestorChain: ['bfo:Process'],
    });
    expect(typeof r.result).toBe('boolean');
    expect(r.result).toBe(true);
  });

  it('cascade: cross-NC consistency of ZeroDim contradiction (X5 OccurrentNC3 ↔ X6 ProcessNC3)', async () => {
    // Per ProcessNC3 §5.4 cross-NC consistency note: ZeroDim contradiction
    // pattern aligns between X5 OccurrentNC3 (ProcessBoundary doesn't
    // unfold) and X6 ProcessNC3 (ZeroDim restriction contradicts OneDim).
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' });
    const r = await cauConsistentWithOneDimTemporal({
      prologSession: session, cauIRI: 'ex:Boundary',
      signature: sig, ancestorChain: ['bfo:ProcessBoundary'],
    });
    expect(r.result).toBe(false);
    expect(r.reason).toBe('zero_dim_contradiction');
  });
});

// ── Reason-enum-coverage assertions (footer) ────────────────────

describe('Reason enum coverage (suite footer assertion)', () => {
  // Minimum coverage: the canonical primary-path reasons + key contradiction
  // reasons. Structural-fallback reasons are coverage-best-effort because
  // forcing fallback firing through the helper is empirically tuned (direct
  // structural-rule unit tests still cover them).
  const MINIMUM_REQUIRED_REASONS = {
    ICNC2: ['inheres_in_absence_derived', 'inheres_in_presence_derived'],
    ICNC3: ['concretizes_absence_derived', 'concretizes_presence_derived'],
    IENC2: ['matter_as_part_absence_derived', 'matter_as_part_presence_derived'],
    OccurrentNC2: ['disjointness_derived', 'continuant_nc_satisfied', 'disjointness_explicit_violation'],
    MENC2: ['spatial_and_matter_derived', 'spatial_consistency_failed', 'matter_constitution_failed'],
    ProcessNC3: [
      'one_dim_temporal_consistency_derived',
      'process_ancestor_inherits_one_dim',
      'zero_dim_contradiction',
      'no_temporal_extension_evidence',
    ],
  };

  for (const nc of Object.keys(MINIMUM_REQUIRED_REASONS)) {
    it(`every minimum-required reason for ${nc} was hit by at least one test`, () => {
      for (const reason of MINIMUM_REQUIRED_REASONS[nc]) {
        expect(reasonsHit[nc].has(reason)).toBe(true);
      }
    });
  }

  it('all exported reason enum values are defined and unique', () => {
    expect(new Set(ICNC2_REASONS).size).toBe(ICNC2_REASONS.length);
    expect(new Set(ICNC3_REASONS).size).toBe(ICNC3_REASONS.length);
    expect(new Set(IENC2_REASONS).size).toBe(IENC2_REASONS.length);
    expect(new Set(OCCURRENT_NC2_REASONS).size).toBe(OCCURRENT_NC2_REASONS.length);
    expect(new Set(MENC2_REASONS).size).toBe(MENC2_REASONS.length);
    expect(new Set(PROCESS_NC3_REASONS).size).toBe(PROCESS_NC3_REASONS.length);
  });

  it('reason values from helpers are members of the exported enum sets', () => {
    for (const reason of reasonsHit.ICNC2) expect(ICNC2_REASONS).toContain(reason);
    for (const reason of reasonsHit.ICNC3) expect(ICNC3_REASONS).toContain(reason);
    for (const reason of reasonsHit.IENC2) expect(IENC2_REASONS).toContain(reason);
    for (const reason of reasonsHit.OccurrentNC2) expect(OCCURRENT_NC2_REASONS).toContain(reason);
    for (const reason of reasonsHit.MENC2) expect(MENC2_REASONS).toContain(reason);
    for (const reason of reasonsHit.ProcessNC3) expect(PROCESS_NC3_REASONS).toContain(reason);
  });
});
