/**
 * Sanity Check — unit tests.
 *
 * v2.1: Uses skos:broader instead of fandaws:parent.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildParentIndex,
  detectCycle,
  checkMutationForCycles,
} from '../../src/core/validator/sanity-check.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createGraphMutation } from '../../src/types/graph-mutation.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeMutation(additions = [], modifications = []) {
  return createGraphMutation({ additions, modifications, reason: 'test' });
}

function makeConcept(id, label, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
}

// ─────────────────────────────────────────────────────────
// buildParentIndex
// ─────────────────────────────────────────────────────────

describe('buildParentIndex', () => {
  it('returns empty map for empty graph', () => {
    const graph = makeGraph([]);
    const index = buildParentIndex(graph);
    expect(index.size).toBe(0);
  });

  it('maps root concepts to null', () => {
    const graph = makeGraph([makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    const index = buildParentIndex(graph);
    expect(index.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal')).toBeNull();
  });

  it('maps child concepts to their parent IRI', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const index = buildParentIndex(graph);
    expect(index.get('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(index.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal')).toBeNull();
  });

  it('handles graph with missing concepts array', () => {
    const graph = { '@type': 'fandaws:KnowledgeGraph' };
    const index = buildParentIndex(graph);
    expect(index.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
// detectCycle
// ─────────────────────────────────────────────────────────

describe('detectCycle', () => {
  it('detects self-reference', () => {
    const index = new Map([['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', null]]);
    const result = detectCycle('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', index);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('circularHierarchy');
  });

  it('detects 2-node cycle (A→B→A)', () => {
    const index = new Map([
      ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'],
      ['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', null],
    ]);
    const result = detectCycle('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', index);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('circularHierarchy');
  });

  it('detects deep cycle (A→B→C→A)', () => {
    const index = new Map([
      ['fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b'],
      ['fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c'],
      ['fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c', null],
    ]);
    const result = detectCycle('fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', index);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('circularHierarchy');
  });

  it('returns null for valid parent assignment', () => {
    const index = new Map([
      ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', null],
      ['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'],
    ]);
    const result = detectCycle('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', index);
    expect(result).toBeNull();
  });

  it('returns null when parent is not in the index', () => {
    const index = new Map();
    const result = detectCycle('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', index);
    expect(result).toBeNull();
  });

  it('handles pre-existing cycle in index without infinite loop', () => {
    const index = new Map([
      ['fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b'],
      ['fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a'],
    ]);
    const result = detectCycle('fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', index);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// checkMutationForCycles
// ─────────────────────────────────────────────────────────

describe('checkMutationForCycles', () => {
  it('returns empty array for mutation with no parent edges', () => {
    const graph = makeGraph([makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    const mutation = makeMutation([makeConcept('fandaws:class/c5d09a81-e9b7-5f1b-81d4-dbd3011d5c9d/thing', 'Thing')]);
    expect(checkMutationForCycles(mutation, graph)).toEqual([]);
  });

  it('returns empty array for valid parent addition', () => {
    const graph = makeGraph([makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    const mutation = makeMutation([
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    expect(checkMutationForCycles(mutation, graph)).toEqual([]);
  });

  it('detects cycle in additions against existing graph', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    const mutation = makeMutation([
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'),
    ]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toBe('circularHierarchy');
  });

  it('detects cycle via parent modification', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    const mutation = makeMutation([], [
      {
        '@id': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
        'skos:broader': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      },
    ]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toBe('circularHierarchy');
  });

  it('detects cycle within mutation additions only (no graph state)', () => {
    const graph = makeGraph([]);
    const a = makeConcept('fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'A', 'fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b');
    const b = makeConcept('fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'B', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a');
    const mutation = makeMutation([a, b]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('handles stakeholder scenario: "dog is mammal" then "mammal is dog"', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    const mutation = makeMutation([], [
      {
        '@id': 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal',
        'skos:broader': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      },
    ]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toBe('circularHierarchy');
    expect(violations[0].conceptIri).toBe('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
    expect(violations[0].proposedParentIri).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });
});
