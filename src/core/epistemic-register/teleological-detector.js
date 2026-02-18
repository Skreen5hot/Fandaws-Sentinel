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

/**
 * Detect teleological signals in an utterance.
 *
 * Pure function: deterministic, no state, no I/O.
 *
 * @param {string} utterance - Raw user input
 * @returns {{ detected: boolean, keywords: string[] }}
 *   detected = true if any keyword found; keywords = matched keywords
 */
export function detectTeleological(utterance) {
  if (!utterance || typeof utterance !== 'string') {
    return { detected: false, keywords: [] };
  }

  const lower = utterance.toLowerCase();
  const found = TELEOLOGICAL_KEYWORDS.filter((kw) => lower.includes(kw));

  return { detected: found.length > 0, keywords: found };
}
