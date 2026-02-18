/**
 * IVNE IRI Generator — Unit Tests
 *
 * Tests hash-based IRI generation, expression canonicalization,
 * collision detection, and the generateUniqueHashIri convenience function.
 */

import { describe, it, expect } from '@jest/globals';
import {
  canonicalizeExpression,
  generateHashIri,
  checkCollision,
  generateUniqueHashIri,
} from '../../../src/core/ivne/ivne-iri-generator.js';

// ── canonicalizeExpression ──

describe('canonicalizeExpression', () => {
  it('produces type(sorted,operands) format', () => {
    expect(canonicalizeExpression('intersection', ['bfo:Entity', 'bfo:Continuant'])).toBe(
      'intersection(bfo:Continuant,bfo:Entity)',
    );
  });

  it('sorts operands lexicographically', () => {
    const result = canonicalizeExpression('union', ['z:C', 'a:A', 'm:B']);
    expect(result).toBe('union(a:A,m:B,z:C)');
  });

  it('handles single operand (complement)', () => {
    expect(canonicalizeExpression('complement', ['bfo:Entity'])).toBe(
      'complement(bfo:Entity)',
    );
  });

  it('is deterministic — same inputs always produce same output', () => {
    const a = canonicalizeExpression('intersection', ['x:B', 'x:A']);
    const b = canonicalizeExpression('intersection', ['x:B', 'x:A']);
    expect(a).toBe(b);
  });

  it('is order-independent — different input orders produce same output', () => {
    const a = canonicalizeExpression('union', ['x:A', 'x:B', 'x:C']);
    const b = canonicalizeExpression('union', ['x:C', 'x:A', 'x:B']);
    expect(a).toBe(b);
  });

  it('throws on non-string type', () => {
    expect(() => canonicalizeExpression(null, ['a'])).toThrow('non-empty type string');
  });

  it('throws on empty type', () => {
    expect(() => canonicalizeExpression('', ['a'])).toThrow('non-empty type string');
  });

  it('throws on non-array operands', () => {
    expect(() => canonicalizeExpression('intersection', 'not-array')).toThrow('operands array');
  });

  it('handles empty operands array', () => {
    expect(canonicalizeExpression('empty', [])).toBe('empty()');
  });
});

// ── generateHashIri ──

describe('generateHashIri', () => {
  it('produces fandaws:gen/ prefix', () => {
    const iri = generateHashIri('intersection(bfo:A,bfo:B)');
    expect(iri).toMatch(/^fandaws:gen\//);
  });

  it('produces a 12-character hex suffix by default', () => {
    const iri = generateHashIri('test-expression');
    const suffix = iri.replace('fandaws:gen/', '');
    expect(suffix).toHaveLength(12);
    expect(suffix).toMatch(/^[0-9a-f]{12}$/);
  });

  it('respects custom hashPrefixLength', () => {
    const iri = generateHashIri('test-expression', { hashPrefixLength: 8 });
    const suffix = iri.replace('fandaws:gen/', '');
    expect(suffix).toHaveLength(8);
  });

  it('is deterministic — same expression always produces same IRI', () => {
    const iri1 = generateHashIri('intersection(bfo:A,bfo:B)');
    const iri2 = generateHashIri('intersection(bfo:A,bfo:B)');
    expect(iri1).toBe(iri2);
  });

  it('produces different IRIs for different expressions', () => {
    const iri1 = generateHashIri('intersection(bfo:A,bfo:B)');
    const iri2 = generateHashIri('union(bfo:A,bfo:B)');
    expect(iri1).not.toBe(iri2);
  });

  it('throws on empty expression', () => {
    expect(() => generateHashIri('')).toThrow('non-empty expression string');
  });

  it('throws on null expression', () => {
    expect(() => generateHashIri(null)).toThrow('non-empty expression string');
  });

  it('throws if hashPrefixLength is below 4', () => {
    expect(() => generateHashIri('test', { hashPrefixLength: 3 })).toThrow('between 4 and 64');
  });

  it('throws if hashPrefixLength is above 64', () => {
    expect(() => generateHashIri('test', { hashPrefixLength: 65 })).toThrow('between 4 and 64');
  });
});

// ── checkCollision ──

describe('checkCollision', () => {
  it('returns no collision when IRI is not in existing set', () => {
    const existing = new Set();
    const map = new Map();
    const result = checkCollision('fandaws:gen/abc', existing, map, 'expr1');
    expect(result.collision).toBe(false);
    expect(result.existingExpression).toBeNull();
  });

  it('returns no collision when same expression produced the same IRI', () => {
    const existing = new Set(['fandaws:gen/abc']);
    const map = new Map([['fandaws:gen/abc', 'expr1']]);
    const result = checkCollision('fandaws:gen/abc', existing, map, 'expr1');
    expect(result.collision).toBe(false);
  });

  it('returns collision when different expression produced the same IRI', () => {
    const existing = new Set(['fandaws:gen/abc']);
    const map = new Map([['fandaws:gen/abc', 'expr1']]);
    const result = checkCollision('fandaws:gen/abc', existing, map, 'expr2');
    expect(result.collision).toBe(true);
    expect(result.existingExpression).toBe('expr1');
  });
});

// ── generateUniqueHashIri ──

describe('generateUniqueHashIri', () => {
  it('generates an IRI and registers it in context', () => {
    const existing = new Set();
    const generatedFromMap = new Map();
    const result = generateUniqueHashIri('intersection', ['bfo:A', 'bfo:B'], {
      existing,
      generatedFromMap,
    });
    expect(result.iri).toMatch(/^fandaws:gen\//);
    expect(result.collision).toBe(false);
    expect(existing.has(result.iri)).toBe(true);
    expect(generatedFromMap.has(result.iri)).toBe(true);
  });

  it('returns same IRI for same expression type and operands', () => {
    const existing = new Set();
    const generatedFromMap = new Map();
    const ctx = { existing, generatedFromMap };
    const r1 = generateUniqueHashIri('union', ['x:A', 'x:B'], ctx);
    const r2 = generateUniqueHashIri('union', ['x:A', 'x:B'], ctx);
    expect(r1.iri).toBe(r2.iri);
  });

  it('returns same IRI regardless of operand order', () => {
    const existing = new Set();
    const generatedFromMap = new Map();
    const ctx = { existing, generatedFromMap };
    const r1 = generateUniqueHashIri('intersection', ['x:B', 'x:A'], ctx);
    const r2 = generateUniqueHashIri('intersection', ['x:A', 'x:B'], ctx);
    expect(r1.iri).toBe(r2.iri);
  });

  it('produces different IRIs for different expression types', () => {
    const existing = new Set();
    const generatedFromMap = new Map();
    const ctx = { existing, generatedFromMap };
    const r1 = generateUniqueHashIri('intersection', ['x:A', 'x:B'], ctx);
    const r2 = generateUniqueHashIri('union', ['x:A', 'x:B'], ctx);
    expect(r1.iri).not.toBe(r2.iri);
  });
});
