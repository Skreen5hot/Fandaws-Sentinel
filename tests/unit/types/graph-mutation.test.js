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
          '@id': 'fandaws:property/animal-has-eyes',
          '@type': 'fandaws:Property',
          'fandaws:displayLabel': 'has eyes',
          'fandaws:attachedTo': 'fandaws:concept/animal',
          'fandaws:scope': 'inherited',
        },
      ],
      modifications: [],
      deletions: [],
      merges: [],
      reason: "Scope narrowing: property 'has eyes' promoted from 'dog' to 'animal'",
      validatedBy: 'fandaws:validation/v-20260208-001',
    });

    expect(mutation['fandaws:additions']).toHaveLength(1);
    expect(mutation['fandaws:additions'][0]['@type']).toBe('fandaws:Property');
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
      deletions: ['fandaws:concept/stale-1', 'fandaws:concept/stale-2'],
      reason: 'cleanup',
    });
    expect(mutation['fandaws:deletions']).toEqual([
      'fandaws:concept/stale-1',
      'fandaws:concept/stale-2',
    ]);
  });
});
