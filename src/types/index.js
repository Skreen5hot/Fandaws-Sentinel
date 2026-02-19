/**
 * Fandaws JSON-LD Type Factories
 *
 * Central export for all data type constructors.
 */

export { FANDAWS_CONTEXT } from './context.js';
export { createConcept } from './concept.js';
export { createProperty } from './property.js';
export { createRelationship } from './relationship.js';
export { createKnowledgeGraph } from './knowledge-graph.js';
export { createGraphMutation } from './graph-mutation.js';
export { createConversationPrompt } from './conversation-prompt.js';
export { createDeferredResult } from './deferred-result.js';
export { createValidationResult } from './validation-result.js';
export { createConversationSession } from './conversation-session.js';
export { createScopeConfiguration, createScopeEntry } from './scope-configuration.js';
export { createScopeResolution } from './scope-resolution.js';
export {
  createConflictReport,
  createConflictingDefinition,
  createResolutionOption,
} from './conflict-report.js';
export { createResolvedFromAnnotation } from './resolved-from.js';
export {
  createShadowsAnnotation,
  createDisambiguatedFromAnnotation,
} from './shadows-annotation.js';
export { createParseResult } from './parse-result.js';
export { createClassificationAction } from './classification-action.js';
export { isConceptNode, isRestrictionNode } from './type-checks.js';
export {
  createRoutingRecord,
  REGISTERS,
  ROUTING_METHODS,
  ROUTING_STRENGTHS,
} from './routing-record.js';

// Session Lifecycle (Phase 11)
export { createDialogueTurn } from './dialogue-turn.js';

// IVNE Type Factories (Phase 14)
export {
  createIVNEConfiguration,
  createOntologyImportResult,
  createSemanticLossRecord,
  createReductionManifest,
  createCardinalityConstraint,
  TRANSFORMATION_TYPE,
} from './ivne-types.js';
