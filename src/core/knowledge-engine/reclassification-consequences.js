/**
 * Reclassification Consequences — pure structural analysis for the
 * consequence-aware reclassification flow.
 *
 * When a user reclassifies concept X from old parent A to new parent B,
 * this module computes:
 *
 *   1. Which of the four cases applies (Strengthening, Weakening, Lateral,
 *      Disconnected) by walking ancestor chains.
 *   2. Which inherited properties X currently has via A's branch that
 *      will be lost after reclassification (i.e., properties on ancestors
 *      strictly between A (inclusive) and the common ancestor of A and B
 *      (exclusive)).
 *   3. Which descendants of X also inherit each lost property, so the
 *      consequence prompt can show the blast radius.
 *
 * Pure functions only — no I/O, no adapter dependency. Caller passes the
 * graph and the iriToParent / iriToChildren indices.
 *
 * Architectural principle: machine-first, human-validate. The machine
 * computes the structural consequences and presents them; the human
 * decides what to do.
 *
 * @see docs/architecture/consequence-aware-reclassification spec (April 9, 2026)
 */

import { isRestrictionNode } from '../../types/type-checks.js';

// ─────────────────────────────────────────────────────────
// Case detection
// ─────────────────────────────────────────────────────────

/**
 * Walk the ancestor chain from `startIri` upward through `iriToParent`,
 * returning an array of ancestor IRIs in order [parent, grandparent, ..., root].
 * Includes a cycle guard.
 *
 * @param {string} startIri - Starting concept IRI
 * @param {Map<string, string|null>} iriToParent
 * @returns {string[]}
 */
export function buildAncestorChain(startIri, iriToParent) {
  const chain = [];
  const visited = new Set([startIri]);
  let cursor = iriToParent.get(startIri) ?? null;
  while (cursor != null) {
    if (visited.has(cursor)) break; // cycle guard
    visited.add(cursor);
    chain.push(cursor);
    cursor = iriToParent.get(cursor) ?? null;
  }
  return chain;
}

/**
 * Determine the structural relationship between an old parent and a new
 * parent for a reclassification.
 *
 * @param {string} oldParentIri - The concept's current skos:broader
 * @param {string} newParentIri - The proposed new parent IRI
 * @param {Map<string, string|null>} iriToParent
 * @returns {{
 *   case: 'strengthening' | 'weakening' | 'lateral' | 'disconnected',
 *   commonAncestor: string | null,
 *   oldChain: string[],
 *   newChain: string[],
 * }}
 */
export function detectReclassificationCase(oldParentIri, newParentIri, iriToParent) {
  const oldChain = [oldParentIri, ...buildAncestorChain(oldParentIri, iriToParent)];
  const newChain = [newParentIri, ...buildAncestorChain(newParentIri, iriToParent)];

  // Strengthening: new parent is a descendant of old parent — old parent
  // appears in new parent's ancestor chain (new → ... → old).
  if (newChain.includes(oldParentIri)) {
    return {
      case: 'strengthening',
      commonAncestor: oldParentIri,
      oldChain,
      newChain,
    };
  }

  // Weakening: old parent is a descendant of new parent — new parent
  // appears in old parent's ancestor chain (old → ... → new).
  if (oldChain.includes(newParentIri)) {
    return {
      case: 'weakening',
      commonAncestor: newParentIri,
      oldChain,
      newChain,
    };
  }

  // Lateral or Disconnected — find the first common ancestor (if any).
  const newSet = new Set(newChain);
  for (const ancestor of oldChain) {
    if (newSet.has(ancestor)) {
      return {
        case: 'lateral',
        commonAncestor: ancestor,
        oldChain,
        newChain,
      };
    }
  }

  return {
    case: 'disconnected',
    commonAncestor: null,
    oldChain,
    newChain,
  };
}

// ─────────────────────────────────────────────────────────
// Lost property computation
// ─────────────────────────────────────────────────────────

