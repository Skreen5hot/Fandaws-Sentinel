/**
 * Unit tests — DP-2.3.1 per-round hash pipeline + session-hash registry
 * + V4 must-compute invariants.
 */

import {
  computePerRoundHash,
  buildProductionReproducibilityHash,
} from '../../../src/core/d16/reproducibility-hash.js';
import {
  registerSessionSignature,
  lookupSessionSignature,
  snapshotSessionRegistry,
  clearSessionRegistry,
  resetSessionRegistryForTests,
} from '../../../src/core/d16/bfo-signature-cache.js';
import {
  applyMutationSequence,
  _computeInvariantsForTests,
  _TERMINAL_DISPOSITION_SET,
} from '../../../src/core/d16/reactive-engine.js';

beforeEach(() => resetSessionRegistryForTests());

// ── Session-hash registry (Forward-Flag Item 2) ────────────────────

describe('session-hash registry', () => {
  it('registers and resolves signature state', () => {
    registerSessionSignature({
      sessionId: 'sess-1', cauIRI: 'ex:CAU1',
      signatureHash: 'sig-hash-1',
      bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
      timestamp: '2026-04-24T00:00:00Z',
    });
    const entry = lookupSessionSignature({
      sessionId: 'sess-1', cauIRI: 'ex:CAU1', signatureHash: 'sig-hash-1',
    });
    expect(entry).toEqual({
      bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
      timestamp: '2026-04-24T00:00:00Z',
    });
  });

  it('returns null for unregistered triple', () => {
    expect(lookupSessionSignature({
      sessionId: 'unknown', cauIRI: 'x', signatureHash: 'y',
    })).toBeNull();
  });

  it('survives cache-mutation between write and read (load-bearing per SME)', () => {
    // Register a signature under BFO-2020
    registerSessionSignature({
      sessionId: 'sess-mut', cauIRI: 'ex:CAU', signatureHash: 'sig-v1',
      bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
    });

    // Simulate VD-6 cache rebuild: register a NEW state for a NEW signature
    // (cache has moved forward). But the OLD registration for 'sig-v1' must
    // still be intact — that's the point of a registry vs live cache read.
    registerSessionSignature({
      sessionId: 'sess-mut', cauIRI: 'ex:CAU', signatureHash: 'sig-v2',
      bfoVersion: 'BFO-2021', curatedVersion: 'v1.1',
    });

    const old = lookupSessionSignature({
      sessionId: 'sess-mut', cauIRI: 'ex:CAU', signatureHash: 'sig-v1',
    });
    expect(old.bfoVersion).toBe('BFO-2020'); // preserved despite cache mutation
  });

  it('snapshot returns all registered entries for a session', () => {
    registerSessionSignature({ sessionId: 's', cauIRI: 'c1', signatureHash: 'h1', bfoVersion: 'v1' });
    registerSessionSignature({ sessionId: 's', cauIRI: 'c2', signatureHash: 'h2', bfoVersion: 'v1' });
    const snap = snapshotSessionRegistry('s');
    expect(snap).toHaveLength(2);
    expect(snap[0]).toHaveProperty('cauIRI');
    expect(snap[0]).toHaveProperty('signatureHash');
    expect(snap[0]).toHaveProperty('bfoVersion');
  });

  it('clearSessionRegistry removes entries', () => {
    registerSessionSignature({ sessionId: 'clear-me', cauIRI: 'c', signatureHash: 'h', bfoVersion: 'v' });
    clearSessionRegistry('clear-me');
    expect(snapshotSessionRegistry('clear-me')).toEqual([]);
  });

  it('rejects missing sessionId / cauIRI / signatureHash', () => {
    expect(() => registerSessionSignature({ sessionId: '', cauIRI: 'c', signatureHash: 'h' })).toThrow(TypeError);
    expect(() => registerSessionSignature({ sessionId: 's', cauIRI: '', signatureHash: 'h' })).toThrow(TypeError);
    expect(() => registerSessionSignature({ sessionId: 's', cauIRI: 'c', signatureHash: '' })).toThrow(TypeError);
  });
});

// ── DP-2.3.1 per-round hash ────────────────────────────────────────

