/**
 * KnowledgeEngine — unit tests.
 *
 * v2.1: Uses v2.1 concept factories (label/prefLabel/broader).
 *        Depth is no longer stored on concepts.
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

function makeConcept(id, label, prefLabel, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel,
    broader,
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
    canonicalLabelToIri.set(c['skos:prefLabel'], iri);
    iriToParent.set(iri, c['skos:broader']);

    if (!iriToChildren.has(iri)) iriToChildren.set(iri, new Set());
    const parent = c['skos:broader'];
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

    const [objectNode, subjectNode] = additions;
    expect(objectNode['@id']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(objectNode['skos:prefLabel']).toBe('animal');
    expect(objectNode['fandaws:allowRoot']).toBe(true);
    expect(objectNode['skos:broader']).toBeNull();

    expect(subjectNode['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(subjectNode['skos:prefLabel']).toBe('dog');
    expect(subjectNode['skos:broader']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('handles multi-word terms', () => {
    const result = processClassification(
      makeAction('golden retriever', 'dog'),
      makeGraph(),
      EMPTY_INDICES,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[1]['@id']).toBe('fandaws:class/b331a181-eb54-5dbe-a2c6-27f0a69fa219/golden-retriever');
    expect(additions[1]['rdfs:label']).toBe('golden retriever');
  });

  it('preserves display labels from action', () => {
    const result = processClassification(
      makeAction('Dog', 'Animal'),
      makeGraph(),
      EMPTY_INDICES,
    );
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['rdfs:label']).toBe('Animal');
    expect(additions[1]['rdfs:label']).toBe('Dog');
  });
});

// ─────────────────────────────────────────────────────────
// Case B: Object exists, subject new
// ─────────────────────────────────────────────────────────

describe('Case B: Object exists, subject is new', () => {
  it('creates subject with broader pointing to existing object', () => {
    const animal = makeConcept(
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal', null,
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
    expect(additions[0]['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(additions[0]['skos:broader']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });
});

// ─────────────────────────────────────────────────────────
// Case A: Both exist, not linked
// ─────────────────────────────────────────────────────────

describe('Case A: Both exist, not linked', () => {
  it('emits modification to set subject broader', () => {
    const animal = makeConcept(
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal', null,
    );
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', null,
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
    expect(mods[0]['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(mods[0]['fandaws:field']).toBe('skos:broader');
    expect(mods[0]['fandaws:value']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(mods[0]['skos:broader']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });
});

// ─────────────────────────────────────────────────────────
// Case D: Object new, subject exists
// ─────────────────────────────────────────────────────────

describe('Case D: Object new, subject exists', () => {
  it('auto-creates object as root and modifies subject broader', () => {
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', null,
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
    expect(additions[0]['@id']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(additions[0]['fandaws:allowRoot']).toBe(true);

    const mods = result.mutation['fandaws:modifications'];
    expect(mods).toHaveLength(1);
    expect(mods[0]['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(mods[0]['fandaws:value']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('negotiates when negotiateUnknownParent is true', () => {
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', null,
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
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal', null,
    );
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
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
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal', null,
    );
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
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
    const a = makeConcept('fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'A', 'a', null);
    const b = makeConcept('fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'B', 'b', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a');
    const c = makeConcept('fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c', 'C', 'c', 'fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b');
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
      'fandaws:class/05a64685-8b2a-5277-bceb-2818812522ed/bank-1', 'Bank (financial)', 'bank', null,
    );
    const bank2 = makeConcept(
      'fandaws:class/86b5184e-f6b0-5b2e-b6da-b9fe12cfa318/bank-2', 'Bank (river)', 'bank', null,
    );
    const graph = makeGraph([bank1, bank2]);
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
      'fandaws:class/2ef9c7d9-4087-52b0-8062-30e24ee10f77/bass-1', 'Bass (fish)', 'bass', null,
    );
    const bass2 = makeConcept(
      'fandaws:class/83492715-d975-50f7-a086-52a31bee5ff1/bass-2', 'Bass (instrument)', 'bass', null,
    );
    const animal = makeConcept(
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal', null,
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
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', null,
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
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal', null,
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
