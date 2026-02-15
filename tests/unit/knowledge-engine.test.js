/**
 * KnowledgeEngine — unit tests.
 *
 * Covers: four mutation cases (A/B/C/D), disambiguation, self-classification,
 * circular detection, re-assertion idempotency, depth calculation,
 * allowRoot flag, negotiate mode, error handling.
 */

import { describe, it, expect } from '@jest/globals';
import { processClassification } from '../../src/core/knowledge-engine/knowledge-engine.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createClassificationAction } from '../../src/types/classification-action.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeConcept(id, displayLabel, canonicalLabel, parent = null, depth = 0) {
  return createConcept({
    id,
    displayLabel,
    canonicalLabel,
    parent,
    depth,
  });
}

function makeAction(subject, object) {
  return createClassificationAction({
    workflow: 'classification',
    subject,
    object,
  });
}

/**
 * Build indices matching InMemoryStateAdapter shape.
 */
function buildIndices(concepts) {
  const canonicalLabelToIri = new Map();
  const iriToParent = new Map();
  const iriToChildren = new Map();

  for (const c of concepts) {
    const iri = c['@id'];
    canonicalLabelToIri.set(c['fandaws:canonicalLabel'], iri);
    iriToParent.set(iri, c['fandaws:parent']);

    if (!iriToChildren.has(iri)) iriToChildren.set(iri, new Set());
    const parent = c['fandaws:parent'];
    if (parent != null) {
      if (!iriToChildren.has(parent)) iriToChildren.set(parent, new Set());
      iriToChildren.get(parent).add(iri);
    }
  }

  return { canonicalLabelToIri, iriToParent, iriToChildren };
}

const EMPTY_INDICES = buildIndices([]);

// ─────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────

describe('Input validation', () => {
  it('rejects null action', () => {
    const result = processClassification(null, makeGraph(), EMPTY_INDICES);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('invalid-workflow');
  });

  it('rejects action with wrong workflow', () => {
    const action = createClassificationAction({
      workflow: 'property',
      subject: 'dog',
      object: 'animal',
    });
    const result = processClassification(action, makeGraph(), EMPTY_INDICES);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('invalid-workflow');
  });

  it('rejects action with missing subject', () => {
    const action = {
      '@type': 'fandaws:ClassificationAction',
      'fandaws:workflow': 'classification',
      'fandaws:subject': null,
      'fandaws:object': 'animal',
    };
    const result = processClassification(action, makeGraph(), EMPTY_INDICES);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('missing-operands');
  });

  it('rejects action with missing object', () => {
    const action = {
      '@type': 'fandaws:ClassificationAction',
      'fandaws:workflow': 'classification',
      'fandaws:subject': 'dog',
      'fandaws:object': null,
    };
    const result = processClassification(action, makeGraph(), EMPTY_INDICES);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('missing-operands');
  });
});

// ─────────────────────────────────────────────────────────
// Self-classification
// ─────────────────────────────────────────────────────────

describe('Self-classification', () => {
  it('rejects "dog is a dog"', () => {
    const result = processClassification(
      makeAction('dog', 'dog'),
      makeGraph(),
      EMPTY_INDICES,
    );
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('self-classification');
  });

  it('rejects case-insensitive self-classification', () => {
    const result = processClassification(
      makeAction('DOG', 'dog'),
      makeGraph(),
      EMPTY_INDICES,
    );
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('self-classification');
  });
});

// ─────────────────────────────────────────────────────────
// Case C: Both new
// ─────────────────────────────────────────────────────────

