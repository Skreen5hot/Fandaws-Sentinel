/**
 * DeadlockTracker — per-session rejection counter for (concept, mutationType) pairs.
 *
 * Tracks consecutive rejections via Identity Simplification normalization.
 * Triggers deadlock detection at DEADLOCK_THRESHOLD (5) consecutive rejections.
 *
 * Decision D: Cascade at rejection 5.
 * Decision E: EpistemicFailure terminal for pair, not session.
 *
 * @see docs/architecture/phase-13-locked-decisions.md
 */

import { simplify } from '../identity/identity-simplification.js';

const DEADLOCK_THRESHOLD = 5;

export class DeadlockTracker {
  constructor() {
    /** @type {Map<string, { count: number, reasons: string[] }>} */
    this._pairs = new Map();
    /** @type {Map<string, object>} */
    this._epistemicFailures = new Map();
  }

  /**
   * Normalize a (concept, mutationType) pair key.
   */
  _pairKey(concept, mutationType) {
    const normalized = simplify(concept);
    const label = normalized.canonicalLabel || normalized;
    return `${label}::${mutationType}`;
  }

  /**
   * Record a rejection for a (concept, mutationType) pair.
   *
   * @param {string} concept - Raw concept label
   * @param {string} mutationType - e.g., 'reclassification', 'property'
   * @param {string} [reason] - Rejection reason
   * @returns {{ deadlockDetected: boolean, rejectionCount: number }}
   */
  recordRejection(concept, mutationType, reason = '') {
    const key = this._pairKey(concept, mutationType);

    // If pair is already in EpistemicFailure, re-emit immediately
    if (this._epistemicFailures.has(key)) {
      return {
        deadlockDetected: true,
        rejectionCount: this._epistemicFailures.get(key).attemptCount,
        epistemicFailureAlreadyFired: true,
      };
    }

    const entry = this._pairs.get(key) || { count: 0, reasons: [] };
    entry.count++;
    if (reason && !entry.reasons.includes(reason)) {
      entry.reasons.push(reason);
    }
    this._pairs.set(key, entry);

    return {
      deadlockDetected: entry.count >= DEADLOCK_THRESHOLD,
      rejectionCount: entry.count,
    };
  }

  /**
   * Get the current rejection count for a pair.
   */
  getRejectionCount(concept, mutationType) {
    const key = this._pairKey(concept, mutationType);
    return this._pairs.get(key)?.count || 0;
  }

  /**
   * Get all rejection reasons for a pair.
   */
  getRejectionReasons(concept, mutationType) {
    const key = this._pairKey(concept, mutationType);
    return this._pairs.get(key)?.reasons || [];
  }

  /**
   * Tag a pair as EpistemicFailure (terminal).
   */
  markEpistemicFailure(concept, mutationType, details) {
    const key = this._pairKey(concept, mutationType);
    this._epistemicFailures.set(key, details);
  }

  /**
   * Check if a pair is in EpistemicFailure state.
   */
  isEpistemicFailure(concept, mutationType) {
    const key = this._pairKey(concept, mutationType);
    return this._epistemicFailures.has(key);
  }

  /**
   * Get EpistemicFailure details for a pair.
   */
  getEpistemicFailure(concept, mutationType) {
    const key = this._pairKey(concept, mutationType);
    return this._epistemicFailures.get(key) || null;
  }

  /**
   * Get the deadlock threshold.
   */
  get threshold() {
    return DEADLOCK_THRESHOLD;
  }
}
