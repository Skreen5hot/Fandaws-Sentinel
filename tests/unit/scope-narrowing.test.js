/**
 * Scope Narrowing — unit tests.
 *
 * Tests buildAncestorChain, narrowScope (Leap Check + binary search + full walk).
 */

import { describe, it, expect } from '@jest/globals';
import { buildAncestorChain, narrowScope } from '../../src/core/knowledge-engine/scope-narrowing.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeConcept(id, label, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
}

function makeGraph(concepts) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

/** Build iriToParent index matching StateAdapter format. */
function buildIriToParent(concepts) {
  const index = new Map();
  for (const c of concepts) {
    index.set(c['@id'], c['skos:broader'] || null);
  }
  return index;
}

// ─────────────────────────────────────────────────────────
// buildAncestorChain
// ─────────────────────────────────────────────────────────

describe('buildAncestorChain', () => {
  it('returns empty array for a root concept', () => {
    const concepts = [makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')];
    const iriToParent = buildIriToParent(concepts);
    expect(buildAncestorChain('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', iriToParent)).toEqual([]);
  });

  it('returns [parent] for a direct child', () => {
    const concepts = [
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ];
    const iriToParent = buildIriToParent(concepts);
    expect(buildAncestorChain('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', iriToParent)).toEqual([
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    ]);
  });

  it('returns full chain for deep hierarchy', () => {
    const concepts = [
      makeConcept('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', 'Entity'),
      makeConcept('fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', 'Living Thing', 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity'),
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing'),
      makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    ];
    const iriToParent = buildIriToParent(concepts);
    expect(buildAncestorChain('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', iriToParent)).toEqual([
      'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal',
      'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
      'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing',
      'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity',
    ]);
  });

  it('handles cycle gracefully', () => {
    const iriToParent = new Map([
      ['fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', 'fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b'],
      ['fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b', 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a'],
    ]);
    const chain = buildAncestorChain('fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a', iriToParent);
    // Should terminate without infinite loop
    expect(chain.length).toBeLessThan(10);
    expect(chain).toContain('fandaws:class/69e20654-36bc-5ce9-a60f-60d08fdf78ce/b');
  });

  it('returns empty array for unknown concept', () => {
    const iriToParent = new Map();
    expect(buildAncestorChain('fandaws:class/8f1b306e-c65d-51b2-8c8a-ab5013f42731/unknown', iriToParent)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — no ancestors
// ─────────────────────────────────────────────────────────

describe('narrowScope — no ancestors', () => {
  it('resolves immediately at subject when no ancestor chain', () => {
    const concepts = [makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal')];
    const graph = makeGraph(concepts);
    const result = narrowScope('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', [], 'fur', new Map(), graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(result.prompts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — single ancestor
// ─────────────────────────────────────────────────────────

describe('narrowScope — single ancestor', () => {
  const concepts = [
    makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
    makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
  ];
  const graph = makeGraph(concepts);
  const chain = ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'];

  it('returns prompt when parent unanswered', () => {
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', new Map(), graph);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Animal');
    expect(result.prompts[0]['fandaws:text']).toContain('fur');
  });

  it('resolves at parent when parent=yes', () => {
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true]]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('resolves at subject when parent=no', () => {
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false]]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — Leap Check (multiple ancestors)
// ─────────────────────────────────────────────────────────

describe('narrowScope — Leap Check', () => {
  const concepts = [
    makeConcept('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', 'Entity'),
    makeConcept('fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', 'Living Thing', 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity'),
    makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing'),
    makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    makeConcept('fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine', 'Canine', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
    makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine'),
  ];
  const graph = makeGraph(concepts);
  const chain = [
    'fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine',
    'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal',
    'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing',
    'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity',
  ];

  it('asks both boundaries when both unanswered', () => {
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', new Map(), graph);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(2);
    // Should ask parent (canine) and root (entity)
    const texts = result.prompts.map((p) => p['fandaws:text']);
    expect(texts.some((t) => t.includes('Canine'))).toBe(true);
    expect(texts.some((t) => t.includes('Entity'))).toBe(true);
  });

  it('resolves at subject when parent=no', () => {
    const decisions = new Map([
      ['fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine', false],
      ['fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', true], // root doesn't matter
    ]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('resolves at root when both=yes', () => {
    const decisions = new Map([
      ['fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine', true],
      ['fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', true],
    ]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity');
  });

  it('binary searches when parent=yes, root=no', () => {
    const decisions = new Map([
      ['fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine', true],
      ['fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', false],
    ]);
    // Should ask a midpoint
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
  });

  it('converges binary search with additional decisions', () => {
    // chain: canine(0), mammal(1), animal(2), living-thing(3), entity(4)
    // canine=yes, entity=no → ask mid(2)=animal
    // animal=yes → ask mid(3)=living-thing
    // living-thing=no → converge to animal
    const decisions = new Map([
      ['fandaws:class/2abffe54-5b0c-5dd0-9ae3-0aa699be039b/canine', true],
      ['fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', false],
      ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true],
      ['fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', false],
    ]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — full walk (Leap Check disabled)
// ─────────────────────────────────────────────────────────

describe('narrowScope — full walk', () => {
  const concepts = [
    makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal'),
    makeConcept('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'Mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal'),
  ];
  const graph = makeGraph(concepts);
  const chain = ['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'];
  const opts = { leapCheckEnabled: false };

  it('asks ancestors one by one', () => {
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', new Map(), graph, opts);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Mammal');
  });

  it('stops at first no', () => {
    const decisions = new Map([['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', false]]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('continues to next ancestor on yes', () => {
    const decisions = new Map([['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', true]]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Animal');
  });

  it('attaches at root when all ancestors say yes', () => {
    const decisions = new Map([
      ['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', true],
      ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true],
    ]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
  });

  it('attaches at last yes when middle says no', () => {
    const decisions = new Map([
      ['fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', true],
      ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false],
    ]);
    const result = narrowScope('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal');
  });
});
