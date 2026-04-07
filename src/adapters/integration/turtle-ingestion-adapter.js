/**
 * Turtle Ingestion Adapter — translate external ontology Turtle into
 * Fandaws ingested concepts and ingested object property index.
 *
 * Lives in the IntegrationAdapter layer (Section 3.3.2). The core
 * pipeline never sees Turtle; it only sees the normalized JSON-LD
 * concept array this adapter produces.
 *
 * Phase A scope: BFO 2020 ingestion. Anonymous restrictions and
 * non-class axioms are archived verbatim into `fandaws:sourceAxioms`
 * — they are NOT translated into Fandaws restriction nodes (the
 * conversational property workflow owns that semantic).
 *
 * @see Ontology Ingestion Spec v1.4 Sections 4, 5, 6
 */

import { parseTurtle } from './turtle-parser.js';
import { generateIngestedConceptIri } from '../../core/knowledge-engine/iri-generator.js';
import { createIngestedConcept } from '../../types/concept.js';
import { sha256Hex } from '../../core/ivne/sha256.js';
import { simplify } from '../../core/identity/identity-simplification.js';

// ── Vocabulary IRIs (full form) ──
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';
const RDFS_SUBCLASSOF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';
const RDFS_SUBPROPERTYOF = 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';
const OWL_DEPRECATED = 'http://www.w3.org/2002/07/owl#deprecated';
const OWL_DISJOINT_WITH = 'http://www.w3.org/2002/07/owl#disjointWith';
const OWL_EQUIVALENT_CLASS = 'http://www.w3.org/2002/07/owl#equivalentClass';
const SKOS_DEFINITION = 'http://www.w3.org/2004/02/skos/core#definition';
const SKOS_ALT_LABEL = 'http://www.w3.org/2004/02/skos/core#altLabel';
const SKOS_EXAMPLE = 'http://www.w3.org/2004/02/skos/core#example';
const OBO_IAO_DEFINITION = 'http://purl.obolibrary.org/obo/IAO_0000115';
const DC11_IDENTIFIER = 'http://purl.org/dc/elements/1.1/identifier';

// ── BFO ontology metadata ──
const BFO_ONTOLOGY_IRI = 'http://purl.obolibrary.org/obo/bfo.owl';
const BFO_VERSION = 'BFO 2020';

// ── Helpers ──

/**
 * Pull a literal value out of a parsed object node.
 * Returns null for non-literals.
 */
function literalValue(obj) {
  if (obj && typeof obj === 'object' && obj['@type'] === '_:literal') {
    return obj.value;
  }
  return null;
}

/**
 * Find the first matching predicate's object value.
 */
function firstObject(triples, predicateIri) {
  for (const t of triples) {
    if (t.predicate === predicateIri) return t.object;
  }
  return null;
}

/**
 * Find all matching predicate objects.
 */
function allObjects(triples, predicateIri) {
  const out = [];
  for (const t of triples) {
    if (t.predicate === predicateIri) out.push(t.object);
  }
  return out;
}

/**
 * Determine if a subject is an owl:Class (ignoring blank-node anonymous restrictions).
 */
function isClassSubject(triples) {
  const types = allObjects(triples, RDF_TYPE);
  return types.some((t) => t === OWL_CLASS);
}

/**
 * Determine if a subject is an owl:ObjectProperty.
 */
function isObjectPropertySubject(triples) {
  const types = allObjects(triples, RDF_TYPE);
  return types.some((t) => t === OWL_OBJECT_PROPERTY);
}

/**
 * Check if a class is marked as deprecated.
 */
function isDeprecated(triples) {
  for (const t of triples) {
    if (t.predicate === OWL_DEPRECATED) {
      const v = literalValue(t.object);
      if (v === 'true' || v === '1') return true;
    }
  }
  return false;
}

/**
 * Resolve definition with priority: skos:definition → obo:IAO_0000115 → rdfs:comment.
 */
