/**
 * X5 Bucket B helper tests — three CURATED-NC helpers covering ContinuantNC3,
 * OccurrentNC3, ProcessNC4. Per SME consolidated review lock 2026-04-25.
 *
 * Locked sketches:
 *   - specs/d16/x5-continuantnc3-design-sketch.md
 *   - specs/d16/x5-occurrentnc3-design-sketch.md
 *   - specs/d16/x5-processnc4-design-sketch.md
 *
 * OWA/CWA posture: mixed CWA + deterministic-false-on-silence per Wave 2
 * helper precedent. Multi-inheritance contradiction-wins precedence aligned
 * with X4 ContinuantNC2 lint pattern.
 */

import { describe, it, expect } from '@jest/globals';
import {
  cauIdentityPersistsThroughTime,
  cauUnfoldsThroughTime,
  cauAdmitsProcessBoundaries,
} from '../../../src/core/d16/critical-nc-helpers.js';

function emptySignature(cauIRI = 'ex:TestCAU') {
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

describe('cauIdentityPersistsThroughTime — ContinuantNC3', () => {
  it('affirms via Continuant-subtree ancestor', () => {
    const result = cauIdentityPersistsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:IndependentContinuant', 'bfo:Continuant'],
    });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('continuant_subtree_ancestor');
    expect(result.evidence.matchedAncestor).toBe('bfo:MaterialEntity');
    expect(result.groundsNC).toBe('ContinuantNC3');
  });

  it('affirms via SDC ancestor (Role/Disposition/Function/Quality subtree)', () => {
    const result = cauIdentityPersistsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:Role', 'bfo:SpecificallyDependentContinuant', 'bfo:Continuant'],
    });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('continuant_subtree_ancestor');
  });

  it('affirms via disjointness with bfo:Occurrent', () => {
    const sig = emptySignature();
    sig.disjointnessAssertions = ['bfo:Occurrent'];
    const result = cauIdentityPersistsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('disjoint_with_occurrent');
  });

  it('affirms via equivalence to Continuant', () => {
    const sig = emptySignature();
    sig.equivalenceClaims = ['bfo:Continuant'];
    const result = cauIdentityPersistsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('equivalent_class_to_continuant');
  });

  it('contradicts via Occurrent ancestor', () => {
    const result = cauIdentityPersistsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('occurrent_subtree_ancestor');
  });

  it('contradicts via hasTemporalPart restriction', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:hasTemporalPart', someValuesFrom: 'bfo:Process' },
    ];
    const result = cauIdentityPersistsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('temporal_part_decomposition_present');
  });

  it('multi-inheritance: Continuant + Occurrent → contradiction wins', () => {
    const result = cauIdentityPersistsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:Continuant', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('occurrent_subtree_ancestor');
  });

  it('silence: empty signature + empty ancestorChain → no_structural_evidence', () => {
    const result = cauIdentityPersistsThroughTime({
      signature: emptySignature(),
      ancestorChain: [],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('no_structural_evidence');
  });

  it('bfo:existsAt restriction alone is NOT independent affirmation', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:existsAt', someValuesFrom: 'bfo:TemporalRegion' },
    ];
    const result = cauIdentityPersistsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('no_structural_evidence');
  });

  it('throws if signature missing', () => {
    expect(() => cauIdentityPersistsThroughTime({ ancestorChain: [] })).toThrow(/signature required/);
  });
});

