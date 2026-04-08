import { describe, it, expect } from '@jest/globals';
import {
  simplify,
  trimWhitespace,
  collapseWhitespace,
  removeLeadingArticles,
  applyNFKC,
  caseFold,
  singularize,
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
// Step 5.5: Noun singularization
// ─────────────────────────────────────────────────────────
describe('Step 5.5: singularize', () => {
  // ── Regular -s plurals ──
  it('strips -s: "dogs" → "dog"', () => {
    expect(singularize('dogs', 'en')).toBe('dog');
  });

  it('strips -s: "cats" → "cat"', () => {
    expect(singularize('cats', 'en')).toBe('cat');
  });

  it('strips -s: "animals" → "animal"', () => {
    expect(singularize('animals', 'en')).toBe('animal');
  });

  // ── -ies → -y ──
  it('converts -ies to -y: "puppies" → "puppy"', () => {
    expect(singularize('puppies', 'en')).toBe('puppy');
  });

  it('converts -ies to -y: "cities" → "city"', () => {
    expect(singularize('cities', 'en')).toBe('city');
  });

  // ── -ves → -f ──
  it('converts -ves to -f: "wolves" → "wolf"', () => {
    expect(singularize('wolves', 'en')).toBe('wolf');
  });

  it('converts -ves to -f: "halves" → "half"', () => {
    expect(singularize('halves', 'en')).toBe('half');
  });

  it('converts -ves to -f: "leaves" → "leaf"', () => {
    expect(singularize('leaves', 'en')).toBe('leaf');
  });

  // ── -ves → -fe (irregular lookup) ──
  it('converts -ves to -fe: "knives" → "knife"', () => {
    expect(singularize('knives', 'en')).toBe('knife');
  });

  it('converts -ves to -fe: "lives" → "life"', () => {
    expect(singularize('lives', 'en')).toBe('life');
  });

  it('converts -ves to -fe: "wives" → "wife"', () => {
    expect(singularize('wives', 'en')).toBe('wife');
  });

  // ── -es after sibilants ──
  it('strips -es: "boxes" → "box"', () => {
    expect(singularize('boxes', 'en')).toBe('box');
  });

  it('strips -es: "churches" → "church"', () => {
    expect(singularize('churches', 'en')).toBe('church');
  });

  it('strips -es: "bushes" → "bush"', () => {
    expect(singularize('bushes', 'en')).toBe('bush');
  });

  it('strips -es: "fizzes" → "fizz"', () => {
    expect(singularize('fizzes', 'en')).toBe('fizz');
  });

  // ── -sses ──
  it('strips -es from -sses: "classes" → "class"', () => {
    expect(singularize('classes', 'en')).toBe('class');
  });

  // ── -ses (generic) ──
  it('strips -s from -ses: "cases" → "case"', () => {
    expect(singularize('cases', 'en')).toBe('case');
  });

  it('strips -s from -ses: "horses" → "horse"', () => {
    expect(singularize('horses', 'en')).toBe('horse');
  });

  // ── Latin/Greek -ses → -sis (irregular lookup) ──
  it('handles -ses → -sis: "analyses" → "analysis"', () => {
    expect(singularize('analyses', 'en')).toBe('analysis');
  });

  it('handles -ses → -sis: "theses" → "thesis"', () => {
    expect(singularize('theses', 'en')).toBe('thesis');
  });

  it('handles -ses → -sis: "diagnoses" → "diagnosis"', () => {
    expect(singularize('diagnoses', 'en')).toBe('diagnosis');
  });

  it('handles -ses → -sis: "hypotheses" → "hypothesis"', () => {
    expect(singularize('hypotheses', 'en')).toBe('hypothesis');
  });

  it('handles -ses → -sis: "crises" → "crisis"', () => {
    expect(singularize('crises', 'en')).toBe('crisis');
  });

  it('handles -ses → -sis: "syntheses" → "synthesis"', () => {
    expect(singularize('syntheses', 'en')).toBe('synthesis');
  });

  // ── Standard irregulars ──
  it('handles irregular: "children" → "child"', () => {
    expect(singularize('children', 'en')).toBe('child');
  });

  it('handles irregular: "mice" → "mouse"', () => {
    expect(singularize('mice', 'en')).toBe('mouse');
  });

  it('handles irregular: "people" → "person"', () => {
    expect(singularize('people', 'en')).toBe('person');
  });

  it('handles irregular: "teeth" → "tooth"', () => {
    expect(singularize('teeth', 'en')).toBe('tooth');
  });

  it('handles irregular: "feet" → "foot"', () => {
    expect(singularize('feet', 'en')).toBe('foot');
  });

  it('handles irregular: "geese" → "goose"', () => {
    expect(singularize('geese', 'en')).toBe('goose');
  });

  // ── Latin/Greek -i and -a plurals ──
  it('handles -i plural: "cacti" → "cactus"', () => {
    expect(singularize('cacti', 'en')).toBe('cactus');
  });

  it('handles -a plural: "phenomena" → "phenomenon"', () => {
    expect(singularize('phenomena', 'en')).toBe('phenomenon');
  });

  it('handles -a plural: "criteria" → "criterion"', () => {
    expect(singularize('criteria', 'en')).toBe('criterion');
  });

  // ── Irregular plurals of no-strip words ──
  it('handles irregular: "buses" → "bus"', () => {
    expect(singularize('buses', 'en')).toBe('bus');
  });

  it('handles irregular: "gases" → "gas"', () => {
    expect(singularize('gases', 'en')).toBe('gas');
  });

  // ── No-strip words (should NOT be modified) ──
  it('does not strip: "bus"', () => {
    expect(singularize('bus', 'en')).toBe('bus');
  });

  it('does not strip: "news"', () => {
    expect(singularize('news', 'en')).toBe('news');
  });

  it('does not strip: "series"', () => {
    expect(singularize('series', 'en')).toBe('series');
  });

  it('does not strip: "species"', () => {
    expect(singularize('species', 'en')).toBe('species');
  });

  it('does not strip: "virus"', () => {
    expect(singularize('virus', 'en')).toBe('virus');
  });

  it('does not strip: "status"', () => {
    expect(singularize('status', 'en')).toBe('status');
  });

  it('does not strip: "analysis" (singular -sis word)', () => {
    expect(singularize('analysis', 'en')).toBe('analysis');
  });

  it('does not strip: "thesis" (singular -sis word)', () => {
    expect(singularize('thesis', 'en')).toBe('thesis');
  });

  it('does not strip: "chaos"', () => {
    expect(singularize('chaos', 'en')).toBe('chaos');
  });

  it('does not strip: "rhinoceros"', () => {
    expect(singularize('rhinoceros', 'en')).toBe('rhinoceros');
  });

  it('does not strip: "corpus"', () => {
    expect(singularize('corpus', 'en')).toBe('corpus');
  });

  // ── Idempotency: -ss endings (Amendment 3) ──
  it('idempotent: "class" → "class" (-ss guard)', () => {
    expect(singularize('class', 'en')).toBe('class');
  });

  it('idempotent: "boss" → "boss" (-ss guard)', () => {
    expect(singularize('boss', 'en')).toBe('boss');
  });

  it('idempotent: "moss" → "moss" (-ss guard)', () => {
    expect(singularize('moss', 'en')).toBe('moss');
  });

  it('idempotent: "glass" → "glass" (-ss guard)', () => {
    expect(singularize('glass', 'en')).toBe('glass');
  });

  it('idempotent: "grass" → "grass" (-ss guard)', () => {
    expect(singularize('grass', 'en')).toBe('grass');
  });

  // ── Already singular ──
  it('passes singular through: "dog"', () => {
    expect(singularize('dog', 'en')).toBe('dog');
  });

  it('passes singular through: "animal"', () => {
    expect(singularize('animal', 'en')).toBe('animal');
  });

  // ── Short words (≤3 chars, minimum length guard) ──
  it('does not strip from short words: "gas" (≤3)', () => {
    expect(singularize('gas', 'en')).toBe('gas');
  });

  it('does not strip from short words: "bus" (≤3)', () => {
    expect(singularize('bus', 'en')).toBe('bus');
  });

  it('does not strip from short words: "is" (≤3)', () => {
    expect(singularize('is', 'en')).toBe('is');
  });

  // ── Non-English locale: no-op ──
  it('is a no-op for Chinese locale', () => {
    expect(singularize('dogs', 'zh')).toBe('dogs');
  });

  it('is a no-op for German locale', () => {
    expect(singularize('dogs', 'de')).toBe('dogs');
  });

  // ── Multi-word phrases bypass singularization (heuristic matrix #3) ──
  // Multi-word labels are noun phrases where per-word stripping causes silent
  // corruption (e.g., "filamentous biomaterial" → "filamentou biomaterial").
  // Singularization is only applied to single-word inputs.
  it('preserves multi-word phrases verbatim: "filamentous biomaterial"', () => {
    expect(singularize('filamentous biomaterial', 'en')).toBe('filamentous biomaterial');
  });

  it('preserves multi-word phrases verbatim: "pilus capitis"', () => {
    expect(singularize('pilus capitis', 'en')).toBe('pilus capitis');
  });

  it('preserves multi-word phrases verbatim: "material entity"', () => {
    expect(singularize('material entity', 'en')).toBe('material entity');
  });

  it('preserves multi-word phrases even when last word is plural: "golden retrievers"', () => {
    // Pre-fix this returned "golden retriever". Now multi-word phrases pass
    // through unchanged. The user is responsible for the form they assert.
    expect(singularize('golden retrievers', 'en')).toBe('golden retrievers');
  });

  it('preserves multi-word phrases even when last word is plural: "wild wolves"', () => {
    expect(singularize('wild wolves', 'en')).toBe('wild wolves');
  });

  // ── Double singularization idempotency ──
  it('is idempotent: singularize(singularize(x)) === singularize(x)', () => {
    const words = ['dogs', 'puppies', 'wolves', 'knives', 'churches', 'classes', 'children', 'analyses', 'cases'];
    for (const word of words) {
      const once = singularize(word, 'en');
      const twice = singularize(once, 'en');
      expect(twice).toBe(once);
    }
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

  // --- Plural normalization (Step 5.5) ---

  it('"Dogs" → "dog" (case fold + singularize)', () => {
    const { canonicalLabel } = simplify('Dogs');
    expect(canonicalLabel).toBe('dog');
  });

  it('"The puppies" → "puppy" (article + singularize)', () => {
    const { canonicalLabel } = simplify('The puppies');
    expect(canonicalLabel).toBe('puppy');
  });

  it('"animals" → "animal"', () => {
    const { canonicalLabel } = simplify('animals');
    expect(canonicalLabel).toBe('animal');
  });

  it('"Golden Retrievers" → "golden retrievers" (multi-word bypass per heuristic matrix #3)', () => {
    const { canonicalLabel } = simplify('Golden Retrievers');
    expect(canonicalLabel).toBe('golden retrievers');
  });

  it('"CHILDREN" → "child" (case fold + irregular)', () => {
    const { canonicalLabel } = simplify('CHILDREN');
    expect(canonicalLabel).toBe('child');
  });

  it('"analyses" → "analysis" (Latin/Greek -ses → -sis)', () => {
    const { canonicalLabel } = simplify('analyses');
    expect(canonicalLabel).toBe('analysis');
  });

  it('singularize skipped for protected proper nouns', () => {
    const { canonicalLabel } = simplify('The Beatles', { protectedProperNouns });
    expect(canonicalLabel).toBe('the beatles');
  });

  it('"dog" and "Dogs" produce the same canonical label', () => {
    const a = simplify('dog');
    const b = simplify('Dogs');
    expect(a.canonicalLabel).toBe(b.canonicalLabel);
  });
});
