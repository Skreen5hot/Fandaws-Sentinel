# OWA vs CWA Prep + Predicate Ambiguity Log

**For:** SME Checkpoint 2 (Week 3 target)
**Date prepared:** 2026-04-21
**Parent:** Aaron briefing 2026-04-21, Advisory 1 + optional task 4

This doc prepares the developer for the OWA/CWA classification conversation in Checkpoint 2 Block 1 (~10 min allotted) and logs the predicates where implementation has surfaced semantic ambiguity worth SME input.

---

## Part 1 — OWA / CWA Prep (Advisory 1)

### 1.1 The semantic tension in two sentences

OWL (the ontology language) operates under the **Open World Assumption**: unstated propositions may still be true. Prolog (the reasoner we use) operates under the **Closed World Assumption / Negation-as-Failure**: unproven propositions are treated as false. When our Prolog encoding of a BFO necessary condition contains `\+ P(CAU)` — "CAU does not have property P" — the CWA semantic is "we assert not-P"; the OWA semantic should be "we have no evidence of P."

For a fully-specified Signature, the two interpretations converge. For a partial Signature (real-world ontologies often are), they diverge — and the divergence can move a CAU between Entailed and Plausible.

### 1.2 The 10 negative-commitment NCs currently tagged OWL-DIRECT

Listed in priority order for SME scrutiny (Aaron flagged the top 4 as "candidates I'd expect SME to scrutinize most closely"):

| NC | Negative claim | Current body (CWA) | OWA-preserving rewrite sketch |
|---|---|---|---|
| **ICNC2** | No `bfo:inheresIn` restriction | `\+ cau_has_property_restriction(CAU, 'bfo:inheresIn', _)` | `bg_theory_derives_absence(CAU, 'bfo:inheresIn', no_evidence)` — explicit derivation attempt |
| **ICNC3** | No `bfo:concretizes` restriction | `\+ cau_has_property_restriction(CAU, 'bfo:concretizes', _)` | Analogous |
| **IENC2** | Incompatible with matter as part | `\+ cau_has_matter_as_part(CAU)` | `bg_theory_derives_absence(CAU, matter_as_part, no_evidence)` |
| **OccurrentNC2** | Does NOT satisfy any Continuant NC | `\+ nc_continuant_nc1(CAU)` | `bg_theory_derives_absence(CAU, continuant_membership, no_evidence)` |
| ContinuantNC1 | Does NOT require temporal participation | `\+ cau_requires_temporal_participation(CAU)` | Analogous |
| ContinuantNC2 | Admits temporal location (mixed — positive claim with negative sub-clause) | `cau_admits_temporal_location(CAU), \+ cau_is_temporal_extent(CAU)` | Positive clause unchanged; negative sub-clause becomes derivation attempt |
| ICNC1 | All Continuant NCs satisfied (inheritance composition) | `nc_continuant_nc1(CAU), nc_continuant_nc2(CAU), nc_continuant_nc3(CAU)` | Inherits OWA/CWA status of parents |
| MENC1 | All IC NCs satisfied | Same — inheritance composition | Inherits |
| IENC1 | All IC NCs satisfied | Same | Inherits |
| SDCNC1 | All Continuant NCs satisfied | Same | Inherits |

**Top 4 most likely to need reclassification:** ICNC2, ICNC3, IENC2, OccurrentNC2. These make active claims about what instances *don't* participate in — exactly where CWA can over-commit.

### 1.3 What reclassification would cost implementation-wise

**Tag change:** one-line JSON edit per entry (`"tag": "OWL-DIRECT"` → `"tag": "OWL-DERIVED"`). Zero code impact.

**Body change (if SME wants OWA-preserving semantics):** rewrite the Prolog body to query the background theory rather than raw-absence-assert. Per-item effort: 10-30 minutes of predicate re-authoring plus a tau-prolog derivation-rule. Implementation impact:

- Performance: OWA-preserving checks run the reasoner on each NC; at 13 categories × ~3 negative-commitment NCs per branch = ~40 additional reasoner queries per CAU. Under the 10K step cap, still fast — but observably slower than raw absence checks. Order-of-magnitude estimate: 2-5x slowdown on negative-commitment NC evaluation; probably <30% overall, since positive-commitment NCs dominate execution time.
- Correctness: OWA-preserving checks will correctly route incomplete Signatures to Plausible rather than over-confidently to Entailed. This is the CORRECT behavior for Schema.org-style inputs (partial Signatures) and the wrong direction to economize on.

