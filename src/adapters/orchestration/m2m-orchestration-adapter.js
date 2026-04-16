/**
 * M2MOrchestrationAdapter — machine-to-machine conversation orchestrator.
 *
 * Wraps SynchronousOrchestrationAdapter. When callerMode='agent', enriches
 * every ConversationPrompt with a MachineSignal (layered: envelope + extension).
 * When callerMode='human', sets machineSignal to null (explicit, not absent).
 *
 * Also provides:
 *   - Deadlock tracking per (concept, mutationType) pair per session
 *   - Rate limiting (100 assertions / 60s sliding window per session)
 *   - Agent response validation against expectedSchema
 *
 * @see docs/architecture/phase-13-locked-decisions.md
 */

import { SynchronousOrchestrationAdapter } from './synchronous-orchestration-adapter.js';
import { buildMachineSignal, validateAgentResponse } from '../../core/m2m/machine-signal.js';
import { DeadlockTracker } from '../../core/m2m/deadlock-tracker.js';
import { RateLimiter } from '../../core/m2m/rate-limiter.js';

export class M2MOrchestrationAdapter extends SynchronousOrchestrationAdapter {
  constructor() {
    super();
    this._deadlockTracker = new DeadlockTracker();
    this._rateLimiter = new RateLimiter();
  }

  /**
   * Run the pipeline with M2M enrichment.
   *
   * @param {string} utterance
   * @param {object} context - { stateAdapter, graphId, callerMode, humanChannelAvailable }
   * @param {object} [options={}]
   * @returns {object} Pipeline result with enriched machineSignal
   */
  runPipeline(utterance, context, options = {}) {
    const callerMode = context.callerMode || 'human';

    // Rate limiting (agent mode only)
    if (callerMode === 'agent') {
      const rateCheck = this._rateLimiter.check();
      if (!rateCheck.allowed) {
        return {
          success: false,
          error: true,
          errorReason: 'rate-limit-exceeded',
          rateLimitError: rateCheck.error,
          graph: null,
          mutation: null,
          prompts: [],
          descriptions: [],
        };
      }
    }

    // Run the base pipeline
    const result = super.runPipeline(utterance, context, options);

    // Enrich prompts with MachineSignal
    if (result.prompts && result.prompts.length > 0) {
      for (const prompt of result.prompts) {
        const enrichmentContext = this._buildEnrichmentContext(prompt, context);
        try {
          prompt['fandaws:machineSignal'] = buildMachineSignal(
            callerMode, prompt, enrichmentContext,
          );
        } catch (e) {
          if (e.type === 'SchemaValidationError') {
            return {
              success: false,
              error: true,
              errorReason: 'schema-validation-error',
              schemaError: {
                type: 'SchemaValidationError',
                reason: e.reason,
                registeredTypes: e.registeredTypes,
              },
              graph: null,
              mutation: null,
              prompts: [],
              descriptions: [],
            };
          }
          throw e;
        }
      }
    }

    // Track rejections for deadlock detection (agent mode)
    if (callerMode === 'agent' && result.mutation === null && result.prompts.length === 0) {
      // Rejection — no mutation, no prompt (silent rejection)
      // Parse the utterance to extract concept and mutation type
      const pair = this._extractPair(utterance);
      if (pair) {
        const dl = this._deadlockTracker.recordRejection(
          pair.concept, pair.mutationType, result.errorReason || 'rejected',
        );
        result._deadlockState = dl;
      }
    }

    return result;
  }

  /**
   * Build enrichment context for MachineSignal extension builders.
   */
  _buildEnrichmentContext(prompt, context) {
    const promptType = prompt['fandaws:promptType'];
    const ctx = prompt['fandaws:context'] || {};
    const enrichment = {};

    if (promptType === 'reclassificationConsequence') {
      enrichment.caseType = ctx.caseType;
      enrichment.subject = ctx.subjectLabel;
      enrichment.currentParent = ctx.existingParentLabel || null;
      enrichment.proposedParent = ctx.newParentLabel || null;
      enrichment.lostProperties = [];
      if (ctx.lostPropertyCount > 0) {
        // Extract from prompt text
        const text = prompt['fandaws:text'] || '';
        const matches = text.match(/• (.+)/g);
        if (matches) {
          enrichment.lostProperties = matches.map((m) => {
            const line = m.replace('• ', '');
            return { description: line };
          });
        }
      }
    } else if (promptType === 'conflictResolution') {
      // Already populated by scope resolver
      const ms = prompt['fandaws:machineSignal'] || {};
      enrichment.term = ms.term || ctx.term;
      enrichment.definitions = ms.definitions || [];
      enrichment.candidateIRIs = ctx.candidateIRIs || [];
    } else if (promptType === 'homonymDisambiguation') {
      enrichment.candidates = [];
      enrichment.candidateIRIs = [];
      const opts = prompt['fandaws:options'] || [];
      for (const opt of opts) {
        if (typeof opt === 'object') {
          enrichment.candidateIRIs.push(opt.iri || opt.conceptIri);
          enrichment.candidates.push(opt);
        }
      }
      enrichment.hierarchyContext = {
        containsSubgraphFor: enrichment.candidateIRIs,
      };
    } else if (promptType === 'importedConceptGuard') {
      enrichment.blockedConcept = ctx.subjectLabel || ctx.conceptLabel;
      enrichment.reason = prompt['fandaws:text'] || 'Imported concepts are read-only';
    } else if (promptType === 'staleCopyPrompt') {
      const ms = prompt['fandaws:machineSignal'] || {};
      enrichment.term = ms.term;
      enrichment.localVersion = ms.localVersion;
      enrichment.sourceVersion = ms.sourceVersion;
      enrichment.differences = ms.differences || [];
    }

    return enrichment;
  }

  /**
   * Extract (concept, mutationType) pair from an utterance.
   */
  _extractPair(utterance) {
    // Simple extraction: "X is a Y" → (X, reclassification)
    const match = utterance.match(/^(?:a\s+)?(.+?)\s+is\s+(?:a\s+)?(.+)$/i);
    if (match) {
      return { concept: match[1].trim(), mutationType: 'reclassification' };
    }
    const hasMatch = utterance.match(/^(?:a\s+)?(.+?)\s+has\s+(?:a\s+)?(.+)$/i);
    if (hasMatch) {
      return { concept: hasMatch[1].trim(), mutationType: 'property' };
    }
    return null;
  }

  /**
   * Get the deadlock tracker (for testing).
   */
  get deadlockTracker() {
    return this._deadlockTracker;
  }

  /**
   * Get the rate limiter (for testing).
   */
  get rateLimiter() {
    return this._rateLimiter;
  }
}
