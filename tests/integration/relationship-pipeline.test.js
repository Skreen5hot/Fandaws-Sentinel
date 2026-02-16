/**
 * Relationship Pipeline — integration tests.
 *
 * Tests the full relationship pipeline from utterance to graph mutation,
 * including validation, description generation, and multi-turn scenarios.
 */

import { describe, it, expect } from '@jest/globals';
import { runRelationshipPipeline } from '../../src/core/pipeline/relationship-pipeline.js';
import { runClassificationPipeline } from '../../src/core/pipeline/classification-pipeline.js';
import { runPropertyPipeline } from '../../src/core/pipeline/property-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { createRelationship } from '../../src/types/relationship.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';

// ── Helpers ──

const GRAPH_ID = 'fandaws:graph/test';

function freshContext() {
  const stateAdapter = new InMemoryStateAdapter();
  stateAdapter.saveGraph(
    GRAPH_ID,
    createKnowledgeGraph({ id: GRAPH_ID, concepts: [] }),
  );
  return { stateAdapter, graphId: GRAPH_ID };
}

function setupContextWithConcepts(concepts) {
  const stateAdapter = new InMemoryStateAdapter();
  stateAdapter.saveGraph(
    GRAPH_ID,
    createKnowledgeGraph({ id: GRAPH_ID, concepts }),
  );
  return { stateAdapter, graphId: GRAPH_ID };
}

function getRelationships(graph) {
  const rels = [];
  for (const c of graph['fandaws:concepts'] || []) {
    for (const entry of c['rdfs:subClassOf'] || []) {
      if (isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'relationship') {
        rels.push(entry);
      }
    }
  }
  return rels;
}

// ── Tests ──

