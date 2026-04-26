# SME-D16-X6 — Bucket C OWL-DERIVED Inference (Option C Locked)

**Status:** DRAFT v1 2026-04-25. Standard-cycle: developer pre-proposal (`x6-bucket-c-scoping-pre-proposal.md`) → SME deliberation 2026-04-25 → PO ratification 2026-04-25 → this scoping memo → pending developer ACK + implementation plan → PO pre-code confirmation.
**Owner:** SME (mechanism scope locked by PO routing 2026-04-25: Option C confirmed; full 6-NC scope including SME-drafted MENC2 + ProcessNC3 contracts).
**Consumes:** developer pre-proposal 2026-04-25; SME async decision 2.1 (2026-04-21) `owa_reclassification_summary_2026_04_21`; X4 memo §5 Tau Prolog deliberation obligation; X5 re-triage §9.4 residual blocker shift; CLAUDE.md edge-canonical discipline.
**Consumed by:** developer Bucket C implementation cycle; SME-D16-X6 implementation review cycles per Wave 2 cadence; X4-X6 arc bundle v6 authorization at Bucket C closeout (first SWC opportunity).
**Scope fence:** 6 OWL-DERIVED NC implementations under Option C (Tau Prolog primary + structural-correspondence fallback on step-cap exhaustion) + SME-drafted contracts for MENC2 + ProcessNC3 + D1.6-L4 closure (X4 §5 temporary divergence resolved). Out of scope: v1.1+ NCs (RoleNC5, SiteNC3, ProcessBoundaryNC3, TemporalRegionNC3); Real `.owl` parser harness; Workbench v0.2 Ingest Mode UI.

**Tag legend:** unchanged from prior X-series memos.

---

## Load-bearing context

This memo closes **two cycles in one move**: Bucket C scoping (residual OWL-DERIVED blocker from X5 re-triage §9.4) AND the Tau Prolog deliberation cycle obligation queued from X4 memo §5.2.

The convergence is the architecturally rare outcome. Option C IS D1.6-L4 implemented literally — "type-level Tau Prolog pattern entailment under background theory; fallback to structural correspondence at query granularity when 10K step cap exceeded." The X4 §5 temporary divergence — which framed Bucket A as deferring D1.6-L4 — closes naturally when Option C lands. **No D1.6-L4 amendment needed.**

This is the deliberation-cycle outcome that ratifies the spec's letter rather than amending it. Critical for the project's spec-discipline posture: D1.6-L4 has stood untouched throughout the arc; the X4 deferral was provisional; the X6 landing executes D1.6-L4 as written, finally.

Equally critical: Option C is **not a fresh choice**. SME async decision 2.1 (2026-04-21) reclassified ICNC2/ICNC3/IENC2/OccurrentNC2 to OWL-DERIVED with `owa_helper_contract` fields drafted as Option-C-shaped (Tau Prolog primary + structural-correspondence fallback). The pre-proposal §2 confirmed 4 of 6 NCs already have these contracts curated. Picking Option C **consummates** prior architectural commitments; picking Option A or B would have **reversed** SME async decision 2.1.

---

## Executive summary

**Locked from PO routing 2026-04-25:**

- **Mechanism: Option C** — Tau Prolog primary with structural-correspondence fallback on 10,000-step cap exhaustion. Per drafted `owa_helper_contract` fields for 4 NCs; SME drafts contracts for MENC2 + ProcessNC3 in this memo (§4–§5).
- **D1.6-L4 stands** — no spec amendment. X4 §5 temporary divergence closes.
- **Tau Prolog deliberation cycle resolved** — X4 §5.2 obligation closed by this memo's Option C ratification.
- **Step cap = 10,000** — match Phase D2 D-12 (`hornInferenceStepCap`) for project consistency.
- **Tau Prolog session lifecycle: per-orchestrator-session** — match X3 §3.9 session-scoped adapter discipline. BFO axioms loaded once per session; CAU assertions added incrementally per CAU within session; teardown at session end.
- **Full 6-NC scope** — ICNC2, ICNC3, MENC2, IENC2, OccurrentNC2, ProcessNC3. ProcessNC3 mandatory for Bucket C value claim (`prov:Activity` is Process; ProcessNC3 in Process required-NC set); MENC2 incremental.
- **Re-triage at landing, not pre-staging** — consistent with X4/X5 discipline. Bundle v6 authorization memo drafted at Bucket C closeout if SWC count > 0.

