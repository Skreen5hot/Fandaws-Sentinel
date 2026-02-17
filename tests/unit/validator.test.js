/**
 * Validator Orchestrator — unit tests.
 *
 * v2.1: Uses v2.1 concept factories (label/prefLabel/broader),
 *        owl:Restriction for properties and relationships.
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

function makeGraph(concepts = []) {
  return createKnowledgeGraph({
    id: 'fandaws:graph/test',
    concepts,
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
    const graph = makeGraph([makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    const snapshot = JSON.stringify(graph);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      ],
    });
    validate(mutation, graph);
    expect(JSON.stringify(graph)).toBe(snapshot);
  });

  it('is a pure function (does not mutate mutation)', () => {
    const mutation = makeMutation({
      additions: [makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')],
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
        makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog'),
        makeConcept('fandaws:class/358e542d-badb-52e5-ab89-75c43f87d0d9/planet', 'Planet'),
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
        { ...makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'), 'fandaws:allowRoot': true },
        makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      ],
    });
    const result = validate(mutation, graph);
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
      additions: [makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')],
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
    const graph = makeGraph([makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
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
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal',
          'skos:broader': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
    const graph = makeGraph([makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
          'chases',
          'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
          'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
    const graph = makeGraph([makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
          'chases',
          'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
        ),
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
  });

  it('rejects duplicate relationship tuple', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const existingRel = makeRelationship(
      'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
      'chases',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
    );
    dog['rdfs:subClassOf'].push(existingRel);
    const graph = makeGraph([dog, cat]);

    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/00601a85-8481-57f2-869a-2069849a8ce6/2',
          'chases',
          'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
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
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog'),
      makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat'),
    ]);
    const mutation = makeMutation({
      additions: [
        makeRelationship(
          'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
          'chases',
          'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
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
    const graph = makeGraph([makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat')]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat'),
        makeRelationship(
          'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
          'chases',
          'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
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
      '@id': 'fandaws:rel/84a834fa-c83f-556a-a52c-68b8355fc581/1',
      '@type': 'owl:Restriction',
      'owl:onProperty': 'chases',
      'fandaws:restrictionKind': 'relationship',
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
          '@id': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
          'rdfs:label': 'New Label',
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
    const graph = makeGraph([makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'rdfs:label': 'Domestic Dog',
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
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const mutation = makeMutation({
      deletions: ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'orphanRisk'),
    ).toBe(true);
  });

  it('no warning when deleting a leaf concept', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const mutation = makeMutation({
      deletions: ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'],
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
    const graph = makeGraph([makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
    const graph = makeGraph([makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
          'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
    const graph = makeGraph([makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'fandaws:target': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
  });

  it('accepts valid merge', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog'),
      makeConcept('fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine', 'Canine'),
    ]);
    const mutation = makeMutation({
      merges: [
        {
          'fandaws:source': 'fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine',
          'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
      ...makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under review.',
      },
    };
    const graph = makeGraph([existing]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
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
      ...makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under review.',
      },
    };
    const graph = makeGraph([existing]);
    const mutation = makeMutation({
      modifications: [
        { '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'rdfs:label': 'Hound' },
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
// SUP-08: Modification mutation expansion
// ─────────────────────────────────────────────────────────

describe('validate — modification expansion (SUP-08)', () => {
  it('SUP-08a: rejects modification targeting non-existent restriction IRI', () => {
    const graph = makeGraph([makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:restriction/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
          'owl:onProperty': 'barks',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'targetNotFound'),
    ).toBe(true);
  });

  it('SUP-08b: rejects 3-node cycle via reparent modification', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    // animal → dog → mammal → animal = 3-node cycle
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
          'skos:broader': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    expect(
      result['fandaws:violations'].some((v) => v.reason === 'circularHierarchy'),
    ).toBe(true);
  });

  it('SUP-08c: accepts valid reparent modification', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine', 'Canine'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine'),
    ]);
    // Reparent dog under mammal — valid, no cycle
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'skos:broader': 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(
      result['fandaws:violations'].some(
        (v) => v.reason === 'circularHierarchy' || v.reason === 'targetNotFound',
      ),
    ).toBe(false);
  });

  it('SUP-08d: label collision on modification is not currently validated (known gap)', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/ee0234bf-b767-5314-a938-211e7bd3437c/plant', 'Plant'),
    ]);
    // Rename plant's prefLabel to 'animal' — would collide, but validator
    // does not currently check label uniqueness on modifications
    const mutation = makeMutation({
      modifications: [
        {
          '@id': 'fandaws:class/ee0234bf-b767-5314-a938-211e7bd3437c/plant',
          'skos:prefLabel': 'animal',
        },
      ],
    });
    const result = validate(mutation, graph);
    // Documents known gap: this should ideally fail but currently passes
    expect(result['fandaws:valid']).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// SUP-09: Deletion with orphan prevention
// ─────────────────────────────────────────────────────────

describe('validate — deletion expansion (SUP-09)', () => {
  it('SUP-09a: deletion of concept with children produces orphanRisk warning', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    const mutation = makeMutation({
      deletions: ['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    const orphanViolation = result['fandaws:violations'].find(
      (v) => v.reason === 'orphanRisk',
    );
    expect(orphanViolation).toBeDefined();
    expect(orphanViolation.severity).toBe('warning');
  });

  it('SUP-09b: deletion of leaf concept produces no violations', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const mutation = makeMutation({
      deletions: ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(true);
    expect(result['fandaws:violations']).toEqual([]);
  });

  it('SUP-09c: deletion of non-existent concept produces no violation (known gap)', () => {
    const graph = makeGraph([makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    const mutation = makeMutation({
      deletions: ['fandaws:class/845fd3dd-66c2-55b5-aed7-af5318b37d50/ghost'],
    });
    const result = validate(mutation, graph);
    // Documents known gap: validator does not check deletion target existence
    expect(result['fandaws:valid']).toBe(true);
  });

  it('SUP-09d: deletion of root with no children produces no violations', () => {
    const graph = makeGraph([makeConcept('fandaws:class/8af18475-e27a-5f8b-b171-9f5663cc7269/standalone', 'Standalone')]);
    const mutation = makeMutation({
      deletions: ['fandaws:class/8af18475-e27a-5f8b-b171-9f5663cc7269/standalone'],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(true);
    expect(result['fandaws:violations']).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Multi-violation collection
// ─────────────────────────────────────────────────────────

describe('validate — multi-violation collection', () => {
  it('collects multiple violation types in a single pass', () => {
    const graph = makeGraph([
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);
    const mutation = makeMutation({
      additions: [
        makeConcept('fandaws:class/358e542d-badb-52e5-ab89-75c43f87d0d9/planet', 'Planet'),
        makeConcept('fandaws:class/eb70dd0d-f700-58a2-b795-ba9e2f81cbf6/star', 'Star'),
      ],
      modifications: [
        {
          '@id': 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal',
          'skos:broader': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        },
      ],
      merges: [
        {
          'fandaws:source': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        },
      ],
    });
    const result = validate(mutation, graph);
    expect(result['fandaws:valid']).toBe(false);
    const reasons = new Set(result['fandaws:violations'].map((v) => v.reason));
    expect(reasons.has('compoundStatement')).toBe(true);
    expect(reasons.has('circularHierarchy')).toBe(true);
    expect(reasons.has('selfMerge')).toBe(true);
  });
});
