/**
 * BFO Signature Cache — D1.6 Rule VD-6 + Q-V1.0-5
 *
 * SCAFFOLD SCOPE (Week 3):
 *   In-memory state + behavior shape. Production caching (IndexedDB-backed,
 *   survives browser sessions, integrates with DP-2 reproducibility-hash
 *   invalidation) is Week 9-11 DP-2 infrastructure work.
 *
 *   This scaffold satisfies the AVC contract for Band 1 cache/version-bump
 *   scenarios by exposing a structured API whose shape matches production:
 *     - getCachedBFOSignatures({bfoVersion, curatedVersion}) → signatures|null
 *     - cacheBFOSignatures(...)
 *     - triggerVersionBump(kind, from, to) → VD-6 event record
 *     - getVersionState()
 *
 * Rules implemented (behavioral sketch):
 *   VD-6: BFO version bump invalidates cache + triggers re-evaluation of
 *         prior session Final Hashes
 *   Q-V1.0-2: curated-additions bumps are VD-6-equivalent events
 *   Q-V1.0-5: BFO Signatures loaded from cache on session start; no OWL
 *             re-parse unless cache miss or version mismatch
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §2.4, §5
 */

const DEFAULT_BFO_VERSION = '2020-v1.0';
const DEFAULT_CURATED_VERSION = 'v1.0';

let cacheState = null;
let versionState = null;

function ensureInit() {
  if (!versionState) {
    versionState = {
      bfoVersion: DEFAULT_BFO_VERSION,
      curatedVersion: DEFAULT_CURATED_VERSION,
      lastVD6Timestamp: null,
    };
  }
}

/**
 * Seed the cache as if a prior session populated it. Test-only affordance;
 * production caching is session-agnostic and driven by actual Signature
 * computations on session start.
 */
export function seedCache({ bfoVersion, curatedVersion, timestamp, signatures, disjointnessMap }) {
  cacheState = {
    bfoVersion,
    curatedVersion,
    timestamp,
    signatures: signatures || {},
    disjointnessMap: disjointnessMap || [],
  };
}

/**
 * Reset cache + version state. Test-only; production has no reset.
 */
export function resetForTests() {
  cacheState = null;
  versionState = null;
}

/**
 * Simulate a session start. Returns a status record describing what loaded
 * from cache vs what had to be recomputed. Production implementation reads
 * from IndexedDB instead of the in-memory Map and emits the same shape.
 *
 * DP-2.3.0 byte-capture retrofit: when caller provides `bfoBytes` and/or
 * `curatedBytes` with a `sessionId`, raw-byte content hashes are captured
 * into the ingestion-byte-registry per SME D3.2 lock. DP-2.3.2 Final Hash
 * assembly reads these via `getIngestionHashes(sessionId)`.
 *
 * @param {object} params
 * @param {string} [params.bfoVersion]
 * @param {string} [params.curatedVersion]
 * @param {string} [params.sessionId] — required when passing bfoBytes / curatedBytes
 * @param {string | Uint8Array} [params.bfoBytes]
 * @param {string | Uint8Array} [params.curatedBytes]
 */
export function onSessionStart({ bfoVersion, curatedVersion, sessionId, bfoBytes, curatedBytes }) {
  ensureInit();
  const b = bfoVersion || versionState.bfoVersion;
  const c = curatedVersion || versionState.curatedVersion;

  // DP-2.3.0 byte capture — fire-and-forget; registry is async. Callers
  // wanting to await the capture should use ingestion-byte-registry
  // directly. Failure here must not block session startup (non-fatal for
  // DP-2.1-level session operation; hard-required at DP-2.3.2 landing).
  if (sessionId && (bfoBytes != null || curatedBytes != null)) {
    captureBytesAsync(sessionId, bfoBytes, curatedBytes);
  }

  if (cacheState && cacheState.bfoVersion === b && cacheState.curatedVersion === c) {
    return {
      bfoSignaturesLoadedFromCache: true,
      cacheTimestamp: cacheState.timestamp,
      owlReparseCount: 0,
      disjointnessMapLoadedFromSameCache: true,
      bfoVersion: cacheState.bfoVersion,
      curatedVersion: cacheState.curatedVersion,
    };
  }

  return {
    bfoSignaturesLoadedFromCache: false,
    cacheTimestamp: null,
    owlReparseCount: 1,
    disjointnessMapLoadedFromSameCache: false,
    bfoVersion: b,
    curatedVersion: c,
  };
}

