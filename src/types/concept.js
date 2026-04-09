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
 * @param {string} [params.definition] - Auto-generated definition (fandaws:algorithmicDefinition)
 * @param {string|null} [params.bfoMapping] - BFO category IRI (entry in rdfs:subClassOf)
 * @param {string[]} [params.altLabel] - Alternative labels (skos:altLabel)
 * @param {string|null} [params.inScheme] - Graph/scheme IRI (skos:inScheme)
 * @param {string[]} [params.additionalParents] - Secondary parent IRIs added via "Add as additional parent" in the consequence-aware reclassification flow. Internal field — emitted as rdfs:subClassOf in exports but stored separately so the BFO recompute pass doesn't strip them.
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
  additionalParents = null,
}) {
  const node = {
    '@id': id,
    '@type': ['owl:Class', 'skos:Concept'],
    'rdfs:label': label,
    'skos:prefLabel': prefLabel,
    'skos:broader': broader,
    'fandaws:algorithmicDefinition': definition,
    'dcterms:created': new Date().toISOString(),
    'dcterms:modified': null,
    'prov:wasDerivedFrom': [],
    'skos:altLabel': altLabel,
    'skos:inScheme': inScheme,
    'rdfs:subClassOf': bfoMapping ? [bfoMapping] : [],
  };
  if (additionalParents && additionalParents.length > 0) {
    node['fandaws:additionalParents'] = additionalParents;
  }
  return node;
}

/**
 * Create an ingested Concept node from an external ontology source.
 *
 * Distinct from createConcept(): carries ingestion provenance, source
 * identity (owl:equivalentClass as an array), and the read-only flag
 * (fandaws:isImported). Algorithmic definition is empty — the source
 * ontology's definition lives in skos:definition.
 *
 * @see Ontology Ingestion Spec v1.4 Section 3.1
 *
 * @param {object} params
 * @param {string} params.id - Fandaws IRI (from generateIngestedConceptIri)
 * @param {string} params.label - rdfs:label from source
 * @param {string} params.prefLabel - canonicalized label
 * @param {string|null} params.broader - Fandaws parent IRI (NOT the raw source IRI)
 * @param {string} [params.definition] - skos:definition from source ontology
 * @param {string|string[]} params.equivalentClass - Source IRI(s) — stored as array
 * @param {string[]} [params.altLabel] - skos:altLabel values
 * @param {object} params.ingestSource - Ingestion envelope (sourceOntology, sourceClassIri, sourceVersion, ingestedAt, contentHash)
 * @param {string} [params.sourceIdentifier] - dc:identifier from source
 * @param {object[]} [params.sourceAxioms] - Opaque axioms archived (anonymous restrictions, disjointWith)
 * @param {string|null} [params.upstreamBroader] - Upstream parent if user has reclassified
 * @param {string|null} [params.upstreamStatus] - "deprecated" if removed upstream
 * @returns {object} JSON-LD ingested concept node
 */
export function createIngestedConcept({
  id,
  label,
  prefLabel,
  broader = null,
  definition = '',
  equivalentClass,
  altLabel = [],
  ingestSource,
  sourceIdentifier = null,
  sourceAxioms = [],
  upstreamBroader = null,
  upstreamStatus = null,
}) {
  if (!id) throw new Error('createIngestedConcept requires id');
  if (!equivalentClass) throw new Error('createIngestedConcept requires equivalentClass');
  if (!ingestSource) throw new Error('createIngestedConcept requires ingestSource');

  const equivArray = Array.isArray(equivalentClass) ? equivalentClass : [equivalentClass];

  const node = {
    '@id': id,
    '@type': ['owl:Class', 'skos:Concept'],
    'rdfs:label': label,
    'skos:prefLabel': prefLabel,
    'skos:broader': broader,
    'skos:definition': definition || '',
    'fandaws:algorithmicDefinition': '',
    'owl:equivalentClass': equivArray,
    'rdfs:subClassOf': broader ? [broader] : [],
    'dcterms:created': new Date().toISOString(),
    'dcterms:modified': null,
    'prov:wasDerivedFrom': equivArray.slice(),
    'skos:altLabel': altLabel,
    'skos:inScheme': null,
    'fandaws:isImported': true,
    'fandaws:ingestSource': ingestSource,
  };

  if (sourceIdentifier) node['fandaws:sourceIdentifier'] = sourceIdentifier;
  if (sourceAxioms && sourceAxioms.length > 0) node['fandaws:sourceAxioms'] = sourceAxioms;
  if (upstreamBroader) node['fandaws:upstreamBroader'] = upstreamBroader;
  if (upstreamStatus) node['fandaws:upstreamStatus'] = upstreamStatus;

  return node;
}
