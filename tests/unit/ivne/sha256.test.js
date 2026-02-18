/**
 * SHA-256 — Unit Tests
 *
 * Tests against NIST FIPS 180-4 test vectors and determinism.
 */

import { describe, it, expect } from '@jest/globals';
import { sha256Hex, sha256Bytes } from '../../../src/core/ivne/sha256.js';

describe('SHA-256', () => {
  describe('NIST test vectors', () => {
    it('hashes empty string correctly', () => {
      expect(sha256Hex('')).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
    });

    it('hashes "abc" correctly', () => {
      expect(sha256Hex('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('hashes "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" correctly', () => {
      expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      );
    });

    it('hashes single "a" correctly', () => {
      expect(sha256Hex('a')).toBe(
        'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      );
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input across two calls', () => {
      const input = 'the quick brown fox jumps over the lazy dog';
      const hash1 = sha256Hex(input);
      const hash2 = sha256Hex(input);
      expect(hash1).toBe(hash2);
    });

    it('produces different output for different inputs', () => {
      const hash1 = sha256Hex('hello');
      const hash2 = sha256Hex('world');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('output format', () => {
    it('returns a 64-character hex string', () => {
      const hash = sha256Hex('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns lowercase hex', () => {
      const hash = sha256Hex('ABC');
      expect(hash).toBe(hash.toLowerCase());
    });
  });

  describe('sha256Bytes', () => {
    it('returns a 32-byte array', () => {
      const bytes = sha256Bytes([]);
      expect(bytes).toHaveLength(32);
      expect(bytes.every((b) => b >= 0 && b <= 255)).toBe(true);
    });
  });

  describe('input validation', () => {
    it('throws on non-string input', () => {
      expect(() => sha256Hex(123)).toThrow('sha256Hex requires a string input');
    });

    it('throws on null input', () => {
      expect(() => sha256Hex(null)).toThrow('sha256Hex requires a string input');
    });
  });

  describe('UTF-8 encoding', () => {
    it('handles Unicode characters', () => {
      const hash = sha256Hex('\u00e9'); // é
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces consistent output for multi-byte characters', () => {
      const hash1 = sha256Hex('\u4e16\u754c'); // 世界
      const hash2 = sha256Hex('\u4e16\u754c');
      expect(hash1).toBe(hash2);
    });
  });
});
