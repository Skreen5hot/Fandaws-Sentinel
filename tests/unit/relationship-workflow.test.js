/**
 * Relationship Workflow — unit tests.
 *
 * Covers: 4 mutation cases (A-D), disambiguation, sub-relationship detection,
 * verb normalization, error handling.
 */

import { describe, it, expect } from '@jest/globals';
import { processRelationship } from '../../src/core/knowledge-engine/relationship-workflow.js';
import { createConcept } from '../../src/types/concept.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createClassificationAction } from '../../src/types/classification-action.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';

// ── Helpers ──

const GRAPH_ID = 'fandaws:graph/test';

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: GRAPH_ID, concepts });
}

function makeConcept(id, label, broader = null, restrictions = []) {
  const c = createConcept({ id, label, prefLabel: label, broader });
  c['rdfs:subClassOf'] = restrictions;
  return c;
}

function makeAction(subject, verb, object) {
  return createClassificationAction({
    workflow: 'customRelationship',
    subject,
    object,
    verb,
  });
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
    canonicalLabelToIri: new Map(concepts.map((c) => [c['skos:prefLabel'], c['@id']])),
    iriToParent,
    iriToChildren,
    iriToProperties: new Map(),
    iriToReverseRelationships: new Map(),
  };
}

// ── Tests ──

