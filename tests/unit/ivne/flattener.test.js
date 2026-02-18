/**
 * Flattener (τ_F) — Unit Tests
 *
 * Tests P1 (SubClassOf), P3 (DisjointWith), intersection/union flattening,
 * complement/enumeration rejection, ObjectProperty processing, and cycle detection.
 */

import { describe, it, expect } from '@jest/globals';
import { flatten } from '../../../src/core/ivne/flattener.js';

const DEFAULT_CONFIG = {
  locale: 'en',
  hashPrefixLength: 12,
  bfoAlignmentMode: 'auto',
  maxConcepts: 50000,
  labelExtractionPriority: ['rdfs:label', 'skos:prefLabel', 'uriFragment'],
};

const DEFAULT_CONTEXT = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  sourceOntology: 'http://purl.obolibrary.org/obo/bfo.owl',
  ivneRunId: 'test-run-001',
  scope: 'fandaws:scope/default',
};

// ── P1: SubClassOf (Named) ──

describe('flatten — P1 SubClassOf', () => {
  it('creates concept nodes for simple parent-child', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Animal', annotations: [{ property: 'rdfs:label', value: 'Animal', language: 'en' }], parents: [] },
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog', language: 'en' }], parents: ['ex:Animal'] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);

    expect(result.concepts).toHaveLength(2);
    const dog = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'dog');
    const animal = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'animal');
    expect(dog).toBeDefined();
    expect(animal).toBeDefined();
  });

  it('sets skos:broader for child concepts', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Animal', annotations: [{ property: 'rdfs:label', value: 'Animal' }], parents: [] },
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: ['ex:Animal'] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const dog = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'dog');
    const animal = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'animal');
    expect(dog['skos:broader']).toBe(animal['@id']);
  });

  it('marks root concepts with allowRoot: true', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Entity', annotations: [{ property: 'rdfs:label', value: 'Entity' }], parents: [] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.concepts[0]['fandaws:allowRoot']).toBe(true);
  });

  it('marks owl:Thing children as roots', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Entity', annotations: [{ property: 'rdfs:label', value: 'Entity' }], parents: ['owl:Thing'] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.concepts[0]['fandaws:allowRoot']).toBe(true);
    expect(result.concepts[0]['skos:broader']).toBeNull();
  });

  it('records IRI mappings from source to Fandaws', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.iriMappings).toHaveLength(1);
    expect(result.iriMappings[0].source).toBe('ex:Dog');
    expect(result.iriMappings[0].fandaws).toMatch(/^fandaws:class\//);
  });

  it('sets epistemic status to imported', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.concepts[0]['shml:epistemicStatus']).toBe('imported');
  });

  it('sets importedFrom and owl:sameAs provenance', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.concepts[0]['fandaws:importedFrom']).toBe('ex:Dog');
    expect(result.concepts[0]['owl:sameAs']).toBe('ex:Dog');
  });

  it('sets ivneVersion to 2.1', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.concepts[0]['fandaws:ivneVersion']).toBe('2.1');
  });

  it('deduplicates concepts with same canonical label', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
        { iri: 'other:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    // Should have 1 concept but 2 IRI mappings
    expect(result.concepts).toHaveLength(1);
    expect(result.iriMappings).toHaveLength(2);
  });
});

// ── P3: DisjointWith ──

describe('flatten — P3 DisjointWith', () => {
  it('records disjoint pairs', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Cat', annotations: [{ property: 'rdfs:label', value: 'Cat' }], parents: [] },
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
      disjointness: [
        { type: 'DisjointWith', class1: 'ex:Cat', class2: 'ex:Dog' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.disjointPairs).toHaveLength(1);
  });

  it('adds owl:disjointWith annotations to both concepts', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Cat', annotations: [{ property: 'rdfs:label', value: 'Cat' }], parents: [] },
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
      disjointness: [
        { type: 'DisjointWith', class1: 'ex:Cat', class2: 'ex:Dog' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const cat = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'cat');
    const dog = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'dog');
    expect(cat['owl:disjointWith']).toContain(dog['@id']);
    expect(dog['owl:disjointWith']).toContain(cat['@id']);
  });
});

