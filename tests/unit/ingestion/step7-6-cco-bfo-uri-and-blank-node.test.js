/**
 * X9 Step 7.6 + 7.7 — CCO ingestion: BFO URI normalization (obofoundry
 * URI variants) + blank-node restriction filter (n3-N format).
 *
 * Symptoms surfaced on Aaron's CCO dry run:
 *   - 47 CCO classes routed PlacementRejected because their declared
 *     rdfs:subClassOf used `obo:BFO_NNNNNNN` / full obofoundry URI
 *     forms which BFO_CLASS_NORMALIZE didn't recognize (Step 7.6).
 *   - "Eye Color" / "First-Order Administrative Region" routed Ambiguous
 *     with `Declared superclass n3-0 does not resolve` because the
 *     parser's isBlankNode regex `/^n\d+$/` didn't match the underlying
 *     RDF library's `n3-0` blank-node format (Step 7.7); the blank-node
 *     restriction was stored in the subClassOf Map and overwrote the
 *     real BFO IRI sibling.
 *
 * End-to-end parseOntology integration tests not included here because
 * the Jest VM Modules sandbox can't resolve the dynamic `import('n3')`
 * inside parseTurtle. The fix is verified by:
 *   - Pure unit tests on evaluatePlacement (Step 7.6 — below)
 *   - Pure unit tests on isBlankNode (Step 7.7 — below)
 *   - Manual CCO TTL dry-run via the Workbench UI
 */

import { describe, it, expect } from '@jest/globals';
import { evaluatePlacement } from '../../../src/core/ingestion/placement-sandbox.js';
import { isBlankNode } from '../../../src/core/ingestion/ontology-parser.js';

describe('Step 7.6 — BFO URI normalization (obofoundry URI variants)', () => {
  it('full obofoundry URI http://purl.obolibrary.org/obo/BFO_0000019 normalizes to Quality', () => {
    const result = evaluatePlacement({
      iri: 'cco:ont00000044',
      label: 'Eye Color',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000019',
    });
    expect(result.placement).toBe('Quality');
    expect(result.confidence).toBe(0.91);
    expect(result.justification).toContain('Explicit rdfs:subClassOf');
  });

  it('TLS variant https://purl.obolibrary.org/obo/BFO_0000019 also normalizes', () => {
    const result = evaluatePlacement({
      iri: 'cco:ont00000044',
      label: 'Eye Color',
      superclass: 'https://purl.obolibrary.org/obo/BFO_0000019',
    });
    expect(result.placement).toBe('Quality');
    expect(result.confidence).toBe(0.91);
  });

  it('obo: prefix shorthand obo:BFO_0000023 normalizes to Role', () => {
    const result = evaluatePlacement({
      iri: 'cco:ont00000392',
      label: 'Allegiance Role',
      superclass: 'obo:BFO_0000023',
    });
    expect(result.placement).toBe('Role');
    expect(result.confidence).toBe(0.91);
  });

  it('all 7 BFO root categories used by CCO normalize via obofoundry URI', () => {
    const cases = [
      { uri: 'http://purl.obolibrary.org/obo/BFO_0000040', expected: 'MaterialEntity' },
      { uri: 'http://purl.obolibrary.org/obo/BFO_0000015', expected: 'Process' },
      { uri: 'http://purl.obolibrary.org/obo/BFO_0000019', expected: 'Quality' },
      { uri: 'http://purl.obolibrary.org/obo/BFO_0000017', expected: 'RealizableEntity' },
      { uri: 'http://purl.obolibrary.org/obo/BFO_0000023', expected: 'Role' },
      { uri: 'http://purl.obolibrary.org/obo/BFO_0000016', expected: 'Disposition' },
      { uri: 'http://purl.obolibrary.org/obo/BFO_0000004', expected: 'IndependentContinuant' },
    ];
    for (const { uri, expected } of cases) {
      const result = evaluatePlacement({ iri: 'ex:test', superclass: uri });
      expect(result.placement).toBe(expected);
      expect(result.confidence).toBe(0.91);
    }
  });

  it('preserves backwards-compat: bfo:BFO_NNNNNNN short form still normalizes', () => {
    const result = evaluatePlacement({ iri: 'ex:test', superclass: 'bfo:BFO_0000040' });
    expect(result.placement).toBe('MaterialEntity');
  });

  it('preserves backwards-compat: bfo:Process plain-name form still normalizes', () => {
    const result = evaluatePlacement({ iri: 'ex:test', superclass: 'bfo:Process' });
    expect(result.placement).toBe('Process');
  });

  it('non-BFO obofoundry URI (e.g. obo:IAO_0000310) does NOT spuriously match a BFO category', () => {
    const result = evaluatePlacement({ iri: 'ex:test', superclass: 'http://purl.obolibrary.org/obo/IAO_0000310' });
    // The obofoundry pre-normalizer matches `BFO_NNNNNNN` only; IAO falls
    // through to the no-candidate branch (or external Rejected path).
    expect(result.placement).not.toBe('MaterialEntity');
    expect(result.placement).not.toBe('Process');
    expect(result.placement).not.toBe('Quality');
  });

  it('partial / malformed obofoundry-style URI does not match BFO', () => {
    // BFO_NNNNNNN must be exactly 7 digits per spec.
    const result = evaluatePlacement({ iri: 'ex:test', superclass: 'http://purl.obolibrary.org/obo/BFO_001' });
    expect(result.placement).not.toBe('MaterialEntity');
    expect(result.placement).not.toBe('Process');
  });
});