describe('Relationship Pipeline Integration', () => {
  it('full pipeline: "Dogs chase cats" → graph with relationship', () => {
    const ctx = freshContext();
    const result = runRelationshipPipeline('Dogs chase cats', ctx);

    expect(result.success).toBe(true);
    expect(result.error).toBe(false);
    expect(result.normalizedVerb).toBe('chase');

    const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
    expect(graph['fandaws:concepts']).toHaveLength(2);
    const rels = getRelationships(graph);
    expect(rels).toHaveLength(1);
    expect(rels[0]['owl:onProperty']).toBe('chase');
  });

  it('pipeline with existing concepts', () => {
    const dog = createConcept({ id: 'fandaws:concept/dog', label: 'dog', prefLabel: 'dog' });
    const cat = createConcept({ id: 'fandaws:concept/cat', label: 'cat', prefLabel: 'cat' });
    const ctx = setupContextWithConcepts([dog, cat]);

    const result = runRelationshipPipeline('A dog chases a cat', ctx);
    expect(result.success).toBe(true);

    const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
    expect(graph['fandaws:concepts']).toHaveLength(2);
    const rels = getRelationships(graph);
    expect(rels).toHaveLength(1);
    expect(rels[0]['fandaws:attachedTo']).toBe('fandaws:concept/dog');
    expect(rels[0]['owl:someValuesFrom']).toBe('fandaws:concept/cat');
  });

  it('pipeline rejects duplicate relationship', () => {
    const ctx = freshContext();

    // First relationship succeeds
    const result1 = runRelationshipPipeline('Dogs chase cats', ctx);
    expect(result1.success).toBe(true);

    // Same relationship again — should fail validation
    const result2 = runRelationshipPipeline('Dogs chase cats', ctx);
    expect(result2.error).toBe(true);
    expect(result2.errorReason).toContain('duplicate-relationship');
  });

  it('multi-turn: classification + relationship coexist', () => {
    const ctx = freshContext();

    // Build taxonomy first
    const c1 = runClassificationPipeline('A dog is an animal', ctx);
    expect(c1.success).toBe(true);

    // Add relationship on existing concept
    const r1 = runRelationshipPipeline('A dog chases a cat', ctx);
    expect(r1.success).toBe(true);

    const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
    expect(graph['fandaws:concepts']).toHaveLength(3); // animal, dog, cat

    const dog = graph['fandaws:concepts'].find((c) => c['skos:prefLabel'] === 'dog');
    expect(dog['skos:broader']).toBe('fandaws:concept/animal');

    const rels = getRelationships(graph);
    expect(rels).toHaveLength(1);
    expect(rels[0]['fandaws:attachedTo']).toBe('fandaws:concept/dog');
  });

  it('multi-turn: property + relationship coexist on same concept', () => {
    const ctx = freshContext();

    runClassificationPipeline('A dog is an animal', ctx);
    runPropertyPipeline('A dog has fur', ctx, {
      scopeDecisions: new Map([['fandaws:concept/animal', false]]),
    });

    const r1 = runRelationshipPipeline('A dog chases a cat', ctx);
    expect(r1.success).toBe(true);

    const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
    const dog = graph['fandaws:concepts'].find((c) => c['skos:prefLabel'] === 'dog');
    const props = (dog['rdfs:subClassOf'] || []).filter(
      (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property',
    );
    const rels = (dog['rdfs:subClassOf'] || []).filter(
      (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'relationship',
    );
    expect(props.length).toBeGreaterThanOrEqual(1);
    expect(rels).toHaveLength(1);
  });

  it('description generation includes relationship', () => {
    const dog = createConcept({
      id: 'fandaws:concept/dog',
      label: 'dog',
      prefLabel: 'dog',
      broader: 'fandaws:concept/animal',
    });
    const animal = createConcept({
      id: 'fandaws:concept/animal',
      label: 'animal',
      prefLabel: 'animal',
    });
    const cat = createConcept({
      id: 'fandaws:concept/cat',
      label: 'cat',
      prefLabel: 'cat',
    });
    const ctx = setupContextWithConcepts([animal, dog, cat]);

    const result = runRelationshipPipeline('A dog chases a cat', ctx);
    expect(result.success).toBe(true);
    expect(result.descriptions.length).toBeGreaterThan(0);

    // Subject concept should have a description
    const dogDesc = result.descriptions.find((d) => d.conceptIri === 'fandaws:concept/dog');
    expect(dogDesc).toBeDefined();
    expect(dogDesc.description).toBeTruthy();
  });

  it('verb normalization through pipeline (chases → chase)', () => {
    const ctx = freshContext();
    const result = runRelationshipPipeline('Dogs chases cats', ctx);
    expect(result.success).toBe(true);
    expect(result.normalizedVerb).toBe('chase');

    const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
    const rels = getRelationships(graph);
    expect(rels[0]['owl:onProperty']).toBe('chase');
  });

  it('sub-relationship detected through pipeline', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/animal--eat--food',
      verbIri: 'eat',
      subject: 'fandaws:concept/animal',
      object: 'fandaws:concept/food',
    });
    const animal = createConcept({
      id: 'fandaws:concept/animal',
      label: 'animal',
      prefLabel: 'animal',
    });
    animal['rdfs:subClassOf'] = [rel];
    const dog = createConcept({
      id: 'fandaws:concept/dog',
      label: 'dog',
      prefLabel: 'dog',
      broader: 'fandaws:concept/animal',
    });
    const food = createConcept({
      id: 'fandaws:concept/food',
      label: 'food',
      prefLabel: 'food',
    });
    const meat = createConcept({
      id: 'fandaws:concept/meat',
      label: 'meat',
      prefLabel: 'meat',
    });
    const ctx = setupContextWithConcepts([animal, dog, food, meat]);

    const result = runRelationshipPipeline('A dog eats meat', ctx);
    expect(result.success).toBe(true);

    const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
    const rels = getRelationships(graph);
    const dogRel = rels.find((r) => r['fandaws:attachedTo'] === 'fandaws:concept/dog');
    expect(dogRel['fandaws:subRestrictionOf']).toBe('fandaws:rel/animal--eat--food');
  });

  it('pipeline latency is under 40ms', () => {
    const ctx = freshContext();

    const start = performance.now();
    runRelationshipPipeline('Dogs chase cats', ctx);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(40);
  });

  it('wrong-workflow error for classification utterances', () => {
    const ctx = freshContext();
    const result = runRelationshipPipeline('A dog is an animal', ctx);
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain('wrong-workflow');
  });

  it('integrity clean after relationship pipeline', () => {
    const ctx = freshContext();

    runClassificationPipeline('A dog is an animal', ctx);
    runRelationshipPipeline('A dog chases a cat', ctx);

    const ghosts = ctx.stateAdapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts).toHaveLength(0);
  });
});
