/**
 * KnowledgeGraph — top-level container for all knowledge in a Fandaws session.
 *
 * A valid JSON-LD document that can be serialized, transmitted, and loaded as a single unit.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.4
 */

import { FANDAWS_CONTEXT } from './context.js';

/**
 * Create a new KnowledgeGraph.
 *
 * @param {object} params
 * @param {string} params.id - Graph IRI
 * @param {object[]} [params.concepts] - Concept nodes
 * @param {object[]} [params.relationships] - Relationship nodes
 * @param {object} [params.metadata] - Graph-level metadata
 * @returns {object} JSON-LD KnowledgeGraph document
 */
export function createKnowledgeGraph({
  id,
  concepts = [],
  relationships = [],
  metadata = {},
}) {
  return {
    '@context': FANDAWS_CONTEXT['@context'],
    '@id': id,
    '@type': 'fandaws:KnowledgeGraph',
    'fandaws:concepts': concepts,
    'fandaws:relationships': relationships,
    'fandaws:metadata': {
      'fandaws:createdAt': new Date().toISOString(),
      'fandaws:version': '0.1.0',
      ...metadata,
    },
  };
}
