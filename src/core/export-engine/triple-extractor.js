/**
 * Triple Extractor — convert Fandaws KnowledgeGraph JSON-LD to RDF triples.
 *
 * Shared foundation for all export formats. Extracts a deterministic,
 * sorted array of {subject, predicate, object} triples from the canonical
 * JSON-LD graph structure.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.6, 5.7
 */

import { isRestrictionNode } from '../../types/type-checks.js';

// ── Namespace Map ──

export const NAMESPACE_MAP = {
  'rdf:': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'rdfs:': 'http://www.w3.org/2000/01/rdf-schema#',
  'owl:': 'http://www.w3.org/2002/07/owl#',
  'skos:': 'http://www.w3.org/2004/02/skos/core#',
  'xsd:': 'http://www.w3.org/2001/XMLSchema#',
  'dcterms:': 'http://purl.org/dc/terms/',
  'prov:': 'http://www.w3.org/ns/prov#',
  'fandaws:': 'https://fandaws.org/schema/',
  'bfo:': 'http://purl.obolibrary.org/obo/',
  'schema:': 'https://schema.org/',
};

// Reverse map for compaction (longest match first)
const REVERSE_MAP = Object.entries(NAMESPACE_MAP)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([prefix, uri]) => [uri, prefix]);

// ── IRI Utilities ──

/**
 * Expand a prefixed IRI to a full URI.
 *
 * @param {string} iri - Prefixed IRI (e.g., "fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog") or full URI
 * @returns {string} Full URI
 */
export function expandIri(iri) {
  if (!iri || typeof iri !== 'string') return iri;
  for (const [prefix, uri] of Object.entries(NAMESPACE_MAP)) {
    if (iri.startsWith(prefix)) {
      return uri + iri.slice(prefix.length);
    }
  }
  return iri;
}

/**
 * Compact a full URI to a prefixed IRI.
 *
 * @param {string} uri - Full URI
 * @returns {string} Prefixed IRI or original URI if no prefix matches
 */
export function compactIri(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  for (const [ns, prefix] of REVERSE_MAP) {
    if (uri.startsWith(ns)) {
      return prefix + uri.slice(ns.length);
    }
  }
  return uri;
}

// ── Triple Helpers ──

function tripleUri(subject, predicate, object) {
  return { subject, predicate, object, objectType: 'uri' };
}

function tripleLiteral(subject, predicate, object, datatype) {
  const t = { subject, predicate, object: String(object), objectType: 'literal' };
  if (datatype) t.datatype = datatype;
  return t;
}

const RDF_TYPE = expandIri('rdf:type');
const XSD_DATETIME = expandIri('xsd:dateTime');

// ── Concept Extraction ──

