/**
 * OWL Export — transform KnowledgeGraph to OWL 2/Turtle.
 *
 * Filters the canonical JSON-LD graph to OWL vocabulary,
 * declares property types, and serializes to Turtle syntax.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.6, 5.7
 */

import { extractTriples, expandIri } from './triple-extractor.js';
import { serializeTurtle } from './turtle-serializer.js';

// ── OWL Prefixes ──

const OWL_PREFIXES = {
  fandaws: 'https://fandaws.org/schema/',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  bfo: 'http://purl.obolibrary.org/obo/',
};

// Expanded URIs for filtering
const RDF_TYPE = expandIri('rdf:type');
const OWL_CLASS = expandIri('owl:Class');
const OWL_RESTRICTION = expandIri('owl:Restriction');
const OWL_ONTOLOGY = expandIri('owl:Ontology');
const OWL_DATATYPE_PROPERTY = expandIri('owl:DatatypeProperty');
const OWL_OBJECT_PROPERTY = expandIri('owl:ObjectProperty');
const OWL_ON_PROPERTY = expandIri('owl:onProperty');
const OWL_HAS_VALUE = expandIri('owl:hasValue');
const OWL_SOME_VALUES_FROM = expandIri('owl:someValuesFrom');
const OWL_NS = 'http://www.w3.org/2002/07/owl#';
const RDFS_LABEL = expandIri('rdfs:label');
const RDFS_SUBCLASS_OF = expandIri('rdfs:subClassOf');
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';

// ── Filters ──

function isOwlTypeTriple(triple) {
  return (
    triple.predicate === RDF_TYPE &&
    (triple.object === OWL_CLASS || triple.object === OWL_RESTRICTION)
  );
}

function isOwlPredicate(predicate) {
  return (
    predicate.startsWith(OWL_NS) ||
    predicate === RDFS_LABEL ||
    predicate === RDFS_SUBCLASS_OF
  );
}

// ── Public API ──

/**
 * Export a KnowledgeGraph as OWL 2 in Turtle syntax.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @param {object} [config={}] - Export configuration
 * @returns {string} OWL/Turtle serialization
 */
export function exportOWL(graph, config = {}) {
  const allTriples = extractTriples(graph);

  // Filter to OWL vocabulary
  const filtered = allTriples.filter((t) => {
    if (t.predicate === RDF_TYPE) return isOwlTypeTriple(t);
    return isOwlPredicate(t.predicate);
  });

  // Collect unique property and verb IRIs for declarations
  const datatypeProperties = new Set();
  const objectProperties = new Set();

  // Scan restriction triples to determine property types
  // Properties with owl:hasValue → DatatypeProperty
  // Relationships with owl:someValuesFrom → ObjectProperty
  const restrictionSubjects = new Set();
  for (const t of filtered) {
    if (t.predicate === RDF_TYPE && t.object === OWL_RESTRICTION) {
      restrictionSubjects.add(t.subject);
    }
  }

  for (const t of filtered) {
    if (t.predicate === OWL_ON_PROPERTY && restrictionSubjects.has(t.subject)) {
      // Check if this restriction uses hasValue or someValuesFrom
      const hasSomeValues = filtered.some(
        (x) => x.subject === t.subject && x.predicate === OWL_SOME_VALUES_FROM,
      );
      if (hasSomeValues) {
        objectProperties.add(t.object);
      } else {
        datatypeProperties.add(t.object);
      }
    }
  }

  // Add property type declarations
  const propertyTriples = [];
  for (const prop of [...datatypeProperties].sort()) {
    propertyTriples.push({
      subject: prop,
      predicate: RDF_TYPE,
      object: OWL_DATATYPE_PROPERTY,
      objectType: 'uri',
    });
  }
  for (const prop of [...objectProperties].sort()) {
    propertyTriples.push({
      subject: prop,
      predicate: RDF_TYPE,
      object: OWL_OBJECT_PROPERTY,
      objectType: 'uri',
    });
  }

  // Add owl:Ontology declaration for graph IRI
  const graphIri = graph['@id'];
  if (graphIri) {
    propertyTriples.push({
      subject: expandIri(graphIri),
      predicate: RDF_TYPE,
      object: OWL_ONTOLOGY,
      objectType: 'uri',
    });
  }

  const combined = [...filtered, ...propertyTriples];
  return serializeTurtle(combined, OWL_PREFIXES);
}
