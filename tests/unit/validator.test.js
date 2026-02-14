/**
 * Validator Orchestrator — unit tests.
 *
 * Covers: validate() orchestration, all violation types,
 * multi-violation collection, pure function behavior,
 * relationship basics, modifications, deletions, merges,
 * governance integration.
 */

import { describe, it, expect } from '@jest/globals';
import { validate } from '../../src/core/validator/validator.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createGraphMutation } from '../../src/types/graph-mutation.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeGraph(concepts = [], relationships = []) {
  return createKnowledgeGraph({
    id: 'fandaws:graph/test',
    concepts,
    relationships,
  });
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

function makeConcept(id, label, parent = null) {
  return createConcept({
    id,
    displayLabel: label,
    canonicalLabel: label.toLowerCase(),
    parent,
  });
}

function makeProperty(id, label, attachedTo) {
  return createProperty({ id, label, attachedTo });
}

function makeRelationship(id, verb, subject, object) {
  return createRelationship({ id, verb, subject, object });
}

// ─────────────────────────────────────────────────────────
// Basic validation
// ─────────────────────────────────────────────────────────

describe('validate — basic', () => {
  it('returns valid=true for empty mutation', () => {
    const graph = makeGraph([]);
    const mutation = makeMutation();
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(true);
    expect(result['fandaws:violations']).toEqual([]);
  });

  it('returns a ValidationResult JSON-LD node', () => {
    const graph = makeGraph([]);
    const mutation = makeMutation();
    const result = validate(mutation, graph);
    expect(result['@type']).toBe('fandaws:ValidationResult');
    expect(result).toHaveProperty('fandaws:valid');
    expect(result).toHaveProperty('fandaws:violations');
  });

  it('is a pure function (does not mutate graph)', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/animal', 'Animal')]);
    const snapshot = JSON.stringify(graph);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      ],
    });
    validate(mutation, graph);
    expect(JSON.stringify(graph)).toBe(snapshot);
  });

  it('is a pure function (does not mutate mutation)', () => {
    const mutation = makeMutation({
      additions: [makeConcept('fandaws:concept/dog', 'Dog')],
    });
    const snapshot = JSON.stringify(mutation);
    const graph = makeGraph([]);
    validate(mutation, graph);
    expect(JSON.stringify(mutation)).toBe(snapshot);
  });
});

// ─────────────────────────────────────────────────────────
// Compound statement rejection
// ─────────────────────────────────────────────────────────

