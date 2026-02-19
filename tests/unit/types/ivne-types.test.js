/**
 * IVNE Type Factories — Unit Tests
 *
 * Tests the 5 IVNE type factories for correct JSON-LD shape,
 * default values, and constraint enforcement.
 */

import { describe, it, expect } from '@jest/globals';
import {
  createIVNEConfiguration,
  createOntologyImportResult,
  createSemanticLossRecord,
  createReductionManifest,
  createCardinalityConstraint,
} from '../../../src/types/ivne-types.js';

// ── createIVNEConfiguration ──

describe('createIVNEConfiguration', () => {
  it('produces an object with @type ivne:Configuration', () => {
    const config = createIVNEConfiguration();
    expect(config['@type']).toBe('ivne:Configuration');
  });

  it('includes all default values', () => {
    const config = createIVNEConfiguration();
    expect(config.locale).toBe('en');
    expect(config.abbreviationTable).toEqual({});
    expect(config.labelExtractionPriority).toEqual(['rdfs:label', 'skos:prefLabel', 'uriFragment']);
    expect(config.hashPrefixLength).toBe(12);
    expect(config.chainComplexityThreshold).toBe(3);
    expect(config.defaultTrustLevel).toBe('experimental');
    expect(config.defaultStaleCopyAction).toBe('fork');
    expect(config.importRoots).toBeNull();
    expect(config.excludePatterns).toEqual([]);
    expect(config.bfoAlignmentMode).toBe('auto');
    expect(config.maxConcepts).toBe(50000);
    expect(config.fnsrChainSupport).toBe(false);
    expect(config.oceChainSupport).toBe(false);
  });

  it('merges overrides over defaults', () => {
    const config = createIVNEConfiguration({ locale: 'de', maxConcepts: 100 });
    expect(config.locale).toBe('de');
    expect(config.maxConcepts).toBe(100);
    // Non-overridden defaults still present
    expect(config.hashPrefixLength).toBe(12);
  });

  it('allows adding non-default keys', () => {
    const config = createIVNEConfiguration({ customParam: 'value' });
    expect(config.customParam).toBe('value');
  });
});

// ── createOntologyImportResult ──

describe('createOntologyImportResult', () => {
  const minimalResult = () =>
    createOntologyImportResult({
      sourceIRI: 'http://purl.obolibrary.org/obo/bfo.owl',
      reductionManifest: { '@type': 'fandaws:ReductionManifest' },
    });

  it('produces a node with @type fandaws:OntologyImportResult', () => {
    expect(minimalResult()['@type']).toBe('fandaws:OntologyImportResult');
  });

  it('sets sourceIRI correctly', () => {
    expect(minimalResult()['fandaws:sourceIRI']).toBe('http://purl.obolibrary.org/obo/bfo.owl');
  });

  it('defaults array fields to empty arrays', () => {
    const result = minimalResult();
    expect(result['fandaws:concepts']).toEqual([]);
    expect(result['fandaws:relationships']).toEqual([]);
    expect(result['fandaws:unmappedEntities']).toEqual([]);
    expect(result['fandaws:cardinalityConstraints']).toEqual([]);
    expect(result['fandaws:semanticLossRecords']).toEqual([]);
  });

  it('defaults importMethod to owl', () => {
    expect(minimalResult()['fandaws:importMethod']).toBe('owl');
  });

  it('defaults scopeEntry to null', () => {
    expect(minimalResult()['fandaws:scopeEntry']).toBeNull();
  });

  it('passes through provided concepts', () => {
    const concepts = [{ '@type': 'fandaws:Concept', '@id': 'fandaws:class/test' }];
    const result = createOntologyImportResult({
      sourceIRI: 'http://example.org/test.owl',
      reductionManifest: {},
      concepts,
    });
    expect(result['fandaws:concepts']).toHaveLength(1);
    expect(result['fandaws:concepts'][0]['@id']).toBe('fandaws:class/test');
  });
});

// ── createSemanticLossRecord ──