function extractDefinition(triples) {
  const skos = firstObject(triples, SKOS_DEFINITION);
  if (skos) {
    const v = literalValue(skos);
    if (v) return v;
  }
  const obo = firstObject(triples, OBO_IAO_DEFINITION);
  if (obo) {
    const v = literalValue(obo);
    if (v) return v;
  }
  const comment = firstObject(triples, RDFS_COMMENT);
  if (comment) {
    const v = literalValue(comment);
    if (v) return v;
  }
  return '';
}

/**
 * Extract rdfs:label, preferring @en lang tags when multiple are present.
 */
function extractLabel(triples) {
  const labels = allObjects(triples, RDFS_LABEL).filter((o) => literalValue(o) != null);
  if (labels.length === 0) return null;
  // Prefer @en
  const en = labels.find((o) => o && o.lang === 'en');
  if (en) return literalValue(en);
  return literalValue(labels[0]);
}

/**
 * Extract skos:altLabel values (strings only).
 */
function extractAltLabels(triples) {
  return allObjects(triples, SKOS_ALT_LABEL)
    .map(literalValue)
    .filter((v) => v != null);
}

/**
 * Extract named superclass IRIs (ignores anonymous restrictions).
 */
function extractNamedSuperclasses(triples) {
  return allObjects(triples, RDFS_SUBCLASSOF)
    .filter((o) => typeof o === 'string');
}

/**
 * Collect non-translated axioms (anonymous restrictions, disjointWith, etc.)
 * for archival in fandaws:sourceAxioms. These are stored as plain JS objects
 * representing the original predicate/object structure for downstream consumers.
 */
function extractSourceAxioms(triples) {
  const archived = [];
  for (const t of triples) {
    // Skip predicates we translate (those that become Fandaws fields)
    if (
      t.predicate === RDF_TYPE ||
      t.predicate === RDFS_LABEL ||
      t.predicate === RDFS_COMMENT ||
      t.predicate === SKOS_DEFINITION ||
      t.predicate === SKOS_ALT_LABEL ||
      t.predicate === SKOS_EXAMPLE ||
      t.predicate === OBO_IAO_DEFINITION ||
      t.predicate === DC11_IDENTIFIER ||
      t.predicate === OWL_DEPRECATED
    ) {
      continue;
    }
    // rdfs:subClassOf with named class is translated; anonymous is archived
    if (t.predicate === RDFS_SUBCLASSOF && typeof t.object === 'string') {
      continue;
    }
    archived.push({ predicate: t.predicate, object: t.object });
  }
  return archived;
}

/**
 * Build the parent map: source class IRI → Fandaws IRI.
 * Required for translating named superclass references during the second pass.
 */
function buildParentMap(classSubjects) {
  const map = new Map();
  for (const [sourceIri, triples] of classSubjects) {
    const label = extractLabel(triples) || sourceIri.split('/').pop();
    const fandawsIri = generateIngestedConceptIri(sourceIri, label);
    map.set(sourceIri, fandawsIri);
  }
  return map;
}

/**
 * Build the ingested object property index: label → source property IRI.
 *
 * Used by the conversational property workflow to map user verbs to
 * BFO/CCO object properties when an exact label match exists.
 */
function buildPropertyIndex(propertySubjects) {
  const index = new Map();
  for (const [sourceIri, triples] of propertySubjects) {
    const labels = allObjects(triples, RDFS_LABEL)
      .map(literalValue)
      .filter((v) => v != null);
    for (const label of labels) {
      const key = label.toLowerCase().trim();
      if (!index.has(key)) {
        index.set(key, sourceIri);
      }
    }
    // Also index altLabels — useful for synonym matching
    const altLabels = extractAltLabels(triples);
    for (const alt of altLabels) {
      const key = alt.toLowerCase().trim();
      if (!index.has(key)) {
        index.set(key, sourceIri);
      }
    }
  }
  return index;
}