describe('computePerRoundHash', () => {
  beforeEach(() => {
    registerSessionSignature({
      sessionId: 'hash-sess', cauIRI: 'ex:TestCAU', signatureHash: 'sig-hash-A',
      bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
      timestamp: '2026-04-24T00:00:00Z',
    });
  });

  it('produces 64-char lowercase hex hash', async () => {
    const result = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
    });
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.round).toBe(0);
    expect(result.inputsHashed).toContain('cauIRI');
    expect(result.inputsHashed).toContain('reasonerStateKey');
  });

  it('determinism: identical inputs produce identical hashes', async () => {
    const a = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
    });
    const b = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
    });
    expect(a.hash).toBe(b.hash);
  });

  it('different rounds produce different hashes', async () => {
    const r0 = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
    });
    const r1 = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 1, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
    });
    expect(r0.hash).not.toBe(r1.hash);
  });

  it('different signatureHash values produce different hashes', async () => {
    registerSessionSignature({
      sessionId: 'hash-sess', cauIRI: 'ex:TestCAU', signatureHash: 'sig-hash-B',
      bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
    });
    const a = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
    });
    const b = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-B',
    });
    expect(a.hash).not.toBe(b.hash);
  });

  it('crossCAUInfluences affect the hash when consumed', async () => {
    const withInfluences = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
      crossCAUInfluencesConsumed: ['dict-id-1', 'dict-id-2'],
    });
    const withoutInfluences = await computePerRoundHash({
      cauIRI: 'ex:TestCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'sig-hash-A',
      crossCAUInfluencesConsumed: [],
    });
    expect(withInfluences.hash).not.toBe(withoutInfluences.hash);
  });

  it('unregistered signatureHash falls back to sentinel (DP-2.3.2 will tighten)', async () => {
    const result = await computePerRoundHash({
      cauIRI: 'ex:UnregisteredCAU', round: 0, sessionId: 'hash-sess', signatureHash: 'never-registered',
    });
    // Should succeed; DP-2.3.2 will reject at Final Hash assembly.
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildProductionReproducibilityHash', () => {
  beforeEach(() => {
    for (let r = 0; r <= 2; r++) {
      registerSessionSignature({
        sessionId: 'multi-round', cauIRI: 'ex:MultiCAU',
        signatureHash: `sig-r${r}`,
        bfoVersion: 'BFO-2020', curatedVersion: 'v1.0',
      });
    }
  });

  it('single-round produces perRoundHashes length 1', async () => {
    const h = await buildProductionReproducibilityHash({
      cauIRI: 'ex:MultiCAU', sessionId: 'multi-round',
      rounds: [{ round: 0, signatureHash: 'sig-r0' }],
    });
    expect(h.perRoundHashes).toHaveLength(1);
    expect(h.algorithm).toBe('SHA-256');
    expect(h._scaffold).toBe(true); // still scaffold Final Hash until DP-2.3.2
  });

  it('2-round fallback produces perRoundHashes length 2 with distinct hashes', async () => {
    const h = await buildProductionReproducibilityHash({
      cauIRI: 'ex:MultiCAU', sessionId: 'multi-round',
      rounds: [
        { round: 0, signatureHash: 'sig-r0' },
        { round: 1, signatureHash: 'sig-r1' },
      ],
    });
    expect(h.perRoundHashes).toHaveLength(2);
    expect(h.perRoundHashes[0].round).toBe(0);
    expect(h.perRoundHashes[1].round).toBe(1);
    expect(h.perRoundHashes[0].hash).not.toBe(h.perRoundHashes[1].hash);
  });

  it('3-round fallback produces perRoundHashes length 3', async () => {
    const h = await buildProductionReproducibilityHash({
      cauIRI: 'ex:MultiCAU', sessionId: 'multi-round',
      rounds: [
        { round: 0, signatureHash: 'sig-r0' },
        { round: 1, signatureHash: 'sig-r1' },
        { round: 2, signatureHash: 'sig-r2' },
      ],
    });
    expect(h.perRoundHashes).toHaveLength(3);
  });

  it('rejects empty rounds array', async () => {
    await expect(buildProductionReproducibilityHash({
      cauIRI: 'ex:X', sessionId: 's', rounds: [],
    })).rejects.toThrow(/non-empty/);
  });
});

// ── V4 must-compute invariants ─────────────────────────────────────

