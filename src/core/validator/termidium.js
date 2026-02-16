/**
 * Termidium — 8-level bounded deduplication engine.
 *
 * When a new concept is created or modified, Termidium searches up and down
 * the hierarchy (bounded at `deduplicationDepth` levels) for concepts with
 * matching canonical labels. If found, it produces merge descriptors that
 * the StateAdapter executes via `_applyMerges()`.
 *
 * Merge policy (tie-breaking order):
 * 1. Deeper concept survives
 * 2. Same depth → earlier `dcterms:created` survives
 * 3. Same timestamp → more assertions (children + properties + relationships) survives
 *
 * @see Fandaws_v3.3_Specification.md Section 6.2
 */

import { isRestrictionNode } from '../../types/type-checks.js';
import { createConversationPrompt } from '../../types/conversation-prompt.js';

/**
 * Compute the depth of a concept in the hierarchy.
 * Root concepts have depth 0.
 *
 * @param {string} iri - Concept IRI
 * @param {Map<string, string|null>} iriToParent - Parent index
 * @returns {number}
 */
export function computeDepth(iri, iriToParent) {
  let depth = 0;
  let current = iriToParent.get(iri);
  while (current) {
    depth++;
    current = iriToParent.get(current);
  }
  return depth;
}

/**
 * Count assertions (children + properties + relationships) for a concept.
 *
 * @param {string} iri - Concept IRI
 * @param {object} graph - KnowledgeGraph
 * @param {object} indices - Graph indices
 * @returns {number}
 */
export function countAssertions(iri, graph, indices) {
  const childCount = (indices.iriToChildren.get(iri) || new Set()).size;
  const concept = (graph['fandaws:concepts'] || []).find((c) => c['@id'] === iri);
  if (!concept) return childCount;

  let propCount = 0;
  let relCount = 0;
  for (const entry of concept['rdfs:subClassOf'] || []) {
    if (isRestrictionNode(entry)) {
      if (entry['fandaws:restrictionKind'] === 'property') propCount++;
      if (entry['fandaws:restrictionKind'] === 'relationship') relCount++;
    }
  }

  return childCount + propCount + relCount;
}

/**
 * Determine which concept survives a merge using the three-tier policy.
 *
 * @param {string} iriA - First concept IRI
 * @param {string} iriB - Second concept IRI
 * @param {object} graph - KnowledgeGraph
 * @param {object} indices - Graph indices
 * @returns {{ winner: string, loser: string }}
 */
export function decideMergeWinner(iriA, iriB, graph, indices) {
  const depthA = computeDepth(iriA, indices.iriToParent);
  const depthB = computeDepth(iriB, indices.iriToParent);

  // Tier 1: Deeper concept survives
  if (depthA > depthB) return { winner: iriA, loser: iriB };
  if (depthB > depthA) return { winner: iriB, loser: iriA };

  // Tier 2: Earlier createdAt survives
  const concepts = graph['fandaws:concepts'] || [];
  const conceptA = concepts.find((c) => c['@id'] === iriA);
  const conceptB = concepts.find((c) => c['@id'] === iriB);

  const createdA = conceptA?.['dcterms:created'] || '';
  const createdB = conceptB?.['dcterms:created'] || '';

  if (createdA && createdB && createdA !== createdB) {
    return createdA < createdB
      ? { winner: iriA, loser: iriB }
      : { winner: iriB, loser: iriA };
  }

  // Tier 3: More assertions survives
  const assertionsA = countAssertions(iriA, graph, indices);
  const assertionsB = countAssertions(iriB, graph, indices);

  if (assertionsA >= assertionsB) return { winner: iriA, loser: iriB };
  return { winner: iriB, loser: iriA };
}

/**
 * Collect all concept IRIs within `maxDepth` levels up and down from `startIri`.
 *
 * @param {string} startIri - Starting concept IRI
 * @param {object} indices - Graph indices
 * @param {number} maxDepth - Maximum levels to search
 * @returns {Set<string>} IRIs within range (including startIri)
 */
function collectNeighborhood(startIri, indices, maxDepth) {
  const visited = new Set([startIri]);
  const queue = [{ iri: startIri, depth: 0 }];

  while (queue.length > 0) {
    const { iri, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    // Walk up
    const parent = indices.iriToParent.get(iri);
    if (parent && !visited.has(parent)) {
      visited.add(parent);
      queue.push({ iri: parent, depth: depth + 1 });
    }

    // Walk down
    const children = indices.iriToChildren.get(iri) || new Set();
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push({ iri: child, depth: depth + 1 });
      }
    }
  }

  return visited;
}

/**
 * Find duplicate concepts and produce merge descriptors.
 *
 * @param {string} conceptIri - IRI of newly created/modified concept
 * @param {object} graph - KnowledgeGraph
 * @param {object} indices - Graph indices
 * @param {object} [options={}]
 * @param {number} [options.deduplicationDepth=8] - Max levels to search
 * @param {number} [options.mergeReviewThreshold=5] - Children count triggering confirmation prompt
 * @returns {{ merges: object[], prompts: object[], scanned: number }}
 */
export function findDuplicates(conceptIri, graph, indices, options = {}) {
  const {
    deduplicationDepth = 8,
    mergeReviewThreshold = 5,
  } = options;

  const concepts = graph['fandaws:concepts'] || [];
  const targetConcept = concepts.find((c) => c['@id'] === conceptIri);
  if (!targetConcept) {
    return { merges: [], prompts: [], scanned: 0 };
  }

  const targetCanonical = targetConcept['skos:prefLabel'];
  if (!targetCanonical) {
    return { merges: [], prompts: [], scanned: 0 };
  }

  // Collect neighborhood
  const neighborhood = collectNeighborhood(conceptIri, indices, deduplicationDepth);

  // Find concepts with matching canonical label in neighborhood
  const matches = [];
  for (const iri of neighborhood) {
    if (iri === conceptIri) continue;
    const c = concepts.find((x) => x['@id'] === iri);
    if (c && c['skos:prefLabel'] === targetCanonical) {
      matches.push(iri);
    }
  }

  if (matches.length === 0) {
    return { merges: [], prompts: [], scanned: neighborhood.size };
  }

  const merges = [];
  const prompts = [];

  // Process matches iteratively (recursive merge)
  let currentWinner = conceptIri;
  for (const matchIri of matches) {
    const { winner, loser } = decideMergeWinner(currentWinner, matchIri, graph, indices);

    // Check large merge threshold
    const loserChildren = (indices.iriToChildren.get(loser) || new Set()).size;
    if (loserChildren > mergeReviewThreshold) {
      prompts.push(createConversationPrompt({
        promptType: 'confirmation',
        text: `Merging "${loser}" into "${winner}" would transfer ${loserChildren} children. Proceed?`,
        options: ['Yes, merge', 'No, keep separate'],
        context: {
          action: 'termidium-merge',
          source: loser,
          target: winner,
          childCount: loserChildren,
        },
      }));
      continue;
    }

    merges.push({
      'fandaws:source': loser,
      'fandaws:target': winner,
    });
    currentWinner = winner;
  }

  return { merges, prompts, scanned: neighborhood.size };
}
