import { describe, it, expect } from '@jest/globals';
import {
  simplify,
  trimWhitespace,
  collapseWhitespace,
  removeLeadingArticles,
  applyNFKC,
  caseFold,
  expandAbbreviations,
} from '../../src/core/identity/identity-simplification.js';

// Shared config for protected proper nouns tests
const protectedProperNouns = [
  'the hague',
  'the bronx',
  'the beatles',
  'the gambia',
];

// ─────────────────────────────────────────────────────────
// Step 1: Trim
// ─────────────────────────────────────────────────────────
describe('Step 1: trimWhitespace', () => {
  it('removes leading and trailing spaces', () => {
    expect(trimWhitespace('  hello  ')).toBe('hello');
  });

  it('removes tabs and newlines', () => {
    expect(trimWhitespace('\t\nhello\r\n')).toBe('hello');
  });

  it('preserves internal whitespace', () => {
    expect(trimWhitespace('  golden   retriever  ')).toBe('golden   retriever');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(trimWhitespace('   ')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────
// Step 2: Collapse whitespace
// ─────────────────────────────────────────────────────────
describe('Step 2: collapseWhitespace', () => {
  it('collapses multiple spaces to one', () => {
    expect(collapseWhitespace('golden   retriever')).toBe('golden retriever');
  });

  it('collapses tabs and mixed whitespace', () => {
    expect(collapseWhitespace('golden\t\n  retriever')).toBe('golden retriever');
  });

  it('leaves single spaces unchanged', () => {
    expect(collapseWhitespace('golden retriever')).toBe('golden retriever');
  });
});

// ─────────────────────────────────────────────────────────
// Step 3: Remove leading articles
// ─────────────────────────────────────────────────────────
describe('Step 3: removeLeadingArticles', () => {
  const articles = ['a', 'an', 'the'];

  it('removes "A " prefix', () => {
    expect(removeLeadingArticles('A dog', { articles, protectedProperNouns: [] })).toBe('dog');
  });

  it('removes "An " prefix', () => {
    expect(removeLeadingArticles('An apple', { articles, protectedProperNouns: [] })).toBe('apple');
  });

  it('removes "The " prefix', () => {
    expect(removeLeadingArticles('The cat', { articles, protectedProperNouns: [] })).toBe('cat');
  });

  it('is case-insensitive for article matching', () => {
    expect(removeLeadingArticles('THE DOG', { articles, protectedProperNouns: [] })).toBe('DOG');
  });

  it('does not remove articles mid-string', () => {
    expect(removeLeadingArticles('dog the cat', { articles, protectedProperNouns: [] })).toBe('dog the cat');
  });

  it('skips stripping for protected proper nouns', () => {
    expect(removeLeadingArticles('The Hague', { articles, protectedProperNouns })).toBe('The Hague');
    expect(removeLeadingArticles('The Bronx', { articles, protectedProperNouns })).toBe('The Bronx');
    expect(removeLeadingArticles('The Beatles', { articles, protectedProperNouns })).toBe('The Beatles');
  });

  it('strips article for non-protected phrases', () => {
    expect(removeLeadingArticles('The dog', { articles, protectedProperNouns })).toBe('dog');
  });

  it('returns empty string unchanged', () => {
    expect(removeLeadingArticles('', { articles, protectedProperNouns: [] })).toBe('');
  });
});

// ─────────────────────────────────────────────────────────
// Step 4: NFKC normalization
// ─────────────────────────────────────────────────────────
describe('Step 4: applyNFKC', () => {
  it('resolves fi ligature', () => {
    expect(applyNFKC('\uFB01nance')).toBe('finance');
  });

  it('resolves fullwidth characters', () => {
    expect(applyNFKC('\uFF21\uFF22\uFF23')).toBe('ABC');
  });

  it('preserves diacritics', () => {
    expect(applyNFKC('CAFÉ')).toBe('CAFÉ');
  });

  it('leaves ASCII unchanged', () => {
    expect(applyNFKC('hello')).toBe('hello');
  });
});

// ─────────────────────────────────────────────────────────
// Step 5: Locale-aware case folding
// ─────────────────────────────────────────────────────────
describe('Step 5: caseFold', () => {
  it('lowercases English text', () => {
    expect(caseFold('DOG', 'en')).toBe('dog');
  });

  it('preserves diacritics during case fold', () => {
    expect(caseFold('CAFÉ', 'en')).toBe('café');
  });

  it('is a no-op for Chinese locale', () => {
    expect(caseFold('测试', 'zh')).toBe('测试');
  });

  it('is a no-op for Japanese locale', () => {
    expect(caseFold('テスト', 'ja')).toBe('テスト');
  });

  it('is a no-op for Arabic locale', () => {
    expect(caseFold('اختبار', 'ar')).toBe('اختبار');
  });

  it('handles Turkish locale with İ (dotted capital I)', () => {
    // Turkish İ → i (not ı)
    const result = caseFold('İSTANBUL', 'tr');
    expect(result.startsWith('i')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// Step 6: Abbreviation expansion
// ─────────────────────────────────────────────────────────
describe('Step 6: expandAbbreviations', () => {
  it('expands a single abbreviation', () => {
    expect(expandAbbreviations('govt', { govt: 'government' })).toBe('government');
  });

  it('expands abbreviation within a phrase', () => {
    expect(expandAbbreviations('us govt policy', { govt: 'government' })).toBe('us government policy');
  });

  it('does not expand partial matches', () => {
    expect(expandAbbreviations('govts', { govt: 'government' })).toBe('govts');
  });

  it('returns input unchanged with empty table', () => {
    expect(expandAbbreviations('hello world', {})).toBe('hello world');
  });

  it('expands multiple abbreviations in one pass', () => {
    expect(expandAbbreviations('dept of govt', { dept: 'department', govt: 'government' }))
      .toBe('department of government');
  });
});

// ─────────────────────────────────────────────────────────
// Full pipeline: simplify()
// ─────────────────────────────────────────────────────────
describe('simplify — full pipeline', () => {
  // --- Roadmap acceptance criteria ---

  it('"  A Dog  " → "dog"', () => {
    const { canonicalLabel } = simplify('  A Dog  ');
    expect(canonicalLabel).toBe('dog');
  });

  it('"The   golden   retriever" → "golden retriever"', () => {
    const { canonicalLabel } = simplify('The   golden   retriever');
    expect(canonicalLabel).toBe('golden retriever');
  });

  it('"An Apple" → "apple"', () => {
    const { canonicalLabel } = simplify('An Apple');
    expect(canonicalLabel).toBe('apple');
  });

  it('"CAFÉ" → "café"', () => {
    const { canonicalLabel } = simplify('CAFÉ');
    expect(canonicalLabel).toBe('café');
  });

  it('"ﬁnance" → "finance" (NFKC fi ligature)', () => {
    const { canonicalLabel } = simplify('\uFB01nance');
    expect(canonicalLabel).toBe('finance');
  });

  it('"ＡＢＣ" → "abc" (NFKC fullwidth + case fold)', () => {
    const { canonicalLabel } = simplify('\uFF21\uFF22\uFF23');
    expect(canonicalLabel).toBe('abc');
  });

  it('empty string → empty string', () => {
    const { canonicalLabel } = simplify('');
    expect(canonicalLabel).toBe('');
  });

  it('abbreviation expansion', () => {
    const { canonicalLabel } = simplify('govt', { abbreviationTable: { govt: 'government' } });
    expect(canonicalLabel).toBe('government');
  });

  it('language tag attached', () => {
    const result = simplify('dog', { locale: 'en' });
    expect(result.languageTag).toBe('en');
  });

  it('custom locale tag', () => {
    const result = simplify('hund', { locale: 'de' });
    expect(result.languageTag).toBe('de');
  });

  // --- Protected proper nouns ---

  it('"The Hague" → "the hague" (protected)', () => {
    const { canonicalLabel } = simplify('The Hague', { protectedProperNouns });
    expect(canonicalLabel).toBe('the hague');
  });

  it('"The Bronx" → "the bronx" (protected)', () => {
    const { canonicalLabel } = simplify('The Bronx', { protectedProperNouns });
    expect(canonicalLabel).toBe('the bronx');
  });

  it('"The Beatles" → "the beatles" (protected)', () => {
    const { canonicalLabel } = simplify('The Beatles', { protectedProperNouns });
    expect(canonicalLabel).toBe('the beatles');
  });

  it('"The dog" → "dog" (not protected)', () => {
    const { canonicalLabel } = simplify('The dog', { protectedProperNouns });
    expect(canonicalLabel).toBe('dog');
  });

  // --- Determinism ---

  it('is deterministic across repeated calls', () => {
    const input = '  The   Golden   Retriever  ';
    const a = simplify(input);
    const b = simplify(input);
    const c = simplify(input);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  // --- Edge cases ---

  it('handles single word without articles', () => {
    const { canonicalLabel } = simplify('Dog');
    expect(canonicalLabel).toBe('dog');
  });

  it('handles already-canonical input', () => {
    const { canonicalLabel } = simplify('dog');
    expect(canonicalLabel).toBe('dog');
  });

  it('handles whitespace-only input', () => {
    const { canonicalLabel } = simplify('   ');
    expect(canonicalLabel).toBe('');
  });

  it('preserves non-English text with CJK locale', () => {
    const { canonicalLabel, languageTag } = simplify('测试概念', { locale: 'zh' });
    expect(canonicalLabel).toBe('测试概念');
    expect(languageTag).toBe('zh');
  });

  it('handles multi-abbreviation phrase', () => {
    const { canonicalLabel } = simplify('The dept of govt', {
      abbreviationTable: { dept: 'department', govt: 'government' },
    });
    expect(canonicalLabel).toBe('department of government');
  });

  it('strips article before abbreviation expansion', () => {
    const { canonicalLabel } = simplify('A govt', {
      abbreviationTable: { govt: 'government' },
    });
    expect(canonicalLabel).toBe('government');
  });
});
