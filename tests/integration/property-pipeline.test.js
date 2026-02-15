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
    setupGraph(adapter, [makeConcept('fandaws:concept/dog', 'Dog')]);
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
    setupGraph(adapter, [makeConcept('fandaws:concept/animal', 'Animal')]);
    const result = runPropertyPipeline('An animal has cells', context);
    expect(result.success).toBe(true);
    expect(result.mutation).not.toBeNull();

    // Verify property embedded in graph
    const graph = adapter.loadGraph(GRAPH_ID);
    const animal = graph['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/animal',
    );
    const props = (animal['rdfs:subClassOf'] || []).filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(props).toHaveLength(1);
    expect(props[0]['owl:onProperty']).toBe('cells');
  });

  it('returns scope narrowing prompts for non-root subject', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const result = runPropertyPipeline('A dog has fur', context);
    expect(result.success).toBe(false);
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.scopeContext).not.toBeNull();
  });

  it('completes with scope decision: parent=no → attach to subject', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const decisions = new Map([['fandaws:concept/animal', false]]);
    const result = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result.success).toBe(true);

    // Verify property on dog
    const graph = adapter.loadGraph(GRAPH_ID);
    const dog = graph['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:concept/dog');
    const props = (dog['rdfs:subClassOf'] || []).filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(props).toHaveLength(1);
    expect(props[0]['owl:onProperty']).toBe('fur');
  });

  it('completes with scope decision: parent=yes → attach to parent', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const decisions = new Map([['fandaws:concept/animal', true]]);
    const result = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result.success).toBe(true);

    // Verify property on animal (not dog)
    const graph = adapter.loadGraph(GRAPH_ID);
    const animal = graph['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:concept/animal');
    const props = (animal['rdfs:subClassOf'] || []).filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(props).toHaveLength(1);
    expect(props[0]['owl:onProperty']).toBe('fur');
  });

  it('generates descriptions including properties', () => {
    setupGraph(adapter, [
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ]);
    const decisions = new Map([['fandaws:concept/animal', true]]);
    const result = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result.success).toBe(true);
    expect(result.descriptions.length).toBeGreaterThan(0);
    // Animal should have description mentioning fur
    const animalDesc = result.descriptions.find(
      (d) => d.conceptIri === 'fandaws:concept/animal',
    );
    expect(animalDesc).toBeDefined();
    expect(animalDesc.description).toContain('fur');
  });

  it('is idempotent — re-assertion returns no-op', () => {
    setupGraph(adapter, [makeConcept('fandaws:concept/animal', 'Animal')]);
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
      makeConcept('fandaws:concept/entity', 'Entity'),
      makeConcept('fandaws:concept/living-thing', 'Living Thing', 'fandaws:concept/entity'),
      makeConcept('fandaws:concept/animal', 'Animal', 'fandaws:concept/living-thing'),
      makeConcept('fandaws:concept/mammal', 'Mammal', 'fandaws:concept/animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);

    // First call: should get 2 prompts (parent + root) via Leap Check
    const result1 = runPropertyPipeline('A dog has fur', context);
    expect(result1.prompts).toHaveLength(2);

    // Both yes → attach to root
    const decisions = new Map([
      ['fandaws:concept/mammal', true],
      ['fandaws:concept/entity', true],
    ]);
    const result2 = runPropertyPipeline('A dog has fur', context, { scopeDecisions: decisions });
    expect(result2.success).toBe(true);

    // Property should be on entity
    const graph = adapter.loadGraph(GRAPH_ID);
    const entity = graph['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:concept/entity');
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
        id: 'fandaws:concept/dogs',
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
