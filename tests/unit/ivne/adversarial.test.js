/**
 * IVNE Adversarial Tests
 *
 * Edge cases, boundary conditions, and pathological inputs that
 * stress the IVNE compiler's robustness.
 */

import { describe, it, expect } from '@jest/globals';
import { compile } from '../../../src/core/ivne/ivne.js';
import { flatten } from '../../../src/core/ivne/flattener.js';

const FIXED_CONFIG = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  scope: 'fandaws:scope/test',
};

const FLAT_CONFIG = {
  locale: 'en',
  hashPrefixLength: 12,
  bfoAlignmentMode: 'auto',
  maxConcepts: 50000,
  labelExtractionPriority: ['rdfs:label', 'skos:prefLabel', 'uriFragment'],
};

const FLAT_CONTEXT = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  sourceOntology: 'http://example.org/adversarial.owl',
  ivneRunId: 'adv-001',
  scope: 'fandaws:scope/test',
};

// ── Empty / Minimal Inputs ──

describe('adversarial — empty and minimal inputs', () => {
  it('compiles an ontology with zero classes', () => {
    const { result } = compile(
      { ontologyIRI: 'http://example.org/empty.owl', classes: [] },
      FIXED_CONFIG,
    );
    expect(result['fandaws:concepts']).toHaveLength(0);
    expect(result['fandaws:reductionManifest']['fandaws:statistics'].fidelityScore).toBe(1.0);
  });

  it('compiles an ontology with a single root class', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/single.owl',
        classes: [
          { iri: 'ex:Thing', annotations: [{ property: 'rdfs:label', value: 'Thing' }], parents: [] },
        ],
      },
      FIXED_CONFIG,
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['fandaws:allowRoot']).toBe(true);
  });

  it('handles ontology with empty arrays for all optional fields', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/bare.owl',
        classes: [
          { iri: 'ex:A', annotations: [], parents: [] },
        ],
        properties: [],
        restrictions: [],
        disjointness: [],
        equivalences: [],
        expressions: [],
      },
      FIXED_CONFIG,
    );
    expect(result['fandaws:concepts']).toHaveLength(1);
  });
});

// ── No-Label Classes ──

describe('adversarial — no-label classes', () => {
  it('falls back to URI fragment when no annotations exist', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'http://example.org/onto#MyClass', annotations: [], parents: [] },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    expect(result.concepts).toHaveLength(1);
    // Should extract "MyClass" from URI fragment, canonicalize to "my class"
    expect(result.concepts[0]['fandaws:canonicalLabel']).toBeTruthy();
  });

  it('handles class with no annotations and opaque IRI', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'http://example.org/BFO_0000001', annotations: [], parents: [] },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]['fandaws:canonicalLabel']).toBeTruthy();
  });
});

// ── Unicode Labels ──

describe('adversarial — Unicode', () => {
  it('throws clear error for pure CJK labels (IRI slug limitation)', () => {
    // Known limitation: Latin-based slug generator cannot handle pure CJK
    // This documents the boundary — Phase 14 IntegrationAdapter should
    // provide CJK→romanization or hash-based IRI fallback
    expect(() =>
      flatten(
        {
          classes: [
            { iri: 'ex:Animal', annotations: [{ property: 'rdfs:label', value: '\u52D5\u7269', language: 'ja' }], parents: [] },
          ],
        },
        FLAT_CONFIG,
        FLAT_CONTEXT,
      ),
    ).toThrow('empty slug');
  });

  it('handles accented characters (NFKC normalization)', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'ex:Cafe', annotations: [{ property: 'rdfs:label', value: 'caf\u00E9', language: 'fr' }], parents: [] },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    expect(result.concepts).toHaveLength(1);
    // Should be NFKC-normalized by simplify()
    expect(result.concepts[0]['fandaws:canonicalLabel']).toBeTruthy();
  });

  it('handles emoji in labels without crashing', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'ex:Star', annotations: [{ property: 'rdfs:label', value: '\u2B50 Star' }], parents: [] },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    expect(result.concepts).toHaveLength(1);
  });
});

// ── Deeply Nested Intersections ──

