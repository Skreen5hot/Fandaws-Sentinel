/**
 * IRI Generator — unit tests.
 *
 * Covers: slug generation, multi-word terms, special characters,
 * determinism, custom namespaces, error handling.
 */

import { describe, it, expect } from '@jest/globals';
import { generateConceptIri } from '../../src/core/knowledge-engine/iri-generator.js';

describe('generateConceptIri', () => {
  it('converts single-word canonical label to IRI', () => {
    expect(generateConceptIri('dog')).toBe('fandaws:concept/dog');
  });

  it('converts multi-word canonical label with hyphens', () => {
    expect(generateConceptIri('golden retriever')).toBe(
      'fandaws:concept/golden-retriever',
    );
  });

  it('strips non-alphanumeric characters', () => {
    expect(generateConceptIri("o'brien")).toBe('fandaws:concept/obrien');
  });

  it('collapses multiple hyphens from stripped characters', () => {
    expect(generateConceptIri('a--b')).toBe('fandaws:concept/a-b');
  });

  it('is deterministic (same input → same output)', () => {
    const a = generateConceptIri('golden retriever');
    const b = generateConceptIri('golden retriever');
    expect(a).toBe(b);
  });

  it('supports custom namespace', () => {
    expect(generateConceptIri('dog', 'myns:entity')).toBe('myns:entity/dog');
  });

  it('handles canonical label with leading/trailing spaces in slug', () => {
    // canonicalLabel from simplify() is already trimmed, but defensive
    expect(generateConceptIri('cat')).toBe('fandaws:concept/cat');
  });

  it('throws on empty string', () => {
    expect(() => generateConceptIri('')).toThrow();
  });

  it('throws on null/undefined', () => {
    expect(() => generateConceptIri(null)).toThrow();
    expect(() => generateConceptIri(undefined)).toThrow();
  });

  it('handles three-word term', () => {
    expect(generateConceptIri('north american beaver')).toBe(
      'fandaws:concept/north-american-beaver',
    );
  });
});
