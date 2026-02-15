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

// Validator (Phase 4)
export { validate } from './core/validator/validator.js';
export {
  checkCompoundStatement,
  checkStructuralGrounding,
  validateConfirmationResponse,
} from './core/validator/input-sanitizer.js';
export {
  detectCycle,
  buildParentIndex,
  checkMutationForCycles,
} from './core/validator/sanity-check.js';
export { checkPropertyRedundancy } from './core/validator/property-redundancy.js';

// Governance stubs (Phase 4b)
export {
  checkGovernanceBlock,
  nullOCECheck,
  nullIEECheck,
  createGovernanceEpistemicFailure,
} from './core/validator/governance-check.js';

// KnowledgeEngine (Phase 5)
export { processClassification } from './core/knowledge-engine/knowledge-engine.js';
export { generateConceptIri } from './core/knowledge-engine/iri-generator.js';

// ScopeResolver stub (Phase 5)
export { resolveScope } from './core/scope-resolver/scope-resolver.js';

// DescriptionEngine stub (Phase 5)
export { describeConcept } from './core/description-engine/description-engine.js';

// Classification Pipeline (Phase 5)
export { runClassificationPipeline } from './core/pipeline/classification-pipeline.js';

// Adapter base classes
export { StateAdapter } from './adapters/state/state-adapter.js';
export { InMemoryStateAdapter } from './adapters/state/in-memory-state-adapter.js';
export { IntegrationAdapter } from './adapters/integration/integration-adapter.js';
export { OrchestrationAdapter } from './adapters/orchestration/orchestration-adapter.js';