describe('Step 7.7 — isBlankNode catches n3-N format used by underlying RDF parser', () => {
  it('catches n3-0, n3-5, n3-27 (CCO-style blank-node restriction IDs)', () => {
    expect(isBlankNode('n3-0')).toBe(true);
    expect(isBlankNode('n3-5')).toBe(true);
    expect(isBlankNode('n3-27')).toBe(true);
    expect(isBlankNode('n3-100')).toBe(true);
  });

  it('still catches legacy n5 / n12 single-segment format', () => {
    expect(isBlankNode('n5')).toBe(true);
    expect(isBlankNode('n12')).toBe(true);
    expect(isBlankNode('n0')).toBe(true);
  });

  it('still catches _: prefix and df_N_N formats', () => {
    expect(isBlankNode('_:b0')).toBe(true);
    expect(isBlankNode('_:abc123')).toBe(true);
    expect(isBlankNode('df_1_2')).toBe(true);
    expect(isBlankNode('df_42_99')).toBe(true);
  });

  it('does NOT match real IRIs (no false positives)', () => {
    expect(isBlankNode('http://purl.obolibrary.org/obo/BFO_0000019')).toBe(false);
    expect(isBlankNode('https://www.commoncoreontologies.org/ont00000044')).toBe(false);
    expect(isBlankNode('cco:ont00000044')).toBe(false);
    expect(isBlankNode('obo:BFO_0000019')).toBe(false);
    expect(isBlankNode('bfo:Process')).toBe(false);
  });

  it('does NOT match real names that happen to start with n', () => {
    // Names like 'name', 'node', 'navigation' shouldn't match since they
    // need to be \w+\d+ — the `n` must be followed immediately by a digit.
    expect(isBlankNode('node')).toBe(false);
    expect(isBlankNode('name')).toBe(false);
    expect(isBlankNode('navigation')).toBe(false);
  });

  it('handles falsy / empty values', () => {
    expect(isBlankNode(null)).toBeFalsy();
    expect(isBlankNode(undefined)).toBeFalsy();
    expect(isBlankNode('')).toBeFalsy();
  });
});

