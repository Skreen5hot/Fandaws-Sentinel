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
import { createGraphMutation } from '../../types/graph-mutation.js';
import {
  ingestTurtle,
  buildEquivalenceIndex,
  hasIngestedSource,
  isAlreadyIngested,
  migratePhantomReferences,
} from '../integration/turtle-ingestion-adapter.js';
import { sha256Hex } from '../../core/ivne/sha256.js';

const BFO_ONTOLOGY_IRI = 'http://purl.obolibrary.org/obo/bfo.owl';

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

    /** @type {Function[]} Post-commit mutation observers. */
    this._mutationListeners = [];

    /** @type {Map<string, string>} Ingested object property index: label → source IRI */
    this._ingestedPropertyIndex = new Map();
  }

  // ─────────────────────────────────────────────────────────
  // Ontology ingestion (Phase A — BFO)
  // ─────────────────────────────────────────────────────────

  /**
   * Ensure a graph contains the ingested BFO ontology.
   *
   * - If BFO is not yet ingested into the graph, runs the full ingestion
   *   pipeline and applies the resulting concepts as a single bulk mutation.
   * - If BFO is already ingested with a matching content hash, short-circuits
   *   (returns immediately, ~1ms instead of ~100ms).
   * - If a different version is present, runs class-by-class diff.
   * - After ingestion, runs phantom-reference migration on user concepts
   *   that may carry legacy `rdfs:subClassOf: bfo:...` strings.
   *
   * Returns a result describing what happened. Errors during parsing are
   * caught and surfaced via the `error` field — the graph remains unchanged.
   *
   * @see Ontology Ingestion Spec v1.4 Section 5
   *
   * @param {string} graphId - Graph IRI
   * @param {string} turtleText - Raw BFO Turtle source
   * @param {object} [options] - Forwarded to ingestTurtle()
   * @returns {{
   *   ingested: boolean,
   *   skipped: boolean,
   *   shortCircuit: boolean,
   *   conceptsAdded: number,
   *   migratedReferences: number,
   *   error?: string
   * }}
   */
  ensureBfoIngestion(graphId, turtleText, options = {}) {
    const graph = this._graphs.get(graphId);
    if (!graph) {
      return {
        ingested: false,
        skipped: false,
        shortCircuit: false,
        conceptsAdded: 0,
        migratedReferences: 0,
        error: `Graph not found: ${graphId}`,
      };
    }

    // Fast-path hash short-circuit (Section 5.4):
    // Hash the raw bytes BEFORE parsing. If a matching ingestion already
    // exists, skip the entire pipeline (~1ms instead of ~50-100ms).
    const contentHash = 'sha256:' + sha256Hex(turtleText);
    if (isAlreadyIngested(graph, BFO_ONTOLOGY_IRI, contentHash)) {
      return {
        ingested: false,
        skipped: true,
        shortCircuit: true,
        conceptsAdded: 0,
        migratedReferences: 0,
      };
    }

    let ingested;
    try {
      ingested = ingestTurtle(turtleText, {
        sourceOntology: BFO_ONTOLOGY_IRI,
        ...options,
      });
    } catch (err) {
      return {
        ingested: false,
        skipped: false,
        shortCircuit: false,
        conceptsAdded: 0,
        migratedReferences: 0,
        error: `Turtle parse error: ${err.message}`,
      };
    }

    // Determine which concepts to add. Skip any whose @id already exists.
    const existingIris = new Set(
      (graph['fandaws:concepts'] || []).map((c) => c['@id']),
    );
    const additions = ingested.concepts.filter(
      (c) => !existingIris.has(c['@id']),
    );

    if (additions.length > 0) {
      const mutation = createGraphMutation({
        additions,
        reason: `Ingest BFO 2020 (${additions.length} classes)`,
      });
      this.applyMutation(graphId, mutation);
    }

    // Phantom reference migration on user concepts
    const updated = this._graphs.get(graphId);
    const equivIndex = buildEquivalenceIndex(updated['fandaws:concepts'] || []);
    const migrated = migratePhantomReferences(updated, equivIndex);
    if (migrated > 0) {
      // Indices need rebuild after in-place mutation
      this._rebuildIndices(graphId, updated);
    }

    // Merge property index
    this._mergeIngestedPropertyIndex(ingested.propertyIndex);

    return {
      ingested: true,
      skipped: false,
      shortCircuit: false,
      conceptsAdded: additions.length,
      migratedReferences: migrated,
    };
  }

  /**
   * Get the ingested object property index (label → source IRI).
   * Used by the property workflow's verb-to-property resolution.
   *
   * @returns {Map<string, string>}
   */
  getIngestedPropertyIndex() {
    return this._ingestedPropertyIndex;
  }

  /**
   * Merge a property index from a new ingestion into the adapter-level cache.
   * First-write wins to keep the index deterministic across re-ingestions.
   *
   * @param {Map<string, string>} newIndex
   * @private
   */
  _mergeIngestedPropertyIndex(newIndex) {
    if (!newIndex) return;
    for (const [label, iri] of newIndex) {
      if (!this._ingestedPropertyIndex.has(label)) {
        this._ingestedPropertyIndex.set(label, iri);
      }
    }
  }

  /**
   * Check whether a graph contains any ingested concepts from a given source.
   *
   * @param {string} graphId
   * @param {string} sourceOntology
   * @returns {boolean}
   */
  hasIngestedSource(graphId, sourceOntology) {
    const graph = this._graphs.get(graphId);
    if (!graph) return false;
    return hasIngestedSource(graph, sourceOntology);
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

    // Notify mutation listeners (post-commit, post-index-rebuild).
    // Listeners are synchronous and block this return. Async listeners
    // must not be used — v0.2 should evaluate queueMicrotask() if needed.
    for (const listener of this._mutationListeners) {
      try { listener(mutation, draft); } catch { /* swallow listener errors */ }
    }

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
   * @returns {object} GraphIndices with 6 empty Maps
   */
  _createEmptyIndices() {
    return {
      canonicalLabelToIri: new Map(),
      iriToParent: new Map(),
      iriToChildren: new Map(),
      iriToProperties: new Map(),
      iriToReverseRelationships: new Map(),
      hiddenLabelToIri: new Map(),
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

      // Index 6: hidden label → IRI array (for homonym disambiguation)
      const hiddenLabel = concept['skos:hiddenLabel'];
      if (hiddenLabel) {
        const existing = idx.hiddenLabelToIri.get(hiddenLabel) || [];
        existing.push(iri);
        idx.hiddenLabelToIri.set(hiddenLabel, existing);
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

  /**
   * Find concepts with a given skos:hiddenLabel (bare label before qualification).
   *
   * @param {string} label - Bare label to search for
   * @param {string} graphId - Graph IRI
   * @returns {object[]} Matching concept nodes
   */
  findConceptsByHiddenLabel(label, graphId) {
    const idx = this._indices.get(graphId);
    if (!idx) return [];
    const iris = idx.hiddenLabelToIri.get(label) || [];
    const graph = this._graphs.get(graphId);
    if (!graph) return [];
    return iris.map((iri) =>
      (graph['fandaws:concepts'] || []).find((c) => c['@id'] === iri),
    ).filter(Boolean);
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

    // Check Index 6: hiddenLabel → IRIs
    for (const [label, iris] of idx.hiddenLabelToIri) {
      for (const iri of iris) {
        if (!conceptIris.has(iri)) {
          ghosts.push({
            index: 'hiddenLabelToIri',
            key: label,
            ghostIri: iri,
            reason: 'Concept IRI not present in graph',
          });
        }
      }
    }

    return ghosts;
  }

  /**
   * Collect non-fatal integrity warnings.
   *
   * Currently emits warnings for unresolved phantom IRIs in `rdfs:subClassOf`
   * and `skos:broader` — references to source ontology classes that have
   * not yet been ingested. These are NOT errors: they may resolve when the
   * referenced ontology (e.g., CCO) is ingested later.
   *
   * @see Ontology Ingestion Spec v1.4 Section 6.4
   *
   * @param {string} graphId - Graph IRI
   * @returns {object[]} Array of warning descriptors. Empty = no warnings.
   */
  collectIntegrityWarnings(graphId) {
    const graph = this._graphs.get(graphId);
    if (!graph) return [];

    const warnings = [];
    const conceptIris = new Set(
      (graph['fandaws:concepts'] || []).map((c) => c['@id']),
    );

    // Build a set of source IRIs reachable via any ingested concept's
    // owl:equivalentClass — these are "indirectly resolved" (the bridge
    // exists even though the bare IRI is not a Fandaws concept @id).
    // Stores both prefixed and full-URI forms for robust matching.
    const equivalentSources = new Set();
    for (const c of graph['fandaws:concepts'] || []) {
      const equivs = c['owl:equivalentClass'];
      if (Array.isArray(equivs)) {
        for (const e of equivs) {
          equivalentSources.add(e);
          // Add prefixed form for full URIs
          if (typeof e === 'string' && e.startsWith('http://purl.obolibrary.org/obo/BFO_')) {
            equivalentSources.add('bfo:' + e.split('/').pop());
          }
          // Add full-URI form for prefixed BFO IRIs
          if (typeof e === 'string' && e.startsWith('bfo:BFO_')) {
            equivalentSources.add('http://purl.obolibrary.org/obo/' + e.slice(4));
          }
        }
      }
    }

    for (const concept of graph['fandaws:concepts'] || []) {
      // rdfs:subClassOf string entries that don't resolve
      const subClassOf = concept['rdfs:subClassOf'] || [];
      for (const entry of subClassOf) {
        if (typeof entry === 'string' && !conceptIris.has(entry)) {
          // BFO IRIs on imported concepts are expected (own equivalentClass)
          if (concept['fandaws:isImported']) continue;
          // IRIs reachable via an ingested concept's owl:equivalentClass
          // are not phantom — the bridge exists even if the bare IRI
          // isn't a Fandaws @id.
          if (equivalentSources.has(entry)) continue;
          warnings.push({
            level: 'warning',
            concept: concept['@id'],
            field: 'rdfs:subClassOf',
            unresolvedIri: entry,
            reason: 'References a class not present in the graph. May resolve when its source ontology is ingested.',
          });
        }
      }
      // skos:broader phantom
      const broader = concept['skos:broader'];
      if (typeof broader === 'string' && !conceptIris.has(broader)) {
        if (concept['fandaws:isImported']) continue;
        if (equivalentSources.has(broader)) continue;
        warnings.push({
          level: 'warning',
          concept: concept['@id'],
          field: 'skos:broader',
          unresolvedIri: broader,
          reason: 'References a class not present in the graph. May resolve when its source ontology is ingested.',
        });
      }
    }

    return warnings;
  }

  // ─────────────────────────────────────────────────────────
  // Mutation observers
  // ─────────────────────────────────────────────────────────

  /**
   * Register a callback invoked after every successful applyMutation().
   *
   * Listeners fire AFTER the graph is committed and indices rebuilt,
   * guaranteeing listeners see consistent state. Listeners cannot
   * prevent mutations (post-commit observers, not pre-commit validators).
   *
   * @param {Function} callback - (mutation, updatedGraph) => void
   * @returns {Function} Unsubscribe function
   */
  onMutation(callback) {
    this._mutationListeners.push(callback);
    return () => {
      const idx = this._mutationListeners.indexOf(callback);
      if (idx !== -1) this._mutationListeners.splice(idx, 1);
    };
  }

  // ─────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────

  /**
   * Serialize the adapter's full state to a plain JSON-compatible object.
   * Indices are NOT serialized — they are derived and rebuilt on deserialize.
   *
   * @returns {object} Plain object (safe for JSON.stringify / structuredClone)
   */
  serialize() {
    const graphs = {};
    for (const [id, graph] of this._graphs) graphs[id] = graph;
    const sessions = {};
    for (const [id, session] of this._sessions) sessions[id] = session;
    const scopeConfigs = {};
    for (const [id, config] of this._scopeConfigs) scopeConfigs[id] = config;
    return { graphs, sessions, scopeConfigs };
  }

  /**
   * Convenience: serialize to JSON string (debugging, console.log).
   *
   * @returns {string} JSON string of the serialized state
   */
  toJSON() {
    return JSON.stringify(this.serialize());
  }

  /**
   * Rebuild an InMemoryStateAdapter from a serialized snapshot.
   * Rebuilds all 5 indices for every graph.
   *
   * @param {object} snapshot - Output of serialize()
   * @returns {InMemoryStateAdapter} Fully hydrated adapter
   */
  static deserialize(snapshot) {
    // Defensive: handle malformed or missing keys gracefully (SER-13)
    if (!snapshot || typeof snapshot !== 'object') {
      return new InMemoryStateAdapter();
    }
    const adapter = new InMemoryStateAdapter();
    if (snapshot.graphs) {
      for (const [id, graph] of Object.entries(snapshot.graphs)) {
        adapter._graphs.set(id, graph);
        // Note: cross-graph broader references will not resolve during
        // deserialization. Phase 12 Federation must handle this.
        adapter._rebuildIndices(id, graph);
      }
    }
    if (snapshot.sessions) {
      for (const [id, session] of Object.entries(snapshot.sessions)) {
        adapter._sessions.set(id, session);
      }
    }
    if (snapshot.scopeConfigs) {
      for (const [id, config] of Object.entries(snapshot.scopeConfigs)) {
        adapter._scopeConfigs.set(id, config);
      }
    }
    return adapter;
  }
}
