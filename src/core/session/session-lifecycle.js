/**
 * Session Lifecycle — pure functions for session state machine management.
 *
 * All functions are pure: JSON-LD in, JSON-LD out. No I/O, no state mutation.
 * The OrchestrationAdapter coordinates persistence via StateAdapter.
 *
 * @see Fandaws_v3.3_Specification.md Section 5.12
 */

import { createDialogueTurn } from '../../types/dialogue-turn.js';

// ── Session State Constants ──

export const SESSION_STATES = {
  NEGOTIATING: 'negotiating',
  PAUSED: 'paused',
  NESTED: 'nested',
  CONFLICT: 'conflict',
  COMPLETE: 'complete',
  ABANDONED: 'abandoned',
  EXPIRED: 'expired',
};

export const TERMINAL_STATES = new Set([
  SESSION_STATES.COMPLETE,
  SESSION_STATES.ABANDONED,
  SESSION_STATES.EXPIRED,
]);

/**
 * Valid state transitions.
 * Terminal states (complete, abandoned, expired) have no outgoing transitions.
 */
export const VALID_TRANSITIONS = {
  [SESSION_STATES.NEGOTIATING]: [
    SESSION_STATES.PAUSED,
    SESSION_STATES.NESTED,
    SESSION_STATES.CONFLICT,
    SESSION_STATES.COMPLETE,
    SESSION_STATES.ABANDONED,
    SESSION_STATES.EXPIRED,
  ],
  [SESSION_STATES.PAUSED]: [
    SESSION_STATES.NEGOTIATING,
    SESSION_STATES.ABANDONED,
    SESSION_STATES.EXPIRED,
  ],
  [SESSION_STATES.NESTED]: [
    SESSION_STATES.NEGOTIATING,
    SESSION_STATES.ABANDONED,
    SESSION_STATES.EXPIRED,
  ],
  [SESSION_STATES.CONFLICT]: [
    SESSION_STATES.NEGOTIATING,
    SESSION_STATES.ABANDONED,
    SESSION_STATES.EXPIRED,
  ],
  [SESSION_STATES.COMPLETE]: [],
  [SESSION_STATES.ABANDONED]: [],
  [SESSION_STATES.EXPIRED]: [],
};

// ── State Machine Validation ──

/**
 * Validate whether a state transition is allowed.
 *
 * @param {string} fromState - Current session state
 * @param {string} toState - Target session state
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateTransition(fromState, toState) {
  const allowed = VALID_TRANSITIONS[fromState];
  if (!allowed) {
    return { valid: false, reason: `Unknown state: "${fromState}"` };
  }
  if (TERMINAL_STATES.has(fromState)) {
    return { valid: false, reason: `Cannot transition from terminal state "${fromState}"` };
  }
  if (!allowed.includes(toState)) {
    return { valid: false, reason: `Invalid transition: "${fromState}" → "${toState}"` };
  }
  return { valid: true };
}

/**
 * Transition a session to a new state. Returns a new session object (immutable).
 *
 * Updates state, lastActiveAt, and appends a transition turn to dialogueHistory.
 *
 * @param {object} session - ConversationSession JSON-LD
 * @param {string} toState - Target state
 * @param {object} [options={}]
 * @param {string} [options.timestamp] - Override timestamp (for deterministic tests)
 * @returns {object} New ConversationSession with updated state
 * @throws {Error} If transition is invalid
 */
export function transitionSession(session, toState, options = {}) {
  const fromState = session['fandaws:state'];
  const validation = validateTransition(fromState, toState);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const now = options.timestamp || new Date().toISOString();
  const history = [...session['fandaws:dialogueHistory']];
  const turn = createDialogueTurn({
    role: 'transition',
    content: `${fromState} → ${toState}`,
    turnIndex: history.length,
    phase: session['fandaws:currentPhase'],
    timestamp: now,
  });
  history.push(turn);

  return {
    ...session,
    'fandaws:state': toState,
    'fandaws:lastActiveAt': now,
    'fandaws:dialogueHistory': history,
  };
}

// ── Expiration ──

/**
 * Parse an ISO 8601 duration string (P-format) to milliseconds.
 * Supports days (P7D, P1D) and hours (PT1H, PT2H).
 *
 * @param {string} isoDuration - ISO 8601 duration (e.g., 'P7D', 'PT1H')
 * @returns {number} Duration in milliseconds
 */
