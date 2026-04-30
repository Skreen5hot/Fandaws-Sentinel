/**
 * WorkbenchStateManager — single source of truth for Workbench.
 *
 * Owns one InMemoryStateAdapter, one SynchronousOrchestrationAdapter,
 * one EventBus. All panels read/write through this facade.
 */
import { EventBus } from './event-bus.js';

const GRAPH_ID = 'fandaws:graph/workbench';
// BFO Turtle source — shipped alongside the Workbench at docs/bfo-core.ttl.
// fetch() resolves URLs relative to the document, not the JS module, and
// workbench.html is in the same directory as bfo-core.ttl.
const BFO_SOURCE_URL = 'bfo-core.ttl';

// X9 Step 7.14 (2026-04-29): canonical graph persistence. The in-memory
// `graph['fandaws:concepts']` is the load-bearing artifact (export reads
// it, tree renders it, inspector inspects it). Without persistence, page
// reload wipes user-promoted concepts — only BFO infrastructure reloads
// fresh via ensureBfo(). Persist non-imported concepts to localStorage
// + restore on bootstrap to close the gap.
const LS_CANONICAL_GRAPH = 'fandaws:wb:canonicalGraph';
const CANONICAL_GRAPH_VERSION = 1;
const PERSIST_DEBOUNCE_MS = 500;

