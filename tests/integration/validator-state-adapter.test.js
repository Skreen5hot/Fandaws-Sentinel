/**
 * Validator + StateAdapter — integration tests.
 *
 * Tests the validate → apply pipeline: validate a mutation,
 * then apply it via InMemoryStateAdapter if valid, or verify
 * the graph remains unchanged if invalid.
 *
 * v2.1: Uses standard OWL/SKOS/PROV vocabulary.
 *        Properties and relationships are owl:Restriction in rdfs:subClassOf.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { validate } from '../../src/core/validator/validator.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createGraphMutation } from '../../src/types/graph-mutation.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const GRAPH_ID = 'fandaws:graph/test';

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: GRAPH_ID, concepts });
}

function makeMutation({
  additions = [],
  modifications = [],
  deletions = [],
  merges = [],
} = {}) {
  return createGraphMutation({
    additions,
    modifications,
    deletions,
    merges,
    reason: 'test',
  });
}

function makeConcept(id, label, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
}

function makeProperty(id, propertyIri, attachedTo) {
  return createProperty({ id, propertyIri, attachedTo });
}

function makeRelationship(id, verbIri, subject, object) {
  return createRelationship({ id, verbIri, subject, object });
}

// ─────────────────────────────────────────────────────────
// Integration: validate → apply pipeline
// ─────────────────────────────────────────────────────────

describe('Validator + StateAdapter pipeline', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
  });

  it('applies valid mutation after successful validation', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(true);

    // Apply the mutation
    const updated = adapter.applyMutation(GRAPH_ID, mutation);
    expect(updated['fandaws:concepts']).toHaveLength(2);
  });

  it('rejects invalid mutation and leaves graph unchanged', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    // Create a cycle: mammal.broader = dog
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:concept/mammal',
          'skos:broader': 'fandaws:concept/dog',
        },
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(false);

    // Do NOT apply — graph should remain unchanged
    const unchanged = adapter.loadGraph(GRAPH_ID);
    const mammal = unchanged['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/mammal',
    );
    expect(mammal['skos:broader']).toBeNull();
  });

  it('validates then applies a concept + property addition', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
        makeProperty('fandaws:prop/fur', 'fur', 'fandaws:concept/dog'),
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(true);

    const updated = adapter.applyMutation(GRAPH_ID, mutation);
    const dog = updated['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(dog).toBeDefined();
    // Property is embedded as restriction in rdfs:subClassOf
    const propRestrictions = dog['rdfs:subClassOf'].filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(propRestrictions.some((r) => r['@id'] === 'fandaws:prop/fur')).toBe(true);
  });

  it('validates then applies a relationship addition', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog'),
      makeConcept('fandaws:concept/cat', 'Cat'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/1',
          'chases',
          'fandaws:concept/dog',
          'fandaws:concept/cat',
        ),
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(true);

    const updated = adapter.applyMutation(GRAPH_ID, mutation);
    // Relationship is embedded in dog's rdfs:subClassOf
    const dog = updated['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    const relRestrictions = dog['rdfs:subClassOf'].filter(
      (e) => e['fandaws:restrictionKind'] === 'relationship',
    );
    expect(relRestrictions).toHaveLength(1);
  });

  it('rejects compound statement and does not apply', () => {
    const graph = makeGraph([]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog'),
        makeConcept('fandaws:concept/planet', 'Planet'),
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(false);

    // Graph untouched
    const unchanged = adapter.loadGraph(GRAPH_ID);
    expect(unchanged['fandaws:concepts']).toHaveLength(0);
  });

  it('indices are correct after validated mutation is applied', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/mammal', 'Mammal', 'fandaws:concept/animal'),
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(true);

    adapter.applyMutation(GRAPH_ID, mutation);

    const indices = adapter.getIndices(GRAPH_ID);
    // dog → mammal → animal
    expect(indices.iriToParent.get('fandaws:concept/dog')).toBe(
      'fandaws:concept/mammal',
    );
    expect(indices.iriToParent.get('fandaws:concept/mammal')).toBe(
      'fandaws:concept/animal',
    );
    // Children
    expect(indices.iriToChildren.get('fandaws:concept/animal')?.has('fandaws:concept/mammal')).toBe(true);
    expect(indices.iriToChildren.get('fandaws:concept/mammal')?.has('fandaws:concept/dog')).toBe(true);
  });

  it('full pipeline: validate → apply → verify integrity', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
        makeProperty('fandaws:prop/fur', 'fur', 'fandaws:concept/dog'),
      ],
    });

    // Step 1: Validate
    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const validationResult = validate(mutation, currentGraph);
    expect(validationResult['fandaws:valid']).toBe(true);

    // Step 2: Apply
    adapter.applyMutation(GRAPH_ID, mutation);

    // Step 3: Verify integrity (returns array of ghost pointers)
    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts).toHaveLength(0);
  });

  it('validates merge then applies it', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog'),
      makeConcept('fandaws:concept/canine', 'Canine'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:concept/canine',
          'fandaws:target': 'fandaws:concept/dog',
        },
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(true);

    const updated = adapter.applyMutation(GRAPH_ID, mutation);
    // After merge: canine is gone, dog has wasDerivedFrom
    const canine = updated['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/canine',
    );
    expect(canine).toBeUndefined();
    const dog = updated['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(dog['prov:wasDerivedFrom']).toContain('fandaws:concept/canine');
  });

  it('rejects self-merge and does not apply', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:concept/dog',
          'fandaws:target': 'fandaws:concept/dog',
        },
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(false);

    // Graph untouched
    const unchanged = adapter.loadGraph(GRAPH_ID);
    expect(unchanged['fandaws:concepts']).toHaveLength(1);
  });

  it('validates deletion warning but allows apply', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      deletions: ['fandaws:concept/animal'],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    // Has orphanRisk warning
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'orphanRisk'),
    ).toBe(true);

    // Caller decides to apply anyway (warnings are advisory)
    const updated = adapter.applyMutation(GRAPH_ID, mutation);
    const animal = updated['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/animal',
    );
    expect(animal).toBeUndefined();
  });

  it('governance block prevents application', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under review.',
      },
    };
    const graph = makeGraph([existing]);
    adapter.saveGraph(GRAPH_ID, graph);

    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      ],
    });

    const currentGraph = adapter.loadGraph(GRAPH_ID);
    const result = validate(mutation, currentGraph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'governanceBlock',
      ),
    ).toBe(true);
  });
});
