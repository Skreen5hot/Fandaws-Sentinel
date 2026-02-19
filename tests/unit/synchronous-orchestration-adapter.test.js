import { describe, it, expect, beforeEach } from '@jest/globals';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { OrchestrationAdapter } from '../../src/adapters/orchestration/orchestration-adapter.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { createConversationSession } from '../../src/types/conversation-session.js';
import { createDialogueTurn } from '../../src/types/dialogue-turn.js';
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
      // Pre-populate graph with animal → dog hierarchy + fur concept
      stateAdapter.saveGraph(
        GRAPH_ID,
        makeGraph([
          makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal'),
          makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
          makeConcept('fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', 'Fur', 'fur'),
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
      const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false]]);
      const result = orchestrator.runPipeline('A dog has fur', context, {
        scopeDecisions: decisions,
      });
      expect(result.success).toBe(true);

      const graph = stateAdapter.loadGraph(GRAPH_ID);
      const dog = graph['fandaws:concepts'].find(
        (c) => c['@id'] === 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      );
      const props = (dog['rdfs:subClassOf'] || []).filter(
        (e) => isRestrictionNode(e) && e['fandaws:restrictionKind'] === 'property',
      );
      const fur = props.find((p) => (p['fandaws:propertyLabel'] || p['owl:onProperty']) === 'fur');
      expect(fur).toBeDefined();
    });
  });

  // ── Custom relationship ──

  describe('custom relationship handling', () => {
    it('routes custom relationships to relationship pipeline', () => {
      const result = orchestrator.runPipeline('Dogs chase cats', context);
      expect(result.success).toBe(true);
      expect(result.error).toBe(false);
      expect(result.normalizedVerb).toBe('chase');
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
          makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal'),
          makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'),
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
      // Classify "fur" so property term exists as a concept
      orchestrator.runPipeline('fur is a material', context);

      const decisions = new Map([['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false]]);
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

  // ── Session Lifecycle (Phase 11) ──

  describe('session lifecycle', () => {
    const sessionConfig = {
      'fandaws:sessionExpiryDuration': 'P7D',
      'fandaws:maxNestingDepth': 10,
      'fandaws:maxConcurrentSessions': 5,
    };

    let sessionContext;

    beforeEach(() => {
      sessionContext = { stateAdapter, graphId: GRAPH_ID, config: sessionConfig };
    });

    // OA-01
    it('startSession creates session in negotiating state', () => {
      const result = orchestrator.startSession('user-test', 'dog', sessionContext);
      expect(result.error).toBeUndefined();
      expect(result.session).toBeDefined();
      expect(result.session['fandaws:state']).toBe('negotiating');
      expect(result.session['fandaws:term']).toBe('dog');
      expect(result.session['fandaws:callerId']).toBe('user-test');
    });

    // OA-02
    it('startSession rejects at concurrent limit', () => {
      for (let i = 0; i < 5; i++) {
        const s = createConversationSession({
          sessionId: `fandaws:session/s${i}`,
          callerId: 'user-test',
          term: `term${i}`,
          workingGraphId: GRAPH_ID,
        });
        stateAdapter.saveSession(`fandaws:session/s${i}`, s);
      }
      const result = orchestrator.startSession('user-test', 'newterm', sessionContext);
      expect(result.error).toBe(true);
      expect(result.errorReason).toMatch(/concurrent-limit/);
    });

    // OA-03
    it('startSession computes expiresAt from config', () => {
      const result = orchestrator.startSession('user-test', 'dog', sessionContext);
      expect(result.session['fandaws:expiresAt']).toBeDefined();
      expect(result.session['fandaws:expiresAt']).not.toBeNull();
    });

    // OA-04
    it('pauseSession transitions to paused', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      const result = orchestrator.pauseSession(sid, sessionContext);
      expect(result.session['fandaws:state']).toBe('paused');
    });

    // OA-05
    it('pauseSession on terminal session returns error', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      orchestrator.completeSession(sid, sessionContext);
      const result = orchestrator.pauseSession(sid, sessionContext);
      expect(result.error).toBe(true);
    });

    // OA-06
    it('resumeSession transitions paused → negotiating', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      orchestrator.pauseSession(sid, sessionContext);
      const result = orchestrator.resumeSession(sid, sessionContext);
      expect(result.session['fandaws:state']).toBe('negotiating');
    });

    // OA-07
    it('resumeSession returns last unanswered prompt from history', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];

      // Manually add a system prompt to history
      const loaded = stateAdapter.loadSession(sid);
      const turn = createDialogueTurn({
        role: 'system',
        content: 'What is the parent of dog?',
        turnIndex: loaded['fandaws:dialogueHistory'].length,
        phase: 'is_a',
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      const updated = {
        ...loaded,
        'fandaws:dialogueHistory': [...loaded['fandaws:dialogueHistory'], turn],
      };
      stateAdapter.saveSession(sid, updated);

      orchestrator.pauseSession(sid, sessionContext);
      const result = orchestrator.resumeSession(sid, sessionContext);
      expect(result.lastPrompt).toBeDefined();
      expect(result.lastPrompt['fandaws:content']).toBe('What is the parent of dog?');
    });

    // OA-07b (SC-2)
    it('resumeSession with no unanswered prompt returns null lastPrompt', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      orchestrator.pauseSession(sid, sessionContext);
      const result = orchestrator.resumeSession(sid, sessionContext);
      // No system prompts in history → null
      expect(result.lastPrompt).toBeNull();
    });

    // OA-08
    it('resumeSession on non-paused session returns error', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      const result = orchestrator.resumeSession(sid, sessionContext);
      expect(result.error).toBe(true);
      expect(result.errorReason).toMatch(/non-paused/);
    });

    // OA-09
    it('abandonSession transitions to abandoned', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      const result = orchestrator.abandonSession(sid, sessionContext);
      expect(result.abandonedIds).toContain(sid);
      const loaded = stateAdapter.loadSession(sid);
      expect(loaded['fandaws:state']).toBe('abandoned');
    });

    // OA-10
    it('abandonSession cascades to child sessions', () => {
      const { session: parent } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const parentId = parent['fandaws:sessionId'];
      const { childSession } = orchestrator.nestSession(parentId, 'canine', sessionContext);
      const childId = childSession['fandaws:sessionId'];

      const result = orchestrator.abandonSession(parentId, sessionContext);
      expect(result.abandonedIds).toContain(parentId);
      expect(result.abandonedIds).toContain(childId);

      expect(stateAdapter.loadSession(parentId)['fandaws:state']).toBe('abandoned');
      expect(stateAdapter.loadSession(childId)['fandaws:state']).toBe('abandoned');
    });

    // OA-11
    it('abandonSession on already-abandoned is idempotent', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      orchestrator.abandonSession(sid, sessionContext);
      const result = orchestrator.abandonSession(sid, sessionContext);
      expect(result.abandonedIds).toContain(sid);
      expect(result.error).toBeUndefined();
    });

    // OA-12
    it('completeSession transitions to complete', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      const result = orchestrator.completeSession(sid, sessionContext);
      expect(result.session['fandaws:state']).toBe('complete');
    });

    // OA-13
    it('completeSession on non-negotiating returns error', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];
      orchestrator.pauseSession(sid, sessionContext);
      const result = orchestrator.completeSession(sid, sessionContext);
      expect(result.error).toBe(true);
    });

    // OA-14
    it('nestSession creates child with correct parentSessionId', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const parentId = session['fandaws:sessionId'];
      const result = orchestrator.nestSession(parentId, 'canine', sessionContext);
      expect(result.childSession['fandaws:parentSessionId']).toBe(parentId);
    });

    // OA-15
    it('nestSession transitions parent to nested', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const parentId = session['fandaws:sessionId'];
      const result = orchestrator.nestSession(parentId, 'canine', sessionContext);
      expect(result.parentSession['fandaws:state']).toBe('nested');
    });

    // OA-16
    it('nestSession rejects when depth exceeds max', () => {
      const deepConfig = { ...sessionConfig, 'fandaws:maxNestingDepth': 1 };
      const deepContext = { ...sessionContext, config: deepConfig };
      const { session } = orchestrator.startSession('user-test', 'dog', deepContext);
      const parentId = session['fandaws:sessionId'];

      // First nest succeeds (depth 0 → 1)
      const result1 = orchestrator.nestSession(parentId, 'canine', deepContext);
      expect(result1.error).toBeUndefined();

      // Second nest from child fails (depth 1 → would be 2, but max is 1)
      const childId = result1.childSession['fandaws:sessionId'];
      const result2 = orchestrator.nestSession(childId, 'mammal', deepContext);
      expect(result2.error).toBe(true);
      expect(result2.errorReason).toMatch(/exceed/);
    });

    // OA-17
    it('resolveNestedSession transitions parent back to negotiating', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const parentId = session['fandaws:sessionId'];
      const { childSession } = orchestrator.nestSession(parentId, 'canine', sessionContext);
      const childId = childSession['fandaws:sessionId'];

      const result = orchestrator.resolveNestedSession(childId, sessionContext);
      expect(result.parentSession['fandaws:state']).toBe('negotiating');
    });

    // OA-18
    it('resolveNestedSession marks child as complete', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const parentId = session['fandaws:sessionId'];
      const { childSession } = orchestrator.nestSession(parentId, 'canine', sessionContext);
      const childId = childSession['fandaws:sessionId'];

      orchestrator.resolveNestedSession(childId, sessionContext);
      const loaded = stateAdapter.loadSession(childId);
      expect(loaded['fandaws:state']).toBe('complete');
    });

    // OA-19
    it('expireStaleSessions transitions expired sessions', () => {
      const s = createConversationSession({
        sessionId: 'fandaws:session/old',
        callerId: 'user-test',
        term: 'stale',
        workingGraphId: GRAPH_ID,
        state: 'paused',
        expiresAt: '2025-01-01T00:00:00.000Z',
      });
      // Force lastActiveAt to be old so grace window doesn't save it
      s['fandaws:lastActiveAt'] = '2024-12-01T00:00:00.000Z';
      stateAdapter.saveSession('fandaws:session/old', s);

      const result = orchestrator.expireStaleSessions('user-test', sessionContext);
      expect(result.expiredIds).toContain('fandaws:session/old');
    });

    // OA-20
    it('expireStaleSessions skips non-expired paused sessions', () => {
      const s = createConversationSession({
        sessionId: 'fandaws:session/fresh',
        callerId: 'user-test',
        term: 'fresh',
        workingGraphId: GRAPH_ID,
        state: 'paused',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      stateAdapter.saveSession('fandaws:session/fresh', s);

      const result = orchestrator.expireStaleSessions('user-test', sessionContext);
      expect(result.expiredIds).not.toContain('fandaws:session/fresh');
    });

    // OA-21
    it('runPipeline with sessionId appends dialogue turns', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];

      orchestrator.runPipeline('A dog is an animal', {
        ...context,
        sessionId: sid,
      });

      const loaded = stateAdapter.loadSession(sid);
      // Should have at least 2 turns (caller + system)
      expect(loaded['fandaws:dialogueHistory'].length).toBeGreaterThanOrEqual(2);
      expect(loaded['fandaws:dialogueHistory'][0]['fandaws:role']).toBe('caller');
      expect(loaded['fandaws:dialogueHistory'][1]['fandaws:role']).toBe('system');
    });

    // OA-22
    it('runPipeline without sessionId works as before (backward compatible)', () => {
      const result = orchestrator.runPipeline('A dog is an animal', context);
      expect(result.success).toBe(true);
    });

    // OA-23
    it('dialogue history reconstructed from persisted session', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];

      orchestrator.runPipeline('A dog is an animal', { ...context, sessionId: sid });

      // Reload session from adapter
      const reloaded = stateAdapter.loadSession(sid);
      expect(reloaded['fandaws:dialogueHistory']).toBeDefined();
      expect(reloaded['fandaws:dialogueHistory'].length).toBeGreaterThan(0);
      expect(reloaded['fandaws:dialogueHistory'][0]['fandaws:content']).toBe('A dog is an animal');
    });

    // OA-24
    it('full lifecycle: start → run → pause → resume → run → complete', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const sid = session['fandaws:sessionId'];

      // Run pipeline
      orchestrator.runPipeline('A dog is an animal', { ...context, sessionId: sid });

      // Pause
      const { session: paused } = orchestrator.pauseSession(sid, sessionContext);
      expect(paused['fandaws:state']).toBe('paused');

      // Resume
      const { session: resumed } = orchestrator.resumeSession(sid, sessionContext);
      expect(resumed['fandaws:state']).toBe('negotiating');

      // Run again
      orchestrator.runPipeline('A cat is an animal', { ...context, sessionId: sid });

      // Complete
      const { session: completed } = orchestrator.completeSession(sid, sessionContext);
      expect(completed['fandaws:state']).toBe('complete');

      // Verify full history
      const loaded = stateAdapter.loadSession(sid);
      expect(loaded['fandaws:dialogueHistory'].length).toBeGreaterThanOrEqual(6);
    });

    // OA-25
    it('full lifecycle: start → nest → resolve → complete', () => {
      const { session } = orchestrator.startSession('user-test', 'dog', sessionContext);
      const parentId = session['fandaws:sessionId'];

      // Nest
      const { childSession, parentSession } = orchestrator.nestSession(parentId, 'canine', sessionContext);
      expect(parentSession['fandaws:state']).toBe('nested');
      const childId = childSession['fandaws:sessionId'];

      // Resolve nested
      const { parentSession: resumed } = orchestrator.resolveNestedSession(childId, sessionContext);
      expect(resumed['fandaws:state']).toBe('negotiating');

      // Complete parent
      const { session: completed } = orchestrator.completeSession(parentId, sessionContext);
      expect(completed['fandaws:state']).toBe('complete');

      // Child should be complete
      expect(stateAdapter.loadSession(childId)['fandaws:state']).toBe('complete');
    });
  });
});
