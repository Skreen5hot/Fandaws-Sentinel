# SME Authorization — AVC Bundle v5 (F4 Scenario Landing)

**Status:** v1.0 2026-04-24. SME authorization for the `fandaws-sentinel-d16-avc-bundle.json` version bump from v4 to v5. Closes the F4 accumulated commitment from the `dp2-scaffolding-design-sketch.md` §3.3 / `dp2-locked-decisions.md` SME-DP2-F4 entry.
**Owner:** SME (bundle-version bumps require SME authorization per handoff-memo NOT-TO-DO discipline).
**Consumes:** `dp2-scaffolding-design-sketch.md` §3.3 (F4 scenario specification); `dp2-locked-decisions.md` SME-DP2-F4; `dp2-x2-config-allow-list-memo-v1.md` §5 watch-item 3 (F4 audit reframing post-DP-2.1 landing).
**Consumed by:** developer, who applies the bundle-file patch in §3 and implements the audit harness per §4.
**Scope fence:** authorizes v5 bump ONLY; does not authorize any other scenario additions, rule edits, or assertion tightening. If the developer discovers during implementation that another scenario is required, route it back to SME before bundling.

---

## 1. Problem statement

The `dp2-writepath-chokepoint-exclusivity` scenario has been an accumulating commitment since the DP-2 design-review cycle (2026-04-23, F4 promotion). The handoff memo's NOT-TO-DO discipline required SME authorization before any bundle-version bump; the developer correctly held the scenario back when landing DP-2.1 (2026-04-24). This memo delivers that authorization.

Two inputs have landed since the original F4 promotion that affect the scenario's shape:

1. **DP-2.1 writer landed as pure-function.** The writer validates and returns; it does not persist. This is a principled deviation from the original sketch wording ("persists via StateAdapter") and aligns with CLAUDE.md's core-module discipline. SME-endorsed 2026-04-24.

2. **F4 audit reframing.** Consequence of (1): the audit cannot scan adapter state for absence-of-chokepoint-marker because the chokepoint does not write the marker — the caller does. The audit must verify **call-site discipline**: every code path that reaches a canonical-record persistence call has a `writeCanonicalRecord(record, context)` validation predecessor in the same lexical scope.

The v5 scenario incorporates both. This memo provides the scenario spec ready for bundle insertion, the supporting patch instructions, and implementation guidance for the test harness.

---

## 2. F4 scenario specification

### 2.1 Ready-to-insert JSON

The following scenario is authorized for insertion into the bundle's `scenarios` array immediately after `dp2-axiom-dictionary-deduplication` (preserving Band 6 clustering):

