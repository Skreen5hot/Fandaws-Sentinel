/**
 * Termidium — unit tests.
 *
 * Covers: computeDepth, countAssertions, decideMergeWinner, findDuplicates
 * (merge policy, recursive merge, large merge threshold, depth bound).
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeDepth,
  countAssertions,
  decideMergeWinner,
  findDuplicates,
} from '../../src/core/validator/termidium.js';
import { createConcept } from '../../src/types/concept.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';

// ── Helpers ──

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeConcept(id, label, broader = null, restrictions = [], createdAt = null) {
  const c = createConcept({ id, label, prefLabel: label, broader });
  c['rdfs:subClassOf'] = restrictions;
  if (createdAt) c['dcterms:created'] = createdAt;
  return c;
}

function makeRel(id, verb, subject, object) {
  return createRelationship({ id, verbIri: verb, subject, object });
}

function makeProp(id, propLabel, attachedTo) {
  return {
    '@id': id,
    '@type': 'owl:Restriction',
    'fandaws:restrictionKind': 'property',
    'owl:onProperty': propLabel,
    'fandaws:attachedTo': attachedTo,
  };
}

function makeIndices(concepts) {
  const iriToParent = new Map();
  const iriToChildren = new Map();
  for (const c of concepts) {
    iriToParent.set(c['@id'], c['skos:broader'] || null);
    const parent = c['skos:broader'];
    if (parent) {
      if (!iriToChildren.has(parent)) iriToChildren.set(parent, new Set());
      iriToChildren.get(parent).add(c['@id']);
    }
  }
  return {
    canonicalLabelToIri: new Map(concepts.map((c) => [c['skos:prefLabel'], c['@id']])),
    iriToParent,
    iriToChildren,
    iriToProperties: new Map(),
    iriToReverseRelationships: new Map(),
  };
}

// ── computeDepth ──

describe('computeDepth', () => {
  it('returns 0 for root concept', () => {
    const iriToParent = new Map([['a', null]]);
    expect(computeDepth('a', iriToParent)).toBe(0);
  });

  it('returns correct depth for nested concept', () => {
    const iriToParent = new Map([
      ['a', null],
      ['b', 'a'],
      ['c', 'b'],
    ]);
    expect(computeDepth('c', iriToParent)).toBe(2);
  });

  it('returns 0 for unknown concept', () => {
    const iriToParent = new Map();
    expect(computeDepth('unknown', iriToParent)).toBe(0);
  });
});

// ── countAssertions ──

describe('countAssertions', () => {
  it('counts children, properties, and relationships', () => {
    const rel = makeRel('r1', 'chase', 'fandaws:concept/dog', 'fandaws:concept/cat');
    const prop = makeProp('p1', 'fur', 'fandaws:concept/dog');
    const dog = makeConcept('fandaws:concept/dog', 'dog', null, [rel, prop]);
    const puppy = makeConcept('fandaws:concept/puppy', 'puppy', 'fandaws:concept/dog');
    const cat = makeConcept('fandaws:concept/cat', 'cat');
    const graph = makeGraph([dog, puppy, cat]);
    const indices = makeIndices([dog, puppy, cat]);

    // 1 child (puppy) + 1 property + 1 relationship = 3
    expect(countAssertions('fandaws:concept/dog', graph, indices)).toBe(3);
  });

  it('returns 0 for concept with no assertions', () => {
    const cat = makeConcept('fandaws:concept/cat', 'cat');
    const graph = makeGraph([cat]);
    const indices = makeIndices([cat]);
    expect(countAssertions('fandaws:concept/cat', graph, indices)).toBe(0);
  });
});

// ── decideMergeWinner ──

describe('decideMergeWinner', () => {
  it('deeper concept wins (tier 1)', () => {
    const animal = makeConcept('fandaws:concept/animal', 'animal');
    const dog1 = makeConcept('fandaws:concept/dog-1', 'dog', 'fandaws:concept/animal');
    const dog2 = makeConcept('fandaws:concept/dog-2', 'dog'); // root = depth 0
    const graph = makeGraph([animal, dog1, dog2]);
    const indices = makeIndices([animal, dog1, dog2]);

    const result = decideMergeWinner('fandaws:concept/dog-1', 'fandaws:concept/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:concept/dog-1');
    expect(result.loser).toBe('fandaws:concept/dog-2');
  });

  it('earlier createdAt wins at same depth (tier 2)', () => {
    const dog1 = makeConcept('fandaws:concept/dog-1', 'dog', null, [], '2026-01-01T00:00:00Z');
    const dog2 = makeConcept('fandaws:concept/dog-2', 'dog', null, [], '2026-02-01T00:00:00Z');
    const graph = makeGraph([dog1, dog2]);
    const indices = makeIndices([dog1, dog2]);

    const result = decideMergeWinner('fandaws:concept/dog-1', 'fandaws:concept/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:concept/dog-1');
    expect(result.loser).toBe('fandaws:concept/dog-2');
  });

  it('more assertions wins at same depth+time (tier 3)', () => {
    const dog1 = makeConcept('fandaws:concept/dog-1', 'dog', null, [
      makeProp('p1', 'fur', 'fandaws:concept/dog-1'),
    ]);
    const dog2 = makeConcept('fandaws:concept/dog-2', 'dog');
    const graph = makeGraph([dog1, dog2]);
    const indices = makeIndices([dog1, dog2]);

    const result = decideMergeWinner('fandaws:concept/dog-1', 'fandaws:concept/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:concept/dog-1');
    expect(result.loser).toBe('fandaws:concept/dog-2');
  });

  it('order parameter A wins when equal', () => {
    const dog1 = makeConcept('fandaws:concept/dog-1', 'dog');
    const dog2 = makeConcept('fandaws:concept/dog-2', 'dog');
    const graph = makeGraph([dog1, dog2]);
    const indices = makeIndices([dog1, dog2]);

    const result = decideMergeWinner('fandaws:concept/dog-1', 'fandaws:concept/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:concept/dog-1');
  });
});

// ── findDuplicates ──

describe('findDuplicates', () => {
  it('finds duplicate with matching canonical label in neighborhood', () => {
    const animal = makeConcept('fandaws:concept/animal', 'animal');
    const dog1 = makeConcept('fandaws:concept/dog-1', 'dog', 'fandaws:concept/animal');
    const dog2 = makeConcept('fandaws:concept/dog-2', 'dog', 'fandaws:concept/animal');
    const graph = makeGraph([animal, dog1, dog2]);
    const indices = makeIndices([animal, dog1, dog2]);

    const result = findDuplicates('fandaws:concept/dog-1', graph, indices);
    expect(result.merges).toHaveLength(1);
    expect(result.merges[0]['fandaws:target']).toBeDefined();
    expect(result.merges[0]['fandaws:source']).toBeDefined();
  });

  it('returns empty when no duplicate found', () => {
    const dog = makeConcept('fandaws:concept/dog', 'dog');
    const cat = makeConcept('fandaws:concept/cat', 'cat');
    const graph = makeGraph([dog, cat]);
    const indices = makeIndices([dog, cat]);

    const result = findDuplicates('fandaws:concept/dog', graph, indices);
    expect(result.merges).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
  });

  it('returns empty for unknown concept IRI', () => {
    const graph = makeGraph([]);
    const indices = makeIndices([]);

    const result = findDuplicates('fandaws:concept/unknown', graph, indices);
    expect(result.merges).toHaveLength(0);
    expect(result.scanned).toBe(0);
  });

  it('respects deduplicationDepth bound', () => {
    // Create a chain: root → a → b → c → d → dup_root
    // dup_root has same label as root, but is 5 levels away
    const root = makeConcept('fandaws:concept/root', 'target');
    const a = makeConcept('fandaws:concept/a', 'a', 'fandaws:concept/root');
    const b = makeConcept('fandaws:concept/b', 'b', 'fandaws:concept/a');
    const c = makeConcept('fandaws:concept/c', 'c', 'fandaws:concept/b');
    const d = makeConcept('fandaws:concept/d', 'd', 'fandaws:concept/c');
    const dup = makeConcept('fandaws:concept/dup', 'target', 'fandaws:concept/d');
    const graph = makeGraph([root, a, b, c, d, dup]);
    const indices = makeIndices([root, a, b, c, d, dup]);

    // With depth 3, dup is 5 levels away — should NOT be found
    const result = findDuplicates('fandaws:concept/root', graph, indices, { deduplicationDepth: 3 });
    expect(result.merges).toHaveLength(0);

    // With depth 8 (default), dup IS found
    const result2 = findDuplicates('fandaws:concept/root', graph, indices);
    expect(result2.merges).toHaveLength(1);
  });

  it('triggers prompt for large merge (exceeds threshold)', () => {
    // Create loser with many children
    const animal = makeConcept('fandaws:concept/animal', 'animal');
    const dog1 = makeConcept('fandaws:concept/dog-1', 'dog', 'fandaws:concept/animal');
    const dog2 = makeConcept('fandaws:concept/dog-2', 'dog', 'fandaws:concept/animal');
    // Give dog2 many children so it triggers threshold
    const childA = makeConcept('fandaws:concept/a', 'a', 'fandaws:concept/dog-2');
    const childB = makeConcept('fandaws:concept/b', 'b', 'fandaws:concept/dog-2');
    const childC = makeConcept('fandaws:concept/c', 'c', 'fandaws:concept/dog-2');
    const graph = makeGraph([animal, dog1, dog2, childA, childB, childC]);
    const indices = makeIndices([animal, dog1, dog2, childA, childB, childC]);

    // dog1 is deeper (depth 1), dog2 is also depth 1 — need to check who wins
    // Since dog2 has 3 children (more assertions), dog2 wins, dog1 is loser
    // dog1 has 0 children, so no threshold hit
    // Let's swap: make dog1 the one with children
    const result = findDuplicates('fandaws:concept/dog-2', graph, indices, { mergeReviewThreshold: 1 });
    // The loser might have children — if loser is dog1 (0 children), threshold won't trigger
    // If loser is dog2 (3 children), threshold triggers
    // dog1: depth 1, dog2: depth 1, same parent. dog2 has more assertions (3 children)
    // So dog2 wins, dog1 is loser. dog1 has 0 children. No threshold trigger.
    // To trigger threshold, the loser needs > threshold children
    // Actually let me just check both cases
    if (result.merges.length === 1) {
      // loser had <= threshold children
      expect(result.prompts).toHaveLength(0);
    }

    // Now test with dog1 having the children and a low threshold
    const dog1WithKids = makeConcept('fandaws:concept/dog-1', 'dog', 'fandaws:concept/animal', [], '2026-01-01T00:00:00Z');
    const dog2Bare = makeConcept('fandaws:concept/dog-2', 'dog', 'fandaws:concept/animal', [], '2026-02-01T00:00:00Z');
    const k1 = makeConcept('fandaws:concept/k1', 'k1', 'fandaws:concept/dog-1');
    const k2 = makeConcept('fandaws:concept/k2', 'k2', 'fandaws:concept/dog-1');
    const k3 = makeConcept('fandaws:concept/k3', 'k3', 'fandaws:concept/dog-1');
    const graph2 = makeGraph([animal, dog1WithKids, dog2Bare, k1, k2, k3]);
    const indices2 = makeIndices([animal, dog1WithKids, dog2Bare, k1, k2, k3]);
    // dog1 wins (earlier createdAt), dog2 is loser, dog2 has 0 children — no threshold
    // We need loser to have many children. dog1 earlier → dog1 wins, dog2 loser, 0 children
    // Flip: make dog2 earlier
    const dog1Late = makeConcept('fandaws:concept/dog-1', 'dog', 'fandaws:concept/animal', [], '2026-03-01T00:00:00Z');
    const dog2Early = makeConcept('fandaws:concept/dog-2', 'dog', 'fandaws:concept/animal', [], '2026-01-01T00:00:00Z');
    const ch1 = makeConcept('fandaws:concept/ch1', 'ch1', 'fandaws:concept/dog-1');
    const ch2 = makeConcept('fandaws:concept/ch2', 'ch2', 'fandaws:concept/dog-1');
    const ch3 = makeConcept('fandaws:concept/ch3', 'ch3', 'fandaws:concept/dog-1');
    const graph3 = makeGraph([animal, dog1Late, dog2Early, ch1, ch2, ch3]);
    const indices3 = makeIndices([animal, dog1Late, dog2Early, ch1, ch2, ch3]);
    // dog2 wins (earlier), dog1 is loser, dog1 has 3 children
    const result3 = findDuplicates('fandaws:concept/dog-2', graph3, indices3, { mergeReviewThreshold: 1 });
    expect(result3.prompts).toHaveLength(1);
    expect(result3.prompts[0]['fandaws:promptType']).toBe('confirmation');
    expect(result3.merges).toHaveLength(0); // prompt replaces merge
  });

  it('reports scanned count', () => {
    const animal = makeConcept('fandaws:concept/animal', 'animal');
    const dog = makeConcept('fandaws:concept/dog', 'dog', 'fandaws:concept/animal');
    const graph = makeGraph([animal, dog]);
    const indices = makeIndices([animal, dog]);

    const result = findDuplicates('fandaws:concept/dog', graph, indices);
    expect(result.scanned).toBeGreaterThan(0);
  });

  it('deeper duplicate wins merge', () => {
    // Both under same parent so they share a neighborhood
    const animal = makeConcept('fandaws:concept/animal', 'animal');
    const dog1 = makeConcept('fandaws:concept/dog-1', 'dog', 'fandaws:concept/animal'); // depth 1
    const mammal = makeConcept('fandaws:concept/mammal', 'mammal', 'fandaws:concept/animal');
    const dog2 = makeConcept('fandaws:concept/dog-2', 'dog', 'fandaws:concept/mammal'); // depth 2
    const graph = makeGraph([animal, dog1, mammal, dog2]);
    const indices = makeIndices([animal, dog1, mammal, dog2]);

    const result = findDuplicates('fandaws:concept/dog-1', graph, indices);
    expect(result.merges).toHaveLength(1);
    // dog2 is deeper → dog2 wins, dog1 is source (loser)
    expect(result.merges[0]['fandaws:source']).toBe('fandaws:concept/dog-1');
    expect(result.merges[0]['fandaws:target']).toBe('fandaws:concept/dog-2');
  });
});
