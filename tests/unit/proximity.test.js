/**
 * Proximity computation — unit tests.
 *
 * Tests bidirectional BFS between two IRIs with root exclusion,
 * plus the quickProximityCheck short-circuit.
 *
 * All test descriptions use the convention: computeProximity(parentA, parentB)
 * where parentA and parentB are the function's actual parameters (the parents
 * of the concepts being reclassified), not the concepts themselves.
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeProximity,
  quickProximityCheck,
  isRoot,
} from '../../src/core/knowledge-engine/proximity.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/**
 * Build mock indices from a flat list of { iri, parent } entries.
 * parent=null means root (no skos:broader).
 */
function makeIndices(concepts) {
  const iriToParent = new Map();
  const iriToChildren = new Map();
  for (const c of concepts) {
    iriToParent.set(c.iri, c.parent || null);
    if (!iriToChildren.has(c.iri)) iriToChildren.set(c.iri, new Set());
    if (c.parent) {
      if (!iriToChildren.has(c.parent)) iriToChildren.set(c.parent, new Set());
      iriToChildren.get(c.parent).add(c.iri);
    }
  }
  return { iriToParent, iriToChildren };
}

// ─────────────────────────────────────────────────────────
// PROX-01: Same IRI passed as both args
// ─────────────────────────────────────────────────────────

describe('PROX-01: Same IRI passed as both args', () => {
  it('returns steps=0 and sharedAncestor=self', () => {
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'A', parent: 'root' },
    ]);
    const result = computeProximity('A', 'A', indices);
    expect(result.steps).toBe(0);
    expect(result.sharedAncestor).toBe('A');
  });
});

// ─────────────────────────────────────────────────────────
// PROX-02: Two siblings under same non-root parent
// ─────────────────────────────────────────────────────────

describe('PROX-02: Siblings under same non-root parent', () => {
  it('returns steps=2 (A→G→B)', () => {
    // Tree: root → G → {A, B}
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'G', parent: 'root' },
      { iri: 'A', parent: 'G' },
      { iri: 'B', parent: 'G' },
    ]);
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(2);
    expect(result.sharedAncestor).toBe('G');
  });
});

// ─────────────────────────────────────────────────────────
// PROX-03: One is the child of the other
// ─────────────────────────────────────────────────────────

describe('PROX-03: Parent-child relationship', () => {
  it('returns steps=1 when B is child of A', () => {
    // Tree: root → A → B
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'A', parent: 'root' },
      { iri: 'B', parent: 'A' },
    ]);
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────
// PROX-04: Cousins — each 2 hops from shared grandparent
// ─────────────────────────────────────────────────────────

describe('PROX-04: Cousins via shared grandparent', () => {
  it('returns steps=4 (A→X→G→Y→B)', () => {
    // Tree: root → G → {X, Y}, X→A, Y→B
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'G', parent: 'root' },
      { iri: 'X', parent: 'G' },
      { iri: 'Y', parent: 'G' },
      { iri: 'A', parent: 'X' },
      { iri: 'B', parent: 'Y' },
    ]);
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(4);
    expect(result.sharedAncestor).toBe('G');
  });
});

// ─────────────────────────────────────────────────────────
// PROX-05: Deep branches, 6 hops apart via shared ancestor
// ─────────────────────────────────────────────────────────

describe('PROX-05: Deep branches, 6 hops apart', () => {
  it('returns steps=6', () => {
    // Tree: root → G → {P1, P2}
    // P1 → Q1 → A  (3 hops from G: A→Q1→P1→G)
    // P2 → Q2 → B  (3 hops from G: B→Q2→P2→G)
    // Total A→B = 6 hops
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'G', parent: 'root' },
      { iri: 'P1', parent: 'G' },
      { iri: 'Q1', parent: 'P1' },
      { iri: 'A', parent: 'Q1' },
      { iri: 'P2', parent: 'G' },
      { iri: 'Q2', parent: 'P2' },
      { iri: 'B', parent: 'Q2' },
    ]);
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(6);
    expect(result.sharedAncestor).toBe('G');
  });
});

