/**
 * Property — a characteristic or attribute attached to a concept.
 *
 * v2.1: Properties are owl:Restriction nodes embedded in a concept's
 * rdfs:subClassOf array. Inherited down the classification hierarchy
 * unless overridden.
 *
 * Restriction Structural Correction v1.1 (Ontology Ingestion Spec v1.4 §11.2):
 *   - owl:onProperty stores the VERB IRI (e.g., fandaws:objectProperty/has, or a
 *     resolved BFO object property like bfo:BFO_0000052).
 *   - owl:someValuesFrom stores the OBJECT concept IRI (the noun, e.g., the
 *     class IRI for "fur").
 *   - fandaws:verbLabel preserves the original user verb form ("has").
 *   - fandaws:propertyLabel preserves the noun label ("fur") for display
 *     and the redundancy check.
 *
 * @see v2.1 Concept JSON-LD Specification
 * @see Ontology Ingestion Spec v1.4 §11.2
 */

/**
 * Create a new Property restriction node.
 *
 * @param {object} params
 * @param {string} params.id - Unique restriction IRI
 * @param {string} params.verbIri - Verb IRI (owl:onProperty). Local
 *        verbs use the `fandaws:property/{slug}` prefix; verbs that label-match
 *        an ingested ontology object property (Section 6.5) use the source IRI
 *        directly (e.g., `bfo:BFO_0000052`).
 * @param {string} params.verbLabel - Original verb form (e.g., "has").
 * @param {string} params.objectConceptIri - Concept IRI for the noun (owl:someValuesFrom).
 * @param {string} params.propertyLabel - Canonical noun label for display/comparison.
 * @param {string} params.attachedTo - Concept IRI this property belongs to.
 * @param {string} [params.scope] - "concept-specific" or "inherited"
 * @param {*} [params.value] - Property value (owl:hasValue); null for simple attribute properties
 * @param {string|null} [params.epistemicRegister] - Register IRI (ERS Phase 10b)
 * @param {object|null} [params.routingRecord] - Inline RegisterRoutingRecord (ERS Phase 10b)
 * @param {string[]} [params.routingFlags] - Routing flags (ERS Phase 10b)
 * @param {'user'|'ingested'} [params.source='user'] - Origin of the restriction (Ontology Ingestion Spec v1.4 §11.2)
 * @returns {object} JSON-LD owl:Restriction node
 */
export function createProperty({
  id,
  verbIri,
  verbLabel,
  objectConceptIri,
  propertyLabel,
  attachedTo,
  scope = 'concept-specific',
  value = null,
  epistemicRegister = null,
  routingRecord = null,
  routingFlags = [],
  source = 'user',
}) {
  const node = {
    '@id': id,
    '@type': 'owl:Restriction',
    'owl:onProperty': verbIri,
    'owl:someValuesFrom': objectConceptIri,
    'fandaws:verbLabel': verbLabel,
    'fandaws:propertyLabel': propertyLabel,
    'owl:hasValue': value,
    'fandaws:scope': scope,
    'fandaws:attachedTo': attachedTo,
    'fandaws:restrictionKind': 'property',
    'fandaws:source': source,
  };
  if (epistemicRegister) node['fandaws:epistemicRegister'] = epistemicRegister;
  if (routingRecord) node['fandaws:routingRecord'] = routingRecord;
  if (routingFlags.length > 0) node['fandaws:routingFlags'] = routingFlags;
  return node;
}