describe('processRelationship', () => {
  describe('Case C: Both new', () => {
    it('creates both concepts and relationship', () => {
      const graph = makeGraph();
      const indices = makeIndices([]);
      const action = makeAction('Dogs', 'chase', 'cats');

      const result = processRelationship(action, graph, indices);
      expect(result.error).toBe(false);
      expect(result.mutation).not.toBeNull();
      expect(result.normalizedVerb).toBe('chase');

      const additions = result.mutation['fandaws:additions'];
      expect(additions).toHaveLength(3); // 2 concepts + 1 relationship
      expect(additions[0]['@type']).toContain('skos:Concept');
      expect(additions[1]['@type']).toContain('skos:Concept');
      expect(additions[2]['@type']).toBe('owl:Restriction');
      expect(additions[2]['fandaws:restrictionKind']).toBe('relationship');
    });

    it('normalizes verb in relationship node', () => {
      const graph = makeGraph();
      const indices = makeIndices([]);
      const action = makeAction('Dogs', 'chases', 'cats');

      const result = processRelationship(action, graph, indices);
      const relNode = result.mutation['fandaws:additions'].find(
        (n) => n['@type'] === 'owl:Restriction',
      );
      expect(relNode['owl:onProperty']).toBe('chase');
    });
  });

  describe('Case A: Both exist', () => {
    it('adds relationship restriction only', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);
      const action = makeAction('dog', 'chase', 'cat');

      const result = processRelationship(action, graph, indices);
      expect(result.error).toBe(false);
      expect(result.mutation).not.toBeNull();

      const additions = result.mutation['fandaws:additions'];
      expect(additions).toHaveLength(1);
      expect(additions[0]['fandaws:restrictionKind']).toBe('relationship');
      expect(additions[0]['fandaws:attachedTo']).toBe('fandaws:concept/dog');
      expect(additions[0]['owl:someValuesFrom']).toBe('fandaws:concept/cat');
    });

    it('sets correct IRI format', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);
      const action = makeAction('dog', 'chase', 'cat');

      const result = processRelationship(action, graph, indices);
      const relNode = result.mutation['fandaws:additions'][0];
      expect(relNode['@id']).toBe('fandaws:rel/dog--chase--cat');
    });
  });

  describe('Case B: Subject exists, object new', () => {
    it('creates object concept and relationship', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const graph = makeGraph([dog]);
      const indices = makeIndices([dog]);
      const action = makeAction('dog', 'chase', 'cats');

      const result = processRelationship(action, graph, indices);
      expect(result.error).toBe(false);

      const additions = result.mutation['fandaws:additions'];
      expect(additions).toHaveLength(2); // 1 concept + 1 relationship
      const newConcept = additions.find((n) => Array.isArray(n['@type']));
      expect(newConcept['skos:prefLabel']).toBe('cats');
    });

    it('marks new object as allowRoot', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const graph = makeGraph([dog]);
      const indices = makeIndices([dog]);
      const action = makeAction('dog', 'chase', 'cats');

      const result = processRelationship(action, graph, indices);
      const newConcept = result.mutation['fandaws:additions'].find(
        (n) => Array.isArray(n['@type']),
      );
      expect(newConcept['fandaws:allowRoot']).toBe(true);
    });
  });

  describe('Case D: Subject new, object exists', () => {
    it('creates subject concept and relationship', () => {
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([cat]);
      const indices = makeIndices([cat]);
      const action = makeAction('dogs', 'chase', 'cat');

      const result = processRelationship(action, graph, indices);
      expect(result.error).toBe(false);

      const additions = result.mutation['fandaws:additions'];
      expect(additions).toHaveLength(2); // 1 concept + 1 relationship
      const newConcept = additions.find((n) => Array.isArray(n['@type']));
      expect(newConcept['skos:prefLabel']).toBe('dogs');
    });

    it('relationship points to existing object', () => {
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([cat]);
      const indices = makeIndices([cat]);
      const action = makeAction('dogs', 'chase', 'cat');

      const result = processRelationship(action, graph, indices);
      const relNode = result.mutation['fandaws:additions'].find(
        (n) => n['@type'] === 'owl:Restriction',
      );
      expect(relNode['owl:someValuesFrom']).toBe('fandaws:concept/cat');
    });
  });

  describe('disambiguation', () => {
    it('returns prompt when multiple subject matches', () => {
      const dog1 = makeConcept('fandaws:concept/dog-1', 'dog');
      const dog2 = makeConcept('fandaws:concept/dog-2', 'dog');
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog1, dog2, cat]);
      const indices = makeIndices([dog1, dog2, cat]);
      const action = makeAction('dog', 'chase', 'cat');

      const result = processRelationship(action, graph, indices);
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0]['fandaws:promptType']).toBe('disambiguation');
    });

    it('returns prompt when multiple object matches', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const cat1 = makeConcept('fandaws:concept/cat-1', 'cat');
      const cat2 = makeConcept('fandaws:concept/cat-2', 'cat');
      const graph = makeGraph([dog, cat1, cat2]);
      const indices = makeIndices([dog, cat1, cat2]);
      const action = makeAction('dog', 'chase', 'cat');

      const result = processRelationship(action, graph, indices);
      expect(result.prompts).toHaveLength(1);
    });
  });

  describe('sub-relationship', () => {
    it('detects parent relationship and sets subRestrictionOf', () => {
      const parentRel = createRelationship({
        id: 'fandaws:rel/animal--eat--food',
        verbIri: 'eat',
        subject: 'fandaws:concept/animal',
        object: 'fandaws:concept/food',
      });
      const animal = makeConcept('fandaws:concept/animal', 'animal', null, [parentRel]);
      const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal');
      const meat = makeConcept('fandaws:concept/meat', 'meat');
      const food = makeConcept('fandaws:concept/food', 'food');
      const graph = makeGraph([animal, dog, meat, food]);
      const indices = makeIndices([animal, dog, meat, food]);
      const action = makeAction('dog', 'eat', 'meat');

      const result = processRelationship(action, graph, indices);
      const relNode = result.mutation['fandaws:additions'].find(
        (n) => n['@type'] === 'owl:Restriction',
      );
      expect(relNode['fandaws:subRestrictionOf']).toBe('fandaws:rel/animal--eat--food');
    });

    it('sets null subRestrictionOf when no parent relationship exists', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const cat = makeConcept('fandaws:concept/cat', 'cat');
      const graph = makeGraph([dog, cat]);
      const indices = makeIndices([dog, cat]);
      const action = makeAction('dog', 'chase', 'cat');

      const result = processRelationship(action, graph, indices);
      const relNode = result.mutation['fandaws:additions'].find(
        (n) => n['@type'] === 'owl:Restriction',
      );
      expect(relNode['fandaws:subRestrictionOf']).toBeNull();
    });
  });

  describe('display label capitalization (finding 10a)', () => {
    it('capitalizes both subject and object labels consistently', () => {
      const graph = makeGraph();
      const indices = makeIndices([]);
      // Simulates "Dogs chasing cats" — subject capitalized, object lowercase
      const action = makeAction('Dogs', 'chase', 'cats');

      const result = processRelationship(action, graph, indices);
      const concepts = result.mutation['fandaws:additions'].filter(
        (n) => Array.isArray(n['@type']),
      );
      expect(concepts).toHaveLength(2);
      // Both should have capitalized display labels
      expect(concepts[0]['rdfs:label']).toBe('Dogs');
      expect(concepts[1]['rdfs:label']).toBe('Cats');
    });

    it('capitalizes object label when subject exists', () => {
      const dog = makeConcept('fandaws:concept/dog', 'dog');
      const graph = makeGraph([dog]);
      const indices = makeIndices([dog]);
      const action = makeAction('dog', 'chase', 'cats');

      const result = processRelationship(action, graph, indices);
      const newConcept = result.mutation['fandaws:additions'].find(
        (n) => Array.isArray(n['@type']),
      );
      expect(newConcept['rdfs:label']).toBe('Cats');
    });
  });

  describe('error handling', () => {
    it('rejects invalid workflow', () => {
      const action = createClassificationAction({ workflow: 'classification', subject: 'dog', object: 'cat' });
      const result = processRelationship(action, makeGraph(), makeIndices([]));
      expect(result.error).toBe(true);
      expect(result.errorReason).toBe('invalid-workflow');
    });

    it('rejects missing operands', () => {
      const action = createClassificationAction({ workflow: 'customRelationship', subject: 'dog', object: '' });
      const result = processRelationship(action, makeGraph(), makeIndices([]));
      expect(result.error).toBe(true);
      expect(result.errorReason).toBe('missing-operands');
    });
  });
});
