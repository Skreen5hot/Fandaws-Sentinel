/**
 * Classification Golden Corpus — data-driven tests.
 *
 * Each entry in classification-corpus.json specifies an utterance,
 * optional graph setup, and expected outcomes. This runner executes
 * the full classification pipeline for each entry.
 *
 * v2.1: Uses standard OWL/SKOS/PROV vocabulary.
 *        Depth is computed, not stored — depth assertions removed.
 */

import { describe, it, expect } from '@jest/globals';
import { runClassificationPipeline } from '../../src/core/pipeline/classification-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import corpus from './classification-corpus.json' with { type: 'json' };

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const GRAPH_ID = 'fandaws:graph/test';

function setupGraph(adapter, setupEntries) {
  const concepts = setupEntries.map((entry) =>
    createConcept({
      id: entry.id,
      label: entry.displayLabel,
      prefLabel: entry.canonicalLabel,
      broader: entry.parent || null,
    }),
  );
  adapter.saveGraph(GRAPH_ID, createKnowledgeGraph({ id: GRAPH_ID, concepts }));
}

// ─────────────────────────────────────────────────────────
// Corpus-driven tests
// ─────────────────────────────────────────────────────────

describe('Classification Golden Corpus', () => {
  for (const entry of corpus) {
    it(`[${entry.id}] ${entry.note}`, () => {
      const adapter = new InMemoryStateAdapter();
      setupGraph(adapter, entry.setup || []);

      const context = { stateAdapter: adapter, graphId: GRAPH_ID };
      const options = entry.options || {};

      const result = runClassificationPipeline(
        entry.utterance,
        context,
        options,
      );

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

      // ── Parent link verification ──
      if (exp.parentLink) {
        const graph = result.graph || adapter.loadGraph(GRAPH_ID);
        const concepts = graph['fandaws:concepts'];

        const subjectCanonical = exp.subjectCanonical;
        const objectCanonical = exp.objectCanonical;

        if (subjectCanonical && objectCanonical) {
          const subject = concepts.find(
            (c) => c['skos:prefLabel'] === subjectCanonical,
          );
          const object = concepts.find(
            (c) => c['skos:prefLabel'] === objectCanonical,
          );
          expect(subject).toBeDefined();
          expect(object).toBeDefined();
          expect(subject['skos:broader']).toBe(object['@id']);
        }
      }

      // ── Subject IRI ──
      if (exp.subjectIri) {
        const graph = result.graph || adapter.loadGraph(GRAPH_ID);
        const subject = graph['fandaws:concepts'].find(
          (c) => c['@id'] === exp.subjectIri,
        );
        expect(subject).toBeDefined();
      }

      // ── Mutation null (no-op) ──
      if (exp.mutationNull) {
        expect(result.mutation).toBeNull();
      }

      // ── Prompts ──
      if (exp.promptCount !== undefined) {
        expect(result.prompts).toHaveLength(exp.promptCount);
      }

      if (exp.promptType) {
        expect(result.prompts[0]['fandaws:promptType']).toBe(exp.promptType);
      }

      // ── Scope resolutions ──
      if (exp.scopeResolutionsNull) {
        expect(result.scopeResolutions).toBeNull();
      }

      // ── Descriptions ──
      if (exp.hasDescriptions) {
        expect(result.descriptions.length).toBeGreaterThan(0);
      }
    });
  }
});
