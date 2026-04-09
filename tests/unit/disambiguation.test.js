/**
 * Downstream disambiguation — unit tests.
 *
 * Tests the hidden-label fallback in concept resolution across
 * classification, property, and relationship workflows. Verifies
 * homonymDisambiguation prompts and the "Neither" path.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { processClassification } from '../../src/core/knowledge-engine/knowledge-engine.js';
import { processProperty } from '../../src/core/knowledge-engine/property-workflow.js';
import { processRelationship } from '../../src/core/knowledge-engine/relationship-workflow.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createClassificationAction } from '../../src/types/classification-action.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const GRAPH_ID = 'fandaws:graph/test';

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: GRAPH_ID, concepts });
}

function makeConcept(id, label, prefLabel, broader = null, extras = {}) {
  return { ...createConcept({ id, label, prefLabel, broader }), ...extras };
}

function buildIndices(concepts) {
  const canonicalLabelToIri = new Map();
  const iriToParent = new Map();
  const iriToChildren = new Map();

  for (const c of concepts) {
    const iri = c['@id'];
    canonicalLabelToIri.set(c['skos:prefLabel'], iri);
    iriToParent.set(iri, c['skos:broader']);
    if (!iriToChildren.has(iri)) iriToChildren.set(iri, new Set());
    const parent = c['skos:broader'];
    if (parent != null) {
      if (!iriToChildren.has(parent)) iriToChildren.set(parent, new Set());
      iriToChildren.get(parent).add(iri);
    }
  }

  return { canonicalLabelToIri, iriToParent, iriToChildren };
}

/**
 * Build a graph with two "mouse" homonyms already created.
 * Both have qualified prefLabels and "mouse" in their skos:altLabel array.
 */
function makeHomonymGraph() {
  const root = makeConcept('iri:root', 'Root', 'root');
  const biology = makeConcept('iri:biology', 'Biology', 'biology', 'iri:root');
  const rodent = makeConcept('iri:rodent', 'Rodent', 'rodent', 'iri:biology');
  const mouseRodent = makeConcept('iri:mouse-rodent', 'Mouse (rodent)', 'mouse (rodent)', 'iri:rodent', {
    'skos:altLabel': ['mouse'],
  });
  const technology = makeConcept('iri:tech', 'Technology', 'technology', 'iri:root');
  const device = makeConcept('iri:device', 'Device', 'device', 'iri:tech');
  const mouseDevice = makeConcept('iri:mouse-device', 'Mouse (device)', 'mouse (device)', 'iri:device', {
    'skos:altLabel': ['mouse'],
  });
  const cat = makeConcept('iri:cat', 'Cat', 'cat', 'iri:biology');
  const concepts = [root, biology, rodent, mouseRodent, technology, device, mouseDevice, cat];
  return { concepts, graph: makeGraph(concepts), indices: buildIndices(concepts) };
}

/**
 * Build InMemoryStateAdapter preloaded with the homonym graph.
 */
function makeAdapter(concepts) {
  const adapter = new InMemoryStateAdapter();
  adapter.saveGraph(GRAPH_ID, makeGraph(concepts));
  return adapter;
}

// ─────────────────────────────────────────────────────────
// DIS-01: Property workflow — bare "mouse" + 2 homonyms → prompt
// ─────────────────────────────────────────────────────────

