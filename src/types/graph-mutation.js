/**
 * GraphMutation — declarative description of changes to a KnowledgeGraph.
 *
 * Emitted by the KnowledgeEngine, executed by the StateAdapter.
 * Ensures all graph modifications are auditable, reversible, and deterministic.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.5, Appendix A.3
 */

/**
 * Create a new GraphMutation.
 *
 * @param {object} params
 * @param {object[]} [params.additions] - Nodes and edges to add
 * @param {object[]} [params.modifications] - Property-level changes to existing nodes
 * @param {string[]} [params.deletions] - Node IRIs to remove
 * @param {object[]} [params.merges] - Node merge operations (deduplication)
 * @param {string} params.reason - Human-readable explanation
 * @param {string|null} [params.validatedBy] - ValidationResult IRI
 * @returns {object} JSON-LD GraphMutation node
 */
export function createGraphMutation({
  additions = [],
  modifications = [],
  deletions = [],
  merges = [],
  reason,
  validatedBy = null,
}) {
  return {
    '@type': 'fandaws:GraphMutation',
    'fandaws:additions': additions,
    'fandaws:modifications': modifications,
    'fandaws:deletions': deletions,
    'fandaws:merges': merges,
    'fandaws:reason': reason,
    'fandaws:validatedBy': validatedBy,
  };
}
