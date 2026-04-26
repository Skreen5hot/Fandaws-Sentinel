# SME-D16-X4 — NC Inference Integration (Bucket A)

**Status:** **LOCKED v1 + ARC COMPLETE 2026-04-24.** Four-commit arc delivered: 5c1c06c (dispatcher module + P1/P2/P5 matchers + cycle-safety + contract-violation enforcement) → 907e752 (P3 + P4 matchers + operationalization commentary) → ee6c44b (evaluateCAU trichotomy + orchestrator seam + lint refinements) → 4e119a2 (triage artifact + empty bundle v6 + deferred scenario migration + TEMPORARY MIGRATION SUPPORT marker). Key arc findings: (1) BCL as fifth triage category — extended §7.1 rubric below; (2) empty bundle v6 as honest discipline — amending ahead of coverage codifies partial state as permanent; (3) deferred scenario migration preserves calibration value — forcing signature-driven inputs under partial coverage produces artifacts, not signal. Full repo: 120 suites / 2,627 passing / 11 skipped / zero regressions. 70/70 D1.6 AVC preserved via legacy path for scenarios whose premises require Bucket-B coverage.
**Owner:** SME (scope locked by PO routing 2026-04-24: P2 Bucket A only, T1 Tau Prolog deferred).
**Consumes:** developer pre-proposal 2026-04-24 (infrastructure audit + gap enumeration + scope estimate); PO routing 2026-04-24; `Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md` D1.6-L4 + L9; `specs/d16/bfo-signatures-v1.0.json` NC catalog (55 NCs across 13 BFO categories); existing Wave 0/1/2 helpers in `src/core/d16/critical-nc-helpers.js`.
**Consumed by:** developer implementation cycle for `src/core/d16/nc-dispatcher.js` + OWL-DIRECT structural matcher; SME-D16-X3 Commit 4 integration test updating to real-inference dispositions; future Tau Prolog deliberation cycle (scheduled, not scoped).
**Scope fence:** Bucket A only per PO P2 routing. Bucket B (8 missing CURATED-NC helpers) and Bucket C (6 OWL-DERIVED NCs) are explicitly queued, not killed (see §6). Tau Prolog integration is explicitly deferred per PO T1 routing with obligation to schedule separate deliberation (see §5).

**Tag legend** (same as SME-D16-X3 v2):
- **LOCKED-FROM-PRINCIPLE**
- **SME-PROPOSED — PENDING-DEVELOPER-ACK**
- **OPEN**

---

## Load-bearing context (before executive summary)

This memo documents the seam where D1.6's reasoning core becomes non-hollow.

The developer audit surfaced that **the 70 AVC scenarios passing baseline — and by extension all post-Phase-1 validation including SME-D16-X3 Commit 4's live-pipeline integration test — rests on synthetic NC-satisfaction allowlists hard-coded per scenario.** The infrastructure that DP-2, X3, and the Phase 1 closeout have been hardening is real and necessary, but it has been hardening around a reasoning core that is not actually producing satisfiedNCs from axioms. `evaluateCAU` takes satisfiedNCs as a pre-computed Set from the caller; the caller says "pretend these NCs are satisfied"; the pipeline routes the disposition; the record persists; the hash stabilizes.

Until X4 Bucket A lands, **the system is not reasoning end-to-end.** Bucket A changes that qualitatively. Everything else — coverage expansion (Bucket B, Bucket C, RoleNC5, additional NC helpers), spec-compliance (Tau Prolog integration), calibration studies (PROV-O Pass 2, broader ontologies) — is secondary to this qualitative shift.

This framing is load-bearing in the memo body, not background. The developer's §1.4 disclosure is the audit's most important finding; it reframes the priority order for every subsequent cycle.

---

## Executive summary

**What this memo locks** (LOCKED-FROM-PRINCIPLE):

