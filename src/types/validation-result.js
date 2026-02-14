/**
 * ValidationResult — output of the Validator module.
 *
 * Indicates whether a proposed GraphMutation is valid,
 * with specific violation descriptors if invalid.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.4
 */

/**
 * Create a new ValidationResult.
 *
 * @param {object} params
 * @param {boolean} params.valid - Whether the mutation passed validation
 * @param {object[]} [params.violations] - Violation descriptors if invalid
 * @param {string|null} [params.id] - ValidationResult IRI for referencing
 * @returns {object} JSON-LD ValidationResult node
 */
export function createValidationResult({
  valid,
  violations = [],
  id = null,
}) {
  return {
    '@id': id,
    '@type': 'fandaws:ValidationResult',
    'fandaws:valid': valid,
    'fandaws:violations': violations,
  };
}
