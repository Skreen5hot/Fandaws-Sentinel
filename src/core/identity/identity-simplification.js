/**
 * Identity Simplification — the 8-step deterministic normalization pipeline.
 *
 * Produces a canonicalLabel from raw input for matching and deduplication.
 * Every concept has two labels:
 *   - displayLabel: original input as typed (preserved for humans)
 *   - canonicalLabel: output of this pipeline (used for ALL matching)
 *
 * Two concepts match iff their canonicalLabels are identical.
 *
 * Steps:
 *  1. Trim whitespace
 *  2. Collapse internal whitespace
 *  3. Remove leading articles (respecting protected proper nouns)
 *  4. Unicode NFKC normalization
 *  5. Locale-aware case folding
 *  5.5. Noun singularization (English only, deterministic rule-based)
 *  6. Abbreviation expansion
 *  7. Attach language tag
 *
 * @see Fandaws_v3.3_Specification.md Section 6.6
 */

/** @type {Record<string, string[]>} Default articles per locale */
const DEFAULT_ARTICLES = {
  en: ['a', 'an', 'the'],
};

/**
 * Step 1: Trim leading and trailing whitespace.
 * @param {string} str
 * @returns {string}
 */
export function trimWhitespace(str) {
  return str.trim();
}

/**
 * Step 2: Collapse internal whitespace sequences to a single space.
 * @param {string} str
 * @returns {string}
 */
export function collapseWhitespace(str) {
  return str.replace(/\s+/g, ' ');
}

/**
 * Step 3: Remove leading articles for the configured locale.
 * Skips removal if the full phrase (case-insensitive) matches a protected proper noun.
 *
 * @param {string} str
 * @param {object} options
 * @param {string[]} options.articles - Locale articles to strip (e.g., ["a", "an", "the"])
 * @param {string[]} options.protectedProperNouns - Phrases where the article is part of the name
 * @returns {string}
 */
export function removeLeadingArticles(str, { articles, protectedProperNouns }) {
  if (str === '') return str;

  const lower = str.toLowerCase();

  // Check if the full phrase is a protected proper noun — if so, skip stripping
  for (const noun of protectedProperNouns) {
    if (lower === noun) {
      return str;
    }
  }

  // Try to strip each article (longest first to avoid partial matches)
  const sorted = [...articles].sort((a, b) => b.length - a.length);
  for (const article of sorted) {
    const prefix = article + ' ';
    if (lower.startsWith(prefix)) {
      return str.slice(prefix.length);
    }
  }

  return str;
}

/**
 * Step 4: Apply Unicode NFKC normalization.
 * Resolves compatibility equivalences: ligatures (ﬁ→fi), fullwidth (Ａ→A), etc.
 *
 * @param {string} str
 * @returns {string}
 */
export function applyNFKC(str) {
  return str.normalize('NFKC');
}

/**
 * Step 5: Apply locale-aware case folding.
 * - English: standard toLowerCase()
 * - Turkish: handles dotted/dotless I correctly
 * - CJK, Arabic, Hebrew: no-op (no case concept)
 *
 * @param {string} str
 * @param {string} locale - BCP 47 language tag
 * @returns {string}
 */
export function caseFold(str, locale) {
  // Languages with no case concept — return as-is
  const noCaseLocales = ['zh', 'ja', 'ko', 'ar', 'he'];
  const baseLang = locale.split('-')[0];

  if (noCaseLocales.includes(baseLang)) {
    return str;
  }

  // Use toLocaleLowerCase for locale-aware folding (handles Turkish İ/ı correctly)
  return str.toLocaleLowerCase(locale);
}

// ─────────────────────────────────────────────────────────
// Step 5.5: Noun Singularization
// ─────────────────────────────────────────────────────────

/**
 * Irregular noun lookup table (plural → singular).
 * Includes standard irregulars, Latin/Greek -a/-i/-ses plurals,
 * -ves → -fe exceptions, and irregular plurals of no-strip words.
 */