- New module `src/core/d16/nc-dispatcher.js` per developer §2.2.
- Dispatcher API: takes `(cauSignature, targetBFOCategory)` → returns `satisfiedNCs` Set per D1.6-L9 strict policy.
- OWL-DIRECT structural matcher for the 27 NCs tagged `OWL-DIRECT` in `bfo-signatures-v1.0.json`.
- Dispatcher integrates with existing Wave 0/1/2 helpers (10 helpers covering 10 of 17 CURATED-NC predicates).
- Dispatcher peers with `routeRealizableCAUViaCuratedLists` — router is not replaced; dispatcher calls router when realizable-entity ambiguity is relevant.
- CURATED-HEURISTIC NCs excluded from Entailment evaluation; preserved for Plausible annotations per strict-policy lock.
- Acceptance criteria: per-scenario AVC triage, NOT pre-committed 70/70 preservation. Disposition shifts are correction-of-scaffold-expectations, not regression.
- **§5 temporary divergence from D1.6-L4** (Tau Prolog deferred, not rejected). Obligation to schedule separate deliberation cycle post-X4 landing.

**What this memo flags for developer ACK + implementation plan** (4 SME-PROPOSED items):

- §3.2 OWL-DIRECT pattern-shape enumeration — developer identifies the 4–6 recurring pattern shapes during implementation design; SME reviews consolidated rather than per-pattern per PO runway guidance.
- §4.1 Dispatcher ↔ `evaluateCAU` integration point — where the dispatcher wires into `three-state-evaluator.js`.
- §7.3 AVC triage rubric — developer proposes, SME reviews per-scenario when X4 lands and synthetic expectations diverge from real inference.
- §2.1 Dispatcher return shape — satisfied/unsatisfied/undetermined trichotomy vs. satisfied-only Set. Confirm during implementation plan.

**What is explicitly OUT** (§6 enumeration):

- Bucket B (8 missing CURATED-NC helpers including ContinuantNC3, OccurrentNC3, ProcessNC4, SiteNC3×2, ProcessBoundaryNC3×2, TemporalRegionNC3×2) — queued for v1.1+ or post-X4 cycle.
- Bucket C (6 OWL-DERIVED NCs requiring inference over subsumption / restriction composition) — queued.
- RoleNC5 — deferred v1.1+ per Wave 3 disposition.
- Tau Prolog integration — separate deliberation cycle per T1 routing.
- Broader ontology calibration — pre-X4 reality is PROV-O alone; broader calibration post-X4 Bucket A landing.

**Next action:** developer ACK of §2–§7 + implementation plan. PO pre-code confirmation. Then Bucket A coding proceeds.

---

## 1. Problem statement

D1.6-L9 locks: *"Entailment criterion: necessary-condition satisfaction against curated BFO Signature reference. NOT heuristically inferred."* Per the developer's §1.3 finding, `evaluateCAU` consumes a pre-computed `satisfiedNCs` map supplied by the caller. The BFO Signature reference (`bfo-signatures-v1.0.json`) exists with 55 NCs across 13 BFO categories. The evaluation seam between signature and NC satisfaction does not.

Per D1.6-L9's strict policy, producing `satisfiedNCs` from a signature requires structural pattern matching against each NC's `body_draft` predicate (for CURATED-NC) or against the NC's declared structural shape (for OWL-DIRECT / OWL-DERIVED). This matching must be deterministic and edge-canonical per CLAUDE.md core-module discipline.

**The integration gap:** ten Wave 0/1/2 helpers exist for 10 of 17 CURATED-NC predicates. No dispatcher routes a CAU signature to applicable NC evaluators. No OWL-DIRECT structural matcher exists for the 27 NCs tagged OWL-DIRECT. No integration wires real `satisfiedNCs` computation into the reasoning path.

**Bucket A closes this gap for OWL-DIRECT NCs and existing Wave 0/1/2 CURATED-NC helpers.** Under-covered categories (Site, ProcessBoundary, TemporalRegion, and the 8 uncovered CURATED-NC predicates) produce honest Plausible / NotApplicable signal because they lack real-inference inputs — that is the correct behavior, not a defect. Per PO routing, covering them is Bucket B scope (queued).

---

## 2. Dispatcher module

### 2.1 Module surface

**LOCKED-FROM-PRINCIPLE.** New module at `src/core/d16/nc-dispatcher.js`. Edge-canonical, pure function, no I/O, no adapter dependency per CLAUDE.md core-module discipline.