describe('Case C: Both concepts are new', () => {
  it('creates both concepts with IS_A relationship', () => {
    const result = processClassification(
      makeAction('dog', 'animal'),
      makeGraph(),
      EMPTY_INDICES,
    );
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();

    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(2);

    // Object is first (root), subject second
    const [objectNode, subjectNode] = additions;
    expect(objectNode['@id']).toBe('fandaws:concept/animal');
    expect(objectNode['fandaws:canonicalLabel']).toBe('animal');
    expect(objectNode['fandaws:allowRoot']).toBe(true);
    expect(objectNode['fandaws:parent']).toBeNull();
    expect(objectNode['fandaws:depth']).toBe(0);

    expect(subjectNode['@id']).toBe('fandaws:concept/dog');
    expect(subjectNode['fandaws:canonicalLabel']).toBe('dog');
    expect(subjectNode['fandaws:parent']).toBe('fandaws:concept/animal');
    expect(subjectNode['fandaws:depth']).toBe(1);
  });

  it('handles multi-word terms', () => {
    const result = processClassification(
      makeAction('golden retriever', 'dog'),
      makeGraph(),
      EMPTY_INDICES,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[1]['@id']).toBe('fandaws:concept/golden-retriever');
    expect(additions[1]['fandaws:displayLabel']).toBe('golden retriever');
  });

  it('preserves display labels from action', () => {
    const result = processClassification(
      makeAction('Dog', 'Animal'),
      makeGraph(),
      EMPTY_INDICES,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:displayLabel']).toBe('Animal');
    expect(additions[1]['fandaws:displayLabel']).toBe('Dog');
  });
});

// ─────────────────────────────────────────────────────────
// Case B: Object exists, subject new
// ─────────────────────────────────────────────────────────

describe('Case B: Object exists, subject is new', () => {
  it('creates subject with parent pointing to existing object', () => {
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const graph = makeGraph([animal]);
    const indices = buildIndices([animal]);

    const result = processClassification(
      makeAction('dog', 'animal'),
      graph,
      indices,
    );
    expect(result.error).toBe(false);

    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(1);
    expect(additions[0]['@id']).toBe('fandaws:concept/dog');
    expect(additions[0]['fandaws:parent']).toBe('fandaws:concept/animal');
    expect(additions[0]['fandaws:depth']).toBe(1);
  });

  it('calculates depth from existing parent', () => {
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const mammal = makeConcept(
      'fandaws:concept/mammal', 'Mammal', 'mammal', 'fandaws:concept/animal', 1,
    );
    const graph = makeGraph([animal, mammal]);
    const indices = buildIndices([animal, mammal]);

    const result = processClassification(
      makeAction('dog', 'mammal'),
      graph,
      indices,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:depth']).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────
// Case A: Both exist, not linked
// ─────────────────────────────────────────────────────────

describe('Case A: Both exist, not linked', () => {
  it('emits modification to set subject parent', () => {
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const dog = makeConcept(
      'fandaws:concept/dog', 'Dog', 'dog', null, 0,
    );
    const graph = makeGraph([animal, dog]);
    const indices = buildIndices([animal, dog]);

    const result = processClassification(
      makeAction('dog', 'animal'),
      graph,
      indices,
    );
    expect(result.error).toBe(false);

    const mods = result.mutation['fandaws:modifications'];
    expect(mods).toHaveLength(1);
    expect(mods[0]['@id']).toBe('fandaws:concept/dog');
    // Dual format: field/value for StateAdapter + direct for Validator
    expect(mods[0]['fandaws:field']).toBe('fandaws:parent');
    expect(mods[0]['fandaws:value']).toBe('fandaws:concept/animal');
    expect(mods[0]['fandaws:parent']).toBe('fandaws:concept/animal');
  });
});

// ─────────────────────────────────────────────────────────
// Case D: Object new, subject exists
// ─────────────────────────────────────────────────────────

describe('Case D: Object new, subject exists', () => {
  it('auto-creates object as root and modifies subject parent', () => {
    const dog = makeConcept(
      'fandaws:concept/dog', 'Dog', 'dog', null, 0,
    );
    const graph = makeGraph([dog]);
    const indices = buildIndices([dog]);

    const result = processClassification(
      makeAction('dog', 'animal'),
      graph,
      indices,
    );
    expect(result.error).toBe(false);

    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(1);
    expect(additions[0]['@id']).toBe('fandaws:concept/animal');
    expect(additions[0]['fandaws:allowRoot']).toBe(true);

    const mods = result.mutation['fandaws:modifications'];
    expect(mods).toHaveLength(1);
    expect(mods[0]['@id']).toBe('fandaws:concept/dog');
    expect(mods[0]['fandaws:value']).toBe('fandaws:concept/animal');
  });

  it('negotiates when negotiateUnknownParent is true', () => {
    const dog = makeConcept(
      'fandaws:concept/dog', 'Dog', 'dog', null, 0,
    );
    const graph = makeGraph([dog]);
    const indices = buildIndices([dog]);

    const result = processClassification(
      makeAction('dog', 'animal'),
      graph,
      indices,
      { negotiateUnknownParent: true },
    );
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('disambiguation');
    expect(result.sessionUpdates).not.toBeNull();
    expect(result.sessionUpdates.state).toBe('negotiating');
  });
});

// ─────────────────────────────────────────────────────────
// Re-assertion idempotency
// ─────────────────────────────────────────────────────────

describe('Re-assertion idempotency', () => {
  it('returns no-op when classification already exists', () => {
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const dog = makeConcept(
      'fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal', 1,
    );
    const graph = makeGraph([animal, dog]);
    const indices = buildIndices([animal, dog]);

    const result = processClassification(
      makeAction('dog', 'animal'),
      graph,
      indices,
    );
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// Circular classification
// ─────────────────────────────────────────────────────────

describe('Circular classification', () => {
  it('rejects "animal is a dog" when dog → animal exists', () => {
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const dog = makeConcept(
      'fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal', 1,
    );
    const graph = makeGraph([animal, dog]);
    const indices = buildIndices([animal, dog]);

    const result = processClassification(
      makeAction('animal', 'dog'),
      graph,
      indices,
    );
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('circular-classification');
  });

  it('rejects transitive cycle: A → B → C, try C is A', () => {
    const a = makeConcept('fandaws:concept/a', 'A', 'a', null, 0);
    const b = makeConcept('fandaws:concept/b', 'B', 'b', 'fandaws:concept/a', 1);
    const c = makeConcept('fandaws:concept/c', 'C', 'c', 'fandaws:concept/b', 2);
    const graph = makeGraph([a, b, c]);
    const indices = buildIndices([a, b, c]);

    const result = processClassification(
      makeAction('a', 'c'),
      graph,
      indices,
    );
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('circular-classification');
  });
});

// ─────────────────────────────────────────────────────────
// Disambiguation
// ─────────────────────────────────────────────────────────

describe('Disambiguation', () => {
  it('emits disambiguation prompt when object has multiple matches', () => {
    const bank1 = makeConcept(
      'fandaws:concept/bank-1', 'Bank (financial)', 'bank', null, 0,
    );
    const bank2 = makeConcept(
      'fandaws:concept/bank-2', 'Bank (river)', 'bank', null, 0,
    );
    const graph = makeGraph([bank1, bank2]);
    // Build indices — note: canonicalLabelToIri will only have the last,
    // but disambiguation checks graph directly
    const indices = buildIndices([bank1, bank2]);

    const result = processClassification(
      makeAction('atm', 'bank'),
      graph,
      indices,
    );
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('disambiguation');
    expect(result.prompts[0]['fandaws:options']).toHaveLength(2);
  });

  it('emits disambiguation prompt when subject has multiple matches', () => {
    const bass1 = makeConcept(
      'fandaws:concept/bass-1', 'Bass (fish)', 'bass', null, 0,
    );
    const bass2 = makeConcept(
      'fandaws:concept/bass-2', 'Bass (instrument)', 'bass', null, 0,
    );
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const graph = makeGraph([bass1, bass2, animal]);
    const indices = buildIndices([bass1, bass2, animal]);

    const result = processClassification(
      makeAction('bass', 'animal'),
      graph,
      indices,
    );
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('disambiguation');
  });
});

// ─────────────────────────────────────────────────────────
// Depth calculation
// ─────────────────────────────────────────────────────────

describe('Depth calculation', () => {
  it('sets depth = parent depth + 1 for new subject', () => {
    const mammal = makeConcept(
      'fandaws:concept/mammal', 'Mammal', 'mammal', 'fandaws:concept/animal', 2,
    );
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const graph = makeGraph([animal, mammal]);
    const indices = buildIndices([animal, mammal]);

    const result = processClassification(
      makeAction('dog', 'mammal'),
      graph,
      indices,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:depth']).toBe(3); // mammal depth 2 + 1
  });

  it('sets depth 1 when both new (parent depth 0)', () => {
    const result = processClassification(
      makeAction('dog', 'animal'),
      makeGraph(),
      EMPTY_INDICES,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:depth']).toBe(0); // object (root)
    expect(additions[1]['fandaws:depth']).toBe(1); // subject
  });
});

// ─────────────────────────────────────────────────────────
// allowRoot flag
// ─────────────────────────────────────────────────────────

describe('allowRoot flag', () => {
  it('sets allowRoot on new object in Case C', () => {
    const result = processClassification(
      makeAction('dog', 'animal'),
      makeGraph(),
      EMPTY_INDICES,
    );
    const objectNode = result.mutation['fandaws:additions'][0];
    expect(objectNode['fandaws:allowRoot']).toBe(true);
  });

  it('sets allowRoot on new object in Case D', () => {
    const dog = makeConcept(
      'fandaws:concept/dog', 'Dog', 'dog', null, 0,
    );
    const graph = makeGraph([dog]);
    const indices = buildIndices([dog]);

    const result = processClassification(
      makeAction('dog', 'animal'),
      graph,
      indices,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:allowRoot']).toBe(true);
  });

  it('does not set allowRoot on new subject (Case B)', () => {
    const animal = makeConcept(
      'fandaws:concept/animal', 'Animal', 'animal', null, 0,
    );
    const graph = makeGraph([animal]);
    const indices = buildIndices([animal]);

    const result = processClassification(
      makeAction('dog', 'animal'),
      graph,
      indices,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:allowRoot']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// Result shape
// ─────────────────────────────────────────────────────────

describe('Result shape', () => {
  it('always includes error, errorReason, mutation, prompts, sessionUpdates', () => {
    const result = processClassification(
      makeAction('dog', 'animal'),
      makeGraph(),
      EMPTY_INDICES,
    );
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('errorReason');
    expect(result).toHaveProperty('mutation');
    expect(result).toHaveProperty('prompts');
    expect(result).toHaveProperty('sessionUpdates');
  });

  it('mutation is a valid GraphMutation JSON-LD node', () => {
    const result = processClassification(
      makeAction('dog', 'animal'),
      makeGraph(),
      EMPTY_INDICES,
    );
    expect(result.mutation['@type']).toBe('fandaws:GraphMutation');
    expect(result.mutation).toHaveProperty('fandaws:additions');
    expect(result.mutation).toHaveProperty('fandaws:modifications');
    expect(result.mutation).toHaveProperty('fandaws:deletions');
    expect(result.mutation).toHaveProperty('fandaws:reason');
  });
});
