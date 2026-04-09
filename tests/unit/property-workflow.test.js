/**
 * PropertyWorkflow — unit tests.
 *
 * Tests processProperty: validation, unknown concept, disambiguation,
 * idempotency, scope narrowing integration, redundancy, mutation shape,
 * object resolution, descendant removals.
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
      makeConcept('fandaws:class/57466c9a-e0ce-5e75-9e77-9f4515a87abc/bat-animal', 'Bat'),
      makeConcept('fandaws:class/92570701-f1e1-5977-8cce-092757d30b01/bat-equipment', 'Bat'),
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
// Object resolution (property term not a concept)
// ─────────────────────────────────────────────────────────

describe('processProperty — object resolution', () => {
  it('returns objectResolution prompt when property term is not in graph', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const graph = makeGraph([animal]);
    const indices = buildIndices([animal]);
    const action = makeAction('animal', 'cells');
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('objectResolution');
    expect(result.prompts[0]['fandaws:text']).toContain('cells');
  });

  it('returns objectResolution after scope narrowing resolves', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const concepts = [animal, dog];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    // Scope narrowing resolved (parent=no), but fur is not a concept
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:promptType']).toBe('objectResolution');
  });
});

// ─────────────────────────────────────────────────────────
// Idempotency
// ─────────────────────────────────────────────────────────

describe('processProperty — idempotency', () => {
  it('returns no-op when subject already has the property', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    dog['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
        'fandaws:propertyLabel': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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

  it('returns no-op with legacy restriction (bare string owl:onProperty)', () => {
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog');
    dog['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
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
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const cells = makeConcept('fandaws:class/ee4a893c-e26b-5753-bf66-91cc5fa3c1c3/cell', 'Cell');
    const concepts = [animal, cells];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('animal', 'cells');
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    expect(result.prompts).toHaveLength(0);
    // Check mutation shape
    const additions = result.mutation['fandaws:additions'];
    expect(additions).toHaveLength(1);
    expect(additions[0]['@type']).toBe('owl:Restriction');
    expect(additions[0]['owl:onProperty']).toBe('fandaws:property/has');
    expect(additions[0]['owl:someValuesFrom']).toBe('fandaws:class/ee4a893c-e26b-5753-bf66-91cc5fa3c1c3/cell');
    expect(additions[0]['fandaws:verbLabel']).toBe('has');
    expect(additions[0]['fandaws:propertyLabel']).toBe('cell');
    expect(additions[0]['fandaws:attachedTo']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(additions[0]['fandaws:scope']).toBe('concept-specific');
  });
});

// ─────────────────────────────────────────────────────────
// Scope narrowing integration
// ─────────────────────────────────────────────────────────

describe('processProperty — scope narrowing', () => {
  it('returns scope narrowing prompt for non-root subject (before object resolution)', () => {
    // Scope narrowing runs before object resolution, so prompts appear
    // even if the property term isn't a concept yet.
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const fur = makeConcept('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', 'Fur');
    const concepts = [animal, dog, fur];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const result = processProperty(action, graph, indices);
    expect(result.error).toBe(false);
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.scopeContext).not.toBeNull();
    expect(result.scopeContext.subjectIri).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(result.scopeContext.propertyLabel).toBe('fur');
  });

  it('attaches to subject when parent=no', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const fur = makeConcept('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', 'Fur');
    const concepts = [animal, dog, fur];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:attachedTo']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    expect(additions[0]['fandaws:scope']).toBe('concept-specific');
  });

  it('attaches to parent when parent=yes', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const fur = makeConcept('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', 'Fur');
    const concepts = [animal, dog, fur];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    const additions = result.mutation['fandaws:additions'];
    expect(additions[0]['fandaws:attachedTo']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(additions[0]['fandaws:scope']).toBe('inherited');
  });
});

// ─────────────────────────────────────────────────────────
// Mutation shape
// ─────────────────────────────────────────────────────────

describe('processProperty — mutation shape', () => {
  it('generates correct restriction IRI', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const leg = makeConcept('fandaws:class/c1ed9147-d3d1-5f7c-8d3a-5ec1e8c2bd05/leg', 'Leg');
    leg['skos:prefLabel'] = 'leg';
    const concepts = [animal, leg];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    // Single-word plural canonicalizes to "leg" via singularization;
    // multi-word phrases bypass singularization (heuristic matrix #3)
    const action = makeAction('animal', 'legs');
    const result = processProperty(action, graph, indices);
    expect(result.mutation).not.toBeNull();
    const restriction = result.mutation['fandaws:additions'][0];
    // IRI derived from canonical labels: "animal" + "leg"
    expect(restriction['@id']).toMatch(/^fandaws:restriction\/.*\/animal--leg$/);
  });

  it('includes reason in mutation', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const cells = makeConcept('fandaws:class/ee4a893c-e26b-5753-bf66-91cc5fa3c1c3/cell', 'Cell');
    const concepts = [animal, cells];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('animal', 'cells');
    const result = processProperty(action, graph, indices);
    expect(result.mutation['fandaws:reason']).toContain('cells');
    expect(result.mutation['fandaws:reason']).toContain('Animal');
  });

  it('stores verb IRI in owl:onProperty, noun IRI in owl:someValuesFrom, and label in fandaws:propertyLabel', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const fur = makeConcept('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', 'Fur');
    const concepts = [animal, fur];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('animal', 'fur');
    const result = processProperty(action, graph, indices);
    expect(result.mutation).not.toBeNull();
    const restriction = result.mutation['fandaws:additions'][0];
    expect(restriction['owl:onProperty']).toBe('fandaws:property/has');
    expect(restriction['owl:someValuesFrom']).toBe('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur');
    expect(restriction['fandaws:verbLabel']).toBe('has');
    expect(restriction['fandaws:propertyLabel']).toBe('fur');
    expect(restriction['owl:hasValue']).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// Value type — owl:hasValue stays null for simple properties
// ─────────────────────────────────────────────────────────

describe('processProperty — owl:hasValue', () => {
  it('leaves owl:hasValue null even when property term is a known concept', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const fur = makeConcept('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', 'Fur');
    const graph = makeGraph([animal, fur]);
    const indices = buildIndices([animal, fur]);
    const action = makeAction('animal', 'fur');
    const result = processProperty(action, graph, indices);
    expect(result.mutation).not.toBeNull();
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
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    animal['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/6a2d686b-55d8-5bcb-bb44-f082f0a09482/animal--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
        'fandaws:propertyLabel': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
        'fandaws:scope': 'concept-specific',
      },
    ];
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const graph = makeGraph([animal, dog]);
    const indices = buildIndices([animal, dog]);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });
    expect(result.error).toBe(false);
    expect(result.mutation).toBeNull();
  });

  it('rejects via redundancy check when ancestor has property and attaching to descendant', () => {
    // animal has "cell" — scope says attach to dog (parent=no) → ancestor overlap
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    animal['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/a255093d-7524-5477-9bff-d7abfac06d52/animal--cell',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fandaws:class/ee4a893c-e26b-5753-bf66-91cc5fa3c1c3/cell',
        'fandaws:propertyLabel': 'cell',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
        'fandaws:scope': 'concept-specific',
      },
    ];
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    const cells = makeConcept('fandaws:class/ee4a893c-e26b-5753-bf66-91cc5fa3c1c3/cell', 'Cell');
    const graph = makeGraph([animal, dog, cells]);
    const indices = buildIndices([animal, dog, cells]);
    const action = makeAction('dog', 'cells');
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false]]);
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
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal');
    const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    dog['rdfs:subClassOf'] = [
      {
        '@id': 'fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur',
        '@type': 'owl:Restriction',
        'owl:onProperty': 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
        'fandaws:propertyLabel': 'fur',
        'fandaws:restrictionKind': 'property',
        'fandaws:attachedTo': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        'fandaws:scope': 'concept-specific',
      },
    ];
    const fur = makeConcept('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', 'Fur');
    const graph = makeGraph([animal, dog, fur]);
    const indices = buildIndices([animal, dog, fur]);
    const action = makeAction('dog', 'fur');
    const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', true]]);
    const result = processProperty(action, graph, indices, { scopeDecisions: decisions });

    // Should NOT be rejected — descendant overlap is informational
    expect(result.error).toBe(false);
    expect(result.mutation).not.toBeNull();
    expect(result.descendantRemovals).toHaveLength(1);
    expect(result.descendantRemovals[0].conceptIri).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');

    // Mutation should include modifications to remove descendant's copy
    const mods = result.mutation['fandaws:modifications'];
    expect(mods.length).toBeGreaterThan(0);
    expect(mods[0]['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });
});

// ─────────────────────────────────────────────────────────
// Leap Check disabled
// ─────────────────────────────────────────────────────────

describe('processProperty — leapCheckEnabled: false', () => {
  it('uses full walk when Leap Check disabled', () => {
    const concepts = [
      makeConcept('fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', 'Entity'),
      makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity'),
      makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
    ];
    const graph = makeGraph(concepts);
    const indices = buildIndices(concepts);
    const action = makeAction('dog', 'fur');
    const result = processProperty(action, graph, indices, { leapCheckEnabled: false });
    // Full walk: asks one ancestor at a time, starting with parent
    // Scope narrowing runs before object resolution
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]['fandaws:text']).toContain('Animal');
  });
});