**Primary API (SME-PROPOSED — PENDING-DEVELOPER-ACK on exact shape):**

```
evaluateNCSatisfaction(cauSignature, targetBFOCategory, bfoSignatureReference)
  → { satisfied: Set<NC_IRI>, unsatisfied: Set<NC_IRI>, undetermined: Set<NC_IRI> }
```

Trichotomy rationale: D1.6-L9 requires NC satisfaction produced from real inputs; some NCs under Bucket A will be *undetermined* because their predicate requires a helper that doesn't exist yet (Bucket B scope) or because OWL-DIRECT matching cannot resolve (e.g., required axiom absent). `undetermined` is not the same as `unsatisfied` — downstream three-state-evaluator must treat them differently (undetermined → Plausible routing per D1.6-L10; unsatisfied → Inconsistent or Plausible per disjointness).

Alternative: satisfied-only Set (as the current stub). Simpler but conflates "explicitly not satisfied" with "cannot determine." Developer judgment on whether trichotomy is worth the complexity; SME lean is trichotomy because it preserves the absence-not-evidence principle.

### 2.2 Dispatcher vs. realizable-cascade-router — peers, not replacement

**LOCKED-FROM-PRINCIPLE.** `routeRealizableCAUViaCuratedLists` (existing in `critical-nc-helpers.js`) resolves Function/Role/Disposition ambiguity when a CAU could be any of the three realizable-entity categories. The dispatcher is general — takes any target BFO category and produces NC satisfaction results.

Relationship: when the dispatcher evaluates a realizable-entity candidate and ambiguity is relevant, the dispatcher INVOKES `routeRealizableCAUViaCuratedLists`. The router's output informs which set of Function/Role/Disposition NCs to evaluate. The router is not subsumed into the dispatcher; it remains a discrete helper with its own scope.

**Do not consolidate.** Merging the router into the dispatcher would conflate "which category does this CAU belong to" (router's job) with "given this category, what NCs are satisfied" (dispatcher's job). The two semantics stay separate.

### 2.3 CURATED-HEURISTIC exclusion

**LOCKED-FROM-PRINCIPLE.** Dispatcher skips CURATED-HEURISTIC NCs for Entailment evaluation per strict-policy lock (SME async cycle 1 ruling). CURATED-HEURISTIC NCs are preserved in dispatcher output as Plausible-annotation inputs only.

Implementation expectation: the dispatcher reads the NC's `tag` field from `bfo-signatures-v1.0.json` and branches accordingly:
- `OWL-DIRECT` → structural matcher (§3)
- `OWL-DERIVED` → deferred to Bucket C; returns `undetermined`
- `CURATED-NC` with existing helper → invoke Wave 0/1/2 helper (§4)
- `CURATED-NC` without existing helper → deferred to Bucket B; returns `undetermined`
- `CURATED-HEURISTIC` → excluded from Entailment path; separately available for Plausible annotation

---

## 3. OWL-DIRECT structural matcher

### 3.1 Scope

**LOCKED-FROM-PRINCIPLE.** The matcher evaluates the 27 NCs tagged `OWL-DIRECT` in `bfo-signatures-v1.0.json`. OWL-DIRECT means the NC's satisfaction is determinable directly from the CAU's extracted signature axioms without multi-hop inference — equivalent to D1.6-L4's "structural correspondence" path that is the explicit fallback and (per T1 routing) the X4 primary mechanism.

### 3.2 Pattern shapes

**SME-PROPOSED — PENDING-DEVELOPER-ACK (developer identifies during implementation design).** Per developer §2.3 audit: "likely drawing from ~4-6 recurring pattern shapes." Expected shapes (developer verifies + refines):

- Existential restriction on a named property (`owl:someValuesFrom` with specific target class).
- Cardinality constraint (`owl:minCardinality`, `owl:maxCardinality`, `owl:cardinality`).
- Disjointness assertion (`owl:disjointWith`).
- Subclass assertion in ancestor chain (`rdfs:subClassOf` with transitivity).
- Property characteristics (`owl:TransitiveProperty`, `owl:FunctionalProperty`, etc.).
- hasValue / owl:oneOf enumeration membership.

