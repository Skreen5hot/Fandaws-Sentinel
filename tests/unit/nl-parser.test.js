import { describe, it, expect } from '@jest/globals';
import {
  validateInput,
  normalizeInput,
  stripArticle,
  matchClassification,
  matchProperty,
  matchCustomRelationship,
  parse,
} from '../../src/core/nl-parser/nl-parser.js';

// ─────────────────────────────────────────────────────────
// Step 1: Input Validation
// ─────────────────────────────────────────────────────────

describe('Step 1: validateInput', () => {
  it('rejects empty string', () => {
    expect(validateInput('')).toEqual({ valid: false, errorReason: 'empty-input' });
  });

  it('rejects whitespace-only string', () => {
    expect(validateInput('   ')).toEqual({ valid: false, errorReason: 'empty-input' });
  });

  it('rejects null', () => {
    expect(validateInput(null)).toEqual({ valid: false, errorReason: 'empty-input' });
  });

  it('rejects undefined', () => {
    expect(validateInput(undefined)).toEqual({ valid: false, errorReason: 'empty-input' });
  });

  it('rejects single word (no predicate)', () => {
    expect(validateInput('dog')).toEqual({ valid: false, errorReason: 'no-predicate' });
  });

  it('accepts multi-word input', () => {
    expect(validateInput('A dog is an animal')).toEqual({ valid: true, errorReason: null });
  });
});

// ─────────────────────────────────────────────────────────
// Step 2: Input Normalization
// ─────────────────────────────────────────────────────────

describe('Step 2: normalizeInput', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeInput('  hello world  ')).toBe('hello world');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeInput('A   dog   is   an   animal')).toBe('A dog is an animal');
  });

  it('handles tabs and newlines', () => {
    expect(normalizeInput('A\tdog\nis\tan\nanimal')).toBe('A dog is an animal');
  });
});

// ─────────────────────────────────────────────────────────
// Step 3: Article Stripping
// ─────────────────────────────────────────────────────────

describe('Step 3: stripArticle', () => {
  it('strips "a" from beginning', () => {
    expect(stripArticle('a dog')).toBe('dog');
  });

  it('strips "an" from beginning', () => {
    expect(stripArticle('an animal')).toBe('animal');
  });

  it('strips "the" from beginning', () => {
    expect(stripArticle('the cat')).toBe('cat');
  });

  it('is case-insensitive', () => {
    expect(stripArticle('The Golden Retriever')).toBe('Golden Retriever');
    expect(stripArticle('AN ANIMAL')).toBe('ANIMAL');
  });

  it('does not strip articles from the middle', () => {
    expect(stripArticle('dog and the cat')).toBe('dog and the cat');
  });

  it('returns term unchanged if no leading article', () => {
    expect(stripArticle('dog')).toBe('dog');
  });
});

// ─────────────────────────────────────────────────────────
// Step 4: Classification Pattern Matching
// ─────────────────────────────────────────────────────────

