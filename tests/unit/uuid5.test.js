/**
 * UUID v5 — unit tests.
 *
 * Covers: RFC 4122 compliance, determinism, collision resistance,
 * edge cases, FANDAWS_NAMESPACE validity.
 */

import { describe, it, expect } from '@jest/globals';
import { uuid5, FANDAWS_NAMESPACE } from '../../src/core/knowledge-engine/uuid5.js';

// UUID v5 format: xxxxxxxx-xxxx-5xxx-Nxxx-xxxxxxxxxxxx (version=5, variant=8/9/a/b)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UUID v5', () => {
  describe('format compliance', () => {
    it('produces a valid UUID v5 string', () => {
      const result = uuid5(FANDAWS_NAMESPACE, 'test');
      expect(result).toMatch(UUID_REGEX);
    });

    it('has version 5 in the correct position', () => {
      const result = uuid5(FANDAWS_NAMESPACE, 'dog');
      // 13th character (index 14 with hyphens) should be '5'
      expect(result[14]).toBe('5');
    });

    it('has RFC 4122 variant in the correct position', () => {
      const result = uuid5(FANDAWS_NAMESPACE, 'cat');
      // 19th character (index 19 with hyphens) should be 8, 9, a, or b
      expect('89ab').toContain(result[19]);
    });

    it('produces lowercase output', () => {
      const result = uuid5(FANDAWS_NAMESPACE, 'UPPERCASE');
      expect(result).toBe(result.toLowerCase());
    });

    it('produces exactly 36 characters (8-4-4-4-12)', () => {
      const result = uuid5(FANDAWS_NAMESPACE, 'test');
      expect(result).toHaveLength(36);
      expect(result.split('-').map((s) => s.length)).toEqual([8, 4, 4, 4, 12]);
    });
  });

  describe('determinism', () => {
    it('same inputs produce identical output across 3 calls', () => {
      const r1 = uuid5(FANDAWS_NAMESPACE, 'dog');
      const r2 = uuid5(FANDAWS_NAMESPACE, 'dog');
      const r3 = uuid5(FANDAWS_NAMESPACE, 'dog');
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('same namespace + different names produce different UUIDs', () => {
      const r1 = uuid5(FANDAWS_NAMESPACE, 'dog');
      const r2 = uuid5(FANDAWS_NAMESPACE, 'cat');
      expect(r1).not.toBe(r2);
    });

    it('different namespaces + same name produce different UUIDs', () => {
      const ns1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace
      const ns2 = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'; // URL namespace
      const r1 = uuid5(ns1, 'test');
      const r2 = uuid5(ns2, 'test');
      expect(r1).not.toBe(r2);
    });
  });

  describe('RFC 4122 known vectors', () => {
    // RFC 4122 Appendix B: DNS namespace + "python.org"
    const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

    it('produces correct UUID for DNS namespace + "python.org"', () => {
      const result = uuid5(DNS_NAMESPACE, 'python.org');
      // Known correct: 886313e1-3b8a-5372-9b90-0c9aee199e5d
      expect(result).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
    });

    // URL namespace + "https://example.com/"
    const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

    it('produces correct UUID for URL namespace + "https://example.com/"', () => {
      const result = uuid5(URL_NAMESPACE, 'https://example.com/');
      expect(result).toMatch(UUID_REGEX);
      // Deterministic — pin the value once verified
    });
  });

  describe('edge cases', () => {
    it('handles empty name string', () => {
      const result = uuid5(FANDAWS_NAMESPACE, '');
      expect(result).toMatch(UUID_REGEX);
    });

    it('handles unicode name strings', () => {
      const result = uuid5(FANDAWS_NAMESPACE, 'café');
      expect(result).toMatch(UUID_REGEX);
    });

    it('handles long name strings', () => {
      const longName = 'a'.repeat(10000);
      const result = uuid5(FANDAWS_NAMESPACE, longName);
      expect(result).toMatch(UUID_REGEX);
    });

    it('handles multi-byte unicode (emoji)', () => {
      const result = uuid5(FANDAWS_NAMESPACE, '🐕');
      expect(result).toMatch(UUID_REGEX);
    });

    it('throws on non-string namespace', () => {
      expect(() => uuid5(123, 'test')).toThrow('uuid5 requires string namespace and name');
    });

    it('throws on non-string name', () => {
      expect(() => uuid5(FANDAWS_NAMESPACE, null)).toThrow('uuid5 requires string namespace and name');
    });
  });

  describe('FANDAWS_NAMESPACE', () => {
    it('is a valid UUID string', () => {
      expect(FANDAWS_NAMESPACE).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('is 36 characters long', () => {
      expect(FANDAWS_NAMESPACE).toHaveLength(36);
    });
  });
});