**Consolidated review cadence per PO runway guidance:** rather than per-pattern SME review cycles, the developer produces all pattern-shape implementations and then SME reviews them in one consolidated pass. This is the only Wave-style engagement Bucket A requires.

### 3.3 Acceptance posture

**LOCKED-FROM-PRINCIPLE.** For each OWL-DIRECT NC, the matcher must:

- Match or fail deterministically — no pattern matcher returns `undetermined` for an OWL-DIRECT NC. If the matcher cannot decide, that's a pattern-shape coverage gap to be surfaced as a test-defect, not swallowed as `undetermined`.
- Produce a structured trace of which axioms from the CAU signature matched the pattern (for Plausible evidence annotations and for debuggability).
- Be pure-function edge-canonical per CLAUDE.md.

The matcher is the load-bearing new code of Bucket A. It is small-but-precise work; correctness matters more than coverage expansion.

---

## 4. Wave 0/1/2 helper integration

### 4.1 Routing to existing helpers

**LOCKED-FROM-PRINCIPLE.** The dispatcher consumes the 10 existing helpers in `critical-nc-helpers.js` for the 10 CURATED-NC predicates they ground. Per developer §1.2 audit:

| Helper | Grounds NC(s) |
|---|---|
| `cauRealizationRequiresSocialInstitutionalContext` | RoleNC3 (+ DispositionNC4 via negation) |
| `cauHasTeleologicalCommitment` | FunctionNC3 (+ RoleNC4 via negation) |
| `cauRealizationHasTriggeringCircumstances` | DispositionNC3 (+ QualityNC3 via negation) |
| `cauBearerIsParticularNotGeneric` | SDCNC3 |
| `cauAdmitsMultipleSimultaneousConcretizations` | GDCNC3 |
| `cauAlwaysRealizedWhenBearerExists` | QualityNC3 |
| `cauDoesNotHaveTeleologicalCommitment` | RoleNC4 (explicit) |
| `cauDoesNotRequireSocialInstitutionalContext` | DispositionNC4 (explicit) |
| `cauDispositionDisjunctive` | DispositionNC5 |
| `cauRealizationIsDesignExpected` | FunctionNC4 |

Dispatcher reads `bfo-signatures-v1.0.json`, identifies the NC's predicate name from `body_draft`, maps the predicate to the helper via a name-to-helper registry in the dispatcher module, invokes the helper with the CAU signature + evidence callback, and converts the helper's `{result, reason, evidence}` return to dispatcher trichotomy (satisfied if `result: true`; unsatisfied if `result: false`; undetermined never for helpers that already exist).

### 4.2 Transparent callback forwarding

**LOCKED-FROM-PRINCIPLE.** Per `feedback_transparent_callback_forwarding.md`, the dispatcher forwards caller-provided evidence callbacks to inner helpers unchanged. No wrapping, no substitution, no default injection.

### 4.3 Structured failure reasons preservation

**LOCKED-FROM-PRINCIPLE.** Per `feedback_structured_failure_reasons.md`, the dispatcher preserves helper-returned `reason` enums in its output. Downstream DP-2 provenance consumes reason strings as `contributionRole` values. The dispatcher does not collapse `reason` into a single generic "not satisfied" — per-predicate reasons flow through.

---

## 5. Temporary divergence from D1.6-L4 — Tau Prolog deferred

### 5.1 Divergence declaration

**LOCKED per PO T1 routing 2026-04-24.** D1.6-L4 locks: *"Signature comparison uses type-level Tau Prolog pattern entailment under background theory... Fallback to structural correspondence at query granularity when 10K step cap exceeded."*

X4 Bucket A implements **structural-correspondence-only** for NC satisfaction evaluation. Tau Prolog is explicitly NOT integrated into the D1.6 reasoning path in this cycle. This diverges from D1.6-L4's letter: D1.6-L4 positions Tau Prolog as primary mechanism with structural correspondence as fallback; X4 positions structural correspondence as primary with Tau Prolog absent.

### 5.2 Deferred-not-rejected posture

