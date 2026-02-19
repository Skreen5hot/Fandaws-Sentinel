/**
 * Pre-Filter — Unit Tests
 *
 * Tests all gate functions for the IVNE Stage 1 validation.
 */

import { describe, it, expect } from '@jest/globals';
import {
  gateOneOf,
  gateComplement,
  gatePropertyChain,
  gateCardinality,
  gateCycle,
  gateMaxConcepts,
} from '../../../src/core/ivne/pre-filter.js';

// ── gateOneOf ──

describe('gateOneOf', () => {
  it('passes non-OneOf axioms', () => {
    const result = gateOneOf({ type: 'SubClassOf' });
    expect(result.action).toBe('pass');
    expect(result.lossRecord).toBeNull();
  });

  it('rejects OneOf axioms with enumerationDrop loss', () => {
    const result = gateOneOf({
      type: 'OneOf',
      individuals: ['a', 'b', 'c'],
      affectedClass: 'ex:Color',
      sourceAxiom: 'Color EquivalentTo {red, green, blue}',
    });
    expect(result.action).toBe('reject');
    expect(result.lossRecord['fandaws:lossType']).toBe('enumerationDrop');
    expect(result.lossRecord['fandaws:severity']).toBe('lossy');
  });

  it('includes affected class in loss record', () => {
    const result = gateOneOf({
      type: 'OneOf',
      individuals: ['x'],
      affectedClass: 'ex:Status',
    });
    expect(result.lossRecord['fandaws:affectedConcepts']).toContain('ex:Status');
  });

  it('handles missing individuals array', () => {
    const result = gateOneOf({ type: 'OneOf' });
    expect(result.action).toBe('reject');
    expect(result.lossRecord['fandaws:lostSemantics']).toContain('0 individuals');
  });
});

// ── gateComplement ──

describe('gateComplement', () => {
  it('passes non-ComplementOf axioms', () => {
    const result = gateComplement({ type: 'SubClassOf' });
    expect(result.action).toBe('pass');
  });

  it('rejects ComplementOf axioms with complementDrop loss', () => {
    const result = gateComplement({
      type: 'ComplementOf',
      complement: 'ex:Alive',
      affectedClass: 'ex:Dead',
    });
    expect(result.action).toBe('reject');
    expect(result.lossRecord['fandaws:lossType']).toBe('complementDrop');
    expect(result.lossRecord['fandaws:severity']).toBe('lossy');
  });

  it('includes context in loss record when provided', () => {
    const result = gateComplement(
      { type: 'ComplementOf', complement: 'ex:X' },
      { sourceOntology: 'http://example.org', ivneRunId: 'run-1' },
    );
    expect(result.lossRecord['fandaws:sourceOntology']).toBe('http://example.org');
    expect(result.lossRecord['fandaws:ivneRunId']).toBe('run-1');
  });
});

// ── gatePropertyChain ──

describe('gatePropertyChain', () => {
  it('passes non-PropertyChain axioms', () => {
    const result = gatePropertyChain({ type: 'SubClassOf' });
    expect(result.action).toBe('pass');
  });

  it('passes chains within threshold', () => {
    const result = gatePropertyChain({
      type: 'PropertyChain',
      chain: ['hasParent', 'hasSibling', 'hasChild'],
    });
    expect(result.action).toBe('pass');
  });

  it('flags chains exceeding threshold', () => {
    const result = gatePropertyChain(
      {
        type: 'PropertyChain',
        chain: ['a', 'b', 'c', 'd'],
      },
      {},
      { chainComplexityThreshold: 3 },
    );
    expect(result.action).toBe('flag');
    expect(result.lossRecord['fandaws:lossType']).toBe('chainComplexityFlag');
    expect(result.lossRecord['fandaws:severity']).toBe('degraded');
  });

  it('respects custom threshold', () => {
    const result = gatePropertyChain(
      {
        type: 'PropertyChain',
        chain: ['a', 'b'],
      },
      {},
      { chainComplexityThreshold: 1 },
    );
    expect(result.action).toBe('flag');
  });

  it('passes chain at exactly threshold', () => {
    const result = gatePropertyChain(
      {
        type: 'PropertyChain',
        chain: ['a', 'b', 'c'],
      },
      {},
      { chainComplexityThreshold: 3 },
    );
    expect(result.action).toBe('pass');
  });
});

