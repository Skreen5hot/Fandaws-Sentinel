/**
 * Type Check Helpers — unit tests.
 *
 * v2.1: isConceptNode handles dual typing (array + string @type).
 *        isRestrictionNode checks for owl:Restriction.
 */

import { describe, it, expect } from '@jest/globals';
import { isConceptNode, isRestrictionNode } from '../../src/types/type-checks.js';

// ─────────────────────────────────────────────────────────
// isConceptNode
// ─────────────────────────────────────────────────────────

describe('isConceptNode', () => {
  it('returns true for dual-typed concept (array @type)', () => {
    const node = { '@type': ['owl:Class', 'skos:Concept'] };
    expect(isConceptNode(node)).toBe(true);
  });

  it('returns true for string @type of skos:Concept', () => {
    const node = { '@type': 'skos:Concept' };
    expect(isConceptNode(node)).toBe(true);
  });

  it('returns false for owl:Restriction node', () => {
    const node = { '@type': 'owl:Restriction' };
    expect(isConceptNode(node)).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isConceptNode(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isConceptNode(undefined)).toBe(false);
  });

  it('returns false when @type is missing', () => {
    const node = { '@id': 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog' };
    expect(isConceptNode(node)).toBe(false);
  });

  it('returns true when skos:Concept is in a multi-type array', () => {
    const node = { '@type': ['owl:Class', 'skos:Concept', 'bfo:Entity'] };
    expect(isConceptNode(node)).toBe(true);
  });

  it('returns false for array @type without skos:Concept', () => {
    const node = { '@type': ['owl:Class', 'owl:Thing'] };
    expect(isConceptNode(node)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// isRestrictionNode
// ─────────────────────────────────────────────────────────

describe('isRestrictionNode', () => {
  it('returns true for owl:Restriction', () => {
    const node = { '@type': 'owl:Restriction', 'fandaws:restrictionKind': 'property' };
    expect(isRestrictionNode(node)).toBe(true);
  });

  it('returns false for concept node', () => {
    const node = { '@type': ['owl:Class', 'skos:Concept'] };
    expect(isRestrictionNode(node)).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isRestrictionNode(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    expect(isRestrictionNode(undefined)).toBe(false);
  });

  it('returns false when @type is missing', () => {
    const node = { '@id': 'fandaws:prop/fur' };
    expect(isRestrictionNode(node)).toBe(false);
  });
});