**LOCKED per PO routing.** Tau Prolog is deferred, not rejected. PO's framing: *"Tau Prolog may turn out to be the right primary mechanism eventually — I'm not pre-deciding that against it — but the question of whether it's mission-required versus spec-required deserves its own deliberation cycle, not absorption into X4."*

Obligation: the Tau Prolog deliberation cycle must be scheduled post-X4 landing. Possible outcomes of that cycle:

- **(D-A) Confirm Tau Prolog mission-required.** Revised X4 implementation integrates Tau Prolog as primary; structural correspondence retained as fallback per D1.6-L4 letter.
- **(D-B) Confirm structural correspondence mission-sufficient.** Formal amendment of D1.6-L4 narrowing Tau Prolog to specific cases (e.g., Phase D2 consistency sandbox only, which it already does) or removing the Tau Prolog requirement from D1.6 reasoning.
- **(D-C) Hybrid decision.** Tau Prolog required for OWL-DERIVED NCs (Bucket C); structural correspondence sufficient for OWL-DIRECT + CURATED-NC.

None of these are pre-decided. The deliberation cycle produces the answer.

### 5.3 Drift vs. divergence

**LOCKED-FROM-PRINCIPLE.** Silent drift is unacceptable; explicit divergence is acceptable when documented and scheduled for revisit.

This section IS the divergence declaration. Naming X4's scope as "temporary divergence from D1.6-L4" in this memo is the amendment-adjacent artifact that prevents silent drift. The X4 memo references D1.6-L4; D1.6-L4 stays intact in the spec; the divergence is time-bounded by the Tau Prolog deliberation cycle.

If the Tau Prolog deliberation cycle does not happen — if X4 lands and the system continues running on structural-correspondence-only indefinitely without the deliberation — that becomes silent drift. The post-X4 deliverable list MUST include "schedule Tau Prolog deliberation cycle" as a named commitment.

---

## 6. Explicit scope OUT

### 6.1 Bucket B (8 missing CURATED-NC helpers) — queued

**LOCKED per PO P2 routing.** Per developer §2.1, 8 predicate helpers remain uncovered (ContinuantNC3, SiteNC3×2, OccurrentNC3, ProcessNC4, ProcessBoundaryNC3×2, TemporalRegionNC3×2). Under X4 Bucket A, CAUs whose category requires these helpers for Entailment produce `undetermined` for those NCs, which downstream routes to Plausible or NotApplicable per D1.6-L10.

**This is correct behavior.** Under-covered categories routing to Plausible is honest signal; it is not a defect. The system reports "cannot determine whether this CAU is Entailed as this category because the necessary pattern matcher does not yet exist." That is exactly what D1.6-L9 strict policy + D1.6-L10 Plausible routing were designed to communicate.

Bucket B is queued for v1.1+ or a follow-on cycle. Not killed.

### 6.2 Bucket C (6 OWL-DERIVED NCs) — queued

**LOCKED per PO P2 routing.** OWL-DERIVED NCs require inference over OWL semantics (subsumption chain walking, restriction composition). Dependency on SME-D16-X1 DependencyGraph infrastructure + sub-property closure may cover some cases; others may require Tau Prolog (which is deferred). Under X4 Bucket A, OWL-DERIVED NCs return `undetermined`; downstream routes to Plausible.

Bucket C is queued. Not killed.

### 6.3 Coverage-gap-as-signal — not defect

**LOCKED-FROM-PRINCIPLE.** Under-covered categories producing Plausible or NotApplicable is correct, expected behavior. When PROV-O runs through Bucket A, the disposition distribution WILL reflect this asymmetry — that is calibration data, not defect data.

The X4 reception memo (when X4 lands and the Commit 4 integration test re-runs) must frame under-coverage-induced Plausible/NotApplicable as expected signal, not defect. Same honest-admission posture as `provo-reception-synthetic-band8.md` §7 caveats.

### 6.4 Other queued items

- **RoleNC5** — Wave 3 v1.1+ disposition; unchanged.
- **Tau Prolog integration** — separate deliberation cycle (§5).
- **Broader ontology calibration** — post-X4 Bucket A landing on PROV-O.

