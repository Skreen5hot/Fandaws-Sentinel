/**
 * SDCNC3 helper tests — cauBearerIsParticularNotGeneric.
 *
 * Grounds NC: SDCNC3 (High-priority, CURATED-NC, sme_locked:false).
 * Prolog body: cau_bearer_is_particular_not_generic(CAU).
 * Design sketch: specs/d16/wave2-helpers-design-sketch.md (LOCKED 2026-04-22).
 *
 * OWA/CWA posture: pure CWA (positive-check only). No OWA treatment needed.
 *
 * Patterns recognized:
 *   1. Target is owl:NamedIndividual (via optional isNamedIndividual callback)
 *   2. Target is singleton class (via optional isSingletonClass callback)
 *   3. Cardinality-1 on inheresIn (simplified per SME — no curated bearer-class list)
 *
 * Conservative-false when callbacks absent: helper returns false for pattern 1
 * and pattern 2 unless the respective callback is provided. Pattern 3 is
 * Signature-resolvable without callbacks.
 *
 * Adversarial cases per SME Wave 2 design review (4 total across all Wave 2
 * helpers; 2 of the 4 are SDCNC3-specific):
 *   - singleton-via-negative-enumeration: helper routes to Plausible (returns false)
 *     because pattern 2 coverage doesn't reach negative-enumeration form in v1.0
 *   - circular bearer relationships: helper does NOT recurse into bearer's own
 *     declarations; evaluates at CAU level only
 */

import { describe, it, expect } from '@jest/globals';
import { cauBearerIsParticularNotGeneric } from '../../../src/core/d16/critical-nc-helpers.js';

// ── Signature fixture builders ──

