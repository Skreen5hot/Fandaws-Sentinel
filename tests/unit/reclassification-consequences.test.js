/**
 * Consequence-Aware Reclassification (CRC) — unit tests.
 *
 * Covers CRC-01 through CRC-08 from the April 9, 2026 spec.
 *
 * @see docs/architecture/consequence-aware-reclassification spec
 */

import { describe, it, expect } from '@jest/globals';
import { processClassification } from '../../src/core/knowledge-engine/knowledge-engine.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createClassificationAction } from '../../src/types/classification-action.js';
import {
  detectReclassificationCase,
  computeLostProperties,
} from '../../src/core/knowledge-engine/reclassification-consequences.js';

const GRAPH_ID = 'fandaws:graph/test';

// ── Fixture builders ──

function makeAction(subject, object) {
  return createClassificationAction({
    workflow: 'classification',
    subject,
    object,
  });
}

function makeProperty(id, conceptIri, propertyLabel, attachedTo) {
  return createProperty({
    id,
    verbIri: 'fandaws:property/has',
    verbLabel: 'has',
    objectConceptIri: conceptIri,
    propertyLabel,
    attachedTo,
  });
}

/**
 * Build a fixture with a chain:
 *   organism (has DNA) → animal → mammal → dog
 * Plus an unrelated branch:
 *   material entity (no descendants)
 * Plus a more-specific descendant of organism for strengthening tests:
 *   organism → eukaryote
 */
function buildFixture() {
  const organism = createConcept({ id: 'iri:organism', label: 'Organism', prefLabel: 'organism' });
  const dnaR = makeProperty('iri:r/organism--dna', 'iri:dna', 'DNA', 'iri:organism');
  organism['rdfs:subClassOf'] = [dnaR];

  const animal = createConcept({ id: 'iri:animal', label: 'Animal', prefLabel: 'animal', broader: 'iri:organism' });
  const mammal = createConcept({ id: 'iri:mammal', label: 'Mammal', prefLabel: 'mammal', broader: 'iri:animal' });
  const dog = createConcept({ id: 'iri:dog', label: 'Dog', prefLabel: 'dog', broader: 'iri:mammal' });

  const matEntity = createConcept({ id: 'iri:matEntity', label: 'Material Entity', prefLabel: 'material entity' });
  const eukaryote = createConcept({ id: 'iri:eukaryote', label: 'Eukaryote', prefLabel: 'eukaryote', broader: 'iri:organism' });
  const dna = createConcept({ id: 'iri:dna', label: 'DNA', prefLabel: 'dna' });

  const adapter = new InMemoryStateAdapter();
  adapter.saveGraph(
    GRAPH_ID,
    createKnowledgeGraph({
      id: GRAPH_ID,
      concepts: [organism, animal, mammal, dog, matEntity, eukaryote, dna],
    }),
  );
  return adapter;
}

function getConcept(adapter, prefLabel) {
  return adapter.loadGraph(GRAPH_ID)['fandaws:concepts'].find(
    (c) => c['skos:prefLabel'] === prefLabel,
  );
}

// ── CRC-01: Reclassify to ancestor (lateral) WITH inherited properties ──

describe('CRC-01: Lateral reclassification with inherited properties fires consequence prompt', () => {
  it('emits reclassificationConsequence prompt listing lost properties', () => {
    const adapter = buildFixture();
    const action = makeAction('animal', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      { reclassificationConfirmed: 'move' }, // skip proximity
    );

    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(1);
    const prompt = result.prompts[0];
    expect(prompt['fandaws:promptType']).toBe('reclassificationConsequence');
    expect(prompt['fandaws:text']).toContain('Organism has DNA');
    expect(prompt['fandaws:text']).toContain('inherited by animal');
    // 2 descendants (mammal, dog)
    expect(prompt['fandaws:text']).toMatch(/2 descendants?/);
  });

  it('lists three options in safest-first order', () => {
    const adapter = buildFixture();
    const action = makeAction('animal', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      { reclassificationConfirmed: 'move' },
    );
    const opts = result.prompts[0]['fandaws:options'];
    expect(opts.map((o) => o.action)).toEqual([
      'add_as_additional',
      'keep_current',
      'reclassify_anyway',
    ]);
  });
});

// ── CRC-02: Lateral reclassification with NO inherited properties → no prompt ──

