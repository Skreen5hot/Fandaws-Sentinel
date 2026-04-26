# SME-D16-X8 — AVC Migration Cycle (Option E Sequel to X7)

**Status:** DRAFT v1 2026-04-25. Standard cycle: this SME memo → developer ACK + implementation plan → PO pre-code confirmation → implementation. PO routed Option E 2026-04-25 immediately post-X7 closure.
**Owner:** SME. PO routing rationale: maintains architectural momentum from X7; X8 surfaces real bundle v6 amendments (the empty-batch persistence across X4-X7 has been the honest discipline outcome; X8 is where the bundle finally moves).
**Consumes:** X4 memo §6.5 (Band 9 Integration queued); X4 memo §7.1 triage rubric (extended in X4 Commit 4 §10 with BCL); X5 + X6 + X7 closure entries; `tests/avc/d16-runner.test.js:1624-1715` SYNTHETIC_NC_SATISFACTION allowlist (12 scenarios); `tests/avc/d16-runner.test.js:1721+` SYNTHETIC_ITERATION (6 scenarios — out of dispatcher migration scope per X4 triage §2.7).
**Consumed by:** developer X8 implementation cycle; SME bundle v6 authorization memo (drafted reactive on SWC count); future Workbench v0.2 work landing on a fully-migrated dispatcher path with real SWC behavior baked in.
**Scope fence:** migrate the 6 dispatcher-relevant SYNTHETIC_NC_SATISFACTION scenarios from legacy `satisfiedNCs` Set inputs to dispatcher-path inputs (signature + prologSession) per X7 integration surface; classify post-migration disposition shifts per §7.1 rubric (extended with BCL); surface real SWC count; draft bundle v6 authorization at landing if SWC > 0; retire legacy SYNTHETIC_NC_SATISFACTION path post-migration. **Out of scope:** SYNTHETIC_ITERATION 6 scenarios (Band 2 iteration mechanics, untouched per X4 triage §2.7); real `.owl` parser harness; Workbench v0.2 UI; v1.1+ RoleNC5 helper.

**Tag legend** unchanged from prior X-series memos.

---

## Load-bearing context

X8 is the cycle that **moves the bundle**. Across X4 → X5 → X6 → X7, the bundle v6 amendment list has been empty — every BCL-classified scenario stayed on the legacy path with synthetic allowlists pre-asserting Option-C-consistent dispositions. That was the honest-discipline outcome: amending speculative-batches ahead of coverage codifies partial state as permanent.

X8 is where coverage is no longer partial (post-X7 dispatcher integration consumes Bucket A + Bucket B + Bucket C inference). Migrating scenarios from synthetic-allowlist inputs to dispatcher-path inputs exercises real OWA-preserving inference end-to-end. Scenarios where the synthetic allowlist's pre-asserted disposition diverges from real-inference output produce **SWC** — synthetic-wrong-corrected. SWC count > 0 triggers bundle v6 authorization.

This is also where the **TEMPORARY MIGRATION SUPPORT seam** at `pipeline-orchestrator.js:397` retires. The seam exists to accommodate legacy callers that don't supply prologSession; X8 migrates all in-tree callers to dispatcher-path, leaving no legacy consumer; the seam can collapse to a single explicit-prologSession contract (or stay as defensive scaffolding for external callers — design surface for X8).

---

## Executive summary

**LOCKED-FROM-PRINCIPLE:**

