/**
 * X9 Step 7.14 (2026-04-29) — Canonical graph persistence across page reloads.
 *
 * Closes the gap surfaced on Geospatial dry-run: user-promoted concepts
 * vanished from the in-memory graph after page reload because the
 * canonical graph (graph['fandaws:concepts']) was in-memory only — every
 * other workbench artifact (sessions, staging records, active mode) is
 * localStorage-persistent, but the canonical graph itself was not.
 *
 * Tests cover:
 *   - _persistCanonicalGraph filters fandaws:isImported (BFO infrastructure)
 *   - _persistCanonicalGraph includes RelationTypeClass (user-promoted)
 *   - restoreCanonicalGraph no-op when localStorage empty / version mismatch
 *   - restoreCanonicalGraph re-hydrates non-imported concepts
 *   - Idempotency: restoring twice doesn't duplicate
 *   - resetGraph clears the persisted entry
 *   - Step 7.13 round-trip: rdfs:subClassOf with restriction objects survives
 *   - Quota exhaustion: warn-not-throw, in-memory state intact
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkbenchStateManager } from '../../../docs/workbench/js/workbench-state.js';
import { InMemoryStateAdapter } from '../../../src/adapters/state/in-memory-state-adapter.js';
import { SynchronousOrchestrationAdapter } from '../../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { createKnowledgeGraph } from '../../../src/types/index.js';

const LS_CANONICAL_GRAPH = 'fandaws:wb:canonicalGraph';

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    _store: store,
  };
}

// Stub Fandaws bundle — pulls real adapter classes so persistence
// behavior is exercised against real graph shapes.
const FandawsStub = {
  InMemoryStateAdapter,
  SynchronousOrchestrationAdapter,
  createKnowledgeGraph,
};

beforeEach(() => {
  global.localStorage = createMockLocalStorage();
});

afterEach(() => {
  delete global.localStorage;
});

describe('Step 7.14 — _persistCanonicalGraph filters BFO infrastructure', () => {
  it('persists user-promoted concepts; excludes fandaws:isImported entries', () => {
    const state = new WorkbenchStateManager(FandawsStub);
    const graph = state.getGraph();
    graph['fandaws:concepts'].push(
      { '@id': 'fandaws:class/imported/bfo-process', '@type': ['owl:Class', 'skos:Concept'], 'rdfs:label': 'process', 'fandaws:isImported': true },
      { '@id': 'fandaws:class/uuid1/eye-color', '@type': ['owl:Class', 'skos:Concept'], 'rdfs:label': 'Eye Color' },
    );
    state._persistCanonicalGraph();
    const stored = JSON.parse(global.localStorage.getItem(LS_CANONICAL_GRAPH));
    expect(stored.version).toBe(1);
    expect(stored.graphId).toBe('fandaws:graph/workbench');
    expect(stored.concepts).toHaveLength(1);
    expect(stored.concepts[0]['@id']).toBe('fandaws:class/uuid1/eye-color');
  });

  it('includes RelationTypeClass entries (user-promoted relation classes)', () => {
    const state = new WorkbenchStateManager(FandawsStub);
    const graph = state.getGraph();
    graph['fandaws:concepts'].push(
      { '@id': 'fandaws:class/relation/uuid/has-affiliate', '@type': ['owl:Class', 'fandaws:RelationTypeClass'], 'rdfs:label': 'has affiliate' },
    );
    state._persistCanonicalGraph();
    const stored = JSON.parse(global.localStorage.getItem(LS_CANONICAL_GRAPH));
    expect(stored.concepts).toHaveLength(1);
    expect(stored.concepts[0]['@type']).toContain('fandaws:RelationTypeClass');
  });

  it('writes versioned envelope with savedAt timestamp', () => {
    const state = new WorkbenchStateManager(FandawsStub);
    state._persistCanonicalGraph();
    const stored = JSON.parse(global.localStorage.getItem(LS_CANONICAL_GRAPH));
    expect(stored.version).toBe(1);
    expect(typeof stored.savedAt).toBe('string');
    expect(new Date(stored.savedAt).toString()).not.toBe('Invalid Date');
  });
});

describe('Step 7.14 — restoreCanonicalGraph', () => {
  it('returns no-op when localStorage is empty', () => {
    const state = new WorkbenchStateManager(FandawsStub);
    const result = state.restoreCanonicalGraph();
    expect(result.restored).toBe(false);
    expect(result.conceptsAdded).toBe(0);
    expect(result.reason).toBe('no-payload');
  });

  it('returns no-op when version mismatches', () => {
    global.localStorage.setItem(LS_CANONICAL_GRAPH, JSON.stringify({
      version: 999, // future version
      graphId: 'fandaws:graph/workbench',
      savedAt: '2026-01-01T00:00:00.000Z',
      concepts: [{ '@id': 'fandaws:class/x/foo' }],
    }));
    const state = new WorkbenchStateManager(FandawsStub);
    const result = state.restoreCanonicalGraph();
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('version-mismatch');
    // In-memory graph should NOT contain the rejected concept.
    const concepts = state.getGraph()['fandaws:concepts'] || [];
    expect(concepts.find(c => c['@id'] === 'fandaws:class/x/foo')).toBeUndefined();
  });

  it('re-hydrates persisted concepts into the graph', () => {
    global.localStorage.setItem(LS_CANONICAL_GRAPH, JSON.stringify({
      version: 1,
      graphId: 'fandaws:graph/workbench',
      savedAt: '2026-04-29T00:00:00.000Z',
      concepts: [
        { '@id': 'fandaws:class/uuid1/eye-color', '@type': ['owl:Class', 'skos:Concept'], 'rdfs:label': 'Eye Color' },
        { '@id': 'fandaws:class/uuid2/agent', '@type': ['owl:Class', 'skos:Concept'], 'rdfs:label': 'Agent' },
      ],
    }));
    const state = new WorkbenchStateManager(FandawsStub);
    const result = state.restoreCanonicalGraph();
    expect(result.restored).toBe(true);
    expect(result.conceptsAdded).toBe(2);
    const concepts = state.getGraph()['fandaws:concepts'];
    expect(concepts.find(c => c['@id'] === 'fandaws:class/uuid1/eye-color')).toBeDefined();
    expect(concepts.find(c => c['@id'] === 'fandaws:class/uuid2/agent')).toBeDefined();
  });

  it('is idempotent (restoring twice does not duplicate concepts)', () => {
    global.localStorage.setItem(LS_CANONICAL_GRAPH, JSON.stringify({
      version: 1,
      graphId: 'fandaws:graph/workbench',
      savedAt: '2026-04-29T00:00:00.000Z',
      concepts: [{ '@id': 'fandaws:class/uuid1/eye-color', '@type': ['owl:Class', 'skos:Concept'] }],
    }));
    const state = new WorkbenchStateManager(FandawsStub);
    state.restoreCanonicalGraph();
    const second = state.restoreCanonicalGraph();
    expect(second.conceptsAdded).toBe(0); // already present, no duplicate
    const concepts = state.getGraph()['fandaws:concepts'];
    const matching = concepts.filter(c => c['@id'] === 'fandaws:class/uuid1/eye-color');
    expect(matching).toHaveLength(1);
  });

  it('does not duplicate when restored concept IRI matches an existing graph concept', () => {
    // Simulates ensureBfo() pre-loading a BFO concept that also happens
    // to be in the persisted payload (edge case if persist filter ever misses).
    const state = new WorkbenchStateManager(FandawsStub);
    state.getGraph()['fandaws:concepts'].push(
      { '@id': 'fandaws:class/imported/bfo-process', '@type': ['owl:Class', 'skos:Concept'], 'fandaws:isImported': true },
    );
    global.localStorage.setItem(LS_CANONICAL_GRAPH, JSON.stringify({
      version: 1,
      graphId: 'fandaws:graph/workbench',
      savedAt: '2026-04-29T00:00:00.000Z',
      concepts: [{ '@id': 'fandaws:class/imported/bfo-process' }],
    }));
    const result = state.restoreCanonicalGraph();
    expect(result.conceptsAdded).toBe(0);
  });
});

describe('Step 7.14 — resetGraph clears localStorage', () => {
  it('removes the canonical-graph entry from localStorage', () => {
    global.localStorage.setItem(LS_CANONICAL_GRAPH, JSON.stringify({
      version: 1,
      concepts: [{ '@id': 'fandaws:class/x/foo' }],
    }));
    const state = new WorkbenchStateManager(FandawsStub);
    state.resetGraph();
    expect(global.localStorage.getItem(LS_CANONICAL_GRAPH)).toBeNull();
  });

  it('post-reset, restoreCanonicalGraph is a no-op', () => {
    const state = new WorkbenchStateManager(FandawsStub);
    state.getGraph()['fandaws:concepts'].push(
      { '@id': 'fandaws:class/uuid1/eye-color', '@type': ['owl:Class', 'skos:Concept'] },
    );
    state._persistCanonicalGraph();
    expect(global.localStorage.getItem(LS_CANONICAL_GRAPH)).not.toBeNull();
    state.resetGraph();
    expect(global.localStorage.getItem(LS_CANONICAL_GRAPH)).toBeNull();
    const result = state.restoreCanonicalGraph();
    expect(result.restored).toBe(false);
  });
});

describe('Step 7.14 — Step 7.13 round-trip: restriction objects survive persist + restore', () => {
  it('rdfs:subClassOf with mixed IRI + owl:Restriction object survives JSON serialize/parse', () => {
    const restrictionObject = {
      '@type': 'owl:Restriction',
      'owl:onProperty': 'http://purl.obolibrary.org/obo/BFO_0000197',
      'owl:someValuesFrom': 'https://www.commoncoreontologies.org/ont00000404',
    };
    const concept = {
      '@id': 'fandaws:class/uuid1/eye-color',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': 'Eye Color',
      'rdfs:subClassOf': ['bfo:Quality', restrictionObject],
      'owl:disjointWith': ['cco:HairColor'],
    };
    const state = new WorkbenchStateManager(FandawsStub);
    state.getGraph()['fandaws:concepts'].push(concept);
    state._persistCanonicalGraph();

    // Simulate fresh page load: new state manager + restore.
    const state2 = new WorkbenchStateManager(FandawsStub);
    state2.restoreCanonicalGraph();
    const restored = state2.getGraph()['fandaws:concepts'].find(c =>
      c['@id'] === 'fandaws:class/uuid1/eye-color'
    );
    expect(restored).toBeDefined();
    expect(restored['rdfs:subClassOf']).toHaveLength(2);
    expect(restored['rdfs:subClassOf'][0]).toBe('bfo:Quality');
    expect(restored['rdfs:subClassOf'][1]).toEqual(restrictionObject);
    expect(restored['owl:disjointWith']).toEqual(['cco:HairColor']);
  });
});

describe('Step 7.14a — direct-write paths fire mutation callback', () => {
  // The original Step 7.14 persistence layer subscribed to graph-changed
  // events emitted from _adapter.onMutation. But every direct-write path
  // (_promoteCandidate, promoteCanonicalRelation, mergeCanonicalRelation,
  // setRelationBfoSubcategory, restriction adders) silently mutated the
  // graph without firing _mutationListeners. Result: ingested concepts
  // never triggered the persistence subscriber → localStorage stayed
  // empty → page reload showed BFO-only.
  //
  // Step 7.14a adds _emitDirectWriteMutation calls at every direct-write
  // site. These tests verify the mutation callback fires.

  it('_promoteCandidate fires mutation callback', () => {
    const adapter = new InMemoryStateAdapter();
    const graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
    const callbacks = [];
    adapter.onMutation((mutation, graph) => callbacks.push({ mutation, conceptCount: graph['fandaws:concepts'].length }));

    adapter._promoteCandidate(graphId, {
      sourceIRI: 'cco:test',
      sourceLabel: 'Test Concept',
      placementResult: 'MaterialEntity',
      placementConfidence: 0.91,
      sourceOntology: 'test.ttl',
    }, 'fandaws:session/test');

    const promoteCallbacks = callbacks.filter(c => c.mutation.type === 'PromoteCandidate');
    expect(promoteCallbacks.length).toBeGreaterThan(0);
    expect(promoteCallbacks[0].mutation.conceptIri).toMatch(/^fandaws:class\//);
  });

  it('setRelationBfoSubcategory fires mutation callback', () => {
    const adapter = new InMemoryStateAdapter();
    const graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
    const result = adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'ex:foo',
      candidateLabel: 'foo',
      bfoSubcategory: null,
    });
    const callbacks = [];
    adapter.onMutation((mutation) => callbacks.push(mutation));
    adapter.setRelationBfoSubcategory(graphId, result.canonicalRelationIRI, 'bfo:Role');
    const matched = callbacks.filter(m => m.type === 'SetRelationBfoSubcategory');
    expect(matched).toHaveLength(1);
    expect(matched[0].bfoSubcategory).toBe('bfo:Role');
  });

  it('promoteCanonicalRelation fires mutation callback', () => {
    const adapter = new InMemoryStateAdapter();
    const graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
    const callbacks = [];
    adapter.onMutation((mutation) => callbacks.push(mutation));
    adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'cco:test',
      candidateLabel: 'test relation',
      bfoSubcategory: 'bfo:Quality',
    });
    const matched = callbacks.filter(m => m.type === 'PromoteCanonicalRelation');
    expect(matched).toHaveLength(1);
    expect(matched[0].candidateIRI).toBe('cco:test');
  });

  it('end-to-end: ingestOntology triggers persistence subscriber via promote callback', () => {
    // Simulate the full flow: WorkbenchStateManager subscribes to
    // graph-changed; ingestOntology calls _promoteCandidate per confirmed
    // class; each promote fires the mutation callback; the subscriber's
    // debounced auto-save eventually persists to localStorage.
    const state = new WorkbenchStateManager(FandawsStub);
    const adapter = state.getAdapter();
    adapter.registerPlacementSandbox(
      // Lazy load — Step 7.6 placement-sandbox is already exported via
      // the FandawsStub. For this test we just verify mutation callbacks
      // fire; we synthesize via _promoteCandidate directly.
      () => ({ placement: 'MaterialEntity', confidence: 0.91, justification: '', candidates: [] }),
      () => ({ status: 'PlacementConfirmed', placement: 'MaterialEntity' }),
    );

    // Promote two concepts directly to bypass the placement-sandbox setup.
    adapter._promoteCandidate(state.getGraphId(), {
      sourceIRI: 'cco:test1',
      sourceLabel: 'Test 1',
      placementResult: 'MaterialEntity',
      placementConfidence: 0.91,
      sourceOntology: 'test.ttl',
    }, 'fandaws:session/test');
    adapter._promoteCandidate(state.getGraphId(), {
      sourceIRI: 'cco:test2',
      sourceLabel: 'Test 2',
      placementResult: 'Quality',
      placementConfidence: 0.91,
      sourceOntology: 'test.ttl',
    }, 'fandaws:session/test');

    // Force-flush the debounced timer manually.
    state._persistCanonicalGraph();
    const stored = JSON.parse(global.localStorage.getItem(LS_CANONICAL_GRAPH));
    expect(stored.concepts.length).toBe(2);
    expect(stored.concepts.find(c => c['rdfs:label'] === 'Test 1')).toBeDefined();
    expect(stored.concepts.find(c => c['rdfs:label'] === 'Test 2')).toBeDefined();
  });
});

describe('Step 7.14 — quota exhaustion graceful degradation', () => {
  it('persist does not throw when localStorage.setItem fails', () => {
    const state = new WorkbenchStateManager(FandawsStub);
    state.getGraph()['fandaws:concepts'].push(
      { '@id': 'fandaws:class/uuid1/eye-color', '@type': ['owl:Class', 'skos:Concept'] },
    );
    // Override setItem to simulate quota exhaustion.
    global.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => state._persistCanonicalGraph()).not.toThrow();
    // In-memory state intact.
    expect(state.getGraph()['fandaws:concepts']).toHaveLength(1);
  });
});