describe('adversarial — deeply nested expressions', () => {
  it('handles 3-level nested intersection', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
          { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
          { iri: 'ex:C', annotations: [{ property: 'rdfs:label', value: 'C' }], parents: [] },
          { iri: 'ex:D', annotations: [{ property: 'rdfs:label', value: 'D' }], parents: [] },
        ],
        expressions: [
          {
            type: 'intersection',
            operands: [
              { type: 'intersection', operands: ['ex:A', 'ex:B'] },
              { type: 'intersection', operands: ['ex:C', 'ex:D'] },
            ],
          },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    // Should have 4 named + 3 generated concepts
    expect(result.concepts.length).toBeGreaterThanOrEqual(7);
    expect(result.generatedConcepts.length).toBe(3);
  });

  it('handles nested union inside intersection', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'ex:X', annotations: [{ property: 'rdfs:label', value: 'X' }], parents: [] },
          { iri: 'ex:Y', annotations: [{ property: 'rdfs:label', value: 'Y' }], parents: [] },
          { iri: 'ex:Z', annotations: [{ property: 'rdfs:label', value: 'Z' }], parents: [] },
        ],
        expressions: [
          {
            type: 'intersection',
            operands: [
              'ex:X',
              { type: 'union', operands: ['ex:Y', 'ex:Z'] },
            ],
          },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    // Named: X, Y, Z. Generated: union(Y,Z), intersection(X, union)
    expect(result.generatedConcepts.length).toBe(2);
    // Should have both intersection and union loss records
    const lossTypes = result.lossRecords.map((lr) => lr['fandaws:lossType']);
    expect(lossTypes).toContain('intersectionFlattening');
    expect(lossTypes).toContain('unionGeneralization');
  });
});

// ── maxConcepts Boundary ──

describe('adversarial — maxConcepts boundary', () => {
  it('allows exactly maxConcepts classes', () => {
    const classes = Array.from({ length: 10 }, (_, i) => ({
      iri: `ex:C${i}`,
      annotations: [{ property: 'rdfs:label', value: `Concept ${i}` }],
      parents: [],
    }));
    // Should NOT throw — exactly at the boundary
    expect(() => flatten({ classes }, { ...FLAT_CONFIG, maxConcepts: 10 }, FLAT_CONTEXT)).not.toThrow();
  });

  it('throws at maxConcepts + 1', () => {
    const classes = Array.from({ length: 11 }, (_, i) => ({
      iri: `ex:C${i}`,
      annotations: [{ property: 'rdfs:label', value: `Concept ${i}` }],
      parents: [],
    }));
    expect(() => flatten({ classes }, { ...FLAT_CONFIG, maxConcepts: 10 }, FLAT_CONTEXT)).toThrow('maxConcepts');
  });
});

// ── Duplicate IRIs ──

describe('adversarial — duplicate IRIs', () => {
  it('deduplicates two classes that resolve to the same canonical label', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
          { iri: 'other:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    expect(result.concepts).toHaveLength(1);
    expect(result.iriMappings).toHaveLength(2);
  });

  it('deduplicates case-insensitive labels', () => {
    const result = flatten(
      {
        classes: [
          { iri: 'ex:Dog1', annotations: [{ property: 'rdfs:label', value: 'DOG' }], parents: [] },
          { iri: 'ex:Dog2', annotations: [{ property: 'rdfs:label', value: 'dog' }], parents: [] },
        ],
      },
      FLAT_CONFIG,
      FLAT_CONTEXT,
    );
    expect(result.concepts).toHaveLength(1);
    expect(result.iriMappings).toHaveLength(2);
  });
});

// ── P2 + P6 via compile() ──

describe('adversarial — P2 equivalence via compile', () => {
  it('includes merge descriptors in compiled output', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/equiv.owl',
        classes: [
          { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'Alpha' }], parents: [] },
          { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'Beta' }], parents: [] },
        ],
        equivalences: [
          { type: 'EquivalentTo', class1: 'ex:A', class2: 'ex:B' },
        ],
      },
      FIXED_CONFIG,
    );
    expect(result['fandaws:mergeDescriptors']).toHaveLength(1);
    expect(result['fandaws:mergeDescriptors'][0]['@type']).toBe('fandaws:EquivalenceDescriptor');
  });
});

describe('adversarial — P6 universal via compile', () => {
  it('tracks universalWeakening in compiled output', () => {
    const { result } = compile(
      {
        ontologyIRI: 'http://example.org/univ.owl',
        classes: [
          { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
        ],
        restrictions: [
          {
            type: 'Universal',
            affectedClass: 'ex:Dog',
            property: 'eats',
            filler: 'ex:Food',
            quantifier: 'universal',
          },
        ],
      },
      FIXED_CONFIG,
    );
    const manifest = result['fandaws:reductionManifest'];
    expect(manifest['fandaws:statistics'].lossBySeverity.degraded).toBeGreaterThan(0);
  });
});
