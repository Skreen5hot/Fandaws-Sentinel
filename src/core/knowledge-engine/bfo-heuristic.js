/**
 * BFO Heuristic — Basic Formal Ontology category inference.
 *
 * Provides deterministic BFO category assignment for concepts.
 *
 * **Important — heuristic matrix #1 (Critical):** The label-suffix
 * categorization (`-ing`, `-ment`, `-ity`, etc.) is NO LONGER USED when
 * BFO is ingested. The workflows fire `bfoCategoryDisambiguation` prompts
 * instead, asking the user to pick the BFO category for new root concepts.
 * The heuristic is retained as a pre-ingestion fallback (legacy graphs
 * created before BFO 2020 was bundled), but its decisions are no longer
 * persisted into BFO category markers — the recompute pass overwrites them.
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
  // -ment words that are NOT nominalized verbs (filament from Latin filum)
  filament:    BFO.materialEntity,   // not a process despite -ment
  cement:      BFO.materialEntity,   // not a process
  ornament:    BFO.materialEntity,   // not a process
  pigment:     BFO.materialEntity,   // not a process
  garment:     BFO.materialEntity,   // not a process
  fragment:    BFO.materialEntity,   // not a process
  segment:     BFO.materialEntity,   // not a process (geometric)
  ligament:    BFO.materialEntity,   // not a process (anatomy)
  instrument:  BFO.materialEntity,   // not a process (artifact)
  monument:    BFO.materialEntity,   // not a process
  document:    BFO.genDepContinuant, // not a process — informational
  experiment:  BFO.process,          // explicit (is a process — keep)
  apartment:   BFO.materialEntity,   // not a process
  basement:    BFO.materialEntity,   // not a process
  pavement:    BFO.materialEntity,   // not a process
  sediment:    BFO.materialEntity,   // not a process
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
 * Determine the BFO category marker to write into a child concept's
 * `rdfs:subClassOf` array.
 *
 * Returns `null` when the child's ancestor chain (immediate parent or any
 * higher ancestor) reaches an ingested concept (one with
 * `fandaws:isImported: true` or `owl:equivalentClass`). In that case, the
 * BFO category is implicit in the `skos:broader` chain — at some level the
 * chain reaches a real Fandaws node whose `owl:equivalentClass` points at
 * the source BFO IRI. Adding a separate marker would be redundant and (if
 * it were a raw `bfo:` IRI) would create a phantom reference that violates
 * the self-contained subclass tree principle (Ontology Ingestion v1.4
 * §3.3, §4.2).
 *
 * For fully-disconnected user concepts (no ingested ancestor anywhere in
 * the chain — transitional pre-ingestion data), keep the marker via the
 * pre-ingestion behavior so the BFO category remains accessible.
 *
 * @param {object|null} parentConcept - Parent concept node (or null for roots)
 * @param {string} childCanonicalLabel - Canonical label of the child concept
 * @param {object} [context] - Optional graph context for ancestor walking
 * @param {object} [context.graph] - KnowledgeGraph for resolving ancestors
 * @param {Map<string, string|null>} [context.iriToParent] - Parent index for O(1) walks
 * @returns {string|null} BFO IRI marker for fully-legacy parents; null when
 *   the ancestor chain reaches an ingested concept.
 */
