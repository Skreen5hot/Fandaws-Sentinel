import { describe, it, expect } from '@jest/globals';
import { createResolvedFromAnnotation } from '../../../src/types/resolved-from.js';

describe('createResolvedFromAnnotation', () => {
  it('produces annotation with all required fields', () => {
    const ann = createResolvedFromAnnotation({
      graphId: 'fandaws:graph/ethics-research',
      conceptIri: 'fandaws:graph/ethics-research/concept/autonomy',
      scopeType: 'global',
      resolvedAt: '2026-02-08T15:00:00Z',
    });
    expect(ann['fandaws:resolvedFrom.graphId']).toBe('fandaws:graph/ethics-research');
    expect(ann['fandaws:resolvedFrom.conceptIri']).toBe('fandaws:graph/ethics-research/concept/autonomy');
    expect(ann['fandaws:resolvedFrom.scopeType']).toBe('global');
    expect(ann['fandaws:resolvedFrom.resolvedAt']).toBe('2026-02-08T15:00:00Z');
    expect(ann['fandaws:resolvedFrom.graphVersion']).toBeNull();
  });

  it('includes graphVersion when provided', () => {
    const ann = createResolvedFromAnnotation({
      graphId: 'graph:1',
      conceptIri: 'graph:1/concept/dog',
      scopeType: 'user',
      resolvedAt: '2026-02-14T12:00:00Z',
      graphVersion: 'sha256:abc123',
    });
    expect(ann['fandaws:resolvedFrom.graphVersion']).toBe('sha256:abc123');
  });

  it('defaults graphVersion to null', () => {
    const ann = createResolvedFromAnnotation({
      graphId: 'g',
      conceptIri: 'c',
      scopeType: 'context',
      resolvedAt: '2026-01-01T00:00:00Z',
    });
    expect(ann['fandaws:resolvedFrom.graphVersion']).toBeNull();
  });

  it('matches Appendix A.10 shape', () => {
    const ann = createResolvedFromAnnotation({
      graphId: 'fandaws:graph/ethics-research',
      conceptIri: 'fandaws:graph/ethics-research/concept/autonomy',
      scopeType: 'global',
      resolvedAt: '2026-02-08T15:00:00Z',
      graphVersion: 'sha256:abc123',
    });
    expect(ann).toEqual({
      'fandaws:resolvedFrom.graphId': 'fandaws:graph/ethics-research',
      'fandaws:resolvedFrom.conceptIri': 'fandaws:graph/ethics-research/concept/autonomy',
      'fandaws:resolvedFrom.scopeType': 'global',
      'fandaws:resolvedFrom.resolvedAt': '2026-02-08T15:00:00Z',
      'fandaws:resolvedFrom.graphVersion': 'sha256:abc123',
    });
  });

  it('supports all three scope types', () => {
    for (const scopeType of ['context', 'user', 'global']) {
      const ann = createResolvedFromAnnotation({
        graphId: 'g',
        conceptIri: 'c',
        scopeType,
        resolvedAt: '2026-01-01T00:00:00Z',
      });
      expect(ann['fandaws:resolvedFrom.scopeType']).toBe(scopeType);
    }
  });

  it('produces fresh objects per call', () => {
    const params = { graphId: 'g', conceptIri: 'c', scopeType: 'user', resolvedAt: '2026-01-01T00:00:00Z' };
    const a = createResolvedFromAnnotation(params);
    const b = createResolvedFromAnnotation(params);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
