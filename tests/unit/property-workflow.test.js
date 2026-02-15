/**
 * PropertyWorkflow — unit tests.
 *
 * Tests processProperty: validation, unknown concept, disambiguation,
 * idempotency, scope narrowing integration, redundancy, mutation shape,
 * value types, descendant removals.
 */

import { describe, it, expect } from '@jest/globals';
import { processProperty } from '../../src/core/knowledge-engine/property-workflow.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createClassificationAction } from '../../src/types/classification-action.js';

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

function makeAction(subject, property) {
  return createClassificationAction({
    workflow: 'property',
    subject,
    object: property,
  });
}

function buildIndices(concepts) {
  const canonicalLabelToIri = new Map();
  const iriToParent = new Map();
  const iriToChildren = new Map();
  const iriToProperties = new Map();
  const iriToReverseRelationships = new Map();

  for (const c of concepts) {
    const iri = c['@id'];
    const parent = c['skos:broader'] || null;
    canonicalLabelToIri.set(c['skos:prefLabel'], iri);
    iriToParent.set(iri, parent);
    if (!iriToChildren.has(iri)) iriToChildren.set(iri, new Set());
    if (parent) {
      if (!iriToChildren.has(parent)) iriToChildren.set(parent, new Set());
      iriToChildren.get(parent).add(iri);
    }
  }

  return { canonicalLabelToIri, iriToParent, iriToChildren, iriToProperties, iriToReverseRelationships };
}

// ─────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────

describe('processProperty — validation', () => {
  it('rejects invalid workflow', () => {
    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'dog',
      object: 'animal',
    });
    const graph = makeGraph([]);
    const indices = buildIndices([]);
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('invalid-workflow');
  });

  it('rejects null action', () => {
    const result = processProperty(null, makeGraph([]), buildIndices([]));
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('invalid-workflow');
  });

  it('rejects missing operands', () => {
    const action = {
      '@type': 'fandaws:ClassificationAction',
      'fandaws:workflow': 'property',
      'fandaws:subject': null,
      'fandaws:object': 'fur',
    };
    const result = processProperty(action, makeGraph([]), buildIndices([]));
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('missing-operands');
  });
});

// ─────────────────────────────────────────────────────────
// Unknown subject
// ─────────────────────────────────────────────────────────

describe('processProperty — unknown subject', () => {
  it('returns "classify first" prompt when subject not in graph', () => {
    const action = makeAction('unicorn', 'horn');
    const graph = makeGraph([]);
    const indices = buildIndices([]);
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('classify');
  });
});

// ─────────────────────────────────────────────────────────
// Disambiguation
// ─────────────────────────────────────────────────────────

describe('processProperty — disambiguation', () => {
  it('returns disambiguation prompt when multiple subjects match', () => {
    const concepts = [
      makeConcept('fandaws:concept/bat-animal', 'Bat'),
      makeConcept('fandaws:concept/bat-equipment', 'Bat'),
    ];
    // Both have prefLabel "bat"
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('bat', 'wings');
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('disambiguation');
  });
});

// ─────────────────────────────────────────────────────────
// Idempotency
// ─────────────────────────────────────────────────────────

describe('processProperty — idempotency', () => {
  it('returns no-op when subject already has the property', () => {
    const dog = makeConcept('fandaws:concept/dog', 'Dog');
    dog['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/dog--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:concept/dog',
        'fandaws:scope': 'concept-specific',
      },
    ];
    const graph = makeGraph([dog]);
    const indices = buildIndices([dog]);
    const action = makeAction('dog', 'fur');
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// Root concept (no scope narrowing needed)
// ─────────────────────────────────────────────────────────

describe('processProperty — root concept', () => {
  it('attaches directly to root with no scope narrowing', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const graph = makeGraph([animal]);
    const indices = buildIndices([animal]);
    const action = makeAction('animal', 'cells');
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    expect(result.prompts).toHaveLength(0);
    // Check mutation shape
    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(1);
    expect(additions[0]['@type']).toBe('owl:Restriction');
    expect(additions[0]['owl:onProperty']).toBe('cells');
    expect(additions[0]['fandaws:attachedTo']).toBe('fandaws:concept/animal');
    expect(additions[0]['fandaws:scope']).toBe('concept-specific');
  });
});

// ─────────────────────────────────────────────────────────
// Scope narrowing integration
// ─────────────────────────────────────────────────────────

describe('processProperty — scope narrowing', () => {
  const concepts = [
    makeConcept('fandaws:concept/animal', 'Animal'),
    makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
  ];

  it('returns scope narrowing prompt for non-root subject', () => {
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.scopeContext).not.toBeNull();
    expect(result.scopeContext.subjectIri).toBe('fandaws:concept/dog');
    expect(result.scopeContext.propertyLabel).toBe('fur');
  });

  it('attaches to subject when parent=no', () => {
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:concept/animal', false]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:attachedTo']).toBe('fandaws:concept/dog');
    expect(additions[0]['fandaws:scope']).toBe('concept-specific');
  });

  it('attaches to parent when parent=yes', () => {
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:concept/animal', true]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:attachedTo']).toBe('fandaws:concept/animal');
    expect(additions[0]['fandaws:scope']).toBe('inherited');
  });
});

