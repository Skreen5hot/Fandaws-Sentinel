/**
 * RegisterRoutingRecord — unit tests.
 *
 * Covers: REGISTERS constants, ROUTING_METHODS constants,
 * ROUTING_STRENGTHS constants, createRoutingRecord factory.
 */

import { describe, it, expect } from '@jest/globals';
import {
  REGISTERS,
  ROUTING_METHODS,
  ROUTING_STRENGTHS,
  createRoutingRecord,
} from '../../src/types/routing-record.js';

describe('Routing Record', () => {
  describe('REGISTERS constants', () => {
    it('has exactly 3 registers', () => {
      expect(Object.keys(REGISTERS)).toHaveLength(3);
    });

    it('defines AXIOMATIC register', () => {
      expect(REGISTERS.AXIOMATIC).toBe('fandaws:register/axiomatic');
    });

    it('defines NORMATIVE register', () => {
      expect(REGISTERS.NORMATIVE).toBe('fandaws:register/normative');
    });

    it('defines ASPIRATIONAL register', () => {
      expect(REGISTERS.ASPIRATIONAL).toBe('fandaws:register/aspirational');
    });
  });

  describe('ROUTING_METHODS constants', () => {
    it('has exactly 7 methods', () => {
      expect(Object.keys(ROUTING_METHODS)).toHaveLength(7);
    });

    it('all values use fandaws:method/ prefix', () => {
      for (const value of Object.values(ROUTING_METHODS)) {
        expect(value).toMatch(/^fandaws:method\//);
      }
    });

    it('includes APS stub method', () => {
      expect(ROUTING_METHODS.APS).toBe('fandaws:method/aps');
    });

    it('includes FALLBACK method', () => {
      expect(ROUTING_METHODS.FALLBACK).toBe('fandaws:method/fallback');
    });
  });

  describe('ROUTING_STRENGTHS constants', () => {
    it('has exactly 3 strengths', () => {
      expect(Object.keys(ROUTING_STRENGTHS)).toHaveLength(3);
    });

    it('all values use fandaws:strength/ prefix', () => {
      for (const value of Object.values(ROUTING_STRENGTHS)) {
        expect(value).toMatch(/^fandaws:strength\//);
      }
    });
  });

  describe('createRoutingRecord', () => {
    const baseParams = {
      id: 'fandaws:routing/test-001',
      subjectConcept: 'fandaws:class/abc/dog',
      restrictionIri: 'fandaws:restriction/xyz/dog--fur',
      assignedRegister: REGISTERS.NORMATIVE,
      routingMethod: ROUTING_METHODS.STRUCTURAL,
      trigger: 'bfo:BFO_0000040',
    };

    it('returns a JSON-LD node with correct @type', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['@type']).toBe('fandaws:RegisterRoutingRecord');
    });

    it('sets @id from params', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['@id']).toBe('fandaws:routing/test-001');
    });

    it('includes subjectConcept', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['fandaws:subjectConcept']).toBe('fandaws:class/abc/dog');
    });

    it('includes property (restrictionIri)', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['fandaws:property']).toBe('fandaws:restriction/xyz/dog--fur');
    });

    it('includes assignedRegister', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['fandaws:assignedRegister']).toBe(REGISTERS.NORMATIVE);
    });

    it('includes routingMethod', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['fandaws:routingMethod']).toBe(ROUTING_METHODS.STRUCTURAL);
    });

    it('includes trigger description', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['fandaws:trigger']).toBe('bfo:BFO_0000040');
    });

    it('includes createdAt as ISO timestamp', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['fandaws:createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes createdBy as ers:service', () => {
      const record = createRoutingRecord(baseParams);
      expect(record['fandaws:createdBy']).toBe('ers:service');
    });

    it('produces deterministic output for identical inputs (RRF-05)', () => {
      const r1 = createRoutingRecord(baseParams);
      const r2 = createRoutingRecord(baseParams);
      expect(r1['@id']).toBe(r2['@id']);
      expect(r1['fandaws:assignedRegister']).toBe(r2['fandaws:assignedRegister']);
    });

    it('produces different records for different registers (RRF-06)', () => {
      const r1 = createRoutingRecord({ ...baseParams, id: 'fandaws:routing/a', assignedRegister: REGISTERS.NORMATIVE });
      const r2 = createRoutingRecord({ ...baseParams, id: 'fandaws:routing/b', assignedRegister: REGISTERS.AXIOMATIC });
      expect(r1['fandaws:assignedRegister']).not.toBe(r2['fandaws:assignedRegister']);
    });

    it('accepts all valid routing methods (RRF-08)', () => {
      for (const method of Object.values(ROUTING_METHODS)) {
        const record = createRoutingRecord({ ...baseParams, routingMethod: method });
        expect(record['fandaws:routingMethod']).toBe(method);
      }
    });
  });
});
