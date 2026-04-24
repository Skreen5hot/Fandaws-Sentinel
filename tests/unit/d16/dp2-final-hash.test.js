/**
 * Unit tests — DP-2.3.2 Final Hash pipeline + session config snapshot +
 * finalizeCanonicalRecord I2b activation sweep.
 */

import {
  computeFinalHash,
  finalizeCanonicalRecord,
  buildProductionReproducibilityHash,
} from '../../../src/core/d16/reproducibility-hash.js';
import {
  captureFrozenConfig,
  readFrozenConfig,
  assembleConfigInputs,
  clearFrozenConfig,
  resetFrozenConfigForTests,
  SessionConfigMutationError,
} from '../../../src/core/d16/session-config-snapshot.js';
import {
  captureSource,
  captureBFO,
  captureCurated,
  resetForTests as resetByteRegistry,
} from '../../../src/core/d16/ingestion-byte-registry.js';
import {
  registerSessionSignature,
  resetSessionRegistryForTests,
} from '../../../src/core/d16/bfo-signature-cache.js';
import {
  persistCanonicalRecordViaChokepoint,
} from '../../../src/core/d16/record-persistence.js';
import {
  buildScaffoldCanonicalRecord,
  DP2NonConformanceError,
} from '../../../src/core/d16/canonical-record-writer.js';

const DEFAULT_CONFIG = () => ({
  notApplicableThreshold: 40,
  inconsistentThreshold: 30,
  weightVector: {
    domain: 0.30, range: 0.30, bfoSubcategory: 0.15,
    characteristics: 0.10, allowsInheresIn: 0.05, lexical: 0.10,
  },
});

beforeEach(() => {
  resetFrozenConfigForTests();
  resetByteRegistry();
  resetSessionRegistryForTests();
});

// ── session-config-snapshot ────────────────────────────────────────

describe('captureFrozenConfig', () => {
  it('captures a valid config and produces a canonical form', () => {
    const entry = captureFrozenConfig('sess-1', DEFAULT_CONFIG());
    expect(entry.config.notApplicableThreshold).toBe(40);
    expect(entry.canonicalForm).toContain('"notApplicableThreshold":40');
    expect(entry.capturedAt).toEqual(expect.any(String));
  });

  it('idempotent re-capture with identical config succeeds', () => {
    captureFrozenConfig('sess-idem', DEFAULT_CONFIG());
    expect(() => captureFrozenConfig('sess-idem', DEFAULT_CONFIG())).not.toThrow();
  });

  it('throws SessionConfigMutationError on divergent re-capture', () => {
    captureFrozenConfig('sess-mut', DEFAULT_CONFIG());
    const divergent = { ...DEFAULT_CONFIG(), notApplicableThreshold: 35 };
    expect(() => captureFrozenConfig('sess-mut', divergent)).toThrow(SessionConfigMutationError);
  });

  it('rejects missing allow-list fields', () => {
    expect(() => captureFrozenConfig('x', { notApplicableThreshold: 40, weightVector: {} })).toThrow(TypeError);
    expect(() => captureFrozenConfig('x', { notApplicableThreshold: 40, inconsistentThreshold: 30, weightVector: { domain: 1.0 } })).toThrow(/weightVector/);
  });

  it('rejects non-finite numbers', () => {
    const bad = { ...DEFAULT_CONFIG(), notApplicableThreshold: NaN };
    expect(() => captureFrozenConfig('x', bad)).toThrow(TypeError);
  });
});

describe('assembleConfigInputs', () => {
  it('returns the X2 allow-list shape', () => {
    captureFrozenConfig('sess-assemble', DEFAULT_CONFIG());
    const inputs = assembleConfigInputs('sess-assemble');
    expect(inputs.notApplicableThreshold).toBe(40);
    expect(inputs.inconsistentThreshold).toBe(30);
    expect(Object.keys(inputs.weightVector).sort()).toEqual([
      'allowsInheresIn', 'bfoSubcategory', 'characteristics', 'domain', 'lexical', 'range',
    ]);
  });

  it('returns a deep copy (mutation-safe)', () => {
    captureFrozenConfig('sess-copy', DEFAULT_CONFIG());
    const inputs = assembleConfigInputs('sess-copy');
    inputs.weightVector.domain = 0.99;
    const fresh = assembleConfigInputs('sess-copy');
    expect(fresh.weightVector.domain).toBe(0.30);
  });

  it('throws when no snapshot exists for session', () => {
    expect(() => assembleConfigInputs('no-such-session')).toThrow(/frozen config snapshot/);
  });
});

// ── computeFinalHash (DP-2.3.2 core) ───────────────────────────────