```json
{
  "id": "dp2-writepath-chokepoint-exclusivity",
  "band": 6,
  "verifies": [
    "DP-2-I1",
    "DP-2-I2a",
    "§7.1 Write-Path Chokepoint",
    "SME-DP2-F4"
  ],
  "description": "Exhaustive write-path chokepoint audit. Verifies every code path that reaches canonical-record persistence has a writeCanonicalRecord(record, context) validation predecessor in the same lexical scope, AND every canonical record extant in adapter state passes I2a shape-level validation. Belt-and-suspenders regression insurance against chokepoint bypass. Per 2026-04-24 F4 audit reframing: writer is pure-function (validates and returns; does not persist — CLAUDE.md core-module discipline), so audit verifies call-site discipline at source level PLUS shape-validity at runtime.",
  "setup": {
    "staticAuditTarget": "src/**/*.js excluding canonical-record-writer.js itself and its direct test file",
    "runtimeAuditTarget": "all canonical records in StateAdapter state at audit time",
    "chokepointApiPattern": "writeCanonicalRecord(record, { phase: 'scaffold'|'production' })",
    "adapterPersistPatterns": [
      "<adapter>.persistCanonicalRecord(...)",
      "<adapter>.saveCanonicalRecord(...)",
      "<adapter>.putCanonical(...)",
      "equivalent StateAdapter canonical-record write calls as identified at audit time"
    ]
  },
  "trigger": {
    "type": "auditWritePathChokepoint",
    "mode": "static-plus-runtime",
    "runAgainst": "current working tree + current session adapter state"
  },
  "expect": {
    "staticAudit": {
      "adapterPersistCallSitesFound": ">= 1",
      "callSitesWithChokepointPredecessorInSameScope": "equals adapterPersistCallSitesFound",
      "bypassCallSites": 0,
      "bypassList": []
    },
    "runtimeAudit": {
      "canonicalRecordsScanned": ">= 0",
      "recordsFailingI2aValidation": 0,
      "failingRecordIds": []
    },
    "auditPassedBoth": true
  },
  "negative_assertions": [
    {
      "condition": "no canonical record persistence bypasses writeCanonicalRecord",
      "description": "A call site that persists a canonical record without a preceding writeCanonicalRecord validation in the same lexical scope is a DP-2-I1 defect."
    },
    {
      "condition": "no writeCanonicalRecord result is discarded",
      "description": "Callers MUST consume the { ok, record, phase } return value and proceed to persist the returned record. Discarding the return and persisting an unvalidated record bypasses the chokepoint even with the validator call present."
    },
    {
      "condition": "no catch-and-discard of DP2NonConformanceError",
      "description": "Wrapping writeCanonicalRecord in try/catch that swallows DP2NonConformanceError and persists anyway defeats the chokepoint. Audit flags any such pattern as bypass."
    },
    {
      "condition": "no absence-based phase routing",
      "description": "Per SME-DP2-P1, context.phase MUST be 'scaffold' | 'production' explicitly. Callers that invoke writeCanonicalRecord without a phase value are defects (the writer already throws TypeError on missing phase, but the audit verifies no caller relies on that throw as runtime behavior)."
    }
  ],
  "notes": {
    "sme_authorization": "specs/d16/bundle-v5-authorization-memo.md (v1.0 2026-04-24)",
    "audit_reframing_origin": "post-DP-2.1 landing; writer landed pure-function per CLAUDE.md core-module discipline",
    "expected_call_site_count_hint": "As of DP-2.1 landing, persistence is caller-side and sites are enumerated in canonical-record-writer.js design §3.2 (three-state-evaluator terminals; inheritance-cascade NA-1.1/NA-1.3 paths; reactive-engine NA-1.4 path; NotApplicable routing; analyst override). Audit discovers actual sites; hint is for developer orientation only."
  }
}
```

### 2.2 Scenario rationale

**`verifies` field composition.** `DP-2-I1` and `DP-2-I2a` are the named invariants the audit attests to. `§7.1 Write-Path Chokepoint` is the spec anchor. `SME-DP2-F4` is the traceability tag to the locked-decisions entry.

**Static-plus-runtime mode.** The two audit modes are complementary, not redundant:

- **Static audit** catches bypass at source-code level, including code paths not exercised by current tests. This is the primary defense against chokepoint drift as the codebase grows.
- **Runtime audit** catches records that might have been persisted via an edge case static analysis missed (reflection, dynamic dispatch, edge cases in test setup, etc.). Vacuously passes when no records exist; becomes substantive once records are persisted.

Removing either mode would leave a gap. The scenario requires both to pass.

**Negative assertions cover the four known bypass patterns:**

1. Missing predecessor (the straightforward bypass).
2. Discarding the return value (the "called the validator but didn't use its output" bypass).
3. Error suppression (the "caught and ignored the non-conformance" bypass).
4. Absence-based phase routing (the SME-DP2-P1 regression that would quietly erode scaffold-vs-production discipline).

Additional bypass patterns may surface during implementation. If the developer discovers a new bypass pattern worth encoding as a negative assertion, route back to SME for bundle amendment.

### 2.3 Expected outcome

Current DP-2.1 + DP-2.2 + DP-2.3.0 code should PASS the audit (the writer landed with discipline; DP-2.2 extended production composition via `buildProductionCanonicalRecord`). If the audit fails on current code, the failure is a latent DP-2-I1 defect that the scenario correctly surfaces — this is the load-bearing value of the scenario, not a reason to water it down.

---

## 3. Bundle-file patch

### 3.1 Field updates

Apply the following changes to `avc/fandaws-sentinel-d16-avc-bundle.json`:

| Field | Before | After |
|---|---|---|
| `bundle_version` | `4` | `5` |
| `total_scenarios` | `68` | `69` |
| `band_breakdown["Band 6 — DP-2 Invariant Enforcement (densest)"]` | `10` | `11` |

### 3.2 Scenarios array

Insert the §2.1 scenario immediately after the `dp2-axiom-dictionary-deduplication` entry. Preserve trailing comma / formatting conventions.

