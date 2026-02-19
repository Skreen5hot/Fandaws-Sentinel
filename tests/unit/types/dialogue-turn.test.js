/**
 * DialogueTurn Type Factory — Unit Tests
 *
 * DT-01 through DT-08
 */

import { describe, it, expect } from '@jest/globals';
import { createDialogueTurn } from '../../../src/types/dialogue-turn.js';

describe('createDialogueTurn', () => {
  // DT-01
  it('produces a node with @type fandaws:DialogueTurn', () => {
    const turn = createDialogueTurn({
      role: 'system',
      content: 'What is the parent of dog?',
      turnIndex: 0,
      phase: 'is_a',
    });
    expect(turn['@type']).toBe('fandaws:DialogueTurn');
  });

  // DT-02
  it('sets all required fields', () => {
    const turn = createDialogueTurn({
      role: 'caller',
      content: 'A dog is an animal',
      turnIndex: 3,
      phase: 'has',
      timestamp: '2026-01-15T10:00:00.000Z',
    });
    expect(turn['fandaws:role']).toBe('caller');
    expect(turn['fandaws:content']).toBe('A dog is an animal');
    expect(turn['fandaws:turnIndex']).toBe(3);
    expect(turn['fandaws:phase']).toBe('has');
    expect(turn['fandaws:timestamp']).toBe('2026-01-15T10:00:00.000Z');
  });

  // DT-03
  it('auto-generates timestamp if not provided', () => {
    const before = new Date().toISOString();
    const turn = createDialogueTurn({
      role: 'system',
      content: 'Prompt',
      turnIndex: 0,
      phase: 'is_a',
    });
    const after = new Date().toISOString();

    expect(turn['fandaws:timestamp']).toBeDefined();
    expect(turn['fandaws:timestamp'] >= before).toBe(true);
    expect(turn['fandaws:timestamp'] <= after).toBe(true);
  });

  // DT-04
  it('accepts explicit timestamp', () => {
    const ts = '2025-06-01T00:00:00.000Z';
    const turn = createDialogueTurn({
      role: 'transition',
      content: 'negotiating → paused',
      turnIndex: 5,
      phase: 'is_a',
      timestamp: ts,
    });
    expect(turn['fandaws:timestamp']).toBe(ts);
  });

  // DT-05
  it('throws on invalid role', () => {
    expect(() =>
      createDialogueTurn({
        role: 'unknown',
        content: 'test',
        turnIndex: 0,
        phase: 'is_a',
      }),
    ).toThrow(/Invalid dialogue turn role/);
  });

  it('accepts all three valid roles', () => {
    for (const role of ['system', 'caller', 'transition']) {
      const turn = createDialogueTurn({
        role,
        content: 'test',
        turnIndex: 0,
        phase: 'is_a',
      });
      expect(turn['fandaws:role']).toBe(role);
    }
  });

  // DT-06
  it('requires turnIndex to be a non-negative integer', () => {
    expect(() =>
      createDialogueTurn({
        role: 'system',
        content: 'test',
        turnIndex: -1,
        phase: 'is_a',
      }),
    ).toThrow(/non-negative integer/);

    expect(() =>
      createDialogueTurn({
        role: 'system',
        content: 'test',
        turnIndex: 1.5,
        phase: 'is_a',
      }),
    ).toThrow(/non-negative integer/);
  });

  // DT-07
  it('requires content to be a string', () => {
    expect(() =>
      createDialogueTurn({
        role: 'system',
        content: 42,
        turnIndex: 0,
        phase: 'is_a',
      }),
    ).toThrow(/content must be a string/);
  });

  // DT-08
  it('preserves phase value', () => {
    for (const phase of ['is_a', 'has', 'relationship', 'complete']) {
      const turn = createDialogueTurn({
        role: 'system',
        content: 'prompt',
        turnIndex: 0,
        phase,
      });
      expect(turn['fandaws:phase']).toBe(phase);
    }
  });
});
