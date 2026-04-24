/**
 * Record Persistence Composition — DP-2-I1 chokepoint + StateAdapter persist.
 *
 * Demonstrates the canonical pattern: writeCanonicalRecord validates (and
 * throws DP2NonConformanceError on failure), then the caller persists the
 * validated record via a StateAdapter method. Every adapter-persist call
 * MUST have a writeCanonicalRecord predecessor in the same lexical scope
 * (enforced by the F4 `dp2-writepath-chokepoint-exclusivity` AVC audit).
 *
 * This composition keeps writer pure-function per CLAUDE.md core-module
 * discipline while giving the F4 static audit a concrete call site to
 * verify. Consumers of D1.6 reasoning that persist canonical records
 * through a StateAdapter should call this helper rather than invoking
 * StateAdapter.persistCanonicalRecord directly.
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §7.1
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §7.1
 * F4 audit: specs/d16/bundle-v5-authorization-memo.md
 */

import { writeCanonicalRecord } from './canonical-record-writer.js';

/**
 * Validate and persist a canonical record through the DP-2 chokepoint.
 *
 * Flow:
 *   1. writeCanonicalRecord validates the record per I1 + I2a.
 *   2. On pass, the validated record is handed to the adapter's
 *      persistCanonicalRecord method (adapter must implement this).
 *   3. On fail, DP2NonConformanceError propagates to the caller — no
 *      persistence attempted.
 *
 * The function return mirrors writeCanonicalRecord's return (ok, record,
 * phase) plus the adapter's persistence acknowledgement.
 *
 * @param {object} record
 * @param {object} context - { phase: 'scaffold' | 'production', ...session meta }
 * @param {object} adapter - StateAdapter with persistCanonicalRecord(record, context)
 * @returns {{ ok: true, record: object, phase: string, persisted: boolean }}
 */
export function persistCanonicalRecordViaChokepoint(record, context, adapter) {
  const validation = writeCanonicalRecord(record, context);
  // Chokepoint predecessor: writeCanonicalRecord call above. Adapter call
  // below consumes validation.record. Per F4 negative assertion, result is
  // not discarded and persistence uses the validated record.
  if (adapter && typeof adapter.persistCanonicalRecord === 'function') {
    adapter.persistCanonicalRecord(validation.record, context);
    return { ...validation, persisted: true };
  }
  // When no adapter is provided (test contexts, dry-runs), return validation
  // unchanged. Callers who require persistence supply an adapter; callers
  // who are pure-function-downstream (scaffold-mode dry-runs, testing) do
  // not. Either mode is chokepoint-compliant.
  return { ...validation, persisted: false };
}
