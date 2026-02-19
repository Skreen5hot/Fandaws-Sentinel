/**
 * Semantic Loss — Unit Tests
 *
 * Tests LOSS_TYPES enum, SEVERITY enum, LOSS_SEVERITY_MAP,
 * downstream impact templates, and the createLoss() convenience helper.
 */

import { describe, it, expect } from '@jest/globals';
import {
  LOSS_TYPES,
  SEVERITY,
  LOSS_SEVERITY_MAP,
  defaultDownstreamImpact,
  createLoss,
} from '../../../src/core/ivne/semantic-loss.js';

// ── LOSS_TYPES Enum ──

describe('LOSS_TYPES', () => {
  it('contains exactly 9 loss types', () => {
    expect(Object.keys(LOSS_TYPES)).toHaveLength(9);
  });

  it('has self-referential string values', () => {
    for (const [key, value] of Object.entries(LOSS_TYPES)) {
      expect(value).toBe(key);
    }
  });

  it('includes all expected loss types', () => {
    const expected = [
      'intersectionFlattening',
      'unionGeneralization',
      'cardinalityWeakening',
      'complementDrop',
      'enumerationDrop',
      'vacuousDrop',
      'universalWeakening',
      'chainComplexityFlag',
      'cycleDrop',
    ];
    for (const type of expected) {
      expect(LOSS_TYPES).toHaveProperty(type);
    }
  });
});

// ── SEVERITY Enum ──

describe('SEVERITY', () => {
  it('contains exactly 3 severity levels', () => {
    expect(Object.keys(SEVERITY)).toHaveLength(3);
  });

  it('has the expected values', () => {
    expect(SEVERITY.informational).toBe('informational');
    expect(SEVERITY.degraded).toBe('degraded');
    expect(SEVERITY.lossy).toBe('lossy');
  });
});

// ── LOSS_SEVERITY_MAP ──

describe('LOSS_SEVERITY_MAP', () => {
  it('maps every LOSS_TYPE to a SEVERITY value', () => {
    for (const lossType of Object.values(LOSS_TYPES)) {
      expect(LOSS_SEVERITY_MAP[lossType]).toBeDefined();
      expect(Object.values(SEVERITY)).toContain(LOSS_SEVERITY_MAP[lossType]);
    }
  });

  it('maps intersectionFlattening to informational', () => {
    expect(LOSS_SEVERITY_MAP[LOSS_TYPES.intersectionFlattening]).toBe(SEVERITY.informational);
  });

  it('maps unionGeneralization to lossy', () => {
    expect(LOSS_SEVERITY_MAP[LOSS_TYPES.unionGeneralization]).toBe(SEVERITY.lossy);
  });

  it('maps cardinalityWeakening to degraded', () => {
    expect(LOSS_SEVERITY_MAP[LOSS_TYPES.cardinalityWeakening]).toBe(SEVERITY.degraded);
  });

  it('maps cycleDrop to lossy', () => {
    expect(LOSS_SEVERITY_MAP[LOSS_TYPES.cycleDrop]).toBe(SEVERITY.lossy);
  });
});

// ── defaultDownstreamImpact ──

describe('defaultDownstreamImpact', () => {
  it('returns a valid impact object for every loss type', () => {
    for (const lossType of Object.values(LOSS_TYPES)) {
      const impact = defaultDownstreamImpact(lossType);
      expect(impact).toHaveProperty('fnsr');
      expect(impact).toHaveProperty('oce');
      expect(impact).toHaveProperty('iee');
      expect(impact).toHaveProperty('shml');
      // fnsr should be an object with 4 keys
      expect(impact.fnsr).toHaveProperty('des');
      expect(impact.fnsr).toHaveProperty('css');
      expect(impact.fnsr).toHaveProperty('aps');
      expect(impact.fnsr).toHaveProperty('mdre');
    }
  });

  it('returns noImpact fallback for unknown loss type', () => {
    const impact = defaultDownstreamImpact('nonexistentType');
    expect(impact.oce).toBe('noImpact');
    expect(impact.iee).toBe('noImpact');
    expect(impact.shml).toBe('noImpact');
    expect(impact.fnsr.des).toBe('noImpact');
  });

  it('returns suppress for unionGeneralization DES impact', () => {
    const impact = defaultDownstreamImpact(LOSS_TYPES.unionGeneralization);
    expect(impact.fnsr.des).toBe('suppress');
  });

  it('returns materializeIfNeeded for chainComplexityFlag MDRE impact', () => {
    const impact = defaultDownstreamImpact(LOSS_TYPES.chainComplexityFlag);
    expect(impact.fnsr.mdre).toBe('materializeIfNeeded');
  });
});

// ── createLoss ──

describe('createLoss', () => {
  it('produces a SemanticLossRecord with auto-populated severity', () => {
    const loss = createLoss(LOSS_TYPES.intersectionFlattening, {
      sourceAxiom: 'C EquivalentTo A and B',
      compiledForm: 'C skos:broader A; C skos:broader B',
      lostSemantics: 'Intersection flattened to multiple parent links',
    });
    expect(loss['@type']).toBe('fandaws:SemanticLossRecord');
    expect(loss['fandaws:severity']).toBe('informational');
  });

  it('auto-populates downstream impact', () => {
    const loss = createLoss(LOSS_TYPES.unionGeneralization, {
      sourceAxiom: 'A or B',
      compiledForm: 'A; B',
      lostSemantics: 'Union lost',
    });
    expect(loss['fandaws:downstreamImpact']).toHaveProperty('fnsr');
    expect(loss['fandaws:downstreamImpact']).toHaveProperty('oce');
  });

  it('passes through affectedConcepts', () => {
    const loss = createLoss(LOSS_TYPES.complementDrop, {
      affectedConcepts: ['fandaws:class/a'],
      sourceAxiom: 'not A',
      compiledForm: '(dropped)',
      lostSemantics: 'Complement dropped',
    });
    expect(loss['fandaws:affectedConcepts']).toEqual(['fandaws:class/a']);
  });

  it('throws on unknown loss type', () => {
    expect(() =>
      createLoss('madeUpType', {
        sourceAxiom: 'X',
        compiledForm: 'Y',
        lostSemantics: 'Z',
      }),
    ).toThrow('Unknown loss type: madeUpType');
  });

  it('allows overriding severity via params', () => {
    // params spread after auto-populated fields, so user can override
    const loss = createLoss(LOSS_TYPES.vacuousDrop, {
      severity: 'lossy',
      sourceAxiom: 'A SubClassOf owl:Thing',
      compiledForm: '(dropped)',
      lostSemantics: 'Vacuous axiom dropped',
    });
    // The spread in createLoss puts severity before ...params,
    // so params.severity should NOT override (severity is set first, then destructured)
    // Actually, createLoss passes severity first and then spreads params.
    // In createSemanticLossRecord, the destructured params use the passed values.
    // So the behavior depends on which comes first in the object passed to createSemanticLossRecord.
    // createLoss builds: { lossType, severity, downstreamImpact, ...params }
    // If params also has severity, it overwrites.
    expect(loss['fandaws:severity']).toBe('lossy');
  });
});
