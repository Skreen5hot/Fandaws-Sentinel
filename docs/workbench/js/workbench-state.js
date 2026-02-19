/**
 * WorkbenchStateManager — single source of truth for Workbench.
 *
 * Owns one InMemoryStateAdapter, one SynchronousOrchestrationAdapter,
 * one EventBus. All panels read/write through this facade.
 */
import { EventBus } from './event-bus.js';

const GRAPH_ID = 'fandaws:graph/workbench';

export class WorkbenchStateManager {
  /**
   * @param {object} Fandaws - The Fandaws global from the bundle.
   */
  constructor(Fandaws) {
    this.Fandaws = Fandaws;
    this.bus = new EventBus();
    this._graphId = GRAPH_ID;
    this._selectedConceptIri = null;

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
   * Reset graph: create fresh adapter + empty graph, emit event.
   */
  resetGraph() {
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

    // Notify panels
    this.bus.emit('graph-changed', {
      mutation: null,
      graph,
      graphId: this._graphId,
    });
    this.bus.emit('concept-deselected', {});
  }
}