function makeSignature({ inheresInTargets = [], cardinalityRestrictions = [], extraRestrictions = [] }) {
  return {
    cauIRI: 'ex:TestCAU',
    propertyRestrictionsAsDomain: [
      ...inheresInTargets.map(target => ({
        property: 'http://purl.obolibrary.org/obo/BFO_0000052', // bfo:inheresIn
        restrictionKind: 'someValuesFrom',
        target,
        diagnosticWeight: 'High',
        directlyDeclared: true,
      })),
      ...extraRestrictions,
    ],
    propertyRestrictionsAsRange: [],
    characteristics: [],
    disjointnessAssertions: [],
    equivalenceClaims: [],
    universalRestrictions: [],
    existentialRestrictions: inheresInTargets.map(t => ({ onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', someValuesFrom: t })),
    cardinalityRestrictions,
    hasValueRestrictions: [],
    normalizedEnumerations: [],
  };
}

describe('SDCNC3: cauBearerIsParticularNotGeneric', () => {
  describe('Gate: no inheresIn restriction', () => {
    it('returns false when Signature has no inheresIn restriction', () => {
      const signature = makeSignature({ inheresInTargets: [] });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(false);
      expect(result.groundsNC).toBe('SDCNC3');
    });
  });

  describe('Pattern 1: target is NamedIndividual', () => {
    it('returns true when isNamedIndividual callback confirms target is an individual', () => {
      const signature = makeSignature({ inheresInTargets: ['ex:Alice'] });
      const isNamedIndividual = (iri) => iri === 'ex:Alice';
      const result = cauBearerIsParticularNotGeneric({ signature, isNamedIndividual });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(1);
    });

    it('returns false when isNamedIndividual callback is absent (conservative-false)', () => {
      const signature = makeSignature({ inheresInTargets: ['ex:Alice'] });
      const result = cauBearerIsParticularNotGeneric({ signature });
      // No callback → cannot verify NamedIndividual status → conservative-false for pattern 1
      expect(result.result).toBe(false);
    });
  });

  describe('Pattern 2: target is singleton class', () => {
    it('returns true when isSingletonClass callback confirms target is a singleton', () => {
      const signature = makeSignature({ inheresInTargets: ['ex:SingletonClass'] });
      const isSingletonClass = (iri) => iri === 'ex:SingletonClass';
      const result = cauBearerIsParticularNotGeneric({ signature, isSingletonClass });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(2);
    });

    it('returns false when isSingletonClass callback is absent (conservative-false)', () => {
      const signature = makeSignature({ inheresInTargets: ['ex:SingletonClass'] });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(false);
    });
  });

  describe('Pattern 3 (simplified): cardinality-1 on inheresIn', () => {
    it('returns true with cardinality: 1 on inheresIn', () => {
      const signature = makeSignature({
        inheresInTargets: ['ex:HumanBearer'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', cardinality: 1, diagnosticWeight: 'High' },
        ],
      });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(3);
    });

    it('returns true with qualifiedCardinality: 1 on inheresIn', () => {
      const signature = makeSignature({
        inheresInTargets: ['ex:HumanBearer'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', qualifiedCardinality: 1, diagnosticWeight: 'High' },
        ],
      });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(3);
    });

    it('does NOT match on cardinality: 1 for a different property', () => {
      const signature = makeSignature({
        inheresInTargets: ['ex:HumanBearer'],
        cardinalityRestrictions: [
          { onProperty: 'ex:unrelatedProperty', cardinality: 1, diagnosticWeight: 'Low' },
        ],
      });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(false);
    });

    it('does NOT match on cardinality > 1 on inheresIn', () => {
      const signature = makeSignature({
        inheresInTargets: ['ex:Community'],
        cardinalityRestrictions: [
          { onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052', minCardinality: 2, diagnosticWeight: 'Low' },
        ],
      });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(false);
    });
  });

  describe('Generic-bearer cases (no pattern satisfied)', () => {
    it('returns false for inheresIn with generic class target and no constraints', () => {
      const signature = makeSignature({ inheresInTargets: ['ex:Human'] });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(false);
    });
  });

  describe('Adversarial case: singleton-via-negative-enumeration', () => {
    it('routes to Plausible (returns false) — pattern 2 coverage does not reach negative-enumeration in v1.0', () => {
      // CAU with `inheresIn some ex:Class` + `owl:differentFrom` assertions
      // constraining effective membership to one individual. The Signature
      // doesn't currently surface `differentFrom` enumeration constraints,
      // and pattern 2 requires explicit singleton flagging. Helper correctly
      // returns false (routes caller to Plausible) per documented v1.0 limit.
      const signature = makeSignature({ inheresInTargets: ['ex:ClassWithDifferentFromConstraints'] });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(false);
      // Documented decision: false is correct behavior; expanding pattern 2
      // to handle negative-enumeration would require axiom-graph reasoning
      // beyond v1.0 helper scope.
    });
  });

  describe('Adversarial case: circular bearer relationships', () => {
    it('does NOT recurse into bearer\'s own declarations; evaluates at CAU level only', () => {
      // CAU A inheresIn B; B inheresIn A (circular). Helper evaluates A only.
      // Whether A is particular-bearing is resolved from A's own Signature
      // (here: inheresIn target B, a class, with no cardinality constraint →
      // pattern 3 fails; no individual-status callback → pattern 1 conservative-
      // false; no singleton-status callback → pattern 2 conservative-false).
      // Data-validity concern (circular dependency) is the source-ontology
      // author's problem, not the helper's.
      const signature = makeSignature({ inheresInTargets: ['ex:B'] });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(false);
      // Verify no infinite loop or recursion (test completes).
    });
  });

  describe('Aaron Band 4 regression observation: cco:AgentRole pattern 3 positive case', () => {
    it('matches cco:AgentRole\'s cardinality-1 on bfo:inheresIn (pattern 3 positive)', () => {
      // cco:AgentRole fixture has:
      //   rdfs:subClassOf [ owl:onProperty bfo:0000052 ; owl:cardinality "1" ; owl:onClass cco:Agent ]
      // This is a clean pattern-3 case per Aaron's Band 4 hardening regression
      // observation.
      const signature = makeSignature({
        inheresInTargets: ['http://www.ontologyrepository.com/CommonCoreOntologies/Agent'],
        cardinalityRestrictions: [
          {
            onProperty: 'http://purl.obolibrary.org/obo/BFO_0000052',
            cardinality: 1,
            diagnosticWeight: 'High',
          },
        ],
      });
      const result = cauBearerIsParticularNotGeneric({ signature });
      expect(result.result).toBe(true);
      expect(result.matchedPattern).toBe(3);
    });
  });
});
