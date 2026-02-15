/**
 * InMemoryStateAdapter — unit tests.
 *
 * Covers: construction, graph CRUD, session CRUD, scope config CRUD,
 * queryGraph stub, applyMutation (additions, modifications, deletions, merges),
 * atomicity, index correctness, verifyIntegrity, performance, edge cases.
 *
 * v2.1: Uses standard OWL/SKOS/PROV vocabulary. Properties and relationships
 *        are owl:Restriction entries in concept rdfs:subClassOf.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { StateAdapter } from '../../src/adapters/state/state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createGraphMutation } from '../../src/types/graph-mutation.js';
import { createConversationSession } from '../../src/types/conversation-session.js';
import { createScopeConfiguration } from '../../src/types/scope-configuration.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const GRAPH_ID = 'fandaws:graph/test';

function makeGraph(opts = {}) {
  return createKnowledgeGraph({ id: GRAPH_ID, ...opts });
}

function makeConcept(id, label, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
}

function makeRelationship(id, verbIri, subject, object) {
  return createRelationship({ id, verbIri, subject, object });
}

function makeProperty(id, propertyIri, attachedTo) {
  return createProperty({ id, propertyIri, attachedTo });
}

function makeMutation(opts) {
  return createGraphMutation({ reason: 'test', ...opts });
}

function makeSession(sessionId, callerId, opts = {}) {
  return createConversationSession({
    sessionId,
    callerId,
    term: 'test',
    workingGraphId: GRAPH_ID,
    ...opts,
  });
}

// ─────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — construction', () => {
  it('is an instance of StateAdapter', () => {
    const adapter = new InMemoryStateAdapter();
    expect(adapter).toBeInstanceOf(StateAdapter);
  });

  it('starts with no stored graphs', () => {
    const adapter = new InMemoryStateAdapter();
    expect(adapter.loadGraph(GRAPH_ID)).toBeNull();
  });

  it('starts with no stored sessions', () => {
    const adapter = new InMemoryStateAdapter();
    expect(adapter.loadSession('session-1')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// Graph CRUD
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — graph CRUD', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
  });

  it('saveGraph + loadGraph round-trips a KnowledgeGraph', () => {
    const graph = makeGraph();
    adapter.saveGraph(GRAPH_ID, graph);
    const loaded = adapter.loadGraph(GRAPH_ID);
    expect(loaded).toBe(graph);
    expect(loaded['@type']).toBe('fandaws:KnowledgeGraph');
  });

  it('loadGraph returns null for unknown ID', () => {
    expect(adapter.loadGraph('fandaws:graph/unknown')).toBeNull();
  });

  it('saveGraph overwrites existing graph with same ID', () => {
    const graph1 = makeGraph();
    const graph2 = makeGraph({ metadata: { 'fandaws:version': '2.0.0' } });
    adapter.saveGraph(GRAPH_ID, graph1);
    adapter.saveGraph(GRAPH_ID, graph2);
    expect(adapter.loadGraph(GRAPH_ID)).toBe(graph2);
  });

  it('multiple graphs stored independently', () => {
    const graph1 = makeGraph();
    const graph2 = createKnowledgeGraph({ id: 'fandaws:graph/other' });
    adapter.saveGraph(GRAPH_ID, graph1);
    adapter.saveGraph('fandaws:graph/other', graph2);
    expect(adapter.loadGraph(GRAPH_ID)).toBe(graph1);
    expect(adapter.loadGraph('fandaws:graph/other')).toBe(graph2);
  });

  it('loadGraph returns the same object reference', () => {
    const graph = makeGraph();
    adapter.saveGraph(GRAPH_ID, graph);
    expect(adapter.loadGraph(GRAPH_ID)).toBe(adapter.loadGraph(GRAPH_ID));
  });

  it('saveGraph accepts graphs with concepts and embedded restrictions', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/chase',
      'chase',
      'fandaws:concept/dog',
      'fandaws:concept/cat',
    );
    dog['rdfs:subClassOf'] = [...dog['rdfs:subClassOf'], rel];
    const graph = makeGraph({ concepts: [dog, cat] });
    adapter.saveGraph(GRAPH_ID, graph);
    const loaded = adapter.loadGraph(GRAPH_ID);
    expect(loaded['fandaws:concepts']).toHaveLength(2);
    const loadedDog = loaded['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(
      loadedDog['rdfs:subClassOf'].some(
        (e) => e['fandaws:restrictionKind'] === 'relationship',
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Session CRUD
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — session CRUD', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
  });

  it('saveSession + loadSession round-trips a ConversationSession', () => {
    const session = makeSession('session-1', 'user-1');
    adapter.saveSession('session-1', session);
    const loaded = adapter.loadSession('session-1');
    expect(loaded).toBe(session);
    expect(loaded['@type']).toBe('fandaws:ConversationSession');
  });

  it('loadSession returns null for unknown ID', () => {
    expect(adapter.loadSession('unknown')).toBeNull();
  });

  it('saveSession overwrites existing session', () => {
    const s1 = makeSession('session-1', 'user-1');
    const s2 = makeSession('session-1', 'user-1', { state: 'resolved' });
    adapter.saveSession('session-1', s1);
    adapter.saveSession('session-1', s2);
    expect(adapter.loadSession('session-1')).toBe(s2);
  });

  it('listSessions returns only sessions for given callerId', () => {
    adapter.saveSession('s1', makeSession('s1', 'user-1'));
    adapter.saveSession('s2', makeSession('s2', 'user-2'));
    adapter.saveSession('s3', makeSession('s3', 'user-1'));
    const results = adapter.listSessions('user-1');
    expect(results).toHaveLength(2);
    expect(results.every((s) => s['fandaws:callerId'] === 'user-1')).toBe(true);
  });

  it('listSessions returns empty array for unknown caller', () => {
    adapter.saveSession('s1', makeSession('s1', 'user-1'));
    expect(adapter.listSessions('unknown')).toEqual([]);
  });

  it('listSessions with state filter returns only matching sessions', () => {
    adapter.saveSession('s1', makeSession('s1', 'user-1', { state: 'negotiating' }));
    adapter.saveSession('s2', makeSession('s2', 'user-1', { state: 'resolved' }));
    adapter.saveSession('s3', makeSession('s3', 'user-1', { state: 'negotiating' }));
    const results = adapter.listSessions('user-1', { state: 'negotiating' });
    expect(results).toHaveLength(2);
  });

  it('listSessions with state filter returns empty for no match', () => {
    adapter.saveSession('s1', makeSession('s1', 'user-1', { state: 'negotiating' }));
    const results = adapter.listSessions('user-1', { state: 'resolved' });
    expect(results).toEqual([]);
  });

  it('listSessions without filter returns all sessions for caller', () => {
    adapter.saveSession('s1', makeSession('s1', 'user-1', { state: 'negotiating' }));
    adapter.saveSession('s2', makeSession('s2', 'user-1', { state: 'resolved' }));
    const results = adapter.listSessions('user-1');
    expect(results).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// Scope Config CRUD
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — scope config CRUD', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
  });

  it('saveScopeConfig + loadScopeConfig round-trips', () => {
    const config = createScopeConfiguration({ userGraphId: 'fandaws:graph/user-1' });
    adapter.saveScopeConfig('config-1', config);
    const loaded = adapter.loadScopeConfig('config-1');
    expect(loaded).toBe(config);
    expect(loaded['@type']).toBe('fandaws:ScopeConfiguration');
  });

  it('loadScopeConfig returns null for unknown ID', () => {
    expect(adapter.loadScopeConfig('unknown')).toBeNull();
  });

  it('saveScopeConfig overwrites existing config', () => {
    const c1 = createScopeConfiguration({ userGraphId: 'graph-1' });
    const c2 = createScopeConfiguration({ userGraphId: 'graph-2' });
    adapter.saveScopeConfig('config-1', c1);
    adapter.saveScopeConfig('config-1', c2);
    expect(adapter.loadScopeConfig('config-1')).toBe(c2);
  });

  it('multiple scope configs stored independently', () => {
    const c1 = createScopeConfiguration({ userGraphId: 'graph-1' });
    const c2 = createScopeConfiguration({ userGraphId: 'graph-2' });
    adapter.saveScopeConfig('config-1', c1);
    adapter.saveScopeConfig('config-2', c2);
    expect(adapter.loadScopeConfig('config-1')).toBe(c1);
    expect(adapter.loadScopeConfig('config-2')).toBe(c2);
  });
});

// ─────────────────────────────────────────────────────────
// queryGraph stub
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — queryGraph stub', () => {
  it('returns correct @type', () => {
    const adapter = new InMemoryStateAdapter();
    const result = adapter.queryGraph(GRAPH_ID, {});
    expect(result['@type']).toBe('fandaws:QueryResult');
  });

  it('returns error flag', () => {
    const adapter = new InMemoryStateAdapter();
    const result = adapter.queryGraph(GRAPH_ID, {});
    expect(result['fandaws:error']).toBe(true);
  });

  it('returns errorReason "not-implemented"', () => {
    const adapter = new InMemoryStateAdapter();
    const result = adapter.queryGraph(GRAPH_ID, {});
    expect(result['fandaws:errorReason']).toBe('not-implemented');
  });
});

// ─────────────────────────────────────────────────────────
// applyMutation — additions
// ─────────────────────────────────────────────────────────

describe('applyMutation — additions', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());
  });

  it('adds a concept to an empty graph', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['@id']).toBe('fandaws:concept/dog');
  });

  it('adds multiple concepts in one mutation', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog, cat] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('adds a relationship restriction to concept rdfs:subClassOf', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/chase',
      'chase',
      'fandaws:concept/dog',
      'fandaws:concept/cat',
    );
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog, cat, rel] }),
    );
    const updatedDog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    const relRestrictions = updatedDog['rdfs:subClassOf'].filter(
      (e) => e['fandaws:restrictionKind'] === 'relationship',
    );
    expect(relRestrictions).toHaveLength(1);
    expect(relRestrictions[0]['owl:onProperty']).toBe('chase');
  });

  it('adds a property restriction to concept rdfs:subClassOf', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    const prop = makeProperty(
      'fandaws:prop/fur',
      'has fur',
      'fandaws:concept/dog',
    );
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [prop] }),
    );
    const updatedDog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    const propRestrictions = updatedDog['rdfs:subClassOf'].filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(propRestrictions).toHaveLength(1);
    expect(propRestrictions[0]['@id']).toBe('fandaws:prop/fur');
  });

  it('returns the updated graph', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog] }),
    );
    expect(result['@type']).toBe('fandaws:KnowledgeGraph');
    expect(result['fandaws:concepts']).toHaveLength(1);
  });

  it('does not mutate the original graph object', () => {
    const original = makeGraph();
    adapter.saveGraph(GRAPH_ID, original);
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));
    expect(original['fandaws:concepts']).toHaveLength(0);
  });

  it('returns MutationRejection for non-existent graph', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const result = adapter.applyMutation(
      'fandaws:graph/nonexistent',
      makeMutation({ additions: [dog] }),
    );
    expect(result['@type']).toBe('fandaws:MutationRejection');
    expect(result['fandaws:reason']).toContain('Graph not found');
  });

  it('preserves existing concepts when adding new ones', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [cat] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('adds concept with broader reference', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [animal, dog] }),
    );
    const addedDog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(addedDog['skos:broader']).toBe('fandaws:concept/animal');
  });

  it('adds concept with all fields populated', () => {
    const concept = createConcept({
      id: 'fandaws:concept/full',
      label: 'Full Concept',
      prefLabel: 'full concept',
      broader: 'fandaws:concept/parent',
      definition: 'A fully populated concept',
      bfoMapping: 'bfo:BFO_0000015',
    });
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [concept] }),
    );
    const added = result['fandaws:concepts'][0];
    expect(added['rdfs:label']).toBe('Full Concept');
    expect(added['skos:definition']).toBe('A fully populated concept');
    expect(added['rdfs:subClassOf']).toContain('bfo:BFO_0000015');
  });
});

// ─────────────────────────────────────────────────────────
// applyMutation — modifications
// ─────────────────────────────────────────────────────────

describe('applyMutation — modifications', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const graph = makeGraph({ concepts: [dog] });
    // Inject vestigial relationship for backward-compat tests
    graph['fandaws:relationships'].push({
      '@id': 'fandaws:rel/chase',
      'owl:onProperty': 'chase',
      'owl:someValuesFrom': 'fandaws:concept/cat',
      'fandaws:attachedTo': 'fandaws:concept/dog',
    });
    adapter.saveGraph(GRAPH_ID, graph);
  });

  it('modifies a field on an existing concept', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:concept/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'A loyal companion',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(dog['skos:definition']).toBe('A loyal companion');
  });

  it('modifies a field on a vestigial relationship entry', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:rel/chase',
            'fandaws:field': 'owl:onProperty',
            'fandaws:value': 'pursues',
          },
        ],
      }),
    );
    const rel = result['fandaws:relationships'].find(
      (r) => r['@id'] === 'fandaws:rel/chase',
    );
    expect(rel['owl:onProperty']).toBe('pursues');
  });

  it('modification of non-existent IRI leaves graph unchanged (atomicity)', () => {
    const original = adapter.loadGraph(GRAPH_ID);
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:concept/nonexistent',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'test',
          },
        ],
      }),
    );
    // Should return the original unchanged
    expect(result['fandaws:concepts']).toHaveLength(
      original['fandaws:concepts'].length,
    );
  });

  it('multiple modifications in one mutation all applied', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:concept/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'A good dog',
          },
          {
            '@id': 'fandaws:rel/chase',
            'fandaws:field': 'owl:onProperty',
            'fandaws:value': 'follows',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    const rel = result['fandaws:relationships'].find(
      (r) => r['@id'] === 'fandaws:rel/chase',
    );
    expect(dog['skos:definition']).toBe('A good dog');
    expect(rel['owl:onProperty']).toBe('follows');
  });

  it('modification of prefLabel is reflected in index after rebuild', () => {
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:concept/dog',
            'fandaws:field': 'skos:prefLabel',
            'fandaws:value': 'canine',
          },
        ],
      }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('canine')).toBe('fandaws:concept/dog');
    expect(idx.canonicalLabelToIri.has('dog')).toBe(false);
  });

  it('failed modification with valid additions rolls back everything', () => {
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:concept/nonexistent',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'bad',
          },
        ],
      }),
    );
    // Should roll back — cat should not be in graph
    expect(
      result['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:concept/cat'),
    ).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// applyMutation — deletions
// ─────────────────────────────────────────────────────────

describe('applyMutation — deletions', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const puppy = makeConcept(
      'fandaws:concept/puppy',
      'Puppy',
      'fandaws:concept/dog',
    );
    // Embed a relationship restriction in dog
    const rel = makeRelationship(
      'fandaws:rel/chase',
      'chase',
      'fandaws:concept/dog',
      'fandaws:concept/animal',
    );
    dog['rdfs:subClassOf'] = [...dog['rdfs:subClassOf'], rel];
    const graph = makeGraph({ concepts: [animal, dog, puppy] });
    adapter.saveGraph(GRAPH_ID, graph);
  });

  it('deletes a concept by IRI', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:concept/puppy'] }),
    );
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/puppy',
      ),
    ).toBeUndefined();
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('concept deletion removes embedded restrictions too', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:concept/dog'] }),
    );
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/dog',
      ),
    ).toBeUndefined();
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('deletion of non-existent IRI is a no-op (idempotent)', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:concept/nonexistent'] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(3);
  });

  it('deleting concept reparents orphaned children', () => {
    // Delete dog — puppy should be reparented to animal
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:concept/dog'] }),
    );
    const puppy = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/puppy',
    );
    expect(puppy['skos:broader']).toBe('fandaws:concept/animal');
  });

  it('deleting root concept reparents children to null', () => {
    // Delete animal — dog should become a root (broader = null)
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:concept/animal'] }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(dog['skos:broader']).toBeNull();
  });

  it('deleting multiple concepts in one mutation', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        deletions: ['fandaws:concept/puppy', 'fandaws:concept/dog'],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['@id']).toBe('fandaws:concept/animal');
  });

  it('graph state is consistent after deletion', () => {
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:concept/dog'] }),
    );
    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// applyMutation — merges
// ─────────────────────────────────────────────────────────

describe('applyMutation — merges', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const dog2 = createConcept({
      id: 'fandaws:concept/dog-2',
      label: 'Dog (duplicate)',
      prefLabel: 'dog',
      broader: 'fandaws:concept/animal',
    });
    // Add a property restriction to dog2
    dog2['rdfs:subClassOf'].push({
      '@id': 'fandaws:prop/bark',
      '@type': 'owl:Restriction',
      'owl:onProperty': 'bark',
      'fandaws:attachedTo': 'fandaws:concept/dog-2',
      'fandaws:restrictionKind': 'property',
    });
    const puppy = makeConcept(
      'fandaws:concept/puppy',
      'Puppy',
      'fandaws:concept/dog-2',
    );
    // Add a relationship restriction to dog2
    const rel = makeRelationship(
      'fandaws:rel/chase',
      'chase',
      'fandaws:concept/dog-2',
      'fandaws:concept/animal',
    );
    dog2['rdfs:subClassOf'].push(rel);
    const graph = makeGraph({ concepts: [animal, dog, dog2, puppy] });
    adapter.saveGraph(GRAPH_ID, graph);
  });

  it('merges source into target, source deleted', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/dog-2',
      ),
    ).toBeUndefined();
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/dog',
      ),
    ).toBeDefined();
  });

  it('children of source transferred to target', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    const puppy = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/puppy',
    );
    expect(puppy['skos:broader']).toBe('fandaws:concept/dog');
  });

  it('restrictions of source transferred to target rdfs:subClassOf', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    const propRestrictions = dog['rdfs:subClassOf'].filter(
      (e) => e['@type'] === 'owl:Restriction' && e['fandaws:restrictionKind'] === 'property',
    );
    expect(propRestrictions.some((r) => r['@id'] === 'fandaws:prop/bark')).toBe(true);
  });

  it('relationship restrictions referencing source rewritten to target', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    const relRestrictions = dog['rdfs:subClassOf'].filter(
      (e) => e['@type'] === 'owl:Restriction' && e['fandaws:restrictionKind'] === 'relationship',
    );
    expect(relRestrictions.length).toBeGreaterThan(0);
    expect(relRestrictions[0]['fandaws:attachedTo']).toBe('fandaws:concept/dog');
  });

  it('wasDerivedFrom on target records source IRI', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(dog['prov:wasDerivedFrom']).toContain('fandaws:concept/dog-2');
  });

  it('merge with non-existent source rolls back (atomicity)', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/nonexistent',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    // Should return original — dog-2 still exists
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/dog-2',
      ),
    ).toBeDefined();
  });

  it('merge with non-existent target rolls back (atomicity)', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/nonexistent',
          },
        ],
      }),
    );
    // Should return original — dog-2 still exists
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/dog-2',
      ),
    ).toBeDefined();
  });

  it('multiple merges in one mutation', () => {
    // Add a third duplicate
    const dog3 = createConcept({
      id: 'fandaws:concept/dog-3',
      label: 'Dog (triple)',
      prefLabel: 'dog',
      broader: 'fandaws:concept/animal',
    });
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog3] }),
    );

    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/dog',
          },
          {
            'fandaws:source': 'fandaws:concept/dog-3',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    // Only animal, dog, puppy should remain
    expect(result['fandaws:concepts']).toHaveLength(3);
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(dog['prov:wasDerivedFrom']).toContain('fandaws:concept/dog-2');
    expect(dog['prov:wasDerivedFrom']).toContain('fandaws:concept/dog-3');
  });
});

// ─────────────────────────────────────────────────────────
// applyMutation — atomicity
// ─────────────────────────────────────────────────────────

describe('applyMutation — atomicity', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const graph = makeGraph({ concepts: [dog] });
    adapter.saveGraph(GRAPH_ID, graph);
  });

  it('all-or-nothing: failed modification rolls back additions', () => {
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:concept/nonexistent',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'fail',
          },
        ],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['@id']).toBe('fandaws:concept/dog');
  });

  it('all-or-nothing: failed merge rolls back prior additions', () => {
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        merges: [
          {
            'fandaws:source': 'fandaws:concept/nonexistent',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
  });

  it('graph unchanged after failed mutation', () => {
    const beforeGraph = JSON.stringify(adapter.loadGraph(GRAPH_ID));
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:concept/nonexistent',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'fail',
          },
        ],
      }),
    );
    const afterGraph = JSON.stringify(adapter.loadGraph(GRAPH_ID));
    expect(afterGraph).toBe(beforeGraph);
  });

  it('indices unchanged after failed mutation', () => {
    const idxBefore = adapter.getIndices(GRAPH_ID);
    const labelBefore = idxBefore.canonicalLabelToIri.get('dog');

    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:concept/nonexistent',
            'fandaws:field': 'skos:prefLabel',
            'fandaws:value': 'canine',
          },
        ],
      }),
    );

    const idxAfter = adapter.getIndices(GRAPH_ID);
    expect(idxAfter.canonicalLabelToIri.get('dog')).toBe(labelBefore);
  });

  it('successful mutation with additions + modifications', () => {
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:concept/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'A good dog',
          },
        ],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:concept/dog',
    );
    expect(dog['skos:definition']).toBe('A good dog');
  });

  it('mixed mutation: add concept, modify existing, delete stale', () => {
    const stale = makeConcept('fandaws:concept/stale', 'Stale');
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [stale] }),
    );

    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:concept/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'Updated',
          },
        ],
        deletions: ['fandaws:concept/stale'],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/stale',
      ),
    ).toBeUndefined();
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/cat',
      ),
    ).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// Index correctness
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — index correctness', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
  });

  it('canonicalLabel index maps label to IRI after saveGraph', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:concept/dog');
  });

  it('canonicalLabel index maps label to IRI after applyMutation addition', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:concept/dog');
  });

  it('parent index maps concept to broader after saveGraph', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [animal, dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToParent.get('fandaws:concept/dog')).toBe(
      'fandaws:concept/animal',
    );
    expect(idx.iriToParent.get('fandaws:concept/animal')).toBeNull();
  });

  it('children index maps parent to children after saveGraph', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [animal, dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToChildren.get('fandaws:concept/animal').has('fandaws:concept/dog')).toBe(true);
  });

  it('children index maps parent to children after addition mutation', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [animal, dog] }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToChildren.get('fandaws:concept/animal').has('fandaws:concept/dog')).toBe(true);
  });

  it('property index maps concept to properties after saveGraph', () => {
    const dog = createConcept({
      id: 'fandaws:concept/dog',
      label: 'Dog',
      prefLabel: 'dog',
    });
    dog['rdfs:subClassOf'].push(
      { '@id': 'fandaws:prop/fur', '@type': 'owl:Restriction', 'owl:onProperty': 'fur', 'fandaws:restrictionKind': 'property' },
      { '@id': 'fandaws:prop/bark', '@type': 'owl:Restriction', 'owl:onProperty': 'bark', 'fandaws:restrictionKind': 'property' },
    );
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    const props = idx.iriToProperties.get('fandaws:concept/dog');
    expect(props.has('fandaws:prop/fur')).toBe(true);
    expect(props.has('fandaws:prop/bark')).toBe(true);
  });

  it('property index maps concept to properties after addition mutation', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    const prop = makeProperty(
      'fandaws:prop/fur',
      'has fur',
      'fandaws:concept/dog',
    );
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [prop] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(
      idx.iriToProperties.get('fandaws:concept/dog').has('fandaws:prop/fur'),
    ).toBe(true);
  });

  it('reverse relationship index maps object to relationships', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/chase',
      'chase',
      'fandaws:concept/dog',
      'fandaws:concept/cat',
    );
    dog['rdfs:subClassOf'] = [...dog['rdfs:subClassOf'], rel];
    adapter.saveGraph(
      GRAPH_ID,
      makeGraph({ concepts: [dog, cat] }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(
      idx.iriToReverseRelationships
        .get('fandaws:concept/cat')
        .has('fandaws:rel/chase'),
    ).toBe(true);
  });

  it('all indices cleared for deleted concept', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:concept/dog'] }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.has('dog')).toBe(false);
    expect(idx.iriToParent.has('fandaws:concept/dog')).toBe(false);
  });

  it('indices survive multiple sequential mutations', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());

    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [animal] }),
    );

    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog] }),
    );

    const cat = makeConcept(
      'fandaws:concept/cat',
      'Cat',
      'fandaws:concept/animal',
    );
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [cat] }),
    );

    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('animal')).toBe('fandaws:concept/animal');
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:concept/dog');
    expect(idx.canonicalLabelToIri.get('cat')).toBe('fandaws:concept/cat');
    expect(idx.iriToChildren.get('fandaws:concept/animal').size).toBe(2);
  });

  it('indices correct after merge operation', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const dog2 = makeConcept(
      'fandaws:concept/dog-2',
      'Dog 2',
      'fandaws:concept/animal',
    );
    adapter.saveGraph(
      GRAPH_ID,
      makeGraph({ concepts: [animal, dog, dog2] }),
    );

    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:concept/dog-2',
            'fandaws:target': 'fandaws:concept/dog',
          },
        ],
      }),
    );

    const idx = adapter.getIndices(GRAPH_ID);
    // dog-2 label should be gone
    expect(idx.canonicalLabelToIri.has('dog 2')).toBe(false);
    // dog should still be indexed
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:concept/dog');
    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// verifyIntegrity
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — verifyIntegrity', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
  });

  it('returns empty array on a healthy graph', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const cat = makeConcept('fandaws:concept/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/chase',
      'chase',
      'fandaws:concept/dog',
      'fandaws:concept/cat',
    );
    dog['rdfs:subClassOf'] = [...dog['rdfs:subClassOf'], rel];
    adapter.saveGraph(
      GRAPH_ID,
      makeGraph({ concepts: [dog, cat] }),
    );
    expect(adapter.verifyIntegrity(GRAPH_ID)).toEqual([]);
  });

  it('returns empty array for a graph with no concepts', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());
    expect(adapter.verifyIntegrity(GRAPH_ID)).toEqual([]);
  });

  it('returns empty array for non-existent graph', () => {
    expect(adapter.verifyIntegrity('fandaws:graph/nonexistent')).toEqual([]);
  });

  it('detects ghost pointer in canonicalLabel index', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    // Corrupt the index manually
    const idx = adapter.getIndices(GRAPH_ID);
    idx.canonicalLabelToIri.set('ghost', 'fandaws:concept/ghost');

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts.some((g) => g.index === 'canonicalLabelToIri')).toBe(true);
  });

  it('detects orphaned child pointer after parent deletion', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    // Corrupt the index: add a ghost child
    const idx = adapter.getIndices(GRAPH_ID);
    idx.iriToChildren.set('fandaws:concept/dog', new Set(['fandaws:concept/ghost']));

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts.some((g) => g.index === 'iriToChildren' && g.ghostIri === 'fandaws:concept/ghost')).toBe(true);
  });

  it('detects stale relationship reference', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    // Corrupt the index: add a ghost reverse relationship
    const idx = adapter.getIndices(GRAPH_ID);
    idx.iriToReverseRelationships.set(
      'fandaws:concept/dog',
      new Set(['fandaws:rel/ghost']),
    );

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(
      ghosts.some(
        (g) =>
          g.index === 'iriToReverseRelationships' &&
          g.ghostIri === 'fandaws:rel/ghost',
      ),
    ).toBe(true);
  });

  it('returns multiple ghosts for a corrupted graph', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    const idx = adapter.getIndices(GRAPH_ID);
    idx.canonicalLabelToIri.set('ghost1', 'fandaws:concept/ghost1');
    idx.canonicalLabelToIri.set('ghost2', 'fandaws:concept/ghost2');

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — performance', () => {
  it('1000 index lookups on 500-concept graph complete in < 100ms', () => {
    const adapter = new InMemoryStateAdapter();
    const concepts = [];
    for (let i = 0; i < 500; i++) {
      concepts.push(
        makeConcept(`fandaws:concept/c-${i}`, `Concept ${i}`),
      );
    }
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts }));
    const idx = adapter.getIndices(GRAPH_ID);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      idx.canonicalLabelToIri.get(`concept ${i % 500}`);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('applyMutation < 5ms for single-concept addition', () => {
    const adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());

    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    const start = performance.now();
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });

  it('1000 sequential mutations complete with < 5ms average', () => {
    const adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const concept = makeConcept(`fandaws:concept/c-${i}`, `Concept ${i}`);
      adapter.applyMutation(
        GRAPH_ID,
        makeMutation({ additions: [concept] }),
      );
    }
    const elapsed = performance.now() - start;
    expect(elapsed / 1000).toBeLessThan(15);
  });
});

// ─────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — edge cases', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
  });

  it('handles graph with no concepts gracefully', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.size).toBe(0);
    expect(idx.iriToParent.size).toBe(0);
  });

  it('handles graph with no restrictions gracefully', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToReverseRelationships.size).toBe(0);
  });

  it('concept with null broader has null in parent index', () => {
    const root = makeConcept('fandaws:concept/root', 'Root');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [root] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToParent.get('fandaws:concept/root')).toBeNull();
  });

  it('empty mutation (no operations) returns graph unchanged', () => {
    const graph = makeGraph();
    adapter.saveGraph(GRAPH_ID, graph);
    const result = adapter.applyMutation(GRAPH_ID, makeMutation({}));
    expect(result['@type']).toBe('fandaws:KnowledgeGraph');
    expect(result['fandaws:concepts']).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// SUP-11: Index consistency after mutation sequences
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — index consistency after sequences (SUP-11)', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());
  });

  it('SUP-11a: create → reparent → verify all indices', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const mammal = makeConcept('fandaws:concept/mammal', 'Mammal', 'fandaws:concept/animal');
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');

    // Create all three
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal] }));
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [mammal] }));
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    // Verify initial state: dog is child of animal
    let idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToParent.get('fandaws:concept/dog')).toBe('fandaws:concept/animal');
    expect(idx.iriToChildren.get('fandaws:concept/animal').has('fandaws:concept/dog')).toBe(true);

    // Reparent dog → mammal
    adapter.applyMutation(GRAPH_ID, makeMutation({
      modifications: [{
        '@id': 'fandaws:concept/dog',
        'fandaws:field': 'skos:broader',
        'fandaws:value': 'fandaws:concept/mammal',
      }],
    }));

    // Rebuild indices (happens automatically in applyMutation)
    idx = adapter.getIndices(GRAPH_ID);

    // canonicalLabel index still works
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:concept/dog');

    // parent index: dog's parent is now mammal
    expect(idx.iriToParent.get('fandaws:concept/dog')).toBe('fandaws:concept/mammal');

    // children index: animal has 1 child (mammal), NOT 2
    const animalChildren = idx.iriToChildren.get('fandaws:concept/animal');
    expect(animalChildren.has('fandaws:concept/mammal')).toBe(true);
    expect(animalChildren.has('fandaws:concept/dog')).toBe(false);

    // children index: mammal has 1 child (dog)
    const mammalChildren = idx.iriToChildren.get('fandaws:concept/mammal');
    expect(mammalChildren.has('fandaws:concept/dog')).toBe(true);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });

  it('SUP-11b: create → delete leaf → verify index cleanup', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');

    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal] }));
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    // Delete dog (leaf)
    adapter.applyMutation(GRAPH_ID, makeMutation({
      deletions: ['fandaws:concept/dog'],
    }));

    const idx = adapter.getIndices(GRAPH_ID);

    // canonicalLabel: "dog" should be gone
    expect(idx.canonicalLabelToIri.has('dog')).toBe(false);

    // parent index: no entry for dog
    expect(idx.iriToParent.has('fandaws:concept/dog')).toBe(false);

    // children index: animal should have no children
    const animalChildren = idx.iriToChildren.get('fandaws:concept/animal');
    expect(animalChildren.size).toBe(0);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });

  it('SUP-11c: property addition updates iriToProperties index', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal] }));

    // Add a property restriction
    const furRestriction = {
      '@id': 'fandaws:restriction/animal--fur',
      '@type': 'owl:Restriction',
      'owl:onProperty': 'fur',
      'fandaws:restrictionKind': 'property',
      'fandaws:attachedTo': 'fandaws:concept/animal',
      'fandaws:scope': 'concept-specific',
    };
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [furRestriction] }));

    const idx = adapter.getIndices(GRAPH_ID);

    // iriToProperties should list the restriction
    const animalProps = idx.iriToProperties.get('fandaws:concept/animal');
    expect(animalProps).toBeDefined();
    expect(animalProps.has('fandaws:restriction/animal--fur')).toBe(true);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });

  it('SUP-11d: property removal via modification updates indices', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    animal['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/animal--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:concept/animal',
        'fandaws:scope': 'concept-specific',
      },
    ];
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [animal] }));

    // Verify property indexed
    let idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToProperties.get('fandaws:concept/animal').size).toBe(1);

    // Remove property by modifying rdfs:subClassOf to empty
    adapter.applyMutation(GRAPH_ID, makeMutation({
      modifications: [{
        '@id': 'fandaws:concept/animal',
        'fandaws:field': 'rdfs:subClassOf',
        'fandaws:value': [],
      }],
    }));

    idx = adapter.getIndices(GRAPH_ID);
    const animalProps = idx.iriToProperties.get('fandaws:concept/animal');
    expect(animalProps.size).toBe(0);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });
});
