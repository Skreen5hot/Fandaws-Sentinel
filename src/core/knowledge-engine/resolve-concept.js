/**
 * resolveConceptByLabel — unified concept resolution with alt-label fallback.
 *
 * Resolution chain:
 *   1. Exact canonical match (skos:prefLabel) → resolved
 *   2. Alt label fallback (skos:altLabel) → resolved or ambiguous
 *   3. No match → notFound
 *
 * The alt-label fallback finds homonyms: when a user types a bare label
 * like "mouse", it finds both "mouse (rodent)" and "mouse (input device)"
 * because each carries "mouse" in its skos:altLabel array.
 *
 * @see docs/architecture/homonym-detection-duplicate-resolution-v1.3.md Section 7
 */

import { findConceptsByCanonical } from './knowledge-engine.js';

/**
 * Resolve a concept by label, with alt-label fallback for homonyms.
 *
 * @param {string} label - Canonical label to resolve
 * @param {object} graph - KnowledgeGraph snapshot
 * @param {object} adapter - StateAdapter with findConceptsByAltLabel
 * @param {object} [options={}]
 * @param {boolean} [options.allowCreate=false] - Allow "Neither — new concept" in disambiguation
 * @returns {{ resolved?: object, ambiguous?: object[], allowCreate?: boolean, notFound?: boolean }}
 */
export function resolveConceptByLabel(label, graph, adapter, options = {}) {
  const { allowCreate = false } = options;

  // Step 1: Exact canonical match
  const canonical = findConceptsByCanonical(label, graph);
  if (canonical.length === 1) return { resolved: canonical[0] };
  if (canonical.length > 1) return { ambiguous: canonical, allowCreate };

  // Step 2: Alt label fallback
  const graphId = graph['@id'];
  const altMatches = adapter.findConceptsByAltLabel(label, graphId);
  if (altMatches.length === 0) return { notFound: true };
  if (altMatches.length === 1) return { resolved: altMatches[0] };
  return { ambiguous: altMatches, allowCreate };
}
