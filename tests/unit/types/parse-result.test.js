import { describe, it, expect } from '@jest/globals';
import { createParseResult } from '../../../src/types/parse-result.js';

describe('createParseResult', () => {
  it('has correct @type', () => {
    const result = createParseResult({
      subject: 'dog',
      predicate: 'is a',
      object: 'animal',
      verbType: 'classification',
      confidence: 1.0,
    });
    expect(result['@type']).toBe('fandaws:ParseResult');
  });

  it('sets all semantic fields for a successful parse', () => {
    const result = createParseResult({
      subject: 'dog',
      predicate: 'is a',
      object: 'animal',
      verbType: 'classification',
      confidence: 1.0,
    });
    expect(result['fandaws:subject']).toBe('dog');
    expect(result['fandaws:predicate']).toBe('is a');
    expect(result['fandaws:object']).toBe('animal');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:confidence']).toBe(1.0);
    expect(result['fandaws:error']).toBe(false);
    expect(result['fandaws:errorReason']).toBeNull();
  });

  it('sets error fields for a failed parse', () => {
    const result = createParseResult({
      error: true,
      errorReason: 'empty-input',
      confidence: 0,
    });
    expect(result['fandaws:error']).toBe(true);
    expect(result['fandaws:errorReason']).toBe('empty-input');
    expect(result['fandaws:confidence']).toBe(0);
    expect(result['fandaws:subject']).toBeNull();
    expect(result['fandaws:predicate']).toBeNull();
    expect(result['fandaws:object']).toBeNull();
    expect(result['fandaws:verbType']).toBeNull();
  });

  it('defaults all fields to null/zero/false when called with empty object', () => {
    const result = createParseResult({});
    expect(result['fandaws:subject']).toBeNull();
    expect(result['fandaws:predicate']).toBeNull();
    expect(result['fandaws:object']).toBeNull();
    expect(result['fandaws:verbType']).toBeNull();
    expect(result['fandaws:confidence']).toBe(0);
    expect(result['fandaws:error']).toBe(false);
    expect(result['fandaws:errorReason']).toBeNull();
  });

  it('supports all three verb types', () => {
    for (const verbType of ['classification', 'property', 'customRelationship']) {
      const result = createParseResult({ verbType, confidence: 1.0 });
      expect(result['fandaws:verbType']).toBe(verbType);
    }
  });

  it('produces fresh objects per call', () => {
    const params = { subject: 'x', predicate: 'is', object: 'y', verbType: 'classification', confidence: 1.0 };
    const a = createParseResult(params);
    const b = createParseResult(params);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