async function primeFullSession(sessionId) {
  await captureSource({ sessionId, bytes: 'src-bytes' });
  await captureBFO({ sessionId, bytes: 'bfo-bytes' });
  await captureCurated({ sessionId, bytes: 'curated-bytes' });
  captureFrozenConfig(sessionId, DEFAULT_CONFIG());
}

describe('computeFinalHash', () => {
  it('produces 64-char lowercase hex and authoritative flag', async () => {
    await primeFullSession('final-sess-1');
    const fh = await computeFinalHash({
      cauIRI: 'ex:TestCAU', sessionId: 'final-sess-1',
      finalSignatureHash: 'sig-final', finalIterationRoundNumber: 0,
    });
    expect(fh.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fh.authoritative).toBe(true);
    expect(fh.inputsHashed).toContain('BFO version identifier');
    expect(fh.inputsHashed).toContain('session configuration hash');
  });

  it('determinism: identical inputs across sessions produce identical Final Hashes (baseline)', async () => {
    await primeFullSession('baseline-A');
    await primeFullSession('baseline-B');
    const a = await computeFinalHash({
      cauIRI: 'ex:Same', sessionId: 'baseline-A',
      finalSignatureHash: 'sig-same', finalIterationRoundNumber: 0,
    });
    const b = await computeFinalHash({
      cauIRI: 'ex:Same', sessionId: 'baseline-B',
      finalSignatureHash: 'sig-same', finalIterationRoundNumber: 0,
    });
    expect(a.hash).toBe(b.hash);
  });

  it('positive discrimination: different config produces different Final Hash', async () => {
    await primeFullSession('discrim-A');
    await captureSource({ sessionId: 'discrim-B', bytes: 'src-bytes' });
    await captureBFO({ sessionId: 'discrim-B', bytes: 'bfo-bytes' });
    await captureCurated({ sessionId: 'discrim-B', bytes: 'curated-bytes' });
    captureFrozenConfig('discrim-B', { ...DEFAULT_CONFIG(), notApplicableThreshold: 35 });

    const a = await computeFinalHash({
      cauIRI: 'ex:Same', sessionId: 'discrim-A',
      finalSignatureHash: 'sig-same', finalIterationRoundNumber: 0,
    });
    const b = await computeFinalHash({
      cauIRI: 'ex:Same', sessionId: 'discrim-B',
      finalSignatureHash: 'sig-same', finalIterationRoundNumber: 0,
    });
    expect(a.hash).not.toBe(b.hash);
  });

  it('positive discrimination: different BFO bytes produces different Final Hash', async () => {
    await primeFullSession('bfo-A');
    await captureSource({ sessionId: 'bfo-B', bytes: 'src-bytes' });
    await captureBFO({ sessionId: 'bfo-B', bytes: 'DIFFERENT-BFO-BYTES' });
    await captureCurated({ sessionId: 'bfo-B', bytes: 'curated-bytes' });
    captureFrozenConfig('bfo-B', DEFAULT_CONFIG());

    const a = await computeFinalHash({
      cauIRI: 'ex:X', sessionId: 'bfo-A',
      finalSignatureHash: 'sig-x', finalIterationRoundNumber: 0,
    });
    const b = await computeFinalHash({
      cauIRI: 'ex:X', sessionId: 'bfo-B',
      finalSignatureHash: 'sig-x', finalIterationRoundNumber: 0,
    });
    expect(a.hash).not.toBe(b.hash);
  });

  it('rejects missing bfoContentHash', async () => {
    await captureSource({ sessionId: 'missing-bfo', bytes: 'src' });
    await captureCurated({ sessionId: 'missing-bfo', bytes: 'curated' });
    captureFrozenConfig('missing-bfo', DEFAULT_CONFIG());
    await expect(computeFinalHash({
      cauIRI: 'ex:X', sessionId: 'missing-bfo',
      finalSignatureHash: 's', finalIterationRoundNumber: 0,
    })).rejects.toThrow(/bfoContentHash/);
  });

  it('rejects missing curatedContentHash', async () => {
    await captureSource({ sessionId: 'missing-curated', bytes: 'src' });
    await captureBFO({ sessionId: 'missing-curated', bytes: 'bfo' });
    captureFrozenConfig('missing-curated', DEFAULT_CONFIG());
    await expect(computeFinalHash({
      cauIRI: 'ex:X', sessionId: 'missing-curated',
      finalSignatureHash: 's', finalIterationRoundNumber: 0,
    })).rejects.toThrow(/curatedContentHash/);
  });

  it('rejects missing frozen config', async () => {
    await captureSource({ sessionId: 'missing-cfg', bytes: 'src' });
    await captureBFO({ sessionId: 'missing-cfg', bytes: 'bfo' });
    await captureCurated({ sessionId: 'missing-cfg', bytes: 'curated' });
    await expect(computeFinalHash({
      cauIRI: 'ex:X', sessionId: 'missing-cfg',
      finalSignatureHash: 's', finalIterationRoundNumber: 0,
    })).rejects.toThrow(/frozen config snapshot/);
  });
});

