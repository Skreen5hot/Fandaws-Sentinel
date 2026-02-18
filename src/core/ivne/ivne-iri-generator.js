/**
 * IVNE IRI Generator — hash-based IRI generation for anonymous/generated concepts.
 *
 * Named OWL classes use the existing generateConceptIri() from iri-generator.js.
 * Anonymous concepts (from intersection/union flattening) have no natural label,
 * so we generate IRIs from a canonical string representation of the expression,
 * hashed via SHA-256 and truncated to a configurable prefix length.
 *
 * IRI scheme: fandaws:gen/{hash_prefix}
 *
 * The canonical expression format ensures determinism: same logical expression
 * (regardless of source ordering) always produces the same hash.
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 3.2
 */

import { sha256Hex } from './sha256.js';

// ── Expression Canonicalization ──

/**
 * Produce a canonical string representation of a complex OWL expression.
 *
 * The canonical form is: `{type}({operand1},{operand2},...)`
 * Operands are sorted lexicographically for order independence.
 *
 * Examples:
 *   - canonicalizeExpression('intersection', ['bfo:Entity', 'bfo:Continuant'])
 *     → "intersection(bfo:Continuant,bfo:Entity)"
 *   - canonicalizeExpression('union', ['bfo:Process', 'bfo:Continuant'])
 *     → "union(bfo:Continuant,bfo:Process)"
 *   - canonicalizeExpression('complement', ['bfo:Entity'])
 *     → "complement(bfo:Entity)"
 *   - canonicalizeExpression('restriction', ['bfo:part_of', 'bfo:Entity'])
 *     → "restriction(bfo:Entity,bfo:part_of)"
 *
 * @param {string} type - Expression type ('intersection', 'union', 'complement', 'restriction', 'enumeration')
 * @param {string[]} operands - IRI operands of the expression
 * @returns {string} Canonical expression string
 */
export function canonicalizeExpression(type, operands) {
  if (!type || typeof type !== 'string') {
    throw new Error('canonicalizeExpression requires a non-empty type string');
  }
  if (!Array.isArray(operands)) {
    throw new Error('canonicalizeExpression requires an operands array');
  }

  const sorted = [...operands].sort();
  return `${type}(${sorted.join(',')})`;
}

// ── Hash IRI Generation ──

/**
 * Generate a deterministic hash-based IRI for an anonymous/generated concept.
 *
 * The IRI is derived from the SHA-256 hash of the canonical expression string,
 * truncated to `config.hashPrefixLength` hex characters.
 *
 * @param {string} expression - Canonical expression string (from canonicalizeExpression)
 * @param {object} [config={}] - IVNE configuration
 * @param {number} [config.hashPrefixLength=12] - Number of hex chars for the hash prefix
 * @returns {string} Generated IRI (e.g., "fandaws:gen/a1b2c3d4e5f6")
 */
export function generateHashIri(expression, config = {}) {
  const { hashPrefixLength = 12 } = config;

  if (!expression || typeof expression !== 'string') {
    throw new Error('generateHashIri requires a non-empty expression string');
  }
  if (hashPrefixLength < 4 || hashPrefixLength > 64) {
    throw new Error(`hashPrefixLength must be between 4 and 64, got ${hashPrefixLength}`);
  }

  const fullHash = sha256Hex(expression);
  const prefix = fullHash.slice(0, hashPrefixLength);
  return `fandaws:gen/${prefix}`;
}

// ── Collision Detection ──

/**
 * Check whether a generated hash IRI collides with an existing one.
 *
 * A collision occurs when two different expressions produce the same
 * truncated hash. This is expected to be extremely rare at 12 hex chars
 * (48 bits → collision at ~16M concepts) but must be detected.
 *
 * @param {string} hashIri - The generated hash IRI to check
 * @param {Set<string>} existing - Set of all previously generated hash IRIs
 * @param {Map<string, string>} generatedFromMap - Map of hashIri → canonical expression
 * @param {string} expression - The canonical expression that produced this hashIri
 * @returns {{ collision: boolean, existingExpression: string|null }}
 */
export function checkCollision(hashIri, existing, generatedFromMap, expression) {
  if (!existing.has(hashIri)) {
    return { collision: false, existingExpression: null };
  }

  // Same IRI exists — check if it's from the same expression (not a collision)
  const existingExpression = generatedFromMap.get(hashIri);
  if (existingExpression === expression) {
    return { collision: false, existingExpression: null };
  }

  // Different expression → genuine collision
  return { collision: true, existingExpression };
}

// ── Convenience: Generate with Collision Check ──

/**
 * Generate a hash IRI and check for collisions in one step.
 *
 * If a collision is detected, appends a numeric suffix to the expression
 * and re-hashes until a unique IRI is found. This guarantees uniqueness
 * while remaining deterministic (same set of expressions → same resolution).
 *
 * @param {string} type - Expression type
 * @param {string[]} operands - Expression operands
 * @param {object} context - Generation context
 * @param {Set<string>} context.existing - Existing hash IRIs
 * @param {Map<string, string>} context.generatedFromMap - hashIri → expression map
 * @param {object} [context.config={}] - IVNE configuration
 * @returns {{ iri: string, expression: string, collision: boolean }}
 */
export function generateUniqueHashIri(type, operands, context) {
  const { existing, generatedFromMap, config = {} } = context;

  const expression = canonicalizeExpression(type, operands);
  let candidate = generateHashIri(expression, config);
  let check = checkCollision(candidate, existing, generatedFromMap, expression);

  if (!check.collision) {
    existing.add(candidate);
    generatedFromMap.set(candidate, expression);
    return { iri: candidate, expression, collision: false };
  }

  // Collision resolution: append suffix and re-hash
  let suffix = 1;
  while (check.collision) {
    const suffixedExpr = `${expression}#${suffix}`;
    candidate = generateHashIri(suffixedExpr, config);
    check = checkCollision(candidate, existing, generatedFromMap, suffixedExpr);
    suffix++;

    if (suffix > 100) {
      throw new Error(`Hash collision resolution exceeded 100 attempts for expression: ${expression}`);
    }
  }

  const resolvedExpression = `${expression}#${suffix - 1}`;
  existing.add(candidate);
  generatedFromMap.set(candidate, resolvedExpression);
  return { iri: candidate, expression: resolvedExpression, collision: true };
}
