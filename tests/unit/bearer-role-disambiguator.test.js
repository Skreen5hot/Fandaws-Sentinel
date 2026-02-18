/**
 * Bearer/Role Disambiguator — unit tests.
 *
 * Covers: structural retargets to bearer, behavioral stays on Role,
 * credential stays on Role, no bearer fallback, ancestor chain walk,
 * property type classification patterns.
 */

import { describe, it, expect } from '@jest/globals';
import { BFO } from '../../src/core/knowledge-engine/bfo-heuristic.js';
import { disambiguateBearerRole } from '../../src/core/epistemic-register/bearer-role-disambiguator.js';

// ── Test fixtures ──

function makeGraph(concepts = []) {
  return { '@type': 'fandaws:KnowledgeGraph', 'fandaws:concepts': concepts };
}

function makeConcept(id, bfoCategory = null, broader = null) {
  const concept = { '@id': id, '@type': ['owl:Class', 'skos:Concept'], 'rdfs:subClassOf': [] };
  if (bfoCategory) concept['rdfs:subClassOf'].push(bfoCategory);
  if (broader) concept['skos:broader'] = broader;
  return concept;
}

function makeRestriction(property, attachedTo = 'fandaws:class/test/doctor') {
  return {
    '@id': 'fandaws:restriction/test/r1',
    '@type': 'owl:Restriction',
    'owl:onProperty': property,
    'fandaws:attachedTo': attachedTo,
  };
}

