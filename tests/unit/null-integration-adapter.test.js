import { describe, it, expect } from '@jest/globals';
import { NullIntegrationAdapter } from '../../src/adapters/integration/null-integration-adapter.js';
import { IntegrationAdapter } from '../../src/adapters/integration/integration-adapter.js';

describe('NullIntegrationAdapter', () => {
  it('extends IntegrationAdapter', () => {
    const adapter = new NullIntegrationAdapter();
    expect(adapter).toBeInstanceOf(IntegrationAdapter);
  });

  // ── lookupDictionary ──

  it('lookupDictionary returns DeferredResult with reason "offline"', () => {
    const adapter = new NullIntegrationAdapter();
    const result = adapter.lookupDictionary('dog');
    expect(result['@type']).toBe('fandaws:DeferredResult');
    expect(result['fandaws:reason']).toBe('offline');
    expect(result['fandaws:operation']).toBe('lookupDictionary');
    expect(result['fandaws:input']).toEqual({ term: 'dog' });
  });

  it('lookupDictionary handles empty string input', () => {
    const adapter = new NullIntegrationAdapter();
    const result = adapter.lookupDictionary('');
    expect(result['@type']).toBe('fandaws:DeferredResult');
    expect(result['fandaws:input']).toEqual({ term: '' });
  });

  // ── lookupBFO ──

  it('lookupBFO returns DeferredResult with reason "offline"', () => {
    const adapter = new NullIntegrationAdapter();
    const concept = { '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', '@type': 'owl:Class' };
    const result = adapter.lookupBFO(concept);
    expect(result['@type']).toBe('fandaws:DeferredResult');
    expect(result['fandaws:reason']).toBe('offline');
    expect(result['fandaws:operation']).toBe('lookupBFO');
    expect(result['fandaws:input']).toEqual({ concept });
  });

  // ── importOntology ──

  it('importOntology returns DeferredResult with reason "offline"', () => {
    const adapter = new NullIntegrationAdapter();
    const result = adapter.importOntology('https://example.org/ontology.owl');
    expect(result['@type']).toBe('fandaws:DeferredResult');
    expect(result['fandaws:reason']).toBe('offline');
    expect(result['fandaws:operation']).toBe('importOntology');
    expect(result['fandaws:input']).toEqual({ source: 'https://example.org/ontology.owl' });
  });

  // ── Common fields ──

  it('all results have retryAfter: null', () => {
    const adapter = new NullIntegrationAdapter();
    expect(adapter.lookupDictionary('x')['fandaws:retryAfter']).toBeNull();
    expect(adapter.lookupBFO({})['fandaws:retryAfter']).toBeNull();
    expect(adapter.importOntology('x')['fandaws:retryAfter']).toBeNull();
  });

  it('all results have fallbackUsed: false', () => {
    const adapter = new NullIntegrationAdapter();
    expect(adapter.lookupDictionary('x')['fandaws:fallbackUsed']).toBe(false);
    expect(adapter.lookupBFO({})['fandaws:fallbackUsed']).toBe(false);
    expect(adapter.importOntology('x')['fandaws:fallbackUsed']).toBe(false);
  });

  it('each call returns a fresh object', () => {
    const adapter = new NullIntegrationAdapter();
    const a = adapter.lookupDictionary('dog');
    const b = adapter.lookupDictionary('dog');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('preserves complex input objects', () => {
    const adapter = new NullIntegrationAdapter();
    const concept = {
      '@id': 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': 'Entity',
    };
    const result = adapter.lookupBFO(concept);
    expect(result['fandaws:input'].concept).toEqual(concept);
  });
});
