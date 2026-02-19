/**
 * Cardinality (P8) — Unit Tests (TB-01 through TB-20)
 *
 * Tests the restriction-lifter's per-type cardinality behavior:
 *   - min/exactly → existential floor + constraint + degraded loss
 *   - max → NO existential floor + constraint + lossy loss
 *   - max 0 → prohibition semantics
 *   - Deduplication, determinism, and integration with compile()
 */

import { describe, it, expect } from '@jest/globals';
import { liftRestrictions } from '../../../src/core/ivne/restriction-lifter.js';
import { compile } from '../../../src/core/ivne/ivne.js';
import { gateCardinality } from '../../../src/core/ivne/pre-filter.js';

const DEFAULT_CONFIG = {
  locale: 'en',
  hashPrefixLength: 12,
};

const DEFAULT_CONTEXT = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  sourceOntology: 'http://example.org/test.owl',
  scope: 'fandaws:scope/default',
  ivneRunId: 'ivne:run/test-001',
};

const FIXED_COMPILE_CONFIG = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  scope: 'fandaws:scope/test',
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

// ── Group 1: Restriction-Lifter Unit Tests ──

describe('restriction-lifter — cardinality per-type behavior', () => {
  // TB-01: min n → existential + constraint + degraded loss
  it('TB-01: min n produces existential + constraint + degraded loss', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/car',
        property: 'has_wheel',
        filler: 'fandaws:class/wheel',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 4, max: null, exact: null, qualifiedOver: 'fandaws:class/wheel' },
        sourceAxiom: 'Car SubClassOf (has_wheel min 4 Wheel)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/car']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // Existential floor created
    const car = conceptMap.get('fandaws:class/car');
    expect(car['fandaws:properties']).toHaveLength(1);
    expect(car['fandaws:properties'][0]['fandaws:value']).toBe('fandaws:class/wheel');

    // Constraint emitted
    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:minCardinality']).toBe(4);

    // Loss record: degraded cardinalityWeakening
    expect(result.lossRecords).toHaveLength(1);
    expect(result.lossRecords[0]['fandaws:lossType']).toBe('cardinalityWeakening');
    expect(result.lossRecords[0]['fandaws:severity']).toBe('degraded');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('Minimum cardinality 4');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('existential only');
  });

  // TB-02: max n → NO existential + constraint + lossy loss
  it('TB-02: max n produces NO existential + constraint + lossy loss', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/person',
        property: 'has_eye',
        filler: 'fandaws:class/eye',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: null, max: 2, exact: null, qualifiedOver: 'fandaws:class/eye' },
        sourceAxiom: 'Person SubClassOf (has_eye max 2 Eye)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/person']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // NO existential floor
    const person = conceptMap.get('fandaws:class/person');
    expect(person['fandaws:properties']).toHaveLength(0);

    // Constraint emitted
    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:maxCardinality']).toBe(2);

    // Loss record: lossy
    expect(result.lossRecords).toHaveLength(1);
    expect(result.lossRecords[0]['fandaws:lossType']).toBe('cardinalityWeakening');
    expect(result.lossRecords[0]['fandaws:severity']).toBe('lossy');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('Maximum cardinality 2');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('No existential floor');
  });

  // TB-03: max 0 → NO existential + constraint + lossy loss (prohibition)
  it('TB-03: max 0 produces NO existential + constraint + lossy loss (prohibition)', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/vegan',
        property: 'eats',
        filler: 'fandaws:class/meat',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: null, max: 0, exact: null, qualifiedOver: 'fandaws:class/meat' },
        sourceAxiom: 'Vegan SubClassOf (eats max 0 Meat)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/vegan']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // NO existential floor
    const vegan = conceptMap.get('fandaws:class/vegan');
    expect(vegan['fandaws:properties']).toHaveLength(0);

    // Constraint emitted with max 0
    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:maxCardinality']).toBe(0);

    // Loss: lossy
    expect(result.lossRecords).toHaveLength(1);
    expect(result.lossRecords[0]['fandaws:severity']).toBe('lossy');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('Maximum cardinality 0');
  });

  // TB-04: exactly n → existential + constraint + degraded loss
  it('TB-04: exactly n produces existential + constraint + degraded loss', () => {
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

    // Existential floor created
    const car = conceptMap.get('fandaws:class/car');
    expect(car['fandaws:properties']).toHaveLength(1);

    // Constraint
    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:exactCardinality']).toBe(4);

    // Loss: degraded (exact → existential + metadata)
    expect(result.lossRecords).toHaveLength(1);
    expect(result.lossRecords[0]['fandaws:severity']).toBe('degraded');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('Exact cardinality 4');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('existential only');
  });

  // TB-05: min 1 → existential + constraint + degraded (not collapsed to plain existential)
  it('TB-05: min 1 produces existential + constraint + degraded loss (not collapsed)', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/animal',
        property: 'has_heart',
        filler: 'fandaws:class/heart',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 1, max: null, exact: null, qualifiedOver: null },
        sourceAxiom: 'Animal SubClassOf (has_heart min 1 Heart)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/animal']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // Existential floor
    const animal = conceptMap.get('fandaws:class/animal');
    expect(animal['fandaws:properties']).toHaveLength(1);

    // Still produces constraint (min 1 is not the same as plain existential)
    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:minCardinality']).toBe(1);

    // Still emits loss record
    expect(result.lossRecords).toHaveLength(1);
    expect(result.lossRecords[0]['fandaws:severity']).toBe('degraded');
  });

  // TB-06: min 0 is handled by pre-filter (rejected as vacuous) — verify no constraint
  it('TB-06: min 0 is rejected by pre-filter (no constraint from lifter)', () => {
    // min 0 is vacuous and rejected at the flattener level by gateCardinality.
    // If somehow a min-0 restriction reaches the lifter, it would still produce a
    // constraint, but in the normal pipeline it never arrives here.
    // This test verifies the pre-filter rejects it.
    const gate = gateCardinality({
      type: 'Cardinality',
      minCardinality: 0,
      affectedClass: 'ex:A',
      property: 'ex:p',
      filler: 'ex:B',
    });
    expect(gate.action).toBe('reject');
    expect(gate.lossRecord['fandaws:lossType']).toBe('vacuousDrop');
  });

  // TB-07: Loss record sourceAxiom never empty for cardinality
  it('TB-07: loss record sourceAxiom is never empty for cardinality', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'p',
        filler: 'fandaws:class/y',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 2, max: null, exact: null, qualifiedOver: null },
        sourceAxiom: 'X SubClassOf (p min 2 Y)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/x']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.lossRecords[0]['fandaws:sourceAxiom']).toBe('X SubClassOf (p min 2 Y)');
    expect(result.lossRecords[0]['fandaws:sourceAxiom'].length).toBeGreaterThan(0);
  });

  // TB-08: lostSemantics varies by cardinality type
  it('TB-08: lostSemantics message varies by cardinality type', () => {
    const makeRestriction = (cardinality, axiom) => ({
      classIri: 'fandaws:class/x',
      property: 'p',
      filler: 'fandaws:class/y',
      quantifier: 'existential',
      type: 'Cardinality',
      cardinality,
      sourceAxiom: axiom,
    });

    // min
    const minR = [makeRestriction(
      { min: 3, max: null, exact: null, qualifiedOver: null },
      'X SubClassOf (p min 3 Y)',
    )];
    const minResult = liftRestrictions(minR, makeConceptMap(['fandaws:class/x']), [], DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(minResult.lossRecords[0]['fandaws:lostSemantics']).toContain('Minimum cardinality 3');

    // max
    const maxR = [makeRestriction(
      { min: null, max: 5, exact: null, qualifiedOver: null },
      'X SubClassOf (p max 5 Y)',
    )];
    const maxResult = liftRestrictions(maxR, makeConceptMap(['fandaws:class/x']), [], DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(maxResult.lossRecords[0]['fandaws:lostSemantics']).toContain('Maximum cardinality 5');
    expect(maxResult.lossRecords[0]['fandaws:lostSemantics']).toContain('No existential floor');

    // exactly
    const exactR = [makeRestriction(
      { min: 2, max: 2, exact: 2, qualifiedOver: null },
      'X SubClassOf (p exactly 2 Y)',
    )];
    const exactResult = liftRestrictions(exactR, makeConceptMap(['fandaws:class/x']), [], DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(exactResult.lossRecords[0]['fandaws:lostSemantics']).toContain('Exact cardinality 2');
  });
});

// ── Group 2: compile() Integration Tests ──

describe('compile — cardinality integration', () => {
  // TB-09: cardinalityConstraints appear on OntologyImportResult
  it('TB-09: cardinalityConstraints appear on OntologyImportResult', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/card.owl',
        classes: [
          { iri: 'ex:Car', annotations: [{ property: 'rdfs:label', value: 'Car' }], parents: [] },
          { iri: 'ex:Wheel', annotations: [{ property: 'rdfs:label', value: 'Wheel' }], parents: [] },
        ],
        restrictions: [
          {
            type: 'Cardinality',
            affectedClass: 'ex:Car',
            property: 'has_wheel',
            filler: 'ex:Wheel',
            minCardinality: 4,
            quantifier: 'existential',
            sourceAxiom: 'Car SubClassOf (has_wheel min 4 Wheel)',
          },
        ],
      },
      FIXED_COMPILE_CONFIG,
    );

    expect(result['fandaws:cardinalityConstraints']).toHaveLength(1);
    expect(result['fandaws:cardinalityConstraints'][0]['@type']).toBe('fandaws:CardinalityConstraint');
    expect(result['fandaws:cardinalityConstraints'][0]['fandaws:minCardinality']).toBe(4);
  });

  // TB-10: Mixed ontology (P1 SubClassOf + P3 Disjoint + P8 Cardinality) combined output
  it('TB-10: mixed ontology with P1, P3, and P8 axioms produces correct combined output', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/mixed.owl',
        classes: [
          { iri: 'ex:Animal', annotations: [{ property: 'rdfs:label', value: 'Animal' }], parents: [] },
          { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: ['ex:Animal'] },
          { iri: 'ex:Cat', annotations: [{ property: 'rdfs:label', value: 'Cat' }], parents: ['ex:Animal'] },
          { iri: 'ex:Leg', annotations: [{ property: 'rdfs:label', value: 'Leg' }], parents: [] },
        ],
        disjointness: [
          { type: 'DisjointWith', class1: 'ex:Dog', class2: 'ex:Cat' },
        ],
        restrictions: [
          {
            type: 'Cardinality',
            affectedClass: 'ex:Dog',
            property: 'has_leg',
            filler: 'ex:Leg',
            minCardinality: 4,
            quantifier: 'existential',
            sourceAxiom: 'Dog SubClassOf (has_leg min 4 Leg)',
          },
        ],
      },
      FIXED_COMPILE_CONFIG,
    );

    // Concepts created
    expect(result['fandaws:concepts'].length).toBeGreaterThanOrEqual(4);

    // Cardinality constraint
    expect(result['fandaws:cardinalityConstraints']).toHaveLength(1);

    // Loss record for cardinality
    const cardLoss = result['fandaws:semanticLossRecords'].find(
      (l) => l['fandaws:lossType'] === 'cardinalityWeakening',
    );
    expect(cardLoss).toBeDefined();
    expect(cardLoss['fandaws:severity']).toBe('degraded');
  });

  // TB-11: Multiple cardinality constraints on same concept
  it('TB-11: multiple cardinality constraints on same concept', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/multi.owl',
        classes: [
          { iri: 'ex:Car', annotations: [{ property: 'rdfs:label', value: 'Car' }], parents: [] },
          { iri: 'ex:Wheel', annotations: [{ property: 'rdfs:label', value: 'Wheel' }], parents: [] },
          { iri: 'ex:Door', annotations: [{ property: 'rdfs:label', value: 'Door' }], parents: [] },
        ],
        restrictions: [
          {
            type: 'Cardinality',
            affectedClass: 'ex:Car',
            property: 'has_wheel',
            filler: 'ex:Wheel',
            exactCardinality: 4,
            quantifier: 'existential',
            sourceAxiom: 'Car SubClassOf (has_wheel exactly 4 Wheel)',
          },
          {
            type: 'Cardinality',
            affectedClass: 'ex:Car',
            property: 'has_door',
            filler: 'ex:Door',
            minCardinality: 2,
            maxCardinality: 5,
            quantifier: 'existential',
            sourceAxiom: 'Car SubClassOf (has_door min 2 Door)',
          },
        ],
      },
      FIXED_COMPILE_CONFIG,
    );

    expect(result['fandaws:cardinalityConstraints']).toHaveLength(2);
    // Both get loss records
    const cardLosses = result['fandaws:semanticLossRecords'].filter(
      (l) => l['fandaws:lossType'] === 'cardinalityWeakening',
    );
    expect(cardLosses).toHaveLength(2);
  });

  // TB-12: max doesn't create duplicate existential (deduplication)
  it('TB-12: max-only restriction does not create existential property', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/human',
        property: 'has_eye',
        filler: 'fandaws:class/eye',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: null, max: 2, exact: null, qualifiedOver: null },
        sourceAxiom: 'Human SubClassOf (has_eye max 2 Eye)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/human']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // No existential property should exist
    const human = conceptMap.get('fandaws:class/human');
    expect(human['fandaws:properties']).toHaveLength(0);

    // But constraint still exists
    expect(result.cardinalityConstraints).toHaveLength(1);

    // And no named/inlined stats for the existential
    expect(result.statistics.inlined).toBe(0);
    expect(result.statistics.named).toBe(0);
  });

  // TB-13: Fidelity score weights cardinality correctly
  it('TB-13: fidelity score reflects cardinality loss severity', () => {
    // min → degraded (0.5 weight), max → lossy (1.0 weight)
    const { result: minResult } = compile(
      {
        ontologyIRI: 'http://example.org/min-only.owl',
        classes: [
          { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
          { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
        ],
        restrictions: [
          {
            type: 'Cardinality',
            affectedClass: 'ex:A',
            property: 'p',
            filler: 'ex:B',
            minCardinality: 3,
            quantifier: 'existential',
          },
        ],
      },
      FIXED_COMPILE_CONFIG,
    );

    const { result: maxResult } = compile(
      {
        ontologyIRI: 'http://example.org/max-only.owl',
        classes: [
          { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
          { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
        ],
        restrictions: [
          {
            type: 'Cardinality',
            affectedClass: 'ex:A',
            property: 'p',
            filler: 'ex:B',
            maxCardinality: 3,
            quantifier: 'existential',
          },
        ],
      },
      FIXED_COMPILE_CONFIG,
    );

    const minFidelity = minResult['fandaws:reductionManifest']['fandaws:statistics'].fidelityScore;
    const maxFidelity = maxResult['fandaws:reductionManifest']['fandaws:statistics'].fidelityScore;

    // min → degraded (0.5 penalty) → higher fidelity
    // max → lossy (1.0 penalty) → lower fidelity
    expect(minFidelity).toBeGreaterThan(maxFidelity);
  });
});

// ── Group 3: Determinism / Regression ──

describe('cardinality — determinism', () => {
  // TB-14: Cardinality output byte-identical across runs
  it('TB-14: cardinality output is byte-identical across runs', () => {
    const ontology = {
      ontologyIRI: 'http://example.org/det-card.owl',
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
      ],
      restrictions: [
        {
          type: 'Cardinality',
          affectedClass: 'ex:A',
          property: 'p',
          filler: 'ex:B',
          exactCardinality: 3,
          quantifier: 'existential',
          sourceAxiom: 'A SubClassOf (p exactly 3 B)',
        },
      ],
    };

    const result1 = compile(ontology, FIXED_COMPILE_CONFIG);
    const result2 = compile(ontology, FIXED_COMPILE_CONFIG);

    expect(result1.outputHash).toBe(result2.outputHash);
    expect(result1.canonicalJson).toBe(result2.canonicalJson);
  });

  // TB-15: Cardinality property IRI matches plain existential IRI
  it('TB-15: cardinality existential uses same IRI as a plain existential would', () => {
    // A min-cardinality restriction should produce a property with the same IRI
    // as a plain existential restriction on the same property+filler.
    const cardRestrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'has_part',
        filler: 'fandaws:class/y',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 2, max: null, exact: null, qualifiedOver: null },
      },
    ];
    const plainRestrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'has_part',
        filler: 'fandaws:class/y',
        quantifier: 'existential',
        type: 'Existential',
      },
    ];

    const cardMap = makeConceptMap(['fandaws:class/x']);
    const plainMap = makeConceptMap(['fandaws:class/x']);

    liftRestrictions(cardRestrictions, cardMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);
    liftRestrictions(plainRestrictions, plainMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    const cardProp = cardMap.get('fandaws:class/x')['fandaws:properties'][0];
    const plainProp = plainMap.get('fandaws:class/x')['fandaws:properties'][0];

    expect(cardProp['@id']).toBe(plainProp['@id']);
  });

  // TB-16: Reduction manifest stats include cardinality in property count
  it('TB-16: reduction manifest statistics reflect cardinality properties', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/stats.owl',
        classes: [
          { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
          { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
        ],
        restrictions: [
          {
            type: 'Cardinality',
            affectedClass: 'ex:A',
            property: 'p',
            filler: 'ex:B',
            minCardinality: 2,
            quantifier: 'existential',
          },
        ],
      },
      FIXED_COMPILE_CONFIG,
    );

    const stats = result['fandaws:reductionManifest']['fandaws:statistics'];
    // The inlined existential counts as a property
    expect(stats.totalProperties).toBeGreaterThanOrEqual(1);
  });
});

