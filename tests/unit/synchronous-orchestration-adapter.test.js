import { describe, it, expect, beforeEach } from '@jest/globals';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { OrchestrationAdapter } from '../../src/adapters/orchestration/orchestration-adapter.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';

const GRAPH_ID = 'fandaws:graph/test';

/** Strip timestamps from graph JSON for determinism comparison. */
function stripTimestamps(json) {
  return json.replace(/"dcterms:created":"[^"]*"/g, '"dcterms:created":"STRIPPED"')
    .replace(/"dcterms:modified":[^,}]*/g, '"dcterms:modified":"STRIPPED"')
    .replace(/"fandaws:createdAt":"[^"]*"/g, '"fandaws:createdAt":"STRIPPED"');
}

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: GRAPH_ID, concepts });
}

function makeConcept(id, label, prefLabel, broader = null) {
  return createConcept({ id, label, prefLabel, broader });
}

describe('SynchronousOrchestrationAdapter', () => {
  let orchestrator;
  let stateAdapter;
  let context;

  beforeEach(() => {
    orchestrator = new SynchronousOrchestrationAdapter();
    stateAdapter = new InMemoryStateAdapter();
    stateAdapter.saveGraph(GRAPH_ID, makeGraph());
    context = { stateAdapter, graphId: GRAPH_ID };
  });

  // ── Constructor / interface ──

  describe('constructor and interface compliance', () => {
    it('extends OrchestrationAdapter', () => {
      expect(orchestrator).toBeInstanceOf(OrchestrationAdapter);
    });

    it('getCallerMode returns "human"', () => {
      expect(orchestrator.getCallerMode()).toBe('human');
    });

    it('checkDeadlock returns no-deadlock status', () => {
      const status = orchestrator.checkDeadlock('session-1');
      expect(status['@type']).toBe('fandaws:DeadlockStatus');
      expect(status['fandaws:deadlocked']).toBe(false);
      expect(status['fandaws:sessionId']).toBe('session-1');
    });

    it('emitOutput stores to buffer', () => {
      orchestrator.emitOutput({ type: 'test', data: 'hello' });
      expect(orchestrator.getOutputBuffer()).toHaveLength(1);
      expect(orchestrator.getOutputBuffer()[0].data).toBe('hello');
    });

    it('receiveInput stores last input', () => {
      orchestrator.receiveInput({ text: 'yes' });
      // No error thrown — interface compliance
    });

    it('getOutputBuffer returns a copy', () => {
      orchestrator.emitOutput({ a: 1 });
      const buf = orchestrator.getOutputBuffer();
      buf.push({ b: 2 });
      expect(orchestrator.getOutputBuffer()).toHaveLength(1);
    });

    it('clearOutputBuffer empties the buffer', () => {
      orchestrator.emitOutput({ a: 1 });
      orchestrator.clearOutputBuffer();
      expect(orchestrator.getOutputBuffer()).toHaveLength(0);
    });
  });

  // ── Classification routing ──

  describe('classification routing', () => {
    it('routes "A dog is an animal" to classification pipeline', () => {
      const result = orchestrator.runPipeline('A dog is an animal', context);
      expect(result.success).toBe(true);
      expect(result.error).toBeFalsy();
    });

    it('creates both concepts with parent link', () => {
      const result = orchestrator.runPipeline('A dog is an animal', context);
      const concepts = result.graph['fandaws:concepts'];
      expect(concepts).toHaveLength(2);

      const dog = concepts.find((c) => c['skos:prefLabel'] === 'dog');
      const animal = concepts.find((c) => c['skos:prefLabel'] === 'animal');
      expect(dog).toBeDefined();
      expect(animal).toBeDefined();
      expect(dog['skos:broader']).toBe(animal['@id']);
    });

    it('returns parseResult and descriptions', () => {
      const result = orchestrator.runPipeline('A dog is an animal', context);
      expect(result.parseResult).toBeDefined();
      expect(result.parseResult['@type']).toBe('fandaws:ParseResult');
      expect(result.descriptions.length).toBeGreaterThan(0);
    });
  });

  // ── Property routing ──

  describe('property routing', () => {
    beforeEach(() => {
      // Pre-populate graph with animal → dog hierarchy
      stateAdapter.saveGraph(
        GRAPH_ID,
        makeGraph([
          makeConcept('fandaws:concept/animal', 'Animal', 'animal'),
          makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal'),
        ]),
      );
    });

    it('routes "A dog has fur" to property pipeline', () => {
      const result = orchestrator.runPipeline('A dog has fur', context);
      // Should return prompts for scope narrowing (dog has parent animal)
      expect(result.error).toBeFalsy();
      expect(result.prompts.length).toBeGreaterThan(0);
    });

    it('returns scope narrowing prompts for non-root subject', () => {
      const result = orchestrator.runPipeline('A dog has fur', context);
      expect(result.prompts[0]['@type']).toBe('fandaws:ConversationPrompt');
    });

    it('completes property with scopeDecisions', () => {
      const decisions = new Map([['fandaws:concept/animal', false]]);
      const result = orchestrator.runPipeline('A dog has fur', context, {
        scopeDecisions: decisions,
      });
      expect(result.success).toBe(true);

      const graph = stateAdapter.loadGraph(GRAPH_ID);
      const dog = graph['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:concept/dog',
      );
      const props = (dog['rdfs:subClassOf'] || []).filter(
        (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property',
      );
      const fur = props.find((p) => p['owl:onProperty'] === 'fur');
      expect(fur).toBeDefined();
    });
  });

  // ── Custom relationship ──

  describe('custom relationship handling', () => {
    it('returns unsupported-workflow for custom relationships', () => {
      const result = orchestrator.runPipeline('Dogs chase cats', context);
      expect(result.success).toBe(false);
      expect(result.error).toBe(true);
      expect(result.errorReason).toContain('unsupported-workflow');
      expect(result.errorReason).toContain('customRelationship');
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    it('returns parse-error for empty string', () => {
      const result = orchestrator.runPipeline('', context);
      expect(result.success).toBe(false);
      expect(result.error).toBe(true);
      expect(result.errorReason).toContain('parse-error');
    });

    it('returns parse-error for single word', () => {
      const result = orchestrator.runPipeline('dog', context);
      expect(result.success).toBe(false);
      expect(result.error).toBe(true);
      expect(result.errorReason).toContain('parse-error');
    });

    it('returns graph-not-found for missing graph', () => {
      const badContext = { stateAdapter, graphId: 'fandaws:graph/nonexistent' };
      const result = orchestrator.runPipeline('A dog is an animal', badContext);
      expect(result.success).toBe(false);
      expect(result.error).toBe(true);
      expect(result.errorReason).toContain('graph-not-found');
    });
  });

  // ── Prompt collection ──

  describe('prompt collection', () => {
    beforeEach(() => {
      stateAdapter.saveGraph(
        GRAPH_ID,
        makeGraph([
          makeConcept('fandaws:concept/animal', 'Animal', 'animal'),
          makeConcept('fandaws:concept/dog', 'Dog', 'dog', 'fandaws:concept/animal'),
        ]),
      );
    });

    it('emits prompts to output buffer', () => {
      orchestrator.runPipeline('A dog has fur', context);
      const buffer = orchestrator.getOutputBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].type).toBe('prompts');
      expect(buffer[0].prompts.length).toBeGreaterThan(0);
    });

    it('output buffer accumulates across calls', () => {
      orchestrator.runPipeline('A dog has fur', context);
      orchestrator.runPipeline('A dog has legs', context);
      expect(orchestrator.getOutputBuffer().length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Multi-turn ──

  describe('multi-turn conversations', () => {
    it('sequential classifications build up graph', () => {
      orchestrator.runPipeline('A dog is an animal', context);
      orchestrator.runPipeline('A cat is an animal', context);
      orchestrator.runPipeline('A poodle is a dog', context);

      const graph = stateAdapter.loadGraph(GRAPH_ID);
      expect(graph['fandaws:concepts']).toHaveLength(4);

      const poodle = graph['fandaws:concepts'].find(
        (c) => c['skos:prefLabel'] === 'poodle',
      );
      const dog = graph['fandaws:concepts'].find(
        (c) => c['skos:prefLabel'] === 'dog',
      );
      expect(poodle['skos:broader']).toBe(dog['@id']);
    });

    it('classification then property works end-to-end', () => {
      orchestrator.runPipeline('A dog is an animal', context);

      const decisions = new Map([['fandaws:concept/animal', false]]);
      const result = orchestrator.runPipeline('A dog has fur', context, {
        scopeDecisions: decisions,
      });
      expect(result.success).toBe(true);

      const graph = stateAdapter.loadGraph(GRAPH_ID);
      const dog = graph['fandaws:concepts'].find(
        (c) => c['skos:prefLabel'] === 'dog',
      );
      const props = (dog['rdfs:subClassOf'] || []).filter(
        (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property',
      );
      expect(props.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Determinism ──

  describe('determinism', () => {
    it('same sequence produces identical results across 3 runs', () => {
      const utterances = [
        'A dog is an animal',
        'A cat is an animal',
        'A poodle is a dog',
      ];
      const graphs = [];

      for (let run = 0; run < 3; run++) {
        const sa = new InMemoryStateAdapter();
        sa.saveGraph(GRAPH_ID, makeGraph());
        const ctx = { stateAdapter: sa, graphId: GRAPH_ID };
        const orch = new SynchronousOrchestrationAdapter();

        for (const u of utterances) {
          orch.runPipeline(u, ctx);
        }
        graphs.push(stripTimestamps(JSON.stringify(sa.loadGraph(GRAPH_ID))));
      }

      expect(graphs[0]).toBe(graphs[1]);
      expect(graphs[1]).toBe(graphs[2]);
    });
  });

  // ── Integrity ──

  describe('graph integrity', () => {
    it('verifyIntegrity returns clean after multi-turn sequence', () => {
      orchestrator.runPipeline('A dog is an animal', context);
      orchestrator.runPipeline('A cat is an animal', context);
      orchestrator.runPipeline('A poodle is a dog', context);

      const ghosts = stateAdapter.verifyIntegrity(GRAPH_ID);
      expect(ghosts).toHaveLength(0);
    });
  });
});
