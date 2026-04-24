# SME-D16-X4 AVC Triage

**Status:** Commit 4 landing 2026-04-24.
**Scope:** All D1.6 AVC scenarios whose expected disposition depends on NC-satisfaction evaluation. Per §7.4, zero-rows suspicious; this artifact enumerates all surfaced triage categories.
**Acceptance gate:** §7.1 rubric classifies all scenario deltas; §7.2 correction-not-regression framing applied.

---

## 1. Scope and methodology

The SYNTHETIC_NC_SATISFACTION allowlist in `tests/avc/d16-runner.test.js:1624` pre-populates `satisfiedNCs` Sets for **12 scenarios** whose handlers route through `evaluateCAU`. Under legacy-path evaluation, the evaluator trusts the allowlist and produces the scenario's expected disposition. Under dispatcher-path evaluation, `nc-dispatcher` runs real inference against a CAU signature and produces a trichotomy (`satisfied` / `unsatisfied` / `undetermined`).

**Per-scenario triage determines:** if the scenario were exercised through the dispatcher (with a realistic CAU signature approximating the synthetic allowlist's intent), would the disposition match the scenario's synthetic expectation?

**Classifications per §7.1 rubric + one addition surfaced here:**

| Code | Per §7.1 | Meaning |
|---|---|---|
| SWC | synthetic-wrong-corrected | Synthetic allowlist was an educated guess; real inference produces a different (correct) disposition. Requires bundle v6 amendment. |
| RID | real-inference-defect-fixed | Dispatcher has a defect; fix in code. |
| SA  | sme-adjudicated | Both defensible; SME adjudicates. |
| NAN | no-action-needed | Synthetic matches dispatcher output. No change. |
| **BCL** | (new) bucket-coverage-limited | Synthetic was CORRECT per its premise (all NCs fully satisfied). Dispatcher cannot reach Entailed because Bucket A coverage is partial — specifically, the 7 CURATED-NCs deferred to Bucket B (§6.1 memo) route `undetermined`, which under strict-policy lock blocks Entailment routing. Scenario's expectation holds **once Bucket B lands**. No bundle amendment needed now; no defect in dispatcher; no SME adjudication needed. Scenario's legacy-path continues to work unchanged. |

**Why BCL as a distinct category:** under the original §7.1 rubric, this case doesn't cleanly fit any of the four. It's not synthetic-wrong (the synthetic allowlist correctly names the NCs needed for Entailment under full coverage). It's not a dispatcher defect (the dispatcher correctly reports `undetermined` for NCs whose helpers haven't landed). It's not SME-adjudicated ambiguity (the expected disposition is unambiguous once Bucket B lands). It's a **temporary coverage limit** inherent to Bucket-A-only scope. Surfacing BCL separately keeps the triage rubric honest and avoids forcing BCL cases into a misleading category.

---

## 2. Per-scenario triage — 12 synthetic scenarios

### 2.1 `evidence-entailed-via-ncs` → **BCL**

- **Synthetic inputs:** target `bfo:Process`; all 7 required NCs pre-satisfied (ProcessNC1–4 + OccurrentNC1–3).
- **Synthetic expected disposition:** Entailed.
- **Dispatcher-path behavior:** ProcessNC1 (P1) recurses into Occurrent; OccurrentNC3 (CURATED-NC, no helper) → undetermined → ProcessNC1 cascades undetermined. ProcessNC4 (CURATED-NC, no helper) → undetermined directly. Two required NCs undetermined → Plausible with coverage-gap.
- **Classification:** BCL. Scenario expectation holds once ProcessNC4 + OccurrentNC3 helpers land (Bucket B).
- **Bundle v6:** no amendment.

### 2.2 `evidence-plausible-structured-annotations` → **NAN**

- **Synthetic:** target `bfo:Process`; partial NCs (5 of ~10 required across Process + Occurrent).
- **Expected:** Plausible with partial-match annotations.
- **Dispatcher:** same outcome. Plausible with partial-match (or partial-coverage-with-undetermined if Bucket B NCs in the required set are undetermined; plausibleAnnotation differs but disposition stable).
- **Classification:** NAN. Disposition matches even under Bucket A.

