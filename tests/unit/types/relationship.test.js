import { describe, it, expect } from '@jest/globals';
import { createRelationship } from '../../../src/types/relationship.js';

describe('createRelationship', () => {
  it('produces a node with @type owl:Restriction', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/dogs-chase-cats',
      verbIri: 'chase',
      subject: 'fandaws:concept/dog',
      object: 'fandaws:concept/cat',
    });
    expect(rel['@type']).toBe('owl:Restriction');
  });

  it('sets all required fields', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/sun-heats-earth',
      verbIri: 'heats',
      subject: 'fandaws:concept/sun',
      object: 'fandaws:concept/earth',
    });
    expect(rel['@id']).toBe('fandaws:rel/sun-heats-earth');
    expect(rel['owl:onProperty']).toBe('heats');
    expect(rel['fandaws:attachedTo']).toBe('fandaws:concept/sun');
    expect(rel['owl:someValuesFrom']).toBe('fandaws:concept/earth');
    expect(rel['fandaws:restrictionKind']).toBe('relationship');
  });

  it('defaults subRestrictionOf to null and promoted to false', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/x',
      verbIri: 'v',
      subject: 's',
      object: 'o',
    });
    expect(rel['fandaws:subRestrictionOf']).toBeNull();
    expect(rel['fandaws:promoted']).toBe(false);
  });

  it('accepts subRestrictionOf and promoted flags', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/dogs-eat-meat',
      verbIri: 'eat',
      subject: 'fandaws:concept/dog',
      object: 'fandaws:concept/meat',
      subRestrictionOf: 'fandaws:rel/animals-eat-food',
      promoted: true,
    });
    expect(rel['fandaws:subRestrictionOf']).toBe('fandaws:rel/animals-eat-food');
    expect(rel['fandaws:promoted']).toBe(true);
  });
});
