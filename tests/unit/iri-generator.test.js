/**
 * IRI Generator — unit tests.
 *
 * Covers: UUID v5 hash integration, slug generation, scope isolation,
 * determinism, restriction IRI centralization, error handling.
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateConceptIri,
  generatePropertyIri,
  generateRestrictionIri,
  generateRelationshipIri,
  DEFAULT_SCOPE,
} from '../../src/core/knowledge-engine/iri-generator.js';

// UUID v5 pattern: 8-4-4-4-12 hex chars
const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

describe('DEFAULT_SCOPE', () => {
  it('is a fandaws scope IRI', () => {
    expect(DEFAULT_SCOPE).toBe('fandaws:scope/default');
  });
});

describe('generateConceptIri', () => {
  it('produces fandaws:class/{uuid5}/{slug} format', () => {
    const iri = generateConceptIri('dog');
    expect(iri).toMatch(new RegExp(`^fandaws:class/${UUID_RE}/dog$`));
  });

  it('converts multi-word canonical label to hyphenated slug', () => {
    const iri = generateConceptIri('golden retriever');
    expect(iri).toMatch(new RegExp(`^fandaws:class/${UUID_RE}/golden-retriever$`));
  });

  it('strips non-alphanumeric characters from slug', () => {
    const iri = generateConceptIri("o'brien");
    expect(iri).toMatch(new RegExp(`^fandaws:class/${UUID_RE}/obrien$`));
  });

  it('collapses multiple hyphens in slug', () => {
    const iri = generateConceptIri('a--b');
    expect(iri).toMatch(new RegExp(`^fandaws:class/${UUID_RE}/a-b$`));
  });

  it('is deterministic (same input → same output across 3 calls)', () => {
    const a = generateConceptIri('golden retriever');
    const b = generateConceptIri('golden retriever');
    const c = generateConceptIri('golden retriever');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('produces different IRIs for different labels', () => {
    const dog = generateConceptIri('dog');
    const cat = generateConceptIri('cat');
    expect(dog).not.toBe(cat);
  });

  it('produces different IRIs for same label in different scopes', () => {
    const scopeA = generateConceptIri('mouse', 'fandaws:scope/biology');
    const scopeB = generateConceptIri('mouse', 'fandaws:scope/computing');
    expect(scopeA).not.toBe(scopeB);
    // Both still have the 'mouse' slug
    expect(scopeA).toMatch(/\/mouse$/);
    expect(scopeB).toMatch(/\/mouse$/);
  });

  it('uses DEFAULT_SCOPE when scope is omitted', () => {
    const withDefault = generateConceptIri('dog');
    const withExplicit = generateConceptIri('dog', DEFAULT_SCOPE);
    expect(withDefault).toBe(withExplicit);
  });

  it('handles three-word term', () => {
    const iri = generateConceptIri('north american beaver');
    expect(iri).toMatch(new RegExp(`^fandaws:class/${UUID_RE}/north-american-beaver$`));
  });

  it('throws on empty string', () => {
    expect(() => generateConceptIri('')).toThrow();
  });

  it('throws on null/undefined', () => {
    expect(() => generateConceptIri(null)).toThrow();
    expect(() => generateConceptIri(undefined)).toThrow();
  });

  it('contains a valid UUID v5 in the hash segment', () => {
    const iri = generateConceptIri('dog');
    const hash = iri.replace('fandaws:class/', '').replace('/dog', '');
    // UUID v5: version=5, variant=8/9/a/b
    expect(hash[14]).toBe('5');
    expect('89ab').toContain(hash[19]);
  });
});

describe('generatePropertyIri', () => {
  it('produces fandaws:property/{uuid5}/{slug} format', () => {
    const iri = generatePropertyIri('fur');
    expect(iri).toMatch(new RegExp(`^fandaws:property/${UUID_RE}/fur$`));
  });

  it('converts multi-word label with hyphens', () => {
    const iri = generatePropertyIri('four legs');
    expect(iri).toMatch(new RegExp(`^fandaws:property/${UUID_RE}/four-legs$`));
  });

  it('is deterministic', () => {
    const a = generatePropertyIri('fur');
    const b = generatePropertyIri('fur');
    expect(a).toBe(b);
  });

  it('produces different IRI from concept IRI with same label', () => {
    const propIri = generatePropertyIri('dog');
    const conceptIri = generateConceptIri('dog');
    expect(propIri).not.toBe(conceptIri);
    // Different namespace prefixes
    expect(propIri).toMatch(/^fandaws:property\//);
    expect(conceptIri).toMatch(/^fandaws:class\//);
  });

  it('produces different IRIs across scopes', () => {
    const a = generatePropertyIri('color', 'fandaws:scope/art');
    const b = generatePropertyIri('color', 'fandaws:scope/physics');
    expect(a).not.toBe(b);
  });

  it('throws on empty string', () => {
    expect(() => generatePropertyIri('')).toThrow();
  });

  it('throws on null/undefined', () => {
    expect(() => generatePropertyIri(null)).toThrow();
    expect(() => generatePropertyIri(undefined)).toThrow();
  });
});

describe('generateRestrictionIri', () => {
  it('produces fandaws:restriction/{uuid5}/{concept}--{prop} format', () => {
    const iri = generateRestrictionIri('dog', 'fur');
    expect(iri).toMatch(new RegExp(`^fandaws:restriction/${UUID_RE}/dog--fur$`));
  });

  it('handles multi-word labels', () => {
    const iri = generateRestrictionIri('golden retriever', 'four legs');
    expect(iri).toMatch(new RegExp(`^fandaws:restriction/${UUID_RE}/golden-retriever--four-legs$`));
  });

  it('is deterministic', () => {
    const a = generateRestrictionIri('dog', 'fur');
    const b = generateRestrictionIri('dog', 'fur');
    expect(a).toBe(b);
  });

  it('produces different IRIs for different concept-property pairs', () => {
    const a = generateRestrictionIri('dog', 'fur');
    const b = generateRestrictionIri('cat', 'fur');
    const c = generateRestrictionIri('dog', 'tail');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('produces different IRIs across scopes', () => {
    const a = generateRestrictionIri('dog', 'fur', 'fandaws:scope/biology');
    const b = generateRestrictionIri('dog', 'fur', 'fandaws:scope/toys');
    expect(a).not.toBe(b);
  });

  it('throws on empty concept label', () => {
    expect(() => generateRestrictionIri('', 'fur')).toThrow();
  });

  it('throws on empty property label', () => {
    expect(() => generateRestrictionIri('dog', '')).toThrow();
  });

  it('throws on null arguments', () => {
    expect(() => generateRestrictionIri(null, 'fur')).toThrow();
    expect(() => generateRestrictionIri('dog', null)).toThrow();
  });
});

describe('generateRelationshipIri', () => {
  it('produces fandaws:rel/{uuid5}/{s}--{v}--{o} format', () => {
    const iri = generateRelationshipIri('dog', 'chase', 'cat');
    expect(iri).toMatch(new RegExp(`^fandaws:rel/${UUID_RE}/dog--chase--cat$`));
  });

  it('handles multi-word canonical labels', () => {
    const iri = generateRelationshipIri('golden retriever', 'guard', 'small child');
    expect(iri).toMatch(new RegExp(`^fandaws:rel/${UUID_RE}/golden-retriever--guard--small-child$`));
  });

  it('is deterministic', () => {
    const a = generateRelationshipIri('dog', 'chase', 'cat');
    const b = generateRelationshipIri('dog', 'chase', 'cat');
    expect(a).toBe(b);
  });

  it('produces different IRIs for reversed subject/object', () => {
    const forward = generateRelationshipIri('dog', 'chase', 'cat');
    const reverse = generateRelationshipIri('cat', 'chase', 'dog');
    expect(forward).not.toBe(reverse);
  });

  it('produces different IRIs across scopes', () => {
    const a = generateRelationshipIri('dog', 'chase', 'cat', 'fandaws:scope/pets');
    const b = generateRelationshipIri('dog', 'chase', 'cat', 'fandaws:scope/wildlife');
    expect(a).not.toBe(b);
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
