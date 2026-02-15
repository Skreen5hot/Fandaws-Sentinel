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
    const concepts = [makeConcept('fandaws:concept/animal', 'Animal')];
    const iriToParent = buildIriToParent(concepts);
    expect(buildAncestorChain('fandaws:concept/animal', iriToParent)).toEqual([]);
  });

  it('returns [parent] for a direct child', () => {
    const concepts = [
      makeConcept('fandaws:concept/animal', 'Animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ];
    const iriToParent = buildIriToParent(concepts);
    expect(buildAncestorChain('fandaws:concept/dog', iriToParent)).toEqual([
      'fandaws:concept/animal',
    ]);
  });

  it('returns full chain for deep hierarchy', () => {
    const concepts = [
      makeConcept('fandaws:concept/entity', 'Entity'),
      makeConcept('fandaws:concept/living-thing', 'Living Thing', 'fandaws:concept/entity'),
      makeConcept('fandaws:concept/animal', 'Animal', 'fandaws:concept/living-thing'),
      makeConcept('fandaws:concept/mammal', 'Mammal', 'fandaws:concept/animal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ];
    const iriToParent = buildIriToParent(concepts);
    expect(buildAncestorChain('fandaws:concept/dog', iriToParent)).toEqual([
      'fandaws:concept/mammal',
      'fandaws:concept/animal',
      'fandaws:concept/living-thing',
      'fandaws:concept/entity',
    ]);
  });

  it('handles cycle gracefully', () => {
    const iriToParent = new Map([
      ['fandaws:concept/a', 'fandaws:concept/b'],
      ['fandaws:concept/b', 'fandaws:concept/a'],
    ]);
    const chain = buildAncestorChain('fandaws:concept/a', iriToParent);
    // Should terminate without infinite loop
    expect(chain.length).toBeLessThan(10);
    expect(chain).toContain('fandaws:concept/b');
  });

  it('returns empty array for unknown concept', () => {
    const iriToParent = new Map();
    expect(buildAncestorChain('fandaws:concept/unknown', iriToParent)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — no ancestors
// ─────────────────────────────────────────────────────────

describe('narrowScope — no ancestors', () => {
  it('resolves immediately at subject when no ancestor chain', () => {
    const concepts = [makeConcept('fandaws:concept/animal', 'Animal')];
    const graph = makeGraph(concepts);
    const result = narrowScope('fandaws:concept/animal', [], 'fur', new Map(), graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/animal');
    expect(result.prompts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — single ancestor
// ─────────────────────────────────────────────────────────

describe('narrowScope — single ancestor', () => {
  const concepts = [
    makeConcept('fandaws:concept/animal', 'Animal'),
    makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
  ];
  const graph = makeGraph(concepts);
  const chain = ['fandaws:concept/animal'];

  it('returns prompt when parent unanswered', () => {
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', new Map(), graph);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Animal');
    expect(result.prompts[0]['fandaws:text']).toContain('fur');
  });

  it('resolves at parent when parent=yes', () => {
    const decisions = new Map([['fandaws:concept/animal', true]]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/animal');
  });

  it('resolves at subject when parent=no', () => {
    const decisions = new Map([['fandaws:concept/animal', false]]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/dog');
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — Leap Check (multiple ancestors)
// ─────────────────────────────────────────────────────────

describe('narrowScope — Leap Check', () => {
  const concepts = [
    makeConcept('fandaws:concept/entity', 'Entity'),
    makeConcept('fandaws:concept/living-thing', 'Living Thing', 'fandaws:concept/entity'),
    makeConcept('fandaws:concept/animal', 'Animal', 'fandaws:concept/living-thing'),
    makeConcept('fandaws:concept/mammal', 'Mammal', 'fandaws:concept/animal'),
    makeConcept('fandaws:concept/canine', 'Canine', 'fandaws:concept/mammal'),
    makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/canine'),
  ];
  const graph = makeGraph(concepts);
  const chain = [
    'fandaws:concept/canine',
    'fandaws:concept/mammal',
    'fandaws:concept/animal',
    'fandaws:concept/living-thing',
    'fandaws:concept/entity',
  ];

  it('asks both boundaries when both unanswered', () => {
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', new Map(), graph);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(2);
    // Should ask parent (canine) and root (entity)
    const texts = result.prompts.map((p) => p['fandaws:text']);
    expect(texts.some((t) => t.includes('Canine'))).toBe(true);
    expect(texts.some((t) => t.includes('Entity'))).toBe(true);
  });

  it('resolves at subject when parent=no', () => {
    const decisions = new Map([
      ['fandaws:concept/canine', false],
      ['fandaws:concept/entity', true], // root doesn't matter
    ]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/dog');
  });

  it('resolves at root when both=yes', () => {
    const decisions = new Map([
      ['fandaws:concept/canine', true],
      ['fandaws:concept/entity', true],
    ]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/entity');
  });

  it('binary searches when parent=yes, root=no', () => {
    const decisions = new Map([
      ['fandaws:concept/canine', true],
      ['fandaws:concept/entity', false],
    ]);
    // Should ask a midpoint
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
  });

  it('converges binary search with additional decisions', () => {
    // chain: canine(0), mammal(1), animal(2), living-thing(3), entity(4)
    // canine=yes, entity=no → ask mid(2)=animal
    // animal=yes → ask mid(3)=living-thing
    // living-thing=no → converge to animal
    const decisions = new Map([
      ['fandaws:concept/canine', true],
      ['fandaws:concept/entity', false],
      ['fandaws:concept/animal', true],
      ['fandaws:concept/living-thing', false],
    ]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/animal');
  });
});

// ─────────────────────────────────────────────────────────
// narrowScope — full walk (Leap Check disabled)
// ─────────────────────────────────────────────────────────

describe('narrowScope — full walk', () => {
  const concepts = [
    makeConcept('fandaws:concept/animal', 'Animal'),
    makeConcept('fandaws:concept/mammal', 'Mammal', 'fandaws:concept/animal'),
    makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
  ];
  const graph = makeGraph(concepts);
  const chain = ['fandaws:concept/mammal', 'fandaws:concept/animal'];
  const opts = { leapCheckEnabled: false };

  it('asks ancestors one by one', () => {
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', new Map(), graph, opts);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Mammal');
  });

  it('stops at first no', () => {
    const decisions = new Map([['fandaws:concept/mammal', false]]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/dog');
  });

  it('continues to next ancestor on yes', () => {
    const decisions = new Map([['fandaws:concept/mammal', true]]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Animal');
  });

  it('attaches at root when all ancestors say yes', () => {
    const decisions = new Map([
      ['fandaws:concept/mammal', true],
      ['fandaws:concept/animal', true],
    ]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/animal');
  });

  it('attaches at last yes when middle says no', () => {
    const decisions = new Map([
      ['fandaws:concept/mammal', true],
      ['fandaws:concept/animal', false],
    ]);
    const result = narrowScope('fandaws:concept/dog', chain, 'fur', decisions, graph, opts);
    expect(result.resolved).toBe(true);
    expect(result.attachmentIri).toBe('fandaws:concept/mammal');
  });
});