function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[Workbench] Persistence failed for ${key}:`, err);
    return false;
  }
}

function lsRemove(key) {
  try { localStorage.removeItem(key); } catch { /* */ }
}

export class WorkbenchStateManager {
  /**
   * @param {object} Fandaws - The Fandaws global from the bundle.
   */
  constructor(Fandaws) {
    this.Fandaws = Fandaws;
    this.bus = new EventBus();
    this._graphId = GRAPH_ID;
    this._selectedConceptIri = null;

    // BFO Turtle text — fetched once, cached for re-ingestion on resetGraph
    this._bfoText = null;

    // Create shared adapter and orchestrator
    this._adapter = new Fandaws.InMemoryStateAdapter();
    this._orchestrator = new Fandaws.SynchronousOrchestrationAdapter();

    // Initialize empty graph
    const graph = Fandaws.createKnowledgeGraph({ id: GRAPH_ID });
    this._adapter.saveGraph(GRAPH_ID, graph);

    // Wire onMutation → event bus
    this._adapter.onMutation((mutation, graph) => {
      this.bus.emit('graph-changed', {
        mutation,
        graph,
        graphId: this._graphId,
      });
    });

    // X9 Step 7.14 (2026-04-29): debounced auto-save on graph-changed.
    // Bulk operations (CCO ingestion promotes ~50 concepts in rapid
    // succession) coalesce into a single localStorage write after the
    // debounce window. _persistTimer is reset on each event; persistence
    // fires once when activity quiesces.
    this._persistTimer = null;
    this.bus.on('graph-changed', () => {
      if (this._persistTimer) clearTimeout(this._persistTimer);
      this._persistTimer = setTimeout(() => {
        this._persistCanonicalGraph();
        this._persistTimer = null;
      }, PERSIST_DEBOUNCE_MS);
    });
  }

  /**
   * X9 Step 7.14 (2026-04-29) — Persist non-imported canonical concepts
   * to localStorage. BFO infrastructure (`fandaws:isImported: true`) is
   * NOT persisted; ensureBfo() re-loads it fresh on next bootstrap, so
   * persisting it would double-load concepts on restore.
   *
   * Versioned envelope so future schema changes can migrate or invalidate
   * gracefully. Quota safety via lsSet's try/catch — warn-not-throw so
   * in-memory state continues working even if localStorage is exhausted.
   *
   * @private
   */
  _persistCanonicalGraph() {
    const graph = this.getGraph();
    if (!graph) return;
    const allConcepts = graph['fandaws:concepts'] || [];
    const userConcepts = allConcepts.filter(c => c['fandaws:isImported'] !== true);
    const payload = {
      version: CANONICAL_GRAPH_VERSION,
      graphId: this._graphId,
      savedAt: new Date().toISOString(),
      concepts: userConcepts,
    };
    lsSet(LS_CANONICAL_GRAPH, payload);
  }

  /**
   * X9 Step 7.14 (2026-04-29) — Restore user-promoted canonical concepts
   * from localStorage into the in-memory graph. Called from bootstrap
   * AFTER ensureBfo() so the BFO infrastructure is already in place;
   * restored concepts are merged in without duplication.
   *
   * Returns no-op when localStorage entry is missing OR version
   * mismatches. On version mismatch (future schema change), the old
   * payload is discarded — user starts with BFO-only and can re-ingest.
   *
   * @returns {{ restored: boolean, conceptsAdded: number, reason?: string }}
   */
  restoreCanonicalGraph() {
    const payload = lsGet(LS_CANONICAL_GRAPH, null);
    if (!payload) return { restored: false, conceptsAdded: 0, reason: 'no-payload' };
    if (payload.version !== CANONICAL_GRAPH_VERSION) {
      return { restored: false, conceptsAdded: 0, reason: 'version-mismatch' };
    }
    const graph = this.getGraph();
    if (!graph) return { restored: false, conceptsAdded: 0, reason: 'no-graph' };
    if (!graph['fandaws:concepts']) graph['fandaws:concepts'] = [];

    // Build IRI set for dedup so re-restore is idempotent and BFO concepts
    // already loaded by ensureBfo() aren't double-pushed.
    const existingIris = new Set(graph['fandaws:concepts'].map(c => c['@id']));
    let conceptsAdded = 0;
    for (const concept of (payload.concepts || [])) {
      if (!concept || !concept['@id']) continue;
      if (existingIris.has(concept['@id'])) continue;
      graph['fandaws:concepts'].push(concept);
      existingIris.add(concept['@id']);
      conceptsAdded++;
    }

    if (conceptsAdded > 0) {
      this._adapter.saveGraph(this._graphId, graph);
      // Rebuild indices for the restored concepts.
      try { this._adapter.compile(this._graphId); } catch { /* compile is idempotent; ignore */ }
      // Notify panels.
      this.bus.emit('graph-changed', {
        mutation: null,
        graph: this.getGraph(),
        graphId: this._graphId,
      });
    }
    return { restored: true, conceptsAdded };
  }

  /**
   * Fetch the bundled BFO Turtle source and ingest it into the current graph.
   * Idempotent — safe to call multiple times. Caches the source text so
   * resetGraph() can re-ingest without re-fetching.
   *
   * @returns {Promise<{ ingested: boolean, conceptsAdded: number, error?: string }>}
   */
  async ensureBfo() {
    try {
      if (!this._bfoText) {
        const resp = await fetch(BFO_SOURCE_URL);
        if (!resp.ok) {
          return { ingested: false, conceptsAdded: 0, error: `Failed to fetch BFO: ${resp.status}` };
        }
        this._bfoText = await resp.text();
      }
      const result = this._adapter.ensureBfoIngestion(this._graphId, this._bfoText);
      // Notify panels that the graph has changed (ingestion runs as bulk mutation,
      // but in case the listener didn't fire we emit explicitly).
      if (result.ingested && result.conceptsAdded > 0) {
        this.bus.emit('graph-changed', {
          mutation: null,
          graph: this.getGraph(),
          graphId: this._graphId,
        });
      }
      return result;
    } catch (err) {
      return { ingested: false, conceptsAdded: 0, error: String(err) };
    }
  }

  // ── Accessors ──

  getAdapter() { return this._adapter; }
  getOrchestrator() { return this._orchestrator; }
  getGraphId() { return this._graphId; }

  getGraph() {
    return this._adapter.loadGraph(this._graphId);
  }

  getIndices() {
    return this._adapter.getIndices(this._graphId);
  }

  getSelectedConceptIri() { return this._selectedConceptIri; }

  /**
   * Find a concept in the current graph by @id.
   * @param {string} iri
   * @returns {object|null}
   */
  getConceptByIri(iri) {
    const graph = this.getGraph();
    if (!graph) return null;
    const concepts = graph['fandaws:concepts'] || [];
    return concepts.find((c) => c['@id'] === iri) || null;
  }

  // ── Actions ──

  /**
   * Select a concept and notify panels.
   * @param {string} iri
   */
  selectConcept(iri) {
    this._selectedConceptIri = iri;
    this.bus.emit('concept-selected', { conceptIri: iri });
  }

  /**
   * Deselect the current concept.
   */
  deselectConcept() {
    this._selectedConceptIri = null;
    this.bus.emit('concept-deselected', {});
  }

  /**
   * Run a pipeline utterance. Thin delegate to orchestrator.runPipeline().
   * Scope-narrowing is a panel concern — pass scopeDecisions in options.
   *
   * @param {string} utterance
   * @param {object} [options={}]
   * @returns {object} Pipeline result
   */
  runUtterance(utterance, options = {}) {
    const context = {
      stateAdapter: this._adapter,
      graphId: this._graphId,
    };
    return this._orchestrator.runPipeline(utterance, context, options);
  }

  /**
   * Find concepts with a given skos:altLabel (for homonym advisory).
   * @param {string} label
   * @returns {object[]}
   */
  findConceptsByAltLabel(label) {
    return this._adapter.findConceptsByAltLabel(label, this._graphId);
  }

  /**
   * Reset graph: create fresh adapter + empty graph, emit event.
   * X9 Step 7.14 (2026-04-29): also clears the persisted canonical-graph
   * localStorage entry so "Reset Graph" is a true wipe — subsequent
   * page loads do NOT silently re-hydrate the prior session's concepts.
   */
  resetGraph() {
    lsRemove(LS_CANONICAL_GRAPH);
    this._adapter = new this.Fandaws.InMemoryStateAdapter();
    const graph = this.Fandaws.createKnowledgeGraph({ id: GRAPH_ID });
    this._adapter.saveGraph(GRAPH_ID, graph);
    this._selectedConceptIri = null;

    // Re-wire onMutation
    this._adapter.onMutation((mutation, graph) => {
      this.bus.emit('graph-changed', {
        mutation,
        graph,
        graphId: this._graphId,
      });
    });

    // Re-ingest BFO if previously loaded (cached source text, no re-fetch)
    if (this._bfoText) {
      this._adapter.ensureBfoIngestion(this._graphId, this._bfoText);
    }

    // Notify panels
    this.bus.emit('graph-changed', {
      mutation: null,
      graph: this.getGraph(),
      graphId: this._graphId,
    });
    this.bus.emit('concept-deselected', {});
  }
}
