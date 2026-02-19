/**
 * Session Lifecycle — Unit Tests
 *
 * SM-01 through SM-20: State machine transitions + validation
 * CL-01 through CL-05: Concurrent session limits
 * NN-01 through NN-07: Nested negotiation helpers
 * AC-01 through AC-04: Abandon cascade
 * LS-01: Enhanced listSessions
 * ADV-01 through ADV-04: Adversarial edge cases
 */

import { describe, it, expect } from '@jest/globals';
import {
  SESSION_STATES,
  TERMINAL_STATES,
  VALID_TRANSITIONS,
  validateTransition,
  transitionSession,
  isExpired,
  computeExpiryTimestamp,
  parseIsoDuration,
  appendDialogueTurn,
  findLastUnansweredPrompt,
  countActiveSessions,
  checkConcurrentLimit,
  checkCircularNesting,
  checkNestingDepth,
  createNestedSessionParams,
  findDescendantSessions,
  computeAbandonCascade,
} from '../../src/core/session/session-lifecycle.js';
import { createConversationSession } from '../../src/types/conversation-session.js';
import { createDialogueTurn } from '../../src/types/dialogue-turn.js';

// ── Helpers ──

function makeSession(overrides = {}) {
  return createConversationSession({
    sessionId: overrides.sessionId || 'fandaws:session/test',
    callerId: overrides.callerId || 'user-test',
    term: overrides.term || 'dog',
    workingGraphId: overrides.workingGraphId || 'fandaws:graph/test',
    state: overrides.state || 'negotiating',
    parentSessionId: overrides.parentSessionId || null,
    nestingDepth: overrides.nestingDepth ?? 0,
    dialogueHistory: overrides.dialogueHistory || [],
    expiresAt: overrides.expiresAt || null,
  });
}

// ── SM: State Machine Transitions ──

describe('validateTransition', () => {
  // SM-01
  it('negotiating → paused is valid', () => {
    expect(validateTransition('negotiating', 'paused').valid).toBe(true);
  });

  // SM-02
  it('negotiating → complete is valid', () => {
    expect(validateTransition('negotiating', 'complete').valid).toBe(true);
  });

  // SM-03
  it('complete → negotiating is invalid (terminal)', () => {
    const result = validateTransition('complete', 'negotiating');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/terminal/);
  });

  // SM-04
  it('abandoned → any is invalid (terminal)', () => {
    for (const state of Object.values(SESSION_STATES)) {
      const result = validateTransition('abandoned', state);
      if (state !== 'abandoned') {
        expect(result.valid).toBe(false);
      }
    }
  });

  // SM-05
  it('expired → any is invalid (terminal)', () => {
    for (const state of Object.values(SESSION_STATES)) {
      const result = validateTransition('expired', state);
      if (state !== 'expired') {
        expect(result.valid).toBe(false);
      }
    }
  });

  // SM-06
  it('paused → negotiating is valid (resume)', () => {
    expect(validateTransition('paused', 'negotiating').valid).toBe(true);
  });

  // SM-07
  it('nested → negotiating is valid (child complete)', () => {
    expect(validateTransition('nested', 'negotiating').valid).toBe(true);
  });

  // SM-08
  it('conflict → negotiating is valid (resolved)', () => {
    expect(validateTransition('conflict', 'negotiating').valid).toBe(true);
  });

  it('returns reason for unknown state', () => {
    const result = validateTransition('nonexistent', 'paused');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unknown state/);
  });
});

describe('transitionSession', () => {
  // SM-09
  it('updates state field', () => {
    const session = makeSession({ state: 'negotiating' });
    const result = transitionSession(session, 'paused', { timestamp: '2026-01-01T00:00:00.000Z' });
    expect(result['fandaws:state']).toBe('paused');
  });

  // SM-10
  it('updates lastActiveAt', () => {
    const session = makeSession({ state: 'negotiating' });
    const ts = '2026-02-15T12:00:00.000Z';
    const result = transitionSession(session, 'paused', { timestamp: ts });
    expect(result['fandaws:lastActiveAt']).toBe(ts);
  });

  // SM-11
  it('appends transition turn to dialogueHistory', () => {
    const session = makeSession({ state: 'negotiating' });
    const result = transitionSession(session, 'paused', { timestamp: '2026-01-01T00:00:00.000Z' });
    expect(result['fandaws:dialogueHistory']).toHaveLength(1);
    const turn = result['fandaws:dialogueHistory'][0];
    expect(turn['fandaws:role']).toBe('transition');
    expect(turn['fandaws:content']).toBe('negotiating → paused');
    expect(turn['fandaws:turnIndex']).toBe(0);
  });

  // SM-12
  it('throws on invalid transition', () => {
    const session = makeSession({ state: 'complete' });
    expect(() => transitionSession(session, 'negotiating')).toThrow(/terminal/);
  });

  it('does not mutate original session', () => {
    const session = makeSession({ state: 'negotiating' });
    const historyBefore = session['fandaws:dialogueHistory'].length;
    transitionSession(session, 'paused', { timestamp: '2026-01-01T00:00:00.000Z' });
    expect(session['fandaws:dialogueHistory']).toHaveLength(historyBefore);
    expect(session['fandaws:state']).toBe('negotiating');
  });
});

