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
    const rel = makeRel('r1', 'chase', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat');
    const prop = makeProp('p1', 'fur', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'dog', null, [rel, prop]);
    const puppy = makeConcept('fandaws:class/c4c9d071-9bac-56a6-8e4b-420196ca5470/puppy', 'puppy', 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'cat');
    const graph = makeGraph([dog, puppy, cat]);
    const indices = makeIndices([dog, puppy, cat]);

    // 1 child (puppy) + 1 property + 1 relationship = 3
    expect(countAssertions('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', graph, indices)).toBe(3);
  });

  it('returns 0 for concept with no assertions', () => {
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'cat');
    const graph = makeGraph([cat]);
    const indices = makeIndices([cat]);
    expect(countAssertions('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', graph, indices)).toBe(0);
  });
});

// ── decideMergeWinner ──

describe('decideMergeWinner', () => {
  it('deeper concept wins (tier 1)', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'animal');
    const dog1 = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const dog2 = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog'); // root = depth 0
    const graph = makeGraph([animal, dog1, dog2]);
    const indices = makeIndices([animal, dog1, dog2]);

    const result = decideMergeWinner('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    expect(result.loser).toBe('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
  });

  it('earlier createdAt wins at same depth (tier 2)', () => {
    const dog1 = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', null, [], '2026-01-01T00:00:00Z');
    const dog2 = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog', null, [], '2026-02-01T00:00:00Z');
    const graph = makeGraph([dog1, dog2]);
    const indices = makeIndices([dog1, dog2]);

    const result = decideMergeWinner('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    expect(result.loser).toBe('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
  });

  it('more assertions wins at same depth+time (tier 3)', () => {
    const dog1 = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', null, [
      makeProp('p1', 'fur', 'fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1'),
    ]);
    const dog2 = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog');
    const graph = makeGraph([dog1, dog2]);
    const indices = makeIndices([dog1, dog2]);

    const result = decideMergeWinner('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    expect(result.loser).toBe('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
  });

  it('order parameter A wins when equal', () => {
    const dog1 = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog');
    const dog2 = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog');
    const graph = makeGraph([dog1, dog2]);
    const indices = makeIndices([dog1, dog2]);

    const result = decideMergeWinner('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', graph, indices);
    expect(result.winner).toBe('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
  });
});

// ── findDuplicates ──

