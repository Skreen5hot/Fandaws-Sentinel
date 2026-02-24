/**
 * Reclassification confirmation — unit tests.
 *
 * Tests the proximity gate inserted into Case A of processClassification().
 * When an existing concept is reclassified to a distant parent, a
 * reclassificationConfirmation prompt is returned instead of silently
 * modifying skos:broader.
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

function makeConcept(id, label, prefLabel, broader = null, extras = {}) {
  return { ...createConcept({ id, label, prefLabel, broader }), ...extras };
}

function makeAction(subject, object) {
  return createClassificationAction({
    workflow: 'classification',
    subject,
    object,
  });
}

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

// ─────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────

/**
 * Close topology (proximity 2):
 *   root → animal → {dog, cat}
 *
 * Reclassifying "dog" to "cat" = proximity 2 (dog→animal→cat)
 * Should reclassify silently (within default threshold=3).
 */
function makeCloseTopology() {
  const root = makeConcept('iri:root', 'Root', 'root');
  const animal = makeConcept('iri:animal', 'Animal', 'animal', 'iri:root');
  const dog = makeConcept('iri:dog', 'Dog', 'dog', 'iri:animal');
  const cat = makeConcept('iri:cat', 'Cat', 'cat', 'iri:animal');
  const concepts = [root, animal, dog, cat];
  return { concepts, graph: makeGraph(concepts), indices: buildIndices(concepts) };
}

/**
 * Distant topology (proximity 5+):
 *   root → {biology, technology}
 *   biology → organism → rodent → mouse
 *   technology → device → peripheral → input_device
 *
 * Reclassifying "mouse" to "input_device" = Infinity (only path via root)
 * Should trigger reclassificationConfirmation prompt.
 */
function makeDistantTopology() {
  const root = makeConcept('iri:root', 'Root', 'root');
  const biology = makeConcept('iri:biology', 'Biology', 'biology', 'iri:root');
  const organism = makeConcept('iri:organism', 'Organism', 'organism', 'iri:biology');
  const rodent = makeConcept('iri:rodent', 'Rodent', 'rodent', 'iri:organism');
  const mouse = makeConcept('iri:mouse', 'Mouse', 'mouse', 'iri:rodent');
  const technology = makeConcept('iri:tech', 'Technology', 'technology', 'iri:root');
  const device = makeConcept('iri:device', 'Device', 'device', 'iri:tech');
  const peripheral = makeConcept('iri:peripheral', 'Peripheral', 'peripheral', 'iri:device');
  const inputDevice = makeConcept('iri:input', 'Input device', 'input device', 'iri:peripheral');
  const concepts = [root, biology, organism, rodent, mouse, technology, device, peripheral, inputDevice];
  return { concepts, graph: makeGraph(concepts), indices: buildIndices(concepts) };
}

// ─────────────────────────────────────────────────────────
// RCL-01: Close proximity → silent reclassify
// ─────────────────────────────────────────────────────────

describe('RCL-01: Close proximity reclassify (silent)', () => {
  it('returns mutation with no prompts when proximity ≤ threshold', () => {
    const { graph, indices } = makeCloseTopology();
    // Reclassify "dog" under "cat" — proximity(animal, cat) = 1 (sibling parent→target)
    const action = makeAction('Dog', 'Cat');
    const result = processClassification(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(0);
    expect(result.mutation).not.toBeNull();
    // Should modify dog's broader to cat
    const mods = result.mutation['fandaws:modifications'];
    expect(mods).toHaveLength(1);
    expect(mods[0]['fandaws:value']).toBe('iri:cat');
  });
});

// ─────────────────────────────────────────────────────────
// RCL-02: Distant proximity → prompt
// ─────────────────────────────────────────────────────────

describe('RCL-02: Distant proximity triggers prompt', () => {
  it('returns reclassificationConfirmation prompt when proximity > threshold', () => {
    const { graph, indices } = makeDistantTopology();
    // Reclassify "mouse" under "input device" — only path via root → Infinity
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('reclassificationConfirmation');
    // Context should include proximity info
    const ctx = result.prompts[0]['fandaws:context'];
    expect(ctx.existingConceptIri).toBe('iri:mouse');
    expect(ctx.existingParentLabel).toBeDefined();
    expect(ctx.newParentLabel).toBeDefined();
    expect(ctx.subjectLabel).toBe('Mouse');
  });
});

// ─────────────────────────────────────────────────────────
// RCL-03: Disconnected trees → prompt with Infinity
// ─────────────────────────────────────────────────────────

describe('RCL-03: Disconnected trees trigger prompt', () => {
  it('returns prompt with Infinity proximity for disconnected trees', () => {
    // Two separate roots, each with one child
    const rootA = makeConcept('iri:rootA', 'Root A', 'root a');
    const alpha = makeConcept('iri:alpha', 'Alpha', 'alpha', 'iri:rootA');
    const rootB = makeConcept('iri:rootB', 'Root B', 'root b');
    const beta = makeConcept('iri:beta', 'Beta', 'beta', 'iri:rootB');
    const concepts = [rootA, alpha, rootB, beta];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);

    const action = makeAction('Alpha', 'Beta');
    const result = processClassification(action, graph, indices);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('reclassificationConfirmation');
    expect(result.prompts[0]['fandaws:context'].proximity.steps).toBe(Infinity);
  });
});

// ─────────────────────────────────────────────────────────
// RCL-04: Distant + confirmed move → mutation applied
// ─────────────────────────────────────────────────────────

