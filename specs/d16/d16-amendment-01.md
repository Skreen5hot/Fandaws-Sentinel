# D1.6 Amendment Document: Taxonomic Descent + Reactive Re-evaluation

**Amendment identifier:** D1.6-AMEND-01
**Date:** 2026-04-18
**Status:** DRAFT — awaiting Aaron review before artifact revisions
**Scope:** Upon approval, will bump D1.6 spec v1.0.1 → v1.1.0, AVC bundle v2 → v3, revise handoff memo
**Estimated calendar impact:** +3-4 weeks; revised D1.6 calendar 14-16 weeks from approval to PROV-O re-run
**Authority basis:** SME-originated amendment addressing scaling failure surfaced during Aaron's manual artifact review

---

## 1. Motivation: The OBO-Scale Ingestion Failure

### 1.1 What Aaron Caught

D1.6 v1.0.1 as specified would systematically fail on OBO-Foundry-scale ontologies. The concrete failure mode:

Most OBO-Foundry ontologies encode ontological commitment at higher taxonomic levels (genus, family, order) and leave leaf-level classes as bare `rdfs:subClassOf` declarations. NCBITaxon is the paradigmatic case: ~2.3 million classes, with rich axiomatization at higher levels and essentially bare leaf-level declarations like `NCBITaxon:9606 rdfs:subClassOf NCBITaxon:9605` (Homo sapiens under the Homo genus).

Under D1.6 v1.0.1's Rule NA-1 (D1.6-L13: default-hard-toward-NotApplicable for axiom-poor CAUs), nearly all leaf-level classes in such ontologies would route to NotApplicable. The aggregate effect:

- Calibration on NCBITaxon: ~2.29M of 2.3M CAUs route to NotApplicable (~99.5%)
- DP-1 diagnostic threshold (>40% NotApplicable per DQ-1) fires immediately at session start
- Session compatibility flag: OntologyLikelyNonRealistCompatible
- But the finding would be **wrong** — NCBITaxon is a well-formed realist ontology; the NotApplicable routing reflects systematic leaf-pattern artifacts, not actual non-realist-compatibility

This failure would make D1.6 unusable for the majority of realistic calibration scenarios. GO, CHEBI, UBERON, and other OBO-Foundry ontologies with deep taxonomic hierarchies would exhibit the same pattern. The calibration study Tests 2-6 would produce uninterpretable results.

### 1.2 Why D1.6 v1.0.1 Was Wrong

The root cause is architectural: D1.6 v1.0.1 treats axiom poverty as a CAU-local property ("this class lacks axioms, therefore it's a modeling artifact") when it's actually often a structural property of how the ontology encodes taxonomic hierarchies ("leaf-level classes derive their ontological commitment from their parents").

A MaterialEntity leaf node with no horizontal axioms is not ontologically outside BFO. Its BFO placement is inherited through subsumption from ancestors that do carry rich axiomatization. The D1.6 v1.0.1 specification failed to account for this inheritance pathway.

### 1.3 Why The Amendment Matters For The Calibration Study

This amendment is not just a scaling patch. It's a correctness improvement in what the calibration study can measure.