- Migration target: 6 dispatcher-relevant scenarios in `tests/avc/d16-runner.test.js` SYNTHETIC_NC_SATISFACTION allowlist (lines 1624-1715). 6 SYNTHETIC_ITERATION scenarios stay on legacy path (out of dispatcher migration scope per X4 triage §2.7).
- Migration shape per scenario: replace `satisfiedNCs: [...]` Set input with `(signature, ancestorChain, prologSession)` triple consumed by dispatcher's OWL-DERIVED + CURATED-NC + OWL-DIRECT pattern matchers.
- Post-migration triage per §7.1 rubric extended with BCL: each migrated scenario classified SWC / RID / SA / NAN / BCL based on actual dispatcher disposition vs synthetic-expected.
- Bundle v6 authorization memo drafted by SME at X8 landing if SWC count > 0; PO ACKs the bump; bundle v5 → v6 lands in follow-on commit (F4-analogous staging from bundle v5 precedent).
- Legacy SYNTHETIC_NC_SATISFACTION path retires post-migration. The `tests/avc/d16-runner.test.js:184` synthetic-lookup at handler entry collapses to dispatcher invocation; the `:1624-1715` allowlist deletes.
- TEMPORARY MIGRATION SUPPORT seam disposition: design surface (§4.2 below).

**SME-PROPOSED — PENDING-DEVELOPER-ACK:**

- §3.1 Per-scenario signature construction strategy (developer authors realistic CAU signatures matching synthetic allowlist intent; SME reviews at implementation plan).
- §3.2 prologSession lifecycle in test harness (per-scenario init/teardown vs per-suite shared session).
- §4.2 TEMPORARY MIGRATION SUPPORT seam disposition (collapse to required-prologSession contract, OR retain as defensive seam for external callers).
- §5 Band 9 Integration AVC scenarios surfacing — developer flags whether X8 produces Band 9-eligible scenarios that warrant bundle v6 expansion beyond SWC amendments.

**OPEN:**

- Bundle v5 → v6 amendment text drafting (deferred to bundle v6 authorization memo, drafted by SME post-X8 landing reactive on actual SWC count).
- v1.1+ RoleNC5 v1.1 scoping cycle (independent track; X8 closure does not block).

**Scope OUT:**

- SYNTHETIC_ITERATION 6 scenarios (Band 2 iteration mechanics, untouched per X4 triage §2.7).
- Real `.owl` parser harness (Option H, downstream).
- Workbench v0.2 UI (Option G, downstream).
- v1.1+ RoleNC5 helper (deferred per X4 §6.4).
- Any reasoning-semantic changes to X6 helpers, X7 integration, or X4 dispatcher patterns.

**Next action:** developer ACK + implementation plan addressing §3.1 / §3.2 / §4.2. PO pre-code confirmation. Implementation expected ~1 week per X8 §6 staging.

---

## 1. Problem statement

The 12 scenarios in `tests/avc/d16-runner.test.js:1624-1715` SYNTHETIC_NC_SATISFACTION allowlist consume a `satisfiedNCs` Set as if it were the dispatcher's output. The allowlist mechanism (per `tests/avc/d16-runner.test.js:184` synthetic-lookup) routes through `evaluateCAU` directly, bypassing the dispatcher entirely. Under Bucket A + B + C coverage now landed (X4 → X7), the dispatcher CAN produce the same `satisfiedNCs` Set from real signature inputs — the allowlist is a scaffold from when the dispatcher didn't exist or didn't have sufficient helper coverage.

**X8 retires the scaffold.** Replace each scenario's `satisfiedNCs: [...]` with `(signature, ancestorChain, prologSession)` inputs that drive the dispatcher to produce equivalent (or different — that's the SWC opportunity) disposition outputs.

**Per-scenario migration concretely:**

For `evidence-entailed-via-ncs` (lines 1625-1640):
- Synthetic input: `targetCategory: 'bfo:Process'`, `satisfiedNCs: [ProcessNC1-4, OccurrentNC1-3]`.
- Migrated input: realistic Process-shaped CAU signature whose dispatcher evaluation produces all 7 NCs satisfied. Includes `bfo:hasParticipant some bfo:Continuant` (ProcessNC2 OWL-DIRECT P3); ancestor chain with `bfo:Process` (ProcessNC1 P1 cascade affirms via Occurrent ancestors); `bfo:hasFirstInstant`-style restrictions (ProcessNC4 helper); `bfo:occupiesTemporalRegion some bfo:OneDimensionalTemporalRegion` (ProcessNC3 OWL-DERIVED helper); etc.
- Post-migration disposition: dispatcher evaluates → trichotomy → evaluator routes → expected Entailed (matches synthetic) or differs (SWC).

