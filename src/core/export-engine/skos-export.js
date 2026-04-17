/**
 * SKOS Export — transform KnowledgeGraph to SKOS/Turtle.
 *
 * Filters the canonical JSON-LD graph to SKOS vocabulary,
 * adds skos:narrower inverses, and serializes to Turtle syntax.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.6, 5.7
 */

import { extractTriples, expandIri } from './triple-extractor.js';
import { serializeTurtle } from './turtle-serializer.js';

// ── SKOS Prefixes ──

const SKOS_PREFIXES = {
  dcterms: 'http://purl.org/dc/terms/',
  fandaws: 'https://fandaws.org/schema/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

// Expanded URIs for filtering
const RDF_TYPE = expandIri('rdf:type');
const SKOS_CONCEPT = expandIri('skos:Concept');
const SKOS_CONCEPT_SCHEME = expandIri('skos:ConceptScheme');
const SKOS_BROADER = expandIri('skos:broader');
const SKOS_NARROWER = expandIri('skos:narrower');
const SKOS_NS = 'http://www.w3.org/2004/02/skos/core#';
const RDFS_LABEL = expandIri('rdfs:label');
const DCTERMS_NS = 'http://purl.org/dc/terms/';

// ── Filters ──

const FANDAWS_ALGORITHMIC_DEF = expandIri('fandaws:algorithmicDefinition');

function isSkosPredicate(predicate) {
  return (
    predicate.startsWith(SKOS_NS) ||
    predicate === RDFS_LABEL ||
    predicate.startsWith(DCTERMS_NS) ||
    predicate === FANDAWS_ALGORITHMIC_DEF
  );
}

function isSkosTypeTriple(triple) {
  return triple.predicate === RDF_TYPE && triple.object === SKOS_CONCEPT;
}

// ── Public API ──

/**
 * Export a KnowledgeGraph as SKOS in Turtle syntax.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @param {object} [config={}] - Export configuration
 * @returns {string} SKOS/Turtle serialization
 */
export function exportSKOS(graph, config = {}) {
  const allTriples = extractTriples(graph, config);

  // Filter to SKOS vocabulary
  const filtered = allTriples.filter((t) => {
    if (t.predicate === RDF_TYPE) return isSkosTypeTriple(t);
    return isSkosPredicate(t.predicate);
  });

  // Add skos:narrower inverses
  const narrowerTriples = [];
  for (const t of filtered) {
    if (t.predicate === SKOS_BROADER) {
      narrowerTriples.push({
        subject: t.object,
        predicate: SKOS_NARROWER,
        object: t.subject,
        objectType: 'uri',
      });
    }
  }

  // Add ConceptScheme declaration for graph IRI
  const graphIri = graph['@id'];
  if (graphIri) {
    filtered.push({
      subject: expandIri(graphIri),
      predicate: RDF_TYPE,
      object: SKOS_CONCEPT_SCHEME,
      objectType: 'uri',
    });
  }

  const combined = [...filtered, ...narrowerTriples];
  return serializeTurtle(combined, SKOS_PREFIXES);
}