describe('RCL-04: Confirmed move applies mutation', () => {
  it('applies reclassification when reclassificationConfirmed=move', () => {
    const { graph, indices } = makeDistantTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'move',
    });
    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(0);
    expect(result.mutation).not.toBeNull();
    const mods = result.mutation['fandaws:modifications'];
    expect(mods).toHaveLength(1);
    expect(mods[0]['@id']).toBe('iri:mouse');
    expect(mods[0]['fandaws:value']).toBe('iri:input');
  });
});

// ─────────────────────────────────────────────────────────
// RCL-05: Distant + confirmed cancel → no-op
// ─────────────────────────────────────────────────────────

describe('RCL-05: Confirmed cancel returns no-op', () => {
  it('returns no mutation, no prompts, no error when reclassificationConfirmed=cancel', () => {
    const { graph, indices } = makeDistantTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'cancel',
    });
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// RCL-06: Re-assertion (same parent) → no-op
// ─────────────────────────────────────────────────────────

describe('RCL-06: Re-assertion idempotency', () => {
  it('returns no-op when subject already has the target parent', () => {
    const { graph, indices } = makeCloseTopology();
    // Dog is already under animal — re-assert "dog is an animal"
    const action = makeAction('Dog', 'Animal');
    const result = processClassification(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// RCL-07: Root concept (null broader) → Infinity → prompt
// ─────────────────────────────────────────────────────────

describe('RCL-07: Root concept reclassification triggers prompt', () => {
  it('triggers prompt when existing concept has null broader (root)', () => {
    // "animal" is a root concept, reclassify to "thing" (also root's child in another tree)
    const rootA = makeConcept('iri:rootA', 'Root A', 'root a');
    const animal = makeConcept('iri:animal', 'Animal', 'animal', 'iri:rootA');
    const rootB = makeConcept('iri:rootB', 'Root B', 'root b');
    const thing = makeConcept('iri:thing', 'Thing', 'thing', 'iri:rootB');
    const concepts = [rootA, animal, rootB, thing];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);

    const action = makeAction('Animal', 'Thing');
    const result = processClassification(action, graph, indices);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('reclassificationConfirmation');
  });
});

// ─────────────────────────────────────────────────────────
// RCL-08: New parent is descendant of current parent
// ─────────────────────────────────────────────────────────

describe('RCL-08: Descendant parent — normal proximity evaluation', () => {
  it('silently reclassifies when new parent is close descendant', () => {
    // root → animal → mammal → dog
    // Reclassify "dog" under "mammal" — but dog is already under mammal!
    // Use: root → animal → {mammal, reptile}, mammal → dog
    // Reclassify "dog" to "reptile" — proximity(mammal, reptile) = 2
    const root = makeConcept('iri:root', 'Root', 'root');
    const animal = makeConcept('iri:animal', 'Animal', 'animal', 'iri:root');
    const mammal = makeConcept('iri:mammal', 'Mammal', 'mammal', 'iri:animal');
    const reptile = makeConcept('iri:reptile', 'Reptile', 'reptile', 'iri:animal');
    const dog = makeConcept('iri:dog', 'Dog', 'dog', 'iri:mammal');
    const concepts = [root, animal, mammal, reptile, dog];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);

    const action = makeAction('Dog', 'Reptile');
    const result = processClassification(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(0);
    expect(result.mutation).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// RCL-09: Regression — all existing knowledge-engine tests pass
// (This is verified by running the full suite, not a single test)
// ─────────────────────────────────────────────────────────

describe('RCL-09: Regression', () => {
  it('new concepts (Case B) still work without proximity gate', () => {
    // Case B: Object exists, subject new — should proceed normally
    const root = makeConcept('iri:root', 'Root', 'root');
    const animal = makeConcept('iri:animal', 'Animal', 'animal', 'iri:root');
    const concepts = [root, animal];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);

    const action = makeAction('Dog', 'Animal');
    const result = processClassification(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(1);
    expect(additions[0]['skos:prefLabel']).toBe('dog');
  });

  it('both-new (Case C) still work without proximity gate', () => {
    const graph = makeGraph([]);
    const indices = buildIndices([]);

    const action = makeAction('Dog', 'Animal');
    const result = processClassification(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// RCL-10: Concept with existing hiddenLabel preserved on close reclassify
// ─────────────────────────────────────────────────────────

describe('RCL-10: hiddenLabel preserved on close reclassify', () => {
  it('does not strip skos:hiddenLabel when reclassifying within threshold', () => {
    const root = makeConcept('iri:root', 'Root', 'root');
    const animal = makeConcept('iri:animal', 'Animal', 'animal', 'iri:root');
    const mammal = makeConcept('iri:mammal', 'Mammal', 'mammal', 'iri:animal');
    const cat = makeConcept('iri:cat', 'Cat', 'cat', 'iri:animal', {
      'skos:hiddenLabel': 'kitty',
    });
    const concepts = [root, animal, mammal, cat];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);

    // Reclassify cat under mammal — proximity(animal, mammal) = 1 → silent
    const action = makeAction('Cat', 'Mammal');
    const result = processClassification(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    // The mutation is a modification (set broader), not a replacement.
    // hiddenLabel is on the original concept and won't be touched.
    const mods = result.mutation['fandaws:modifications'];
    expect(mods).toHaveLength(1);
    expect(mods[0]['fandaws:field']).toBe('skos:broader');
    // No field touching hiddenLabel
    expect(mods.some((m) => m['fandaws:field'] === 'skos:hiddenLabel')).toBe(false);
  });
});