The migration's per-scenario complexity varies. `evidence-ncs-from-curated-only` (lines 1687-1695) is trivial — empty `satisfiedNCs` is already what the dispatcher produces for an unknown target via `requiredNCsForTarget.length === 0` path; minimal migration.

`evidence-sibling-ambiguity-plausible` (lines 1697-1714) is the most complex — RoleNC5 v1.1+ deferred means dispatcher routes RoleNC5 undetermined → Role candidate trichotomy includes undetermined → may shift disposition annotations relative to synthetic. Likely surfaces SA (sme-adjudicated) or BCL post-migration.

---

## 2. Per-scenario migration analysis

**SME-proposed predictions; subject to actual dispatcher behavior at landing.**

### 2.1 `evidence-entailed-via-ncs` → expected NAN or SWC

- **Synthetic expected:** Entailed.
- **Post-X7 dispatcher prediction:** all 7 required NCs determinable via Bucket A (ProcessNC1/2/4 OWL-DIRECT + Wave 0/1/2 helpers) + Bucket B (X5 helpers) + Bucket C (X6 helpers wired via X7). Should produce Entailed if signature shape matches synthetic intent. Likely **NAN**.
- **SWC risk:** if real OWA-preserving inference on the constructed signature surfaces a presence-derivable absence-required-NC (e.g., ProcessNC3 ZeroDim contradiction in the constructed restriction set), disposition shifts to Plausible. Developer's signature construction discipline determines outcome.

### 2.2 `evidence-plausible-structured-annotations` → expected NAN

- **Synthetic expected:** Plausible with partial-match annotations.
- **Post-X7 prediction:** partial NC satisfaction produces Plausible by D1.6-L10. Annotation structure (which NCs satisfied, which unsatisfied, which undetermined) may shift slightly from synthetic but disposition stable. Likely **NAN** or partial-NAN/partial-BCL.

### 2.3 `evidence-inconsistent-disjointness-firing` → expected NAN (post-X7)

- **Synthetic expected:** Inconsistent via cross-category disjointness (Continuant + Occurrent fully satisfied → disjoint pair fires).
- **Post-X7 prediction:** Continuant fully-satisfiable post-X6 (ContinuantNC3 helper; ContinuantNC1/NC2 OWL-DIRECT). Occurrent fully-satisfiable post-X6 (OccurrentNC2 OWL-DERIVED helper; NC1 OWL-DIRECT; NC3 X5 helper). Cross-category disjointness path fires. Likely **NAN**.
- **Pre-X6 was BCL**; post-X7 production-path now reaches Inconsistent via cross-category-NC-fully-satisfied path. This is the X4 §10 re-triage's NAN classification operationalized.

### 2.4 `evidence-subsumption-wins` → expected NAN (post-X7)

- **Synthetic expected:** Entailed via subsumption (Process most-specific over Occurrent).
- **Post-X7 prediction:** Process-target Entailed reachable post-X6 helpers + X7 wiring; subsumption-resolution logic (per D1.6-L12) operates downstream. Likely **NAN**.

### 2.5 `evidence-ncs-from-curated-only` → NAN (unchanged)

- **Synthetic expected:** Plausible with `CuratedReferenceIncomplete` warning.
- **Post-X7 prediction:** unchanged from X4/X5/X6/X7 — `requiredNCsForTarget.length === 0` path fires. **NAN**.

### 2.6 `evidence-sibling-ambiguity-plausible` → BCL or SA

- **Synthetic expected:** Plausible across both Role and Disposition candidates.
- **Post-X7 prediction:** Role requires RoleNC5 (v1.1+ deferred, no helper) → undetermined. Disposition fully determinable. Trichotomy: Role partial; Disposition determinable. Plausible at the disposition level (matches synthetic) but annotation structure may differ.
- **Classification:** likely **BCL** (Role-residual on RoleNC5 v1.1+) or **SA** if annotation structure differs in ways that change scenario semantic. SME adjudication at landing.