describe('DIS-01: Property workflow homonym disambiguation', () => {
  it('returns homonymDisambiguation prompt without "Neither" button', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    const adapter = makeAdapter(concepts);

    const action = createClassificationAction({
      workflow: 'property',
      subject: 'Mouse',
      object: 'has tail',
    });
    const result = processProperty(action, graph, indices, {}, adapter);

    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('homonymDisambiguation');
    // Property workflow: no "Neither" option
    expect(result.prompts[0]['fandaws:context'].allowCreate).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-02: Property workflow — resolved IRI → property attached correctly
// ─────────────────────────────────────────────────────────

describe('DIS-02: Property workflow with resolvedConceptIri', () => {
  it('attaches property to the resolved concept', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    // Add a "tail" concept so property resolution succeeds
    const tail = makeConcept('iri:tail', 'Tail', 'tail', 'iri:biology');
    const allConcepts = [...concepts, tail];
    const allGraph = makeGraph(allConcepts);
    const allIndices = buildIndices(allConcepts);
    const adapter = makeAdapter(allConcepts);

    const action = createClassificationAction({
      workflow: 'property',
      subject: 'Mouse',
      object: 'Tail',
    });
    const result = processProperty(action, allGraph, allIndices, {
      resolvedConceptIri: 'iri:mouse-rodent',
      scopeDecisions: new Map([['iri:rodent', false]]),
    }, adapter);

    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    // The mutation should reference the rodent mouse concept
    const additions = result.mutation['fandaws:additions'] || [];
    const modifications = result.mutation['fandaws:modifications'] || [];
    // Property is attached as a restriction to the concept
    const allNodes = [...additions, ...modifications];
    expect(allNodes.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-03: Relationship — "cat chases mouse" + 2 homonyms → prompt
// ─────────────────────────────────────────────────────────

describe('DIS-03: Relationship workflow homonym disambiguation', () => {
  it('returns homonymDisambiguation prompt for ambiguous object', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    const adapter = makeAdapter(concepts);

    const action = createClassificationAction({
      workflow: 'customRelationship',
      subject: 'Cat',
      object: 'Mouse',
      verb: 'chases',
    });
    const result = processRelationship(action, graph, indices, {}, adapter);

    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('homonymDisambiguation');
    // Relationship: no "Neither" option
    expect(result.prompts[0]['fandaws:context'].allowCreate).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-04: Relationship — resolved IRI
// ─────────────────────────────────────────────────────────

describe('DIS-04: Relationship workflow with resolvedConceptIri', () => {
  it('creates relationship with the resolved concept', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    const adapter = makeAdapter(concepts);

    const action = createClassificationAction({
      workflow: 'customRelationship',
      subject: 'Cat',
      object: 'Mouse',
      verb: 'chases',
    });
    const result = processRelationship(action, graph, indices, {
      resolvedObjectIri: 'iri:mouse-rodent',
    }, adapter);

    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// DIS-05: Classification — "mouse is a mammal" + 2 homonyms → prompt WITH "Neither"
// ─────────────────────────────────────────────────────────

describe('DIS-05: Classification workflow with "Neither" option', () => {
  it('returns homonymDisambiguation prompt with allowCreate=true', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    const adapter = makeAdapter(concepts);

    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'Mouse',
      object: 'Cat', // exists in graph
    });
    const result = processClassification(action, graph, indices, {}, adapter);

    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('homonymDisambiguation');
    expect(result.prompts[0]['fandaws:context'].allowCreate).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-06: Only 1 hidden-label match → auto-resolves
// ─────────────────────────────────────────────────────────

describe('DIS-06: Single hidden-label match auto-resolves', () => {
  it('auto-resolves without prompt when only one homonym matches', () => {
    // Graph with only one mouse homonym (rodent version)
    const root = makeConcept('iri:root', 'Root', 'root');
    const biology = makeConcept('iri:biology', 'Biology', 'biology', 'iri:root');
    const rodent = makeConcept('iri:rodent', 'Rodent', 'rodent', 'iri:biology');
    const mouseRodent = makeConcept('iri:mouse-rodent', 'Mouse (rodent)', 'mouse (rodent)', 'iri:rodent', {
      'skos:altLabel': ['mouse'],
    });
    const mammal = makeConcept('iri:mammal', 'Mammal', 'mammal', 'iri:biology');
    const concepts = [root, biology, rodent, mouseRodent, mammal];
    const adapter = makeAdapter(concepts);
    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);

    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'Mouse',
      object: 'Mammal',
    });
    // With adapter, "mouse" has no canonical match but one hidden-label match
    const result = processClassification(action, graph, indices, {}, adapter);

    // Should auto-resolve to mouse-rodent and proceed (no prompt)
    expect(result.prompts).toHaveLength(0);
    // Should produce a mutation (reclassify mouse-rodent under mammal)
    // Proximity check: rodent → mammal are siblings under biology → 2 steps → within threshold
    expect(result.mutation).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// DIS-07: No canonical or hidden match → notFound
// ─────────────────────────────────────────────────────────

describe('DIS-07: No match — existing behavior', () => {
  it('falls through to Case B/C (new concept) when no match found', () => {
    const root = makeConcept('iri:root', 'Root', 'root');
    const animal = makeConcept('iri:animal', 'Animal', 'animal', 'iri:root');
    const concepts = [root, animal];
    const adapter = makeAdapter(concepts);
    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);

    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'Unicorn',
      object: 'Animal',
    });
    const result = processClassification(action, graph, indices, {}, adapter);

    // No match for "unicorn" → Case B: create new concept
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    expect(result.mutation['fandaws:additions']).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-08: Qualified label typed directly → canonical match
// ─────────────────────────────────────────────────────────

describe('DIS-08: Qualified label matches canonically', () => {
  it('resolves directly without disambiguation', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    const adapter = makeAdapter(concepts);

    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'Mouse (rodent)',
      object: 'Cat',
    });
    const result = processClassification(action, graph, indices, {}, adapter);

    // "mouse (rodent)" matches canonically — no disambiguation needed
    expect(result.prompts.every(
      (p) => p['fandaws:promptType'] !== 'homonymDisambiguation',
    )).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-09: 3 homonyms → shows all 3 + "Neither"
// ─────────────────────────────────────────────────────────

describe('DIS-09: Three homonyms in classification', () => {
  it('shows all 3 candidates + Neither option', () => {
    const root = makeConcept('iri:root', 'Root', 'root');
    const bio = makeConcept('iri:bio', 'Biology', 'biology', 'iri:root');
    const tech = makeConcept('iri:tech', 'Technology', 'technology', 'iri:root');
    const sports = makeConcept('iri:sports', 'Sports', 'sports', 'iri:root');
    const m1 = makeConcept('iri:m1', 'Mouse (rodent)', 'mouse (rodent)', 'iri:bio', {
      'skos:altLabel': ['mouse'],
    });
    const m2 = makeConcept('iri:m2', 'Mouse (device)', 'mouse (device)', 'iri:tech', {
      'skos:altLabel': ['mouse'],
    });
    const m3 = makeConcept('iri:m3', 'Mouse (quiet person)', 'mouse (quiet person)', 'iri:sports', {
      'skos:altLabel': ['mouse'],
    });
    const cat = makeConcept('iri:cat', 'Cat', 'cat', 'iri:bio');
    const concepts = [root, bio, tech, sports, m1, m2, m3, cat];
    const adapter = makeAdapter(concepts);
    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);

    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'Mouse',
      object: 'Cat',
    });
    const result = processClassification(action, graph, indices, {}, adapter);

    expect(result.prompts).toHaveLength(1);
    const ctx = result.prompts[0]['fandaws:context'];
    expect(ctx.candidates).toHaveLength(3);
    expect(ctx.allowCreate).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-10: "Neither" + relabelExisting=false → 3rd homonym created
// ─────────────────────────────────────────────────────────

describe('DIS-10: Neither creates new homonym without relabeling', () => {
  it('creates 3rd homonym with relabelExisting=false', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    const adapter = makeAdapter(concepts);
    const mammal = makeConcept('iri:mammal', 'Mammal', 'mammal', 'iri:biology');
    const allConcepts = [...concepts, mammal];
    const allGraph = makeGraph(allConcepts);
    const allIndices = buildIndices(allConcepts);
    const allAdapter = makeAdapter(allConcepts);

    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'Mouse',
      object: 'Mammal',
    });
    const result = processClassification(action, allGraph, allIndices, {
      disambiguationAction: 'create_new',
      reclassificationConfirmed: 'new_concept',
      relabelExisting: false,
      qualifiers: {
        existing: '',  // not used when relabelExisting=false
        new: 'mouse (mammal)',
      },
    }, allAdapter);

    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(1);
    expect(additions[0]['skos:prefLabel']).toBe('mouse (mammal)');
    // No modifications to existing homonyms
    const mods = result.mutation['fandaws:modifications'] || [];
    expect(mods).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// DIS-11: Chained resolution — objectResolution fires before disambiguation
// ─────────────────────────────────────────────────────────

describe('DIS-11: Classification with resolved subject IRI', () => {
  it('uses resolvedConceptIri to skip disambiguation', () => {
    const { concepts, graph, indices } = makeHomonymGraph();
    const adapter = makeAdapter(concepts);

    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'Mouse',
      object: 'Cat',
    });
    const result = processClassification(action, graph, indices, {
      resolvedConceptIri: 'iri:mouse-rodent',
    }, adapter);

    // Should skip disambiguation and proceed to Case A
    expect(result.prompts.every(
      (p) => p['fandaws:promptType'] !== 'homonymDisambiguation',
    )).toBe(true);
  });
});
