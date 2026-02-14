/**
 * ConversationPrompt — a system-initiated question to the caller.
 *
 * Used for disambiguation, confirmation, or scope narrowing.
 * In M2M mode, includes machineSignal for structured negotiation.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.6, Appendix A.4/A.5
 */

/**
 * Create a new ConversationPrompt.
 *
 * @param {object} params
 * @param {string} params.promptType - "confirmation" | "disambiguation" | "scopeNarrowing" | "yesNo"
 * @param {string} params.text - Display text (human-readable)
 * @param {string[]|null} [params.options] - Available choices (null for open-ended)
 * @param {object} params.context - State needed to resume processing after response
 * @param {object|null} [params.machineSignal] - Structured negotiation contract for M2M
 * @returns {object} JSON-LD ConversationPrompt node
 */
export function createConversationPrompt({
  promptType,
  text,
  options = null,
  context,
  machineSignal = null,
}) {
  return {
    '@type': 'fandaws:ConversationPrompt',
    'fandaws:promptType': promptType,
    'fandaws:text': text,
    'fandaws:options': options,
    'fandaws:context': context,
    'fandaws:machineSignal': machineSignal,
  };
}
