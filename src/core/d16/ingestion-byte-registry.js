/**
 * Ingestion Byte Registry — DP-2.3.0 retrofit per SME D3.2 lock.
 *
 * Session-scoped capture of raw-byte content hashes for:
 *   - source ontology (user-uploaded file)
 *   - BFO (active BFO Turtle)
 *   - curated additions (companion axioms per §5.2)
 *
 * Per SME D3.2: hashes are computed over **raw ingested bytes**, not over
 * re-serialized post-parse forms. Byte capture happens at load time; raw
 * bytes may be discarded post-hash if storage cost matters.
 *
 * Consumed by DP-2.3.2 Final Hash assembly (§7.4 canonical input list:
 *   [CAU IRI, Final Signature hash, BFO version identifier = bfoContentHash,
 *    Curated additions version identifier = curatedContentHash,
 *    session configuration hash, final iteration round number]).
 *
 * Edge-canonical: no persistence dependency; in-memory per session. A later
 * sub-phase may layer IndexedDB persistence (§8 of X1 memo; out of scope
 * for DP-2.3.0).
 *
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §5.2 DP-2.3.0
 * Lock:   specs/d16/dp2-locked-decisions.md (D3.2 byte-capture requirement)
 */

import { sha256, byteLengthOf } from './crypto-shim.js';

const HEX64_RE = /^[0-9a-f]{64}$/;

// sessionId → { sourceContentHash, sourceByteLength, bfoContentHash,
//               bfoByteLength, curatedContentHash, curatedByteLength }
const registry = new Map();

/**
 * Capture the source ontology bytes at ingestion time. Idempotent per
 * session — calling twice with the same bytes produces the same hash;
 * calling with different bytes for the same session is a defect and throws.
 *
 * @param {object} input
 * @param {string} input.sessionId
 * @param {string | Uint8Array} input.bytes
 * @returns {Promise<{sourceContentHash: string, sourceByteLength: number}>}
 */
export async function captureSource({ sessionId, bytes }) {
  return captureField(sessionId, 'source', bytes);
}

/**
 * Capture the BFO Turtle bytes at load time. Idempotent per session.
 *
 * @param {object} input
 * @param {string} input.sessionId
 * @param {string | Uint8Array} input.bytes
 * @returns {Promise<{bfoContentHash: string, bfoByteLength: number}>}
 */
export async function captureBFO({ sessionId, bytes }) {
  return captureField(sessionId, 'bfo', bytes);
}

/**
 * Capture the curated-additions bytes at load time. Idempotent per session.
 *
 * @param {object} input
 * @param {string} input.sessionId
 * @param {string | Uint8Array} input.bytes
 * @returns {Promise<{curatedContentHash: string, curatedByteLength: number}>}
 */
export async function captureCurated({ sessionId, bytes }) {
  return captureField(sessionId, 'curated', bytes);
}

/**
 * Read the hashes captured so far for a session. Fields are present only
 * if captured; absent fields return undefined. DP-2.3.2 Final Hash assembly
 * will require all three to be present per §7.4.
 *
 * @param {string} sessionId
 * @returns {{
 *   sourceContentHash?: string, sourceByteLength?: number,
 *   bfoContentHash?: string, bfoByteLength?: number,
 *   curatedContentHash?: string, curatedByteLength?: number
 * } | null}
 */
export function getHashes(sessionId) {
  if (!registry.has(sessionId)) return null;
  return { ...registry.get(sessionId) };
}

/**
 * Clear a session's registry entry. Called on session cleanup; idempotent
 * (absent session is a no-op).
 */
export function clearSession(sessionId) {
  registry.delete(sessionId);
}

/**
 * Test-only: reset the entire registry.
 */
export function resetForTests() {
  registry.clear();
}

// ── Internals ──────────────────────────────────────────────────────

async function captureField(sessionId, kind, bytes) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('captureField: sessionId must be a non-empty string.');
  }
  if (bytes == null) {
    throw new TypeError(`captureField(${kind}): bytes is required.`);
  }

  const hash = await sha256(bytes);
  const length = byteLengthOf(bytes);

  if (!HEX64_RE.test(hash)) {
    // Guard against shim regression — should never fire in normal operation.
    throw new Error(`captureField(${kind}): sha256 shim returned malformed hash: ${JSON.stringify(hash).slice(0, 80)}.`);
  }

  const existing = registry.get(sessionId) || {};
  const hashKey = `${kind}ContentHash`;
  const lengthKey = `${kind}ByteLength`;

  if (hashKey in existing && existing[hashKey] !== hash) {
    throw new Error(
      `captureField: session ${sessionId} already has ${hashKey}=${existing[hashKey].slice(0, 12)}… ` +
      `(new attempt ${hash.slice(0, 12)}…). Per SME D3.2 byte-capture lock, captures must be deterministic per session.`,
    );
  }

  existing[hashKey] = hash;
  existing[lengthKey] = length;
  registry.set(sessionId, existing);

  return { [hashKey]: hash, [lengthKey]: length };
}