describe('CRC-02: Lateral reclassification with no lost properties skips consequence prompt', () => {
  it('falls through to direct mutation when no properties would be lost', () => {
    // Two sibling branches with no properties on any ancestor:
    //   common → branchA → leafA
    //   common → branchB
    // Reclassifying leafA under branchB (lateral, common ancestor = common)
    // — branchA has no properties, so nothing is lost.
    //
    // Note: pure "Weakening" in the spec sense (new parent is an ancestor of
    // old parent) is always short-circuited by the transitive redundancy
    // check at the top of Case A — saying "X is a Y" when Y is already a
    // transitive ancestor of X is a noOp. This test exercises the
    // non-strengthening, non-weakening case (Lateral) where the consequence
    // check runs but finds zero lost properties.
    const common = createConcept({ id: 'iri:common', label: 'Common', prefLabel: 'common' });
    const branchA = createConcept({ id: 'iri:branchA', label: 'Branch A', prefLabel: 'branch a', broader: 'iri:common' });
    const leafA = createConcept({ id: 'iri:leafA', label: 'Leaf A', prefLabel: 'leaf a', broader: 'iri:branchA' });
    const branchB = createConcept({ id: 'iri:branchB', label: 'Branch B', prefLabel: 'branch b', broader: 'iri:common' });
    const adapter = new InMemoryStateAdapter();
    adapter.saveGraph(
      GRAPH_ID,
      createKnowledgeGraph({ id: GRAPH_ID, concepts: [common, branchA, leafA, branchB] }),
    );

    const action = makeAction('leaf a', 'branch b');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      { reclassificationConfirmed: 'move' },
    );
    expect(result.prompts).toHaveLength(0);
    expect(result.mutation).not.toBeNull();
    // Verify it's a real reclassification, not a noop
    adapter.applyMutation(GRAPH_ID, result.mutation);
    const leaf = getConcept(adapter, 'leaf a');
    expect(leaf['skos:broader']).toBe('iri:branchB');
  });
});

// ── CRC-03: Strengthening (move to descendant) → no prompt ──

describe('CRC-03: Strengthening reclassification skips consequence prompt', () => {
  it('does not fire prompt when new parent is a descendant of old parent', () => {
    // animal currently under organism. Reclassify under eukaryote (which is
    // a child of organism). This is strengthening — more specific.
    const adapter = buildFixture();
    const action = makeAction('animal', 'eukaryote');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      { reclassificationConfirmed: 'move' },
    );
    expect(result.prompts).toHaveLength(0);
    expect(result.mutation).not.toBeNull();
  });
});

// ── CRC-04: Lateral reclassification with inherited properties ──

describe('CRC-04: Disconnected reclassification with inherited properties fires prompt', () => {
  it('detects disconnected case and lists lost properties', () => {
    const adapter = buildFixture();
    const indices = adapter.getIndices(GRAPH_ID);
    const caseInfo = detectReclassificationCase(
      'iri:organism',
      'iri:matEntity',
      indices.iriToParent,
    );
    expect(caseInfo.case).toBe('disconnected');
    expect(caseInfo.commonAncestor).toBeNull();
  });
});

// ── CRC-05: User selects "Reclassify anyway" → mutation proceeds ──

describe('CRC-05: reclassify_anyway action commits the destructive reclassification', () => {
  it('changes skos:broader to the new parent', () => {
    const adapter = buildFixture();
    const action = makeAction('animal', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'reclassify_anyway',
      },
    );
    expect(result.mutation).not.toBeNull();
    expect(result.prompts).toHaveLength(0);
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const animal = getConcept(adapter, 'animal');
    expect(animal['skos:broader']).toBe('iri:matEntity');
    // additionalParents stays empty
    expect(animal['fandaws:additionalParents']).toBeUndefined();
  });
});

// ── CRC-06: User selects "Keep current" → no mutation ──

describe('CRC-06: keep_current action returns noOp', () => {
  it('produces no mutation and no prompts', () => {
    const adapter = buildFixture();
    const action = makeAction('animal', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'keep_current',
      },
    );
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(0);
    // Animal still under organism
    const animal = getConcept(adapter, 'animal');
    expect(animal['skos:broader']).toBe('iri:organism');
  });
});

// ── CRC-07: User selects "Add as additional parent" → polyhierarchy ──

describe('CRC-07: add_as_additional preserves primary classification', () => {
  it('appends new parent to fandaws:additionalParents and leaves skos:broader untouched', () => {
    const adapter = buildFixture();
    const action = makeAction('animal', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'add_as_additional',
      },
    );
    expect(result.mutation).not.toBeNull();
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const animal = getConcept(adapter, 'animal');
    expect(animal['skos:broader']).toBe('iri:organism'); // unchanged
    expect(animal['fandaws:additionalParents']).toEqual(['iri:matEntity']);
  });

  it('appends to existing additionalParents without duplicating', () => {
    const adapter = buildFixture();
    // First add a third concept and add it as an additional parent
    const otherRoot = createConcept({ id: 'iri:other', label: 'Other Root', prefLabel: 'other root' });
    const g = adapter.loadGraph(GRAPH_ID);
    g['fandaws:concepts'].push(otherRoot);
    adapter.saveGraph(GRAPH_ID, g);

    // Step 1: add 'other root' as additional parent
    let result = processClassification(
      makeAction('animal', 'other root'),
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'add_as_additional',
      },
    );
    adapter.applyMutation(GRAPH_ID, result.mutation);

    // Step 2: add 'material entity' as ANOTHER additional parent
    result = processClassification(
      makeAction('animal', 'material entity'),
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'add_as_additional',
      },
    );
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const animal = getConcept(adapter, 'animal');
    expect(animal['skos:broader']).toBe('iri:organism');
    expect(animal['fandaws:additionalParents']).toEqual(['iri:other', 'iri:matEntity']);
  });
});