---

## 7. Acceptance criteria

### 7.1 AVC triage — no 70/70 pre-commit

**LOCKED-FROM-PRINCIPLE per PO routing.** When X4 Bucket A lands, some of the 70 Phase 1 AVC scenarios may fail because their synthetic NC-satisfaction allowlists no longer match the disposition produced by real inference. This is expected; it is NOT a regression.

Per-scenario triage rubric (original four categories, extended to five post-Commit-4 per BCL discovery):

- **RID — real-inference-defect-fixed:** synthetic expectation was correct, real inference is wrong → defect in Bucket A implementation. Fix the dispatcher or matcher; do not weaken the scenario.
- **SWC — synthetic-wrong-corrected:** synthetic expectation was wrong, real inference is correct → update the scenario to match real inference. Document the correction (which NCs were incorrectly assumed satisfied; what the real pattern-match revealed).
- **SA — sme-adjudicated:** both defensible under different NC interpretations → SME adjudicates per-scenario. Likely rare; triage memo explains the judgment.
- **NAN — no-action-needed:** scenario unchanged under real inference (synthetic was precise match for reality).
- **BCL — bucket-coverage-limited (added 2026-04-24 Commit 4):** scaffold expectation correct per its premise but unreachable under Bucket A dispatcher because Bucket-B-deferred CURATED-NCs or Bucket-C-deferred OWL-DERIVED NCs route undetermined. Distinct from SWC: scaffold is not wrong; the dispatcher just cannot reach the premise under partial coverage. Scenario stays as-is pending Bucket B / Bucket C landing that closes the gap. Amending BCL scenarios now would codify partial-coverage state as permanent; deferring amendment preserves the scenario's original premise for later verification.

Bucket A acceptance requires: either all 70 AVC still pass (unlikely given synthetic allowlist replacement), OR the failing scenarios are triaged per the rubric with explicit per-scenario disposition (RID-fixed / SWC-corrected / SA-adjudicated / NAN-unchanged / BCL-deferred). Synthetic-allowlist-preservation is NOT an acceptance criterion.

**Post-Commit-4 outcome (2026-04-24):** zero SWC; zero RID; triage artifact at `specs/d16/x4-avc-triage.md` enumerates 12+7 scenarios across BCL + NAN. Bundle v6 amendment list empty (deferred until Bucket B landing produces amendment-worthy cases). Scenario migration deferred per triage §4 (forcing signature-driven inputs under partial coverage produces artifacts, not calibration signal).

### 7.2 Correction-not-regression framing

**LOCKED-FROM-PRINCIPLE.** Per the developer's §3.5 framing (surfaced in this memo body per Aaron's request):

> *"When X4's dispatcher lands and produces real satisfiedNCs, SME-D16-X3 Commit 4's live integration test will likely produce different dispositions than the current caller-pre-picked Entailed/Plausible/Inconsistent/NotApplicable mix. That's expected and correct per proof-discipline; it's not a Commit 4 regression."*

The Commit 4 reception memo update and any X4-landing reception memo MUST cite this framing. "Dispositions changed from Phase 1 baseline" is correction of scaffold artifact, not regression of real reasoning.

### 7.3 Real PROV-O exercise as integration validation

**SME-PROPOSED — PENDING-DEVELOPER-ACK.** Once Bucket A lands, the SME-D16-X3 Commit 4 integration test re-runs with real dispatcher. Expected outcomes:

- Disposition distribution shifts from Commit 4 baseline (14 Entailed / 8 Plausible / 3 Inconsistent under synthetic) to something reflecting real NC inference + coverage asymmetry.
- Some CAUs previously Entailed may route Plausible if their NCs are in uncovered Bucket B predicates.
- Some CAUs previously Plausible may route Entailed if their signature actually satisfies OWL-DIRECT NCs the synthetic allowlist missed.
- DP-1 may fire if real inference produces >40% NotApplicable or >30% Inconsistent on the PROV-O subset — legitimate signal under real reasoning, not stub artifact.

**Reception memo expectations:**

