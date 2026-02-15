/**
 * Type Check Helpers — runtime type discrimination for v2.1 JSON-LD nodes.
 *
 * With dual typing (e.g., @type: ['owl:Class', 'skos:Concept']),
 * simple equality checks no longer work. These helpers handle both
 * array and string @type values.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

/**
 * Check whether a node is a Concept (dual-typed as owl:Class + skos:Concept).
 *
 * @param {object} node - JSON-LD node
 * @returns {boolean}
 */
export function isConceptNode(node) {
  const t = node?.['@type'];
  if (Array.isArray(t)) return t.includes('skos:Concept');
  return t === 'skos:Concept';
}

/**
 * Check whether a node is an owl:Restriction (property or relationship).
 *
 * @param {object} node - JSON-LD node
 * @returns {boolean}
 */
export function isRestrictionNode(node) {
  return node?.['@type'] === 'owl:Restriction';
}