// ─────────────────────────────────────────────────────────
// PROX-06: Two separate trees, no link
// ─────────────────────────────────────────────────────────

describe('PROX-06: Disconnected trees', () => {
  it('returns steps=Infinity when trees share no ancestor', () => {
    // Two separate trees: rootA → A, rootB → B
    const indices = makeIndices([
      { iri: 'rootA', parent: null },
      { iri: 'A', parent: 'rootA' },
      { iri: 'rootB', parent: null },
      { iri: 'B', parent: 'rootB' },
    ]);
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// PROX-07: Only path goes through a root
// ─────────────────────────────────────────────────────────

describe('PROX-07: Path only through root', () => {
  it('returns steps=Infinity (root excluded from traversal)', () => {
    // Tree: root → {A, B} — siblings under a root
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'A', parent: 'root' },
      { iri: 'B', parent: 'root' },
    ]);
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// PROX-08: Both root and non-root paths exist
// ─────────────────────────────────────────────────────────

describe('PROX-08: Root path and non-root path both exist', () => {
  it('returns the non-root path (shorter)', () => {
    // root → {G, X}
    // G → {A, B}          (non-root path: A→G→B = 2 steps)
    // X → A (X is also parent of A, but root→X is root path)
    // A has two parents conceptually, but iriToParent is single-parent.
    // Use topology: root → G → {A, B}, root → X → A is not possible
    // with single-parent.
    // Instead: root → {M, N}, M → G → A, N → G also has child B?
    // Simpler: root → G → {A, B}. Also root → A. But single-parent means
    // A can only have one parent. Use this:
    // root → K → G → {A, B}  — non-root path A→G→B = 2
    // K is non-root, so path through K would be A→G→K but that doesn't help.
    // Best: A is under G (non-root), B is under G. Also B→root.
    // With single parent: B.parent = G, so that works.
    // The point: A and B are both under non-root G → 2 steps.
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'G', parent: 'root' },
      { iri: 'A', parent: 'G' },
      { iri: 'B', parent: 'G' },
    ]);
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(2);
    expect(result.sharedAncestor).toBe('G');
  });
});

// ─────────────────────────────────────────────────────────
// PROX-09: Path exceeds MAX_DEPTH (16)
// ─────────────────────────────────────────────────────────

describe('PROX-09: Path exceeds MAX_DEPTH', () => {
  it('returns Infinity when shortest path > 32 hops', () => {
    // Each iteration expands both sides, so 16 iterations covers 16 hops per side (32 total).
    // Build chains of 17 from shared ancestor G on each side → 34 hops total.
    const concepts = [{ iri: 'root', parent: null }, { iri: 'G', parent: 'root' }];
    let prev = 'G';
    for (let i = 0; i < 17; i++) {
      const n = `L${i}`;
      concepts.push({ iri: n, parent: prev });
      prev = n;
    }
    concepts.push({ iri: 'A', parent: prev });

    prev = 'G';
    for (let i = 0; i < 17; i++) {
      const n = `R${i}`;
      concepts.push({ iri: n, parent: prev });
      prev = n;
    }
    concepts.push({ iri: 'B', parent: prev });

    const indices = makeIndices(concepts);
    // Path: A → L16 → ... → L0 → G → R0 → ... → R16 → B = 36 hops
    const result = computeProximity('A', 'B', indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// PROX-10: Null inputs
// ─────────────────────────────────────────────────────────

describe('PROX-10: Null/undefined inputs', () => {
  it('returns Infinity when first arg is null', () => {
    const indices = makeIndices([{ iri: 'A', parent: null }]);
    const result = computeProximity(null, 'A', indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });

  it('returns Infinity when second arg is null', () => {
    const indices = makeIndices([{ iri: 'A', parent: null }]);
    const result = computeProximity('A', null, indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });

  it('returns Infinity when both args are null', () => {
    const indices = makeIndices([]);
    const result = computeProximity(null, null, indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });

  it('returns Infinity when first arg is undefined', () => {
    const indices = makeIndices([{ iri: 'A', parent: null }]);
    const result = computeProximity(undefined, 'A', indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// PROX-11: quickProximityCheck — close siblings
// ─────────────────────────────────────────────────────────

describe('PROX-11: quickProximityCheck true (close siblings)', () => {
  it('returns true for siblings under same non-root grandparent', () => {
    // root → G → {X, Y}, X → A, Y → B
    // A and B share grandparent G within 4 hops each
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'G', parent: 'root' },
      { iri: 'X', parent: 'G' },
      { iri: 'Y', parent: 'G' },
      { iri: 'A', parent: 'X' },
      { iri: 'B', parent: 'Y' },
    ]);
    expect(quickProximityCheck('A', 'B', indices)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// PROX-12: quickProximityCheck — disconnected
// ─────────────────────────────────────────────────────────

describe('PROX-12: quickProximityCheck false (disconnected)', () => {
  it('returns false for disconnected trees', () => {
    const indices = makeIndices([
      { iri: 'rootA', parent: null },
      { iri: 'A', parent: 'rootA' },
      { iri: 'rootB', parent: null },
      { iri: 'B', parent: 'rootB' },
    ]);
    expect(quickProximityCheck('A', 'B', indices)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// PROX-13: Same root IRI as both args
// ─────────────────────────────────────────────────────────

describe('PROX-13: Same root IRI as both args', () => {
  it('returns steps=0 (identity short-circuit)', () => {
    const indices = makeIndices([{ iri: 'root', parent: null }]);
    const result = computeProximity('root', 'root', indices);
    expect(result.steps).toBe(0);
    expect(result.sharedAncestor).toBe('root');
  });
});

// ─────────────────────────────────────────────────────────
// PROX-14: Linear chain — verify step counts at multiple pairs
// ─────────────────────────────────────────────────────────

describe('PROX-14: Linear chain step counts', () => {
  // Chain: root → N0 → N1 → N2 → ... → N7
  const concepts = [{ iri: 'root', parent: null }];
  let prev = 'root';
  for (let i = 0; i < 8; i++) {
    concepts.push({ iri: `N${i}`, parent: prev });
    prev = `N${i}`;
  }
  const indices = makeIndices(concepts);

  it('adjacent nodes: steps=1', () => {
    const result = computeProximity('N2', 'N3', indices);
    expect(result.steps).toBe(1);
  });

  it('two apart: steps=2', () => {
    const result = computeProximity('N2', 'N4', indices);
    expect(result.steps).toBe(2);
  });

  it('five apart: steps=5', () => {
    const result = computeProximity('N1', 'N6', indices);
    expect(result.steps).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────
// PROX-15: Two root nodes
// ─────────────────────────────────────────────────────────

describe('PROX-15: Two distinct root nodes', () => {
  it('returns Infinity (roots are never traversed as neighbors)', () => {
    const indices = makeIndices([
      { iri: 'rootA', parent: null },
      { iri: 'rootB', parent: null },
    ]);
    const result = computeProximity('rootA', 'rootB', indices);
    expect(result.steps).toBe(Infinity);
    expect(result.sharedAncestor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// isRoot helper
// ─────────────────────────────────────────────────────────

describe('isRoot helper', () => {
  it('returns true for a node with null parent', () => {
    const indices = makeIndices([{ iri: 'root', parent: null }]);
    expect(isRoot('root', indices)).toBe(true);
  });

  it('returns false for a node with a parent', () => {
    const indices = makeIndices([
      { iri: 'root', parent: null },
      { iri: 'A', parent: 'root' },
    ]);
    expect(isRoot('A', indices)).toBe(false);
  });

  it('returns true for an unknown IRI (not in index)', () => {
    const indices = makeIndices([]);
    expect(isRoot('unknown', indices)).toBe(true);
  });
});
