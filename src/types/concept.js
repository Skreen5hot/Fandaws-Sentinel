/**
 * Concept — the fundamental unit of knowledge in Fandaws.
 *
 * v2.1: Dual-typed as owl:Class + skos:Concept using standard vocabulary.
 * Depth and children are computed (not stored). Properties are embedded
 * as owl:Restriction entries in rdfs:subClassOf.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

/**
 * Create a new Concept node.
 *
 * @param {object} params
 * @param {string} params.id - Unique concept IRI (e.g., "fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog")
 * @param {string} params.label - Display name (rdfs:label)
 * @param {string} params.prefLabel - Normalized form for matching (skos:prefLabel)
 * @param {string|null} [params.broader] - Parent concept IRI (skos:broader, null for roots)
 * @param {string} [params.definition] - Auto-generated definition (skos:definition)
 * @param {string|null} [params.bfoMapping] - BFO category IRI (entry in rdfs:subClassOf)
 * @param {string[]} [params.altLabel] - Alternative labels (skos:altLabel)
 * @param {string|null} [params.inScheme] - Graph/scheme IRI (skos:inScheme)
 * @returns {object} JSON-LD Concept node
 */
export function createConcept({
  id,
  label,
  prefLabel,
  broader = null,
  definition = '',
  bfoMapping = null,
  altLabel = [],
  inScheme = null,
}) {
  return {
    '@id': id,
    '@type': ['owl:Class', 'skos:Concept'],
    'rdfs:label': label,
    'skos:prefLabel': prefLabel,
    'skos:broader': broader,
    'skos:definition': definition,
    'dcterms:created': new Date().toISOString(),
    'dcterms:modified': null,
    'prov:wasDerivedFrom': [],
    'skos:altLabel': altLabel,
    'skos:inScheme': inScheme,
    'rdfs:subClassOf': bfoMapping ? [bfoMapping] : [],
  };
}
