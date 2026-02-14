import { describe, it, expect } from '@jest/globals';
import { createConversationSession } from '../../../src/types/conversation-session.js';

describe('createConversationSession', () => {
  it('produces a node with @type fandaws:ConversationSession', () => {
    const session = createConversationSession({
      sessionId: 'fandaws:session/001',
      callerId: 'user-aaron',
      term: 'dog',
      workingGraphId: 'fandaws:graph/user-aaron',
    });
    expect(session['@type']).toBe('fandaws:ConversationSession');
  });

  it('sets all required fields', () => {
    const session = createConversationSession({
      sessionId: 'fandaws:session/002',
      callerId: 'user-test',
      term: 'autonomy',
      workingGraphId: 'fandaws:graph/test',
    });
    expect(session['fandaws:sessionId']).toBe('fandaws:session/002');
    expect(session['fandaws:callerId']).toBe('user-test');
    expect(session['fandaws:term']).toBe('autonomy');
    expect(session['fandaws:workingGraphId']).toBe('fandaws:graph/test');
  });

  it('defaults to negotiating state with is_a phase', () => {
    const session = createConversationSession({
      sessionId: 's',
      callerId: 'c',
      term: 't',
      workingGraphId: 'g',
    });
    expect(session['fandaws:state']).toBe('negotiating');
    expect(session['fandaws:currentPhase']).toBe('is_a');
  });

  it('generates createdAt and lastActiveAt timestamps', () => {
    const session = createConversationSession({
      sessionId: 's',
      callerId: 'c',
      term: 't',
      workingGraphId: 'g',
    });
    expect(typeof session['fandaws:createdAt']).toBe('string');
    expect(typeof session['fandaws:lastActiveAt']).toBe('string');
    expect(new Date(session['fandaws:createdAt']).toISOString()).toBe(session['fandaws:createdAt']);
    // Both timestamps should be equal on creation
    expect(session['fandaws:createdAt']).toBe(session['fandaws:lastActiveAt']);
  });

  it('defaults nesting fields for root sessions', () => {
    const session = createConversationSession({
      sessionId: 's',
      callerId: 'c',
      term: 't',
      workingGraphId: 'g',
    });
    expect(session['fandaws:parentSessionId']).toBeNull();
    expect(session['fandaws:nestingDepth']).toBe(0);
    expect(session['fandaws:dialogueHistory']).toEqual([]);
    expect(session['fandaws:expiresAt']).toBeNull();
    expect(session['fandaws:scopeConfig']).toBeNull();
  });

  it('accepts nested session parameters', () => {
    const session = createConversationSession({
      sessionId: 'fandaws:session/child',
      callerId: 'user-test',
      term: 'canine',
      workingGraphId: 'fandaws:graph/test',
      parentSessionId: 'fandaws:session/parent',
      nestingDepth: 2,
      state: 'nested',
    });
    expect(session['fandaws:parentSessionId']).toBe('fandaws:session/parent');
    expect(session['fandaws:nestingDepth']).toBe(2);
    expect(session['fandaws:state']).toBe('nested');
  });
});