/**
 * Extract all property restrictions (kind = 'property') from a concept's
 * rdfs:subClassOf array. Returns an array of { propertyLabel, restriction }
 * for the user-facing consequence prompt.
 *
 * @param {object} concept
 * @returns {Array<{ propertyLabel: string, restriction: object }>}
 */
function getDirectProperties(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  const out = [];
  for (const entry of subClassOf) {
    if (
      isRestrictionNode(entry) &&
      entry['fandaws:restrictionKind'] === 'property'
    ) {
      const propertyLabel =
        entry['fandaws:propertyLabel']
        || entry['owl:onProperty']
        || '<unknown>';
      out.push({ propertyLabel, restriction: entry });
    }
  }
  return out;
}

/**
 * Collect all descendants of a concept (transitive closure via iriToChildren).
 *
 * @param {string} startIri
 * @param {Map<string, Set<string>>} iriToChildren
 * @returns {string[]}
 */
function collectDescendants(startIri, iriToChildren) {
  const out = [];
  const visited = new Set([startIri]);
  const queue = [...(iriToChildren.get(startIri) || [])];
  while (queue.length > 0) {
    const next = queue.shift();
    if (visited.has(next)) continue;
    visited.add(next);
    out.push(next);
    for (const child of (iriToChildren.get(next) || [])) {
      queue.push(child);
    }
  }
  return out;
}

/**
 * Compute the set of property restrictions that the reclassified concept
 * would lose after the reclassification.
 *
 * The "lost" set is properties on ancestors strictly above the
 * reclassified concept and strictly below the common ancestor on the OLD
 * branch. The common ancestor is itself NOT lost — it remains in the
 * inheritance chain via the new parent.
 *
 * For each lost property, also compute the descendants of the reclassified
 * concept that currently inherit it (they will lose it too).
 *
 * @param {string} subjectIri - The concept being reclassified
 * @param {object} caseInfo - Output from detectReclassificationCase()
 * @param {object} graph - KnowledgeGraph snapshot
 * @param {Map<string, Set<string>>} iriToChildren
 * @returns {Array<{
 *   sourceConceptIri: string,
 *   sourceConceptLabel: string,
 *   propertyLabel: string,
 *   restriction: object,
 *   affectedDescendants: string[],
 * }>}
 */
export function computeLostProperties(subjectIri, caseInfo, graph, iriToChildren) {
  if (caseInfo.case === 'strengthening') return [];

  // Build the set of OLD-branch ancestors whose properties would be lost.
  // Stop at the common ancestor (exclusive) for lateral; walk the full
  // old chain for disconnected (no common ancestor).
  const losingIris = [];
  for (const iri of caseInfo.oldChain) {
    if (iri === caseInfo.commonAncestor) break;
    losingIris.push(iri);
  }

  if (losingIris.length === 0) return [];

  const concepts = graph['fandaws:concepts'] || [];
  const conceptById = new Map(concepts.map((c) => [c['@id'], c]));

  // Compute descendants of subject (these will also lose inheritance)
  const subjectDescendants = collectDescendants(subjectIri, iriToChildren);

  const lost = [];
  for (const ancestorIri of losingIris) {
    const ancestorConcept = conceptById.get(ancestorIri);
    if (!ancestorConcept) continue;
    const ancestorLabel = ancestorConcept['rdfs:label'] || ancestorConcept['skos:prefLabel'] || ancestorIri;
    const props = getDirectProperties(ancestorConcept);
    for (const { propertyLabel, restriction } of props) {
      // Affected descendants are the subject's descendants that would
      // also lose this inherited property. (For Phase A we just collect
      // all descendants — they all inherit from the subject, so they all
      // lose what the subject loses.)
      lost.push({
        sourceConceptIri: ancestorIri,
        sourceConceptLabel: ancestorLabel,
        propertyLabel,
        restriction,
        affectedDescendants: subjectDescendants,
      });
    }
  }

  return lost;
}

// ─────────────────────────────────────────────────────────
// Prompt construction
// ─────────────────────────────────────────────────────────

