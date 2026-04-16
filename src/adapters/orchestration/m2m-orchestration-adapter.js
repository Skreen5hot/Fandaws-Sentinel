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
    let result = super.runPipeline(utterance, context, options);

    // Agent mode: suppress non-essential prompts that the agent
    // can't meaningfully respond to. This does NOT suppress prompts
    // with MachineSignal (those are the ones the agent needs).
    // Only suppress scopeNarrowing by marking it as "no" (don't narrow).
    // Disambiguation and homonym prompts are left for the agent to handle
    // via MachineSignal.

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

    // Track rejections for deadlock detection (agent mode).
    // A "rejection" is any result where the mutation was blocked:
    // - Silent rejection (no mutation, no prompts)
    // - Blocking guard prompt (importedConceptGuard, etc.)
    if (callerMode === 'agent' && result.mutation === null) {
      const isBlockingGuard = result.prompts?.some(
        (p) => p['fandaws:promptType'] === 'importedConceptGuard',
      );
      const isSilentRejection = result.prompts.length === 0;

      if (isSilentRejection || isBlockingGuard) {
        const pair = this._extractPair(utterance);
        if (pair) {
          const reason = isBlockingGuard ? 'importedConceptGuard' : (result.errorReason || 'rejected');
          const dl = this._deadlockTracker.recordRejection(pair.concept, pair.mutationType, reason);
          result._deadlockState = dl;

          // If deadlock threshold reached, emit cascade
          if (dl.deadlockDetected && !dl.epistemicFailureAlreadyFired) {
            result._deadlockCascade = this._runCascade(pair, dl, context);
          }
        }
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
      enrichment.currentParent = ctx.oldParentLabel || null;
      enrichment.proposedParent = ctx.newParentLabel || null;
      enrichment.lostProperties = [];
      if (ctx.lostPropertyCount > 0) {
        const text = prompt['fandaws:text'] || '';
        const matches = text.match(/• (.+)/g);
        if (matches) {
          enrichment.lostProperties = matches.map((m) => {
            const line = m.replace('• ', '');
            // Parse "Organism has DNA (inherited by animal)" format
            const parts = line.match(/^(.+?) has (.+?) \(/);
            if (parts) {
              return {
                ancestor: parts[1].toLowerCase(),
                property: `has ${parts[2].toLowerCase()}`,
                affectedDescendants: 0,
              };
            }
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
      // Options may be objects with IRIs or plain label strings.
      // Look up IRIs from the graph when options are strings.
      const graph = context.stateAdapter?.loadGraph(context.graphId);
      const concepts = graph?.['fandaws:concepts'] || [];
      for (const opt of opts) {
        if (typeof opt === 'object' && (opt.iri || opt.conceptIri)) {
          enrichment.candidateIRIs.push(opt.iri || opt.conceptIri);
          enrichment.candidates.push(opt);
        } else if (typeof opt === 'string') {
          const concept = concepts.find((c) => c['skos:prefLabel'] === opt || c['rdfs:label'] === opt);
          if (concept) {
            const parentChain = [];
            let cursor = concept['skos:broader'];
            while (cursor) {
              const p = concepts.find((c) => c['@id'] === cursor);
              if (p) { parentChain.push(p['skos:prefLabel']); cursor = p['skos:broader']; }
              else break;
            }
            enrichment.candidateIRIs.push(concept['@id']);
            enrichment.candidates.push({
              iri: concept['@id'],
              displayLabel: opt,
              parentChain,
            });
          }
        }
      }
      enrichment.hierarchyContext = {
        containsSubgraphFor: enrichment.candidateIRIs,
      };
    } else if (promptType === 'importedConceptGuard') {
      enrichment.blockedConcept = ctx.subjectLabel || ctx.subject || ctx.conceptLabel || null;
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
   * Run the deadlock remediation cascade (Decision D).
   *
   * Synchronous cascade: auto-repair → deferred → human escalation → EpistemicFailure.
   * Returns the cascade result with prompts, mutation log, and EpistemicFailure if terminal.
   */
  _runCascade(pair, dl, context) {
    const concept = pair.concept;
    const mutationType = pair.mutationType;
    const rejectionCount = dl.rejectionCount;
    const reasons = this._deadlockTracker.getRejectionReasons(concept, mutationType);

    // Step 1: Auto-repair
    const autoRepairPrompt = {
      step: 'autoRepair',
      prompt: {
        'fandaws:promptType': 'deadlockRemediation',
        'fandaws:options': ['accept_repair', 'reject_repair'],
        'fandaws:machineSignal': buildMachineSignal('agent', {
          'fandaws:promptType': 'deadlockRemediation',
          'fandaws:options': ['accept_repair', 'reject_repair'],
          'fandaws:context': {},
        }, {
          constraintType: 'inherence',
          concept,
          mutationType,
          rejectionCount,
          suggestedRepair: `Consider a different classification for "${concept}". The current assertion has been rejected ${rejectionCount} times.`,
        }),
      },
    };

    // Step 2: Deferred resolution
    const deferralPrompt = {
      step: 'deferredResolution',
      prompt: {
        'fandaws:promptType': 'deadlockRemediation',
        'fandaws:options': ['accept_deferral', 'reject_deferral'],
        'fandaws:machineSignal': buildMachineSignal('agent', {
          'fandaws:promptType': 'deadlockRemediation',
          'fandaws:options': ['accept_deferral', 'reject_deferral'],
          'fandaws:context': {},
        }, {
          constraintType: 'inherence',
          concept,
          mutationType,
          rejectionCount,
          deferralReason: `Park the "${concept}" ${mutationType} for later resolution. The assertion can be retried in a future session.`,
        }),
      },
    };

    // Step 3: Human escalation (conditional)
    // If human channel is available, escalation is the resolution — no EpistemicFailure.
    const humanEscalation = context.humanChannelAvailable ? {
      step: 'humanEscalation',
      escalation: {
        fired: true,
        concept,
        mutationType,
        rejectionCount,
        channel: 'human',
      },
    } : null;

    // Step 4: EpistemicFailure (terminal) — only if human escalation NOT available
    let epistemicFailure = null;
    if (!context.humanChannelAvailable) {
      epistemicFailure = {
        type: 'EpistemicFailure',
        concept,
        mutationType,
        attemptCount: rejectionCount,
        rejectionReasons: reasons.length > 0 ? reasons : ['Repeated rejection'],
        suggestedActions: [
          `Reclassify "${concept}" under a different parent`,
          `Review the classification constraints for "${concept}"`,
        ],
      };
      // Tag the pair
      this._deadlockTracker.markEpistemicFailure(concept, mutationType, epistemicFailure);
    }

    // Mutation log entry
    const mutationLogEntry = {
      mutationType: 'deadlockResolution',
      concept,
      outcome: epistemicFailure ? 'EpistemicFailure' : (humanEscalation ? 'humanEscalation' : 'unknown'),
      attemptCount: rejectionCount,
      timestamp: new Date().toISOString(),
    };

    return {
      steps: [autoRepairPrompt, deferralPrompt, humanEscalation, epistemicFailure].filter(Boolean),
      autoRepairPrompt,
      deferralPrompt,
      humanEscalation,
      epistemicFailure,
      mutationLogEntry,
    };
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
