# Fandaws-Sentinel Phase D1.6 Architectural Correction
## Candidate Alignment Units, Logical Signatures, and the Epistemic-System Commitment

**Version:** 1.1.0 — IMPLEMENTATION READY (Taxonomic Descent + Reactive Engine amendment integrated 2026-04-18)
**Status:** SME-approved + Aaron-approved. Authorized for implementation per §11 approval gates (all closed). Calendar: 14-16 weeks to PROV-O re-run.
**Parent specs:** FANDAWS v2.1, Phase D1 spec, Phase D2 spec v1.0, Phase D1.5 spec v0.2 (superseded by this document)
**Depends on:** Phase D2 implementation (preserved with light correction per D1.6-L21) + Workbench v0.2 (adaptation at Phase 1/Phase 2 Review panels per §9.3) + IndexedDB-backed DependencyGraph infrastructure (new in v1.1.0 per §9.4)
**Drivers:** PROV-O calibration study pre-Pass-2 diagnostic; SME review cycles (D1.5 critique → four mandates; D1.6 clarifying questions → 24 locked decisions; Response C → DP-1/DP-2 split; v0.1 review → 12 tightening corrections; v0.2 review → 8 open-question resolutions; v1.0.1 BFO count correction; **v1.1.0 Taxonomic Descent + Reactive Engine amendment (D1.6-AMEND-01) addressing OBO-Foundry-scale ingestion failure**)
**Supersedes:** Phase D1.5 v0.2 (anchor-point placement approach). D1.5 is retired in favor of D1.6.
**Authorization:** SME approved v1.0 lock 2026-04-18; BFO count correction applied at v1.0.1; Amendment D1.6-AMEND-01 (Taxonomic Descent + Reactive Engine) approved by Aaron 2026-04-18 and integrated as v1.1.0. Proceed to AVC bundle v3 authoring, then implementation per §10.2 SME-in-the-loop checkpoint schedule.

**v1.1.0 Amendment Summary (D1.6-AMEND-01):** Resolves the OBO-Foundry-scale ingestion failure by introducing Taxonomic Descent with Provisional Inheritance (NA-1.1), Signal Discipline with Contradiction Severity (NA-1.2), Descendant Reconciliation (NA-1.3), and Reactive Re-evaluation Engine (NA-1.4). Converts FANDAWS from a batch pipeline to a reactive reasoning system with IndexedDB-backed DependencyGraph infrastructure. Full amendment rationale and resolution of four operational questions (dependency graph storage = IndexedDB; convergence formalization = week-1 document; reconciliationHistory = axiom-dictionary deduplication; Phase 2 = remains batch, triggers NA-1.4 on property completion) captured in the D1.6 Amendment Document (D1.6-AMEND-01).

---

## 0. Rationale and Design Principles

### 0.1 How We Got Here

This specification is the third iteration on the Phase 1 class placement problem. The sequence:

- **D1 (implemented):** Per-class heuristic placement. Every candidate class independently fingerprinted against BFO. 23/23 AVC scenarios passed. The PROV-O calibration study pre-Pass-2 diagnostic revealed the approach was architecturally wrong: real-world ontologies align at anchoring points with subclass inheritance, not per class.

- **D1.5 (drafted, not implemented):** Anchor-point placement with bottom-up axiom culmination. Proposed as v0.1, refined to v0.2 in response to the Anchor Starvation critique. SME review of the refined draft identified that the approach remained too syntactic and hierarchy-centric — roots are often modeling artifacts, hierarchy position is not the right privileged signal, and arithmetic scoring produced false precision over formal logic.

- **D1.6 v0.1 → v0.2 → v1.0 → v1.0.1 → v1.1.0 (this document):** Candidate Alignment Units with Normalized Logical Signatures evaluated through iterative cross-phase reasoning, a three-state evidence model (Entailed / Plausible / Inconsistent), and first-class epistemic-system commitments (explainability, provenance, reproducibility). v0.1 drafted from 24 locked decisions after SME clarifying-questions cycle + DP-1/DP-2 asymmetric split treatment. v0.2 integrated 12 tightening corrections from SME v0.1 review. v1.0 locked 8 final resolutions from SME v0.2 review. v1.0.1 applied BFO category count consistency correction (12 → 13 including Quality). **v1.1.0 integrates Amendment D1.6-AMEND-01 (Taxonomic Descent + Reactive Engine), addressing OBO-Foundry-scale ingestion failure surfaced during Aaron's manual artifact review — the amendment prevents systematic false-positive NotApplicable routing of horizontally axiom-poor leaf nodes in deep taxonomies such as NCBITaxon, GO, CHEBI, UBERON.**

Each iteration produced a substantially stronger architectural foundation. The corrections were caught through legitimate review processes functioning as designed: Aaron's pre-PROV-O realization, SME review of the D1.5 draft, SME's refinement of the D1.6 design principles, SME's v0.1 tightening corrections, SME's v0.2 resolutions, Aaron's BFO count catch at v1.0.1, **and Aaron's v1.1.0 OBO-scale ingestion catch that prompted the taxonomic descent amendment**. This is the specification-first, review-cycle-before-implementation methodology working at its intended discipline level.

### 0.2 The Four Mandates From SME Review

The SME review of D1.5 produced four architectural mandates that govern D1.6:

1. **Mandate 1 — Candidate Alignment Unit (CAU).** Retire "Anchor" in favor of uniform CAU treatment. Every class is a CAU. Replace shallow hierarchy-based reasoning with Normalized Logical Signature evaluation per CAU.

2. **Mandate 2 — Iterative Pipeline.** Dismantle the strict Phase 1 → Phase 2 waterfall. Class alignment and property disambiguation inform each other through bounded iteration.

3. **Mandate 3 — Three-State Evidence Model.** Replace arithmetic confidence scoring with logical evidence states: Entailed (necessary conditions satisfied), Plausible (heuristic alignment, routes to curation), Inconsistent (axiom contradictions).

4. **Mandate 4 — Unmapped Classes and BFO Level Distinction.** Accept that not every class belongs in BFO. First-class NotApplicable disposition. Replace colloquial "BFO physics" with formal constraints at specific BFO levels (Material/Immaterial, GDC/SDC, Role/Function/Disposition).

### 0.3 The Two Design Principles

Beyond the four mandates, the SME's final observations identified two architectural commitments that govern the spec at a level comparable to the mandates themselves:

**Design Principle DP-1 — Realist Compatibility Is A Diagnostic, Not A Gate.**

Not all ontologies are realist-compatible. The system detects realist incompatibility at the session level and surfaces it with structured evidence, but does NOT hard-stop pipelines on detection. An analyst may continue under explicit "exploratory mode" acknowledgement; downstream outputs carry a `compatibilityDegraded` flag in provenance. This is a first-class diagnostic capability with soft-gate semantics.

Rationale: In practice, many ontologies are partially compatible. A hard stop prevents useful partial alignment and frustrates analysts; a soft-but-formal diagnostic preserves rigor without blocking work. Schema.org is the archetypal case — its upper-level commitments resist BFO alignment, but parts of its vocabulary map cleanly. D1.6 must produce useful partial output for such cases, flagged honestly.

**Design Principle DP-2 — FANDAWS Is An Epistemic System.**

Every canonical record produced by D1.6 carries three mandatory fields that make the system's reasoning visible, traceable, and reproducible:

- `explanation` — structured axiom-level justification of the placement decision (which axioms contributed, which BFO necessary conditions were satisfied, which Tau Prolog derivation steps were traversed)
- `provenance` — iteration history, cross-CAU influences, reasoner state, timestamp
- `reproducibilityHash` — deterministic function of inputs + configuration + BFO version, enabling cross-session verification that identical inputs produce identical outputs

These fields are NOT optional implementation conveniences. A record missing any of them is non-conformant. DP-2 is a hard invariant — comparable in architectural weight to Workbench v0.2's Invariants W-1 / W-2 / W-3, enforced at every record creation point and verified through dedicated AVC scenarios.

Rationale: FANDAWS stopped being a classifier the moment it introduced Plausible dispositions, evidence bundles, iteration, and human resolution. It became a reasoning workbench. The moment that transition happened, explainability stopped being a nice-to-have and became definitional. A record without explanation is not a degraded record — it is a record of a different kind of system. If DP-2 is relaxed, the system quietly degrades into heuristic classification and the degradation is not detectable until calibration fails. Lock DP-2 fully, up front.

### 0.4 What This Spec Is Trying To Become

The combined effect of four mandates plus two design principles positions FANDAWS as the first instance in the FNSR architecture of the target pattern for the synthetic moral person project: an agent that reasons with evidence, preserves provenance, produces defensible arguments, and can be held accountable for its conclusions. The architectural shape established here cascades into subsequent FNSR services. Get this right once.

### 0.5 What This Spec Does NOT Do

D1.6 revises Phase 1 substantially and Phase 2 minimally. It does NOT:

- Fully rearchitect Phase 2 property disambiguation (SME confirmed Q6.1: Phase 2 is partially syntactic but not broken at the level Phase 1 was; a future D2.1 refinement is planned but not in D1.6 scope)
- Modify the D2 Phase 3 consistency sandbox (preserved as terminal check; Phase 3 axioms used as background theory in iterations per Q2.4)
- Modify the ingestion session management, staging records, or blocking rules at the level beyond what iteration requires
- Modify the conversational pipeline (FANDAWS v2.1, untouched)
- Introduce support for large-scale ontologies (>1MB source, >500 classes) beyond what Workbench v0.2 already permits
- Automate alignment beyond what the three-state evidence model permits (Plausible cases remain analyst-resolved)

---

## 1. Locked Decisions

This section consolidates all decisions locked during SME review. Twenty-four decisions originate from the SME Questions Document; two originate from the SME's Response C split treatment; two originate from design questions raised by the split. Twelve additional tightening refinements originate from the SME v0.1 review. Total: 28 primary locked decisions + 12 v0.2 tightening refinements, plus references to the four mandates and two design principles above.

### 1.1 Normalized Logical Signature (Mandate 1)

- **D1.6-L1 (was Q1.1; v0.2 tightened):** Signature contents include property restrictions (domain/range), characteristics, disjointness, equivalence, universal/existential restrictions, cardinality restrictions, hasValue restrictions, and `owl:oneOf` enumerations **after normalization** (per §2.3 Step 3a). Raw enumerations are excluded as noise. Cardinality and hasValue axioms are tagged with `diagnosticWeight: High` when they constrain ontological dependence and `diagnosticWeight: Low` otherwise.

- **D1.6-L2 (was Q1.2; v0.2 tightened):** Sub-property entailments are fully propagated with **explicit cycle detection**. A class's Signature includes restrictions under the declared property AND all its super-properties via rdfs:subPropertyOf closure. Cycle detection via visited-properties set during traversal; cycle-triggering edges are skipped with `cycleDetectionTriggered` flag raised. Depth bound of 10 levels applies as defense-in-depth.

- **D1.6-L3 (was Q1.3):** BFO Signature source is hybrid. Base is BFO 2020 OWL extraction. Layered on top: curated additions where OWL underspecifies, particularly for Role/Function/Disposition distinctions and GDC vs SDC boundaries. Curated additions are produced through internal draft + SME review (see D1.6-L17).

- **D1.6-L4 (was Q1.4; v0.2 tightened):** Signature comparison uses reasoner-based **type-level** pattern entailment under a constrained background theory. Tau Prolog evaluates whether one Signature's axioms entail membership in another Signature's category — NOT full axiom-graph isomorphism matching (unbounded, performance-hostile). Bounded by the Horn inference step cap (D2 PS-8, 10,000 steps per query). Fallback to weak structural-correspondence matching at query granularity for queries that exceed the cap.

### 1.2 Iterative Pipeline (Mandate 2)

- **D1.6-L5 (was Q2.1; v0.2 tightened):** Iteration structure is hybrid single-pass-with-bounded-fallback, with fallback triggered **only on contradiction or ambiguity**, not on any cross-dependency. Cross-dependencies resolve in single-pass order. Contradictions (placement violates BFO disjointness given property evidence) or ambiguities (multiple Plausible candidates with no clear resolution) trigger bounded iteration capped at 3 rounds. Non-convergence after round 3 routes affected CAUs to PendingHumanResolution.

- **D1.6-L6 (was Q2.2):** Iteration visibility is final-state-with-expandable-history. Workbench UI shows the final placement as the primary view; an expandable "iteration history" affordance surfaces the intermediate states for analysts who want to audit.

- **D1.6-L7 (was Q2.3):** Convergence failure is CAU-specific. CAUs whose placements stabilized in early rounds become Entailed/Plausible as normal. CAUs whose placements oscillated across rounds route to PendingHumanResolution with an `IterationNonConvergence` flag.

- **D1.6-L8 (was Q2.4; v0.2 tightened):** Phase 3 consistency constraints are embedded as background theory for iterations. **Phase 3 is validation, not discovery** — all constraints come from BFO + source axioms determined at session start; no new constraints are introduced during iteration or terminal validation. Phase 3 itself still runs terminally as the final consistency check.

### 1.3 Three-State Evidence Model (Mandate 3)

