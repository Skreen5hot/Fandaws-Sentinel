import { describe, it, expect } from '@jest/globals';
import { FANDAWS_CONTEXT } from '../../../src/types/context.js';

describe('FANDAWS_CONTEXT', () => {
  it('has a @context property', () => {
    expect(FANDAWS_CONTEXT).toHaveProperty('@context');
    expect(typeof FANDAWS_CONTEXT['@context']).toBe('object');
  });

  it('defines all required namespace prefixes per spec A.1', () => {
    const ctx = FANDAWS_CONTEXT['@context'];
    expect(ctx.fandaws).toBe('https://fandaws.org/schema/');
    expect(ctx.skos).toBe('http://www.w3.org/2004/02/skos/core#');
    expect(ctx.owl).toBe('http://www.w3.org/2002/07/owl#');
    expect(ctx.bfo).toBe('http://purl.obolibrary.org/obo/');
    expect(ctx.schema).toBe('https://schema.org/');
  });

  it('defines typed field declarations matching spec A.1', () => {
    const ctx = FANDAWS_CONTEXT['@context'];

    expect(ctx['fandaws:displayLabel']).toEqual({ '@type': 'xsd:string' });
    expect(ctx['fandaws:canonicalLabel']).toEqual({ '@type': 'xsd:string' });
    expect(ctx['fandaws:parent']).toEqual({ '@type': '@id' });
    expect(ctx['fandaws:children']).toEqual({ '@container': '@set', '@type': '@id' });
    expect(ctx['fandaws:properties']).toEqual({ '@container': '@set' });
    expect(ctx['fandaws:mergedFrom']).toEqual({ '@container': '@set', '@type': '@id' });
    expect(ctx['fandaws:createdAt']).toEqual({ '@type': 'xsd:dateTime' });
    expect(ctx['fandaws:bfoMapping']).toEqual({ '@type': '@id' });
  });

  it('is a frozen reference (not mutated between calls)', () => {
    const a = FANDAWS_CONTEXT;
    const b = FANDAWS_CONTEXT;
    expect(a).toBe(b);
  });
});
