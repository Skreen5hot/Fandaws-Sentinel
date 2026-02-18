/**
 * Property — a characteristic or attribute attached to a concept.
 *
 * v2.1: Properties are owl:Restriction nodes embedded in a concept's
 * rdfs:subClassOf array. Inherited down the classification hierarchy
 * unless overridden.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

/**
 * Create a new Property restriction node.
 *
 * @param {object} params
 * @param {string} params.id - Unique restriction IRI
 * @param {string} params.propertyIri - Property IRI (owl:onProperty)
 * @param {string} params.attachedTo - Concept IRI this property belongs to
 * @param {string} [params.scope] - "concept-specific" or "inherited"
 * @param {*} [params.value] - Property value (owl:hasValue)
 * @param {string|null} [params.epistemicRegister] - Register IRI (ERS Phase 10b)
 * @param {object|null} [params.routingRecord] - Inline RegisterRoutingRecord (ERS Phase 10b)
 * @param {string[]} [params.routingFlags] - Routing flags (ERS Phase 10b)
 * @returns {object} JSON-LD owl:Restriction node
 */
export function createProperty({
  id,
  propertyIri,
  attachedTo,
  scope = 'concept-specific',
  value = null,
  epistemicRegister = null,
  routingRecord = null,
  routingFlags = [],
}) {
  const node = {
    '@id': id,
    '@type': 'owl:Restriction',
    'owl:onProperty': propertyIri,
    'owl:hasValue': value,
    'fandaws:scope': scope,
    'fandaws:attachedTo': attachedTo,
    'fandaws:restrictionKind': 'property',
  };
  if (epistemicRegister) node['fandaws:epistemicRegister'] = epistemicRegister;
  if (routingRecord) node['fandaws:routingRecord'] = routingRecord;
  if (routingFlags.length > 0) node['fandaws:routingFlags'] = routingFlags;
  return node;
}
