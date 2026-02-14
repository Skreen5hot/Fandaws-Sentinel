/**
 * Property — a characteristic or attribute attached to a concept.
 *
 * Properties are inherited down the classification hierarchy unless overridden.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.2
 */

/**
 * Create a new Property node.
 *
 * @param {object} params
 * @param {string} params.id - Unique property IRI
 * @param {string} params.label - Property name
 * @param {string} params.attachedTo - Concept IRI this property is attached to
 * @param {string} [params.scope] - "concept-specific" or "inherited"
 * @param {*} [params.value] - Optional property value
 * @returns {object} JSON-LD Property node
 */
export function createProperty({
  id,
  label,
  attachedTo,
  scope = 'concept-specific',
  value = null,
}) {
  return {
    '@id': id,
    '@type': 'fandaws:Property',
    'fandaws:label': label,
    'fandaws:attachedTo': attachedTo,
    'fandaws:scope': scope,
    'fandaws:value': value,
  };
}