export function parseIsoDuration(isoDuration) {
  const dayMatch = isoDuration.match(/P(\d+)D/);
  if (dayMatch) {
    return parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
  }
  const hourMatch = isoDuration.match(/PT(\d+)H/);
  if (hourMatch) {
    return parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
  }
  throw new Error(`Unsupported ISO 8601 duration: "${isoDuration}"`);
}

/**
 * Compute an expiry timestamp from a base timestamp + ISO 8601 duration.
 *
 * @param {string} isoDuration - ISO 8601 duration (e.g., 'P7D')
 * @param {string} fromTimestamp - ISO 8601 timestamp to start from
 * @returns {string} ISO 8601 timestamp of expiry
 */
export function computeExpiryTimestamp(isoDuration, fromTimestamp) {
  const ms = parseIsoDuration(isoDuration);
  const from = new Date(fromTimestamp);
  return new Date(from.getTime() + ms).toISOString();
}

/**
 * Check whether a session has expired.
 *
 * Checks both expiresAt and lastActiveAt. If lastActiveAt is within the
 * grace window, the session is NOT expired even if expiresAt has passed.
 * This prevents reaping sessions that are actively being used. (SC-1)
 *
 * @param {object} session - ConversationSession JSON-LD
 * @param {string} [now] - Current ISO timestamp (for deterministic tests)
 * @param {string} [graceWindow='PT1H'] - ISO 8601 duration grace window
 * @returns {boolean} True if session has expired
 */
export function isExpired(session, now = new Date().toISOString(), graceWindow = 'PT1H') {
  const expiresAt = session['fandaws:expiresAt'];
  if (!expiresAt) return false;

  const nowMs = new Date(now).getTime();
  const expiresMs = new Date(expiresAt).getTime();

  if (nowMs <= expiresMs) return false;

  // expiresAt has passed — check grace window on lastActiveAt (SC-1)
  const lastActiveAt = session['fandaws:lastActiveAt'];
  if (lastActiveAt) {
    const lastActiveMs = new Date(lastActiveAt).getTime();
    const graceMs = parseIsoDuration(graceWindow);
    if (nowMs - lastActiveMs < graceMs) {
      return false; // Recently active — don't expire
    }
  }

  return true;
}

// ── Dialogue History ──

/**
 * Append a dialogue turn to a session. Returns a new session (immutable).
 *
 * @param {object} session - ConversationSession JSON-LD
 * @param {object} turn - DialogueTurn JSON-LD
 * @returns {object} New ConversationSession with turn appended
 */
export function appendDialogueTurn(session, turn) {
  const history = [...session['fandaws:dialogueHistory'], turn];
  return {
    ...session,
    'fandaws:dialogueHistory': history,
    'fandaws:lastActiveAt': turn['fandaws:timestamp'],
  };
}

/**
 * Find the last unanswered system prompt in dialogue history. (SC-2)
 *
 * Algorithm: Walk dialogueHistory backwards. Return the first turn where
 * role === 'system' that is NOT followed by a role === 'caller' turn.
 * If no such turn exists, return null.
 *
 * @param {object} session - ConversationSession JSON-LD
 * @returns {object|null} Last unanswered system DialogueTurn, or null
 */
export function findLastUnansweredPrompt(session) {
  const history = session['fandaws:dialogueHistory'];
  if (!history || history.length === 0) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn['fandaws:role'] === 'system') {
      // Check if any subsequent turn is a caller response
      const hasCallerResponse = history.slice(i + 1).some(
        (t) => t['fandaws:role'] === 'caller',
      );
      if (!hasCallerResponse) {
        return turn;
      }
    }
  }
  return null;
}

// ── Concurrent Session Limits ──

/**
 * Count active sessions (negotiating + nested).
 * Paused sessions do NOT count toward the limit.
 *
 * @param {object[]} sessions - Array of ConversationSession JSON-LD nodes
 * @returns {number} Count of active sessions
 */
export function countActiveSessions(sessions) {
  return sessions.filter((s) => {
    const state = s['fandaws:state'];
    return state === SESSION_STATES.NEGOTIATING || state === SESSION_STATES.NESTED;
  }).length;
}

/**
 * Check whether a new session is allowed given concurrent limits.
 *
 * @param {object[]} sessions - All sessions for a caller
 * @param {number} maxConcurrentSessions - Maximum allowed active sessions
 * @returns {{ allowed: boolean, activeCount: number, suggestion?: string }}
 */
