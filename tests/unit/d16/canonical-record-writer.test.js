/**
 * Unit tests — Canonical Record Writer + DP-2 schema validator (DP-2.1).
 *
 * Covers:
 *   - Scaffold emitter output shape (all four dispositions)
 *   - Happy path: scaffold record survives I1 + I2a
 *   - I1 schema gate failures: missing explanation / provenance / reproducibilityHash
 *   - I2a content validation failures:
 *       - empty axiomEvidence (disposition-aware; NotApplicable single-element passes)
 *       - empty iterationHistory
 *       - invalid hash shape on production records
 *       - terminal validationState=provisional (F3)
 *   - Phase routing required per SME-DP2-P1 (no absence-based routing)
 *   - DP2NonConformanceError structure
 */

import {
  writeCanonicalRecord,
  buildScaffoldCanonicalRecord,
  buildScaffoldExplanation,
  buildScaffoldProvenance,
  buildScaffoldReproducibilityHash,
  DP2NonConformanceError,
} from '../../../src/core/d16/canonical-record-writer.js';
import { validateCanonicalRecord } from '../../../src/core/d16/dp2-schema.js';

const SESSION_ID = 'test-session-uuid-0001';
const CAU_IRI = 'ex:TestCAU';

// ── Scaffold emitter shape ─────────────────────────────────────────

describe('buildScaffoldExplanation', () => {
  it.each(['Entailed', 'Plausible', 'Inconsistent'])('produces shape-valid explanation for %s', (disposition) => {
    const e = buildScaffoldExplanation({ cauIRI: CAU_IRI, disposition });
    expect(typeof e.dispositionReason).toBe('string');
    expect(e.dispositionReason.length).toBeGreaterThan(0);
    expect(Array.isArray(e.axiomEvidence)).toBe(true);
    expect(e.axiomEvidence.length).toBeGreaterThanOrEqual(1);
    expect(e.reasoningSteps).toEqual([]);
    expect(e.alternativesConsidered).toEqual([]);
    expect(e.validationState).toBe('not_inherited');
    expect(e.conflictAnnotation).toBeNull();
    expect(e.reconciliationHistory).toEqual([]);
  });

  it('requires routingMechanism for NotApplicable', () => {
    expect(() => buildScaffoldExplanation({ cauIRI: CAU_IRI, disposition: 'NotApplicable' })).toThrow(TypeError);
    expect(() => buildScaffoldExplanation({ cauIRI: CAU_IRI, disposition: 'NotApplicable', routingMechanism: 'bogus' })).toThrow(TypeError);
  });

  it.each(['automatic', 'default_axiom_poor', 'manual'])('accepts NotApplicable with routing mechanism %s', (mech) => {
    const e = buildScaffoldExplanation({ cauIRI: CAU_IRI, disposition: 'NotApplicable', routingMechanism: mech });
    expect(e.axiomEvidence).toHaveLength(1);
    expect(e.axiomEvidence[0].axiomIRI).toContain(mech);
    expect(e.axiomEvidence[0].contributionRole).toBe('routingTrigger');
  });
});

