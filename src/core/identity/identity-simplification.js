/**
 * Identity Simplification — the 7-step deterministic normalization pipeline.
 *
 * Produces a canonicalLabel from raw input for matching and deduplication.
 * Every concept has two labels:
 *   - displayLabel: original input as typed (preserved for humans)
 *   - canonicalLabel: output of this pipeline (used for ALL matching)
 *
 * Two concepts match iff their canonicalLabels are identical.
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
 * Run the full 7-step Identity Simplification pipeline.
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

  // Step 6: Abbreviation expansion
  result = expandAbbreviations(result, abbreviationTable);

  // Step 7: Attach language tag
  return {
    canonicalLabel: result,
    languageTag: locale,
  };
}
