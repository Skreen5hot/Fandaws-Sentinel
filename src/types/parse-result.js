/**
 * ParseResult — output of the NLParser.
 *
 * Represents a structured semantic frame extracted from a user utterance.
 * Success results have all semantic fields populated with confidence 1.0.
 * Error results have null semantic fields with a descriptive errorReason.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.1
 */

/**
 * Create a new ParseResult.
 *
 * @param {object} params
 * @param {string|null} [params.subject] - Extracted subject term
 * @param {string|null} [params.predicate] - Extracted predicate ("is a", "has", or custom verb)
 * @param {string|null} [params.object] - Extracted object term
 * @param {string|null} [params.verbType] - "classification" | "property" | "customRelationship" | null
 * @param {number} [params.confidence] - Parser confidence [0, 1]
 * @param {boolean} [params.error] - Whether this is an error result
 * @param {string|null} [params.errorReason] - Reason for parse failure
 * @returns {object} JSON-LD ParseResult node
 */
export function createParseResult({
  subject = null,
  predicate = null,
  object = null,
  verbType = null,
  confidence = 0,
  error = false,
  errorReason = null,
} = {}) {
  return {
    '@type': 'fandaws:ParseResult',
    'fandaws:subject': subject,
    'fandaws:predicate': predicate,
    'fandaws:object': object,
    'fandaws:verbType': verbType,
    'fandaws:confidence': confidence,
    'fandaws:error': error,
    'fandaws:errorReason': errorReason,
  };
}
