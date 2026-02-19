/**
 * DescriptionEngine — auto-generated concept descriptions.
 *
 * Produces template-based descriptions from concept + graph context.
 * Supports two templates:
 * - Standard: "[Term] is a [parent] that has [prop1], [prop2], [prop3]."
 * - Process:  "[Term] is the [parent+ing] of [object] by [subject]."
 *
 * v2.1: Uses rdfs:label and skos:broader instead of fandaws: fields.
 *       Properties read from owl:Restriction entries in rdfs:subClassOf.
 *       Relationships read from owl:Restriction with restrictionKind 'relationship'.
 *
 * Phase 7: Added article selection, display label capitalization,
 *          relationship extraction, and process template.
 *
 * @see v2.1 Concept JSON-LD Specification
 * @see Fandaws_v3.3_Specification.md Section 3.2.5
 */

import { isRestrictionNode } from '../../types/type-checks.js';
import { BFO } from '../knowledge-engine/bfo-heuristic.js';

// ─────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────

/**
 * Select the English indefinite article for a word.
 * Simple vowel-letter heuristic: "an" before a/e/i/o/u, "a" otherwise.
 *
 * Known limitation: does not handle phonetic exceptions like
 * "an hour" or "a unicorn". Acceptable for Phase 7.
 *
 * @param {string} word - The word following the article
 * @returns {string} "a" or "an"
 */
function selectArticle(word) {
  if (!word) return 'a';
  const first = word[0].toLowerCase();
  return 'aeiou'.includes(first) ? 'an' : 'a';
}

/**
 * Ensure the first character of a display label is uppercase.
 *
 * @param {string} label
 * @returns {string}
 */
function capitalizeLabel(label) {
  if (!label) return '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Resolve a concept IRI to its capitalized display label.
 *
 * @param {string} iri - Concept IRI
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @returns {string} Capitalized label or the bare IRI if not found
 */
function resolveLabel(iri, graph) {
  if (!iri) return '';
  const concepts = graph['fandaws:concepts'] || [];
  const concept = concepts.find((c) => c['@id'] === iri);
  if (!concept) return iri;
  return capitalizeLabel(concept['rdfs:label'] || iri);
}

/**
 * Extract the first relationship's data from a concept's rdfs:subClassOf array.
 *
 * @param {object} concept - JSON-LD Concept node
 * @returns {{ verb: string, object: string, subject: string } | null}
 *   First complete relationship found, or null if none exist.
 */
function extractRelationshipData(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];

  for (const entry of subClassOf) {
    if (
      isRestrictionNode(entry) &&
      entry['fandaws:restrictionKind'] === 'relationship' &&
      entry['owl:onProperty'] &&
      entry['owl:someValuesFrom'] &&
      entry['fandaws:attachedTo']
    ) {
      return {
        verb: entry['owl:onProperty'],
        object: entry['owl:someValuesFrom'],
        subject: entry['fandaws:attachedTo'],
      };
    }
  }

  return null;
}

/**
 * Append "-ing" to a word for the process template gerund.
 *
 * Rules:
 * - Ends in "e" (not "ee"): drop "e", add "ing" (e.g., "chase" → "chasing")
 * - Ends in "ee": add "ing" (e.g., "free" → "freeing")
 * - Otherwise: add "ing" (e.g., "hunt" → "hunting")
 *
 * Known limitation: does not handle consonant doubling
 * ("run" → "runing" instead of "running"). Acceptable for Phase 7.
 *
 * @param {string} word
 * @returns {string}
 */
function addIngSuffix(word) {
  if (!word) return '';
  if (word.endsWith('e') && !word.endsWith('ee')) {
    return word.slice(0, -1) + 'ing';
  }
  return word + 'ing';
}

/**
 * Extract property labels from a concept's rdfs:subClassOf array.
 *
 * @param {object} concept - JSON-LD Concept node
 * @returns {string[]} Property labels (owl:onProperty values)
 */
function extractPropertyLabels(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  const labels = [];

  for (const entry of subClassOf) {
    if (
      isRestrictionNode(entry) &&
      entry['fandaws:restrictionKind'] === 'property' &&
      entry['owl:onProperty']
    ) {
      labels.push(entry['fandaws:propertyLabel'] || entry['owl:onProperty']);
    }
  }

  return labels;
}

/**
 * Format a list of property labels as an English list.
 * "fur" → "fur"
 * "fur", "legs" → "fur and legs"
 * "fur", "legs", "tail" → "fur, legs, and tail"
 *
 * @param {string[]} labels
 * @returns {string}
 */
