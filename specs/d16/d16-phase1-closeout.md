# D1.6 Phase 1 Closeout

**Status:** COMPLETE 2026-04-24.
**Final gate:** `provo-end-to-end-acceptance` (Band 8) passing.
**Arc duration:** 2026-04-18 (spec v1.1.0 lock) → 2026-04-24 (Phase 1 complete).
**Analog:** Wave 2 closeout pattern, scaled to full-phase scope.

---

## 1. Final test status

- **D1.6 AVC scenarios: 70 / 70 passing (100%).** Zero skipped.
- **Full repo: 115 suites / 2,538 passing / 11 skipped.** The 11 skipped are pre-D1.6 unimplemented-feature markers unrelated to Phase 1 work.
- **Zero regressions** introduced across the DP-2 commit arc (d1.6 baseline → DP-2.1 → 2.2 → 2.3.0 → 2.3.1 → 2.3.2 → Band 8).

## 2. Wave + sub-phase completion

| Wave / Sub-phase | Scope | Status |
|---|---|---|
| Wave 0 | 3 baseline CRITICAL helpers | Complete, SME-validated |
| Wave 1 | 4 composition helpers | Complete, SME-validated |
| Wave 2 | 3 axiom-pattern helpers (SDCNC3, GDCNC3, QualityNC3) | Complete 2026-04-22, SME-validated |
| Wave 3 | RoleNC5 | **Deferred to v1.1+** by design |
| DP-2.1 | Write-path chokepoint + I1 + I2a + scaffold emitters | Landed 2026-04-23 |
| DP-2.2 | Explanation/provenance builders + axiomDictionary + DependencyGraph + I4 | Landed 2026-04-24 |
| DP-2.3.0 | Byte-capture retrofit (crypto-shim + ingestion-byte-registry) | Landed 2026-04-24 |
| DP-2.3.1 | Per-round hash + session-hash registry + V3/V4/V5 | Landed 2026-04-24 |
| DP-2.3.2 | Final Hash pipeline + I2b + I3 + session config snapshot | Landed 2026-04-24 |
| F4 bundle v5 | `dp2-writepath-chokepoint-exclusivity` audit scenario | Landed 2026-04-24 |
| Band 8 | `provo-end-to-end-acceptance` terminal gate | Landed 2026-04-24 |

**10 of 11 SME-LOCKED items integration-path-complete.** Only RoleNC5 (v1.1+) remains out of scope.

## 3. DP-2 named invariants — all 5 active

| Invariant | Rule | Active since |
|---|---|---|
| DP-2-I1 (Schema Gate) | Missing any of `{explanation, provenance, reproducibilityHash}` → non-conformant | DP-2.1 |
| DP-2-I2a (Shape-Level Content) | axiomEvidence non-empty (NotApplicable single-element floor); iterationHistory non-empty; hash syntactically well-formed; `validationState` not terminal-`provisional` (F3) | DP-2.1 |
| DP-2-I2b (Hash-Value Correctness) | Hash bytes are correct output of §7.4 deterministic computation; `_scaffold` sentinel is interim bypass | DP-2.3.2 |
| DP-2-I3 (Deterministic Hash) | Identical inputs → identical Final Hash across sessions | DP-2.3.2 |
| DP-2-I4 (Dictionary Discipline) | Records reference shared axioms by dictionary ID only; inlining fails content validation | DP-2.2 |

## 4. SME-resolved items

| ID | Origin | Resolution |
|---|---|---|
| SME-DP2-P1 | Scaffold routing pushback | Explicit `context.phase` — landed DP-2.1 |
| SME-DP2-P2 | I2 split | I2a/I2b split across DP-2.1 and DP-2.3.2 |
| SME-DP2-F1 | Causal linkage | `causedBy` immediate-predecessor — landed DP-2.3.1 |
| SME-DP2-F2 | Plausible schema check | Verified clean (spec §4.3:323-375 has no ranking field) |
| SME-DP2-F3 | validationState terminal semantics | I2a rejects terminal-`provisional` per NA Commitment 2 |
| SME-DP2-F4 | Audit scenario promotion | Bundle v5 `dp2-writepath-chokepoint-exclusivity` — landed DP-2.3.2 |
| SME-DP2-X1 | Property-linked neighbor memo | Delivered REV1 2026-04-23; DP-2.2 consumption |
| SME-DP2-X2 | Config allow-list | Delivered 2026-04-24; DP-2.3.2 consumption |

