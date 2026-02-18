/**
 * Normalizer (τ_N) — deterministic normalization for IVNE output.
 *
 * Guarantees byte-identical output across runs by enforcing:
 *   1. Deep sort of all arrays by @id or canonical key
 *   2. Timestamp normalization to a single run timestamp
 *   3. Quantifier normalization (someValuesFrom == minCardinality 1)
 *   4. Canonical JSON serialization (sorted keys, 2-space indent, LF)
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 8
 */

import { sha256Hex } from './sha256.js';

// ── Deep Sort ──

/**
 * Recursively sort all arrays and object keys in a JSON-LD structure.
 *
 * Arrays of objects are sorted by '@id' if present, then by
 * 'fandaws:sourceAxiom' as fallback (for loss records), then by
 * JSON serialization as last resort.
 *
 * Object keys are sorted lexicographically.
 *
 * @param {*} obj - Any JSON-serializable value
 * @returns {*} Sorted clone
 */
export function deepSort(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    const sorted = obj.map(deepSort);
    sorted.sort((a, b) => {
      // Sort by @id first
      const aId = a && typeof a === 'object' ? a['@id'] || '' : '';
      const bId = b && typeof b === 'object' ? b['@id'] || '' : '';
      if (aId !== bId) return aId < bId ? -1 : 1;

      // Fall back to sourceAxiom (for loss records)
      const aAxiom = a && typeof a === 'object' ? a['fandaws:sourceAxiom'] || '' : '';
      const bAxiom = b && typeof b === 'object' ? b['fandaws:sourceAxiom'] || '' : '';
      if (aAxiom !== bAxiom) return aAxiom < bAxiom ? -1 : 1;

      // Last resort: JSON serialization
      const aJson = JSON.stringify(a);
      const bJson = JSON.stringify(b);
      return aJson < bJson ? -1 : aJson > bJson ? 1 : 0;
    });
    return sorted;
  }

  // Object: sort keys lexicographically
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = deepSort(obj[key]);
  }
  return sorted;
}

// ── Timestamp Normalization ──

/**
 * Replace all timestamp fields with a single deterministic run timestamp.
 *
 * This ensures that the output is identical regardless of when each
 * individual concept was processed during the compilation run.
 *
 * @param {*} obj - Any JSON-serializable value
 * @param {string} runTimestamp - ISO 8601 timestamp for the entire run
 * @returns {*} Clone with normalized timestamps
 */
export function normalizeTimestamps(obj, runTimestamp) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeTimestamps(item, runTimestamp));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'fandaws:createdAt' || key === 'fandaws:compiledAt') {
      result[key] = runTimestamp;
    } else if (key === 'compilationDurationMs') {
      // Runtime measurement — normalize to 0 for deterministic output
      result[key] = 0;
    } else {
      result[key] = normalizeTimestamps(value, runTimestamp);
    }
  }
  return result;
}

// ── Quantifier Normalization ──

/**
 * Normalize equivalent quantifier forms to a single canonical representation.
 *
 * someValuesFrom and minCardinality 1 are semantically equivalent for
 * the Fandaws Fragment. Both are normalized to the P5 existential form.
 *
 * @param {*} obj - Any JSON-serializable value
 * @returns {*} Clone with normalized quantifiers
 */
export function normalizeQuantifiers(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(normalizeQuantifiers);
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'fandaws:quantifier') {
      // Normalize 'someValuesFrom' and 'existential' to 'existential'
      if (value === 'someValuesFrom' || value === 'minCardinality1') {
        result[key] = 'existential';
      } else {
        result[key] = value;
      }
    } else {
      result[key] = normalizeQuantifiers(value);
    }
  }
  return result;
}

// ── Canonical Serialization ──

/**
 * Produce a canonical JSON string from a value.
 *
 * Uses 2-space indentation and sorted keys (via deepSort).
 * The output is deterministic and suitable for hashing.
 *
 * @param {*} obj - Any JSON-serializable value (should already be deepSorted)
 * @returns {string} Canonical JSON string with 2-space indent and LF line endings
 */
export function canonicalSerialize(obj) {
  return JSON.stringify(obj, null, 2);
}

// ── Composite Normalize ──

/**
 * Apply the full normalization pipeline to an IVNE output object.
 *
 * Pipeline: normalizeTimestamps → normalizeQuantifiers → deepSort → serialize → hash
 *
 * @param {object} obj - IVNE output (OntologyImportResult or similar)
 * @param {string} runTimestamp - ISO 8601 timestamp for the run
 * @returns {{ normalized: object, canonicalJson: string, outputHash: string }}
 */
export function normalize(obj, runTimestamp) {
  let result = normalizeTimestamps(obj, runTimestamp);
  result = normalizeQuantifiers(result);
  result = deepSort(result);

  const canonicalJson = canonicalSerialize(result);
  const outputHash = sha256Hex(canonicalJson);

  return { normalized: result, canonicalJson, outputHash };
}