**SME deliverables in this memo:**
- §4 — MENC2 `owa_helper_contract` draft
- §5 — ProcessNC3 `owa_helper_contract` draft
- §6 — Tau Prolog session integration spec at orchestrator layer
- §7 — Per-NC implementation requirements (deterministic-false-on-step-cap-exhaustion-then-structural-pass; trichotomy preservation)
- §8 — Acceptance criteria (re-triage; SWC expectation; bundle v6 trajectory)

**Pending developer ACK:** implementation plan addressing §6 lifecycle integration (how Tau Prolog session attaches to orchestrator session-init); §7 per-NC test coverage; §8 acceptance test rubric.

---

## 1. Scope — six OWL-DERIVED NCs

| # | NC | Category | Contract status pre-X6 | X6 implementation source |
|---|---|---|---|---|
| 1 | ICNC2 | bfo:IndependentContinuant | Drafted in signatures file | Implement per drafted contract |
| 2 | ICNC3 | bfo:IndependentContinuant | Drafted (references ICNC2) | Implement per drafted contract |
| 3 | MENC2 | bfo:MaterialEntity | NOT drafted | SME draft inline §4 |
| 4 | IENC2 | bfo:ImmaterialEntity | Drafted with full structural-correspondence fallback rule | Implement per drafted contract |
| 5 | OccurrentNC2 | bfo:Occurrent | Drafted | Implement per drafted contract |
| 6 | ProcessNC3 | bfo:Process | NOT drafted | SME draft inline §5 |

**Shared infrastructure:** `owa_absence_check/3`, `owa_absence_check_property/2`, `owa_disjointness_check/2` helpers cited in the four pre-drafted contracts. These need implementation as part of Bucket C; their semantics are specified in the contracts but the predicates themselves don't exist in code yet.

---

## 2. Tau Prolog primary path — engine integration

### 2.1 Engine

`tau-prolog` package already in tree (Phase D2 dependency); browser-bundled at `docs/js/tau-prolog.js` and Node-importable via npm. **No new runtime dependency for D1.6 reasoning.** Edge-canonical posture preserved.

### 2.2 Background theory

Each Tau Prolog session loads:

- **BFO 2020 axioms** — class hierarchy, disjointness assertions, property-domain/range, restriction patterns. Sourced from `bfo-signatures-v1.0.json` (BFO-OWL extraction) + the curated Disjointness Map.
- **Helper predicates** — `owa_absence_check/3`, `owa_absence_check_property/2`, `owa_disjointness_check/2`, `cau_consistent_with/3`, `cau_has_matter_constitution_compat/1` (defined per §4 below), and any predicates the drafted contracts cite.
- **Session-scoped CAU assertions** — added incrementally per CAU as `evaluateNCSatisfaction` is called for that CAU.

### 2.3 Per-NC query shape (LOCKED-FROM-PRINCIPLE)

For each OWL-DERIVED NC:

