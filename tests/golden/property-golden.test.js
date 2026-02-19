/**
 * Property Golden Corpus — data-driven tests.
 *
 * Each entry in property-corpus.json specifies an utterance,
 * optional graph setup, scope decisions, and expected outcomes.
 * This runner executes the full property pipeline for each entry.
 */

import { describe, it, expect } from '@jest/globals';
import { runPropertyPipeline } from '../../src/core/pipeline/property-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';
import corpus from './property-corpus.json' with { type: 'json' };

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

/** Pre-attach properties to concepts in the graph. */
function preAttachProperties(adapter, preAttach) {
  if (!preAttach || preAttach.length === 0) return;

  const graph = adapter.loadGraph(GRAPH_ID);
  for (const pa of preAttach) {
    const concept = graph['fandaws:concepts'].find((c) => c['@id'] === pa.concept);
    if (!concept) continue;
    const subClassOf = concept['rdfs:subClassOf'] || [];
    subClassOf.push({
      '@id': `fandaws:restriction/${pa.concept.split('/').pop()}--${pa.propertyLabel}`,
      '@type': 'owl:Restriction',
      'owl:onProperty': pa.propertyLabel,
      'fandaws:propertyLabel': pa.propertyLabel,
      'owl:hasValue': null,
      'fandaws:scope': 'concept-specific',
      'fandaws:attachedTo': pa.concept,
      'fandaws:restrictionKind': 'property',
    });
    concept['rdfs:subClassOf'] = subClassOf;
  }
  // Re-save to rebuild indices
  adapter.saveGraph(GRAPH_ID, graph);
}

/** Convert JSON object to Map for scopeDecisions. */
function toDecisionsMap(obj) {
  if (!obj) return new Map();
  return new Map(Object.entries(obj));
}

// ─────────────────────────────────────────────────────────
// Corpus-driven tests
// ─────────────────────────────────────────────────────────

describe('Property Golden Corpus', () => {
  for (const entry of corpus) {
    it(`[${entry.id}] ${entry.note}`, () => {
      const adapter = new InMemoryStateAdapter();
      setupGraph(adapter, entry.setup || []);
      preAttachProperties(adapter, entry.preAttach);

      const context = { stateAdapter: adapter, graphId: GRAPH_ID };
      const options = {
        scopeDecisions: toDecisionsMap(entry.scopeDecisions),
      };

      const result = runPropertyPipeline(entry.utterance, context, options);
      const exp = entry.expect;

      // ── Success / error ──
      if (exp.success !== undefined) {
        expect(result.success).toBe(exp.success);
      }

      if (exp.errorContains) {
        expect(result.error).toBe(true);
        expect(result.errorReason).toContain(exp.errorContains);
      }

      // ── No mutation (idempotent) ──
      if (exp.noMutation) {
        expect(result.mutation).toBeNull();
      }

      // ── Prompt count ──
      if (exp.promptCount !== undefined) {
        expect(result.prompts).toHaveLength(exp.promptCount);
      }

      // ── Prompt contains text ──
      if (exp.promptContains) {
        expect(result.prompts.length).toBeGreaterThan(0);
        const texts = result.prompts.map((p) => p['fandaws:text']);
        expect(texts.some((t) => t.toLowerCase().includes(exp.promptContains))).toBe(true);
      }

      // ── Prompt type ──
      if (exp.promptType) {
        expect(result.prompts.length).toBeGreaterThan(0);
        expect(result.prompts[0]['fandaws:promptType']).toBe(exp.promptType);
      }

      // ── Property attachment verification ──
      if (exp.propertyOn && exp.propertyLabel) {
        const graph = result.graph || adapter.loadGraph(GRAPH_ID);
        const concept = graph['fandaws:concepts'].find(
          (c) => c['@id'] === exp.propertyOn,
        );
        expect(concept).toBeDefined();

        const restrictions = (concept['rdfs:subClassOf'] || []).filter(
          (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property',
        );
        const matching = restrictions.filter(
          (r) => (r['fandaws:propertyLabel'] || r['owl:onProperty']) === exp.propertyLabel,
        );
        expect(matching.length).toBeGreaterThanOrEqual(1);

        // ── Scope check ──
        if (exp.scope) {
          expect(matching[0]['fandaws:scope']).toBe(exp.scope);
        }

        // ── owl:hasValue check ──
        if (exp.hasValue) {
          expect(matching[0]['owl:hasValue']).toBe(exp.hasValue);
        }
      }
    });
  }
});
