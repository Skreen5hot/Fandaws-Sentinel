import { describe, it, expect } from '@jest/globals';
import { describeConcept } from '../../src/core/description-engine/description-engine.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeConcept(id, label, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
}

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

/** Attach property restrictions to a concept's rdfs:subClassOf. */
function addProperties(concept, propertyNames) {
  const sub = concept['rdfs:subClassOf'] || [];
  for (const name of propertyNames) {
    sub.push({
      '@type': 'owl:Restriction',
      'owl:onProperty': name,
      'fandaws:restrictionKind': 'property',
    });
  }
  concept['rdfs:subClassOf'] = sub;
  return concept;
}

/** Attach a relationship restriction to a concept's rdfs:subClassOf. */
function addRelationship(concept, verb, objectIri, subjectIri) {
  const sub = concept['rdfs:subClassOf'] || [];
  sub.push({
    '@type': 'owl:Restriction',
    'owl:onProperty': verb,
    'owl:someValuesFrom': objectIri,
    'fandaws:attachedTo': subjectIri,
    'fandaws:restrictionKind': 'relationship',
  });
  concept['rdfs:subClassOf'] = sub;
  return concept;
}

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe('DescriptionEngine', () => {
  // ── Article selection ──────────────────────────────────

  describe('Article selection', () => {
    it('uses "an" before vowel-starting parent (Animal)', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal');
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('uses "a" before consonant-starting parent (Mammal)', () => {
      const mammal = makeConcept('fandaws:concept/mammal', 'Mammal');
      const cat = makeConcept('fandaws:concept/cat', 'Cat', 'fandaws:concept/mammal');
      const graph = makeGraph([mammal, cat]);

      expect(describeConcept(cat, graph)).toBe('Cat is a Mammal.');
    });

    it('uses "an" before "Elephant"', () => {
      const elephant = makeConcept('fandaws:concept/elephant', 'Elephant');
      const mouse = makeConcept('fandaws:concept/mouse', 'Mouse', 'fandaws:concept/elephant');
      const graph = makeGraph([elephant, mouse]);

      expect(describeConcept(mouse, graph)).toBe('Mouse is an Elephant.');
    });

    it('uses "a" before "Bird"', () => {
      const bird = makeConcept('fandaws:concept/bird', 'Bird');
      const sparrow = makeConcept('fandaws:concept/sparrow', 'Sparrow', 'fandaws:concept/bird');
      const graph = makeGraph([bird, sparrow]);

      expect(describeConcept(sparrow, graph)).toBe('Sparrow is a Bird.');
    });
  });

  // ── Display label capitalization ───────────────────────

  describe('Display label capitalization', () => {
    it('capitalizes lowercase rdfs:label', () => {
      const animal = makeConcept('fandaws:concept/animal', 'animal');
      const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('preserves already-capitalized label', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal');
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('handles empty label gracefully', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal');
      const concept = createConcept({
        id: 'fandaws:concept/empty',
        label: '',
        prefLabel: '',
        broader: 'fandaws:concept/animal',
      });
      const graph = makeGraph([animal, concept]);

      // Empty label produces empty string from capitalizeLabel
      const result = describeConcept(concept, graph);
      expect(result).toContain('Animal');
    });
  });

  // ── Standard template — with parent ────────────────────

  describe('Standard template — with parent', () => {
    it('spec example: Dog + Animal + [fur, four legs]', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal');
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
      addProperties(dog, ['fur', 'four legs']);
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe(
        'Dog is an Animal that has fur and four legs.',
      );
    });

    it('no properties → simple description', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal');
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('single property → no Oxford comma', () => {
      const mammal = makeConcept('fandaws:concept/mammal', 'Mammal');
      const cat = makeConcept('fandaws:concept/cat', 'Cat', 'fandaws:concept/mammal');
      addProperties(cat, ['whiskers']);
      const graph = makeGraph([mammal, cat]);

      expect(describeConcept(cat, graph)).toBe(
        'Cat is a Mammal that has whiskers.',
      );
    });

    it('3+ properties → Oxford comma', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog');
      const poodle = makeConcept('fandaws:concept/poodle', 'Poodle', 'fandaws:concept/dog');
      addProperties(poodle, ['curly fur', 'small size', 'playfulness']);
      const graph = makeGraph([dog, poodle]);

      expect(describeConcept(poodle, graph)).toBe(
        'Poodle is a Dog that has curly fur, small size, and playfulness.',
      );
    });
  });

  // ── Root concept — no parent ───────────────────────────

  describe('Root concept — no parent', () => {
    it('root with no properties', () => {
      const entity = makeConcept('fandaws:concept/entity', 'Entity');
      const graph = makeGraph([entity]);

      expect(describeConcept(entity, graph)).toBe('Entity is a root concept.');
    });

    it('root with properties', () => {
      const entity = makeConcept('fandaws:concept/entity', 'Entity');
      addProperties(entity, ['mass', 'energy']);
      const graph = makeGraph([entity]);

      expect(describeConcept(entity, graph)).toBe(
        'Entity is a root concept that has mass and energy.',
      );
    });
  });

  // ── Process template ───────────────────────────────────

  describe('Process template', () => {
    it('concept with relationship + parent uses process format', () => {
      const hunt = makeConcept('fandaws:concept/hunt', 'Hunt');
      const cat = makeConcept('fandaws:concept/cat', 'Cat');
      const dog = makeConcept('fandaws:concept/dog', 'Dog');
      const predation = makeConcept(
        'fandaws:concept/predation',
        'Predation',
        'fandaws:concept/hunt',
      );
      addRelationship(
        predation,
        'chases',
        'fandaws:concept/cat',
        'fandaws:concept/dog',
      );
      const graph = makeGraph([hunt, cat, dog, predation]);

      expect(describeConcept(predation, graph)).toBe(
        'Predation is the hunting of Cat by Dog.',
      );
    });

    it('concept with relationship but no parent falls back to root template', () => {
      const cat = makeConcept('fandaws:concept/cat', 'Cat');
      const dog = makeConcept('fandaws:concept/dog', 'Dog');
      const predation = makeConcept('fandaws:concept/predation', 'Predation');
      addRelationship(
        predation,
        'chases',
        'fandaws:concept/cat',
        'fandaws:concept/dog',
      );
      const graph = makeGraph([cat, dog, predation]);

      expect(describeConcept(predation, graph)).toBe(
        'Predation is a root concept.',
      );
    });
  });

  // ── Edge cases ─────────────────────────────────────────

  describe('Edge cases', () => {
    it('missing parent in graph → fallback description', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
      const graph = makeGraph([dog]); // animal not in graph

      expect(describeConcept(dog, graph)).toBe('Dog is a concept.');
    });

    it('missing parent with properties → includes property suffix', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
      addProperties(dog, ['fur']);
      const graph = makeGraph([dog]);

      expect(describeConcept(dog, graph)).toBe(
        'Dog is a concept that has fur.',
      );
    });

    it('empty rdfs:subClassOf → no properties, standard template', () => {
      const animal = makeConcept('fandaws:concept/animal', 'Animal');
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
      dog['rdfs:subClassOf'] = [];
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });
  });
});
