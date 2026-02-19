/**
 * InMemoryStateAdapter Serialization & Observer — Unit Tests
 *
 * SER-01 through SER-14: serialize/deserialize round-trips, onMutation observer.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createGraphMutation } from '../../src/types/graph-mutation.js';
import { createConversationSession } from '../../src/types/conversation-session.js';
import { createScopeConfiguration } from '../../src/types/scope-configuration.js';

// ── Helpers ──

function buildTestGraph() {
  const animal = createConcept({
    id: 'fandaws:class/animal',
    label: 'Animal',
    prefLabel: 'animal',
    broader: null,
  });
  const dog = createConcept({
    id: 'fandaws:class/dog',
    label: 'Dog',
    prefLabel: 'dog',
    broader: 'fandaws:class/animal',
  });
  const prop = createProperty({
    id: 'fandaws:restriction/dog/fur',
    propertyConceptIri: 'fandaws:property/fur',
    propertyLabel: 'fur',
    attachedTo: 'fandaws:class/dog',
  });
  // Attach property to dog's subClassOf
  dog['rdfs:subClassOf'] = [
    ...(dog['rdfs:subClassOf'] || []).filter((e) => typeof e === 'string'),
    prop,
  ];
  // Add broader string entry
  if (dog['skos:broader'] && !dog['rdfs:subClassOf'].includes(dog['skos:broader'])) {
    dog['rdfs:subClassOf'] = [dog['skos:broader'], ...dog['rdfs:subClassOf'].filter((e) => typeof e !== 'string')];
  }

  const rel = createRelationship({
    id: 'fandaws:restriction/dog/chases/cat',
    verbIri: 'fandaws:property/chase',
    subject: 'fandaws:class/dog',
    object: 'fandaws:class/animal',
  });
  dog['rdfs:subClassOf'].push(rel);

  const graph = createKnowledgeGraph({ id: 'fandaws:graph/test' });
  graph['fandaws:concepts'] = [animal, dog];
  return graph;
}

function populateAdapter() {
  const adapter = new InMemoryStateAdapter();
  const graph = buildTestGraph();
  adapter.saveGraph('fandaws:graph/test', graph);

  const session = createConversationSession({
    sessionId: 'fandaws:session/test-1',
    callerId: 'user-test',
    term: 'dog',
    workingGraphId: 'fandaws:graph/test',
  });
  adapter.saveSession('fandaws:session/test-1', session);

  const scopeConfig = createScopeConfiguration({
    sessionId: 'fandaws:session/test-1',
    rootConcept: 'fandaws:class/animal',
  });
  adapter.saveScopeConfig('fandaws:scope/test-1', scopeConfig);

  return adapter;
}

// ── SER: Serialize Tests ──

describe('InMemoryStateAdapter serialize()', () => {
  // SER-01
  it('returns plain object with graphs, sessions, scopeConfigs keys', () => {
    const adapter = populateAdapter();
    const snapshot = adapter.serialize();
    expect(snapshot).toHaveProperty('graphs');
    expect(snapshot).toHaveProperty('sessions');
    expect(snapshot).toHaveProperty('scopeConfigs');
    expect(typeof snapshot.graphs).toBe('object');
    expect(typeof snapshot.sessions).toBe('object');
    expect(typeof snapshot.scopeConfigs).toBe('object');
  });

  // SER-02
  it('returns empty objects for empty adapter', () => {
    const adapter = new InMemoryStateAdapter();
    const snapshot = adapter.serialize();
    expect(Object.keys(snapshot.graphs)).toHaveLength(0);
    expect(Object.keys(snapshot.sessions)).toHaveLength(0);
    expect(Object.keys(snapshot.scopeConfigs)).toHaveLength(0);
  });

  // SER-14
  it('output is JSON-serializable (no Maps, Sets, or circular refs)', () => {
    const adapter = populateAdapter();
    const snapshot = adapter.serialize();
    const json = JSON.stringify(snapshot);
    const parsed = JSON.parse(json);
    // Round-trip through JSON should produce equivalent object
    expect(parsed.graphs['fandaws:graph/test']['fandaws:concepts']).toHaveLength(2);
    expect(parsed.sessions['fandaws:session/test-1']['fandaws:callerId']).toBe('user-test');
  });
});

// ── SER: Deserialize Tests ──

describe('InMemoryStateAdapter.deserialize()', () => {
  // SER-03
  it('rebuilds adapter with correct graph data', () => {
    const original = populateAdapter();
    const snapshot = original.serialize();
    const restored = InMemoryStateAdapter.deserialize(snapshot);
    const graph = restored.loadGraph('fandaws:graph/test');
    expect(graph).not.toBeNull();
    expect(graph['fandaws:concepts']).toHaveLength(2);
    expect(graph['fandaws:concepts'][1]['rdfs:label']).toBe('Dog');
  });

  // SER-04
  it('rebuilds all 5 indices correctly', () => {
    const original = populateAdapter();
    const snapshot = original.serialize();
    const restored = InMemoryStateAdapter.deserialize(snapshot);
    const indices = restored.getIndices('fandaws:graph/test');

    expect(indices).not.toBeNull();
    // Index 1: canonicalLabelToIri
    expect(indices.canonicalLabelToIri.get('animal')).toBe('fandaws:class/animal');
    expect(indices.canonicalLabelToIri.get('dog')).toBe('fandaws:class/dog');
    // Index 2: iriToParent
    expect(indices.iriToParent.get('fandaws:class/dog')).toBe('fandaws:class/animal');
    expect(indices.iriToParent.get('fandaws:class/animal')).toBeNull();
    // Index 3: iriToChildren
    expect(indices.iriToChildren.get('fandaws:class/animal').has('fandaws:class/dog')).toBe(true);
    // Index 4: iriToProperties
    expect(indices.iriToProperties.get('fandaws:class/dog').size).toBeGreaterThanOrEqual(1);
    // Index 5: iriToReverseRelationships
    expect(indices.iriToReverseRelationships.get('fandaws:class/animal').size).toBeGreaterThanOrEqual(1);
  });

  // SER-05
  it('round-trip produces equivalent adapter (loadGraph returns same data)', () => {
    const original = populateAdapter();
    const snapshot = original.serialize();
    const restored = InMemoryStateAdapter.deserialize(snapshot);

    const origGraph = original.loadGraph('fandaws:graph/test');
    const restoredGraph = restored.loadGraph('fandaws:graph/test');
    expect(JSON.stringify(restoredGraph)).toBe(JSON.stringify(origGraph));
  });

  // SER-06
  it('round-trip preserves sessions', () => {
    const original = populateAdapter();
    const snapshot = original.serialize();
    const restored = InMemoryStateAdapter.deserialize(snapshot);

    const session = restored.loadSession('fandaws:session/test-1');
    expect(session).not.toBeNull();
    expect(session['fandaws:callerId']).toBe('user-test');
    expect(session['fandaws:term']).toBe('dog');
  });

  // SER-07
  it('round-trip preserves scope configs', () => {
    const original = populateAdapter();
    const snapshot = original.serialize();
    const restored = InMemoryStateAdapter.deserialize(snapshot);

    const config = restored.loadScopeConfig('fandaws:scope/test-1');
    expect(config).not.toBeNull();
  });

  // SER-13
  it('handles malformed/missing keys gracefully', () => {
    expect(() => InMemoryStateAdapter.deserialize(null)).not.toThrow();
    expect(() => InMemoryStateAdapter.deserialize(undefined)).not.toThrow();
    expect(() => InMemoryStateAdapter.deserialize(42)).not.toThrow();
    expect(() => InMemoryStateAdapter.deserialize('bad')).not.toThrow();
    expect(() => InMemoryStateAdapter.deserialize({})).not.toThrow();

    const empty = InMemoryStateAdapter.deserialize(null);
    expect(empty.loadGraph('anything')).toBeNull();
  });
});

// ── SER: onMutation Tests ──

describe('InMemoryStateAdapter onMutation()', () => {
  // SER-08
  it('callback fires after successful applyMutation()', () => {
    const adapter = new InMemoryStateAdapter();
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/obs' });
    adapter.saveGraph('fandaws:graph/obs', graph);

    let called = false;
    adapter.onMutation(() => { called = true; });

    const concept = createConcept({
      id: 'fandaws:class/test',
      label: 'Test',
      prefLabel: 'test',
    });
    const mutation = createGraphMutation({
      additions: [concept],
      reason: 'test addition',
    });
    adapter.applyMutation('fandaws:graph/obs', mutation);
    expect(called).toBe(true);
  });

  // SER-09
  it('callback receives (mutation, updatedGraph) args', () => {
    const adapter = new InMemoryStateAdapter();
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/obs' });
    adapter.saveGraph('fandaws:graph/obs', graph);

    let receivedMutation = null;
    let receivedGraph = null;
    adapter.onMutation((m, g) => { receivedMutation = m; receivedGraph = g; });

    const concept = createConcept({
      id: 'fandaws:class/test',
      label: 'Test',
      prefLabel: 'test',
    });
    const mutation = createGraphMutation({
      additions: [concept],
      reason: 'test addition',
    });
    adapter.applyMutation('fandaws:graph/obs', mutation);

    expect(receivedMutation).toBe(mutation);
    expect(receivedGraph).not.toBeNull();
    expect(receivedGraph['fandaws:concepts'].length).toBeGreaterThanOrEqual(1);
  });

  // SER-10
  it('does NOT fire on rejected mutation (graph not found)', () => {
    const adapter = new InMemoryStateAdapter();
    let called = false;
    adapter.onMutation(() => { called = true; });

    const mutation = createGraphMutation({
      additions: [],
      reason: 'no graph',
    });
    adapter.applyMutation('fandaws:graph/nonexistent', mutation);
    expect(called).toBe(false);
  });

  // SER-11
  it('unsubscribe function works', () => {
    const adapter = new InMemoryStateAdapter();
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/obs' });
    adapter.saveGraph('fandaws:graph/obs', graph);

    let callCount = 0;
    const unsub = adapter.onMutation(() => { callCount++; });

    const concept = createConcept({ id: 'fandaws:class/a', label: 'A', prefLabel: 'a' });
    const mutation = createGraphMutation({ additions: [concept], reason: 'test' });
    adapter.applyMutation('fandaws:graph/obs', mutation);
    expect(callCount).toBe(1);

    unsub();

    const concept2 = createConcept({ id: 'fandaws:class/b', label: 'B', prefLabel: 'b' });
    const mutation2 = createGraphMutation({ additions: [concept2], reason: 'test2' });
    adapter.applyMutation('fandaws:graph/obs', mutation2);
    expect(callCount).toBe(1); // Not incremented
  });

  // SER-12
  it('listener throwing does not prevent mutation or other listeners', () => {
    const adapter = new InMemoryStateAdapter();
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/obs' });
    adapter.saveGraph('fandaws:graph/obs', graph);

    let secondCalled = false;
    adapter.onMutation(() => { throw new Error('boom'); });
    adapter.onMutation(() => { secondCalled = true; });

    const concept = createConcept({ id: 'fandaws:class/c', label: 'C', prefLabel: 'c' });
    const mutation = createGraphMutation({ additions: [concept], reason: 'test' });
    const result = adapter.applyMutation('fandaws:graph/obs', mutation);

    // Mutation still succeeded
    expect(result['fandaws:concepts'].length).toBeGreaterThanOrEqual(1);
    // Second listener still called
    expect(secondCalled).toBe(true);
  });
});

// ── toJSON ──

describe('InMemoryStateAdapter toJSON()', () => {
  it('returns a JSON string', () => {
    const adapter = populateAdapter();
    const json = adapter.toJSON();
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.graphs).toBeDefined();
    expect(parsed.sessions).toBeDefined();
  });
});
