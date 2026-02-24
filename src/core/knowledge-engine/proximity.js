/**
 * Proximity computation — bidirectional BFS between two IRIs.
 *
 * Used to determine whether a reclassification crosses distant branches
 * of the taxonomy (which warrants a confirmation prompt) or stays within
 * a close neighborhood (which can proceed silently).
 *
 * Root exclusion: roots (nodes with no skos:broader) are never traversed
 * as neighbors, preventing "everything is close via the root" false positives.
 *
 * @see docs/architecture/homonym-detection-duplicate-resolution-v1.3.md Section 4
 */

const MAX_DEPTH = 16;
const QUICK_MAX_HOPS = 4;

/**
 * Check whether an IRI represents a root concept (no skos:broader).
 *
 * @param {string} iri
 * @param {object} indices - { iriToParent, iriToChildren }
 * @returns {boolean}
 */
export function isRoot(iri, indices) {
  return !indices.iriToParent.get(iri);
}

/**
 * Get non-root neighbors of an IRI (parent + children), excluding roots.
 *
 * @param {string} iri
 * @param {object} indices
 * @returns {string[]}
 */
function getNeighbors(iri, indices) {
  const neighbors = [];

  // Parent (if non-root)
  const parent = indices.iriToParent.get(iri);
  if (parent != null && !isRoot(parent, indices)) {
    neighbors.push(parent);
  }

  // Children (if non-root)
  const children = indices.iriToChildren.get(iri);
  if (children) {
    for (const child of children) {
      if (!isRoot(child, indices)) {
        neighbors.push(child);
      }
    }
  }

  return neighbors;
}

/**
 * Compute the shortest path distance between two IRIs using bidirectional BFS.
 * Roots are excluded from traversal to prevent false proximity via shared root.
 *
 * @param {string|null|undefined} iriA - First IRI
 * @param {string|null|undefined} iriB - Second IRI
 * @param {object} indices - { iriToParent, iriToChildren }
 * @returns {{ steps: number, sharedAncestor: string|null }}
 */
export function computeProximity(iriA, iriB, indices) {
  // Guard: null/undefined inputs
  if (iriA == null || iriB == null) {
    return { steps: Infinity, sharedAncestor: null };
  }

  // Guard: identity
  if (iriA === iriB) {
    return { steps: 0, sharedAncestor: iriA };
  }

  // Bidirectional BFS
  // distA/distB: maps IRI → distance from start
  const distA = new Map([[iriA, 0]]);
  const distB = new Map([[iriB, 0]]);
  let frontierA = [iriA];
  let frontierB = [iriB];

  let bestSteps = Infinity;
  let bestAncestor = null;

  /**
   * Check if any node in one frontier's visited set overlaps with the other.
   * If so, the total distance is distA[node] + distB[node].
   */
  function checkMeeting() {
    // Check all nodes discovered by A against B's distances
    for (const [iri, dA] of distA) {
      if (distB.has(iri)) {
        const total = dA + distB.get(iri);
        if (total < bestSteps) {
          bestSteps = total;
          bestAncestor = iri;
        }
      }
    }
  }

  // Initial overlap check (in case iriA and iriB are neighbors)
  checkMeeting();
  if (bestSteps < Infinity) return { steps: bestSteps, sharedAncestor: bestAncestor };

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    // Expand side A
    if (frontierA.length > 0) {
      const nextFrontier = [];
      for (const node of frontierA) {
        for (const neighbor of getNeighbors(node, indices)) {
          if (!distA.has(neighbor)) {
            distA.set(neighbor, distA.get(node) + 1);
            nextFrontier.push(neighbor);
          }
        }
      }
      frontierA = nextFrontier;
    }

    // Check after expanding A
    checkMeeting();
    if (bestSteps < Infinity) return { steps: bestSteps, sharedAncestor: bestAncestor };

    // Expand side B
    if (frontierB.length > 0) {
      const nextFrontier = [];
      for (const node of frontierB) {
        for (const neighbor of getNeighbors(node, indices)) {
          if (!distB.has(neighbor)) {
            distB.set(neighbor, distB.get(node) + 1);
            nextFrontier.push(neighbor);
          }
        }
      }
      frontierB = nextFrontier;
    }

    // Check after expanding B
    checkMeeting();
    if (bestSteps < Infinity) return { steps: bestSteps, sharedAncestor: bestAncestor };

    // Both frontiers exhausted
    if (frontierA.length === 0 && frontierB.length === 0) break;
  }

  return { steps: bestSteps, sharedAncestor: bestAncestor };
}

/**
 * Quick short-circuit check: walk up from both IRIs (max 4 hops each)
 * looking for a shared non-root ancestor. Returns true if one is found.
 *
 * @param {string|null|undefined} iriA
 * @param {string|null|undefined} iriB
 * @param {object} indices
 * @returns {boolean}
 */
export function quickProximityCheck(iriA, iriB, indices) {
  if (iriA == null || iriB == null) return false;
  if (iriA === iriB) return true;

  // Collect ancestors of A (up to QUICK_MAX_HOPS), excluding roots
  const ancestorsA = new Set();
  let current = iriA;
  for (let i = 0; i < QUICK_MAX_HOPS; i++) {
    if (!isRoot(current, indices)) {
      ancestorsA.add(current);
    }
    const parent = indices.iriToParent.get(current);
    if (parent == null || isRoot(parent, indices)) break;
    current = parent;
    ancestorsA.add(current);
  }

  // Walk up from B, checking for overlap
  current = iriB;
  for (let i = 0; i < QUICK_MAX_HOPS; i++) {
    if (!isRoot(current, indices) && ancestorsA.has(current)) return true;
    const parent = indices.iriToParent.get(current);
    if (parent == null || isRoot(parent, indices)) break;
    current = parent;
    if (ancestorsA.has(current)) return true;
  }

  return false;
}
