import { describe, it, expect } from '@jest/globals';
import * as types from '../../../src/types/index.js';

describe('types/index barrel export', () => {
  it('exports FANDAWS_CONTEXT', () => {
    expect(types.FANDAWS_CONTEXT).toBeDefined();
    expect(types.FANDAWS_CONTEXT).toHaveProperty('@context');
  });

  it('exports all 12 type factory functions', () => {
    const expectedFactories = [
      'createConcept',
      'createProperty',
      'createRelationship',
      'createKnowledgeGraph',
      'createGraphMutation',
      'createConversationPrompt',
      'createDeferredResult',
      'createValidationResult',
      'createConversationSession',
      'createScopeConfiguration',
      'createScopeEntry',
      'createScopeResolution',
    ];
    for (const name of expectedFactories) {
      expect(typeof types[name]).toBe('function');
    }
  });

  it('exports exactly 13 members (1 context + 12 factories)', () => {
    expect(Object.keys(types)).toHaveLength(13);
  });
});
