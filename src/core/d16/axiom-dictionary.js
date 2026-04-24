/**
 * Axiom Dictionary — D1.6 DP-2.2 / Rule DP-2-R5.
 *
 * Session-scoped deduplication store for axiom evidence. Individual canonical
 * records reference axioms by dictionary ID (sha256 hash of the canonical RDF
 * subgraph representation); they MUST NOT inline axiom text. Inlining fails
 * content validation per DP-2-R5 + I4 (Dictionary Discipline).
 *
 * Keying rule (D2.1 LOCKED with linkage to D3.1): content hash of the canonical
 * JSON form produced by `canonicalize()`. Two axioms with semantically
 * equivalent RDF subgraphs but trivially different source syntax (whitespace,
 * prefix, conjunct ordering) dedupe to the same ID. The canonicalization is
 * the SAME JCS-based form DP-2.3.2 uses for Final Hash inputs.
 *
 * Storage: in-memory Map per session. A later sub-phase may layer IndexedDB
 * persistence via the v1.1.0 amendment DependencyGraph infrastructure.
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §7.3, §8.3 (DP-2-R5)
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §4.2
 * Lock: specs/d16/dp2-locked-decisions.md (D2.1 content-hash keying)
 */

import { canonicalize } from './canonical-serialization.js';
import { sha256 } from './crypto-shim.js';

// sessionId → { hashToId: Map<hash, id>, idToEntry: Map<id, {axiom, hash, canonicalForm}> }
const dictionaries = new Map();

/**
 * Intern an axiom into the session's dictionary. Returns the axiom's
 * dictionary ID (content hash). Idempotent per axiom.
 *
 * Callers store the returned `id` on provenance records; downstream consumers
 * resolve via `resolveAxiom(sessionId, id)` to recover the axiom content.
 *
 * @param {object} input
 * @param {string} input.sessionId
 * @param {object | string} input.axiom - the axiom structure (JSON-serializable)
 * @returns {Promise<{id: string, axiom: object | string}>}
 */
export async function internAxiom({ sessionId, axiom }) {
  assertSessionId(sessionId);
  if (axiom === null || axiom === undefined) {
    throw new TypeError('internAxiom: axiom is required.');
  }

  const canonicalForm = canonicalize(axiom);
  const id = await sha256(canonicalForm);

  const dict = getOrCreateDict(sessionId);
  if (!dict.hashToId.has(id)) {
    dict.hashToId.set(id, id);
    dict.idToEntry.set(id, { axiom, hash: id, canonicalForm });
  }

  return { id, axiom };
}

/**
 * Resolve a dictionary ID back to its axiom entry. Returns null if the ID
 * was never interned in this session.
 *
 * @param {string} sessionId
 * @param {string} id
 * @returns {{axiom: object | string, hash: string, canonicalForm: string} | null}
 */
export function resolveAxiom(sessionId, id) {
  const dict = dictionaries.get(sessionId);
  if (!dict) return null;
  const entry = dict.idToEntry.get(id);
  return entry ? { ...entry } : null;
}

/**
 * Snapshot the session's dictionary. Returns an array of
 * `{id, axiom, canonicalForm}` entries suitable for export bundles and
 * `inspectProvenanceStorage` scenarios.
 *
 * @param {string} sessionId
 * @returns {Array<{id: string, axiom: object | string, canonicalForm: string}>}
 */
export function snapshotDictionary(sessionId) {
  const dict = dictionaries.get(sessionId);
  if (!dict) return [];
  const out = [];
  for (const entry of dict.idToEntry.values()) {
    out.push({ id: entry.hash, axiom: entry.axiom, canonicalForm: entry.canonicalForm });
  }
  return out;
}

/**
 * Dictionary size for a session. Useful for AVC assertion ("small (shared
 * axioms appear once)") and for storage footprint diagnostics.
 *
 * @param {string} sessionId
 * @returns {number}
 */
export function dictionarySize(sessionId) {
  const dict = dictionaries.get(sessionId);
  return dict ? dict.idToEntry.size : 0;
}

/**
 * Clear a session's dictionary. Called on session cleanup; idempotent.
 */
export function clearDictionary(sessionId) {
  dictionaries.delete(sessionId);
}

/**
 * Test-only: reset all dictionaries.
 */
export function resetForTests() {
  dictionaries.clear();
}

// ── Internals ──────────────────────────────────────────────────────

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('axiom-dictionary: sessionId must be a non-empty string.');
  }
}

function getOrCreateDict(sessionId) {
  let dict = dictionaries.get(sessionId);
  if (!dict) {
    dict = { hashToId: new Map(), idToEntry: new Map() };
    dictionaries.set(sessionId, dict);
  }
  return dict;
}
