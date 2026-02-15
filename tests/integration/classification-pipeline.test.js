/**
 * Classification Pipeline — integration tests.
 *
 * Tests the full pipeline: utterance → parse → classify → engine →
 * validate → apply → describe.
 *
 * v2.1: Uses standard OWL/SKOS/PROV vocabulary.
 *        No depth stored on concepts; broader replaces parent.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { runClassificationPipeline } from '../../src/core/pipeline/classification-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const GRAPH_ID = 'fandaws:graph/test';

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: GRAPH_ID, concepts });
}

function makeConcept(id, label, prefLabel, broader = null) {
  return createConcept({ id, label, prefLabel, broader });
}

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe('Classification Pipeline', () => {
  let adapter;
  let context;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());
    context = { stateAdapter: adapter, graphId: GRAPH_ID };
  });

  // ── Basic pipeline ──

  it('creates both concepts from "A dog is an animal" on empty graph', () => {
    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);
    expect(result.error).toBe(false);

    const concepts = result.graph['fandaws:concepts'];
    expect(concepts).toHaveLength(2);

    const animal = concepts.find((c) => c['skos:prefLabel'] === 'animal');
    const dog = concepts.find((c) => c['skos:prefLabel'] === 'dog');
    expect(animal).toBeDefined();
    expect(dog).toBeDefined();
    expect(dog['skos:broader']).toBe(animal['@id']);
  });

  it('creates child when parent exists', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    adapter.saveGraph(GRAPH_ID, makeGraph([animal]));

    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);

    const concepts = result.graph['fandaws:concepts'];
    expect(concepts).toHaveLength(2);
    const dog = concepts.find((c) => c['skos:prefLabel'] === 'dog');
    expect(dog['skos:broader']).toBe('fandaws:concept/animal');
  });

  it('extends a chain: poodle → dog → animal', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal');
    adapter.saveGraph(GRAPH_ID, makeGraph([animal, dog]));

    const result = runClassificationPipeline('A poodle is a dog', context);
    expect(result.success).toBe(true);

    const concepts = result.graph['fandaws:concepts'];
    expect(concepts).toHaveLength(3);
    const poodle = concepts.find((c) => c['skos:prefLabel'] === 'poodle');
    expect(poodle['skos:broader']).toBe('fandaws:concept/dog');
  });

  it('links two existing unlinked concepts', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
    adapter.saveGraph(GRAPH_ID, makeGraph([animal, dog]));

    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);

    const updated = adapter.loadGraph(GRAPH_ID);
    const updatedDog = updated['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(updatedDog['skos:broader']).toBe('fandaws:concept/animal');
  });

  // ── Idempotency ──

  it('is idempotent: same classification repeated returns success with no mutation', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal');
    adapter.saveGraph(GRAPH_ID, makeGraph([animal, dog]));

    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);
    expect(result.mutation).toBeNull();
  });

  // ── Error handling ──

  it('rejects unparseable input', () => {
    const result = runClassificationPipeline('hello', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain('parse-error');
  });

  it('rejects self-classification', () => {
    const result = runClassificationPipeline('A dog is a dog', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain('self-classification');
  });

  it('rejects circular classification', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal');
    adapter.saveGraph(GRAPH_ID, makeGraph([animal, dog]));

    const result = runClassificationPipeline('An animal is a dog', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain('circular');
  });

  it('returns error when graph not found', () => {
    const result = runClassificationPipeline('A dog is an animal', {
      stateAdapter: adapter,
      graphId: 'fandaws:graph/nonexistent',
    });
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('graph-not-found');
  });

  // ── ScopeResolver ──

  it('skips ScopeResolver when scopeResolutionEnabled is false (default)', () => {
    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);
    expect(result.scopeResolutions).toBeNull();
  });

  it('calls ScopeResolver when scopeResolutionEnabled is true', () => {
    const result = runClassificationPipeline('A dog is an animal', context, {
      scopeResolutionEnabled: true,
    });
    expect(result.success).toBe(true);
    // Null stub returns "unknown" for both — pipeline continues normally
    expect(result.scopeResolutions).not.toBeNull();
    expect(result.scopeResolutions.subject['fandaws:status']).toBe('unknown');
    expect(result.scopeResolutions.object['fandaws:status']).toBe('unknown');
  });

  // ── Descriptions ──

  it('generates descriptions for new concepts', () => {
    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);
    expect(result.descriptions.length).toBeGreaterThan(0);

    const dogDesc = result.descriptions.find(
      (d) => d.conceptIri === 'fandaws:concept/dog',
    );
    expect(dogDesc).toBeDefined();
    expect(dogDesc.description).toContain('Dog');
  });

  it('generates "root concept" description for new root', () => {
    const result = runClassificationPipeline('A dog is an animal', context);
    const animalDesc = result.descriptions.find(
      (d) => d.conceptIri === 'fandaws:concept/animal',
    );
    expect(animalDesc.description).toContain('root concept');
  });

  // ── Parse & Classify result passthrough ──

  it('includes parseResult and classificationAction in result', () => {
    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.parseResult['@type']).toBe('fandaws:ParseResult');
    expect(result.classificationAction['@type']).toBe('fandaws:ClassificationAction');
    expect(result.classificationAction['fandaws:workflow']).toBe('classification');
  });

  // ── Case-insensitive matching ──

  it('matches existing concepts case-insensitively', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    adapter.saveGraph(GRAPH_ID, makeGraph([animal]));

    const result = runClassificationPipeline('A DOG is an ANIMAL', context);
    expect(result.success).toBe(true);
    const concepts = result.graph['fandaws:concepts'];
    expect(concepts).toHaveLength(2);
    const dog = concepts.find((c) => c['skos:prefLabel'] === 'dog');
    expect(dog['skos:broader']).toBe('fandaws:concept/animal');
  });

  // ── Article handling ──

  it('strips articles from input terms', () => {
    const result = runClassificationPipeline('The cat is an animal', context);
    expect(result.success).toBe(true);
    const concepts = result.graph['fandaws:concepts'];
    const cat = concepts.find((c) => c['skos:prefLabel'] === 'cat');
    expect(cat).toBeDefined();
  });

  // ── Multi-word terms ──

  it('handles multi-word terms correctly', () => {
    const result = runClassificationPipeline(
      'A golden retriever is a dog',
      context,
    );
    expect(result.success).toBe(true);
    const concepts = result.graph['fandaws:concepts'];
    const gr = concepts.find(
      (c) => c['skos:prefLabel'] === 'golden retriever',
    );
    expect(gr).toBeDefined();
    expect(gr['@id']).toBe('fandaws:concept/golden-retriever');
  });

  // ── Disambiguation ──

  it('returns disambiguation prompt when object is ambiguous', () => {
    const bank1 = makeConcept('fandaws:concept/bank-1', 'Bank (financial)', 'bank');
    const bank2 = makeConcept('fandaws:concept/bank-2', 'Bank (river)', 'bank');
    adapter.saveGraph(GRAPH_ID, makeGraph([bank1, bank2]));

    const result = runClassificationPipeline('An atm is a bank', context);
    expect(result.success).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('disambiguation');
  });

  // ── Unknown parent negotiation ──

  it('returns negotiation prompt when negotiateUnknownParent is true', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
    adapter.saveGraph(GRAPH_ID, makeGraph([dog]));

    const result = runClassificationPipeline('A dog is an animal', context, {
      negotiateUnknownParent: true,
    });
    expect(result.success).toBe(false);
    expect(result.prompts).toHaveLength(1);
  });

  it('auto-creates unknown parent when negotiateUnknownParent is false', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
    adapter.saveGraph(GRAPH_ID, makeGraph([dog]));

    const result = runClassificationPipeline('A dog is an animal', context, {
      negotiateUnknownParent: false,
    });
    expect(result.success).toBe(true);
    const concepts = result.graph['fandaws:concepts'];
    const animal = concepts.find((c) => c['skos:prefLabel'] === 'animal');
    expect(animal).toBeDefined();
  });

  // ── Integrity after apply ──

  it('passes integrity check after applying mutation', () => {
    runClassificationPipeline('A dog is an animal', context);
    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts).toHaveLength(0);
  });

  // ── Plural form ──

  it('handles "Dogs are animals" (plural pattern)', () => {
    const result = runClassificationPipeline('Dogs are animals', context);
    expect(result.success).toBe(true);
    const concepts = result.graph['fandaws:concepts'];
    expect(concepts).toHaveLength(2);
  });

  // ── Bare "is" ──

  it('handles "Water is liquid" (bare is, no article)', () => {
    const result = runClassificationPipeline('Water is liquid', context);
    expect(result.success).toBe(true);
    const concepts = result.graph['fandaws:concepts'];
    const water = concepts.find((c) => c['skos:prefLabel'] === 'water');
    const liquid = concepts.find((c) => c['skos:prefLabel'] === 'liquid');
    expect(water).toBeDefined();
    expect(liquid).toBeDefined();
    expect(water['skos:broader']).toBe(liquid['@id']);
  });

  // ── Validation result included ──

  it('includes validation result on success', () => {
    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);
    expect(result.validation).not.toBeNull();
    expect(result.validation['fandaws:valid']).toBe(true);
  });

  // ── Governance halt path (SUP-07) ──

  it('SUP-07a: pipeline halts when concept has blocking governance flag', () => {
    const dog = {
      ...makeConcept('fandaws:concept/dog', 'Dog', 'dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under OCE review.',
      },
    };
    adapter.saveGraph(GRAPH_ID, makeGraph([dog]));

    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('validation-failed');

    // Graph must be unchanged — animal not created
    const graph = adapter.loadGraph(GRAPH_ID);
    expect(graph['fandaws:concepts']).toHaveLength(1);
    expect(graph['fandaws:concepts'][0]['skos:prefLabel']).toBe('dog');
  });

  it('SUP-07b: pipeline proceeds when concept has advisory governance flag', () => {
    const dog = {
      ...makeConcept('fandaws:concept/dog', 'Dog', 'dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'advisory',
        'fandaws:reason': 'Consider renaming.',
      },
    };
    adapter.saveGraph(GRAPH_ID, makeGraph([dog]));

    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);
    expect(result.graph['fandaws:concepts']).toHaveLength(2);
  });

  it('SUP-07c: pipeline proceeds when concept has no governance flag', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
    adapter.saveGraph(GRAPH_ID, makeGraph([dog]));

    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(true);
  });

  // ── Blank answer handling (SUP-12) ──

  it('SUP-12a: empty string returns parse-error, no concepts created', () => {
    const result = runClassificationPipeline('', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('parse-error: empty-input');
    expect(adapter.loadGraph(GRAPH_ID)['fandaws:concepts']).toHaveLength(0);
  });

  it('SUP-12b: whitespace-only returns parse-error, no concepts created', () => {
    const result = runClassificationPipeline('   ', context);
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('parse-error: empty-input');
    expect(adapter.loadGraph(GRAPH_ID)['fandaws:concepts']).toHaveLength(0);
  });

  it('SUP-12c: tab-only input returns parse-error', () => {
    const result = runClassificationPipeline('\t\t', context);
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('parse-error: empty-input');
  });

  // ── Novel parent creation (SUP-13) ──

  it('SUP-13a: novel parent creates both concepts, parent as root', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    const mammal = makeConcept(
      'fandaws:concept/mammal', 'Mammal', 'mammal', 'fandaws:concept/animal',
    );
    adapter.saveGraph(GRAPH_ID, makeGraph([animal, mammal]));

    const result = runClassificationPipeline('A dog is a canine', context);
    expect(result.success).toBe(true);

    const concepts = result.graph['fandaws:concepts'];
    expect(concepts).toHaveLength(4);

    const canine = concepts.find((c) => c['skos:prefLabel'] === 'canine');
    const dog = concepts.find((c) => c['skos:prefLabel'] === 'dog');
    expect(canine).toBeDefined();
    expect(canine['skos:broader']).toBeNull(); // root
    expect(dog).toBeDefined();
    expect(dog['skos:broader']).toBe(canine['@id']);

    // Existing tree untouched
    const savedAnimal = concepts.find((c) => c['skos:prefLabel'] === 'animal');
    const savedMammal = concepts.find((c) => c['skos:prefLabel'] === 'mammal');
    expect(savedAnimal['skos:broader']).toBeNull();
    expect(savedMammal['skos:broader']).toBe('fandaws:concept/animal');
  });

  it('SUP-13b: novel parent does not corrupt existing tree indices', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal', 'animal');
    const mammal = makeConcept(
      'fandaws:concept/mammal', 'Mammal', 'mammal', 'fandaws:concept/animal',
    );
    adapter.saveGraph(GRAPH_ID, makeGraph([animal, mammal]));

    runClassificationPipeline('A dog is a canine', context);

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts).toHaveLength(0);
  });
});
