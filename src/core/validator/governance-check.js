/**
 * Governance Check — Phase 4b null stubs for OCE/IEE.
 *
 * Implements:
 * - checkGovernanceBlock: blocking governance flags → EpistemicFailure
 * - nullOCECheck: Ontological Coherence Engine stub (always coherent)
 * - nullIEECheck: Interlocutor Epistemic Engine stub (never contested)
 * - createGovernanceEpistemicFailure: EpistemicFailure JSON-LD factory
 *
 * Real implementations deferred to Phase 14.
 *
 * @see Fandaws_v3.3_Specification.md Section 7
 */

/**
 * Check whether a concept is blocked by a governance flag.
 *
 * @param {object} concept - Concept JSON-LD being added/modified
 * @param {object} graph - Current KnowledgeGraph JSON-LD
 * @returns {{ blocked: boolean, reason?: string, flagType?: string, epistemicFailure?: object }}
 */
export function checkGovernanceBlock(concept, graph) {
  const graphConcepts = graph['fandaws:concepts'] || [];
  const existing = graphConcepts.find((c) => c['@id'] === concept['@id']);

  if (!existing) return { blocked: false };

  const flag = existing['fandaws:governanceFlag'];
  if (!flag) return { blocked: false };

  const severity = flag['fandaws:severity'] || flag.severity;

  if (severity === 'blocking') {
    return {
      blocked: true,
      reason: `Concept "${concept['@id']}" has a blocking governance flag.`,
      flagType: flag['fandaws:type'] || flag.type || 'governance',
      epistemicFailure: createGovernanceEpistemicFailure(concept, flag),
    };
  }

  // Advisory or warning severity — do not block
  return { blocked: false };
}

/**
 * Create an EpistemicFailure JSON-LD node for a governance block.
 *
 * @param {object} concept - The blocked concept
 * @param {object} flag - The governance flag that caused the block
 * @returns {object} EpistemicFailure JSON-LD node
 */
export function createGovernanceEpistemicFailure(concept, flag) {
  const reason = flag['fandaws:reason'] || flag.reason || 'Governance flag blocks mutation.';
  return {
    '@type': 'fandaws:EpistemicFailure',
    'fandaws:conceptId': concept['@id'],
    'fandaws:mutationType': 'governanceBlock',
    'fandaws:rejectionReasons': [reason],
    'fandaws:suggestedActions': ['Review governance flag and resolve before retrying.'],
    'fandaws:repairPaths': [],
    'fandaws:escalatedToHuman': false,
  };
}

/**
 * Null OCE (Ontological Coherence Engine) check.
 * Always returns coherent — real implementation in Phase 14.
 *
 * @param {object} _mutation - GraphMutation (unused)
 * @param {string} _graphId - Graph IRI (unused)
 * @returns {{ coherent: boolean, violations: object[], repairPaths: object[] }}
 */
export function nullOCECheck(_mutation, _graphId) {
  return {
    coherent: true,
    violations: [],
    repairPaths: [],
  };
}

/**
 * Null IEE (Interlocutor Epistemic Engine) check.
 * Always returns not contested — real implementation in Phase 14.
 *
 * @param {object} _concept - Concept node (unused)
 * @param {object} _graph - KnowledgeGraph (unused)
 * @returns {{ contested: boolean, flags: object[] }}
 */
export function nullIEECheck(_concept, _graph) {
  return {
    contested: false,
    flags: [],
  };
}
