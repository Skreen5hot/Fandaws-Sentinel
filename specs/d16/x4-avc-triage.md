# SME-D16-X4 AVC Triage

**Status:** Commit 4 landing 2026-04-24. **Re-triaged post-X5 Bucket B 2026-04-25** — see §9.
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
- Commits: 5c1c06c (1/4) → 907e752 (2/4) → ee6c44b (3/4) → 4e119a2 (4/4) → X5 Bucket B helpers landed 2026-04-25

---

## 9. Re-triage post-X5 Bucket B (2026-04-25)

**Scope of re-triage:** four BCL scenarios from §3 re-evaluated against post-X5 dispatcher coverage. X5 added helpers for ContinuantNC3, OccurrentNC3, ProcessNC4 — the three PROV-O-relevant CURATED-NCs deferred from Bucket A. RoleNC5, SiteNC3, ProcessBoundaryNC3, TemporalRegionNC3 remain v1.1+.

**Verified fact pattern (from `bfo-signatures-v1.0.json`):** OccurrentNC2 and ProcessNC3 are tagged **OWL-DERIVED** (per SME async decision 2.1 reclassification 2026-04-21 — see signatures file `owa_reclassification_summary_2026_04_21`). OWL-DERIVED routes `undetermined` under Bucket A dispatcher per X4 §6.2 (Bucket C deferred). This means Process-target Entailment cascades through Occurrent ancestor and undetermined OccurrentNC2 + undetermined ProcessNC3 — which X5 cannot close (X5 is Bucket B subset, not Bucket C).

### 9.1 Per-scenario re-triage

#### `evidence-entailed-via-ncs` → **BCL (residual reason shifted: Bucket B → Bucket C)**

- Pre-X5: undetermined via ProcessNC4 (CURATED-NC, no helper) + OccurrentNC3 (CURATED-NC, no helper).
- Post-X5: ProcessNC4 + OccurrentNC3 helpers landed → those NCs now satisfiable. **BUT** ProcessNC3 (OWL-DERIVED, Bucket C) still routes undetermined; OccurrentNC2 (OWL-DERIVED, Bucket C) cascades undetermined into ProcessNC1's P1 ancestor recursion.
- Outcome: still Plausible-with-coverage-gap. Scenario's Entailed expectation reachable only when Bucket C lands (or a separate cycle wires OWL-DERIVED inference).
- **Classification:** BCL. Bucket-C-blocked.

#### `evidence-subsumption-wins` → **BCL (residual reason shifted: Bucket B → Bucket C)**

- Same blocker chain as `evidence-entailed-via-ncs`. Subsumption-resolution logic is downstream of Entailment-detection; not reached.
- **Classification:** BCL. Bucket-C-blocked.

#### `evidence-inconsistent-disjointness-firing` → **NAN (cleared by X5)**

- Pre-X5: undetermined via ContinuantNC3 (CURATED-NC, no helper).
- Post-X5: ContinuantNC3 helper landed. Continuant target NCs (NC1+NC2 OWL-DIRECT from X4; NC3 helper from X5) all determinable.
- The scenario's Inconsistent expectation derives from disjointness firing. Two paths reach it:
  - **Direct `owl:disjointWith` axiom** in signature → Inconsistent independently of NC-cascade satisfaction (per spec §7.2). This path was unaffected throughout X4-X5.
  - **Cross-category disjoint-fully-satisfied** path → requires both Continuant fully-satisfied AND Occurrent fully-satisfied. Continuant clears post-X5; Occurrent still has OccurrentNC2 OWL-DERIVED undetermined → cross-category Inconsistent path remains BCL.
- For the AVC scenario specifically (whose handler in `tests/avc/d16-runner.test.js` uses synthetic disjointness via direct axiom assertion, not via NC-fully-satisfied derivation), the direct-axiom path holds and Inconsistent fires correctly. **NAN — no action needed.**

