/**
 * Label Extractor — OWL annotation label extraction for IVNE compilation.
 *
 * Extracts human-readable labels from OWL class definitions using a
 * configurable priority list. Falls back to IRI local name extraction
 * and camelCase splitting when annotations are absent.
 *
 * The extraction pipeline:
 *   1. Check annotations in priority order (rdfs:label, skos:prefLabel)
 *   2. If no annotation found, extract local name from IRI
 *   3. Split camelCase local names into space-separated words
 *   4. Run through simplify() for canonical form
 *   5. Return { displayLabel, canonicalLabel, languageTag, source }
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 3.2
 */

import { simplify } from '../identity/identity-simplification.js';

// ── IRI Local Name Extraction ──

/**
 * Extract the local name (fragment or last path segment) from an IRI.
 *
 * Handles three common IRI patterns:
 *   - Fragment: "http://purl.obolibrary.org/obo/BFO_0000001#Entity" → "Entity"
 *   - Path: "http://purl.obolibrary.org/obo/BFO_0000001" → "BFO_0000001"
 *   - Prefixed: "bfo:BFO_0000001" → "BFO_0000001"
 *
 * @param {string} iri - Full IRI or prefixed IRI
 * @returns {string} Local name, or empty string if extraction fails
 */
export function iriToLocalName(iri) {
  if (!iri || typeof iri !== 'string') return '';

  // Fragment identifier (after #)
  const hashIndex = iri.lastIndexOf('#');
  if (hashIndex !== -1) {
    // If # is the last character, there's no fragment
    return hashIndex < iri.length - 1 ? iri.slice(hashIndex + 1) : '';
  }

  // Last path segment (after /)
  const slashIndex = iri.lastIndexOf('/');
  if (slashIndex !== -1 && slashIndex < iri.length - 1) {
    return iri.slice(slashIndex + 1);
  }

  // Prefixed name (after :)
  const colonIndex = iri.lastIndexOf(':');
  if (colonIndex !== -1 && colonIndex < iri.length - 1) {
    return iri.slice(colonIndex + 1);
  }

  return '';
}

// ── CamelCase Splitting ──

/**
 * Split a camelCase or PascalCase string into space-separated words.
 *
 * Examples:
 *   - "MaterialEntity" → "Material Entity"
 *   - "hasParticipantAt" → "has Participant At"
 *   - "BFO_0000001" → "BFO 0000001"
 *   - "already lowercase" → "already lowercase"
 *
 * @param {string} str - camelCase/PascalCase string
 * @returns {string} Space-separated words
 */
export function splitCamelCase(str) {
  if (!str || typeof str !== 'string') return '';

  return str
    // Insert space before uppercase letter preceded by lowercase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before uppercase letter followed by lowercase, preceded by uppercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Replace underscores with spaces
    .replace(/_/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Annotation Lookup ──

/**
 * Find a label annotation value from an OWL class's annotations array.
 *
 * @param {object[]} annotations - Array of { property, value, language } objects
 * @param {string} property - The annotation property to match (e.g., 'rdfs:label')
 * @param {string} locale - Preferred language tag (e.g., 'en')
 * @returns {string|null} The annotation value, or null if not found
 */
function findAnnotation(annotations, property, locale) {
  if (!annotations || !Array.isArray(annotations)) return null;

  const matches = annotations.filter((a) => a.property === property);
  if (matches.length === 0) return null;

  // Prefer locale-matched annotation
  const localeMatch = matches.find(
    (a) => a.language && a.language.toLowerCase().startsWith(locale.toLowerCase()),
  );
  if (localeMatch) return localeMatch.value;

  // Fall back to untagged annotation
  const untagged = matches.find((a) => !a.language);
  if (untagged) return untagged.value;

  // Fall back to first available annotation
  return matches[0].value;
}

// ── Public API ──

/**
 * Extract a human-readable label from an OWL class definition.
 *
 * Tries each source in the configured priority order. The first non-empty
 * result wins. The extracted label is then run through simplify() to
 * produce a canonical form for IRI generation and matching.
 *
 * @param {object} owlClass - Parsed OWL class object
 * @param {string} owlClass.iri - The class IRI
 * @param {object[]} [owlClass.annotations=[]] - Annotation objects { property, value, language }
 * @param {object} [config={}] - IVNE configuration
 * @param {string[]} [config.labelExtractionPriority=['rdfs:label','skos:prefLabel','uriFragment']] - Priority list
 * @param {string} [config.locale='en'] - Preferred locale
 * @param {object} [config.abbreviationTable={}] - Abbreviation expansion table
 * @param {string[]} [config.protectedProperNouns=[]] - Protected proper nouns
 * @returns {{ displayLabel: string, canonicalLabel: string, languageTag: string, source: string }}
 */
export function extractLabel(owlClass, config = {}) {
  const {
    labelExtractionPriority = ['rdfs:label', 'skos:prefLabel', 'uriFragment'],
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
  } = config;

  const annotations = owlClass.annotations || [];
  const iri = owlClass.iri || '';

  // Try each source in priority order
  for (const source of labelExtractionPriority) {
    let rawLabel = null;

    if (source === 'uriFragment') {
      const localName = iriToLocalName(iri);
      if (localName) {
        rawLabel = splitCamelCase(localName);
      }
    } else {
      rawLabel = findAnnotation(annotations, source, locale);
    }

    if (rawLabel && rawLabel.trim()) {
      const { canonicalLabel, languageTag } = simplify(rawLabel, {
        locale,
        abbreviationTable,
        protectedProperNouns,
      });

      return {
        displayLabel: rawLabel.trim(),
        canonicalLabel,
        languageTag,
        source,
      };
    }
  }

  // Last resort: use full IRI as display label
  const { canonicalLabel, languageTag } = simplify(iri, {
    locale,
    abbreviationTable,
    protectedProperNouns,
  });

  return {
    displayLabel: iri,
    canonicalLabel,
    languageTag,
    source: 'iri',
  };
}
