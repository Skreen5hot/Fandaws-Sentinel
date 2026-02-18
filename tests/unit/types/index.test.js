import { describe, it, expect } from '@jest/globals';
import * as types from '../../../src/types/index.js';

describe('types/index barrel export', () => {
  it('exports FANDAWS_CONTEXT', () => {
    expect(types.FANDAWS_CONTEXT).toBeDefined();
    expect(types.FANDAWS_CONTEXT).toHaveProperty('@context');
  });

  it('exports all 21 type factory functions', () => {
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
      'createConflictReport',
      'createConflictingDefinition',
      'createResolutionOption',
      'createResolvedFromAnnotation',
      'createShadowsAnnotation',
      'createDisambiguatedFromAnnotation',
      'createParseResult',
      'createClassificationAction',
      'createRoutingRecord',
    ];
    for (const name of expectedFactories) {
      expect(typeof types[name]).toBe('function');
    }
  });

  it('exports type check helpers', () => {
    expect(typeof types.isConceptNode).toBe('function');
    expect(typeof types.isRestrictionNode).toBe('function');
  });

  it('exports ERS register constants', () => {
    expect(types.REGISTERS).toBeDefined();
    expect(types.REGISTERS.AXIOMATIC).toBe('fandaws:register/axiomatic');
    expect(types.REGISTERS.NORMATIVE).toBe('fandaws:register/normative');
    expect(types.REGISTERS.ASPIRATIONAL).toBe('fandaws:register/aspirational');
    expect(types.ROUTING_METHODS).toBeDefined();
    expect(types.ROUTING_STRENGTHS).toBeDefined();
  });

  it('exports exactly 27 members (1 context + 21 factories + 2 type checks + 3 constants)', () => {
    expect(Object.keys(types)).toHaveLength(27);
  });
});
