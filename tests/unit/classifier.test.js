import { describe, it, expect } from '@jest/globals';
import { classify } from '../../src/core/classifier/classifier.js';
import { createParseResult } from '../../src/types/parse-result.js';

// ─────────────────────────────────────────────────────────
// Workflow Routing
// ─────────────────────────────────────────────────────────

describe('classify — workflow routing', () => {
  it('routes classification verbType to "classification" workflow', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'is a', object: 'animal',
      verbType: 'classification', confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['fandaws:workflow']).toBe('classification');
  });

  it('routes property verbType to "property" workflow', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'has', object: 'fur',
      verbType: 'property', confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['fandaws:workflow']).toBe('property');
  });

  it('routes customRelationship verbType to "customRelationship" workflow', () => {
    const pr = createParseResult({
      subject: 'Dogs', predicate: 'chase', object: 'cats',
      verbType: 'customRelationship', confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['fandaws:workflow']).toBe('customRelationship');
  });
});

// ─────────────────────────────────────────────────────────
// Output Shape
// ─────────────────────────────────────────────────────────

describe('classify — output shape', () => {
  it('output has @type fandaws:ClassificationAction', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'is a', object: 'animal',
      verbType: 'classification', confidence: 1.0,
    });
    expect(classify(pr)['@type']).toBe('fandaws:ClassificationAction');
  });

  it('preserves subject and object from ParseResult', () => {
    const pr = createParseResult({
      subject: 'golden retriever', predicate: 'is a', object: 'dog',
      verbType: 'classification', confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['fandaws:subject']).toBe('golden retriever');
    expect(action['fandaws:object']).toBe('dog');
  });

  it('sets verb from predicate for customRelationship', () => {
    const pr = createParseResult({
      subject: 'Dogs', predicate: 'chase', object: 'cats',
      verbType: 'customRelationship', confidence: 1.0,
    });
    expect(classify(pr)['fandaws:verb']).toBe('chase');
  });

  it('sets verb to null for classification', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'is a', object: 'animal',
      verbType: 'classification', confidence: 1.0,
    });
    expect(classify(pr)['fandaws:verb']).toBeNull();
  });

  it('sets verb to null for property', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'has', object: 'fur',
      verbType: 'property', confidence: 1.0,
    });
    expect(classify(pr)['fandaws:verb']).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────

describe('classify — error handling', () => {
  it('rejects null input', () => {
    const action = classify(null);
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('invalid-input');
  });

  it('rejects non-ParseResult input (wrong @type)', () => {
    const action = classify({ '@type': ['owl:Class', 'skos:Concept'] });
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('invalid-input');
  });

  it('rejects ParseResult with error flag', () => {
    const pr = createParseResult({
      error: true, errorReason: 'empty-input', confidence: 0,
    });
    const action = classify(pr);
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('empty-input');
  });

  it('rejects ParseResult with invalid verbType', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'is a', object: 'animal',
      verbType: 'unknown', confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('invalid-verb-type');
  });

  it('rejects ParseResult with missing subject', () => {
    const pr = createParseResult({
      predicate: 'is a', object: 'animal',
      verbType: 'classification', confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('missing-operands');
  });

  it('rejects ParseResult with missing object', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'is a',
      verbType: 'classification', confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('missing-operands');
  });

  it('error output still has @type fandaws:ClassificationAction', () => {
    const action = classify(null);
    expect(action['@type']).toBe('fandaws:ClassificationAction');
  });
});

// ─────────────────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────────────────

describe('classify — performance', () => {
  it('classifies in < 1ms per call (1000 iterations)', () => {
    const pr = createParseResult({
      subject: 'dog', predicate: 'is a', object: 'animal',
      verbType: 'classification', confidence: 1.0,
    });
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      classify(pr);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 1000;
    expect(avgMs).toBeLessThan(1);
  });
});