export function inheritBfoCategory(parentConcept, childCanonicalLabel, context = {}) {
  // Imported concept parent (immediate) — return null
  if (parentConcept && (parentConcept['fandaws:isImported'] || parentConcept['owl:equivalentClass'])) {
    return null;
  }

  // Walk the ancestor chain looking for an ingested ancestor anywhere
  // above. If found, no marker is needed — the chain reaches BFO via
  // owl:equivalentClass eventually.
  if (parentConcept && context.graph && context.iriToParent) {
    const concepts = context.graph['fandaws:concepts'] || [];
    const conceptById = new Map(concepts.map((c) => [c['@id'], c]));
    let cursor = parentConcept['skos:broader'] || null;
    const visited = new Set([parentConcept['@id']]);
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const ancestor = conceptById.get(cursor);
      if (ancestor && (ancestor['fandaws:isImported'] || ancestor['owl:equivalentClass'])) {
        return null;
      }
      cursor = context.iriToParent.get(cursor) || null;
    }
  }

  // Legacy path: parent has an explicit bfoMapping field
  if (parentConcept && parentConcept.bfoMapping) {
    return parentConcept.bfoMapping;
  }

  // Legacy path: parent has a bare BFO IRI in rdfs:subClassOf
  if (parentConcept) {
    const subClassOf = parentConcept['rdfs:subClassOf'] || [];
    for (const entry of subClassOf) {
      if (typeof entry === 'string' && entry.startsWith('bfo:')) {
        return entry;
      }
    }
  }

  // Root concept (no parent) or fully-disconnected user concept — fall
  // back to the label-based heuristic. Produces a marker for top-level
  // user concepts that haven't been classified under any imported BFO node.
  return inferBfoCategory(childCanonicalLabel);
}

// ─────────────────────────────────────────────────────────
// BFO Category Disambiguation (replaces label-suffix heuristic)
// ─────────────────────────────────────────────────────────

/**
 * The 11 BFO 2020 top-level categories, in the order they should be
 * presented to the user during a `bfoCategoryDisambiguation` prompt.
 * Order chosen for "most likely first" — material entity is the most
 * common pick for everyday concepts.
 *
 * Each entry: { sourceIri, label, hint }
 * - sourceIri: full BFO PURL (used as the user's choice value)
 * - label: human-readable label
 * - hint: short explanation for the prompt UI
 */
export const BFO_CATEGORY_OPTIONS = [
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000040', label: 'Material Entity', hint: 'Physical objects, substances, organisms (dog, table, water)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000015', label: 'Process',         hint: 'Events, activities, things that unfold in time (running, digestion)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000019', label: 'Quality',         hint: 'Attributes that need no realization (color, mass, shape)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000023', label: 'Role',            hint: 'Externally-grounded capacities (student, employee, catalyst)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000016', label: 'Disposition',     hint: 'Internally-grounded capacities (fragility, solubility)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000034', label: 'Function',        hint: 'Biological or designed capacities (heart pumping, knife cutting)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000031', label: 'Generically Dependent Continuant', hint: 'Information / patterns (recipes, documents, software)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000006', label: 'Spatial Region',  hint: 'Geometric spaces (a point, an area, a volume)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000008', label: 'Temporal Region', hint: 'Time intervals (an hour, an era, a moment)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000017', label: 'Realizable Entity', hint: 'Specifically dependent capacities (parent of role/disposition)' },
  { sourceIri: 'http://purl.obolibrary.org/obo/BFO_0000001', label: 'Entity',          hint: 'I don\u2019t know / something else (top-level fallback)' },
];

/**
 * Build a `bfoCategoryDisambiguation` prompt for a new root concept.
 *
 * The user picks one of the 11 BFO categories. The pipeline re-runs
 * with `options.bfoCategoryChoice` set to the chosen `sourceIri`, and
 * the workflow uses `indices.bfoEquivalenceIndex` to look up the
 * Fandaws IRI of the chosen ingested BFO concept and sets it as
 * the new root's `skos:broader` parent.
 *
 * @param {string} rawLabel - The user's input label for the new concept
 * @param {object} context - State to resume processing after the user picks
 * @returns {object} ConversationPrompt JSON-LD
 */
export function buildBfoCategoryPrompt(rawLabel, context) {
  return {
    '@type': 'fandaws:ConversationPrompt',
    'fandaws:promptType': 'bfoCategoryDisambiguation',
    'fandaws:text': `What kind of thing is "${rawLabel}"?`,
    'fandaws:options': BFO_CATEGORY_OPTIONS.map((opt) => ({
      sourceIri: opt.sourceIri,
      label: opt.label,
      hint: opt.hint,
    })),
    'fandaws:context': context,
    'fandaws:machineSignal': null,
  };
}
