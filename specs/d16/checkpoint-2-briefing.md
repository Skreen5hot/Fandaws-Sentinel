# D1.6 SME Checkpoint 2 — Briefing Document

**For:** SME (BFO / ontology alignment subject-matter expert)
**From:** Aaron Damiano + implementation team
**Date:** 2026-04-21 (prepared); session target end of Week 3
**Format:** 90 minutes, three agenda items; split across two meetings if surface area is too dense.
**Pre-read:** this document + three prep artifacts it links to.

---

## ⚑ Status: 6 agenda items resolved async 2026-04-21

SME delivered async decisions on all six substantive review items. Live session narrowed to three focused blocks. **Full live-session prep at [checkpoint-2-live-session-prep.md](checkpoint-2-live-session-prep.md).**

| Item | Async status | Briefing ref |
|---|---|---|
| **2.1** OWA/CWA reclassification | ✅ RESOLVED + APPLIED — 4 items (ICNC2, ICNC3, IENC2, OccurrentNC2) shifted to OWL-DERIVED with OWA-preserving bodies | [§1.1 below](#11-classification-judgment--the-owl-direct--owl-derived-shift-advisory-1) |
| **2.2** CURATED-NC scaffold policy | ✅ RESOLVED + APPLIED — STRICT enforcement; evaluator updated; `evidence-entailed-via-ncs` assertion updated to include ProcessNC4 | [§1.5 below](#15-scaffold-mode-curated-nc-policy--validate-or-revise) |
| **2.3** Cardinality dual-read | ✅ RESOLVED + APPLIED — intentional schema affordance; documented in extractor header | [new — Agenda 1 appendix](#cardinality-dual-read-discipline-sme-23) |
| **2.4** Teleology encoding | ✅ RESOLVED — Option B for R/F/D triad; Option C remains floor; Aaron to archive in spec | [new — below §1.5](#16-teleology-encoding-option-b-sme-24) |
| **2.5** `PIPELINE-REACTIVE-DECOUPLING` | ✅ RESOLVED — add to spec §3.3; Aaron's deliverable | [§2.3 below](#23-43-pipeline-reactive-decoupling-invariant--acknowledge-as-load-bearing) |
| **2.6** Convergence §3.2 + §4.2.1 | ✅ RESOLVED — approved as written, no changes | [§2.1, §2.2 below](#21-32-independence-claim--cluster-heuristic-demotion) |

**Live session scope:** Block 1 termination math (~25 min), Block 2 Week 2 edge cases (~20 min), Block 3 curated-process-lists schema (~15 min), Buffer (~30 min). Details in [checkpoint-2-live-session-prep.md](checkpoint-2-live-session-prep.md).

**SME-owned Week 4 deliverable:** curated process category lists for RoleNC3 / FunctionNC3 / DispositionNC3 grounding. Schema locked in Block 3.

---

**Below sections retained as historical context and for SME validation that the async applications match intent. Each resolved section carries a ✅ RESOLVED banner at the top.**

---

## Pre-Checkpoint Status (2026-04-21 update)

**SME pre-approved D1.6 v1.1.0 architecturally** ahead of this checkpoint. Verdict: *"APPROVED WITH FINAL ONTOLOGICAL ADVISORIES. You are cleared to lock D1.6 v1.1.0 and begin the implementation sprints."* Three architectural decisions explicitly confirmed:

1. Three-state evidence model (Entailed / Plausible / Inconsistent / NotApplicable)
2. Taxonomic Descent amendment for OBO-scale ingestion (NA-1.1 through NA-1.4)
3. Type-level Tau Prolog pattern entailment as reasoning primitive

SME separately reviewed the CCO demo output and confirmed three of the hardest extractor features working: sub-property closure (LS-3) on `cco:Event`, cardinality weighting on `cco:AgentRole`, and `owl:oneOf` normalization (LS-8) on `cco:Weekday`.

**Three advisories govern this checkpoint's review:**

- **Advisory 1 — OWA vs CWA impedance.** OWL is open-world; Prolog's negation-as-failure is closed-world. Negative-commitment NCs may need OWL-DERIVED reclassification with OWA-preserving bodies. Expanded from 10 min to integral to the encoding review. See [owa-cwa-prep.md](owa-cwa-prep.md).
- **Advisory 2 — Curated BFO is mission-critical source code.** All 11 SME-LOCKED items (not just 5) spot-checked individually. Gloss block prepared at [critical-ncs-gloss.md](critical-ncs-gloss.md) lets SME validate semantics without decomposing Prolog syntax.
- **Advisory 3 — Plausible Purgatory (out-of-scope for D1.6, informational only).** Entailed's raised bar produces higher Plausible rates on non-OBO ontologies. Capture Plausible proportion as a distinct metric during Week 3-4 Schema.org calibration for D2.1 scoping.

**CCO fixture fix applied (pre-session prep):** `cco:HeartPumpingFunction` and `cco:Fragility` now carry formal `bfo:0000054 (isRealizedIn)` restrictions targeting dummy process classes (`cco:PumpingProcess`, `cco:ShatteringProcess`). Prior fixture encoded realization in `rdfs:comment` only; extractor correctly ignored per Signal Discipline. Updated fixture produces distinguishable Signatures for Function vs Disposition — session demo now exercises the Role/Function/Disposition triad structurally.

---

## How To Use This Document

This is a **navigation index**, not a replacement for the source artifacts. Each section lists:

- **What to review** — the artifact under review, with file:line links
- **Decisions required from SME** — explicit asks with checkboxes for tracking
- **Quick context** — the minimum needed to review the decision without reading the full spec

Async workflow: read this briefing, open the linked artifacts in a second window, tick decision checkboxes or write comments inline, bring to the live session for discussion. Live session covers only items marked `[ DECIDE IN SESSION ]` or items with unresolved comments.

---

## Artifact Inventory

| Artifact | Path | Size | Status |
|---|---|---|---|
| BFO Signatures JSON | [specs/d16/bfo-signatures-v1.0.json](bfo-signatures-v1.0.json) | 55 NCs | v1.0, Aaron-reviewed 2026-04-21 |
| Prose reference | [specs/d16/bfo-signature-reference-v1_0.md](bfo-signature-reference-v1_0.md) | 537 lines | v1.0, SME-locked 2026-04-18 |
| Convergence argument | [specs/d16/convergence-argument-v1.md](convergence-argument-v1.md) | 220 lines | v0.2-draft, Aaron-reviewed 2026-04-21 |
| **CRITICAL NCs gloss (NEW)** | [specs/d16/critical-ncs-gloss.md](critical-ncs-gloss.md) | 11 items | For Advisory 2 expanded review |
| **OWA/CWA prep (NEW)** | [specs/d16/owa-cwa-prep.md](owa-cwa-prep.md) | 2 parts | For Advisory 1 + predicate ambiguity |
| D1.6 spec | [specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md](Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md) | 1,103 lines | v1.1.0, reference only |
| CCO demo fixture (UPDATED) | [specs/d16/fixtures/cco-core-demo-subset.ttl](fixtures/cco-core-demo-subset.ttl) | 153 triples, 12 CAUs | +isRealizedIn restrictions 2026-04-21 |
| CCO demo captured output (UPDATED) | [specs/d16/fixtures/cco-core-demo-output.txt](fixtures/cco-core-demo-output.txt) | ~230 lines | re-run 2026-04-21 with isRealizedIn |
| Extractor source | [src/core/d16/cau-signature.js](../../src/core/d16/cau-signature.js) | ~330 lines | Band 1 complete |
| Three-state evaluator | [src/core/d16/three-state-evaluator.js](../../src/core/d16/three-state-evaluator.js) | ~120 lines | scaffold (pending SME policy) |
| AVC bundle | [avc/fandaws-sentinel-d16-avc-bundle.json](../../avc/fandaws-sentinel-d16-avc-bundle.json) | 68 scenarios | 8/68 passing, 60 pending |

**Test status snapshot:** 104 suites / 2,226 passed / 71 skipped / zero regressions.

---

## Agenda Item 1 — BFO Signatures JSON Encoding Review (~40 min, expanded per Advisory 2)

**Primary artifact:** [specs/d16/bfo-signatures-v1.0.json](bfo-signatures-v1.0.json)
**Prep artifacts:** [critical-ncs-gloss.md](critical-ncs-gloss.md) (for §1.4 expanded spot-check), [owa-cwa-prep.md](owa-cwa-prep.md) (for §1.1 OWA/CWA discussion)

### 1.1 Classification judgment — the OWL-DIRECT / OWL-DERIVED shift (Advisory 1)

> ✅ **RESOLVED 2026-04-21 (SME async 2.1).** ICNC2, ICNC3, IENC2, OccurrentNC2 reclassified from OWL-DIRECT to OWL-DERIVED with OWA-preserving bodies. Remaining 6 originally-flagged items stay OWL-DIRECT. JSON updated with per-item `owa_reclassified` and `owa_reclassification_note` fields; top-level `owa_reclassification_summary_2026_04_21` records the decision. Test suite green post-change. No further action at this agenda item.


**Context:** the prose reference v1.0 summary table classifies ~12 negative-commitment NCs as OWL-DERIVED. The JSON encoding classifies them as OWL-DIRECT. Rationale for the shift is documented inline at [bfo-signatures-v1.0.json:12-18](bfo-signatures-v1.0.json#L12-L18) in `classification_notes.owl_direct_vs_derived_shift`.

**Concretely affected NCs (10 total):**

| Line | NC | Tag in JSON | Why shift was made |
|---|---|---|---|
| [L127](bfo-signatures-v1.0.json#L127) | ContinuantNC1 | OWL-DIRECT | Negative check (no temporal participation); absence is cheap to verify |
| [L140](bfo-signatures-v1.0.json#L140) | ContinuantNC2 | OWL-DIRECT | Temporal-location admission; absence-check |
| [L180](bfo-signatures-v1.0.json#L180) | ICNC2 | OWL-DIRECT | No `bfo:inheresIn` restriction; absence-check |
| [L193](bfo-signatures-v1.0.json#L193) | ICNC3 | OWL-DIRECT | No `bfo:concretizes` restriction; absence-check |
| [L260](bfo-signatures-v1.0.json#L260) | IENC2 | OWL-DIRECT | No matter as continuant part; absence-check |
| [L683](bfo-signatures-v1.0.json#L683) | OccurrentNC2 | OWL-DIRECT | Does NOT satisfy any Continuant NC; negation check |

Plus 4 inheritance-composition NCs (ICNC1, MENC1, IENC1, SDCNC1) that fold absence-checks from parents.

**Advisory 1 framing:** OWL operates under Open World Assumption (absence of statement ≠ negation). Prolog operates under Closed World Assumption (absence = false). Negative-commitment NCs currently encoded as CWA absence-assertions may need OWA-preserving reformulation. SME's rule: "Does the presence of these axioms explicitly violate a BFO necessary condition?" not "Does this CAU fail to explicitly assert everything BFO expects?"

**Full OWA/CWA analysis:** [owa-cwa-prep.md](owa-cwa-prep.md). Rewrite sketches per NC included.

**Top 4 most likely to need reclassification per Advisory 1:** ICNC2, ICNC3, IENC2, OccurrentNC2. These make active claims about what instances *don't* participate in — exactly where CWA can over-commit.

**Developer default recommendation:** reclassify those 4 to OWL-DERIVED with OWA-preserving body; leave the other 6 (which are inheritance compositions following their parents) tied to whatever the parents do.

**[ DECIDE IN SESSION ]** Per-item decision. Three routes available:
- Keep OWL-DIRECT with CWA body (fast, may over-commit on partial Signatures)
- Reclassify to OWL-DERIVED with OWA body (slower by ~30% overall, correctly handles partial Signatures)
- Keep OWL-DIRECT with OWA body (unusual; encode as ground-truth OWA rule)

Checklist per item:
- [ ] ICNC2 — decision: ____________
- [ ] ICNC3 — decision: ____________
- [ ] IENC2 — decision: ____________
- [ ] OccurrentNC2 — decision: ____________
- [ ] ContinuantNC1, ContinuantNC2 — decision: ____________
- [ ] ICNC1, MENC1, IENC1, SDCNC1 (inheritance compositions) — follow parents

### 1.2 `cau_consistent_with` helper decomposition

**Context:** the helper predicate `cau_consistent_with/3` is used by 5 NCs: MENC2, ProcessNC3, TemporalRegionNC2, OccurrentNC1, ProcessBoundaryNC2. Its current semantic conflates (a) compatibility-via-declared-axiom with (b) compatibility-via-absence-of-contradiction. Documented at [bfo-signatures-v1.0.json:16](bfo-signatures-v1.0.json#L16) in `classification_notes.cau_consistent_with_helper_naming`.

**[ DECIDE IN SESSION ]** Keep fused, or split into two predicates (`cau_declared_compatible_with` + `cau_absence_compatible_with`)?

- [ ] Keep fused with internal case-handling
- [ ] Split into two predicates — implementer renames in three-state-evaluator.js and Prolog body_drafts
- [ ] Defer to Checkpoint 3 pending calibration data

### 1.3 DispositionNC5 disjunctive encoding — SIGN OFF

**Location:** [bfo-signatures-v1.0.json:490-504](bfo-signatures-v1.0.json#L490-L504) and `classification_notes.dispositionNC5_disjunctive_form` at [L17](bfo-signatures-v1.0.json#L17).

**Prolog body:**
```prolog
( cau_has_teleological_commitment(CAU)
; ( \+ cau_has_teleological_commitment(CAU),
    cau_realization_has_triggering_circumstances(CAU) ) )
```

Aaron has reviewed and confirmed this translates the "either Function OR non-Function Disposition" semantics correctly, including the explicit negation in the second disjunct that prevents a Function from satisfying both paths simultaneously.

**[ DECIDE IN SESSION ]** SME sign-off on the Prolog rendering.

- [ ] Signed off
- [ ] Reject / revise (comment): ____________

### 1.4 Spot-check: 11 SME-LOCKED items (expanded per Advisory 2)

Advisory 2 treats the curated BFO JSON as mission-critical source code requiring adversarial peer review. All 11 SME-LOCKED items are spot-checked individually, not just the top 5.

**Plain-English glosses for all 11 items at [critical-ncs-gloss.md](critical-ncs-gloss.md).** Each item has a Prolog body + Gloss sentence pair. SME reads the Gloss, confirms it matches their intent, flags if not.

**Priority: CRITICAL (5 items — Role/Function/Disposition triad)**

| NC | Location | Discriminator | Prolog body helper | Gloss |
|---|---|---|---|---|
| RoleNC3 | [L393-405](bfo-signatures-v1.0.json#L393-L405) | Social/institutional context | `cau_realization_requires_social_institutional_context` | [gloss](critical-ncs-gloss.md#rolenc3--socialinstitutional-realization) |
| RoleNC4 | [L406-418](bfo-signatures-v1.0.json#L406-L418) | No teleology (negative from Function) | `\+ cau_has_teleological_commitment` | [gloss](critical-ncs-gloss.md#rolenc4--no-teleological-commitment-negative-from-function) |
| DispositionNC3 | [L462-475](bfo-signatures-v1.0.json#L462-L475) | Causal triggering | `cau_realization_has_triggering_circumstances` | [gloss](critical-ncs-gloss.md#dispositionnc3--causal-triggering) |
| DispositionNC4 | [L476-488](bfo-signatures-v1.0.json#L476-L488) | No social context (negative from Role) | `\+ cau_realization_requires_social_institutional_context` | [gloss](critical-ncs-gloss.md#dispositionnc4--no-socialorganizational-context-negative-from-role) |
| FunctionNC3 | [L532-545](bfo-signatures-v1.0.json#L532-L545) | Teleological commitment | `cau_has_teleological_commitment` | [gloss](critical-ncs-gloss.md#functionnc3--teleological-commitment) |

**Priority: High / Critical-v1.0-corrected (6 items)**

| NC | Location | Discriminator | Prolog body helper | Gloss |
|---|---|---|---|---|
| RoleNC5 | [L419-431](bfo-signatures-v1.0.json#L419-L431) | Loseable without destroying bearer | `cau_bearer_survives_role_loss` | [gloss](critical-ncs-gloss.md#rolenc5--loseable-without-bearer-destruction) |
| DispositionNC5 | [L490-504](bfo-signatures-v1.0.json#L490-L504) | Disjunctive (Function OR non-Function) | Disjunctive body | [gloss](critical-ncs-gloss.md#dispositionnc5--disjunctive-function-or-non-function-disposition) |
| FunctionNC4 | [L546-558](bfo-signatures-v1.0.json#L546-L558) | Design-expected realization | `cau_realization_is_design_expected` | [gloss](critical-ncs-gloss.md#functionnc4--design-expected-realization) |
| SDCNC3 | [L372-384](bfo-signatures-v1.0.json#L372-L384) | "Specifically" in specifically-dependent | `cau_bearer_is_particular_not_generic` | [gloss](critical-ncs-gloss.md#sdcnc3--bearer-is-particular-not-generic) |
| QualityNC3 | [L587-599](bfo-signatures-v1.0.json#L587-L599) | Always-realized | `cau_always_realized_when_bearer_exists` (+ negation of DispositionNC3) | [gloss](critical-ncs-gloss.md#qualitync3--always-realized-when-bearer-exists) |
| GDCNC3 | [L641-654](bfo-signatures-v1.0.json#L641-L654) | Generic vs specific | `cau_admits_multiple_simultaneous_concretizations` (+ negation of SDCNC3) | [gloss](critical-ncs-gloss.md#gdcnc3--multiple-simultaneous-concretizations) |

**[ DECIDE IN SESSION ]** Per-item: gloss matches intent, or revise.

Checklist (11 items):
- [ ] RoleNC3 gloss OK / revise: ____________
- [ ] RoleNC4 gloss OK / revise: ____________
- [ ] DispositionNC3 gloss OK / revise: ____________
- [ ] DispositionNC4 gloss OK / revise: ____________
- [ ] FunctionNC3 gloss OK / revise: ____________
- [ ] RoleNC5 gloss OK / revise: ____________
- [ ] DispositionNC5 gloss OK / revise: ____________
- [ ] FunctionNC4 gloss OK / revise: ____________
- [ ] SDCNC3 gloss OK / revise: ____________
- [ ] QualityNC3 gloss OK / revise: ____________
- [ ] GDCNC3 gloss OK / revise: ____________

### 1.4.1 Predicate ambiguity log — where implementation surfaced SME-input questions

Eight predicates have surfaced ambiguity during Week 1-2 implementation. Full catalog at [owa-cwa-prep.md Part 2](owa-cwa-prep.md#part-2--predicate-ambiguity-log-optional-task-4).

**CRITICAL / load-bearing ambiguities (need SME input):**

- **`cau_realization_requires_social_institutional_context`** (RoleNC3 discriminator) — needs a curated "social/institutional process" category list that does not yet exist. Without it, predicate cannot fire.
- **`cau_has_teleological_commitment`** (FunctionNC3 discriminator) — needs a curated "design-expected / evolved-for process" category list. Same blocker.
- **`cau_realization_has_triggering_circumstances`** (DispositionNC3 discriminator) — needs a curated "triggering-circumstances process" category list. Same blocker.

**Summary: the "curated category list" gap is the single biggest Band 4 implementation blocker.** This needs to be a Checkpoint 2 action item assigning responsibility and timeline — likely a Week 3-4 SME deliverable.

**[ DECIDE IN SESSION ]** Category-list deliverable:
- [ ] SME commits to authoring (by: ____________)
- [ ] Joint SME + Aaron authoring (kickoff date: ____________)
- [ ] Defer to Checkpoint 3 with interim placeholder behavior

### 1.5 Scaffold-mode CURATED-NC policy — VALIDATE OR REVISE

> ✅ **RESOLVED 2026-04-21 (SME async 2.2): STRICT ENFORCEMENT.** CURATED-NC required for Entailment. Scaffold evaluator policy reverted to strict; `evidence-entailed-via-ncs` assertion updated (ProcessNC4 added to expected `satisfiedConditionIRIs`); synthetic NC-satisfaction set updated in test runner; bundle version 3 retained (assertion change only, per SME direction "The scenarios themselves remain valid tests; only their assertions change"). Test suite green post-change.

### 1.6 Teleology encoding — Option B (SME 2.4)

> ✅ **RESOLVED 2026-04-21 (SME async 2.4): Option B (curated annotation property) for the Role/Function/Disposition triad.** Option C (Plausible with structured evidence annotations) remains the architectural floor for underspecified cases where axioms genuinely don't disambiguate. Aaron delegated: archive decision to D1.6 spec under Rule EV-3 or a new sub-rule so future readers know why Option B was chosen.

### 1.7 Cardinality dual-read discipline (SME 2.3)

> ✅ **RESOLVED 2026-04-21 (SME async 2.3): intentional schema affordance.** `propertyRestrictionsAsDomain` (generic-iteration read path) and `cardinalityRestrictions` (arithmetic-reasoning read path) both carry cardinality data by design. Prolog queries computing cardinality MUST read from the typed list only, or they double-count. Documented in extractor header at [src/core/d16/cau-signature.js](../../src/core/d16/cau-signature.js) near the file preamble. Not a bug; a contract enforced by convention as the Prolog predicate library grows.

**Context:** the three-state evaluator currently requires only OWL-DIRECT + OWL-DERIVED NCs for Entailment. CURATED-NC items are treated as decoration (not gating). Rationale: Band 3 AVC scenarios expect this (e.g., `evidence-entailed-via-ncs` expects only ProcessNC1/NC2/NC3 satisfied, not NC4 which is CURATED-NC). Policy is documented at [src/core/d16/three-state-evaluator.js:76-91](../../src/core/d16/three-state-evaluator.js#L76-L91).

The JSON's `tag_behavior.CURATED-NC.required_for_entailment: true` currently disagrees with this scaffold policy. They must be brought into sync.

**[ DECIDE IN SESSION ]** Which wins — the stricter JSON tag_behavior (CURATED-NC required) or the permissive scaffold policy (OWL-only required)?

- [ ] Strict: change scaffold policy to require CURATED-NC (may require updating Band 3 AVC scenarios to include CURATED-NC items in `satisfiedConditionIRIs`)
- [ ] Permissive: change JSON `tag_behavior.CURATED-NC.required_for_entailment` to false and downgrade CURATED-NC to annotation-enriching

---

## Agenda Item 2 — Convergence Argument v0.2 Review (~30 min)

**Primary artifact:** [specs/d16/convergence-argument-v1.md](convergence-argument-v1.md)

### 2.1 §3.2 Independence claim + cluster-heuristic demotion

> ✅ **RESOLVED 2026-04-21 (SME async 2.6): APPROVED as written.** Option B from Aaron's earlier feedback (honest demotion of cluster-level observation to heuristic; load-bearing CAU-independence kept as proven) was the correct move. No changes required.


**Location:** [convergence-argument-v1.md:56-71](convergence-argument-v1.md#L56-L71)

**What changed from v0.1:** separated the load-bearing CAU-level independence claim (proven; carries termination) from the unproven cluster-level oscillation observation (acknowledged as heuristic; not relied on). Aaron's preferred option-b demotion over forcing an unproven proof.

**[ DECIDE IN SESSION ]** Does the CAU-independence claim at §3.2 carry enough weight to support the termination argument in §2 without cluster-level semantics?

- [ ] Yes, sufficient
- [ ] No — request (e.g., stronger independence proof, or add a specific coupling theorem): ____________

### 2.2 §4.2.1 `EVIDENCE-DELTA-SHORT-CIRCUIT` — confirm formalization matches your ask

> ✅ **RESOLVED 2026-04-21 (SME async 2.6): APPROVED as written.** Equivalence-check semantics and cascade-scoping are precise. SME will reference this named heuristic at Checkpoint 3 (Week 8) for implementation validation. No changes required.


**Location:** [convergence-argument-v1.md:96-117](convergence-argument-v1.md#L96-L117)

**Formal statement:**
```
visited(C, cascade_id) ∧ evidence(C, t_revisit) == evidence(C, t_first_visit)
    ⇒ skip(C) at t_revisit
```

With cascade-scoped visited-set (not session-global) and deep-equality evidence comparison.

**[ DECIDE IN SESSION ]** Is this the heuristic you requested in the amendment phase?

- [ ] Matches; approve for Week 6 NA-1.4 implementation
- [ ] Refinement needed (specify): ____________

### 2.3 §4.3 `PIPELINE-REACTIVE-DECOUPLING` invariant — acknowledge as load-bearing

> ✅ **RESOLVED 2026-04-21 (SME async 2.5): APPROVED.** Aaron delegated: add formally to D1.6 spec §3.3 as a named invariant. Queueing mutations during iteration is the mathematically sound approach; mid-iteration cascade firing would obliterate the convergence guarantee.


**Location:** [convergence-argument-v1.md:119-131](convergence-argument-v1.md#L119-L131)

**The commitment:** reactive cascades never fire during bounded-fallback iteration. Mutation events queue until Phase 1 terminates. Breaking this collapses the entire termination argument in §2.

**Status:** named as `Invariant PIPELINE-REACTIVE-DECOUPLING` with future-proofing clause. Needs to be written into D1.6 spec §3.3 or §8.3 as an explicit commitment before Week 6 implementation.

**[ DECIDE IN SESSION ]** Acknowledge the invariant as load-bearing so Aaron can add it to the spec in the Week 2 revision cycle.

- [ ] Acknowledged; add to spec §3.3
- [ ] Acknowledged; add to spec §8.3 (reactive engine section)
- [ ] Reject / modify (specify): ____________

### 2.4 §5 Edge cases — anything missing

**Location:** [convergence-argument-v1.md:139-169](convergence-argument-v1.md#L139-L169)

Current coverage: empty ontology, single-CAU, cyclic subClassOf, cyclic subPropertyOf, all-NotApplicable, all-Inconsistent, concurrent mutations.

**[ DECIDE IN SESSION ]** Any edge cases missing that should be added before Week 6?

- [ ] Coverage complete
- [ ] Add: ____________

---

## Agenda Item 3 — CCO Core Signature Extraction Demo (~25 min)

**Primary artifacts:**
- Fixture: [specs/d16/fixtures/cco-core-demo-subset.ttl](fixtures/cco-core-demo-subset.ttl)
- Captured output: [specs/d16/fixtures/cco-core-demo-output.txt](fixtures/cco-core-demo-output.txt)
- Live demo runner: `node scripts/d16-cco-demo.js` (optionally with a CAU name: `node scripts/d16-cco-demo.js cco:AgentRole`)

### 3.1 What the fixture exercises

The 12-class CCO subset (updated 2026-04-21 with formal `bfo:0000054 isRealizedIn` restrictions) exercises every Band 1 extractor code path the implementation has covered so far, PLUS the Role/Function/Disposition structural distinction Advisory 2 calls out:

| CAU | What it demonstrates |
|---|---|
| `cco:Artifact` | Bare MaterialEntity subclass (sparse Signature — shows axiom-poor path is not triggered just by sparse axioms) |
| `cco:Event` | Process subclass with `rdfs:subClassOf [ onProperty cco:hasAgent; someValuesFrom cco:Agent ]` — **exercises LS-3 sub-property closure**: extractor surfaces direct `cco:hasAgent` AND inherited `bfo:hasParticipant` restrictions (the latter with `diagnosticWeight: High` per BFO inherence-bearing scope) |
| `cco:Agent` | Cross-domain restriction (owns a role) |
| `cco:AgentRole` | Role subclass with **cardinality on `bfo:inheresIn`** — demonstrates `diagnosticWeight: High` for inherence-bearing cardinality restrictions (D1.6-L1) |
| `cco:HeartPumpingFunction` | **Function subclass with TWO BFO-level property restrictions:** `bfo:inheresIn → cco:Heart` AND `bfo:isRealizedIn → cco:PumpingProcess` (design-expected process) |
| `cco:PumpingProcess` (NEW) | Process type realized teleologically — bearer biologically selected |
| `cco:Fragility` | Disposition (non-teleological) with TWO restrictions: `bfo:inheresIn → cco:Artifact` AND `bfo:isRealizedIn → cco:ShatteringProcess` (causally-triggered process) |
| `cco:ShatteringProcess` (NEW) | Process type realized by mechanical triggering, not design |
| `cco:Color` | Quality (always-realized); `bfo:inheresIn someValuesFrom` also High-weight |
| `cco:Heart` | MaterialEntity (bearer) |
| `cco:DesignativeInformationContentEntity` | GDC with `bfo:concretizes someValuesFrom` |
| `cco:Weekday` | **`owl:oneOf` normalization (LS-8)**: homogeneous 5-member enumeration → `{ kind: "enumeration", cardinality: 5, memberType: "cco:WeekdayInstance" }` |

**Key demonstration:** Function and Disposition produce structurally distinguishable Signatures because both carry `bfo:0000054 someValuesFrom` but targeting different process types. The Role/Function/Disposition cascade (per BFO Signature Reference §5) uses the target-process-type classification to resolve teleology. This fixture gives that classification real structural inputs to operate on.

### 3.2 Performance snapshot

- 135 triples parsed in ~100ms (n3.js)
- 10 Signatures extracted in ~18ms (~1.8ms/CAU)
- Full output: 204 lines of signature records plus reproducibility hashes
- **Well inside spec §2.5 expectation** (60-second budget at 100-class scale)

### 3.3 SME spot-check guide

For each of the 12 CAUs, the captured output shows the Signature in spec §2.2 field order. SME reviews whether the extracted fields match expectations for a well-aligned BFO ontology module.

**[ DECIDE IN SESSION ]** Per-CAU sign-off or flag. Spot-check priorities:

- [ ] `cco:AgentRole` — cardinality-High weight on `bfo:inheresIn` correct?
- [ ] `cco:Event` — LS-3 closure correctly surfaces both `cco:hasAgent` (direct, Medium) and `bfo:hasParticipant` (inherited, High)?
- [ ] `cco:Weekday` — LS-8 normalization produces the expected struct?
- [ ] `cco:HeartPumpingFunction` vs `cco:Fragility` — Signatures now structurally distinguishable via `bfo:0000054 isRealizedIn` targeting different process types (`cco:PumpingProcess` vs `cco:ShatteringProcess`)? Confirm both show the `existentialRestrictions` entry for `bfo:0000054`.
- [ ] `cco:PumpingProcess` vs `cco:ShatteringProcess` — both Process subclasses; do their Signatures support the later Function/Disposition cascade classification?
- [ ] `cco:DesignativeInformationContentEntity` — `bfo:concretizes` surfaces correctly (distinguishes GDC from SDC)?

### 3.4 Known gaps to acknowledge before session

- The fixture is **synthesized**, not the actual CCO Core from OSF. Replacement path is documented in the fixture header — swap the file and rerun. For Checkpoint 2, the synthesized subset is sufficient to validate the extractor's shape; full CCO Core runs at Week 4 calibration.
- Signatures include `reproducibilityHash` but no BFO Category placement yet — that's Band 4 work (Week 4-5). Checkpoint 2 is about extractor correctness, not placement accuracy.
- **Advisory 3 (Plausible Purgatory, informational only):** during Weeks 3-4 calibration against Schema.org-style inputs, implementer will capture Plausible proportion as a distinct metric for forward D2.1 scoping evidence. No action required at Checkpoint 2; flagging here so SME is aware the metric will appear in Checkpoint 3 reports.

---

## Post-Checkpoint Action Items

SME + Aaron fill in during the live session. Items roll into Week 3-4 work plan.

### Actions for Implementer

- [ ] ____________
- [ ] ____________
- [ ] ____________

### Actions for Aaron (spec updates)

- [ ] If §4.3 invariant is approved: add `PIPELINE-REACTIVE-DECOUPLING` to D1.6 spec §3.3 or §8.3
- [ ] If CURATED-NC policy changes: update JSON `tag_behavior` and prose reference §6.5 in tandem
- [ ] If negative-commitment NCs reclassified to OWL-DERIVED: update both prose §6.1-6.2 and JSON `tag` fields in tandem
- [ ] Assign Plausible-proportion metric capture to Week 3-4 calibration (Advisory 3)
- [ ] ____________

### Actions for SME

- [ ] Post-session: validate written summary of decisions against SME's in-session notes
- [ ] ____________

### Deferred to Checkpoint 3

- [ ] ____________
- [ ] ____________

---

## Appendix A — Week 1-2 Test Discipline

**Scenarios passing (8/68 D1.6 AVC):**

Band 1 — CAU Signature Extraction (7 / 13):
- `cau-sig-basic-extraction`, `cau-sig-subproperty-closure`, `cau-sig-cycle-detection`, `cau-sig-cardinality-diagnostic-weight`, `cau-sig-owl-oneof-normalization`, `cau-sig-deterministic-hashing`, `cau-property-signature-artifact-separation`

Band 3 — Three-State Evidence (1 / 7):
- `evidence-entailed-via-ncs`

**Scenarios deliberately pending:** 60. Test-first discipline: handlers are `null` in the registry or scenarios fall outside the scaffold allowlist; runner marks them `it.skip()` so the pass/fail signal tracks implementation progress cleanly rather than being polluted by "not-yet-implemented" failures.

**Full project test signal:** 104 suites, 2,226 tests pass, 71 skipped, zero regressions in the other 170 AVC scenarios (P12, P13, Phase B, C1, C2, D1, D2, Workbench).

## Appendix B — Known Scaffold Simplifications

Documented explicitly so SME knows what is provisional:

1. **CURATED-NC is annotation-only in scaffold evaluator** ([three-state-evaluator.js:76-91](../../src/core/d16/three-state-evaluator.js#L76-L91)) — decision point §1.5 above.
2. **Tau Prolog integration is not yet live** — NC satisfaction for Band 3 scenarios is supplied by per-scenario synthetic sets. Real Prolog query happens Week 4-6.
3. **BFO Signature caching + version-bump (VD-6) scenarios not implemented** — 6 Band 1 scenarios remain pending (`cau-sig-bfo-hybrid-source`, `cau-sig-bfo-cached-not-recomputed`, `version-change-bfo-triggers-reevaluation`, `version-change-curated-triggers-reevaluation`, `cache-invalidation-on-version-bump`, `reasoner-cap-fallback-query-granularity`). These need session-level cache + BFO version registry infrastructure; target Week 3.
4. **Placement decisions not yet emitted** — the extractor produces Signatures but does not yet route them through a full Phase 1 three-state placement. Band 4 work, Week 4-5.
