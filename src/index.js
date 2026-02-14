/**
 * Fandaws — Fact and Answer Web Service
 *
 * Edge-canonical conversational knowledge-building platform.
 * Runs unmodified in browser or Node.js.
 *
 * @see Fandaws_v3.3_Specification.md
 */

// Types
export {
  FANDAWS_CONTEXT,
  createConcept,
  createProperty,
  createRelationship,
  createKnowledgeGraph,
  createGraphMutation,
  createConversationPrompt,
  createDeferredResult,
  createValidationResult,
  createConversationSession,
  createScopeConfiguration,
  createScopeEntry,
  createScopeResolution,
  createConflictReport,
  createConflictingDefinition,
  createResolutionOption,
  createResolvedFromAnnotation,
  createShadowsAnnotation,
  createDisambiguatedFromAnnotation,
  createParseResult,
  createClassificationAction,
} from './types/index.js';

// Core modules
export {
  simplify,
  trimWhitespace,
  collapseWhitespace,
  removeLeadingArticles,
  applyNFKC,
  caseFold,
  expandAbbreviations,
} from './core/identity/identity-simplification.js';

export {
  parse,
  validateInput,
  normalizeInput,
  stripArticle,
  matchClassification,
  matchProperty,
  matchCustomRelationship,
} from './core/nl-parser/nl-parser.js';

export { classify } from './core/classifier/classifier.js';

// Adapter base classes
export { StateAdapter } from './adapters/state/state-adapter.js';
export { InMemoryStateAdapter } from './adapters/state/in-memory-state-adapter.js';
export { IntegrationAdapter } from './adapters/integration/integration-adapter.js';
export { OrchestrationAdapter } from './adapters/orchestration/orchestration-adapter.js';
