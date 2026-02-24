/**
 * resolveConceptByLabel — unified concept resolution with hidden-label fallback.
 *
 * Resolution chain:
 *   1. Exact canonical match (skos:prefLabel) → resolved
 *   2. Hidden label fallback (skos:hiddenLabel) → resolved or ambiguous
 *   3. No match → notFound
 *
 * @see docs/architecture/homonym-detection-duplicate-resolution-v1.3.md Section 7
 */

import { findConceptsByCanonical } from './knowledge-engine.js';

/**
 * Resolve a concept by label, with hidden-label fallback for homonyms.
 *
 * @param {string} label - Canonical label to resolve
 * @param {object} graph - KnowledgeGraph snapshot
 * @param {object} adapter - StateAdapter with findConceptsByHiddenLabel
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

  // Step 2: Hidden label fallback
  const graphId = graph['@id'];
  const hidden = adapter.findConceptsByHiddenLabel(label, graphId);
  if (hidden.length === 0) return { notFound: true };
  if (hidden.length === 1) return { resolved: hidden[0] };
  return { ambiguous: hidden, allowCreate };
}
