/**
 * InMemoryStateAdapter — reference in-memory implementation of the StateAdapter interface.
 *
 * Stores knowledge graphs, sessions, and scope configurations in Maps.
 * Maintains five indices for O(1) lookups on every graph mutation.
 * All operations are browser-compatible (no Node.js APIs).
 *
 * v2.1: Concept fields use standard OWL/SKOS/PROV vocabulary.
 * Properties and relationships are owl:Restriction entries in concept rdfs:subClassOf.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

import { StateAdapter } from './state-adapter.js';
import { isConceptNode, isRestrictionNode } from '../../types/type-checks.js';

// ─────────────────────────────────────────────────────────
// InMemoryStateAdapter
// ─────────────────────────────────────────────────────────

export class InMemoryStateAdapter extends StateAdapter {
  constructor() {
    super();

    /** @type {Map<string, object>} graphId → KnowledgeGraph JSON-LD */
    this._graphs = new Map();

    /** @type {Map<string, object>} sessionId → ConversationSession JSON-LD */
    this._sessions = new Map();

    /** @type {Map<string, object>} configId → ScopeConfiguration JSON-LD */
    this._scopeConfigs = new Map();

    /**
     * Per-graph indices. Key is graphId.
     * @type {Map<string, object>}
     */
    this._indices = new Map();
  }

  // ─────────────────────────────────────────────────────────
  // Graph CRUD
  // ─────────────────────────────────────────────────────────

  /**
   * Load a knowledge graph by identifier.
   *
   * @param {string} id - Graph IRI
   * @returns {object|null} KnowledgeGraph JSON-LD or null if not found
   */
  loadGraph(id) {
    return this._graphs.get(id) ?? null;
  }

  /**
   * Persist a knowledge graph and rebuild all indices.
   *
   * @param {string} id - Graph IRI
   * @param {object} graph - Valid KnowledgeGraph JSON-LD
   */
  saveGraph(id, graph) {
    this._graphs.set(id, graph);
    this._rebuildIndices(id, graph);
  }

  // ─────────────────────────────────────────────────────────
  // Session CRUD
  // ─────────────────────────────────────────────────────────

  /**
   * Load conversation session state.
   *
   * @param {string} id - Session identifier
   * @returns {object|null} ConversationSession JSON-LD or null
   */
  loadSession(id) {
    return this._sessions.get(id) ?? null;
  }

  /**
   * Persist conversation session state.
   *
   * @param {string} id - Session identifier
   * @param {object} session - ConversationSession JSON-LD
   */
  saveSession(id, session) {
    this._sessions.set(id, session);
  }

  /**
   * List sessions for a caller, optionally filtered by state or parent.
   *
   * @param {string} callerId - Caller identity
   * @param {object} [filter] - Optional filter
   * @param {string} [filter.state] - Filter by single session state
   * @param {string[]} [filter.states] - Filter by any of the given states
   * @param {string|null} [filter.parentSessionId] - Filter by parent session ID
   * @returns {object[]} Array of ConversationSession JSON-LD nodes
   */
  listSessions(callerId, filter) {
    const results = [];
    for (const session of this._sessions.values()) {
      if (session['fandaws:callerId'] !== callerId) continue;
      if (filter?.state && session['fandaws:state'] !== filter.state) continue;
      if (filter?.states && !filter.states.includes(session['fandaws:state'])) continue;
      if (filter?.parentSessionId !== undefined && session['fandaws:parentSessionId'] !== filter.parentSessionId) continue;
      results.push(session);
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────
  // Scope Config CRUD
  // ─────────────────────────────────────────────────────────

  /**
   * Load scope configuration.
   *
   * @param {string} id - Scope config identifier
   * @returns {object|null} ScopeConfiguration JSON-LD or null
   */
  loadScopeConfig(id) {
    return this._scopeConfigs.get(id) ?? null;
  }

  /**
   * Persist scope configuration.
   *
   * @param {string} id - Scope config identifier
   * @param {object} config - ScopeConfiguration JSON-LD
   */
  saveScopeConfig(id, config) {
    this._scopeConfigs.set(id, config);
  }

  // ─────────────────────────────────────────────────────────
  // Query (stub — deferred to Phase 8+)
  // ─────────────────────────────────────────────────────────

  /**
   * Execute a graph query. Stub — not implemented until Phase 8+.
   *
   * @param {string} _id - Graph IRI
   * @param {object} _query - Query object
   * @returns {object} QueryResult JSON-LD with error flag
   */
  queryGraph(_id, _query) {
    return {
      '@type': 'fandaws:QueryResult',
      'fandaws:error': true,
      'fandaws:errorReason': 'not-implemented',
    };
  }

  // ─────────────────────────────────────────────────────────
  // applyMutation — atomic snapshot-and-swap
  // ─────────────────────────────────────────────────────────

  /**
   * Apply a GraphMutation to a stored graph atomically.
   *
   * Operations are applied in order: additions → modifications → deletions → merges.
   * If any sub-operation fails, the graph remains unchanged (snapshot-and-swap).
   *
   * @param {string} id - Graph IRI
   * @param {object} mutation - GraphMutation JSON-LD
   * @returns {object} Updated KnowledgeGraph, or original graph unchanged on failure
   */
  applyMutation(id, mutation) {
    const original = this._graphs.get(id);
    if (!original) {
      return {
        '@type': 'fandaws:MutationRejection',
        'fandaws:reason': `Graph not found: ${id}`,
        'fandaws:graph': null,
      };
    }

    // Snapshot: deep clone the graph
    const draft = JSON.parse(JSON.stringify(original));

    try {
      this._applyAdditions(draft, mutation['fandaws:additions'] || []);
      this._applyModifications(draft, mutation['fandaws:modifications'] || []);
      this._applyDeletions(draft, mutation['fandaws:deletions'] || []);
      this._applyMerges(draft, mutation['fandaws:merges'] || []);
    } catch {
      // Atomicity: any failure → return original unchanged
      return original;
    }

    // Commit the draft
    this._graphs.set(id, draft);
    this._rebuildIndices(id, draft);
    return draft;
  }

  // ─────────────────────────────────────────────────────────
  // Mutation sub-operations (private)
  // ─────────────────────────────────────────────────────────

  /**
   * Process addition operations on a draft graph.
   *
   * @param {object} draft - Mutable graph clone
   * @param {object[]} additions - Nodes to add
   */
  _applyAdditions(draft, additions) {
    for (const node of additions) {
      if (isConceptNode(node)) {
        draft['fandaws:concepts'].push(node);
      } else if (isRestrictionNode(node)) {
        // Embed restriction in owning concept's rdfs:subClassOf
        const attachedTo = node['fandaws:attachedTo'];
        const concept = draft['fandaws:concepts'].find(
          (c) => c['@id'] === attachedTo,
        );
        if (concept) {
          const subClassOf = concept['rdfs:subClassOf'] || [];
          if (!subClassOf.some((e) => e['@id'] === node['@id'])) {
            subClassOf.push(node);
          }
          concept['rdfs:subClassOf'] = subClassOf;
        }
      }
    }
  }

  /**
   * Process modification operations on a draft graph.
   *
   * @param {object} draft - Mutable graph clone
   * @param {object[]} modifications - Field-level changes
   */
  _applyModifications(draft, modifications) {
    for (const mod of modifications) {
      const targetIri = mod['@id'];
      const field = mod['fandaws:field'];
      const value = mod['fandaws:value'];

      // Search concepts
      const concept = draft['fandaws:concepts'].find(
        (c) => c['@id'] === targetIri,
      );
      if (concept) {
        concept[field] = value;
        continue;
      }

      // Search relationships (vestigial)
      const rel = draft['fandaws:relationships'].find(
        (r) => r['@id'] === targetIri,
      );
      if (rel) {
        rel[field] = value;
        continue;
      }

      // Target not found → throw to trigger atomicity rollback
      throw new Error(`Modification target not found: ${targetIri}`);
    }
  }

  /**
   * Process deletion operations on a draft graph.
   * Deletion of a non-existent IRI is a no-op (idempotent).
   *
   * @param {object} draft - Mutable graph clone
   * @param {string[]} deletions - IRIs to remove
   */
  _applyDeletions(draft, deletions) {
    for (const iri of deletions) {
      // Try removing from concepts
      const conceptIdx = draft['fandaws:concepts'].findIndex(
        (c) => c['@id'] === iri,
      );
      if (conceptIdx !== -1) {
        const removed = draft['fandaws:concepts'].splice(conceptIdx, 1)[0];
        const parentIri = removed['skos:broader'];

        // Reparent orphaned children to deleted concept's parent
        for (const child of draft['fandaws:concepts']) {
          if (child['skos:broader'] === iri) {
            child['skos:broader'] = parentIri;
          }
        }
        continue;
      }

      // Try removing from relationships (vestigial)
      const relIdx = draft['fandaws:relationships'].findIndex(
        (r) => r['@id'] === iri,
      );
      if (relIdx !== -1) {
        draft['fandaws:relationships'].splice(relIdx, 1);
      }

      // Non-existent IRI → no-op (idempotent)
    }
  }

  /**
   * Process merge operations on a draft graph.
   *
   * @param {object} draft - Mutable graph clone
   * @param {object[]} merges - Merge descriptors
   */
  _applyMerges(draft, merges) {
    for (const merge of merges) {
      const sourceIri = merge['fandaws:source'];
      const targetIri = merge['fandaws:target'];

      const sourceIdx = draft['fandaws:concepts'].findIndex(
        (c) => c['@id'] === sourceIri,
      );
      const target = draft['fandaws:concepts'].find(
        (c) => c['@id'] === targetIri,
      );

      if (sourceIdx === -1 || !target) {
        throw new Error(
          `Merge failed: source=${sourceIri}, target=${targetIri}`,
        );
      }

      const source = draft['fandaws:concepts'][sourceIdx];

      // Transfer children: reparent source's children to target
      for (const child of draft['fandaws:concepts']) {
        if (child['skos:broader'] === sourceIri) {
          child['skos:broader'] = targetIri;
        }
      }

      // Transfer restrictions (union of rdfs:subClassOf entries)
      const sourceRestrictions = (source['rdfs:subClassOf'] || []).filter(
        (e) => isRestrictionNode(e),
      );
      const targetSubClassOf = target['rdfs:subClassOf'] || [];
      const existingIds = new Set(
        targetSubClassOf.filter((e) => e['@id']).map((e) => e['@id']),
      );
      for (const restriction of sourceRestrictions) {
        if (!restriction['@id'] || !existingIds.has(restriction['@id'])) {
          targetSubClassOf.push(restriction);
        }
      }
      target['rdfs:subClassOf'] = targetSubClassOf;

      // Rewrite relationship restrictions referencing source → target
      for (const concept of draft['fandaws:concepts']) {
        const subClassOf = concept['rdfs:subClassOf'] || [];
        for (const entry of subClassOf) {
          if (isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'relationship') {
            if (entry['fandaws:attachedTo'] === sourceIri) {
              entry['fandaws:attachedTo'] = targetIri;
            }
            if (entry['owl:someValuesFrom'] === sourceIri) {
              entry['owl:someValuesFrom'] = targetIri;
            }
          }
        }
      }

      // Record merge provenance
      const wasDerivedFrom = target['prov:wasDerivedFrom'] || [];
      wasDerivedFrom.push(sourceIri);
      target['prov:wasDerivedFrom'] = wasDerivedFrom;

      // Delete source concept
      draft['fandaws:concepts'].splice(sourceIdx, 1);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Index infrastructure
  // ─────────────────────────────────────────────────────────

  /**
   * Create a fresh empty index set.
   *
   * @returns {object} GraphIndices with 5 empty Maps
   */
  _createEmptyIndices() {
    return {
      canonicalLabelToIri: new Map(),
      iriToParent: new Map(),
      iriToChildren: new Map(),
      iriToProperties: new Map(),
      iriToReverseRelationships: new Map(),
    };
  }

  /**
   * Rebuild all five indices from the current graph state.
   *
   * @param {string} id - Graph IRI
   * @param {object} graph - KnowledgeGraph JSON-LD
   */
  _rebuildIndices(id, graph) {
    const idx = this._createEmptyIndices();

    const concepts = graph['fandaws:concepts'] || [];

    for (const concept of concepts) {
      const iri = concept['@id'];
      const canonicalLabel = concept['skos:prefLabel'];
      const parent = concept['skos:broader'];
      const subClassOf = concept['rdfs:subClassOf'] || [];

      // Index 1: canonicalLabel → IRI
      if (canonicalLabel != null) {
        idx.canonicalLabelToIri.set(canonicalLabel, iri);
      }

      // Index 2: IRI → parent
      idx.iriToParent.set(iri, parent);

      // Index 3: IRI → children (built from parent pointers)
      if (!idx.iriToChildren.has(iri)) {
        idx.iriToChildren.set(iri, new Set());
      }
      if (parent != null) {
        if (!idx.iriToChildren.has(parent)) {
          idx.iriToChildren.set(parent, new Set());
        }
        idx.iriToChildren.get(parent).add(iri);
      }

      // Index 4: IRI → property restriction IRIs
      const propertyIris = subClassOf
        .filter((e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property')
        .map((e) => e['@id'])
        .filter(Boolean);
      idx.iriToProperties.set(iri, new Set(propertyIris));

      // Index 5: relationship restrictions (object → restriction IRI)
      for (const entry of subClassOf) {
        if (isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'relationship') {
          const objectIri = entry['owl:someValuesFrom'];
          const relIri = entry['@id'];
          if (objectIri && relIri) {
            if (!idx.iriToReverseRelationships.has(objectIri)) {
              idx.iriToReverseRelationships.set(objectIri, new Set());
            }
            idx.iriToReverseRelationships.get(objectIri).add(relIri);
          }
        }
      }
    }

    this._indices.set(id, idx);
  }

  /**
   * Get the indices for a graph. Returns null if graph has no indices.
   *
   * @param {string} graphId - Graph IRI
   * @returns {object|null} GraphIndices or null
   */
  getIndices(graphId) {
    return this._indices.get(graphId) ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // Integrity verification
  // ─────────────────────────────────────────────────────────

  /**
   * Walk all five indices and report ghost pointers.
   *
   * A ghost pointer is an IRI in an index that points to a concept
   * or relationship no longer present in the graph.
   *
   * @param {string} graphId - Graph IRI
   * @returns {object[]} Array of ghost pointer descriptors. Empty = healthy.
   */
  verifyIntegrity(graphId) {
    const graph = this._graphs.get(graphId);
    const idx = this._indices.get(graphId);
    if (!graph || !idx) return [];

    const ghosts = [];
    const conceptIris = new Set(
      (graph['fandaws:concepts'] || []).map((c) => c['@id']),
    );

    // Collect all restriction IRIs from concepts' subClassOf
    const restrictionIris = new Set();
    for (const concept of graph['fandaws:concepts'] || []) {
      for (const entry of concept['rdfs:subClassOf'] || []) {
        if (isRestrictionNode(entry) && entry['@id']) {
          restrictionIris.add(entry['@id']);
        }
      }
    }

    // Check Index 1: canonicalLabel → IRI
    for (const [label, iri] of idx.canonicalLabelToIri) {
      if (!conceptIris.has(iri)) {
        ghosts.push({
          index: 'canonicalLabelToIri',
          key: label,
          ghostIri: iri,
          reason: 'IRI not present in graph concepts',
        });
      }
    }

    // Check Index 2: IRI → parent
    for (const [iri, parent] of idx.iriToParent) {
      if (!conceptIris.has(iri)) {
        ghosts.push({
          index: 'iriToParent',
          key: iri,
          ghostIri: iri,
          reason: 'Concept IRI not present in graph',
        });
      }
      if (parent != null && !conceptIris.has(parent)) {
        ghosts.push({
          index: 'iriToParent',
          key: iri,
          ghostIri: parent,
          reason: 'Parent IRI not present in graph',
        });
      }
    }

    // Check Index 3: IRI → children
    for (const [iri, children] of idx.iriToChildren) {
      if (!conceptIris.has(iri)) {
        ghosts.push({
          index: 'iriToChildren',
          key: iri,
          ghostIri: iri,
          reason: 'Parent IRI not present in graph',
        });
      }
      for (const childIri of children) {
        if (!conceptIris.has(childIri)) {
          ghosts.push({
            index: 'iriToChildren',
            key: iri,
            ghostIri: childIri,
            reason: 'Child IRI not present in graph',
          });
        }
      }
    }

    // Check Index 4: IRI → properties
    for (const [iri] of idx.iriToProperties) {
      if (!conceptIris.has(iri)) {
        ghosts.push({
          index: 'iriToProperties',
          key: iri,
          ghostIri: iri,
          reason: 'Concept IRI not present in graph',
        });
      }
    }

    // Check Index 5: IRI → reverse relationships
    for (const [iri, relIris] of idx.iriToReverseRelationships) {
      for (const relIri of relIris) {
        if (!restrictionIris.has(relIri)) {
          ghosts.push({
            index: 'iriToReverseRelationships',
            key: iri,
            ghostIri: relIri,
            reason: 'Relationship restriction IRI not present in graph',
          });
        }
      }
    }

    return ghosts;
  }
}
