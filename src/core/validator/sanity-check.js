/**
 * Sanity Check — cycle detection for concept hierarchies.
 *
 * Implements CVS-005: prevents circular IS_A relationships.
 * Pure functions — builds its own parent index from the graph.
 *
 * @see Fandaws_v3.3_Specification.md Section 6.2 (CVS-005)
 */

/**
 * Build a parent index from a KnowledgeGraph.
 * Maps each concept IRI to its parent IRI (or null for roots).
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @returns {Map<string, string|null>} IRI → parent IRI
 */
export function buildParentIndex(graph) {
  const index = new Map();
  const concepts = graph['fandaws:concepts'] || [];
  for (const concept of concepts) {
    index.set(concept['@id'], concept['fandaws:parent'] || null);
  }
  return index;
}

/**
 * Detect whether assigning `parentIri` as the parent of `childIri`
 * would create a cycle in the hierarchy.
 *
 * Walks upward from `parentIri` through the parent index. If `childIri`
 * is encountered, a cycle exists.
 *
 * @param {string} childIri - The concept that would gain a new parent
 * @param {string} parentIri - The proposed parent
 * @param {Map<string, string|null>} parentIndex - IRI → parent IRI
 * @returns {object|null} Violation object or null if no cycle
 */
export function detectCycle(childIri, parentIri, parentIndex) {
  // Self-reference is always a cycle
  if (childIri === parentIri) {
    return {
      reason: 'circularHierarchy',
      message: `Concept "${childIri}" cannot be its own parent.`,
      conceptIri: childIri,
      proposedParentIri: parentIri,
    };
  }

  // Walk upward from parentIri
  const visited = new Set();
  let current = parentIri;

  while (current) {
    if (current === childIri) {
      return {
        reason: 'circularHierarchy',
        message: `Setting "${parentIri}" as parent of "${childIri}" creates a cycle.`,
        conceptIri: childIri,
        proposedParentIri: parentIri,
      };
    }

    // Guard against pre-existing corruption (cycles in the index itself)
    if (visited.has(current)) break;
    visited.add(current);

    current = parentIndex.get(current) || null;
  }

  return null;
}

/**
 * Check all parent-child edges in a mutation for cycles.
 *
 * Builds a composite parent index from the current graph state
 * plus mutation additions and modifications, then checks each
 * new or changed parent edge.
 *
 * @param {object} mutation - GraphMutation JSON-LD node
 * @param {object} graph - Current KnowledgeGraph JSON-LD
 * @returns {object[]} Array of violation objects (empty if no cycles)
 */
export function checkMutationForCycles(mutation, graph) {
  const violations = [];

  // Start with graph state
  const compositeIndex = buildParentIndex(graph);

  const additions = mutation['fandaws:additions'] || [];
  const modifications = mutation['fandaws:modifications'] || [];

  // Edges to check: new concepts with parents, and parent modifications
  const edgesToCheck = [];

  // Apply additions to the composite index
  for (const node of additions) {
    if (node['@type'] === 'fandaws:Concept') {
      const parent = node['fandaws:parent'] || null;
      compositeIndex.set(node['@id'], parent);
      if (parent) {
        edgesToCheck.push({ child: node['@id'], parent });
      }
    }
  }

  // Apply parent modifications to the composite index
  for (const mod of modifications) {
    const targetIri = mod['@id'] || mod['fandaws:target'];
    const newParent = mod['fandaws:parent'];
    if (targetIri && newParent !== undefined) {
      compositeIndex.set(targetIri, newParent);
      if (newParent) {
        edgesToCheck.push({ child: targetIri, parent: newParent });
      }
    }
  }

  // Check each new/changed edge against the composite index
  for (const edge of edgesToCheck) {
    const violation = detectCycle(edge.child, edge.parent, compositeIndex);
    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}
