/**
 * ConceptHydrator — translates between canonical OWL storage form and flat UI views.
 *
 * Canonical storage form uses standard vocabulary (skos:broader, rdfs:label, etc.)
 * and omits computed fields (depth, children). The hydrator computes these on demand.
 *
 * @see v2.1 Concept JSON-LD Specification — UI Hydration Layer
 */

import { isRestrictionNode } from '../../types/type-checks.js';

/**
 * Unwrap a JSON-LD language-tagged value to a bare string.
 *
 * External SPARQL/SKOS imports may deliver `{ '@value': 'dog', '@language': 'en' }`
 * instead of the bare string `'dog'`. This helper normalizes both forms.
 *
 * @param {*} val - Value to unwrap
 * @returns {*} Bare string if language-tagged, otherwise the original value
 */
function unwrapValue(val) {
  if (val != null && typeof val === 'object' && '@value' in val) {
    return val['@value'];
  }
  return val;
}

/**
 * Normalize a value that may be a scalar or array into an array.
 *
 * @param {*} val - Value to normalize
 * @returns {Array} Array (empty if null/undefined, wrapped if scalar)
 */
function normalizeArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Compute depth of a concept by walking the skos:broader chain.
 *
 * @param {string} conceptIri - Concept IRI to compute depth for
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @returns {number} Depth (root = 0)
 */
export function computeDepth(conceptIri, graph) {
  const concepts = graph['fandaws:concepts'] || [];
  const iriToBroader = new Map();
  for (const c of concepts) {
    iriToBroader.set(c['@id'], c['skos:broader'] || null);
  }

  let depth = 0;
  let current = iriToBroader.get(conceptIri) ?? null;
  const visited = new Set();

  while (current != null) {
    if (visited.has(current)) break; // cycle guard
    visited.add(current);
    depth++;
    current = iriToBroader.get(current) ?? null;
  }

  return depth;
}

/**
 * Compute direct children of a concept (concepts whose skos:broader points here).
 *
 * @param {string} conceptIri - Parent concept IRI
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @returns {string[]} Array of child concept IRIs
 */
export function computeChildren(conceptIri, graph) {
  const concepts = graph['fandaws:concepts'] || [];
  return concepts
    .filter((c) => c['skos:broader'] === conceptIri)
    .map((c) => c['@id']);
}

/**
 * Extract property restrictions from a concept's rdfs:subClassOf array.
 *
 * @param {object} concept - Concept JSON-LD node
 * @returns {object[]} Array of owl:Restriction nodes with restrictionKind='property'
 */
function extractProperties(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  return subClassOf.filter(
    (entry) => isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'property',
  );
}

/**
 * Extract relationship restrictions from a concept's rdfs:subClassOf array.
 *
 * @param {object} concept - Concept JSON-LD node
 * @returns {object[]} Array of owl:Restriction nodes with restrictionKind='relationship'
 */
function extractRelationships(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  return subClassOf.filter(
    (entry) => isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'relationship',
  );
}

/**
 * Hydrate a canonical concept into a flat ConceptView with computed fields.
 *
 * @param {object} concept - Canonical concept JSON-LD node
 * @param {object} graph - KnowledgeGraph JSON-LD containing the concept
 * @returns {object} ConceptView — flat object with all stored + computed fields
 */
export function hydrate(concept, graph) {
  const iri = concept['@id'];

  return {
    id: iri,
    type: concept['@type'],
    label: unwrapValue(concept['rdfs:label']),
    prefLabel: unwrapValue(concept['skos:prefLabel']),
    broader: concept['skos:broader'] || null,
    definition: unwrapValue(concept['skos:definition']) || '',
    created: concept['dcterms:created'],
    modified: concept['dcterms:modified'] || null,
    wasDerivedFrom: concept['prov:wasDerivedFrom'] || [],
    altLabel: normalizeArray(concept['skos:altLabel']),
    inScheme: concept['skos:inScheme'] || null,
    subClassOf: concept['rdfs:subClassOf'] || [],

    // Computed fields
    depth: computeDepth(iri, graph),
    children: computeChildren(iri, graph),
    properties: extractProperties(concept),
    relationships: extractRelationships(concept),
  };
}

/**
 * Dehydrate a ConceptView back into canonical storage form.
 *
 * Strips computed fields (depth, children, properties, relationships)
 * and maps flat aliases back to standard vocabulary keys.
 *
 * @param {object} view - ConceptView from hydrate()
 * @returns {object} Canonical concept JSON-LD node
 */
export function dehydrate(view) {
  return {
    '@id': view.id,
    '@type': view.type || ['owl:Class', 'skos:Concept'],
    'rdfs:label': view.label,
    'skos:prefLabel': view.prefLabel,
    'skos:broader': view.broader || null,
    'skos:definition': view.definition || '',
    'dcterms:created': view.created,
    'dcterms:modified': view.modified || null,
    'prov:wasDerivedFrom': view.wasDerivedFrom || [],
    'skos:altLabel': view.altLabel || [],
    'skos:inScheme': view.inScheme || null,
    'rdfs:subClassOf': view.subClassOf || [],
  };
}