describe('findDuplicates', () => {
  it('finds duplicate with matching canonical label in neighborhood', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'animal');
    const dog1 = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const dog2 = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const graph = makeGraph([animal, dog1, dog2]);
    const indices = makeIndices([animal, dog1, dog2]);

    const result = findDuplicates('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', graph, indices);
    expect(result.merges).toHaveLength(1);
    expect(result.merges[0]['fandaws:target']).toBeDefined();
    expect(result.merges[0]['fandaws:source']).toBeDefined();
  });

  it('returns empty when no duplicate found', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'dog');
    const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'cat');
    const graph = makeGraph([dog, cat]);
    const indices = makeIndices([dog, cat]);

    const result = findDuplicates('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', graph, indices);
    expect(result.merges).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
  });

  it('returns empty for unknown concept IRI', () => {
    const graph = makeGraph([]);
    const indices = makeIndices([]);

    const result = findDuplicates('fandaws:class/8f1b306e-c65d-51b2-8c8a-ab5013f42731/unknown', graph, indices);
    expect(result.merges).toHaveLength(0);
    expect(result.scanned).toBe(0);
  });

  it('respects deduplicationDepth bound', () => {
    // Create a chain: root → a → b → c → d → dup_root
    // dup_root has same label as root, but is 5 levels away
    const root = makeConcept('fandaws:class/12ac83b4-94ba-5214-a91a-d2c53f830fbf/root', 'target');
    const a = makeConcept('fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'a', 'fandaws:class/12ac83b4-94ba-5214-a91a-d2c53f830fbf/root');
    const b = makeConcept('fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'b', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a');
    const c = makeConcept('fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c', 'c', 'fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b');
    const d = makeConcept('fandaws:class/4b992e3a-3503-58c5-9f71-6ec22085658c/d', 'd', 'fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c');
    const dup = makeConcept('fandaws:class/ea08f015-924b-57ca-b400-3ecee7a1646f/dup', 'target', 'fandaws:class/4b992e3a-3503-58c5-9f71-6ec22085658c/d');
    const graph = makeGraph([root, a, b, c, d, dup]);
    const indices = makeIndices([root, a, b, c, d, dup]);

    // With depth 3, dup is 5 levels away — should NOT be found
    const result = findDuplicates('fandaws:class/12ac83b4-94ba-5214-a91a-d2c53f830fbf/root', graph, indices, { deduplicationDepth: 3 });
    expect(result.merges).toHaveLength(0);

    // With depth 8 (default), dup IS found
    const result2 = findDuplicates('fandaws:class/12ac83b4-94ba-5214-a91a-d2c53f830fbf/root', graph, indices);
    expect(result2.merges).toHaveLength(1);
  });

  it('triggers prompt for large merge (exceeds threshold)', () => {
    // Create loser with many children
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'animal');
    const dog1 = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const dog2 = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    // Give dog2 many children so it triggers threshold
    const childA = makeConcept('fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'a', 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
    const childB = makeConcept('fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'b', 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
    const childC = makeConcept('fandaws:class/d15c397d-3f96-5f61-8d20-3f8baf33f1f8/c', 'c', 'fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
    const graph = makeGraph([animal, dog1, dog2, childA, childB, childC]);
    const indices = makeIndices([animal, dog1, dog2, childA, childB, childC]);

    // dog1 is deeper (depth 1), dog2 is also depth 1 — need to check who wins
    // Since dog2 has 3 children (more assertions), dog2 wins, dog1 is loser
    // dog1 has 0 children, so no threshold hit
    // Let's swap: make dog1 the one with children
    const result = findDuplicates('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', graph, indices, { mergeReviewThreshold: 1 });
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
    const dog1WithKids = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', [], '2026-01-01T00:00:00Z');
    const dog2Bare = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', [], '2026-02-01T00:00:00Z');
    const k1 = makeConcept('fandaws:class/e1ef8e59-c19e-56b5-8fad-c544765f6a17/k1', 'k1', 'fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    const k2 = makeConcept('fandaws:class/b374db54-9b2c-5b7b-a04f-795a0608d6d4/k2', 'k2', 'fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    const k3 = makeConcept('fandaws:class/128b1083-70f8-5b2a-b06b-c4357baf833a/k3', 'k3', 'fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    const graph2 = makeGraph([animal, dog1WithKids, dog2Bare, k1, k2, k3]);
    const indices2 = makeIndices([animal, dog1WithKids, dog2Bare, k1, k2, k3]);
    // dog1 wins (earlier createdAt), dog2 is loser, dog2 has 0 children — no threshold
    // We need loser to have many children. dog1 earlier → dog1 wins, dog2 loser, 0 children
    // Flip: make dog2 earlier
    const dog1Late = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', [], '2026-03-01T00:00:00Z');
    const dog2Early = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', [], '2026-01-01T00:00:00Z');
    const ch1 = makeConcept('fandaws:class/19794cea-6a7e-50a0-802d-e55dcde93da2/ch1', 'ch1', 'fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    const ch2 = makeConcept('fandaws:class/3cbb4bba-6610-5138-9f76-78cec59b7d81/ch2', 'ch2', 'fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    const ch3 = makeConcept('fandaws:class/1556b879-9c90-5bb1-96cc-9dba07e18f3e/ch3', 'ch3', 'fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    const graph3 = makeGraph([animal, dog1Late, dog2Early, ch1, ch2, ch3]);
    const indices3 = makeIndices([animal, dog1Late, dog2Early, ch1, ch2, ch3]);
    // dog2 wins (earlier), dog1 is loser, dog1 has 3 children
    const result3 = findDuplicates('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', graph3, indices3, { mergeReviewThreshold: 1 });
    expect(result3.prompts).toHaveLength(1);
    expect(result3.prompts[0]['fandaws:promptType']).toBe('confirmation');
    expect(result3.merges).toHaveLength(0); // prompt replaces merge
  });

  it('reports scanned count', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const graph = makeGraph([animal, dog]);
    const indices = makeIndices([animal, dog]);

    const result = findDuplicates('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', graph, indices);
    expect(result.scanned).toBeGreaterThan(0);
  });

  it('deeper duplicate wins merge', () => {
    // Both under same parent so they share a neighborhood
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'animal');
    const dog1 = makeConcept('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'); // depth 1
    const mammal = makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const dog2 = makeConcept('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2', 'dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'); // depth 2
    const graph = makeGraph([animal, dog1, mammal, dog2]);
    const indices = makeIndices([animal, dog1, mammal, dog2]);

    const result = findDuplicates('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1', graph, indices);
    expect(result.merges).toHaveLength(1);
    // dog2 is deeper → dog2 wins, dog1 is source (loser)
    expect(result.merges[0]['fandaws:source']).toBe('fandaws:class/5a0ddb05-0427-58bc-9667-e08c2f196af2/dog-1');
    expect(result.merges[0]['fandaws:target']).toBe('fandaws:class/00231556-00eb-5360-bb62-d9388e39d8f1/dog-2');
  });
});
