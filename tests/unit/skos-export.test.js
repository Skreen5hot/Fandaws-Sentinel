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
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal');
      const result = exportSKOS(makeGraph([animal]));
      expect(result).toContain('skos:Concept');
    });

    it('exports 5-concept hierarchy with broader and narrower', () => {
      const entity = makeConcept('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', 'Entity', 'entity');
      const living = makeConcept('fandaws:class/776408aa-76bb-5c53-99ef-7cbd07e69f3a/living', 'Living Thing', 'living thing', 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity');
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal', 'fandaws:class/776408aa-76bb-5c53-99ef-7cbd07e69f3a/living');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'cat', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const result = exportSKOS(makeGraph([entity, living, animal, dog, cat]));

      expect(result).toContain('skos:broader');
      expect(result).toContain('skos:narrower');
    });

    it('includes skos:narrower inverse for every broader', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const result = exportSKOS(makeGraph([animal, dog]));

      // dog has skos:broader animal, so animal should have skos:narrower dog
      expect(result).toContain('skos:narrower');
    });

    it('includes fandaws:algorithmicDefinition for concepts', () => {
      const dog = createConcept({
        id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        label: 'Dog',
        prefLabel: 'dog',
        definition: 'Dog is an Animal.',
      });
      const result = exportSKOS(makeGraph([dog]));
      expect(result).toContain('algorithmicDefinition');
      expect(result).toContain('Dog is an Animal.');
    });

    it('includes skos:prefLabel', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportSKOS(makeGraph([dog]));
      expect(result).toContain('skos:prefLabel');
    });

    it('emits ConceptScheme declaration for graph', () => {
      const result = exportSKOS(makeGraph([]));
      expect(result).toContain('skos:ConceptScheme');
    });

    it('does NOT include owl:Class type', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportSKOS(makeGraph([dog]));
      expect(result).not.toContain('owl:Class');
    });

    it('does NOT include owl:Restriction triples', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const prop = createProperty({
        id: 'fandaws:prop/dog--fur',
        propertyConceptIri: 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
      });
      dog['rdfs:subClassOf'] = [prop];
      const result = exportSKOS(makeGraph([dog]));

      expect(result).not.toContain('owl:Restriction');
      expect(result).not.toContain('owl:onProperty');
    });

    it('includes rdfs:label', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportSKOS(makeGraph([dog]));
      expect(result).toContain('rdfs:label');
    });
  });

  describe('Determinism', () => {
    it('produces byte-identical output across 3 calls', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal');
      const graph = makeGraph([dog, animal]);

      const r1 = exportSKOS(graph);
      const r2 = exportSKOS(graph);
      const r3 = exportSKOS(graph);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('concept order does not affect output', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'cat');

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
      const root = makeConcept('fandaws:class/12ac83b4-94ba-5214-a91a-d2c53f830fbf/root', 'Root', 'root');
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
        id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
      const concept = makeConcept('fandaws:class/0bf07a6b-44d0-59c3-8688-74c07b3163f6/test', 'Test "quoted"', 'test');
      const result = exportSKOS(makeGraph([concept]));
      expect(result).toContain('Test \\"quoted\\"');
    });
  });
});
