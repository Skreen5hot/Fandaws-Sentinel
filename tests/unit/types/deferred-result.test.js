import { describe, it, expect } from '@jest/globals';
import { createDeferredResult } from '../../../src/types/deferred-result.js';

describe('createDeferredResult', () => {
  it('produces a node with @type fandaws:DeferredResult', () => {
    const result = createDeferredResult({
      operation: 'lookupDictionary',
      input: { term: 'dog' },
      reason: 'offline',
    });
    expect(result['@type']).toBe('fandaws:DeferredResult');
  });

  it('sets all required fields', () => {
    const result = createDeferredResult({
      operation: 'lookupBFO',
      input: { concept: 'fandaws:concept/dog' },
      reason: 'service unavailable',
    });
    expect(result['fandaws:operation']).toBe('lookupBFO');
    expect(result['fandaws:input']).toEqual({ concept: 'fandaws:concept/dog' });
    expect(result['fandaws:reason']).toBe('service unavailable');
  });

  it('defaults retryAfter to null and fallbackUsed to false', () => {
    const result = createDeferredResult({
      operation: 'importOntology',
      input: {},
      reason: 'offline',
    });
    expect(result['fandaws:retryAfter']).toBeNull();
    expect(result['fandaws:fallbackUsed']).toBe(false);
  });

  it('accepts retryAfter and fallbackUsed', () => {
    const result = createDeferredResult({
      operation: 'lookupDictionary',
      input: { term: 'dog' },
      reason: 'rate limited',
      retryAfter: '2026-02-08T15:00:00Z',
      fallbackUsed: true,
    });
    expect(result['fandaws:retryAfter']).toBe('2026-02-08T15:00:00Z');
    expect(result['fandaws:fallbackUsed']).toBe(true);
  });
});