Under D1.6 v1.0.1 without this amendment, calibration results would conflate two distinct phenomena:
- Real ontology-BFO compatibility issues (the thing we're trying to measure)
- Artifacts of leaf-level axiom poverty (structural pattern, not compatibility signal)

Under D1.6 v1.1.0 with this amendment, the inheritance cascade handles the latter correctly, letting calibration measurements reflect the former. The DP-1 diagnostic's >40% NotApplicable threshold regains its intended semantic — it means "the ontology has substantive non-realist-compatibility issues," not "the ontology uses taxonomic inheritance."

---

## 2. The Four New Rules (Integrated Definitions)

The following four rules are added to D1.6 Section 8.3 Rules Catalog. I've integrated the SME's amendment text with cross-references to existing D1.6 rules and resolved interaction details beyond what the amendment stated.

### 2.1 Rule NA-1.1 — Taxonomic Descent with Provisional Inheritance

**Core rule:** A horizontally axiom-poor CAU (one whose Signature contains fewer than 2 BFO-relevant axioms, per the existing D1.6-L13 threshold) that has an `rdfs:subClassOf` parent with a stabilized Entailed or Plausible disposition MUST inherit that parent's BFO placement as a **provisional prior**.

**Precedence relative to existing D1.6-L13 (default-hard-toward-NotApplicable):**

```
FOR each axiom-poor CAU:
  IF (rdfs:subClassOf parent exists) AND
     (parent has stabilized Entailed or Plausible disposition):
    → inherit parent's placement as provisional (NA-1.1)
    → disposition: inherited from parent
    → validationState: provisional
  ELSE IF parent exists but disposition is NotApplicable:
    → axiom poverty is confirmed via parent; route to NotApplicable (D1.6-L13)
  ELSE IF parent exists but disposition is Inconsistent:
    → do NOT inherit; treat as independently inconsistent until re-evaluated
  ELSE (no parent or parent absent from this ontology):
    → route to NotApplicable (D1.6-L13 unchanged)
```

**Guardrail:** NA-1.1 inheritance MUST NOT override an existing strong structural contradiction present in the CAU. Specifically: if the CAU's Signature, though axiom-poor, contains at least one axiom that strongly contradicts the parent's placement per NA-1.2's signal discipline, inheritance does NOT apply and the CAU is evaluated independently.

**Implementation note:** The "fewer than 2 BFO-relevant axioms" threshold from D1.6-L13 is preserved as the trigger for NA-1.1's activation. The rule applies only to axiom-poor CAUs; richly axiomatized CAUs continue through the normal Phase 1 pipeline without triggering inheritance.

**Dispositional semantics:** A CAU placed via NA-1.1 receives disposition equal to its parent's disposition (Entailed or Plausible). It does NOT receive "provisionally Entailed" as a new fourth disposition — there remain four dispositions (Entailed, Plausible, Inconsistent, NotApplicable). What's "provisional" is the `validationState` field, which tracks whether the inherited placement has been validated against CAU-local signals.

### 2.2 Rule NA-1.2 — Signal Discipline & Contradiction Severity

**Core rule:** Inherited placements are revisable. New axiomatic evidence MUST trigger re-evaluation against the inherited disposition. Not all evidence is equally probative.

**Signal hierarchy (mandatory enforcement):**

Strong signals (contradiction-capable — may overturn inherited placement):
- BFO disjointness violations
- Domain/range violations
- Violations of OWL-DIRECT conditions per BFO Signature Reference
- Violations of CURATED-NC conditions per BFO Signature Reference
- Tau Prolog entailment failure under Horn inference

Weak signals (annotation-only — MUST NOT overturn inherited placement):
- Lexical labels (rdfs:label matches, synonym similarity)
- Naming patterns (IRI similarity, suffix/prefix conventions)
- Comment-text similarity (rdfs:comment analysis)

**Interaction with existing Q-V1.0-8 (Phase 2 lexical demotion):** The restriction on lexical signals in NA-1.2 is consistent with Q-V1.0-8's Phase 2 Lexical weight clamping to 0.0. Both restrictions derive from the same underlying principle: lexical matches are advisory evidence, not probative evidence. Implementation should share the advisory-evidence pathway between Phase 1 (NA-1.2 annotation) and Phase 2 (lexical display tagged `advisory: true`).

**Contradiction severity tiering:**

Hard contradictions → Inconsistent (PendingHumanResolution):
- Explicit BFO disjointness violation (CAU satisfies NCs of two disjoint categories)
- Mutually exclusive CURATED-NC conditions satisfied simultaneously
- Logical impossibility under BFO 2020 axioms

Soft contradictions → Plausible with conflictAnnotation:
- Domain/range tension that doesn't rise to full entailment failure
- Partial structural conflicts (e.g., some NCs for inherited category satisfied, some violated)
- Incomplete or evolving context (parent disposition itself may change via NA-1.3 cascade)

**Override principle (formalized):** Structural truth overrides inherited priors. When a strong signal contradicts an inherited placement, the inherited classification MUST be discarded and the CAU MUST be re-evaluated independently without inheritance for this round.

### 2.3 Rule NA-1.3 — Descendant Reconciliation

**Core rule:** When a CAU's placement or disposition changes (for any reason — analyst override, property evidence ingestion, mutation event per NA-1.4), all descendants that inherited placement from this CAU via NA-1.1 MUST be reconciled.

**Cascade mechanics:**

1. Flag all direct descendants (CAUs inheriting from the changed CAU) for re-evaluation
2. For each flagged descendant, recompute placement:
   - If descendant's local CAU signals still align with updated ancestor placement → inherit new placement
   - If descendant's local CAU signals now conflict → apply NA-1.2 override principle
3. Propagate transitively through the descendant tree until reaching either:
   - Terminal nodes (no further descendants)
   - Richly-axiomatized descendants (not inheriting via NA-1.1; their placement is independent)
4. Update `reconciliationHistory` field on each reconciled descendant's canonical record

**Provenance requirements (mandatory):**

Every reconciled descendant's canonical record MUST be updated with:
- `reconciliationHistory` entry capturing priorPlacement, triggeringEvent, updatedPlacement, timestamp
- Updated `dispositionReason` reflecting the new inheritance chain
- Updated `validationState` (reset to `provisional` on re-inheritance; `hard_conflict_detected` if NA-1.2 override triggered)

**Cycle prevention:** The descendant tree is strictly downward (rdfs:subClassOf descendant direction). NA-1.3 cascades follow this direction only. Upward propagation (to ancestors) is handled by NA-1.4's mutation event system, not by NA-1.3.

### 2.4 Rule NA-1.4 — Reactive Re-evaluation Engine

**Core rule:** FANDAWS operates as a reactive reasoning system, not a batch pipeline. Any mutation to the canonical graph MUST trigger localized re-evaluation of the affected dependency neighborhood.

**Mutation events (trigger condition):**

The following events constitute mutations that trigger re-evaluation:
- New CAU ingestion (addition to canonical graph)
- Property ingestion (domain/range resolution introduces new structural context)
- Change in CAU disposition (from any cause: iteration, override, reconciliation)
- Change in CAU BFO placement (even without disposition change)
- Analyst override of disposition or placement
- Resolution of previously Plausible or Inconsistent CAU (via analyst action or new evidence)

**Affected scope (mandatory re-evaluation targets):**

For each mutation event on CAU X, re-evaluation MUST be triggered for:
1. **Ancestors** of X (upward propagation) — X's parents and their parents, up to the nearest richly-axiomatized ancestor (not inheriting via NA-1.1)
2. **Descendants** of X (downward propagation via NA-1.3) — all CAUs inheriting from X directly or transitively
3. **Property-linked neighbors** — CAUs whose Signatures reference X via property domain/range declarations

**Execution constraints (performance safety):**

These constraints are mandatory. Without them, reactive re-evaluation can cause catastrophic performance degradation on large ontologies.

- **Bounded scope**: Re-evaluation scope MUST be bounded to the dependency graph of the triggering mutation. Full ontology re-evaluation is NOT performed on every mutation.
- **Cycle deduplication**: Within a single mutation cycle, each CAU MUST be reprocessed at most once. Multiple triggers for the same CAU within one cycle are deduplicated.
- **Cyclic dependency resolution**: rdfs:subClassOf cycles (which shouldn't exist in well-formed ontologies but do appear in real-world data) MUST resolve deterministically without oscillation. Resolution strategy: detect cycle, process each node once, flag cycle in session metadata.
- **Dependency graph construction**: At session start, compute dependency graph from the canonical graph's subsumption relationships and property domain/range declarations. Cache and update incrementally on mutations.

**Stability guarantee (convergence):**

The reactive system MUST converge to a stable fixed point after any finite sequence of mutations. Stable fixed point is defined as:
- No further NA-1.1/NA-1.2/NA-1.3 triggers would fire without a new external mutation
- All CAUs have one of: Entailed, Plausible, Inconsistent, NotApplicable
- No pending re-evaluations queued

**Convergence argument:** Termination is guaranteed by three properties:
1. Cycle deduplication prevents re-processing loops within a single mutation cycle
2. Each round's re-evaluation operates on a strictly smaller dependency subgraph than the prior round (monotonic shrinking of affected set)
3. The disposition lattice (Entailed / Plausible / Inconsistent / NotApplicable) has finite height; state can only cycle if the dependency graph itself is cyclic, which is handled by the cyclic dependency resolution constraint

Under these three properties, finite convergence follows. The convergence proof is non-trivial and will need SME-in-the-loop validation during implementation.

**Reactive vs batch distinction:**

Under D1.6 v1.0.1, a session had a terminal state: Phase 3 completes, session done. Under D1.6 v1.1, a session has stable fixed points from which new mutations can disturb equilibrium. The session lifecycle becomes:

```
Session start → initial convergence (equivalent to v1.0.1's Phase 1/2/3 batch run)
             → stable fixed point
             → [optional: analyst mutations trigger reactive re-evaluation]
             → new stable fixed point
             → [repeat as needed]
             → Session end (analyst explicitly closes or exports)
```

This is a real change in system behavior that requires careful implementation and testing.

---

## 3. Integration Details Beyond The Amendment Text

### 3.1 Updates To Existing Rules

Several existing D1.6 rules need updating to reference the new rules:

**D1.6-L13 (NotApplicable hybrid with default-hard-toward-NotApplicable):** Update to include NA-1.1 as precedence check. Revised wording:

> NotApplicable qualification hybrid with default-hard-toward-NotApplicable for axiom-poor CAUs that have no inheritable taxonomic parent (per NA-1.1 precedence). Axiom-poor CAUs with a parent having stabilized Entailed or Plausible disposition receive inherited placement via NA-1.1, not NotApplicable. Analyst may override either direction (into or out of NotApplicable).

**D1.6-L16 (NotApplicable terminal):** No change. NotApplicable remains terminal whether arrived at via D1.6-L13 or inherited-from-NotApplicable-parent per NA-1.1's precedence logic.

**Rule NA-1 (existing NotApplicable routing rule):** Extend to reference NA-1.1's precedence. A new version of NA-1 should read:

> NA-1 (v1.1): Route to NotApplicable when CAU is (a) declared skos:Concept (automatic), (b) axiom-poor AND has no parent inheritance path per NA-1.1 (default), or (c) manually placed by analyst.

**Rule EV-2 (Entailment criterion):** No change to criterion. Entailment still requires necessary-condition satisfaction. But Entailment-via-inheritance (NA-1.1) is a distinct pathway that produces disposition Entailed via provisional inheritance rather than via direct NC satisfaction. The disposition is the same; the provenance is different.

**Rule IT-4 (iteration triggers):** Extend to include NA-1.2 override events as iteration triggers when encountered mid-iteration. Strong-signal contradiction of an inherited placement is a legitimate iteration trigger.

### 3.2 New Locked Decision

**D1.6-L25 (new):** Taxonomic descent with provisional inheritance (NA-1.1) is a first-class architectural commitment. Horizontally axiom-poor CAUs derive BFO placement through subsumption when inheritance path is available, avoiding the OBO-scale ingestion failure that would result from categorical routing to NotApplicable. Reactive re-evaluation per NA-1.4 ensures self-correction when inherited placements conflict with subsequently-ingested evidence.

### 3.3 Explanation Schema Updates

§7.2 explanation field schema adds four new fields:

```
canonicalRecord.explanation = {
  // Existing fields preserved
  satisfiedConditionIRIs: [...],
  unsatisfiedConditionIRIs: [...],
  axiomsContributing: [...],
  disjointnessViolations: [...],

  // NEW (NA-1.1, NA-1.2, NA-1.3):
  dispositionReason: "Provisionally inherited via taxonomic descent from parent CAU [ParentIRI]"
                  | "Direct BFO alignment via necessary-condition satisfaction"
                  | "Inherited then validated via CAU-local strong signals"
                  | "Inherited then overridden via strong signal per NA-1.2"
                  | ...,

  validationState: "validated_no_conflict"     // inherited, no local contradicting signals
                 | "soft_conflict_detected"    // inherited, local soft contradiction, now Plausible
                 | "hard_conflict_detected"    // inherited, then overridden to Inconsistent
                 | "provisional"               // inherited, not yet validated against local signals
                 | "not_inherited",            // direct placement, no inheritance involved

  conflictAnnotation: {
    signalType: "domain_range" | "disjointness" | "entailment_failure" | "other",
    severity: "soft" | "hard",
    description: "human-readable explanation of the conflict"
  } | null,

  reconciliationHistory: [
    {
      priorPlacement: {disposition, bfoCategory},
      triggeringEvent: "parent_reconciliation" | "property_ingestion" | "analyst_override" | ...,
      updatedPlacement: {disposition, bfoCategory},
      timestamp: ISO-8601
    },
    ...
  ]
}
```

All four new fields are REQUIRED under DP-2 for CAUs whose placement involved NA-1.1, NA-1.2, or NA-1.3. For CAUs placed directly (no inheritance), `dispositionReason` is still required but `validationState` is `not_inherited`, `conflictAnnotation` is `null`, and `reconciliationHistory` is an empty array.

### 3.4 Dependency Graph Infrastructure (NA-1.4 Support)

New infrastructure component at session-level: `DependencyGraph`. This is an in-memory graph structure maintained throughout the session lifecycle.

- Nodes: CAUs + properties
- Edges:
  - CAU → CAU via rdfs:subClassOf (both directions tracked for ancestor/descendant traversal)
  - CAU → property via domain declaration
  - property → CAU via range declaration
  - property → CAU via propertyRestrictionsAsDomain in CAU Signature
- Cached: incrementally updated on mutation events per NA-1.4

Pre-flight storage estimate: for NCBITaxon scale (2.3M CAUs), dependency graph is approximately 50-80MB in-memory. Within Workbench v0.2's localStorage constraints only if aggressively compressed; likely needs Web Worker-based storage or IndexedDB backing. Implementation question for Workbench v0.2 adaptation scope.

---

## 4. AVC Bundle Changes

The amendment adds 7 new scenarios to Band 5 (NotApplicable Handling, to be renamed "NotApplicable and Inheritance Handling") and requires revision of one existing scenario.

### 4.1 Existing Scenario Revision

**`notapplicable-axiom-poor-default`** (Band 5, scenario from v2) — revised to reflect NA-1.1 precedence:

- OLD assertion: "CAU with Signature containing fewer than 2 BFO-relevant axioms defaults to NotApplicable"
- NEW assertion: "CAU with Signature containing fewer than 2 BFO-relevant axioms AND no inheritable parent defaults to NotApplicable; CAU with same axiom poverty BUT inheritable parent inherits via NA-1.1 (see `taxonomic-descent-provisional-inheritance`)"
- Scenario structure: split into two sub-scenarios, one for each path, or augmented with additional assertion

### 4.2 New Scenarios (7)

**`taxonomic-descent-provisional-inheritance`** (Band 5)
- Verifies NA-1.1 core behavior
- Setup: parent CAU with Entailed disposition for bfo:MaterialEntity, child CAU with zero horizontal axioms beyond rdfs:subClassOf parent
- Expected: child inherits disposition Entailed, bfoCategory bfo:MaterialEntity, validationState provisional
- Verifies: NA-1.1 precedence over D1.6-L13; inheritance bypasses NotApplicable routing

**`taxonomic-descent-signal-discipline`** (Band 5)
- Verifies NA-1.2 signal hierarchy
- Two sub-cases:
  - Strong signal case: child CAU has OWL-DIRECT violation vs inherited placement → contradiction triggers, inheritance overridden
  - Weak signal case: child CAU has lexical label conflicting with parent's category → annotation only, inheritance preserved
- Negative assertion: "Lexical signals MUST NOT trigger contradiction of inherited placement"

**`taxonomic-descent-soft-vs-hard-contradiction`** (Band 5)
- Verifies NA-1.2 contradiction severity tiering
- Two sub-cases:
  - Hard contradiction: disjointness violation → Inconsistent (PendingHumanResolution)
  - Soft contradiction: domain/range tension without full failure → Plausible with conflictAnnotation
- Verifies correct severity routing; conflictAnnotation structure

**`taxonomic-descent-reconciliation-cascade`** (Band 5)
- Verifies NA-1.3 cascade propagation
- Setup: 5-level taxonomic chain with leaf CAUs inheriting from root; analyst overrides root placement
- Expected: all 4 levels of descendants reconciled, reconciliationHistory populated on each
- Verifies: transitive cascade; termination at richly-axiomatized descendants; provenance completeness

**`reactive-re-evaluation-trigger`** (Band 5)
- Verifies NA-1.4 mutation event triggering
- Setup: stable session with 10 CAUs; ingest new property whose domain is an existing CAU
- Expected: dependency neighborhood around the domain CAU re-evaluated; outside CAUs untouched
- Verifies: mutation triggers localized re-evaluation, not global; scope bounded to dependency graph

**`reactive-cycle-deduplication`** (Band 5)
- Verifies NA-1.4 execution constraint: cycle deduplication
- Setup: mutation event that would trigger re-evaluation of CAU X via two paths (via ancestor and via property neighbor)
- Expected: CAU X re-processed exactly once, not twice
- Verifies: deduplication within cycle; performance safety

**`reactive-convergence`** (Band 5)
- Verifies NA-1.4 stability guarantee
- Setup: sequence of 3 mutations on interconnected CAUs; measure rounds to stable fixed point
- Expected: system converges in finite rounds (concrete bound: <= total CAU count); stable fixed point reached; no pending re-evaluations queued
- Verifies: termination; fixed-point semantics; no oscillation

### 4.3 Band Renaming

Band 5 renamed from "NotApplicable Handling" to "NotApplicable and Inheritance Handling" to reflect expanded scope.

### 4.4 Bundle Statistics

- v2: 61 scenarios
- v3 after this amendment: 61 + 7 new + 1 revised (split or augmented) = 68-69 scenarios
- Band 5 grows from 6 to 13 scenarios, becoming the second-densest band after Band 6 (DP-2, 10 scenarios)
- Total defensive negative assertions: 14 → 17 (three new from the amendment scenarios)

---

## 5. Calendar Impact

Revised calendar from D1.6 approval to PROV-O re-run: **14-16 weeks** (was 10-12).

Breakdown of additional time:

- **+1 week** for NA-1.1/NA-1.2/NA-1.3 implementation (inheritance cascade, signal discipline, reconciliation). These fit into the existing Band 5 implementation slot (originally weeks 3-4 per prior scenario).
- **+2-3 weeks** for NA-1.4 reactive engine. Dependency graph construction, mutation event system, cycle detection, convergence validation. This is net-new infrastructure.
- **+1 week** for the 7 new AVC scenarios + 1 revised scenario. Test-first methodology: codify before implementing.

Revised week-by-week:

- Weeks 1-2: CAU Signature extraction + BFO reference loading (Band 1)
- Weeks 3-5: Three-state evidence + iteration + NotApplicable + **inheritance cascade (NA-1.1/NA-1.2/NA-1.3)** (Bands 2, 3, 5)
- **Weeks 6-8: Reactive re-evaluation engine (NA-1.4)** — net-new slot
- Weeks 9-11: DP-2 infrastructure + DP-1 diagnostic (Bands 6, 7)
- Weeks 12-13: Phase 2 light correction + Workbench v0.2 adaptation (Band 8)
- Week 14-16: Integration testing + PROV-O re-run

SME checkpoints shift to accommodate:
- Checkpoint 1 at week 5 (after Band 1-5 + inheritance)
- Checkpoint 2 at week 8 (after NA-1.4 reactive engine)
- Checkpoint 3 at week 13 (before PROV-O re-run)

### 5.1 Calibration Study Impact

Tests 2-6 shift by approximately +3-4 weeks vs the prior 10-12 week estimate. Total delay from original (pre-D1.6-amendment) calibration resumption: approximately 2.5 months.

This is a real cost. The mitigation is that without the amendment, calibration Tests 2-6 would produce uninterpretable results on OBO-Foundry-scale ontologies (per §1.3 above), requiring a post-facto re-run after an emergency amendment. Better to delay 3-4 weeks and run calibration on correct architecture than rush and re-do.

---

## 6. Open Questions Requiring Input

### 6.1 Dependency Graph Storage Strategy For Large Ontologies

The estimate for NCBITaxon-scale dependency graph is 50-80MB in-memory. Workbench v0.2's localStorage quota is 5MB. Options:

**Option A:** Web Worker-based in-memory storage (no disk persistence; dependency graph rebuilds on session restart). Pros: simple; fast. Cons: large memory footprint in browser.

**Option B:** IndexedDB backing (persistent; rebuilds incrementally on session restart). Pros: survives session end; lower memory pressure. Cons: more complex; slower access patterns.

**Option C:** Hybrid — IndexedDB backing with in-memory cache for hot dependency subgraph. Pros: balanced. Cons: most complex.

SME/Aaron input needed to select. My recommendation: **Option B** for v1.1 initial release; upgrade to Option C in v1.1.1 if performance tuning warrants.

### 6.2 Convergence Guarantee Formalization

§2.4's convergence argument is a sketch, not a proof. Before implementation begins, we should have a more formal convergence argument reviewed by the SME. Specifically: the argument assumes the dependency graph is acyclic after cyclic-dependency resolution, but real ontologies can have complex cycle patterns that the "resolve deterministically" phrasing doesn't fully specify.

Proposal: draft a short convergence argument document (1-2 pages) during week 1 of implementation, SME reviews, confirms or refines the cycle-handling strategy. Does not block D1.6 approval but should happen before NA-1.4 implementation begins in week 6.

### 6.3 DP-2 Storage Pressure

NA-1.3 reconciliationHistory can grow substantially in high-mutation sessions. Combined with DP-2's mandatory provenance preservation (Q-V1.0-4: axiom dictionary deduplication + pre-flight quota probe), the localStorage constraints become tighter.

For D1.6 v1.1, I propose: reconciliationHistory subject to the same axiom-dictionary-deduplication strategy as other provenance (shared event types use shared IDs). If storage pressure remains unacceptable, analyst receives pre-flight warning per existing Q-V1.0-4 pattern.

Does not require new decision; natural extension of Q-V1.0-4.

### 6.4 Phase 2 Scope Revisitation

Original D1.6 scope (pre-amendment) had Phase 2 at "light correction" (consume CAU Signatures, lexical → 0.0 weight). The amendment's NA-1.4 reactive engine affects Phase 2 because property ingestion is a mutation event triggering Phase 1 re-evaluation.

Question: does Phase 2 itself need reactive-re-evaluation semantics, or does the existing Phase 2 batch behavior remain acceptable with NA-1.4 triggering Phase 1 re-evaluation when Phase 2 completes a property's disambiguation?

My recommendation: keep Phase 2 batch for D1.6 v1.1. Phase 2 reactive re-evaluation is a natural D2.1 addition alongside the three-state evidence model for properties. The amendment does not require Phase 2 architectural changes beyond the existing light correction.

Does not require new decision; maintains existing Q-V1.0-6 resolution.

---

## 7. Artifact Revision Plan (Upon Amendment Approval)

On your approval of this amendment, the following revisions proceed:

### 7.1 D1.6 Spec v1.0.1 → v1.1.0

Version bump justification: minor (new rules added, new locked decision). Changes:
- Header: version update; amendment reference
- §0 Rationale: brief note on OBO-scale amendment
- §1 Locked Decisions: D1.6-L25 added; D1.6-L13 updated
- §4.5 NotApplicable section: rewritten to reflect NA-1.1 precedence
- §7.2 Explanation Schema: four new fields added
- §8.3 Rules Catalog: four new rules (NA-1.1, NA-1.2, NA-1.3, NA-1.4); updates to NA-1, EV-2, IT-4
- §10.2 Checkpoint schedule: revised to 14-16 weeks with new checkpoint at week 5
- Section on Dependency Graph infrastructure: new subsection under §9 Implementation Considerations

Estimated spec growth: 956 lines → ~1,100-1,150 lines.

### 7.2 AVC Bundle v2 → v3

Version bump justification: minor revision (7 new scenarios + 1 revised). Changes:
- Band 5 renaming and expansion (7 new scenarios)
- Revised scenario `notapplicable-axiom-poor-default`
- Updated bundle statistics (61 → 68-69 scenarios)
- Revision history entry

Estimated bundle growth: 70,254 bytes → ~88,000-92,000 bytes.

### 7.3 BFO Signature Reference v1.0

No changes expected. NCs themselves don't change; only how CAUs are evaluated against them changes (now with NA-1.1 inheritance as first pass for axiom-poor CAUs).

### 7.4 Handoff Memo → revised

Revisions:
- Calendar updated to 14-16 weeks
- Decision request updated to reflect amendment inclusion
- "Real Tradeoffs" section gains OBO-scale architecture discussion
- "If You Want To Push Back" section updated with amendment-specific alternatives
- Recommendation adjusted: approve with amendment integrated

Estimated memo length: stays at ~1-2 pages; additions balanced by tightening in existing sections.

### 7.5 Amendment Document (This Document)

Upon approval, this amendment document becomes a permanent artifact in the D1.6 handoff package, serving as the authoritative record of the v1.0.1 → v1.1.0 change. Future readers understand why the amendment exists, what it changed, and how it integrates with the existing specification.

---

## 8. Decision Request

Aaron, your review of this amendment produces one of three outcomes:

1. **Approve amendment as drafted.** I proceed with artifact revisions (spec v1.1.0, bundle v3, revised memo). Estimated delivery: 4-6 hours focused work.

2. **Approve with modifications.** You flag specific concerns; I revise this amendment document and re-present; upon approval, proceed to artifact revisions.

3. **Reject / request further discussion.** We discuss underlying concerns before determining amendment direction.

The SME's amendment text was described as "implementation-ready," and I have reviewed it for integration details and interaction with existing rules. The amendment is architecturally sound. My preparation of this document has not surfaced any issues that would block approval; the four open questions in §6 are operational details that can be resolved during implementation, not amendment-blocking concerns.

My recommendation: approve as drafted, with the acknowledgment that calendar shifts to 14-16 weeks and Tests 2-6 of the calibration study shift by ~2.5 months total. The architectural correctness gained by this amendment is worth the delay.

---

**End of D1.6 Amendment Document (DRAFT)**

*Awaiting Aaron review. No artifact revisions will proceed until this amendment is approved.*
