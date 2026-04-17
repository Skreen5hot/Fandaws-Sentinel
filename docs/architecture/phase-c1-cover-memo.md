# Phase C1 Implementation Handoff
**From:** FANDAWS Architect
**To:** FANDAWS Developer
**Date:** 2026-04-17
**Subject:** Compilation Lifecycle — Stale Detection, Confidence Tiers, Retraction Protocol

---

## What You're Receiving

Phase C1 is the internal machinery that makes the Phase B dual-lane architecture production-grade. Phase B gave us two lanes and a compiler. Phase C1 gives the compiler lifecycle awareness: it knows when artifacts are stale, when they should be rejected, when confidence warrants different materialization tiers, and when retraction should cascade.

1. **This cover memo**
2. **phase-c1-avc-bundle.json** — 26 scenarios
3. **phase-c-locked-decisions.md** — seven locked decisions (covers both C1 and C2)

---

## What's In Scope

| Component | What It Does |
|-----------|-------------|
| Stale detection | Canonical change → execution artifact marked Stale → recompiled |
| CompilerRejected | Pre-materialization check fails → structured feedback, no artifact |
| Confidence tiers | 4 tiers: Asserted (≥0.9), Flagged (0.7-0.9), Tentative (0.5-0.7), Not materialized (<0.5) |
| Retraction protocol | Tier boundary crossing → atomic retract + re-materialize + tombstone |
| Pre-mat checks 3-5 | BFO subcategory, confidence threshold, normalization status |
| Tentative flag | `fandaws:tentative: true` on low-confidence artifacts, excluded from default export |

## What's NOT In Scope (Phase C2)

Provenance authority enforcement, RECC restrictions in exports, quarantine store, relation type class schemas. These depend on C1's lifecycle machinery but are external-facing concerns.

---

## Key Decisions to Know

**Retraction cascades via sourceCanonical, not hierarchy (C-2).** Retracting "dog has fur" does NOT retract "mammal has hair." Each restriction has its own canonical record. Cascade follows `sourceCanonical` links only.

**Tier 1 bare properties carry NO RECC (C-6 clarified).** The verb "has" is semantically unresolved. No structural conformance check is applied. RECC activates only on Tier 2A resolved verbs.

**Confidence defaults (C-3):** Conversational assertions enter at 1.0. Released quarantine records enter at 0.7. This matters for the retraction scenarios — the developer needs a way to set confidence on canonical records for testing.

**TentativeGraph is a flag (C-4).** `fandaws:tentative: true` on the artifact. Not a separate data structure. Export option controls inclusion.

---

## Suggested Build Order

1. **Confidence field first.** Add `fandaws:confidence` to canonical restriction records. Default to 1.0 for conversational assertions. This is the foundation for tiers and retraction.

2. **Confidence tier routing in compile().** The compiler checks confidence and routes to the correct tier: Asserted, Flagged (with annotation), Tentative (with flag), or not materialized. Run `conf-*` scenarios.

3. **Stale detection.** When a canonical record changes, mark its execution artifact Stale before recompiling. Run `stale-*` scenarios.

4. **CompilerRejected.** Extend the pre-materialization check to set CompilerRejected with structured feedback when checks fail. Run `rejected-*` scenarios.

5. **Retraction protocol.** Detect tier boundary crossings on confidence updates. Retract prior artifact, create tombstone, re-materialize at new tier. Run `retract-*` scenarios.

6. **Pre-mat checks 3-5.** Add BFO subcategory check, confidence threshold check, normalization status check. Run `premat-*` scenarios.

7. **Export tentative filtering.** Add `includeTentative` export option. Run the two tentative export scenarios.

8. **Regression.** Run Phase B (27) + Phase C1 (26) + Phase 12 (25) + Phase 13 (24) = 102 scenarios. All green.

---

## New Runner Capabilities Needed

**`updateConfidence` trigger type.** Retraction scenarios need to change the confidence on an existing canonical restriction and observe the lifecycle transition. The runner must support this as a trigger.

**`injectCanonicalRecord` setup.** The `premat-check3-inheres-in-requires-quality` scenario needs a deliberately malformed canonical record (using `bfo:inheres_in` on a mereological restriction). The runner must support injecting specific canonical records beyond the standard utterance-based setup.

**`preCondition` setup.** The `stale-excluded-from-export` scenario needs a manually injected Stale artifact. The runner must support pre-conditions that set up specific states in the execution lane.

---

## What "Done" Means

```
Bundle: phase-12-avc-bundle.json (v2) — 25 passing
Bundle: phase-13-avc-bundle.json (v3) — 24 passing
Bundle: phase-b-avc-bundle.json  (v2) — 27 passing
Bundle: phase-c1-avc-bundle.json (v1) — 26 passing

Total AVC: 102 passing, 0 failing
```

Spot-check transcripts: `retract-cascade-via-source-canonical`, `conf-tentative-excluded-from-default-export`, and `rejected-does-not-delete-canonical`.

— FANDAWS Architect