describe('Step 4: matchClassification', () => {
  it('matches "X is a Y"', () => {
    const result = matchClassification('A dog is a pet');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('dog');
    expect(result.predicate).toBe('is a');
    expect(result.object).toBe('pet');
  });

  it('matches "X is an Y"', () => {
    const result = matchClassification('A dog is an animal');
    expect(result.matched).toBe(true);
    expect(result.object).toBe('animal');
  });

  it('matches "X are Y"', () => {
    const result = matchClassification('Dogs are animals');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('Dogs');
    expect(result.predicate).toBe('are');
    expect(result.object).toBe('animals');
  });

  it('matches bare "X is Y"', () => {
    const result = matchClassification('Water is liquid');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('Water');
    expect(result.predicate).toBe('is');
    expect(result.object).toBe('liquid');
  });

  it('handles multi-word subject with article', () => {
    const result = matchClassification('The golden retriever is a dog');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('golden retriever');
    expect(result.object).toBe('dog');
  });

  it('does not match non-classification text', () => {
    expect(matchClassification('Dogs chase cats').matched).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Step 5: Property Pattern Matching
// ─────────────────────────────────────────────────────────

describe('Step 5: matchProperty', () => {
  it('matches "X has Y"', () => {
    const result = matchProperty('A dog has fur');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('dog');
    expect(result.predicate).toBe('has');
    expect(result.object).toBe('fur');
  });

  it('matches "X has a Y"', () => {
    const result = matchProperty('A bird has a beak');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('bird');
    expect(result.object).toBe('beak');
  });

  it('matches "X has an Y"', () => {
    const result = matchProperty('A dog has an owner');
    expect(result.matched).toBe(true);
    expect(result.object).toBe('owner');
  });

  it('matches "X have Y" (plural)', () => {
    const result = matchProperty('Dogs have four legs');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('Dogs');
    expect(result.predicate).toBe('have');
    expect(result.object).toBe('four legs');
  });

  it('does not match non-property text', () => {
    expect(matchProperty('Dogs chase cats').matched).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Step 6: Custom Relationship Pattern Matching
// ─────────────────────────────────────────────────────────

describe('Step 6: matchCustomRelationship', () => {
  it('matches "X verb Y"', () => {
    const result = matchCustomRelationship('Dogs chase cats');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('Dogs');
    expect(result.verb).toBe('chase');
    expect(result.object).toBe('cats');
  });

  it('strips leading article from text', () => {
    const result = matchCustomRelationship('The sun heats the earth');
    expect(result.matched).toBe(true);
    expect(result.subject).toBe('sun');
    expect(result.verb).toBe('heats');
    expect(result.object).toBe('earth');
  });

  it('strips article from object', () => {
    const result = matchCustomRelationship('Birds eat the worms');
    expect(result.matched).toBe(true);
    expect(result.object).toBe('worms');
  });

  it('does not match two-word phrases (no object)', () => {
    expect(matchCustomRelationship('big dog').matched).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// Full Pipeline: parse()
// ─────────────────────────────────────────────────────────

describe('parse — full pipeline', () => {
  // ── Classification patterns (ROADMAP acceptance criteria) ──

  it('"A dog is an animal" → classification', () => {
    const result = parse('A dog is an animal');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:subject']).toBe('dog');
    expect(result['fandaws:object']).toBe('animal');
    expect(result['fandaws:confidence']).toBe(1.0);
    expect(result['fandaws:error']).toBe(false);
  });

  it('"Dogs are animals" → classification', () => {
    const result = parse('Dogs are animals');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:subject']).toBe('Dogs');
    expect(result['fandaws:object']).toBe('animals');
  });

  it('"The golden retriever is a dog" → classification with multi-word subject', () => {
    const result = parse('The golden retriever is a dog');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:subject']).toBe('golden retriever');
    expect(result['fandaws:object']).toBe('dog');
  });

  it('"Water is liquid" → classification (bare is)', () => {
    const result = parse('Water is liquid');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:subject']).toBe('Water');
    expect(result['fandaws:object']).toBe('liquid');
  });

  it('"An apple is a fruit" → classification', () => {
    const result = parse('An apple is a fruit');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:subject']).toBe('apple');
    expect(result['fandaws:object']).toBe('fruit');
  });

  it('"A cat is an animal" → classification', () => {
    const result = parse('A cat is an animal');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:subject']).toBe('cat');
    expect(result['fandaws:object']).toBe('animal');
  });

  // ── Property patterns (ROADMAP acceptance criteria) ──

  it('"A dog has fur" → property', () => {
    const result = parse('A dog has fur');
    expect(result['fandaws:verbType']).toBe('property');
    expect(result['fandaws:subject']).toBe('dog');
    expect(result['fandaws:object']).toBe('fur');
  });

  it('"Dogs have four legs" → property', () => {
    const result = parse('Dogs have four legs');
    expect(result['fandaws:verbType']).toBe('property');
    expect(result['fandaws:subject']).toBe('Dogs');
    expect(result['fandaws:object']).toBe('four legs');
  });

  it('"The cat has whiskers" → property', () => {
    const result = parse('The cat has whiskers');
    expect(result['fandaws:verbType']).toBe('property');
    expect(result['fandaws:subject']).toBe('cat');
    expect(result['fandaws:object']).toBe('whiskers');
  });

  it('"A bird has a beak" → property (article stripped from object)', () => {
    const result = parse('A bird has a beak');
    expect(result['fandaws:verbType']).toBe('property');
    expect(result['fandaws:object']).toBe('beak');
  });

  it('"A dog has an owner" → property (has an)', () => {
    const result = parse('A dog has an owner');
    expect(result['fandaws:verbType']).toBe('property');
    expect(result['fandaws:object']).toBe('owner');
  });

  // ── Custom relationship patterns (ROADMAP acceptance criteria) ──

  it('"Dogs chase cats" → customRelationship', () => {
    const result = parse('Dogs chase cats');
    expect(result['fandaws:verbType']).toBe('customRelationship');
    expect(result['fandaws:subject']).toBe('Dogs');
    expect(result['fandaws:predicate']).toBe('chase');
    expect(result['fandaws:object']).toBe('cats');
  });

  it('"The sun heats the earth" → customRelationship', () => {
    const result = parse('The sun heats the earth');
    expect(result['fandaws:verbType']).toBe('customRelationship');
    expect(result['fandaws:subject']).toBe('sun');
    expect(result['fandaws:predicate']).toBe('heats');
    expect(result['fandaws:object']).toBe('earth');
  });

  it('"Teachers educate students" → customRelationship', () => {
    const result = parse('Teachers educate students');
    expect(result['fandaws:verbType']).toBe('customRelationship');
    expect(result['fandaws:subject']).toBe('Teachers');
    expect(result['fandaws:predicate']).toBe('educate');
    expect(result['fandaws:object']).toBe('students');
  });

  it('"Birds eat worms" → customRelationship', () => {
    const result = parse('Birds eat worms');
    expect(result['fandaws:verbType']).toBe('customRelationship');
    expect(result['fandaws:predicate']).toBe('eat');
  });

  it('"Rain nourishes plants" → customRelationship', () => {
    const result = parse('Rain nourishes plants');
    expect(result['fandaws:verbType']).toBe('customRelationship');
    expect(result['fandaws:predicate']).toBe('nourishes');
  });

  // ── Edge cases (ROADMAP acceptance criteria) ──

  it('empty string → error (empty-input)', () => {
    const result = parse('');
    expect(result['fandaws:error']).toBe(true);
    expect(result['fandaws:errorReason']).toBe('empty-input');
    expect(result['fandaws:confidence']).toBe(0);
  });

  it('single word "dog" → error (no-predicate)', () => {
    const result = parse('dog');
    expect(result['fandaws:error']).toBe(true);
    expect(result['fandaws:errorReason']).toBe('no-predicate');
  });

  it('"A dog" → error (incomplete-utterance)', () => {
    const result = parse('A dog');
    expect(result['fandaws:error']).toBe(true);
    expect(result['fandaws:errorReason']).toBe('incomplete-utterance');
  });

  it('whitespace-only → error (empty-input)', () => {
    const result = parse('   ');
    expect(result['fandaws:error']).toBe(true);
    expect(result['fandaws:errorReason']).toBe('empty-input');
  });

  it('null → error (empty-input)', () => {
    const result = parse(null);
    expect(result['fandaws:error']).toBe(true);
    expect(result['fandaws:errorReason']).toBe('empty-input');
  });

  it('"The cat" → error (incomplete-utterance)', () => {
    const result = parse('The cat');
    expect(result['fandaws:error']).toBe(true);
    expect(result['fandaws:errorReason']).toBe('incomplete-utterance');
  });

  // ── Whitespace normalization ──

  it('normalizes extra whitespace before matching', () => {
    const result = parse('  A  dog  is  an  animal  ');
    expect(result['fandaws:verbType']).toBe('classification');
    expect(result['fandaws:subject']).toBe('dog');
    expect(result['fandaws:object']).toBe('animal');
  });

  // ── Case handling ──

  it('handles uppercase input', () => {
    const result = parse('A DOG IS AN ANIMAL');
    expect(result['fandaws:verbType']).toBe('classification');
  });

  // ── Output shape ──

  it('always returns @type fandaws:ParseResult', () => {
    const success = parse('A dog is an animal');
    const error = parse('');
    expect(success['@type']).toBe('fandaws:ParseResult');
    expect(error['@type']).toBe('fandaws:ParseResult');
  });

  // ── Determinism ──

  it('is deterministic: identical input → identical output', () => {
    const a = parse('A dog is an animal');
    const b = parse('A dog is an animal');
    const c = parse('A dog is an animal');
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  // ── Performance ──

  it('parses in < 5ms per utterance (100 iterations)', () => {
    const inputs = [
      'A dog is an animal',
      'Dogs have four legs',
      'Teachers educate students',
    ];
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      for (const input of inputs) {
        parse(input);
      }
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 300;
    expect(avgMs).toBeLessThan(5);
  });
});