1. Dispatcher invokes `evaluateOwlDerived({nc, cauIRI, cauSignature, ancestorChain, prologSession, state})`.
2. Helper assembles per-CAU assertions (axioms from CAU's signature) into the session.
3. Helper executes the NC's `body_draft` query under the 10,000-step cap.
4. **Three outcomes:**
   - **Query succeeds** within cap → `result: true` (NC satisfied per OWA derivation).
   - **Query fails** within cap → `result: false` (NC not satisfied).
   - **Step cap exhausted** → invoke structural-correspondence fallback per the NC's contract.
5. Trichotomy mapping at dispatcher: `result: true` → `satisfied`; `result: false` → `unsatisfied`; **never `undetermined`** for OWL-DERIVED NCs under Option C (the fallback layer guarantees a deterministic decision).

**This is the architectural difference from Bucket A's OWL-DERIVED stub:** under Bucket A, OWL-DERIVED routed `undetermined` because the inference layer didn't exist. Under Bucket C, the inference layer + fallback together produce `satisfied` or `unsatisfied` deterministically.

### 2.4 Trichotomy implications

Bucket C eliminates OWL-DERIVED → `undetermined` routing for the 6 in-scope NCs. The dispatcher's `undetermined` partition shrinks. BCL scenarios that blocked on OWL-DERIVED ancestor cascade (per X5 re-triage §9.1) clear to determinable outcomes — Entailed if all required NCs satisfied; Plausible if some unsatisfied; Inconsistent if disjointness fires.

**Out-of-scope OWL-DERIVED NCs remain `undetermined`.** Only the 6 in-scope NCs route through Bucket C; any other OWL-DERIVED NCs in the signatures file (currently none beyond these 6) would still route `undetermined` until subsequent cycles.

---

## 3. Structural-correspondence fallback path

### 3.1 Fallback trigger

**LOCKED-FROM-PRINCIPLE.** Step-cap exhaustion is the only fallback trigger. Tau Prolog query failures (predicate undefined, malformed assertion) are **not** fallback triggers — they are dispatcher-contract violations and route through `DispatcherContractViolationError` per the throw-not-warn discipline (`feedback_throw_not_warn_enforcement.md`).

Step-cap exhaustion specifically signals "this query is too expensive under the current background theory + assertions"; structural-correspondence is the deterministic-bounded alternative. Predicate-undefined signals "implementation defect"; throwing surfaces the defect at the closest point to root cause.

### 3.2 Per-NC fallback (LOCKED-FROM-PRINCIPLE for the 4 contract-drafted NCs; SME-drafted in §4–§5 for the 2 remaining)

Each NC's structural-correspondence fallback rule must be a **bounded structural walk** over the CAU's signature + ancestor chain. No recursion that could itself exceed reasonable bounds; no implicit reasoning steps that recreate the cost the cap was meant to bound.

For ICNC2/ICNC3/IENC2/OccurrentNC2: contracts already drafted in signatures file. Implementation reads contract, executes the structural rule, returns deterministic `result: true | false`.

For MENC2: see §4. For ProcessNC3: see §5.

### 3.3 Provenance attestation

**LOCKED-FROM-PRINCIPLE.** When fallback fires, the helper's `evidence` field includes a `fallbackUsed: true` annotation per the signatures file's `step_cap_fallback` note ("Structural correspondence is not a silent pass — it is logged with a FallbackUsed annotation on the CAU's evidence record"). This surfaces fallback rate as observable signal; consistent rate of fallback firing on a given NC suggests the Tau Prolog body needs simplification, not silent acceptance.

---

## 4. SME-drafted contract — MENC2

**Predicate:** `nc_me_nc2(CAU)`
**body_draft:** `cau_consistent_with(CAU, 'bfo:occupiesSpatialRegion', _), cau_has_matter_constitution_compat(CAU).`

### 4.1 owa_helper_contract (SME draft 2026-04-25)

```
nc_me_nc2(CAU) succeeds iff
  cau_consistent_with(CAU, 'bfo:occupiesSpatialRegion', _) succeeds AND
  cau_has_matter_constitution_compat(CAU) succeeds.

cau_consistent_with(CAU, Property, Filler) succeeds iff
  derivable_under_background_theory(cau_admits_property_restriction(CAU, Property, Filler))
  succeeds within step cap, OR
  structural_correspondence_consistency_check(CAU, Property, Filler) succeeds.

cau_has_matter_constitution_compat(CAU) succeeds iff
  derivable_under_background_theory(cau_has_continuant_part_chain_terminating_in_material(CAU))
  succeeds within step cap, OR
  structural_correspondence_matter_constitution_check(CAU) succeeds.

structural_correspondence_consistency_check(CAU, Property, Filler) succeeds iff
  signature(CAU).existentialRestrictions OR signature(CAU).propertyRestrictionsAsDomain
  contains an entry where:
    onProperty matches Property OR is sub-property of Property per BFO sub-property closure, AND
    target either matches Filler, is sub-class of Filler per ancestorChain, OR is unspecified
    (Filler == _, indicating no constraint).
  OR
  ancestorChain(CAU) contains a class whose published BFO axioms commit it to Property
  (e.g., bfo:MaterialEntity is committed to occupiesSpatialRegion via MENC2's parent rule).

structural_correspondence_matter_constitution_check(CAU) succeeds iff
  signature(CAU).existentialRestrictions OR signature(CAU).universalRestrictions
  contains an entry where:
    onProperty == 'bfo:hasContinuantPart' OR sub-property of bfo:hasContinuantPart, AND
    target is bfo:MaterialEntity, OR descendant of bfo:MaterialEntity per ancestorChain
    (matter-constitution surfaces as material-part-bearing).
  OR
  ancestorChain(CAU) contains bfo:MaterialEntity directly (CAU is structurally Material).
```

### 4.2 Rationale

MENC2 attests that a Material Entity is structurally consistent with spatial occupation through matter constitution. The predicate has two conjuncts:

1. **Spatial-occupation consistency** (`cau_consistent_with`): the CAU's signature admits `bfo:occupiesSpatialRegion` either via direct restriction declaration or via inheritance (a descendant of `bfo:MaterialEntity` inherits the commitment).
2. **Matter-constitution compatibility** (`cau_has_matter_constitution_compat`): the CAU has structural evidence of material parts. This is what distinguishes MaterialEntity from ImmaterialEntity within the IndependentContinuant subtree.

Under OWA, neither conjunct is decided by raw absence — the Tau Prolog primary path attempts derivation (e.g., a class declared as `rdfs:subClassOf bfo:MaterialEntity` inherits both commitments via background-theory reasoning even without literal declarations on the CAU). The structural fallback handles cases where the derivation exceeds the step cap by walking ancestorChain + restrictions directly.

### 4.3 Test coverage requirements

Developer test coverage at Commit landing must include:
- Direct ancestorChain has `bfo:MaterialEntity` → satisfied (both conjuncts via inheritance).
- Direct ancestorChain has descendant of `bfo:MaterialEntity` → satisfied (both conjuncts via subsumption).
- ancestorChain has `bfo:ImmaterialEntity` only → unsatisfied (matter-constitution conjunct fails).
- Signature declares `bfo:occupiesSpatialRegion` restriction but no MaterialEntity ancestor → matter-constitution determines outcome via has-material-part check.
- Adversarial: Tau Prolog step cap exhaustion on a deeply-nested has-continuant-part chain → structural fallback fires, returns deterministic answer, evidence carries `fallbackUsed: true`.

---

## 5. SME-drafted contract — ProcessNC3

**Predicate:** `nc_process_nc3(CAU)`
**body_draft:** `cau_consistent_with(CAU, 'bfo:occupiesTemporalRegion', 'bfo:OneDimensionalTemporalRegion').`

### 5.1 owa_helper_contract (SME draft 2026-04-25)

```
nc_process_nc3(CAU) succeeds iff
  cau_consistent_with(CAU, 'bfo:occupiesTemporalRegion', 'bfo:OneDimensionalTemporalRegion')
  succeeds.

cau_consistent_with(CAU, Property, Filler) shares definition with §4 (already required for MENC2).

structural_correspondence_consistency_check(CAU, 'bfo:occupiesTemporalRegion', 'bfo:OneDimensionalTemporalRegion')
succeeds iff
  signature(CAU).existentialRestrictions contains an entry where:
    onProperty == 'bfo:occupiesTemporalRegion' OR sub-property thereof, AND
    target is one of:
      'bfo:OneDimensionalTemporalRegion' (exact match), OR
      a descendant of 'bfo:OneDimensionalTemporalRegion' per ancestorChain, OR
      'bfo:TemporalRegion' (parent — admits OneDim refinement, consistent under OWA), OR
      unspecified (target == _, no contradiction with OneDim).
  AND
  signature(CAU).existentialRestrictions does NOT contain an entry where:
    onProperty == 'bfo:occupiesTemporalRegion' AND
    target is 'bfo:ZeroDimensionalTemporalRegion' (instant-only — incompatible with Process unfolding;
    reuses OccurrentNC3's strict-reading lock from X5 §3.4).
  OR
  ancestorChain(CAU) contains 'bfo:Process' or descendant (Process inherits OneDim commitment via
  background-theory reasoning).
```

### 5.2 Rationale

ProcessNC3 attests that a Process is structurally consistent with one-dimensional temporal extension. This is the Process-specific strengthening of OccurrentNC3's "unfolds through time" — Processes specifically occupy OneDim TRs (intervals), distinguished from ProcessBoundaries which occupy ZeroDim TRs (instants).

Three positive paths to satisfaction:
1. **Restriction with compatible filler** — the most direct evidence.
2. **Restriction with parent filler (`bfo:TemporalRegion`)** — admits OneDim under OWA refinement (not contradicting; awaiting derivation).
3. **Process ancestor in chain** — inheritance commits the CAU to OneDim per BFO background theory.

One negative path explicitly checks for ZeroDim contradiction: if the CAU declares `bfo:occupiesTemporalRegion some bfo:ZeroDimensionalTemporalRegion`, that's a structural contradiction with ProcessNC3 — reuses the X5 OccurrentNC3 strict-reading lock that ProcessBoundary doesn't unfold.

Under OWA: absence of `bfo:occupiesTemporalRegion` restriction is NOT positive evidence of non-Process. Tau Prolog primary attempts to derive temporal-extension from inheritance (Process ancestor → inherits commitment); fallback walks ancestorChain + restrictions deterministically.

### 5.3 Test coverage requirements

Developer test coverage at Commit landing must include:
- ancestorChain has `bfo:Process` → satisfied (Process inheritance affirms OneDim).
- ancestorChain has Process descendant (e.g., `cco:PlanExecution`) → satisfied.
- Signature has `bfo:occupiesTemporalRegion some bfo:OneDimensionalTemporalRegion` → satisfied.
- Signature has `bfo:occupiesTemporalRegion some bfo:TemporalRegion` (unspecified dimensionality) → satisfied per §5.1 path 2.
- Signature has `bfo:occupiesTemporalRegion some bfo:ZeroDimensionalTemporalRegion` ONLY → unsatisfied (negative-path contradiction).
- Adversarial: ancestorChain has `bfo:Occurrent` (parent of Process) but no Process descendant + no temporal restriction → unsatisfied (mere Occurrent insufficient; ProcessNC3 is Process-specific). Aligns with X5 ProcessNC4 asymmetric Occurrent handling §3.6.
- Tau Prolog step cap exhaustion on deeply-nested ancestor chain → structural fallback fires.

### 5.4 Cross-NC consistency note

ProcessNC3's negative-path ZeroDim contradiction parallels X5 OccurrentNC3's ProcessBoundary contradiction. Same architectural pattern: Process-flavored NCs reject zero-dim-temporal evidence. ProcessNC3 + OccurrentNC3 form a coherent Process-target Entailment package post-Bucket-C.

---

## 6. Tau Prolog session lifecycle integration

### 6.1 Lifecycle scope — per-orchestrator-session

**LOCKED per PO routing 2026-04-25.** Tau Prolog session is initialized at orchestrator session-start (analogous to X3 §3.9 session-scoped adapter pattern). Lifecycle:

1. **Session start.** Orchestrator's session-init helper creates a Tau Prolog session, loads BFO axioms + helper predicates as session-scoped facts. Background theory is loaded once.
2. **Per-CAU evaluation.** When `evaluateNCSatisfaction` is called for a CAU, the dispatcher receives the prologSession from orchestrator state. The helper assembles per-CAU assertions (signature axioms) into the session, executes the NC query, consumes the result, and removes per-CAU assertions before returning (assertion isolation across CAUs).
3. **Session end.** Orchestrator teardown destroys the Tau Prolog session.

### 6.2 Session attachment to orchestrator state

**LOCKED 2026-04-25 per developer implementation-plan ACK + SME ratification: L2 (caller-owned prologSession, explicit-per-call to dispatcher).** Two patterns originally considered:

- **(L1) Session in orchestrator's session-state object** — REJECTED. Would re-introduce the session-holder pattern X3 §3.9.1 PO routing explicitly rejected when adopting explicit-per-call adapter discipline. Orchestrator currently has no session-state object; introducing `initOrchestratorSession(prologSession)` for this single piece of state creates the inconsistency PO routed against.
- **(L2) Caller-owned prologSession passed explicitly per-call to dispatcher** — LOCKED. Caller (CLI harness, future Workbench host, test fixture) creates prologSession via `initBucketCPrologSession({bfoSignatureReference, stepCap})`, passes it through `evaluatorInput.prologSession` per orchestrator call, and tears down at end-of-session. Init cost amortizes naturally at the caller layer; orchestrator + dispatcher stay stateless.

**Architectural alignment under L2:**
- Orchestrator stays stateless per CLAUDE.md core-module discipline.
- Caller-owned lifecycle is explicit, observable, and testable in isolation.
- Per-call passing matches the X3 §3.9.1-routed adapter pattern (explicit per-call).
- prologSession-absent → OWL-DERIVED routes `undetermined` per Bucket A behavior (preserves backwards compat for TEMPORARY MIGRATION SUPPORT seam at `pipeline-orchestrator.js:397`).

**Initial SME L1 lean explicitly retracted.** Developer's pushback correctly identified that cost-amortization and location-of-state are separable concerns; my L1 reasoning conflated them.

### 6.3 Assertion isolation

**LOCKED-FROM-PRINCIPLE.** Per-CAU assertions MUST be removed before the helper returns. Otherwise CAUs evaluated later in the session would see prior CAUs' assertions, corrupting derivation.

Implementation: helper either (a) uses Tau Prolog's `retractall/1` to remove per-CAU assertions on exit, or (b) creates a temporary scope (e.g., via Tau Prolog's session forking if available) for each CAU's evaluation. Developer chooses; assertion isolation is non-negotiable.

