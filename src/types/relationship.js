/**
 * Relationship — a custom (non-is, non-has) connection between concepts.
 *
 * Captures arbitrary verb forms as first-class semantic structures.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.3
 */

/**
 * Create a new Relationship node.
 *
 * @param {object} params
 * @param {string} params.id - Unique relationship IRI
 * @param {string} params.verb - The verb connecting subject and object
 * @param {string} params.subject - Source concept IRI
 * @param {string} params.object - Target concept IRI
 * @param {string|null} [params.subRelationshipOf] - Parent relationship IRI
 * @param {boolean} [params.promoted] - Whether promoted from a sub-relationship
 * @returns {object} JSON-LD Relationship node
 */
export function createRelationship({
  id,
  verb,
  subject,
  object,
  subRelationshipOf = null,
  promoted = false,
}) {
  return {
    '@id': id,
    '@type': 'fandaws:Relationship',
    'fandaws:verb': verb,
    'fandaws:subject': subject,
    'fandaws:object': object,
    'fandaws:subRelationshipOf': subRelationshipOf,
    'fandaws:promoted': promoted,
  };
}
