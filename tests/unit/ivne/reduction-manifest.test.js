/**
 * Reduction Manifest Builder — Unit Tests
 *
 * Tests loss recording, fidelity score computation, and manifest assembly.
 */

import { describe, it, expect } from '@jest/globals';
import { ManifestBuilder } from '../../../src/core/ivne/reduction-manifest.js';

function createBuilder(overrides = {}) {
  return new ManifestBuilder({
    ivneRunId: 'test-run-001',
    sourceOntology: 'http://example.org/test.owl',
    sourceHash: 'abc123',
    compiledAt: '2025-01-01T00:00:00.000Z',
    configUsed: { locale: 'en' },
    ...overrides,
  });
}

function makeLoss(severity, lossType = 'testLoss') {
  return {
    '@type': 'fandaws:SemanticLossRecord',
    'fandaws:lossType': lossType,
    'fandaws:severity': severity,
    'fandaws:sourceAxiom': 'test axiom',
  };
}

// ── Fidelity Score ──

describe('ManifestBuilder — fidelityScore', () => {
  it('returns 1.0 when no losses recorded', () => {
    const builder = createBuilder();
    expect(builder.computeFidelityScore()).toBe(1.0);
  });

  it('returns 1.0 when all losses are informational', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('informational'));
    builder.recordLoss(makeLoss('informational'));
    expect(builder.computeFidelityScore()).toBe(1.0);
  });

  it('returns 0.0 when all losses are lossy', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('lossy'));
    builder.recordLoss(makeLoss('lossy'));
    expect(builder.computeFidelityScore()).toBe(0.0);
  });

  it('returns correct ratio for mixed losses', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('informational'));
    builder.recordLoss(makeLoss('degraded'));
    builder.recordLoss(makeLoss('lossy'));
    // 1 informational / 3 total = 0.333...
    expect(builder.computeFidelityScore()).toBeCloseTo(1 / 3);
  });

  it('counts degraded as non-informational', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('informational'));
    builder.recordLoss(makeLoss('degraded'));
    // 1 informational / 2 total = 0.5
    expect(builder.computeFidelityScore()).toBe(0.5);
  });
});

// ── Loss Recording ──

describe('ManifestBuilder — loss recording', () => {
  it('records individual losses', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('lossy'));
    const manifest = builder.build();
    expect(manifest['fandaws:lossRecords']).toHaveLength(1);
  });

  it('records multiple losses at once', () => {
    const builder = createBuilder();
    builder.recordLosses([makeLoss('lossy'), makeLoss('informational')]);
    const manifest = builder.build();
    expect(manifest['fandaws:lossRecords']).toHaveLength(2);
  });
});

// ── Rejection Recording ──

describe('ManifestBuilder — rejection recording', () => {
  it('records rejections', () => {
    const builder = createBuilder();
    builder.recordRejection({ axiom: {}, reason: 'complementDrop' });
    const manifest = builder.build();
    expect(manifest['fandaws:rejectedAxioms']).toHaveLength(1);
  });

  it('records multiple rejections at once', () => {
    const builder = createBuilder();
    builder.recordRejections([
      { axiom: {}, reason: 'a' },
      { axiom: {}, reason: 'b' },
    ]);
    const manifest = builder.build();
    expect(manifest['fandaws:rejectedAxioms']).toHaveLength(2);
  });
});

// ── IRI Mapping Recording ──

describe('ManifestBuilder — IRI mappings', () => {
  it('records IRI mappings', () => {
    const builder = createBuilder();
    builder.recordIriMapping({ source: 'ex:Dog', fandaws: 'fandaws:class/dog' });
    const manifest = builder.build();
    expect(manifest['fandaws:iriMappings']).toHaveLength(1);
  });

  it('records multiple mappings at once', () => {
    const builder = createBuilder();
    builder.recordIriMappings([
      { source: 'ex:A', fandaws: 'fandaws:class/a' },
      { source: 'ex:B', fandaws: 'fandaws:class/b' },
    ]);
    const manifest = builder.build();
    expect(manifest['fandaws:iriMappings']).toHaveLength(2);
  });
});

// ── Build Output ──

describe('ManifestBuilder — build', () => {
  it('produces a ReductionManifest with correct @type', () => {
    const manifest = createBuilder().build();
    expect(manifest['@type']).toBe('fandaws:ReductionManifest');
  });

  it('includes ivneRunId', () => {
    const manifest = createBuilder().build();
    expect(manifest['fandaws:ivneRunId']).toBe('test-run-001');
  });

  it('includes sourceOntology', () => {
    const manifest = createBuilder().build();
    expect(manifest['fandaws:sourceOntology']).toBe('http://example.org/test.owl');
  });

  it('includes sourceHash', () => {
    const manifest = createBuilder().build();
    expect(manifest['fandaws:sourceHash']).toBe('abc123');
  });

  it('includes statistics with fidelityScore', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('informational'));
    const manifest = builder.build();
    expect(manifest['fandaws:statistics'].fidelityScore).toBe(1.0);
  });

  it('includes lossByType counts', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('lossy', 'unionGeneralization'));
    builder.recordLoss(makeLoss('lossy', 'unionGeneralization'));
    builder.recordLoss(makeLoss('informational', 'intersectionFlattening'));
    const manifest = builder.build();
    expect(manifest['fandaws:statistics'].lossByType.unionGeneralization).toBe(2);
    expect(manifest['fandaws:statistics'].lossByType.intersectionFlattening).toBe(1);
  });

  it('includes lossBySeverity counts', () => {
    const builder = createBuilder();
    builder.recordLoss(makeLoss('lossy'));
    builder.recordLoss(makeLoss('degraded'));
    const manifest = builder.build();
    expect(manifest['fandaws:statistics'].lossBySeverity.lossy).toBe(1);
    expect(manifest['fandaws:statistics'].lossBySeverity.degraded).toBe(1);
  });

  it('includes totalRejected count', () => {
    const builder = createBuilder();
    builder.recordRejection({ axiom: {}, reason: 'a' });
    builder.recordValidationFailure({ concept: 'x', reason: 'b' });
    const manifest = builder.build();
    expect(manifest['fandaws:statistics'].totalRejected).toBe(2);
  });

  it('sets chainConsumptionReady based on config', () => {
    const builder = createBuilder();
    const m1 = builder.build({ fnsrChainSupport: false, oceChainSupport: false });
    expect(m1['fandaws:chainConsumptionReady']).toBe(false);

    const m2 = builder.build({ fnsrChainSupport: true });
    expect(m2['fandaws:chainConsumptionReady']).toBe(true);
  });

  it('includes compilationDurationMs', () => {
    const manifest = createBuilder().build();
    expect(typeof manifest['fandaws:statistics'].compilationDurationMs).toBe('number');
  });

  it('includes generated concepts', () => {
    const builder = createBuilder();
    builder.recordGeneratedConcepts(['fandaws:gen/abc', 'fandaws:gen/def']);
    const manifest = builder.build();
    expect(manifest['fandaws:generatedConcepts']).toHaveLength(2);
  });
});