describe('cauUnfoldsThroughTime — OccurrentNC3', () => {
  it('affirms via Process ancestor', () => {
    const result = cauUnfoldsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('occurrent_subtree_ancestor');
    expect(result.evidence.matchedAncestor).toBe('bfo:Process');
  });

  it('affirms via bfo:Occurrent ancestor directly', () => {
    const result = cauUnfoldsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:Occurrent'],
    });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('occurrent_subtree_ancestor');
  });

  it('affirms via occupiesTemporalRegion with non-zero-dim filler', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:OneDimensionalTemporalRegion' },
    ];
    const result = cauUnfoldsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('temporal_extension_restriction');
  });

  it('affirms via hasTemporalPart restriction', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:hasTemporalPart', someValuesFrom: 'bfo:Process' },
    ];
    const result = cauUnfoldsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('temporal_extension_restriction');
  });

  it('affirms via disjointness with bfo:Continuant', () => {
    const sig = emptySignature();
    sig.disjointnessAssertions = ['bfo:Continuant'];
    const result = cauUnfoldsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('disjoint_with_continuant');
  });

  it('affirms via equivalence to Occurrent', () => {
    const sig = emptySignature();
    sig.equivalenceClaims = ['bfo:Occurrent'];
    const result = cauUnfoldsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('equivalent_class_to_occurrent');
  });

  it('contradicts via Continuant ancestor', () => {
    const result = cauUnfoldsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:Continuant'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('continuant_subtree_ancestor');
  });

  it('contradicts: ProcessBoundary alone in ancestorChain', () => {
    const result = cauUnfoldsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:ProcessBoundary', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('process_boundary_ancestor_only');
  });

  it('multi-inheritance: ProcessBoundary + Process → contradiction wins (SME 2026-04-25)', () => {
    const result = cauUnfoldsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:ProcessBoundary', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('process_boundary_ancestor_only');
  });

  it('contradicts: occupiesTemporalRegion only with ZeroDimensionalTemporalRegion filler', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' },
    ];
    const result = cauUnfoldsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('zero_dimensional_temporal_only');
  });

  it('mixed dim: zero-dim AND one-dim occupies → affirms via non-zero-dim path', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' },
      { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:OneDimensionalTemporalRegion' },
    ];
    const result = cauUnfoldsThroughTime({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('temporal_extension_restriction');
  });

  it('multi-inheritance Continuant + Occurrent → contradiction wins', () => {
    const result = cauUnfoldsThroughTime({
      signature: emptySignature(),
      ancestorChain: ['bfo:Continuant', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('continuant_subtree_ancestor');
  });

  it('silence: empty signature + empty ancestorChain → no_structural_evidence', () => {
    const result = cauUnfoldsThroughTime({
      signature: emptySignature(),
      ancestorChain: [],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('no_structural_evidence');
  });

  it('throws if signature missing', () => {
    expect(() => cauUnfoldsThroughTime({ ancestorChain: [] })).toThrow(/signature required/);
  });
});

describe('cauAdmitsProcessBoundaries — ProcessNC4', () => {
  it('affirms via bfo:Process ancestor', () => {
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('process_subtree_ancestor');
    expect(result.evidence.matchedAncestor).toBe('bfo:Process');
  });

  it('affirms via hasFirstInstant existential restriction', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:hasFirstInstant', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' },
    ];
    const result = cauAdmitsProcessBoundaries({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('first_instant_restriction');
  });

  it('affirms via hasLastInstant existential restriction', () => {
    const sig = emptySignature();
    sig.existentialRestrictions = [
      { onProperty: 'bfo:hasLastInstant', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' },
    ];
    const result = cauAdmitsProcessBoundaries({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('last_instant_restriction');
  });

  it('affirms via cardinality ≥ 1 on hasFirstInstant', () => {
    const sig = emptySignature();
    sig.cardinalityRestrictions = [
      { onProperty: 'bfo:hasFirstInstant', minCardinality: 1 },
    ];
    const result = cauAdmitsProcessBoundaries({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('first_instant_cardinality');
    expect(result.evidence.matchedCardinality.count).toBe(1);
  });

  it('affirms via cardinality ≥ 1 on hasLastInstant (qualifiedCardinality form)', () => {
    const sig = emptySignature();
    sig.cardinalityRestrictions = [
      { onProperty: 'bfo:hasLastInstant', qualifiedCardinality: 1 },
    ];
    const result = cauAdmitsProcessBoundaries({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('last_instant_cardinality');
  });

  it('affirms via equivalence to bfo:Process', () => {
    const sig = emptySignature();
    sig.equivalenceClaims = ['bfo:Process'];
    const result = cauAdmitsProcessBoundaries({ signature: sig, ancestorChain: [] });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('equivalent_class_to_process');
  });

  it('contradicts via Continuant ancestor', () => {
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity', 'bfo:Continuant'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('continuant_subtree_ancestor');
  });

  it('contradicts: ProcessBoundary ancestor (boundaries do not admit boundaries)', () => {
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: ['bfo:ProcessBoundary', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('process_boundary_subtree_ancestor');
  });

  it('multi-inheritance: Process + ProcessBoundary → contradiction wins', () => {
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:ProcessBoundary', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('process_boundary_subtree_ancestor');
  });

  it('multi-inheritance: Process + Continuant → contradiction wins', () => {
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Continuant'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('continuant_subtree_ancestor');
  });

  it('asymmetric Occurrent: bfo:Occurrent alone (no Process descendant) → no_structural_evidence', () => {
    // Per ProcessNC4 design sketch §6 last row: ProcessNC4 does NOT affirm
    // on bare bfo:Occurrent ancestor; OccurrentNC3 does.
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: ['bfo:Occurrent'],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('no_structural_evidence');
  });

  it('silence: empty signature + empty ancestorChain → no_structural_evidence', () => {
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: [],
    });
    expect(result.result).toBe(false);
    expect(result.reason).toBe('no_structural_evidence');
  });

  it('adversarial: deep Process descendant via long ancestor chain', () => {
    const result = cauAdmitsProcessBoundaries({
      signature: emptySignature(),
      ancestorChain: ['ex:DeepProcessSubclass', 'ex:IntermediateA', 'ex:IntermediateB', 'bfo:Process', 'bfo:Occurrent'],
    });
    expect(result.result).toBe(true);
    expect(result.reason).toBe('process_subtree_ancestor');
  });

  it('throws if signature missing', () => {
    expect(() => cauAdmitsProcessBoundaries({ ancestorChain: [] })).toThrow(/signature required/);
  });
});
