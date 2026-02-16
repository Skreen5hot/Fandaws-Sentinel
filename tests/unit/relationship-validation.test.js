/**
 * Relationship Validation — unit tests.
 *
 * Covers: normalizeVerb (8 tests), duplicate check (2), inverse check (2),
 * hierarchy consistency (3), reuse assessment (2), promotion check (1),
 * refactoring check (2).
 */

import { describe, it, expect } from '@jest/globals';
import { normalizeVerb, validateRelationship } from '../../src/core/validator/relationship-validation.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

// ── Helpers ──

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeConcept(id, label, broader = null, restrictions = []) {
  const c = createConcept({ id, label, prefLabel: label, broader });
  c['rdfs:subClassOf'] = restrictions;
  return c;
}

function makeRel(id, verb, subject, object) {
  return createRelationship({ id, verbIri: verb, subject, object });
}

function makeIndices(concepts) {
  const iriToParent = new Map();
  const iriToChildren = new Map();
  for (const c of concepts) {
    iriToParent.set(c['@id'], c['skos:broader'] || null);
    const parent = c['skos:broader'];
    if (parent) {
      if (!iriToChildren.has(parent)) iriToChildren.set(parent, new Set());
      iriToChildren.get(parent).add(c['@id']);
    }
  }
  return {
    canonicalLabelToIri: new Map(),
    iriToParent,
    iriToChildren,
    iriToProperties: new Map(),
    iriToReverseRelationships: new Map(),
  };
}

// ── normalizeVerb ──

describe('normalizeVerb', () => {
  it('strips trailing -s ("chases" → "chase")', () => {
    expect(normalizeVerb('chases')).toBe('chase');
  });

  it('strips trailing -es after sibilant ("teaches" → "teach")', () => {
    expect(normalizeVerb('teaches')).toBe('teach');
  });

  it('strips trailing -ed ("chased" → "chase")', () => {
    expect(normalizeVerb('chased')).toBe('chase');
  });

  it('strips trailing -ing ("chasing" → "chase")', () => {
    expect(normalizeVerb('chasing')).toBe('chase');
  });

  it('resolves irregular verbs ("ate" → "eat")', () => {
    expect(normalizeVerb('ate')).toBe('eat');
  });

  it('passes through base form unchanged ("chase" → "chase")', () => {
    expect(normalizeVerb('chase')).toBe('chase');
  });

  it('lowercases input ("CHASE" → "chase")', () => {
    expect(normalizeVerb('CHASE')).toBe('chase');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeVerb(null)).toBe('');
    expect(normalizeVerb(undefined)).toBe('');
  });

  it('handles -ies suffix ("carries" → "carry")', () => {
    expect(normalizeVerb('carries')).toBe('carry');
  });

  it('handles -sses suffix ("passes" → "pass")', () => {
    expect(normalizeVerb('passes')).toBe('pass');
  });
});

// ── validateRelationship ──

