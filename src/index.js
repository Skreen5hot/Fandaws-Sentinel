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
  createRoutingRecord,
  REGISTERS,
  ROUTING_METHODS,
  ROUTING_STRENGTHS,
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
export {
  generateConceptIri,
  generatePropertyIri,
  generateRestrictionIri,
  generateRelationshipIri,
  generateRoutingRecordIri,
  DEFAULT_SCOPE,
} from './core/knowledge-engine/iri-generator.js';

// UUID v5 + BFO Heuristic (Infrastructure)
export { uuid5, FANDAWS_NAMESPACE } from './core/knowledge-engine/uuid5.js';
export { BFO, BFO_LABELS, HEURISTIC_EXCEPTIONS, inferBfoCategory, inheritBfoCategory } from './core/knowledge-engine/bfo-heuristic.js';

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

// ExportEngine (Phase 10)
export { exportGraph } from './core/export-engine/export-engine.js';
export { exportSKOS } from './core/export-engine/skos-export.js';
export { exportOWL } from './core/export-engine/owl-export.js';
export { exportRDF } from './core/export-engine/rdf-xml-export.js';
export { exportTurtle } from './core/export-engine/turtle-export.js';
export { extractTriples, expandIri } from './core/export-engine/triple-extractor.js';

// Epistemic Register Service (Phase 10b)
export { routeToRegister, validateRegisterOverride } from './core/epistemic-register/epistemic-register.js';
export { lookupBfoRegister, AXIOMATIC_DOMAINS, BFO_REGISTER_MAP } from './core/epistemic-register/bfo-register-map.js';
export { detectTeleological } from './core/epistemic-register/teleological-detector.js';
export { disambiguateBearerRole } from './core/epistemic-register/bearer-role-disambiguator.js';

// IVNE — Ingestion, Validation & Normalization Engine (Phase 14)
export { compile } from './core/ivne/ivne.js';
export { LOSS_TYPES, SEVERITY, LOSS_SEVERITY_MAP, TRANSFORMATION_MAP, createLoss } from './core/ivne/semantic-loss.js';
export { sha256Hex } from './core/ivne/sha256.js';
export { extractLabel, iriToLocalName, splitCamelCase } from './core/ivne/label-extractor.js';
export { generateHashIri, canonicalizeExpression } from './core/ivne/ivne-iri-generator.js';
export {
  createIVNEConfiguration,
  createOntologyImportResult,
  createSemanticLossRecord,
  createReductionManifest,
  createCardinalityConstraint,
  TRANSFORMATION_TYPE,
} from './types/ivne-types.js';

// Session Lifecycle (Phase 11)
export { createDialogueTurn } from './types/dialogue-turn.js';
export {
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
} from './core/session/session-lifecycle.js';

// Adapter base classes
export { StateAdapter } from './adapters/state/state-adapter.js';
export { InMemoryStateAdapter } from './adapters/state/in-memory-state-adapter.js';
export { IntegrationAdapter } from './adapters/integration/integration-adapter.js';
export { OrchestrationAdapter } from './adapters/orchestration/orchestration-adapter.js';

// Adapter implementations (Phase 8)
export { NullIntegrationAdapter } from './adapters/integration/null-integration-adapter.js';
export { SynchronousOrchestrationAdapter } from './adapters/orchestration/synchronous-orchestration-adapter.js';

// M2M Orchestration (Phase 13)
export { M2MOrchestrationAdapter } from './adapters/orchestration/m2m-orchestration-adapter.js';

// Ingestion pipeline (Phases D1, D2)
export { evaluatePlacement, routePlacement } from './core/ingestion/placement-sandbox.js';
export { buildFingerprint, scoreAgainstAll, validateWeightVector, DEFAULT_WEIGHT_VECTOR, computeMatchScore } from './core/ingestion/fingerprint-matcher.js';
export { routeCandidate, validateSubPropertyPromotion, validateMergeTarget } from './core/ingestion/disambiguation-router.js';
export { buildFactBase, extractSubclassFacts } from './core/ingestion/fact-base-builder.js';
export { parseOntology, detectFormat } from './core/ingestion/ontology-parser.js';

// D1.6 DP-2.3.0 byte-capture retrofit (SME D3.2 lock): raw-byte content
// hashes captured at ingestion time, consumed by DP-2.3.2 Final Hash.
export { sha256, byteLengthOf } from './core/d16/crypto-shim.js';
export {
  captureSource as captureSourceBytes,
  captureBFO as captureBFOBytes,
  captureCurated as captureCuratedBytes,
  getHashes as getIngestionHashes,
  clearSession as clearIngestionSession,
} from './core/d16/ingestion-byte-registry.js';
