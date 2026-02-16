/**
 * Turtle Export — full-vocabulary KnowledgeGraph serialization.
 *
 * Exports all triples (both SKOS and OWL vocabularies) as Turtle.
 * No filtering — preserves complete graph information.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.6, 5.7
 */

import { extractTriples } from './triple-extractor.js';
import { serializeTurtle } from './turtle-serializer.js';

// ── Full Prefixes ──

const ALL_PREFIXES = {
  dcterms: 'http://purl.org/dc/terms/',
  fandaws: 'https://fandaws.org/schema/',
  owl: 'http://www.w3.org/2002/07/owl#',
  prov: 'http://www.w3.org/ns/prov#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

// ── Public API ──

/**
 * Export a KnowledgeGraph as Turtle with full vocabulary.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @param {object} [config={}] - Export configuration
 * @returns {string} Turtle serialization
 */
export function exportTurtle(graph, config = {}) {
  const allTriples = extractTriples(graph);
  return serializeTurtle(allTriples, ALL_PREFIXES);
}
