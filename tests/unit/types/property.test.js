import { describe, it, expect } from '@jest/globals';
import { createProperty } from '../../../src/types/property.js';

describe('createProperty', () => {
  it('produces a node with @type owl:Restriction', () => {
    const prop = createProperty({
      id: 'fandaws:property/dog-has-fur',
      propertyIri: 'has fur',
      attachedTo: 'fandaws:concept/dog',
    });
    expect(prop['@type']).toBe('owl:Restriction');
  });

  it('sets all required fields', () => {
    const prop = createProperty({
      id: 'fandaws:property/animal-has-eyes',
      propertyIri: 'has eyes',
      attachedTo: 'fandaws:concept/animal',
      scope: 'inherited',
      value: null,
    });
    expect(prop['@id']).toBe('fandaws:property/animal-has-eyes');
    expect(prop['owl:onProperty']).toBe('has eyes');
    expect(prop['fandaws:attachedTo']).toBe('fandaws:concept/animal');
    expect(prop['fandaws:scope']).toBe('inherited');
    expect(prop['owl:hasValue']).toBeNull();
    expect(prop['fandaws:restrictionKind']).toBe('property');
  });

  it('defaults scope to concept-specific', () => {
    const prop = createProperty({
      id: 'fandaws:property/x',
      propertyIri: 'has x',
      attachedTo: 'fandaws:concept/y',
    });
    expect(prop['fandaws:scope']).toBe('concept-specific');
  });

  it('accepts a property value', () => {
    const prop = createProperty({
      id: 'fandaws:property/dog-has-legs',
      propertyIri: 'has legs',
      attachedTo: 'fandaws:concept/dog',
      value: 4,
    });
    expect(prop['owl:hasValue']).toBe(4);
  });

  it('returns distinct objects per call', () => {
    const a = createProperty({ id: 'a', propertyIri: 'a', attachedTo: 'x' });
    const b = createProperty({ id: 'b', propertyIri: 'b', attachedTo: 'y' });
    expect(a).not.toBe(b);
  });
});