#### `evidence-sibling-ambiguity-plausible` → **BCL (residual unchanged: RoleNC5 v1.1+)**

- Pre-X5: Role required RoleNC5 (no helper, deferred to v1.1+).
- Post-X5: RoleNC5 NOT in X5 scope (deferred per X4 §6.4 / Wave 3 disposition). No change.
- **Classification:** BCL. v1.1+ blocked.

### 9.2 Summary delta

| Scenario | Pre-X5 | Post-X5 | Delta | Bundle v6 amend? |
|---|---|---|---|---|
| `evidence-entailed-via-ncs` | BCL | BCL | residual shifted Bucket B → Bucket C | no |
| `evidence-subsumption-wins` | BCL | BCL | residual shifted Bucket B → Bucket C | no |
| `evidence-inconsistent-disjointness-firing` | BCL | NAN | cleared via direct-disjointness path; NC-cascade path still partial-BCL | no |
| `evidence-sibling-ambiguity-plausible` | BCL | BCL | residual unchanged (RoleNC5 v1.1+) | no |

### 9.3 Bundle v6 amendment list — STILL EMPTY post-X5

Zero SWC, zero RID, zero SA. The three remaining BCL scenarios stay scaffold-correct-pending-future-coverage; amending them now would codify partial coverage as permanent (same proof-discipline rationale as Commit 4 §3 conclusion).

**Path forward to non-empty amendment list:**
- **Bucket C (OWL-DERIVED inference)** would close the two Process-target BCL scenarios (`evidence-entailed-via-ncs`, `evidence-subsumption-wins`) by satisfying ProcessNC3 + OccurrentNC2.
- **v1.1+ RoleNC5** would close `evidence-sibling-ambiguity-plausible`.

Until either path lands, bundle v6 authorization memo remains deferred. **No SME memo drafted at X5 close** — empty batch persists; drafting an authorization memo for an empty list would be ceremonial rather than load-bearing.

### 9.4 Honest-discipline framing post-X5

X5 Bucket B subset closed three CURATED-NC gaps but **did not unlock all expected BCL → NAN/SWC migrations** because the residual blockers shifted to:

1. **OWL-DERIVED NCs deferred to Bucket C** — ProcessNC3, OccurrentNC2 (cascading via P1 ancestor recursion). Surfaced after X5 because X4's Bucket A enumeration didn't isolate "OWL-DERIVED ancestor cascade" as a distinct blocker class.
2. **v1.1+ deferred items** — RoleNC5 unchanged.

**Banked observation:** when re-triaging multi-bucket scopings, residual BCL after a sub-bucket landing may have shifted causation rather than cleared. The triage rubric correctly treats the cleared-vs-shifted distinction — three scenarios stayed BCL, one moved to NAN. No scenarios moved to SWC/RID/SA.

This validates the proof-discipline rationale for Bundle v6 deferral at Commit 4: had we authorized speculative amendments at Commit 4, post-X5 would have required reverting them.

### 9.5 Outstanding queue post-X5

- **SME:** bundle v6 authorization memo not drafted — empty batch persists. Reactive on Bucket C or v1.1+ landing.
- **PO:** Tau Prolog deliberation cycle scheduling unchanged from prior turn (still on queue).
- **Reception memo update:** producing alongside this re-triage; documents X5 implications for the live PROV-O run with proof-discipline framing.

---

## 10. Re-triage post-X6 Bucket C (2026-04-25)

**Scope of re-triage:** the four BCL scenarios from §3 / §9 re-evaluated against post-X6 dispatcher coverage. X6 added Tau Prolog primary + structural-correspondence fallback for the 6 OWL-DERIVED NCs (ICNC2, ICNC3, MENC2, IENC2, OccurrentNC2, ProcessNC3). Per X6 memo §0 load-bearing context: Option C (hybrid) IS D1.6-L4 implemented literally — the X4 §5 temporary divergence closes at Bucket C landing without spec amendment.