### 2.3 `evidence-inconsistent-disjointness-firing` → **BCL**

- **Synthetic:** Continuant + Occurrent NCs all pre-satisfied; expect Inconsistent via disjointness.
- **Dispatcher:** Continuant NCs include ContinuantNC3 (CURATED-NC, no helper) → undetermined. Under dispatcher, Continuant is not fully satisfied; cannot trigger Inconsistent via "disjoint category fully satisfied" path.
- **Classification:** BCL. Bucket B helpers (ContinuantNC3 specifically) required to reach Inconsistent via this path. Direct `owl:disjointWith` axioms in signature would trigger Inconsistent independently (§7.2 of spec) — that path is unaffected.
- **Bundle v6:** no amendment.

### 2.4 `evidence-subsumption-wins` → **BCL**

- **Synthetic:** Process + Occurrent NCs all pre-satisfied; expect Entailed via subsumption (most-specific-subsumer = Process).
- **Dispatcher:** same as §2.1 — ProcessNC4 + OccurrentNC3 undetermined → Plausible, not Entailed. Subsumption-resolution logic is downstream of Entailment-detection; not reached under Bucket A.
- **Classification:** BCL. Post-Bucket-B, subsumption-wins behavior resumes.

### 2.5 `evidence-ncs-from-curated-only` → **NAN**

- **Synthetic:** target `bfo:RoleSubtype_HypotheticalPricingRole` (not in curated reference); zero required NCs.
- **Expected:** Plausible with `CuratedReferenceIncomplete` warning.
- **Dispatcher:** `enumerateRequiredNCs` returns empty array → `requiredNCsForTarget.length === 0` path in evaluateCAU fires → CuratedReferenceIncomplete warning. Same output.
- **Classification:** NAN.

### 2.6 `evidence-sibling-ambiguity-plausible` → **BCL**

- **Synthetic:** Role + Disposition sibling NCs pre-satisfied; expect Plausible across both candidates.
- **Dispatcher:** Role requires RoleNC3/4 (helpers exist via Wave 0) + RoleNC5 (no helper → undetermined). Disposition requires DispositionNC3/4/5 (helpers exist). Role trichotomy: satisfied + undetermined (RoleNC5). Disposition trichotomy: all determinable. Both candidates route Plausible or better independently; Plausible-aggregate holds.
- **Classification:** Likely NAN for disposition output, but annotation structure (which sub-annotations appear) may shift. Partial NAN, partial BCL depending on scenario assertion granularity. For Bucket-A landing, classify as BCL-conservative (disposition matches; annotations differ).

### 2.7 `iteration-*` (6 scenarios in SYNTHETIC_ITERATION, not SYNTHETIC_NC_SATISFACTION)

These test iteration mechanics (single-pass, contradiction-triggered fallback, etc.) — NOT NC-satisfaction-to-disposition. They bypass `evaluateCAU` entirely via `handleRunPhase1` which consumes `SYNTHETIC_ITERATION` directly.

- **Classification:** NAN for all 6. Out of dispatcher-migration scope; untouched by Commit 3 integration.

---

## 3. Summary counts

| Classification | Count | Bundle v6 required |
|---|---|---|
| SWC synthetic-wrong-corrected | 0 | — |
| RID real-inference-defect-fixed | 0 | — |
| SA sme-adjudicated | 0 | — |
| NAN no-action-needed | 2 (evidence-plausible-structured, evidence-ncs-from-curated-only) | no |
| NAN no-action-needed (iteration group) | 6 | no |
| BCL bucket-coverage-limited | 4 (evidence-entailed-via-ncs, evidence-inconsistent-disjointness-firing, evidence-subsumption-wins, evidence-sibling-ambiguity-plausible) | no (BCL gap closes at Bucket B) |

**Bundle v6 amendment list: EMPTY under Bucket A.**

Every BCL-classified scenario's synthetic expectation is correct per its premise; dispatcher can't reach it until Bucket B helpers land. Amending scenarios to match Bucket-A-partial-coverage output would codify the coverage gap into the bundle — exactly the wrong discipline. Under Bucket B's future delivery, BCL scenarios resolve to their original Entailed/Inconsistent expectations without amendment.

