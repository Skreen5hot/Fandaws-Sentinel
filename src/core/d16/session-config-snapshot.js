/**
 * Session Config Snapshot — DP-2.3.2 X2 consumption support.
 *
 * Captures the X2-locked session configuration allow-list at session start
 * into an immutable snapshot. DP-2.3.2 Final Hash assembly reads from this
 * snapshot rather than from live config objects, ensuring the config hash
 * is stable across session lifetime even if upstream config objects are
 * mutated (defensive against the X2 §5.1 split-brain concern).
 *
 * Allow-list per `specs/d16/dp2-x2-config-allow-list-memo-v1.md` §2.1:
 *   - notApplicableThreshold: integer percent 0-100
 *   - inconsistentThreshold:  integer percent 0-100
 *   - weightVector: {domain, range, bfoSubcategory, characteristics,
 *                    allowsInheresIn, lexical}
 *
 * Effective-value semantics per X2 §2.4: callers pass post-default-
 * resolution values. A session that omits `notApplicableThreshold` and
 * another that explicitly sets 40 MUST produce identical frozen configs
 * (both resolve to the 40% default). Default-resolution happens upstream
 * in `runDP1Diagnostic` and weight-vector consumers; this module trusts
 * the caller to pass resolved values.
 *
 * Mutation discipline: once captured, re-capture with different values
 * throws `SessionConfigMutationError`. Idempotent re-capture with
 * identical values succeeds.
 *
 * Design: specs/d16/dp2-x2-config-allow-list-memo-v1.md §5.1 + §6.1
 * Lock: D3.D3 (approach) + X2 allow-list
 */

import { canonicalize } from './canonical-serialization.js';

const WEIGHT_VECTOR_KEYS = [
  'domain', 'range', 'bfoSubcategory', 'characteristics', 'allowsInheresIn', 'lexical',
];

export class SessionConfigMutationError extends Error {
  constructor(sessionId, priorForm, newForm) {
    super(
      `SessionConfigMutationError: session ${sessionId} frozen config snapshot received a mutation attempt. ` +
      `Per W-D-16 / PS-8 + X2 §5.1, session config is immutable post-start. ` +
      `Prior canonical form ends in: ${priorForm.slice(-40)}. New form ends in: ${newForm.slice(-40)}.`,
    );
    this.name = 'SessionConfigMutationError';
    this.sessionId = sessionId;
  }
}

// sessionId → { config: object, canonicalForm: string, capturedAt: ISO }
const snapshots = new Map();

/**
 * Capture the frozen config snapshot for a session. Call once at session
 * start; subsequent calls are idempotent only if the effective values are
 * identical (JCS-canonical form matches).
 *
 * @param {string} sessionId
 * @param {object} config
 *   - notApplicableThreshold: number (percent)
 *   - inconsistentThreshold:  number (percent)
 *   - weightVector: {domain, range, bfoSubcategory, characteristics, allowsInheresIn, lexical}
 * @returns {{sessionId: string, config: object, canonicalForm: string, capturedAt: string}}
 * @throws {SessionConfigMutationError} on divergent re-capture
 * @throws {TypeError} on invalid shape
 */
export function captureFrozenConfig(sessionId, config) {
  assertSessionId(sessionId);
  const normalized = normalizeAndValidate(config);
  const canonicalForm = canonicalize(normalized);

  const existing = snapshots.get(sessionId);
  if (existing) {
    if (existing.canonicalForm === canonicalForm) {
      // Idempotent — same effective config, same canonical form.
      return { ...existing, sessionId };
    }
    throw new SessionConfigMutationError(sessionId, existing.canonicalForm, canonicalForm);
  }

  const entry = {
    config: normalized,
    canonicalForm,
    capturedAt: new Date().toISOString(),
  };
  snapshots.set(sessionId, entry);
  return { ...entry, sessionId };
}

/**
 * Read the frozen config snapshot for a session. Returns null if no
 * snapshot was captured.
 */
export function readFrozenConfig(sessionId) {
  const entry = snapshots.get(sessionId);
  if (!entry) return null;
  return { ...entry, sessionId };
}

/**
 * Return the X2 §2.1 allow-list shape ready for hashing. This is the
 * JCS-canonicalizable object that DP-2.3.2 Final Hash's config-hash input
 * consumes. Throws if no snapshot was captured.
 */
export function assembleConfigInputs(sessionId) {
  const entry = snapshots.get(sessionId);
  if (!entry) {
    throw new Error(
      `assembleConfigInputs: session ${sessionId} has no frozen config snapshot. ` +
      `DP-2.3.2 requires captureFrozenConfig at session start.`,
    );
  }
  // Return a deep copy to prevent downstream mutation.
  return JSON.parse(JSON.stringify(entry.config));
}

/**
 * Clear a session's snapshot. Called on session end; idempotent.
 */
export function clearFrozenConfig(sessionId) {
  snapshots.delete(sessionId);
}

/**
 * Test-only reset.
 */
export function resetFrozenConfigForTests() {
  snapshots.clear();
}

// ── Internals ──────────────────────────────────────────────────────

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('session-config-snapshot: sessionId must be a non-empty string.');
  }
}

function normalizeAndValidate(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('captureFrozenConfig: config must be a non-null object.');
  }
  const { notApplicableThreshold, inconsistentThreshold, weightVector } = config;

  if (typeof notApplicableThreshold !== 'number' || !Number.isFinite(notApplicableThreshold)) {
    throw new TypeError('captureFrozenConfig: notApplicableThreshold must be a finite number (percent).');
  }
  if (typeof inconsistentThreshold !== 'number' || !Number.isFinite(inconsistentThreshold)) {
    throw new TypeError('captureFrozenConfig: inconsistentThreshold must be a finite number (percent).');
  }
  if (!weightVector || typeof weightVector !== 'object' || Array.isArray(weightVector)) {
    throw new TypeError('captureFrozenConfig: weightVector must be a non-null object.');
  }
  const wv = {};
  for (const k of WEIGHT_VECTOR_KEYS) {
    if (typeof weightVector[k] !== 'number' || !Number.isFinite(weightVector[k])) {
      throw new TypeError(`captureFrozenConfig: weightVector.${k} must be a finite number.`);
    }
    wv[k] = weightVector[k];
  }

  return {
    notApplicableThreshold,
    inconsistentThreshold,
    weightVector: wv,
  };
}