// ── Intersection Flattening ──

describe('flatten — intersection', () => {
  it('creates a generated intersection concept', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
      ],
      expressions: [
        { type: 'intersection', operands: ['ex:A', 'ex:B'], sourceAxiom: 'X SubClassOf (A and B)' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);

    // Should have A, B, and a generated intersection concept
    expect(result.concepts.length).toBeGreaterThanOrEqual(3);
    expect(result.generatedConcepts).toHaveLength(1);
    expect(result.generatedConcepts[0]).toMatch(/^fandaws:gen\//);
  });

  it('emits informational intersectionFlattening loss record', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
      ],
      expressions: [
        { type: 'intersection', operands: ['ex:A', 'ex:B'] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const loss = result.lossRecords.find((lr) => lr['fandaws:lossType'] === 'intersectionFlattening');
    expect(loss).toBeDefined();
    expect(loss['fandaws:severity']).toBe('informational');
  });
});

// ── Union Flattening (LOSSY) ──

describe('flatten — union', () => {
  it('creates a generated union concept', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
      ],
      expressions: [
        { type: 'union', operands: ['ex:A', 'ex:B'] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.generatedConcepts).toHaveLength(1);
  });

  it('emits lossy unionGeneralization loss record', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
      ],
      expressions: [
        { type: 'union', operands: ['ex:A', 'ex:B'] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const loss = result.lossRecords.find((lr) => lr['fandaws:lossType'] === 'unionGeneralization');
    expect(loss).toBeDefined();
    expect(loss['fandaws:severity']).toBe('lossy');
  });

  it('stores disjuncts on the generated union concept', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
      ],
      expressions: [
        { type: 'union', operands: ['ex:A', 'ex:B'] },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const unionConcept = result.concepts.find((c) => c['fandaws:disjuncts']);
    expect(unionConcept).toBeDefined();
    expect(unionConcept['fandaws:disjuncts']).toHaveLength(2);
  });
});

// ── Complement and Enumeration Rejection ──