describe('applyMutationSequence V4 must-compute invariants', () => {
  it('terminal disposition set includes IterationNonConvergence per SME scoping', () => {
    expect(_TERMINAL_DISPOSITION_SET.has('Entailed')).toBe(true);
    expect(_TERMINAL_DISPOSITION_SET.has('Plausible')).toBe(true);
    expect(_TERMINAL_DISPOSITION_SET.has('Inconsistent')).toBe(true);
    expect(_TERMINAL_DISPOSITION_SET.has('NotApplicable')).toBe(true);
    expect(_TERMINAL_DISPOSITION_SET.has('IterationNonConvergence')).toBe(true);
    expect(_TERMINAL_DISPOSITION_SET.has('provisional')).toBe(false);
  });

  it('measured:false when no postCascadeState provided (scaffold path)', () => {
    const result = applyMutationSequence({
      totalCAUs: 10, mutationSequence: [],
    });
    expect(result.finalStateInvariants.measured).toBe(false);
    // Scaffold `true` values preserved for callers that haven't wired state yet.
    expect(result.convergenceReached).toBe(true);
  });

  it('measured:true when postCascadeState provided with clean state', () => {
    const inv = _computeInvariantsForTests({
      caus: [
        { iri: 'ex:A', disposition: 'Entailed', pendingReEvaluation: false, visitedDispositions: ['Plausible', 'Entailed'] },
        { iri: 'ex:B', disposition: 'NotApplicable', pendingReEvaluation: false, visitedDispositions: ['NotApplicable'] },
      ],
      eventQueue: [],
      neighborQueryLog: [{ cau: 'ex:A', neighborsReturned: true }],
      oersPostCascadeClean: true,
    });
    expect(inv.measured).toBe(true);
    expect(inv.convergenceReached).toBe(true);
    expect(inv.allCAUsInTerminalDispositionSet).toBe(true);
    expect(inv.noPendingReEvaluations).toBe(true);
    expect(inv.noOscillation).toBe(true);
    expect(inv.dependencyGraphConsistent).toBe(true);
  });

  it('convergenceReached=false when event queue non-empty', () => {
    const inv = _computeInvariantsForTests({
      caus: [], eventQueue: [{ event: 'pending' }], neighborQueryLog: [],
    });
    expect(inv.convergenceReached).toBe(false);
  });

  it('convergenceReached=false when any CAU has pendingReEvaluation', () => {
    const inv = _computeInvariantsForTests({
      caus: [{ iri: 'x', disposition: 'Entailed', pendingReEvaluation: true, visitedDispositions: [] }],
      eventQueue: [],
      neighborQueryLog: [],
    });
    expect(inv.convergenceReached).toBe(false);
    expect(inv.noPendingReEvaluations).toBe(true); // queue-only defense-in-depth check
  });

  it('allCAUsInTerminalDispositionSet=false when any CAU is provisional', () => {
    const inv = _computeInvariantsForTests({
      caus: [
        { iri: 'x', disposition: 'Entailed', visitedDispositions: [] },
        { iri: 'y', disposition: 'provisional', visitedDispositions: [] },
      ],
      eventQueue: [], neighborQueryLog: [],
    });
    expect(inv.allCAUsInTerminalDispositionSet).toBe(false);
  });

  it('allCAUsInTerminalDispositionSet=true when CAU is IterationNonConvergence (terminal per SME)', () => {
    const inv = _computeInvariantsForTests({
      caus: [
        { iri: 'x', disposition: 'IterationNonConvergence', visitedDispositions: ['Plausible', 'Inconsistent', 'Plausible', 'IterationNonConvergence'] },
      ],
      eventQueue: [], neighborQueryLog: [],
    });
    expect(inv.allCAUsInTerminalDispositionSet).toBe(true);
  });

  it('noOscillation=false when same-disposition revisit within same cascade', () => {
    const inv = _computeInvariantsForTests({
      caus: [
        { iri: 'x', disposition: 'Entailed', visitedDispositions: ['Plausible', 'Entailed', 'Plausible', 'Entailed'] },
      ],
      eventQueue: [], neighborQueryLog: [],
    });
    expect(inv.noOscillation).toBe(false);
  });

  it('dependencyGraphConsistent=false when OERS post-cascade not clean', () => {
    const inv = _computeInvariantsForTests({
      caus: [], eventQueue: [], neighborQueryLog: [],
      oersPostCascadeClean: false,
    });
    expect(inv.dependencyGraphConsistent).toBe(false);
  });

  it('dependencyGraphConsistent=false when any neighbor query failed to return', () => {
    const inv = _computeInvariantsForTests({
      caus: [], eventQueue: [],
      neighborQueryLog: [
        { cau: 'ex:A', neighborsReturned: true },
        { cau: 'ex:B', neighborsReturned: false },
      ],
      oersPostCascadeClean: true,
    });
    expect(inv.dependencyGraphConsistent).toBe(false);
  });
});