- **D1.6-L9 (was Q3.1; v0.2 tightened):** Entailment criterion is necessary-condition satisfaction. A CAU is Entailed as `bfo:X` when its Signature satisfies all necessary conditions of `bfo:X` AND no necessary condition of any disjoint BFO category is satisfied. **Necessary conditions must be explicitly encoded in the curated BFO Signature reference — not heuristically inferred by the implementer.** This protects against implementation drift.

- **D1.6-L10 (was Q3.2; v0.2 tightened):** Plausible is flat with **structured (not textual) evidence annotations**. No sub-categories within Plausible (no HighPlausible/MediumPlausible/LowPlausible scoring). Each Plausible CAU carries machine-readable structured annotations: candidate BFO categories list with per-category conditionsSatisfied/conditionsTotal counts, axiomsContributing IRIs, disjointViolations list (empty for Plausible), heuristicSignals list. Analyst uses annotations to prioritize; calibration studies can parse annotations programmatically.

- **D1.6-L11 (was Q3.3):** Inconsistent CAUs route to PendingHumanResolution with an `Inconsistent` disposition. Messaging frames inconsistency as "FANDAWS detected a logical conflict between this CAU's axioms and any BFO placement; the source ontology may have a modeling error" — not as classifier failure.

- **D1.6-L12 (was Q3.4; v0.2 tightened):** Mixed evidence resolution uses **ontology structure, not evidence count**. If a CAU has evidence for disjoint BFO categories → **Inconsistent immediately, no counting**. If evidence for hierarchically overlapping categories (one subsumes the other) → **most specific subsumer wins** via subsumption reasoning, not by satisfied-condition count. If evidence for sibling non-disjoint categories → Plausible with annotations.

### 1.4 NotApplicable and BFO Level Distinction (Mandate 4)

- **D1.6-L13 (was Q4.1; v0.2 tightened; v1.1.0 extended):** NotApplicable qualification is hybrid with **harder default toward NotApplicable for axiom-poor CAUs that have no inheritable taxonomic parent** (per NA-1.1 precedence added v1.1.0). Automatic routing for explicit non-BFO declarations. Axiom-poor CAUs with an `rdfs:subClassOf` parent having stabilized Entailed or Plausible disposition inherit the parent's placement via NA-1.1 (provisional) rather than routing to NotApplicable. Axiom-poor CAUs with no inheritable parent (root-level without rich axiomatization, or parent itself NotApplicable) default to NotApplicable. Analyst override path always available in both directions. The NA-1.1 precedence resolves the OBO-Foundry-scale ingestion failure where leaf-level classes in deep taxonomies (NCBITaxon, GO, CHEBI, UBERON) would otherwise be systematically false-positive-routed to NotApplicable.

- **D1.6-L14 (was Q4.2; v1.0.1 corrected):** BFO level granularity is medium — 13 upper-level BFO categories. Earlier draft text said "12" reflecting a simplification that folded Quality under SDC; the correct count per BFO 2020 and the FANDAWS target set is 13 distinct categories including Quality explicitly.

- **D1.6-L15 (was Q4.3; v0.2 tightened):** Role/Function/Disposition ambiguity is system-attempts-then-falls-back-to-Plausible. **Role/Function/Disposition distinctions MUST be explicitly encoded in the curated BFO Signature reference** (per SME v0.1 correction) or the system will fail on these distinctions. Axiom-evidence comparison identifies the category with highest axiom overlap; clear winner becomes Entailed. Where axioms don't disambiguate, Plausible with evidence annotations.

- **D1.6-L16 (was Q4.4):** NotApplicable CAUs are terminal. Neither the class nor its properties participate in downstream D2 processing. Exception: the session-level `OntologyLikelyNonRealistCompatible` diagnostic (per DP-1) aggregates NotApplicable counts across the session.

### 1.5 Implementation and Scope (Q5)

- **D1.6-L17 (was Q5.1):** BFO Signature reference production is internal-draft + SME-review. The FANDAWS team produces an initial Signature reference document extracted from BFO 2020 OWL + Arp/Smith/Spear "Building Ontologies" textbook + BFO 2020 ISO spec. SME reviews and corrects. Result is a FANDAWS-project artifact versioned alongside the BFO version. **This artifact is treated as a standard, not a helper file** (per SME v0.1 emphasis).