## 5. Verification calibration log

Every claimed deliverable was SME-review-verified pre-lock OR caught pre-landing via test feedback. Genuine deliverable gaps caught by review cycles (honest-admission pattern):

- **V3 (DP-2.2 review):** causedBy JSDoc was ambiguous; immediate-predecessor semantic confirmed by SME in DP-2.2 review; fixed in DP-2.3.1.
- **V4 (DP-2.2 review):** `applyMutationSequence` must-compute fields remained canned-`true` despite sketch §4.2 claim of landing. Caught by SME V4 review. Scoped by SME (terminal set includes IterationNonConvergence); implementation landed DP-2.3.1 with field-split resolution (analyst-primary `dispositionSet` 4-element vs. convergence-accounting `terminalDispositionSet` 5-element).
- **V5 (DP-2.2 review):** OERS fail-fast threw on first pair only. SME flagged §4.9 reserved-door implications. Enhanced to accumulate-all-before-throw with per-pair source ontology, landed DP-2.3.1.
- **Forward-Flag Item 2 (DP-2.2 review):** Session-hash registry claimed to land in DP-2.2 but didn't. SME caught. Landed DP-2.3.1.
- **Bundle v5 memo §3.1 count mismatch (DP-2.3.2 landing):** Memo said `68 → 69` based on stale total_scenarios meta-field; actual was 69 → 70. Corrected in v5 commit and noted in revision_history.

Calibration learning: scope absorption claims in design sketches outrun code by default; review cycles are the correcting pressure. Honest disclosure at review time is load-bearing discipline — the alternative is downstream surprise at integration time.

## 6. Open gaps flagged for future work (outside D1.6 Phase 1 scope)

These surfaced during Phase 1 and are now tracked; none block Phase 1 completion.

- **Site-family-to-funnel integration.** `record-persistence.js` funnel exists but `three-state-evaluator.js` terminals, `inheritance-cascade.js` NA-1.1/NA-1.3 paths, `reactive-engine.js` NA-1.4 path, NotApplicable routing, and analyst override don't yet route through the chokepoint. F4 audit currently passes vacuously-plus-one (1 call site = the funnel definition itself). Real integration pipeline wiring is post-Phase-1 work, tracked for D1.6 v1.1 or D1.7.
- **bfo-signature-cache hardening items 1 + 2** (from `project_d16_week9_11_backlog.md`): `seedCache`/`resetForTests` runtime guards + temporal-detection regex → axiom inspection. Both flagged opportunistic, not load-bearing. Item 3 (session-hash registry) landed DP-2.3.1.
- **Workbench v0.2 Phase 1/Phase 2 Review panel adaptations** per D1.6 §9.3. Workbench-side work; separate track.
- **RoleNC5 axiom-pattern helper.** Deferred to v1.1+ by design (Wave 3).
- **D2.1 Phase 2 rearchitecture.** Deferred per D1.6 spec §0.5.

## 7. PROV-O Pass 2 readiness

D1.6 Phase 1 was architected specifically to enable the PROV-O Pass 2 calibration study. The terminal gate `provo-end-to-end-acceptance` is the attestation: every PROV-O CAU output record carries DP-2-conformant explanation/provenance/reproducibilityHash; hashes stable under re-run.

**Pass 2 prerequisites that Phase 1 closes:**