// ── gateCardinality ──

describe('gateCardinality', () => {
  it('passes non-Cardinality axioms', () => {
    const result = gateCardinality({ type: 'SubClassOf' });
    expect(result.action).toBe('pass');
  });

  it('rejects min-cardinality-0 as vacuousDrop', () => {
    const result = gateCardinality({
      type: 'Cardinality',
      minCardinality: 0,
      affectedClass: 'ex:A',
      property: 'ex:p',
      filler: 'ex:B',
    });
    expect(result.action).toBe('reject');
    expect(result.lossRecord['fandaws:lossType']).toBe('vacuousDrop');
    expect(result.lossRecord['fandaws:severity']).toBe('informational');
  });

  it('returns dual with null lossRecord for min-cardinality > 0', () => {
    const result = gateCardinality({
      type: 'Cardinality',
      minCardinality: 1,
      affectedClass: 'ex:Car',
      property: 'ex:hasWheel',
      filler: 'ex:Wheel',
    });
    expect(result.action).toBe('dual');
    // Loss record is now emitted by restriction-lifter, not pre-filter
    expect(result.lossRecord).toBeNull();
  });

  it('returns dual for exactCardinality', () => {
    const result = gateCardinality({
      type: 'Cardinality',
      exactCardinality: 4,
      affectedClass: 'ex:Car',
      property: 'ex:hasWheel',
      filler: 'ex:Wheel',
    });
    expect(result.action).toBe('dual');
  });

  it('returns dual for maxCardinality only', () => {
    const result = gateCardinality({
      type: 'Cardinality',
      maxCardinality: 2,
      affectedClass: 'ex:Person',
      property: 'ex:hasEye',
      filler: 'ex:Eye',
    });
    expect(result.action).toBe('dual');
  });
});

// ── gateCycle ──

describe('gateCycle', () => {
  it('passes when class not in visited set', () => {
    const visited = new Set(['ex:A', 'ex:B']);
    const result = gateCycle('ex:C', visited);
    expect(result.action).toBe('pass');
  });

  it('rejects when class is in visited set', () => {
    const visited = new Set(['ex:A', 'ex:B']);
    const result = gateCycle('ex:A', visited);
    expect(result.action).toBe('reject');
    expect(result.lossRecord['fandaws:lossType']).toBe('cycleDrop');
    expect(result.lossRecord['fandaws:severity']).toBe('lossy');
  });

  it('includes class IRI in affected concepts', () => {
    const visited = new Set(['ex:X']);
    const result = gateCycle('ex:X', visited);
    expect(result.lossRecord['fandaws:affectedConcepts']).toContain('ex:X');
  });
});

// ── gateMaxConcepts ──

describe('gateMaxConcepts', () => {
  it('passes when below limit', () => {
    const result = gateMaxConcepts(100, { maxConcepts: 50000 });
    expect(result.action).toBe('pass');
  });

  it('returns error when at limit', () => {
    const result = gateMaxConcepts(50000, { maxConcepts: 50000 });
    expect(result.action).toBe('error');
    expect(result.message).toContain('50000');
  });

  it('returns error when above limit', () => {
    const result = gateMaxConcepts(50001, { maxConcepts: 50000 });
    expect(result.action).toBe('error');
  });

  it('uses default maxConcepts of 50000', () => {
    const result = gateMaxConcepts(49999);
    expect(result.action).toBe('pass');
  });

  it('respects custom maxConcepts', () => {
    const result = gateMaxConcepts(11, { maxConcepts: 10 });
    expect(result.action).toBe('error');
  });
});
