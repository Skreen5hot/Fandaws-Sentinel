import { describe, it, expect } from '@jest/globals';
import { createScopeResolution } from '../../../src/types/scope-resolution.js';

describe('createScopeResolution', () => {
  it('produces a node with @type fandaws:ScopeResolution', () => {
    const res = createScopeResolution({
      term: 'autonomy',
      status: 'resolved',
    });
    expect(res['@type']).toBe('fandaws:ScopeResolution');
  });

  it('matches spec Appendix A.10 shape (resolved)', () => {
    const resolvedConcept = {
      '@id': 'fandaws:class/1c49d5ac-ba64-5254-a55d-44786d81d993/autonomy',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': 'Autonomy',
      'skos:prefLabel': 'autonomy',
      'skos:broader': 'fandaws:class/c5e5d03d-b123-5251-aa34-9a0a45e34a9d/capacity',
    };
    const sourceScope = {
      'fandaws:scopeType': 'global',
      'fandaws:graphId': 'fandaws:graph/ethics-research',
      'fandaws:conceptIri': 'fandaws:graph/ethics-research/concept/autonomy',
      'fandaws:resolvedAt': '2026-02-08T15:00:00Z',
    };

    const res = createScopeResolution({
      term: 'autonomy',
      status: 'resolved',
      resolvedConcept,
      sourceScope,
    });
    expect(res['fandaws:term']).toBe('autonomy');
    expect(res['fandaws:status']).toBe('resolved');
    expect(res['fandaws:resolvedConcept']).toBe(resolvedConcept);
    expect(res['fandaws:sourceScope']).toBe(sourceScope);
    expect(res['fandaws:conflictReport']).toBeNull();
    expect(res['fandaws:skippedScopes']).toEqual([]);
  });

  it('matches spec Appendix A.11 shape (conflict)', () => {
    const conflictReport = {
      '@type': 'fandaws:ConflictReport',
      'fandaws:term': 'autonomy',
      'fandaws:definitions': [
        { 'fandaws:scopeType': 'user', 'fandaws:parentChain': ['capacity', 'quality', 'entity'] },
        { 'fandaws:scopeType': 'global', 'fandaws:parentChain': ['right', 'social construct', 'entity'] },
      ],
    };

    const res = createScopeResolution({
      term: 'autonomy',
      status: 'conflict',
      conflictReport,
    });
    expect(res['fandaws:status']).toBe('conflict');
    expect(res['fandaws:resolvedConcept']).toBeNull();
    expect(res['fandaws:sourceScope']).toBeNull();
    expect(res['fandaws:conflictReport']).toBe(conflictReport);
  });

  it('represents unknown status', () => {
    const res = createScopeResolution({
      term: 'qualia',
      status: 'unknown',
    });
    expect(res['fandaws:status']).toBe('unknown');
    expect(res['fandaws:resolvedConcept']).toBeNull();
    expect(res['fandaws:conflictReport']).toBeNull();
  });

  it('records skipped scopes for offline federation members', () => {
    const res = createScopeResolution({
      term: 'justice',
      status: 'resolved',
      resolvedConcept: { '@id': 'fandaws:class/8763a301-e5ca-5b29-981a-e3458492f56f/justice' },
      sourceScope: { 'fandaws:scopeType': 'user' },
      skippedScopes: [
        { graphId: 'fandaws:graph/offline-1', reason: 'timeout' },
        { graphId: 'fandaws:graph/offline-2', reason: 'unreachable' },
      ],
    });
    expect(res['fandaws:skippedScopes']).toHaveLength(2);
    expect(res['fandaws:skippedScopes'][0].reason).toBe('timeout');
  });
});
