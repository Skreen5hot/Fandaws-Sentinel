import { describe, it, expect } from '@jest/globals';
import { createRelationship } from '../../../src/types/relationship.js';

describe('createRelationship', () => {
  it('produces a node with @type fandaws:Relationship', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/dogs-chase-cats',
      verb: 'chase',
      subject: 'fandaws:concept/dog',
      object: 'fandaws:concept/cat',
    });
    expect(rel['@type']).toBe('fandaws:Relationship');
  });

  it('sets all required fields', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/sun-heats-earth',
      verb: 'heats',
      subject: 'fandaws:concept/sun',
      object: 'fandaws:concept/earth',
    });
    expect(rel['@id']).toBe('fandaws:rel/sun-heats-earth');
    expect(rel['fandaws:verb']).toBe('heats');
    expect(rel['fandaws:subject']).toBe('fandaws:concept/sun');
    expect(rel['fandaws:object']).toBe('fandaws:concept/earth');
  });

  it('defaults subRelationshipOf to null and promoted to false', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/x',
      verb: 'v',
      subject: 's',
      object: 'o',
    });
    expect(rel['fandaws:subRelationshipOf']).toBeNull();
    expect(rel['fandaws:promoted']).toBe(false);
  });

  it('accepts subRelationshipOf and promoted flags', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/dogs-eat-meat',
      verb: 'eat',
      subject: 'fandaws:concept/dog',
      object: 'fandaws:concept/meat',
      subRelationshipOf: 'fandaws:rel/animals-eat-food',
      promoted: true,
    });
    expect(rel['fandaws:subRelationshipOf']).toBe('fandaws:rel/animals-eat-food');
    expect(rel['fandaws:promoted']).toBe(true);
  });
});
