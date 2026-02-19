/**
 * SynchronousOrchestrationAdapter — single-threaded conversation orchestrator.
 *
 * Routes utterances to the correct pipeline (classification, property, or
 * relationship) based on Classifier output. Manages conversation output for
 * prompt/response cycles in a synchronous, call-and-return model.
 *
 * Phase 11: Session lifecycle management (pause/resume, nested negotiation,
 * abandon cascade, concurrent limits, expiration).
 *
 * @see Fandaws_v3.3_Specification.md Section 12.4, Section 5.12
 */

import { OrchestrationAdapter } from './orchestration-adapter.js';
import { parse } from '../../core/nl-parser/nl-parser.js';
import { classify } from '../../core/classifier/classifier.js';
import { runClassificationPipeline } from '../../core/pipeline/classification-pipeline.js';
import { runPropertyPipeline } from '../../core/pipeline/property-pipeline.js';
import { runRelationshipPipeline } from '../../core/pipeline/relationship-pipeline.js';
import { createDialogueTurn } from '../../types/dialogue-turn.js';
import { createConversationSession } from '../../types/conversation-session.js';
import {
  validateTransition,
  transitionSession,
  isExpired,
  computeExpiryTimestamp,
  appendDialogueTurn as appendTurn,
  findLastUnansweredPrompt,
  countActiveSessions,
  checkConcurrentLimit,
  checkCircularNesting,
  checkNestingDepth,
  createNestedSessionParams,
  computeAbandonCascade,
} from '../../core/session/session-lifecycle.js';

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
   * If context.sessionId is provided, appends caller + system turns to
   * the session's dialogue history. Without sessionId, works as before
   * (backward compatible).
   *
   * @param {string} utterance - Raw user input
   * @param {object} context - { stateAdapter, graphId, sessionId?, config? }
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
        result = runRelationshipPipeline(utterance, context, options);
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

    // Step 5: Append dialogue turns to session if sessionId provided
    if (context.sessionId && context.stateAdapter) {
      const session = context.stateAdapter.loadSession(context.sessionId);
      if (session) {
        const now = new Date().toISOString();
        const history = session['fandaws:dialogueHistory'];

        // Caller turn
        const callerTurn = createDialogueTurn({
          role: 'caller',
          content: utterance,
          turnIndex: history.length,
          phase: session['fandaws:currentPhase'],
          timestamp: now,
        });
        let updated = appendTurn(session, callerTurn);

        // System turn (summarize pipeline result)
        const systemContent = result.prompts && result.prompts.length > 0
          ? result.prompts.map((p) => p['fandaws:text'] || p['fandaws:question'] || 'prompt').join('; ')
          : result.success ? 'Pipeline completed successfully' : `Error: ${result.errorReason || 'unknown'}`;

        const systemTurn = createDialogueTurn({
          role: 'system',
          content: systemContent,
          turnIndex: updated['fandaws:dialogueHistory'].length,
          phase: session['fandaws:currentPhase'],
          timestamp: now,
        });
        updated = appendTurn(updated, systemTurn);

        context.stateAdapter.saveSession(context.sessionId, updated);
      }
    }

    return result;
  }

  // ── Session Lifecycle Methods (Phase 11) ──

  /**
   * Start a new session. Checks concurrent limits, creates session, saves to StateAdapter.
   *
   * @param {string} callerId - Caller identity
   * @param {string} term - Term to negotiate
   * @param {object} context - { stateAdapter, config, graphId? }
   * @returns {{ session?: object, error?: boolean, errorReason?: string }}
   */
  startSession(callerId, term, context) {
    const { stateAdapter, config } = context;

    // Check concurrent limits
    const allSessions = stateAdapter.listSessions(callerId);
    const maxConcurrent = config['fandaws:maxConcurrentSessions'] || config.maxConcurrentSessions || 5;
    const limitCheck = checkConcurrentLimit(allSessions, maxConcurrent);

    if (!limitCheck.allowed) {
      return {
        error: true,
        errorReason: `concurrent-limit: ${limitCheck.suggestion}`,
        activeCount: limitCheck.activeCount,
      };
    }

    // Compute expiry
    const now = new Date().toISOString();
    const expiryDuration = config['fandaws:sessionExpiryDuration'] || config.sessionExpiryDuration || 'P7D';
    const expiresAt = computeExpiryTimestamp(expiryDuration, now);

    const sessionId = `fandaws:session/${callerId}/${term}/${Date.now()}`;
    const session = createConversationSession({
      sessionId,
      callerId,
      term,
      workingGraphId: context.graphId || `fandaws:graph/${callerId}`,
      expiresAt,
    });

    stateAdapter.saveSession(sessionId, session);
    return { session };
  }

  /**
   * Pause a session. Transitions to 'paused' state.
   *
   * @param {string} sessionId - Session to pause
   * @param {object} context - { stateAdapter }
   * @returns {{ session?: object, error?: boolean, errorReason?: string }}
   */
  pauseSession(sessionId, context) {
    const { stateAdapter } = context;
    const session = stateAdapter.loadSession(sessionId);
    if (!session) {
      return { error: true, errorReason: `session-not-found: ${sessionId}` };
    }

    const validation = validateTransition(session['fandaws:state'], 'paused');
    if (!validation.valid) {
      return { error: true, errorReason: validation.reason };
    }

    const updated = transitionSession(session, 'paused');
    stateAdapter.saveSession(sessionId, updated);
    return { session: updated };
  }

  /**
   * Resume a paused session. Transitions back to 'negotiating' and
   * returns the last unanswered prompt. (SC-2)
   *
   * @param {string} sessionId - Session to resume
   * @param {object} context - { stateAdapter }
   * @returns {{ session?: object, lastPrompt?: object|null, error?: boolean, errorReason?: string }}
   */
  resumeSession(sessionId, context) {
    const { stateAdapter } = context;
    const session = stateAdapter.loadSession(sessionId);
    if (!session) {
      return { error: true, errorReason: `session-not-found: ${sessionId}` };
    }

    if (session['fandaws:state'] !== 'paused') {
      return { error: true, errorReason: `Cannot resume non-paused session (state: ${session['fandaws:state']})` };
    }

    const updated = transitionSession(session, 'negotiating');
    stateAdapter.saveSession(sessionId, updated);

    const lastPrompt = findLastUnansweredPrompt(updated);
    return { session: updated, lastPrompt };
  }

  /**
   * Abandon a session with cascade to all descendant sessions.
   *
   * @param {string} sessionId - Session to abandon
   * @param {object} context - { stateAdapter }
   * @returns {{ abandonedIds?: string[], error?: boolean, errorReason?: string }}
   */
  abandonSession(sessionId, context) {
    const { stateAdapter } = context;
    const session = stateAdapter.loadSession(sessionId);
    if (!session) {
      return { error: true, errorReason: `session-not-found: ${sessionId}` };
    }

    // Already abandoned — idempotent
    if (session['fandaws:state'] === 'abandoned') {
      return { abandonedIds: [sessionId] };
    }

    const validation = validateTransition(session['fandaws:state'], 'abandoned');
    if (!validation.valid) {
      return { error: true, errorReason: validation.reason };
    }

    // Find all sessions for cascade
    const callerId = session['fandaws:callerId'];
    const allSessions = stateAdapter.listSessions(callerId);
    const cascadeIds = computeAbandonCascade(sessionId, allSessions);

    const abandonedIds = [];
    for (const id of cascadeIds) {
      const s = stateAdapter.loadSession(id);
      if (s && s['fandaws:state'] !== 'abandoned') {
        const v = validateTransition(s['fandaws:state'], 'abandoned');
        if (v.valid) {
          const abandoned = transitionSession(s, 'abandoned');
          stateAdapter.saveSession(id, abandoned);
          abandonedIds.push(id);
        }
      } else if (s && s['fandaws:state'] === 'abandoned') {
        abandonedIds.push(id);
      }
    }

    return { abandonedIds };
  }

  /**
   * Complete a session. Transitions to 'complete' (terminal).
   *
   * @param {string} sessionId - Session to complete
   * @param {object} context - { stateAdapter }
   * @returns {{ session?: object, error?: boolean, errorReason?: string }}
   */
  completeSession(sessionId, context) {
    const { stateAdapter } = context;
    const session = stateAdapter.loadSession(sessionId);
    if (!session) {
      return { error: true, errorReason: `session-not-found: ${sessionId}` };
    }

    const validation = validateTransition(session['fandaws:state'], 'complete');
    if (!validation.valid) {
      return { error: true, errorReason: validation.reason };
    }

    const updated = transitionSession(session, 'complete');
    stateAdapter.saveSession(sessionId, updated);
    return { session: updated };
  }

  /**
   * Start a nested negotiation. Transitions parent to 'nested',
   * creates a child session.
   *
   * @param {string} parentSessionId - Parent session to suspend
   * @param {string} childTerm - Term for the child session
   * @param {object} context - { stateAdapter, config }
   * @returns {{ parentSession?: object, childSession?: object, error?: boolean, errorReason?: string }}
   */
  nestSession(parentSessionId, childTerm, context) {
    const { stateAdapter, config } = context;
    const parentSession = stateAdapter.loadSession(parentSessionId);
    if (!parentSession) {
      return { error: true, errorReason: `session-not-found: ${parentSessionId}` };
    }

    // Check circular nesting (SC-4/ADV-01)
    const circularCheck = checkCircularNesting(parentSession, childTerm);
    if (!circularCheck.allowed) {
      return { error: true, errorReason: circularCheck.reason };
    }

    // Check nesting depth
    const maxDepth = config['fandaws:maxNestingDepth'] || config.maxNestingDepth || 10;
    const depthCheck = checkNestingDepth(parentSession, maxDepth);
    if (!depthCheck.allowed) {
      return { error: true, errorReason: depthCheck.reason };
    }

    // Transition parent to nested
    const validation = validateTransition(parentSession['fandaws:state'], 'nested');
    if (!validation.valid) {
      return { error: true, errorReason: validation.reason };
    }

    const updatedParent = transitionSession(parentSession, 'nested');
    stateAdapter.saveSession(parentSessionId, updatedParent);

    // Create child session
    const childParams = createNestedSessionParams(updatedParent, childTerm, config);
    const childSession = createConversationSession(childParams);
    stateAdapter.saveSession(childParams.sessionId, childSession);

    return { parentSession: updatedParent, childSession };
  }

  /**
   * Resume parent after child session completes.
   * Marks child as complete, transitions parent back to 'negotiating'.
   *
   * @param {string} childSessionId - Completed child session
   * @param {object} context - { stateAdapter }
   * @returns {{ parentSession?: object, error?: boolean, errorReason?: string }}
   */
  resolveNestedSession(childSessionId, context) {
    const { stateAdapter } = context;
    const childSession = stateAdapter.loadSession(childSessionId);
    if (!childSession) {
      return { error: true, errorReason: `session-not-found: ${childSessionId}` };
    }

    // Complete child if not already complete
    if (childSession['fandaws:state'] !== 'complete') {
      const childValidation = validateTransition(childSession['fandaws:state'], 'complete');
      if (childValidation.valid) {
        const completedChild = transitionSession(childSession, 'complete');
        stateAdapter.saveSession(childSessionId, completedChild);
      }
    }

    // Resume parent
    const parentId = childSession['fandaws:parentSessionId'];
    if (!parentId) {
      return { error: true, errorReason: 'Child session has no parentSessionId' };
    }

    const parentSession = stateAdapter.loadSession(parentId);
    if (!parentSession) {
      return { error: true, errorReason: `parent-session-not-found: ${parentId}` };
    }

    const validation = validateTransition(parentSession['fandaws:state'], 'negotiating');
    if (!validation.valid) {
      return { error: true, errorReason: validation.reason };
    }

    const updatedParent = transitionSession(parentSession, 'negotiating');
    stateAdapter.saveSession(parentId, updatedParent);
    return { parentSession: updatedParent };
  }

  /**
   * Check and expire stale sessions for a caller.
   *
   * @param {string} callerId - Caller identity
   * @param {object} context - { stateAdapter }
   * @returns {{ expiredIds: string[] }}
   */
  expireStaleSessions(callerId, context) {
    const { stateAdapter } = context;
    const allSessions = stateAdapter.listSessions(callerId);
    const expiredIds = [];
    const now = new Date().toISOString();

    for (const session of allSessions) {
      const state = session['fandaws:state'];
      // Skip terminal states
      if (state === 'complete' || state === 'abandoned' || state === 'expired') continue;

      if (isExpired(session, now)) {
        const sid = session['fandaws:sessionId'];
        const validation = validateTransition(state, 'expired');
        if (validation.valid) {
          const expired = transitionSession(session, 'expired');
          stateAdapter.saveSession(sid, expired);
          expiredIds.push(sid);
        }
      }
    }

    return { expiredIds };
  }

  // ── Existing Methods ──

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
