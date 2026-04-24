/**
 * QualityNC3 helper tests — cauAlwaysRealizedWhenBearerExists.
 *
 * Grounds NC: QualityNC3 (High-priority SME-LOCKED).
 * Prolog body: cau_always_realized_when_bearer_exists(CAU),
 *              \+ cau_realization_has_triggering_circumstances(CAU).
 * Design sketch: specs/d16/wave2-helpers-design-sketch.md (LOCKED 2026-04-22).
 *
 * OWA/CWA posture: mixed — positive conjunct Option B (strict); negative
 * conjunct reuses Wave 0 cauRealizationHasTriggeringCircumstances helper.
 *
 * Option B (strict) per SME decision 1: positive conjunct requires
 *   pattern 1 (existsAt + inheresIn co-extension)
 *   OR
 *   pattern 3 (continuous-attribute class subsumption via isSubclassOf callback).
 * Pattern 2 (realizedIn-absence alone) does NOT satisfy.
 *
 * Adversarial dual-signal case per SME Wave 2 design review:
 *   CAU with both inheresIn and realizedIn-causal-process → positive conjunct
 *   fails (pattern 1 requires existsAt, not realizedIn); negative conjunct
 *   also fails (causal-triggering realization present). Helper returns false.
 *
 * Structured failure reasons per feedback_structured_failure_reasons pattern.
 */

import { describe, it, expect } from '@jest/globals';
import { cauAlwaysRealizedWhenBearerExists } from '../../../src/core/d16/critical-nc-helpers.js';

