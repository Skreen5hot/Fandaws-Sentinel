/**
 * ConversationSession — tracks the state of an ongoing negotiation dialogue.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.12
 */

/**
 * Create a new ConversationSession.
 *
 * @param {object} params
 * @param {string} params.sessionId - Unique session IRI
 * @param {string} params.callerId - Caller identity
 * @param {string} params.term - The term being negotiated
 * @param {string} params.workingGraphId - The graph being built
 * @param {string} [params.state] - Session state
 * @param {string} [params.currentPhase] - Current workflow phase
 * @param {object|null} [params.scopeConfig] - Active scope hierarchy
 * @param {string|null} [params.parentSessionId] - Parent session for nested negotiation
 * @param {number} [params.nestingDepth] - Current nesting depth (0 = root)
 * @param {object[]} [params.dialogueHistory] - Ordered dialogue turns
 * @param {string|null} [params.expiresAt] - Auto-expiry timestamp
 * @returns {object} JSON-LD ConversationSession node
 */
export function createConversationSession({
  sessionId,
  callerId,
  term,
  workingGraphId,
  state = 'negotiating',
  currentPhase = 'is_a',
  scopeConfig = null,
  parentSessionId = null,
  nestingDepth = 0,
  dialogueHistory = [],
  expiresAt = null,
}) {
  const now = new Date().toISOString();
  return {
    '@type': 'fandaws:ConversationSession',
    'fandaws:sessionId': sessionId,
    'fandaws:callerId': callerId,
    'fandaws:state': state,
    'fandaws:currentPhase': currentPhase,
    'fandaws:term': term,
    'fandaws:workingGraphId': workingGraphId,
    'fandaws:scopeConfig': scopeConfig,
    'fandaws:parentSessionId': parentSessionId,
    'fandaws:nestingDepth': nestingDepth,
    'fandaws:dialogueHistory': dialogueHistory,
    'fandaws:createdAt': now,
    'fandaws:lastActiveAt': now,
    'fandaws:expiresAt': expiresAt,
  };
}
