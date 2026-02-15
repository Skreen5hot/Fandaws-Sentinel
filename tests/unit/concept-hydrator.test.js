/**
 * ConceptHydrator — unit tests.
 *
 * Tests hydrate/dehydrate/computeDepth/computeChildren.
 *
 * v2.1: Standard OWL/SKOS/PROV vocabulary.
 */

import { describe, it, expect } from '@jest/globals';
import {
  hydrate,
  dehydrate,
  computeDepth,
  computeChildren,
} from '../../src/core/hydrator/concept-hydrator.js';
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

// ─────────────────────────────────────────────────────────
// computeDepth
// ─────────────────────────────────────────────────────────

describe('computeDepth', () => {
  it('returns 0 for a root concept', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/animal', 'Animal')]);
    expect(computeDepth('fandaws:concept/animal', graph)).toBe(0);
  });

  it('returns 1 for a direct child', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    expect(computeDepth('fandaws:concept/dog', graph)).toBe(1);
  });

  it('returns correct depth for deep chain', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/living-thing', 'Living Thing'),
      makeConcept('fandaws:concept/animal', 'Animal', 'fandaws:concept/living-thing'),
      makeConcept('fandaws:concept/mammal', 'Mammal', 'fandaws:concept/animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    expect(computeDepth('fandaws:concept/dog', graph)).toBe(3);
  });

  it('returns 0 for a concept not in the graph', () => {
    const graph = makeGraph([]);
    expect(computeDepth('fandaws:concept/unknown', graph)).toBe(0);
  });

  it('handles cycle guard gracefully', () => {
    // Manually create a cycle (shouldn't happen in practice, but guard exists)
    const a = makeConcept('fandaws:concept/a', 'A', 'fandaws:concept/b');
    const b = makeConcept('fandaws:concept/b', 'B', 'fandaws:concept/a');
    const graph = makeGraph([a, b]);
    // Should not infinite-loop — returns some finite number
    const depth = computeDepth('fandaws:concept/a', graph);
    expect(depth).toBeGreaterThanOrEqual(0);
    expect(depth).toBeLessThan(100);
  });
});

// ─────────────────────────────────────────────────────────
// computeChildren
// ─────────────────────────────────────────────────────────

describe('computeChildren', () => {
  it('returns empty array for a leaf concept', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    expect(computeChildren('fandaws:concept/dog', graph)).toEqual([]);
  });

  it('returns direct children IRIs', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      makeConcept('fandaws:concept/cat', 'Cat', 'fandaws:concept/animal'),
    ]);
    const children = computeChildren('fandaws:concept/animal', graph);
    expect(children).toHaveLength(2);
    expect(children).toContain('fandaws:concept/dog');
    expect(children).toContain('fandaws:concept/cat');
  });

  it('does not include grandchildren', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      makeConcept('fandaws:concept/poodle', 'Poodle', 'fandaws:concept/dog'),
    ]);
    const children = computeChildren('fandaws:concept/animal', graph);
    expect(children).toEqual(['fandaws:concept/dog']);
  });

  it('returns empty array for a concept not in graph', () => {
    const graph = makeGraph([]);
    expect(computeChildren('fandaws:concept/unknown', graph)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// hydrate
// ─────────────────────────────────────────────────────────

describe('hydrate', () => {
  it('maps stored fields to flat view', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      concept,
    ]);

    const view = hydrate(concept, graph);
    expect(view.id).toBe('fandaws:concept/dog');
    expect(view.label).toBe('Dog');
    expect(view.prefLabel).toBe('dog');
    expect(view.broader).toBe('fandaws:concept/animal');
  });

  it('computes depth from broader chain', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const concept = graph['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );

    const view = hydrate(concept, graph);
    expect(view.depth).toBe(1);
  });

  it('computes children from graph', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      makeConcept('fandaws:concept/cat', 'Cat', 'fandaws:concept/animal'),
    ]);
    const animal = graph['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/animal',
    );

    const view = hydrate(animal, graph);
    expect(view.children).toHaveLength(2);
    expect(view.children).toContain('fandaws:concept/dog');
    expect(view.children).toContain('fandaws:concept/cat');
  });

  it('extracts property restrictions from rdfs:subClassOf', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    concept['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:prop/fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
      },
    ];
    const graph = makeGraph([concept]);

    const view = hydrate(concept, graph);
    expect(view.properties).toHaveLength(1);
    expect(view.properties[0]['owl:onProperty']).toBe('fur');
  });

  it('extracts relationship restrictions from rdfs:subClassOf', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    concept['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:rel/1',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'chases',
        'owl:someValuesFrom': 'fandaws:concept/cat',
        'fandaws:restrictionKind': 'relationship',
      },
    ];
    const graph = makeGraph([concept]);

    const view = hydrate(concept, graph);
    expect(view.relationships).toHaveLength(1);
    expect(view.relationships[0]['owl:onProperty']).toBe('chases');
  });

  it('separates properties from relationships in rdfs:subClassOf', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    concept['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:prop/fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
      },
      {
        '@id': 'fandaws:rel/1',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'chases',
        'owl:someValuesFrom': 'fandaws:concept/cat',
        'fandaws:restrictionKind': 'relationship',
      },
      'bfo:Entity', // BFO IRI — not a restriction
    ];
    const graph = makeGraph([concept]);

    const view = hydrate(concept, graph);
    expect(view.properties).toHaveLength(1);
    expect(view.relationships).toHaveLength(1);
    expect(view.subClassOf).toHaveLength(3); // all entries preserved
  });
});

// ─────────────────────────────────────────────────────────
// dehydrate
// ─────────────────────────────────────────────────────────

describe('dehydrate', () => {
  it('produces canonical output from view', () => {
    const view = {
      id: 'fandaws:concept/dog',
      type: ['owl:Class', 'skos:Concept'],
      label: 'Dog',
      prefLabel: 'dog',
      broader: 'fandaws:concept/animal',
      definition: 'A domesticated canine.',
      created: '2025-01-01T00:00:00.000Z',
      modified: null,
      wasDerivedFrom: [],
      altLabel: [],
      inScheme: null,
      subClassOf: [],
      // Computed fields should be stripped
      depth: 1,
      children: ['fandaws:concept/poodle'],
      properties: [{ '@id': 'fandaws:prop/fur' }],
      relationships: [{ '@id': 'fandaws:rel/1' }],
    };

    const canonical = dehydrate(view);
    expect(canonical['@id']).toBe('fandaws:concept/dog');
    expect(canonical['@type']).toEqual(['owl:Class', 'skos:Concept']);
    expect(canonical['rdfs:label']).toBe('Dog');
    expect(canonical['skos:prefLabel']).toBe('dog');
    expect(canonical['skos:broader']).toBe('fandaws:concept/animal');
    expect(canonical['skos:definition']).toBe('A domesticated canine.');

    // Computed fields must NOT be present
    expect(canonical.depth).toBeUndefined();
    expect(canonical.children).toBeUndefined();
    expect(canonical.properties).toBeUndefined();
    expect(canonical.relationships).toBeUndefined();
  });

  it('round-trips with hydrate', () => {
    const original = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      original,
    ]);

    const view = hydrate(original, graph);
    const restored = dehydrate(view);

    expect(restored['@id']).toBe(original['@id']);
    expect(restored['@type']).toEqual(original['@type']);
    expect(restored['rdfs:label']).toBe(original['rdfs:label']);
    expect(restored['skos:prefLabel']).toBe(original['skos:prefLabel']);
    expect(restored['skos:broader']).toBe(original['skos:broader']);
  });
});
