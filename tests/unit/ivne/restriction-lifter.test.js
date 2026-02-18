/**
 * Restriction Lifter (τ_R) — Unit Tests
 *
 * Tests the safe re-folding rule, restriction inlining,
 * named restriction creation, and cardinality dual representation.
 */

import { describe, it, expect } from '@jest/globals';
import { liftRestrictions } from '../../../src/core/ivne/restriction-lifter.js';

const DEFAULT_CONFIG = {
  locale: 'en',
  hashPrefixLength: 12,
};

const DEFAULT_CONTEXT = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  sourceOntology: 'http://example.org/test.owl',
  scope: 'fandaws:scope/default',
};

function makeConcept(iri) {
  return {
    '@id': iri,
    '@type': 'fandaws:Concept',
    'fandaws:properties': [],
  };
}

function makeConceptMap(iris) {
  const map = new Map();
  for (const iri of iris) {
    map.set(iri, makeConcept(iri));
  }
  return map;
}

// ── Safe Re-folding (Inline) ──

describe('liftRestrictions — safe re-folding', () => {
  it('inlines a singly-referenced, non-anchored, non-lossy restriction', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/dog',
        property: 'hasFur',
        filler: 'fandaws:class/fur',
        quantifier: 'existential',
        type: 'Existential',
        sourceAxiom: 'Dog SubClassOf hasFur some Fur',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/dog']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.statistics.inlined).toBe(1);
    expect(result.statistics.named).toBe(0);
    // Check that the concept now has a property
    const dog = conceptMap.get('fandaws:class/dog');
    expect(dog['fandaws:properties']).toHaveLength(1);
    expect(dog['fandaws:properties'][0]['fandaws:value']).toBe('fandaws:class/fur');
  });

  it('sets quantifier on inlined property', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'has_color',
        filler: 'fandaws:class/color',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/x']);

    liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    const x = conceptMap.get('fandaws:class/x');
    expect(x['fandaws:properties'][0]['fandaws:quantifier']).toBe('existential');
  });
});

// ── Named Restriction (Multi-Referenced) ──

describe('liftRestrictions — named restrictions', () => {
  it('names a multiply-referenced restriction', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/a',
        property: 'p',
        filler: 'fandaws:class/b',
        quantifier: 'existential',
        type: 'Existential',
      },
      {
        classIri: 'fandaws:class/a',
        property: 'p',
        filler: 'fandaws:class/b',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/a']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // Both references are to the same restriction key, so refCount = 2 → named
    expect(result.statistics.named).toBe(2);
    expect(result.namedRestrictions.length).toBeGreaterThanOrEqual(1);
  });

  it('names an anchored restriction even with refCount 1', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'p',
        filler: 'fandaws:class/y',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/x']);
    const anchored = new Set(['fandaws:class/x|p|fandaws:class/y|existential']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT, anchored);

    expect(result.statistics.named).toBe(1);
    expect(result.statistics.inlined).toBe(0);
  });

  it('names a loss-carrying restriction even with refCount 1', () => {
    const lossRecords = [
      {
        'fandaws:severity': 'lossy',
        'fandaws:affectedConcepts': ['fandaws:class/x'],
      },
    ];
    const restrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'p',
        filler: 'fandaws:class/y',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/x']);

    const result = liftRestrictions(restrictions, conceptMap, lossRecords, DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.statistics.named).toBe(1);
    expect(result.statistics.inlined).toBe(0);
  });

  it('names restriction nodes with hash-based IRIs', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/a',
        property: 'p',
        filler: 'fandaws:class/b',
        quantifier: 'existential',
        type: 'Existential',
      },
      {
        classIri: 'fandaws:class/a',
        property: 'p',
        filler: 'fandaws:class/b',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/a']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    for (const named of result.namedRestrictions) {
      expect(named['@id']).toMatch(/^fandaws:gen\//);
      expect(named['@type']).toBe('fandaws:RestrictionNode');
    }
  });
});

// ── Cardinality Dual Representation ──

describe('liftRestrictions — cardinality', () => {
  it('creates CardinalityConstraint for cardinality restrictions', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/car',
        property: 'has_wheel',
        filler: 'fandaws:class/wheel',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 4, max: 4, exact: 4, qualifiedOver: 'fandaws:class/wheel' },
        sourceAxiom: 'Car SubClassOf (has_wheel exactly 4 Wheel)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/car']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['@type']).toBe('fandaws:CardinalityConstraint');
    expect(result.cardinalityConstraints[0]['fandaws:exactCardinality']).toBe(4);
    expect(result.cardinalityConstraints[0]['fandaws:property']).toBe('has_wheel');
  });

  it('also processes existential component for cardinality restrictions', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/car',
        property: 'has_wheel',
        filler: 'fandaws:class/wheel',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 4, max: 4, exact: 4, qualifiedOver: null },
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/car']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // Should have both cardinality constraint AND inlined/named restriction
    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.statistics.totalRestrictions).toBe(1);
  });

  it('handles min-only cardinality', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/body',
        property: 'has_part',
        filler: 'fandaws:class/organ',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 1, max: null, exact: null, qualifiedOver: null },
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/body']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:minCardinality']).toBe(1);
    expect(result.cardinalityConstraints[0]['fandaws:maxCardinality']).toBeNull();
  });
});

// ── P6: Universal Weakening ──

describe('liftRestrictions — P6 universal', () => {
  it('emits universalWeakening loss record for universal restrictions', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/dog',
        property: 'eats',
        filler: 'fandaws:class/food',
        quantifier: 'universal',
        type: 'Universal',
        sourceAxiom: 'Dog SubClassOf eats only Food',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/dog']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.lossRecords).toHaveLength(1);
    expect(result.lossRecords[0]['fandaws:lossType']).toBe('universalWeakening');
    expect(result.lossRecords[0]['fandaws:severity']).toBe('degraded');
  });

  it('inlines universal restriction with correct quantifier', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'has_color',
        filler: 'fandaws:class/red',
        quantifier: 'universal',
        type: 'Universal',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/x']);

    liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    const x = conceptMap.get('fandaws:class/x');
    expect(x['fandaws:properties']).toHaveLength(1);
    expect(x['fandaws:properties'][0]['fandaws:quantifier']).toBe('universal');
  });

  it('does not emit universalWeakening for existential restrictions', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/dog',
        property: 'hasFur',
        filler: 'fandaws:class/fur',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/dog']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.lossRecords).toHaveLength(0);
  });
});

// ── Statistics ──

describe('liftRestrictions — statistics', () => {
  it('reports correct totals', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/a',
        property: 'p1',
        filler: 'fandaws:class/b',
        quantifier: 'existential',
        type: 'Existential',
      },
      {
        classIri: 'fandaws:class/c',
        property: 'p2',
        filler: 'fandaws:class/d',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/a', 'fandaws:class/c']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.statistics.totalRestrictions).toBe(2);
    expect(result.statistics.inlined).toBe(2);
    expect(result.statistics.named).toBe(0);
  });

  it('returns empty arrays when no restrictions', () => {
    const result = liftRestrictions([], new Map(), [], DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.namedRestrictions).toEqual([]);
    expect(result.cardinalityConstraints).toEqual([]);
    expect(result.statistics.totalRestrictions).toBe(0);
  });
});
