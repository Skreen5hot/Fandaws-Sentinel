/**
 * Fandaws JSON-LD Context — v2.1
 *
 * Standard OWL/SKOS/PROV vocabulary for concept storage.
 * Fandaws-specific terms retained for mutations, sessions, and governance.
 * Self-contained — does not require network access to resolve.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

export const FANDAWS_CONTEXT = {
  '@context': {
    // ── Namespace prefixes ──
    fandaws: 'https://fandaws.org/schema/',
    owl: 'http://www.w3.org/2002/07/owl#',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    dcterms: 'http://purl.org/dc/terms/',
    prov: 'http://www.w3.org/ns/prov#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    bfo: 'http://purl.obolibrary.org/obo/',
    schema: 'https://schema.org/',
    ivne: 'https://fandaws.org/schema/ivne/',
    shml: 'https://fandaws.org/schema/shml/',

    // ── Concept field aliases ──
    label: 'rdfs:label',
    prefLabel: { '@id': 'skos:prefLabel', '@type': 'xsd:string' },
    altLabel: { '@id': 'skos:altLabel', '@container': '@set' },
    broader: { '@id': 'skos:broader', '@type': '@id' },
    definition: 'skos:definition',
    inScheme: { '@id': 'skos:inScheme', '@type': '@id' },
    subClassOf: { '@id': 'rdfs:subClassOf', '@container': '@set' },
    created: { '@id': 'dcterms:created', '@type': 'xsd:dateTime' },
    modified: { '@id': 'dcterms:modified', '@type': 'xsd:dateTime' },
    wasDerivedFrom: { '@id': 'prov:wasDerivedFrom', '@container': '@set', '@type': '@id' },

    // ── Fandaws-specific terms (scope resolution, governance) ──
    'fandaws:resolvedFrom': { '@type': '@id' },
    'fandaws:shadows': { '@container': '@set' },
    'fandaws:disambiguatedFrom': { '@type': '@id' },
    'fandaws:definitions': { '@container': '@set' },
    'fandaws:resolutionOptions': { '@container': '@set' },

    // ── IVNE (Ingestion, Validation & Normalization Engine, Phase 14) ──
    'shml:epistemicStatus': { '@type': 'xsd:string' },
    'fandaws:importedFrom': { '@type': '@id' },
    'fandaws:generatedFrom': { '@type': 'xsd:string' },
    'fandaws:ivneVersion': { '@type': 'xsd:string' },
    'fandaws:sourceOntology': { '@type': '@id' },
    'fandaws:compiledAt': { '@type': 'xsd:dateTime' },
    'fandaws:transformationType': { '@type': 'xsd:string' },
    'fandaws:disjuncts': { '@container': '@set', '@type': '@id' },

    // ── Epistemic Register Service (ERS Phase 10b) ──
    'fandaws:epistemicRegister': { '@type': '@id' },
    'fandaws:routingRecord': { '@type': '@id' },
    'fandaws:routingFlags': { '@container': '@set' },
  },
};