- DP-2 epistemic-system invariant (explanation/provenance/reproducibilityHash) — ✓
- Deterministic Final Hash under identical inputs — ✓
- Axiom dictionary deduplication per DP-2-R5 — ✓
- Cross-session reproducibility (§7.4 canonical input list) — ✓
- Three-state evidence model (Entailed/Plausible/Inconsistent/NotApplicable) — ✓
- DP-1 soft-gate diagnostic with `compatibilityDegraded` sticky flag — ✓
- NA-1.1 through NA-1.4 taxonomic-descent + reactive engine — ✓

**Pass 2 prerequisites that remain pre-Pass-2 work (not Phase 1 scope):**

- Live integration pipeline wiring (site-family-to-funnel, see §6)
- Workbench v0.2 Ingest mode Phase 1/2 panel adaptations
- Real PROV-O ontology ingested through the live pipeline (vs. synthetic 30-CAU Band 8 envelope)

Phase 1 produces the attestation layer. Pass 2 consumes it. The `provo-reception-synthetic-band8.md` companion memo captures what the synthetic envelope surfaced — useful as a calibration baseline against which the live Pass 2 run will be compared.

## 8. Implementation summary

**16 new modules** across `src/core/d16/` under the DP-2 arc:
- `canonical-record-writer.js` — chokepoint + scaffold emitters + DP2NonConformanceError
- `dp2-schema.js` — hand-rolled I1 + I2a validator
- `axiom-dictionary.js` — session-scoped content-hash-keyed deduplication
- `canonical-serialization.js` — RFC 8785 JCS (shared by DP-2.2 + DP-2.3 per D2.1-D3.1 paired lock)
- `dependency-graph.js` — property-linked neighbor per X1 memo
- `explanation-builder.js` — per-disposition production emitters
- `provenance-builder.js` — §7.3 shape + `buildReconciliationEntry` with F1 `causedBy`
- `crypto-shim.js` — Web Crypto + node:crypto SHA-256 shim
- `ingestion-byte-registry.js` — DP-2.3.0 byte capture
- `reproducibility-hash.js` — per-round + Final Hash + finalization
- `session-config-snapshot.js` — X2 allow-list immutable snapshot
- `record-persistence.js` — chokepoint + adapter persist composition

Plus modifications to `bfo-signature-cache.js` (session-hash registry extension per Forward-Flag Item 2) and `reactive-engine.js` (V4 must-compute fields).

**New AVC scenarios in v5:** `dp2-writepath-chokepoint-exclusivity` (bundle grew 69 → 70).

**DP-2 handlers added to AVC runner:** `attemptCanonicalWrite`, `attemptCanonicalWrites`, `verifyDP2Conformance`, `verifyIterationHistory`, `inspectProvenanceStorage`, `retrieveReproducibilityHash`, `compareFinalHashes`, `auditWritePathChokepoint`, `runFullPhase1Through3`, `retrieveCanonicalRecord`, `analystOverrideCAU`.

## 9. Commits

| Commit | Scope |
|---|---|
| `6090770` | D1.6 Phase 1 (Waves 0/1/2) + DP-2.1 write-path chokepoint |
| `58ce5f4` | DP-2.3.0 byte-capture retrofit per SME D3.2 lock |
| `a224ce7` | DP-2.2: explanation + provenance builders + DependencyGraph |
| `1636ae2` | DP-2.3.1: per-round hash + session-hash registry + V3/V4/V5 + bundle v5 memo |
| `36755a1` | DP-2.3.2 + F4 bundle v5: Final Hash + I2b activation + chokepoint audit |
| (pending) | Band 8 PROV-O acceptance + closeout artifacts |

## 10. Final ack window

This closeout is ACK-able on SME inspection of:

1. `avc/fandaws-sentinel-d16-avc-bundle.json` — 70/70 scenarios, bundle v5, revision_history backfilled.
2. `specs/d16/dp2-locked-decisions.md` — 10 decisions locked, all SME items resolved.
3. Full test run confirming 70/70 D1.6 AVC + zero regressions.

On ACK, D1.6 Phase 1 status transitions from In Progress → Complete in ROADMAP.md and the DP-2 design-review-cycle memory entry closes.
