/**
 * Classification Pipeline — end-to-end orchestrator for "X is a Y".
 *
 * This is the only module that calls StateAdapter. All other modules
 * (NLParser, Classifier, KnowledgeEngine, Validator, ScopeResolver,
 * DescriptionEngine) are pure functions.
 *
 * Pipeline: parse → (scopeResolve) → classify → processClassification →
 *           validate → applyMutation → describeConcept
 *
 * v2.1: Uses isConceptNode() for type checks on v2.1 dual-typed concepts.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

import { parse } from '../nl-parser/nl-parser.js';
import { classify } from '../classifier/classifier.js';
import { processClassification } from '../knowledge-engine/knowledge-engine.js';
import { validate } from '../validator/validator.js';
import { resolveScope } from '../scope-resolver/scope-resolver.js';
import { describeConcept } from '../description-engine/description-engine.js';
import { isConceptNode } from '../../types/type-checks.js';

/**
 * Run the full classification pipeline from raw utterance to graph mutation.
 *
 * @param {string} utterance - Raw user input (e.g., "A dog is an animal")
 * @param {object} context - Pipeline context
 * @param {object} context.stateAdapter - StateAdapter instance
 * @param {string} context.graphId - Target graph IRI
 * @param {object} [options={}]
 * @param {boolean} [options.scopeResolutionEnabled=false]
 * @param {string} [options.locale='en']
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @param {boolean} [options.negotiateUnknownParent=false]
 * @returns {object} Pipeline result
 */
export function runClassificationPipeline(utterance, context, options = {}) {
  const {
    scopeResolutionEnabled = false,
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
    negotiateUnknownParent = false,
  } = options;

  const { stateAdapter, graphId } = context;

  const baseResult = {
    success: false,
    graph: null,
    mutation: null,
    validation: null,
    prompts: [],
    descriptions: [],
    parseResult: null,
    classificationAction: null,
    scopeResolutions: null,
    error: null,
    errorReason: null,
  };

  // ── Step 1: Parse ──
  const parseResult = parse(utterance);
  baseResult.parseResult = parseResult;

  if (parseResult['fandaws:error']) {
    return {
      ...baseResult,
      error: true,
      errorReason: `parse-error: ${parseResult['fandaws:errorReason']}`,
    };
  }

  // ── Step 2: Scope Resolution (optional) ──
  if (scopeResolutionEnabled) {
    const subjectScope = resolveScope(parseResult['fandaws:subject']);
    const objectScope = resolveScope(parseResult['fandaws:object']);
    baseResult.scopeResolutions = { subject: subjectScope, object: objectScope };
    // Null stub always returns "unknown" — continue normally
  }

  // ── Step 3: Classify ──
  const action = classify(parseResult);
  baseResult.classificationAction = action;

  if (action['fandaws:error']) {
    return {
      ...baseResult,
      error: true,
      errorReason: `classify-error: ${action['fandaws:errorReason']}`,
    };
  }

  if (action['fandaws:workflow'] !== 'classification') {
    return {
      ...baseResult,
      error: true,
      errorReason: `wrong-workflow: ${action['fandaws:workflow']}`,
    };
  }

  // ── Step 4: Load graph snapshot ──
  let graph = stateAdapter.loadGraph(graphId);
  if (!graph) {
    return {
      ...baseResult,
      error: true,
      errorReason: 'graph-not-found',
    };
  }

  const indices = stateAdapter.getIndices(graphId);

  // ── Step 5: KnowledgeEngine ──
  const engineResult = processClassification(action, graph, indices, {
    graphId,
    locale,
    abbreviationTable,
    protectedProperNouns,
    negotiateUnknownParent,
    reclassificationConfirmed: options.reclassificationConfirmed,
    existingConceptIri: options.existingConceptIri,
    proximityThreshold: options.proximityThreshold,
    qualifiers: options.qualifiers,
    relabelExisting: options.relabelExisting,
    resolvedConceptIri: options.resolvedConceptIri,
    disambiguationAction: options.disambiguationAction,
    bfoCategoryChoice: options.bfoCategoryChoice,
  }, stateAdapter);

  if (engineResult.error) {
    return {
      ...baseResult,
      error: true,
      errorReason: `engine-error: ${engineResult.errorReason}`,
    };
  }

  if (engineResult.prompts.length > 0) {
    return {
      ...baseResult,
      prompts: engineResult.prompts,
      error: false,
    };
  }

  if (!engineResult.mutation) {
    // No-op (re-assertion idempotency)
    return {
      ...baseResult,
      success: true,
      graph: stateAdapter.loadGraph(graphId),
      error: false,
    };
  }

  // ── Step 6: Validate ──
  const validation = validate(engineResult.mutation, graph);
  baseResult.validation = validation;

  if (!validation['fandaws:valid']) {
    return {
      ...baseResult,
      error: true,
      errorReason: 'validation-failed',
      mutation: engineResult.mutation,
    };
  }

  // ── Step 7: Apply mutation ──
  const updatedGraph = stateAdapter.applyMutation(graphId, engineResult.mutation);
  baseResult.mutation = engineResult.mutation;
  baseResult.graph = updatedGraph;

  // ── Step 8: Generate descriptions and write back to graph ──
  const descriptions = [];

  // Collect IRIs of all affected concepts (additions + modifications)
  const affectedIris = new Set();
  const additions = engineResult.mutation['fandaws:additions'] || [];
  for (const node of additions) {
    if (isConceptNode(node)) {
      affectedIris.add(node['@id']);
    }
  }
  const modifications = engineResult.mutation['fandaws:modifications'] || [];
  for (const mod of modifications) {
    if (mod['@id']) {
      affectedIris.add(mod['@id']);
    }
  }

  for (const iri of affectedIris) {
    const updatedConcept = (updatedGraph['fandaws:concepts'] || []).find(
      (c) => c['@id'] === iri,
    );
    if (updatedConcept) {
      const description = describeConcept(updatedConcept, updatedGraph);
      descriptions.push({ conceptIri: iri, description });
      updatedConcept['fandaws:algorithmicDefinition'] = description;
    }
  }

  // Persist updated descriptions
  if (descriptions.length > 0) {
    stateAdapter.saveGraph(graphId, updatedGraph);
  }
  baseResult.descriptions = descriptions;

  return {
    ...baseResult,
    success: true,
    error: false,
  };
}
