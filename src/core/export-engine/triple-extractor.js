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
  'rel:': 'https://fandaws.org/schema/executionProperty/',
  'fan:': 'https://fandaws.org/schema/fan/',
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

function extractConceptTriples(concept, expanded, options = {}) {
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

  // skos:broader + rdfs:subClassOf for immediate parent
  const broader = concept['skos:broader'];
  if (broader) {
    triples.push(tripleUri(s, expandIri('skos:broader'), expandIri(broader)));
    triples.push(tripleUri(s, expandIri('rdfs:subClassOf'), expandIri(broader)));
  }

  // owl:equivalentClass — Semantic identity lifecycle (Section 3.6).
  // For ingested concepts, emit one triple per source IRI in the array.
  // Predicate depends on fandaws:locallyModified state:
  //   pristine → owl:equivalentClass
  //   extended → rdfs:subClassOf
  //   diverged → skos:closeMatch
  const equivClasses = concept['owl:equivalentClass'];
  if (equivClasses) {
    const sources = Array.isArray(equivClasses) ? equivClasses : [equivClasses];
    const modified = concept['fandaws:locallyModified'];
    let predicate;
    if (!modified) predicate = 'owl:equivalentClass';
    else if (modified === 'extended') predicate = 'rdfs:subClassOf';
    else if (modified === 'diverged') predicate = 'skos:closeMatch';
    else predicate = 'owl:equivalentClass';
    for (const src of [...sources].sort()) {
      triples.push(tripleUri(s, expandIri(predicate), expandIri(src)));
    }
  }

  // skos:definition (from source ontologies on ingested concepts)
  const skosDefinition = concept['skos:definition'];
  if (skosDefinition) {
    triples.push(tripleLiteral(s, expandIri('skos:definition'), skosDefinition));
  }

  // fandaws:algorithmicDefinition (sub-property of skos:definition)
  const definition = concept['fandaws:algorithmicDefinition'];
  if (definition) {
    triples.push(tripleLiteral(s, expandIri('fandaws:algorithmicDefinition'), definition));
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

  // rdfs:subClassOf — bare IRI strings (BFO categories, parent classes).
  // Skip the broader value if already emitted above to avoid duplicate triples.
  const subClassOf = concept['rdfs:subClassOf'] || [];
  const bareIris = subClassOf.filter((entry) => typeof entry === 'string');
  for (const iri of [...bareIris].sort()) {
    if (iri === broader) continue; // already emitted via skos:broader handling
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

    // Tentative filter: exclude tentative restrictions from default export
    // (Decision C-4). A restriction is tentative when its confidence is in
    // [0.5, 0.7). The execution lane marks these with fandaws:tentative=true;
    // the canonical lane carries the raw confidence value. Check both.
    const confidence = r['fandaws:confidence'];
    const isTentative = r['fandaws:tentative'] || (confidence !== undefined && confidence >= 0.5 && confidence < 0.7);
    if (isTentative && !options.includeTentative) continue;

    // Below materialization threshold: skip entirely (not even in full export)
    if (confidence !== undefined && confidence < 0.5) continue;

    // Stale filter: exclude stale restrictions (Rule CS-3)
    if (r['fandaws:compilationStatus'] === 'Stale') continue;

    // conceptIRI rdfs:subClassOf restrictionIRI
    triples.push(tripleUri(s, expandIri('rdfs:subClassOf'), rIri));

    // restrictionIRI rdf:type owl:Restriction
    triples.push(tripleUri(rIri, RDF_TYPE, expandIri('owl:Restriction')));

    const kind = r['fandaws:restrictionKind'];

    if (kind === 'property') {
      // Restriction Structural Correction v1.1 (Ontology Ingestion Spec v1.4 §11.2):
      //   owl:onProperty stores the verb IRI (typically fandaws:objectProperty/has,
      //   or a BFO/CCO object-property IRI when verb resolution matched).
      //   owl:someValuesFrom stores the noun (the object concept IRI).
      // Both are emitted directly — no translation, no inference.
      //
      // Pre-correction fixtures may store the noun's class IRI in owl:onProperty
      // and lack owl:someValuesFrom. The fallback below detects that legacy
      // shape and synthesizes the corrected triples so existing graphs still
      // export sensibly until migrated.
      const prop = r['owl:onProperty'];
      const someValues = r['owl:someValuesFrom'];
      const isLegacyClassInOnProperty =
        typeof prop === 'string' && prop.startsWith('fandaws:class/') && !someValues;

      if (isLegacyClassInOnProperty) {
        // Legacy shape — synthesize corrected triples on the fly.
        triples.push(tripleUri(rIri, expandIri('owl:onProperty'), expandIri('fandaws:objectProperty/has')));
        triples.push(tripleUri(rIri, expandIri('owl:someValuesFrom'), expandIri(prop)));
      } else {
        if (prop) {
          triples.push(tripleUri(rIri, expandIri('owl:onProperty'), expandIri(prop)));
        }
        if (someValues) {
          triples.push(tripleUri(rIri, expandIri('owl:someValuesFrom'), expandIri(someValues)));
        }
      }
      // fandaws:propertyLabel — noun label preserved for display/redundancy
      const propLabel = r['fandaws:propertyLabel'];
      if (propLabel) {
        triples.push(tripleLiteral(rIri, expandIri('fandaws:propertyLabel'), propLabel));
      }
      // fandaws:verbLabel — original verb form preserved (mirrors relationships)
      const verbLabel = r['fandaws:verbLabel'];
      if (verbLabel) {
        triples.push(tripleLiteral(rIri, expandIri('fandaws:verbLabel'), verbLabel));
      }
      // owl:hasValue (when an explicit value is set)
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
      // fandaws:verbLabel — original user verb form preserved for display
      // and search. Same role as fandaws:propertyLabel on property restrictions.
      // Emitted (NOT in the export exclusion list).
      const verbLabel = r['fandaws:verbLabel'];
      if (verbLabel) {
        triples.push(tripleLiteral(rIri, expandIri('fandaws:verbLabel'), verbLabel));
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

// ── Verb Property Declarations ──

/**
 * Walk all property restrictions in the graph and declare each unique
 * local verb IRI as a bare `owl:ObjectProperty` with an `rdfs:label`.
 *
 * Tier 1 "Human Frame" — no domain, no range, no equivalence assertions.
 * A reasoner can traverse the property but cannot infer anything beyond
 * "these two things are connected by something called <verb>".
 *
 * Only `fandaws:property/*` IRIs are declared. BFO/CCO IRIs are silently
 * skipped — they are defined by their source ontologies and resolved via
 * `owl:imports`.
 *
 * @param {object[]} concepts - Array of concept nodes
 * @returns {Array<{subject: string, predicate: string, object: string, objectType: 'uri'|'literal'}>}
 */
function emitVerbPropertyDeclarations(concepts) {
  // Map verbIri → verbLabel (first label wins for stability).
  const verbs = new Map();

  for (const concept of concepts) {
    const subClassOf = concept['rdfs:subClassOf'] || [];
    for (const entry of subClassOf) {
      if (!isRestrictionNode(entry)) continue;
      if (entry['fandaws:restrictionKind'] !== 'property') continue;

      const onProperty = entry['owl:onProperty'];
      const someValues = entry['owl:someValuesFrom'];

      // New shape: owl:onProperty IS the verb IRI.
      // Legacy shape: owl:onProperty holds the noun's class IRI and there is
      // no owl:someValuesFrom — in that case the export-time fallback synthesizes
      // a `fandaws:objectProperty/has` declaration, so we add it here.
      let verbIri;
      let verbLabel;
      if (typeof onProperty === 'string' && onProperty.startsWith('fandaws:class/') && !someValues) {
        verbIri = 'fandaws:objectProperty/has';
        verbLabel = 'has';
      } else if (typeof onProperty === 'string') {
        verbIri = onProperty;
        verbLabel = entry['fandaws:verbLabel'] || null;
      } else {
        continue;
      }

      // Only declare local verb IRIs. BFO/CCO/etc. are defined elsewhere.
      if (!verbIri.startsWith('fandaws:objectProperty/')) continue;

      // Derive a fallback label from the IRI tail if none was stored.
      if (!verbLabel) {
        const tail = verbIri.slice('fandaws:objectProperty/'.length);
        verbLabel = tail.replace(/-/g, ' ');
      }

      if (!verbs.has(verbIri)) {
        verbs.set(verbIri, verbLabel);
      }
    }
  }

  const declarations = [];
  for (const verbIri of [...verbs.keys()].sort()) {
    const expanded = expandIri(verbIri);
    declarations.push(tripleUri(expanded, RDF_TYPE, expandIri('owl:ObjectProperty')));
    declarations.push(tripleLiteral(expanded, expandIri('rdfs:label'), verbs.get(verbIri)));
  }
  return declarations;
}

// ── Main Extraction ──

/**
 * Extract all RDF triples from a KnowledgeGraph.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @returns {Array<{subject: string, predicate: string, object: string, objectType: 'uri'|'literal', datatype?: string}>}
 */
export function extractTriples(graph, options = {}) {
  if (!graph || !graph['fandaws:concepts']) return [];

  const concepts = graph['fandaws:concepts'] || [];
  const sorted = [...concepts].sort((a, b) =>
    (a['@id'] || '').localeCompare(b['@id'] || ''),
  );

  const allTriples = [];

  // Declare every local verb IRI used by a property restriction as a bare
  // owl:ObjectProperty (Tier 1 — Human Frame). See
  // architect-to-dev-communication-2026-04-07.md §3 (Progressive Formalization)
  // and Ontology Ingestion Spec v1.4 §11.1.
  //
  // Only `fandaws:property/*` IRIs are declared here. BFO/CCO object properties
  // are defined by their source ontologies and resolved via owl:imports — they
  // are silently skipped to avoid duplicate definitions.
  const verbDeclarations = emitVerbPropertyDeclarations(concepts);
  allTriples.push(...verbDeclarations);

  // Declare fandaws:algorithmicDefinition as an annotation property
  // sub-property of skos:definition, if any concepts have one
  const hasDefinitions = concepts.some((c) => c['fandaws:algorithmicDefinition']);
  if (hasDefinitions) {
    const defIri = expandIri('fandaws:algorithmicDefinition');
    allTriples.push(tripleUri(defIri, RDF_TYPE, expandIri('owl:AnnotationProperty')));
    allTriples.push(tripleLiteral(defIri, expandIri('rdfs:label'), 'algorithmic definition'));
    allTriples.push(tripleUri(defIri, expandIri('rdfs:subPropertyOf'), expandIri('skos:definition')));
  }

  // owl:imports declaration (Section 9.2)
  // If the graph contains any imported concepts, declare the graph as an
  // owl:Ontology and emit owl:imports for each unique source ontology IRI.
  const importedConcepts = concepts.filter((c) => c['fandaws:isImported']);
  if (importedConcepts.length > 0) {
    const graphId = graph['@id'];
    if (graphId) {
      const graphIri = expandIri(graphId);
      allTriples.push(tripleUri(graphIri, RDF_TYPE, expandIri('owl:Ontology')));
      const sources = new Set();
      for (const c of importedConcepts) {
        const ingest = c['fandaws:ingestSource'];
        const src = ingest && ingest['fandaws:sourceOntology'];
        if (src) sources.add(src);
      }
      for (const src of [...sources].sort()) {
        allTriples.push(tripleUri(graphIri, expandIri('owl:imports'), expandIri(src)));
      }
    }
  }

  for (const concept of sorted) {
    const expanded = expandIri(concept['@id']);
    const conceptTriples = extractConceptTriples(concept, expanded, options);
    allTriples.push(...conceptTriples);
  }

  return allTriples;
}
