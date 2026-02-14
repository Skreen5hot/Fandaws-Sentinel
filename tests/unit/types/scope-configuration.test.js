import { describe, it, expect } from '@jest/globals';
import { createScopeConfiguration, createScopeEntry } from '../../../src/types/scope-configuration.js';

describe('createScopeConfiguration', () => {
  it('produces a node with @type fandaws:ScopeConfiguration', () => {
    const config = createScopeConfiguration({
      userGraphId: 'fandaws:graph/user-aaron',
    });
    expect(config['@type']).toBe('fandaws:ScopeConfiguration');
  });

  it('matches spec Appendix A.9 shape', () => {
    const config = createScopeConfiguration({
      contextGraphId: 'fandaws:graph/case-12345',
      userGraphId: 'fandaws:graph/user-aaron',
      globalFederation: [
        {
          'fandaws:graphId': 'fandaws:graph/bfo-core',
          'fandaws:label': 'BFO Core Ontology v2.0',
          'fandaws:priority': 1,
          'fandaws:trustLevel': 'authoritative',
        },
      ],
    });
    expect(config['fandaws:contextGraphId']).toBe('fandaws:graph/case-12345');
    expect(config['fandaws:userGraphId']).toBe('fandaws:graph/user-aaron');
    expect(config['fandaws:globalFederation']).toHaveLength(1);
  });

  it('defaults contextGraphId to null and globalFederation to empty', () => {
    const config = createScopeConfiguration({
      userGraphId: 'fandaws:graph/user-test',
    });
    expect(config['fandaws:contextGraphId']).toBeNull();
    expect(config['fandaws:globalFederation']).toEqual([]);
  });
});

describe('createScopeEntry', () => {
  it('sets all required fields matching A.9 federation entries', () => {
    const entry = createScopeEntry({
      graphId: 'fandaws:graph/bfo-core',
      label: 'BFO Core Ontology v2.0',
      ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      priority: 1,
      trustLevel: 'authoritative',
      staleCopyAction: 'auto-update',
    });
    expect(entry['fandaws:graphId']).toBe('fandaws:graph/bfo-core');
    expect(entry['fandaws:label']).toBe('BFO Core Ontology v2.0');
    expect(entry['fandaws:ipfsCid']).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
    expect(entry['fandaws:priority']).toBe(1);
    expect(entry['fandaws:trustLevel']).toBe('authoritative');
    expect(entry['fandaws:staleCopyAction']).toBe('auto-update');
  });

  it('defaults trustLevel to community and ipfsCid/staleCopyAction to null', () => {
    const entry = createScopeEntry({
      graphId: 'fandaws:graph/test',
      label: 'Test Graph',
      priority: 5,
    });
    expect(entry['fandaws:trustLevel']).toBe('community');
    expect(entry['fandaws:ipfsCid']).toBeNull();
    expect(entry['fandaws:staleCopyAction']).toBeNull();
  });

  it('supports experimental trust level', () => {
    const entry = createScopeEntry({
      graphId: 'fandaws:graph/ethics',
      label: 'Ethics Research Terms v0.3',
      priority: 3,
      trustLevel: 'experimental',
      staleCopyAction: 'fork',
    });
    expect(entry['fandaws:trustLevel']).toBe('experimental');
    expect(entry['fandaws:staleCopyAction']).toBe('fork');
  });
});
