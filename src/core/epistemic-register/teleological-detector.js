/**
 * Teleological Detector — keyword-based detection of teleological signals.
 *
 * Detects utterances containing teleological language (purpose, duty, ought)
 * that may indicate aspirational claims. Flags only — never auto-routes to R3.
 *
 * @see docs/architecture/NAC_Developer_Guide_v1.2.md §7 Step 5
 */

const TELEOLOGICAL_KEYWORDS = [
  'should',
  'meant to',
  'purpose',
  'duty',
  'ought',
  'supposed to',
  'designed to',
  'intended to',
];

// Deontic subset — keywords indicating moral/ethical obligation
const DEONTIC_KEYWORDS = ['duty', 'ought'];

// Pre-compiled word-boundary regex for each keyword (prevents
// false positives like "shoulder" matching "should").
const KEYWORD_PATTERNS = TELEOLOGICAL_KEYWORDS.map(
  (kw) => ({ keyword: kw, regex: new RegExp(`\\b${kw}\\b`, 'i') }),
);

/**
 * Detect teleological signals in an utterance.
 *
 * Pure function: deterministic, no state, no I/O.
 *
 * @param {string} utterance - Raw user input
 * @returns {{ detected: boolean, keywords: string[], deontic: boolean }}
 *   detected = true if any keyword found; keywords = matched keywords;
 *   deontic = true if a deontic keyword (duty, ought) was found.
 */
export function detectTeleological(utterance) {
  if (!utterance || typeof utterance !== 'string') {
    return { detected: false, keywords: [], deontic: false };
  }

  const found = KEYWORD_PATTERNS
    .filter(({ regex }) => regex.test(utterance))
    .map(({ keyword }) => keyword);

  const deontic = found.some((kw) => DEONTIC_KEYWORDS.includes(kw));

  return { detected: found.length > 0, keywords: found, deontic };
}