### 2.7 SYNTHETIC_ITERATION 6 scenarios (out of scope)

- Per X4 triage §2.7: untouched. They test iteration mechanics via `handleRunPhase1` not `evaluateCAU`. Stay on legacy path.

---

## 3. Implementation specification

### 3.1 Per-scenario signature construction strategy

**SME-PROPOSED — PENDING-DEVELOPER-ACK.** Each migrated scenario needs:

- **`signature` object** matching the CAU signature shape consumed by `extractCAUSignature` output: `existentialRestrictions`, `propertyRestrictionsAsDomain`, `disjointnessAssertions`, `equivalenceClaims`, `cardinalityRestrictions`, `hasValueRestrictions`, etc.
- **`ancestorChain`** array, transitively closed (per X7 caller-contract).
- **`prologSession`** init at scenario start; teardown at scenario end (or shared per §3.2).
- **`targetCategory`** preserved from synthetic.

**Construction discipline:** the constructed signature should produce dispatcher behavior that aligns with the scenario's *intent*, not necessarily the synthetic allowlist's *output*. If the synthetic allowlist asserted Entailed but the scenario's natural-language description says "this CAU is structurally a Process with full participation + temporal restrictions," the constructed signature should be that. If real inference then produces Plausible (e.g., ProcessNC3 ZeroDim contradiction surfaces from the chosen restriction set), that's SWC — the synthetic allowlist was an educated guess that real inference contradicts.

**Developer judgment:** signature construction is the migration's load-bearing developer work. SME reviews at implementation plan; per-scenario signature shape documented in test fixtures.

### 3.2 prologSession lifecycle in test harness

**SME-PROPOSED — PENDING-DEVELOPER-ACK.** Two patterns:

- **(A) Per-scenario init/teardown.** Each migrated scenario calls `initBucketCPrologSession` at start, `teardownPrologSession` at end. Cleanest isolation; highest setup cost (BFO axiom load per scenario).
- **(B) Per-suite shared session.** Single prologSession initialized once for the suite; all migrated scenarios share. Lower setup cost; cross-scenario assertion-isolation discipline must hold (X6 substrate guarantees this via `withCAUAssertions` / `retractAll` per scenario).

SME lean: **(B) per-suite shared session.** X6 substrate's assertion-isolation discipline already supports it; setup cost amortizes. Falls back to (A) if developer surfaces test-isolation concerns at implementation plan.

### 3.3 Post-migration triage classification

**LOCKED-FROM-PRINCIPLE per X4 §7.1 rubric extended with BCL.** Each migrated scenario classifies post-migration:

- **NAN** — synthetic matches dispatcher output. No bundle amendment.
- **SWC** — synthetic was educated guess; dispatcher produces different (correct) disposition. Bundle v6 amendment.
- **RID** — dispatcher has defect; fix in code (not a bundle amendment).
- **SA** — both defensible; SME adjudicates per-scenario.
- **BCL** — synthetic correct per premise but unreachable under partial-coverage residual (e.g., RoleNC5 v1.1+). Defer amendment until residual closes.

Triage artifact at `specs/d16/x4-avc-triage.md` extends with §11 (post-X8 migration triage) parallel to existing §9 (post-X5) and §10 (post-X6) structure.

### 3.4 Legacy path retirement

**LOCKED-FROM-PRINCIPLE.** Post-migration, the SYNTHETIC_NC_SATISFACTION allowlist deletes from `tests/avc/d16-runner.test.js:1624-1715`. The `:184` synthetic-lookup-at-handler-entry collapses to dispatcher invocation (or stays as defensive null-check; minor cleanup).

**SYNTHETIC_ITERATION (`:1721+`) stays.** Out of scope.

### 3.5 Bundle v6 authorization

**LOCKED-FROM-PRINCIPLE.** SME drafts bundle v6 authorization memo at X8 landing reactive on actual SWC count:

- **SWC count = 0** → no amendments; bundle v6 authorization memo undrafted (consistent with X4-X7 empty-batch persistence). The migration validates synthetic-allowlist disposition expectations; bundle stays v5.
- **SWC count > 0** → SME drafts authorization memo enumerating per-scenario amendments + rationale (F4-analogous to bundle v5 staging). PO ACKs the bump. Bundle v5 → v6 lands in follow-on commit outside X8's main commit scope.

---

## 4. TEMPORARY MIGRATION SUPPORT seam disposition

### 4.1 Current state

`pipeline-orchestrator.js:397` carries the TEMPORARY MIGRATION SUPPORT marker per X3 lint refinement: caller-supplies-cauSignature+bfoSignatureReference triggers dispatcher path; absence triggers legacy path. X7 extended this to OWL-DERIVED via prologSession-presence: prologSession-supplied → X6 helpers invoke; absent → undetermined.

### 4.2 Post-X8 disposition options

**SME-PROPOSED — PENDING-DEVELOPER-ACK.** Two paths:

- **(I) Collapse to required-prologSession contract.** All in-tree callers post-X8 supply prologSession (legacy SYNTHETIC_NC_SATISFACTION path retires). Seam can require prologSession; absence becomes a contract-violation throw rather than a legacy-route-to-undetermined fallback. Cleaner contract; eliminates dual-path semantics.

- **(II) Retain seam as defensive scaffolding for external callers.** Future external callers (Workbench v0.2, Node-harness, third-party consumers) may not always supply prologSession; retain absence-routes-to-undetermined as defensive default. Less clean but more permissive.

SME lean: **(I) collapse to required contract.** Reasons:
- X3-style migration affordance is meant to be temporary; X8 is the closure point.
- Future external callers SHOULD always supply prologSession when invoking the dispatcher; absence is a misuse, not a graceful-degradation path.
- Throw-not-warn discipline at the seam matches the discipline applied at OWL-DERIVED branch (X7).

If developer surfaces concern about external-caller compat at implementation plan, fall back to (II). Either is defensible.

---

## 5. Band 9 Integration AVC scenarios — surface flag

**SME-PROPOSED.** Per X4 §6.5: Band 9 "Integration" AVC scenarios are queued; bundle v6 → v7 authorization cycle expected when scenarios are authored.

X8 may surface scenarios warranting Band 9 inclusion — e.g., the cross-cascade Process test from X7 generalized to bundle-scenario form; the OWA preservation discriminating fixture from X6 elevated to AVC. Developer flags candidates at implementation plan; SME judges at landing whether they warrant Band 9 elevation (separate bundle v6 → v7 cycle, NOT bundled into X8 scope).

X8 scope: SWC amendments from migration only. Band 9 elevation: separate cycle.

---

## 6. Process pattern + suggested staging

Standard cycle:

1. ✅ This SME memo (X8 scoping).
2. ☐ **Developer ACK + implementation plan** addressing §3.1 signature construction strategy, §3.2 prologSession lifecycle, §4.2 seam disposition, §5 Band 9 candidates.
3. ☐ **PO pre-code confirmation.**
4. ☐ Implementation — suggested 2-commit staging:
   - **Commit 1:** migrate the 6 scenarios; per-scenario triage artifact at `x4-avc-triage.md` §11; legacy SYNTHETIC_NC_SATISFACTION path retirement; mechanical async/await additions.
   - **Commit 2:** bundle v6 authorization memo + bundle v5 → v6 amendment commit (if SWC > 0); seam disposition per §4.2 ruling. Reactive on Commit 1 SWC count.

Single-commit pattern acceptable if developer prefers; bundle v6 authorization stays as a separate SME-owned memo + amendment commit per F4-analogous staging precedent.