function formatPropertyList(labels) {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1];
}

/**
 * Inflect a bare-lemma verb to third-person singular present tense.
 *
 * Rules:
 * - Exception table: "have" → "has", "go" → "goes", "do" → "does"
 * - Ends in s, sh, ch, x, z → append "es" (pass → passes, watch → watches)
 * - Ends in consonant + y → drop y, add "ies" (carry → carries)
 * - Otherwise → append "s" (eat → eats, chase → chases)
 *
 * @param {string} verb - Base form (lemma) of the verb
 * @returns {string} Third-person singular form
 */
function inflectVerb(verb) {
  if (!verb) return '';
  const EXCEPTIONS = { have: 'has', go: 'goes', do: 'does' };
  const lower = verb.toLowerCase();
  if (EXCEPTIONS[lower]) return EXCEPTIONS[lower];
  if (/(?:s|sh|ch|x|z)$/.test(lower)) return verb + 'es';
  if (/[^aeiou]y$/.test(lower)) return verb.slice(0, -1) + 'ies';
  return verb + 's';
}

/**
 * Check if a concept is a BFO process based on its rdfs:subClassOf entries.
 *
 * @param {object} concept - JSON-LD Concept node
 * @returns {boolean}
 */
function isProcessConcept(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  for (const entry of subClassOf) {
    if (entry === BFO.process) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Generate a human-readable description for a concept.
 *
 * Selects between three templates:
 * - **Process:**  "[Term] is the [parent+ing] of [object] by [subject]."
 *   (only for concepts with BFO process category)
 * - **Standard + relationship:** "[Term] is a/an [parent] that [verb-3ps] [object]."
 *   (non-process concepts with relationships)
 * - **Standard:** "[Term] is a/an [parent] that has [props]."
 *   (concepts with properties, no relationships)
 *
 * @param {object} concept - JSON-LD Concept node
 * @param {object} graph - JSON-LD KnowledgeGraph containing the concept
 * @returns {string} Generated description
 */
export function describeConcept(concept, graph) {
  const rawLabel = concept['rdfs:label'] || '?';
  const displayLabel = capitalizeLabel(rawLabel);
  const parentIri = concept['skos:broader'];
  const propertyLabels = extractPropertyLabels(concept);
  const relationshipData = extractRelationshipData(concept);

  const propertySuffix = propertyLabels.length > 0
    ? ` that has ${formatPropertyList(propertyLabels)}`
    : '';

  // ── Process template ──
  // "[Term] is the [parent+ing] of [object] by [subject]."
  // Only for process concepts (BFO process category).
  if (relationshipData && parentIri && isProcessConcept(concept)) {
    const concepts = graph['fandaws:concepts'] || [];
    const parent = concepts.find((c) => c['@id'] === parentIri);
    if (parent) {
      const parentLabel = parent['rdfs:label'] || parentIri;
      const gerund = addIngSuffix(parentLabel.toLowerCase());
      const objectLabel = resolveLabel(relationshipData.object, graph);
      const subjectLabel = resolveLabel(relationshipData.subject, graph);
      return `${displayLabel} is the ${gerund} of ${objectLabel} by ${subjectLabel}.`;
    }
  }

  // ── Root concept (no parent) ──
  if (!parentIri) {
    if (propertySuffix) {
      return `${displayLabel} is a root concept${propertySuffix}.`;
    }
    return `${displayLabel} is a root concept.`;
  }

  // ── Standard template ──
  const concepts = graph['fandaws:concepts'] || [];
  const parent = concepts.find((c) => c['@id'] === parentIri);

  if (!parent) {
    const article = selectArticle('concept');
    return `${displayLabel} is ${article} concept${propertySuffix}.`;
  }

  const parentLabel = capitalizeLabel(parent['rdfs:label'] || parentIri);
  const article = selectArticle(parentLabel);

  // Standard template with relationship: "[Term] is a [parent] that [verb-s] [object]."
  if (relationshipData) {
    const objectLabel = resolveLabel(relationshipData.object, graph);
    const conjugated = inflectVerb(relationshipData.verb);
    const relSuffix = ` that ${conjugated} ${objectLabel}`;
    return `${displayLabel} is ${article} ${parentLabel}${relSuffix}.`;
  }

  return `${displayLabel} is ${article} ${parentLabel}${propertySuffix}.`;
}
