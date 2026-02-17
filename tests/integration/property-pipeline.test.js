/**
 * Property Pipeline — integration tests.
 *
 * Full pipeline: parse → classify → engine → validate → apply → describe.
 * Uses InMemoryStateAdapter with real graph state.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { runPropertyPipeline } from '../../src/core/pipeline/property-pipeline.js';
import { runClassificationPipeline } from '../../src/core/pipeline/classification-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';

const GRAPH_ID = 'fandaws:graph/test';

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

function setupGraph(adapter, concepts) {
  adapter.saveGraph(GRAPH_ID, createKnowledgeGraph({ id: GRAPH_ID, concepts }));
}

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe('runPropertyPipeline', () => {
  let adapter;
  let context;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    context = { stateAdapter: adapter, graphId: GRAPH_ID };
  });

  it('rejects non-property utterance', () => {
    setupGraph(adapter, [makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog')]);
    const result = runPropertyPipeline('A dog is an animal', context);
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain('wrong-workflow');
  });

  it('returns classify-first prompt for unknown subject', () => {
    setupGraph(adapter, []);
    const result = runPropertyPipeline('A unicorn has a horn', context);
    expect(result.error).toBe(false);
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.prompts[0]['fandaws:text']).toContain('classify');
  });

  it('attaches property to root concept (no scope narrowing)', () => {
    setupGraph(adapter, [makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    const result = runPropertyPipeline('An animal has cells', context);
    expect(result.success).toBe(true);
    expect(result.mutation).not.toBeNull();

    // Verify property embedded in graph
    const graph = adapter.loadGraph(GRAPH_ID);
    const animal = graph['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    const props = (animal['rdfs:subClassOf'] || []).filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(props).toHaveLength(1);
    expect(props[0]['owl:onProperty']).toBe('cells');
  });

  it('returns scope narrowing prompts for non-root subject', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const result = runPropertyPipeline('A dog has fur', context);
    expect(result.success).toBe(false);
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.scopeContext).not.toBeNull();
  });

  it('completes with scope decision: parent=no → attach to subject', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false]]);
    const result = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result.success).toBe(true);

    // Verify property on dog
    const graph = adapter.loadGraph(GRAPH_ID);
    const dog = graph['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    const props = (dog['rdfs:subClassOf'] || []).filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(props).toHaveLength(1);
    expect(props[0]['owl:onProperty']).toBe('fur');
  });

  it('completes with scope decision: parent=yes → attach to parent', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true]]);
    const result = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result.success).toBe(true);

    // Verify property on animal (not dog)
    const graph = adapter.loadGraph(GRAPH_ID);
    const animal = graph['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const props = (animal['rdfs:subClassOf'] || []).filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(props).toHaveLength(1);
    expect(props[0]['owl:onProperty']).toBe('fur');
  });

  it('generates descriptions including properties', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ]);
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true]]);
    const result = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result.success).toBe(true);
    expect(result.descriptions.length).toBeGreaterThan(0);
    // Animal should have description mentioning fur
    const animalDesc = result.descriptions.find(
      (d) => d.conceptIri === 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    expect(animalDesc).toBeDefined();
    expect(animalDesc.description).toContain('fur');
  });

  it('is idempotent — re-assertion returns no-op', () => {
    setupGraph(adapter, [makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')]);
    // First call: attach property
    runPropertyPipeline('An animal has cells', context);
    // Second call: same property — should be no-op
    const result = runPropertyPipeline('An animal has cells', context);
    expect(result.success).toBe(true);
    expect(result.mutation).toBeNull();
  });

  it('handles parse error gracefully', () => {
    setupGraph(adapter, []);
    const result = runPropertyPipeline('', context);
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain('parse-error');
  });

  it('handles graph-not-found error', () => {
    // Don't set up graph
    const result = runPropertyPipeline('A dog has fur', context);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('graph-not-found');
  });

  it('works with Leap Check on deep hierarchy', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', 'Entity'),
      makeConcept('fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', 'Living Thing', 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity'),
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing'),
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ]);

    // First call: should get 2 prompts (parent + root) via Leap Check
    const result1 = runPropertyPipeline('A dog has fur', context);
    expect(result1.prompts).toHaveLength(2);

    // Both yes → attach to root
    const decisions = new Map([
      ['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', true],
      ['fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', true],
    ]);
    const result2 = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result2.success).toBe(true);

    // Property should be on entity
    const graph = adapter.loadGraph(GRAPH_ID);
    const entity = graph['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity');
    const props = (entity['rdfs:subClassOf'] || []).filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(props).toHaveLength(1);
    expect(props[0]['owl:onProperty']).toBe('fur');
  });

  it('handles "have" plural form', () => {
    // Identity simplification has no depluralization, so use a concept
    // whose prefLabel matches the plural form "dogs".
    setupGraph(adapter, [
      createConcept({
        id: 'fandaws:class/26e7809b-0d05-53e6-9a07-d6ca0b180f36/dogs',
        label: 'Dogs',
        prefLabel: 'dogs',
      }),
    ]);
    const result = runPropertyPipeline('Dogs have four legs', context);
    // Should parse as property workflow with "have" verb
    expect(result.error).toBe(false);
    // Root concept → direct attachment
    expect(result.success).toBe(true);
    expect(result.mutation).not.toBeNull();
  });

  it('interoperates with classification pipeline', () => {
    setupGraph(adapter, []);

    // Step 1: Classify "A dog is an animal"
    const classResult = runClassificationPipeline('A dog is an animal', context);
    expect(classResult.success).toBe(true);

    // Step 2: Add property "A dog has fur" — should find dog
    const propResult = runPropertyPipeline('A dog has fur', context);
    // Should return scope prompt since dog has parent=animal
    expect(propResult.error).toBe(false);
    expect(propResult.prompts.length).toBeGreaterThan(0);
  });
});