// ── SM: Expiration ──

describe('isExpired', () => {
  // SM-13
  it('returns false when no expiresAt', () => {
    const session = makeSession({ expiresAt: null });
    expect(isExpired(session)).toBe(false);
  });

  // SM-14
  it('returns true when now > expiresAt (and lastActiveAt is old)', () => {
    const session = makeSession({ expiresAt: '2026-01-01T00:00:00.000Z' });
    // Force lastActiveAt to be old (it was set at creation, which is "now")
    session['fandaws:lastActiveAt'] = '2025-12-20T00:00:00.000Z';
    expect(isExpired(session, '2026-01-02T00:00:00.000Z')).toBe(true);
  });

  // SM-15
  it('returns false when now < expiresAt', () => {
    const session = makeSession({ expiresAt: '2026-01-10T00:00:00.000Z' });
    expect(isExpired(session, '2026-01-05T00:00:00.000Z')).toBe(false);
  });

  // SM-15b (SC-1)
  it('returns false when expiresAt passed but lastActiveAt within grace window', () => {
    const session = makeSession({ expiresAt: '2026-01-01T00:00:00.000Z' });
    // lastActiveAt is 30 minutes ago — within 1-hour grace window
    session['fandaws:lastActiveAt'] = '2026-01-01T01:30:00.000Z';
    expect(isExpired(session, '2026-01-01T02:00:00.000Z', 'PT1H')).toBe(false);
  });

  // SM-15c (SC-1)
  it('returns true when expiresAt passed AND lastActiveAt outside grace window', () => {
    const session = makeSession({ expiresAt: '2026-01-01T00:00:00.000Z' });
    // lastActiveAt is 2 hours ago — outside 1-hour grace window
    session['fandaws:lastActiveAt'] = '2026-01-01T00:00:00.000Z';
    expect(isExpired(session, '2026-01-01T02:00:00.000Z', 'PT1H')).toBe(true);
  });
});

describe('computeExpiryTimestamp', () => {
  // SM-16
  it('parses P7D correctly (7 days)', () => {
    const result = computeExpiryTimestamp('P7D', '2026-01-01T00:00:00.000Z');
    expect(result).toBe('2026-01-08T00:00:00.000Z');
  });

  // SM-17
  it('parses P1D correctly (1 day)', () => {
    const result = computeExpiryTimestamp('P1D', '2026-01-01T00:00:00.000Z');
    expect(result).toBe('2026-01-02T00:00:00.000Z');
  });

  it('parses PT1H correctly (1 hour)', () => {
    const result = computeExpiryTimestamp('PT1H', '2026-01-01T00:00:00.000Z');
    expect(result).toBe('2026-01-01T01:00:00.000Z');
  });

  it('throws on unsupported duration', () => {
    expect(() => computeExpiryTimestamp('P1Y', '2026-01-01T00:00:00.000Z')).toThrow(/Unsupported/);
  });
});

