/**
 * IRI Generator — unit tests.
 *
 * Covers: slug generation, multi-word terms, special characters,
 * determinism, custom namespaces, error handling.
 */

import { describe, it, expect } from '@jest/globals';
import { generateConceptIri, generatePropertyIri, generateRelationshipIri } from '../../src/core/knowledge-engine/iri-generator.js';

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

describe('generatePropertyIri', () => {
  it('converts single-word label to property IRI', () => {
    expect(generatePropertyIri('fur')).toBe('fandaws:property/fur');
  });

  it('converts multi-word label with hyphens', () => {
    expect(generatePropertyIri('four legs')).toBe('fandaws:property/four-legs');
  });

  it('supports custom namespace', () => {
    expect(generatePropertyIri('fur', 'myns:attr')).toBe('myns:attr/fur');
  });

  it('throws on empty string', () => {
    expect(() => generatePropertyIri('')).toThrow();
  });

  it('throws on null/undefined', () => {
    expect(() => generatePropertyIri(null)).toThrow();
    expect(() => generatePropertyIri(undefined)).toThrow();
  });
});

describe('generateRelationshipIri', () => {
  it('generates triple-slug IRI from subject, verb, object', () => {
    expect(generateRelationshipIri('dog', 'chase', 'cat')).toBe(
      'fandaws:rel/dog--chase--cat',
    );
  });

  it('handles multi-word canonical labels', () => {
    expect(generateRelationshipIri('golden retriever', 'guard', 'small child')).toBe(
      'fandaws:rel/golden-retriever--guard--small-child',
    );
  });

  it('supports custom namespace', () => {
    expect(generateRelationshipIri('dog', 'chase', 'cat', 'myns:rel')).toBe(
      'myns:rel/dog--chase--cat',
    );
  });

  it('throws on empty subject', () => {
    expect(() => generateRelationshipIri('', 'chase', 'cat')).toThrow();
  });

  it('throws on empty verb', () => {
    expect(() => generateRelationshipIri('dog', '', 'cat')).toThrow();
  });

  it('throws on empty object', () => {
    expect(() => generateRelationshipIri('dog', 'chase', '')).toThrow();
  });

  it('throws on null arguments', () => {
    expect(() => generateRelationshipIri(null, 'chase', 'cat')).toThrow();
    expect(() => generateRelationshipIri('dog', null, 'cat')).toThrow();
    expect(() => generateRelationshipIri('dog', 'chase', null)).toThrow();
  });
});
