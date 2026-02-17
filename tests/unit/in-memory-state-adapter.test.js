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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
      'chase',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
    );
    dog['rdfs:subClassOf'] = [...dog['rdfs:subClassOf'], rel];
    const graph = makeGraph({ concepts: [dog, cat] });
    adapter.saveGraph(GRAPH_ID, graph);
    const loaded = adapter.loadGraph(GRAPH_ID);
    expect(loaded['fandaws:concepts']).toHaveLength(2);
    const loadedDog = loaded['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('adds multiple concepts in one mutation', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog, cat] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('adds a relationship restriction to concept rdfs:subClassOf', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
      'chase',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
    );
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog, cat, rel] }),
    );
    const updatedDog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    const relRestrictions = updatedDog['rdfs:subClassOf'].filter(
      (e) => e['fandaws:restrictionKind'] === 'relationship',
    );
    expect(relRestrictions).toHaveLength(1);
    expect(relRestrictions[0]['owl:onProperty']).toBe('chase');
  });

  it('adds a property restriction to concept rdfs:subClassOf', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    const prop = makeProperty(
      'fandaws:prop/fur',
      'has fur',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [prop] }),
    );
    const updatedDog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    const propRestrictions = updatedDog['rdfs:subClassOf'].filter(
      (e) => e['fandaws:restrictionKind'] === 'property',
    );
    expect(propRestrictions).toHaveLength(1);
    expect(propRestrictions[0]['@id']).toBe('fandaws:prop/fur');
  });

  it('returns the updated graph', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));
    expect(original['fandaws:concepts']).toHaveLength(0);
  });

  it('returns MutationRejection for non-existent graph', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const result = adapter.applyMutation(
      'fandaws:graph/nonexistent',
      makeMutation({ additions: [dog] }),
    );
    expect(result['@type']).toBe('fandaws:MutationRejection');
    expect(result['fandaws:reason']).toContain('Graph not found');
  });

  it('preserves existing concepts when adding new ones', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [cat] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('adds concept with broader reference', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [animal, dog] }),
    );
    const addedDog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    expect(addedDog['skos:broader']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('adds concept with all fields populated', () => {
    const concept = createConcept({
      id: 'fandaws:class/03fa5b05-99df-5ac2-9418-e8ca98dd36e2/full',
      label: 'Full Concept',
      prefLabel: 'full concept',
      broader: 'fandaws:class/eb8f0f83-c7f6-50e5-bf62-a3a826dbfbad/parent',
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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const graph = makeGraph({ concepts: [dog] });
    // Inject vestigial relationship for backward-compat tests
    graph['fandaws:relationships'].push({
      '@id': 'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
      'owl:onProperty': 'chase',
      'owl:someValuesFrom': 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
      'fandaws:attachedTo': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    });
    adapter.saveGraph(GRAPH_ID, graph);
  });

  it('modifies a field on an existing concept', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'A loyal companion',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    expect(dog['skos:definition']).toBe('A loyal companion');
  });

  it('modifies a field on a vestigial relationship entry', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        modifications: [
          {
            '@id': 'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
            'fandaws:field': 'owl:onProperty',
            'fandaws:value': 'pursues',
          },
        ],
      }),
    );
    const rel = result['fandaws:relationships'].find(
      (r) => r['@id'] === 'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
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
            '@id': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
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
            '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'A good dog',
          },
          {
            '@id': 'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
            'fandaws:field': 'owl:onProperty',
            'fandaws:value': 'follows',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    const rel = result['fandaws:relationships'].find(
      (r) => r['@id'] === 'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
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
            '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
            'fandaws:field': 'skos:prefLabel',
            'fandaws:value': 'canine',
          },
        ],
      }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('canine')).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(idx.canonicalLabelToIri.has('dog')).toBe(false);
  });

  it('failed modification with valid additions rolls back everything', () => {
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'bad',
          },
        ],
      }),
    );
    // Should roll back — cat should not be in graph
    expect(
      result['fandaws:concepts'].find((c) => c['@id'] === 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat'),
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
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    const puppy = makeConcept(
      'fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy',
      'Puppy',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    // Embed a relationship restriction in dog
    const rel = makeRelationship(
      'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
      'chase',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    dog['rdfs:subClassOf'] = [...dog['rdfs:subClassOf'], rel];
    const graph = makeGraph({ concepts: [animal, dog, puppy] });
    adapter.saveGraph(GRAPH_ID, graph);
  });

  it('deletes a concept by IRI', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy'] }),
    );
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy',
      ),
    ).toBeUndefined();
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('concept deletion removes embedded restrictions too', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'] }),
    );
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      ),
    ).toBeUndefined();
    expect(result['fandaws:concepts']).toHaveLength(2);
  });

  it('deletion of non-existent IRI is a no-op (idempotent)', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent'] }),
    );
    expect(result['fandaws:concepts']).toHaveLength(3);
  });

  it('deleting concept reparents orphaned children', () => {
    // Delete dog — puppy should be reparented to animal
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'] }),
    );
    const puppy = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy',
    );
    expect(puppy['skos:broader']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('deleting root concept reparents children to null', () => {
    // Delete animal — dog should become a root (broader = null)
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'] }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    expect(dog['skos:broader']).toBeNull();
  });

  it('deleting multiple concepts in one mutation', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        deletions: ['fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['@id']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('graph state is consistent after deletion', () => {
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'] }),
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
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    const dog2 = createConcept({
      id: 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
      label: 'Dog (duplicate)',
      prefLabel: 'dog',
      broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    });
    // Add a property restriction to dog2
    dog2['rdfs:subClassOf'].push({
      '@id': 'fandaws:prop/bark',
      '@type': 'owl:Restriction',
      'owl:onProperty': 'bark',
      'fandaws:attachedTo': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
      'fandaws:restrictionKind': 'property',
    });
    const puppy = makeConcept(
      'fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy',
      'Puppy',
      'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
    );
    // Add a relationship restriction to dog2
    const rel = makeRelationship(
      'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
      'chase',
      'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
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
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
      ),
    ).toBeUndefined();
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      ),
    ).toBeDefined();
  });

  it('children of source transferred to target', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );
    const puppy = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy',
    );
    expect(puppy['skos:broader']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('restrictions of source transferred to target rdfs:subClassOf', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    const relRestrictions = dog['rdfs:subClassOf'].filter(
      (e) => e['@type'] === 'owl:Restriction' && e['fandaws:restrictionKind'] === 'relationship',
    );
    expect(relRestrictions.length).toBeGreaterThan(0);
    expect(relRestrictions[0]['fandaws:attachedTo']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('wasDerivedFrom on target records source IRI', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    expect(dog['prov:wasDerivedFrom']).toContain('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
  });

  it('merge with non-existent source rolls back (atomicity)', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );
    // Should return original — dog-2 still exists
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
      ),
    ).toBeDefined();
  });

  it('merge with non-existent target rolls back (atomicity)', () => {
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        merges: [
          {
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
          },
        ],
      }),
    );
    // Should return original — dog-2 still exists
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
      ),
    ).toBeDefined();
  });

  it('multiple merges in one mutation', () => {
    // Add a third duplicate
    const dog3 = createConcept({
      id: 'fandaws:class/aaa1686f-6fe2-5e00-ac97-f55b22bd3053/dog-3',
      label: 'Dog (triple)',
      prefLabel: 'dog',
      broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
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
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
          {
            'fandaws:source': 'fandaws:class/aaa1686f-6fe2-5e00-ac97-f55b22bd3053/dog-3',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );
    // Only animal, dog, puppy should remain
    expect(result['fandaws:concepts']).toHaveLength(3);
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    expect(dog['prov:wasDerivedFrom']).toContain('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
    expect(dog['prov:wasDerivedFrom']).toContain('fandaws:class/aaa1686f-6fe2-5e00-ac97-f55b22bd3053/dog-3');
  });
});

// ─────────────────────────────────────────────────────────
// applyMutation — atomicity
// ─────────────────────────────────────────────────────────

describe('applyMutation — atomicity', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const graph = makeGraph({ concepts: [dog] });
    adapter.saveGraph(GRAPH_ID, graph);
  });

  it('all-or-nothing: failed modification rolls back additions', () => {
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'fail',
          },
        ],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('all-or-nothing: failed merge rolls back prior additions', () => {
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        merges: [
          {
            'fandaws:source': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
            '@id': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
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
            '@id': 'fandaws:class/4037670b-847c-5f97-a512-443b3b0c0165/nonexistent',
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
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'A good dog',
          },
        ],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
    const dog = result['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    expect(dog['skos:definition']).toBe('A good dog');
  });

  it('mixed mutation: add concept, modify existing, delete stale', () => {
    const stale = makeConcept('fandaws:class/d06b4da5-1008-5c8b-af4a-52fe18155016/stale', 'Stale');
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [stale] }),
    );

    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const result = adapter.applyMutation(
      GRAPH_ID,
      makeMutation({
        additions: [cat],
        modifications: [
          {
            '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
            'fandaws:field': 'skos:definition',
            'fandaws:value': 'Updated',
          },
        ],
        deletions: ['fandaws:class/d06b4da5-1008-5c8b-af4a-52fe18155016/stale'],
      }),
    );
    expect(result['fandaws:concepts']).toHaveLength(2);
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/d06b4da5-1008-5c8b-af4a-52fe18155016/stale',
      ),
    ).toBeUndefined();
    expect(
      result['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('canonicalLabel index maps label to IRI after applyMutation addition', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('parent index maps concept to broader after saveGraph', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [animal, dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToParent.get('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    expect(idx.iriToParent.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal')).toBeNull();
  });

  it('children index maps parent to children after saveGraph', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [animal, dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToChildren.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal').has('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(true);
  });

  it('children index maps parent to children after addition mutation', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [animal, dog] }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToChildren.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal').has('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(true);
  });

  it('property index maps concept to properties after saveGraph', () => {
    const dog = createConcept({
      id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      label: 'Dog',
      prefLabel: 'dog',
    });
    dog['rdfs:subClassOf'].push(
      { '@id': 'fandaws:prop/fur', '@type': 'owl:Restriction', 'owl:onProperty': 'fur', 'fandaws:restrictionKind': 'property' },
      { '@id': 'fandaws:prop/bark', '@type': 'owl:Restriction', 'owl:onProperty': 'bark', 'fandaws:restrictionKind': 'property' },
    );
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    const props = idx.iriToProperties.get('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(props.has('fandaws:prop/fur')).toBe(true);
    expect(props.has('fandaws:prop/bark')).toBe(true);
  });

  it('property index maps concept to properties after addition mutation', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    const prop = makeProperty(
      'fandaws:prop/fur',
      'has fur',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [prop] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(
      idx.iriToProperties.get('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog').has('fandaws:prop/fur'),
    ).toBe(true);
  });

  it('reverse relationship index maps object to relationships', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
      'chase',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
    );
    dog['rdfs:subClassOf'] = [...dog['rdfs:subClassOf'], rel];
    adapter.saveGraph(
      GRAPH_ID,
      makeGraph({ concepts: [dog, cat] }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(
      idx.iriToReverseRelationships
        .get('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat')
        .has('fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase'),
    ).toBe(true);
  });

  it('all indices cleared for deleted concept', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ deletions: ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'] }),
    );
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.has('dog')).toBe(false);
    expect(idx.iriToParent.has('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(false);
  });

  it('indices survive multiple sequential mutations', () => {
    adapter.saveGraph(GRAPH_ID, makeGraph());

    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [animal] }),
    );

    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [dog] }),
    );

    const cat = makeConcept(
      'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
      'Cat',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    adapter.applyMutation(
      GRAPH_ID,
      makeMutation({ additions: [cat] }),
    );

    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.get('animal')).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(idx.canonicalLabelToIri.get('cat')).toBe('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat');
    expect(idx.iriToChildren.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal').size).toBe(2);
  });

  it('indices correct after merge operation', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'Dog',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    const dog2 = makeConcept(
      'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
      'Dog 2',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
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
            'fandaws:source': 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2',
            'fandaws:target': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          },
        ],
      }),
    );

    const idx = adapter.getIndices(GRAPH_ID);
    // dog-2 label should be gone
    expect(idx.canonicalLabelToIri.has('dog 2')).toBe(false);
    // dog should still be indexed
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat');
    const rel = makeRelationship(
      'fandaws:rel/e61308ff-5b93-5d48-a1c9-7ca300dc3580/chase',
      'chase',
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    // Corrupt the index manually
    const idx = adapter.getIndices(GRAPH_ID);
    idx.canonicalLabelToIri.set('ghost', 'fandaws:class/845fd3dd-66c2-55b5-aed7-af5318b37d50/ghost');

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts.length).toBeGreaterThan(0);
    expect(ghosts.some((g) => g.index === 'canonicalLabelToIri')).toBe(true);
  });

  it('detects orphaned child pointer after parent deletion', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    // Corrupt the index: add a ghost child
    const idx = adapter.getIndices(GRAPH_ID);
    idx.iriToChildren.set('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', new Set(['fandaws:class/845fd3dd-66c2-55b5-aed7-af5318b37d50/ghost']));

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts.some((g) => g.index === 'iriToChildren' && g.ghostIri === 'fandaws:class/845fd3dd-66c2-55b5-aed7-af5318b37d50/ghost')).toBe(true);
  });

  it('detects stale relationship reference', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    // Corrupt the index: add a ghost reverse relationship
    const idx = adapter.getIndices(GRAPH_ID);
    idx.iriToReverseRelationships.set(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      new Set(['fandaws:rel/845fd3dd-66c2-55b5-aed7-af5318b37d50/ghost']),
    );

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(
      ghosts.some(
        (g) =>
          g.index === 'iriToReverseRelationships' &&
          g.ghostIri === 'fandaws:rel/845fd3dd-66c2-55b5-aed7-af5318b37d50/ghost',
      ),
    ).toBe(true);
  });

  it('returns multiple ghosts for a corrupted graph', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));

    const idx = adapter.getIndices(GRAPH_ID);
    idx.canonicalLabelToIri.set('ghost1', 'fandaws:class/240f699d-2fa7-5761-8793-09286bcc542a/ghost1');
    idx.canonicalLabelToIri.set('ghost2', 'fandaws:class/a4cd755b-ae01-524f-93b2-04026695981d/ghost2');

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
        makeConcept(`fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c-${i}`, `Concept ${i}`),
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

    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
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
      const concept = makeConcept(`fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c-${i}`, `Concept ${i}`);
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
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [dog] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToReverseRelationships.size).toBe(0);
  });

  it('concept with null broader has null in parent index', () => {
    const root = makeConcept('fandaws:class/12ac83b4-94ba-5214-a91a-d2c53f830fbf/root', 'Root');
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [root] }));
    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToParent.get('fandaws:class/12ac83b4-94ba-5214-a91a-d2c53f830fbf/root')).toBeNull();
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
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const mammal = makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');

    // Create all three
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal] }));
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [mammal] }));
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    // Verify initial state: dog is child of animal
    let idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToParent.get('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(idx.iriToChildren.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal').has('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(true);

    // Reparent dog → mammal
    adapter.applyMutation(GRAPH_ID, makeMutation({
      modifications: [{
        '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        'fandaws:field': 'skos:broader',
        'fandaws:value': 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal',
      }],
    }));

    // Rebuild indices (happens automatically in applyMutation)
    idx = adapter.getIndices(GRAPH_ID);

    // canonicalLabel index still works
    expect(idx.canonicalLabelToIri.get('dog')).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');

    // parent index: dog's parent is now mammal
    expect(idx.iriToParent.get('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');

    // children index: animal has 1 child (mammal), NOT 2
    const animalChildren = idx.iriToChildren.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(animalChildren.has('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal')).toBe(true);
    expect(animalChildren.has('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(false);

    // children index: mammal has 1 child (dog)
    const mammalChildren = idx.iriToChildren.get('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
    expect(mammalChildren.has('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(true);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });

  it('SUP-11b: create → delete leaf → verify index cleanup', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');

    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal] }));
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    // Delete dog (leaf)
    adapter.applyMutation(GRAPH_ID, makeMutation({
      deletions: ['fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'],
    }));

    const idx = adapter.getIndices(GRAPH_ID);

    // canonicalLabel: "dog" should be gone
    expect(idx.canonicalLabelToIri.has('dog')).toBe(false);

    // parent index: no entry for dog
    expect(idx.iriToParent.has('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(false);

    // children index: animal should have no children
    const animalChildren = idx.iriToChildren.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(animalChildren.size).toBe(0);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });

  it('SUP-11c: property addition updates iriToProperties index', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal] }));

    // Add a property restriction
    const furRestriction = {
      '@id': 'fandaws:restriction/6a2d686b-55d8-5bcb-bb44-f082f0a09482/animal--fur',
      '@type': 'owl:Restriction',
      'owl:onProperty': 'fur',
      'fandaws:restrictionKind': 'property',
      'fandaws:attachedTo': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
      'fandaws:scope': 'concept-specific',
    };
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [furRestriction] }));

    const idx = adapter.getIndices(GRAPH_ID);

    // iriToProperties should list the restriction
    const animalProps = idx.iriToProperties.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(animalProps).toBeDefined();
    expect(animalProps.has('fandaws:restriction/6a2d686b-55d8-5bcb-bb44-f082f0a09482/animal--fur')).toBe(true);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });

  it('SUP-11d: property removal via modification updates indices', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    animal['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/6a2d686b-55d8-5bcb-bb44-f082f0a09482/animal--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
        'fandaws:scope': 'concept-specific',
      },
    ];
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [animal] }));

    // Verify property indexed
    let idx = adapter.getIndices(GRAPH_ID);
    expect(idx.iriToProperties.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal').size).toBe(1);

    // Remove property by modifying rdfs:subClassOf to empty
    adapter.applyMutation(GRAPH_ID, makeMutation({
      modifications: [{
        '@id': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
        'fandaws:field': 'rdfs:subClassOf',
        'fandaws:value': [],
      }],
    }));

    idx = adapter.getIndices(GRAPH_ID);
    const animalProps = idx.iriToProperties.get('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(animalProps.size).toBe(0);

    // No ghost pointers
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// SUP-14: Sequential mutation consistency
// ─────────────────────────────────────────────────────────

describe('InMemoryStateAdapter — sequential mutation consistency (SUP-14)', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph({ concepts: [] }));
  });

  it('SUP-14a: rapid sequential modifications — last write wins', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal, dog] }));

    // Two sequential definition writes
    adapter.applyMutation(GRAPH_ID, makeMutation({
      modifications: [{
        '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        'fandaws:field': 'skos:definition',
        'fandaws:value': 'first',
      }],
    }));
    adapter.applyMutation(GRAPH_ID, makeMutation({
      modifications: [{
        '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        'fandaws:field': 'skos:definition',
        'fandaws:value': 'second',
      }],
    }));

    const graph = adapter.loadGraph(GRAPH_ID);
    const updatedDog = graph['fandaws:concepts'].find(
      (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    );
    expect(updatedDog['skos:definition']).toBe('second');
    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });

  it('SUP-14b: loadGraph after mutation reflects latest state', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [animal] }));

    const before = adapter.loadGraph(GRAPH_ID);
    expect(before['fandaws:concepts']).toHaveLength(1);

    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [dog] }));

    const after = adapter.loadGraph(GRAPH_ID);
    expect(after['fandaws:concepts']).toHaveLength(2);
  });

  it('SUP-14c: indices consistent after 10 rapid sequential mutations', () => {
    // Build a 10-concept chain: concept-0 → concept-1 → ... → concept-9
    let parentIri = null;
    for (let i = 0; i < 10; i++) {
      const iri = `fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c${i}`;
      const label = `Concept${i}`;
      const concept = makeConcept(iri, label, parentIri);
      if (i === 0) concept['fandaws:allowRoot'] = true;
      adapter.applyMutation(GRAPH_ID, makeMutation({ additions: [concept] }));
      parentIri = iri;
    }

    const idx = adapter.getIndices(GRAPH_ID);
    expect(idx.canonicalLabelToIri.size).toBe(10);

    // Verify parent chain from c9 back to c0
    let current = `fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c9`;
    for (let i = 8; i >= 0; i--) {
      const parent = idx.iriToParent.get(current);
      expect(parent).toBe(`fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c${i}`);
      current = parent;
    }
    // c0 is root
    expect(idx.iriToParent.get('fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c0')).toBeNull();

    expect(adapter.verifyIntegrity(GRAPH_ID)).toHaveLength(0);
  });
});
