/**
 * Manual Override Safety — unit tests.
 *
 * Validates safety constraints on user-initiated register overrides.
 * R3 (Aspirational) requires a non-null worldviewContext tag.
 *
 * @see docs/architecture/NAC_ERS_Test_Specification_v1.1.md §10 (MAN-01 to MAN-05)
 */

import { describe, it, expect } from '@jest/globals';
import { REGISTERS, ROUTING_METHODS } from '../../src/types/routing-record.js';
import { validateRegisterOverride } from '../../src/core/epistemic-register/epistemic-register.js';

describe('Manual Override Safety', () => {
  describe('MAN-01: R3 override without worldview tag → rejection', () => {
    it('rejects R3 without worldviewContext', () => {
      const result = validateRegisterOverride(REGISTERS.ASPIRATIONAL);
      expect(result.accepted).toBe(false);
      expect(result.error).toMatch(/worldviewContext/i);
    });

    it('rejects R3 with null worldviewContext', () => {
      const result = validateRegisterOverride(REGISTERS.ASPIRATIONAL, {
        worldviewContext: null,
      });
      expect(result.accepted).toBe(false);
    });
  });

  describe('MAN-02: R3 override with worldview tag → accepted', () => {
    it('accepts R3 with unattributed worldview', () => {
      const result = validateRegisterOverride(REGISTERS.ASPIRATIONAL, {
        worldviewContext: 'iee:worldview/unattributed',
      });
      expect(result.accepted).toBe(true);
    });
  });

  describe('MAN-03: R3 override with specific worldview → accepted', () => {
    it('accepts R3 with deontological worldview', () => {
      const result = validateRegisterOverride(REGISTERS.ASPIRATIONAL, {
        worldviewContext: 'iee:worldview/deontological',
      });
      expect(result.accepted).toBe(true);
    });
  });

  describe('MAN-04: R1/R2 override does not require worldview', () => {
    it('accepts R1 without worldview', () => {
      const result = validateRegisterOverride(REGISTERS.AXIOMATIC);
      expect(result.accepted).toBe(true);
    });

    it('accepts R2 without worldview', () => {
      const result = validateRegisterOverride(REGISTERS.NORMATIVE);
      expect(result.accepted).toBe(true);
    });
  });

  describe('MAN-05: Override produces new routing record', () => {
    it('OVERRIDE method exists in ROUTING_METHODS', () => {
      expect(ROUTING_METHODS.OVERRIDE).toBe('fandaws:method/override');
    });
  });
});
