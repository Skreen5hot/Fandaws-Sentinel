/**
 * Concept — the fundamental unit of knowledge in Fandaws.
 *
 * Represents a named entity with a position in a classification hierarchy,
 * a set of properties, and relationships to other concepts.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.1, Appendix A.2
 */

/**
 * Create a new Concept node.
 *
 * @param {object} params
 * @param {string} params.id - Unique concept IRI (e.g., "fandaws:concept/dog")
 * @param {string} params.displayLabel - Original display name
 * @param {string} params.canonicalLabel - Normalized form for matching
 * @param {string|null} [params.parent] - Parent concept IRI (null for roots)
 * @param {string[]} [params.children] - Child concept IRIs
 * @param {string[]} [params.properties] - Property IRIs
 * @param {object[]} [params.relationships] - Relationship objects
 * @param {string} [params.description] - Auto-generated definition
 * @param {string|null} [params.bfoMapping] - BFO category IRI
 * @param {number} [params.depth] - Depth in hierarchy (root = 0)
 * @returns {object} JSON-LD Concept node
 */
export function createConcept({
  id,
  displayLabel,
  canonicalLabel,
  parent = null,
  children = [],
  properties = [],
  relationships = [],
  description = '',
  bfoMapping = null,
  depth = 0,
}) {
  return {
    '@id': id,
    '@type': 'fandaws:Concept',
    'fandaws:displayLabel': displayLabel,
    'fandaws:canonicalLabel': canonicalLabel,
    'fandaws:parent': parent,
    'fandaws:children': children,
    'fandaws:properties': properties,
    'fandaws:relationships': relationships,
    'fandaws:description': description,
    'fandaws:bfoMapping': bfoMapping,
    'fandaws:createdAt': new Date().toISOString(),
    'fandaws:depth': depth,
    'fandaws:mergedFrom': [],
  };
}
