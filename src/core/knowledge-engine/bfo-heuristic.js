/**
 * BFO Heuristic — Basic Formal Ontology category inference.
 *
 * Provides deterministic BFO category assignment for concepts:
 *   1. Check HEURISTIC_EXCEPTIONS for known misclassifications
 *   2. Check canonical label suffixes for linguistic patterns
 *   3. Default to entity (BFO_0000001) when category is unknown
 *
 * Categories use canonical BFO 2020 IRIs (OBO PURLs, no fragments).
 *
 * @see Fandaws_v3.3_Specification.md Section 7.1, 7.3
 * @see http://purl.obolibrary.org/obo/bfo.owl
 */

// ── BFO Category Constants ──

export const BFO = {
  entity:           'bfo:BFO_0000001', // Entity (top-level)
  materialEntity:   'bfo:BFO_0000040', // Material Entity — objects, substances
  process:          'bfo:BFO_0000015', // Process — events, occurrents
  quality:          'bfo:BFO_0000019', // Quality — color, mass, shape
  role:             'bfo:BFO_0000023', // Role — student, employer, catalyst
  disposition:      'bfo:BFO_0000016', // Disposition — fragility, solubility
  function:         'bfo:BFO_0000034', // Function — biological/artifactual capacities
  realizableEntity: 'bfo:BFO_0000017', // Realizable Entity — capabilities
  spatialRegion:    'bfo:BFO_0000006', // Spatial Region — geometric spaces
  temporalRegion:   'bfo:BFO_0000008', // Temporal Region — hours, minutes, eras
  genDepContinuant: 'bfo:BFO_0000031', // GDC — documents, data, recipes
};

// ── BFO Display Labels ──
// Human-readable names for DescriptionEngine and UI rendering.

export const BFO_LABELS = {
  [BFO.entity]:           'Entity',
  [BFO.materialEntity]:   'Material Entity',
  [BFO.process]:          'Process',
  [BFO.quality]:          'Quality',
  [BFO.role]:             'Role',
  [BFO.disposition]:      'Disposition',
  [BFO.function]:         'Function',
  [BFO.realizableEntity]: 'Realizable Entity',
  [BFO.spatialRegion]:    'Spatial Region',
  [BFO.temporalRegion]:   'Temporal Region',
  [BFO.genDepContinuant]: 'Generically Dependent Continuant',
};

// ── Heuristic Exception Map ──
// Common English words whose suffixes would cause misclassification.

export const HEURISTIC_EXCEPTIONS = {
  // BFO category names — recognized as themselves, not parsed by suffix
  entity:      BFO.entity,           // not a quality despite -ity
  'material entity': BFO.materialEntity,
  process:     BFO.process,
  quality:     BFO.quality,
  role:        BFO.role,
  disposition: BFO.disposition,
  function:    BFO.function,
  'realizable entity': BFO.realizableEntity,
  'spatial region': BFO.spatialRegion,
  'temporal region': BFO.temporalRegion,
  'generically dependent continuant': BFO.genDepContinuant,

  // Common English words whose suffixes would cause misclassification
  building:    BFO.materialEntity,   // not a process despite -ing
  king:        BFO.role,             // not a process despite -ing
  thing:       BFO.entity,           // not a process
  nothing:     BFO.entity,           // not a process
  something:   BFO.entity,           // not a process
  flooring:    BFO.materialEntity,   // not a process
  ceiling:     BFO.materialEntity,   // not a process
  spring:      BFO.materialEntity,   // not a process (ambiguous: also temporal)
  ring:        BFO.materialEntity,   // not a process
  string:      BFO.materialEntity,   // not a process
  nation:      BFO.genDepContinuant, // not a process despite -tion
  station:     BFO.materialEntity,   // not a process
  university:  BFO.materialEntity,   // not a quality despite -ity
  electricity: BFO.disposition,      // not a quality
  city:        BFO.materialEntity,   // not a quality
  community:   BFO.genDepContinuant, // not a quality
};

// ── Suffix Patterns ──

const PROCESS_SUFFIXES = ['ing', 'tion', 'sion', 'ment', 'sis'];
const QUALITY_SUFFIXES = ['ness', 'ity', 'ance', 'ence'];

/**
 * Infer a BFO category from a canonical label using heuristic rules.
 *
 * Order: exceptions → suffix → default (entity).
 *
 * @param {string} canonicalLabel - Normalized concept label
 * @returns {string} BFO IRI (prefixed form, e.g., "bfo:BFO_0000001")
 */
export function inferBfoCategory(canonicalLabel) {
  if (!canonicalLabel || typeof canonicalLabel !== 'string') {
    return BFO.entity;
  }

  const label = canonicalLabel.trim().toLowerCase();

  // 1. Check exceptions — full label first (most specific), then last word
  if (HEURISTIC_EXCEPTIONS[label] !== undefined) {
    return HEURISTIC_EXCEPTIONS[label];
  }
  const lastWord = label.includes(' ') ? label.split(' ').pop() : label;
  if (HEURISTIC_EXCEPTIONS[lastWord] !== undefined) {
    return HEURISTIC_EXCEPTIONS[lastWord];
  }

  // 2. Check suffixes on last word
  for (const suffix of PROCESS_SUFFIXES) {
    if (lastWord.endsWith(suffix) && lastWord.length > suffix.length) {
      return BFO.process;
    }
  }

  for (const suffix of QUALITY_SUFFIXES) {
    if (lastWord.endsWith(suffix) && lastWord.length > suffix.length) {
      return BFO.quality;
    }
  }

  // 3. Default — unknown category, use top-level entity
  return BFO.entity;
}

/**
 * Determine BFO category for a child concept based on its parent.
 *
 * If the parent has a bfoMapping, the child inherits it.
 * If the parent has no mapping (or is null), apply heuristic to the child label.
 *
 * @param {object|null} parentConcept - Parent concept node (or null for roots)
 * @param {string} childCanonicalLabel - Canonical label of the child concept
 * @returns {string} BFO IRI
 */
export function inheritBfoCategory(parentConcept, childCanonicalLabel) {
  if (parentConcept && parentConcept.bfoMapping) {
    return parentConcept.bfoMapping;
  }

  // Check rdfs:subClassOf for bare BFO IRI strings (existing mapping)
  if (parentConcept) {
    const subClassOf = parentConcept['rdfs:subClassOf'] || [];
    for (const entry of subClassOf) {
      if (typeof entry === 'string' && entry.startsWith('bfo:')) {
        return entry;
      }
    }
  }

  return inferBfoCategory(childCanonicalLabel);
}