// ─────────────────────────────────────────────────────────
// Mutation shape
// ─────────────────────────────────────────────────────────

describe('processProperty — mutation shape', () => {
  it('generates correct restriction IRI', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const graph = makeGraph([animal]);
    const indices = buildIndices([animal]);
    const action = makeAction('animal', 'four legs');
    const result = processProperty(action, graph, indices);
    expect(result.mutation).not.toBeNull();
    const restriction = result.mutation['fandaws:additions'][0];
    expect(restriction['@id']).toBe('fandaws:restriction/animal--four-legs');
  });

  it('includes reason in mutation', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const graph = makeGraph([animal]);
    const indices = buildIndices([animal]);
    const action = makeAction('animal', 'cells');
    const result = processProperty(action, graph, indices);
    expect(result.mutation['fandaws:reason']).toContain('cells');
    expect(result.mutation['fandaws:reason']).toContain('Animal');
  });
});

// ─────────────────────────────────────────────────────────
// Value type detection
// ─────────────────────────────────────────────────────────

describe('processProperty — value type detection', () => {
  it('sets owl:hasValue when property term matches a known concept', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const fur = makeConcept('fandaws:concept/fur', 'Fur');
    const graph = makeGraph([animal, fur]);
    const indices = buildIndices([animal, fur]);
    const action = makeAction('animal', 'fur');
    const result = processProperty(action, graph, indices);
    expect(result.mutation).not.toBeNull();
    const restriction = result.mutation['fandaws:additions'][0];
    expect(restriction['owl:hasValue']).toBe('fandaws:concept/fur');
  });

  it('leaves owl:hasValue as null when property term is not a concept', () => {
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const graph = makeGraph([animal]);
    const indices = buildIndices([animal]);
    const action = makeAction('animal', 'cells');
    const result = processProperty(action, graph, indices);
    const restriction = result.mutation['fandaws:additions'][0];
    expect(restriction['owl:hasValue']).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// Redundancy — duplicate
// ─────────────────────────────────────────────────────────

describe('processProperty — redundancy', () => {
  it('returns no-op when attachment point already has the property (idempotent)', () => {
    // animal already has "fur" — scope narrowing says attach to animal → idempotent no-op
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    animal['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/animal--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:concept/animal',
        'fandaws:scope': 'concept-specific',
      },
    ];
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
    const graph = makeGraph([animal, dog]);
    const indices = buildIndices([animal, dog]);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:concept/animal', true]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
  });

  it('rejects via redundancy check when ancestor has property and attaching to descendant', () => {
    // animal has "cells" — scope says attach to dog (parent=no) → ancestor overlap
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    animal['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/animal--cells',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'cells',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:concept/animal',
        'fandaws:scope': 'concept-specific',
      },
    ];
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
    const graph = makeGraph([animal, dog]);
    const indices = buildIndices([animal, dog]);
    const action = makeAction('dog', 'cells');
    const decisions = new Map([['fandaws:concept/animal', false]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('redundancy-violation');
  });
});

// ─────────────────────────────────────────────────────────
// Descendant removal
// ─────────────────────────────────────────────────────────

describe('processProperty — descendant removal', () => {
  it('includes descendant removal modifications when promoting property', () => {
    // dog has "fur", we attach "fur" to animal — dog's copy should be removed
    const animal = makeConcept('fandaws:concept/animal', 'Animal');
    const dog = makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal');
    dog['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/dog--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:concept/dog',
        'fandaws:scope': 'concept-specific',
      },
    ];
    const graph = makeGraph([animal, dog]);
    const indices = buildIndices([animal, dog]);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:concept/animal', true]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });

    // Should NOT be rejected — descendant overlap is informational
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    expect(result.descendantRemovals).toHaveLength(1);
    expect(result.descendantRemovals[0].conceptIri).toBe('fandaws:concept/dog');

    // Mutation should include modifications to remove descendant's copy
    const mods = result.mutation['fandaws:modifications'];
    expect(mods.length).toBeGreaterThan(0);
    expect(mods[0]['@id']).toBe('fandaws:concept/dog');
  });
});

// ─────────────────────────────────────────────────────────
// Leap Check disabled
// ─────────────────────────────────────────────────────────

describe('processProperty — leapCheckEnabled: false', () => {
  it('uses full walk when Leap Check disabled', () => {
    const concepts = [
      makeConcept('fandaws:concept/entity', 'Entity'),
      makeConcept('fandaws:concept/animal', 'Animal', 'fandaws:concept/entity'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/animal'),
    ];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const result = processProperty(action, graph, indices, { leapCheckEnabled: false });
    // Full walk: asks one ancestor at a time, starting with parent
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Animal');
  });
});