**Aaron's guidance 2026-04-21:** have the rewrite sketches ready per item; SME drives the decision; most reclassifications would be "relatively mechanical" shifts from direct absence-assertion to derivation query.

### 1.4 Decision framing for the session

For each of the 10 items, SME picks one:
1. **Keep OWL-DIRECT with CWA body.** Fast, simple, may over-commit on partial Signatures.
2. **Reclassify to OWL-DERIVED with OWA body.** Slower, preserves OWA semantics, correctly handles partial Signatures.
3. **OWL-DIRECT with OWA body (hybrid).** Uncommon; would encode "this is a ground-truth rule but it uses OWA semantics." Only makes sense if the rule itself is an axiom of OWA reasoning.

**Default recommendation (developer side):** reclassify ICNC2, ICNC3, IENC2, OccurrentNC2 to OWL-DERIVED with OWA body. The other 6 are inheritance compositions whose status follows their parents — revisit only if a parent is reclassified.

### 1.5 Band 3 scaffolding forward-note

Per Aaron's flag: when Band 3 evaluator uses CWA-style absence-checks in scaffold mode (Week 2 through Checkpoint 2), incomplete Signatures could produce Entailed where OWA would require Plausible. This doesn't surface on the well-formed test fixtures but will surface on Schema.org calibration (Weeks 3-4).

