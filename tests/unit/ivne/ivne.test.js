/**
 * IVNE compile() — Unit Tests
 *
 * Tests the main entry point: input validation, full pipeline execution,
 * output shape, provenance, scope entry, and determinism.
 */

import { describe, it, expect } from '@jest/globals';
import { compile } from '../../../src/core/ivne/ivne.js';

const MINIMAL_ONTOLOGY = {
  ontologyIRI: 'http://example.org/test.owl',
  classes: [
    {
      iri: 'http://example.org/test.owl#Animal',
      annotations: [{ property: 'rdfs:label', value: 'Animal', language: 'en' }],
      parents: [],
    },
    {
      iri: 'http://example.org/test.owl#Dog',
      annotations: [{ property: 'rdfs:label', value: 'Dog', language: 'en' }],
      parents: ['http://example.org/test.owl#Animal'],
    },
  ],
};

const FIXED_CONFIG = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
};

// ── Input Validation ──

describe('compile — input validation', () => {
  it('throws on null input', () => {
    expect(() => compile(null)).toThrow('parsedOntology object');
  });

  it('throws on missing ontologyIRI', () => {
    expect(() => compile({ classes: [] })).toThrow('ontologyIRI');
  });

  it('throws on missing classes array', () => {
    expect(() => compile({ ontologyIRI: 'http://example.org' })).toThrow('classes array');
  });
});

// ── Output Shape ──

describe('compile — output shape', () => {
  it('returns result, canonicalJson, and outputHash', () => {
    const output = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(output).toHaveProperty('result');
    expect(output).toHaveProperty('canonicalJson');
    expect(output).toHaveProperty('outputHash');
  });

  it('result has @type fandaws:OntologyImportResult', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(result['@type']).toBe('fandaws:OntologyImportResult');
  });

  it('result includes sourceIRI', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(result['fandaws:sourceIRI']).toBe('http://example.org/test.owl');
  });

  it('result includes concepts array', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(Array.isArray(result['fandaws:concepts'])).toBe(true);
    expect(result['fandaws:concepts'].length).toBeGreaterThanOrEqual(2);
  });

  it('result includes reduction manifest', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const manifest = result['fandaws:reductionManifest'];
    expect(manifest['@type']).toBe('fandaws:ReductionManifest');
  });

  it('result includes scope entry', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(result['fandaws:scopeEntry']).toBeDefined();
    expect(result['fandaws:scopeEntry']['fandaws:trustLevel']).toBe('experimental');
  });

  it('outputHash is a valid SHA-256 hex string', () => {
    const { outputHash } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(outputHash).toHaveLength(64);
    expect(outputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonicalJson is valid JSON', () => {
    const { canonicalJson } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(() => JSON.parse(canonicalJson)).not.toThrow();
  });
});

// ── Concept Provenance ──

describe('compile — concept provenance', () => {
  it('sets shml:epistemicStatus to imported on all concepts', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    for (const concept of result['fandaws:concepts']) {
      expect(concept['shml:epistemicStatus']).toBe('imported');
    }
  });

  it('sets ivneVersion to 2.1 on all concepts', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    for (const concept of result['fandaws:concepts']) {
      expect(concept['fandaws:ivneVersion']).toBe('2.1');
    }
  });

  it('sets importedFrom on named concepts', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const dog = result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'dog',
    );
    expect(dog['fandaws:importedFrom']).toBe('http://example.org/test.owl#Dog');
  });

  it('sets owl:sameAs on named concepts', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const animal = result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'animal',
    );
    expect(animal['owl:sameAs']).toBe('http://example.org/test.owl#Animal');
  });
});

// ── Reduction Manifest ──

describe('compile — reduction manifest', () => {
  it('includes sourceOntology', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const manifest = result['fandaws:reductionManifest'];
    expect(manifest['fandaws:sourceOntology']).toBe('http://example.org/test.owl');
  });

  it('includes sourceHash', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const manifest = result['fandaws:reductionManifest'];
    expect(manifest['fandaws:sourceHash']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes IRI mappings', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const manifest = result['fandaws:reductionManifest'];
    expect(manifest['fandaws:iriMappings'].length).toBeGreaterThanOrEqual(2);
  });

  it('includes statistics with fidelityScore', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const manifest = result['fandaws:reductionManifest'];
    expect(manifest['fandaws:statistics'].fidelityScore).toBeDefined();
  });

  it('reports perfect fidelity for loss-free import', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const manifest = result['fandaws:reductionManifest'];
    // Simple P1 SubClassOf only — should be lossless
    expect(manifest['fandaws:statistics'].fidelityScore).toBe(1.0);
  });
});

// ── Scope Entry ──

describe('compile — scope entry', () => {
  it('creates a scope entry with experimental trust level', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(result['fandaws:scopeEntry']['fandaws:trustLevel']).toBe('experimental');
  });

  it('creates a scope entry with priority 99', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(result['fandaws:scopeEntry']['fandaws:priority']).toBe(99);
  });

  it('creates a scope entry with fork stale copy action', () => {
    const { result } = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(result['fandaws:scopeEntry']['fandaws:staleCopyAction']).toBe('fork');
  });
});

// ── Determinism ──

describe('compile — determinism', () => {
  it('produces identical outputHash for identical inputs', () => {
    const o1 = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const o2 = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(o1.outputHash).toBe(o2.outputHash);
  });

  it('produces identical canonicalJson for identical inputs', () => {
    const o1 = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    const o2 = compile(MINIMAL_ONTOLOGY, FIXED_CONFIG);
    expect(o1.canonicalJson).toBe(o2.canonicalJson);
  });
});

// ── Lossy Operations ──

describe('compile — lossy operations', () => {
  it('tracks union flattening as lossy in manifest', () => {
    const ontology = {
      ontologyIRI: 'http://example.org/test.owl',
      classes: [
        { iri: 'ex:A', annotations: [{ property: 'rdfs:label', value: 'A' }], parents: [] },
        { iri: 'ex:B', annotations: [{ property: 'rdfs:label', value: 'B' }], parents: [] },
      ],
      expressions: [
        { type: 'union', operands: ['ex:A', 'ex:B'] },
      ],
    };
    const { result } = compile(ontology, FIXED_CONFIG);
    const manifest = result['fandaws:reductionManifest'];
    expect(manifest['fandaws:statistics'].fidelityScore).toBeLessThan(1.0);
    expect(manifest['fandaws:statistics'].lossByType.unionGeneralization).toBeGreaterThan(0);
  });
});

// ── Empty Ontology ──

describe('compile — empty ontology', () => {
  it('compiles an ontology with no classes', () => {
    const { result } = compile(
      { ontologyIRI: 'http://example.org/empty.owl', classes: [] },
      FIXED_CONFIG,
    );
    expect(result['fandaws:concepts']).toHaveLength(0);
    expect(result['fandaws:reductionManifest']['fandaws:statistics'].fidelityScore).toBe(1.0);
  });
});
