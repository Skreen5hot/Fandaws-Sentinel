/**
 * Minimal pub/sub event bus for Workbench cross-panel communication.
 *
 * Events:
 *   graph-changed      { mutation, graph, graphId }
 *   concept-selected   { conceptIri }
 *   concept-deselected {}
 *   workspace-switched { mode }
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} Unsubscribe function.
   */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this._listeners.get(event)?.delete(handler);
  }

  /**
   * Emit an event to all subscribers.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try { handler(data); } catch { /* swallow listener errors */ }
    }
  }
}