describe('createSemanticLossRecord', () => {
  const minimalLoss = () =>
    createSemanticLossRecord({
      lossType: 'unionGeneralization',
      severity: 'lossy',
      sourceAxiom: 'A EquivalentTo B or C',
      compiledForm: 'A skos:broader B; A skos:broader C',
      lostSemantics: 'Disjunction semantics lost; A could be B or C, not necessarily both',
    });

  it('produces a node with @type fandaws:SemanticLossRecord', () => {
    expect(minimalLoss()['@type']).toBe('fandaws:SemanticLossRecord');
  });

  it('sets loss type and severity correctly', () => {
    const loss = minimalLoss();
    expect(loss['fandaws:lossType']).toBe('unionGeneralization');
    expect(loss['fandaws:severity']).toBe('lossy');
  });

  it('sets source axiom and compiled form', () => {
    const loss = minimalLoss();
    expect(loss['fandaws:sourceAxiom']).toBe('A EquivalentTo B or C');
    expect(loss['fandaws:compiledForm']).toBe('A skos:broader B; A skos:broader C');
  });

  it('defaults affectedConcepts to empty array', () => {
    expect(minimalLoss()['fandaws:affectedConcepts']).toEqual([]);
  });

  it('defaults sourceOntology and ivneRunId to empty strings', () => {
    const loss = minimalLoss();
    expect(loss['fandaws:sourceOntology']).toBe('');
    expect(loss['fandaws:ivneRunId']).toBe('');
  });

  it('defaults downstreamImpact to empty object', () => {
    expect(minimalLoss()['fandaws:downstreamImpact']).toEqual({});
  });

  it('passes through provided affectedConcepts', () => {
    const loss = createSemanticLossRecord({
      lossType: 'intersectionFlattening',
      severity: 'informational',
      affectedConcepts: ['fandaws:class/a', 'fandaws:class/b'],
      sourceAxiom: 'C EquivalentTo A and B',
      compiledForm: 'C skos:broader A; C skos:broader B',
      lostSemantics: 'Intersection flattened to multiple parent links',
    });
    expect(loss['fandaws:affectedConcepts']).toHaveLength(2);
  });
});

// ── createReductionManifest ──

describe('createReductionManifest', () => {
  const minimalManifest = () =>
    createReductionManifest({
      ivneRunId: 'run-001',
      sourceOntology: 'http://purl.obolibrary.org/obo/bfo.owl',
      sourceHash: 'abc123',
      compiledAt: '2025-01-01T00:00:00.000Z',
      statistics: { totalClasses: 35, totalProperties: 2 },
    });

  it('produces a node with @type fandaws:ReductionManifest', () => {
    expect(minimalManifest()['@type']).toBe('fandaws:ReductionManifest');
  });

  it('sets required fields correctly', () => {
    const manifest = minimalManifest();
    expect(manifest['fandaws:ivneRunId']).toBe('run-001');
    expect(manifest['fandaws:sourceOntology']).toBe('http://purl.obolibrary.org/obo/bfo.owl');
    expect(manifest['fandaws:sourceHash']).toBe('abc123');
    expect(manifest['fandaws:compiledAt']).toBe('2025-01-01T00:00:00.000Z');
  });

  it('defaults ivneVersion to 2.1', () => {
    expect(minimalManifest()['fandaws:ivneVersion']).toBe('2.1');
  });

  it('defaults array fields to empty arrays', () => {
    const manifest = minimalManifest();
    expect(manifest['fandaws:lossRecords']).toEqual([]);
    expect(manifest['fandaws:rejectedAxioms']).toEqual([]);
    expect(manifest['fandaws:validationFailures']).toEqual([]);
    expect(manifest['fandaws:iriMappings']).toEqual([]);
    expect(manifest['fandaws:generatedConcepts']).toEqual([]);
  });

  it('defaults chainConsumptionReady to false', () => {
    expect(minimalManifest()['fandaws:chainConsumptionReady']).toBe(false);
  });

  it('defaults configUsed to empty object', () => {
    expect(minimalManifest()['fandaws:configUsed']).toEqual({});
  });
});

// ── createCardinalityConstraint ──