describe('validate — compound statement', () => {
  it('rejects multiple unrelated concepts', () => {
    const graph = makeGraph([]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog'),
        makeConcept('fandaws:concept/planet', 'Planet'),
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'compoundStatement'),
    ).toBe(true);
  });

  it('accepts a parent→child chain', () => {
    const graph = makeGraph([]);
    const mutation = makeMutation({
      additions: [
        { ...makeConcept('fandaws:concept/animal', 'Animal'), 'fandaws:allowRoot': true },
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      ],
    });
    const result = validate(mutation, graph);
    // Should not have compoundStatement violation
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'compoundStatement'),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Structural grounding
// ─────────────────────────────────────────────────────────

describe('validate — structural grounding', () => {
  it('rejects ungrounded concept', () => {
    const graph = makeGraph([]);
    const mutation = makeMutation({
      additions: [makeConcept('fandaws:concept/dog', 'Dog')],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'structuralGroundingError',
      ),
    ).toBe(true);
  });

  it('accepts concept with valid parent in graph', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/animal', 'Animal')]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      ],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'structuralGroundingError',
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Cycle detection
// ─────────────────────────────────────────────────────────

describe('validate — cycle detection', () => {
  it('rejects mutation that creates a cycle', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:concept/mammal',
          'fandaws:parent': 'fandaws:concept/dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'circularHierarchy',
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Relationship basics
// ─────────────────────────────────────────────────────────

describe('validate — relationship checks', () => {
  it('rejects relationship with missing subject', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/1',
          'chases',
          'fandaws:concept/nonexistent',
          'fandaws:concept/dog',
        ),
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'danglingReference',
      ),
    ).toBe(true);
  });

  it('rejects relationship with missing object', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/1',
          'chases',
          'fandaws:concept/dog',
          'fandaws:concept/nonexistent',
        ),
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
  });

  it('rejects duplicate relationship tuple', () => {
    const existingRel = makeRelationship(
      'fandaws:rel/1',
      'chases',
      'fandaws:concept/dog',
      'fandaws:concept/cat',
    );
    const graph = makeGraph(
      [
        makeConcept('fandaws:concept/dog', 'Dog'),
        makeConcept('fandaws:concept/cat', 'Cat'),
      ],
      [existingRel],
    );
    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/2',
          'chases',
          'fandaws:concept/dog',
          'fandaws:concept/cat',
        ),
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'duplicateRelationship',
      ),
    ).toBe(true);
  });

  it('accepts valid relationship', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog'),
      makeConcept('fandaws:concept/cat', 'Cat'),
    ]);
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
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) =>
          v.reason === 'danglingReference' ||
          v.reason === 'duplicateRelationship',
      ),
    ).toBe(false);
  });

  it('accepts relationship where subject is in mutation additions', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/cat', 'Cat')]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/cat'),
        makeRelationship(
          'fandaws:rel/1',
          'chases',
          'fandaws:concept/dog',
          'fandaws:concept/cat',
        ),
      ],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'danglingReference',
      ),
    ).toBe(false);
  });

  it('rejects relationship with no subject or object', () => {
    const graph = makeGraph([]);
    const rel = {
      '@id': 'fandaws:rel/1',
      '@type': 'fandaws:Relationship',
      'fandaws:verb': 'chases',
    };
    const mutation = makeMutation({ additions: [rel] });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'incompleteRelationship',
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Modification checks
// ─────────────────────────────────────────────────────────

describe('validate — modification checks', () => {
  it('rejects modification of non-existent target', () => {
    const graph = makeGraph([]);
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:concept/nonexistent',
          'fandaws:displayLabel': 'New Label',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'targetNotFound',
      ),
    ).toBe(true);
  });

  it('accepts modification of existing concept', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:concept/dog',
          'fandaws:displayLabel': 'Domestic Dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'targetNotFound',
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Deletion checks
// ─────────────────────────────────────────────────────────

describe('validate — deletion checks', () => {
  it('warns when deleting a concept with children', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const mutation = makeMutation({
      deletions: ['fandaws:concept/animal'],
    });
    const result = validate(mutation, graph);
    // orphanRisk is a warning, so it counts as a violation
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'orphanRisk'),
    ).toBe(true);
  });

  it('no warning when deleting a leaf concept', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const mutation = makeMutation({
      deletions: ['fandaws:concept/dog'],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'orphanRisk'),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Merge checks
// ─────────────────────────────────────────────────────────

describe('validate — merge checks', () => {
  it('rejects self-merge', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:concept/dog',
          'fandaws:target': 'fandaws:concept/dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'selfMerge'),
    ).toBe(true);
  });

  it('rejects merge with non-existent source', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:concept/nonexistent',
          'fandaws:target': 'fandaws:concept/dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'mergeSourceNotFound',
      ),
    ).toBe(true);
  });

  it('rejects merge with non-existent target', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:concept/dog',
          'fandaws:target': 'fandaws:concept/nonexistent',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
  });

  it('accepts valid merge', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog'),
      makeConcept('fandaws:concept/canine', 'Canine'),
    ]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:concept/canine',
          'fandaws:target': 'fandaws:concept/dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) =>
          v.reason === 'selfMerge' ||
          v.reason === 'mergeSourceNotFound' ||
          v.reason === 'mergeTargetNotFound',
      ),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Governance block
// ─────────────────────────────────────────────────────────

describe('validate — governance block', () => {
  it('blocks addition targeting a concept with blocking governance flag', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under review.',
      },
    };
    const graph = makeGraph([existing]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
      ],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'governanceBlock',
      ),
    ).toBe(true);
  });

  it('blocks modification targeting a concept with blocking governance flag', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under review.',
      },
    };
    const graph = makeGraph([existing]);
    const mutation = makeMutation({
      modifications: [
        { '@id': 'fandaws:concept/dog', 'fandaws:displayLabel': 'Hound' },
      ],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'governanceBlock',
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Multi-violation collection
// ─────────────────────────────────────────────────────────

describe('validate — multi-violation collection', () => {
  it('collects multiple violation types in a single pass', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const mutation = makeMutation({
      // Compound: two unrelated concepts
      additions: [
        makeConcept('fandaws:concept/planet', 'Planet'),
        makeConcept('fandaws:concept/star', 'Star'),
      ],
      // Cycle: mammal.parent = dog
      modifications: [
        {
          '@id': 'fandaws:concept/mammal',
          'fandaws:parent': 'fandaws:concept/dog',
        },
      ],
      // Self-merge
      merges: [
        {
          'fandaws:source': 'fandaws:concept/dog',
          'fandaws:target': 'fandaws:concept/dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    // Should have at least 3 distinct violation reasons
    const reasons = new Set(result['fandaws:violations'].map((v) => v.reason));
    expect(reasons.has('compoundStatement')).toBe(true);
    expect(reasons.has('circularHierarchy')).toBe(true);
    expect(reasons.has('selfMerge')).toBe(true);
  });
});
