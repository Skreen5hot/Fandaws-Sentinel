/**
 * Homonym creation — unit tests.
 *
 * Tests the new_concept handler in processClassification() Case A,
 * the hidden label index in InMemoryStateAdapter, and end-to-end
 * homonym creation with qualifying labels.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { processClassification } from '../../src/core/knowledge-engine/knowledge-engine.js';
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

function makeAction(subject, object) {
  return createClassificationAction({
    workflow: 'classification',
    subject,
    object,
  });
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
 * Standard "mouse under rodent" topology for homonym tests.
 *
 *   root → biology → organism → rodent → mouse
 *   root → technology → device → peripheral → input_device
 */
function makeMouseTopology() {
  const root = makeConcept('iri:root', 'Root', 'root');
  const biology = makeConcept('iri:biology', 'Biology', 'biology', 'iri:root');
  const organism = makeConcept('iri:organism', 'Organism', 'organism', 'iri:biology');
  const rodent = makeConcept('iri:rodent', 'Rodent', 'rodent', 'iri:organism');
  const mouse = makeConcept('iri:mouse', 'Mouse', 'mouse', 'iri:rodent');
  const technology = makeConcept('iri:tech', 'Technology', 'technology', 'iri:root');
  const device = makeConcept('iri:device', 'Device', 'device', 'iri:tech');
  const peripheral = makeConcept('iri:peripheral', 'Peripheral', 'peripheral', 'iri:device');
  const inputDevice = makeConcept('iri:input', 'Input device', 'input device', 'iri:peripheral');
  const concepts = [root, biology, organism, rodent, mouse, technology, device, peripheral, inputDevice];
  return { concepts, graph: makeGraph(concepts), indices: buildIndices(concepts) };
}

// ─────────────────────────────────────────────────────────
// HOM-01: new_concept + relabelExisting=true → both created/relabeled
// ─────────────────────────────────────────────────────────

describe('HOM-01: new_concept creates homonym and relabels existing', () => {
  it('creates new concept and modifies existing labels', () => {
    const { graph, indices } = makeMouseTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: {
        existing: 'mouse (rodent)',
        new: 'mouse (device)',
      },
    });

    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();

    // New concept added
    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(1);
    expect(additions[0]['skos:prefLabel']).toBe('mouse (device)');
    expect(additions[0]['rdfs:label']).toBe('Mouse (device)');
    expect(additions[0]['skos:broader']).toBe('iri:input');
    expect(additions[0]['skos:hiddenLabel']).toBe('mouse'); // bare label

    // Existing concept relabeled
    const mods = result.mutation['fandaws:modifications'];
    expect(mods.length).toBeGreaterThanOrEqual(3);
    const prefLabelMod = mods.find((m) => m['fandaws:field'] === 'skos:prefLabel');
    expect(prefLabelMod['fandaws:value']).toBe('mouse (rodent)');
    const labelMod = mods.find((m) => m['fandaws:field'] === 'rdfs:label');
    expect(labelMod['fandaws:value']).toBe('Mouse (rodent)');
    const hiddenMod = mods.find((m) => m['fandaws:field'] === 'skos:hiddenLabel');
    expect(hiddenMod['fandaws:value']).toBe('mouse');
  });
});

// ─────────────────────────────────────────────────────────
// HOM-02: Existing concept @id unchanged after relabeling
// ─────────────────────────────────────────────────────────

describe('HOM-02: Existing concept IRI unchanged', () => {
  it('does not regenerate the existing concept IRI', () => {
    const { graph, indices } = makeMouseTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    const mods = result.mutation['fandaws:modifications'];
    // All modifications target the existing IRI
    for (const mod of mods) {
      expect(mod['@id']).toBe('iri:mouse');
    }
  });
});

// ─────────────────────────────────────────────────────────
// HOM-03: New concept IRI generated from qualified prefLabel
// ─────────────────────────────────────────────────────────

