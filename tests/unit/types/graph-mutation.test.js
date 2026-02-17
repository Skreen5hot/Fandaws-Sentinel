import { describe, it, expect } from '@jest/globals';
import { createGraphMutation } from '../../../src/types/graph-mutation.js';

describe('createGraphMutation', () => {
  it('produces a node with @type fandaws:GraphMutation', () => {
    const mutation = createGraphMutation({ reason: 'test' });
    expect(mutation['@type']).toBe('fandaws:GraphMutation');
  });

  it('matches spec Appendix A.3 shape', () => {
    const mutation = createGraphMutation({
      additions: [
        {
          '@id': 'fandaws:property/ef11b461-246b-5b66-9e06-67383dea04b2/animal-has-eyes',
          '@type': 'owl:Restriction',
          'owl:onProperty': 'has eyes',
          'fandaws:attachedTo': 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
          'fandaws:scope': 'inherited',
          'fandaws:restrictionKind': 'property',
        },
      ],
      modifications: [],
      deletions: [],
      merges: [],
      reason: "Scope narrowing: property 'has eyes' promoted from 'dog' to 'animal'",
      validatedBy: 'fandaws:validation/v-20260208-001',
    });

    expect(mutation['fandaws:additions']).toHaveLength(1);
    expect(mutation['fandaws:additions'][0]['@type']).toBe('owl:Restriction');
    expect(mutation['fandaws:modifications']).toEqual([]);
    expect(mutation['fandaws:deletions']).toEqual([]);
    expect(mutation['fandaws:merges']).toEqual([]);
    expect(mutation['fandaws:reason']).toBe(
      "Scope narrowing: property 'has eyes' promoted from 'dog' to 'animal'"
    );
    expect(mutation['fandaws:validatedBy']).toBe('fandaws:validation/v-20260208-001');
  });

  it('defaults arrays to empty and validatedBy to null', () => {
    const mutation = createGraphMutation({ reason: 'minimal' });
    expect(mutation['fandaws:additions']).toEqual([]);
    expect(mutation['fandaws:modifications']).toEqual([]);
    expect(mutation['fandaws:deletions']).toEqual([]);
    expect(mutation['fandaws:merges']).toEqual([]);
    expect(mutation['fandaws:validatedBy']).toBeNull();
  });

  it('accepts deletion IRIs as strings', () => {
    const mutation = createGraphMutation({
      deletions: ['fandaws:class/08ed451a-8a66-5922-a38e-029234abc158/stale-1', 'fandaws:class/f3baf65d-c3ca-5fb2-a31a-8dcfea69af1b/stale-2'],
      reason: 'cleanup',
    });
    expect(mutation['fandaws:deletions']).toEqual([
      'fandaws:class/08ed451a-8a66-5922-a38e-029234abc158/stale-1',
      'fandaws:class/f3baf65d-c3ca-5fb2-a31a-8dcfea69af1b/stale-2',
    ]);
  });
});