describe('validateRelationship', () => {
  describe('duplicate check', () => {
    it('detects exact duplicate tuple', () => {
      const rel1 = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const dog = makeConcept('fandaws:concept/dog', 'dog', null, [rel1]);
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);

      const newRel = makeRel('r2', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'duplicateRelationship')).toBe(true);
    });

    it('detects normalized verb match ("chases" matches "chase")', () => {
      const rel1 = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const dog = makeConcept('fandaws:concept/dog', 'dog', null, [rel1]);
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);

      const newRel = makeRel('r2', 'chases', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'duplicateRelationship')).toBe(true);
    });
  });

  describe('inverse check', () => {
    it('detects swapped subject/object', () => {
      const rel1 = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const dog = makeConcept('fandaws:concept/dog', 'dog', null, [rel1]);
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);

      const newRel = makeRel('r2', 'chase', 'fandaws:concept/cat', 'fandaws:concept/dog');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'inverseRelationship')).toBe(true);
    });

    it('does not flag different verb as inverse', () => {
      const rel1 = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const dog = makeConcept('fandaws:concept/dog', 'dog', null, [rel1]);
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);

      const newRel = makeRel('r2', 'guard', 'fandaws:concept/cat', 'fandaws:concept/dog');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'inverseRelationship')).toBe(false);
    });
  });

  describe('hierarchy consistency', () => {
    it('detects ancestor with same relationship → redundant', () => {
      const rel1 = makeRel('r1', 'eat', 'fandaws:concept/animal', 'fandaws:concept/food');
      const animal = makeConcept('fandaws:concept/animal', 'animal', null, [rel1]);
      const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal');
      const food = makeConcept('fandaws:concept/food', 'food');
      const graph = makeGraph([animal, dog, food]);
      const indices = makeIndices([animal, dog, food]);

      const newRel = makeRel('r2', 'eat', 'fandaws:concept/dog', 'fandaws:concept/food');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'hierarchyRedundant')).toBe(true);
    });

    it('passes when no ancestor has the relationship', () => {
      const animal = makeConcept('fandaws:concept/animal', 'animal');
      const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal');
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([animal, dog, cat]);
      const indices = makeIndices([animal, dog, cat]);

      const newRel = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'hierarchyRedundant')).toBe(false);
    });

    it('passes when ancestor has different verb', () => {
      const rel1 = makeRel('r1', 'eat', 'fandaws:concept/animal', 'fandaws:concept/food');
      const animal = makeConcept('fandaws:concept/animal', 'animal', null, [rel1]);
      const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal');
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([animal, dog, cat]);
      const indices = makeIndices([animal, dog, cat]);

      const newRel = makeRel('r2', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'hierarchyRedundant')).toBe(false);
    });
  });

  describe('reuse assessment', () => {
    it('flags verb reuse as warning', () => {
      const rel1 = makeRel('r1', 'chase', 'fandaws:concept/cat', 'fandaws:concept/mouse');
      const cat = makeConcept('fandaws:concept/cat', 'cat', null, [rel1]);
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const mouse = makeConcept('fandaws:concept/mouse', 'mouse');
      const bird = makeConcept('fandaws:concept/bird', 'bird');
      const graph = makeGraph([cat, dog, mouse, bird]);
      const indices = makeIndices([cat, dog, mouse, bird]);

      const newRel = makeRel('r2', 'chase', 'fandaws:concept/dog', 'fandaws:concept/bird');
      const result = validateRelationship(newRel, graph, indices);
      const reuse = result.violations.find((v) => v.reason === 'verbReuse');
      expect(reuse).toBeDefined();
      expect(reuse.severity).toBe('warning');
    });

    it('does not flag unique verb', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);

      const newRel = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'verbReuse')).toBe(false);
    });
  });

  describe('promotion check', () => {
    it('suggests promotion when all siblings have same relationship', () => {
      const parentRel = makeRel('rp', 'eat', 'fandaws:concept/animal', 'fandaws:concept/food');
      const animal = makeConcept('fandaws:concept/animal', 'animal');
      const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal', [
        makeRel('r1', 'eat', 'fandaws:concept/dog', 'fandaws:concept/food'),
      ]);
      const cat = makeConcept('fandaws:concept/cat', 'cat', 'fandaws:concept/animal', [
        makeRel('r2', 'eat', 'fandaws:concept/cat', 'fandaws:concept/food'),
      ]);
      const food = makeConcept('fandaws:concept/food', 'food');
      const graph = makeGraph([animal, dog, cat, food]);
      const indices = makeIndices([animal, dog, cat, food]);

      // New rel with subRestrictionOf set
      const newRel = { ...makeRel('r3', 'eat', 'fandaws:concept/dog', 'fandaws:concept/food'), 'fandaws:subRestrictionOf': 'rp' };
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'promotionCandidate')).toBe(true);
    });
  });

  describe('refactoring check', () => {
    it('flags same-subtree relationship', () => {
      const animal = makeConcept('fandaws:concept/animal', 'animal');
      const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal');
      const cat = makeConcept('fandaws:concept/cat', 'cat', 'fandaws:concept/animal');
      const graph = makeGraph([animal, dog, cat]);
      const indices = makeIndices([animal, dog, cat]);

      const newRel = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
      const result = validateRelationship(newRel, graph, indices);
      const refactor = result.violations.find((v) => v.reason === 'sameSubtree');
      expect(refactor).toBeDefined();
      expect(refactor.severity).toBe('warning');
    });

    it('does not flag unrelated concepts', () => {
      const animal = makeConcept('fandaws:concept/animal', 'animal');
      const plant = makeConcept('fandaws:concept/plant', 'plant');
      const graph = makeGraph([animal, plant]);
      const indices = makeIndices([animal, plant]);

      const newRel = makeRel('r1', 'consume', 'fandaws:concept/animal', 'fandaws:concept/plant');
      const result = validateRelationship(newRel, graph, indices);
      expect(result.violations.some((v) => v.reason === 'sameSubtree')).toBe(false);
    });
  });
});
