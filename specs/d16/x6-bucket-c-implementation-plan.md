# SME-D16-X6 — Bucket C Developer Implementation Plan (DRAFT)

**Status:** DRAFT v1 2026-04-25. Consumes `sme-d16-x6-bucket-c-memo-v1.md`. Pending PO pre-code confirmation per memo §9 step 6. **No code until confirmation.**
**Author:** Developer (Claude). Addresses memo §11 reserved doors: §6.2 L1/L2 choice, §7 per-NC reason enum design, §8.1 test coverage rubric, four-commit staging refinement. MENC2/ProcessNC3 contract refinements per §11 surfaced inline.

---

## 1. ACK summary

ACK on:
- Option C ratified; D1.6-L4 stands as written; X4 §5 divergence closes at landing.
- 6-NC scope (ICNC2, ICNC3, MENC2, IENC2, OccurrentNC2, ProcessNC3) with SME-drafted MENC2 + ProcessNC3 contracts at memo §4–§5.
- Step cap = 10,000; matches Phase D2 D-12.
- Tau Prolog session lifecycle = per-orchestrator-session.
- Re-triage at landing; bundle v6 authorization reactive on SWC > 0; X4 §5 divergence-closure attestation in reception memo.
- Deterministic-outcome-on-OWL-DERIVED for the 6 in-scope NCs (no `undetermined` routing under Option C); fallback annotation discipline (`fallbackUsed: true` + reason); throw on contract violation; assertion isolation.

One pushback (§2 below) on memo §6.2 L1/L2 choice with reasoning that aligns with X3 §3.9.1 PO routing precedent. Two contract-refinement candidates (§3 below) for SME implementation review.

---

## 2. §6.2 lifecycle integration — recommended choice

**Recommended: L2 (explicit-per-call) with caller-owned prologSession lifecycle.**

### 2.1 Reasoning

SME's L1 lean cited "session-state object holds prologSession alongside other session-scoped state" with X3 §3.9 as precedent. Two structural facts that surface in implementation review favor L2 instead:

- **The orchestrator currently has no session-state object.** `pipeline-orchestrator.js` lines 47–67 explicitly document why X3 §3.9.1 PO routing landed on **explicit-per-call adapter** rather than a session-state holder: "a session-scoped holder closure carries bound state (the adapter). Explicit per-call has zero hidden state. Since sessionId is already per-call via context, adapter-per-call is the consistency-with-existing-architecture choice." Introducing `initOrchestratorSession(adapter, sessionId, prologSession)` for prologSession alone would re-introduce the holder pattern PO explicitly routed against.
- **prologSession is "session-scoped state with non-trivial init cost"** (SME's L1 argument) — true, but the cost-amortization and the location-of-state are separable. The caller (CLI harness, future Workbench, or test harness) can own the prologSession variable and pass it explicitly into each orchestrator call. Init cost is paid once by the caller; the orchestrator stays stateless. This preserves CLAUDE.md's "no hidden state in core modules" discipline AND amortizes init cost across calls.

### 2.2 Concrete shape

```js
// Caller (e.g., CLI harness, Workbench host, test fixture)
import { initBucketCPrologSession, teardownPrologSession } from 'src/core/d16/bucket-c-prolog.js';

const prologSession = await initBucketCPrologSession({
  bfoSignatureReference: BFO_REF,
  stepCap: 10000,
});

// Per-CAU evaluation — orchestrator receives prologSession via inputs
for (const cau of caus) {
  await orchestrateThreeStateTerminal(cau.iri, {
    evaluatorInput: { ..., prologSession },  // explicit per-call
    explanationInput: ...,
    iterationState: ...,
    sessionState: ...,
  }, context, adapter);
}

teardownPrologSession(prologSession);
```

**Dispatcher signature extension** (one new optional field):

```js
// nc-dispatcher.js
evaluateNCSatisfaction({
  cauIRI, cauSignature, targetBFOCategory, bfoSignatureReference,
  ancestorChain,
  prologSession,  // new — required ONLY if any in-scope OWL-DERIVED NC is in required set; absent → unsatisfied/undetermined per current Bucket A behavior
})
```

`prologSession` absent for legacy callers (e.g., the synthetic-allowlist path) → OWL-DERIVED NCs continue to route `undetermined` per Bucket A precedent. This preserves backwards compatibility for the temporary-migration-support path on `pipeline-orchestrator.js:397`. New callers (post-X6 ingest harness) supply prologSession; OWL-DERIVED NCs route deterministically.

### 2.3 Architectural alignment

Under L2:
- Orchestrator stays stateless (CLAUDE.md compliance).
- prologSession init/teardown is caller's responsibility (explicit, observable).
- Per-call passing matches the X3 §3.9.1-routed adapter pattern (explicit per-call).
- The cost amortization SME named (init once, reuse across CAUs) is preserved — caller owns the lifecycle.
- Workbench v0.2 integration (downstream) would create prologSession at tab-init and pass it through; CLI harness creates at script-start.

### 2.4 Trade-offs vs L1

L2 cost: one extra parameter on `evaluateNCSatisfaction` and on the orchestrator's `evaluatorInput`. Minor.
L2 benefit: zero hidden state in orchestrator; consistent with adapter-explicit-per-call precedent; backwards-compatible with legacy callers; caller-owned lifecycle is testable in isolation.

If SME prefers L1 anyway (legitimate architectural judgment call), I'll implement L1. Surfacing this as the developer's L2 lean per §11 reserved doors.

---

## 3. Contract-refinement candidates (memo §11 reserved doors)

### 3.1 MENC2 §4.1 — `cau_consistent_with` shared definition

Memo §4.1 defines `cau_consistent_with` and §5.1 says "shares definition with §4." Suggest extracting the shared definition into a §3.4 (or new §3.5) "shared helper-predicate definitions" section so both contracts cite it once, rather than §4.1 owning the canonical definition with §5.1 referencing back. Cleaner organization at SME implementation-review time; non-substantive otherwise.

### 3.2 ProcessNC3 §5.1 negative-path interaction

The negative-path ZeroDim contradiction "must NOT contain" rule fires before the positive paths (per natural reading of the contract). Confirm at implementation review: should a CAU with BOTH `bfo:OneDimensionalTemporalRegion` AND `bfo:ZeroDimensionalTemporalRegion` restrictions route satisfied (positive path 1 fires) or unsatisfied (negative path contradicts)? Reading §5.1 strictly: negative path is conjunctive AND with the disjunctive positives, so presence of ZeroDim contradicts even if OneDim also present. This matches X5 OccurrentNC3 multi-inheritance contradiction-wins precedence (§5.4 cross-NC consistency note). Lock at implementation review.

Both refinements surface at implementation-plan ACK, NOT post-implementation, per §11 invitation.

---

## 4. Per-NC reason enum design (§7 reserved door)

Following `feedback_structured_failure_reasons.md`, each NC gets distinct reason values for each result path. Snake_case; `groundsNC` + `helperIRI` per Wave 2/X5 pattern; `fallbackUsed: boolean` + `fallbackTrigger: 'step_cap_exhausted' | null` annotation.

Reason values designed so DP-2 provenance (Weeks 9-11) can consume them as `contributionRole` values without retrofit.

### 4.1 ICNC2 — cau_does_not_require_inheres_in

| result | reason | path |
|---|---|---|
| true | `inheres_in_absence_derived` | Tau Prolog primary returned absence-derivable |
| true | `inheres_in_absence_structural_fallback` | Step cap exhausted; structural walk confirmed absence |
| false | `inheres_in_presence_derived` | Tau Prolog primary derived inheresIn presence |
| false | `inheres_in_presence_structural` | Structural walk found inheresIn restriction (pre-cap or post-fallback) |

### 4.2 ICNC3 — cau_does_not_require_concretizes (parallels ICNC2)

| result | reason |
|---|---|
| true | `concretizes_absence_derived` |
| true | `concretizes_absence_structural_fallback` |
| false | `concretizes_presence_derived` |
| false | `concretizes_presence_structural` |

### 4.3 MENC2 — cau_consistent_with_spatial_and_matter

Two-conjunct predicate; failure mode names which conjunct failed.

| result | reason |
|---|---|
| true | `spatial_and_matter_derived` (both conjuncts via Tau Prolog) |
| true | `spatial_and_matter_structural_fallback` (one or both via structural fallback) |
| false | `spatial_consistency_failed` (first conjunct failed) |
| false | `matter_constitution_failed` (second conjunct failed; first passed) |

### 4.4 IENC2 — cau_incompatible_with_matter_as_part

| result | reason |
|---|---|
| true | `matter_as_part_absence_derived` |
| true | `matter_as_part_absence_structural_fallback` |
| false | `matter_as_part_presence_derived` |
| false | `matter_as_part_presence_structural` |

### 4.5 OccurrentNC2 — cau_disjoint_with_continuant

| result | reason |
|---|---|
| true | `disjointness_derived` (Tau Prolog disjointness query succeeded) |
| true | `disjointness_structural_fallback` (no Continuant NC satisfaction at signature level) |
| false | `continuant_nc_satisfied` (one or more Continuant NCs satisfy → disjointness contradicted) |
| false | `disjointness_explicit_violation` (CAU declares both Continuant and Occurrent ancestor — modeling anomaly; reuses X5 multi-inheritance contradiction-wins precedence) |

### 4.6 ProcessNC3 — cau_consistent_with_one_dim_temporal

| result | reason |
|---|---|
| true | `one_dim_temporal_consistency_derived` |
| true | `one_dim_temporal_consistency_structural_fallback` |
| true | `process_ancestor_inherits_one_dim` (positive path 3 — Process ancestor in chain) |
| false | `zero_dim_contradiction` (negative path — ZeroDim restriction present) |
| false | `no_temporal_extension_evidence` (no positive path fires; non-Process Occurrent without temporal restrictions) |

### 4.7 Cross-NC enum-naming discipline

- `_derived` suffix → Tau Prolog primary path.
- `_structural` (positive path) or `_structural_fallback` (post-cap) suffix → structural-correspondence path.
- `_presence` vs `_absence` distinction for absence-based NCs (ICNC2/ICNC3/IENC2).
- Specific contradiction reasons (`zero_dim_contradiction`, `disjointness_explicit_violation`) for distinct failure modes — supports DP-2 provenance traceability without retrofit.

---

## 5. Test coverage rubric (§8.1 reserved door)

### 5.1 Per-NC unit tests — target ~20 each, range 18–25

Common pattern per NC (six NCs × ~20 = ~120 unit tests):

| Category | Target count | Scope |
|---|---|---|
| Tau Prolog primary positive | 3–4 | Direct derivation succeeds; varying ancestor depths + restriction shapes |
| Tau Prolog primary negative | 3–4 | Direct derivation finds presence/contradiction |
| Structural fallback positive | 2–3 | Force step-cap exhaustion via deeply-nested ancestor chain or recursive disjointness; assert structural rule confirms |
| Structural fallback negative | 2–3 | Same forcing pattern; assert structural rule denies |
| Per-NC edge cases | 4–6 | NC-specific (e.g., MENC2 matter-constitution-via-MaterialEntity-ancestor; ProcessNC3 ZeroDim contradiction) |
| Reason enum coverage | 4–6 | Each enum value exercised by at least one test; enum-coverage assertion in suite footer |
| Throw tests | 1–2 | Missing prologSession; malformed BFO axioms; predicate undefined → DispatcherContractViolationError |

### 5.2 Cross-cutting integration tests

Per memo §8.1:

1. **Tau Prolog session integration** (1 suite) — session init at orchestrator start; assertion isolation across CAUs in session; teardown at session end. Verify `retractall/1` (or session-fork equivalent) removes per-CAU assertions before next CAU evaluates.
2. **Step-cap fallback integration** (1 suite) — synthetically force step-cap exhaustion; assert fallback fires with `fallbackUsed: true` + `fallbackTrigger: 'step_cap_exhausted'`; assert deterministic result.
3. **Cross-NC interaction** (1 suite) — Process-target CAU exercises ProcessNC1/2/4 (Bucket A/B) + ProcessNC3 (Bucket C); full required-NC set determinable; cascade through Occurrent NCs (OccurrentNC1/2/3) where NC2 now resolves via Bucket C.
4. **OWA preservation** (1 suite) — CAU declared `rdfs:subClassOf bfo:MaterialEntity` with no literal inheresIn restriction; Tau Prolog primary derives inheresIn presence (since MaterialEntity inherits non-inherence); ICNC2 satisfied (absence derived). Same CAU under Option B (structural-only) would have falsely satisfied ICNC2 via raw absence — Option C distinguishes.
5. **AVC re-triage harness** (1 suite) — runner over `x4-avc-triage.md` scenarios with post-Bucket-C dispatcher; classifies deltas; emits SWC count.
6. **70 AVC regression** — existing harness; no Phase 1 regression.

### 5.3 Estimated test totals

| Category | Tests |
|---|---|
| Per-NC unit tests (6 × 20) | 120 |
| Tau Prolog session integration | 6 |
| Step-cap fallback integration | 5 |
| Cross-NC interaction | 4 |
| OWA preservation | 4 |
| AVC re-triage harness | 1 (with N scenarios per re-triage) |
| 70 AVC regression | 70 (existing) |
| **Total new tests** | **~140** |

Total project test count post-Bucket-C: ~2,665 (current) + ~140 (new) = ~2,805. New test suites: ~7–9 (six per-NC suites + cross-cutting integration suites).

### 5.4 Coverage acceptance criteria

- Every `reason` enum value appears in at least one passing assertion.
- Every NC has at least one Tau Prolog primary positive AND at least one structural fallback positive — both paths exercised.
- Every NC has at least one throw test — contract-violation discipline verified.
- Cross-NC interaction suite asserts `fallbackUsed: true` annotations propagate from helper to dispatcher to evaluator's evidence record.

---

## 6. Four-commit staging — refinements to memo §9

Memo §9 step 7 suggests:
- Commit 1: Tau Prolog session lifecycle + helper predicates + 4 contract-drafted NCs.
- Commit 2: MENC2 + ProcessNC3.
- Commit 3: Step-cap-fallback + assertion-isolation hardening + cross-NC tests.
- Commit 4: AVC re-triage + bundle v6 (if SWC > 0) + reception memo + X4 §5 closure.

**Developer refinement:** swap Commits 1 and 3 partially — land the step-cap-fallback infrastructure in Commit 1, BEFORE the 4 NC implementations, because (a) all 4 contract-drafted NCs invoke fallback by name (`structural_correspondence_fallback`); without infrastructure they're stubs; (b) testing each NC's fallback path requires the infrastructure already in place. Refined staging:

- **Commit 1:** Tau Prolog session lifecycle (init/teardown/per-call dispatch) + helper predicates (`owa_absence_check/3`, `owa_absence_check_property/2`, `owa_disjointness_check/2`, `cau_consistent_with/3`) + step-cap-fallback infrastructure + assertion-isolation. **No NC implementations yet.** Substantial integration test for session lifecycle.
- **Commit 2:** Four contract-drafted NCs (ICNC2, ICNC3, IENC2, OccurrentNC2) + per-NC unit tests + reason enums.
- **Commit 3:** MENC2 + ProcessNC3 implementations per memo §4–§5 contracts (with §3.1/§3.2 refinements locked at SME implementation review) + per-NC unit tests + cross-NC interaction tests.
- **Commit 4:** AVC re-triage + reception memo update + X4 §5 closure attestation; bundle v6 authorization memo (SME-owned) drafted reactive to SWC count surfaced in this commit.

Commit 1 becomes meatier (session lifecycle + helper predicates + fallback infra together) but Commits 2 and 3 land NCs against a fully-functional substrate; no Commit-2 NC testing blocked on Commit-3 infra.

**SME judgment welcome** on the 1↔3 swap; either staging works.

---

## 7. Open questions for PO + SME

1. **L1 vs L2 for prologSession** (§2 above) — developer leans L2 with X3 §3.9.1 alignment reasoning; SME's L1 lean is legitimate; PO + SME ruling needed.
2. **MENC2 §4.1 + ProcessNC3 §5.1 contract refinements** (§3.1 + §3.2) — both surface inline; lock at implementation-review or accept current state.
3. **Four-commit staging refinement** (§6) — developer refinement vs SME's original staging.
4. **prologSession absence semantics** (§2.2) — confirm legacy-caller path (no prologSession) routes OWL-DERIVED → undetermined preserves Bucket A behavior. Critical for backwards compatibility on `pipeline-orchestrator.js:397` migration-support path.
5. **Bucket C scope expansion** (out-of-scope per memo §0; surfacing for record): are there OWL-DERIVED NCs beyond the 6 in-scope that should be considered in v1.1+? (e.g., currently the signatures file has only these 6; future spec evolution may add more.)

---

## 8. Outstanding queue

- **PO:** review this implementation plan; rule on §7 open questions; pre-code confirmation per memo §9 step 6.
- **SME:** reactive — co-rule on §7 q1 + q2 + q3; comment on §4–§5 reason enums; confirm §5.1 test coverage rubric proportions; bundle v6 authorization memo deferred until Commit 4 SWC delivery.
- **Developer:** idle pending PO pre-code confirmation; ready for Commit 1 (session lifecycle + helper predicates + fallback infra) on green light.

---

## 9. References

- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` — SME scoping memo with locked decisions + SME contract drafts.
- `specs/d16/x6-bucket-c-scoping-pre-proposal.md` — developer pre-proposal that triggered the deliberation.
- `specs/d16/sme-d16-x3-pipeline-orchestrator-memo-v2.md` §3.9 + §3.9.1 — adapter session-state vs explicit-per-call routing precedent grounding §2 L2 lean.
- `src/core/d16/pipeline-orchestrator.js` lines 47–67 — explicit-per-call adapter discipline documentation.
- `feedback_structured_failure_reasons.md` — reason enum design grounding §4.
- `feedback_throw_not_warn_enforcement.md` — DispatcherContractViolationError discipline grounding §5.1 throw tests + §7 q4.
- `feedback_absence_not_evidence.md` — OWA preservation rationale grounding §5.2 OWA preservation suite.
- `project_d16_x5_bucket_b_closeout.md` — Bucket B → Bucket C residual blocker shift; sibling staging precedent.
- `project_d16_bucket_c_deliberation_lock.md` — six-position deliberation lock 2026-04-25 grounding §1 ACK.
