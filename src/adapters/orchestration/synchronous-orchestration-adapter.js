/**
 * SynchronousOrchestrationAdapter — single-threaded conversation orchestrator.
 *
 * Routes utterances to the correct pipeline (classification or property)
 * based on Classifier output. Manages conversation output for prompt/response
 * cycles in a synchronous, call-and-return model.
 *
 * @see Fandaws_v3.3_Specification.md Section 12.4
 */

import { OrchestrationAdapter } from './orchestration-adapter.js';
import { parse } from '../../core/nl-parser/nl-parser.js';
import { classify } from '../../core/classifier/classifier.js';
import { runClassificationPipeline } from '../../core/pipeline/classification-pipeline.js';
import { runPropertyPipeline } from '../../core/pipeline/property-pipeline.js';

export class SynchronousOrchestrationAdapter extends OrchestrationAdapter {
  constructor() {
    super();
    this._outputBuffer = [];
    this._callerMode = 'human';
    this._lastInput = null;
  }

  /**
   * Execute the full pipeline for a single utterance.
   *
   * Routes to classification or property pipeline based on Classifier output.
   * Custom relationships return unsupported-workflow (Phase 9).
   *
   * @param {string} utterance - Raw user input
   * @param {object} context - { stateAdapter, graphId }
   * @param {object} [options={}] - Pipeline options (forwarded to sub-pipeline)
   * @returns {object} Pipeline result
   */
  runPipeline(utterance, context, options = {}) {
    // Step 1: Parse to determine workflow type
    const parseResult = parse(utterance);

    if (parseResult['fandaws:error']) {
      return {
        success: false,
        graph: null,
        mutation: null,
        validation: null,
        prompts: [],
        descriptions: [],
        parseResult,
        error: true,
        errorReason: `parse-error: ${parseResult['fandaws:errorReason']}`,
      };
    }

    // Step 2: Classify to determine workflow
    const action = classify(parseResult);

    if (action['fandaws:error']) {
      return {
        success: false,
        graph: null,
        mutation: null,
        validation: null,
        prompts: [],
        descriptions: [],
        parseResult,
        classificationAction: action,
        error: true,
        errorReason: `classify-error: ${action['fandaws:errorReason']}`,
      };
    }

    const workflow = action['fandaws:workflow'];

    // Step 3: Route to correct pipeline
    let result;

    switch (workflow) {
      case 'classification':
        result = runClassificationPipeline(utterance, context, options);
        break;

      case 'property':
        result = runPropertyPipeline(utterance, context, options);
        break;

      case 'customRelationship':
        result = {
          success: false,
          graph: null,
          mutation: null,
          validation: null,
          prompts: [],
          descriptions: [],
          parseResult,
          classificationAction: action,
          error: true,
          errorReason: 'unsupported-workflow: customRelationship',
        };
        break;

      default:
        result = {
          success: false,
          graph: null,
          mutation: null,
          validation: null,
          prompts: [],
          descriptions: [],
          parseResult,
          classificationAction: action,
          error: true,
          errorReason: `unknown-workflow: ${workflow}`,
        };
        break;
    }

    // Step 4: Collect prompts in output buffer
    if (result.prompts && result.prompts.length > 0) {
      this.emitOutput({
        type: 'prompts',
        prompts: result.prompts,
        utterance,
      });
    }

    return result;
  }

  /**
   * Returns the caller mode for machineSignal population.
   * @returns {'human'|'agent'}
   */
  getCallerMode() {
    return this._callerMode;
  }

  /**
   * Collect output (prompts, results) to internal buffer.
   * @param {object} output - Output payload
   */
  emitOutput(output) {
    this._outputBuffer.push(output);
  }

  /**
   * Accept input from caller. In synchronous mode, input is passed
   * directly to runPipeline via context/options. This method exists
   * for interface compliance and future async modes.
   * @param {object} input - { text?, confirmation?, selection? }
   */
  receiveInput(input) {
    this._lastInput = input;
  }

  /**
   * Check for semantic deadlock. Null stub — always returns no deadlock.
   * @param {string} sessionId
   * @returns {object} DeadlockStatus
   */
  checkDeadlock(sessionId) {
    return {
      '@type': 'fandaws:DeadlockStatus',
      'fandaws:deadlocked': false,
      'fandaws:sessionId': sessionId,
      'fandaws:reason': null,
    };
  }

  /**
   * Get the output buffer contents.
   * @returns {object[]}
   */
  getOutputBuffer() {
    return [...this._outputBuffer];
  }

  /**
   * Clear the output buffer.
   */
  clearOutputBuffer() {
    this._outputBuffer = [];
  }
}