**Verified fact pattern (post-X6):** OccurrentNC2 + ProcessNC3 now route deterministically (`satisfied | unsatisfied`, never `undetermined`) for any non-anomalous CAU. The Tau Prolog primary + structural-correspondence fallback together produce a deterministic answer; cap-exhausted queries route through the fallback layer with `fallbackUsed: true` annotation. The OWL-DERIVED ancestor cascade blocker surfaced in §9.4 is **closed** for these 6 NCs.

**OWA preservation discriminating fixture (architectural payload):** see [`tests/unit/d16/owl-derived-nc-helpers.test.js:80-95`](../../tests/unit/d16/owl-derived-nc-helpers.test.js#L80-L95) — a CAU declared `rdfs:subClassOf bfo:Role` with no literal `bfo:inheresIn` restriction routes ICNC2 unsatisfied via `inheres_in_presence_derived` (Tau Prolog inherits inheresIn presence via SDC property domain). Under Option B (structural-only), this case would have falsely satisfied via raw absence — re-introducing the CWA over-commitment SME async decision 2.1 (2026-04-21) explicitly avoided. **This single test is the empirical attestation that Option C beats Option B.**

### 10.1 Per-scenario re-triage

#### `evidence-entailed-via-ncs` → **NAN (cleared by X6)**

- Pre-X6: BCL via OccurrentNC2 (OWL-DERIVED) + ProcessNC3 (OWL-DERIVED) cascading undetermined.
- Post-X6: both OccurrentNC2 (`disjointness_derived` for Process ancestor) and ProcessNC3 (`process_ancestor_inherits_one_dim`) resolve deterministically. Cross-NC interaction tests confirm cascade closure ([`tests/unit/d16/owl-derived-nc-helpers.test.js cross-NC suite`](../../tests/unit/d16/owl-derived-nc-helpers.test.js)).
- Outcome: Process target's required-NC set is fully determinable. ProcessNC1 (P1) cascade through Occurrent NCs no longer blocks on undetermined OccurrentNC2.
- **Classification:** NAN. Cleared via Bucket C OWL-DERIVED inference.

#### `evidence-subsumption-wins` → **NAN (cleared by X6)**

- Same blocker chain as `evidence-entailed-via-ncs`; subsumption-resolution downstream of Entailment-detection. With Entailment-detection now reachable post-X6, subsumption logic resumes.
- **Classification:** NAN. Cleared via Bucket C.

#### `evidence-inconsistent-disjointness-firing` → **NAN (already cleared at X5)**

- Cleared at X5 via direct-disjointness path; status unchanged. Cross-category disjoint-fully-satisfied path now ALSO available post-X6 (Continuant + Occurrent both fully-satisfied determinable).
- **Classification:** NAN (unchanged from §9).

#### `evidence-sibling-ambiguity-plausible` → **BCL (residual unchanged: RoleNC5 v1.1+)**

- RoleNC5 NOT in X6 scope (Wave 3 / v1.1+ disposition unchanged).
- **Classification:** BCL. v1.1+ blocked.

### 10.2 Summary delta

| Scenario | Pre-X6 (post-X5) | Post-X6 | Delta | Bundle v6 amend? |
|---|---|---|---|---|
| `evidence-entailed-via-ncs` | BCL (Bucket C) | NAN | cleared via Bucket C | no |
| `evidence-subsumption-wins` | BCL (Bucket C) | NAN | cleared via Bucket C | no |
| `evidence-inconsistent-disjointness-firing` | NAN | NAN | unchanged | no |
| `evidence-sibling-ambiguity-plausible` | BCL (v1.1+) | BCL (v1.1+) | unchanged | no |

**Three of four BCL scenarios from §3 now NAN.** Only `evidence-sibling-ambiguity-plausible` remains BCL (v1.1+ RoleNC5 blocker, unchanged across the entire X4-X6 arc).

### 10.3 Bundle v6 amendment list — STILL EMPTY post-X6

**Zero SWC, zero RID, zero SA.** Reasoning:

- Two scenarios moved BCL → NAN (cleared by Bucket C). Neither produced disposition outcomes that contradicted the synthetic scaffold's expectation — Bucket C closing the cascade lets the scaffold-expected Entailed outcome materialize. **No correction needed.**
- One scenario stays NAN (already cleared at X5).
- One scenario stays BCL (v1.1+ unchanged).

The SME pre-deliberation prediction at memo §8.2 — "Bucket C is the first SWC opportunity across the X4-X6 arc" — **did not materialize** at this landing. Reasoning: the OWA-preservation discriminating fixture (Role descendant → ICNC2 unsatisfied via derivation) does demonstrate Option C distinguishing presence from absence, but no AVC scenario in the v1.0 scaffold exercises that specific fixture pattern. The synthetic allowlists for the 4 BCL scenarios pre-asserted dispositions consistent with what Option C produces — partly by structural luck, partly because the BCL scenarios target scaffold-correct PROV-O-relevant patterns where SDC-vs-IC inheritance happens not to flip outcomes.

**Future SWC opportunity:** when AVC scenarios migrate from synthetic-allowlist to signature-driven inputs (the migration cycle queued in reception memo §14.3 step 4), the OWA-preservation discriminating cases will exercise via real signatures. SWC may surface there. Migration cycle is post-Bucket-C-arc.

**Bundle v6 status: empty list persists.** SME bundle v6 authorization memo remains undrafted; drafting authorization for an empty list at Bucket C closure would be ceremonial. Defer until migration cycle or v1.1+ surfaces amendment-worthy cases.

### 10.4 Honest-discipline framing post-X6

X6 Bucket C **closes 2 of 3 remaining BCL scenarios** from §9 (per memo §8 expectation). The third (`evidence-sibling-ambiguity-plausible`) remains v1.1+ blocked — natural sequencing per X4 §6.4 / Wave 3 disposition. **No new BCL surfaced** at Bucket C close; no residual blocker shift this turn.

Three architectural payloads attested by Bucket C landing:

1. **D1.6-L4 ratification** — Option C IS L4 implemented literally. The X4 §5 temporary divergence dissolves at this commit (§10.5 attestation).
2. **OWA preservation distinguishes Option C from Option B** — the Role-descendant discriminating fixture proves Tau Prolog primary derives presence via SDC inheritance, where structural-only (Option B) would have falsely satisfied via raw absence.
3. **OWL-DERIVED ancestor cascade unblocked** — surfaced as the residual blocker class at X5 §9.4; closed at Bucket C landing for the 6 in-scope NCs. Future OWL-DERIVED additions (v1.1+) would route undetermined again until extension cycle lands.

### 10.5 X4 §5 temporary divergence — closure attestation

Per X4 memo §5.2: the Tau Prolog deliberation cycle was queued during X4 Bucket A landing as a precondition for Bucket C scope decision. Per X6 memo §0 + §8.4: Option C ratification + Bucket C implementation **fulfills** that obligation in the same arc.

**Attestation:** the X4 §5 temporary divergence from D1.6-L4 — wherein Bucket A operated under partial Tau Prolog coverage with a scheduled revisit — **closes at this commit**. D1.6-L4 stands as written. No spec amendment. The Tau Prolog deliberation cycle obligation from X4 §5.2 is fulfilled by Bucket C landing; no separate deliberation cycle artifact required.

### 10.6 Outstanding queue post-X6

- **SME:** bundle v6 authorization memo not drafted — empty batch persists across X4-X6 arc. Reactive on AVC migration cycle or v1.1+ landing.
- **PO:** Tau Prolog deliberation cycle obligation **closed** by Bucket C landing. Final X6 arc closure routing follows Commit 4 reception memo update.
- **Developer:** Bucket C arc complete pending Commit 4 reception memo + arc closeout artifacts.

---

## 11. Re-triage post-X8 AVC migration (2026-04-25)

**Scope of re-triage:** the 6 dispatcher-relevant SYNTHETIC_NC_SATISFACTION scenarios from X4 triage §2.1 / §2.2 / §2.3 / §2.4 / §2.5 / §2.6 re-evaluated against post-X8 dispatcher-path inputs (signature + ancestorChain + prologSession). Each scenario's input migrated from synthetic `satisfiedNCs` Set to realistic CAU signature consumed by the X7 dispatcher integration. Bundle v6 amendment list — surfaces from this re-triage.

**Verified fact pattern (post-X8 migration):** 5 of 6 scenarios pass under real-inference dispatcher with disposition matching synthetic-allowlist intent. **1 of 6 surfaces as SWC** — synthetic was structurally unreachable via honest signature construction; real-inference dispatcher correctly produces a different (correct) disposition.

This is **the first non-empty bundle amendment list across the X4 → X8 arc.** The empty-batch persistence across X4 → X5 → X6 → X7 (per §3 / §9 / §10 honest-discipline framings) ends at X8 with one SWC entry.

### 11.1 Per-scenario migration triage

#### `evidence-entailed-via-ncs` → **NAN (cleared)**

- Synthetic expected: Entailed.
- Migrated input: Process target with full NC satisfaction across Bucket A (ProcessNC2 P3, OccurrentNC1 P3) + Bucket B (ProcessNC4 helper, OccurrentNC3 helper) + Bucket C (ProcessNC3 OWL-DERIVED, OccurrentNC2 OWL-DERIVED).
- Dispatcher output: Entailed. Matches synthetic.
- **Classification:** NAN. Cleared via dispatcher path.

#### `evidence-plausible-structured-annotations` → **NAN (cleared)**

- Synthetic expected: Plausible with structured annotations across Process + Occurrent candidates.
- Migrated input per SME §2.2 ruling 2026-04-25 (lean b — drop occupiesTemporalRegion entirely): partial NC satisfaction; OccurrentNC1 + OccurrentNC3 unsatisfied; ProcessNC1 cascade through Occurrent unsatisfied; partial-match Plausible.
- Dispatcher output: Plausible with `evidenceAnnotations.candidateBFOCategories` listing both Process and Occurrent. Matches synthetic structure.
- **Classification:** NAN. Cleared via dispatcher path.

#### `evidence-inconsistent-disjointness-firing` → **SWC (synthetic-wrong-corrected)**

**Surfacing the first SWC across the X4-X8 arc.**

- Synthetic expected: Inconsistent via cross-category-NC-fully-satisfied path (Continuant fully satisfied AND Occurrent fully satisfied → BFO disjointness fires).
- Migration analysis surfaced: real-inference structural P4 logic (ContinuantNC1's `hasOccupiesTemporalRegion` contradiction) **prevents** simultaneous full-satisfaction of Continuant + Occurrent NCs from a single honest signature. Specifically: `ContinuantNC1` requires NO occupiesTemporalRegion restriction in signature (P4 contradicted check); `OccurrentNC1` (P3 OWL-DIRECT) requires PRESENT occupiesTemporalRegion restriction. Structurally incompatible.
- The synthetic allowlist worked by pre-asserting both fully satisfied (the dispatcher didn't actually verify the satisfiability). Real inference correctly refuses to assert both.
- Dispatcher output: Plausible (multi-inheritance ancestor chain triggers `disjointness_explicit_violation` on OccurrentNC2 and `occurrent_subtree_ancestor` contradiction on ContinuantNC3 helpers; partial satisfaction across both targets surfaces Plausible).
- **Classification:** SWC. Synthetic-wrong-corrected: synthetic asserted Inconsistent via a path real inference legitimately blocks; real inference produces Plausible-with-coverage-gap. Bundle v6 amendment will redefine the scenario's expected disposition + explanation shape.

**SWC handling at Commit 1 landing:** scenario is `it.skip`'d at the runner level pending bundle v6 amendment. SME bundle v6 authorization memo drafted reactive; PO ACKs; bundle v5 → v6 amendment commit lands as Commit 2 per memo §6 staging.

**Architectural finding banked:** the structural P4 contradiction logic (`hasOccupiesTemporalRegion` invalidates ContinuantNC1) is a load-bearing OWA-preserving check that the synthetic allowlist couldn't model. This is the kind of "real inference catches what synthetic missed" that X8 was designed to surface. It validates the bundle v6 deferral discipline carried across X4-X7 — speculative authorization would have codified the synthetic's structural error as permanent.

#### `evidence-subsumption-wins` → **NAN (cleared)**

- Synthetic expected: Entailed at Process via subsumption-resolution (most-specific-subsumer-wins per D1.6-L12).
- Migrated input: same shape as `evidence-entailed-via-ncs` (Process most-specific over Occurrent in candidateCategories).
- Dispatcher output: Process target Entailed; subsumption resolves via D1.6-L12. Matches synthetic.
- **Classification:** NAN. Cleared via dispatcher path.

#### `evidence-ncs-from-curated-only` → **NAN (cleared, trivial)**

- Synthetic expected: Plausible with `CuratedReferenceIncomplete` warning.
- Migrated input: empty signature + non-curated target (`bfo:RoleSubtype_HypotheticalPricingRole`).
- Dispatcher output: `requiredNCsForTarget.length === 0` path fires; CuratedReferenceIncomplete Plausible. Matches synthetic; trivial migration.
- **Classification:** NAN. Unchanged behavior pre/post-X8.

#### `evidence-sibling-ambiguity-plausible` → **NAN (cleared with annotation-shift, BCL on Role residual)**

- Synthetic expected: Plausible across Role + Disposition candidates.
- Migrated input: signature satisfying SDC + Disposition NCs; RoleNC5 routes undetermined (v1.1+ deferred per X4 §6.4, no helper).
- Dispatcher output: Plausible at the candidate level with `evidenceAnnotations.candidateBFOCategories` listing both. Annotation structure differs from synthetic (Role partial-Plausible-with-coverage-gap on RoleNC5 vs synthetic's both-fully-satisfied). Matches synthetic disposition; differs in annotation detail.
- **Classification:** NAN with BCL-residual on RoleNC5 v1.1+. Per SME §3.3 BCL/SA distinction: annotation difference is mechanical (RoleNC5 undetermined annotation surfaces additionally), not scenario-semantic. NAN at the disposition level; BCL-residual tracked at the annotation level.

### 11.2 Summary delta

| Scenario | Pre-X8 (synthetic) | Post-X8 (dispatcher) | Classification | Bundle v6 amend? |
|---|---|---|---|---|
| `evidence-entailed-via-ncs` | Entailed | Entailed | NAN | no |
| `evidence-plausible-structured-annotations` | Plausible | Plausible | NAN | no |
| `evidence-inconsistent-disjointness-firing` | Inconsistent | Plausible | **SWC** | **YES** |
| `evidence-subsumption-wins` | Entailed (subsumption) | Entailed (subsumption) | NAN | no |
| `evidence-ncs-from-curated-only` | Plausible (CuratedReferenceIncomplete) | Plausible (CuratedReferenceIncomplete) | NAN | no |
| `evidence-sibling-ambiguity-plausible` | Plausible | Plausible (annotation differs) | NAN (BCL-residual) | no |

**Triage summary:** 5 NAN + 1 SWC. SWC count = 1 → bundle v6 authorization triggers per memo §3.5.

### 11.3 Bundle v6 amendment list — LANDED post-X8 Commit 2

| # | Scenario | Synthetic disposition (v5) | Real-inference disposition (v6) | Amendment shape |
|---|---|---|---|---|
| 1 | `evidence-inconsistent-disjointness-firing` | Inconsistent | Plausible (via multi-inheritance contradiction-wins) | Updated `expect.disposition` + `expect.explanation` (now `evidenceAnnotations.structureIsJSON`); `verifies` array realigned (D1.6-L11/L12 removed; multi-inheritance contradiction-wins refs added); negative_assertion rewritten to assert no-silent-acceptance of multi-inheritance modeling anomaly; `assertion_updated_2026_04_25` annotation appended |

**Bundle v6 amendment LANDED at Commit 2 (2026-04-25).** Authorization memo at [specs/d16/bundle-v6-authorization-memo.md](./bundle-v6-authorization-memo.md). Bundle file: [avc/fandaws-sentinel-d16-avc-bundle.json](../../avc/fandaws-sentinel-d16-avc-bundle.json) — `bundle_version: 6`; total_scenarios: 70 (unchanged); revision_history v6 entry appended. Test runner SWC-skip gate retired; scenario un-skipped; AVC suite 76/76 pass on real-inference output.

**This was the first non-empty bundle amendment list across the X4 → X8 arc.** Empty-batch persistence ended; the proof-discipline rationale for deferral (§3 + §9.3 + §10.3 conclusions) is validated — speculative authorization at any prior commit would have either codified the synthetic's structural error as permanent (option a: leave Inconsistent expectation), or codified a partial-coverage outcome (option b: amend to Plausible-with-OWL-DERIVED-undetermined when Bucket C wasn't yet landed). Real-inference under full coverage produced the load-bearing rationale.

### 11.4 Honest-discipline framing post-X8

X8 migration **clears 5 of 6 BCL+NAN scenarios via dispatcher-path coverage** (5 NAN). The 1 SWC is surfaced honestly — real inference catches what synthetic missed.

Three architectural payloads attested by X8 landing:

1. **Bundle finally moves.** Empty-batch persistence across X4-X7 was honest-discipline; X8 surfaces the load-bearing amendment cause and the bundle moves v5 → v6.
2. **Real inference catches synthetic structural errors.** The `evidence-inconsistent-disjointness-firing` SWC validates the dispatcher's P4 contradiction logic — the synthetic pre-asserted satisfaction without verification; real dispatcher correctly refuses.
3. **TEMPORARY MIGRATION SUPPORT seam closes.** Per §11.5 below, the seam collapses to required-prologSession contract; iteration-mechanics legacy path stays per X4 §2.7.

### 11.5 TEMPORARY MIGRATION SUPPORT seam — closure attestation

Per X8 memo §4 Option I (LOCKED 2026-04-25): the dispatcher path now **requires** prologSession at runtime. Absence throws `TypeError`. The seam comment at `pipeline-orchestrator.js:397-426` renamed from "TEMPORARY MIGRATION SUPPORT" to "DUAL-MODE: dispatcher path requires prologSession; legacy iteration-mechanics path stays per X4 §2.7."

The dual-mode clarifies that the TWO modes (dispatcher + iteration-mechanics) are **independent, permanent** rather than transitional. Iteration-mechanics path stays for SYNTHETIC_ITERATION scenarios (Band 2 mechanics); dispatcher path serves all NC-inference invocations. Future external callers (Workbench v0.2, Node-harness) MUST supply prologSession when invoking the dispatcher path; absence is misuse, surfaced via TypeError.

### 11.6 Outstanding queue post-X8

- **SME:** bundle v6 authorization memo drafted reactive on Commit 1 landing (this triage delivery). Memo enumerates the single SWC entry per §11.3 with rationale. PO ACKs.
- **Developer:** Commit 2 lands bundle v5 → v6 amendment commit per SME memo, unskips the SWC scenario.
- **PO:** v6 ACK touchpoint at Commit 2.
