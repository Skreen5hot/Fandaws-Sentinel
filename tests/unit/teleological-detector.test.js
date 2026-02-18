/**
 * Teleological Detector — unit tests.
 *
 * Covers: keyword detection, case insensitivity, multi-word keywords,
 * no false positives, empty/null input handling.
 */

import { describe, it, expect } from '@jest/globals';
import { detectTeleological } from '../../src/core/epistemic-register/teleological-detector.js';

describe('Teleological Detector', () => {
  describe('keyword detection', () => {
    it('detects "should"', () => {
      const result = detectTeleological('Judges should be impartial');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('should');
    });

    it('detects "meant to"', () => {
      const result = detectTeleological('Hearts are meant to pump blood');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('meant to');
    });

    it('detects "purpose"', () => {
      const result = detectTeleological('The purpose of education is learning');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('purpose');
    });

    it('detects "duty"', () => {
      const result = detectTeleological('It is a duty to protect');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('duty');
    });

    it('detects "ought"', () => {
      const result = detectTeleological('People ought to be kind');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('ought');
    });

    it('detects "supposed to"', () => {
      const result = detectTeleological('Teachers are supposed to educate');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('supposed to');
    });

    it('detects "designed to"', () => {
      const result = detectTeleological('This tool is designed to cut');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('designed to');
    });

    it('detects "intended to"', () => {
      const result = detectTeleological('Laws are intended to protect');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('intended to');
    });
  });

  describe('case insensitivity', () => {
    it('detects uppercase keywords', () => {
      const result = detectTeleological('People SHOULD be kind');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('should');
    });

    it('detects mixed case keywords', () => {
      const result = detectTeleological('The Purpose of life');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('purpose');
    });
  });

  describe('multiple keywords', () => {
    it('returns all matched keywords', () => {
      const result = detectTeleological('People should fulfill their duty and ought to serve');
      expect(result.detected).toBe(true);
      expect(result.keywords).toContain('should');
      expect(result.keywords).toContain('duty');
      expect(result.keywords).toContain('ought');
      expect(result.keywords.length).toBe(3);
    });
  });

  describe('no false positives', () => {
    it('does not detect in neutral statements', () => {
      const result = detectTeleological('Dogs have four legs');
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });

    it('does not detect in classification statements', () => {
      const result = detectTeleological('A dog is an animal');
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });

    it('does not detect in property statements', () => {
      const result = detectTeleological('Triangles have three sides');
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('returns false for null input', () => {
      const result = detectTeleological(null);
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });

    it('returns false for undefined input', () => {
      const result = detectTeleological(undefined);
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });

    it('returns false for empty string', () => {
      const result = detectTeleological('');
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });

    it('returns false for non-string input', () => {
      const result = detectTeleological(42);
      expect(result.detected).toBe(false);
      expect(result.keywords).toHaveLength(0);
    });
  });
});
