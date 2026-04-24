/**
 * Unit tests — RFC 8785 JCS canonicalizer (DP-2.2 + DP-2.3.1/.2 shared).
 */

import { canonicalize } from '../../../src/core/d16/canonical-serialization.js';

describe('canonicalize — primitives', () => {
  it('null', () => expect(canonicalize(null)).toBe('null'));
  it('true', () => expect(canonicalize(true)).toBe('true'));
  it('false', () => expect(canonicalize(false)).toBe('false'));
  it('empty string', () => expect(canonicalize('')).toBe('""'));
  it('simple string', () => expect(canonicalize('hello')).toBe('"hello"'));
  it('string with escapes', () => expect(canonicalize('a\nb')).toBe('"a\\nb"'));
  it('integer', () => expect(canonicalize(42)).toBe('42'));
  it('zero', () => expect(canonicalize(0)).toBe('0'));
  it('negative integer', () => expect(canonicalize(-7)).toBe('-7'));
  it('simple decimal', () => expect(canonicalize(0.3)).toBe('0.3'));
  it('weight-vector decimal', () => expect(canonicalize(0.15)).toBe('0.15'));
});

describe('canonicalize — objects: key sorting', () => {
  it('sorts keys UTF-16 code-unit order', () => {
    const obj = { b: 1, a: 2, c: 3 };
    expect(canonicalize(obj)).toBe('{"a":2,"b":1,"c":3}');
  });

  it('key order independent of insertion order', () => {
    expect(canonicalize({ z: 1, a: 2 })).toBe(canonicalize({ a: 2, z: 1 }));
  });

  it('nested objects also sorted', () => {
    const obj = { outer: { z: 1, a: 2 }, alpha: { y: 3, b: 4 } };
    expect(canonicalize(obj)).toBe('{"alpha":{"b":4,"y":3},"outer":{"a":2,"z":1}}');
  });

  it('empty object', () => expect(canonicalize({})).toBe('{}'));

  it('drops undefined-valued properties (matches JSON.stringify semantics)', () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });
});

describe('canonicalize — arrays', () => {
  it('preserves order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('empty array', () => expect(canonicalize([])).toBe('[]'));

  it('nested with sorted objects', () => {
    expect(canonicalize([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });
});

describe('canonicalize — determinism (D2.1 content-hash keying requirement)', () => {
  it('same semantic content with different key orders produces identical canonical form', () => {
    const a = { axiom: 'hasParticipant some Continuant', weight: 'high', kind: 'restriction' };
    const b = { kind: 'restriction', weight: 'high', axiom: 'hasParticipant some Continuant' };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('different semantic content produces different canonical forms', () => {
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: 2 }));
  });
});

describe('canonicalize — rejects unsupported types', () => {
  it('throws on undefined at root', () => {
    expect(() => canonicalize(undefined)).toThrow(TypeError);
  });

  it('throws on BigInt', () => {
    expect(() => canonicalize(1n)).toThrow(TypeError);
  });

  it('throws on Symbol', () => {
    expect(() => canonicalize(Symbol('x'))).toThrow(TypeError);
  });

  it('throws on function', () => {
    expect(() => canonicalize(() => 1)).toThrow(TypeError);
  });

  it('throws on NaN / Infinity', () => {
    expect(() => canonicalize(NaN)).toThrow(TypeError);
    expect(() => canonicalize(Infinity)).toThrow(TypeError);
    expect(() => canonicalize(-Infinity)).toThrow(TypeError);
  });
});
