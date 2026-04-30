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
     * SourceAxiomGraph (VD-1): staging records, quarantine records, and raw source axioms.
     * Contains exactly four record types: CandidateClass, CandidateRelation,
     * QuarantineRecord, and RawSourceAxiom. Records are NEVER in the canonical
     * graph or execution lane. Renamed from _quarantineStore at Phase D1.
     * @type {Map<string, object>}
     */
    this._sourceAxiomGraph = new Map();

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

    // ── Step 1: Emit owl:ObjectProperty artifacts for canonical relation type classes ──
    // Rule EX-2: each rel:{name} property gets a standalone declaration with
    // rdfs:domain, rdfs:range, and any owl:PropertyCharacteristic approved by the
    // compiler. These execution artifacts coexist with concept artifacts in the
    // execution lane — the export engine reads both.
    for (const concept of concepts) {
      const types = Array.isArray(concept['@type']) ? concept['@type'] : [concept['@type']];
      if (!types.includes('fandaws:RelationTypeClass')) continue;

      const execIRI = concept['fandaws:executionPropertyIRI'];
      if (!execIRI) continue;

      const propertyArtifact = {
        '@id': execIRI,
        '@type': ['owl:ObjectProperty'],
        'rdfs:label': concept['rdfs:label'],
        'fandaws:canonicalRelationIRI': concept['@id'],
        'fandaws:compilationEpoch': epoch,
        'fandaws:compilationStatus': 'Compiled',
      };

      const domain = concept['fandaws:relationDomain'];
      const range = concept['fandaws:relationRange'];
      if (domain) propertyArtifact['rdfs:domain'] = domain;
      if (range) propertyArtifact['rdfs:range'] = range;

      // Characteristics: owl:TransitiveProperty, owl:SymmetricProperty, etc.
      const chars = concept['fandaws:relationCharacteristics'] || [];
      const extraTypes = [];
      for (const ch of chars) {
        if (ch === 'transitive' || ch === 'owl:TransitiveProperty') extraTypes.push('owl:TransitiveProperty');
        if (ch === 'symmetric' || ch === 'owl:SymmetricProperty') extraTypes.push('owl:SymmetricProperty');
        if (ch === 'reflexive' || ch === 'owl:ReflexiveProperty') extraTypes.push('owl:ReflexiveProperty');
        if (ch === 'functional' || ch === 'owl:FunctionalProperty') extraTypes.push('owl:FunctionalProperty');
        if (ch === 'inverseFunctional' || ch === 'owl:InverseFunctionalProperty') extraTypes.push('owl:InverseFunctionalProperty');
      }
      if (extraTypes.length > 0) {
        propertyArtifact['@type'] = ['owl:ObjectProperty', ...extraTypes];
      }

      // Sub-property of parent relation (PD-6/PD-7)
      if (concept['rdfs:subClassOf'] && concept['rdfs:subClassOf'].length > 0) {
        propertyArtifact['rdfs:subPropertyOf'] = concept['rdfs:subClassOf']
          .map((p) => {
            // Look up parent's execution property IRI
            const parent = concepts.find((c) => c['@id'] === p);
            return parent?.['fandaws:executionPropertyIRI'] || null;
          })
          .filter(Boolean);
      }

      // owl:equivalentProperty bridges (Rule PD-9)
      const equivs = concept['owl:equivalentProperty'] || [];
      if (equivs.length > 0) {
        propertyArtifact['owl:equivalentProperty'] = equivs.map((e) => ({
          source: e.source,
          target: e.target,
        }));
      }

      artifacts.set(execIRI, propertyArtifact);
    }

    // ── Step 2: Emit concept artifacts (classes with rdfs:subClassOf restrictions) ──
    for (const concept of concepts) {
      // Skip canonical relation type classes — they're emitted as owl:ObjectProperty above
      const types = Array.isArray(concept['@type']) ? concept['@type'] : [concept['@type']];
      if (types.includes('fandaws:RelationTypeClass')) continue;

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

        // Check 2: Provenance authority enforcement (Section 5.7, RECC-3/RECC-4)
        // Pattern A relation types (e.g., inheres_in) declare provenance authority
        // via owl:hasValue on fan:isSourceOf inverse. Restrictions using these
        // relation types MUST have a standalone provenance triple.
        const relationType = entry['fandaws:relationType'];
        if (relationType === 'fandaws:relationType/inheres_in') {
          const provTriple = entry['fandaws:provenanceTriple'];
          if (!provTriple) {
            entry['fandaws:compilationStatus'] = 'CompilerRejected';
            entry['fandaws:compilerFeedback'] = {
              failedCheck: 'provenance_authority',
              reason: `Pattern A relation type requires a standalone fan:isSourceOf provenance triple. None found.`,
              timestamp: new Date().toISOString(),
            };
            continue;
          }
          if (!entry['fandaws:hasStandaloneProvenance']) {
            entry['fandaws:compilationStatus'] = 'CompilerRejected';
            entry['fandaws:compilerFeedback'] = {
              failedCheck: 'provenance_standalone',
              reason: `The fan:isSourceOf triple must be standalone — asserted outside the restriction's subject block. Embedded provenance is invalid (RECC-4).`,
              timestamp: new Date().toISOString(),
            };
            continue;
          }
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

        // Update canonical status: if previously CompilerRejected, it now compiles
        if (entry['fandaws:compilationStatus'] === 'CompilerRejected') {
          entry['fandaws:compilationStatus'] = 'Compiled';
          delete entry['fandaws:compilerFeedback'];
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

  /**
   * Get the SourceAxiomGraph (staging + quarantine + raw axiom records).
   * Per VD-1: contains CandidateClass, CandidateRelation, QuarantineRecord,
   * and RawSourceAxiom record types.
   */
  getSourceAxiomGraph() {
    return this._sourceAxiomGraph;
  }

  /** @deprecated Use getSourceAxiomGraph(). Alias retained for backward compatibility. */
  getQuarantineStore() {
    return this._sourceAxiomGraph;
  }

  /**
   * Ingest an external axiom through the normalization pipeline.
   * Structural violations go to the quarantine store (not the canonical graph).
   * This is a separate entry point from the conversational pipeline.
   *
   * @param {string} graphId
   * @param {object} axiom - { axiom, sourceSystem, domainClass, rangeClass }
   * @returns {{ quarantined: boolean, quarantineId?: string }}
   */
  ingestExternalAxiom(graphId, axiom) {
    const { sourceSystem, domainClass, rangeClass } = axiom;

    // Check BFO disjointness between domain and range
    if (domainClass && rangeClass && this.areDisjoint(domainClass, rangeClass)) {
      const quarantineId = `fandaws:quarantine/${Date.now()}`;
      const record = {
        quarantineId,
        type: 'QuarantineRecord',
        sourceSystem: sourceSystem || 'unknown',
        importedAt: new Date().toISOString(),
        quarantineReason: 'RECC structural conformance violation',
        quarantineStatus: 'PendingReview',
        rawAxiom: axiom.axiom || '',
        failureTrace: {
          violationRule: 'TypeDisjointnessViolation',
          relation: 'has_part',
          subjectNode: axiom.axiom?.split(' ')[0] || 'unknown',
          objectNode: axiom.axiom?.split(' ').pop() || 'unknown',
          subjectType: domainClass,
          objectType: rangeClass,
          disjointPair: [domainClass, rangeClass].sort(),
          suggestedRepair: `Review BFO placement of the object concept. Expected: ${domainClass}. Current: ${rangeClass}.`,
        },
      };
      this._sourceAxiomGraph.set(quarantineId, record);
      return { quarantined: true, quarantineId };
    }

    // Not disjoint — would proceed to canonical (Phase D full pipeline)
    // For Phase C2, non-violating axioms are not yet handled
    return { quarantined: false };
  }

  /**
   * Release a quarantine record: create canonical restriction at confidence 0.7.
   *
   * @param {string} graphId
   * @param {string} quarantineId
   * @returns {{ released: boolean }}
   */
  releaseQuarantine(graphId, quarantineId) {
    const record = this._sourceAxiomGraph.get(quarantineId);
    if (!record || record.quarantineStatus !== 'PendingReview') return { released: false };

    record.quarantineStatus = 'Released';

    // Create canonical restriction at confidence 0.7 (Decision C-3)
    const graph = this._graphs.get(graphId);
    if (graph) {
      // Parse the axiom to find subject/object
      const axiomStr = record.rawAxiom || record.axiom || '';
      const match = axiomStr.match(/(\w+)\s+(\w+)\s+(\w+)/);
      if (match) {
        const [, subjectLabel, verb, objectLabel] = match;
        const concepts = graph['fandaws:concepts'] || [];
        const subject = concepts.find((c) =>
          c['skos:prefLabel'] === subjectLabel || c['rdfs:label'] === subjectLabel,
        );
        const object = concepts.find((c) =>
          c['skos:prefLabel'] === objectLabel || c['rdfs:label'] === objectLabel,
        );
        if (subject && object) {
          const restriction = {
            '@id': `${subject['@id']}#r-${verb}-${object['skos:prefLabel']}`,
            '@type': 'owl:Restriction',
            'owl:onProperty': `fandaws:objectProperty/${verb}`,
            'owl:someValuesFrom': object['@id'],
            'fandaws:verbLabel': verb,
            'fandaws:propertyLabel': object['skos:prefLabel'],
            'fandaws:attachedTo': subject['@id'],
            'fandaws:restrictionKind': 'property',
            'fandaws:confidence': 0.7,
            'fandaws:normalizationStatus': 'Normalized',
            'fandaws:source': record.sourceSystem,
          };
          subject['rdfs:subClassOf'] = subject['rdfs:subClassOf'] || [];
          subject['rdfs:subClassOf'].push(restriction);
          this._graphs.set(graphId, graph);
          this.compile(graphId);
          // X9 Step 7.14a: fire mutation callback for canonical-graph persistence.
          this._emitDirectWriteMutation('AddRestrictionFromAxiom', graphId, {
            classIRI: subject['@id'],
          });
        }
      }
    }

    return { released: true };
  }

  /**
   * Reject a quarantine record. Record retained permanently for audit.
   *
   * @param {string} quarantineId
   * @returns {{ rejected: boolean }}
   */
  rejectQuarantine(quarantineId) {
    const record = this._sourceAxiomGraph.get(quarantineId);
    if (!record || record.quarantineStatus !== 'PendingReview') return { rejected: false };
    record.quarantineStatus = 'Rejected';
    return { rejected: true };
  }

  // ─────────────────────────────────────────────────────────
  // Phase D1: Bulk Ingestion Pipeline
  // ─────────────────────────────────────────────────────────

  /**
   * Ingestion session records. Keyed by sessionId.
   * Contains IngestionSession and VersionChangeEvent records.
   * NOT in concept graph, NOT in SourceAxiomGraph (Q2 answer).
   * @type {Map<string, object>}
   */
  get _ingestionSessions() {
    if (!this.__ingestionSessions) this.__ingestionSessions = new Map();
    return this.__ingestionSessions;
  }

  /**
   * Start an ingestion session.
   * @param {object} options - { sourceOntology, autoMergeThreshold }
   * @returns {{ sessionId: string, session: object }}
   */
  startIngestionSession(options = {}) {
    const sessionId = `fandaws:session/${Date.now()}`;
    const session = {
      sessionId,
      type: 'IngestionSession',
      sourceOntology: options.sourceOntology || 'unknown',
      sessionStartedAt: new Date().toISOString(),
      sessionCompletedAt: null,
      compilationEpochAtCompletion: null,
      classesIngested: 0,
      classesPlaced: 0,
      classesAmbiguous: 0,
      classesDeferred: 0,
      classesRejected: 0,
      autoMergeThreshold: options.autoMergeThreshold ?? 0.85,
      confidenceDelta: options.confidenceDelta ?? 0.15,
      // X9 Step 7.5+ (2026-04-27): session-scoped resolvedPlacements Map.
      // Persists across ingestOntology + cascadeAnalystResolution calls so
      // both NA-1.1 initial cascade (parents-before-children at ingest time)
      // and NA-1.4 reactive cascade (analyst resolves a root post-ingest)
      // route through the SAME evaluatePlacement engine — single-engine
      // discipline per X3 §3.4 / X4 §3.3 architectural lock.
      resolvedPlacements: new Map(),
    };
    this._ingestionSessions.set(sessionId, session);
    return { sessionId, session };
  }

  /**
   * Query all ingestion sessions and version change events.
   * @returns {Map<string, object>}
   */
  querySessions() {
    return this._ingestionSessions;
  }

  /**
   * Ingest an external ontology through the batch pipeline.
   * Decision D-2: batch, not conversational. Zero interactive prompts.
   *
   * @param {string} graphId
   * @param {object} trigger - { sourceOntology, classes, properties, stopAfterStaging, confidenceDelta }
   * @returns {object} Pipeline result
   */
  ingestOntology(graphId, trigger) {
    const { sourceOntology, classes = [], properties = [], stopAfterStaging = false, confidenceDelta } = trigger;

    // Start session
    const { sessionId, session } = this.startIngestionSession({
      sourceOntology,
      confidenceDelta: confidenceDelta ?? 0.15,
    });

    const graph = this._graphs.get(graphId);
    if (!graph) return { error: 'Graph not found' };

    // X9 Step 7.5 (2026-04-27): build classMap for transitive ancestor-chain
    // construction per X9 §3.1 caller-contract. Each class's ancestorChain
    // is built by walking parsed.classes[i].superclass transitively until
    // a root (no superclass) or external/BFO class is reached.
    const classMap = new Map();
    for (const cls of classes) classMap.set(cls.iri, cls);

    // ── Phase 1a: Create staging records ──
    const stagingIds = [];
    const stagingIdByIRI = new Map();
    for (const cls of classes) {
      const stagingId = `fandaws:staging/${Date.now()}-${cls.iri}`;
      const record = {
        type: 'CandidateClass',
        sourceIRI: cls.iri,
        sourceLabel: cls.label,
        sourceOntology,
        superclass: cls.superclass || null,
        ancestorChain: buildTransitiveAncestorChain(cls.iri, classMap),
        // X9 Step 7.5+ (2026-04-27): caller-determined signal for the
        // sandbox. True iff the immediate superclass is itself declared in
        // the same ingested ontology (classMap). The sandbox uses this to
        // route to PlacementDeferred (declared-parent-no-BFO-grounding)
        // instead of low-confidence PlacementAmbiguous.
        parentInOntology: !!(cls.superclass && classMap.has(cls.superclass)),
        properties: cls.properties || [],
        // X9 Step 7.13 (2026-04-29): retain owl:Restriction blank-node
        // objects + owl:disjointWith pairs from the parsed source on the
        // staging record so _promoteCandidate can write them into the
        // canonical concept's rdfs:subClassOf / owl:disjointWith fields.
        // Without this, the parsed axiomatic content of the source ontology
        // is lost at promotion time; the canonical graph becomes a bare
        // skeleton without the constraints that define the imported classes.
        restrictions: cls.restrictions || [],
        disjointWith: cls.disjointWith || [],
        ingestedInSession: sessionId,
        candidateStatus: 'Pending',
        normalizationStatus: null,
        placementConfidence: null,
        placementJustification: null,
      };
      this._sourceAxiomGraph.set(stagingId, record);
      stagingIds.push(stagingId);
      stagingIdByIRI.set(cls.iri, stagingId);
      session.classesIngested++;
    }

    // X9 Step 7.5 Gap 2: generate CandidateRelation staging records from
    // parsed.properties at session creation. Workbench Phase 2 Review
    // consumes these via getSourceAxiomGraph() filter on type === 'CandidateRelation'.
    // X9 Step 7.5++ (2026-04-27): build propertyMap parallel to classMap so
    // each relation record can flag whether its declared subPropertyOf
    // points to another property staged in this same session. Mirrors
    // Phase 1+'s parentInOntology pattern; lets Phase 2 routing override
    // NovelPromotionPanel to RelationDeferred for in-session sub-properties.
    const propertyMap = new Map();
    for (const prop of properties) propertyMap.set(prop.iri, prop);

    const relationStagingIds = [];
    for (const prop of properties) {
      const stagingId = `fandaws:staging/${Date.now()}-rel-${prop.iri}`;
      const record = {
        type: 'CandidateRelation',
        sourceIRI: prop.iri,
        sourceLabel: prop.label,
        sourceOntology,
        declaredDomain: prop.declaredDomain ?? prop.domain ?? null,
        declaredRange: prop.declaredRange ?? prop.range ?? null,
        declaredCharacteristics: prop.declaredCharacteristics ?? prop.characteristics ?? [],
        subPropertyOf: prop.subPropertyOf ?? null,
        // X9 Step 7.5++: caller-determined signal for Phase 2 router.
        // True iff the immediate subPropertyOf is itself a property
        // declared in the same ingested ontology (propertyMap).
        parentPropertyInOntology: !!(prop.subPropertyOf && propertyMap.has(prop.subPropertyOf)),
        ingestedInSession: sessionId,
        candidateStatus: 'Pending',
        normalizationStatus: null,
      };
      this._sourceAxiomGraph.set(stagingId, record);
      relationStagingIds.push(stagingId);
    }

    if (stopAfterStaging) {
      return { sessionId, staged: stagingIds.length, stagedRelations: relationStagingIds.length, stopped: true };
    }

    // ── Phase 1b: Evaluate placement for each staged class ──
    // Import placement sandbox lazily to avoid circular deps
    const { evaluatePlacement, routePlacement } = this._getPlacementSandbox();
    const delta = session.confidenceDelta;

    // X9 Step 7.5 NA-1.1 cascade: evaluate parents before children so
    // child evaluations can read parent's resolved placement via
    // resolvedPlacements Map. Topological sort by ancestorChain length
    // (root classes have empty chain → sort first; deepest descendants
    // sort last).
    const sortedStagingIds = [...stagingIds].sort((a, b) => {
      const ra = this._sourceAxiomGraph.get(a);
      const rb = this._sourceAxiomGraph.get(b);
      return (ra.ancestorChain?.length || 0) - (rb.ancestorChain?.length || 0);
    });

    // X9 Step 7.5+ (2026-04-27): resolvedPlacements is now session-scoped
    // (lifted from ingestion-loop closure) so cascadeAnalystResolution can
    // re-invoke evaluatePlacement against the SAME Map post-ingest. Single-
    // engine discipline per X3 §3.4 / X4 §3.3.
    const resolvedPlacements = session.resolvedPlacements;

    for (const stagingId of sortedStagingIds) {
      const record = this._sourceAxiomGraph.get(stagingId);
      const result = evaluatePlacement({
        iri: record.sourceIRI,
        label: record.sourceLabel,
        superclass: record.superclass,
        ancestorChain: record.ancestorChain || [],
        parentInOntology: record.parentInOntology || false,
        properties: record.properties,
      }, {
        disjointnessMap: this._bfoDisjointnessMap,
        resolvedPlacements,
      });

      const routing = routePlacement(result, delta);
      record.candidateStatus = routing.status;
      record.placementConfidence = result.confidence;
      record.placementJustification = result.justification;
      record.placementResult = routing.placement;

      if (routing.status === 'PlacementConfirmed') {
        // Auto-promote to canonical
        this._promoteCandidate(graphId, record, sessionId);
        session.classesPlaced++;
        // X9 Step 7.5: register in resolvedPlacements so descendants inherit
        if (routing.placement) resolvedPlacements.set(record.sourceIRI, routing.placement);
      } else if (routing.status === 'PlacementDeferred') {
        // X9 Step 7.5+ (2026-04-27): declared in-ontology parent without
        // BFO grounding yet. Awaits cascadeAnalystResolution from analyst-
        // resolved root. Does NOT block Phase 2; does NOT count toward
        // classesAmbiguous. Single-engine cascade promotes to Confirmed
        // post-resolve via the same evaluatePlacement call path.
        record.normalizationStatus = 'AwaitingCascade';
        session.classesDeferred++;
      } else if (routing.status === 'PlacementAmbiguous') {
        record.normalizationStatus = 'PendingHumanResolution';
        session.classesAmbiguous++;
      } else if (routing.status === 'PlacementRejected') {
        record.normalizationStatus = 'Rejected';
        session.classesRejected++;
      }
    }

    // ── Check blocking rule (Decision D-4) ──
    // X9 Step 7.5+: 'AwaitingCascade' (PlacementDeferred) does NOT block
    // Phase 2 — descendants inherit reactively when a root resolves.
    // Only PendingHumanResolution (true Ambiguous, no in-ontology parent)
    // counts.
    const unresolvedClasses = [];
    for (const sid of stagingIds) {
      const r = this._sourceAxiomGraph.get(sid);
      if (r.normalizationStatus === 'PendingHumanResolution') {
        unresolvedClasses.push(r.sourceIRI);
      }
    }
    const phase2Blocked = unresolvedClasses.length > 0;

    // ── Complete session if no blocking ──
    if (!phase2Blocked) {
      session.sessionCompletedAt = new Date().toISOString();
      session.compilationEpochAtCompletion = this._compilationEpochs.get(graphId) || 0;
    }

    return {
      sessionId,
      session,
      promptsFired: 0,
      machineSignalsEmitted: 0,
      pipelineState: {
        phase1Complete: true,
        phase2Started: false,
        phase2Blocked,
        phase2CanProceed: !phase2Blocked,
        allPhase1Resolved: !phase2Blocked,
        blockedBy: phase2Blocked ? 'PendingHumanResolution' : null,
        unresolvedCount: unresolvedClasses.length,
        unresolvedClasses,
      },
    };
  }

  /**
   * Lazy-load placement sandbox to avoid circular imports.
   * @private
   */
  _getPlacementSandbox() {
    if (!this.__placementSandbox) {
      // Dynamic import fallback: store reference after first load
      // Since we're in a synchronous context, we rely on the module being
      // pre-imported by the runner or test setup. Use a direct require-style
      // approach with a cached reference.
      this.__placementSandbox = { evaluatePlacement: null, routePlacement: null };
    }
    return this.__placementSandbox;
  }

  /**
   * Register the placement sandbox functions (called during module init).
   * This avoids circular dependency issues.
   */
  registerPlacementSandbox(evaluatePlacement, routePlacement) {
    this.__placementSandbox = { evaluatePlacement, routePlacement };
  }

  /**
   * Promote a confirmed CandidateClass to canonical.
   * Creates a fresh fandaws:class/ IRI concept with owl:equivalentClass.
   * Q1 answer: isImported: false, user CAN modify.
   * @private
   */
  _promoteCandidate(graphId, record, sessionId) {
    const graph = this._graphs.get(graphId);
    if (!graph) return;

    const label = (record.sourceLabel || record.sourceIRI?.split(/[/#:]/).pop() || 'unknown').toLowerCase();
    const slug = label.replace(/\s+/g, '-');
    const uuid = this._generateUUID(label);
    const conceptIri = `fandaws:class/${uuid}/${slug}`;

    // X9 Step 7.15 (2026-04-29): preserve the DECLARED superclass IRI
    // through promotion. Previously this method routed via the Phase 1
    // placement bucket (e.g., "IndependentContinuant") — collapsing the
    // entire CCO leaf-class hierarchy onto the 8 BFO root buckets at
    // canonical-write time. Geospatial Region (subClassOf BFO_0000029
    // / Site) ended up as subClassOf IndependentContinuant; Object Track
    // (subClassOf BFO_0000026 / OneDimensionalSpatialRegion) ended up as
    // subClassOf SpatialRegion. The declared taxonomic structure of the
    // source ontology was destroyed.
    //
    // Two-pass lookup:
    //   (1) PRIMARY: match declared superclass IRI against owl:equivalentClass
    //       on existing graph concepts. BFO infrastructure concepts carry their
    //       obo:BFO_NNNNNNN URI in owl:equivalentClass. In-session CCO parents
    //       (already promoted earlier in this session) carry their cco:ont*
    //       URI the same way.
    //   (2) FALLBACK: placement-bucket label match (legacy behavior). Only
    //       fires when the declared superclass doesn't resolve to an
    //       in-graph concept (e.g., parent is in a separate ontology file
    //       not yet ingested).
    const concepts = graph['fandaws:concepts'] || [];
    let broaderIri = null;

    // Pass 1: declared-superclass IRI lookup via owl:equivalentClass.
    if (record.superclass) {
      const declaredParent = concepts.find(c => {
        const equiv = c['owl:equivalentClass'];
        if (!equiv) return false;
        if (Array.isArray(equiv)) return equiv.includes(record.superclass);
        return equiv === record.superclass;
      });
      if (declaredParent) {
        broaderIri = declaredParent['@id'];
      }
    }

    // Pass 2: placement-bucket fallback (only when declared lookup failed).
    if (!broaderIri && record.placementResult) {
      const placement = record.placementResult;
      const bfoConcept = concepts.find(c => {
        const prefLabel = (c['skos:prefLabel'] || '').toLowerCase().replace(/\s+/g, '');
        const placementLower = placement.toLowerCase().replace(/\s+/g, '');
        // Match by label (e.g., "material entity" matches "MaterialEntity")
        return prefLabel === placementLower.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/\s+/g, '') ||
               prefLabel === placementLower;
      });
      if (bfoConcept) {
        broaderIri = bfoConcept['@id'];
      }
    }

    // X9 Step 7.13 (2026-04-29): retain restrictions + disjointness on
    // the canonical concept. rdfs:subClassOf is a JSON-LD array of mixed
    // entries — IRI strings (named parents) AND restriction objects
    // (owl:Restriction blank-node bodies parsed from source). Step 7.5+++
    // orphan rule (phase3-review-panel.js:36-43) already filters
    // restriction objects from parent attribution via the owl:onProperty
    // field check, so adding them here doesn't trigger Phase 3 false-flags.
    const subClassOfArray = [];
    if (broaderIri) subClassOfArray.push(broaderIri);
    for (const r of (record.restrictions || [])) subClassOfArray.push(r);

    const concept = {
      '@id': conceptIri,
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': record.sourceLabel,
      'skos:prefLabel': label,
      'skos:broader': broaderIri,
      'rdfs:subClassOf': subClassOfArray,
      'owl:disjointWith': record.disjointWith || [],
      'dcterms:created': new Date().toISOString(),
      'owl:equivalentClass': [record.sourceIRI],
      'fandaws:isImported': false,
      'fandaws:ingestSource': record.sourceOntology,
      'fandaws:placementConfidence': record.placementConfidence,
      'fandaws:ingestedInSession': sessionId,
    };

    graph['fandaws:concepts'].push(concept);
    this._graphs.set(graphId, graph);
    this.compile(graphId);
    // X9 Step 7.14a: fire mutation callback so Workbench canonical-graph
    // persistence subscriber (debounced auto-save) triggers.
    this._emitDirectWriteMutation('PromoteCandidate', graphId, {
      conceptIri: concept['@id'],
      sessionId,
    });
  }

  /**
   * Simple UUID v5-like generator based on label (deterministic).
   * @private
   */
  _generateUUID(label) {
    // Simple hash-based UUID for determinism
    let hash = 0;
    const str = `fandaws:${label}:${Date.now()}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-5${hex.slice(1, 4)}-${hex.slice(0, 4)}-${hex.slice(0, 12).padEnd(12, '0')}`;
  }

  /**
   * Resolve a human placement decision for an ambiguous class.
   * @param {string} graphId
   * @param {string} candidateIRI - Source IRI of the candidate class
   * @param {string} selectedPlacement - BFO node selected by human (e.g., "bfo:MaterialEntity")
   * @returns {{ resolved: boolean }}
   */
  resolvePlacement(graphId, candidateIRI, selectedPlacement) {
    // Find the staging record
    let stagingId = null;
    let record = null;
    for (const [id, r] of this._sourceAxiomGraph.entries()) {
      if (r.type === 'CandidateClass' && r.sourceIRI === candidateIRI) {
        stagingId = id;
        record = r;
        break;
      }
    }
    if (!record) return { resolved: false };

    // Update staging record
    record.candidateStatus = 'PlacementConfirmed';
    record.normalizationStatus = 'Normalized';

    // Normalize the selected placement
    const { evaluatePlacement, routePlacement } = this._getPlacementSandbox();
    // Import normalizeBfoClass indirectly
    const placementNormalized = selectedPlacement.replace('bfo:', '').replace(/\s+/g, '');
    record.placementResult = placementNormalized;

    // Promote to canonical
    const sessionId = record.ingestedInSession;
    this._promoteCandidate(graphId, record, sessionId);

    // Update session counts
    if (sessionId) {
      const session = this._ingestionSessions.get(sessionId);
      if (session) {
        session.classesAmbiguous = Math.max(0, session.classesAmbiguous - 1);
        session.classesPlaced++;
      }
    }

    // Check if all Phase 1 items are now resolved
    let allResolved = true;
    for (const r of this._sourceAxiomGraph.values()) {
      if (r.type === 'CandidateClass' && r.normalizationStatus === 'PendingHumanResolution') {
        allResolved = false;
        break;
      }
    }

    return {
      resolved: true,
      pipelineState: {
        phase1Complete: true,
        allPhase1Resolved: allResolved,
        phase2CanProceed: allResolved,
      },
    };
  }

  /**
   * X9 Step 7.5+ (2026-04-27) — Reactive cascade after analyst resolves a
   * root class to a BFO category. Walks every PlacementDeferred staging
   * record whose ancestorChain contains the resolved root and re-invokes
   * evaluatePlacement against the now-updated session.resolvedPlacements
   * Map. The cascade route is the SAME Pass-(a) cascade-from-resolved at
   * placement-sandbox.js:157-170 used during initial ingestion — single-
   * engine discipline per X3 §3.4 / X4 §3.3 architectural lock. NA-1.1
   * (initial cascade, parents-before-children at ingest) and NA-1.4
   * (reactive cascade, root resolved post-ingest) run through one code
   * path, not two.
   *
   * Multi-inheritance contradiction edge case (Appendix A.2.6 / bundle v6
   * SWC discipline): if the new evaluation surfaces a placement that
   * conflicts with an already-confirmed ancestor in the chain, the routing
   * status returned is what evaluatePlacement+routePlacement produces —
   * the cascade does NOT silently overwrite a prior PlacementConfirmed
   * with a new conflicting category. (Today's implementation: single-root
   * promotion overwrites since contradiction detection at this layer is
   * deferred to the dispatcher; the cascade exposes a `cascadeConflicts`
   * array on the return for callers to surface.)
   *
   * @param {string} graphId
   * @param {string} sessionId - the adapter-side IngestionSession ID
   * @param {string} rootIRI - the analyst-resolved root class IRI
   * @param {string} bfoCategory - the BFO category (e.g., 'Process')
   * @returns {{ cascaded: number, conflicts: Array<{iri,prevPlacement,newPlacement}> }}
   */
  cascadeAnalystResolution(graphId, sessionId, rootIRI, bfoCategory) {
    const session = this._ingestionSessions.get(sessionId);
    if (!session) return { cascaded: 0, conflicts: [] };

    // Seed the session-scoped resolvedPlacements Map with the new root.
    // Subsequent evaluatePlacement calls find this entry via Pass (a)
    // cascade-from-resolved at placement-sandbox.js:157-170.
    const resolvedPlacements = session.resolvedPlacements || new Map();
    resolvedPlacements.set(rootIRI, bfoCategory);
    session.resolvedPlacements = resolvedPlacements;

    const { evaluatePlacement, routePlacement } = this._getPlacementSandbox();
    const delta = session.confidenceDelta ?? 0.15;

    let cascaded = 0;
    const conflicts = [];

    // Walk all CandidateClass records belonging to this session that are
    // currently PlacementDeferred AND whose ancestorChain contains rootIRI.
    // Order them parents-first so multi-level cascade chains build up
    // resolvedPlacements progressively.
    const eligible = [];
    for (const [stagingId, record] of this._sourceAxiomGraph.entries()) {
      if (record.type !== 'CandidateClass') continue;
      if (record.ingestedInSession !== sessionId) continue;
      if (record.candidateStatus !== 'PlacementDeferred') continue;
      if (!record.ancestorChain || !record.ancestorChain.includes(rootIRI)) continue;
      eligible.push({ stagingId, record });
    }
    eligible.sort((a, b) =>
      (a.record.ancestorChain?.length || 0) - (b.record.ancestorChain?.length || 0)
    );

    for (const { record } of eligible) {
      const result = evaluatePlacement({
        iri: record.sourceIRI,
        label: record.sourceLabel,
        superclass: record.superclass,
        ancestorChain: record.ancestorChain || [],
        parentInOntology: record.parentInOntology || false,
        properties: record.properties,
      }, {
        disjointnessMap: this._bfoDisjointnessMap,
        resolvedPlacements,
      });

      const routing = routePlacement(result, delta);

      if (routing.status === 'PlacementConfirmed') {
        const prevPlacement = record.placementResult;
        record.candidateStatus = 'PlacementConfirmed';
        record.placementResult = routing.placement;
        record.placementConfidence = result.confidence;
        record.placementJustification = result.justification;
        record.normalizationStatus = 'CascadedFromAnalystOverride';
        // Promote to canonical now that the BFO category is known.
        this._promoteCandidate(graphId, record, sessionId);
        if (session.classesDeferred > 0) session.classesDeferred--;
        session.classesPlaced++;
        // Register so descendants downstream of THIS record cascade further.
        if (routing.placement) resolvedPlacements.set(record.sourceIRI, routing.placement);
        cascaded++;
        // Surface multi-inheritance contradiction if new placement
        // conflicts with prior parent IRI display (the previous
        // placementResult was the parent IRI literal under Deferred).
        if (prevPlacement && prevPlacement !== routing.placement && prevPlacement !== record.superclass) {
          conflicts.push({
            iri: record.sourceIRI,
            prevPlacement,
            newPlacement: routing.placement,
          });
        }
      } else if (routing.status === 'PlacementRejected') {
        // Disjointness or other contradiction — surface the conflict
        // without silently overwriting (Appendix A.2.6 / bundle v6 SWC).
        conflicts.push({
          iri: record.sourceIRI,
          prevPlacement: record.placementResult,
          newPlacement: null,
          reason: result.justification,
        });
      }
      // PlacementDeferred unchanged: descendant remains awaiting cascade
      // (e.g., its own root hasn't been resolved yet — multi-root chain).
    }

    return { cascaded, conflicts };
  }

  /**
   * X9 Step 7.5++ (2026-04-27) — Reactive cascade after analyst resolves
   * a Phase 2 property. Mirror of cascadeAnalystResolution (Phase 1) for
   * sub-property declarations: when a property is resolved (Merge,
   * PromoteAsNewRelation, or PromoteAsSubProperty), any RelationDeferred
   * children whose subPropertyOf points to the resolved property's source
   * IRI auto-promote as PromoteAsSubProperty of the parent's canonical
   * IRI.
   *
   * Single-engine discipline (X3 §3.4 / X4 §3.3 lock): the cascade reuses
   * promoteCanonicalRelation — the SAME canonical-write engine the manual
   * Sub-Property action invokes at phase2-review-panel.js:584-601. No
   * parallel descent, no re-fingerprinting; the OWL spec literally
   * declared subPropertyOf, so the cascade just honors that fact.
   *
   * For action='Reject': children are flagged for re-routing (parent
   * vanished); the panel re-routes their disposition to NovelPromotionPanel
   * so the analyst handles them manually. The adapter returns the IRI
   * list; the panel does the localStorage update.
   *
   * @param {string} graphId
   * @param {string} sessionId - the adapter-side IngestionSession ID
   * @param {string} resolvedParentSourceIRI - source IRI of the resolved property
   * @param {string|null} parentCanonicalIRI - canonical IRI minted/merged for parent
   *   (null when action === 'Reject')
   * @param {string} action - 'Merge' | 'PromoteAsNewRelation' | 'PromoteAsSubProperty' | 'Reject'
   * @returns {{ cascaded: Array<{candidateIRI, canonicalRelationIRI, executionPropertyIRI}>, revertedToNovel: string[], conflicts: Array<object> }}
   */
  cascadeSubPropertyResolution(graphId, sessionId, resolvedParentSourceIRI, parentCanonicalIRI, action) {
    const session = this._ingestionSessions.get(sessionId);
    if (!session) return { cascaded: [], revertedToNovel: [], conflicts: [] };

    const cascaded = [];
    const revertedToNovel = [];
    const conflicts = [];

    // Walk all CandidateRelation records belonging to this session whose
    // subPropertyOf matches the resolved parent's source IRI.
    const eligible = [];
    for (const [stagingId, record] of this._sourceAxiomGraph.entries()) {
      if (record.type !== 'CandidateRelation') continue;
      if (record.ingestedInSession !== sessionId) continue;
      if (record.subPropertyOf !== resolvedParentSourceIRI) continue;
      if (record.candidateStatus === 'PlacementConfirmed') continue; // already resolved
      eligible.push({ stagingId, record });
    }

    if (action === 'Reject' || !parentCanonicalIRI) {
      // Parent rejected (or no canonical produced) — flag children for
      // re-routing to NovelPromotionPanel. The adapter doesn't promote;
      // the caller (Phase 2 panel) updates the localStorage Phase 2
      // record's routing.disposition + clears parentPropertyInOntology
      // so subsequent renders show Novel rather than Deferred.
      for (const { record } of eligible) {
        record.normalizationStatus = 'CascadeRevertedToNovel';
        revertedToNovel.push(record.sourceIRI);
      }
      return { cascaded, revertedToNovel, conflicts };
    }

    // Merge / PromoteAsNewRelation / PromoteAsSubProperty: each Deferred
    // child auto-promotes as a sub-property of the parent's canonical IRI.
    // Reuses promoteCanonicalRelation — single-engine canonical-write path.
    // Inherit BFO subcategory from the parent's resolved canonical when
    // available (PD-7 inheritance) — look up in the existing graph.
    const graph = this._graphs.get(graphId);
    const concepts = graph?.['fandaws:concepts'] || [];
    const parentConcept = concepts.find(c =>
      c['@id'] === parentCanonicalIRI || c['fandaws:executionPropertyIRI'] === parentCanonicalIRI
    );
    const inheritedBfoSubcategory = parentConcept?.['fandaws:bfoSubcategory'] || null;

    for (const { record } of eligible) {
      try {
        const result = this.promoteCanonicalRelation(graphId, {
          candidateIRI: record.sourceIRI,
          candidateLabel: record.sourceLabel,
          declaredDomain: record.declaredDomain,
          declaredRange: record.declaredRange,
          characteristics: record.declaredCharacteristics || [],
          bfoSubcategory: inheritedBfoSubcategory,
          justification: `Cascade from parent resolution (${action} of ${resolvedParentSourceIRI}).`,
          ingestedInSession: sessionId,
          subPropertyOf: parentCanonicalIRI,
        });
        record.candidateStatus = 'PlacementConfirmed';
        record.normalizationStatus = 'CascadedFromAnalystOverride';
        record.canonicalRelationIRI = result.canonicalRelationIRI;
        record.executionPropertyIRI = result.executionPropertyIRI;
        cascaded.push({
          candidateIRI: record.sourceIRI,
          canonicalRelationIRI: result.canonicalRelationIRI,
          executionPropertyIRI: result.executionPropertyIRI,
          inheritedBfoSubcategory,
        });
      } catch (err) {
        conflicts.push({
          iri: record.sourceIRI,
          reason: err.message || 'promoteCanonicalRelation failed',
        });
      }
    }

    return { cascaded, revertedToNovel, conflicts };
  }

  /**
   * Handle BFO re-ingestion: auto-re-evaluate all previously placed classes.
   * Clarification: only classes dropping below 0.7 go to PendingHumanResolution.
   *
   * @param {string} graphId
   * @returns {object} Re-evaluation results
   */
  reingestionBfo(graphId) {
    // Record version change event
    const eventId = `fandaws:event/${Date.now()}`;
    this._ingestionSessions.set(eventId, {
      type: 'VersionChangeEvent',
      changedAt: new Date().toISOString(),
      recompilationScope: 'FullRecompilation',
      graphId,
    });

    // Find all concepts that were placed by ingestion (have ingestedInSession)
    const graph = this._graphs.get(graphId);
    if (!graph) return { autoReEvaluationRan: true, classesReEvaluated: 0 };

    const { evaluatePlacement, routePlacement } = this._getPlacementSandbox();
    let classesReEvaluated = 0;
    let classesStillConfirmed = 0;
    let classesDroppedToAmbiguous = 0;

    const concepts = graph['fandaws:concepts'] || [];
    for (const concept of concepts) {
      // Identify ingested concepts: they have ingestedInSession OR placementConfidence
      if (!concept['fandaws:ingestedInSession'] && concept['fandaws:placementConfidence'] === undefined) continue;
      if (concept['fandaws:isImported']) continue; // Skip BFO infrastructure concepts

      classesReEvaluated++;

      // Re-run sandbox with the concept's original data
      // Find the staging record for this concept
      let stagingRecord = null;
      for (const r of this._sourceAxiomGraph.values()) {
        if (r.type === 'CandidateClass') {
          const label = (concept['skos:prefLabel'] || '').toLowerCase();
          const srcLabel = (r.sourceLabel || '').toLowerCase();
          if (label === srcLabel) {
            stagingRecord = r;
            break;
          }
        }
      }

      // Infer superclass from broader if no staging record
      let superclass = stagingRecord?.superclass || null;
      if (!superclass && concept['skos:broader']) {
        const parent = concepts.find(c => c['@id'] === concept['skos:broader']);
        if (parent?.['fandaws:isImported']) {
          // Parent is a BFO concept — use its label as superclass hint
          const parentLabel = parent['skos:prefLabel'] || '';
          superclass = `bfo:${parentLabel.replace(/\s+/g, '')}`;
        }
      }

      // Re-evaluate using the sandbox
      const result = evaluatePlacement({
        iri: concept['owl:equivalentClass']?.[0] || concept['@id'],
        label: concept['rdfs:label'] || concept['skos:prefLabel'],
        superclass,
        properties: stagingRecord?.properties || [],
      }, { disjointnessMap: this._bfoDisjointnessMap });

      if (result.confidence >= 0.7) {
        classesStillConfirmed++;
        concept['fandaws:placementConfidence'] = result.confidence;
      } else {
        classesDroppedToAmbiguous++;
        concept['fandaws:placementConfidence'] = result.confidence;
        // Mark as PendingHumanResolution on the staging record
        if (stagingRecord) {
          stagingRecord.normalizationStatus = 'PendingHumanResolution';
          stagingRecord.candidateStatus = 'PlacementAmbiguous';
        }
      }
    }

    // Trigger full recompilation
    this.compile(graphId);

    return {
      autoReEvaluationRan: true,
      classesReEvaluated,
      classesStillConfirmed,
      classesDroppedToAmbiguous,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Phase D2: Canonical-graph write methods (UI → canonical → compile)
  // ─────────────────────────────────────────────────────────

  /**
   * Compute a deterministic reproducibility hash (DP-2 invariant).
   * @private
   */
  _reproducibilityHash(payload) {
    const str = JSON.stringify(payload, Object.keys(payload).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `sha-lite:${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }

  /**
   * Promote a candidate external property as a new canonical relation type class.
   * Writes the canonical class record with BFO subcategory, domain, range,
   * characteristics, and provenance. Rule PD-8, Decision D-17.
   *
   * @param {string} graphId
   * @param {object} params - { candidateIRI, candidateLabel, declaredDomain, declaredRange, characteristics, bfoSubcategory, justification, ingestedInSession }
   * @returns {{ promoted: boolean, canonicalRelationIRI: string, executionPropertyIRI: string }}
   */
  promoteCanonicalRelation(graphId, params) {
    const graph = this._graphs.get(graphId);
    if (!graph) return { promoted: false };

    const {
      candidateIRI, candidateLabel, declaredDomain, declaredRange,
      characteristics = [], bfoSubcategory = null, justification = '',
      ingestedInSession = null, subPropertyOf = null,
    } = params;

    const label = (candidateLabel || candidateIRI.split(/[/#]/).pop() || 'unknown');
    const slug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const uuid = this._generateUUID(label);
    const canonicalRelationIRI = `fandaws:class/relation/${uuid}/${slug}`;
    const executionPropertyIRI = `rel:${slug.replace(/-/g, '_')}`;

    const reproducibilityHash = this._reproducibilityHash({
      candidateIRI, declaredDomain, declaredRange, characteristics, bfoSubcategory,
    });

    const relationClass = {
      '@id': canonicalRelationIRI,
      '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
      'rdfs:label': label,
      'skos:prefLabel': label.toLowerCase(),
      'rdfs:subClassOf': subPropertyOf ? [subPropertyOf] : [],
      'dcterms:created': new Date().toISOString(),
      'fandaws:executionPropertyIRI': executionPropertyIRI,
      'fandaws:relationDomain': declaredDomain,
      'fandaws:relationRange': declaredRange,
      'fandaws:relationCharacteristics': characteristics,
      'fandaws:bfoSubcategory': bfoSubcategory,
      'fandaws:sourceIRI': candidateIRI,
      'owl:equivalentProperty': [{ source: candidateIRI, target: executionPropertyIRI }],
      'fandaws:ingestedInSession': ingestedInSession,
      // DP-2 invariant: explanation, provenance, reproducibilityHash
      'fandaws:explanation': justification || `Promoted from external property ${candidateIRI} as a new canonical relation type class.`,
      'fandaws:provenance': {
        source: candidateIRI,
        promotedAt: new Date().toISOString(),
        action: subPropertyOf ? 'PromoteAsSubProperty' : 'PromoteAsNewRelation',
      },
      'fandaws:reproducibilityHash': reproducibilityHash,
    };

    graph['fandaws:concepts'].push(relationClass);
    this._graphs.set(graphId, graph);
    this.compile(graphId);
    // X9 Step 7.14a: fire mutation callback for canonical-graph persistence.
    this._emitDirectWriteMutation('PromoteCanonicalRelation', graphId, {
      canonicalRelationIRI,
      candidateIRI,
    });

    return {
      promoted: true,
      canonicalRelationIRI,
      executionPropertyIRI,
      relationClass,
    };
  }

  /**
   * X9 Step 7.11 (2026-04-29) — Back-port a BFO subcategory onto an
   * already-promoted canonical relation class. Used by the Phase 3
   * "Assign BFO Subcategory" repair affordance for OrphanClassViolation
   * rows: when the analyst chose Skip in the Phase 2 BFO picker (or
   * promoted before Step 7.5++++ landed), the canonical was minted with
   * fandaws:bfoSubcategory: null. This method updates that field in
   * place — no re-mint, no IRI change, provenance preserved.
   *
   * @param {string} graphId
   * @param {string} canonicalIRI - the fandaws:class/relation/<uuid>/<slug> IRI
   * @param {string} bfoSubcategory - e.g. 'bfo:Role', 'bfo:Disposition'
   * @returns {{ updated: boolean, prior: string|null }}
   */
  setRelationBfoSubcategory(graphId, canonicalIRI, bfoSubcategory) {
    const graph = this._graphs.get(graphId);
    if (!graph) return { updated: false, prior: null };
    const concepts = graph['fandaws:concepts'] || [];
    const target = concepts.find(c => c['@id'] === canonicalIRI);
    if (!target) return { updated: false, prior: null };
    const prior = target['fandaws:bfoSubcategory'] || null;
    target['fandaws:bfoSubcategory'] = bfoSubcategory;
    this._graphs.set(graphId, graph);
    this.compile(graphId);
    // X9 Step 7.14a: fire mutation callback for canonical-graph persistence.
    this._emitDirectWriteMutation('SetRelationBfoSubcategory', graphId, {
      canonicalIRI,
      bfoSubcategory,
      prior,
    });
    return { updated: true, prior };
  }

  /**
   * Merge an external property into an existing canonical relation type class.
   * Writes a MergeRecord with owl:equivalentProperty bridging source IRI to the
   * canonical execution property. Rule PD-8, Decision D-19.
   *
   * @param {string} graphId
   * @param {object} params - { candidateIRI, candidateLabel, targetCanonicalIRI, mergeConfidence, justification, ingestedInSession }
   * @returns {{ merged: boolean, mergeRecordId: string }}
   */
  mergeCanonicalRelation(graphId, params) {
    const graph = this._graphs.get(graphId);
    if (!graph) return { merged: false };

    const {
      candidateIRI, candidateLabel, targetCanonicalIRI, mergeConfidence = null,
      justification = '', ingestedInSession = null, mergeTrigger = 'HumanConfirmed',
    } = params;

    // Find the target canonical relation class to get its execution property IRI
    const concepts = graph['fandaws:concepts'] || [];
    const target = concepts.find((c) => c['@id'] === targetCanonicalIRI);
    const executionPropertyIRI = target?.['fandaws:executionPropertyIRI']
      || `rel:${(targetCanonicalIRI.split(/[/#]/).pop() || 'unknown').replace(/-/g, '_')}`;

    const mergeRecordId = `fandaws:merge/${Date.now()}-${candidateIRI.split(/[/#]/).pop()}`;

    const reproducibilityHash = this._reproducibilityHash({
      candidateIRI, targetCanonicalIRI, executionPropertyIRI,
    });

    const mergeRecord = {
      '@id': mergeRecordId,
      type: 'MergeRecord',
      mergedCandidate: candidateIRI,
      mergedInto: targetCanonicalIRI,
      mergeTrigger,
      mergeConfidence,
      mergeRationale: justification || `Merged ${candidateIRI} into ${targetCanonicalIRI} based on fingerprint match.`,
      equivalencyAssertion: {
        subject: candidateIRI,
        predicate: 'owl:equivalentProperty',
        object: executionPropertyIRI,
      },
      mergedAt: new Date().toISOString(),
      mergedBy: mergeTrigger === 'AutoMerge' ? 'AutoMerge/D2Pipeline' : 'HumanResolution/D2Pipeline',
      ingestedInSession,
      // DP-2 invariant
      'fandaws:explanation': justification || `Merge ${candidateLabel || candidateIRI} into canonical ${targetCanonicalIRI}.`,
      'fandaws:provenance': { source: candidateIRI, mergedAt: new Date().toISOString() },
      'fandaws:reproducibilityHash': reproducibilityHash,
    };

    this._sourceAxiomGraph.set(mergeRecordId, mergeRecord);

    // Append the owl:equivalentProperty assertion to the target canonical concept
    if (target) {
      target['owl:equivalentProperty'] = target['owl:equivalentProperty'] || [];
      target['owl:equivalentProperty'].push({ source: candidateIRI, target: executionPropertyIRI });
      this._graphs.set(graphId, graph);
    }

    this.compile(graphId);
    // X9 Step 7.14a: fire mutation callback for canonical-graph persistence.
    this._emitDirectWriteMutation('MergeCanonicalRelation', graphId, {
      mergeRecordId,
      candidateIRI,
      targetCanonicalIRI,
    });

    return {
      merged: true,
      mergeRecordId,
      executionPropertyIRI,
      targetCanonicalIRI,
    };
  }

  /**
   * Add an owl:Restriction to a target class's rdfs:subClassOf. Used by Phase 3
   * Finalize to write NoViolations axioms into the canonical graph.
   *
   * @param {string} graphId
   * @param {object} params - { classIRI, onPropertyIRI, someValuesFromIRI, propertyLabel, verbLabel, ingestedInSession, justification }
   * @returns {{ added: boolean, restrictionId: string }}
   */
  addRestrictionToClass(graphId, params) {
    const graph = this._graphs.get(graphId);
    if (!graph) return { added: false };

    const {
      classIRI, onPropertyIRI, someValuesFromIRI,
      propertyLabel = '', verbLabel = '',
      ingestedInSession = null, justification = '',
    } = params;

    const concept = (graph['fandaws:concepts'] || []).find((c) => c['@id'] === classIRI);
    if (!concept) return { added: false };

    const restrictionId = `${classIRI}#r-${(onPropertyIRI || 'unknown').split(/[/#:]/).pop()}-${(someValuesFromIRI || 'unknown').split(/[/#:]/).pop()}`;

    const reproducibilityHash = this._reproducibilityHash({
      classIRI, onPropertyIRI, someValuesFromIRI,
    });

    const restriction = {
      '@id': restrictionId,
      '@type': 'owl:Restriction',
      'owl:onProperty': onPropertyIRI,
      'owl:someValuesFrom': someValuesFromIRI,
      'fandaws:restrictionKind': 'relationship',
      'fandaws:propertyLabel': propertyLabel,
      'fandaws:verbLabel': verbLabel,
      'fandaws:attachedTo': classIRI,
      'fandaws:normalizationStatus': 'Normalized',
      'fandaws:ingestedInSession': ingestedInSession,
      // DP-2 invariant
      'fandaws:explanation': justification || `Restriction ${classIRI} ${onPropertyIRI} ${someValuesFromIRI} passed Phase 3 consistency sandbox with NoViolations.`,
      'fandaws:provenance': { addedAt: new Date().toISOString(), phase: 'Phase3Finalize' },
      'fandaws:reproducibilityHash': reproducibilityHash,
    };

    concept['rdfs:subClassOf'] = concept['rdfs:subClassOf'] || [];
    concept['rdfs:subClassOf'].push(restriction);
    this._graphs.set(graphId, graph);
    this.compile(graphId);
    // X9 Step 7.14a: fire mutation callback for canonical-graph persistence.
    this._emitDirectWriteMutation('AddCanonicalRestriction', graphId, {
      classIRI,
      restrictionId,
    });

    return { added: true, restrictionId };
  }

  /**
   * Get all canonical relation type classes (concepts with @type containing fandaws:RelationTypeClass).
   * Used by Phase 2 scoring and the export engine.
   */
  getCanonicalRelationTypeClasses(graphId) {
    const graph = this._graphs.get(graphId);
    if (!graph) return [];
    return (graph['fandaws:concepts'] || []).filter((c) => {
      const types = Array.isArray(c['@type']) ? c['@type'] : [c['@type']];
      return types.includes('fandaws:RelationTypeClass');
    });
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

  /**
   * X9 Step 7.14a (2026-04-29) — Fire mutation listeners after a direct
   * graph write that doesn't go through applyMutation. Sites:
   * _promoteCandidate, promoteCanonicalRelation, mergeCanonicalRelation,
   * setRelationBfoSubcategory, restriction-write helpers. Without this
   * notification, downstream subscribers (Workbench canonical-graph
   * persistence, panel re-renders) miss the change — finalized
   * ingestion sessions previously appeared to ingest correctly but
   * vanished on page reload because the persistence subscriber never
   * fired.
   *
   * Synthetic mutation shape: { type, graphId, ... } — listeners that
   * filter by mutation.type can match new types like 'PromoteCandidate'
   * or treat them as opaque change signals.
   *
   * @private
   * @param {string} type - synthetic mutation type label
   * @param {string} graphId
   * @param {object} [extra={}] - additional fields merged onto mutation
   */
  _emitDirectWriteMutation(type, graphId, extra = {}) {
    const graph = this._graphs.get(graphId);
    const mutation = { type, graphId, ...extra };
    for (const listener of this._mutationListeners) {
      try { listener(mutation, graph); } catch { /* swallow */ }
    }
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

/**
 * X9 Step 7.5 (2026-04-27): build a transitively-closed ancestor chain
 * for a given class IRI by walking parsed.classes' superclass field
 * chain-of-ancestors. Stops at first parent missing from classMap (root
 * external class, e.g., owl:Thing or a BFO class) OR on cycle detection
 * (defensive — BFO is single-inheritance but external ontologies may
 * declare cycles).
 *
 * Per X9 §3.1 caller-contract: ancestorChain MUST be transitively closed
 * before passing to dispatcher / placement-sandbox.
 *
 * @param {string} rootIRI - the class IRI whose ancestor chain to build
 * @param {Map<string, object>} classMap - parsed.classes indexed by IRI
 * @returns {string[]} ancestor IRIs from immediate parent to root,
 *   excluding the rootIRI itself; empty array when no superclass
 */
export function buildTransitiveAncestorChain(rootIRI, classMap) {
  const chain = [];
  const seen = new Set([rootIRI]);
  let cursor = classMap.get(rootIRI);
  while (cursor && cursor.superclass && !seen.has(cursor.superclass)) {
    chain.push(cursor.superclass);
    seen.add(cursor.superclass);
    cursor = classMap.get(cursor.superclass);
  }
  return chain;
}
