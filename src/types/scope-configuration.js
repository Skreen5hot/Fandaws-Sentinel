/**
 * ScopeConfiguration — defines the scope hierarchy for a session.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.8, Appendix A.9
 */

/**
 * Create a new ScopeConfiguration.
 *
 * @param {object} params
 * @param {string|null} [params.contextGraphId] - Active context scope graph
 * @param {string} params.userGraphId - Caller's personal knowledge graph
 * @param {object[]} [params.globalFederation] - Ordered list of global scope graphs
 * @returns {object} JSON-LD ScopeConfiguration node
 */
export function createScopeConfiguration({
  contextGraphId = null,
  userGraphId,
  globalFederation = [],
}) {
  return {
    '@type': 'fandaws:ScopeConfiguration',
    'fandaws:contextGraphId': contextGraphId,
    'fandaws:userGraphId': userGraphId,
    'fandaws:globalFederation': globalFederation,
  };
}

/**
 * Create a ScopeEntry for the global federation.
 *
 * @param {object} params
 * @param {string} params.graphId - Graph identifier
 * @param {string} params.label - Human-readable name
 * @param {string|null} [params.ipfsCid] - IPFS Content Identifier
 * @param {number} params.priority - Resolution order (lower = searched first)
 * @param {string} [params.trustLevel] - "authoritative" | "community" | "experimental"
 * @param {string|null} [params.staleCopyAction] - Per-scope override
 * @returns {object} JSON-LD ScopeEntry
 */
export function createScopeEntry({
  graphId,
  label,
  ipfsCid = null,
  priority,
  trustLevel = 'community',
  staleCopyAction = null,
}) {
  return {
    'fandaws:graphId': graphId,
    'fandaws:label': label,
    'fandaws:ipfsCid': ipfsCid,
    'fandaws:priority': priority,
    'fandaws:trustLevel': trustLevel,
    'fandaws:staleCopyAction': staleCopyAction,
  };
}
