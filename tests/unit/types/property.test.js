import { describe, it, expect } from '@jest/globals';
import { createProperty } from '../../../src/types/property.js';

describe('createProperty', () => {
  it('produces a node with @type fandaws:Property', () => {
    const prop = createProperty({
      id: 'fandaws:property/dog-has-fur',
      label: 'has fur',
      attachedTo: 'fandaws:concept/dog',
    });
    expect(prop['@type']).toBe('fandaws:Property');
  });

  it('sets all required fields', () => {
    const prop = createProperty({
      id: 'fandaws:property/animal-has-eyes',
      label: 'has eyes',
      attachedTo: 'fandaws:concept/animal',
      scope: 'inherited',
      value: null,
    });
    expect(prop['@id']).toBe('fandaws:property/animal-has-eyes');
    expect(prop['fandaws:label']).toBe('has eyes');
    expect(prop['fandaws:attachedTo']).toBe('fandaws:concept/animal');
    expect(prop['fandaws:scope']).toBe('inherited');
    expect(prop['fandaws:value']).toBeNull();
  });

  it('defaults scope to concept-specific', () => {
    const prop = createProperty({
      id: 'fandaws:property/x',
      label: 'has x',
      attachedTo: 'fandaws:concept/y',
    });
    expect(prop['fandaws:scope']).toBe('concept-specific');
  });

  it('accepts a property value', () => {
    const prop = createProperty({
      id: 'fandaws:property/dog-has-legs',
      label: 'has legs',
      attachedTo: 'fandaws:concept/dog',
      value: 4,
    });
    expect(prop['fandaws:value']).toBe(4);
  });

  it('returns distinct objects per call', () => {
    const a = createProperty({ id: 'a', label: 'a', attachedTo: 'x' });
    const b = createProperty({ id: 'b', label: 'b', attachedTo: 'y' });
    expect(a).not.toBe(b);
  });
});