export function checkConcurrentLimit(sessions, maxConcurrentSessions) {
  const activeCount = countActiveSessions(sessions);
  if (activeCount >= maxConcurrentSessions) {
    return {
      allowed: false,
      activeCount,
      suggestion: 'Resume or abandon an existing session before starting a new one.',
    };
  }
  return { allowed: true, activeCount };
}

// ── Nested Negotiation ──

/**
 * Check for circular nesting (childTerm === parent term). (SC-4/ADV-01)
 *
 * @param {object} parentSession - Parent ConversationSession
 * @param {string} childTerm - Term for the child session
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkCircularNesting(parentSession, childTerm) {
  if (parentSession['fandaws:term'] === childTerm) {
    return {
      allowed: false,
      reason: `Circular nesting: child term "${childTerm}" is the same as parent term`,
    };
  }
  return { allowed: true };
}

/**
 * Validate nesting depth against the configured maximum.
 *
 * @param {object} parentSession - Parent ConversationSession
 * @param {number} maxNestingDepth - Maximum allowed nesting depth
 * @returns {{ allowed: boolean, currentDepth: number, reason?: string }}
 */
export function checkNestingDepth(parentSession, maxNestingDepth) {
  const currentDepth = parentSession['fandaws:nestingDepth'];
  if (currentDepth >= maxNestingDepth) {
    return {
      allowed: false,
      currentDepth,
      reason: `Nesting depth ${currentDepth} would exceed maximum ${maxNestingDepth}`,
    };
  }
  return { allowed: true, currentDepth };
}

/**
 * Create params for a nested child session. (SC-3: child expiresAt capped by parent)
 *
 * Does NOT call StateAdapter — returns params for createConversationSession.
 *
 * @param {object} parentSession - Parent ConversationSession
 * @param {string} childTerm - Term for the child session
 * @param {object} config - { sessionExpiryDuration, ... }
 * @param {object} [options={}]
 * @param {string} [options.timestamp] - Override timestamp
 * @param {string} [options.sessionId] - Override session ID
 * @returns {object} Params for createConversationSession
 */
export function createNestedSessionParams(parentSession, childTerm, config, options = {}) {
  const now = options.timestamp || new Date().toISOString();
  const duration = config['fandaws:sessionExpiryDuration'] || config.sessionExpiryDuration || 'P7D';
  const childExpiry = computeExpiryTimestamp(duration, now);

  // SC-3: child cannot outlive parent
  const parentExpiry = parentSession['fandaws:expiresAt'];
  let expiresAt = childExpiry;
  if (parentExpiry && new Date(parentExpiry).getTime() < new Date(childExpiry).getTime()) {
    expiresAt = parentExpiry;
  }

  return {
    sessionId: options.sessionId || `fandaws:session/nested/${childTerm}/${parentSession['fandaws:sessionId'].split('/').pop() || Date.now()}`,
    callerId: parentSession['fandaws:callerId'],
    term: childTerm,
    workingGraphId: parentSession['fandaws:workingGraphId'],
    parentSessionId: parentSession['fandaws:sessionId'],
    nestingDepth: parentSession['fandaws:nestingDepth'] + 1,
    state: 'negotiating',
    expiresAt,
  };
}

// ── Abandon Cascade ──

/**
 * Find all descendant sessions of a given session.
 * Uses a visited set to prevent infinite loops on cyclic parentSessionId. (SC-4/ADV-02)
 *
 * @param {string} sessionId - Root session ID
 * @param {object[]} allSessions - All sessions to search
 * @returns {object[]} Array of descendant sessions (not including the root)
 */
export function findDescendantSessions(sessionId, allSessions) {
  const descendants = [];
  const visited = new Set();
  const queue = [sessionId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    for (const session of allSessions) {
      const sid = session['fandaws:sessionId'];
      if (session['fandaws:parentSessionId'] === currentId && !visited.has(sid)) {
        descendants.push(session);
        queue.push(sid);
      }
    }
  }

  return descendants;
}

/**
 * Compute the full abandon cascade: the target session + all descendants.
 *
 * @param {string} sessionId - Session to abandon
 * @param {object[]} allSessions - All sessions to search
 * @returns {string[]} Array of session IDs to abandon (including the target)
 */
export function computeAbandonCascade(sessionId, allSessions) {
  const descendants = findDescendantSessions(sessionId, allSessions);
  return [sessionId, ...descendants.map((s) => s['fandaws:sessionId'])];
}
