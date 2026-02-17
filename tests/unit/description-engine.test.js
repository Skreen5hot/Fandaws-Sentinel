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

/** Mark a concept as BFO process by adding the process IRI to rdfs:subClassOf. */
function markAsProcess(concept) {
  const sub = concept['rdfs:subClassOf'] || [];
  sub.push('bfo:BFO_0000015');
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
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('uses "a" before consonant-starting parent (Mammal)', () => {
      const mammal = makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
      const graph = makeGraph([mammal, cat]);

      expect(describeConcept(cat, graph)).toBe('Cat is a Mammal.');
    });

    it('uses "an" before "Elephant"', () => {
      const elephant = makeConcept('fandaws:class/84583835-5246-5db0-a48f-3f64ea197c2e/elephant', 'Elephant');
      const mouse = makeConcept('fandaws:class/e4088625-0c9a-5e4c-85e4-ad574c774e39/mouse', 'Mouse', 'fandaws:class/84583835-5246-5db0-a48f-3f64ea197c2e/elephant');
      const graph = makeGraph([elephant, mouse]);

      expect(describeConcept(mouse, graph)).toBe('Mouse is an Elephant.');
    });

    it('uses "a" before "Bird"', () => {
      const bird = makeConcept('fandaws:class/5573c80b-1dbe-5bfd-bd74-78dca6c0731b/bird', 'Bird');
      const sparrow = makeConcept('fandaws:class/c1eef495-c88a-58ab-8fd0-d2ced1a9dc90/sparrow', 'Sparrow', 'fandaws:class/5573c80b-1dbe-5bfd-bd74-78dca6c0731b/bird');
      const graph = makeGraph([bird, sparrow]);

      expect(describeConcept(sparrow, graph)).toBe('Sparrow is a Bird.');
    });
  });

  // ── Display label capitalization ───────────────────────

  describe('Display label capitalization', () => {
    it('capitalizes lowercase rdfs:label', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('preserves already-capitalized label', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('handles empty label gracefully', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const concept = createConcept({
        id: 'fandaws:class/e7d360f5-390f-52a1-ba8a-f5cfe1008a74/empty',
        label: '',
        prefLabel: '',
        broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
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
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      addProperties(dog, ['fur', 'four legs']);
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe(
        'Dog is an Animal that has fur and four legs.',
      );
    });

    it('no properties → simple description', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });

    it('single property → no Oxford comma', () => {
      const mammal = makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
      addProperties(cat, ['whiskers']);
      const graph = makeGraph([mammal, cat]);

      expect(describeConcept(cat, graph)).toBe(
        'Cat is a Mammal that has whiskers.',
      );
    });

    it('3+ properties → Oxford comma', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
      const poodle = makeConcept('fandaws:class/75365f2f-01e0-5fd4-b348-3c8a385074e4/poodle', 'Poodle', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
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
      const entity = makeConcept('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', 'Entity');
      const graph = makeGraph([entity]);

      expect(describeConcept(entity, graph)).toBe('Entity is a root concept.');
    });

    it('root with properties', () => {
      const entity = makeConcept('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', 'Entity');
      addProperties(entity, ['mass', 'energy']);
      const graph = makeGraph([entity]);

      expect(describeConcept(entity, graph)).toBe(
        'Entity is a root concept that has mass and energy.',
      );
    });
  });

  // ── Process template ───────────────────────────────────

  describe('Process template', () => {
    it('process concept with relationship + parent uses process format', () => {
      const hunt = makeConcept('fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt', 'Hunt');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
      const predation = makeConcept(
        'fandaws:class/73765e50-9c16-51b2-8c25-d720762a9127/predation',
        'Predation',
        'fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt',
      );
      markAsProcess(predation);
      addRelationship(
        predation,
        'chases',
        'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
        'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      );
      const graph = makeGraph([hunt, cat, dog, predation]);

      expect(describeConcept(predation, graph)).toBe(
        'Predation is the hunting of Cat by Dog.',
      );
    });

    it('concept with relationship but no parent falls back to root template', () => {
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
      const predation = makeConcept('fandaws:class/73765e50-9c16-51b2-8c25-d720762a9127/predation', 'Predation');
      addRelationship(
        predation,
        'chases',
        'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
        'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      );
      const graph = makeGraph([cat, dog, predation]);

      expect(describeConcept(predation, graph)).toBe(
        'Predation is a root concept.',
      );
    });
  });

  // ── Standard template with relationship ──────────────

  describe('Standard template with relationship (non-process)', () => {
    it('material entity with relationship uses standard+relationship format', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const meat = makeConcept('fandaws:class/test-meat', 'Meat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      addRelationship(dog, 'eats', 'fandaws:class/test-meat', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
      const graph = makeGraph([animal, meat, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal that eats Meat.');
    });

    it('material entity with relationship + properties uses relationship template', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const meat = makeConcept('fandaws:class/test-meat', 'Meat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      addProperties(dog, ['fur']);
      addRelationship(dog, 'eats', 'fandaws:class/test-meat', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
      const graph = makeGraph([animal, meat, dog]);

      // Relationship template takes priority over property suffix
      expect(describeConcept(dog, graph)).toBe('Dog is an Animal that eats Meat.');
    });

    it('non-process concept with relationship but no BFO does not use process template', () => {
      const mammal = makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal');
      const food = makeConcept('fandaws:class/test-food', 'Food');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
      addRelationship(cat, 'chases', 'fandaws:class/test-food', 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat');
      const graph = makeGraph([mammal, food, cat]);

      // Should NOT produce "Cat is the mammaling of ..." — must use standard template
      expect(describeConcept(cat, graph)).toBe('Cat is a Mammal that chases Food.');
    });
  });

  // ── Article heuristic limitations ─────────────────────

  describe('Article heuristic — known limitations', () => {
    it('says "an University" (vowel letter U, but phonetically "a") — known limitation', () => {
      const university = makeConcept('fandaws:class/6189cbb4-b6dc-56cf-ac11-ea6c4a39df42/university', 'University');
      const oxford = makeConcept('fandaws:class/72b2e3ab-38f0-5870-9e7a-c6f93066ea00/oxford', 'Oxford', 'fandaws:class/6189cbb4-b6dc-56cf-ac11-ea6c4a39df42/university');
      const graph = makeGraph([university, oxford]);

      // Heuristic uses vowel-letter check, not phonetic analysis
      expect(describeConcept(oxford, graph)).toBe('Oxford is an University.');
    });

    it('says "a Hour" (consonant letter H, but phonetically "an") — known limitation', () => {
      const hour = makeConcept('fandaws:class/27b21777-3336-594a-bab0-8020b8d33dbe/hour', 'Hour');
      const minute = makeConcept('fandaws:class/d67f6f7b-3981-51d1-88a5-ff5118706b18/minute', 'Minute', 'fandaws:class/27b21777-3336-594a-bab0-8020b8d33dbe/hour');
      const graph = makeGraph([hour, minute]);

      // Heuristic uses vowel-letter check, not phonetic analysis
      expect(describeConcept(minute, graph)).toBe('Minute is a Hour.');
    });
  });

  // ── Gerund morphology edge cases ────────────────────────

  describe('Gerund morphology', () => {
    it('"ee" ending preserved: Free → freeing', () => {
      const free = makeConcept('fandaws:class/d01d3502-0794-5c1c-b44f-2028acffa5e6/free', 'Free');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
      const liberation = makeConcept('fandaws:class/265e2478-a63f-5f85-b3ff-b67098364c94/liberation', 'Liberation', 'fandaws:class/d01d3502-0794-5c1c-b44f-2028acffa5e6/free');
      markAsProcess(liberation);
      addRelationship(liberation, 'releases', 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
      const graph = makeGraph([free, cat, dog, liberation]);

      expect(describeConcept(liberation, graph)).toBe('Liberation is the freeing of Cat by Dog.');
    });

    it('consonant doubling not handled: Run → runing — known limitation', () => {
      const run = makeConcept('fandaws:class/89b8ed2f-594e-50f6-beae-23fde98ec525/run', 'Run');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
      const sprint = makeConcept('fandaws:class/0ffdbe30-7ad1-5db6-86dc-e02349e86fcc/sprint', 'Sprint', 'fandaws:class/89b8ed2f-594e-50f6-beae-23fde98ec525/run');
      markAsProcess(sprint);
      addRelationship(sprint, 'chases', 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
      const graph = makeGraph([run, cat, dog, sprint]);

      // Known limitation: "run" → "runing" instead of "running"
      expect(describeConcept(sprint, graph)).toBe('Sprint is the runing of Cat by Dog.');
    });
  });

  // ── Extended property combinations ──────────────────────

  describe('Extended property combinations', () => {
    it('4 properties → Oxford comma', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      addProperties(dog, ['fur', 'four legs', 'tail', 'wet nose']);
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe(
        'Dog is an Animal that has fur, four legs, tail, and wet nose.',
      );
    });

    it('process template ignores properties (process takes priority)', () => {
      const hunt = makeConcept('fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt', 'Hunt');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
      const predation = makeConcept('fandaws:class/73765e50-9c16-51b2-8c25-d720762a9127/predation', 'Predation', 'fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt');
      markAsProcess(predation);
      addProperties(predation, ['stealth']);
      addRelationship(predation, 'chases', 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
      const graph = makeGraph([hunt, cat, dog, predation]);

      // Process template takes priority — properties not shown
      expect(describeConcept(predation, graph)).toBe(
        'Predation is the hunting of Cat by Dog.',
      );
    });

    it('relationship object IRI not in graph → uses raw IRI', () => {
      const hunt = makeConcept('fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt', 'Hunt');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
      const predation = makeConcept('fandaws:class/73765e50-9c16-51b2-8c25-d720762a9127/predation', 'Predation', 'fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt');
      markAsProcess(predation);
      addRelationship(predation, 'chases', 'fandaws:class/1ca09e44-44ca-5578-a644-7228fb7e04fe/unknown-prey', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
      const graph = makeGraph([hunt, dog, predation]);

      // Unknown prey IRI used as-is since no concept found to resolve label
      expect(describeConcept(predation, graph)).toBe(
        'Predation is the hunting of fandaws:class/1ca09e44-44ca-5578-a644-7228fb7e04fe/unknown-prey by Dog.',
      );
    });

    it('multiple concepts in graph — resolves correct parent', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const mammal = makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
      const graph = makeGraph([animal, mammal, dog, cat]);

      expect(describeConcept(dog, graph)).toBe('Dog is a Mammal.');
      expect(describeConcept(cat, graph)).toBe('Cat is a Mammal.');
      expect(describeConcept(mammal, graph)).toBe('Mammal is an Animal.');
    });
  });

  // ── Edge cases ─────────────────────────────────────────

  describe('Edge cases', () => {
    it('missing parent in graph → fallback description', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const graph = makeGraph([dog]); // animal not in graph

      expect(describeConcept(dog, graph)).toBe('Dog is a concept.');
    });

    it('missing parent with properties → includes property suffix', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      addProperties(dog, ['fur']);
      const graph = makeGraph([dog]);

      expect(describeConcept(dog, graph)).toBe(
        'Dog is a concept that has fur.',
      );
    });

    it('empty rdfs:subClassOf → no properties, standard template', () => {
      const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      dog['rdfs:subClassOf'] = [];
      const graph = makeGraph([animal, dog]);

      expect(describeConcept(dog, graph)).toBe('Dog is an Animal.');
    });
  });
});
