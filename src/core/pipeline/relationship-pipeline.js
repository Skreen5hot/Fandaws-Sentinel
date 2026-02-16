/**
 * Relationship Pipeline — end-to-end orchestrator for "X [verb] Y".
 *
 * This is the only module that calls StateAdapter. All other modules
 * (NLParser, Classifier, RelationshipWorkflow, Validator,
 * DescriptionEngine) are pure functions.
 *
 * Pipeline: parse → classify → processRelationship →
 *           validateRelationship → validate → applyMutation → describeConcepts
 *
 * @see Fandaws_v3.3_Specification.md Section 5.4
 */

import { parse } from '../nl-parser/nl-parser.js';
import { classify } from '../classifier/classifier.js';
import { processRelationship } from '../knowledge-engine/relationship-workflow.js';
import { validateRelationship } from '../validator/relationship-validation.js';
import { validate } from '../validator/validator.js';
import { describeConcept } from '../description-engine/description-engine.js';
import { isConceptNode } from '../../types/type-checks.js';

/**
 * Run the full relationship pipeline from raw utterance to graph mutation.
 *
 * @param {string} utterance - Raw user input (e.g., "Dogs chase cats")
 * @param {object} context - Pipeline context
 * @param {object} context.stateAdapter - StateAdapter instance
 * @param {string} context.graphId - Target graph IRI
 * @param {object} [options={}]
 * @param {string} [options.locale='en']
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @returns {object} Pipeline result
 */
export function runRelationshipPipeline(utterance, context, options = {}) {
  const {
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
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
    error: null,
    errorReason: null,
    normalizedVerb: null,
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

  // ── Step 2: Classify ──
  const action = classify(parseResult);
  baseResult.classificationAction = action;

  if (action['fandaws:error']) {
    return {
      ...baseResult,
      error: true,
      errorReason: `classify-error: ${action['fandaws:errorReason']}`,
    };
  }

  if (action['fandaws:workflow'] !== 'customRelationship') {
    return {
      ...baseResult,
      error: true,
      errorReason: `wrong-workflow: ${action['fandaws:workflow']}`,
    };
  }

  // ── Step 3: Load graph snapshot ──
  let graph = stateAdapter.loadGraph(graphId);
  if (!graph) {
    return {
      ...baseResult,
      error: true,
      errorReason: 'graph-not-found',
    };
  }

  const indices = stateAdapter.getIndices(graphId);

  // ── Step 4: Process relationship ──
  const engineResult = processRelationship(action, graph, indices, {
    locale,
    abbreviationTable,
    protectedProperNouns,
  });

  baseResult.normalizedVerb = engineResult.normalizedVerb;

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
    // No-op
    return {
      ...baseResult,
      success: true,
      graph: stateAdapter.loadGraph(graphId),
      error: false,
    };
  }

  // ── Step 5: Relationship-specific validation ──
  const additions = engineResult.mutation['fandaws:additions'] || [];
  const relNodes = additions.filter(
    (n) => n['@type'] === 'owl:Restriction' && n['fandaws:restrictionKind'] === 'relationship',
  );

  for (const relNode of relNodes) {
    const relValidation = validateRelationship(relNode, graph, indices);
    const blockingViolations = relValidation.violations.filter(
      (v) => v.severity === 'error',
    );
    if (blockingViolations.length > 0) {
      return {
        ...baseResult,
        error: true,
        errorReason: `relationship-validation: ${blockingViolations[0].reason}`,
        validation: { violations: blockingViolations },
        mutation: engineResult.mutation,
      };
    }
  }

  // ── Step 6: General validation (structural) ──
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

  // ── Step 8: Generate descriptions ──
  const descriptions = [];
  for (const node of additions) {
    if (isConceptNode(node)) {
      const updatedConcept = (updatedGraph['fandaws:concepts'] || []).find(
        (c) => c['@id'] === node['@id'],
      );
      if (updatedConcept) {
        descriptions.push({
          conceptIri: node['@id'],
          description: describeConcept(updatedConcept, updatedGraph),
        });
      }
    }
  }

  // Also describe the subject concept (it got a new relationship)
  const subjectIri = relNodes[0]?.['fandaws:attachedTo'];
  if (subjectIri && !descriptions.some((d) => d.conceptIri === subjectIri)) {
    const subjectConcept = (updatedGraph['fandaws:concepts'] || []).find(
      (c) => c['@id'] === subjectIri,
    );
    if (subjectConcept) {
      descriptions.push({
        conceptIri: subjectIri,
        description: describeConcept(subjectConcept, updatedGraph),
      });
    }
  }

  baseResult.descriptions = descriptions;

  return {
    ...baseResult,
    success: true,
    error: false,
  };
}
