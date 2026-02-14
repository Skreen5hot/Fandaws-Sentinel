/**
 * Sanity Check — unit tests.
 *
 * Covers: buildParentIndex, detectCycle (self-ref, 2-node, deep chain),
 * checkMutationForCycles (additions, modifications, composite index).
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

function makeConcept(id, label, parent = null) {
  return createConcept({
    id,
    displayLabel: label,
    canonicalLabel: label.toLowerCase(),
    parent,
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
    const graph = makeGraph([makeConcept('fandaws:concept/animal', 'Animal')]);
    const index = buildParentIndex(graph);
    expect(index.get('fandaws:concept/animal')).toBeNull();
  });

  it('maps child concepts to their parent IRI', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const index = buildParentIndex(graph);
    expect(index.get('fandaws:concept/dog')).toBe('fandaws:concept/animal');
    expect(index.get('fandaws:concept/animal')).toBeNull();
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
    const index = new Map([['fandaws:concept/dog', null]]);
    const result = detectCycle(
      'fandaws:concept/dog',
      'fandaws:concept/dog',
      index,
    );
    expect(result).not.toBeNull();
    expect(result.reason).toBe('circularHierarchy');
    expect(result.conceptIri).toBe('fandaws:concept/dog');
  });

  it('detects 2-node cycle (A→B→A)', () => {
    const index = new Map([
      ['fandaws:concept/dog', 'fandaws:concept/mammal'],
      ['fandaws:concept/mammal', null],
    ]);
    // Proposing mammal.parent = dog would create: dog→mammal→dog
    const result = detectCycle(
      'fandaws:concept/mammal',
      'fandaws:concept/dog',
      index,
    );
    expect(result).not.toBeNull();
    expect(result.reason).toBe('circularHierarchy');
  });

  it('detects deep cycle (A→B→C→A)', () => {
    const index = new Map([
      ['fandaws:concept/a', 'fandaws:concept/b'],
      ['fandaws:concept/b', 'fandaws:concept/c'],
      ['fandaws:concept/c', null],
    ]);
    // Proposing c.parent = a would create: a→b→c→a
    const result = detectCycle(
      'fandaws:concept/c',
      'fandaws:concept/a',
      index,
    );
    expect(result).not.toBeNull();
    expect(result.reason).toBe('circularHierarchy');
  });

  it('returns null for valid parent assignment', () => {
    const index = new Map([
      ['fandaws:concept/animal', null],
      ['fandaws:concept/mammal', 'fandaws:concept/animal'],
    ]);
    const result = detectCycle(
      'fandaws:concept/dog',
      'fandaws:concept/mammal',
      index,
    );
    expect(result).toBeNull();
  });

  it('returns null when parent is not in the index', () => {
    const index = new Map();
    const result = detectCycle(
      'fandaws:concept/dog',
      'fandaws:concept/animal',
      index,
    );
    expect(result).toBeNull();
  });

  it('handles pre-existing cycle in index without infinite loop', () => {
    // Corrupt index: a→b→a (pre-existing cycle)
    const index = new Map([
      ['fandaws:concept/a', 'fandaws:concept/b'],
      ['fandaws:concept/b', 'fandaws:concept/a'],
    ]);
    // Checking something unrelated should terminate
    const result = detectCycle(
      'fandaws:concept/c',
      'fandaws:concept/a',
      index,
    );
    // No cycle involving c, so null
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// checkMutationForCycles
// ─────────────────────────────────────────────────────────

describe('checkMutationForCycles', () => {
  it('returns empty array for mutation with no parent edges', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/animal', 'Animal')]);
    const mutation = makeMutation([
      makeConcept('fandaws:concept/thing', 'Thing'),
    ]);
    expect(checkMutationForCycles(mutation, graph)).toEqual([]);
  });

  it('returns empty array for valid parent addition', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/animal', 'Animal')]);
    const mutation = makeMutation([
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    expect(checkMutationForCycles(mutation, graph)).toEqual([]);
  });

  it('detects cycle in additions against existing graph', () => {
    // Graph: dog → mammal
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    // Mutation: mammal → dog (creates cycle)
    const mutation = makeMutation([
      makeConcept(
        'fandaws:concept/mammal',
        'Mammal',
        'fandaws:concept/dog',
      ),
    ]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toBe('circularHierarchy');
  });

  it('detects cycle via parent modification', () => {
    // Graph: dog → mammal → animal
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept(
        'fandaws:concept/mammal',
        'Mammal',
        'fandaws:concept/animal',
      ),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    // Modification: animal.parent = dog (creates cycle)
    const mutation = makeMutation([], [
      {
        '@id': 'fandaws:concept/animal',
        'fandaws:parent': 'fandaws:concept/dog',
      },
    ]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toBe('circularHierarchy');
  });

  it('detects cycle within mutation additions only (no graph state)', () => {
    // Batch adding: a→b and b→a
    const graph = makeGraph([]);
    const a = makeConcept('fandaws:concept/a', 'A', 'fandaws:concept/b');
    const b = makeConcept('fandaws:concept/b', 'B', 'fandaws:concept/a');
    const mutation = makeMutation([a, b]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('handles stakeholder scenario: "dog is mammal" then "mammal is dog"', () => {
    // After "A dog is a mammal": graph has dog.parent = mammal
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    // "A mammal is a dog" → mutation: mammal.parent = dog
    const mutation = makeMutation([], [
      {
        '@id': 'fandaws:concept/mammal',
        'fandaws:parent': 'fandaws:concept/dog',
      },
    ]);
    const violations = checkMutationForCycles(mutation, graph);
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toBe('circularHierarchy');
    expect(violations[0].conceptIri).toBe('fandaws:concept/mammal');
    expect(violations[0].proposedParentIri).toBe('fandaws:concept/dog');
  });
});