### 6.4 Step cap

**LOCKED per PO routing 2026-04-25:** 10,000 steps per query. Match Phase D2 D-12 `hornInferenceStepCap`. Tracked as a session-config field per X4-X2 allow-list — wait, no: `hornInferenceStepCap` is for Phase D2's Tau Prolog instance. D1.6's Tau Prolog instance is a separate session per Phase 1 reasoning. Per X2 memo §3.2, D1.6's step cap is OUT of the X2 allow-list because D1.6 doesn't currently have one.

**X2 amendment trigger:** when D1.6's step cap is introduced via this memo, X2 §4.4 amendment criteria fires ("if MAX_ROUNDS is promoted from constant to config field, amendment adds it to allow-list"). Same applies to D1.6's step cap if it becomes session-configurable. For Bucket C v1, the cap is a constant 10,000; X2 amendment is not triggered. If a future cycle promotes the cap to session-config, X2 v2 amends the allow-list synchronously.

---

## 7. Per-NC implementation requirements

**LOCKED-FROM-PRINCIPLE.** Each of the 6 NC implementations must satisfy:

1. **Deterministic outcome.** `result: true | false` — never `undetermined`. The Tau Prolog primary + structural fallback together produce a deterministic answer for any CAU/signature input. Undetermined would re-introduce the X5 BCL pattern at Bucket C scope; defeats Option C's purpose.

