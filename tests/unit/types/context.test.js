import { describe, it, expect } from '@jest/globals';
import { FANDAWS_CONTEXT } from '../../../src/types/context.js';

describe('FANDAWS_CONTEXT', () => {
  it('has a @context property', () => {
    expect(FANDAWS_CONTEXT).toHaveProperty('@context');
    expect(typeof FANDAWS_CONTEXT['@context']).toBe('object');
  });

  it('defines all required namespace prefixes', () => {
    const ctx = FANDAWS_CONTEXT['@context'];
    expect(ctx.fandaws).toBe('https://fandaws.org/schema/');
    expect(ctx.owl).toBe('http://www.w3.org/2002/07/owl#');
    expect(ctx.skos).toBe('http://www.w3.org/2004/02/skos/core#');
    expect(ctx.rdfs).toBe('http://www.w3.org/2000/01/rdf-schema#');
    expect(ctx.dcterms).toBe('http://purl.org/dc/terms/');
    expect(ctx.prov).toBe('http://www.w3.org/ns/prov#');
    expect(ctx.xsd).toBe('http://www.w3.org/2001/XMLSchema#');
    expect(ctx.bfo).toBe('http://purl.obolibrary.org/obo/');
    expect(ctx.schema).toBe('https://schema.org/');
  });

  it('defines v2.1 concept field aliases', () => {
    const ctx = FANDAWS_CONTEXT['@context'];

    expect(ctx.label).toBe('rdfs:label');
    expect(ctx.prefLabel).toEqual({ '@id': 'skos:prefLabel', '@type': 'xsd:string' });
    expect(ctx.altLabel).toEqual({ '@id': 'skos:altLabel', '@container': '@set' });
    expect(ctx.broader).toEqual({ '@id': 'skos:broader', '@type': '@id' });
    expect(ctx.definition).toBe('skos:definition');
    expect(ctx.inScheme).toEqual({ '@id': 'skos:inScheme', '@type': '@id' });
    expect(ctx.subClassOf).toEqual({ '@id': 'rdfs:subClassOf', '@container': '@set' });
    expect(ctx.created).toEqual({ '@id': 'dcterms:created', '@type': 'xsd:dateTime' });
    expect(ctx.modified).toEqual({ '@id': 'dcterms:modified', '@type': 'xsd:dateTime' });
    expect(ctx.wasDerivedFrom).toEqual({ '@id': 'prov:wasDerivedFrom', '@container': '@set', '@type': '@id' });
  });

  it('retains fandaws-specific terms for scope resolution and governance', () => {
    const ctx = FANDAWS_CONTEXT['@context'];
    expect(ctx['fandaws:resolvedFrom']).toEqual({ '@type': '@id' });
    expect(ctx['fandaws:shadows']).toEqual({ '@container': '@set' });
    expect(ctx['fandaws:disambiguatedFrom']).toEqual({ '@type': '@id' });
    expect(ctx['fandaws:definitions']).toEqual({ '@container': '@set' });
    expect(ctx['fandaws:resolutionOptions']).toEqual({ '@container': '@set' });
  });

  it('is a frozen reference (not mutated between calls)', () => {
    const a = FANDAWS_CONTEXT;
    const b = FANDAWS_CONTEXT;
    expect(a).toBe(b);
  });
});