describe('createCardinalityConstraint', () => {
  it('produces a node with @type fandaws:CardinalityConstraint', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/has-part',
      constrainedClass: 'fandaws:class/body',
      minCardinality: 1,
    });
    expect(cc['@type']).toBe('fandaws:CardinalityConstraint');
  });

  it('sets property and constrainedClass', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/color',
      constrainedClass: 'fandaws:class/car',
    });
    expect(cc['fandaws:property']).toBe('fandaws:property/color');
    expect(cc['fandaws:constrainedClass']).toBe('fandaws:class/car');
  });

  it('defaults cardinality fields to null', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/name',
      constrainedClass: 'fandaws:class/person',
    });
    expect(cc['fandaws:minCardinality']).toBeNull();
    expect(cc['fandaws:maxCardinality']).toBeNull();
    expect(cc['fandaws:exactCardinality']).toBeNull();
  });

  it('defaults qualifiedOver to null', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/x',
      constrainedClass: 'fandaws:class/y',
    });
    expect(cc['fandaws:qualifiedOver']).toBeNull();
  });

  it('handles exact cardinality (auto-fills min and max)', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/eye',
      constrainedClass: 'fandaws:class/human',
      exactCardinality: 2,
    });
    expect(cc['fandaws:exactCardinality']).toBe(2);
    expect(cc['fandaws:minCardinality']).toBe(2);
    expect(cc['fandaws:maxCardinality']).toBe(2);
  });

  it('allows min without max', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/leg',
      constrainedClass: 'fandaws:class/spider',
      minCardinality: 8,
    });
    expect(cc['fandaws:minCardinality']).toBe(8);
    expect(cc['fandaws:maxCardinality']).toBeNull();
  });

  it('allows max without min', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/wing',
      constrainedClass: 'fandaws:class/bird',
      maxCardinality: 2,
    });
    expect(cc['fandaws:minCardinality']).toBeNull();
    expect(cc['fandaws:maxCardinality']).toBe(2);
  });

  // Consistency invariant enforcement

  it('throws if exactCardinality conflicts with minCardinality', () => {
    expect(() =>
      createCardinalityConstraint({
        property: 'fandaws:property/x',
        constrainedClass: 'fandaws:class/y',
        exactCardinality: 3,
        minCardinality: 1,
      }),
    ).toThrow('invariant violated');
  });

  it('throws if exactCardinality conflicts with maxCardinality', () => {
    expect(() =>
      createCardinalityConstraint({
        property: 'fandaws:property/x',
        constrainedClass: 'fandaws:class/y',
        exactCardinality: 3,
        maxCardinality: 5,
      }),
    ).toThrow('invariant violated');
  });

  it('throws if minCardinality > maxCardinality', () => {
    expect(() =>
      createCardinalityConstraint({
        property: 'fandaws:property/x',
        constrainedClass: 'fandaws:class/y',
        minCardinality: 10,
        maxCardinality: 5,
      }),
    ).toThrow('invariant violated');
  });

  it('throws if minCardinality is negative', () => {
    expect(() =>
      createCardinalityConstraint({
        property: 'fandaws:property/x',
        constrainedClass: 'fandaws:class/y',
        minCardinality: -1,
      }),
    ).toThrow('invariant violated');
  });

  it('allows maxCardinality of 0 (prohibition semantics)', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/x',
      constrainedClass: 'fandaws:class/y',
      maxCardinality: 0,
    });
    expect(cc['fandaws:maxCardinality']).toBe(0);
  });

  it('throws if maxCardinality is negative', () => {
    expect(() =>
      createCardinalityConstraint({
        property: 'fandaws:property/x',
        constrainedClass: 'fandaws:class/y',
        maxCardinality: -1,
      }),
    ).toThrow('invariant violated');
  });

  it('allows exactCardinality with matching min and max', () => {
    const cc = createCardinalityConstraint({
      property: 'fandaws:property/x',
      constrainedClass: 'fandaws:class/y',
      exactCardinality: 5,
      minCardinality: 5,
      maxCardinality: 5,
    });
    expect(cc['fandaws:exactCardinality']).toBe(5);
    expect(cc['fandaws:minCardinality']).toBe(5);
    expect(cc['fandaws:maxCardinality']).toBe(5);
  });
});
