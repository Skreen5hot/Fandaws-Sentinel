/**
 * NLParser — grammar-based natural language parser.
 *
 * Parses user utterances into structured semantic frames using regex extraction.
 * No LLMs. No probabilistic inference. Deterministic.
 *
 * Pipeline: validateInput → normalizeInput → matchClassification / matchProperty /
 *           matchCustomRelationship → ParseResult
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.1, 5.2.1, 5.3.1, 5.4.1
 */

import { createParseResult } from '../../types/parse-result.js';

// ─────────────────────────────────────────────────────────
// Step 1: Input Validation
// ─────────────────────────────────────────────────────────

/**
 * Validate that input text is parseable.
 *
 * @param {*} text - Raw input to validate
 * @returns {{ valid: boolean, errorReason: string|null }}
 */
export function validateInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { valid: false, errorReason: 'empty-input' };
  }
  if (!text.trim().includes(' ')) {
    return { valid: false, errorReason: 'no-predicate' };
  }
  return { valid: true, errorReason: null };
}

// ─────────────────────────────────────────────────────────
// Step 2: Input Normalization
// ─────────────────────────────────────────────────────────

/**
 * Normalize input text: trim and collapse internal whitespace.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeInput(text) {
  return text.trim().replace(/\s+/g, ' ');
}

// ─────────────────────────────────────────────────────────
// Step 3: Article Stripping
// ─────────────────────────────────────────────────────────

/**
 * Strip a leading article ("a", "an", "the") from an extracted term.
 *
 * @param {string} term
 * @returns {string}
 */
export function stripArticle(term) {
  return term.replace(/^(a|an|the)\s+/i, '').trim();
}

// ─────────────────────────────────────────────────────────
// Step 4: Classification Pattern Matching
// ─────────────────────────────────────────────────────────

/**
 * Attempt to match classification patterns: "X is a/an Y", "X are Y", "X is Y".
 * Tried in specificity order: "is a/an" → "are" → bare "is".
 *
 * @param {string} text - Normalized input
 * @returns {{ matched: boolean, subject?: string, predicate?: string, object?: string }}
 */
export function matchClassification(text) {
  // "is a/an type/kind of" (most specific — must precede "is a/an")
  let match = text.match(/^(.+?)\s+is\s+(?:a|an)\s+(?:type|kind)\s+of\s+(.+)$/i);
  if (match) {
    return {
      matched: true,
      subject: stripArticle(match[1].trim()),
      predicate: 'is a',
      object: stripArticle(match[2].trim()),
    };
  }

  // "is a/an" (most specific after type/kind)
  match = text.match(/^(.+?)\s+is\s+(?:a|an)\s+(.+)$/i);
  if (match) {
    return {
      matched: true,
      subject: stripArticle(match[1].trim()),
      predicate: 'is a',
      object: stripArticle(match[2].trim()),
    };
  }

  // "are" (plural)
  match = text.match(/^(.+?)\s+are\s+(.+)$/i);
  if (match) {
    return {
      matched: true,
      subject: stripArticle(match[1].trim()),
      predicate: 'are',
      object: stripArticle(match[2].trim()),
    };
  }

  // Bare "is" (no article after)
  match = text.match(/^(.+?)\s+is\s+(.+)$/i);
  if (match) {
    return {
      matched: true,
      subject: stripArticle(match[1].trim()),
      predicate: 'is',
      object: stripArticle(match[2].trim()),
    };
  }

  return { matched: false };
}

// ─────────────────────────────────────────────────────────
// Step 5: Property Pattern Matching
// ─────────────────────────────────────────────────────────

/**
 * Attempt to match property patterns: "X has a/an Y", "X has Y", "X have Y".
 *
 * @param {string} text - Normalized input
 * @returns {{ matched: boolean, subject?: string, predicate?: string, object?: string }}
 */
export function matchProperty(text) {
  // "has a/an" (most specific)
  let match = text.match(/^(.+?)\s+has\s+(?:a|an)\s+(.+)$/i);
  if (match) {
    return {
      matched: true,
      subject: stripArticle(match[1].trim()),
      predicate: 'has',
      object: stripArticle(match[2].trim()),
    };
  }

  // Bare "has"
  match = text.match(/^(.+?)\s+has\s+(.+)$/i);
  if (match) {
    return {
      matched: true,
      subject: stripArticle(match[1].trim()),
      predicate: 'has',
      object: stripArticle(match[2].trim()),
    };
  }

  // "have" (plural)
  match = text.match(/^(.+?)\s+have\s+(.+)$/i);
  if (match) {
    return {
      matched: true,
      subject: stripArticle(match[1].trim()),
      predicate: 'have',
      object: stripArticle(match[2].trim()),
    };
  }

  return { matched: false };
}

// ─────────────────────────────────────────────────────────
// Step 6: Custom Relationship Pattern Matching
// ─────────────────────────────────────────────────────────

/**
 * Fallback matcher for custom relationships: "X [verb] Y".
 * Strips leading article, then takes first word as subject,
 * second word as verb, remainder as object.
 *
 * @param {string} text - Normalized input
 * @returns {{ matched: boolean, subject?: string, verb?: string, object?: string }}
 */
export function matchCustomRelationship(text) {
  const stripped = text.replace(/^(a|an|the)\s+/i, '');
  // subject (single word) + verb (single word) + object (rest)
  const match = stripped.match(/^(\S+)\s+(\S+)\s+(.+)$/i);
  if (!match) return { matched: false };

  return {
    matched: true,
    subject: match[1].trim(),
    verb: match[2].trim(),
    object: stripArticle(match[3].trim()),
  };
}

// ─────────────────────────────────────────────────────────
// Pipeline Orchestrator
// ─────────────────────────────────────────────────────────

/**
 * Parse a natural language utterance into a structured semantic frame.
 *
 * @param {string} text - Raw utterance text
 * @param {object} [context] - Optional conversation context (reserved for future use)
 * @returns {object} JSON-LD ParseResult node
 * @see Fandaws_v3.3_Specification.md Section 3.2.1
 */
export function parse(text, context = {}) {
  // Step 1: Validate
  const validation = validateInput(text);
  if (!validation.valid) {
    return createParseResult({
      error: true,
      errorReason: validation.errorReason,
      confidence: 0,
    });
  }

  // Step 2: Normalize
  const normalized = normalizeInput(text);

  // Step 3: Try classification patterns
  const classification = matchClassification(normalized);
  if (classification.matched) {
    return createParseResult({
      subject: classification.subject,
      predicate: classification.predicate,
      object: classification.object,
      verbType: 'classification',
      confidence: 1.0,
    });
  }

  // Step 4: Try property patterns
  const property = matchProperty(normalized);
  if (property.matched) {
    return createParseResult({
      subject: property.subject,
      predicate: property.predicate,
      object: property.object,
      verbType: 'property',
      confidence: 1.0,
    });
  }

  // Step 5: Try custom relationship (fallback)
  const relationship = matchCustomRelationship(normalized);
  if (relationship.matched) {
    return createParseResult({
      subject: relationship.subject,
      predicate: relationship.verb,
      object: relationship.object,
      verbType: 'customRelationship',
      confidence: 1.0,
    });
  }

  // No pattern matched
  return createParseResult({
    error: true,
    errorReason: 'incomplete-utterance',
    confidence: 0,
  });
}
