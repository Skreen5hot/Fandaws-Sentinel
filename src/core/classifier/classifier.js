/**
 * Classifier — routes ParseResult to the appropriate knowledge-building workflow.
 *
 * Pure enum matching. No probabilistic inference.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.2
 */

import { createClassificationAction } from '../../types/classification-action.js';

/** Valid verb types that can be routed to workflows. */
const VALID_VERB_TYPES = new Set([
  'classification',
  'property',
  'customRelationship',
]);

/**
 * Classify a ParseResult into a workflow action.
 *
 * @param {object} parseResult - JSON-LD ParseResult node from NLParser
 * @returns {object} JSON-LD ClassificationAction node
 * @see Fandaws_v3.3_Specification.md Section 3.2.2
 */
export function classify(parseResult) {
  // Validate input is a ParseResult
  if (!parseResult || parseResult['@type'] !== 'fandaws:ParseResult') {
    return {
      '@type': 'fandaws:ClassificationAction',
      'fandaws:error': true,
      'fandaws:errorReason': 'invalid-input',
      'fandaws:workflow': null,
      'fandaws:subject': null,
      'fandaws:object': null,
      'fandaws:verb': null,
    };
  }

  // Reject error ParseResults
  if (parseResult['fandaws:error']) {
    return {
      '@type': 'fandaws:ClassificationAction',
      'fandaws:error': true,
      'fandaws:errorReason': parseResult['fandaws:errorReason'] || 'parse-error',
      'fandaws:workflow': null,
      'fandaws:subject': null,
      'fandaws:object': null,
      'fandaws:verb': null,
    };
  }

  const verbType = parseResult['fandaws:verbType'];
  const subject = parseResult['fandaws:subject'];
  const object = parseResult['fandaws:object'];

  // Validate verb type
  if (!verbType || !VALID_VERB_TYPES.has(verbType)) {
    return {
      '@type': 'fandaws:ClassificationAction',
      'fandaws:error': true,
      'fandaws:errorReason': 'invalid-verb-type',
      'fandaws:workflow': null,
      'fandaws:subject': null,
      'fandaws:object': null,
      'fandaws:verb': null,
    };
  }

  // Validate operands
  if (!subject || !object) {
    return {
      '@type': 'fandaws:ClassificationAction',
      'fandaws:error': true,
      'fandaws:errorReason': 'missing-operands',
      'fandaws:workflow': null,
      'fandaws:subject': null,
      'fandaws:object': null,
      'fandaws:verb': null,
    };
  }

  // Route to workflow
  return createClassificationAction({
    workflow: verbType,
    subject,
    object,
    verb: verbType === 'customRelationship'
      ? parseResult['fandaws:predicate']
      : null,
  });
}
