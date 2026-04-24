/**
 * Reproducibility Hash Pipeline — D1.6 §7.4 (DP-2.3.1 + DP-2.3.2).
 *
 * DP-2.3.1 (this file): per-round hash computation at iteration boundaries.
 * DP-2.3.2 (pending SME-confirmed X2 consumption): Final Hash assembly with
 *          session-config hash per the locked allow-list.
 *
 * Per D3.D1 lock: JCS canonicalization shared with DP-2.2 axiomDictionary
 * (single source at `canonical-serialization.js`). Per D3.D2 lock: content
 * hashes are raw-byte SHA via DP-2.3.0 byte-capture (consumed at Final Hash
 * assembly, not here — per-round hashes are session-local).
 *
 * Per-round hash inputs (§7.4 diagnostic slice):
 *   - CAU IRI
 *   - round number (0-indexed)
 *   - signature snapshot hash (content-hash of the CAU Signature at this round)
 *   - reasoner state key (from session-hash registry; defends against
 *     cache-mutation-between-write-and-read per Forward-Flag Item 2)
 *   - cross-CAU influences consumed this round (by dictionary ID)
 *
 * DP-2.3.1 scope boundary: this module emits per-round hashes for insertion
 * into canonical records' `reproducibilityHash.perRoundHashes[]`. Final Hash
 * (`reproducibilityHash.finalHash`) is DP-2.3.2.
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §7.4
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §5.2.1
 * Locks: specs/d16/dp2-locked-decisions.md (D3.D1, D3.D2)
 */

import { canonicalize } from './canonical-serialization.js';
import { sha256 } from './crypto-shim.js';
import { lookupSessionSignature } from './bfo-signature-cache.js';

/**
 * Compute a per-round hash for a CAU at a specific iteration round.
 *
 * The hash is diagnostic — DP-2.3.2 Final Hash is the authoritative cross-
 * session reproducibility value. Per-round hashes support per-round audit
 * (which round produced which signature state).
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {number} input.round              — 0-indexed round number
 * @param {string} input.sessionId
 * @param {string} input.signatureHash      — content-hash of the CAU's signature at this round
 * @param {Array<string>} [input.crossCAUInfluencesConsumed] — dictionary IDs of influences consumed this round
 * @returns {Promise<{round: number, hash: string, inputsHashed: Array<string>}>}
 */
export async function computePerRoundHash(input) {
  const {
    cauIRI, round, sessionId, signatureHash,
    crossCAUInfluencesConsumed = [],
  } = input;

  if (typeof cauIRI !== 'string' || cauIRI.length === 0) {
    throw new TypeError('computePerRoundHash: cauIRI is required.');
  }
  if (!Number.isInteger(round) || round < 0) {
    throw new TypeError('computePerRoundHash: round must be a non-negative integer.');
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('computePerRoundHash: sessionId is required.');
  }
  if (typeof signatureHash !== 'string' || signatureHash.length === 0) {
    throw new TypeError('computePerRoundHash: signatureHash is required.');
  }

  // Per D2.D1 linkage: same JCS canonicalization used throughout DP-2.
  // Inputs are serialized as a JCS object; the hash of that object is the
  // per-round hash.
  const reasonerStateKey = resolveReasonerStateKey(sessionId, cauIRI, signatureHash);

  const inputObject = {
    cauIRI,
    round,
    signatureHash,
    reasonerStateKey,
    crossCAUInfluencesConsumed: crossCAUInfluencesConsumed.slice(),
  };

  const canonical = canonicalize(inputObject);
  const hash = await sha256(canonical);

  return {
    round,
    hash,
    inputsHashed: [
      'cauIRI',
      'round',
      'signatureHash',
      'reasonerStateKey',
      'crossCAUInfluencesConsumed',
    ],
  };
}

/**
 * Per-round inputs must be stable across session-local re-computations
 * even if the BFO cache mutates mid-session. Consult the session-hash
 * registry (Forward-Flag Item 2) rather than live cache state.
 *
 * If no registry entry exists for (sessionId, cauIRI, signatureHash),
 * fall back to a sentinel; DP-2.3.2 tightens this to a hard error.
 */
function resolveReasonerStateKey(sessionId, cauIRI, signatureHash) {
  const entry = lookupSessionSignature({ sessionId, cauIRI, signatureHash });
  if (!entry) {
    // Signature was consumed without prior registration — flag as sentinel.
    // DP-2.3.2 will reject this at Final Hash assembly time (per X2 §5.1
    // split-brain guard extension).
    return { unregistered: true };
  }
  return {
    bfoVersion: entry.bfoVersion,
    curatedVersion: entry.curatedVersion,
    timestamp: entry.timestamp,
  };
}

/**
 * Build a full reproducibilityHash object with N per-round hashes + scaffold
 * Final Hash placeholder (I2b bypass sentinel remains until DP-2.3.2).
 *
 * Used by iteration-mechanics and the production record builder when
 * producing multi-round provenance. Single-pass sessions pass `rounds` with
 * one entry.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {Array<{round, signatureHash, crossCAUInfluencesConsumed?}>} input.rounds
 * @returns {Promise<{algorithm, perRoundHashes, finalHash, _scaffold}>}
 */
export async function buildProductionReproducibilityHash(input) {
  const { cauIRI, sessionId, rounds } = input;
  if (!Array.isArray(rounds) || rounds.length === 0) {
    throw new TypeError('buildProductionReproducibilityHash: rounds must be a non-empty array.');
  }

  const perRoundHashes = [];
  for (const r of rounds) {
    const perRound = await computePerRoundHash({
      cauIRI,
      sessionId,
      round: r.round,
      signatureHash: r.signatureHash,
      crossCAUInfluencesConsumed: r.crossCAUInfluencesConsumed || [],
    });
    perRoundHashes.push(perRound);
  }

  // Final Hash is DP-2.3.2 scope. Until that lands, return the scaffold
  // placeholder tagged with `_scaffold: true` sentinel (I2b bypass).
  return {
    algorithm: 'SHA-256',
    perRoundHashes,
    finalHash: {
      hash: '0'.repeat(64),
      authoritative: true,
      inputsHashed: [
        'CAU IRI',
        'Final Signature hash',
        'BFO version identifier',
        'Curated BFO additions version identifier',
        'session configuration hash',
        'final iteration round number',
      ],
    },
    _scaffold: true, // I2b bypass until DP-2.3.2 lands
  };
}
