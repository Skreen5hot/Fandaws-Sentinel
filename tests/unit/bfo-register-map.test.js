/**
 * BFO Register Map — unit tests.
 *
 * Covers: BFO_REGISTER_MAP entries (11 categories), AXIOMATIC_DOMAINS,
 * lookupBfoRegister(), spatialRegion→R1, function→R2 explicit.
 */

import { describe, it, expect } from '@jest/globals';
import { BFO } from '../../src/core/knowledge-engine/bfo-heuristic.js';
import { REGISTERS, ROUTING_STRENGTHS } from '../../src/types/routing-record.js';
import {
  BFO_REGISTER_MAP,
  AXIOMATIC_DOMAINS,
  lookupBfoRegister,
} from '../../src/core/epistemic-register/bfo-register-map.js';

describe('BFO Register Map', () => {
  describe('BFO_REGISTER_MAP', () => {
    it('has exactly 11 entries (one per BFO category)', () => {
      expect(Object.keys(BFO_REGISTER_MAP)).toHaveLength(11);
    });

    it('covers every BFO constant', () => {
      for (const bfoIri of Object.values(BFO)) {
        expect(BFO_REGISTER_MAP).toHaveProperty(bfoIri);
      }
    });

    // ── R1 (Axiomatic) entries ──

    it('maps spatialRegion to AXIOMATIC', () => {
      expect(BFO_REGISTER_MAP[BFO.spatialRegion].register).toBe(REGISTERS.AXIOMATIC);
    });

    it('maps temporalRegion to AXIOMATIC', () => {
      expect(BFO_REGISTER_MAP[BFO.temporalRegion].register).toBe(REGISTERS.AXIOMATIC);
    });

    it('maps genDepContinuant to AXIOMATIC', () => {
      expect(BFO_REGISTER_MAP[BFO.genDepContinuant].register).toBe(REGISTERS.AXIOMATIC);
    });

    it('axiomatic entries use STRUCTURAL strength', () => {
      expect(BFO_REGISTER_MAP[BFO.spatialRegion].strength).toBe(ROUTING_STRENGTHS.STRUCTURAL);
      expect(BFO_REGISTER_MAP[BFO.temporalRegion].strength).toBe(ROUTING_STRENGTHS.STRUCTURAL);
      expect(BFO_REGISTER_MAP[BFO.genDepContinuant].strength).toBe(ROUTING_STRENGTHS.STRUCTURAL);
    });

    // ── R2 (Normative) entries ──

    it('maps materialEntity to NORMATIVE', () => {
      expect(BFO_REGISTER_MAP[BFO.materialEntity].register).toBe(REGISTERS.NORMATIVE);
    });

    it('maps quality to NORMATIVE', () => {
      expect(BFO_REGISTER_MAP[BFO.quality].register).toBe(REGISTERS.NORMATIVE);
    });

    it('maps disposition to NORMATIVE', () => {
      expect(BFO_REGISTER_MAP[BFO.disposition].register).toBe(REGISTERS.NORMATIVE);
    });

    it('maps function to NORMATIVE explicitly (prevents R3 correction)', () => {
      expect(BFO_REGISTER_MAP[BFO.function].register).toBe(REGISTERS.NORMATIVE);
      expect(BFO_REGISTER_MAP[BFO.function].strength).toBe(ROUTING_STRENGTHS.STRUCTURAL);
    });

    it('maps process to NORMATIVE', () => {
      expect(BFO_REGISTER_MAP[BFO.process].register).toBe(REGISTERS.NORMATIVE);
    });

    it('maps realizableEntity to NORMATIVE', () => {
      expect(BFO_REGISTER_MAP[BFO.realizableEntity].register).toBe(REGISTERS.NORMATIVE);
    });

    it('maps role to NORMATIVE with HEURISTIC strength', () => {
      expect(BFO_REGISTER_MAP[BFO.role].register).toBe(REGISTERS.NORMATIVE);
      expect(BFO_REGISTER_MAP[BFO.role].strength).toBe(ROUTING_STRENGTHS.HEURISTIC);
    });

    it('maps entity to NORMATIVE with HEURISTIC strength', () => {
      expect(BFO_REGISTER_MAP[BFO.entity].register).toBe(REGISTERS.NORMATIVE);
      expect(BFO_REGISTER_MAP[BFO.entity].strength).toBe(ROUTING_STRENGTHS.HEURISTIC);
    });

    it('no BFO category maps to ASPIRATIONAL', () => {
      for (const entry of Object.values(BFO_REGISTER_MAP)) {
        expect(entry.register).not.toBe(REGISTERS.ASPIRATIONAL);
      }
    });
  });

  describe('AXIOMATIC_DOMAINS', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(AXIOMATIC_DOMAINS)).toBe(true);
      expect(AXIOMATIC_DOMAINS.length).toBeGreaterThan(0);
    });

    it('includes mathematics', () => {
      expect(AXIOMATIC_DOMAINS).toContain('mathematics');
    });

    it('includes geometry', () => {
      expect(AXIOMATIC_DOMAINS).toContain('geometry');
    });

    it('includes formal logic', () => {
      expect(AXIOMATIC_DOMAINS).toContain('formal logic');
    });

    it('does not include biology or medicine (BFO-13)', () => {
      expect(AXIOMATIC_DOMAINS).not.toContain('biology');
      expect(AXIOMATIC_DOMAINS).not.toContain('medicine');
    });
  });

  describe('explicit entries (BFO-14)', () => {
    it('Function is explicitly listed, not inherited from RealizableEntity', () => {
      // Both must exist as separate entries
      expect(BFO_REGISTER_MAP).toHaveProperty(BFO.function);
      expect(BFO_REGISTER_MAP).toHaveProperty(BFO.realizableEntity);
      // Verify they are distinct keys (different BFO IRIs)
      expect(BFO.function).not.toBe(BFO.realizableEntity);
    });
  });

  describe('lookupBfoRegister()', () => {
    it('returns register+strength for valid BFO IRI', () => {
      const result = lookupBfoRegister(BFO.materialEntity);
      expect(result).toEqual({
        register: REGISTERS.NORMATIVE,
        strength: ROUTING_STRENGTHS.STRUCTURAL,
      });
    });

    it('returns null for unknown BFO IRI', () => {
      expect(lookupBfoRegister('bfo:BFO_9999999')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(lookupBfoRegister(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(lookupBfoRegister(undefined)).toBeNull();
    });

    it('returns null for non-string input', () => {
      expect(lookupBfoRegister(42)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(lookupBfoRegister('')).toBeNull();
    });
  });
});
