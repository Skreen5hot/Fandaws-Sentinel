import { describe, it, expect } from '@jest/globals';
import { createConversationPrompt } from '../../../src/types/conversation-prompt.js';

describe('createConversationPrompt', () => {
  it('produces a node with @type fandaws:ConversationPrompt', () => {
    const prompt = createConversationPrompt({
      promptType: 'confirmation',
      text: 'Are you sure?',
      context: {},
    });
    expect(prompt['@type']).toBe('fandaws:ConversationPrompt');
  });

  it('matches spec Appendix A.4 shape (human mode)', () => {
    const prompt = createConversationPrompt({
      promptType: 'scopeNarrowing',
      text: 'Does an Animal have eyes, or is this specific to Dog?',
      options: ['Animal (applies to all animals)', 'Dog (specific to dogs)'],
      context: {
        property: 'has eyes',
        originalConcept: 'fandaws:concept/dog',
        candidateAncestor: 'fandaws:concept/animal',
      },
    });

    expect(prompt['fandaws:promptType']).toBe('scopeNarrowing');
    expect(prompt['fandaws:text']).toBe(
      'Does an Animal have eyes, or is this specific to Dog?'
    );
    expect(prompt['fandaws:options']).toEqual([
      'Animal (applies to all animals)',
      'Dog (specific to dogs)',
    ]);
    expect(prompt['fandaws:context']).toEqual({
      property: 'has eyes',
      originalConcept: 'fandaws:concept/dog',
      candidateAncestor: 'fandaws:concept/animal',
    });
    expect(prompt['fandaws:machineSignal']).toBeNull();
  });

  it('accepts machineSignal for M2M mode (A.5 shape)', () => {
    const machineSignal = {
      'fandaws:expectedSchema': {
        type: 'object',
        properties: { selection: { type: 'string', enum: ['animal', 'dog'] } },
        required: ['selection'],
      },
      'fandaws:validValues': ['animal', 'dog'],
      'fandaws:constraintType': 'scopeLevel',
      'fandaws:candidateIRIs': ['fandaws:concept/animal', 'fandaws:concept/dog'],
      'fandaws:hierarchyContext': {},
    };
    const prompt = createConversationPrompt({
      promptType: 'scopeNarrowing',
      text: 'Does an Animal have eyes?',
      options: ['Animal', 'Dog'],
      context: { property: 'has eyes' },
      machineSignal,
    });
    expect(prompt['fandaws:machineSignal']).toBe(machineSignal);
    expect(prompt['fandaws:machineSignal']['fandaws:constraintType']).toBe('scopeLevel');
  });

  it('defaults options to null and machineSignal to null', () => {
    const prompt = createConversationPrompt({
      promptType: 'yesNo',
      text: 'Confirm?',
      context: {},
    });
    expect(prompt['fandaws:options']).toBeNull();
    expect(prompt['fandaws:machineSignal']).toBeNull();
  });
});