- Honest comparison against Commit 4 baseline.
- Coverage-gap disclosure: which NCs routed `undetermined` due to Bucket B/C scope-out.
- DP-1 diagnostic result framed by inference source (stub mapper vs. real dispatcher).
- No "regression" language applied to disposition shifts; "correction of scaffold expectations" framing.

### 7.4 Per-scenario AVC triage landing

**LOCKED-FROM-PRINCIPLE.** Bucket A landing includes a per-scenario triage artifact (`specs/d16/x4-avc-triage.md` or similar) documenting which scenarios shifted, which were updated, which revealed defects, which were SME-adjudicated. This artifact is part of the X4 deliverable set, not optional.

---

## 8. Process pattern — standard cycle

Per PO routing 2026-04-24:

1. ✅ Developer pre-proposal delivered (infrastructure audit + gap enumeration + scope estimate).
2. ✅ SME scoping memo produced (this document).
3. ☐ Developer ACK + implementation plan addressing §2.1 (dispatcher return shape), §3.2 (pattern-shape enumeration), §4.1 (integration point with `evaluateCAU`), §7.3 (AVC triage rubric proposal).
4. ☐ PO pre-code confirmation.
5. ☐ Implementation proceeds. Consolidated SME review of pattern-shape matchers (§3.2). Per-scenario AVC triage as scenarios surface (§7.4).

**Cycle discipline:** this memo is LOCKED-FROM-PRINCIPLE on scope; developer implementation plan may flag conflicts with current code shape (analogous to X3 reconciliation), in which case memo revises to v2. Cycle inversion is NOT in play for X4 — developer pre-proposal landed first as intended.

---

## 9. References

- Developer pre-proposal (2026-04-24, inline in session)
- PO routing decisions (2026-04-24, inline in session)
- `specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md` — D1.6-L4 (Tau Prolog lock), D1.6-L9 (NC satisfaction strict policy), D1.6-L10 (Plausible routing)
- `specs/d16/bfo-signatures-v1.0.json` — 55 NCs across 13 BFO categories
- `src/core/d16/critical-nc-helpers.js` — 10 Wave 0/1/2 helpers
- `src/core/d16/three-state-evaluator.js` §40 — `evaluateCAU` with synthetic allowlist scaffold
- `src/core/d16/pipeline-orchestrator.js` — SME-D16-X3 v2 orchestrator (X4 dispatcher integrates behind this surface)
- Existing memos: `sme-d16-x1-property-linked-neighbor-memo-rev1.md` (X1), `sme-d16-x3-pipeline-orchestrator-memo-v2.md` (X3 v2)
- Feedback memory: `feedback_scaffold_production_split.md`, `feedback_absence_not_evidence.md`, `feedback_structured_failure_reasons.md`, `feedback_transparent_callback_forwarding.md`, `feedback_proof_discipline.md`, `feedback_cycle_inversion_reconciliation_discipline.md`
- Project memory: `project_d16_dp2_design_review_cycle.md`, `project_d16_na_architecture_commitments.md`, `project_d16_sme_async_decisions.md` (strict-policy lock for CURATED-HEURISTIC exclusion)

---

## 10. Reserved doors for developer pushback

- **§2.1 Dispatcher return shape:** trichotomy vs. satisfied-only Set. SME lean is trichotomy; developer implementation-plan preference welcome with reasoning.
- **§3.2 Pattern-shape enumeration:** SME named 4–6 shapes based on developer audit; actual count discovered during implementation. If >6 shapes surface, that's informative, not problematic.
- **§4.1 Integration point:** exact line(s) in `three-state-evaluator.js` where the dispatcher replaces the synthetic-allowlist path. Developer identifies; SME reviews.
- **§7.1 AVC triage rubric:** developer proposes the triage decision-tree; SME reviews per-scenario when triage lands.
- **§2.3 Tag-based branching:** if `bfo-signatures-v1.0.json` has additional tags not enumerated in §2.3 (e.g., future tag additions), developer flags at implementation plan.

---

**Next action:** developer ACK + implementation plan per §3 of §8 (process pattern). On ACK, PO pre-code confirmation closes the cycle and implementation proceeds.
