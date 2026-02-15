/**
 * Scope Narrowing — determines correct hierarchy level for property attachment.
 *
 * Pure function library: no I/O, no adapter calls.
 *
 * When a user says "A dog has fur," the system walks the ancestor chain
 * (dog → mammal → animal → living thing) asking "Does X also have fur?"
 * until the answer is "no," then attaches at the last "yes."
 *
 * The Leap Check optimization probes the parent and root boundaries first,
 * reducing prompts from O(d) to O(log d) for deep hierarchies.
 *
 * @see Fandaws_v3.3_Specification.md Section 5.3.2
 */

import { createConversationPrompt } from '../../types/conversation-prompt.js';

/**
 * Walk from a concept upward through the iriToParent index,
 * returning the ordered ancestor chain [parent, grandparent, ..., root].
 *
 * @param {string} subjectIri - Starting concept IRI
 * @param {Map<string, string|null>} iriToParent - Parent index
 * @returns {string[]} Ancestor IRIs in order [parent, ..., root]
 */
export function buildAncestorChain(subjectIri, iriToParent) {
  const chain = [];
  const visited = new Set();
  visited.add(subjectIri);

  let current = iriToParent.get(subjectIri) ?? null;

  while (current != null) {
    if (visited.has(current)) break; // cycle guard
    chain.push(current);
    visited.add(current);
    current = iriToParent.get(current) ?? null;
  }

  return chain;
}

/**
 * Look up the rdfs:label for a concept IRI from the graph.
 *
 * @param {string} iri
 * @param {object} graph - KnowledgeGraph
 * @returns {string} Label or last segment of IRI as fallback
 */
function labelFor(iri, graph) {
  const concepts = graph['fandaws:concepts'] || [];
  const concept = concepts.find((c) => c['@id'] === iri);
  if (concept) return concept['rdfs:label'];
  // Fallback: extract last segment of IRI
  const parts = iri.split('/');
  return parts[parts.length - 1];
}

/**
 * Create a scope-narrowing prompt asking whether a concept also has a property.
 *
 * @param {string} conceptIri - Concept being asked about
 * @param {string} propertyLabel - The property term (e.g., "fur")
 * @param {object} graph - KnowledgeGraph (for label lookup)
 * @returns {object} ConversationPrompt
 */
function makeScopePrompt(conceptIri, propertyLabel, graph) {
  const conceptLabel = labelFor(conceptIri, graph);
  return createConversationPrompt({
    promptType: 'scopeNarrowing',
    text: `Does "${conceptLabel}" also have "${propertyLabel}"?`,
    options: ['yes', 'no'],
    context: {
      action: 'scopeNarrowing',
      conceptIri,
      propertyLabel,
    },
  });
}

/**
 * Determine the correct attachment point for a property via scope narrowing.
 *
 * @param {string} subjectIri - The concept the user originally mentioned
 * @param {string[]} ancestorChain - Ordered [parent, grandparent, ..., root]
 * @param {string} propertyLabel - The property term (e.g., "fur")
 * @param {Map<string, boolean>} decisions - Accumulated yes/no answers keyed by IRI
 * @param {object} graph - KnowledgeGraph (for label lookups)
 * @param {object} [options={}]
 * @param {boolean} [options.leapCheckEnabled=true] - Use Leap Check optimization
 * @returns {{ resolved: boolean, attachmentIri: string|null, prompts: object[] }}
 */
export function narrowScope(subjectIri, ancestorChain, propertyLabel, decisions, graph, options = {}) {
  const { leapCheckEnabled = true } = options;

  // No ancestors → attach at subject
  if (ancestorChain.length === 0) {
    return { resolved: true, attachmentIri: subjectIri, prompts: [] };
  }

  const parent = ancestorChain[0];
  const root = ancestorChain[ancestorChain.length - 1];

  // Single ancestor → just ask parent
  if (ancestorChain.length === 1) {
    if (!decisions.has(parent)) {
      return { resolved: false, attachmentIri: null, prompts: [makeScopePrompt(parent, propertyLabel, graph)] };
    }
    return {
      resolved: true,
      attachmentIri: decisions.get(parent) ? parent : subjectIri,
      prompts: [],
    };
  }

  // Multiple ancestors: Leap Check or full walk
  if (leapCheckEnabled) {
    return leapCheck(subjectIri, ancestorChain, propertyLabel, decisions, graph);
  }
  return fullWalk(subjectIri, ancestorChain, propertyLabel, decisions, graph);
}

