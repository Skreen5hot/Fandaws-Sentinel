/**
 * Relationship Golden Corpus — data-driven tests.
 *
 * Each entry in relationship-golden-corpus.json specifies an utterance,
 * optional graph setup (with relationships), and expected outcomes.
 * This runner executes the full relationship pipeline for each entry.
 */

import { describe, it, expect } from '@jest/globals';
import { runRelationshipPipeline } from '../../src/core/pipeline/relationship-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { createRelationship } from '../../src/types/relationship.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';
import corpus from './relationship-golden-corpus.json' with { type: 'json' };

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const GRAPH_ID = 'fandaws:graph/test';

function setupGraph(adapter, setupEntries) {
  const concepts = setupEntries.map((entry) => {
    const c = createConcept({
      id: entry.id,
      label: entry.displayLabel,
      prefLabel: entry.canonicalLabel,
      broader: entry.parent || null,
    });

    // Pre-attach relationships if specified
    if (entry.relationships && entry.relationships.length > 0) {
      c['rdfs:subClassOf'] = entry.relationships.map((r) =>
        createRelationship({
          id: r.id,
          verbIri: r.verb,
          subject: entry.id,
          object: r.object,
        }),
      );
    }
    return c;
  });
  adapter.saveGraph(GRAPH_ID, createKnowledgeGraph({ id: GRAPH_ID, concepts }));
}

// ─────────────────────────────────────────────────────────
// Corpus-driven tests
// ─────────────────────────────────────────────────────────

describe('Relationship Golden Corpus', () => {
  for (const entry of corpus) {
    it(`[${entry.id}] ${entry.note}`, () => {
      const adapter = new InMemoryStateAdapter();
      setupGraph(adapter, entry.setup || []);

      const context = { stateAdapter: adapter, graphId: GRAPH_ID };
      const options = entry.options || {};

      const result = runRelationshipPipeline(entry.utterance, context, options);
      const exp = entry.expect;

      // ── Success / error ──
      if (exp.success !== undefined) {
        expect(result.success).toBe(exp.success);
      }

      if (exp.errorContains) {
        expect(result.error).toBe(true);
        expect(result.errorReason).toContain(exp.errorContains);
      }

      // ── Concept count ──
      if (exp.conceptCount !== undefined) {
        const graph = result.graph || adapter.loadGraph(GRAPH_ID);
        expect(graph['fandaws:concepts']).toHaveLength(exp.conceptCount);
      }

      // ── Relationship count (on entire graph) ──
      if (exp.relationshipCount !== undefined) {
        const graph = result.graph || adapter.loadGraph(GRAPH_ID);
        let relCount = 0;
        for (const c of graph['fandaws:concepts'] || []) {
          for (const entry of c['rdfs:subClassOf'] || []) {
            if (isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'relationship') {
              relCount++;
            }
          }
        }
        expect(relCount).toBe(exp.relationshipCount);
      }

      // ── Normalized verb ──
      if (exp.normalizedVerb !== undefined) {
        expect(result.normalizedVerb).toBe(exp.normalizedVerb);
      }

      // ── Has descriptions ──
      if (exp.hasDescriptions) {
        expect(result.descriptions.length).toBeGreaterThan(0);
      }

      // ── Sub-restriction ──
      if (exp.hasSubRestrictionOf) {
        const graph = result.graph || adapter.loadGraph(GRAPH_ID);
        let found = false;
        for (const c of graph['fandaws:concepts'] || []) {
          for (const r of c['rdfs:subClassOf'] || []) {
            if (
              isRestrictionNode(r) &&
              r['fandaws:restrictionKind'] === 'relationship' &&
              r['fandaws:subRestrictionOf']
            ) {
              found = true;
            }
          }
        }
        expect(found).toBe(true);
      }
    });
  }
});