/**
 * Format a single lost-property line for the consequence prompt.
 *
 *   "organism has DNA (inherited by animal + 3 descendants: mammal, dog, cat)"
 *
 * For more than 5 descendants, collapse to a count.
 *
 * @param {object} lost - One entry from computeLostProperties()
 * @param {string} subjectLabel
 * @param {object} graph
 * @returns {string}
 */
export function formatLostPropertyLine(lost, subjectLabel, graph) {
  const concepts = graph['fandaws:concepts'] || [];
  const conceptById = new Map(concepts.map((c) => [c['@id'], c]));
  const descendants = lost.affectedDescendants;

  let inheritedBy;
  if (descendants.length === 0) {
    inheritedBy = `inherited by ${subjectLabel}`;
  } else if (descendants.length <= 5) {
    const labels = descendants
      .map((iri) => {
        const c = conceptById.get(iri);
        return c ? (c['rdfs:label'] || c['skos:prefLabel'] || iri) : iri;
      })
      .filter(Boolean);
    inheritedBy = `inherited by ${subjectLabel} + ${descendants.length} descendant${descendants.length === 1 ? '' : 's'}: ${labels.join(', ')}`;
  } else {
    inheritedBy = `inherited by ${subjectLabel} + ${descendants.length} descendants`;
  }

  return `${lost.sourceConceptLabel} has ${lost.propertyLabel} (${inheritedBy})`;
}

/**
 * Build a `reclassificationConsequence` prompt for the user.
 *
 * Options ordered safest-first per architect Q8:
 *   1. add_as_additional — preserves everything, captures the new assertion
 *   2. keep_current      — no change
 *   3. reclassify_anyway — destructive, loses inherited properties
 *
 * @param {object} params
 * @param {string} params.subjectLabel - Human-readable label of the concept
 * @param {string} params.oldParentLabel
 * @param {string} params.newParentLabel
 * @param {object} params.caseInfo
 * @param {Array} params.lostProperties - Output of computeLostProperties()
 * @param {object} params.graph
 * @param {object} params.context - Carried into the resume payload
 * @returns {object} ConversationPrompt JSON-LD
 */
export function buildReclassificationConsequencePrompt({
  subjectLabel,
  oldParentLabel,
  newParentLabel,
  caseInfo,
  lostProperties,
  graph,
  context,
}) {
  const caseExplanation = {
    weakening: `${newParentLabel} is an ancestor of ${oldParentLabel} — this would move ${subjectLabel} up the hierarchy.`,
    lateral: `${newParentLabel} is in a different branch than ${oldParentLabel} — this would move ${subjectLabel} sideways.`,
    disconnected: `${newParentLabel} is in a completely separate branch from ${oldParentLabel} — this would move ${subjectLabel} to a different tree.`,
  }[caseInfo.case] || '';

  const lossLines = lostProperties.map((l) => formatLostPropertyLine(l, subjectLabel, graph));
  const lossSection = lossLines.length > 0
    ? `\n\nKnowledge that would be lost by this reclassification:\n  • ${lossLines.join('\n  • ')}`
    : '';

  const text =
    `"${subjectLabel}" is currently classified under "${oldParentLabel}". ${caseExplanation}` +
    lossSection +
    `\n\nWhat would you like to do?`;

  return {
    '@type': 'fandaws:ConversationPrompt',
    'fandaws:promptType': 'reclassificationConsequence',
    'fandaws:text': text,
    'fandaws:options': [
      {
        action: 'add_as_additional',
        label: 'Add as additional parent',
        hint: `${subjectLabel} stays under ${oldParentLabel} AND gains ${newParentLabel} as a secondary classification (polyhierarchy). Nothing is lost.`,
      },
      {
        action: 'keep_current',
        label: 'Keep current classification',
        hint: `${subjectLabel} stays under ${oldParentLabel}. The new assertion is discarded.`,
      },
      {
        action: 'reclassify_anyway',
        label: 'Reclassify anyway',
        hint: `${subjectLabel} moves to ${newParentLabel}. Inherited properties from the old branch will be lost.`,
      },
    ],
    'fandaws:context': context,
    'fandaws:machineSignal': null,
  };
}
