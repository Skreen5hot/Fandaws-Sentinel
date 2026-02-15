/**
 * DescriptionEngine — auto-generated concept descriptions.
 *
 * Produces template-based descriptions from concept + graph context.
 * Includes property listing: "Dog is an Animal that has fur."
 *
 * v2.1: Uses rdfs:label and skos:broader instead of fandaws: fields.
 *       Properties read from owl:Restriction entries in rdfs:subClassOf.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

import { isRestrictionNode } from '../../types/type-checks.js';

/**
 * Extract property labels from a concept's rdfs:subClassOf array.
 *
 * @param {object} concept - JSON-LD Concept node
 * @returns {string[]} Property labels (owl:onProperty values)
 */
function extractPropertyLabels(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  const labels = [];

  for (const entry of subClassOf) {
    if (
      isRestrictionNode(entry) &&
      entry['fandaws:restrictionKind'] === 'property' &&
      entry['owl:onProperty']
    ) {
      labels.push(entry['owl:onProperty']);
    }
  }

  return labels;
}

/**
 * Format a list of property labels as an English list.
 * "fur" → "fur"
 * "fur", "legs" → "fur and legs"
 * "fur", "legs", "tail" → "fur, legs, and tail"
 *
 * @param {string[]} labels
 * @returns {string}
 */
function formatPropertyList(labels) {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1];
}

/**
 * Generate a human-readable description for a concept.
 *
 * @param {object} concept - JSON-LD Concept node
 * @param {object} graph - JSON-LD KnowledgeGraph containing the concept
 * @returns {string} Generated description
 */
export function describeConcept(concept, graph) {
  const displayLabel = concept['rdfs:label'] || '?';
  const parentIri = concept['skos:broader'];
  const propertyLabels = extractPropertyLabels(concept);
  const propertySuffix = propertyLabels.length > 0
    ? ` that has ${formatPropertyList(propertyLabels)}`
    : '';

  // Root concept (no parent)
  if (!parentIri) {
    if (propertySuffix) {
      return `${displayLabel} is a root concept${propertySuffix}.`;
    }
    return `${displayLabel} is a root concept.`;
  }

  // Find parent in graph
  const concepts = graph['fandaws:concepts'] || [];
  const parent = concepts.find((c) => c['@id'] === parentIri);

  if (!parent) {
    return `${displayLabel} is a concept${propertySuffix}.`;
  }

  const parentLabel = parent['rdfs:label'] || parentIri;
  return `${displayLabel} is a ${parentLabel}${propertySuffix}.`;
}