const IRREGULAR_NOUNS = new Map([
  // Standard irregulars
  ['children', 'child'],
  ['mice', 'mouse'],
  ['men', 'man'],
  ['women', 'woman'],
  ['teeth', 'tooth'],
  ['feet', 'foot'],
  ['geese', 'goose'],
  ['oxen', 'ox'],
  ['dice', 'die'],
  ['lice', 'louse'],
  ['people', 'person'],
  // Latin/Greek -a plurals
  ['phenomena', 'phenomenon'],
  ['criteria', 'criterion'],
  // Latin/Greek -i plurals
  ['cacti', 'cactus'],
  ['fungi', 'fungus'],
  ['nuclei', 'nucleus'],
  ['radii', 'radius'],
  ['stimuli', 'stimulus'],
  ['syllabi', 'syllabus'],
  ['alumni', 'alumnus'],
  // Latin/Greek -ses → -sis (Amendment 1: explicit lookup prevents
  // the generic -ses rule from producing "analyse", "these", etc.)
  ['analyses', 'analysis'],
  ['diagnoses', 'diagnosis'],
  ['theses', 'thesis'],
  ['crises', 'crisis'],
  ['hypotheses', 'hypothesis'],
  ['syntheses', 'synthesis'],
  ['parentheses', 'parenthesis'],
  ['synopses', 'synopsis'],
  ['nemeses', 'nemesis'],
  ['oases', 'oasis'],
  ['ellipses', 'ellipsis'],
  // -ves → -fe (Amendment 2: closed set of 3)
  ['knives', 'knife'],
  ['lives', 'life'],
  ['wives', 'wife'],
  // Irregular plurals of no-strip words
  ['buses', 'bus'],
  ['gases', 'gas'],
  ['lenses', 'lens'],
  ['atlases', 'atlas'],
]);

/**
 * Words ending in -s that are NOT plural — do not strip.
 * Includes Latin/Greek -us nouns, -sis nouns, invariant forms,
 * and uncountable nouns ending in -s.
 */
const NO_STRIP_SET = new Set([
  // Common -s words that aren't plural
  'bus', 'gas', 'lens', 'atlas', 'canvas', 'alias',
  // Latin/Greek -us nouns (singular)
  'campus', 'bonus', 'focus', 'virus', 'status', 'apparatus',
  'cactus', 'fungus', 'genius', 'nucleus', 'radius',
  'stimulus', 'syllabus', 'corpus', 'census', 'circus',
  'consensus', 'cosmos', 'exodus', 'fetus', 'nexus',
  'octopus', 'opus', 'plus', 'surplus',
  'chaos', 'rhinoceros', 'hippopotamus', 'platypus', 'walrus',
  // Latin/Greek -sis nouns (singular — prevents "analysis" → "analysi")
  'analysis', 'basis', 'crisis', 'diagnosis', 'thesis',
  'hypothesis', 'synthesis', 'parenthesis', 'synopsis',
  'nemesis', 'oasis', 'ellipsis',
  // Invariant (same singular and plural)
  'series', 'species',
  // Uncountable nouns ending in -s
  'news', 'physics', 'mathematics', 'economics', 'politics',
  'ethics', 'linguistics', 'genetics', 'electronics',
]);

/**
 * Step 5.5: Singularize a noun using deterministic rule-based stripping.
 * Applied per-word to multi-word phrases. English only.
 *
 * Rules (applied in order per word):
 * 1. Skip if word ≤ 3 chars
 * 2. Irregular lookup table
 * 3. No-strip exception set
 * 4. -ies → -y (preceded by consonant)
 * 5. -ves → -f (after -fe exceptions handled by irregular lookup)
 * 6. -sses → strip -es
 * 7. -ches, -shes → strip -es
 * 8. -xes, -zes → strip -es
 * 9. -ses → strip -s (cases→case; Latin/Greek handled by irregular lookup)
 * 10. General -s → strip (not -ss endings)
 *
 * @param {string} str - Lowercased input (after case folding)
 * @param {string} locale - BCP 47 language tag
 * @returns {string}
 */
export function singularize(str, locale) {
  const baseLang = locale.split('-')[0];
  if (baseLang !== 'en') return str;

  return str.split(' ').map(singularizeWord).join(' ');
}

/**
 * Singularize a single word.
 * @param {string} word
 * @returns {string}
 */
