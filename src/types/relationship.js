/**
 * Relationship — a custom (non-is, non-has) connection between concepts.
 *
 * v2.1: Relationships are owl:Restriction nodes embedded in the subject
 * concept's rdfs:subClassOf array, unified with properties.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

/**
 * Create a new Relationship restriction node.
 *
 * @param {object} params
 * @param {string} params.id - Unique restriction IRI
 * @param {string} params.verbIri - Relationship verb IRI (owl:onProperty)
 * @param {string} params.subject - Source concept IRI (fandaws:attachedTo)
 * @param {string} params.object - Target concept IRI (owl:someValuesFrom)
 * @param {string|null} [params.subRestrictionOf] - Parent restriction IRI
 * @param {boolean} [params.promoted] - Whether promoted from a sub-restriction
 * @returns {object} JSON-LD owl:Restriction node
 */
export function createRelationship({
  id,
  verbIri,
  subject,
  object,
  subRestrictionOf = null,
  promoted = false,
}) {
  return {
    '@id': id,
    '@type': 'owl:Restriction',
    'owl:onProperty': verbIri,
    'owl:someValuesFrom': object,
    'fandaws:attachedTo': subject,
    'fandaws:restrictionKind': 'relationship',
    'fandaws:subRestrictionOf': subRestrictionOf,
    'fandaws:promoted': promoted,
  };
}
