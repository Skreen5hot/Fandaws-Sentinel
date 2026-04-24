/**
 * GDCNC3 helper tests — cauAdmitsMultipleSimultaneousConcretizations.
 *
 * Grounds NC: GDCNC3 (High-priority SME-LOCKED).
 * Prolog body: cau_admits_multiple_simultaneous_concretizations(CAU),
 *              \+ cau_bearer_is_particular_not_generic(CAU).
 * Design sketch: specs/d16/wave2-helpers-design-sketch.md (LOCKED 2026-04-22).
 *
 * OWA/CWA posture: mixed — positive conjunct Option B (strict); negative
 * conjunct reuses validated SDCNC3 helper.
 *
 * Option B (strict) per SME decision 2: positive conjunct requires
 *   pattern 2 (explicit minCardinality > 1 on concretizes)
 *   OR
 *   pattern 3 (cross-instance-concretization axioms via callback).
 * Pattern 1 (cardinality-absence on concretizes) alone does NOT satisfy.
 *
 * Adversarial dual-signal case per SME Wave 2 design review:
 *   CAU with concretizes + inheresIn-particular → false (negative conjunct
 *   fails because SDCNC3 fires true). Routes to Plausible via multi-category
 *   evaluator review.
 *
 * Aaron Band 4 regression observation integrated:
 *   cco:DesignativeInformationContentEntity has concretizes-restriction but
 *   no minCardinality → Option B routes to false (not false-GDC entailment).
 */

import { describe, it, expect } from '@jest/globals';
import { cauAdmitsMultipleSimultaneousConcretizations } from '../../../src/core/d16/critical-nc-helpers.js';

