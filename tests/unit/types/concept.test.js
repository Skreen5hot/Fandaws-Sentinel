import { describe, it, expect, beforeEach } from '@jest/globals';
import { createConcept } from '../../../src/types/concept.js';

describe('createConcept', () => {
  let concept;

  beforeEach(() => {
    concept = createConcept({
      id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      label: 'Dog',
      prefLabel: 'dog',
      broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
      bfoMapping: 'bfo:0000040',
    });
  });

  it('produces a node with dual @type [owl:Class, skos:Concept]', () => {
    expect(concept['@type']).toEqual(['owl:Class', 'skos:Concept']);
  });

  it('sets @id from the id parameter', () => {
    expect(concept['@id']).toBe('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
  });

  it('matches v2.1 concept shape', () => {
    expect(concept).toHaveProperty('rdfs:label', 'Dog');
    expect(concept).toHaveProperty('skos:prefLabel', 'dog');
    expect(concept).toHaveProperty('skos:broader', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(concept).toHaveProperty('fandaws:algorithmicDefinition', '');
    expect(concept).toHaveProperty('dcterms:created');
    expect(concept).toHaveProperty('dcterms:modified', null);
    expect(concept).toHaveProperty('prov:wasDerivedFrom', []);
    expect(concept).toHaveProperty('skos:altLabel', []);
    expect(concept).toHaveProperty('skos:inScheme', null);
    expect(concept).toHaveProperty('rdfs:subClassOf');
    expect(concept['rdfs:subClassOf']).toEqual(['bfo:0000040']);
  });

  it('generates a valid ISO 8601 created timestamp', () => {
    const ts = concept['dcterms:created'];
    expect(typeof ts).toBe('string');
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('defaults optional fields when not provided', () => {
    const minimal = createConcept({
      id: 'fandaws:class/c5d09a81-e9b7-5f1b-81d4-dbd3011d5c9d/thing',
      label: 'Thing',
      prefLabel: 'thing',
    });
    expect(minimal['skos:broader']).toBeNull();
    expect(minimal['fandaws:algorithmicDefinition']).toBe('');
    expect(minimal['rdfs:subClassOf']).toEqual([]);
    expect(minimal['prov:wasDerivedFrom']).toEqual([]);
    expect(minimal['skos:altLabel']).toEqual([]);
    expect(minimal['skos:inScheme']).toBeNull();
    expect(minimal['dcterms:modified']).toBeNull();
  });

  it('accepts altLabel and inScheme fields', () => {
    const rich = createConcept({
      id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      label: 'Dog',
      prefLabel: 'dog',
      definition: 'Dog is an animal.',
      altLabel: ['canine', 'hound'],
      inScheme: 'fandaws:scheme/animals',
    });
    expect(rich['skos:altLabel']).toEqual(['canine', 'hound']);
    expect(rich['skos:inScheme']).toBe('fandaws:scheme/animals');
    expect(rich['fandaws:algorithmicDefinition']).toBe('Dog is an animal.');
  });

  it('returns a fresh object each invocation (no shared state)', () => {
    const a = createConcept({ id: 'a', label: 'A', prefLabel: 'a' });
    const b = createConcept({ id: 'b', label: 'B', prefLabel: 'b' });
    expect(a).not.toBe(b);
    expect(a['@id']).not.toBe(b['@id']);
  });
});