### 3.3 Revision history

The current `revision_history` ends at v3. The v4 bump (commit 6090770, "Land D1.6 Phase 1 + DP-2.1 write-path chokepoint") was not recorded. The v5 patch closes BOTH gaps:

```json
{
  "version": 4,
  "date": "2026-04-24",
  "note": "Assertion tightening for five scenarios: concrete exact-match values replacing placeholder patterns (e.g., '>=3' → 3) against bfo-signatures-v1.0.json state; data-structure refinement for iteration history and finalStateMarker shape; bfoCategory trigger field added to bfo-signature cached-reuse scenario for handler API alignment. Total scenarios unchanged (68). Bump performed during DP-2.1 landing without explicit SME authorization; backfilled retrospectively in v5 memo §3.3 for bookkeeping completeness.",
  "sme_authorization": "backfilled via specs/d16/bundle-v5-authorization-memo.md"
},
{
  "version": 5,
  "date": "2026-04-24",
  "note": "Band 6 grows from 10 to 11 scenarios. Adds dp2-writepath-chokepoint-exclusivity, the F4 belt-and-suspenders audit for write-path chokepoint exclusivity. Audit verifies call-site discipline (static) + record shape validity (runtime) per 2026-04-24 F4 reframing for pure-function writer. Total scenarios 68 → 69.",
  "sme_authorization": "specs/d16/bundle-v5-authorization-memo.md"
}
```

### 3.4 Patch discipline

This memo authorizes ONLY the fields and scenario enumerated above. If the patch also incidentally fixes assertion drift, typos, or formatting in unrelated scenarios, those fixes require separate SME authorization (or must be deferred to a future bump). Keep the v5 patch minimal and reviewable.

---

## 4. Test harness implementation guidance

### 4.1 Harness location

`tests/avc/d16-runner.test.js` already handles Band 6 DP-2 scenarios. Adding a `auditWritePathChokepoint` trigger handler alongside the existing `attemptCanonicalWrite` / `attemptCanonicalWrites` handlers is the natural fit.

The harness should accept the trigger, perform both audits, and return a structured result matching the `expect` shape in §2.1.

### 4.2 Static audit implementation sketch

A minimal viable static audit is AST-based rather than regex-based:

1. Parse each `.js` file under the `staticAuditTarget` glob using a JavaScript parser (e.g., `@babel/parser` or `acorn` — or a dep-free tokenizer if the edge-canonical constraint applies to tests).
2. For each file, walk the AST collecting call expressions.
3. Identify call expressions that match `adapterPersistPatterns` (method name heuristic; list expandable).
4. For each matched call, look upward in the same lexical scope (same function body or block) for a `writeCanonicalRecord` call expression.
5. Verify the matched `writeCanonicalRecord` call's first argument is syntactically the same expression as the adapter call's record argument, OR is an identifier whose value is assigned from a `writeCanonicalRecord` result.
6. If any call site lacks a valid predecessor, append to `bypassList`.

If the edge-canonical constraint is a concern for the test harness, a regex-based fallback is acceptable for v5; the audit is a test, not production code, and dev-dep parsers are conventional.

### 4.3 Runtime audit implementation sketch

Iterate the current StateAdapter's canonical record collection (if exposed) and run each record through the existing `validateCanonicalRecord` function from `dp2-schema.js`. Collect any failures.

If no adapter method exposes the canonical record collection, the runtime audit vacuously passes (no records scanned); flag the adapter API gap as a future enhancement but do not block v5 landing on it.

### 4.4 Vacuous-pass guard

The runtime audit MUST not report success when zero records are scanned AND the current session was expected to have produced records (e.g., a PROV-O run). Implementation hint: the harness treats `canonicalRecordsScanned === 0` as suspicious during integration tests and emits a warning to the test log; the scenario still passes but the warning surfaces the gap.

The static audit does NOT share this concern — zero call sites in early code is possible and non-suspicious. If zero call sites are detected in the final assembled pipeline, THAT is suspicious and indicates the audit is mis-targeting; flag at scenario-level.

### 4.5 Expected call sites (developer orientation)

Per the design sketch §3.2 and DP-2.2 landing (commit a224ce7), canonical record persistence sites include:

- `three-state-evaluator.js` terminal routes (Entailed / Plausible / Inconsistent)
- `inheritance-cascade.js` NA-1.1 provisional + NA-1.3 reconciliation paths
- `reactive-engine.js` NA-1.4 mutation-triggered re-evaluation
- NotApplicable routing (automatic / default_axiom_poor / manual)
- Analyst override path (Band 3)

The audit discovers actual sites; this enumeration is for orientation only. If the audit discovers sites outside this list, that's informative; if it misses sites in this list, the audit implementation has a gap.

---

## 5. Bookkeeping: v4 revision_history gap

The v4 bump (commit 6090770) changed `bundle_version: 3 → 4` without an entry in `revision_history` and without an explicit SME authorization record. The handoff memo NOT-TO-DO list required authorization; the gap is real but low-severity (the changes were assertion tightening, not scope additions, and were consistent with the DP-2.1 landing arc).

§3.3 of this memo backfills both the history entry and the retrospective authorization. Going forward:

1. Every bundle-version bump MUST land with a `revision_history` entry and an `sme_authorization` reference in the same commit.
2. Any future bump without SME authorization should be reverted or retroactively authorized via a targeted SME memo.
3. The developer's discipline of explicitly holding F4 pending authorization (2026-04-24) is the correct pattern; v4's skip is the deviation.

No remediation beyond the backfill is warranted.

---

## 6. Acceptance criteria

This authorization is consumed cleanly if the developer:

1. Applies the §3 patch exactly as specified (no extra scenarios, no assertion edits outside the F4 addition + v4 backfill).
2. Implements the audit harness per §4, running both static and runtime modes.
3. Runs the audit against current tree (post DP-2.2 a224ce7) and either:
   - Reports PASS, landing v5 with the F4 scenario green, OR
   - Reports FAIL with the bypass list, opening a targeted fix cycle before v5 lands. A failing audit on current code is a DP-2-I1 defect surfaced — exactly what F4 was designed to catch. Do not weaken the audit to force PASS.
4. Updates memory and, if applicable, runner context to reflect the 69-scenario count (replacing any lingering 68 references).

On acceptance, `dp2-locked-decisions.md` SME-DP2-F4 entry updates from "Resolved — promoted to required" to "Resolved and landed 2026-04-24 as v5 bundle scenario."

---

## 7. References

**Governing artifacts:**
- `specs/d16/dp2-scaffolding-design-sketch.md` §3.3 (original F4 scenario description; supersedes the F4 subset in this memo only where this memo is more specific)
- `specs/d16/dp2-locked-decisions.md` SME-DP2-F4 (promotion-to-required entry)
- `specs/d16/dp2-x2-config-allow-list-memo-v1.md` §5.3 (F4 audit reframing note)

**Bundle-file target:**
- `avc/fandaws-sentinel-d16-avc-bundle.json` (only copy in tree; prior speculation about a second copy in `specs/d16/` was incorrect)

**Code context:**
- `src/core/d16/canonical-record-writer.js` — pure-function writer; audit target
- `src/core/d16/dp2-schema.js` — `validateCanonicalRecord` for runtime audit
- `tests/avc/d16-runner.test.js` — existing AVC runner; new handler lands here
- Commit `6090770` — v4 bump (backfill target)
- Commit `a224ce7` — DP-2.2 landing (audit target)

**Rule and decision references:**
- Invariant DP-2-I1 (Schema Gate)
- Invariant DP-2-I2a (Shape-Level Content Validation)
- §7.1 D1.6 spec — Write-Path Chokepoint
- SME-DP2-P1 (explicit phase routing resolution)
- CLAUDE.md — core-module discipline ("JSON-LD in, JSON-LD out, no I/O")

---

## 8. Outstanding SME-owned items post-this-delivery

This memo closes one of the two SME items I flagged to Aaron in the preceding cycle. The remaining item is tracking:

- **Forward-flag items 2.1 and 2.2 assignment.** `bfo-signature-cache.js` runtime guards (test-only function stripping) and temporal-detection regex → axiom inspection shift. Neither was explicitly scoped to a DP-2 sub-wave. Ask the developer at next ACK whether DP-2.2's signature-cache extension absorbed them or they remain open; if open, assign to DP-2.3.1 or treat as Week 11 cleanup.

All other SME commitments in the DP-2 arc are resolved or reactive (OERS watch-item reception; F4 acceptance per §6).