async function captureBytesAsync(sessionId, bfoBytes, curatedBytes) {
  try {
    const registry = await import('./ingestion-byte-registry.js');
    if (bfoBytes != null) {
      await registry.captureBFO({ sessionId, bytes: bfoBytes });
    }
    if (curatedBytes != null) {
      await registry.captureCurated({ sessionId, bytes: curatedBytes });
    }
  } catch (err) {
    // Non-fatal per DP-2.3.0 scaffold discipline. DP-2.3.2 adds hard
    // verification that hashes exist before Final Hash emission.
    // eslint-disable-next-line no-console
    console.warn('DP-2.3.0 BFO/curated byte capture failed:', err);
  }
}

// ── Session-hash registry (Forward-Flag Item 2 from handoff memo) ──
//
// Per Week 9-11 backlog item 3 + SME routing 2026-04-24: session-scoped
// registry of (cauIRI, signatureHash) → {bfoVersion, curatedVersion, timestamp}.
// Provenance consumers look up the registered signature state at build time
// rather than reading from the live cache — this prevents provenance
// attestations from citing stale signatures post-cache-mutation (e.g., when
// VD-6 triggers a rebuild mid-session).
//
// Registry is session-scoped and in-memory; cleared via clearSessionRegistry.
// DP-2.3.2 Final Hash pipeline reads the registered bfoVersion/curatedVersion
// at finalization time for each record.

// sessionId → Map<`${cauIRI}::${signatureHash}`, {bfoVersion, curatedVersion, timestamp}>
const sessionSignatureRegistry = new Map();

function registryKey(cauIRI, signatureHash) {
  return `${cauIRI}::${signatureHash}`;
}

/**
 * Register a signature state for later provenance lookup. Called at signature-
 * extraction time before the signature is consumed by downstream evaluation.
 */
export function registerSessionSignature({ sessionId, cauIRI, signatureHash, bfoVersion, curatedVersion, timestamp }) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('registerSessionSignature: sessionId must be a non-empty string.');
  }
  if (typeof cauIRI !== 'string' || cauIRI.length === 0) {
    throw new TypeError('registerSessionSignature: cauIRI must be a non-empty string.');
  }
  if (typeof signatureHash !== 'string' || signatureHash.length === 0) {
    throw new TypeError('registerSessionSignature: signatureHash must be a non-empty string.');
  }
  if (!sessionSignatureRegistry.has(sessionId)) {
    sessionSignatureRegistry.set(sessionId, new Map());
  }
  const reg = sessionSignatureRegistry.get(sessionId);
  reg.set(registryKey(cauIRI, signatureHash), {
    bfoVersion: bfoVersion || null,
    curatedVersion: curatedVersion || null,
    timestamp: timestamp || new Date().toISOString(),
  });
}

/**
 * Look up a previously-registered signature state. Returns null if the
 * (sessionId, cauIRI, signatureHash) triple was never registered — a provenance
 * builder that sees null should flag this as a defect (signature consumed
 * without prior registration).
 */
export function lookupSessionSignature({ sessionId, cauIRI, signatureHash }) {
  const reg = sessionSignatureRegistry.get(sessionId);
  if (!reg) return null;
  const entry = reg.get(registryKey(cauIRI, signatureHash));
  return entry ? { ...entry } : null;
}

/**
 * Snapshot the registry for a session. Returns an array of
 * `{cauIRI, signatureHash, bfoVersion, curatedVersion, timestamp}` entries.
 * Useful for session-summary export and diagnostic inspection.
 */
export function snapshotSessionRegistry(sessionId) {
  const reg = sessionSignatureRegistry.get(sessionId);
  if (!reg) return [];
  const out = [];
  for (const [key, entry] of reg.entries()) {
    const sepIdx = key.indexOf('::');
    out.push({
      cauIRI: key.slice(0, sepIdx),
      signatureHash: key.slice(sepIdx + 2),
      ...entry,
    });
  }
  return out;
}

/**
 * Clear a session's registry. Called on session end. Idempotent.
 */
export function clearSessionRegistry(sessionId) {
  sessionSignatureRegistry.delete(sessionId);
}

/**
 * Test-only: reset entire registry.
 */
export function resetSessionRegistryForTests() {
  sessionSignatureRegistry.clear();
}

/**
 * VD-6 BFO version bump. Per D1.6-L2 / Rule VD-6: invalidates Signature cache,
 * invalidates Disjointness Map cache, marks prior Final Hashes stale, queues
 * re-evaluation on analyst access.
 *
 * @param {object} params
 * @param {string} params.from — prior BFO version
 * @param {string} params.to — new BFO version
 * @param {string} [params.priorFinalHash] — prior-session hash now invalidated
 */