/**
 * Ingest a Turtle ontology into a normalized Fandaws concept array
 * plus an ingested object property index.
 *
 * Pure function: same input bytes → same output. Safe to call repeatedly.
 *
 * @param {string} turtleText - Raw Turtle source
 * @param {object} [options]
 * @param {string} [options.sourceOntology=BFO_ONTOLOGY_IRI] - Logical ontology IRI
 * @param {string} [options.sourceVersion=BFO_VERSION] - Human-readable version
 * @param {string} [options.timestamp] - ISO timestamp (defaults to current; injectable for determinism tests)
 * @returns {{
 *   concepts: object[],
 *   propertyIndex: Map<string, string>,
 *   parentMap: Map<string, string>,
 *   contentHash: string,
 *   skipped: { deprecated: string[] }
 * }}
 */
export function ingestTurtle(turtleText, options = {}) {
  const {
    sourceOntology = BFO_ONTOLOGY_IRI,
    sourceVersion = BFO_VERSION,
    timestamp = new Date().toISOString(),
  } = options;

  const contentHash = 'sha256:' + sha256Hex(turtleText);
  const parsed = parseTurtle(turtleText);

  // Partition subjects by RDF type (skip top-level blank nodes)
  const classSubjects = [];
  const propertySubjects = [];
  const skipped = { deprecated: [] };

  for (const [subjectIri, triples] of parsed.subjects) {
    if (subjectIri.startsWith('_:')) continue; // skip top-level anonymous
    if (isObjectPropertySubject(triples)) {
      propertySubjects.push([subjectIri, triples]);
      continue;
    }
    if (isClassSubject(triples)) {
      if (isDeprecated(triples)) {
        skipped.deprecated.push(subjectIri);
        continue;
      }
      classSubjects.push([subjectIri, triples]);
    }
  }

  // First pass: build parent map (source IRI → Fandaws IRI)
  const parentMap = buildParentMap(classSubjects);

  // Second pass: construct ingested concepts
  const concepts = [];
  for (const [sourceIri, triples] of classSubjects) {
    const label = extractLabel(triples) || sourceIri.split('/').pop();
    const definition = extractDefinition(triples);
    const altLabels = extractAltLabels(triples);
    const namedSupers = extractNamedSuperclasses(triples);
    const sourceAxioms = extractSourceAxioms(triples);
    const idTok = firstObject(triples, DC11_IDENTIFIER);
    const sourceIdentifier = idTok ? literalValue(idTok) : null;

    // Pick the first named superclass that maps to a known Fandaws IRI.
    // Roots (no named super) become Fandaws roots.
    let broader = null;
    for (const sup of namedSupers) {
      if (parentMap.has(sup)) {
        broader = parentMap.get(sup);
        break;
      }
    }

    const ingestSource = {
      '@type': 'fandaws:IngestionRecord',
      'fandaws:sourceOntology': sourceOntology,
      'fandaws:sourceClassIri': sourceIri,
      'fandaws:sourceVersion': sourceVersion,
      'fandaws:ingestedAt': timestamp,
      'fandaws:contentHash': contentHash,
    };

    // Canonicalize the prefLabel
    const canonical = simplify(label).canonicalLabel || label;

    const concept = createIngestedConcept({
      id: parentMap.get(sourceIri),
      label,
      prefLabel: canonical,
      broader,
      definition,
      equivalentClass: [sourceIri],
      altLabel: altLabels,
      ingestSource,
      sourceIdentifier,
      sourceAxioms,
    });
    // Force created timestamp to the supplied one for determinism
    concept['dcterms:created'] = timestamp;

    concepts.push(concept);
  }

  // Sort concepts deterministically by Fandaws @id
  concepts.sort((a, b) => a['@id'].localeCompare(b['@id']));

  // Build property index
  const propertyIndex = buildPropertyIndex(propertySubjects);

  return {
    concepts,
    propertyIndex,
    parentMap,
    contentHash,
    skipped,
  };
}