describe('buildScaffoldProvenance', () => {
  it('emits single round-0 iteration entry adequate for I2a', () => {
    const p = buildScaffoldProvenance({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
    expect(p.sessionId).toBe(SESSION_ID);
    expect(p.iterationHistory).toHaveLength(1);
    expect(p.iterationHistory[0]).toEqual(expect.objectContaining({
      round: 0,
      disposition: 'Entailed',
      bfoCategory: 'bfo:Process',
      reasonerStepsConsumed: 0,
    }));
    expect(p.iterationHistory[0].timestamp).toEqual(expect.any(String));
    expect(p.crossCAUInfluences).toEqual([]);
    expect(p.propertyAlignmentsConsumed).toEqual([]);
    expect(p.compatibilityDegraded).toBe(false);
    expect(p.analystOverride).toBe(false);
  });

  it('propagates compatibilityDegraded session flag', () => {
    const p = buildScaffoldProvenance({
      cauIRI: CAU_IRI,
      sessionId: SESSION_ID,
      disposition: 'Plausible',
      compatibilityDegraded: true,
    });
    expect(p.compatibilityDegraded).toBe(true);
  });
});

describe('buildScaffoldReproducibilityHash', () => {
  it('produces placeholder hash with _scaffold sentinel', () => {
    const h = buildScaffoldReproducibilityHash({ cauIRI: CAU_IRI });
    expect(h.algorithm).toBe('SHA-256');
    expect(h._scaffold).toBe(true);
    expect(h.perRoundHashes).toHaveLength(1);
    expect(h.perRoundHashes[0].round).toBe(0);
    expect(h.perRoundHashes[0].hash).toMatch(/^0{64}$/);
    expect(h.finalHash.authoritative).toBe(true);
    expect(h.finalHash.hash).toMatch(/^0{64}$/);
    expect(h.finalHash.inputsHashed).toEqual(expect.arrayContaining([
      'CAU IRI',
      'Final Signature hash',
      'BFO version identifier',
      'session configuration hash',
    ]));
  });
});

// ── Happy path: scaffold record passes I1 + I2a ────────────────────

describe('writeCanonicalRecord — scaffold happy path', () => {
  it.each(['Entailed', 'Plausible', 'Inconsistent'])('accepts scaffold %s record under scaffold phase', (disposition) => {
    const record = buildScaffoldCanonicalRecord({
      cauIRI: CAU_IRI,
      sessionId: SESSION_ID,
      disposition,
      bfoCategory: 'bfo:Process',
    });
    const result = writeCanonicalRecord(record, { phase: 'scaffold' });
    expect(result.ok).toBe(true);
    expect(result.phase).toBe('scaffold');
    expect(result.record).toBe(record);
  });

  it('accepts scaffold NotApplicable with routing mechanism', () => {
    const record = buildScaffoldCanonicalRecord({
      cauIRI: CAU_IRI,
      sessionId: SESSION_ID,
      disposition: 'NotApplicable',
      routingMechanism: 'automatic',
    });
    const result = writeCanonicalRecord(record, { phase: 'scaffold' });
    expect(result.ok).toBe(true);
    expect(result.record.explanation.axiomEvidence).toHaveLength(1);
  });
});

// ── Phase routing (SME-DP2-P1) ─────────────────────────────────────

describe('writeCanonicalRecord — phase routing', () => {
  const validRecord = buildScaffoldCanonicalRecord({
    cauIRI: CAU_IRI,
    sessionId: SESSION_ID,
    disposition: 'Entailed',
    bfoCategory: 'bfo:Process',
  });

  it('rejects missing context with TypeError', () => {
    expect(() => writeCanonicalRecord(validRecord)).toThrow(TypeError);
    expect(() => writeCanonicalRecord(validRecord, null)).toThrow(TypeError);
  });

  it('rejects missing context.phase with TypeError', () => {
    expect(() => writeCanonicalRecord(validRecord, {})).toThrow(TypeError);
  });

  it.each(['scaffold-implicit', 'prod', 'PRODUCTION', ''])('rejects invalid phase %j with TypeError', (phase) => {
    expect(() => writeCanonicalRecord(validRecord, { phase })).toThrow(TypeError);
  });

  it('accepts both scaffold and production phases', () => {
    expect(writeCanonicalRecord(validRecord, { phase: 'scaffold' }).phase).toBe('scaffold');
    // Under production phase, the scaffold-hash sentinel would normally be
    // removed by DP-2.3.2; for DP-2.1 test coverage, we accept either phase
    // since the writer itself is phase-agnostic for I1+I2a validation.
    expect(writeCanonicalRecord(validRecord, { phase: 'production' }).phase).toBe('production');
  });
});

// ── I1 Schema Gate: missing top-level DP-2 fields ──────────────────

describe('writeCanonicalRecord — I1 schema gate rejections', () => {
  const baseRecord = () => buildScaffoldCanonicalRecord({
    cauIRI: CAU_IRI,
    sessionId: SESSION_ID,
    disposition: 'Entailed',
    bfoCategory: 'bfo:Process',
  });

  it('rejects record missing explanation — matches AVC scenario dp2-schema-validation-rejects-missing-explanation', () => {
    const record = baseRecord();
    delete record.explanation;
    expect(() => writeCanonicalRecord(record, { phase: 'production' })).toThrow(DP2NonConformanceError);
    try {
      writeCanonicalRecord(record, { phase: 'production' });
    } catch (e) {
      expect(e).toBeInstanceOf(DP2NonConformanceError);
      expect(e.rule).toBe('DP-2-R1');
      expect(e.path).toBe('explanation');
      expect(e.message).toContain('Rule DP-2-R1 enforces mandatory explanation');
    }
  });

  it('rejects record missing provenance', () => {
    const record = baseRecord();
    delete record.provenance;
    expect(() => writeCanonicalRecord(record, { phase: 'production' })).toThrow(DP2NonConformanceError);
    try {
      writeCanonicalRecord(record, { phase: 'production' });
    } catch (e) {
      expect(e.rule).toBe('DP-2-R2');
      expect(e.path).toBe('provenance');
    }
  });

  it('rejects record missing reproducibilityHash', () => {
    const record = baseRecord();
    delete record.reproducibilityHash;
    expect(() => writeCanonicalRecord(record, { phase: 'production' })).toThrow(DP2NonConformanceError);
    try {
      writeCanonicalRecord(record, { phase: 'production' });
    } catch (e) {
      expect(e.rule).toBe('DP-2-R3');
      expect(e.path).toBe('reproducibilityHash');
    }
  });

  it('rejects record missing disposition', () => {
    const record = baseRecord();
    delete record.disposition;
    expect(() => writeCanonicalRecord(record, { phase: 'production' })).toThrow(DP2NonConformanceError);
  });

  it('accumulates all missing-field errors in errors[]', () => {
    const record = baseRecord();
    delete record.explanation;
    delete record.provenance;
    delete record.reproducibilityHash;
    try {
      writeCanonicalRecord(record, { phase: 'production' });
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DP2NonConformanceError);
      const rules = e.errors.map((err) => err.rule);
      expect(rules).toEqual(expect.arrayContaining(['DP-2-R1', 'DP-2-R2', 'DP-2-R3']));
    }
  });
});

// ── I2a Content Validation rejections ──────────────────────────────

describe('writeCanonicalRecord — I2a content validation', () => {
  // AVC scenario: dp2-schema-validation-rejects-empty-axiom-evidence
  describe('axiomEvidence disposition-aware non-empty floor', () => {
    it.each(['Entailed', 'Plausible', 'Inconsistent'])('rejects empty axiomEvidence for %s', (disposition) => {
      const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition, bfoCategory: 'bfo:Process' });
      record.explanation.axiomEvidence = [];
      expect(() => writeCanonicalRecord(record, { phase: 'production' })).toThrow(DP2NonConformanceError);
      try {
        writeCanonicalRecord(record, { phase: 'production' });
      } catch (e) {
        expect(e.rule).toBe('DP-2-I2a');
        expect(e.path).toBe('explanation.axiomEvidence');
      }
    });

    it('rejects empty axiomEvidence for NotApplicable (single-element floor per DP-2.1.D3)', () => {
      const record = buildScaffoldCanonicalRecord({
        cauIRI: CAU_IRI,
        sessionId: SESSION_ID,
        disposition: 'NotApplicable',
        routingMechanism: 'automatic',
      });
      record.explanation.axiomEvidence = [];
      expect(() => writeCanonicalRecord(record, { phase: 'production' })).toThrow(DP2NonConformanceError);
    });

    it('accepts NotApplicable with single-element axiomEvidence', () => {
      const record = buildScaffoldCanonicalRecord({
        cauIRI: CAU_IRI,
        sessionId: SESSION_ID,
        disposition: 'NotApplicable',
        routingMechanism: 'default_axiom_poor',
      });
      expect(record.explanation.axiomEvidence).toHaveLength(1);
      expect(writeCanonicalRecord(record, { phase: 'production' }).ok).toBe(true);
    });
  });

  describe('iterationHistory non-empty', () => {
    it('rejects empty iterationHistory per DP-2-R2', () => {
      const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
      record.provenance.iterationHistory = [];
      try {
        writeCanonicalRecord(record, { phase: 'production' });
        fail('should have thrown');
      } catch (e) {
        expect(e.rule).toBe('DP-2-I2a');
        expect(e.path).toBe('provenance.iterationHistory');
      }
    });
  });

  describe('validationState terminal-provisional rejection (F3)', () => {
    it('rejects persisted record with validationState=provisional per NA Commitment 2', () => {
      const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
      record.explanation.validationState = 'provisional';
      try {
        writeCanonicalRecord(record, { phase: 'production' });
        fail('should have thrown');
      } catch (e) {
        expect(e.rule).toBe('DP-2-I2a');
        expect(e.path).toBe('explanation.validationState');
        expect(e.message).toContain('NA-1.2');
      }
    });

    it.each(['validated_no_conflict', 'soft_conflict_detected', 'hard_conflict_detected', 'not_inherited'])('accepts %s as terminal validationState', (state) => {
      const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
      record.explanation.validationState = state;
      expect(writeCanonicalRecord(record, { phase: 'production' }).ok).toBe(true);
    });
  });

  describe('hash shape validation (I2a vs I2b boundary)', () => {
    it('accepts scaffold placeholder hashes via _scaffold sentinel bypass', () => {
      const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
      expect(record.reproducibilityHash._scaffold).toBe(true);
      expect(writeCanonicalRecord(record, { phase: 'scaffold' }).ok).toBe(true);
    });

    it('rejects non-hex hash value when _scaffold sentinel absent (I2a, shape-only)', () => {
      const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
      delete record.reproducibilityHash._scaffold;
      record.reproducibilityHash.finalHash.hash = 'not-a-hex-string';
      try {
        writeCanonicalRecord(record, { phase: 'production' });
        fail('should have thrown');
      } catch (e) {
        expect(e.rule).toBe('DP-2-I2a');
        expect(e.path).toBe('reproducibilityHash.finalHash.hash');
      }
    });

    it('accepts 64-char lowercase hex hash when _scaffold sentinel absent', () => {
      const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
      delete record.reproducibilityHash._scaffold;
      const hex64 = 'a'.repeat(64);
      record.reproducibilityHash.finalHash.hash = hex64;
      record.reproducibilityHash.perRoundHashes[0].hash = hex64;
      expect(writeCanonicalRecord(record, { phase: 'production' }).ok).toBe(true);
    });
  });
});

// ── Validator direct use ───────────────────────────────────────────

describe('validateCanonicalRecord — direct invocation', () => {
  it('returns ok:true with empty errors on valid record', () => {
    const record = buildScaffoldCanonicalRecord({ cauIRI: CAU_IRI, sessionId: SESSION_ID, disposition: 'Entailed', bfoCategory: 'bfo:Process' });
    const { ok, errors } = validateCanonicalRecord(record);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });

  it('returns ok:false with populated errors on invalid record', () => {
    const { ok, errors } = validateCanonicalRecord({});
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    for (const err of errors) {
      expect(err).toHaveProperty('rule');
      expect(err).toHaveProperty('path');
      expect(err).toHaveProperty('message');
    }
  });

  it('rejects non-object record input', () => {
    const { ok, errors } = validateCanonicalRecord('not an object');
    expect(ok).toBe(false);
    expect(errors[0].rule).toBe('DP-2-I1');
  });
});
