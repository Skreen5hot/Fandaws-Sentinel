/**
 * Conversation Simulation — end-to-end multi-turn tests.
 *
 * Each corpus entry defines a sequence of turns processed through
 * SynchronousOrchestrationAdapter, accumulating graph state.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { NullIntegrationAdapter } from '../../src/adapters/integration/null-integration-adapter.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';

const corpusPath = new URL(
  '../golden/conversation-simulation-corpus.json',
  import.meta.url,
);
const corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'));

const GRAPH_ID = 'fandaws:graph/test';

// ── Helpers ──

/** Strip timestamps from graph JSON for determinism comparison. */
function stripTimestamps(json) {
  return json.replace(/"dcterms:created":"[^"]*"/g, '"dcterms:created":"STRIPPED"')
    .replace(/"dcterms:modified":[^,}]*/g, '"dcterms:modified":"STRIPPED"')
    .replace(/"fandaws:createdAt":"[^"]*"/g, '"fandaws:createdAt":"STRIPPED"');
}

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

function assertTurnExpectations(result, exp, stateAdapter) {
  if (exp.success !== undefined) {
    expect(result.success).toBe(exp.success);
  }
  if (exp.errorContains) {
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain(exp.errorContains);
  }
  if (exp.conceptCount !== undefined) {
    const graph = result.graph || stateAdapter.loadGraph(GRAPH_ID);
    expect(graph['fandaws:concepts']).toHaveLength(exp.conceptCount);
  }
  if (exp.mutationNull) {
    expect(result.mutation).toBeNull();
  }
  if (exp.propertyOn) {
    const graph = stateAdapter.loadGraph(GRAPH_ID);
    const concept = graph['fandaws:concepts'].find(
      (c) => c['@id'] === exp.propertyOn,
    );
    expect(concept).toBeDefined();
    const props = (concept['rdfs:subClassOf'] || []).filter(
      (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property',
    );
    const match = props.find((p) => p['owl:onProperty'] === exp.propertyLabel);
    expect(match).toBeDefined();
  }
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
    }
  }
}

// ── Corpus-driven tests ──

describe('Conversation Simulation', () => {
  it(`corpus has 10+ entries (has ${corpus.length})`, () => {
    expect(corpus.length).toBeGreaterThanOrEqual(10);
  });

  for (const entry of corpus) {
    if (entry.determinism) {
      it(`[${entry.id}] ${entry.note}`, () => {
        const graphs = [];

        for (let run = 0; run < 3; run++) {
          const ctx = freshContext();
          const orchestrator = new SynchronousOrchestrationAdapter();

          for (const turn of entry.turns) {
            orchestrator.runPipeline(
              turn.utterance,
              ctx,
              prepareOptions(turn.options),
            );
          }
          graphs.push(stripTimestamps(JSON.stringify(ctx.stateAdapter.loadGraph(GRAPH_ID))));
        }

        expect(graphs[0]).toBe(graphs[1]);
        expect(graphs[1]).toBe(graphs[2]);
      });
      continue;
    }

    it(`[${entry.id}] ${entry.note}`, () => {
      const ctx = freshContext();
      const orchestrator = new SynchronousOrchestrationAdapter();

      for (const turn of entry.turns) {
        const result = orchestrator.runPipeline(
          turn.utterance,
          ctx,
          prepareOptions(turn.options),
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

  // ── Explicit non-corpus tests ──

  it('full pipeline runs alongside NullIntegrationAdapter (offline mode)', () => {
    const nia = new NullIntegrationAdapter();
    expect(nia.lookupDictionary('dog')['@type']).toBe('fandaws:DeferredResult');

    const ctx = freshContext();
    const orchestrator = new SynchronousOrchestrationAdapter();
    const result = orchestrator.runPipeline('A dog is an animal', ctx);
    expect(result.success).toBe(true);
  });

  it('pipeline latency is under 40ms for non-disambiguation assertions', () => {
    const ctx = freshContext();
    const orchestrator = new SynchronousOrchestrationAdapter();

    const start = performance.now();
    orchestrator.runPipeline('A dog is an animal', ctx);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(40);
  });
});
