/**
 * Validation Golden Corpus — expert scenario tests.
 *
 * Data-driven multi-turn tests loaded from validation-corpus.json.
 * Extends the standard conversation simulation assertions with:
 *   - noReclassification: verifies a concept was freshly created (not moved)
 *   - serializationRoundtrip: verifies graph survives JSON serialize/deserialize
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';

const corpusPath = new URL('./validation-corpus.json', import.meta.url);
const corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'));

const GRAPH_ID = 'fandaws:graph/test';

// ── Helpers ──

function freshContext() {
  const stateAdapter = new InMemoryStateAdapter();
  stateAdapter.saveGraph(
    GRAPH_ID,
    createKnowledgeGraph({ id: GRAPH_ID, concepts: [] }),
  );
  return { stateAdapter, graphId: GRAPH_ID };
}

function toScopeDecisions(obj) {
  if (!obj) return undefined;
  return new Map(Object.entries(obj));
}

function prepareOptions(turnOptions) {
  const opts = { ...turnOptions };
  if (opts.scopeDecisions) {
    opts.scopeDecisions = toScopeDecisions(opts.scopeDecisions);
  }
  return opts;
}

/**
 * Detect whether a pipeline result represents a reclassification.
 *
 * Reclassification is signaled in two ways:
 * 1. Prompted: result.prompts contains a reclassificationConfirmation
 * 2. Silent: mutation contains only modifications (skos:broader change),
 *    no additions — meaning an existing concept was moved, not created.
 */
function isReclassification(result) {
  // Prompted reclassification
  if (result.prompts && result.prompts.some(
    (p) => p['fandaws:promptType'] === 'reclassificationConfirmation',
  )) {
    return true;
  }

  // Silent reclassification: mutation has modifications changing skos:broader
  // but no additions (no new concept created)
  if (result.mutation) {
    const mods = result.mutation['fandaws:modifications'] || [];
    const adds = result.mutation['fandaws:additions'] || [];
    const hasBroaderMod = mods.some(
      (m) => m['fandaws:field'] === 'skos:broader',
    );
    if (hasBroaderMod && adds.length === 0) {
      return true;
    }
  }

  return false;
}

function assertTurnExpectations(result, exp, stateAdapter) {
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
    const graph = result.graph || stateAdapter.loadGraph(GRAPH_ID);
    expect(graph['fandaws:concepts']).toHaveLength(exp.conceptCount);
  }

  // ── Mutation null (no-op) ──
  if (exp.mutationNull) {
    expect(result.mutation).toBeNull();
  }

  // ── Property assertions ──
  if (exp.propertyOn) {
    const graph = stateAdapter.loadGraph(GRAPH_ID);
    const concept = graph['fandaws:concepts'].find(
      (c) => c['@id'] === exp.propertyOn,
    );
    expect(concept).toBeDefined();
    const props = (concept['rdfs:subClassOf'] || []).filter(
      (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property',
    );
    const match = props.find(
      (p) => (p['fandaws:propertyLabel'] || p['owl:onProperty']) === exp.propertyLabel,
    );
    expect(match).toBeDefined();
  }

  // ── Concept parent + noReclassification assertions ──
  if (exp.concepts) {
    const graph = stateAdapter.loadGraph(GRAPH_ID);
    for (const [label, info] of Object.entries(exp.concepts)) {
      const c = graph['fandaws:concepts'].find(
        (x) => x['skos:prefLabel'] === label,
      );
      expect(c).toBeDefined();

      if (info.parent === null) {
        expect(c['skos:broader']).toBeNull();
      } else if (info.parent) {
        const parent = graph['fandaws:concepts'].find(
          (x) => x['skos:prefLabel'] === info.parent,
        );
        expect(parent).toBeDefined();
        expect(c['skos:broader']).toBe(parent['@id']);
      }

      // noReclassification: verify this turn did NOT reclassify
      if (info.noReclassification === true) {
        expect(isReclassification(result)).toBe(false);
      }
      // noReclassification: false means reclassification DID happen
      if (info.noReclassification === false) {
        expect(isReclassification(result)).toBe(true);
      }
    }
  }

  // ── Serialization roundtrip ──
  if (exp.serializationRoundtrip) {
    const graph = stateAdapter.loadGraph(GRAPH_ID);
    const serialized = JSON.stringify(graph);
    const deserialized = JSON.parse(serialized);

    // Structural equality: every concept, property, and relationship survives
    expect(deserialized['fandaws:concepts']).toHaveLength(
      graph['fandaws:concepts'].length,
    );

    for (const original of graph['fandaws:concepts']) {
      const restored = deserialized['fandaws:concepts'].find(
        (c) => c['@id'] === original['@id'],
      );
      expect(restored).toBeDefined();
      expect(restored['skos:prefLabel']).toBe(original['skos:prefLabel']);
      expect(restored['skos:broader']).toBe(original['skos:broader']);
      expect(restored['rdfs:label']).toBe(original['rdfs:label']);

      // Restriction nodes (properties/relationships) survive
      const originalRestrictions = original['rdfs:subClassOf'] || [];
      const restoredRestrictions = restored['rdfs:subClassOf'] || [];
      expect(restoredRestrictions).toHaveLength(originalRestrictions.length);
    }
  }
}

/**
 * Run a pipeline turn, auto-resolving scope narrowing prompts.
 *
 * When a property turn returns a scopeNarrowing prompt and no explicit
 * scopeDecisions were provided, re-run with all ancestors answered "no"
 * (attach property to subject). This lets corpus authors skip internal
 * IRI details for scope decisions.
 */
function runTurnWithAutoScope(orchestrator, utterance, ctx, options) {
  let result = orchestrator.runPipeline(utterance, ctx, prepareOptions(options));

  if (
    !result.success &&
    result.prompts &&
    result.prompts.length > 0 &&
    result.prompts[0]['fandaws:promptType'] === 'scopeNarrowing' &&
    !(options && options.scopeDecisions)
  ) {
    // Collect all ancestor IRIs from the prompt context and answer "no"
    const scopeDecisions = new Map();
    for (const prompt of result.prompts) {
      const conceptIri = prompt['fandaws:context']?.conceptIri;
      if (conceptIri) {
        scopeDecisions.set(conceptIri, false);
      }
    }
    const retryOptions = { ...options, scopeDecisions };
    result = orchestrator.runPipeline(utterance, ctx, retryOptions);
  }

  return result;
}

// ── Corpus-driven tests ──

describe('Validation Golden Corpus', () => {
  it(`corpus has entries (has ${corpus.length})`, () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  for (const entry of corpus) {
    it(`[${entry.id}] ${entry.note}`, () => {
      const ctx = freshContext();
      const orchestrator = new SynchronousOrchestrationAdapter();

      for (const turn of entry.turns) {
        const result = runTurnWithAutoScope(
          orchestrator,
          turn.utterance,
          ctx,
          turn.options,
        );
        if (turn.expect) {
          assertTurnExpectations(result, turn.expect, ctx.stateAdapter);
        }
      }

      if (entry.finalExpect) {
        const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
        if (entry.finalExpect.conceptCount !== undefined) {
          expect(graph['fandaws:concepts']).toHaveLength(
            entry.finalExpect.conceptCount,
          );
        }
        if (entry.finalExpect.integrity) {
          const ghosts = ctx.stateAdapter.verifyIntegrity(GRAPH_ID);
          expect(ghosts).toHaveLength(0);
        }
      }
    });
  }
});