2. **Fallback annotation.** When structural fallback fires, evidence object includes `fallbackUsed: true` + `fallbackReason: 'step_cap_exhausted'`. Per §3.3 provenance attestation.

3. **Reason enum.** Per `feedback_structured_failure_reasons.md`: distinct `reason` enum values per result path. Examples for ICNC2:
   - `result: true, reason: 'absence_derived'` (Tau Prolog primary returned true).
   - `result: true, reason: 'absence_structural_fallback'` (structural fallback confirmed absence after step cap).
   - `result: false, reason: 'inheres_in_derivable'` (Tau Prolog primary derived presence).
   - `result: false, reason: 'inheres_in_structural'` (structural fallback found presence).
   - Each NC defines its own enum following this shape.

4. **Throw on contract violation.** Tau Prolog session in invalid state (BFO axioms missing, helper predicate undefined) throws `DispatcherContractViolationError` per `feedback_throw_not_warn_enforcement.md`. Step-cap exhaustion is NOT a contract violation — it's a designed fallback trigger.

5. **Edge-canonical posture.** Implementation runs in browser + Node without modification. tau-prolog package handles this; helper code must not introduce environment-specific dependencies.

6. **Test coverage per Wave-cadence precedent.** ~15-25 tests per NC (Tau Prolog primary positive; Tau Prolog primary negative; step-cap exhaustion → fallback positive; step-cap exhaustion → fallback negative; assertion isolation across CAUs in session; edge cases per NC's specific structural patterns).

---

## 8. Acceptance criteria

### 8.1 Test categories

Bucket C landing requires:

1. **Per-NC unit tests** (6 NCs × ~20 tests = ~120 tests).
2. **Tau Prolog session integration test** — session init at orchestrator start; assertion isolation across CAUs; teardown at session end.
3. **Step-cap fallback test** — synthetically force step-cap exhaustion (deep ancestor chain, recursive disjointness check); assert fallback fires with `fallbackUsed: true` evidence; assert deterministic result.
4. **Cross-NC interaction test** — exercise a Process-target CAU; assert ProcessNC1/2/4 (Bucket A/B) + ProcessNC3 (Bucket C) all resolve; full Process required-NC set determinable.
5. **OWA preservation test** — exercise CAUs where structural absence ≠ derived absence; assert Tau Prolog primary distinguishes (e.g., a class declared subClassOf bfo:MaterialEntity has inheresIn-DERIVABLE via OWA even if not literally declared on the CAU).
6. **AVC re-triage at landing** — re-run `x4-avc-triage.md` against post-Bucket-C dispatcher coverage. Per §8.3 below.
7. **70 AVC regression** — all Phase 1 AVC scenarios still pass.

### 8.2 SWC expectation

**SME prediction (per pre-deliberation §Q5):** Bucket C is the **first SWC opportunity across the X4-X6 arc**. Reasoning: under Bucket A/B, BCL was the dominant residual category — synthetic expectations were correct per their premise but unreachable under partial coverage. Under Bucket C, **synthetic expectations may resolve to Plausible or Inconsistent under real OWA-preserving inference where they synthetically asserted Entailed**.

Concrete mechanism: a synthetic allowlist may have pre-asserted ICNC2 satisfied (presuming inheresIn absence). Under Option C, real OWA-preserving derivation may show inheresIn DERIVABLE from ancestor axioms (even if not literally on the CAU). The dispatcher then routes ICNC2 unsatisfied → Continuant target Inconsistent rather than synthetic-expected Entailed. **SWC.**

If SWC count > 0 at landing: SME drafts bundle v6 authorization memo per F4-analogous staging. PO ACKs the bump. Bundle v5 → v6 commit lands in follow-on cycle outside the Bucket C four-commit scope.

### 8.3 Re-triage at landing — not pre-staging

**LOCKED-FROM-PRINCIPLE.** Consistent with X4/X5 discipline. Pre-staging assumes outcomes; landing produces outcomes. The X5 re-triage validated this discipline — residual blocker shifted Bucket B → Bucket C in ways the X4-era enumeration didn't predict. Same risk applies to Bucket C: real OWL-DERIVED inference may produce SWC/RID/SA classifications the pre-deliberation didn't anticipate. Re-triage at landing surfaces actuals.

Triage artifact at `specs/d16/x4-avc-triage.md` extends with §10 (Bucket C re-triage), parallel to §9 (post-X5 re-triage) structure.

### 8.4 X4 §5 temporary divergence closure attestation

**LOCKED-FROM-PRINCIPLE.** Bucket C landing **closes the X4 §5 temporary divergence from D1.6-L4.** The closure is documented in:

1. This memo's §0 load-bearing context + §2 engine integration (Option C IS D1.6-L4 implemented literally).
2. X4 memo §5 status update at Bucket C landing time — divergence-closed; D1.6-L4 stands as written.
3. X6 reception memo (analogous to provo-reception-live-commit4.md §14) cites the closure explicitly.

The Tau Prolog deliberation cycle obligation from X4 §5.2 is **fulfilled by this memo's Option C ratification** + Bucket C implementation. No separate deliberation cycle artifact needed.

### 8.5 "Done" definition

Bucket C is done when:
- All 7 acceptance test categories (§8.1) pass.
- AVC re-triage classifies all post-Bucket-C scenario deltas; SWC count documented.
- If SWC count > 0: bundle v6 authorization memo drafted by SME, PO ACKs, bundle bumps in follow-on commit.
- X4 §5 divergence closure attested in X6 reception memo.
- 70 AVC regression test confirms no Phase 1 regression.

---

## 9. Process pattern — standard cycle

1. ✅ Developer pre-proposal (`x6-bucket-c-scoping-pre-proposal.md` 2026-04-25).
2. ✅ SME deliberation 2026-04-25.
3. ✅ PO ratification 2026-04-25.
4. ✅ This SME scoping memo with MENC2 + ProcessNC3 contracts inline.
5. ☐ **Developer ACK + implementation plan** addressing §6.2 lifecycle integration choice (L1/L2), §7 per-NC reason enum design, §8.1 test coverage rubric.
6. ☐ **PO pre-code confirmation.**
7. ☐ Implementation cycle — Wave-cadence with consolidated SME review of NC implementations + step-cap-fallback behavior. Suggested staging: 4-commit pattern analogous to X3/X4/X5:
   - Commit 1: Tau Prolog session lifecycle in orchestrator + helper predicate definitions (`owa_absence_check/3` family) + 4 contract-drafted NC implementations.
   - Commit 2: MENC2 + ProcessNC3 implementations per §4–§5.
   - Commit 3: Step-cap-fallback integration + assertion-isolation hardening + cross-NC interaction tests.
   - Commit 4: AVC re-triage + bundle v6 authorization (if SWC > 0) + reception memo update + X4 §5 divergence-closed attestation.

---

## 10. References

- `specs/d16/x6-bucket-c-scoping-pre-proposal.md` — developer pre-proposal 2026-04-25; lean-suppressed.
- `specs/d16/bfo-signatures-v1.0.json` — 6 OWL-DERIVED NC records + 4 drafted `owa_helper_contract` fields + `owa_reclassification_summary_2026_04_21`.
- `specs/d16/sme-d16-x4-nc-inference-integration-memo-v1.md` §5 — Tau Prolog deliberation cycle obligation (closed by this memo).
- `specs/d16/sme-d16-x5-bucket-b-memo-v1.md` (if exists; otherwise sketch trio) — X5 Bucket B precedent for helper-cadence implementation.
- `specs/d16/x4-avc-triage.md` §9 — post-X5 re-triage; Bucket C unblocking surface.
- `specs/d16/sme-d16-x3-pipeline-orchestrator-memo-v2.md` §3.9 — session-scoped state pattern reused for prologSession.
- `specs/d16/sme-d16-x2-config-allow-list-memo-v1.md` §4.4 — amendment criteria (D1.6 step cap NOT currently in allow-list; amendment fires only if cap promoted to session-config).
- Feedback memory: `feedback_throw_not_warn_enforcement.md` (DispatcherContractViolationError discipline); `feedback_absence_not_evidence.md` (OWA preservation rationale); `feedback_structured_failure_reasons.md` (per-NC reason enum design); `feedback_proof_discipline.md` (re-triage-at-landing-not-pre-stage discipline).
- Project memory: `project_d16_sme_async_decisions.md` (SME async decision 2.1 reclassification grounding); `project_d16_dp1_threshold_semantics.md` (session-config discipline).

---

## 11. Reserved doors for developer pushback

- **§6.2 prologSession integration (L1 vs L2)** — SME lean L1; developer judgment welcome with reasoning.
- **§7 reason enum design per-NC** — developer drafts; SME reviews at consolidated Commit 3 review.
- **§8.1 test coverage rubric** — developer proposes specific test counts and shapes; SME reviews at implementation plan.
- **Bucket C four-commit staging** — suggested pattern; developer may consolidate or split.
- **MENC2 + ProcessNC3 contract refinement** — drafts in §4–§5 are SME's first cut; developer implementation may surface refinements (e.g., specific predicate names, structural-correspondence rule edge cases). Surface at implementation-plan ACK; refinements lock at SME implementation review.

---

**Next action:** developer ACK + implementation plan per §9 step 5. PO pre-code confirmation per step 6. Implementation proceeds.