describe('flatten — complement and enumeration', () => {
  it('rejects ComplementOf expressions with complementDrop', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
      ],
      expressions: [
        { type: 'ComplementOf', complement: 'ex:A', affectedClass: 'ex:NotA' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const loss = result.lossRecords.find((lr) => lr['fandaws:lossType'] === 'complementDrop');
    expect(loss).toBeDefined();
    expect(result.rejectedAxioms).toHaveLength(1);
  });

  it('rejects OneOf expressions with enumerationDrop', () => {
    const ontology = {
      classes: [],
      expressions: [
        { type: 'OneOf', individuals: ['a', 'b', 'c'], affectedClass: 'ex:Color' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const loss = result.lossRecords.find((lr) => lr['fandaws:lossType'] === 'enumerationDrop');
    expect(loss).toBeDefined();
    expect(result.rejectedAxioms).toHaveLength(1);
  });
});

// ── ObjectProperty Processing (D5) ──

describe('flatten — ObjectProperty (D5)', () => {
  it('creates property entity descriptors', () => {
    const ontology = {
      classes: [],
      properties: [
        {
          iri: 'bfo:part_of',
          annotations: [{ property: 'rdfs:label', value: 'part of', language: 'en' }],
          domain: 'bfo:Continuant',
          range: 'bfo:Continuant',
        },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.propertyEntities).toHaveLength(1);
    expect(result.propertyEntities[0]['@type']).toBe('fandaws:PropertyEntity');
    expect(result.propertyEntities[0]['fandaws:domain']).toBe('bfo:Continuant');
  });

  it('records IRI mapping for properties', () => {
    const ontology = {
      classes: [],
      properties: [
        {
          iri: 'bfo:has_part',
          annotations: [{ property: 'rdfs:label', value: 'has part', language: 'en' }],
        },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const mapping = result.iriMappings.find((m) => m.source === 'bfo:has_part');
    expect(mapping).toBeDefined();
    expect(mapping.fandaws).toMatch(/^fandaws:property\//);
  });

  it('sets epistemic status to imported on property entities', () => {
    const ontology = {
      classes: [],
      properties: [
        {
          iri: 'bfo:part_of',
          annotations: [{ property: 'rdfs:label', value: 'part of' }],
        },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.propertyEntities[0]['shml:epistemicStatus']).toBe('imported');
  });
});

// ── Restriction Processing ──

describe('flatten — restrictions', () => {
  it('passes restriction descriptors to output', () => {
    const ontology = {
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
      ],
      restrictions: [
        {
          type: 'Existential',
          affectedClass: 'ex:Dog',
          property: 'hasFur',
          filler: 'ex:Fur',
          quantifier: 'existential',
        },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.restrictions).toHaveLength(1);
    expect(result.restrictions[0].property).toBe('hasFur');
  });

  it('rejects vacuous min-0 cardinality with vacuousDrop', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
      ],
      restrictions: [
        {
          type: 'Cardinality',
          affectedClass: 'ex:A',
          property: 'ex:p',
          filler: 'ex:B',
          minCardinality: 0,
        },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.restrictions).toHaveLength(0);
    expect(result.rejectedAxioms).toHaveLength(1);
  });
});

// ── maxConcepts Gate ──

describe('flatten — maxConcepts', () => {
  it('throws when exceeding maxConcepts', () => {
    const classes = Array.from({ length: 6 }, (_, i) => ({
      iri: `ex:Class${i}`,
      annotations: [{ property: 'rdfs:label', value: `Class ${i}` }],
      parents: [],
    }));
    expect(() => flatten({ classes }, { ...DEFAULT_CONFIG, maxConcepts: 5 }, DEFAULT_CONTEXT)).toThrow('maxConcepts');
  });
});

// ── P2: EquivalentTo ──

describe('flatten — P2 EquivalentTo', () => {
  it('adds owl:equivalentClass annotations to both concepts', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'Alpha' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'Beta' }], parents: [] },
      ],
      equivalences: [
        { type: 'EquivalentTo', class1: 'ex:A', class2: 'ex:B' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    const alpha = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'alpha');
    const beta = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'beta');
    expect(alpha['owl:equivalentClass']).toContain(beta['@id']);
    expect(beta['owl:equivalentClass']).toContain(alpha['@id']);
  });

  it('emits equivalence descriptors for downstream Termidium', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'Alpha' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'Beta' }], parents: [] },
      ],
      equivalences: [
        { type: 'EquivalentTo', class1: 'ex:A', class2: 'ex:B' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.equivalenceDescriptors).toHaveLength(1);
    expect(result.equivalenceDescriptors[0]['@type']).toBe('fandaws:EquivalenceDescriptor');
  });

  it('preserves both concepts (merge deferred to Termidium)', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'Alpha' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'Beta' }], parents: [] },
      ],
      equivalences: [
        { type: 'EquivalentTo', class1: 'ex:A', class2: 'ex:B' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.concepts).toHaveLength(2);
  });

  it('skips equivalence when one class is not in the import', () => {
    const ontology = {
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'Alpha' }], parents: [] },
      ],
      equivalences: [
        { type: 'EquivalentTo', class1: 'ex:A', class2: 'ex:Missing' },
      ],
    };
    const result = flatten(ontology, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.equivalenceDescriptors).toHaveLength(0);
    const alpha = result.concepts.find((c) => c['fandaws:canonicalLabel'] === 'alpha');
    expect(alpha['owl:equivalentClass']).toBeUndefined();
  });
});

// ── Empty Ontology ──

describe('flatten — edge cases', () => {
  it('handles empty ontology', () => {
    const result = flatten({ classes: [] }, DEFAULT_CONFIG, DEFAULT_CONTEXT);
    expect(result.concepts).toHaveLength(0);
    expect(result.lossRecords).toHaveLength(0);
    expect(result.iriMappings).toHaveLength(0);
  });

  it('handles ontology with only properties', () => {
    const result = flatten(
      {
        classes: [],
        properties: [
          { iri: 'ex:prop1', annotations: [{ property: 'rdfs:label', value: 'prop one' }] },
        ],
      },
      DEFAULT_CONFIG,
      DEFAULT_CONTEXT,
    );
    expect(result.concepts).toHaveLength(0);
    expect(result.propertyEntities).toHaveLength(1);
  });
});
