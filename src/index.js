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
  isConceptNode,
  isRestrictionNode,
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
export { generateConceptIri, generatePropertyIri, generateRelationshipIri } from './core/knowledge-engine/iri-generator.js';

// Property Workflow (Phase 6)
export { processProperty } from './core/knowledge-engine/property-workflow.js';
export { buildAncestorChain, narrowScope } from './core/knowledge-engine/scope-narrowing.js';

// Relationship Workflow (Phase 9)
export { processRelationship } from './core/knowledge-engine/relationship-workflow.js';
export { normalizeVerb, validateRelationship } from './core/validator/relationship-validation.js';
export { findDuplicates, computeDepth as computeMergeDepth, countAssertions, decideMergeWinner } from './core/validator/termidium.js';

// ScopeResolver stub (Phase 5)
export { resolveScope } from './core/scope-resolver/scope-resolver.js';

// DescriptionEngine stub (Phase 5)
export { describeConcept } from './core/description-engine/description-engine.js';

// ConceptHydrator (v2.1)
export {
  hydrate,
  dehydrate,
  computeDepth,
  computeChildren,
} from './core/hydrator/concept-hydrator.js';

// Classification Pipeline (Phase 5)
export { runClassificationPipeline } from './core/pipeline/classification-pipeline.js';

// Property Pipeline (Phase 6)
export { runPropertyPipeline } from './core/pipeline/property-pipeline.js';

// Relationship Pipeline (Phase 9)
export { runRelationshipPipeline } from './core/pipeline/relationship-pipeline.js';

// Adapter base classes
export { StateAdapter } from './adapters/state/state-adapter.js';
export { InMemoryStateAdapter } from './adapters/state/in-memory-state-adapter.js';
export { IntegrationAdapter } from './adapters/integration/integration-adapter.js';
export { OrchestrationAdapter } from './adapters/orchestration/orchestration-adapter.js';

// Adapter implementations (Phase 8)
export { NullIntegrationAdapter } from './adapters/integration/null-integration-adapter.js';
export { SynchronousOrchestrationAdapter } from './adapters/orchestration/synchronous-orchestration-adapter.js';