/**
 * Leap Check: probe parent + root boundaries first, then binary search.
 * O(log d) prompts for deep hierarchies.
 */
function leapCheck(subjectIri, ancestorChain, propertyLabel, decisions, graph) {
  const parent = ancestorChain[0];
  const root = ancestorChain[ancestorChain.length - 1];

  // Phase 1: Probe both boundaries
  const parentDecided = decisions.has(parent);
  const rootDecided = decisions.has(root);

  if (!parentDecided && !rootDecided) {
    // Ask both boundaries in one round
    return {
      resolved: false,
      attachmentIri: null,
      prompts: [
        makeScopePrompt(parent, propertyLabel, graph),
        makeScopePrompt(root, propertyLabel, graph),
      ],
    };
  }

  if (!parentDecided) {
    return {
      resolved: false,
      attachmentIri: null,
      prompts: [makeScopePrompt(parent, propertyLabel, graph)],
    };
  }

  // Parent answered
  const parentYes = decisions.get(parent);

  // Parent = no → attach at subject
  if (!parentYes) {
    return { resolved: true, attachmentIri: subjectIri, prompts: [] };
  }

  // Parent = yes, root not yet asked
  if (!rootDecided) {
    return {
      resolved: false,
      attachmentIri: null,
      prompts: [makeScopePrompt(root, propertyLabel, graph)],
    };
  }

  // Parent = yes, root answered
  const rootYes = decisions.get(root);

  // Both yes → attach at root
  if (rootYes) {
    return { resolved: true, attachmentIri: root, prompts: [] };
  }

  // Parent = yes, root = no → binary search between them
  return binarySearch(ancestorChain, propertyLabel, decisions, graph);
}

/**
 * Binary search within the ancestor chain to find the transition point
 * where "yes" turns to "no." The attachment goes to the last "yes."
 *
 * The chain is [parent(0), ..., root(n-1)].
 * We know chain[0] = yes and chain[n-1] = no.
 * Find the highest index i where decisions[chain[i]] = yes.
 */
function binarySearch(ancestorChain, propertyLabel, decisions, graph) {
  // Find bounds: lo = lowest known-yes index, hi = highest known-no index
  let lo = 0;
  let hi = ancestorChain.length - 1;

  // Tighten bounds using any existing decisions
  for (let i = 0; i < ancestorChain.length; i++) {
    const iri = ancestorChain[i];
    if (decisions.has(iri)) {
      if (decisions.get(iri)) {
        lo = Math.max(lo, i); // yes → raise lower bound
      } else {
        hi = Math.min(hi, i); // no → lower upper bound
      }
    }
  }

  // If adjacent, lo is our answer
  if (hi - lo <= 1) {
    return { resolved: true, attachmentIri: ancestorChain[lo], prompts: [] };
  }

  // Probe midpoint
  const mid = Math.floor((lo + hi) / 2);
  const midIri = ancestorChain[mid];

  if (!decisions.has(midIri)) {
    return {
      resolved: false,
      attachmentIri: null,
      prompts: [makeScopePrompt(midIri, propertyLabel, graph)],
    };
  }

  // Midpoint already decided — recurse (tighten bounds)
  // This shouldn't normally happen since we just checked, but be safe
  return binarySearch(ancestorChain, propertyLabel, decisions, graph);
}

/**
 * Full walk: prompt each ancestor in order, stop at first "no."
 * O(d) prompts. Used when Leap Check is disabled.
 */
function fullWalk(subjectIri, ancestorChain, propertyLabel, decisions, graph) {
  for (const iri of ancestorChain) {
    if (!decisions.has(iri)) {
      return {
        resolved: false,
        attachmentIri: null,
        prompts: [makeScopePrompt(iri, propertyLabel, graph)],
      };
    }
    if (!decisions.get(iri)) {
      // First "no" — attach at the previous "yes" or subject
      const idx = ancestorChain.indexOf(iri);
      const attachmentIri = idx === 0 ? subjectIri : ancestorChain[idx - 1];
      return { resolved: true, attachmentIri, prompts: [] };
    }
  }

  // All ancestors said yes → attach at root
  return { resolved: true, attachmentIri: ancestorChain[ancestorChain.length - 1], prompts: [] };
}
