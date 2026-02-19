/**
 * Session Lifecycle — Golden Snapshot Tests
 *
 * Validates stable shapes and invariants for session lifecycle outputs.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConversationSession } from '../../src/types/conversation-session.js';

const GRAPH_ID = 'fandaws:graph/golden-test';

const CONFIG = {
  'fandaws:sessionExpiryDuration': 'P7D',
  'fandaws:maxNestingDepth': 10,
  'fandaws:maxConcurrentSessions': 5,
};

describe('Session Lifecycle — Golden Snapshots', () => {
  let orchestrator;
  let stateAdapter;
  let context;

  beforeEach(() => {
    orchestrator = new SynchronousOrchestrationAdapter();
    stateAdapter = new InMemoryStateAdapter();
    stateAdapter.saveGraph(GRAPH_ID, createKnowledgeGraph({ id: GRAPH_ID }));
    context = { stateAdapter, graphId: GRAPH_ID, config: CONFIG };
  });

  it('complete session dialogue history has correct shape', () => {
    const { session } = orchestrator.startSession('user-golden', 'dog', context);
    const sid = session['fandaws:sessionId'];

    orchestrator.runPipeline('A dog is an animal', { ...context, sessionId: sid });
    orchestrator.completeSession(sid, context);

    const final = stateAdapter.loadSession(sid);
    const history = final['fandaws:dialogueHistory'];

    // Shape validation — each turn has the required fields
    for (const turn of history) {
      expect(turn['@type']).toBe('fandaws:DialogueTurn');
      expect(turn['fandaws:role']).toBeDefined();
      expect(turn['fandaws:content']).toBeDefined();
      expect(typeof turn['fandaws:turnIndex']).toBe('number');
      expect(turn['fandaws:phase']).toBeDefined();
      expect(turn['fandaws:timestamp']).toBeDefined();
    }

    // Turn indices are sequential
    for (let i = 0; i < history.length; i++) {
      expect(history[i]['fandaws:turnIndex']).toBe(i);
    }

    // Final state
    expect(final['fandaws:state']).toBe('complete');
  });

  it('nested negotiation sequence has correct parent/child shape', () => {
    const { session } = orchestrator.startSession('user-golden', 'dog', context);
    const parentId = session['fandaws:sessionId'];

    const { childSession, parentSession } = orchestrator.nestSession(parentId, 'canine', context);
    const childId = childSession['fandaws:sessionId'];

    // Parent shape
    expect(parentSession['fandaws:state']).toBe('nested');
    expect(parentSession['fandaws:dialogueHistory'].length).toBeGreaterThan(0);

    // Child shape
    expect(childSession['@type']).toBe('fandaws:ConversationSession');
    expect(childSession['fandaws:parentSessionId']).toBe(parentId);
    expect(childSession['fandaws:nestingDepth']).toBe(1);
    expect(childSession['fandaws:state']).toBe('negotiating');
    expect(childSession['fandaws:callerId']).toBe('user-golden');
    expect(childSession['fandaws:term']).toBe('canine');

    // Resolve
    orchestrator.resolveNestedSession(childId, context);
    const resolvedParent = stateAdapter.loadSession(parentId);
    expect(resolvedParent['fandaws:state']).toBe('negotiating');
  });

  it('abandon cascade result has correct shape', () => {
    const { session } = orchestrator.startSession('user-golden', 'dog', context);
    const id0 = session['fandaws:sessionId'];
    const { childSession } = orchestrator.nestSession(id0, 'canine', context);
    const id1 = childSession['fandaws:sessionId'];

    const result = orchestrator.abandonSession(id0, context);

    // Result shape
    expect(Array.isArray(result.abandonedIds)).toBe(true);
    expect(result.abandonedIds.length).toBe(2);
    expect(result.abandonedIds).toContain(id0);
    expect(result.abandonedIds).toContain(id1);
    expect(result.error).toBeUndefined();

    // All abandoned sessions have transition turn
    for (const id of result.abandonedIds) {
      const s = stateAdapter.loadSession(id);
      expect(s['fandaws:state']).toBe('abandoned');
      const lastTurn = s['fandaws:dialogueHistory'].slice(-1)[0];
      expect(lastTurn['fandaws:role']).toBe('transition');
      expect(lastTurn['fandaws:content']).toMatch(/→ abandoned/);
    }
  });

  it('concurrent limit rejection has correct shape', () => {
    for (let i = 0; i < 5; i++) {
      orchestrator.startSession('user-golden', `term${i}`, context);
    }

    const result = orchestrator.startSession('user-golden', 'extra', context);

    expect(result.error).toBe(true);
    expect(result.errorReason).toMatch(/concurrent-limit/);
    expect(result.session).toBeUndefined();
    expect(result.activeCount).toBe(5);
  });

  it('expiration produces correct state and history', () => {
    const s = createConversationSession({
      sessionId: 'fandaws:session/golden-expire',
      callerId: 'user-golden',
      term: 'stale',
      workingGraphId: GRAPH_ID,
      state: 'paused',
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    s['fandaws:lastActiveAt'] = '2024-12-01T00:00:00.000Z';
    stateAdapter.saveSession('fandaws:session/golden-expire', s);

    const result = orchestrator.expireStaleSessions('user-golden', context);

    expect(result.expiredIds).toContain('fandaws:session/golden-expire');

    const expired = stateAdapter.loadSession('fandaws:session/golden-expire');
    expect(expired['fandaws:state']).toBe('expired');

    // Has transition turn
    const lastTurn = expired['fandaws:dialogueHistory'].slice(-1)[0];
    expect(lastTurn['fandaws:role']).toBe('transition');
    expect(lastTurn['fandaws:content']).toMatch(/→ expired/);
  });
});
