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
      '@id': 'fandaws:concept/autonomy',
      '@type': 'fandaws:Concept',
      'fandaws:displayLabel': 'Autonomy',
      'fandaws:canonicalLabel': 'autonomy',
      'fandaws:parent': 'fandaws:concept/capacity',
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
      resolvedConcept: { '@id': 'fandaws:concept/justice' },
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
