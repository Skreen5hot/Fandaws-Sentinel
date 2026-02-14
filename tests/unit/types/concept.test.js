import { describe, it, expect, beforeEach } from '@jest/globals';
import { createConcept } from '../../../src/types/concept.js';

describe('createConcept', () => {
  let concept;

  beforeEach(() => {
    concept = createConcept({
      id: 'fandaws:concept/dog',
      displayLabel: 'Dog',
      canonicalLabel: 'dog',
      parent: 'fandaws:concept/animal',
      children: [],
      properties: ['fandaws:property/dog-has-fur'],
      bfoMapping: 'bfo:0000040',
      depth: 3,
    });
  });

  it('produces a node with @type fandaws:Concept', () => {
    expect(concept['@type']).toBe('fandaws:Concept');
  });

  it('sets @id from the id parameter', () => {
    expect(concept['@id']).toBe('fandaws:concept/dog');
  });

  it('matches spec Appendix A.2 shape', () => {
    // All fields from A.2 must be present
    expect(concept).toHaveProperty('fandaws:displayLabel', 'Dog');
    expect(concept).toHaveProperty('fandaws:canonicalLabel', 'dog');
    expect(concept).toHaveProperty('fandaws:parent', 'fandaws:concept/animal');
    expect(concept).toHaveProperty('fandaws:children', []);
    expect(concept).toHaveProperty('fandaws:properties', ['fandaws:property/dog-has-fur']);
    expect(concept).toHaveProperty('fandaws:bfoMapping', 'bfo:0000040');
    expect(concept).toHaveProperty('fandaws:depth', 3);
    expect(concept).toHaveProperty('fandaws:createdAt');
    expect(concept).toHaveProperty('fandaws:mergedFrom', []);
  });

  it('generates a valid ISO 8601 createdAt timestamp', () => {
    const ts = concept['fandaws:createdAt'];
    expect(typeof ts).toBe('string');
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('defaults optional fields when not provided', () => {
    const minimal = createConcept({
      id: 'fandaws:concept/thing',
      displayLabel: 'Thing',
      canonicalLabel: 'thing',
    });
    expect(minimal['fandaws:parent']).toBeNull();
    expect(minimal['fandaws:children']).toEqual([]);
    expect(minimal['fandaws:properties']).toEqual([]);
    expect(minimal['fandaws:relationships']).toEqual([]);
    expect(minimal['fandaws:description']).toBe('');
    expect(minimal['fandaws:bfoMapping']).toBeNull();
    expect(minimal['fandaws:depth']).toBe(0);
    expect(minimal['fandaws:mergedFrom']).toEqual([]);
  });

  it('includes relationships and description fields beyond A.2 example', () => {
    const rich = createConcept({
      id: 'fandaws:concept/dog',
      displayLabel: 'Dog',
      canonicalLabel: 'dog',
      relationships: [{ verb: 'chases', object: 'cat' }],
      description: 'Dog is an animal.',
    });
    expect(rich['fandaws:relationships']).toEqual([{ verb: 'chases', object: 'cat' }]);
    expect(rich['fandaws:description']).toBe('Dog is an animal.');
  });

  it('returns a fresh object each invocation (no shared state)', () => {
    const a = createConcept({ id: 'a', displayLabel: 'A', canonicalLabel: 'a' });
    const b = createConcept({ id: 'b', displayLabel: 'B', canonicalLabel: 'b' });
    expect(a).not.toBe(b);
    expect(a['@id']).not.toBe(b['@id']);
  });
});
