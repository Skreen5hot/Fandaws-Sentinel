/**
 * Consequence-Aware Reclassification (CRC) — unit tests.
 *
 * Covers CRC-01 through CRC-09 from the revised spec (April 11, 2026).
 *
 * BFO is single-inheritance: every class has exactly one skos:broader parent.
 * No polyhierarchy. Three options: keep_current, reclassify_subtree,
 * reclassify_only.
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
    verbIri: 'fandaws:objectProperty/has',
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
      'keep_current',
      'reclassify_subtree',
      'reclassify_only',
    ]);
  });
});

// ── CRC-02: Lateral reclassification with NO inherited properties → no prompt ──

describe('CRC-02: Lateral reclassification with no lost properties skips consequence prompt', () => {
  it('falls through to direct mutation when no properties would be lost', () => {
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
    adapter.applyMutation(GRAPH_ID, result.mutation);
    const leaf = getConcept(adapter, 'leaf a');
    expect(leaf['skos:broader']).toBe('iri:branchB');
  });
});

// ── CRC-03: Strengthening (move to descendant) → no prompt ──

describe('CRC-03: Strengthening reclassification skips consequence prompt', () => {
  it('does not fire prompt when new parent is a descendant of old parent', () => {
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

// ── CRC-04: Disconnected reclassification ──

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

// ── CRC-05: User selects "Reclassify and move subtree" → mutation proceeds ──

describe('CRC-05: reclassify_subtree moves concept, descendants follow', () => {
  it('changes skos:broader to the new parent, descendants stay under subject', () => {
    const adapter = buildFixture();
    const action = makeAction('animal', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'reclassify_subtree',
      },
    );
    expect(result.mutation).not.toBeNull();
    expect(result.prompts).toHaveLength(0);
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const animal = getConcept(adapter, 'animal');
    expect(animal['skos:broader']).toBe('iri:matEntity');
    // rdfs:subClassOf parent entry synced
    const animalSubClassOf = animal['rdfs:subClassOf'].filter((e) => typeof e === 'string');
    expect(animalSubClassOf).toContain('iri:matEntity');
    expect(animalSubClassOf).not.toContain('iri:organism');
    // Descendants follow — their skos:broader is unchanged (still points to parent)
    const mammal = getConcept(adapter, 'mammal');
    expect(mammal['skos:broader']).toBe('iri:animal');
    const dog = getConcept(adapter, 'dog');
    expect(dog['skos:broader']).toBe('iri:mammal');
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

// ── CRC-07: User selects "Reclassify only" → re-home children ──

describe('CRC-07: reclassify_only re-homes direct children to old parent', () => {
  it('moves concept, re-homes direct children, grandchildren follow their parent', () => {
    const adapter = buildFixture();
    const action = makeAction('animal', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'reclassify_only',
      },
    );
    expect(result.mutation).not.toBeNull();
    expect(result.prompts).toHaveLength(0);
    adapter.applyMutation(GRAPH_ID, result.mutation);

    // Animal moved to material entity
    const animal = getConcept(adapter, 'animal');
    expect(animal['skos:broader']).toBe('iri:matEntity');
    // rdfs:subClassOf parent entry synced
    const animalStrings = animal['rdfs:subClassOf'].filter((e) => typeof e === 'string');
    expect(animalStrings).toContain('iri:matEntity');
    expect(animalStrings).not.toContain('iri:organism');

    // Mammal (direct child) re-homed to organism (animal's old parent)
    const mammal = getConcept(adapter, 'mammal');
    expect(mammal['skos:broader']).toBe('iri:organism');
    // rdfs:subClassOf parent entry synced
    const mammalStrings = mammal['rdfs:subClassOf'].filter((e) => typeof e === 'string');
    expect(mammalStrings).toContain('iri:organism');
    expect(mammalStrings).not.toContain('iri:animal');

    // Dog (grandchild) unchanged — follows mammal
    const dog = getConcept(adapter, 'dog');
    expect(dog['skos:broader']).toBe('iri:mammal');
  });
});

// ── CRC-08: Reclassify-only on a leaf node ──

describe('CRC-08: reclassify_only on leaf node behaves like reclassify_subtree', () => {
  it('moves concept with no children to re-home', () => {
    const adapter = buildFixture();
    const action = makeAction('dog', 'material entity');
    const result = processClassification(
      action,
      adapter.loadGraph(GRAPH_ID),
      adapter.getIndices(GRAPH_ID),
      {
        reclassificationConfirmed: 'move',
        reclassificationConsequenceChoice: 'reclassify_only',
      },
    );
    expect(result.mutation).not.toBeNull();
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const dog = getConcept(adapter, 'dog');
    expect(dog['skos:broader']).toBe('iri:matEntity');
    // Mammal unchanged — dog had no children, so no re-homing happened
    const mammal = getConcept(adapter, 'mammal');
    expect(mammal['skos:broader']).toBe('iri:animal');
  });
});

// ── CRC-09: No polyhierarchy — fandaws:additionalParents does not exist ──

describe('CRC-09: No polyhierarchy', () => {
  it('concepts have no fandaws:additionalParents field', () => {
    const adapter = buildFixture();
    const animal = getConcept(adapter, 'animal');
    expect(animal['fandaws:additionalParents']).toBeUndefined();
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

  it('computeLostProperties finds DNA on organism for disconnected case', () => {
    const adapter = buildFixture();
    const indices = adapter.getIndices(GRAPH_ID);
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