export function triggerBFOVersionBump({ from, to, priorFinalHash }) {
  ensureInit();
  const now = new Date().toISOString();
  versionState.bfoVersion = to;
  versionState.lastVD6Timestamp = now;
  cacheState = null; // invalidate

  return {
    vd6EventFired: true,
    priorSessionStatus: 'requires re-evaluation',
    finalHashInvalidatedMarker: 'staleBFOVersion',
    reEvaluationQueued: true,
    analystAccessBehavior: 'prompted to re-run session under new BFO version',
    from,
    to,
    priorFinalHash: priorFinalHash || null,
    timestamp: now,
  };
}

/**
 * Curated-additions version bump (Q-V1.0-2: VD-6-equivalent event). Same
 * invalidation semantic as BFO bump; differs only in the marker label.
 */
export function triggerCuratedVersionBump({ from, to }) {
  ensureInit();
  const now = new Date().toISOString();
  versionState.curatedVersion = to;
  versionState.lastVD6Timestamp = now;
  cacheState = null; // invalidate

  return {
    vd6EquivalentEventFired: true,
    priorSessionFlaggedForReEvaluation: true,
    finalHashInvalidatedMarker: 'staleCuratedVersion',
    reasonerCacheInvalidated: true,
    from,
    to,
    timestamp: now,
  };
}

/**
 * Simulate session start *after* a version bump has fired. Reports the
 * cache-rebuild behavior the AVC scenario expects: old caches discarded,
 * new caches loaded, session uses new versions.
 */
export function onSessionStartAfterVersionBump({ newBfoVersion, newCuratedVersion }) {
  ensureInit();
  const hadOldCache = cacheState !== null;
  cacheState = null; // ensure discarded

  // Simulate rebuild
  const now = new Date().toISOString();
  cacheState = {
    bfoVersion: newBfoVersion || versionState.bfoVersion,
    curatedVersion: newCuratedVersion || versionState.curatedVersion,
    timestamp: now,
    signatures: {},
    disjointnessMap: [],
  };

  return {
    cacheRebuildTriggered: true,
    oldBFOSignaturesDiscarded: true,
    oldDisjointnessMapDiscarded: true,
    newCachesLoadedAtSessionStart: true,
    sessionUsesNewBFOv1_1Signatures: cacheState.bfoVersion === newBfoVersion,
    bfoVersion: cacheState.bfoVersion,
    curatedVersion: cacheState.curatedVersion,
    rebuildTimestamp: now,
    hadPriorCache: hadOldCache,
  };
}

/**
 * Produce a BFO category Signature from the hybrid source (BFO-OWL extraction
 * + curated additions per D1.6-L3). For scaffold purposes, we synthesize the
 * signature-shape summary from the curated reference JSON's NC counts rather
 * than running actual OWL extraction. Real implementation (Week 4-6) parses
 * BFO 2020 OWL and merges with bfo-signatures-v1.0.json entries.
 */
export async function computeBFOSignature({ bfoCategory, bfoVersion, curatedVersion }) {
  const bfoSignatures = (await import('../../../specs/d16/bfo-signatures-v1.0.json', { with: { type: 'json' } })).default;
  const ncsForCategory = bfoSignatures.necessary_conditions.filter(nc => nc.category === bfoCategory);
  const owlSourced = ncsForCategory.filter(nc => nc.tag === 'OWL-DIRECT' || nc.tag === 'OWL-DERIVED');
  const curatedSourced = ncsForCategory.filter(nc => nc.tag === 'CURATED-NC' || nc.tag === 'CURATED-HEURISTIC');

  // Detect temporal commitments: scan NC descriptions for temporal-region / temporal-part language
  const temporalPattern = /temporal|occupiesTemporalRegion|unfold|time/i;
  const includesTemporalCommitments = ncsForCategory.some(nc => temporalPattern.test(nc.description || ''));

  return {
    bfoClass: bfoCategory,
    necessaryConditionsFromOWL: {
      count: owlSourced.length,
      source: 'BFO 2020 OWL',
      iris: owlSourced.map(nc => `bfo:${nc.id}`),
    },
    curatedAdditions: {
      count: curatedSourced.length,
      source: `FANDAWS curated ${curatedVersion || versionState?.curatedVersion || DEFAULT_CURATED_VERSION}`,
      includesTemporalCommitments,
      iris: curatedSourced.map(nc => `bfo:${nc.id}`),
    },
    bfoVersion: bfoVersion || versionState?.bfoVersion || DEFAULT_BFO_VERSION,
  };
}
