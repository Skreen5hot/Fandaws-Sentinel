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
import { describeConcept } from '../../core/description-engine/description-engine.js';

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

    /**
     * Execution Lane: per-graph compiled artifacts derived from the Canonical Lane.
     * Populated by compile() after every mutation. Keyed by graphId.
     * Each value is { epoch, artifacts: Map<conceptIri, executionArtifact> }.
     * @type {Map<string, object>}
     */
    this._executionLanes = new Map();

    /**
     * Monotonically increasing compilation epoch counter per graph.
     * Incremented by compile() on each pass.
     * @type {Map<string, number>}
     */
    this._compilationEpochs = new Map();

    /**
     * BFO Disjointness Map: Set of frozen "A|B" pair strings (alphabetically ordered)
     * representing all disjoint BFO class pairs (explicit + inferred via transitive
     * closure). Computed during ensureBfoIngestion(), rebuilt on re-ingestion.
     * @type {Set<string>}
     */
    this._bfoDisjointnessMap = new Set();

    /**
     * Cumulative rewrite counter for the current ingestion call.
     * Reset at the start of ensureBfoIngestion(); incremented every time
     * _recomputeBfoMarkers rewrites a marker (whether called from applyMutation
     * or directly). Read at the end of ensureBfoIngestion to populate
     * `migratedReferences` in the result.
     */
    this._ingestionRewrites = 0;
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

    // Reset the cumulative rewrite counter for this ingestion call
    this._ingestionRewrites = 0;

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

    // Phantom reference migration FIRST: rewrite legacy bfo: IRIs in user
    // concepts BEFORE applyMutation runs (which would trigger recompute and
    // strip them). The equivalence index is built from the new additions
    // because they aren't in the graph yet. Migration mutates the graph
    // in place, so we then rebuild indices, then apply the bulk addition.
    const equivIndex = buildEquivalenceIndex(additions);
    const preGraph = this._graphs.get(graphId);
    const migrated = migratePhantomReferences(preGraph, equivIndex);
    if (migrated > 0) {
      this._rebuildIndices(graphId, preGraph);
    }

    if (additions.length > 0) {
      const mutation = createGraphMutation({
        additions,
        reason: `Ingest BFO 2020 (${additions.length} classes)`,
      });
      this.applyMutation(graphId, mutation);
    }

    const updated = this._graphs.get(graphId);

    // Recompute BFO category markers on user concepts now that BFO
    // is ingested. (Note: applyMutation already ran a recompute pass during
    // the bulk ingest mutation; this second call handles any concept that
    // didn't get touched in that pass and is a safety net.)
    const recomputeResult = this._recomputeBfoMarkers(graphId);
    if (recomputeResult.modified) {
      this._rebuildIndices(graphId, this._graphs.get(graphId));
    }
    // Total rewrites combines: phantom migration + ALL recompute passes
    // run during this ingestion call (tracked via _ingestionRewrites).
    const totalRewrites = migrated + this._ingestionRewrites;

    // Generate algorithmic definitions for the ingested concepts.
    // Ingested concepts skip the conversational pipeline that normally
    // populates fandaws:algorithmicDefinition, so we run describeConcept
    // here. The source ontology's own definition stays in skos:definition
    // (separate field, set during ingestTurtle).
    const addedIris = new Set(additions.map((c) => c['@id']));
    if (addedIris.size > 0) {
      for (const c of updated['fandaws:concepts'] || []) {
        if (!addedIris.has(c['@id'])) continue;
        try {
          c['fandaws:algorithmicDefinition'] = describeConcept(c, updated);
        } catch {
          // describeConcept failures are non-fatal — leave the field empty
        }
      }
    }

    // Merge property index
    this._mergeIngestedPropertyIndex(ingested.propertyIndex);

    // Build BFO Disjointness Map (CC-4)
    // Parse explicit owl:disjointWith pairs from the Turtle and compute
    // transitive closure through rdfs:subClassOf chains.
    this._buildDisjointnessMap(graphId, ingested.disjointPairs || [], ingested.parentMap);

    return {
      ingested: true,
      skipped: false,
      shortCircuit: false,
      conceptsAdded: additions.length,
      migratedReferences: totalRewrites,
    };
  }

  /**
   * Build the BFO Disjointness Map from explicit owl:disjointWith pairs
   * and their transitive closure through rdfs:subClassOf chains (Rule CC-4).
   *
   * @param {string} graphId
   * @param {Array<[string, string]>} explicitPairs - [sourceIriA, sourceIriB] from Turtle
   * @param {Map<string, string>} parentMap - sourceIri → fandawsIri
   */
  _buildDisjointnessMap(graphId, explicitPairs, parentMap) {
    this._bfoDisjointnessMap.clear();
    const graph = this._graphs.get(graphId);
    if (!graph) return;

    const concepts = graph['fandaws:concepts'] || [];
    const conceptById = new Map(concepts.map((c) => [c['@id'], c]));

    // Build source IRI → fandaws IRI lookup (for explicit pairs which use source IRIs)
    const sourceToFandaws = new Map();
    for (const c of concepts) {
      if (c['owl:equivalentClass']) {
        const equivs = Array.isArray(c['owl:equivalentClass']) ? c['owl:equivalentClass'] : [c['owl:equivalentClass']];
        for (const eq of equivs) {
          sourceToFandaws.set(eq, c['@id']);
        }
      }
    }

    // Collect all descendants of a concept (fandaws IRI → Set<fandaws IRI>)
    const getDescendants = (startIri) => {
      const descendants = new Set();
      const queue = [startIri];
      while (queue.length > 0) {
        const current = queue.shift();
        for (const c of concepts) {
          if (c['skos:broader'] === current && !descendants.has(c['@id'])) {
            descendants.add(c['@id']);
            queue.push(c['@id']);
          }
        }
      }
      return descendants;
    };

    // For each explicit disjoint pair, propagate to all descendants
    for (const [sourceA, sourceB] of explicitPairs) {
      const fandawsA = sourceToFandaws.get(sourceA);
      const fandawsB = sourceToFandaws.get(sourceB);
      if (!fandawsA || !fandawsB) continue;

      const conceptA = conceptById.get(fandawsA);
      const conceptB = conceptById.get(fandawsB);
      if (!conceptA || !conceptB) continue;

      const labelA = conceptA['rdfs:label'] || conceptA['skos:prefLabel'];
      const labelB = conceptB['rdfs:label'] || conceptB['skos:prefLabel'];

      // Add the explicit pair
      this._bfoDisjointnessMap.add([labelA, labelB].sort().join('|'));

      // Add all descendant combinations (transitive closure)
      const descendantsA = getDescendants(fandawsA);
      descendantsA.add(fandawsA); // include A itself
      const descendantsB = getDescendants(fandawsB);
      descendantsB.add(fandawsB); // include B itself

      for (const dA of descendantsA) {
        const cA = conceptById.get(dA);
        if (!cA) continue;
        const lA = cA['rdfs:label'] || cA['skos:prefLabel'];
        for (const dB of descendantsB) {
          const cB = conceptById.get(dB);
          if (!cB) continue;
          const lB = cB['rdfs:label'] || cB['skos:prefLabel'];
          this._bfoDisjointnessMap.add([lA, lB].sort().join('|'));
        }
      }
    }
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
   * Recompute the BFO category marker on every user concept.
   *
   * Strategy (per architect decision §5(i), revised 2026-04-08):
   * Each user concept carries a single BFO category marker in its
   * `rdfs:subClassOf` array — the **Fandaws IRI** of the most specific
   * ingested ancestor in its `skos:broader` chain. The marker is computed
   * once at write time and stored permanently for O(1) lookups.
   *
   * Algorithm:
   *   1. For each user concept:
   *      a. Walk up via skos:broader looking for the first ingested
   *         ancestor and use its Fandaws IRI as the marker.
   *      b. If no ingested ancestor exists → use the Fandaws IRI of the
   *         ingested Entity root (universal fallback per option Z).
   *      c. If BFO is not ingested at all → no marker
   *   2. Strip ALL existing bfo:* string IRIs AND any prior Fandaws-IRI
   *      BFO category markers (so we don't accumulate stale ones).
   *      Note: bare bfo:* IRIs in rdfs:subClassOf are NOT trusted as
   *      hints because they may be heuristic guesses from
   *      `inferBfoCategory` (e.g., "filament" → process via -ment suffix).
   *      Legacy migration data (pre-ingestion graphs with raw bfo:* IRIs)
   *      is handled by `migratePhantomReferences` which runs explicitly
   *      during ingestion BEFORE the recompute pass.
   *   3. Insert the new marker once
   *
   * Runs after every mutation. Idempotent — same input → same output.
   * Returns { modified, rewrites } so callers can count the number of
   * concepts whose BFO marker changed (subsumes the legacy phantom
   * migration counter for ensureBfoIngestion).
   *
   * @param {string} graphId - Graph IRI
   * @returns {{ modified: boolean, rewrites: number }}
   * @private
   */
  _recomputeBfoMarkers(graphId) {
    const graph = this._graphs.get(graphId);
    if (!graph) return { modified: false, rewrites: 0 };
    const concepts = graph['fandaws:concepts'] || [];
    if (concepts.length === 0) return { modified: false, rewrites: 0 };

    const conceptById = new Map(concepts.map((c) => [c['@id'], c]));

    // Build a set of all ingested concept IRIs — used to detect existing
    // BFO markers (Fandaws IRIs of ingested concepts) so we can strip them
    // before inserting the recomputed marker.
    const ingestedIris = new Set();
    let entityFallbackIri = null;
    for (const c of concepts) {
      if (c['fandaws:isImported']) {
        ingestedIris.add(c['@id']);
        // Identify the Entity root for the fallback
        const equivs = c['owl:equivalentClass'];
        if (Array.isArray(equivs) && equivs.includes('http://purl.obolibrary.org/obo/BFO_0000001')) {
          entityFallbackIri = c['@id'];
        }
      }
    }

    // If BFO isn't ingested at all, there's nothing to do
    if (ingestedIris.size === 0) return { modified: false, rewrites: 0 };

    // Walk up the skos:broader chain and return the Fandaws IRI of the
    // first ingested ancestor encountered. Returns null if none.
    const findNearestIngestedAncestor = (startConcept) => {
      let cursor = startConcept['skos:broader'] || null;
      const visited = new Set([startConcept['@id']]);
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const ancestor = conceptById.get(cursor);
        if (!ancestor) return null;
        if (ancestor['fandaws:isImported']) return ancestor['@id'];
        cursor = ancestor['skos:broader'] || null;
      }
      return null;
    };

    let modified = false;
    let rewrites = 0;
    for (const c of concepts) {
      // Imported concepts have their own owl:equivalentClass — no marker needed
      if (c['fandaws:isImported']) continue;

      const oldList = c['rdfs:subClassOf'] || [];

      // Walk skos:broader for the nearest ingested ancestor.
      const nearestIngested = findNearestIngestedAncestor(c);

      // Preservation rule for migrated markers: if the chain doesn't reach
      // an ingested ancestor BUT the concept already has an ingested-IRI
      // marker in rdfs:subClassOf, that marker came from legitimate phantom
      // migration of a user-asserted bfo:* IRI. Preserve it. (Heuristic
      // guesses can no longer reach this state because workflows skip
      // inferBfoCategory when BFO is ingested.)
      let migrationHint = null;
      if (!nearestIngested) {
        for (const e of oldList) {
          if (typeof e === 'string' && ingestedIris.has(e)) {
            migrationHint = e;
            break;
          }
        }
      }

      // Falls back to the Fandaws Entity IRI for fully-disconnected concepts.
      const newMarker = nearestIngested || migrationHint || entityFallbackIri;
      // newMarker is null only if Entity itself isn't ingested, which
      // shouldn't happen with BFO 2020 — but be defensive

      // Strip ANY prior BFO markers: bare bfo: IRIs and any Fandaws IRIs
      // that happen to be ingested concepts. We rebuild the marker fresh
      // every pass — restrictions are preserved (only string entries are
      // candidates for stripping).
      const stripped = oldList.filter((e) => {
        if (typeof e === 'string') {
          if (e.startsWith('bfo:')) return false;
          if (ingestedIris.has(e)) return false;
        }
        return true;
      });

      // Insert the new marker. The marker is always added if BFO is
      // ingested — even when the marker equals skos:broader (immediate
      // parent is itself the ingested ancestor). This guarantees the
      // O(1) invariant: every user concept has exactly one ingested-IRI
      // marker in its rdfs:subClassOf array.
      let finalList = stripped;
      if (newMarker && !stripped.includes(newMarker)) {
        finalList = [...stripped, newMarker];
      }

      // Only mark dirty if the array actually changed
      if (finalList.length !== oldList.length || finalList.some((e, i) => e !== oldList[i])) {
        c['rdfs:subClassOf'] = finalList;
        modified = true;
        rewrites++;
      }
    }
    // Always tally to the cumulative ingestion counter so ensureBfoIngestion
    // sees rewrites that happened inside applyMutation's post-commit pass.
    this._ingestionRewrites += rewrites;
    return { modified, rewrites };
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

    // Recompute BFO category markers on user concepts. After every mutation,
    // each user concept gets the Fandaws IRI of its nearest ingested ancestor
    // stored as a marker in rdfs:subClassOf — O(1) lookups for the ERS and
    // any future reasoner. Reclassification automatically updates the marker
    // because the chain has shifted; same trigger surface as the prior
    // strip-on-mutation pass.
    if (this._recomputeBfoMarkers(id).modified) {
      this._rebuildIndices(id, this._graphs.get(id));
    }

    // Compile: produce Execution Lane artifacts from the canonical graph.
    // Runs synchronously after every mutation, same trigger as BFO recompute.
    this.compile(id);

    // Update compilation status on canonical concepts
    const compiledGraph = this._graphs.get(id);
    for (const c of (compiledGraph['fandaws:concepts'] || [])) {
      if (!c['fandaws:compilationStatus']) {
        c['fandaws:compilationStatus'] = 'Compiled';
      }
    }

    // Notify mutation listeners (post-commit, post-index-rebuild).
    // Listeners are synchronous and block this return. Async listeners
    // must not be used — v0.2 should evaluate queueMicrotask() if needed.
    for (const listener of this._mutationListeners) {
      try { listener(mutation, compiledGraph); } catch { /* swallow listener errors */ }
    }

    return compiledGraph;
  }

  // ─────────────────────────────────────────────────────────
  // Compilation (Canonical Lane → Execution Lane)
  // ─────────────────────────────────────────────────────────

  /**
   * Compile the canonical graph into Execution Lane artifacts.
   *
   * Reads canonical concepts + restrictions from the graph. For each
   * concept, produces an execution artifact containing only compiled
   * OWL output (rdfs:subClassOf, owl:Restriction). No canonical metadata
   * (fandaws:isImported, fandaws:source, etc.) enters the Execution Lane.
   *
   * Applies RECC structural conformance checks: restrictions connecting
   * BFO-disjoint types are not compiled (they stay in the Canonical Lane
   * with compilationStatus=Uncompiled).
   *
   * @param {string} graphId
   */
  compile(graphId) {
    const graph = this._graphs.get(graphId);
    if (!graph) return;

    // Mark prior artifacts as Stale before rebuild (Decision C-5)
    const priorLane = this._executionLanes.get(graphId);
    if (priorLane) {
      const now = new Date().toISOString();
      for (const artifact of priorLane.artifacts.values()) {
        artifact['fandaws:compilationStatus'] = 'Stale';
        artifact['fandaws:invalidatedAt'] = now;
        artifact['fandaws:invalidationReason'] = 'Canonical record changed — recompilation triggered';
        // Mark restrictions as Stale too
        for (const entry of (artifact['rdfs:subClassOf'] || [])) {
          if (typeof entry === 'object' && entry['@type']) {
            entry['fandaws:compilationStatus'] = 'Stale';
          }
        }
      }
      // Save the stale lane snapshot for AVC testing
      this._previousExecutionLane = new Map(priorLane.artifacts);
    }

    // Increment epoch
    const prevEpoch = this._compilationEpochs.get(graphId) || 0;
    const epoch = prevEpoch + 1;
    this._compilationEpochs.set(graphId, epoch);

    const concepts = graph['fandaws:concepts'] || [];
    const artifacts = new Map();

    for (const concept of concepts) {
      const iri = concept['@id'];
      const subClassOf = concept['rdfs:subClassOf'] || [];

      // Build execution artifact: only compiled OWL output
      const artifact = {
        '@id': iri,
        '@type': ['owl:Class', 'skos:Concept'],
        'rdfs:label': concept['rdfs:label'],
        'skos:prefLabel': concept['skos:prefLabel'],
        'rdfs:subClassOf': [],
        'fandaws:compilationEpoch': epoch,
        'fandaws:compilationStatus': 'Compiled',
      };

      // Broader as rdfs:subClassOf
      if (concept['skos:broader']) {
        artifact['rdfs:subClassOf'].push(concept['skos:broader']);
      }

      // BFO markers (string entries)
      for (const entry of subClassOf) {
        if (typeof entry === 'string' && entry !== concept['skos:broader']) {
          artifact['rdfs:subClassOf'].push(entry);
        }
      }

      // Restrictions: five-point pre-materialization check + confidence tier routing
      for (const entry of subClassOf) {
        if (typeof entry !== 'object' || !entry['@type']) continue;

        // Check 5: Normalization status must be Normalized (or absent = implicitly normalized)
        const normStatus = entry['fandaws:normalizationStatus'];
        if (normStatus && normStatus !== 'Normalized') {
          // Not normalized → skip compilation (deferred, NOT CompilerRejected)
          continue;
        }

        // Check 1: RECC structural conformance (BFO disjointness)
        const isValid = this._checkRestrictionValidity(entry, concepts);
        if (!isValid) {
          // Checks 1-3 failure → CompilerRejected with feedback
          entry['fandaws:compilationStatus'] = 'CompilerRejected';
          entry['fandaws:compilerFeedback'] = {
            failedCheck: 'structural_conformance',
            reason: `Restriction connects BFO-disjoint types. Subject and object are in disjoint BFO categories.`,
            timestamp: new Date().toISOString(),
          };
          continue;
        }

        // Check 3: BFO subcategory — inheres_in requires Quality (if applicable)
        if (entry['fandaws:bearerLink'] === 'bfo:inheres_in') {
          // inheres_in is only valid on relation types declaring bfo:Quality
          // For Phase C1, reject if the restriction uses inheres_in on a non-quality type
          entry['fandaws:compilationStatus'] = 'CompilerRejected';
          entry['fandaws:compilerFeedback'] = {
            failedCheck: 'bfo_subcategory',
            reason: `bfo:inheres_in is valid only on relation type classes declaring bfo:Quality as a BFO subcategory.`,
            timestamp: new Date().toISOString(),
          };
          continue;
        }

        // Check 4: Confidence tier routing
        const confidence = entry['fandaws:confidence'] ?? 1.0;

        if (confidence < 0.5) {
          // Not materialized — retained in Canonical Lane only
          entry['fandaws:compilationStatus'] = 'Compiled'; // Not rejected, just not materialized
          continue;
        }

        // Build the compiled restriction
        const compiledRestriction = {
          '@id': entry['@id'],
          '@type': entry['@type'],
          'owl:onProperty': entry['owl:onProperty'],
          'owl:someValuesFrom': entry['owl:someValuesFrom'],
          'owl:hasValue': entry['owl:hasValue'],
          'fandaws:restrictionKind': entry['fandaws:restrictionKind'],
          'fandaws:propertyLabel': entry['fandaws:propertyLabel'],
          'fandaws:verbLabel': entry['fandaws:verbLabel'],
          'fandaws:compilationEpoch': epoch,
          'fandaws:compilationStatus': 'Compiled',
        };

        // Tier routing
        if (confidence >= 0.9) {
          // Asserted tier: no annotations, full trust
        } else if (confidence >= 0.7) {
          // Flagged tier: confidence annotation
          compiledRestriction['fandaws:confidence'] = confidence;
        } else {
          // Tentative tier [0.5-0.7): tentative flag + confidence annotation
          compiledRestriction['fandaws:tentative'] = true;
          compiledRestriction['fandaws:confidence'] = confidence;
        }

        artifact['rdfs:subClassOf'].push(compiledRestriction);
      }

      // owl:equivalentClass (for imported concepts)
      if (concept['owl:equivalentClass']) {
        artifact['owl:equivalentClass'] = concept['owl:equivalentClass'];
      }

      // skos:definition
      if (concept['skos:definition']) {
        artifact['skos:definition'] = concept['skos:definition'];
      }

      // fandaws:algorithmicDefinition
      if (concept['fandaws:algorithmicDefinition']) {
        artifact['fandaws:algorithmicDefinition'] = concept['fandaws:algorithmicDefinition'];
      }

      artifacts.set(iri, artifact);
    }

    this._executionLanes.set(graphId, { epoch, artifacts });
  }

  /**
   * RECC structural conformance check: is this restriction type-valid?
   *
   * A restriction connecting BFO-disjoint types (e.g., MaterialEntity subject
   * with Process object) is type-invalid and should not be compiled to the
   * Execution Lane.
   *
   * @param {object} restriction
   * @param {object[]} concepts
   * @returns {boolean}
   */
  _checkRestrictionValidity(restriction, concepts) {
    if (this._bfoDisjointnessMap.size === 0) return true; // No map → no check

    const attachedToIri = restriction['fandaws:attachedTo'];
    const objectIri = restriction['owl:someValuesFrom'];
    if (!attachedToIri || !objectIri) return true;

    const subjectConcept = concepts.find((c) => c['@id'] === attachedToIri);
    const objectConcept = concepts.find((c) => c['@id'] === objectIri);
    if (!subjectConcept || !objectConcept) return true;

    const subjectBfo = this._getBfoCategory(subjectConcept, concepts);
    const objectBfo = this._getBfoCategory(objectConcept, concepts);
    if (!subjectBfo || !objectBfo) return true;

    return !this.areDisjoint(subjectBfo, objectBfo);
  }

  /**
   * Get the BFO category label for a concept.
   *
   * Uses the BFO marker in rdfs:subClassOf (set by _recomputeBfoMarkers)
   * to find the nearest ingested ancestor. Falls back to walking the
   * skos:broader chain if no marker is found.
   *
   * @param {object} concept
   * @param {object[]} [allConcepts] - All concepts in the graph (for chain walking)
   * @returns {string|null} BFO category label (e.g., "material entity")
   */
  _getBfoCategory(concept, allConcepts) {
    // If the concept itself is imported, it IS a BFO category
    if (concept['fandaws:isImported']) {
      return concept['rdfs:label'] || concept['skos:prefLabel'];
    }

    // Check rdfs:subClassOf for a BFO marker (ingested concept IRI)
    const subClassOf = concept['rdfs:subClassOf'] || [];
    const concepts = allConcepts || [];
    const conceptById = concepts.length > 0
      ? new Map(concepts.map((c) => [c['@id'], c]))
      : null;

    for (const entry of subClassOf) {
      if (typeof entry !== 'string') continue;
      if (entry === concept['skos:broader']) continue; // skip parent IRI
      // Check if this is an ingested concept IRI
      const ingested = conceptById?.get(entry);
      if (ingested && ingested['fandaws:isImported']) {
        return ingested['rdfs:label'] || ingested['skos:prefLabel'];
      }
    }

    // Walk the skos:broader chain to find the nearest ingested ancestor
    if (conceptById) {
      const visited = new Set([concept['@id']]);
      let cursor = concept['skos:broader'];
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const parent = conceptById.get(cursor);
        if (!parent) break;
        if (parent['fandaws:isImported']) {
          return parent['rdfs:label'] || parent['skos:prefLabel'];
        }
        cursor = parent['skos:broader'];
      }
    }

    return null;
  }

  /**
   * Check if two BFO category labels are disjoint per the Disjointness Map.
   *
   * @param {string} categoryA - BFO category label (e.g., "Material Entity")
   * @param {string} categoryB - BFO category label (e.g., "Process")
   * @returns {boolean}
   */
  areDisjoint(categoryA, categoryB) {
    if (!categoryA || !categoryB) return false;
    // Normalize: lowercase, handle both "Material Entity" and "MaterialEntity"
    const normA = categoryA.toLowerCase();
    const normB = categoryB.toLowerCase();
    const key = [normA, normB].sort().join('|');
    if (this._bfoDisjointnessMap.has(key)) return true;
    // Also try splitting camelCase: "MaterialEntity" → "material entity"
    const splitCamel = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const key2 = [splitCamel(categoryA), splitCamel(categoryB)].sort().join('|');
    return this._bfoDisjointnessMap.has(key2);
  }

  /**
   * Update the confidence of a canonical restriction and trigger the
   * retraction protocol if a tier boundary is crossed.
   *
   * @param {string} graphId
   * @param {string} subjectLabel - Subject concept prefLabel
   * @param {string} restrictionDesc - e.g., "has fur"
   * @param {number} newConfidence
   * @returns {{ retracted: boolean, tombstone?: object, newTier?: string }}
   */
  updateConfidence(graphId, subjectLabel, restrictionDesc, newConfidence) {
    const graph = this._graphs.get(graphId);
    if (!graph) return { retracted: false };

    const concepts = graph['fandaws:concepts'] || [];
    const subject = concepts.find((c) => c['skos:prefLabel'] === subjectLabel);
    if (!subject) return { retracted: false };

    // Find the restriction matching the description
    const subClassOf = subject['rdfs:subClassOf'] || [];
    const restriction = subClassOf.find((e) => {
      if (typeof e !== 'object' || !e['@type']) return false;
      const verb = e['fandaws:verbLabel'] || 'has';
      const objIri = e['owl:someValuesFrom'] || '';
      const objConcept = concepts.find((c) => c['@id'] === objIri);
      const objLabel = objConcept?.['skos:prefLabel'] || objIri.split('/').pop();
      return `${verb} ${objLabel}` === restrictionDesc;
    });

    if (!restriction) return { retracted: false };

    const oldConfidence = restriction['fandaws:confidence'] ?? 1.0;
    const oldTier = this._confidenceTier(oldConfidence);
    const newTier = this._confidenceTier(newConfidence);

    // Update the confidence
    restriction['fandaws:confidence'] = newConfidence;

    const crossesBoundary = oldTier !== newTier;
    let tombstone = null;

    if (crossesBoundary) {
      // Create tombstone record (permanent, Rule RT-4)
      tombstone = {
        '@type': 'fandaws:RetractionTombstone',
        'fandaws:retractedAt': new Date().toISOString(),
        'fandaws:retractedReason': `Confidence changed from ${oldConfidence} to ${newConfidence} (tier: ${oldTier} → ${newTier})`,
        'fandaws:originalConfidence': oldConfidence,
        'fandaws:newConfidence': newConfidence,
        'fandaws:restrictionId': restriction['@id'],
      };

      // Store tombstone on the restriction
      restriction['fandaws:tombstone'] = tombstone;
    }

    // Recompile to apply the new tier routing
    this.compile(graphId);

    return {
      retracted: crossesBoundary,
      tombstone,
      newTier,
      oldTier,
    };
  }

  /**
   * Determine the confidence tier for a given confidence value.
   */
  _confidenceTier(confidence) {
    if (confidence >= 0.9) return 'asserted';
    if (confidence >= 0.7) return 'flagged';
    if (confidence >= 0.5) return 'tentative';
    return 'not_materialized';
  }

  /**
   * Get the Execution Lane for a graph.
   *
   * @param {string} graphId
   * @returns {{ epoch: number, artifacts: Map<string, object> } | null}
   */
  getExecutionLane(graphId) {
    return this._executionLanes.get(graphId) || null;
  }

  /**
   * Get the current compilation epoch for a graph.
   */
  getCompilationEpoch(graphId) {
    return this._compilationEpochs.get(graphId) || 0;
  }

  /**
   * Get the BFO Disjointness Map.
   */
  getDisjointnessMap() {
    return this._bfoDisjointnessMap;
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
      altLabelToIri: new Map(),
      // bfo IRI (both prefixed and full URI form) → ingested concept Fandaws IRI.
      // Used by inheritBfoCategory to resolve BFO category markers to Fandaws
      // IRIs without a separate adapter call.
      bfoEquivalenceIndex: new Map(),
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

      // Index 6: alt label → IRI array (for homonym disambiguation).
      // Each concept may have multiple skos:altLabel entries; index every one.
      // This is the lookup path that finds homonyms when a user types a bare
      // label like "mouse" against concepts qualified as "mouse (rodent)" and
      // "mouse (input device)" — both carry "mouse" in their skos:altLabel array.
      const altLabels = concept['skos:altLabel'] || [];
      for (const altLabel of altLabels) {
        const existing = idx.altLabelToIri.get(altLabel) || [];
        existing.push(iri);
        idx.altLabelToIri.set(altLabel, existing);
      }

      // Index 7: BFO equivalence — for ingested concepts, map their source
      // IRIs (both prefixed and full forms) to the Fandaws concept IRI.
      const equivs = concept['owl:equivalentClass'];
      if (Array.isArray(equivs)) {
        for (const e of equivs) {
          if (typeof e !== 'string') continue;
          idx.bfoEquivalenceIndex.set(e, iri);
          if (e.startsWith('http://purl.obolibrary.org/obo/BFO_')) {
            idx.bfoEquivalenceIndex.set('bfo:' + e.split('/').pop(), iri);
          } else if (e.startsWith('bfo:BFO_')) {
            idx.bfoEquivalenceIndex.set('http://purl.obolibrary.org/obo/' + e.slice(4), iri);
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

  /**
   * Find concepts with a given skos:altLabel (typically the bare label
   * before homonym qualification — e.g. "mouse" finds both "mouse (rodent)"
   * and "mouse (input device)" because each carries "mouse" in its
   * skos:altLabel array).
   *
   * @param {string} label - Alternative label to search for
   * @param {string} graphId - Graph IRI
   * @returns {object[]} Matching concept nodes
   */
  findConceptsByAltLabel(label, graphId) {
    const idx = this._indices.get(graphId);
    if (!idx) return [];
    const iris = idx.altLabelToIri.get(label) || [];
    const graph = this._graphs.get(graphId);
    if (!graph) return [];
    return iris.map((iri) =>
      (graph['fandaws:concepts'] || []).find((c) => c['@id'] === iri),
    ).filter(Boolean);
  }

  /**
   * @deprecated Use findConceptsByAltLabel — homonym original labels are
   * now stored in skos:altLabel (semantically correct) instead of
   * skos:hiddenLabel. Kept for one release for backward compatibility.
   */
  findConceptsByHiddenLabel(label, graphId) {
    return this.findConceptsByAltLabel(label, graphId);
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

    // Check Index 6: altLabel → IRIs
    for (const [label, iris] of idx.altLabelToIri) {
      for (const iri of iris) {
        if (!conceptIris.has(iri)) {
          ghosts.push({
            index: 'altLabelToIri',
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
