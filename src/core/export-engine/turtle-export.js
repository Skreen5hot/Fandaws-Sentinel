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
import { VERB_TO_SCHEMA } from './relation-type-schemas.js';
import { isRestrictionNode } from '../../types/type-checks.js';

// ── Full Prefixes ──

const ALL_PREFIXES = {
  bfo: 'http://purl.obolibrary.org/obo/',
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
  const allTriples = extractTriples(graph, config);
  let turtle = serializeTurtle(allTriples, ALL_PREFIXES);

  // Append RECC relation type class schemas (Rule RECC-5: verbatim seed set).
  // Scan all restrictions for Tier 2A verbs that map to a relation type class.
  // Only emit each schema once, regardless of how many restrictions use it.
  const emittedSchemas = new Set();
  const concepts = graph['fandaws:concepts'] || [];
  for (const concept of concepts) {
    for (const entry of (concept['rdfs:subClassOf'] || [])) {
      if (!isRestrictionNode(entry)) continue;
      const onProp = entry['owl:onProperty'];
      if (typeof onProp !== 'string') continue;
      // Extract verb tail from fandaws:objectProperty/<verb>
      const verbPrefix = 'fandaws:objectProperty/';
      if (!onProp.startsWith(verbPrefix)) continue;
      const verb = onProp.slice(verbPrefix.length);
      if (verb in VERB_TO_SCHEMA && !emittedSchemas.has(verb)) {
        emittedSchemas.add(verb);
        turtle += '\n' + VERB_TO_SCHEMA[verb].schema.trim() + '\n';
      }
    }
  }

  return turtle;
}