function makeSignature({
  concretizesTargets = [],
  inheresInTargets = [],
  cardinalityRestrictions = [],
}) {
  return {
    cauIRI: 'ex:TestCAU',
    propertyRestrictionsAsDomain: [
      ...concretizesTargets.map(target => ({
        property: 'http://purl.obolibrary.org/obo/BFO_0000058', // bfo:concretizes
        restrictionKind: 'someValuesFrom',
        target,
        diagnosticWeight: 'Medium',
        directlyDeclared: true,
      })),
      ...inheresInTargets.map(target => ({
        property: 'http://purl.obolibrary.org/obo/BFO_0000052', // bfo:inheresIn
        restrictionKind: 'someValuesFrom',
        target,
        diagnosticWeight: 'High',
        directlyDeclared: true,
      })),
    ],
    propertyRestrictionsAsRange: [],
    characteristics: [],
    disjointnessAssertions: [],
    equivalenceClaims: [],
    universalRestrictions: [],
    existentialRestrictions: [
      ...concretizesTargets.map(t => ({ onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', someValuesFrom: t })),
      ...inheresInTargets.map(t => ({ onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', someValuesFrom: t })),
    ],
    cardinalityRestrictions,
    hasValueRestrictions: [],
    normalizedEnumerations: [],
  };
}

describe('GDCNC3: cauAdmitsMultipleSimultaneousConcretizations', () => {
  describe('Gate: no concretizes restriction', () => {
    it('returns false with reason no_concretizes_restrictions', () => {
      const signature = makeSignature({ concretizesTargets: [] });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('no_concretizes_restrictions');
      expect(result.groundsNC).toBe('GDCNC3');
    });
  });

  describe('Option B positive conjunct — Pattern 2 (explicit minCardinality > 1)', () => {
    it('returns true when minCardinality: 2 on concretizes and no particular bearer', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:PhysicalMachine'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', minCardinality: 2, diagnosticWeight: 'Medium' },
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(2);
    });

    it('does NOT fire on minCardinality: 1 (not "multiple")', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:Bearer'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', minCardinality: 1 },
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('positive_conjunct_failed_option_b');
    });

    it('does NOT fire when minCardinality is on a different property', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:Bearer'],
        cardinalityRestrictions: [
          { onProperty: 'ex:unrelatedProperty', minCardinality: 5 },
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
    });
  });

  describe('Option B positive conjunct — Pattern 3 (cross-instance axioms)', () => {
    it('returns true when hasCrossInstanceConcretizationAxioms callback returns true', () => {
      const signature = makeSignature({ concretizesTargets: ['ex:Bearer'] });
      const result = cauAdmitsMultipleSimultaneousConcretizations({
        signature,
        hasCrossInstanceConcretizationAxioms: () => true,
      });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(3);
    });

    it('returns false when callback is absent (conservative-false for pattern 3)', () => {
      const signature = makeSignature({ concretizesTargets: ['ex:Bearer'] });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
    });
  });

  describe('Option B strict enforcement — Pattern 1 (cardinality-absence) alone does NOT satisfy', () => {
    it('returns false for concretizes-with-no-cardinality (canonical GDC encoding under Option B)', () => {
      // concretizes some ex:Book without any cardinality constraint.
      // Under Option A this would have returned true; under Option B it does not.
      const signature = makeSignature({
        concretizesTargets: ['ex:Book'],
        cardinalityRestrictions: [],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('positive_conjunct_failed_option_b');
    });
  });

  describe('Cardinality-1 disqualifier', () => {
    it('returns false when cardinality: 1 on concretizes (even if other positives fire)', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:Bearer'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', cardinality: 1 },
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', minCardinality: 2 },
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('cardinality_limits_to_single_concretization');
    });

    it('returns false when qualifiedCardinality: 1 on concretizes', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:Bearer'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', qualifiedCardinality: 1 },
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('cardinality_limits_to_single_concretization');
    });

    it('returns false when maxCardinality: 1 on concretizes', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:Bearer'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', maxCardinality: 1 },
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('cardinality_limits_to_single_concretization');
    });
  });

  describe('Negative conjunct — SDCNC3 must return false', () => {
    it('returns false when CAU is SDC (inheresIn exactly 1 via SDCNC3 pattern 3)', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:InfoBearer'],
        inheresInTargets: ['ex:ParticularAlice'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', minCardinality: 2 }, // positive conjunct fires
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', cardinality: 1 }, // SDCNC3 fires via pattern 3
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('particular_bearer_present_via_sdcnc3');
    });
  });

  describe('Happy path — all gates pass', () => {
    it('returns true for canonical GDC under Option B: minCardinality > 1 + no particular bearer', () => {
      const signature = makeSignature({
        concretizesTargets: ['ex:PhysicalMachine'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', minCardinality: 3, diagnosticWeight: 'Medium' },
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(2);
      expect(result.sdcnc3Result).toBe(false); // SDCNC3 does not fire (no inheresIn)
    });
  });

  describe('Adversarial: dual-signal case (SME-added)', () => {
    it('returns false when concretizes present + inheresIn-particular (negative-conjunct failure dominates)', () => {
      // CAU with concretizes some InformationBearer (positive conjunct could fire via
      // pattern 2 if minCardinality present) AND inheresIn some ex:ParticularAlice.
      // Even if positive conjunct fires, SDCNC3 fires true because particular bearer
      // is present. Negative conjunct fails. Routes to Plausible for multi-category
      // analyst review.
      const signature = makeSignature({
        concretizesTargets: ['ex:InformationBearer'],
        inheresInTargets: ['ex:ParticularAlice'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000058', minCardinality: 2 }, // Pattern 2 fires
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', cardinality: 1 }, // SDCNC3 pattern 3 fires
        ],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('particular_bearer_present_via_sdcnc3');
    });
  });

  describe('Aaron Band 4 regression: cco:DesignativeInformationContentEntity', () => {
    it('returns false under Option B — concretizes-restriction present but no minCardinality', () => {
      // From specs/d16/fixtures/cco-core-demo-subset.ttl:
      //   cco:DesignativeInformationContentEntity a owl:Class ;
      //     rdfs:subClassOf bfo:0000031 ;     # GDC
      //     rdfs:subClassOf [
      //       a owl:Restriction ;
      //       owl:onProperty bfo:0000058 ;    # concretizes
      //       owl:someValuesFrom bfo:0000040
      //     ]
      // Under Option A this would have Entailed as GDC (cardinality-absence treated
      // as admits-multiple). Under Option B it routes false — no explicit
      // minCardinality, no cross-instance callback. This is the SME-preferred
      // Plausible-over-confident-wrong posture per "absence of evidence for one
      // category is NOT positive evidence for another."
      const signature = makeSignature({
        concretizesTargets: ['http://purl.obolibrary.org/obo/BFO_0000040'],
        cardinalityRestrictions: [],
      });
      const result = cauAdmitsMultipleSimultaneousConcretizations({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('positive_conjunct_failed_option_b');
    });
  });
});
