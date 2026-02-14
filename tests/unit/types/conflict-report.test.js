import { describe, it, expect } from '@jest/globals';
import {
  createConflictReport,
  createConflictingDefinition,
  createResolutionOption,
} from '../../../src/types/conflict-report.js';

describe('createConflictingDefinition', () => {
  it('produces a descriptor with all required fields', () => {
    const def = createConflictingDefinition({
      conceptIri: 'fandaws:graph/user-aaron/concept/autonomy',
      scopeType: 'user',
      graphId: 'fandaws:graph/user-aaron',
      parentChain: ['capacity', 'quality', 'entity'],
      definition: 'Autonomy is a capacity that has self-governance.',
    });
    expect(def['fandaws:conceptIri']).toBe('fandaws:graph/user-aaron/concept/autonomy');
    expect(def['fandaws:scopeType']).toBe('user');
    expect(def['fandaws:graphId']).toBe('fandaws:graph/user-aaron');
    expect(def['fandaws:parentChain']).toEqual(['capacity', 'quality', 'entity']);
    expect(def['fandaws:definition']).toBe('Autonomy is a capacity that has self-governance.');
    expect(def['fandaws:properties']).toEqual([]);
  });

  it('includes properties when provided', () => {
    const def = createConflictingDefinition({
      conceptIri: 'iri:1',
      scopeType: 'global',
      graphId: 'graph:1',
      parentChain: ['entity'],
      definition: 'Test.',
      properties: ['self-governance', 'moral significance'],
    });
    expect(def['fandaws:properties']).toEqual(['self-governance', 'moral significance']);
  });

  it('defaults properties to empty array', () => {
    const def = createConflictingDefinition({
      conceptIri: 'iri:1',
      scopeType: 'context',
      graphId: 'graph:1',
      parentChain: [],
      definition: '',
    });
    expect(def['fandaws:properties']).toEqual([]);
  });
});

describe('createResolutionOption', () => {
  it('creates a useDefinition option with targetDefinition index', () => {
    const opt = createResolutionOption({
      action: 'useDefinition',
      label: "Use 'capacity' definition from personal graph",
      targetDefinition: 0,
    });
    expect(opt['fandaws:action']).toBe('useDefinition');
    expect(opt['fandaws:label']).toBe("Use 'capacity' definition from personal graph");
    expect(opt['fandaws:targetDefinition']).toBe(0);
  });

  it('creates a createDistinct option (no targetDefinition)', () => {
    const opt = createResolutionOption({
      action: 'createDistinct',
      label: 'These are different concepts',
    });
    expect(opt['fandaws:action']).toBe('createDistinct');
    expect(opt['fandaws:targetDefinition']).toBeNull();
  });

  it('creates a refine option', () => {
    const opt = createResolutionOption({
      action: 'refine',
      label: "Define 'autonomy' fresh for this context",
    });
    expect(opt['fandaws:action']).toBe('refine');
    expect(opt['fandaws:targetDefinition']).toBeNull();
  });
});

describe('createConflictReport', () => {
  const defs = [
    createConflictingDefinition({
      conceptIri: 'fandaws:graph/user-aaron/concept/autonomy',
      scopeType: 'user',
      graphId: 'fandaws:graph/user-aaron',
      parentChain: ['capacity', 'quality', 'entity'],
      definition: 'Autonomy is a capacity.',
      properties: ['self-governance'],
    }),
    createConflictingDefinition({
      conceptIri: 'fandaws:graph/ethics/concept/autonomy',
      scopeType: 'global',
      graphId: 'fandaws:graph/ethics',
      parentChain: ['right', 'social construct', 'entity'],
      definition: 'Autonomy is a right.',
      properties: ['legal recognition'],
    }),
  ];

  const opts = [
    createResolutionOption({ action: 'useDefinition', label: 'Use capacity def', targetDefinition: 0 }),
    createResolutionOption({ action: 'useDefinition', label: 'Use right def', targetDefinition: 1 }),
    createResolutionOption({ action: 'createDistinct', label: 'Different concepts' }),
    createResolutionOption({ action: 'refine', label: 'Define fresh' }),
  ];

  it('has correct @type', () => {
    const report = createConflictReport({ term: 'autonomy', definitions: defs, resolutionOptions: opts });
    expect(report['@type']).toBe('fandaws:ConflictReport');
  });

  it('includes the conflicting term', () => {
    const report = createConflictReport({ term: 'autonomy', definitions: defs, resolutionOptions: opts });
    expect(report['fandaws:term']).toBe('autonomy');
  });

  it('includes all definitions', () => {
    const report = createConflictReport({ term: 'autonomy', definitions: defs, resolutionOptions: opts });
    expect(report['fandaws:definitions']).toHaveLength(2);
    expect(report['fandaws:definitions'][0]['fandaws:scopeType']).toBe('user');
    expect(report['fandaws:definitions'][1]['fandaws:scopeType']).toBe('global');
  });

  it('includes all resolution options', () => {
    const report = createConflictReport({ term: 'autonomy', definitions: defs, resolutionOptions: opts });
    expect(report['fandaws:resolutionOptions']).toHaveLength(4);
    const actions = report['fandaws:resolutionOptions'].map((o) => o['fandaws:action']);
    expect(actions).toEqual(['useDefinition', 'useDefinition', 'createDistinct', 'refine']);
  });

  it('matches Appendix A.11 shape', () => {
    const report = createConflictReport({ term: 'autonomy', definitions: defs, resolutionOptions: opts });
    expect(report).toHaveProperty('@type');
    expect(report).toHaveProperty('fandaws:term');
    expect(report).toHaveProperty('fandaws:definitions');
    expect(report).toHaveProperty('fandaws:resolutionOptions');
  });

  it('produces fresh objects per call', () => {
    const a = createConflictReport({ term: 'x', definitions: [], resolutionOptions: [] });
    const b = createConflictReport({ term: 'x', definitions: [], resolutionOptions: [] });
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