function makeSignature({
  cauIRI = 'ex:TestCAU',
  inheresInTargets = [],
  existsAtTargets = [],
  realizedInTargets = [],
  subClassOfTargets = [],
}) {
  return {
    cauIRI,
    propertyRestrictionsAsDomain: [
      ...inheresInTargets.map(target => ({
        property: 'http://purl.obolibrary.org/obo/BFO_0000052', // inheresIn
        restrictionKind: 'someValuesFrom',
        target,
        diagnosticWeight: 'High',
        directlyDeclared: true,
      })),
      ...existsAtTargets.map(target => ({
        property: 'http://purl.obolibrary.org/obo/BFO_0000108', // existsAt
        restrictionKind: 'someValuesFrom',
        target,
        diagnosticWeight: 'Medium',
        directlyDeclared: true,
      })),
      ...realizedInTargets.map(target => ({
        property: 'http://purl.obolibrary.org/obo/BFO_0000054', // isRealizedIn
        restrictionKind: 'someValuesFrom',
        target,
        diagnosticWeight: 'Medium',
        directlyDeclared: true,
      })),
    ],
    propertyRestrictionsAsRange: [],
    characteristics: [],
    disjointnessAssertions: [],
    equivalenceClaims: [],
    universalRestrictions: [],
    existentialRestrictions: [
      ...inheresInTargets.map(t => ({ onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', someValuesFrom: t })),
      ...existsAtTargets.map(t => ({ onProperty: 'http://purl.obolibrary.org/obo/BFO_0000108', someValuesFrom: t })),
      ...realizedInTargets.map(t => ({ onProperty: 'http://purl.obolibrary.org/obo/BFO_0000054', someValuesFrom: t })),
    ],
    cardinalityRestrictions: [],
    hasValueRestrictions: [],
    normalizedEnumerations: [],
  };
}

describe('QualityNC3: cauAlwaysRealizedWhenBearerExists', () => {
  describe('Gate: no inheresIn restriction', () => {
    it('returns false with reason no_inheresIn_restrictions', () => {
      const signature = makeSignature({ inheresInTargets: [] });
      const result = cauAlwaysRealizedWhenBearerExists({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('no_inheresIn_restrictions');
      expect(result.groundsNC).toBe('QualityNC3');
    });
  });

  describe('Option B positive conjunct — Pattern 1 (existsAt + inheresIn co-extension)', () => {
    it('returns true when both existsAt and inheresIn present', () => {
      const signature = makeSignature({
        inheresInTargets: ['ex:Ball'],
        existsAtTargets: ['ex:Ball-temporal-region'],
      });
      const result = cauAlwaysRealizedWhenBearerExists({ signature });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(1);
    });

    it('does NOT fire on existsAt without inheresIn', () => {
      const signature = makeSignature({
        inheresInTargets: [],
        existsAtTargets: ['ex:Ball-temporal-region'],
      });
      const result = cauAlwaysRealizedWhenBearerExists({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('no_inheresIn_restrictions'); // gate fires first
    });
  });

  describe('Option B positive conjunct — Pattern 3 (subclass-of-Quality)', () => {
    it('returns true when isSubclassOf callback confirms CAU is subclass of bfo:Quality', () => {
      const signature = makeSignature({
        cauIRI: 'ex:SomeQuality',
        inheresInTargets: ['ex:Bearer'],
      });
      const isSubclassOf = (sub, sup) =>
        sub === 'ex:SomeQuality' && sup === 'http://purl.obolibrary.org/obo/BFO_0000019';
      const result = cauAlwaysRealizedWhenBearerExists({ signature, isSubclassOf });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(3);
    });

    it('returns true when isSubclassOf matches via symbolic bfo:Quality IRI', () => {
      const signature = makeSignature({
        cauIRI: 'ex:SomeQuality',
        inheresInTargets: ['ex:Bearer'],
      });
      const isSubclassOf = (sub, sup) => sub === 'ex:SomeQuality' && sup === 'bfo:Quality';
      const result = cauAlwaysRealizedWhenBearerExists({ signature, isSubclassOf });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(3);
    });

    it('returns false when isSubclassOf callback absent (conservative-false for pattern 3)', () => {
      const signature = makeSignature({
        cauIRI: 'ex:SomeQuality',
        inheresInTargets: ['ex:Bearer'],
      });
      // No existsAt → pattern 1 fails. No isSubclassOf callback → pattern 3 conservative-false.
      const result = cauAlwaysRealizedWhenBearerExists({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('positive_conjunct_failed_option_b');
    });
  });

  describe('Option B strict enforcement — Pattern 2 (realizedIn-absence alone) does NOT satisfy', () => {
    it('returns false for pure inheresIn without existsAt or subclass-of-Quality', () => {
      // Under Option A (REJECTED), this would have been treated as Quality because
      // realizedIn is absent. Under Option B it correctly routes to Plausible.
      const signature = makeSignature({
        inheresInTargets: ['ex:Ball'],
        realizedInTargets: [], // absence of realizedIn
        existsAtTargets: [],    // absence of existsAt
      });
      const result = cauAlwaysRealizedWhenBearerExists({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('positive_conjunct_failed_option_b');
    });
  });

  describe('Negative conjunct — causal-triggering realization must be absent', () => {
    it('returns false when CAU has realization target in causal_triggering list', () => {
      // CAU satisfies pattern 1 (existsAt + inheresIn) but has realizedIn
      // cco:ShatteringProcess (which IS in causal_triggering curated list).
      // Negative conjunct fails.
      const signature = makeSignature({
        inheresInTargets: ['ex:Glass'],
        existsAtTargets: ['ex:Glass-temporal-region'],
      });
      const result = cauAlwaysRealizedWhenBearerExists({
        signature,
        realizationTargets: ['cco:ShatteringProcess'], // Wave 0 helper matches this to causal_triggering
      });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('triggering_realization_present');
    });

    it('returns true when realization targets in design_expected (non-causal) and positive conjunct satisfied', () => {
      // CAU has realizedIn some design-expected process. Wave 0 causal helper
      // returns false (design_expected is not causal). Negative conjunct succeeds.
      // Positive conjunct via pattern 1 (existsAt + inheresIn).
      // Happy path: helper fires true.
      const signature = makeSignature({
        inheresInTargets: ['ex:Bearer'],
        existsAtTargets: ['ex:Bearer-temporal-region'],
      });
      const result = cauAlwaysRealizedWhenBearerExists({
        signature,
        realizationTargets: ['cco:PumpingProcess'], // in design_expected, not causal_triggering
      });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(1);
    });
  });

  describe('Happy path — full Option B satisfaction', () => {
    it('returns true for canonical Quality: existsAt + inheresIn + no causal realization', () => {
      const signature = makeSignature({
        cauIRI: 'ex:Color',
        inheresInTargets: ['ex:Ball'],
        existsAtTargets: ['ex:Ball-temporal-region'],
      });
      const result = cauAlwaysRealizedWhenBearerExists({ signature });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(1);
    });

    it('returns true for subclass-of-Quality + no causal realization + no existsAt needed', () => {
      const signature = makeSignature({
        cauIRI: 'ex:Color',
        inheresInTargets: ['ex:Ball'],
      });
      const isSubclassOf = (sub, sup) => sub === 'ex:Color' && sup === 'bfo:Quality';
      const result = cauAlwaysRealizedWhenBearerExists({ signature, isSubclassOf });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(3);
    });
  });

  describe('Adversarial: dual-signal case (SME-added)', () => {
    it('returns false when inheresIn + realizedIn-causal-process (negative conjunct fails)', () => {
      // CAU has inheresIn some ex:Bearer AND realizedIn some cco:ShatteringProcess.
      // Even if subclass-of-Quality could satisfy positive conjunct, the causal
      // realization is present — negative conjunct fails. Routes to Plausible.
      const signature = makeSignature({
        cauIRI: 'ex:ConflictedCAU',
        inheresInTargets: ['ex:Bearer'],
        existsAtTargets: ['ex:Bearer-temporal-region'], // positive conjunct pattern 1 could fire
        realizedInTargets: ['cco:ShatteringProcess'],
      });
      const result = cauAlwaysRealizedWhenBearerExists({
        signature,
        realizationTargets: ['cco:ShatteringProcess'],
      });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('triggering_realization_present');
    });
  });

  describe('Realization targets auto-extraction from Signature', () => {
    it('extracts realizationTargets from signature.existentialRestrictions when not passed explicitly', () => {
      const signature = makeSignature({
        inheresInTargets: ['ex:Bearer'],
        existsAtTargets: ['ex:Bearer-temporal-region'],
        realizedInTargets: ['cco:ShatteringProcess'], // will be auto-extracted
      });
      // Not passing realizationTargets; helper should extract from existentialRestrictions.
      const result = cauAlwaysRealizedWhenBearerExists({ signature });
      expect(result.result).toBe(false);
      expect(result.reason).toBe('triggering_realization_present');
    });
  });
});
