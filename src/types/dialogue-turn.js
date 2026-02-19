/**
 * DialogueTurn — represents a single turn in a session's dialogue history.
 *
 * Roles:
 *   - 'system'     — ConversationPrompt emitted by the pipeline
 *   - 'caller'     — Caller response (text, confirmation, selection)
 *   - 'transition' — State transition record (pause, resume, abandon, nest, complete)
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.12
 */

const VALID_ROLES = new Set(['system', 'caller', 'transition']);

/**
 * Create a new DialogueTurn.
 *
 * @param {object} params
 * @param {string} params.role - 'system' | 'caller' | 'transition'
 * @param {string} params.content - Turn content (prompt text, response text, or transition description)
 * @param {number} params.turnIndex - 0-based index in the dialogue history
 * @param {string} params.phase - Session phase at time of turn (is_a, has, relationship, complete)
 * @param {string|null} [params.timestamp] - ISO 8601 timestamp (auto-generated if null)
 * @returns {object} JSON-LD DialogueTurn node
 */
export function createDialogueTurn({ role, content, turnIndex, phase, timestamp = null }) {
  if (!VALID_ROLES.has(role)) {
    throw new Error(`Invalid dialogue turn role: "${role}". Must be one of: system, caller, transition`);
  }
  if (typeof content !== 'string') {
    throw new Error('DialogueTurn content must be a string');
  }
  if (!Number.isInteger(turnIndex) || turnIndex < 0) {
    throw new Error('DialogueTurn turnIndex must be a non-negative integer');
  }

  return {
    '@type': 'fandaws:DialogueTurn',
    'fandaws:role': role,
    'fandaws:content': content,
    'fandaws:turnIndex': turnIndex,
    'fandaws:phase': phase,
    'fandaws:timestamp': timestamp || new Date().toISOString(),
  };
}
