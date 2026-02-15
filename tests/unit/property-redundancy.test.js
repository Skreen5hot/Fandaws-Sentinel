/**
 * Property Redundancy — unit tests.
 *
 * v2.1: Properties are owl:Restriction entries in rdfs:subClassOf.
 *        Uses owl:onProperty instead of fandaws:label.
 */

import { describe, it, expect } from '@jest/globals';
import { checkPropertyRedundancy } from '../../src/core/validator/property-redundancy.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeConcept(id, label, broader = null, restrictions = []) {
  const concept = createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
  if (restrictions.length > 0) {
    concept['rdfs:subClassOf'] = [...concept['rdfs:subClassOf'], ...restrictions];
  }
  return concept;
}

function makePropertyRestriction(id, propertyIri) {
  return {
    '@id': id,
    '@type': 'owl:Restriction',
    'owl:onProperty': propertyIri,
    'fandaws:restrictionKind': 'property',
  };
}

function makeProperty(id, propertyIri, attachedTo) {
  return createProperty({ id, propertyIri, attachedTo });
}

// ─────────────────────────────────────────────────────────
// Check 1: No Duplicates
// ─────────────────────────────────────────────────────────

describe('Check 1: No Duplicates', () => {
  it('returns no violations when concept has no existing properties', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const prop = makeProperty(
      'fandaws:prop/fur',
      'fur',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations).toEqual([]);
  });

  it('detects duplicate property label on same concept', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog', null, [
        makePropertyRestriction('fandaws:prop/fur', 'fur'),
      ]),
    ]);
    const prop = makeProperty(
      'fandaws:prop/fur2',
      'fur',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toBe('duplicateProperty');
    expect(violations[0].propertyLabel).toBe('fur');
  });

  it('allows different property labels on same concept', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog', null, [
        makePropertyRestriction('fandaws:prop/fur', 'fur'),
      ]),
    ]);
    const prop = makeProperty(
      'fandaws:prop/legs',
      'legs',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Check 2: No Ancestor Overlap
// ─────────────────────────────────────────────────────────

describe('Check 2: No Ancestor Overlap', () => {
  it('detects property overlap with direct parent', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal', null, [
        makePropertyRestriction('fandaws:prop/fur', 'fur'),
      ]),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const prop = makeProperty(
      'fandaws:prop/dog-fur',
      'fur',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toBe('ancestorPropertyOverlap');
    expect(violations[0].ancestorIri).toBe('fandaws:concept/mammal');
  });

  it('detects property overlap with grandparent', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal', null, [
        makePropertyRestriction('fandaws:prop/alive', 'alive'),
      ]),
      makeConcept(
        'fandaws:concept/mammal',
        'Mammal',
        'fandaws:concept/animal',
      ),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const prop = makeProperty(
      'fandaws:prop/dog-alive',
      'alive',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toBe('ancestorPropertyOverlap');
    expect(violations[0].ancestorIri).toBe('fandaws:concept/animal');
  });

  it('returns no violation when ancestor has different property', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal', null, [
        makePropertyRestriction('fandaws:prop/warm-blooded', 'warm-blooded'),
      ]),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const prop = makeProperty(
      'fandaws:prop/bark',
      'bark',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations).toEqual([]);
  });

  it('handles stakeholder scenario: dog has fur when mammal already has fur', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal', null, [
        makePropertyRestriction('fandaws:prop/fur', 'fur'),
      ]),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const prop = makeProperty(
      'fandaws:prop/dog-fur',
      'fur',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations[0].reason).toBe('ancestorPropertyOverlap');
    expect(violations[0].propertyLabel).toBe('fur');
  });
});

// ─────────────────────────────────────────────────────────
// Check 3: Descendant Overlap
// ─────────────────────────────────────────────────────────

describe('Check 3: Descendant Overlap', () => {
  it('detects descendant with same property label', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal', [
        makePropertyRestriction('fandaws:prop/fur', 'fur'),
      ]),
    ]);
    const prop = makeProperty(
      'fandaws:prop/mammal-fur',
      'fur',
      'fandaws:concept/mammal',
    );
    const { descendantRemovals } = checkPropertyRedundancy(prop, graph);
    expect(descendantRemovals.length).toBe(1);
    expect(descendantRemovals[0].conceptIri).toBe('fandaws:concept/dog');
    expect(descendantRemovals[0].propertyLabel).toBe('fur');
  });

  it('returns empty descendantRemovals when no overlap', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal', [
        makePropertyRestriction('fandaws:prop/bark', 'bark'),
      ]),
    ]);
    const prop = makeProperty(
      'fandaws:prop/mammal-fur',
      'fur',
      'fandaws:concept/mammal',
    );
    const { descendantRemovals } = checkPropertyRedundancy(prop, graph);
    expect(descendantRemovals).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Check 4: Inherited Redundancy (stub)
// ─────────────────────────────────────────────────────────

describe('Check 4: Inherited Redundancy (stub)', () => {
  it('always passes (deferred to Phase 6)', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const prop = makeProperty(
      'fandaws:prop/fur',
      'fur',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(
      violations.filter((v) => v.reason === 'inheritedRedundancy'),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles property with missing label gracefully', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const prop = { '@type': 'owl:Restriction', 'fandaws:attachedTo': 'fandaws:concept/dog', 'fandaws:restrictionKind': 'property' };
    const { violations, descendantRemovals } = checkPropertyRedundancy(
      prop,
      graph,
    );
    expect(violations).toEqual([]);
    expect(descendantRemovals).toEqual([]);
  });

  it('handles property with missing attachedTo gracefully', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const prop = { '@type': 'owl:Restriction', 'owl:onProperty': 'fur', 'fandaws:restrictionKind': 'property' };
    const { violations, descendantRemovals } = checkPropertyRedundancy(
      prop,
      graph,
    );
    expect(violations).toEqual([]);
    expect(descendantRemovals).toEqual([]);
  });

  it('handles concept not in graph (new concept via additions)', () => {
    const graph = makeGraph([]);
    const prop = makeProperty(
      'fandaws:prop/fur',
      'fur',
      'fandaws:concept/dog',
    );
    const { violations } = checkPropertyRedundancy(prop, graph);
    expect(violations).toEqual([]);
  });
});
