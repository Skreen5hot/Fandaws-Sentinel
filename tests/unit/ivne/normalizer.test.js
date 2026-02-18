/**
 * Normalizer (τ_N) — Unit Tests
 *
 * Tests deep sort, timestamp normalization, quantifier normalization,
 * canonical serialization, and the composite normalize function.
 */

import { describe, it, expect } from '@jest/globals';
import {
  deepSort,
  normalizeTimestamps,
  normalizeQuantifiers,
  canonicalSerialize,
  normalize,
} from '../../../src/core/ivne/normalizer.js';

// ── deepSort ──

describe('deepSort', () => {
  it('sorts object keys lexicographically', () => {
    const input = { zebra: 1, apple: 2, mango: 3 };
    const result = deepSort(input);
    expect(Object.keys(result)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('sorts arrays of objects by @id', () => {
    const input = [
      { '@id': 'fandaws:class/dog' },
      { '@id': 'fandaws:class/cat' },
      { '@id': 'fandaws:class/bird' },
    ];
    const result = deepSort(input);
    expect(result[0]['@id']).toBe('fandaws:class/bird');
    expect(result[1]['@id']).toBe('fandaws:class/cat');
    expect(result[2]['@id']).toBe('fandaws:class/dog');
  });

  it('sorts by fandaws:sourceAxiom when @id is absent', () => {
    const input = [
      { 'fandaws:sourceAxiom': 'Z SubClassOf Y' },
      { 'fandaws:sourceAxiom': 'A SubClassOf B' },
    ];
    const result = deepSort(input);
    expect(result[0]['fandaws:sourceAxiom']).toBe('A SubClassOf B');
    expect(result[1]['fandaws:sourceAxiom']).toBe('Z SubClassOf Y');
  });

  it('recursively sorts nested objects', () => {
    const input = {
      z: { b: 1, a: 2 },
      a: { d: 3, c: 4 },
    };
    const result = deepSort(input);
    expect(Object.keys(result)).toEqual(['a', 'z']);
    expect(Object.keys(result.a)).toEqual(['c', 'd']);
    expect(Object.keys(result.z)).toEqual(['a', 'b']);
  });

  it('handles null and undefined', () => {
    expect(deepSort(null)).toBeNull();
    expect(deepSort(undefined)).toBeUndefined();
  });

  it('handles primitive values', () => {
    expect(deepSort(42)).toBe(42);
    expect(deepSort('hello')).toBe('hello');
    expect(deepSort(true)).toBe(true);
  });

  it('handles empty arrays and objects', () => {
    expect(deepSort([])).toEqual([]);
    expect(deepSort({})).toEqual({});
  });

  it('produces identical output regardless of input key order', () => {
    const a = deepSort({ x: 1, y: 2, z: 3 });
    const b = deepSort({ z: 3, x: 1, y: 2 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── normalizeTimestamps ──

describe('normalizeTimestamps', () => {
  const RUN_TS = '2025-01-01T00:00:00.000Z';

  it('replaces fandaws:createdAt with run timestamp', () => {
    const input = { 'fandaws:createdAt': '2025-06-15T12:34:56.789Z', name: 'test' };
    const result = normalizeTimestamps(input, RUN_TS);
    expect(result['fandaws:createdAt']).toBe(RUN_TS);
  });

  it('replaces fandaws:compiledAt with run timestamp', () => {
    const input = { 'fandaws:compiledAt': '2025-06-15T12:34:56.789Z' };
    const result = normalizeTimestamps(input, RUN_TS);
    expect(result['fandaws:compiledAt']).toBe(RUN_TS);
  });

  it('recursively normalizes nested objects', () => {
    const input = {
      outer: {
        inner: { 'fandaws:createdAt': '2025-06-15T00:00:00Z' },
      },
    };
    const result = normalizeTimestamps(input, RUN_TS);
    expect(result.outer.inner['fandaws:createdAt']).toBe(RUN_TS);
  });

  it('normalizes timestamps in arrays', () => {
    const input = [
      { 'fandaws:createdAt': '2025-01-01T00:00:00Z' },
      { 'fandaws:createdAt': '2025-12-31T23:59:59Z' },
    ];
    const result = normalizeTimestamps(input, RUN_TS);
    expect(result[0]['fandaws:createdAt']).toBe(RUN_TS);
    expect(result[1]['fandaws:createdAt']).toBe(RUN_TS);
  });

  it('leaves non-timestamp fields unchanged', () => {
    const input = { name: 'test', value: 42 };
    const result = normalizeTimestamps(input, RUN_TS);
    expect(result).toEqual(input);
  });

  it('handles null and undefined', () => {
    expect(normalizeTimestamps(null, RUN_TS)).toBeNull();
    expect(normalizeTimestamps(undefined, RUN_TS)).toBeUndefined();
  });
});

// ── normalizeQuantifiers ──

describe('normalizeQuantifiers', () => {
  it('normalizes someValuesFrom to existential', () => {
    const input = { 'fandaws:quantifier': 'someValuesFrom' };
    expect(normalizeQuantifiers(input)['fandaws:quantifier']).toBe('existential');
  });

  it('normalizes minCardinality1 to existential', () => {
    const input = { 'fandaws:quantifier': 'minCardinality1' };
    expect(normalizeQuantifiers(input)['fandaws:quantifier']).toBe('existential');
  });

  it('preserves universal quantifier', () => {
    const input = { 'fandaws:quantifier': 'universal' };
    expect(normalizeQuantifiers(input)['fandaws:quantifier']).toBe('universal');
  });

  it('recursively normalizes nested objects', () => {
    const input = {
      concepts: [
        { props: [{ 'fandaws:quantifier': 'someValuesFrom' }] },
      ],
    };
    const result = normalizeQuantifiers(input);
    expect(result.concepts[0].props[0]['fandaws:quantifier']).toBe('existential');
  });

  it('handles null and undefined', () => {
    expect(normalizeQuantifiers(null)).toBeNull();
    expect(normalizeQuantifiers(undefined)).toBeUndefined();
  });
});

// ── canonicalSerialize ──

describe('canonicalSerialize', () => {
  it('produces a 2-space indented JSON string', () => {
    const input = { a: 1, b: 2 };
    const json = canonicalSerialize(input);
    expect(json).toContain('\n  ');
  });

  it('is deterministic for the same input', () => {
    const input = { x: [1, 2, 3], y: 'hello' };
    const json1 = canonicalSerialize(input);
    const json2 = canonicalSerialize(input);
    expect(json1).toBe(json2);
  });

  it('produces valid JSON', () => {
    const input = { key: 'value', nested: { arr: [1, 2] } };
    const json = canonicalSerialize(input);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

// ── normalize (composite) ──

describe('normalize', () => {
  const RUN_TS = '2025-01-01T00:00:00.000Z';

  it('returns normalized object, canonical JSON, and output hash', () => {
    const input = { 'fandaws:createdAt': 'old', value: 42 };
    const result = normalize(input, RUN_TS);
    expect(result).toHaveProperty('normalized');
    expect(result).toHaveProperty('canonicalJson');
    expect(result).toHaveProperty('outputHash');
  });

  it('normalizes timestamps in output', () => {
    const input = { 'fandaws:createdAt': '2025-06-15T00:00:00Z' };
    const { normalized } = normalize(input, RUN_TS);
    expect(normalized['fandaws:createdAt']).toBe(RUN_TS);
  });

  it('sorts keys in output', () => {
    const input = { z: 1, a: 2, m: 3 };
    const { normalized } = normalize(input, RUN_TS);
    expect(Object.keys(normalized)).toEqual(['a', 'm', 'z']);
  });

  it('normalizes quantifiers in output', () => {
    const input = { 'fandaws:quantifier': 'someValuesFrom' };
    const { normalized } = normalize(input, RUN_TS);
    expect(normalized['fandaws:quantifier']).toBe('existential');
  });

  it('produces a valid SHA-256 output hash', () => {
    const input = { test: 'data' };
    const { outputHash } = normalize(input, RUN_TS);
    expect(outputHash).toHaveLength(64);
    expect(outputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input produces same hash', () => {
    const input = { concepts: [{ '@id': 'b' }, { '@id': 'a' }] };
    const r1 = normalize(input, RUN_TS);
    const r2 = normalize(input, RUN_TS);
    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r1.canonicalJson).toBe(r2.canonicalJson);
  });

  it('different input order produces same hash (via deep sort)', () => {
    const input1 = { concepts: [{ '@id': 'z' }, { '@id': 'a' }] };
    const input2 = { concepts: [{ '@id': 'a' }, { '@id': 'z' }] };
    const r1 = normalize(input1, RUN_TS);
    const r2 = normalize(input2, RUN_TS);
    expect(r1.outputHash).toBe(r2.outputHash);
  });
});