function extractConceptTriples(concept, expanded) {
  const triples = [];
  const s = expanded;

  // @type (dual-typed)
  const types = concept['@type'];
  if (Array.isArray(types)) {
    for (const t of types) {
      triples.push(tripleUri(s, RDF_TYPE, expandIri(t)));
    }
  } else if (types) {
    triples.push(tripleUri(s, RDF_TYPE, expandIri(types)));
  }

  // rdfs:label
  const label = concept['rdfs:label'];
  if (label) {
    triples.push(tripleLiteral(s, expandIri('rdfs:label'), label));
  }

  // skos:prefLabel
  const prefLabel = concept['skos:prefLabel'];
  if (prefLabel) {
    triples.push(tripleLiteral(s, expandIri('skos:prefLabel'), prefLabel));
  }

  // skos:broader
  const broader = concept['skos:broader'];
  if (broader) {
    triples.push(tripleUri(s, expandIri('skos:broader'), expandIri(broader)));
  }

  // skos:definition
  const definition = concept['skos:definition'];
  if (definition) {
    triples.push(tripleLiteral(s, expandIri('skos:definition'), definition));
  }

  // skos:altLabel
  const altLabels = concept['skos:altLabel'] || [];
  for (const alt of [...altLabels].sort()) {
    triples.push(tripleLiteral(s, expandIri('skos:altLabel'), alt));
  }

  // skos:inScheme
  const inScheme = concept['skos:inScheme'];
  if (inScheme) {
    triples.push(tripleUri(s, expandIri('skos:inScheme'), expandIri(inScheme)));
  }

  // dcterms:created
  const created = concept['dcterms:created'];
  if (created) {
    triples.push(tripleLiteral(s, expandIri('dcterms:created'), created, XSD_DATETIME));
  }

  // dcterms:modified
  const modified = concept['dcterms:modified'];
  if (modified) {
    triples.push(tripleLiteral(s, expandIri('dcterms:modified'), modified, XSD_DATETIME));
  }

  // prov:wasDerivedFrom
  const derivedFrom = concept['prov:wasDerivedFrom'] || [];
  for (const d of [...derivedFrom].sort()) {
    triples.push(tripleUri(s, expandIri('prov:wasDerivedFrom'), expandIri(d)));
  }

  // rdfs:subClassOf — bare IRI strings (BFO categories, parent classes)
  const subClassOf = concept['rdfs:subClassOf'] || [];
  const bareIris = subClassOf.filter((entry) => typeof entry === 'string');
  for (const iri of [...bareIris].sort()) {
    triples.push(tripleUri(s, expandIri('rdfs:subClassOf'), expandIri(iri)));
  }

  // rdfs:subClassOf — restrictions (properties and relationships)
  const restrictions = subClassOf.filter(isRestrictionNode);
  const sortedRestrictions = [...restrictions].sort((a, b) =>
    (a['@id'] || '').localeCompare(b['@id'] || ''),
  );

  for (const r of sortedRestrictions) {
    const rIri = r['@id'] ? expandIri(r['@id']) : null;
    if (!rIri) continue;

    // conceptIRI rdfs:subClassOf restrictionIRI
    triples.push(tripleUri(s, expandIri('rdfs:subClassOf'), rIri));

    // restrictionIRI rdf:type owl:Restriction
    triples.push(tripleUri(rIri, RDF_TYPE, expandIri('owl:Restriction')));

    const kind = r['fandaws:restrictionKind'];

    if (kind === 'property') {
      // owl:onProperty
      const prop = r['owl:onProperty'];
      if (prop) {
        triples.push(tripleUri(rIri, expandIri('owl:onProperty'), expandIri(prop)));
      }
      // owl:hasValue
      const val = r['owl:hasValue'];
      if (val != null) {
        triples.push(tripleLiteral(rIri, expandIri('owl:hasValue'), val));
      }
    } else if (kind === 'relationship') {
      // owl:onProperty (verb)
      const verb = r['owl:onProperty'];
      if (verb) {
        triples.push(tripleUri(rIri, expandIri('owl:onProperty'), expandIri(verb)));
      }
      // owl:someValuesFrom (target concept)
      const target = r['owl:someValuesFrom'];
      if (target) {
        triples.push(tripleUri(rIri, expandIri('owl:someValuesFrom'), expandIri(target)));
      }
    }

    // Epistemic register metadata (ERS Phase 10b)
    const register = r['fandaws:epistemicRegister'];
    if (register) {
      triples.push(tripleUri(rIri, expandIri('fandaws:epistemicRegister'), expandIri(register)));
    }
    const routingFlags = r['fandaws:routingFlags'] || [];
    for (const flag of [...routingFlags].sort()) {
      triples.push(tripleLiteral(rIri, expandIri('fandaws:routingFlags'), flag));
    }
  }

  return triples;
}

// ── Main Extraction ──

/**
 * Extract all RDF triples from a KnowledgeGraph.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @returns {Array<{subject: string, predicate: string, object: string, objectType: 'uri'|'literal', datatype?: string}>}
 */
export function extractTriples(graph) {
  if (!graph || !graph['fandaws:concepts']) return [];

  const concepts = graph['fandaws:concepts'] || [];
  const sorted = [...concepts].sort((a, b) =>
    (a['@id'] || '').localeCompare(b['@id'] || ''),
  );

  const allTriples = [];
  for (const concept of sorted) {
    const expanded = expandIri(concept['@id']);
    const conceptTriples = extractConceptTriples(concept, expanded);
    allTriples.push(...conceptTriples);
  }

  return allTriples;
}