describe('HOM-03: New concept IRI distinct from existing', () => {
  it('generates IRI from qualified canonical label', () => {
    const { graph, indices } = makeMouseTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    const additions = result.mutation['fandaws:additions'];
    // New IRI differs from the existing IRI
    expect(additions[0]['@id']).not.toBe('iri:mouse');
    // The IRI should contain the qualified label hash
    expect(additions[0]['@id']).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────
// HOM-04: Both concepts have skos:hiddenLabel set to bare label
// ─────────────────────────────────────────────────────────

describe('HOM-04: Both concepts get hiddenLabel = bare label', () => {
  it('sets hiddenLabel on both new and existing concepts', () => {
    const { graph, indices } = makeMouseTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    // New concept has hiddenLabel
    expect(result.mutation['fandaws:additions'][0]['skos:hiddenLabel']).toBe('mouse');

    // Existing concept gets hiddenLabel via modification
    const hiddenMod = result.mutation['fandaws:modifications'].find(
      (m) => m['fandaws:field'] === 'skos:hiddenLabel',
    );
    expect(hiddenMod).toBeDefined();
    expect(hiddenMod['fandaws:value']).toBe('mouse');
  });
});

// ─────────────────────────────────────────────────────────
// HOM-05: After mutation + index rebuild: canonicalLabelToIri updated
// ─────────────────────────────────────────────────────────

describe('HOM-05: Index has two qualified entries, bare label gone', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const { concepts } = makeMouseTopology();
    adapter.saveGraph(GRAPH_ID, makeGraph(concepts));
  });

  it('updates canonicalLabelToIri with qualified labels', () => {
    // First, get a new_concept mutation
    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    // Apply mutation
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const updatedIndices = adapter.getIndices(GRAPH_ID);

    // Bare "mouse" is gone (overwritten or replaced)
    expect(updatedIndices.canonicalLabelToIri.has('mouse')).toBe(false);

    // Both qualified labels exist
    expect(updatedIndices.canonicalLabelToIri.has('mouse (rodent)')).toBe(true);
    expect(updatedIndices.canonicalLabelToIri.has('mouse (device)')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// HOM-06: hiddenLabelToIri maps bare label → both IRIs
// ─────────────────────────────────────────────────────────

describe('HOM-06: hiddenLabelToIri maps bare label to both IRIs', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const { concepts } = makeMouseTopology();
    adapter.saveGraph(GRAPH_ID, makeGraph(concepts));
  });

  it('indexes bare label to both concept IRIs', () => {
    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    adapter.applyMutation(GRAPH_ID, result.mutation);

    const updatedIndices = adapter.getIndices(GRAPH_ID);
    const hiddenIris = updatedIndices.hiddenLabelToIri.get('mouse') || [];
    expect(hiddenIris).toHaveLength(2);
    expect(hiddenIris).toContain('iri:mouse'); // existing
  });
});

// ─────────────────────────────────────────────────────────
// HOM-07: findConceptsByHiddenLabel returns both concepts
// ─────────────────────────────────────────────────────────

describe('HOM-07: findConceptsByHiddenLabel returns both', () => {
  let adapter;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    const { concepts } = makeMouseTopology();
    adapter.saveGraph(GRAPH_ID, makeGraph(concepts));
  });

  it('returns both homonym concepts for bare label query', () => {
    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    adapter.applyMutation(GRAPH_ID, result.mutation);

    const matches = adapter.findConceptsByHiddenLabel('mouse', GRAPH_ID);
    expect(matches).toHaveLength(2);

    const labels = matches.map((c) => c['skos:prefLabel']);
    expect(labels).toContain('mouse (rodent)');
    expect(labels).toContain('mouse (device)');
  });
});

// ─────────────────────────────────────────────────────────
// HOM-08: Custom qualifier
// ─────────────────────────────────────────────────────────

describe('HOM-08: Custom qualifier for new concept', () => {
  it('creates new concept with custom prefLabel', () => {
    const { graph, indices } = makeMouseTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: {
        existing: 'mouse (rodent)',
        new: 'mouse (computer peripheral)',  // custom label
      },
    });

    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['skos:prefLabel']).toBe('mouse (computer peripheral)');
    expect(additions[0]['rdfs:label']).toBe('Mouse (computer peripheral)');
  });
});

// ─────────────────────────────────────────────────────────
// HOM-09: Serialize → deserialize → hidden label index rebuilt
// ─────────────────────────────────────────────────────────

describe('HOM-09: Serialization preserves hidden label index', () => {
  it('rebuilds hiddenLabelToIri after deserialize', () => {
    const adapter = new InMemoryStateAdapter();
    const { concepts } = makeMouseTopology();
    adapter.saveGraph(GRAPH_ID, makeGraph(concepts));

    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });
    adapter.applyMutation(GRAPH_ID, result.mutation);

    // Serialize + deserialize
    const snapshot = adapter.serialize();
    const restored = InMemoryStateAdapter.deserialize(snapshot);

    const restoredIndices = restored.getIndices(GRAPH_ID);
    const hiddenIris = restoredIndices.hiddenLabelToIri.get('mouse') || [];
    expect(hiddenIris).toHaveLength(2);

    // Method also works
    const matches = restored.findConceptsByHiddenLabel('mouse', GRAPH_ID);
    expect(matches).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────
// HOM-10: Properties on existing concept preserved
// ─────────────────────────────────────────────────────────

describe('HOM-10: Properties preserved after relabeling', () => {
  it('does not modify rdfs:subClassOf restrictions', () => {
    const { graph, indices } = makeMouseTopology();
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    // Modifications only touch prefLabel, label, hiddenLabel — not subClassOf
    const mods = result.mutation['fandaws:modifications'];
    const fields = mods.map((m) => m['fandaws:field']);
    expect(fields).not.toContain('rdfs:subClassOf');
  });
});

// ─────────────────────────────────────────────────────────
// HOM-11: Children of existing concept preserved
// ─────────────────────────────────────────────────────────

describe('HOM-11: Children preserved after relabeling', () => {
  it('does not change the existing concept broader pointer', () => {
    // Add a child under mouse
    const { concepts } = makeMouseTopology();
    const houseMouse = makeConcept('iri:house-mouse', 'House mouse', 'house mouse', 'iri:mouse');
    const allConcepts = [...concepts, houseMouse];
    const graph = makeGraph(allConcepts);
    const indices = buildIndices(allConcepts);

    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });

    // Modifications do not touch the existing IRI's broader
    const mods = result.mutation['fandaws:modifications'];
    const broaderMod = mods.find(
      (m) => m['@id'] === 'iri:mouse' && m['fandaws:field'] === 'skos:broader',
    );
    expect(broaderMod).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// HOM-12: verifyIntegrity returns empty after homonym creation
// ─────────────────────────────────────────────────────────

describe('HOM-12: verifyIntegrity clean after homonym creation', () => {
  it('returns empty ghost array', () => {
    const adapter = new InMemoryStateAdapter();
    const { concepts } = makeMouseTopology();
    adapter.saveGraph(GRAPH_ID, makeGraph(concepts));

    const graph = adapter.loadGraph(GRAPH_ID);
    const indices = adapter.getIndices(GRAPH_ID);
    const action = makeAction('Mouse', 'Input device');
    const result = processClassification(action, graph, indices, {
      reclassificationConfirmed: 'new_concept',
      relabelExisting: true,
      qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' },
    });
    adapter.applyMutation(GRAPH_ID, result.mutation);

    const ghosts = adapter.verifyIntegrity(GRAPH_ID);
    expect(ghosts).toHaveLength(0);
  });
});
