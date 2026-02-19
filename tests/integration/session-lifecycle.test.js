/**
 * Session Lifecycle — Integration Tests
 *
 * SL-01 through SL-10: End-to-end session lifecycle with real StateAdapter + pipeline.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConversationSession } from '../../src/types/conversation-session.js';

const GRAPH_ID = 'fandaws:graph/integration-test';

const CONFIG = {
  'fandaws:sessionExpiryDuration': 'P7D',
  'fandaws:maxNestingDepth': 10,
  'fandaws:maxConcurrentSessions': 5,
};

describe('Session Lifecycle Integration', () => {
  let orchestrator;
  let stateAdapter;
  let context;

  beforeEach(() => {
    orchestrator = new SynchronousOrchestrationAdapter();
    stateAdapter = new InMemoryStateAdapter();
    stateAdapter.saveGraph(GRAPH_ID, createKnowledgeGraph({ id: GRAPH_ID }));
    context = { stateAdapter, graphId: GRAPH_ID, config: CONFIG };
  });

  // SL-01
  it('full session from start to complete with dialogue history', () => {
    const { session } = orchestrator.startSession('user-test', 'dog', context);
    const sid = session['fandaws:sessionId'];

    // Run pipeline with session tracking
    orchestrator.runPipeline('A dog is an animal', { ...context, sessionId: sid });

    // Complete
    orchestrator.completeSession(sid, context);

    const final = stateAdapter.loadSession(sid);
    expect(final['fandaws:state']).toBe('complete');
    expect(final['fandaws:dialogueHistory'].length).toBeGreaterThanOrEqual(2);

    // Verify dialogue history has caller and system turns
    const roles = final['fandaws:dialogueHistory'].map((t) => t['fandaws:role']);
    expect(roles).toContain('caller');
    expect(roles).toContain('system');
    expect(roles).toContain('transition'); // complete transition
  });

  // SL-02
  it('pause → resume preserves full state', () => {
    const { session } = orchestrator.startSession('user-test', 'dog', context);
    const sid = session['fandaws:sessionId'];

    orchestrator.runPipeline('A dog is an animal', { ...context, sessionId: sid });

    // Pause
    orchestrator.pauseSession(sid, context);
    const paused = stateAdapter.loadSession(sid);
    const historyBeforePause = paused['fandaws:dialogueHistory'].length;

    // Resume
    orchestrator.resumeSession(sid, context);
    const resumed = stateAdapter.loadSession(sid);

    expect(resumed['fandaws:state']).toBe('negotiating');
    // History should grow (transition turns for pause + resume)
    expect(resumed['fandaws:dialogueHistory'].length).toBe(historyBeforePause + 1);
    expect(resumed['fandaws:term']).toBe('dog');
    expect(resumed['fandaws:callerId']).toBe('user-test');
  });

  // SL-03
  it('nested negotiation creates and resolves child', () => {
    const { session } = orchestrator.startSession('user-test', 'dog', context);
    const parentId = session['fandaws:sessionId'];

    // Nest
    const { childSession, parentSession } = orchestrator.nestSession(parentId, 'canine', context);
    expect(parentSession['fandaws:state']).toBe('nested');
    expect(childSession['fandaws:parentSessionId']).toBe(parentId);
    expect(childSession['fandaws:nestingDepth']).toBe(1);

    // Child runs pipeline
    const childId = childSession['fandaws:sessionId'];
    orchestrator.runPipeline('A canine is a mammal', {
      ...context,
      sessionId: childId,
    });

    // Resolve
    const { parentSession: resolved } = orchestrator.resolveNestedSession(childId, context);
    expect(resolved['fandaws:state']).toBe('negotiating');

    // Child is complete
    expect(stateAdapter.loadSession(childId)['fandaws:state']).toBe('complete');
  });

  // SL-04
  it('abandon cascades through 3 levels of nesting', () => {
    const { session } = orchestrator.startSession('user-test', 'dog', context);
    const id0 = session['fandaws:sessionId'];

    const { childSession: child1 } = orchestrator.nestSession(id0, 'canine', context);
    const id1 = child1['fandaws:sessionId'];

    const { childSession: child2 } = orchestrator.nestSession(id1, 'mammal', context);
    const id2 = child2['fandaws:sessionId'];

    // Abandon root
    const result = orchestrator.abandonSession(id0, context);
    expect(result.abandonedIds).toContain(id0);
    expect(result.abandonedIds).toContain(id1);
    expect(result.abandonedIds).toContain(id2);

    expect(stateAdapter.loadSession(id0)['fandaws:state']).toBe('abandoned');
    expect(stateAdapter.loadSession(id1)['fandaws:state']).toBe('abandoned');
    expect(stateAdapter.loadSession(id2)['fandaws:state']).toBe('abandoned');
  });

  // SL-05
  it('6th concurrent session rejected', () => {
    for (let i = 0; i < 5; i++) {
      orchestrator.startSession('user-test', `term${i}`, context);
    }

    const result = orchestrator.startSession('user-test', 'extra', context);
    expect(result.error).toBe(true);
    expect(result.errorReason).toMatch(/concurrent-limit/);
  });

  // SL-06
  it('expired session cannot be resumed', () => {
    const s = createConversationSession({
      sessionId: 'fandaws:session/expired-test',
      callerId: 'user-test',
      term: 'old',
      workingGraphId: GRAPH_ID,
      state: 'paused',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    s['fandaws:lastActiveAt'] = '2024-12-01T00:00:00.000Z';
    stateAdapter.saveSession('fandaws:session/expired-test', s);

    // Expire it
    orchestrator.expireStaleSessions('user-test', context);

    // Try to resume
    const result = orchestrator.resumeSession('fandaws:session/expired-test', context);
    expect(result.error).toBe(true);
    expect(result.errorReason).toMatch(/non-paused/);
  });

  // SL-07
  it('pipeline result appended to dialogue history', () => {
    const { session } = orchestrator.startSession('user-test', 'cat', context);
    const sid = session['fandaws:sessionId'];

    orchestrator.runPipeline('A cat is an animal', { ...context, sessionId: sid });

    const loaded = stateAdapter.loadSession(sid);
    const history = loaded['fandaws:dialogueHistory'];
    expect(history.length).toBeGreaterThanOrEqual(2);

    // First turn is caller
    expect(history[0]['fandaws:role']).toBe('caller');
    expect(history[0]['fandaws:content']).toBe('A cat is an animal');

    // Second turn is system
    expect(history[1]['fandaws:role']).toBe('system');
  });

  // SL-08
  it('session state after each transition in a complex workflow', () => {
    const states = [];
    const { session } = orchestrator.startSession('user-test', 'dog', context);
    const sid = session['fandaws:sessionId'];
    states.push(session['fandaws:state']);

    orchestrator.pauseSession(sid, context);
    states.push(stateAdapter.loadSession(sid)['fandaws:state']);

    orchestrator.resumeSession(sid, context);
    states.push(stateAdapter.loadSession(sid)['fandaws:state']);

    const { childSession } = orchestrator.nestSession(sid, 'canine', context);
    states.push(stateAdapter.loadSession(sid)['fandaws:state']);

    orchestrator.resolveNestedSession(childSession['fandaws:sessionId'], context);
    states.push(stateAdapter.loadSession(sid)['fandaws:state']);

    orchestrator.completeSession(sid, context);
    states.push(stateAdapter.loadSession(sid)['fandaws:state']);

    expect(states).toEqual([
      'negotiating', 'paused', 'negotiating', 'nested', 'negotiating', 'complete',
    ]);
  });

  // SL-09
  it('reconstructed pipeline state matches original', () => {
    const { session } = orchestrator.startSession('user-test', 'dog', context);
    const sid = session['fandaws:sessionId'];

    orchestrator.runPipeline('A dog is an animal', { ...context, sessionId: sid });
    orchestrator.runPipeline('A cat is an animal', { ...context, sessionId: sid });

    // Reload from adapter (simulating restart)
    const reloaded = stateAdapter.loadSession(sid);

    // History should contain all turns
    expect(reloaded['fandaws:dialogueHistory'].length).toBe(4); // 2 pairs of caller+system
    expect(reloaded['fandaws:term']).toBe('dog');
    expect(reloaded['fandaws:callerId']).toBe('user-test');
    expect(reloaded['fandaws:state']).toBe('negotiating');
  });

  // SL-10
  it('session lifecycle works with real StateAdapter + pipeline', () => {
    // Start
    const { session } = orchestrator.startSession('user-test', 'dog', context);
    const sid = session['fandaws:sessionId'];
    expect(session['fandaws:expiresAt']).not.toBeNull();

    // Run pipeline (builds graph)
    const result = orchestrator.runPipeline('A dog is an animal', {
      ...context,
      sessionId: sid,
    });
    expect(result.success).toBe(true);

    // Verify graph was built
    const graph = stateAdapter.loadGraph(GRAPH_ID);
    expect(graph['fandaws:concepts'].length).toBeGreaterThanOrEqual(2);

    // Complete
    orchestrator.completeSession(sid, context);
    const final = stateAdapter.loadSession(sid);
    expect(final['fandaws:state']).toBe('complete');
    expect(final['fandaws:dialogueHistory'].length).toBeGreaterThanOrEqual(3);
  });
});
