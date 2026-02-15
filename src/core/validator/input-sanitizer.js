/**
 * Input Sanitizer — pre-validation checks on proposed mutations.
 *
 * Detects compound statements (multiple unrelated concepts),
 * verifies structural grounding, and normalizes confirmation responses.
 *
 * Pure functions — no side effects, no StateAdapter calls.
 *
 * v2.1: Uses isConceptNode/isRestrictionNode, skos:broader, rdfs:subClassOf.
 *
 * @see Fandaws_v3.3_Specification.md Section 6.1
 */

import { isConceptNode, isRestrictionNode } from '../../types/type-checks.js';

/**
 * Check whether a mutation attempts to add multiple unrelated concepts
 * (a compound statement). A mutation is allowed to add multiple concepts
 * only if they form a single IS_A chain (parent→child).
 *
 * @param {object} mutation - GraphMutation JSON-LD node
 * @returns {object|null} Violation object or null if acceptable
 */
export function checkCompoundStatement(mutation) {
  const additions = mutation['fandaws:additions'] || [];
  const concepts = additions.filter((node) => isConceptNode(node));

  if (concepts.length <= 1) return null;

  // Check if concepts form a single IS_A chain.
  // Build a set of concept IRIs in this mutation.
  const iriSet = new Set(concepts.map((c) => c['@id']));

  // For each concept, check if its parent is another concept in the same batch.
  // A valid chain: every concept except one (the root of the chain) has its
  // parent in the batch, and every concept except one (the leaf) is a parent.
  const childToParent = new Map();
  for (const concept of concepts) {
    const parent = concept['skos:broader'];
    if (parent && iriSet.has(parent)) {
      childToParent.set(concept['@id'], parent);
    }
  }

  // In a single chain of N concepts, there are N-1 parent links within the batch.
  if (childToParent.size === concepts.length - 1) {
    // Verify it's a single connected chain (not a forest with matching count).
    const parentSet = new Set(childToParent.values());
    const childSet = new Set(childToParent.keys());
    // The root is the concept that is a parent but not a child within the batch.
    const roots = [...parentSet].filter((p) => !childSet.has(p));
    // Also include concepts that are neither parent nor child within batch links.
    const chainRoots = concepts.filter(
      (c) => !childSet.has(c['@id']) && !parentSet.has(c['@id']),
    );
    // If there's exactly one concept that has no in-batch parent, it's a single chain.
    const topNodes = concepts.filter((c) => !childSet.has(c['@id']));
    if (topNodes.length === 1) return null;
  }

  return {
    reason: 'compoundStatement',
    message: `Mutation adds ${concepts.length} unrelated concepts. Break into separate statements.`,
    conceptIris: concepts.map((c) => c['@id']),
  };
}

/**
 * Check whether a concept is structurally grounded.
 *
 * A concept is grounded if ANY of:
 *   (a) skos:broader points to a concept in the graph or mutation additions
 *   (b) Concept already exists in the graph with a parent
 *   (c) fandaws:allowRoot === true on the concept
 *   (d) Concept has properties (in graph rdfs:subClassOf restrictions or mutation additions)
 *
 * @param {object} concept - Concept JSON-LD node being added
 * @param {object} graph - Current KnowledgeGraph JSON-LD
 * @param {object} mutation - The mutation containing this concept
 * @returns {object|null} Violation object or null if grounded
 */
export function checkStructuralGrounding(concept, graph, mutation) {
  const conceptIri = concept['@id'];
  const graphConcepts = graph['fandaws:concepts'] || [];
  const additions = mutation['fandaws:additions'] || [];

  // (c) allowRoot flag
  if (concept['fandaws:allowRoot'] === true) return null;

  // (a) Parent points to a concept in graph or mutation additions
  const parentIri = concept['skos:broader'];
  if (parentIri) {
    const inGraph = graphConcepts.some((c) => c['@id'] === parentIri);
    const inAdditions = additions.some(
      (node) => isConceptNode(node) && node['@id'] === parentIri,
    );
    if (inGraph || inAdditions) return null;
  }

  // (b) Concept already exists in graph with a parent
  const existing = graphConcepts.find((c) => c['@id'] === conceptIri);
  if (existing && existing['skos:broader']) return null;

  // (d) Concept has properties in graph (owl:Restriction entries in rdfs:subClassOf) or mutation additions
  const graphRestrictions = existing
    ? (existing['rdfs:subClassOf'] || []).filter((n) => isRestrictionNode(n))
    : [];
  if (graphRestrictions.length > 0) return null;

  const addedProperties = additions.filter(
    (node) =>
      isRestrictionNode(node) &&
      node['fandaws:attachedTo'] === conceptIri,
  );
  if (addedProperties.length > 0) return null;

  return {
    reason: 'structuralGroundingError',
    message: `Concept "${conceptIri}" has no parent, no allowRoot flag, and no properties. It is structurally ungrounded.`,
    conceptIri,
  };
}

/**
 * Validate a user confirmation response (yes/no).
 *
 * @param {string} response - User input string
 * @returns {{ accepted: boolean, value: string|null }} Normalized result
 */
export function validateConfirmationResponse(response) {
  if (typeof response !== 'string') {
    return { accepted: false, value: null };
  }

  const normalized = response.trim().toLowerCase();

  if (normalized === 'yes' || normalized === 'y') {
    return { accepted: true, value: 'yes' };
  }

  if (normalized === 'no' || normalized === 'n') {
    return { accepted: true, value: 'no' };
  }

  return { accepted: false, value: null };
}
