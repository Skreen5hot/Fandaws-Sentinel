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
    const graph = makeGraph([makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    expect(computeDepth('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', graph)).toBe(0);
  });

  it('returns 1 for a direct child', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    expect(computeDepth('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', graph)).toBe(1);
  });

  it('returns correct depth for deep chain', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', 'Living Thing'),
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing'),
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    expect(computeDepth('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', graph)).toBe(3);
  });

  it('returns 0 for a concept not in the graph', () => {
    const graph = makeGraph([]);
    expect(computeDepth('fandaws:class/8f1b306e-c65d-51b2-8c8a-ab5013f42731/unknown', graph)).toBe(0);
  });

  it('handles cycle guard gracefully', () => {
    // Manually create a cycle (shouldn't happen in practice, but guard exists)
    const a = makeConcept('fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'A', 'fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b');
    const b = makeConcept('fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'B', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a');
    const graph = makeGraph([a, b]);
    // Should not infinite-loop — returns some finite number
    const depth = computeDepth('fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', graph);
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
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    expect(computeChildren('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', graph)).toEqual([]);
  });

  it('returns direct children IRIs', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const children = computeChildren('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', graph);
    expect(children).toHaveLength(2);
    expect(children).toContain('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(children).toContain('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat');
  });

  it('does not include grandchildren', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/75365f2f-01e0-5fd4-b348-3c8a385074e4/poodle', 'Poodle', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'),
    ]);
    const children = computeChildren('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', graph);
    expect(children).toEqual(['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog']);
  });

  it('returns empty array for a concept not in graph', () => {
    const graph = makeGraph([]);
    expect(computeChildren('fandaws:class/8f1b306e-c65d-51b2-8c8a-ab5013f42731/unknown', graph)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// hydrate
// ─────────────────────────────────────────────────────────

describe('hydrate', () => {
  it('maps stored fields to flat view', () => {
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      concept,
    ]);

    const view = hydrate(concept, graph);
    expect(view.id).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(view.label).toBe('Dog');
    expect(view.prefLabel).toBe('dog');
    expect(view.broader).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('computes depth from broader chain', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const concept = graph['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );

    const view = hydrate(concept, graph);
    expect(view.depth).toBe(1);
  });

  it('computes children from graph', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const animal = graph['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );

    const view = hydrate(animal, graph);
    expect(view.children).toHaveLength(2);
    expect(view.children).toContain('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(view.children).toContain('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat');
  });

  it('extracts property restrictions from rdfs:subClassOf', () => {
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
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
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    concept['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'chases',
        'owl:someValuesFrom': 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
        'fandaws:restrictionKind': 'relationship',
      },
    ];
    const graph = makeGraph([concept]);

    const view = hydrate(concept, graph);
    expect(view.relationships).toHaveLength(1);
    expect(view.relationships[0]['owl:onProperty']).toBe('chases');
  });

  it('separates properties from relationships in rdfs:subClassOf', () => {
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    concept['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:prop/fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
      },
      {
        '@id': 'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'chases',
        'owl:someValuesFrom': 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
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

// ─────────────────────────────────────────────────────────
// SUP-05: Mixed restriction types in subClassOf
// ─────────────────────────────────────────────────────────

describe('hydrate — mixed restriction types (SUP-05)', () => {
  it('correctly separates property restrictions, relationship restrictions, and BFO entries', () => {
    const concept = makeConcept('fandaws:class/b331a181-eb54-5dbe-a2c6-27f0a69fa219/golden-retriever', 'Golden Retriever');
    concept['rdfs:subClassOf'] = [
      'cco:Organism', // BFO/CCO class — bare string
      {
        '@id': 'fandaws:restriction/b5e25617-aad3-5533-8814-7d964d0a6197/gr--friendly',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'cco:is_bearer_of',
        'owl:someValuesFrom': 'fandaws:disposition/friendly',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/b331a181-eb54-5dbe-a2c6-27f0a69fa219/golden-retriever',
        'fandaws:scope': 'concept-specific',
      },
      {
        '@id': 'fandaws:restriction/71a5fd01-62bf-5ea1-af07-937b6ccbc440/gr--golden-coat',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'cco:has_quality',
        'owl:hasValue': 'fandaws:quality/golden-coat',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/b331a181-eb54-5dbe-a2c6-27f0a69fa219/golden-retriever',
        'fandaws:scope': 'concept-specific',
      },
      {
        '@id': 'fandaws:rel/6bc6c5f0-80c7-56f8-a51e-b3221f033fcc/gr-chases-cat',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'chases',
        'owl:someValuesFrom': 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
        'fandaws:restrictionKind': 'relationship',
        'fandaws:attachedTo': 'fandaws:class/b331a181-eb54-5dbe-a2c6-27f0a69fa219/golden-retriever',
      },
    ];
    const graph = makeGraph([concept]);
    const view = hydrate(concept, graph);

    // 2 property restrictions
    expect(view.properties).toHaveLength(2);
    expect(view.properties[0]['owl:onProperty']).toBe('cco:is_bearer_of');
    expect(view.properties[1]['owl:hasValue']).toBe('fandaws:quality/golden-coat');

    // 1 relationship restriction
    expect(view.relationships).toHaveLength(1);
    expect(view.relationships[0]['owl:onProperty']).toBe('chases');

    // All 4 entries preserved in raw subClassOf
    expect(view.subClassOf).toHaveLength(4);

    // BFO class is in subClassOf but not in properties or relationships
    expect(view.subClassOf[0]).toBe('cco:Organism');
  });

  it('handles empty subClassOf array', () => {
    const concept = makeConcept('fandaws:class/c5d09a81-e9b7-5f1b-81d4-dbd3011d5c9d/thing', 'Thing');
    concept['rdfs:subClassOf'] = [];
    const graph = makeGraph([concept]);
    const view = hydrate(concept, graph);

    expect(view.properties).toHaveLength(0);
    expect(view.relationships).toHaveLength(0);
    expect(view.subClassOf).toHaveLength(0);
  });

  it('handles subClassOf with only BFO entries (no restrictions)', () => {
    const concept = makeConcept('fandaws:class/ad2127e8-6cf4-5830-a222-1799a126cc9d/organism', 'Organism');
    concept['rdfs:subClassOf'] = ['bfo:Entity', 'cco:Organism'];
    const graph = makeGraph([concept]);
    const view = hydrate(concept, graph);

    expect(view.properties).toHaveLength(0);
    expect(view.relationships).toHaveLength(0);
    expect(view.subClassOf).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// SUP-06: Round-trip fidelity with restrictions
// ─────────────────────────────────────────────────────────

describe('hydrate/dehydrate — round-trip fidelity with restrictions (SUP-06)', () => {
  it('restrictions survive hydrate → dehydrate → hydrate', () => {
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    concept['skos:altLabel'] = ['pupper', 'doggo'];
    concept['skos:definition'] = 'A domesticated canine';
    concept['rdfs:subClassOf'] = [
      'cco:Organism',
      {
        '@id': 'fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        'fandaws:scope': 'concept-specific',
      },
      {
        '@id': 'fandaws:rel/01e4b4ee-d083-5fdf-b94e-2d7ec525e901/dog-chases-cat',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'chases',
        'owl:someValuesFrom': 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
        'fandaws:restrictionKind': 'relationship',
        'fandaws:attachedTo': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      },
    ];

    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      concept,
    ]);

    const view1 = hydrate(concept, graph);
    const canonical = dehydrate(view1);
    const view2 = hydrate(canonical, graph);

    // All fields match after round-trip
    expect(view2.id).toBe(view1.id);
    expect(view2.label).toBe(view1.label);
    expect(view2.prefLabel).toBe(view1.prefLabel);
    expect(view2.broader).toBe(view1.broader);
    expect(view2.definition).toBe(view1.definition);
    expect(view2.altLabel).toEqual(view1.altLabel);
    expect(view2.wasDerivedFrom).toEqual(view1.wasDerivedFrom);

    // Restrictions preserved
    expect(view2.properties).toHaveLength(1);
    expect(view2.properties[0]['@id']).toBe('fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur');
    expect(view2.relationships).toHaveLength(1);
    expect(view2.relationships[0]['@id']).toBe('fandaws:rel/01e4b4ee-d083-5fdf-b94e-2d7ec525e901/dog-chases-cat');

    // BFO entry preserved
    expect(view2.subClassOf[0]).toBe('cco:Organism');
  });

  it('computed fields are not duplicated on round-trip', () => {
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const graph = makeGraph([concept]);

    const view = hydrate(concept, graph);
    const canonical = dehydrate(view);

    // Computed fields must not leak into canonical form
    expect(canonical.depth).toBeUndefined();
    expect(canonical.children).toBeUndefined();
    expect(canonical.properties).toBeUndefined();
    expect(canonical.relationships).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// SUP-04: External JSON-LD forms
// ─────────────────────────────────────────────────────────

describe('hydrate — external JSON-LD forms (SUP-04)', () => {
  it('SUP-04a: hydrates language-tagged prefLabel, label, and definition', () => {
    const concept = {
      '@id': 'ext:concept/dog',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': { '@value': 'Dog', '@language': 'en' },
      'skos:prefLabel': { '@value': 'dog', '@language': 'en' },
      'skos:definition': { '@value': 'A domesticated carnivore', '@language': 'en' },
      'skos:broader': null,
      'dcterms:created': '2025-01-01T00:00:00Z',
      'rdfs:subClassOf': [],
    };
    const graph = makeGraph([concept]);
    const view = hydrate(concept, graph);

    expect(view.prefLabel).toBe('dog');
    expect(view.label).toBe('Dog');
    expect(view.definition).toBe('A domesticated carnivore');
  });

  it('SUP-04b: hydrates when subClassOf is absent (not null, not [])', () => {
    const concept = {
      '@id': 'ext:concept/thing',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': 'Thing',
      'skos:prefLabel': 'thing',
      'skos:broader': null,
      'dcterms:created': '2025-01-01T00:00:00Z',
      // rdfs:subClassOf completely absent
    };
    const graph = makeGraph([concept]);
    const view = hydrate(concept, graph);

    expect(view.subClassOf).toEqual([]);
    expect(view.properties).toEqual([]);
    expect(view.relationships).toEqual([]);
  });

  it('SUP-04c: plain string values pass through unchanged', () => {
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const graph = makeGraph([concept]);
    const view = hydrate(concept, graph);

    expect(view.prefLabel).toBe('dog');
    expect(view.label).toBe('Dog');
  });

  it('SUP-04d: scalar altLabel is wrapped to array', () => {
    const concept = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    concept['skos:altLabel'] = 'pupper'; // scalar, not array
    const graph = makeGraph([concept]);
    const view = hydrate(concept, graph);

    expect(view.altLabel).toEqual(['pupper']);
    expect(Array.isArray(view.altLabel)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// dehydrate
// ─────────────────────────────────────────────────────────

describe('dehydrate', () => {
  it('produces canonical output from view', () => {
    const view = {
      id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      type: ['owl:Class', 'skos:Concept'],
      label: 'Dog',
      prefLabel: 'dog',
      broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
      definition: 'A domesticated canine.',
      created: '2025-01-01T00:00:00.000Z',
      modified: null,
      wasDerivedFrom: [],
      altLabel: [],
      inScheme: null,
      subClassOf: [],
      // Computed fields should be stripped
      depth: 1,
      children: ['fandaws:class/75365f2f-01e0-5fd4-b348-3c8a385074e4/poodle'],
      properties: [{ '@id': 'fandaws:prop/fur' }],
      relationships: [{ '@id': 'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1' }],
    };

    const canonical = dehydrate(view);
    expect(canonical['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(canonical['@type']).toEqual(['owl:Class', 'skos:Concept']);
    expect(canonical['rdfs:label']).toBe('Dog');
    expect(canonical['skos:prefLabel']).toBe('dog');
    expect(canonical['skos:broader']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(canonical['skos:definition']).toBe('A domesticated canine.');

    // Computed fields must NOT be present
    expect(canonical.depth).toBeUndefined();
    expect(canonical.children).toBeUndefined();
    expect(canonical.properties).toBeUndefined();
    expect(canonical.relationships).toBeUndefined();
  });

  it('round-trips with hydrate', () => {
    const original = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
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