/**
 * Build an equivalence index from ingested concepts: source IRI → Fandaws IRI.
 *
 * Used by phantom reference migration to rewrite legacy `rdfs:subClassOf`
 * entries that point to raw source IRIs. Adds both prefixed (`bfo:BFO_0000040`)
 * and full-URI (`http://purl.obolibrary.org/obo/BFO_0000040`) forms so
 * migration matches whichever form the legacy data uses.
 *
 * @param {object[]} concepts - Concepts in the graph (or just the ingested subset)
 * @returns {Map<string, string>}
 */
export function buildEquivalenceIndex(concepts) {
  const index = new Map();
  for (const c of concepts) {
    if (!c['fandaws:isImported']) continue;
    const equivs = c['owl:equivalentClass'];
    if (Array.isArray(equivs)) {
      for (const e of equivs) {
        index.set(e, c['@id']);
        // Index both prefixed and full-URI forms for BFO IRIs
        if (typeof e === 'string') {
          if (e.startsWith('http://purl.obolibrary.org/obo/BFO_')) {
            index.set('bfo:' + e.split('/').pop(), c['@id']);
          } else if (e.startsWith('bfo:BFO_')) {
            index.set('http://purl.obolibrary.org/obo/' + e.slice(4), c['@id']);
          }
        }
      }
    }
  }
  return index;
}

/**
 * Check whether a graph already contains an ingested copy of a source ontology
 * with a matching content hash. If so, re-ingestion can short-circuit.
 *
 * @param {object} graph - KnowledgeGraph
 * @param {string} sourceOntology - Logical ontology IRI to check
 * @param {string} contentHash - Hash of the new source file (with "sha256:" prefix)
 * @returns {boolean} True if the graph already has this exact version
 */
export function isAlreadyIngested(graph, sourceOntology, contentHash) {
  const concepts = graph['fandaws:concepts'] || [];
  for (const c of concepts) {
    const ingest = c['fandaws:ingestSource'];
    if (
      ingest &&
      ingest['fandaws:sourceOntology'] === sourceOntology &&
      ingest['fandaws:contentHash'] === contentHash
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a graph contains any concepts ingested from a given source ontology.
 *
 * @param {object} graph - KnowledgeGraph
 * @param {string} sourceOntology - Logical ontology IRI to check
 * @returns {boolean}
 */
export function hasIngestedSource(graph, sourceOntology) {
  const concepts = graph['fandaws:concepts'] || [];
  for (const c of concepts) {
    const ingest = c['fandaws:ingestSource'];
    if (ingest && ingest['fandaws:sourceOntology'] === sourceOntology) {
      return true;
    }
  }
  return false;
}

/**
 * Migrate phantom source IRI references in user concepts to Fandaws IRIs.
 *
 * Operates on `rdfs:subClassOf` entries. Restriction objects and unresolved
 * IRIs are left unchanged. Idempotent — running it twice produces the same result.
 *
 * @param {object} graph - KnowledgeGraph (mutated in place)
 * @param {Map<string, string>} equivalenceIndex - Source IRI → Fandaws IRI
 * @returns {number} Count of rewritten entries
 */
export function migratePhantomReferences(graph, equivalenceIndex) {
  let rewrites = 0;
  const concepts = graph['fandaws:concepts'] || [];
  for (const c of concepts) {
    if (c['fandaws:isImported']) continue;
    const subClassOf = c['rdfs:subClassOf'] || [];
    let mutated = false;
    const newList = subClassOf.map((entry) => {
      if (typeof entry === 'string' && equivalenceIndex.has(entry)) {
        rewrites++;
        mutated = true;
        return equivalenceIndex.get(entry);
      }
      return entry;
    });
    if (mutated) c['rdfs:subClassOf'] = newList;
    // Also migrate skos:broader if it's a phantom source IRI
    if (typeof c['skos:broader'] === 'string' && equivalenceIndex.has(c['skos:broader'])) {
      c['skos:broader'] = equivalenceIndex.get(c['skos:broader']);
      rewrites++;
    }
  }
  return rewrites;
}