**Mitigation already in code:** the scaffold evaluator requires OWL-DIRECT + OWL-DERIVED NCs for Entailment and treats CURATED-NC as decoration (per scaffold-mode policy documented at [src/core/d16/three-state-evaluator.js:76-91](../../src/core/d16/three-state-evaluator.js#L76-L91)). If Checkpoint 2 reclassifies the 4 negative-commitment items to OWL-DERIVED with OWA bodies, the evaluator will automatically apply the OWA-preserving route for them. Calibration will then validate.

**Mitigation not yet in code:** the CURATED-NC items with negative clauses (RoleNC4, DispositionNC4, DispositionNC5-second-disjunct, QualityNC3-second-conjunct) carry the same OWA/CWA tension and are NOT downgradable to "decoration only" because they're discriminators for Role/Function/Disposition. Checkpoint 2 should decide whether these need OWA-preserving rewrites too.

---

## Part 2 — Predicate Ambiguity Log (Optional Task 4)

Predicates where Week 1-2 implementation surfaced ambiguity worth SME input. The existing `cau_consistent_with/3` is already on Aaron's list; this catalogs the others.

### 2.1 `cau_bearer_is_particular_not_generic/1`

**Used by:** SDCNC3, GDCNC3 (negated), DispositionNC1/QualityNC1/etc. via SDCNC3 inheritance.

**Current sketch:** operationalize as "cardinality 1 on inheresIn + absence of concretizes."

**Ambiguity:** is "particular" genuinely captured by cardinality 1? Counter-example: an SDC with `inheresIn some Bearer` (no cardinality) is still particular per the BFO semantic — each instance of the SDC class still inheres in one specific bearer at the instance level. The class-level Signature doesn't express this constraint.

**Question for SME:** at the Signature level (class-level axioms only), how do we distinguish SDC's particularity from GDC's genericness without relying on cardinality axioms? Candidates: (a) any `inheresIn` restriction counts as particular; (b) require explicit cardinality 1 axiom; (c) require absence of `concretizes` as the sole negative discriminator.

**Priority:** High. SDCNC3 and GDCNC3 are both SME-LOCKED.

### 2.2 `cau_unfolds_through_time/1`

**Used by:** OccurrentNC3.

**Current sketch:** no concrete body_draft — placeholder predicate naming only.

**Ambiguity:** the Arp/Smith/Spear prose says occurrents "have temporal parts" — but "has temporal parts" is not a standard axiom in BFO-OWL. The concept is implicit in BFO's occurrent modeling but not axiomatized. What signature pattern counts as evidence of unfolding-through-time?

**Question for SME:** is presence of `bfo:occupiesTemporalRegion some bfo:OneDimensionalTemporalRegion` sufficient evidence, or do we need stronger axioms (e.g., explicit `hasTemporalPart` axioms if they appear in the source ontology)?

**Priority:** Standard (SME-locked but not CRITICAL).

### 2.3 `cau_identity_persists_through_time/1`

**Used by:** ContinuantNC3.

**Current sketch:** no concrete body_draft.

**Ambiguity:** persistence is likewise implicit in BFO's continuant modeling but not axiomatized. What signature pattern evidences identity-persistence?

**Question for SME:** is membership in the Continuant branch (via `rdfs:subClassOf` chain to `bfo:Continuant`) sufficient evidence, or do we need positive axioms?

**Priority:** Standard.

### 2.4 `cau_bounded_by_material_entity/1`, `cau_bounded_by_fiat_surface/1`

**Used by:** SiteNC3.

**Current sketch:** no concrete body_draft — placeholder predicate naming only.

**Ambiguity:** "bounded by" isn't a standard BFO property. Practitioners use `bfo:locatedIn`, `bfo:occupiesSpatialRegion`, and domain-specific boundary relations. The boundary semantic is intuitive but not unified across OBO ontologies.

**Question for SME:** is there a canonical BFO property for boundary (e.g., a derived use of `has2DSurface` or similar), or should the predicate accept any of a curated set of domain-specific boundary relations?

**Priority:** Low (Site is a less-common target category per §7.1 scope decision).

### 2.5 `cau_realization_requires_social_institutional_context/1`

**Used by:** RoleNC3 (positive), DispositionNC4 (negated).

**Current sketch:** predicate named but not operationalized.

**Ambiguity:** operationalization requires a curated "social/institutional process" category list (mentioned in the gloss doc as "a curated SME artifact"). The list doesn't yet exist. Without it, the predicate can't actually fire.

**Question for SME:** does such a category list exist in BFO literature or in SME's own curation work? If not, what's the scoping process for building one? Is this a Checkpoint 2 deliverable or a Checkpoint 3 deliverable?

**Priority:** CRITICAL (RoleNC3 is the primary Role discriminator).

### 2.6 `cau_has_teleological_commitment/1`

**Used by:** FunctionNC3 (positive), RoleNC4 (negated), DispositionNC5 (disjunctive with both polarities).

**Current sketch:** predicate named but not operationalized.

**Ambiguity:** same structural problem as §2.5 — needs a curated "design-expected process" / "evolved-for process" category list.

**Question for SME:** same as §2.5.

**Priority:** CRITICAL (FunctionNC3 is the Function discriminator).

### 2.7 `cau_realization_is_design_expected/1`

**Used by:** FunctionNC4.

**Ambiguity:** depends on the same curated list as FunctionNC3, plus a notion of "consistent realization" that compares the CAU's `isRealizedIn` target against the expected-process list.

**Priority:** High (FunctionNC4 reinforces FunctionNC3).

### 2.8 `cau_always_realized_when_bearer_exists/1`

**Used by:** QualityNC3.

**Current sketch:** predicate named but not operationalized.

**Ambiguity:** this is a co-existence claim between the CAU and its bearer. At the Signature level, how is "always realized" distinguished from "conditionally realized"? Candidates: (a) absence of any `isRealizedIn` restriction (qualities don't need realization — they just are); (b) presence of a specific co-existence axiom pattern.

**Question for SME:** which operationalization captures the Quality intent? The absence-of-isRealizedIn candidate is tempting but runs into OWA/CWA issues per Advisory 1.

**Priority:** High.

### 2.9 Summary: the "curated category list" gap

Five of the CRITICAL/High items (RoleNC3, RoleNC4, DispositionNC3, DispositionNC4, FunctionNC3, FunctionNC4, DispositionNC5) operationally depend on curated BFO category lists that do not yet exist:

- Social/institutional process category
- Design-expected / evolved-for process category
- Triggering-circumstances process category

**This is the single biggest implementation blocker for Band 4 (BFO Level Distinction)** and is likely a Week 3-4 SME deliverable. Needs to be flagged in Checkpoint 2 action items.

---

## Part 3 — SME Decision Artifact Mapping

The Checkpoint 2 briefing document ([checkpoint-2-briefing.md](checkpoint-2-briefing.md)) has decision checkboxes for each agenda item. This prep doc feeds into the following briefing sections:

- Briefing §1.1 (OWL-DIRECT classification): covered by Part 1 of this doc
- Briefing §1.4 (CRITICAL items spot-check): expanded to 11 items per Advisory 2, glosses in [critical-ncs-gloss.md](critical-ncs-gloss.md)
- Briefing §1.2 (`cau_consistent_with`): carries over unchanged
- New Checkpoint 2 item: curated category lists (Part 2 §2.9 above) — needs to be added to briefing as a post-session deliverable ask