**Estimated runway:** ~1 week. Migration is mechanical (signature construction is the developer's load-bearing work; SME reviews); bundle v6 authorization is reactive to landed SWC.

---

## 7. Acceptance criteria

### 7.1 Per-scenario migration acceptance

- ✅ All 6 dispatcher-relevant scenarios migrated to dispatcher-path inputs.
- ✅ Each migrated scenario passes its assertion under dispatcher-derived disposition; if disposition shifts from synthetic-expected, classified per §3.3 rubric and documented in §11 triage extension.
- ✅ SYNTHETIC_NC_SATISFACTION allowlist deleted from `tests/avc/d16-runner.test.js`.
- ✅ SYNTHETIC_ITERATION preserved.
- ✅ Per-scenario signature construction documented inline in test fixtures; SME implementation review confirms signatures match scenario intent.

### 7.2 Triage artifact §11 extension

- Parallel structure to §9 (post-X5) and §10 (post-X6).
- Per-scenario classification (NAN/SWC/RID/SA/BCL).
- Summary delta table.
- Bundle v6 amendment list — empty-or-populated per actual SWC count.

### 7.3 Bundle v6 authorization (reactive)

- SWC count = 0 → bundle v6 authorization memo undrafted (consistent with X4-X7 empty-batch persistence).
- SWC count > 0 → SME drafts authorization memo; PO ACKs; v5 → v6 amendment commit lands.

### 7.4 Seam disposition closure

- Per §4.2 ruling, seam either collapses to required-prologSession (Option I) or retains defensive scaffolding (Option II). Disposition documented in `pipeline-orchestrator.js:397` comment + reception memo update.

### 7.5 70 AVC regression

- All Phase 1 AVC scenarios still pass.
- Migrated scenarios pass under dispatcher-derived disposition (post-migration count: 70 still, structure unchanged).

### 7.6 Reception memo update

- `provo-reception-live-commit4.md` extends with §16 (post-X8 migration addendum) parallel to §14 (X5) and §15 (X6).
- Documents legacy-path retirement.
- Documents bundle v6 disposition (drafted vs deferred).
- Confirms TEMPORARY MIGRATION SUPPORT seam disposition.

---

## 8. References

- `tests/avc/d16-runner.test.js:1624-1715` — SYNTHETIC_NC_SATISFACTION allowlist (X8 migration target).
- `tests/avc/d16-runner.test.js:1721+` — SYNTHETIC_ITERATION (out of scope per X4 triage §2.7).
- `tests/avc/d16-runner.test.js:184` — synthetic-lookup at handler entry (collapses post-migration).
- `src/core/d16/nc-dispatcher.js` — X7 dispatcher integration; post-X8 the legacy path through SYNTHETIC_NC_SATISFACTION retires.
- `src/core/d16/pipeline-orchestrator.js:397` — TEMPORARY MIGRATION SUPPORT seam (§4.2 disposition target).
- `specs/d16/x4-avc-triage.md` — extends with §11 post-X8 migration triage.
- `specs/d16/provo-reception-live-commit4.md` — extends with §16 post-X8 migration addendum.
- `specs/d16/sme-d16-x4-nc-inference-integration-memo-v1.md` §6.5 (Band 9 Integration queued); §7.1 (triage rubric extended with BCL at Commit 4).
- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` §6.2 (L2 prologSession lifecycle).
- `specs/d16/sme-d16-x7-dispatcher-integration-memo-v1.md` (X7 integration; X8 consumes).
- Feedback memory: `feedback_throw_not_warn_enforcement.md` (DispatcherContractViolationError discipline applies if §4.2 routes to Option I); `feedback_proof_discipline.md` (re-triage-at-landing-not-pre-stage).

---

## 9. Reserved doors for developer pushback

- §3.1 signature construction discipline — developer authors per-scenario; SME reviews at implementation plan.
- §3.2 prologSession lifecycle (per-scenario vs per-suite) — both work; developer judgment based on test-isolation surfacing.
- §4.2 seam disposition (Option I collapse vs Option II retain) — SME lean is collapse; developer pushback welcome if external-caller compat surfaces concern.
- §5 Band 9 candidates — developer flags during implementation; SME judges at landing whether warranted; separate cycle from X8 if elevated.
- §6 staging (single commit vs 2 commits) — developer's call.

---

**Next action:** developer ACK + implementation plan. Standard cycle.
