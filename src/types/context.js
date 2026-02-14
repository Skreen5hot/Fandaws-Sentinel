/**
 * Fandaws JSON-LD Context
 *
 * Defines the vocabulary for all system data types.
 * Self-contained — does not require network access to resolve.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.1, Appendix A.1
 */

export const FANDAWS_CONTEXT = {
  '@context': {
    fandaws: 'https://fandaws.org/schema/',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    owl: 'http://www.w3.org/2002/07/owl#',
    bfo: 'http://purl.obolibrary.org/obo/',
    schema: 'https://schema.org/',
    'fandaws:displayLabel': { '@type': 'xsd:string' },
    'fandaws:canonicalLabel': { '@type': 'xsd:string' },
    'fandaws:parent': { '@type': '@id' },
    'fandaws:children': { '@container': '@set', '@type': '@id' },
    'fandaws:properties': { '@container': '@set' },
    'fandaws:mergedFrom': { '@container': '@set', '@type': '@id' },
    'fandaws:createdAt': { '@type': 'xsd:dateTime' },
    'fandaws:bfoMapping': { '@type': '@id' },
  },
};
