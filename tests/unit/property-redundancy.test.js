/**
 * Property Redundancy — unit tests.
 *
 * Covers: duplicate detection, ancestor overlap, descendant overlap,
 * inherited redundancy stub (check 4), edge cases.
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

function makeConcept(id, label, parent = null, properties = []) {
  return {
    ...createConcept({
      id,
      displayLabel: label,
      canonicalLabel: label.toLowerCase(),
      parent,
    }),
    'fandaws:properties': properties,
  };
}

function makeProperty(id, label, attachedTo) {
  return createProperty({ id, label, attachedTo });
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
      makeConcept('fandaws:concept/dog', 'Dog', null, ['fandaws:prop/fur']),
    ]);
    const prop = makeProperty(
      'fandaws:prop/fur2',
      'fur',
      'fandaws:concept/dog',
    );
    const labels = new Map([['fandaws:prop/fur', 'fur']]);
    const { violations } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].reason).toBe('duplicateProperty');
    expect(violations[0].propertyLabel).toBe('fur');
  });

  it('allows different property labels on same concept', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/dog', 'Dog', null, ['fandaws:prop/fur']),
    ]);
    const prop = makeProperty(
      'fandaws:prop/legs',
      'legs',
      'fandaws:concept/dog',
    );
    const labels = new Map([['fandaws:prop/fur', 'fur']]);
    const { violations } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
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
        'fandaws:prop/fur',
      ]),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const prop = makeProperty(
      'fandaws:prop/dog-fur',
      'fur',
      'fandaws:concept/dog',
    );
    const labels = new Map([['fandaws:prop/fur', 'fur']]);
    const { violations } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toBe('ancestorPropertyOverlap');
    expect(violations[0].ancestorIri).toBe('fandaws:concept/mammal');
  });

  it('detects property overlap with grandparent', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/animal', 'Animal', null, [
        'fandaws:prop/alive',
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
    const labels = new Map([['fandaws:prop/alive', 'alive']]);
    const { violations } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toBe('ancestorPropertyOverlap');
    expect(violations[0].ancestorIri).toBe('fandaws:concept/animal');
  });

  it('returns no violation when ancestor has different property', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal', null, [
        'fandaws:prop/warm-blooded',
      ]),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const prop = makeProperty(
      'fandaws:prop/bark',
      'bark',
      'fandaws:concept/dog',
    );
    const labels = new Map([['fandaws:prop/warm-blooded', 'warm-blooded']]);
    const { violations } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
    expect(violations).toEqual([]);
  });

  it('handles stakeholder scenario: dog has fur when mammal already has fur', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal', null, [
        'fandaws:prop/fur',
      ]),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal'),
    ]);
    const prop = makeProperty(
      'fandaws:prop/dog-fur',
      'fur',
      'fandaws:concept/dog',
    );
    const labels = new Map([['fandaws:prop/fur', 'fur']]);
    const { violations } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
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
        'fandaws:prop/fur',
      ]),
    ]);
    const prop = makeProperty(
      'fandaws:prop/mammal-fur',
      'fur',
      'fandaws:concept/mammal',
    );
    const labels = new Map([['fandaws:prop/fur', 'fur']]);
    const { descendantRemovals } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
    expect(descendantRemovals.length).toBe(1);
    expect(descendantRemovals[0].conceptIri).toBe('fandaws:concept/dog');
    expect(descendantRemovals[0].propertyLabel).toBe('fur');
  });

  it('returns empty descendantRemovals when no overlap', () => {
    const graph = makeGraph([
      makeConcept('fandaws:concept/mammal', 'Mammal'),
      makeConcept('fandaws:concept/dog', 'Dog', 'fandaws:concept/mammal', [
        'fandaws:prop/bark',
      ]),
    ]);
    const prop = makeProperty(
      'fandaws:prop/mammal-fur',
      'fur',
      'fandaws:concept/mammal',
    );
    const labels = new Map([['fandaws:prop/bark', 'bark']]);
    const { descendantRemovals } = checkPropertyRedundancy(prop, graph, {
      propertyLabels: labels,
    });
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
    // Only checks 1-3 should generate violations; check 4 is a stub.
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
    const prop = { '@type': 'fandaws:Property', 'fandaws:attachedTo': 'fandaws:concept/dog' };
    const { violations, descendantRemovals } = checkPropertyRedundancy(
      prop,
      graph,
    );
    expect(violations).toEqual([]);
    expect(descendantRemovals).toEqual([]);
  });

  it('handles property with missing attachedTo gracefully', () => {
    const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog')]);
    const prop = { '@type': 'fandaws:Property', 'fandaws:label': 'fur' };
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
