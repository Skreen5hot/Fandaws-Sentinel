/**
 * DescriptionEngine — stub implementation for auto-generated concept descriptions.
 *
 * Produces simple template-based descriptions from concept + graph context.
 * Real implementation with inherited properties and rich templates deferred to Phase 7.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.5
 */

/**
 * Generate a human-readable description for a concept.
 *
 * @param {object} concept - JSON-LD Concept node
 * @param {object} graph - JSON-LD KnowledgeGraph containing the concept
 * @returns {string} Generated description
 */
export function describeConcept(concept, graph) {
  const displayLabel = concept['fandaws:displayLabel'] || '?';
  const parentIri = concept['fandaws:parent'];

  // Root concept (no parent)
  if (!parentIri) {
    return `${displayLabel} is a root concept.`;
  }

  // Find parent in graph
  const concepts = graph['fandaws:concepts'] || [];
  const parent = concepts.find((c) => c['@id'] === parentIri);

  if (!parent) {
    return `${displayLabel} is a concept.`;
  }

  const parentLabel = parent['fandaws:displayLabel'] || parentIri;
  return `${displayLabel} is a ${parentLabel}.`;
}