// ── Group 4: Edge Cases ──

describe('cardinality — edge cases', () => {
  // TB-17: Unqualified cardinality (no filler → owl:Thing)
  it('TB-17: unqualified cardinality uses null filler', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/x',
        property: 'p',
        filler: null,
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 1, max: null, exact: null, qualifiedOver: null },
        sourceAxiom: 'X SubClassOf (p min 1)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/x']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:qualifiedOver']).toBeNull();
    expect(result.lossRecords).toHaveLength(1);
  });

  // TB-18: Large cardinality value (1000000 — integer, not string)
  it('TB-18: large cardinality value preserved as integer', () => {
    const restrictions = [
      {
        classIri: 'fandaws:class/galaxy',
        property: 'has_star',
        filler: 'fandaws:class/star',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 1000000, max: null, exact: null, qualifiedOver: null },
        sourceAxiom: 'Galaxy SubClassOf (has_star min 1000000 Star)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/galaxy']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.cardinalityConstraints[0]['fandaws:minCardinality']).toBe(1000000);
    expect(typeof result.cardinalityConstraints[0]['fandaws:minCardinality']).toBe('number');
    expect(result.lossRecords[0]['fandaws:lostSemantics']).toContain('1000000');
  });

  // TB-19: Concept with P5 existential + P6 universal + P8 cardinality together
  it('TB-19: concept with P5 + P6 + P8 restrictions together', () => {
    const restrictions = [
      // P5: existential
      {
        classIri: 'fandaws:class/dog',
        property: 'has_fur',
        filler: 'fandaws:class/fur',
        quantifier: 'existential',
        type: 'Existential',
        sourceAxiom: 'Dog SubClassOf has_fur some Fur',
      },
      // P6: universal
      {
        classIri: 'fandaws:class/dog',
        property: 'eats',
        filler: 'fandaws:class/food',
        quantifier: 'universal',
        type: 'Universal',
        sourceAxiom: 'Dog SubClassOf eats only Food',
      },
      // P8: cardinality
      {
        classIri: 'fandaws:class/dog',
        property: 'has_leg',
        filler: 'fandaws:class/leg',
        quantifier: 'existential',
        type: 'Cardinality',
        cardinality: { min: 4, max: 4, exact: 4, qualifiedOver: 'fandaws:class/leg' },
        sourceAxiom: 'Dog SubClassOf (has_leg exactly 4 Leg)',
      },
    ];
    const conceptMap = makeConceptMap(['fandaws:class/dog']);

    const result = liftRestrictions(restrictions, conceptMap, [], DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // 3 properties inlined: has_fur (P5), eats (P6), has_leg (P8 existential floor)
    const dog = conceptMap.get('fandaws:class/dog');
    expect(dog['fandaws:properties']).toHaveLength(3);

    // 1 cardinality constraint
    expect(result.cardinalityConstraints).toHaveLength(1);

    // 2 loss records: universalWeakening + cardinalityWeakening
    expect(result.lossRecords).toHaveLength(2);
    const lossTypes = result.lossRecords.map((l) => l['fandaws:lossType']).sort();
    expect(lossTypes).toEqual(['cardinalityWeakening', 'universalWeakening']);
  });

  // TB-20: Deduplication — cardinality skips existential when property already inlined
  it('TB-20: cardinality deduplicates when existential already exists for same property', () => {
    const conceptMap = makeConceptMap(['fandaws:class/car']);

    // Step 1: Inline a plain P5 existential for has_wheel
    liftRestrictions(
      [
        {
          classIri: 'fandaws:class/car',
          property: 'has_wheel',
          filler: 'fandaws:class/wheel',
          quantifier: 'existential',
          type: 'Existential',
          sourceAxiom: 'Car SubClassOf has_wheel some Wheel',
        },
      ],
      conceptMap,
      [],
      DEFAULT_CONFIG,
      DEFAULT_CONTEXT,
    );

    const car = conceptMap.get('fandaws:class/car');
    expect(car['fandaws:properties']).toHaveLength(1);

    // Step 2: Process a P8 cardinality on the same property+filler
    const result = liftRestrictions(
      [
        {
          classIri: 'fandaws:class/car',
          property: 'has_wheel',
          filler: 'fandaws:class/wheel',
          quantifier: 'existential',
          type: 'Cardinality',
          cardinality: { min: 4, max: null, exact: null, qualifiedOver: 'fandaws:class/wheel' },
          sourceAxiom: 'Car SubClassOf (has_wheel min 4 Wheel)',
        },
      ],
      conceptMap,
      [],
      DEFAULT_CONFIG,
      DEFAULT_CONTEXT,
    );

    // Still only 1 property (deduped — the cardinality didn't add another)
    expect(car['fandaws:properties']).toHaveLength(1);

    // But cardinality constraint is still emitted
    expect(result.cardinalityConstraints).toHaveLength(1);
    expect(result.cardinalityConstraints[0]['fandaws:minCardinality']).toBe(4);

    // Loss record for the cardinality
    const cardLoss = result.lossRecords.find((l) => l['fandaws:lossType'] === 'cardinalityWeakening');
    expect(cardLoss).toBeDefined();
  });
});
