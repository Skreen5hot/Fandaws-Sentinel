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
import { assembleConfigInputs } from './session-config-snapshot.js';
import { getHashes as getIngestionHashes } from './ingestion-byte-registry.js';

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
 * Build a reproducibilityHash object with N per-round hashes. Final Hash
 * remains scaffold placeholder until `finalizeCanonicalRecord` runs at
 * session finalization time (§7.4 semantics: per-round is diagnostic
 * during iteration, Final Hash is authoritative at session end).
 *
 * The `_scaffold: true` sentinel signals to the I2a validator that the
 * Final Hash is not yet computed (I2b bypass). `finalizeCanonicalRecord`
 * removes the sentinel once the real Final Hash is assembled.
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

  return {
    algorithm: 'SHA-256',
    perRoundHashes,
    finalHash: {
      hash: '0'.repeat(64),
      authoritative: true,
      inputsHashed: FINAL_HASH_INPUT_LABELS.slice(),
    },
    _scaffold: true, // Removed at finalization time
  };
}

const FINAL_HASH_INPUT_LABELS = [
  'CAU IRI',
  'Final Signature hash',
  'BFO version identifier',
  'Curated BFO additions version identifier',
  'session configuration hash',
  'final iteration round number',
];

/**
 * Compute the authoritative Final Hash for a CAU at session finalization.
 *
 * Inputs per §7.4 canonical list:
 *   1. CAU IRI
 *   2. Final Signature hash (passed by caller; the signature active at
 *      final iteration round)
 *   3. BFO version identifier — file-content SHA-256 from DP-2.3.0
 *      ingestion-byte-registry per D3.D2 (raw bytes, not owl:versionIRI)
 *   4. Curated BFO additions version identifier — same pattern for curated
 *   5. Session configuration hash — SHA-256 of JCS-canonicalized X2
 *      allow-list object per X2 §2.1
 *   6. Final iteration round number
 *
 * All five inputs beyond CAU IRI are required; missing any raises a hard
 * error. This is I2b's activation rule: a production Final Hash must reflect
 * the full §7.4 input set, not placeholders.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {string} input.finalSignatureHash
 * @param {number} input.finalIterationRoundNumber
 * @returns {Promise<{hash: string, authoritative: boolean, inputsHashed: Array<string>}>}
 */
export async function computeFinalHash({
  cauIRI, sessionId, finalSignatureHash, finalIterationRoundNumber,
}) {
  if (typeof cauIRI !== 'string' || cauIRI.length === 0) {
    throw new TypeError('computeFinalHash: cauIRI is required.');
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('computeFinalHash: sessionId is required.');
  }
  if (typeof finalSignatureHash !== 'string' || finalSignatureHash.length === 0) {
    throw new TypeError('computeFinalHash: finalSignatureHash is required.');
  }
  if (!Number.isInteger(finalIterationRoundNumber) || finalIterationRoundNumber < 0) {
    throw new TypeError('computeFinalHash: finalIterationRoundNumber must be a non-negative integer.');
  }

  const byteHashes = getIngestionHashes(sessionId);
  if (!byteHashes || !byteHashes.bfoContentHash) {
    throw new Error(
      `computeFinalHash: session ${sessionId} missing bfoContentHash. ` +
      `DP-2.3.0 byte-capture via captureBFOBytes is required before Final Hash emission (D3.D2 lock).`,
    );
  }
  if (!byteHashes.curatedContentHash) {
    throw new Error(
      `computeFinalHash: session ${sessionId} missing curatedContentHash. ` +
      `DP-2.3.0 byte-capture via captureCuratedBytes is required before Final Hash emission (D3.D2 lock).`,
    );
  }

  const configInputs = assembleConfigInputs(sessionId);
  const configHash = await sha256(canonicalize(configInputs));

  // §7.4 canonical input list, serialized as a JCS object for hashing.
  // Key names are semantic; JCS sorts them deterministically.
  const hashInput = {
    cauIRI,
    finalSignatureHash,
    bfoVersionIdentifier: byteHashes.bfoContentHash,
    curatedAdditionsVersionIdentifier: byteHashes.curatedContentHash,
    sessionConfigurationHash: configHash,
    finalIterationRoundNumber,
  };

  const hash = await sha256(canonicalize(hashInput));

  return {
    hash,
    authoritative: true,
    inputsHashed: FINAL_HASH_INPUT_LABELS.slice(),
  };
}

/**
 * Replace a record's scaffold reproducibility hash with a computed Final
 * Hash at session finalization. Removes the `_scaffold: true` sentinel —
 * this is the I2b activation switch per the design sketch §1.4.
 *
 * Sweep discipline: at session end, every canonical record MUST be
 * finalized. Test harnesses assert zero persisted records retain the
 * sentinel post-finalize.
 *
 * Mutates the passed record's `reproducibilityHash` field in place.
 *
 * @param {object} input
 * @param {object} input.record - canonical record to finalize
 * @param {string} input.finalSignatureHash
 * @param {number} input.finalIterationRoundNumber
 * @returns {Promise<object>} the finalized record (same reference as input.record)
 */
export async function finalizeCanonicalRecord(input) {
  const { record, finalSignatureHash, finalIterationRoundNumber } = input;
  if (!record || typeof record !== 'object') {
    throw new TypeError('finalizeCanonicalRecord: record is required.');
  }
  const { cauIRI, provenance } = record;
  if (!cauIRI || !provenance || !provenance.sessionId) {
    throw new TypeError('finalizeCanonicalRecord: record must carry cauIRI and provenance.sessionId.');
  }

  const finalHash = await computeFinalHash({
    cauIRI,
    sessionId: provenance.sessionId,
    finalSignatureHash,
    finalIterationRoundNumber,
  });

  record.reproducibilityHash = {
    algorithm: 'SHA-256',
    perRoundHashes: (record.reproducibilityHash && record.reproducibilityHash.perRoundHashes) || [],
    finalHash,
    // _scaffold sentinel removed — I2b now active on this record.
  };

  return record;
}