describe('Step 7.8 — BFO 2020 mid-level / leaf class coverage', () => {
  it('Group of Agents (subClassOf obo:BFO_0000027 / ObjectAggregate) routes Confirmed → MaterialEntity', () => {
    // Reproduces the exact CCO AgentOntology.ttl shape (line 715-733):
    // cco:ont00000300 rdfs:subClassOf obo:BFO_0000027 , [restriction] .
    // BFO_0000027 = ObjectAggregate, which is a subclass of MaterialEntity
    // in BFO 2020. Pre-Step-7.8 the table lookup returned null →
    // PlacementRejected. Post-fix: maps to MaterialEntity at 0.91.
    const result = evaluatePlacement({
      iri: 'https://www.commoncoreontologies.org/ont00000300',
      label: 'Group of Agents',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000027',
    });
    expect(result.placement).toBe('MaterialEntity');
    expect(result.confidence).toBe(0.91);
  });

  it('MaterialEntity subtree IDs all route to MaterialEntity', () => {
    const cases = [
      { id: 'BFO_0000027', label: 'ObjectAggregate' },
      { id: 'BFO_0000024', label: 'FiatObjectPart' },
      { id: 'BFO_0000030', label: 'Object' },
    ];
    for (const { id } of cases) {
      const result = evaluatePlacement({
        iri: 'ex:test', superclass: `http://purl.obolibrary.org/obo/${id}`,
      });
      expect(result.placement).toBe('MaterialEntity');
      expect(result.confidence).toBe(0.91);
    }
  });

  it('IndependentContinuant subtree (ImmaterialEntity branch) routes correctly', () => {
    const cases = [
      'BFO_0000141', // ImmaterialEntity
      'BFO_0000029', // Site
      'BFO_0000140', // ContinuantFiatBoundary
      'BFO_0000142', // FiatLine
      'BFO_0000146', // FiatPoint
      'BFO_0000149', // FiatSurface
      'BFO_0000147', // ZeroDimensionalContinuantFiatBoundary
    ];
    for (const id of cases) {
      const result = evaluatePlacement({
        iri: 'ex:test', superclass: `http://purl.obolibrary.org/obo/${id}`,
      });
      expect(result.placement).toBe('IndependentContinuant');
      expect(result.confidence).toBe(0.91);
    }
  });

  it('Function (BFO_0000034) routes to RealizableEntity per BFO 2020', () => {
    const result = evaluatePlacement({
      iri: 'ex:test', superclass: 'http://purl.obolibrary.org/obo/BFO_0000034',
    });
    expect(result.placement).toBe('RealizableEntity');
    expect(result.confidence).toBe(0.91);
  });

  it('History (BFO_0000182) routes to Process', () => {
    const result = evaluatePlacement({
      iri: 'ex:test', superclass: 'http://purl.obolibrary.org/obo/BFO_0000182',
    });
    expect(result.placement).toBe('Process');
    expect(result.confidence).toBe(0.91);
  });

  it('Occurrent peers (ProcessBoundary, SpatiotemporalRegion) route to Occurrent', () => {
    const cases = ['BFO_0000035', 'BFO_0000011'];
    for (const id of cases) {
      const result = evaluatePlacement({
        iri: 'ex:test', superclass: `http://purl.obolibrary.org/obo/${id}`,
      });
      expect(result.placement).toBe('Occurrent');
      expect(result.confidence).toBe(0.91);
    }
  });

  it('all spatial-region dimensional subclasses route to SpatialRegion', () => {
    const cases = [
      'BFO_0000018', // ZeroDimensionalSpatialRegion
      'BFO_0000026', // OneDimensionalSpatialRegion
      'BFO_0000009', // TwoDimensionalSpatialRegion
      'BFO_0000028', // ThreeDimensionalSpatialRegion
    ];
    for (const id of cases) {
      const result = evaluatePlacement({
        iri: 'ex:test', superclass: `http://purl.obolibrary.org/obo/${id}`,
      });
      expect(result.placement).toBe('SpatialRegion');
      expect(result.confidence).toBe(0.91);
    }
  });

  it('all temporal-region subclasses route to TemporalRegion', () => {
    const cases = [
      'BFO_0000148', // ZeroDimensionalTemporalRegion
      'BFO_0000038', // OneDimensionalTemporalRegion
      'BFO_0000203', // TemporalInstant
      'BFO_0000202', // TemporalInterval
    ];
    for (const id of cases) {
      const result = evaluatePlacement({
        iri: 'ex:test', superclass: `http://purl.obolibrary.org/obo/${id}`,
      });
      expect(result.placement).toBe('TemporalRegion');
      expect(result.confidence).toBe(0.91);
    }
  });

  it('named-form variants (bfo:ObjectAggregate, bfo:Function, etc.) also normalize', () => {
    const cases = [
      { ref: 'bfo:ObjectAggregate', expected: 'MaterialEntity' },
      { ref: 'bfo:FiatObjectPart', expected: 'MaterialEntity' },
      { ref: 'bfo:Object', expected: 'MaterialEntity' },
      { ref: 'bfo:Function', expected: 'RealizableEntity' },
      { ref: 'bfo:History', expected: 'Process' },
      { ref: 'bfo:Site', expected: 'IndependentContinuant' },
      { ref: 'bfo:ProcessBoundary', expected: 'Occurrent' },
      { ref: 'bfo:SpatiotemporalRegion', expected: 'Occurrent' },
    ];
    for (const { ref, expected } of cases) {
      const result = evaluatePlacement({ iri: 'ex:test', superclass: ref });
      expect(result.placement).toBe(expected);
    }
  });
});

describe('Step 7.6 + 7.7 — combined: CCO Eye Color shape routes Confirmed/Quality', () => {
  it('Eye Color (subClassOf BFO_0000019 + restriction blank node) → Quality at 0.91', () => {
    // Simulates the post-fix parser output: blank-node restriction
    // filtered (Step 7.7 isBlankNode catches n3-0); the real BFO IRI
    // surfaces as superclass; obofoundry URI normalizes to Quality
    // (Step 7.6 normalizeBfoClass).
    const result = evaluatePlacement({
      iri: 'https://www.commoncoreontologies.org/ont00000044',
      label: 'Eye Color',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000019',
      // Note: post-fix, the parser does NOT pass the blank-node restriction
      // as a superclass alternative — it's filtered upstream.
    });
    expect(result.placement).toBe('Quality');
    expect(result.confidence).toBe(0.91);
  });

  it('Authority Role (subClassOf obo:BFO_0000023) → Role at 0.91', () => {
    const result = evaluatePlacement({
      iri: 'https://www.commoncoreontologies.org/ont00000187',
      label: 'Authority Role',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000023',
    });
    expect(result.placement).toBe('Role');
    expect(result.confidence).toBe(0.91);
  });
});