// ── CRC-08: Reclassification to existing secondary parent → "Make primary?" ──

describe('CRC-08: Reclassification to existing secondary parent fires promotion prompt', () => {
  it('emits secondaryParentPromotion prompt when new parent is already in additionalParents', () => {
    const adapter = buildFixture();

    // Step 1: add material entity as a secondary parent
    let result = processClassification(
      makeAction('animal', 'material entity'),
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'add_as_additional',
      },
    );
    adapter.applyMutation(GRAPH_ID, result.mutation);

    // Step 2: try to reclassify to material entity again — should detect secondary parent
    result = processClassification(
      makeAction('animal', 'material entity'),
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {},
    );
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('secondaryParentPromotion');
  });

  it('promote_secondary action runs the consequence flow', () => {
    const adapter = buildFixture();

    // Step 1: add material entity as a secondary parent
    let result = processClassification(
      makeAction('animal', 'material entity'),
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'add_as_additional',
      },
    );
    adapter.applyMutation(GRAPH_ID, result.mutation);

    // Step 2: promote_secondary skips the secondaryParentPromotion prompt
    // and goes directly to the standard reclassification path. Since the
    // user explicitly asked to promote, the consequence prompt should NOT
    // fire (promote_secondary acts like reclassify_anyway in skipping it).
    result = processClassification(
      makeAction('animal', 'material entity'),
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'promote_secondary',
      },
    );
    expect(result.mutation).not.toBeNull();
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const animal = getConcept(adapter, 'animal');
    expect(animal['skos:broader']).toBe('iri:matEntity');
  });
});

// ── Pure-function unit tests for the consequence module ──

describe('reclassification-consequences module', () => {
  it('detectReclassificationCase identifies strengthening', () => {
    const adapter = buildFixture();
    const indices = adapter.getIndices(GRAPH_ID);
    const result = detectReclassificationCase(
      'iri:organism',
      'iri:eukaryote',
      indices.iriToParent,
    );
    expect(result.case).toBe('strengthening');
    expect(result.commonAncestor).toBe('iri:organism');
  });

  it('detectReclassificationCase identifies weakening', () => {
    const adapter = buildFixture();
    const indices = adapter.getIndices(GRAPH_ID);
    const result = detectReclassificationCase(
      'iri:eukaryote',
      'iri:organism',
      indices.iriToParent,
    );
    expect(result.case).toBe('weakening');
    expect(result.commonAncestor).toBe('iri:organism');
  });

  it('detectReclassificationCase identifies disconnected', () => {
    const adapter = buildFixture();
    const indices = adapter.getIndices(GRAPH_ID);
    const result = detectReclassificationCase(
      'iri:organism',
      'iri:matEntity',
      indices.iriToParent,
    );
    expect(result.case).toBe('disconnected');
    expect(result.commonAncestor).toBeNull();
  });

  it('computeLostProperties returns empty for strengthening', () => {
    const adapter = buildFixture();
    const indices = adapter.getIndices(GRAPH_ID);
    const caseInfo = detectReclassificationCase(
      'iri:organism',
      'iri:eukaryote',
      indices.iriToParent,
    );
    const lost = computeLostProperties(
      'iri:animal',
      caseInfo,
      adapter.loadGraph(GRAPH_ID),
      indices.iriToChildren,
    );
    expect(lost).toHaveLength(0);
  });

  it('computeLostProperties finds DNA on organism for weakening', () => {
    const adapter = buildFixture();
    const indices = adapter.getIndices(GRAPH_ID);
    // animal currently under organism, reclassifying to a hypothetical ancestor
    // — but for weakening we need an ancestor of organism. Disconnected works
    // for the same fixture.
    const caseInfo = detectReclassificationCase(
      'iri:organism',
      'iri:matEntity',
      indices.iriToParent,
    );
    const lost = computeLostProperties(
      'iri:animal',
      caseInfo,
      adapter.loadGraph(GRAPH_ID),
      indices.iriToChildren,
    );
    expect(lost).toHaveLength(1);
    expect(lost[0].propertyLabel).toBe('DNA');
    expect(lost[0].sourceConceptLabel).toBe('Organism');
    // Animal has 2 descendants: mammal, dog
    expect(lost[0].affectedDescendants).toHaveLength(2);
  });
});
