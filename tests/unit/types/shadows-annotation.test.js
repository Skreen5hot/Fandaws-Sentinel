import { describe, it, expect } from '@jest/globals';
import {
  createShadowsAnnotation,
  createDisambiguatedFromAnnotation,
} from '../../../src/types/shadows-annotation.js';

describe('createShadowsAnnotation', () => {
  it('has correct @type', () => {
    const ann = createShadowsAnnotation({
      overriddenDefinitions: [
        { scopeType: 'global', graphId: 'graph:ethics', conceptIri: 'concept:autonomy' },
      ],
      disambiguatedDisplayLabel: 'autonomy (local)',
    });
    expect(ann['@type']).toBe('fandaws:ShadowsAnnotation');
  });

  it('maps overridden definitions to fandaws:shadows array', () => {
    const ann = createShadowsAnnotation({
      overriddenDefinitions: [
        { scopeType: 'user', graphId: 'graph:user-aaron', conceptIri: 'concept:1' },
        { scopeType: 'global', graphId: 'graph:ethics', conceptIri: 'concept:2' },
      ],
      disambiguatedDisplayLabel: 'moral autonomy',
    });
    expect(ann['fandaws:shadows']).toHaveLength(2);
    expect(ann['fandaws:shadows'][0]).toEqual({
      'fandaws:scopeType': 'user',
      'fandaws:graphId': 'graph:user-aaron',
      'fandaws:conceptIri': 'concept:1',
    });
    expect(ann['fandaws:shadows'][1]['fandaws:scopeType']).toBe('global');
  });

  it('includes disambiguated display label', () => {
    const ann = createShadowsAnnotation({
      overriddenDefinitions: [
        { scopeType: 'global', graphId: 'g', conceptIri: 'c' },
      ],
      disambiguatedDisplayLabel: 'autonomy (contextual)',
    });
    expect(ann['fandaws:disambiguatedDisplayLabel']).toBe('autonomy (contextual)');
  });

  it('handles single overridden definition', () => {
    const ann = createShadowsAnnotation({
      overriddenDefinitions: [
        { scopeType: 'context', graphId: 'g', conceptIri: 'c' },
      ],
      disambiguatedDisplayLabel: 'test (local)',
    });
    expect(ann['fandaws:shadows']).toHaveLength(1);
  });

  it('produces fresh objects per call', () => {
    const params = {
      overriddenDefinitions: [{ scopeType: 'global', graphId: 'g', conceptIri: 'c' }],
      disambiguatedDisplayLabel: 'test',
    };
    const a = createShadowsAnnotation(params);
    const b = createShadowsAnnotation(params);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('createDisambiguatedFromAnnotation', () => {
  it('has correct @type', () => {
    const ann = createDisambiguatedFromAnnotation({
      originalTerm: 'autonomy',
      graphId: 'fandaws:graph/ethics',
      conceptIri: 'fandaws:graph/ethics/concept/autonomy',
    });
    expect(ann['@type']).toBe('fandaws:DisambiguatedFromAnnotation');
  });

  it('includes original term', () => {
    const ann = createDisambiguatedFromAnnotation({
      originalTerm: 'autonomy',
      graphId: 'g',
      conceptIri: 'c',
    });
    expect(ann['fandaws:originalTerm']).toBe('autonomy');
  });

  it('includes source graph and concept IRI', () => {
    const ann = createDisambiguatedFromAnnotation({
      originalTerm: 'bank',
      graphId: 'fandaws:graph/finance',
      conceptIri: 'fandaws:graph/finance/concept/bank',
    });
    expect(ann['fandaws:graphId']).toBe('fandaws:graph/finance');
    expect(ann['fandaws:conceptIri']).toBe('fandaws:graph/finance/concept/bank');
  });

  it('produces fresh objects per call', () => {
    const params = { originalTerm: 'x', graphId: 'g', conceptIri: 'c' };
    const a = createDisambiguatedFromAnnotation(params);
    const b = createDisambiguatedFromAnnotation(params);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
