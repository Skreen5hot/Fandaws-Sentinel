/**
 * StateAdapter Interface
 *
 * Provides persistence operations for knowledge graphs and session state.
 * All methods operate on JSON-LD documents.
 *
 * Implementations: InMemoryStateAdapter, FileSystemStateAdapter
 *
 * @see Fandaws_v3.3_Specification.md Section 3.3.1
 */

/**
 * @interface StateAdapter
 *
 * @method loadGraph(id: string): KnowledgeGraph | null
 *   Load a knowledge graph by identifier. Returns null if not found (offline-safe).
 *
 * @method saveGraph(id: string, graph: object): void
 *   Persist a knowledge graph. The graph must be valid JSON-LD.
 *
 * @method applyMutation(id: string, mutation: object): KnowledgeGraph
 *   Apply a GraphMutation to a stored graph and return the updated graph.
 *   Atomic per GraphMutation — all operations succeed or none do.
 *
 * @method loadSession(id: string): ConversationSession | null
 *   Load conversation session state.
 *
 * @method saveSession(id: string, session: object): void
 *   Persist conversation session state.
 *
 * @method listSessions(callerId: string, filter?: object): ConversationSession[]
 *   List sessions for a caller, optionally filtered by state.
 *
 * @method queryGraph(id: string, query: object): QueryResult
 *   Execute a graph query (pattern matching, path traversal) against a stored graph.
 *
 * @method loadScopeConfig(id: string): ScopeConfiguration | null
 *   Load the scope configuration for a session. Returns null for single-graph mode.
 *
 * @method saveScopeConfig(id: string, config: object): void
 *   Persist a scope configuration.
 */

export class StateAdapter {
  loadGraph(_id) { throw new Error('StateAdapter.loadGraph() not implemented'); }
  saveGraph(_id, _graph) { throw new Error('StateAdapter.saveGraph() not implemented'); }
  applyMutation(_id, _mutation) { throw new Error('StateAdapter.applyMutation() not implemented'); }
  loadSession(_id) { throw new Error('StateAdapter.loadSession() not implemented'); }
  saveSession(_id, _session) { throw new Error('StateAdapter.saveSession() not implemented'); }
  listSessions(_callerId, _filter) { throw new Error('StateAdapter.listSessions() not implemented'); }
  queryGraph(_id, _query) { throw new Error('StateAdapter.queryGraph() not implemented'); }
  loadScopeConfig(_id) { throw new Error('StateAdapter.loadScopeConfig() not implemented'); }
  saveScopeConfig(_id, _config) { throw new Error('StateAdapter.saveScopeConfig() not implemented'); }
  onMutation(_callback) { throw new Error('StateAdapter.onMutation() not implemented'); }
  serialize() { throw new Error('StateAdapter.serialize() not implemented'); }
  static deserialize(_snapshot) { throw new Error('StateAdapter.deserialize() not implemented'); }
}