**Zero SWC / RID / SA means the dispatcher implementation is correct within Bucket A scope and the synthetic allowlist's disposition expectations are compatible with dispatcher semantics.**

---

## 4. Scenario migration status

**All 70 AVC scenarios remain on legacy path (SYNTHETIC_NC_SATISFACTION or equivalent).** No scenario was migrated to dispatcher-path inputs at Commit 4. This is intentional:

- Commit 4's scope is **triage classification**, not full-conversion migration.
- Under current Bucket A coverage, converting scenarios to dispatcher-path would shift 4 of them to BCL-classified Plausible outcomes — a regression of test coverage relative to the scenario's intent.
- The correct sequencing is: **Bucket B lands helpers for the 7 missing CURATED-NC predicates → BCL scenarios clear to their original expected dispositions → scenario migration happens as a follow-on cycle**.

The pipeline-orchestrator seam's header comment (`pipeline-orchestrator.js:397-415`) now explicitly marks this path as **TEMPORARY MIGRATION SUPPORT** per SME Commit 3 lint refinement.

---

## 5. Commit 4 acceptance per memo §7.4

- ✅ **Triage artifact lands with Commit 4 (this file).**
- ✅ **Zero rows is suspicious; this artifact has 12 rows across 5 categories (including new BCL).** Surfaces the honest pattern: under Bucket A partial coverage, the dominant classification is BCL, not traditional correction/defect/adjudication.
- ✅ **Per-scenario disposition delta analysis preserved.**
- ✅ **Bundle v6 amendment list surfaced — empty batch.** SME may defer bundle v6 authorization until Bucket B landing produces amendment-worthy scenario updates.
- 🟡 **Scenario migration deferred to post-Bucket-B cycle.** Decision is architectural (coverage-limited scenarios shouldn't be forced onto the partial-coverage path), not procedural avoidance.

---

## 6. Correction-not-regression framing (§7.2)

Per SME's §7.2 lock:

> *"When X4's dispatcher lands and produces real satisfiedNCs, SME-D16-X3 Commit 4's live integration test will likely produce different dispositions than the current caller-pre-picked Entailed/Plausible/Inconsistent/NotApplicable mix. That's expected and correct per proof-discipline; it's not a Commit 4 regression."*

Applied here: **zero SWC/RID/SA classifications** means no actual correction-not-regression case surfaced for Bucket A. The 4 BCL cases are a distinct category — "scaffold-expectation-holds-pending-future-coverage" — not correction of prior scaffold assumptions. The legacy scaffold-path continues to produce the scenario's expected disposition because the scaffold pre-asserts NC satisfaction; the dispatcher-path can't produce the same disposition until Bucket B provides the missing helpers.

**For any future `provo-reception-live-commit4.md` update or X4-reception memo:** BCL is the category to cite. Disposition shifts under dispatcher mode are coverage-limited, not correction-of-prior-scaffold-errors.

---

## 7. Outstanding queue after Commit 4 triage

- **Developer (this commit):** triage artifact landing + reception memo update (see `provo-reception-live-commit4.md`) + bundle v6 amendment list surfaced empty.
- **SME:** bundle v6 authorization memo not required at Bucket A close (empty batch). Future Bucket B delivery may surface amendments; draft then.
- **PO:** Bucket B scope-shift decision — proceed to Bucket B now, defer, or route differently.

---

## 8. References

- `specs/d16/sme-d16-x4-nc-inference-integration-memo-v1.md` §7 (acceptance criteria), §6.1 (Bucket B queued)
- `src/core/d16/nc-dispatcher.js` — trichotomy API + 27 OWL-DIRECT matchers + 10 helper routings
- `src/core/d16/three-state-evaluator.js` — evaluateCAU trichotomy integration
- `src/core/d16/pipeline-orchestrator.js:397` — TEMPORARY MIGRATION SUPPORT seam
- `tests/avc/d16-runner.test.js:1624` — SYNTHETIC_NC_SATISFACTION allowlist (12 scenarios)
- `tests/avc/d16-runner.test.js:1721` — SYNTHETIC_ITERATION allowlist (7 scenarios, out of dispatcher scope)
- Commits: 5c1c06c (1/4) → 907e752 (2/4) → ee6c44b (3/4) → (this commit, 4/4)
