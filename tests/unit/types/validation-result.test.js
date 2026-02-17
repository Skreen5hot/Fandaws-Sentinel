import { describe, it, expect } from '@jest/globals';
import { createValidationResult } from '../../../src/types/validation-result.js';

describe('createValidationResult', () => {
  it('produces a node with @type fandaws:ValidationResult', () => {
    const result = createValidationResult({ valid: true });
    expect(result['@type']).toBe('fandaws:ValidationResult');
  });

  it('represents a passing validation', () => {
    const result = createValidationResult({ valid: true, id: 'fandaws:validation/v-001' });
    expect(result['fandaws:valid']).toBe(true);
    expect(result['fandaws:violations']).toEqual([]);
    expect(result['@id']).toBe('fandaws:validation/v-001');
  });

  it('represents a failing validation with violations', () => {
    const violations = [
      { reason: 'circular', message: 'Circular hierarchy detected', conceptIri: 'fandaws:class/68f5b79c-451e-5379-8fc2-53da5b0f622e/a' },
      { reason: 'compoundStatement', message: 'Multiple subjects', conceptIri: null },
    ];
    const result = createValidationResult({ valid: false, violations });
    expect(result['fandaws:valid']).toBe(false);
    expect(result['fandaws:violations']).toHaveLength(2);
    expect(result['fandaws:violations'][0].reason).toBe('circular');
  });

  it('defaults id to null and violations to empty array', () => {
    const result = createValidationResult({ valid: true });
    expect(result['@id']).toBeNull();
    expect(result['fandaws:violations']).toEqual([]);
  });
});
