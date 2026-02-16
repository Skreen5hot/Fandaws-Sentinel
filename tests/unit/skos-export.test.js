/**
 * SKOS Export — unit tests.
 *
 * Covers: SKOS vocabulary filtering, narrower inverses, ConceptScheme,
 * exclusion of OWL terms, determinism, edge cases.
 */

import { describe, it, expect } from '@jest/globals';
import { exportSKOS } from '../../src/core/export-engine/skos-export.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

// ── Helpers ──

function makeGraph(concepts = [], id = 'fandaws:graph/test') {
  return createKnowledgeGraph({ id, concepts });
}

function makeConcept(id, label, prefLabel, broader = null) {
  return createConcept({ id, label, prefLabel, broader });
}

// ── Tests ──

describe('SKOS Export', () => {
  describe('Basic export', () => {
    it('exports single root concept with skos:Concept type', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
      const result = exportSKOS(makeGraph([animal]));
      expect(result).toContain('skos:Concept');
    });

    it('exports 5-concept hierarchy with broader and narrower', () => {
      const entity = makeConcept('fandaws:concept/entity', 'Entity', 'entity');
      const living = makeConcept('fandaws:concept/living', 'Living Thing', 'living thing', 'fandaws:concept/entity');
      const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal', 'fandaws:concept/living');
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal');
      const cat = makeConcept('fandaws:concept/cat', 'Cat', 'cat', 'fandaws:concept/animal');
      const result = exportSKOS(makeGraph([entity, living, animal, dog, cat]));

      expect(result).toContain('skos:broader');
      expect(result).toContain('skos:narrower');
    });

    it('includes skos:narrower inverse for every broader', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal');
      const result = exportSKOS(makeGraph([animal, dog]));

      // dog has skos:broader animal, so animal should have skos:narrower dog
      expect(result).toContain('skos:narrower');
    });

    it('includes skos:definition for concepts', () => {
      const dog = createConcept({
        id: 'fandaws:concept/dog',
        label: 'Dog',
        prefLabel: 'dog',
        definition: 'Dog is an Animal.',
      });
      const result = exportSKOS(makeGraph([dog]));
      expect(result).toContain('skos:definition');
      expect(result).toContain('Dog is an Animal.');
    });

    it('includes skos:prefLabel', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
      const result = exportSKOS(makeGraph([dog]));
      expect(result).toContain('skos:prefLabel');
    });

    it('emits ConceptScheme declaration for graph', () => {
      const result = exportSKOS(makeGraph([]));
      expect(result).toContain('skos:ConceptScheme');
    });

    it('does NOT include owl:Class type', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
      const result = exportSKOS(makeGraph([dog]));
      expect(result).not.toContain('owl:Class');
    });

    it('does NOT include owl:Restriction triples', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
      const prop = createProperty({
        id: 'fandaws:prop/dog--fur',
        propertyIri: 'fur',
        attachedTo: 'fandaws:concept/dog',
        value: 'yes',
      });
      dog['rdfs:subClassOf'] = [prop];
      const result = exportSKOS(makeGraph([dog]));

      expect(result).not.toContain('owl:Restriction');
      expect(result).not.toContain('owl:onProperty');
    });

    it('includes rdfs:label', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
      const result = exportSKOS(makeGraph([dog]));
      expect(result).toContain('rdfs:label');
    });
  });

  describe('Determinism', () => {
    it('produces byte-identical output across 3 calls', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal');
      const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
      const graph = makeGraph([dog, animal]);

      const r1 = exportSKOS(graph);
      const r2 = exportSKOS(graph);
      const r3 = exportSKOS(graph);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('concept order does not affect output', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
      const cat = makeConcept('fandaws:concept/cat', 'Cat', 'cat');

      const r1 = exportSKOS(makeGraph([dog, cat]));
      const r2 = exportSKOS(makeGraph([cat, dog]));
      expect(r1).toBe(r2);
    });
  });

  describe('Edge cases', () => {
    it('empty graph produces valid Turtle with only prefixes', () => {
      const result = exportSKOS(makeGraph([]));
      expect(result).toContain('@prefix');
      expect(result).toContain('skos:');
    });

    it('concept with no parent has no skos:broader triple', () => {
      const root = makeConcept('fandaws:concept/root', 'Root', 'root');
      const result = exportSKOS(makeGraph([root]));
      // The concept itself should not have broader
      const lines = result.split('\n');
      const conceptBlock = lines.filter((l) =>
        l.includes('concept/root'),
      );
      // broader should not appear in this concept's triples
      const hasBroader = lines.some(
        (l) => l.includes('skos:broader') && l.includes('concept/root'),
      );
      // Root concept has no broader, so broader should not appear as subject for root
      expect(result).not.toMatch(/concept\/root[\s\S]*?skos:broader/);
    });

    it('concept with altLabels emits skos:altLabel triples', () => {
      const dog = createConcept({
        id: 'fandaws:concept/dog',
        label: 'Dog',
        prefLabel: 'dog',
        altLabel: ['canine', 'hound'],
      });
      const result = exportSKOS(makeGraph([dog]));
      expect(result).toContain('skos:altLabel');
      expect(result).toContain('canine');
      expect(result).toContain('hound');
    });

    it('special characters in labels are properly escaped', () => {
      const concept = makeConcept('fandaws:concept/test', 'Test "quoted"', 'test');
      const result = exportSKOS(makeGraph([concept]));
      expect(result).toContain('Test \\"quoted\\"');
    });
  });
});