- **D1.6-L18 (was Q5.2; v0.2 revised):** Existing AVC preservation estimate is **~100-110 of 178 scenarios** (revised down from v0.1's ~125 estimate per SME). Iteration semantics leak into more Phase 2 scenarios than v0.1 acknowledged. D1 AVC bundle substantially rewritten. New D1.6 scenarios added per AVC bundle design.

- **D1.6-L19 (was Q5.3):** Calendar time is 10-12 weeks from mandate acceptance to PROV-O re-run. Calibration study series (Tests 2-6) shifts by approximately two months.

- **D1.6-L20 (was Q5.4):** Implementation includes SME-in-the-loop checkpoints every 2-3 weeks. Per SME v0.1: "this is the single highest ROI decision in the document."

### 1.6 Scope Boundaries (Q6)

- **D1.6-L21 (was Q6.1; v0.2 tightened):** Phase 2 scope is **light correction, not minor adaptation and not full rewrite**. Phase 2's input shape changes: it now consumes **CAU Logical Signatures** as primary input (replacing pre-computed Domain/Range BFO types). Phase 2's **lexical dimension is demoted to advisory only**; no longer drives disambiguation decisions. Phase 2's output shape unchanged; internal fingerprint logic preserved. Full Phase 2 rearchitecture (property signatures mirroring CAU Signatures with three-state evidence) deferred to planned D2.1 refinement.

- **D1.6-L22 (was Q6.2; v0.2 clarified):** "Normalized Logical Signature" is new FANDAWS-internal terminology. **For publications arising from D1.6, map to "normalized extraction of class-defining axioms (logical definition fragment)"** (per SME v0.1 publication-mapping guidance) with explicit citation of OBO Foundry's "logical definition" concept as the closest predecessor.

- **D1.6-L23 (was Q6.3):** No existing tool integration in v0.2. ROBOT, LogMap, AgreementMaker are not adopted as implementation substrate — they are designed for different alignment problems. FANDAWS is novel as a hybrid of ontology matching + realist reasoning, as the SME observed. v0.3+ may revisit integration if demand arises.

- **D1.6-L24 (was Q6.4; v0.2 revised):** Calibration study methodology adjustments. Two-pass blind/comparative preserved. Diagnostic categories refined:
  - Unit of analysis = CAU, not class (per SME v0.1)
  - Phase 1 outcomes → CAU outcomes (with iteration count per CAU, convergence vs oscillation status)
  - Iteration trace analysis added as new diagnostic dimension
  - Evidence-state distribution (Entailed/Plausible/Inconsistent/NotApplicable) surfaced as primary methodology output
  - Disagreement analysis extended: evidence bundle comparison required, not just final placement comparison
  - Anything assuming single-pass placement removed from template
  - New top-level finding: realist-compatibility assessment per session (per DP-1)

### 1.6a Amendment D1.6-AMEND-01 (v1.1.0)

- **D1.6-L25 (v1.1.0 amendment):** Taxonomic descent with provisional inheritance (NA-1.1) is a first-class architectural commitment. Horizontally axiom-poor CAUs derive BFO placement through subsumption when an inheritance path is available, avoiding the OBO-Foundry-scale ingestion failure that would result from categorical routing of leaf-level taxonomic classes to NotApplicable. Reactive re-evaluation per NA-1.4 ensures self-correction when inherited placements conflict with subsequently-ingested evidence. The amendment converts FANDAWS from a batch pipeline to a reactive reasoning system with IndexedDB-backed DependencyGraph infrastructure per §9.4. Amendment resolutions:
  - Dependency graph storage: IndexedDB backing (Edge-Canonical First Principle preserved; persistence across browser sessions; gigabyte-capable storage)
  - Convergence formalization: 1-2 page convergence argument document drafted in Week 1 of implementation, SME-reviewed before NA-1.4 implementation begins in Week 6
  - Reconciliation history storage: axiom-dictionary deduplication per Q-V1.0-4 pattern extended to reconciliation events
  - Phase 2 scope: remains batch processing in D1.6 v1.1; Phase 2 completion acts as a mutation event triggering Phase 1 NA-1.4 reactive re-evaluation; full Phase 2 reactive semantics deferred to D2.1

### 1.7 Design Principles (SME Response C + DQ)

- **D1.6-DP1:** Realist compatibility is a first-class diagnostic with soft-gate semantics. Session-level `OntologyLikelyNonRealistCompatible` disposition triggered by threshold patterns (per D1.6-DQ1). Allows continuation under analyst-acknowledged `exploratoryMode: true`. Downstream outputs carry `compatibilityDegraded: true` in provenance.

- **D1.6-DP2 (HARD INVARIANT):** Every canonical record carries mandatory `explanation`, `provenance`, `reproducibilityHash` fields. Missing any of these is non-conformant. No implementation shortcut removes these fields.

- **D1.6-DQ1:** Default DP-1 thresholds. Session triggers `OntologyLikelyNonRealistCompatible` when either `>40% of CAUs are NotApplicable` OR `>30% of CAUs are Inconsistent`. Conditions are disjunctive (OR), not conjunctive. Thresholds configurable per session in advanced configuration (parallel to weight vector in Workbench Upload).

- **D1.6-DQ2:** Compatibility-degraded flag is informational. Does not gate Phase 2 or Phase 3; they proceed normally. Flag is consumed by report-generation tooling and by future cross-session comparison in v0.3+.


---

## 2. The CAU Logical Signature

### 2.1 What A Signature Is

A Normalized Logical Signature is a comparison-ready abstraction of a CAU's logical commitments, derived deterministically from the candidate ontology's OWL axioms. It is the primary computational artifact that enables alignment reasoning in D1.6.

Conceptually, a Signature captures: what properties the class carries and with what ranges, what it is disjoint from, what it is equivalent to, what necessary conditions it imposes on its instances, and what characteristics its relationships have. It excludes incidental metadata (labels, comments, editorial annotations), which are either absorbed into provenance or ignored entirely for alignment purposes.

Terminologically, "Normalized Logical Signature" is new FANDAWS terminology (per D1.6-L22) aligned with OBO Foundry's "logical definition + closure over relevant entailments" concept. Publications use this alignment explicitly.

### 2.2 Signature Contents

A Signature for CAU `C` is a structured record with the following axiom-kind fields (per D1.6-L1):

- **`propertyRestrictionsAsDomain`** — list of `{property, restriction_kind, target}` tuples where `C` is the domain. Each tuple carries a `diagnosticWeight` tag (`High` / `Medium` / `Low`).
- **`propertyRestrictionsAsRange`** — parallel structure where `C` is the range.
- **`characteristics`** — list of characteristic declarations (transitive, symmetric, reflexive, functional, inverse-functional) on properties where `C` participates as domain or range.
- **`disjointnessAssertions`** — list of classes that `C owl:disjointWith`.
- **`equivalenceClaims`** — list of `owl:equivalentClass` declarations involving `C`.
- **`universalRestrictions`** — list of `owl:allValuesFrom` restrictions declared on `C`.
- **`existentialRestrictions`** — list of `owl:someValuesFrom` restrictions declared on `C`.
- **`cardinalityRestrictions`** — list of `owl:minCardinality`, `owl:maxCardinality`, `owl:qualifiedCardinality` restrictions. Tagged `diagnosticWeight: High` when constraining ontological dependence (e.g., exactly-1 inherence); `Low` otherwise.
- **`hasValueRestrictions`** — list of `owl:hasValue` restrictions. Tagged by diagnostic weight.
- **`normalizedEnumerations`** — list of `owl:oneOf` axioms after normalization per §2.3 Step 3a. Raw enumerations are NOT included (per SME v0.1 review correction to Q1.1). Unnormalized enumerations create Signature noise because they're frequently modeling artifacts rather than ontological commitments.
- **`subPropertyClosureUsed`** — boolean + depth metadata recording whether sub-property entailment closure was applied in computing this Signature.
- **`cycleDetectionTriggered`** — boolean flag raised if sub-property closure detected and terminated a cycle. Non-null value indicates the candidate ontology has a pathological property lattice; flag is surfaced in the Signature's provenance for analyst awareness.

### 2.3 Signature Computation

For each CAU, the Signature is computed by:

1. Extract all axioms directly involving the CAU from the candidate ontology's OWL graph.
2. For each property restriction, apply sub-property closure (D1.6-L2): if the restriction is on property `p`, and `p rdfs:subPropertyOf q`, add a corresponding restriction under `q` as well. Closure is computed with **explicit cycle detection** (per SME v0.1 review correction to Q1.2): maintain a visited-properties set during traversal; if a sub-property edge would revisit a property already in the set, the edge is skipped and `cycleDetectionTriggered` is raised on the Signature. Depth bound of 10 levels applies as defense-in-depth against non-cyclic but pathologically deep lattices.
3. Tag each axiom with its `diagnosticWeight` based on axiom kind and structural role. Cardinality restrictions on inherence-bearing properties receive `High`; most other cardinality and hasValue receive `Low`.
3a. **Normalize owl:oneOf enumerations.** Raw `owl:oneOf (A B C)` axioms are transformed into structural patterns that abstract over the specific enumerated individuals. An enumeration of N individuals becomes `{kind: "enumeration", cardinality: N, memberTypes: [type-of-A, type-of-B, type-of-C]}` where member types are inferred from the enumeration's instances. Enumerations where member types are heterogeneous or unknown are dropped from the Signature with a provenance note. This prevents identical semantic commitments expressed with different IRI sets from producing different Signatures.
4. Normalize IRIs into a canonical form (full expanded form, not prefixed) to ensure deterministic comparison.
5. Sort axiom lists by stable ordering (IRI alphabetical, within-IRI by axiom-kind canonical order) to ensure identical Signatures for identical inputs — a DP-2 reproducibility requirement.
6. Emit the Signature record with a computed content-hash for reproducibility verification.

### 2.4 BFO Signatures

BFO itself is processed through the same Signature computation (per D1.6-L3's hybrid approach). Each of the 13 upper-level BFO categories (per D1.6-L14) receives a Signature computed from BFO 2020 OWL, plus curated additions per D1.6-L17. BFO Signatures are cached alongside the Disjointness Map and rebuilt on BFO version change (Rule VD-6).

Curated additions target specifically: Role necessary-conditions (realization, bearer, realizable-entity commitments), Function necessary-conditions (teleological commitments), Disposition necessary-conditions (realization-under-triggering-circumstances), GDC vs SDC distinction (concretizes-in vs inheres-in), and Material vs Immaterial Entity distinction (spatial-region-occupation commitments). These distinctions are not fully encoded in BFO-OWL; curation is necessary.

### 2.5 Signature Comparison

Two Signatures are compared through Tau Prolog pattern entailment under a constrained background theory (per D1.6-L4 and SME v0.1 tightening). The reasoner is constrained to **type-level correspondences only** — answering "does this CAU's axiom set entail membership in BFO category X?" rather than "is this CAU's axiom graph isomorphic to that CAU's axiom graph?" Type-level reasoning is bounded by the number of necessary conditions to check (tens, not thousands); full axiom-graph matching is unbounded and blows past the 10,000-step cap on any non-trivial ontology.

Given a CAU Signature `C` and a BFO category Signature `B`:

1. Load BFO's axiomatic background theory (disjointness, structural commitments) into the reasoner.
2. Load `C`'s axioms as the query context.
3. For each necessary condition in `B`, query: "does `C`'s axiom set entail this condition under BFO's background theory?" — a type-level query bounded by the number of necessary conditions in `B` (typically 3-8 per BFO category).
4. For each disjoint category of `B`, query: "does `C`'s axiom set entail a necessary condition of this disjoint category?" (If yes, `C` is inconsistent with `B`.) — also type-level, bounded by BFO's disjointness map.
5. Reasoner operates under the Horn inference step cap (D2 PS-8, 10,000 steps).
6. Queries exceeding the cap fall back to weak structural-correspondence matching for that specific query; the fallback is recorded in the Signature comparison's `reasonerFallbackUsed` field. **Fallback is applied at the type-level query granularity, not at the axiom-graph level** (per SME v0.1 review) — this ensures fallback is a local compromise rather than a wholesale pattern-matching regression.

Explicitly excluded from the reasoner's scope:

- Full axiom-graph isomorphism matching (unbounded, performance-hostile)
- Derivation of new axioms from combinations of source and BFO axioms (would violate Q2.4: Phase 3 is validation, not discovery)
- Speculative reasoning about axioms the source ontology does not declare

This is pattern entailment, not full logical equivalence. Performance expectation: for ontologies under 100 classes, full Signature comparison for all CAU × BFO pairs completes within 60 seconds on standard hardware. For larger ontologies (PROV-O scale ~30 classes, fast; GO subsets of 500 classes, bounded but slower), chunked processing with yielding discipline (W-TY-1 from Workbench v0.2) applies.

---

## 3. The Iterative Pipeline

### 3.1 Overview

D1.6's Phase 1 operates as a hybrid single-pass-with-bounded-fallback pipeline (per D1.6-L5 and SME v0.1 tightening to Q2.1). Single-pass is the default; bounded iteration is invoked only when single-pass detects **contradiction or ambiguity**, not any cross-dependency. Cross-dependencies between class placements and property alignments are normal and resolved in single-pass dependency order. Iteration is reserved for cases where the single pass produces outcomes the pipeline cannot resolve without re-evaluation.

Specifically, the bounded-iteration fallback triggers if and only if one of these conditions is detected at Step 6:

- **Contradiction:** A CAU's revised placement (Step 5) violates a BFO disjointness axiom given the property evidence that was applied during revision. The initial Step 3 placement and the revised Step 5 placement cannot both be correct; neither may be correct.
- **Ambiguity:** A CAU's revised placement (Step 5) has multiple BFO categories tied for best match under the three-state model (all Plausible, none Entailed, none Inconsistent), and the initial Step 3 placement was also Plausible with a different candidate set. The pipeline cannot pick one without re-examining property alignments.

Cross-dependency alone (a CAU's Step 5 placement differs from Step 3 because property evidence added context, and the new placement is unambiguously Entailed under the three-state model) is NOT a trigger. Such cases are the normal operation of single-pass dependency-ordered reasoning.

### 3.2 Single-Pass Flow (Default)

For a well-behaved ontology, execution is:

**Step 1 — Parse and extract.** Ontology source parsed (n3.js / rdfxml-streaming-parser per Workbench v0.2 W-D-21). Candidate classes and properties extracted via ontology-parser.js.

**Step 2 — Compute initial Signatures.** For every candidate class, compute Normalized Logical Signature per §2.3. Signatures written to session staging with DP-2 fields (explanation of extraction, provenance of axiom sources, reproducibilityHash).

**Step 3 — Initial CAU placement.** For each CAU, compare its Signature against each of the 13 BFO category Signatures via §2.5. Produce a tentative disposition: Entailed, Plausible, Inconsistent, or NotApplicable (if axiom-poor per D1.6-L13).

**Step 4 — Property alignment (Phase 2 provisional).** Run Phase 2 property disambiguation with current class placements as context. Per D1.6-L21, Phase 2's outputs are marked `provisional: true` during iteration; they stabilize only after Phase 1 stabilizes.

**Step 5 — Revised placement using property entailments.** For CAUs where initial placement was Plausible or where property alignment produced relevant cross-dependencies (e.g., a property's domain alignment narrowed the CAU's candidate BFO categories), re-compute the placement using the now-known property alignment as additional axiomatic context.

**Step 6 — Convergence check.** Compare Step 3 placements to Step 5 placements. If no CAU's placement changed, single-pass succeeds; proceed to Step 7. If any placement changed, evaluate whether the change represents a genuine contradiction or ambiguity (per §3.1 triggers) — if yes, the single-pass flag `requiresBoundedFallback` is set and §3.3 is invoked. If the change is merely dependency-ordered refinement (e.g., a Plausible placement became Entailed after property evidence was applied), single-pass succeeds and proceeds to Step 7.

**Step 7 — Terminal consistency check (Phase 3).** Run Phase 3 consistency sandbox with finalized class placements and property alignments. Phase 3 axioms were already used as background theory during iterations (per D1.6-L8); this terminal run is the authoritative consistency verification. **Phase 3 at this step is validation, not discovery** (per SME v0.1 tightening to Q2.4): all constraints come from BFO + source axioms determined at session start. No new constraints are introduced during iteration or during terminal validation. This preserves DP-2 reproducibility by ensuring the constraint set is stable across the entire session lifecycle.

### 3.3 Bounded Iteration Fallback

When single-pass sets `requiresBoundedFallback`, iteration proceeds with:

- **Maximum rounds:** 3 iterations of (re-compute Signatures with current context → re-compare against BFO → re-run property alignment → check convergence). Round 0 is the single-pass result; rounds 1-3 are fallback iterations.
- **Convergence criterion:** No CAU's disposition changes between consecutive rounds AND no property alignment changes between consecutive rounds.
- **On convergence:** Proceed to Step 7 (terminal Phase 3).
- **On non-convergence at round 3:** Per D1.6-L7, CAUs whose placements oscillated are flagged `IterationNonConvergence` and routed to PendingHumanResolution. CAUs whose placements stabilized in early rounds retain their stabilized dispositions. Proceed to Step 7 for stabilized CAUs.

### 3.4 Iteration History and Visibility

Per D1.6-L6, the Workbench Phase 1 Review panel displays the final state as the primary view. An expandable "Iteration History" affordance surfaces intermediate rounds for analyst audit. Iteration history is included in the exported JSON bundle per session.

Iteration history records (per round): CAU IRI, Signature hash, placement disposition, BFO category assigned, evidence annotations, reasoner step count used, timestamp. Analysts reviewing the history can see exactly how each CAU's placement evolved.

### 3.5 Deterministic Ordering

To honor DP-2 reproducibility, iteration proceeds in deterministic order:
- CAUs processed in alphabetical IRI order within each round.
- BFO categories compared in fixed canonical order.
- Property alignments processed in source-ontology declaration order.

Any non-determinism in the reasoner (if present) is eliminated by fixed random seeds and ordered query submission. Identical inputs + configuration + BFO version produce identical outputs, including identical iteration histories.

---

## 4. Three-State Evidence Model

### 4.1 The Three States

Every CAU receives a placement disposition from the set {Entailed, Plausible, Inconsistent, NotApplicable}. Plus operational disposition states {PendingHumanResolution, IterationNonConvergence} which route CAUs to analyst review without committing to a final state.

### 4.2 Entailed — Necessary-Condition Satisfaction

Per D1.6-L9 and SME v0.1 tightening to Q3.1, a CAU is Entailed as `bfo:X` when:
- The CAU's Signature satisfies all necessary conditions of `bfo:X`, AND
- The CAU's Signature does not satisfy a necessary condition of any category disjoint with `bfo:X`.

**Necessary conditions must be explicitly encoded in the curated BFO Signature reference (per D1.6-L3 and D1.6-L17). They are NOT inferred heuristically by the implementer from BFO-OWL or from reading of BFO literature.** This constraint protects against implementation drift: if the implementer were allowed to infer what qualifies as a necessary condition, judgment calls would diverge from BFO-expert intent and the system would produce placements inconsistent with expert practice. The curated BFO Signature reference is the single source of truth for what counts as a necessary condition at each BFO level.

The BFO Signature reference (per §10.1) SHALL cover necessary conditions for all 12 target BFO categories including explicit treatment of:
- Role (realization commitments, bearer commitments, realizable-entity-of relationships)
- Function (teleological commitments, design-intent commitments, realizable-in-some-process relationships)
- Disposition (realization-under-triggering-circumstances, inherence-in-bearer relationships)
- GDC vs SDC (concretizes-in vs inheres-in relationships, independence from bearer)
- Material vs Immaterial Entity (spatial-region-occupation commitments, part-whole relationships)

Per SME v0.1 correction to Q4.3: distinctions in the Role/Function/Disposition family MUST be encoded in the reference with sufficient detail to disambiguate on axiom evidence, or the system will fail on these distinctions and the calibration studies will expose the failure.

Necessary-condition satisfaction is verified through §2.5 Tau Prolog pattern entailment. The reasoner's step count and the specific axioms contributing to satisfaction are recorded in the CAU's `explanation` field (per DP-2).

### 4.3 Plausible — Flat With Structured Evidence

Per D1.6-L10, Plausible is flat (no sub-categorization). A CAU is Plausible when:
- It satisfies some but not all necessary conditions of a candidate BFO category, OR
- It satisfies necessary conditions of multiple non-disjoint categories with no clear winner, OR
- Its Signature is sparse and heuristic alignment suggests a BFO category without entailment.

Each Plausible CAU carries a structured evidence annotation record. Per SME v0.1 tightening to Q3.2, **this annotation MUST be structured (machine-readable JSON), not textual (human-readable prose)**. Textual annotations are unparseable for calibration study tooling and create implementer judgment surface where structured representation is required. The schema is:

```json
{
  "candidateBFOCategories": [
    {
      "category": "bfo:Process",
      "conditionsSatisfied": 3,
      "conditionsTotal": 5,
      "satisfiedConditionIRIs": ["bfo:ProcessNC1", "bfo:ProcessNC2", "bfo:ProcessNC3"],
      "unsatisfiedConditionIRIs": ["bfo:ProcessNC4", "bfo:ProcessNC5"],
      "axiomsContributing": [
        {"axiom": "hasParticipant some Continuant", "weight": "high", "sourceIRI": "prov:wasAssociatedWith"}
      ]
    },
    {
      "category": "bfo:Occurrent",
      "conditionsSatisfied": 2,
      "conditionsTotal": 3,
      "satisfiedConditionIRIs": ["bfo:OccurrentNC1", "bfo:OccurrentNC2"],
      "unsatisfiedConditionIRIs": ["bfo:OccurrentNC3"],
      "axiomsContributing": [...]
    }
  ],
  "disjointViolations": [],
  "heuristicSignals": [
    {"signal": "lexical_match_to_bfo_process", "weight": "low", "advisory": true}
  ],
  "subsumptionResolution": {
    "applied": true,
    "winner": "bfo:Process",
    "rationale": "bfo:Process rdfs:subClassOf bfo:Occurrent; most specific subsumer wins per D1.6-L12"
  }
}
```

Required field semantics:
- `candidateBFOCategories` — non-empty array; each entry is a BFO category that satisfied at least one necessary condition
- `satisfiedConditionIRIs` / `unsatisfiedConditionIRIs` — explicit IRIs referring to necessary conditions in the curated BFO Signature reference (per D1.6-L9 v0.2 tightening). These IRIs enable downstream calibration analysis to identify exactly which conditions contributed.
- `axiomsContributing` — structured objects with axiom text, weight tag, and source IRI. NOT free-form strings.
- `disjointViolations` — empty array for Plausible (non-empty makes the CAU Inconsistent per §4.6).
- `heuristicSignals` — weak signals that do NOT drive placement (lexical matches, naming conventions). Tagged `advisory: true` to make non-contribution to decision explicit.
- `subsumptionResolution` — present when §4.6 hierarchical-overlap resolution was applied.

No arithmetic score is surfaced to the analyst. The annotations are structured evidence — machine-readable to downstream tooling, renderable to analyst in the Workbench Phase 1 Review panel. This becomes the explainability layer per SME: "Evidence must be structured, not textual. Non-negotiable."

### 4.4 Inconsistent — Routed To Analyst Review

Per D1.6-L11, Inconsistent CAUs route to PendingHumanResolution with an `Inconsistent` disposition. The CAU's `explanation` field names the specific axiom contradictions that produced inconsistency. Workbench messaging frames the finding as: "FANDAWS detected a logical conflict between this CAU's axioms and every BFO category. The source ontology may contain a modeling error, or this CAU may not be intended as a universal. Review the contradiction below."

Analyst actions from Inconsistent:
- **Override:** Manually assert a BFO placement despite inconsistency. Placement is recorded with a provenance marker `analystOverride: true` and the original inconsistency preserved in history.
- **Accept as NotApplicable:** Route the CAU to NotApplicable (analyst judgment that the CAU isn't intended as a BFO universal).
- **Defer:** Leave in PendingHumanResolution; session cannot advance until resolved.

### 4.5 NotApplicable — Terminal (with NA-1.1 Precedence per v1.1.0 amendment)

Per D1.6-L13 (v1.1.0-extended) and D1.6-L16, NotApplicable is a terminal disposition. However, v1.1.0's Rule NA-1.1 introduces a precedence check that prevents systematic false-positive NotApplicable routing of horizontally axiom-poor CAUs in deep taxonomies.

**Routing precedence for axiom-poor CAUs (v1.1.0):**

```
FOR each CAU with Signature containing fewer than 2 BFO-relevant axioms:

  IF CAU declared as skos:Concept or other explicit non-BFO declaration:
    → route to NotApplicable automatically (existing NA-1 behavior)

  ELSE IF rdfs:subClassOf parent exists AND parent has stabilized Entailed or Plausible disposition:
    → inherit parent's disposition and BFO placement as PROVISIONAL (NA-1.1)
    → CAU's validationState: "provisional"
    → CAU's dispositionReason: "Provisionally inherited via taxonomic descent from parent [Parent IRI]"
    → CAU remains subject to NA-1.2 validation against strong local signals

  ELSE IF rdfs:subClassOf parent exists but parent's disposition is NotApplicable:
    → axiom poverty confirmed via taxonomic chain; route to NotApplicable

  ELSE IF rdfs:subClassOf parent exists but parent's disposition is Inconsistent:
    → do NOT inherit; evaluate CAU independently (inherited inconsistency would obscure this CAU's actual state)

  ELSE (no parent, or CAU is root-level):
    → route to NotApplicable (existing D1.6-L13 default)
```

**Terminal behavior for confirmed-NotApplicable CAUs (unchanged from v1.0.1):**

- Do not participate in Phase 2 property disambiguation (their properties are also excluded).
- Do not participate in Phase 3 consistency checking.
- Excluded from the canonical graph.
- Recorded in session metadata for the DP-1 session-level diagnostic aggregation.

**Non-terminal behavior for NA-1.1-inherited CAUs (new in v1.1.0):**

- CAUs placed via NA-1.1 receive their parent's non-NotApplicable disposition (Entailed or Plausible).
- They DO participate in Phase 2 and Phase 3 (since they are not NotApplicable).
- They remain subject to reactive re-evaluation per NA-1.4 when mutations affect their dependency neighborhood.
- Their placement is flagged provisional in the validationState field until validated or overridden per NA-1.2.

**Rationale for the NA-1.1 precedence (per D1.6-L25):** OBO-Foundry-scale ontologies (NCBITaxon ~2.3M classes, GO ~45K, CHEBI ~150K, UBERON ~15K) encode ontological commitment at higher taxonomic levels and leave leaf-level classes as bare `rdfs:subClassOf` declarations. Without NA-1.1, D1.6 would systematically false-positive-route these leaves to NotApplicable, making calibration Tests 2-6 uninterpretable on most realistic ontologies. NA-1.1 allows inheritance through subsumption, which correctly captures how these ontologies encode their commitments.

### 4.6 Disjointness-Filtered Mixed Evidence (per D1.6-L12 and SME v0.1 tightening)

When a CAU's Signature satisfies necessary conditions of multiple BFO categories, resolution uses **ontology structure (disjointness and subsumption relations), not evidence count**:

- **Disjoint categories:** The CAU is Inconsistent **immediately, with no further counting**. Explanation names the specific disjointness axiom violated. No "most evidence wins" tiebreaker is applied — disjointness is definitional, not probabilistic. A CAU satisfying conditions for `bfo:Continuant` AND `bfo:Occurrent` is Inconsistent; it does not become the one with more satisfied conditions.
- **Hierarchical overlap (one category subsumes the other):** The **most specific subsumer** wins. If a CAU satisfies conditions for both `bfo:Process` and `bfo:Occurrent`, and `bfo:Process rdfs:subClassOf bfo:Occurrent`, the CAU is placed at `bfo:Process` because `bfo:Process` is the more specific subsumer of conditions the CAU satisfies. This is ontological reasoning, not evidence counting — the result does not depend on how many conditions were satisfied in each category, only on the subsumption relationship.
- **Sibling categories (non-disjoint, no subsumption between them):** Plausible with evidence annotations showing both candidates. Analyst selects. This case is genuinely ambiguous on axioms alone; analyst judgment (typically about teleology, design intent, or realization conditions per Q4.3) is required.

This is the realist-correct resolution strategy: BFO's formal structure (disjointness, subsumption) drives resolution, not statistical properties of the evidence. Evidence annotations remain available to the analyst for their review, but they do not determine the placement automatically in hierarchical-overlap cases.

---

## 5. BFO Level Distinction

### 5.1 The 13 Categories

Per D1.6-L14, D1.6 targets medium granularity — 13 BFO upper-level categories plus NotApplicable:

1. IndependentContinuant
2. MaterialEntity (subclass of IndependentContinuant)
3. ImmaterialEntity (subclass of IndependentContinuant)
4. GenericallyDependentContinuant
5. SpecificallyDependentContinuant
6. Process (subclass of Occurrent)
7. ProcessBoundary (subclass of Occurrent)
8. TemporalRegion (with temporal subtypes rolled up — zero-dimensional, one-dimensional)
9. Site (subclass of ImmaterialEntity in BFO 2020)
10. Role (subclass of SpecificallyDependentContinuant)
11. Disposition (subclass of SpecificallyDependentContinuant)
12. Function (subclass of Disposition in BFO 2020)
13. Quality (subclass of SpecificallyDependentContinuant)

v1.0.1 correction: earlier drafts said "12" reflecting a simplification that folded Quality under SDC; the correct count per BFO 2020 and the FANDAWS target set is 13 distinct categories with Quality explicitly distinguished. This matters because Quality-valued classes (measurement values, observable properties, physical attributes) are common in real ontologies and misplacing them under generic SDC would produce systematic alignment errors.

Finer BFO classes (zero-dimensional spatial region, fiat object parts, etc.) are deferred to v0.3.

### 5.2 Curated Necessary-Condition Additions

Per D1.6-L17 and SME v0.1 tightening to Q4.3, the BFO Signature reference includes curated additions for distinctions that BFO-OWL underspecifies. **The SME's Q4.3 tightening is load-bearing: Role/Function/Disposition distinctions MUST be explicitly encoded in the curated BFO Signature reference, or the system will fail on these distinctions and the calibration studies will expose the failure.** This is not a soft recommendation; it is a prerequisite for D1.6 implementation.

Curated necessary conditions mandated by this spec:

- **Role (bfo:Role) necessary conditions:**
  - Must inhere in a specific bearer (SDC-inherence requirement)
  - Must be realizable within a social, institutional, or organizational context
  - Must NOT require a designed-purpose teleological commitment (distinguishing from Function)
  - Must be contingent on external circumstances — specifically, on the bearer being in a particular relational configuration with other entities (an employee's Role depends on an employment relation)
  - Required axioms in curated reference: `bfo:Role rdfs:subClassOf bfo:RealizableEntity`, plus Role-specific inherence-in-contextually-bearer commitments

- **Function (bfo:Function) necessary conditions:**
  - Must inhere in a specific bearer (SDC-inherence requirement)
  - Must have a designed-purpose teleological commitment — the bearer was designed, manufactured, selected, or evolved to have this function
  - Must be realizable in some process (the function is performed)
  - Distinguishable from Role by requiring teleology; distinguishable from Disposition by requiring designed purpose rather than mere causal realization
  - Required axioms: Function-specific teleology commitments that Role and generic Disposition lack

- **Disposition (bfo:Disposition) necessary conditions:**
  - Must inhere in a specific bearer (SDC-inherence requirement)
  - Must be realizable under triggering circumstances (the disposition is manifested when circumstances obtain)
  - Must NOT require teleology (distinguishing from Function)
  - Must NOT require social-organizational context (distinguishing from Role)
  - Realization is causal, not social or teleological
  - Required axioms: Disposition-specific triggering-circumstance commitments

- **GDC vs SDC necessary conditions:**
  - GDC (Generically Dependent Continuant) concretizes in information-bearing entities. Multiple concretizations possible simultaneously. Independent of any single bearer.
  - SDC (Specifically Dependent Continuant) inheres in a specific bearer. Tied to that bearer's existence; cannot migrate.
  - Required axioms: the concretizes-in vs inheres-in distinction as explicit necessary conditions in curated reference

- **Material vs Immaterial Entity necessary conditions:**
  - Material Entity occupies a spatial region through its constituting matter
  - Immaterial Entity (Site subtype) occupies a spatial region without material constitution
  - Immaterial Entity (continuant fiat boundary subtype) does not occupy spatial regions through matter
  - Required axioms: spatial-region occupation modes as distinguishing necessary conditions

These curated additions are not exhaustive; the BFO Signature reference may include additional distinctions as identified by SME review. But the distinctions listed above are MANDATORY for D1.6 implementation. A BFO Signature reference that omits any of these is non-conformant and blocks D1.6 from advancing to v1.0.

Curated additions are produced by internal team draft + SME review per D1.6-L17. The reference document is versioned alongside BFO; VD-6 triggers rebuild of both BFO Signatures and curated additions.

### 5.3 Role/Function/Disposition In Practice

Per D1.6-L15, the system attempts Role/Function/Disposition distinction via axiom-evidence comparison against the curated necessary conditions specified in §5.2. Where axioms disambiguate clearly (e.g., a CAU has explicit teleology commitments matching Function's curated necessary conditions and no Role-specific social-context axioms), Entailed. Where they don't (the common case per SME observation — teleology and design intent are often outside what OWL can encode), Plausible with structured evidence annotations showing the candidates.

Calibration studies should expect many Plausible outcomes in the Role/Function/Disposition family; per SME, "this is correct behavior, not classifier failure." Expert analyst judgment disambiguates these based on context the ontology may not encode.

**Implementation warning per SME v0.1:** if the BFO Signature reference lacks explicit Role/Function/Disposition curated necessary conditions, implementation will attempt to infer the distinctions from BFO-OWL's native axioms, which do not encode them at sufficient depth. This failure mode will surface during calibration studies as systematic Inconsistent or incorrect-Entailed outcomes for SDC-family CAUs. Do not proceed to implementation without validated curated additions for this family.

---

## 6. NotApplicable and Session-Level Diagnostic

### 6.1 Per-CAU NotApplicable (Mandate 4)

Per D1.6-L13 and SME v0.1 tightening to Q4.1, NotApplicable qualification is hybrid and **defaults harder toward NotApplicable** than v0.1 specified:

- **Automatic:** CAUs declared as `skos:Concept`, bare `owl:Class` with zero BFO-relevant axioms in their Signature, or CAUs using recognized non-BFO namespaces (dc, foaf beyond agent, etc. — registry maintained in D1.6 config). These CAUs enter NotApplicable disposition without analyst confirmation.
- **Default for axiom-poor CAUs:** CAUs whose Signature contains fewer than N BFO-relevant axioms (default N=2; configurable) **default to NotApplicable disposition unless the analyst explicitly overrides**. This is stricter than v0.1's "suggested" semantics. The analyst must actively route an axiom-poor CAU into Entailed/Plausible/Inconsistent consideration; by default such CAUs are excluded from BFO placement attempts.
- **Manual:** Analyst can override any CAU's NotApplicable status (either to force a CAU out of NotApplicable for BFO placement consideration, or to force a CAU into NotApplicable regardless of axiom content).

Rationale per SME: an axiom-poor class lacks the ontological content needed for a defensible BFO placement. Treating it as suggested-NotApplicable (v0.1) would produce a prompt the analyst must address; treating it as default-NotApplicable (v0.2) skips that prompt and requires analyst action only when they believe the class should be placed despite sparse axioms. This matches BFO-realist practice — don't force a BFO placement on a class with no BFO-relevant content.

NotApplicable CAUs are recorded with `explanation: "Routed to NotApplicable by {automatic|default_axiom_poor|manual} mechanism"` plus axiom evidence (or absence thereof) supporting the routing. The `default_axiom_poor` routing carries a flag indicating the analyst may override; the `automatic` routing does not (SKOS and non-BFO-namespace CAUs are not candidates for BFO placement).

### 6.2 Session-Level Diagnostic (DP-1)

Per D1.6-DP1 and D1.6-DQ1, sessions produce a `sessionDiagnostic` record at Phase 1 completion:

```
{
  totalCAUs: N,
  dispositionCounts: {
    Entailed: X,
    Plausible: Y,
    Inconsistent: Z,
    NotApplicable: W,
    PendingHumanResolution: V
  },
  realistCompatibilityAssessment: {
    fired: true | false,
    trigger: "NotApplicable_exceeds_40pct" | "Inconsistent_exceeds_30pct" | "both" | null,
    notApplicablePct: W / N,
    inconsistentPct: Z / N,
    thresholds: { notApplicable: 0.40, inconsistent: 0.30 },  // session config
    evidenceSummary: "..."
  }
}
```

When `realistCompatibilityAssessment.fired === true`, the session disposition `OntologyLikelyNonRealistCompatible` is emitted. The UI surfaces this prominently with evidence.

### 6.3 Exploratory Mode Continuation

When `OntologyLikelyNonRealistCompatible` fires, the analyst is presented with three options:

- **Abandon session:** Recommended path for clean methodology. Session marked `abandonedDueToRealistIncompatibility`; no canonical graph output.
- **Continue under exploratoryMode:** Explicit analyst acknowledgement. All subsequent outputs carry `compatibilityDegraded: true` in provenance. Session proceeds to Phase 2 and Phase 3 normally.
- **Adjust thresholds and re-evaluate:** Analyst revises thresholds (e.g., "this ontology has many SKOS concepts, accept 60% NotApplicable"). Session re-evaluates the diagnostic; if it now does not fire, proceeds normally.

The exploratoryMode toggle is a session-level flag that, once set, cannot be unset mid-session. Sessions that toggle between modes are rejected as provenance-ambiguous.

### 6.4 Compatibility-Degraded Flag

Per D1.6-DQ2, the `compatibilityDegraded` flag is informational only. Phase 2 and Phase 3 proceed normally for sessions in exploratoryMode. The flag appears in:
- Every canonical record's provenance field
- The session-level metadata
- The JSON bundle export header
- Every artifact downstream of the session (Turtle exports, report data, cross-session comparison data)

Downstream consumers of the flag (report-generation tooling, cross-session comparison in v0.3+) use the flag to annotate results — not to gate or filter. The flag is transparency, not enforcement.

---

## 7. DP-2 Invariant — Explainability, Provenance, Reproducibility

### 7.1 The Hard Invariant

Per D1.6-DP2, every canonical record produced by D1.6 carries three mandatory fields. A record missing any of these is non-conformant and fails AVC verification. This is enforced at every record creation point, across every disposition (Entailed, Plausible, Inconsistent, NotApplicable) and every operational state (PendingHumanResolution, IterationNonConvergence).

### 7.2 Explanation Field Schema

```
explanation: {
  dispositionReason: "<high-level reason in natural language>",
                     // v1.1.0 extension: for CAUs placed via NA-1.1, this includes the inheritance chain,
                     // e.g. "Provisionally inherited via taxonomic descent from parent [Parent IRI]"
                     // or "Inherited then validated via CAU-local strong signals"
                     // or "Inherited then overridden via strong signal per NA-1.2"
                     // or "Direct BFO alignment via necessary-condition satisfaction"

  axiomEvidence: [
    {
      axiomIRI: "<axiom unique identifier>",
      axiomKind: "propertyRestrictionAsDomain | disjointness | ...",
      contributionRole: "satisfiedNecessaryCondition | failedNecessaryCondition | triggeredDisjointness | ...",
      bfoCategoryAffected: "bfo:Process | bfo:IndependentContinuant | ...",
      weight: "High | Medium | Low"
    },
    ...
  ],

  reasoningSteps: [
    {
      step: 1,
      operation: "load_signature | apply_background_theory | query_necessary_condition | ...",
      result: "<structured result>",
      reasonerStepCount: 42
    },
    ...
  ],

  alternativesConsidered: [
    { bfoCategory: "bfo:Occurrent", result: "rejected: disjointness with bfo:IndependentContinuant firing" }
  ],

  // NEW v1.1.0 fields for NA-1.1/NA-1.2/NA-1.3 amendment (REQUIRED when applicable):

  validationState: "validated_no_conflict"  // inherited, no local contradicting signals
                 | "soft_conflict_detected" // inherited, local soft contradiction, now Plausible with annotation
                 | "hard_conflict_detected" // inherited, then overridden to Inconsistent per NA-1.2
                 | "provisional"            // inherited, not yet validated against local signals (transient)
                 | "not_inherited",         // direct placement, no inheritance involved

  conflictAnnotation: {                     // null if no conflict
    signalType: "domain_range" | "disjointness" | "entailment_failure" | "other",
    severity: "soft" | "hard",
    description: "<human-readable explanation>"
  } | null,

  reconciliationHistory: [                  // empty array if no reconciliation events
    {
      priorPlacement: { disposition, bfoCategory },
      triggeringEvent: "parent_reconciliation" | "property_ingestion" | "analyst_override" | "na14_mutation",
      updatedPlacement: { disposition, bfoCategory },
      timestamp: "<ISO-8601>",
      // Per DP-2-R5 (v1.1.0 amendment): triggeringEvent values reference the session-level
      // event dictionary; no inline event metadata.
    },
    ...
  ]
}
```

The explanation is structured — not free-form prose — so that downstream tooling can query it, cross-session comparisons can aggregate it, and publications can cite specific axiom contributions.

**v1.1.0 schema discipline:**
- `validationState` is REQUIRED on every canonical record. For CAUs not involving inheritance, the value is `not_inherited`.
- `conflictAnnotation` is REQUIRED; set to `null` for CAUs with no conflict.
- `reconciliationHistory` is REQUIRED; set to `[]` for CAUs never reconciled.
- For CAUs placed via NA-1.1, `dispositionReason` MUST include the parent IRI in the inheritance chain text.
- For CAUs reconciled via NA-1.3, `reconciliationHistory` MUST contain at least one entry and `dispositionReason` MUST reflect the current post-reconciliation state, not the original inheritance.

### 7.3 Provenance Field Schema

```
provenance: {
  sessionId: "<UUID>",
  iterationHistory: [
    { round: 0, disposition: "Plausible", bfoCategory: null, timestamp: "<ISO>" },
    { round: 1, disposition: "Entailed", bfoCategory: "bfo:Process", timestamp: "<ISO>" }
  ],
  crossCAUInfluences: [
    { influencingCAU: "<IRI>", influence: "domain_alignment_narrowed_candidate_set" }
  ],
  propertyAlignmentsConsumed: [
    { property: "<IRI>", alignedTo: "<canonical property IRI>", round: 1 }
  ],
  reasonerState: {
    backgroundTheoryVersion: "<BFO version + curated additions version>",
    stepCountConsumed: 127,
    fallbackInvoked: false
  },
  authorTimestamp: "<ISO timestamp>",
  compatibilityDegraded: false,
  analystOverride: false  // or override details if applicable
}
```

### 7.4 Reproducibility Hash

Per SME v0.2 resolution of Q-V1.0-1, every iteration round produces its own hash (captured in iteration history for diagnostic auditability); the **Final Hash** is authoritative for cross-session reproducibility.

```
reproducibilityHash: {
  algorithm: "SHA-256",
  perRoundHashes: [
    { round: 0, hash: "<64-char hex>", inputsHashed: [...] },
    { round: 1, hash: "<64-char hex>", inputsHashed: [...] }
    // Present only in iteration history; not the authoritative cross-session value
  ],
  finalHash: {
    hash: "<64-char hex>",
    authoritative: true,
    inputsHashed: [
      "<CAU IRI>",
      "<Final CAU Signature hash>",
      "<BFO version identifier>",
      "<Curated BFO additions version identifier>",
      "<session configuration hash>",
      "<final iteration round number>"
    ]
  }
}
```

The Final Hash encodes: final placements, iteration count, BFO version, curated additions version, and session configuration. It is deterministic — identical inputs produce an identical Final Hash. Cross-session verification: given a session's exported bundle and the same source inputs, a verifying system re-computes and matches the Final Hash, confirming the session's outputs are reproducible.

The per-round hashes are diagnostic artifacts: they let an analyst or external reviewer audit how the session evolved across iterations. They are NOT used for cross-session verification. A new session on the same inputs may take a different iteration path (if bounded-fallback triggering differs due to reasoner state) and still produce identical final placements with an identical Final Hash.

### 7.5 Enforcement

DP-2 enforcement lives in the canonical record write-path at three levels:

1. **Schema validation** — records without all three fields fail schema check before write.
2. **Content validation** — explanation's axiom evidence list must be non-empty (except NotApplicable, which may have a single-element evidence list naming the NotApplicable trigger); provenance must have at least one iteration history entry; hash must be correctly computed.
3. **AVC verification** — dedicated D1.6 AVC scenarios verify DP-2 conformance across all disposition types and operational states.

Any implementation that bypasses these checks produces non-conformant output and fails the D1.6 AVC bundle.

---

## 8. Rules Catalog

### 8.1 Rules Retired

- **Decision D-3 (D1 spec) — per-class heuristic placement.** Fully retired. Replaced by CAU Signature matching.
- **Decision D-7 (D1 spec) — arithmetic placement thresholds.** Retired. Replaced by three-state evidence model.
- **Phase D1.5 AP-1 through AP-8 (anchor-point rules).** All retired. The anchor-point model is superseded by uniform CAU treatment.

### 8.2 Rules Preserved From D1/D2

- **Decision D-4 (blocking rule).** Phase 2 cannot start while PendingHumanResolution items remain. Extended: IterationNonConvergence is a PendingHumanResolution variant and also blocks Phase 2.
- **Rule VD-5 (sessions never deleted).** Preserved.
- **Rule VD-6 (BFO version change triggers re-evaluation).** Preserved. Re-evaluation under VD-6 now re-runs the D1.6 iterative pipeline plus rebuilds BFO Signatures and curated additions.
- **All D2 property disambiguation rules (PD-*, PS-*).** Preserved. Phase 2 outputs are marked `provisional: true` during iteration per D1.6-L21; final Phase 2 outputs are determined after Phase 1 convergence.
- **Rule PS-8 (Horn inference step cap, 10,000 steps).** Preserved. Applies to Signature comparison reasoning per §2.5.

### 8.3 New Rules Introduced By D1.6

- **Rule LS-1 — CAU as uniform unit.** Every candidate class is a CAU. No distinction between "anchor classes" and "non-anchor classes" — that distinction was D1.5's mistake.
- **Rule LS-2 — Normalized Logical Signature.** Each CAU has exactly one Signature per session, computed deterministically per §2.3.
- **Rule LS-3 — Sub-property closure.** Signatures include axioms under sub-property closure to depth 10, per D1.6-L2.
- **Rule LS-4 — Diagnostic weight tagging.** Each axiom in a Signature carries a diagnosticWeight tag per D1.6-L1. High-weight axioms (e.g., cardinality on inherence) dominate scoring; Low-weight axioms contribute marginally.
- **Rule LS-5 — BFO Signature hybrid source.** BFO Signatures computed from BFO-OWL extraction + curated additions per D1.6-L3 and D1.6-L17.
- **Rule LS-6 — Pattern entailment, not equivalence.** Signature comparison uses Tau Prolog pattern entailment under background theory, explicitly not full logical equivalence, per D1.6-L4.
- **Rule LS-7 — Deterministic ordering.** All Signature computation, comparison, and iteration proceed in deterministic order per §3.5. This supports DP-2 reproducibility.
- **Rule LS-8 — owl:oneOf normalization.** Raw `owl:oneOf` axioms are transformed into structural enumeration patterns per §2.3 Step 3a; raw enumerations are excluded from Signatures per SME v0.1 correction to Q1.1.
- **Rule LS-9 — Cycle detection in sub-property closure.** Sub-property closure traversal uses explicit visited-properties set per §2.3 Step 2; cycle-triggering edges skipped with `cycleDetectionTriggered` flag raised per SME v0.1 correction to Q1.2.
- **Rule LS-10 — Type-level reasoner constraint.** Tau Prolog pattern entailment answers type-level queries only ("does this CAU entail BFO category X membership?"), not axiom-graph isomorphism, per §2.5 and SME v0.1 correction to Q1.4.
- **Rule IT-1 — Hybrid iteration.** Single-pass default; bounded fallback at 3 rounds maximum per D1.6-L5.
- **Rule IT-2 — CAU-specific convergence failure.** Stabilized CAUs pass through even when some CAUs fail to converge per D1.6-L7.
- **Rule IT-3 — Phase 3 axioms as background theory.** Phase 3 axioms used in iterations per D1.6-L8; Phase 3 still runs terminally.
- **Rule IT-4 — Iteration trigger narrowed to contradiction or ambiguity.** Cross-dependencies alone do NOT trigger iteration per §3.1 and SME v0.1 correction to Q2.1. Only contradiction (placement violates BFO disjointness) or ambiguity (multiple Plausible candidates with no subsumption resolution) trigger bounded-iteration fallback.
- **Rule IT-5 — Phase 3 as validation, not discovery.** No new constraints are introduced during iteration or terminal Phase 3 validation per §3.2 Step 7 and SME v0.1 correction to Q2.4. All constraints come from BFO + source axioms at session start.
- **Rule EV-1 — Three-state evidence.** Entailed / Plausible / Inconsistent semantics per §4 and D1.6-L9 through L12.
- **Rule EV-2 (v1.1.0-extended) — Necessary-condition satisfaction.** Entailment criterion is NCS per D1.6-L9. **NCS must be verified against the curated BFO Signature reference, not heuristically inferred**, per §4.2 and SME v0.1 correction to Q3.1. **v1.1.0 addition:** Entailment may also be reached via NA-1.1 provisional inheritance; such Entailed CAUs have `validationState: provisional` until validated against local signals per NA-1.2. The disposition (Entailed) is the same in both pathways; the provenance distinguishes them.
- **Rule EV-3 — Plausible flat with structured annotations.** No sub-scoring within Plausible per D1.6-L10. **Annotations MUST be structured JSON per the schema in §4.3, not textual**, per SME v0.1 correction to Q3.2.
- **Rule EV-4 — Subsumption-based mixed evidence resolution.** Ontology structure (disjointness and subsumption) drives mixed-evidence resolution per §4.6 and SME v0.1 correction to Q3.4. Disjoint categories → Inconsistent immediately. Hierarchical overlap → most specific subsumer wins. Sibling non-disjoint → Plausible for analyst.
- **Rule NA-1 (v1.1.0-extended) — NotApplicable hybrid qualification with NA-1.1 precedence.** Route to NotApplicable when CAU is (a) declared skos:Concept or other explicit non-BFO declaration (automatic), (b) axiom-poor AND has no inheritable parent path per NA-1.1 (default), or (c) manually placed by analyst. **v1.1.0 extension:** axiom-poor CAUs with `rdfs:subClassOf` parent having stabilized Entailed or Plausible disposition inherit parent's placement via NA-1.1 instead of routing to NotApplicable. See §4.5 precedence cascade.
- **Rule NA-2 — NotApplicable terminal.** Per D1.6-L16. Applies to confirmed-NotApplicable CAUs; NA-1.1-inherited CAUs are NOT NotApplicable and are not terminal.
- **Rule NA-1.1 (v1.1.0 amendment) — Taxonomic Descent with Provisional Inheritance.** Horizontally axiom-poor CAUs (fewer than 2 BFO-relevant axioms in Signature) with an `rdfs:subClassOf` parent having stabilized Entailed or Plausible disposition MUST inherit the parent's BFO placement as a provisional prior. Inheritance bypasses NotApplicable routing per D1.6-L13's v1.1.0 extension. The CAU's disposition matches the parent's (Entailed or Plausible); the `validationState` field is set to `provisional`; the `dispositionReason` field documents the inheritance chain. Inheritance MUST NOT override an existing strong structural contradiction per NA-1.2's signal hierarchy — if the CAU's few axioms contain strong-signal contradictions with the parent, NA-1.1 does not apply and the CAU is evaluated independently.
- **Rule NA-1.2 (v1.1.0 amendment) — Signal Discipline and Contradiction Severity.** Inherited placements are revisable against subsequent evidence. Only **strong structural signals** are permitted to trigger contradiction of inherited placements. Strong signals: BFO disjointness violations, domain/range violations, violations of OWL-DIRECT or CURATED-NC conditions per the BFO Signature Reference, Tau Prolog entailment failure. Weak signals (lexical labels, synonyms, naming patterns, comment-text similarity) MUST NOT independently trigger contradiction; they may contribute to Plausible evidence annotations only. This restriction is consistent with Q-V1.0-8's Phase 2 lexical demotion — both derive from the principle that lexical signals are advisory, not probative. **Contradiction severity:** Hard contradictions (disjointness violations; mutually exclusive NCs satisfied simultaneously; logical impossibility under BFO) route the CAU to Inconsistent (PendingHumanResolution). Soft contradictions (domain/range tension without full entailment failure; partial structural conflicts; incomplete context) route to Plausible with populated `conflictAnnotation` field. **Override principle:** Structural truth overrides inherited priors — when a strong signal contradicts inherited placement, the inherited classification is discarded and the CAU is re-evaluated independently.
- **Rule NA-1.3 (v1.1.0 amendment) — Descendant Reconciliation.** When a CAU's placement or disposition changes for any reason (analyst override, property evidence ingestion, NA-1.4 mutation event), all descendants that inherited placement from this CAU via NA-1.1 MUST be flagged for re-evaluation and reconciled. Cascade mechanics: (1) flag direct descendants; (2) for each flagged descendant, recompute placement — if descendant's local CAU signals still align with updated ancestor placement, inherit new placement; if descendant's local signals now conflict, apply NA-1.2 override principle; (3) propagate transitively through the descendant tree until reaching terminal nodes or richly-axiomatized descendants (not inheriting via NA-1.1); (4) update `reconciliationHistory` on each reconciled descendant's canonical record with priorPlacement, triggeringEvent, updatedPlacement, timestamp. NA-1.3 cascades downward only (rdfs:subClassOf descendant direction); upward propagation is handled by NA-1.4.
- **Rule NA-1.4 (v1.1.0 amendment) — Reactive Re-evaluation Engine.** FANDAWS operates as a reactive reasoning system, not a batch pipeline. Any mutation to the canonical graph MUST trigger localized re-evaluation of the affected dependency neighborhood. **Mutation events:** new CAU ingestion; property ingestion (domain/range resolution); change in CAU disposition; change in CAU BFO placement; analyst override; resolution of previously Plausible or Inconsistent CAU. **Affected scope:** ancestors of the mutated CAU (upward), descendants via NA-1.3 (downward), and property-linked neighbors. **Execution constraints:** bounded scope (dependency graph only, not global); cycle deduplication (each CAU reprocessed at most once per mutation cycle); cyclic dependency resolution (rdfs:subClassOf cycles must resolve deterministically without oscillation); dependency graph cached at session start and updated incrementally on mutations. **Stability guarantee:** the system MUST converge to a stable fixed point where no further rule-triggered changes occur and all CAUs have one of {Entailed, Plausible, Inconsistent, NotApplicable}. Convergence argument formalized in a 1-2 page document drafted Week 1 of implementation and SME-reviewed before NA-1.4 implementation begins (Week 6). **Dependency graph infrastructure (per D1.6-L25):** IndexedDB-backed, preserves Edge-Canonical First Principle, persists across browser sessions; see §9.4.
- **Rule CR-1 — Curated BFO reference mandatory distinctions.** The curated BFO Signature reference MUST encode Role/Function/Disposition distinctions explicitly per §5.2 and SME v0.1 correction to Q4.3. Non-conformant references block D1.6 advancement.
- **Rule PH2-1 — Phase 2 consumes CAU Signatures.** Phase 2's input shape changes: CAU Logical Signatures are the primary ontological input, replacing pre-computed Domain/Range BFO types per §9.2 and SME v0.1 correction to Q6.1.
- **Rule PH2-2 — Lexical dimension demoted to advisory.** Phase 2's lexical similarity dimension does NOT drive disambiguation decisions per §9.2 and SME v0.1 correction to Q6.1. Lexical signals surfaced as advisory evidence only. Consistent with NA-1.2's weak-signal restriction.
- **Rule PH2-3 (v1.1.0 amendment) — Phase 2 completion triggers NA-1.4 mutation event.** When Phase 2 completes disambiguation of a property, that completion constitutes a mutation event per NA-1.4. Phase 1 CAUs in the property's dependency neighborhood are re-evaluated reactively. This preserves Phase 2 as a batch process internally while integrating it with the v1.1.0 reactive engine. Full Phase 2 reactive semantics deferred to D2.1.
- **Rule IT-4 (v1.1.0-extended) — Iteration trigger narrowed to contradiction or ambiguity.** Cross-dependencies alone do NOT trigger iteration per §3.1 and SME v0.1 correction to Q2.1. Only contradiction (placement violates BFO disjointness) or ambiguity (multiple Plausible candidates with no subsumption resolution) trigger bounded-iteration fallback. **v1.1.0 extension:** NA-1.2 override events (strong-signal contradiction of NA-1.1 inherited placement) are also legitimate iteration triggers when encountered mid-iteration.
- **Rule DP-1-R1 — Session-level diagnostic.** OntologyLikelyNonRealistCompatible triggered per D1.6-DQ1 thresholds.
- **Rule DP-1-R2 — Exploratory mode semantics.** Per §6.3. Once set, cannot be unset.
- **Rule DP-1-R3 — Compatibility-degraded flag propagation.** Per §6.4.
- **Rule DP-2-R1 (v1.1.0-extended) — Mandatory explanation field.** Per §7.2. Non-empty axiom evidence required (with NotApplicable trigger exception). **v1.1.0 extension:** explanation field now includes four new subfields (`dispositionReason`, `validationState`, `conflictAnnotation`, `reconciliationHistory`) for CAUs placed via NA-1.1 or reconciled via NA-1.3; these are REQUIRED when applicable.
- **Rule DP-2-R2 — Mandatory provenance field.** Per §7.3. At least one iteration history entry required.
- **Rule DP-2-R3 — Mandatory reproducibility hash.** Per §7.4. Deterministic computation verified by cross-session hash matching.
- **Rule DP-2-R4 — AVC enforcement of DP-2.** Dedicated scenarios verify DP-2 across all dispositions and operational states per §7.5.
- **Rule DP-2-R5 (v1.1.0 amendment) — Reconciliation history storage discipline.** `reconciliationHistory` entries MUST use the session-level axiomDictionary deduplication pattern established by Q-V1.0-4. Common event types (e.g., "parent_reconciliation", "property_ingestion", "analyst_override") reference dictionary IDs rather than inlining event metadata in each record. Preserves DP-2 completeness while respecting storage constraints.


---

## 9. Impact Analysis

### 9.1 Impact on D1 AVC Bundle

The original D1 AVC bundle (23 scenarios) and the D1.5 AVC bundle (never authored) are both retired. D1.6 introduces a new AVC bundle spanning approximately 50-60 scenarios across eight bands (detailed in a separate `fandaws-sentinel-d16-avc-bundle.json` deliverable following spec approval).

Scenario band outline:
- **Band 1 — CAU Signature Extraction** (8-10 scenarios): axiom kinds correctly extracted, sub-property closure applied, diagnostic weight tagging, deterministic ordering, BFO Signature hybrid source (OWL + curated).
- **Band 2 — Iteration Mechanics** (6-8 scenarios): single-pass success, single-pass detects unresolved interaction, bounded fallback convergence at round 1/2/3, IterationNonConvergence at round 3, CAU-specific stabilization.
- **Band 3 — Three-State Evidence Transitions** (6-8 scenarios): Entailed via NCS, Plausible with structured annotations, Inconsistent analyst review routing, disjointness-filtered mixed evidence, subsumption wins on non-disjoint candidates.
- **Band 4 — BFO Level Distinction** (4-6 scenarios): each of the 12 categories verifiable as placement target, Role/Function/Disposition fall-back to Plausible, curated additions correctly applied.
- **Band 5 — NotApplicable Handling** (4-6 scenarios): automatic routing for SKOS, suggested routing for axiom-poor, manual override, NotApplicable terminal (excluded from Phase 2).
- **Band 6 — DP-2 Invariant Enforcement** (8-10 scenarios): every disposition has mandatory explanation, provenance, reproducibility hash; non-conformant records fail schema; cross-session hash matching; structured axiom evidence non-empty; negative scenarios verify that records missing fields are rejected.
- **Band 7 — DP-1 Session-Level Diagnostic** (4-6 scenarios): threshold firing on NotApplicable-heavy session, threshold firing on Inconsistent-heavy session, both triggers, exploratoryMode continuation, compatibilityDegraded flag propagation, threshold-adjusted re-evaluation.
- **Band 8 — Phase 2 Provisional During Iteration + Regression** (4-6 scenarios): Phase 2 outputs marked provisional during iteration, finalize on Phase 1 stabilization, D2 scenarios unaffected by D1.6 iteration (regression verification).

Estimated total: 54 scenarios. Final count determined during AVC bundle authoring post-spec-approval.

### 9.2 Impact on D2 AVC Bundle

D2 AVC bundle (33 scenarios) is preserved with **light correction rather than minor adaptation** (per SME v0.1 tightening to Q6.1 and Q5.2). The SME's specific observation: "Phase 2 must consume CAU outputs, not operate independently." This is a concrete architectural change, not just an iteration-semantics adjustment.

**Phase 2 light correction:**

- Phase 2's input shape changes. Currently Phase 2 takes pre-computed Domain/Range BFO types as inputs; under D1.6, Phase 2 takes **CAU Logical Signatures** as inputs, plus the current class placement (which may be Plausible during iteration, Entailed after stabilization). The Signatures replace the pre-computed BFO types as the primary ontological input.
- Phase 2's lexical dimension is **demoted to advisory only** (per SME v0.1). Lexical similarity between property names is surfaced as evidence but does not drive disambiguation decisions. The six-dimension fingerprint becomes effectively a five-primary-plus-one-advisory fingerprint; rebalancing weight vector defaults are part of the correction scope.
- Phase 2 operates on current (possibly provisional) CAU placements during iteration. Phase 2's outputs are marked `provisional: true` during iteration and finalized only after Phase 1 stabilization per D1.6-L21.

**D2 AVC preservation estimate (revised per SME):** approximately **100-110 of 178 total scenarios** preserved unchanged, down from v0.1's optimistic ~125/178. Iteration semantics leak into more Phase 2 scenarios than v0.1 acknowledged because every Phase 2 AVC scenario now has to establish whether its fixture is "provisional during iteration" or "final post-stabilization." Scenarios testing Phase 2 internal logic preserved; scenarios testing Phase 2 input shape, lexical-dimension priority, or Phase 1/Phase 2 handoff are revised.

Scope decision stands: Phase 1 major change, Phase 2 light correction consuming CAU Signatures with lexical demotion. Full Phase 2 rearchitecture (property signatures mirroring CAU Signatures with three-state evidence) deferred to D2.1.

### 9.3 Impact on Workbench v0.2

Workbench v0.2 (60 AVC scenarios, just delivered by developer) requires adaptation at the Phase 1 Review panel plus adjacent panels. Scope:

**Phase 1 Review panel (moderate revision):**
- Replace per-class placement row model with CAU-centric view showing CAU Signature summary, placement disposition, evidence annotations (for Plausible), explanation expandable panel (for DP-2), iteration history affordance, reasoner step count.
- New disposition badges: Entailed (green), Plausible (yellow with evidence count), Inconsistent (red with contradiction summary), NotApplicable (grey), IterationNonConvergence (orange).
- Expandable iteration history showing round-by-round evolution of each CAU's disposition.

**Upload panel (minor revision):**
- New advanced configuration section for DP-1 thresholds (NotApplicable percentage default 40, Inconsistent percentage default 30; editable).
- New "Show BFO Level Distinction Options" section exposing the 12 category targets with on/off toggles (v0.3+ may use this; v0.2 treats all 12 as always-on).

**Session Summary panel (moderate revision):**
- New Invariant Audit card rows for DP-2 conformance verification (all records have explanation/provenance/hash? hash reproducibility verified?).
- New Session Diagnostic card showing realist-compatibility assessment (per DP-1) with threshold values and evidence summary.
- exploratoryMode indicator prominent in session metadata when applicable.

**New panel candidate: Session Diagnostic Detail panel** — accessed from Session Summary when realistCompatibilityAssessment.fired. Full evidence breakdown with ability to adjust thresholds or toggle exploratoryMode.

**Phase 2 and Phase 3 Review panels (minor revision):**
- Phase 2 panel indicates when rendering provisional (during iteration) vs finalized (after iteration) results.
- Phase 3 panel unchanged functionally; includes note in Session Summary that Phase 3 axioms were consulted during iteration per D1.6-L8.

Estimated: 15-20 new/revised Workbench v0.2 AVC scenarios. Workbench v0.2 scenario count rises from 60 to approximately 75-80.

### 9.4 DependencyGraph Infrastructure (v1.1.0 amendment)

Per D1.6-L25 and Rule NA-1.4, v1.1.0 introduces a session-level `DependencyGraph` infrastructure component supporting reactive re-evaluation.

**Storage backing:** IndexedDB (per amendment §6.1 resolution). Rationale: preserves Edge-Canonical First Principle (browser-only, no backend); persists across browser sessions and page reloads; browser-native key-value store capable of gigabyte-scale data; handles NCBITaxon-scale dependency graphs (~50-80MB) without exhausting localStorage or memory. No Web Worker heap storage (would cause memory bloat); no hybrid caching layer initially (let browser engine handle caching until profiling demands otherwise).

**Graph structure:**
- Nodes: CAUs + properties
- Edges:
  - CAU → CAU via `rdfs:subClassOf` (ancestor direction)
  - CAU → CAU via `rdfs:subClassOf^-1` (descendant direction, maintained for NA-1.3 cascade)
  - CAU → property via domain declaration
  - property → CAU via range declaration
  - property → CAU via `propertyRestrictionsAsDomain` in CAU Signature

**Lifecycle:**
1. Session start: construct DependencyGraph from canonical graph's subsumption relationships and property domain/range declarations. Persist to IndexedDB.
2. During session: update incrementally on each NA-1.4 mutation event. Re-evaluation scope is bounded by graph traversal from the mutated node.
3. Session end: graph persists in IndexedDB. On subsequent session restart with same ontology, graph reloads without reconstruction (up to ontology version check).
4. On VD-6 event: graph rebuilt from scratch per Q-V1.0-5 cache invalidation rule.

**Cyclic dependency handling:** `rdfs:subClassOf` cycles (modeling errors in source ontology) are detected during construction. Resolution strategy per the convergence argument document (drafted Week 1, SME-reviewed before NA-1.4 implementation): on cascade re-visit of same CAU within a single mutation cycle, if the evidence state has not changed, the cascade branch terminates. Cycles flagged in session metadata for analyst visibility.

**Convergence argument document (deliverable):** 1-2 page formal argument drafted during Week 1 of implementation. Covers: (a) termination under finite disposition lattice; (b) cycle-breaking heuristic precisely specified; (c) monotonic shrinking of affected set per mutation cycle; (d) proof sketch or argument that fixed-point semantics hold. SME reviews before Week 6 NA-1.4 implementation begins. Failure to produce this document blocks NA-1.4 implementation.

**Storage estimate sanity check:**
- NCBITaxon (~2.3M CAUs, ~2.3M subsumption edges, ~100 properties): estimated 50-80MB
- GO (~45K CAUs, substantial property edges): estimated 10-20MB
- CHEBI, UBERON, PROV-O, and typical calibration ontologies: well under 10MB
- IndexedDB quota: browser-dependent but typically hundreds of MB to GB. Sufficient for all calibration-scale ontologies.

**Failure modes and recovery:**
- IndexedDB unavailable (private browsing, quota exceeded): session cannot proceed. Analyst notified at session start with explicit error explaining IndexedDB requirement.
- Graph corruption detected: rebuild from canonical graph on next session start. Reconciliation history preserved through the separate DP-2 provenance store.
- Cross-browser portability: graph is scoped to origin+ontology. Users switching browsers re-construct the graph on first use in new browser.

### 9.5 Impact on PROV-O Test Plan And Report Template

The PROV-O test plan (412 lines) and calibration study report template (619 lines) require moderate revision per D1.6-L24.

**Test plan revisions:**
- §2.2 configuration table: add DP-1 threshold configuration recording.
- §2.4 pipeline execution: add iteration history capture requirement.
- New §5.x: realist-compatibility assessment as a pre-Pass-2 finding, independent of placement/property/consistency diagnostics.

**Report template revisions:**
- §3.1 renamed "CAU Outcomes" from "Phase 1 Outcomes." Rows gain columns for: iteration-count-to-stable, final disposition, explanation evidence summary, comparison to human alignment's placement (when available).
- §3.x new subsection on evidence bundle comparison — for each CAU where FANDAWS and human alignment disagree, structured comparison of the two evidence bundles (what axioms FANDAWS found diagnostic vs what the human ontologist reasoned from).
- §6.1 Invariant Audit extended: new invariant rows for DP-2 conformance (explanation presence, provenance completeness, reproducibility hash verification).
- New §X.x: Realist Compatibility Assessment — top-level finding when OntologyLikelyNonRealistCompatible fired. For PROV-O this may or may not fire; reporting the finding either way is valuable data.

### 9.6 Impact on Spot-Check Transcripts

- D1 and D1.5 placement proof transcripts retired.
- New required transcripts:
  - **D1.6 Signature extraction proof** — demonstrates CAU Signature computation for a well-chosen CAU (likely `prov:Entity` or `prov:Activity`) with diagnostic weight tagging and sub-property closure visible.
  - **D1.6 iteration proof** — demonstrates single-pass convergence on a simple case plus bounded-fallback on an interaction-dependent case.
  - **D1.6 three-state evidence transitions** — shows Entailed/Plausible/Inconsistent cases with evidence annotations for each.
  - **D1.6 DP-2 conformance** — demonstrates that every canonical record carries explanation + provenance + hash, with a hash reproducibility verification step (re-run session, verify identical hash).
  - **D1.6 DP-1 diagnostic firing** — demonstrates OntologyLikelyNonRealistCompatible firing on an intentionally crafted realist-incompatible fixture, with exploratoryMode continuation path exercised.

Five spot-check transcripts for D1.6 (up from one for D1). Reflects the expanded architectural surface requiring external demonstration.

### 9.7 Effort Estimate

Per D1.6-L19, calendar time is 10-12 weeks from spec approval to PROV-O re-run:

- **Spec finalization** (v0.1 → SME v0.1 review → v1.0): 1-1.5 weeks
- **BFO Signature reference** (internal draft + SME review per D1.6-L17): 1-1.5 weeks
- **AVC bundle authoring** (~54 scenarios): 1 week
- **Implementation of CAU Signature extraction** (including sub-property closure, diagnostic weight tagging): 1.5 weeks
- **Implementation of iterative pipeline** (single-pass + bounded fallback + convergence): 1.5 weeks
- **Implementation of three-state evidence model + BFO level distinction**: 1.5 weeks
- **Implementation of DP-2 mandatory field infrastructure** (explanation schema + provenance schema + reproducibility hashing): 1.5 weeks
- **Implementation of DP-1 session-level diagnostic + exploratoryMode**: 1 week
- **Workbench v0.2 adaptation** (Phase 1 Review revamp + Session Summary updates + new Session Diagnostic panel): 1.5 weeks
- **Spot-check transcripts**: 2-3 days
- **PROV-O re-run + report generation**: 2-3 days

**Total: 11-12 weeks of focused work plus SME review cycles.** The SME-in-the-loop checkpoints (per D1.6-L20) add calendar time but are not additional engineering effort — they are scheduled review pauses.

### 9.8 Risk Register

- **Risk R1 — Reasoner performance at scale.** Tau Prolog with 10,000-step cap may be sufficient for PROV-O (~30 classes) but uncertain for Schema.org or GO subsets. Mitigation: PROV-O calibration study data informs reasoner-tuning decisions before larger tests.
- **Risk R2 — Curated BFO additions may be contested.** Role/Function/Disposition distinctions are debated in the BFO community; FANDAWS's curated additions reflect one interpretation. Mitigation: version the curated additions, document the interpretation choices, surface them in publications so external reviewers can assess.
- **Risk R3 — DP-1 thresholds may need calibration across ontology types.** Default 40/30 thresholds are educated guesses. Calibration studies produce threshold-tuning data. Mitigation: thresholds are session-configurable from day one.
- **Risk R4 — DP-2 provenance records may grow large.** Each canonical record carrying full iteration history and axiom evidence may produce bulky sessions. Mitigation: storage-efficient encoding (references rather than inlined duplicates); localStorage quota probe from Workbench v0.2 protects against quota explosion.
- **Risk R5 — Phase 2 provisional handling introduces bugs.** Phase 2 running repeatedly with different class-placement contexts is new territory. Mitigation: D2 regression scenarios verify Phase 2 internal correctness; iteration-specific AVC scenarios verify handoff integrity.

---

## 10. Implementation Considerations

### 10.1 BFO Signature Reference Document

Per D1.6-L17, production sequence:

1. Internal team extracts base Signatures from BFO 2020 OWL using the same parser infrastructure (n3.js) as candidate ontologies.
2. Internal team drafts curated additions for Role/Function/Disposition, GDC/SDC, Material/Immaterial distinctions using Arp/Smith/Spear textbook + BFO 2020 ISO spec as source material.
3. SME reviews the combined reference, corrects where needed, confirms where accurate.
4. Reference document versioned as `bfo-signatures-v1.0.json` alongside BFO 2020. Rebuilt on VD-6.
5. Reference document is a FANDAWS-project artifact; publishable as supplementary material for calibration-study papers.

### 10.2 SME-in-the-Loop Checkpoints (v1.1.0 updated for 14-16 week calendar)

Per D1.6-L20 and the v1.1.0 amendment's expanded implementation scope, five checkpoints during implementation:

- **Checkpoint 1 (Week 2-3, after Signature extraction):** SME reviews Signatures computed for a known-good ontology (CCO Core module recommended) against their own expectations. Identifies extraction bugs early.
- **Checkpoint 2 (Week 5, after inheritance cascade + three-state evidence):** SME reviews placement decisions on a small test set, including NA-1.1 inheritance behavior on an axiom-poor taxonomic sample (suggested: NCBITaxon mammal subtree, ~1000 nodes). Validates that inheritance works correctly and that NA-1.2 signal discipline blocks lexical noise. Green-lights DP-2 infrastructure work and NA-1.4 reactive engine implementation.
- **Checkpoint 3 (Week 8, after NA-1.4 reactive engine):** SME reviews mutation event handling, convergence behavior, descendant reconciliation cascade on test cases. Validates the convergence argument document produced in Week 1. Confirms DependencyGraph performance on OBO-scale sample.
- **Checkpoint 4 (Week 11, after DP-2 infrastructure + DP-1 diagnostic):** SME reviews explanation/provenance/hash output including the four new NA-1.x fields (validationState, conflictAnnotation, reconciliationHistory, extended dispositionReason). Validates that the epistemic-system contract holds with the amendment integrated.
- **Checkpoint 5 (Week 13, before PROV-O re-run):** SME reviews full system integration including Phase 2 light correction and Workbench v0.2 adaptation. Confirms acceptance readiness.

Each checkpoint is 1-2 hours of SME time. Total across five: 5-10 hours of SME engagement, spread across implementation.

### 10.3 Calendar Discipline

Given the pattern of late-surfacing flaws in D1 → D1.5 → D1.6 iterations (including the v1.1.0 OBO-scale ingestion failure that prompted this amendment), D1.6 implementation MUST NOT proceed past a checkpoint without SME sign-off. A checkpoint failing returns implementation to the specification for correction before proceeding.

**v1.1.0 calendar:** 14-16 weeks from Aaron's approval to PROV-O re-run. Breakdown:
- Weeks 1-2: CAU Signature extraction + BFO reference loading (Band 1) + convergence argument document draft
- Weeks 3-5: Three-state evidence + iteration + NotApplicable + **inheritance cascade (NA-1.1/NA-1.2/NA-1.3)** (Bands 2, 3, 5)
- Weeks 6-8: **Reactive re-evaluation engine (NA-1.4) + DependencyGraph IndexedDB infrastructure** (Band 5 reactive scenarios)
- Weeks 9-11: DP-2 infrastructure + DP-1 diagnostic (Bands 6, 7)
- Weeks 12-13: Phase 2 light correction + Workbench v0.2 adaptation (Band 8)
- Weeks 14-16: Integration testing + PROV-O re-run

### 10.4 Tau Prolog Reuse

Tau Prolog infrastructure from Phase 3 is reused for Signature comparison. The bundling decision from Workbench v0.2 (W-D-20 — Tau Prolog bundled via esbuild) extends to D1.6's new Signature comparison code path. Same version, same bundle, same pinned engine.

### 10.5 Edge-Canonical Preservation

Every component of D1.6 operates within the edge-canonical constraint (no network fetches at runtime, no server dependency). Signature computation, Tau Prolog reasoning, BFO Signature cache, iteration logic all run in the browser or Node.js test harness. The BFO Signature reference is bundled at build time, not fetched.

---

## 11. Approval Gates

Status gates through v1.1.0:

- [x] SME reviewed v0.1 and produced 12 tightening corrections (all integrated into v0.2)
- [x] SME reviewed v0.2 and confirmed the 12 tightening corrections are correctly captured
- [x] SME confirmed DP-1 soft-gate semantics and DP-2 hard-invariant treatment remain correctly specified in v0.2
- [x] SME validated the BFO Signature reference production plan (D1.6-L17 and §10.1) including the MANDATORY Role/Function/Disposition curated necessary conditions (§5.2 and Rule CR-1)
- [x] SME confirmed the Phase 2 light correction scope (D1.6-L21: CAU Signature input + lexical demotion) is appropriate
- [x] SME resolved all 8 open questions (Q-V1.0-1 through Q-V1.0-8) via v0.2 review response
- [x] Aaron identified BFO category count inconsistency (12 vs 13); spec bumped to v1.0.1 with Quality explicitly included
- [x] Aaron identified OBO-Foundry-scale ingestion failure during manual artifact review; Amendment D1.6-AMEND-01 drafted
- [x] SME provided Taxonomic Descent + Reactive Engine amendment text (NA-1.1 through NA-1.4)
- [x] Aaron approved Amendment D1.6-AMEND-01 with resolutions to all 4 open operational questions (IndexedDB storage, convergence document, reconciliation deduplication, Phase 2 remains batch)
- [x] Amendment D1.6-AMEND-01 integrated into spec as v1.1.0; bundle revision to v3 authorized
- [x] Aaron approved 14-16 week calendar with 5 SME-in-the-loop checkpoints per §10.2
- [x] Aaron approved Phase 2 light correction scope and deferred D2.1 refinement
- [x] Aaron approved Workbench v0.2 adaptation scope (§9.3) and ~15-20 new v0.2 AVC scenarios

All v1.1.0 gates closed 2026-04-18. Implementation authorization complete. AVC bundle v3 authoring authorized.

Once AVC bundle v3 is authored and delivered, developers begin test-first implementation against the 68-scenario contract.

Once Aaron's gates close, implementation is fully authorized and AVC bundle authoring begins.

---

## 12. Resolved Questions (Full Archive)

All open questions from v0.1 and v0.2 have been resolved by SME review. This section archives the resolutions as authoritative documentation for implementers and future reviewers. Each resolution includes the SME's rationale; where the resolution matched the v0.2 default, the default was authoritatively confirmed rather than merely adopted.

### Q-V1.0-1 — Reproducibility Hash Scope

**Question:** When a CAU's Signature is computed during iteration and changes between rounds, does the `reproducibilityHash` remain stable across the session? Or does each iteration round produce its own hash, with the final hash being authoritative?

**Resolution:** Each iteration round produces its own hash (captured in iteration history for diagnostic auditability). Only the **Final Hash** is authoritative for cross-session reproducibility.

**Rationale (per SME):** Iteration history is diagnostic. The system's output is the final stable state, which must encode both final placements and iteration count. Per-round hashes allow audit of how a session evolved; the Final Hash allows verification that identical inputs reproduce identical outputs.

**Spec implementation:** §7.4 Reproducibility Hash field schema defines both `perRoundHashes` array (iteration history diagnostic) and `finalHash` object (cross-session authoritative). Enforcement per §7.5.

### Q-V1.0-2 — Curated BFO Additions Versioning

**Question:** Curated BFO additions may evolve based on calibration-study findings. Does this trigger a VD-6-equivalent rebuild of all canonical graphs?

**Resolution:** Treat curated BFO signature changes as a **VD-6-equivalent event** (major re-evaluation trigger within FANDAWS).

**Rationale (per SME):** Changes to curated necessary conditions alter the effective alignment semantics of the system. While not a formal upgrade to Basic Formal Ontology itself, they function equivalently within FANDAWS and must trigger re-evaluation of prior sessions.

**Spec implementation:** Rule VD-6 extended (§8.2): BFO version change OR curated additions version change triggers re-evaluation. The `reproducibilityHash.finalHash.inputsHashed` includes `<Curated BFO additions version identifier>` so that hash verification detects curated-version drift. Sessions produced under curated v1.0 cannot be verified against curated v1.1 — they must be re-evaluated.

### Q-V1.0-3 — Analyst Override vs Session Compatibility

**Question:** If an analyst overrides an Inconsistent CAU with a manual BFO placement, does the `compatibilityDegraded` flag fire for just that CAU or for the entire session?

**Resolution:** **Per-CAU flagging only**. Session-level `compatibilityDegraded` flag is triggered strictly by DP-1 threshold conditions (per D1.6-DQ1), not individual overrides.

**Rationale (per SME):** An override reflects a local modeling issue, not a global ontology failure. Session-level compatibility is an aggregate assessment; individual overrides are individual decisions.

**Spec implementation:** §4.4 Inconsistent → Analyst Override path records `analystOverride: true` at the CAU level with original inconsistency preserved in history. Session-level `compatibilityDegraded` remains driven solely by D1.6-DQ1 threshold patterns.

### Q-V1.0-4 — localStorage Quota Interaction

**Question:** What is the interaction between iteration history and Workbench v0.2's localStorage quota (5MB cap)? DP-2 mandatory provenance compounds the storage pressure.

**Resolution:** **Storage-efficient encoding (axiom deduplication via dictionary + references) + pre-flight quota probe**. Preserve DP-2 invariants. Do NOT truncate audit trails.

**Rationale (per SME):** DP-2 is a hard invariant — provenance cannot be truncated. The solution is encoding efficiency: common axioms appear once in a session-level dictionary, and individual canonical records reference them by ID. Pre-flight quota probe (already implemented in Workbench v0.2 W-3.10) warns analysts before session start if storage pressure is likely.

**Spec implementation:** §7.3 Provenance schema references a session-level `axiomDictionary` via numeric IDs. Axiom entries like `{axiom: "hasParticipant some Continuant", ...}` are stored once in the dictionary and referenced as `axiomRefs: [7, 12, 18]` within individual records. Dictionary deduplication is mandatory; record inlining of axiom text is non-conformant under DP-2 Rule DP-2-R5 (new).

### Q-V1.0-5 — BFO Signature Caching

**Question:** Should the 13 BFO categories' Signatures be re-hashed and re-cached on every session start, or computed once per BFO version and reused across sessions?

**Resolution:** **Compute once per BFO version and cache.** Cache alongside the Disjointness Map. Rebuild only on VD-6 (including curated-additions version change per Q-V1.0-2).

**Rationale (per SME):** BFO signatures are static per version. Recomputing them per session is redundant work with no semantic benefit.

**Spec implementation:** §2.4 BFO Signatures section updated to specify caching alongside Disjointness Map. Session startup loads cache; does not recompute.

### Q-V1.0-6 — Phase 2 Evidence Model

**Question:** Does Phase 2's property disambiguation receive its own three-state evidence model, or does Phase 2 continue to use its existing mechanism?

**Resolution:** **Retain existing Phase 2 mechanism with lexical demotion. Defer full three-state evidence model for properties to D2.1.**

**Rationale (per SME):** D1.6 scope is already substantial. Passing CAU Logical Signatures into the current Phase 2 logic is sufficient for the PROV-O calibration study. Full Phase 2 three-state adoption is appropriate future work but not required for D1.6's acceptance criterion.

**Spec implementation:** D1.6-L21 already locked this scope; v1.0 confirms authoritatively. Rules PH2-1 and PH2-2 govern Phase 2's integration: input shape changes to CAU Signatures; lexical dimension demoted to advisory per Q-V1.0-8 resolution.

### Q-V1.0-7 — owl:oneOf Normalization Behavior

**Question:** When member types cannot be inferred for an `owl:oneOf` enumeration (heterogeneous or unknown-typed individuals), is dropping the enumeration from the Signature acceptable, or should such enumerations flag the CAU for analyst review?

**Resolution:** **Drop heterogeneous enumerations with a provenance note**.

**Rationale (per SME):** Enumerations spanning multiple BFO categories cannot correspond to a single universal and therefore represent modeling artifacts rather than alignable entities.

**Spec implementation:** §2.3 Step 3a specifies: "Enumerations where member types are heterogeneous or unknown are dropped from the Signature with a provenance note." The provenance note reads `owl:oneOf dropped: heterogeneous or undecidable member types; treated as modeling artifact per Q-V1.0-7 resolution`. The drop is recorded in the Signature's provenance, not silently discarded — satisfies DP-2 auditability.

### Q-V1.0-8 — Phase 2 Weight Rebalancing

**Question:** Phase 2's lexical dimension is demoted to advisory (Rule PH2-2). Do the weight vector defaults from D2 need rebalancing, or does existing PS-1 hash integrity + PD-10 validation produce correct behavior with Lexical advisory-only?

**Resolution:** **Set Lexical weight to 0.0 (advisory only); retain all other weights unchanged for D1.6.** Full weight rebalancing deferred to D2.1.

**Rationale (per SME):** Lexical similarity is removed from decision-making but remains surfaced as advisory evidence in the UI. Structural dimensions (Domain BFO, Range BFO, BFO subcategory, Characteristics, allowsInheresIn) continue to operate as currently defined. Avoids introducing new scoring semantics during D1.6.

**Spec implementation:** §9.2 Phase 2 light correction updated to specify: Lexical weight clamped to 0.0 in scoring. UI renders lexical matches as advisory-only evidence (tagged `advisory: true`). Other weights unchanged. PS-1 hash integrity and PD-10 weight validation continue to apply to the five substantive dimensions. Full rebalancing (possibly to four dimensions with normalized weights) deferred to D2.1.

---

**End of D1.6 v1.1.0 Specification — IMPLEMENTATION READY**

*SME approved 2026-04-18 (architecture + v0.1/v0.2 review + amendment text). Aaron approved 2026-04-18 (v1.0.1 BFO count correction + v1.1.0 Taxonomic Descent + Reactive Engine amendment + 14-16 week calendar + all scope gates). AVC bundle v3 authoring authorized. Implementation to follow per §10.2 SME-in-the-loop checkpoint schedule (5 checkpoints across 14-16 weeks).*

*v1.1.0 resolves the OBO-Foundry-scale ingestion failure through NA-1.1 Taxonomic Descent with Provisional Inheritance, NA-1.2 Signal Discipline and Contradiction Severity, NA-1.3 Descendant Reconciliation, and NA-1.4 Reactive Re-evaluation Engine. The system is now a reactive reasoning engine with IndexedDB-backed DependencyGraph infrastructure, capable of processing OBO-scale ontologies (NCBITaxon, GO, CHEBI, UBERON) without false-positive NotApplicable routing of horizontally axiom-poor leaf nodes.*


