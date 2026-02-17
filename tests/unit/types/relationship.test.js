import { describe, it, expect } from '@jest/globals';
import { createRelationship } from '../../../src/types/relationship.js';

describe('createRelationship', () => {
  it('produces a node with @type owl:Restriction', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/9e563f69-863b-5438-b816-39121284a76b/dogs-chase-cats',
      verbIri: 'chase',
      subject: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      object: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
    });
    expect(rel['@type']).toBe('owl:Restriction');
  });

  it('sets all required fields', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/b82bac5d-2f74-5475-b987-f09bc7ec90da/sun-heats-earth',
      verbIri: 'heats',
      subject: 'fandaws:class/0993c748-d84b-5e9d-9f45-e4006a223923/sun',
      object: 'fandaws:class/1411fd18-9d79-5747-8f0b-480feacfbea9/earth',
    });
    expect(rel['@id']).toBe('fandaws:rel/b82bac5d-2f74-5475-b987-f09bc7ec90da/sun-heats-earth');
    expect(rel['owl:onProperty']).toBe('heats');
    expect(rel['fandaws:attachedTo']).toBe('fandaws:class/0993c748-d84b-5e9d-9f45-e4006a223923/sun');
    expect(rel['owl:someValuesFrom']).toBe('fandaws:class/1411fd18-9d79-5747-8f0b-480feacfbea9/earth');
    expect(rel['fandaws:restrictionKind']).toBe('relationship');
  });

  it('defaults subRestrictionOf to null and promoted to false', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/fcfe1b69-cf65-52ce-b0c9-e9708f4add43/x',
      verbIri: 'v',
      subject: 's',
      object: 'o',
    });
    expect(rel['fandaws:subRestrictionOf']).toBeNull();
    expect(rel['fandaws:promoted']).toBe(false);
  });

  it('accepts subRestrictionOf and promoted flags', () => {
    const rel = createRelationship({
      id: 'fandaws:rel/13122bfa-f77e-544b-86fc-d8bd14084f49/dogs-eat-meat',
      verbIri: 'eat',
      subject: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      object: 'fandaws:class/107300ee-028f-5722-904c-3f135c37ce7e/meat',
      subRestrictionOf: 'fandaws:rel/b38a2585-ed77-5f5a-a10c-ed1a3afdf71b/animals-eat-food',
      promoted: true,
    });
    expect(rel['fandaws:subRestrictionOf']).toBe('fandaws:rel/b38a2585-ed77-5f5a-a10c-ed1a3afdf71b/animals-eat-food');
    expect(rel['fandaws:promoted']).toBe(true);
  });
});
