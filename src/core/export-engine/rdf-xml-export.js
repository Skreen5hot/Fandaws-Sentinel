/**
 * RDF/XML Export — full-vocabulary KnowledgeGraph serialization.
 *
 * Exports all triples (both SKOS and OWL vocabularies) as RDF/XML.
 * No filtering — preserves complete graph information.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.6, 5.7
 */

import { extractTriples } from './triple-extractor.js';
import { serializeRdfXml } from './xml-serializer.js';

// ── Full Prefixes ──

const ALL_PREFIXES = {
  bfo: 'http://purl.obolibrary.org/obo/',
  dcterms: 'http://purl.org/dc/terms/',
  fandaws: 'https://fandaws.org/schema/',
  owl: 'http://www.w3.org/2002/07/owl#',
  prov: 'http://www.w3.org/ns/prov#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

// ── Public API ──

/**
 * Export a KnowledgeGraph as RDF/XML with full vocabulary.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @param {object} [config={}] - Export configuration
 * @returns {string} RDF/XML serialization
 */
export function exportRDF(graph, config = {}) {
  const allTriples = extractTriples(graph, config);
  return serializeRdfXml(allTriples, ALL_PREFIXES);
}