describe('Bearer/Role Disambiguator', () => {
  describe('structural properties — retarget to Bearer', () => {
    it('retargets "has_arm" to MaterialEntity', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role, 'fandaws:class/test/human');
      const human = makeConcept('fandaws:class/test/human', BFO.materialEntity);
      const graph = makeGraph([doctor, human]);
      const restriction = makeRestriction('has_arm');

      const result = disambiguateBearerRole(restriction, doctor, graph);
      expect(result.bfoCategory).toBe(BFO.materialEntity);
      expect(result.retargeted).toBe(true);
      expect(result.propertyType).toBe('structural');
      expect(result.sensitivity).toBe('normal');
    });

    it('retargets "has_weight" to MaterialEntity', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role, 'fandaws:class/test/person');
      const person = makeConcept('fandaws:class/test/person', BFO.materialEntity);
      const graph = makeGraph([doctor, person]);
      const restriction = makeRestriction('has_weight');

      const result = disambiguateBearerRole(restriction, doctor, graph);
      expect(result.retargeted).toBe(true);
      expect(result.bfoCategory).toBe(BFO.materialEntity);
    });

    it('retargets "has_height" to MaterialEntity', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role, 'fandaws:class/test/human');
      const human = makeConcept('fandaws:class/test/human', BFO.materialEntity);
      const graph = makeGraph([doctor, human]);
      const restriction = makeRestriction('has_height');

      const result = disambiguateBearerRole(restriction, doctor, graph);
      expect(result.retargeted).toBe(true);
    });

    it('retargets "has eye" (space variant) to MaterialEntity', () => {
      const role = makeConcept('fandaws:class/test/role', BFO.role, 'fandaws:class/test/bearer');
      const bearer = makeConcept('fandaws:class/test/bearer', BFO.materialEntity);
      const graph = makeGraph([role, bearer]);
      const restriction = makeRestriction('has eye');

      const result = disambiguateBearerRole(restriction, role, graph);
      expect(result.retargeted).toBe(true);
      expect(result.propertyType).toBe('structural');
    });

    it('walks multi-level ancestor chain to find bearer', () => {
      const teacher = makeConcept('fandaws:class/test/teacher', BFO.role, 'fandaws:class/test/professional');
      const professional = makeConcept('fandaws:class/test/professional', null, 'fandaws:class/test/person');
      const person = makeConcept('fandaws:class/test/person', BFO.materialEntity);
      const graph = makeGraph([teacher, professional, person]);
      const restriction = makeRestriction('has_arm');

      const result = disambiguateBearerRole(restriction, teacher, graph);
      expect(result.retargeted).toBe(true);
      expect(result.bfoCategory).toBe(BFO.materialEntity);
    });
  });

  describe('structural — no bearer found', () => {
    it('stays on Role when no MaterialEntity ancestor exists', () => {
      const abstractRole = makeConcept('fandaws:class/test/abstract-role', BFO.role);
      const graph = makeGraph([abstractRole]);
      const restriction = makeRestriction('has_arm');

      const result = disambiguateBearerRole(restriction, abstractRole, graph);
      expect(result.bfoCategory).toBe(BFO.role);
      expect(result.retargeted).toBe(false);
      expect(result.propertyType).toBe('structural');
      expect(result.sensitivity).toBe('normal');
    });
  });

  describe('behavioral properties — stay on Role', () => {
    it('classifies "diagnoses" as behavioral', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role);
      const graph = makeGraph([doctor]);
      const restriction = makeRestriction('diagnoses');

      const result = disambiguateBearerRole(restriction, doctor, graph);
      expect(result.bfoCategory).toBe(BFO.role);
      expect(result.retargeted).toBe(false);
      expect(result.propertyType).toBe('behavioral');
      expect(result.sensitivity).toBe('heightened');
    });

    it('classifies "protects" as behavioral', () => {
      const guard = makeConcept('fandaws:class/test/guard', BFO.role);
      const graph = makeGraph([guard]);
      const restriction = makeRestriction('protects');

      const result = disambiguateBearerRole(restriction, guard, graph);
      expect(result.propertyType).toBe('behavioral');
      expect(result.sensitivity).toBe('heightened');
    });

    it('classifies unknown property as behavioral (default)', () => {
      const role = makeConcept('fandaws:class/test/role', BFO.role);
      const graph = makeGraph([role]);
      const restriction = makeRestriction('does_something_unusual');

      const result = disambiguateBearerRole(restriction, role, graph);
      expect(result.propertyType).toBe('behavioral');
    });
  });

  describe('credential properties — stay on Role, no sensitivity', () => {
    it('classifies "has_license" as credential', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role);
      const graph = makeGraph([doctor]);
      const restriction = makeRestriction('has_license');

      const result = disambiguateBearerRole(restriction, doctor, graph);
      expect(result.bfoCategory).toBe(BFO.role);
      expect(result.retargeted).toBe(false);
      expect(result.propertyType).toBe('credential');
      expect(result.sensitivity).toBe('normal');
    });

    it('classifies "certified" as credential', () => {
      const nurse = makeConcept('fandaws:class/test/nurse', BFO.role);
      const graph = makeGraph([nurse]);
      const restriction = makeRestriction('certified');

      const result = disambiguateBearerRole(restriction, nurse, graph);
      expect(result.propertyType).toBe('credential');
      expect(result.sensitivity).toBe('normal');
    });

    it('classifies "works_at" as credential', () => {
      const employee = makeConcept('fandaws:class/test/employee', BFO.role);
      const graph = makeGraph([employee]);
      const restriction = makeRestriction('works_at');

      const result = disambiguateBearerRole(restriction, employee, graph);
      expect(result.propertyType).toBe('credential');
    });
  });

  describe('edge cases', () => {
    it('handles null owl:onProperty', () => {
      const role = makeConcept('fandaws:class/test/role', BFO.role);
      const graph = makeGraph([role]);
      const restriction = { '@id': 'r1', '@type': 'owl:Restriction' };

      const result = disambiguateBearerRole(restriction, role, graph);
      expect(result.propertyType).toBe('behavioral');
    });

    it('handles empty owl:onProperty', () => {
      const role = makeConcept('fandaws:class/test/role', BFO.role);
      const graph = makeGraph([role]);
      const restriction = makeRestriction('');

      const result = disambiguateBearerRole(restriction, role, graph);
      expect(result.propertyType).toBe('behavioral');
    });

    it('avoids infinite loop in circular ancestor chains', () => {
      const a = makeConcept('fandaws:class/test/a', BFO.role, 'fandaws:class/test/b');
      const b = makeConcept('fandaws:class/test/b', null, 'fandaws:class/test/a');
      const graph = makeGraph([a, b]);
      const restriction = makeRestriction('has_arm', 'fandaws:class/test/a');

      // Should terminate without infinite loop — no MaterialEntity found
      const result = disambiguateBearerRole(restriction, a, graph);
      expect(result.retargeted).toBe(false);
    });
  });
});
