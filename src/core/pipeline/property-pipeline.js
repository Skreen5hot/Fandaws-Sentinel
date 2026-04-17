/**
 * Property Pipeline — end-to-end orchestrator for "X has Y".
 *
 * This is the only module that calls StateAdapter. All other modules
 * (NLParser, Classifier, PropertyWorkflow, Validator, DescriptionEngine)
 * are pure functions.
 *
 * Pipeline: parse → classify → processProperty →
 *           validate → applyMutation → describeConcepts
 *
 * @see Fandaws_v3.3_Specification.md Section 5.3
 */

import { parse } from '../nl-parser/nl-parser.js';
import { classify } from '../classifier/classifier.js';
import { processProperty } from '../knowledge-engine/property-workflow.js';
import { validate } from '../validator/validator.js';
import { describeConcept } from '../description-engine/description-engine.js';
import { routeToRegister } from '../epistemic-register/epistemic-register.js';
import { isRestrictionNode } from '../../types/type-checks.js';

/**
 * Collect descendant IRIs from a starting concept using BFS.
 *
 * @param {string} startIri - Starting concept IRI
 * @param {Map<string, Set<string>>} iriToChildren - Children index
 * @returns {string[]} All descendant IRIs (not including start)
 */
function collectDescendants(startIri, iriToChildren) {
  const descendants = [];
  const queue = [...(iriToChildren.get(startIri) || [])];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    descendants.push(current);

    const children = iriToChildren.get(current) || new Set();
    for (const child of children) {
      queue.push(child);
    }
  }

  return descendants;
}

/**
 * Run the full property pipeline from raw utterance to graph mutation.
 *
 * @param {string} utterance - Raw user input (e.g., "A dog has fur")
 * @param {object} context - Pipeline context
 * @param {object} context.stateAdapter - StateAdapter instance
 * @param {string} context.graphId - Target graph IRI
 * @param {object} [options={}]
 * @param {string} [options.locale='en']
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @param {Map<string, boolean>} [options.scopeDecisions] - Accumulated scope narrowing answers
 * @param {boolean} [options.leapCheckEnabled=true] - Use Leap Check optimization
 * @returns {object} Pipeline result
 */
export function runPropertyPipeline(utterance, context, options = {}) {
  const {
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
    scopeDecisions = new Map(),
    leapCheckEnabled = true,
  } = options;

  const { stateAdapter, graphId } = context;

  const baseResult = {
    success: false,
    graph: null,
    mutation: null,
    validation: null,
    prompts: [],
    descriptions: [],
    scopeContext: null,
    parseResult: null,
    propertyAction: null,
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

  // ── Step 2: Classify ──
  const action = classify(parseResult);
  baseResult.propertyAction = action;

  if (action['fandaws:error']) {
    return {
      ...baseResult,
      error: true,
      errorReason: `classify-error: ${action['fandaws:errorReason']}`,
    };
  }

  if (action['fandaws:workflow'] !== 'property') {
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

  // ── Step 4: Property Engine ──
  const engineResult = processProperty(action, graph, indices, {
    locale,
    abbreviationTable,
    protectedProperNouns,
    scopeDecisions,
    leapCheckEnabled,
    resolvedConceptIri: options.resolvedConceptIri,
    consistencyCheckOverride: options.consistencyCheckOverride,
  }, stateAdapter);

  if (engineResult.error) {
    return {
      ...baseResult,
      error: true,
      errorReason: `engine-error: ${engineResult.errorReason}`,
      prompts: engineResult.prompts,
    };
  }

  if (engineResult.prompts.length > 0) {
    return {
      ...baseResult,
      prompts: engineResult.prompts,
      scopeContext: engineResult.scopeContext,
      error: false,
    };
  }

  if (!engineResult.mutation) {
    // No-op (idempotency)
    return {
      ...baseResult,
      success: true,
      graph: stateAdapter.loadGraph(graphId),
      error: false,
    };
  }

  // ── Step 4b: Epistemic Register Routing ──
  if (options.ersConfig?.epistemicRegisterEnabled !== false) {
    const ersAdditions = engineResult.mutation['fandaws:additions'] || [];
    for (const node of ersAdditions) {
      if (isRestrictionNode(node)) {
        const ersResult = routeToRegister(node, {
          graph,
          session: context.session,
          config: options.ersConfig,
          utterance,
          scope: options.scope,
        });
        if (ersResult) {
          node['fandaws:epistemicRegister'] = ersResult.register;
          node['fandaws:routingRecord'] = ersResult.routingRecord;
          if (ersResult.flags.length > 0) {
            node['fandaws:routingFlags'] = ersResult.flags;
          }
        }
      }
    }
  }

  // ── Step 5: Validate ──
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

  // ── Step 6: Apply mutation ──
  const updatedGraph = stateAdapter.applyMutation(graphId, engineResult.mutation);
  baseResult.mutation = engineResult.mutation;
  baseResult.graph = updatedGraph;

  // ── Step 7: Generate descriptions and write back to graph ──
  // Regenerate for attachment target + all its descendants
  const descriptions = [];
  const additions = engineResult.mutation['fandaws:additions'] || [];

  for (const node of additions) {
    if (node['fandaws:attachedTo']) {
      const attachedIri = node['fandaws:attachedTo'];

      // Describe the attachment target
      const targetConcept = (updatedGraph['fandaws:concepts'] || []).find(
        (c) => c['@id'] === attachedIri,
      );
      if (targetConcept) {
        const description = describeConcept(targetConcept, updatedGraph);
        descriptions.push({ conceptIri: attachedIri, description });
        targetConcept['fandaws:algorithmicDefinition'] = description;
      }

      // Describe descendants (property inherited down)
      const updatedIndices = stateAdapter.getIndices(graphId);
      if (updatedIndices) {
        const descendantIris = collectDescendants(attachedIri, updatedIndices.iriToChildren);
        for (const descIri of descendantIris) {
          const descConcept = (updatedGraph['fandaws:concepts'] || []).find(
            (c) => c['@id'] === descIri,
          );
          if (descConcept) {
            const description = describeConcept(descConcept, updatedGraph);
            descriptions.push({ conceptIri: descIri, description });
            descConcept['fandaws:algorithmicDefinition'] = description;
          }
        }
      }
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