function singularizeWord(word) {
  // Rule 1: minimum length guard
  if (!word || word.length <= 3) return word;

  // Rule 2: irregular lookup
  if (IRREGULAR_NOUNS.has(word)) {
    return IRREGULAR_NOUNS.get(word);
  }

  // Rule 3: no-strip exception
  if (NO_STRIP_SET.has(word)) return word;

  // Rule 4: -ies → -y (preceded by consonant: puppies→puppy)
  if (word.endsWith('ies') && word.length > 4) {
    const beforeIes = word[word.length - 4];
    if (!'aeiou'.includes(beforeIes)) {
      return word.slice(0, -3) + 'y';
    }
  }

  // Rule 5: -ves → -f (wolves→wolf, halves→half)
  // Note: -ves → -fe cases (knives, lives, wives) handled by irregular lookup
  if (word.endsWith('ves') && word.length > 4) {
    return word.slice(0, -3) + 'f';
  }

  // Rule 6: -sses → strip -es (classes→class)
  if (word.endsWith('sses')) {
    return word.slice(0, -2);
  }

  // Rule 7: -ches, -shes → strip -es
  if (word.endsWith('ches') || word.endsWith('shes')) {
    return word.slice(0, -2);
  }

  // Rule 8: -xes, -zes → strip -es
  if (word.endsWith('xes') || word.endsWith('zes')) {
    return word.slice(0, -2);
  }

  // Rule 9: -ses → strip -s (cases→case, horses→horse)
  // Latin/Greek -ses→-sis (analyses, theses) handled by irregular lookup
  if (word.endsWith('ses') && word.length > 4) {
    return word.slice(0, -1);
  }

  // Rule 10: general -s → strip (not -ss endings)
  // Skip words ending in -us (covers adjectives like filamentous, continuous,
  // ambiguous, autonomous AND Latin nouns like campus, virus, status that
  // form their plural with -uses, not by stripping -s). English has no
  // singular noun whose plural is formed by appending -s to a -u stem.
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Step 6: Apply domain-specific abbreviation expansion.
 * Whole-word replacement only — "govt" → "government" but "govts" is not matched.
 *
 * @param {string} str
 * @param {Record<string, string>} abbreviationTable
 * @returns {string}
 */
export function expandAbbreviations(str, abbreviationTable) {
  const entries = Object.entries(abbreviationTable);
  if (entries.length === 0) return str;

  const words = str.split(' ');
  const expanded = words.map((word) => {
    const replacement = abbreviationTable[word];
    return replacement !== undefined ? replacement : word;
  });
  return expanded.join(' ');
}

/**
 * Run the full 8-step Identity Simplification pipeline.
 *
 * @param {string} input - Raw term to normalize
 * @param {object} [options]
 * @param {string} [options.locale='en'] - BCP 47 language tag
 * @param {Record<string, string>} [options.abbreviationTable={}] - Domain abbreviation expansions
 * @param {string[]} [options.protectedProperNouns=[]] - Phrases where leading article is part of the name
 * @param {string[]} [options.articles] - Override articles for locale (defaults per locale)
 * @returns {{ canonicalLabel: string, languageTag: string }}
 */
export function simplify(input, options = {}) {
  const {
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
    articles = DEFAULT_ARTICLES[locale] || [],
  } = options;

  if (input === '') {
    return { canonicalLabel: '', languageTag: locale };
  }

  let result = input;

  // Step 1: Trim
  result = trimWhitespace(result);

  // Step 2: Collapse whitespace
  result = collapseWhitespace(result);

  // Step 3: Remove leading articles (respecting protected proper nouns)
  result = removeLeadingArticles(result, { articles, protectedProperNouns });

  // Step 4: NFKC normalization
  result = applyNFKC(result);

  // Step 5: Locale-aware case folding
  result = caseFold(result, locale);

  // Step 5.5: Singularize (English only, skip for protected proper nouns)
  const isProtected = protectedProperNouns.length > 0
    && protectedProperNouns.some((noun) => result === noun.toLowerCase());
  if (!isProtected) {
    result = singularize(result, locale);
  }

  // Step 6: Abbreviation expansion
  result = expandAbbreviations(result, abbreviationTable);

  // Step 7: Attach language tag
  return {
    canonicalLabel: result,
    languageTag: locale,
  };
}