// ── finalizeCanonicalRecord (I2b activation) ──────────────────────

describe('finalizeCanonicalRecord', () => {
  it('replaces scaffold Final Hash with computed Final Hash and removes _scaffold sentinel', async () => {
    await primeFullSession('fin-sess');
    const sessionId = 'fin-sess';
    const cauIRI = 'ex:FinalCAU';
    registerSessionSignature({
      sessionId, cauIRI, signatureHash: 'sig-f',
      bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
    });
    const repro = await buildProductionReproducibilityHash({
      cauIRI, sessionId,
      rounds: [{ round: 0, signatureHash: 'sig-f' }],
    });
    expect(repro._scaffold).toBe(true); // pre-finalization

    const record = { cauIRI, reproducibilityHash: repro, provenance: { sessionId } };
    await finalizeCanonicalRecord({
      record, finalSignatureHash: 'sig-f', finalIterationRoundNumber: 0,
    });

    // I2b activation: sentinel removed
    expect(record.reproducibilityHash._scaffold).toBeUndefined();
    expect(record.reproducibilityHash.finalHash.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.reproducibilityHash.finalHash.hash).not.toMatch(/^0{64}$/); // real hash, not zeros
    expect(record.reproducibilityHash.finalHash.authoritative).toBe(true);
    // perRoundHashes preserved
    expect(record.reproducibilityHash.perRoundHashes).toHaveLength(1);
  });

  it('sweep discipline: 5-record session finalization leaves zero sentinel-tagged records', async () => {
    await primeFullSession('sweep-sess');
    const records = [];
    for (let i = 0; i < 5; i++) {
      const cauIRI = `ex:SweepCAU${i}`;
      registerSessionSignature({
        sessionId: 'sweep-sess', cauIRI, signatureHash: 'sig-sweep',
        bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
      });
      const repro = await buildProductionReproducibilityHash({
        cauIRI, sessionId: 'sweep-sess',
        rounds: [{ round: 0, signatureHash: 'sig-sweep' }],
      });
      records.push({ cauIRI, reproducibilityHash: repro, provenance: { sessionId: 'sweep-sess' } });
    }
    // Pre-sweep: all carry sentinel
    expect(records.filter((r) => r.reproducibilityHash._scaffold).length).toBe(5);

    for (const r of records) {
      await finalizeCanonicalRecord({
        record: r, finalSignatureHash: 'sig-sweep', finalIterationRoundNumber: 0,
      });
    }

    // Post-sweep: zero records retain sentinel (I2b active)
    expect(records.filter((r) => r.reproducibilityHash._scaffold).length).toBe(0);
    // Every record has a real 64-char-hex Final Hash
    for (const r of records) {
      expect(r.reproducibilityHash.finalHash.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('rejects record missing cauIRI or sessionId', async () => {
    await expect(finalizeCanonicalRecord({ record: {}, finalSignatureHash: 's', finalIterationRoundNumber: 0 }))
      .rejects.toThrow(TypeError);
  });
});

// ── Record persistence chokepoint helper ──────────────────────────

describe('persistCanonicalRecordViaChokepoint', () => {
  it('returns validated record on pass; persisted:false with no adapter', () => {
    const record = buildScaffoldCanonicalRecord({
      cauIRI: 'ex:C', sessionId: 's', disposition: 'Entailed', bfoCategory: 'bfo:Process',
    });
    const result = persistCanonicalRecordViaChokepoint(record, { phase: 'scaffold' });
    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(false);
  });

  it('invokes adapter.persistCanonicalRecord when adapter provided', () => {
    const record = buildScaffoldCanonicalRecord({
      cauIRI: 'ex:C', sessionId: 's', disposition: 'Entailed', bfoCategory: 'bfo:Process',
    });
    const calls = [];
    const adapter = { persistCanonicalRecord: (r, ctx) => calls.push({ r, ctx }) };
    const result = persistCanonicalRecordViaChokepoint(record, { phase: 'scaffold' }, adapter);
    expect(result.persisted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].r).toBe(record);
  });

  it('propagates DP2NonConformanceError (no persistence on failure)', () => {
    const record = buildScaffoldCanonicalRecord({
      cauIRI: 'ex:C', sessionId: 's', disposition: 'Entailed', bfoCategory: 'bfo:Process',
    });
    delete record.explanation; // invalidate
    const calls = [];
    const adapter = { persistCanonicalRecord: () => calls.push(1) };
    expect(() => persistCanonicalRecordViaChokepoint(record, { phase: 'production' }, adapter))
      .toThrow(DP2NonConformanceError);
    expect(calls).toHaveLength(0);
  });
});
