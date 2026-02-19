/**
 * Property Redundancy — prevents duplicate and overlapping properties.
 *
 * Checks:
 *   1. No exact duplicate (same property IRI on same concept)
 *   2. No ancestor overlap (ancestor already has property with same IRI)
 *   3. Descendant overlap detection (informational, suggests removals)
 *   4. Inherited redundancy (stub — deferred to Phase 6)
 *
 * v2.1: Properties are owl:Restriction entries in rdfs:subClassOf.
 *        Uses owl:onProperty instead of fandaws:label, skos:broader instead of fandaws:parent.
 *
 * Pure functions — builds internal indices from the provided graph.
 *
 * @see Fandaws_v3.3_Specification.md Section 6.3
 */

import { isRestrictionNode } from '../../types/type-checks.js';

/**
 * Check a property addition for redundancy.
 *
 * @param {object} property - owl:Restriction JSON-LD node being added
 * @param {object} graph - Current KnowledgeGraph JSON-LD
 * @param {object} [options] - Additional context
 * @param {Map<string, string>} [options.propertyLabels] - IRI → label map for property resolution
 * @returns {{ violations: object[], descendantRemovals: object[] }}
 */
export function checkPropertyRedundancy(property, graph, options = {}) {
  const violations = [];
  const descendantRemovals = [];

  const propLabel = property['fandaws:propertyLabel'] || property['owl:onProperty'];
  const attachedTo = property['fandaws:attachedTo'];

  if (!propLabel || !attachedTo) {
    return { violations, descendantRemovals };
  }

  const concepts = graph['fandaws:concepts'] || [];
  const conceptMap = new Map(concepts.map((c) => [c['@id'], c]));

  // Build parent index
  const parentIndex = new Map();
  for (const concept of concepts) {
    parentIndex.set(concept['@id'], concept['skos:broader'] || null);
  }

  // Build property label index: conceptIri → Set<label>
  const conceptPropertyLabels = buildConceptPropertyLabels(
    concepts,
    options.propertyLabels || new Map(),
  );

  // ─── Check 1: No Duplicates ───────────────────────────
  const existingLabels = conceptPropertyLabels.get(attachedTo);
  if (existingLabels && existingLabels.has(propLabel)) {
    violations.push({
      reason: 'duplicateProperty',
      message: `Property "${propLabel}" already exists on concept "${attachedTo}".`,
      conceptIri: attachedTo,
      propertyLabel: propLabel,
    });
  }

  // ─── Check 2: No Ancestor Overlap ─────────────────────
  const ancestorViolation = checkAncestorOverlap(
    attachedTo,
    propLabel,
    parentIndex,
    conceptPropertyLabels,
  );
  if (ancestorViolation) {
    violations.push(ancestorViolation);
  }

  // ─── Check 3: Descendant Overlap ──────────────────────
  const childIndex = buildChildIndex(concepts);
  const descRemovals = checkDescendantOverlap(
    attachedTo,
    propLabel,
    childIndex,
    conceptPropertyLabels,
  );
  descendantRemovals.push(...descRemovals);

  // ─── Check 4: Inherited Redundancy (stub) ─────────────
  // Deferred to Phase 6 — always passes.

  return { violations, descendantRemovals };
}

/**
 * Build a map of concept IRI → Set<property label> from the graph.
 * Extracts owl:onProperty from owl:Restriction entries in rdfs:subClassOf.
 *
 * @param {object[]} concepts - Array of concept nodes
 * @param {Map<string, string>} propertyLabels - External IRI → label map
 * @returns {Map<string, Set<string>>}
 */
function buildConceptPropertyLabels(concepts, propertyLabels) {
  const map = new Map();

  for (const concept of concepts) {
    const labels = new Set();
    const subClassOf = concept['rdfs:subClassOf'] || [];

    for (const entry of subClassOf) {
      if (isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'property') {
        const propLabel = entry['fandaws:propertyLabel'] || entry['owl:onProperty'];
        if (propLabel) {
          labels.add(propLabel);
        }
      }
    }

    // Also resolve from external property label map (for IRI-based properties)
    for (const entry of subClassOf) {
      if (isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'property') {
        const iri = entry['@id'];
        if (iri && propertyLabels.has(iri)) {
          labels.add(propertyLabels.get(iri));
        }
      }
    }

    map.set(concept['@id'], labels);
  }

  return map;
}

/**
 * Walk ancestor chain checking for property label overlap.
 *
 * @param {string} conceptIri - Starting concept
 * @param {string} propLabel - Property label to check
 * @param {Map<string, string|null>} parentIndex - IRI → parent
 * @param {Map<string, Set<string>>} conceptPropertyLabels - IRI → labels
 * @returns {object|null} Violation or null
 */
function checkAncestorOverlap(
  conceptIri,
  propLabel,
  parentIndex,
  conceptPropertyLabels,
) {
  const visited = new Set();
  let current = parentIndex.get(conceptIri) || null;

  while (current) {
    if (visited.has(current)) break;
    visited.add(current);

    const labels = conceptPropertyLabels.get(current);
    if (labels && labels.has(propLabel)) {
      return {
        reason: 'ancestorPropertyOverlap',
        message: `Property "${propLabel}" already exists on ancestor "${current}".`,
        conceptIri,
        ancestorIri: current,
        propertyLabel: propLabel,
      };
    }

    current = parentIndex.get(current) || null;
  }

  return null;
}

/**
 * Build a child index from concepts: IRI → Set<child IRI>.
 *
 * @param {object[]} concepts
 * @returns {Map<string, Set<string>>}
 */
function buildChildIndex(concepts) {
  const index = new Map();

  for (const concept of concepts) {
    const parent = concept['skos:broader'];
    if (parent) {
      if (!index.has(parent)) {
        index.set(parent, new Set());
      }
      index.get(parent).add(concept['@id']);
    }
  }

  return index;
}

/**
 * Walk descendant tree checking for property label overlap.
 * Returns informational removal suggestions (not rejections).
 *
 * @param {string} conceptIri - Starting concept
 * @param {string} propLabel - Property label to check
 * @param {Map<string, Set<string>>} childIndex - IRI → children
 * @param {Map<string, Set<string>>} conceptPropertyLabels - IRI → labels
 * @returns {object[]} Array of descendant removal suggestions
 */
function checkDescendantOverlap(
  conceptIri,
  propLabel,
  childIndex,
  conceptPropertyLabels,
) {
  const removals = [];
  const queue = [...(childIndex.get(conceptIri) || [])];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const labels = conceptPropertyLabels.get(current);
    if (labels && labels.has(propLabel)) {
      removals.push({
        conceptIri: current,
        propertyLabel: propLabel,
        message: `Descendant "${current}" has property "${propLabel}" which is now redundant with ancestor "${conceptIri}".`,
      });
    }

    // Continue walking descendants
    const children = childIndex.get(current) || new Set();
    for (const child of children) {
      queue.push(child);
    }
  }

  return removals;
}