describe('parseIsoDuration', () => {
  it('parses P7D to milliseconds', () => {
    expect(parseIsoDuration('P7D')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('parses PT1H to milliseconds', () => {
    expect(parseIsoDuration('PT1H')).toBe(60 * 60 * 1000);
  });
});

// ── SM: Dialogue History ──

describe('appendDialogueTurn', () => {
  // SM-18
  it('appends turn with correct turnIndex', () => {
    const session = makeSession();
    const turn = createDialogueTurn({
      role: 'system',
      content: 'What is dog?',
      turnIndex: 0,
      phase: 'is_a',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const updated = appendDialogueTurn(session, turn);
    expect(updated['fandaws:dialogueHistory']).toHaveLength(1);
    expect(updated['fandaws:dialogueHistory'][0]['fandaws:turnIndex']).toBe(0);
  });

  // SM-19
  it('preserves existing turns (immutable)', () => {
    const existingTurn = createDialogueTurn({
      role: 'system',
      content: 'First prompt',
      turnIndex: 0,
      phase: 'is_a',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const session = makeSession({ dialogueHistory: [existingTurn] });
    const newTurn = createDialogueTurn({
      role: 'caller',
      content: 'Response',
      turnIndex: 1,
      phase: 'is_a',
      timestamp: '2026-01-01T00:01:00.000Z',
    });
    const updated = appendDialogueTurn(session, newTurn);

    expect(updated['fandaws:dialogueHistory']).toHaveLength(2);
    expect(updated['fandaws:dialogueHistory'][0]['fandaws:content']).toBe('First prompt');
    expect(updated['fandaws:dialogueHistory'][1]['fandaws:content']).toBe('Response');

    // Original session unchanged
    expect(session['fandaws:dialogueHistory']).toHaveLength(1);
  });

  it('updates lastActiveAt from turn timestamp', () => {
    const session = makeSession();
    const ts = '2026-03-01T00:00:00.000Z';
    const turn = createDialogueTurn({
      role: 'caller',
      content: 'test',
      turnIndex: 0,
      phase: 'is_a',
      timestamp: ts,
    });
    const updated = appendDialogueTurn(session, turn);
    expect(updated['fandaws:lastActiveAt']).toBe(ts);
  });
});

describe('findLastUnansweredPrompt', () => {
  it('returns null for empty dialogue history', () => {
    const session = makeSession();
    expect(findLastUnansweredPrompt(session)).toBeNull();
  });

  it('returns the system turn when no caller follows (SC-2)', () => {
    const session = makeSession({
      dialogueHistory: [
        createDialogueTurn({ role: 'system', content: 'What is dog?', turnIndex: 0, phase: 'is_a', timestamp: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    const prompt = findLastUnansweredPrompt(session);
    expect(prompt).not.toBeNull();
    expect(prompt['fandaws:content']).toBe('What is dog?');
  });

  it('returns null when all system turns have caller responses', () => {
    const session = makeSession({
      dialogueHistory: [
        createDialogueTurn({ role: 'system', content: 'What is dog?', turnIndex: 0, phase: 'is_a', timestamp: '2026-01-01T00:00:00.000Z' }),
        createDialogueTurn({ role: 'caller', content: 'An animal', turnIndex: 1, phase: 'is_a', timestamp: '2026-01-01T00:01:00.000Z' }),
      ],
    });
    expect(findLastUnansweredPrompt(session)).toBeNull();
  });

  it('returns the most recent unanswered system turn', () => {
    const session = makeSession({
      dialogueHistory: [
        createDialogueTurn({ role: 'system', content: 'First prompt', turnIndex: 0, phase: 'is_a', timestamp: '2026-01-01T00:00:00.000Z' }),
        createDialogueTurn({ role: 'caller', content: 'Response 1', turnIndex: 1, phase: 'is_a', timestamp: '2026-01-01T00:01:00.000Z' }),
        createDialogueTurn({ role: 'system', content: 'Second prompt', turnIndex: 2, phase: 'has', timestamp: '2026-01-01T00:02:00.000Z' }),
      ],
    });
    const prompt = findLastUnansweredPrompt(session);
    expect(prompt['fandaws:content']).toBe('Second prompt');
  });
});

// ── SM-20: Session States Enum ──

describe('SESSION_STATES', () => {
  // SM-20
  it('contains exactly 7 states', () => {
    expect(Object.keys(SESSION_STATES)).toHaveLength(7);
    expect(SESSION_STATES.NEGOTIATING).toBe('negotiating');
    expect(SESSION_STATES.PAUSED).toBe('paused');
    expect(SESSION_STATES.NESTED).toBe('nested');
    expect(SESSION_STATES.CONFLICT).toBe('conflict');
    expect(SESSION_STATES.COMPLETE).toBe('complete');
    expect(SESSION_STATES.ABANDONED).toBe('abandoned');
    expect(SESSION_STATES.EXPIRED).toBe('expired');
  });

  it('TERMINAL_STATES has 3 members', () => {
    expect(TERMINAL_STATES.size).toBe(3);
    expect(TERMINAL_STATES.has('complete')).toBe(true);
    expect(TERMINAL_STATES.has('abandoned')).toBe(true);
    expect(TERMINAL_STATES.has('expired')).toBe(true);
  });

  it('VALID_TRANSITIONS covers all states', () => {
    for (const state of Object.values(SESSION_STATES)) {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
    }
  });
});

// ── CL: Concurrent Session Limits ──

describe('countActiveSessions', () => {
  // CL-01
  it('counts negotiating + nested only', () => {
    const sessions = [
      makeSession({ sessionId: 's1', state: 'negotiating' }),
      makeSession({ sessionId: 's2', state: 'nested' }),
      makeSession({ sessionId: 's3', state: 'paused' }),
      makeSession({ sessionId: 's4', state: 'complete' }),
    ];
    expect(countActiveSessions(sessions)).toBe(2);
  });

  // CL-02
  it('excludes paused sessions', () => {
    const sessions = [
      makeSession({ sessionId: 's1', state: 'paused' }),
      makeSession({ sessionId: 's2', state: 'paused' }),
    ];
    expect(countActiveSessions(sessions)).toBe(0);
  });
});

describe('checkConcurrentLimit', () => {
  // CL-03
  it('allows when under limit', () => {
    const sessions = [
      makeSession({ sessionId: 's1', state: 'negotiating' }),
    ];
    const result = checkConcurrentLimit(sessions, 5);
    expect(result.allowed).toBe(true);
    expect(result.activeCount).toBe(1);
  });

  // CL-04
  it('rejects at limit', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({ sessionId: `s${i}`, state: 'negotiating' }),
    );
    const result = checkConcurrentLimit(sessions, 5);
    expect(result.allowed).toBe(false);
    expect(result.activeCount).toBe(5);
  });

  // CL-05
  it('includes suggestion on reject', () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      makeSession({ sessionId: `s${i}`, state: 'negotiating' }),
    );
    const result = checkConcurrentLimit(sessions, 5);
    expect(result.suggestion).toBeDefined();
    expect(result.suggestion).toMatch(/Resume or abandon/);
  });

  // ADV-03 (SC-4)
  it('allows with zero existing sessions', () => {
    const result = checkConcurrentLimit([], 5);
    expect(result.allowed).toBe(true);
    expect(result.activeCount).toBe(0);
  });
});

// ── NN: Nested Negotiation ──

describe('checkCircularNesting', () => {
  // NN-07 (SC-4/ADV-01)
  it('rejects childTerm identical to parent term', () => {
    const parent = makeSession({ term: 'dog' });
    const result = checkCircularNesting(parent, 'dog');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Circular/);
  });

  it('allows childTerm different from parent term', () => {
    const parent = makeSession({ term: 'dog' });
    expect(checkCircularNesting(parent, 'canine').allowed).toBe(true);
  });
});

describe('checkNestingDepth', () => {
  // NN-04
  it('allows depth < max', () => {
    const parent = makeSession({ nestingDepth: 3 });
    const result = checkNestingDepth(parent, 10);
    expect(result.allowed).toBe(true);
    expect(result.currentDepth).toBe(3);
  });

  // NN-05
  it('rejects depth >= max', () => {
    const parent = makeSession({ nestingDepth: 10 });
    const result = checkNestingDepth(parent, 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/exceed/);
  });
});

describe('createNestedSessionParams', () => {
  const config = { 'fandaws:sessionExpiryDuration': 'P7D' };

  // NN-01
  it('sets parentSessionId', () => {
    const parent = makeSession({ sessionId: 'fandaws:session/parent' });
    const params = createNestedSessionParams(parent, 'canine', config, {
      timestamp: '2026-01-01T00:00:00.000Z',
      sessionId: 'fandaws:session/child',
    });
    expect(params.parentSessionId).toBe('fandaws:session/parent');
  });

  // NN-02
  it('increments nestingDepth', () => {
    const parent = makeSession({ nestingDepth: 2 });
    const params = createNestedSessionParams(parent, 'canine', config, {
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(params.nestingDepth).toBe(3);
  });

  // NN-03
  it('inherits workingGraphId and callerId', () => {
    const parent = makeSession({
      callerId: 'user-aaron',
      workingGraphId: 'fandaws:graph/aaron',
    });
    const params = createNestedSessionParams(parent, 'canine', config, {
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(params.callerId).toBe('user-aaron');
    expect(params.workingGraphId).toBe('fandaws:graph/aaron');
  });

  // NN-06 (SC-3)
  it('expiresAt does not exceed parent expiresAt', () => {
    const parent = makeSession({ expiresAt: '2026-01-03T00:00:00.000Z' });
    const params = createNestedSessionParams(parent, 'canine', config, {
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    // P7D from Jan 1 = Jan 8, but parent expires Jan 3 → child gets Jan 3
    expect(params.expiresAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('uses full duration when parent has no expiresAt', () => {
    const parent = makeSession({ expiresAt: null });
    const params = createNestedSessionParams(parent, 'canine', config, {
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(params.expiresAt).toBe('2026-01-08T00:00:00.000Z');
  });

  it('uses full duration when parent expires later', () => {
    const parent = makeSession({ expiresAt: '2026-02-01T00:00:00.000Z' });
    const params = createNestedSessionParams(parent, 'canine', config, {
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    // P7D from Jan 1 = Jan 8, parent expires Feb 1 → child gets Jan 8
    expect(params.expiresAt).toBe('2026-01-08T00:00:00.000Z');
  });

  it('sets state to negotiating', () => {
    const parent = makeSession();
    const params = createNestedSessionParams(parent, 'canine', config, {
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(params.state).toBe('negotiating');
  });
});

// ── AC: Abandon Cascade ──

describe('findDescendantSessions', () => {
  // AC-01
  it('finds direct children', () => {
    const sessions = [
      makeSession({ sessionId: 'parent', parentSessionId: null }),
      makeSession({ sessionId: 'child1', parentSessionId: 'parent' }),
      makeSession({ sessionId: 'child2', parentSessionId: 'parent' }),
      makeSession({ sessionId: 'unrelated', parentSessionId: null }),
    ];
    const descendants = findDescendantSessions('parent', sessions);
    const ids = descendants.map((s) => s['fandaws:sessionId']);
    expect(ids).toContain('child1');
    expect(ids).toContain('child2');
    expect(ids).not.toContain('unrelated');
  });

  // AC-02
  it('finds grandchildren (recursive)', () => {
    const sessions = [
      makeSession({ sessionId: 'root', parentSessionId: null }),
      makeSession({ sessionId: 'child', parentSessionId: 'root' }),
      makeSession({ sessionId: 'grandchild', parentSessionId: 'child' }),
    ];
    const descendants = findDescendantSessions('root', sessions);
    const ids = descendants.map((s) => s['fandaws:sessionId']);
    expect(ids).toContain('child');
    expect(ids).toContain('grandchild');
    expect(descendants).toHaveLength(2);
  });

  // ADV-02 (SC-4)
  it('terminates on cycle in parentSessionId', () => {
    const sessions = [
      makeSession({ sessionId: 'a', parentSessionId: 'b' }),
      makeSession({ sessionId: 'b', parentSessionId: 'a' }),
    ];
    // Should not infinite loop
    const descendants = findDescendantSessions('a', sessions);
    expect(descendants).toHaveLength(1);
    expect(descendants[0]['fandaws:sessionId']).toBe('b');
  });

  // ADV-04 (SC-4)
  it('handles deeply nested chain (20 levels)', () => {
    const sessions = [];
    for (let i = 0; i < 20; i++) {
      sessions.push(
        makeSession({
          sessionId: `s${i}`,
          parentSessionId: i === 0 ? null : `s${i - 1}`,
        }),
      );
    }
    const descendants = findDescendantSessions('s0', sessions);
    expect(descendants).toHaveLength(19);
  });
});

describe('computeAbandonCascade', () => {
  // AC-03
  it('includes self + all descendants', () => {
    const sessions = [
      makeSession({ sessionId: 'root', parentSessionId: null }),
      makeSession({ sessionId: 'child', parentSessionId: 'root' }),
      makeSession({ sessionId: 'grandchild', parentSessionId: 'child' }),
    ];
    const cascade = computeAbandonCascade('root', sessions);
    expect(cascade).toContain('root');
    expect(cascade).toContain('child');
    expect(cascade).toContain('grandchild');
    expect(cascade).toHaveLength(3);
  });

  // AC-04
  it('with no children returns just self', () => {
    const sessions = [
      makeSession({ sessionId: 'lonely', parentSessionId: null }),
    ];
    const cascade = computeAbandonCascade('lonely', sessions);
    expect(cascade).toEqual(['lonely']);
  });
});
