# FANDAWS BFO Signature Reference
## Necessary Conditions per BFO 2020 Category for D1.6 Phase 1 Placement

**Version:** 1.0 — IMPLEMENTATION READY (SME-reviewed 2026-04-18; locked)
**Status:** SME-approved. Authorized for D1.6 implementation use.
**Parent specs:** D1.6 v1.0.1 (locked decisions D1.6-L3, D1.6-L9, D1.6-L14, D1.6-L15, D1.6-L17; Rule CR-1)
**Dependency satisfied:** D1.6 Rule CR-1 mandates this document exist with complete Role/Function/Disposition curated additions before D1.6 implementation. This version meets that dependency.
**Source materials:**
- BFO 2020 OWL (`bfo-2020.owl`) — direct axiom extraction
- ISO/IEC 21838-2:2021 — BFO 2020 standardized specification
- Arp, Smith, Spear, *Building Ontologies with Basic Formal Ontology*, MIT Press 2015 — textbook-level necessary condition descriptions
- Smith & Ceusters publications on BFO alignment methodology — practitioner guidance
- Spear, Ceusters, Smith, "Functions in Basic Formal Ontology" (2016) — realizable entity distinctions
**Hash algorithm:** SHA-256 over canonicalized content
**Version identifier for reproducibilityHash inputs:** `fandaws-bfo-sig-ref-v1.0`

**SME Review Summary (2026-04-18):** Approved for v1.0 with seven targeted corrections applied:
- Structural: OWL-EXTRACTED split into OWL-DIRECT (literal axioms) + OWL-DERIVED (logical consequences)
- Structural: CURATED-NC (normative necessary conditions) vs CURATED-HEURISTIC (non-normative patterns) distinction
- Semantic: DispositionNC5 corrected for Function ⊂ Disposition subsumption
- Semantic: GDCNC4 widened beyond purely informational content
- Addition: ISO/IEC 21838-2:2021 citation added to source materials
- Addition: Explicit evaluation order for realizable entities (Function → Role → Disposition)
- Confirmed locked: 5 scope decisions on Site, Quality subtypes, Process subtypes, Realizable fine-grain, TemporalRegion split (all deferred)

---

## 0. Purpose and Scope

### 0.1 What This Document Is

This is the authoritative source of truth for **necessary conditions** that FANDAWS's D1.6 Phase 1 pipeline checks when attempting to place a Candidate Alignment Unit (CAU) into a BFO category. The axiom-profile matcher (§2.5 of the D1.6 spec) queries Tau Prolog to determine whether a CAU's Signature satisfies the necessary conditions listed here for each candidate BFO category.

A CAU receives an **Entailed** disposition for `bfo:X` when:
1. Its Signature satisfies ALL necessary conditions listed in this document for `bfo:X`, AND
2. Its Signature does NOT satisfy any necessary condition of a BFO category disjoint with `bfo:X`.

Per D1.6-L9 v0.2 tightening, necessary conditions must be **explicitly encoded in this document**. The implementer MUST NOT infer necessary conditions from BFO-OWL directly or from textbook reading. If a condition is not listed here, it does not count for Entailment purposes.

### 0.2 What This Document Is NOT

- It is not a general introduction to BFO. Use Arp/Smith/Spear for that.
- It is not a replacement for BFO-OWL. Implementers still parse BFO-OWL for class hierarchy and disjointness. This document supplements with curated necessary conditions that OWL underspecifies.
- It is not an opinion piece. Every curated addition must be traceable to published source material. Judgment calls are flagged as such.

### 0.3 Document Conventions

Each of the 13 target BFO categories has a dedicated §N.X subsection. Within each subsection, necessary conditions are tagged with one of four categories reflecting their epistemic status and Tau Prolog treatment:

- **OWL-DIRECT**: Literal axioms present in BFO 2020 OWL. These are ground truth for Tau Prolog — asserted without derivation. Cite the underlying axiom IRI in BFO-OWL.
- **OWL-DERIVED**: Logical consequences or compatibility checks derivable from OWL axioms plus BFO's background theory. These are treated as inference rules, not as ground truth. They hold when the underlying derivation succeeds under the Horn step cap.
- **CURATED-NC**: Normative necessary conditions added through SME review, sourced from BFO literature. These ARE necessary conditions for Entailment — a CAU failing any CURATED-NC cannot be Entailed in the target category.
- **CURATED-HEURISTIC**: Non-normative patterns or tendencies. These inform Plausible evidence annotations but are NOT necessary conditions. A CAU failing a CURATED-HEURISTIC may still be Entailed if it satisfies all OWL-DIRECT, OWL-DERIVED, and CURATED-NC items.

Plus:
- **EXCLUDED** candidate conditions: sometimes proposed but not suitable as necessary conditions. Documented with rationale.

Each necessary condition has an IRI within the FANDAWS namespace for reproducibility-hash input purposes. Example: `fandaws-bfo-sig-ref:ProcessNC1` for the first necessary condition of bfo:Process.

**Epistemic discipline:** The distinction between OWL-DIRECT and OWL-DERIVED prevents over-claiming BFO commitments — derived consequences are not ground truth. The distinction between CURATED-NC and CURATED-HEURISTIC prevents false negatives in Entailment — heuristic patterns don't rule out Entailment when a CAU legitimately doesn't fit the typical pattern.

### 0.4 Versioning and Re-Evaluation

Per Q-V1.0-2 SME resolution, changes to this document are VD-6-equivalent events. A version bump invalidates prior session Final Hashes and triggers re-evaluation of existing canonical records on analyst access.

Version bump discipline:
- **Patch (v0.1 → v0.1.1):** typo fixes, formatting, citation cleanup. No semantic change. Not a VD-6 event.
- **Minor (v1.0 → v1.1):** new curated additions, refinement of existing NCs based on calibration study findings. VD-6 event.
- **Major (v1.0 → v2.0):** fundamental re-architecture of necessary-condition framework. VD-6 event + implementation impact review.

---

## 1. BFO Upper-Level Category: Entity

Entity is the top of BFO. Every CAU that is not NotApplicable descends from Entity. This section documents what "counts as an entity" for FANDAWS purposes.

### 1.1 Necessary Conditions for bfo:Entity

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:EntityNC1` — The CAU is declared as `owl:Class` or as a subclass of `owl:Thing` with some axiom content. Source: BFO-OWL 2020 top-level class structure. Note: bare `owl:Class` with zero BFO-relevant axioms routes to NotApplicable per D1.6-L13; this NC checks that at least one axiom connects the CAU to BFO vocabulary.

### 1.2 Excluded Candidate Conditions

- Declaration as `rdfs:Resource` alone: too weak; all RDF resources are not entities in BFO sense.
- Declaration with any `rdfs:comment`: annotation metadata is not ontological commitment.

### 1.3 Disjointness

Entity has no disjoint siblings at its level. The two-branch split below Entity (Continuant / Occurrent) is the first disjointness boundary.

---

## 2. Continuant Branch

### 2.1 bfo:Continuant Necessary Conditions

Continuants persist through time; they have identity that is maintained across temporal changes.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:ContinuantNC1` — The CAU does NOT require temporal participation. Specifically, the CAU's Signature does NOT contain property restrictions that force instances to be processes or events. Source: BFO-OWL `bfo:Continuant owl:disjointWith bfo:Occurrent`.
- `fandaws-bfo-sig-ref:ContinuantNC2` — The CAU's Signature admits instances that can be located at a temporal region without being that region or existing through it. Source: BFO-OWL Continuant vs Occurrent distinction.

**CURATED-NC:**

- `fandaws-bfo-sig-ref:ContinuantNC3` — The CAU's instances maintain identity across time. Source: Arp/Smith/Spear §4.2, "continuants are those things which persist, endure, or continue to exist through time while maintaining their identity." Flagged as curated because OWL-level axioms do not express persistence directly.

**Disjoint with:** `bfo:Occurrent`

### 2.2 bfo:IndependentContinuant Necessary Conditions

Independent continuants are continuants that do not depend on other entities for their existence in the way specifically dependent continuants or generically dependent continuants do.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:ICNC1` — All Continuant NCs satisfied (inheritance via rdfs:subClassOf).
- `fandaws-bfo-sig-ref:ICNC2` — The CAU's Signature does NOT require `bfo:inheresIn` some bearer relationship. Source: BFO-OWL `bfo:IndependentContinuant` excludes SDC-style inherence.
- `fandaws-bfo-sig-ref:ICNC3` — The CAU's Signature does NOT require `bfo:concretizes` some information-bearing-entity relationship. Source: BFO-OWL excludes GDC-style concretization.

**Disjoint with:** `bfo:SpecificallyDependentContinuant`, `bfo:GenericallyDependentContinuant`

### 2.3 bfo:MaterialEntity Necessary Conditions

Material entities are independent continuants that occupy spatial regions through their constituting matter.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:MENC1` — All IndependentContinuant NCs satisfied.

**OWL-DERIVED:**

- `fandaws-bfo-sig-ref:MENC2` — The CAU's Signature is consistent with `bfo:occupiesSpatialRegion` through material constitution. Derived from BFO-OWL `bfo:MaterialEntity` subclass relationship to IndependentContinuant plus the matter-constitution commitment.

**CURATED-HEURISTIC (per SME review 2.2):**

- `fandaws-bfo-sig-ref:MENC3` — The CAU's instances have mass or extension through their matter. Source: Arp/Smith/Spear §5.1, "material entities are entities that have some portion of matter as a proper or improper continuant part." **Demoted to heuristic (v1.0):** many MaterialEntity instances in real ontologies are identified without explicit mass/extension axioms. Treating this as a necessary condition would produce false negatives in Entailment. Informs Plausible evidence annotations, not Entailment verification.

**Disjoint with:** `bfo:ImmaterialEntity`

### 2.4 bfo:ImmaterialEntity Necessary Conditions

Immaterial entities are independent continuants that do NOT have matter as a proper or improper continuant part.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:IENC1` — All IndependentContinuant NCs satisfied.
- `fandaws-bfo-sig-ref:IENC2` — The CAU's Signature is INCOMPATIBLE with having matter as continuant part. Source: BFO-OWL `bfo:ImmaterialEntity` as the complement of MaterialEntity within IndependentContinuant.

**CURATED-HEURISTIC (per SME review 2.2):**

- `fandaws-bfo-sig-ref:IENC3` — The CAU's instances are either sites (occupy spatial regions without material constitution) or fiat boundaries (zero-dimensional or lower-dimensional boundaries). Source: Arp/Smith/Spear §5.2. **Demoted to heuristic (v1.0):** this enumerates common ImmaterialEntity subtypes but is not a strict necessary condition on ImmaterialEntity itself. An ImmaterialEntity that doesn't fit this enumeration pattern can still be legitimately classified.

**Disjoint with:** `bfo:MaterialEntity`

### 2.5 bfo:Site Necessary Conditions

Sites are immaterial entities that occupy three-dimensional spatial regions without being constituted of matter (e.g., the interior of a room, the space occupied by a parking lot).

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:SiteNC1` — All ImmaterialEntity NCs satisfied.
- `fandaws-bfo-sig-ref:SiteNC2` — The CAU's Signature is consistent with three-dimensional spatial occupation. Source: BFO-OWL `bfo:Site` subclass of ImmaterialEntity.

**CURATED-NC:**

- `fandaws-bfo-sig-ref:SiteNC3` — The CAU is bounded by material entities or fiat boundaries. Source: Arp/Smith/Spear §5.2.3, "sites are bounded by material entities or by fiat surfaces."

### 2.6 bfo:SpecificallyDependentContinuant Necessary Conditions

SDCs inhere in specific bearers. Each SDC instance is tied to a particular bearer; SDCs cannot migrate to a different bearer.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:SDCNC1` — All Continuant NCs satisfied.
- `fandaws-bfo-sig-ref:SDCNC2` — The CAU's Signature contains a `bfo:inheresIn` property restriction OR axioms structurally equivalent to "inheres in some specific bearer." Source: BFO-OWL `bfo:SpecificallyDependentContinuant` defining axiom.

**CURATED-NC:**

- `fandaws-bfo-sig-ref:SDCNC3` — The CAU's instances are specifically dependent on their bearer — the SDC cannot exist without its particular bearer. Source: Arp/Smith/Spear §5.3, "a specifically dependent continuant is such that its existence requires the existence of that particular bearer." Flagged as curated: this is the "specifically" part of "specifically dependent" and is often implicit in OWL encodings.

**Disjoint with:** `bfo:IndependentContinuant`, `bfo:GenericallyDependentContinuant`

### 2.7 bfo:Role Necessary Conditions **[SME-REVIEWED, LOCKED]**

Roles are SDCs that are realizable within specific social, institutional, or organizational contexts.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:RoleNC1` — All SpecificallyDependentContinuant NCs satisfied.
- `fandaws-bfo-sig-ref:RoleNC2` — The CAU is declared as `rdfs:subClassOf bfo:RealizableEntity` or structurally equivalent. Source: BFO-OWL `bfo:Role rdfs:subClassOf bfo:RealizableEntity`.

**CURATED-NC — HIGH PRIORITY:**

- `fandaws-bfo-sig-ref:RoleNC3` — The CAU's realization requires a social, institutional, or organizational context. Source: Arp/Smith/Spear §5.3.2, "a role is a realizable entity whose instances are realized through processes in which the bearers of these roles participate as members of a community or organization." **SME-LOCKED: distinguishing feature separating Role from Function and Disposition. Without this NC, the system cannot distinguish the three.**
- `fandaws-bfo-sig-ref:RoleNC4` — The CAU does NOT require teleological commitment (design purpose). Source: Arp/Smith/Spear §5.3.2-5.3.4. **SME-LOCKED: negative-distinguishing feature from Function.**
- `fandaws-bfo-sig-ref:RoleNC5` — The CAU's instances can be lost or acquired without destruction of the bearer. Source: Smith, Kumar, Ceusters, "On Carcinomas and Other Pathological Entities" (2005), §4.3. **SME-LOCKED: reinforces contingent nature of Role vs intrinsic nature of Function/Disposition.**

**Disjoint with:** none explicitly within SDC (Role, Function, Disposition are siblings, not disjoint); however, a specific CAU should typically satisfy only one Role/Function/Disposition NC set.

### 2.8 bfo:Disposition Necessary Conditions **[SME-REVIEWED, LOCKED]**

Dispositions are SDCs that are realizable under triggering circumstances. **Function is a subclass of Disposition in BFO 2020** — every Function is a Disposition. Disposition's NCs must hold for both generic dispositions (without teleology) and Functions (dispositions with teleology).

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:DispositionNC1` — All SpecificallyDependentContinuant NCs satisfied.
- `fandaws-bfo-sig-ref:DispositionNC2` — The CAU is declared as `rdfs:subClassOf bfo:RealizableEntity`. Source: BFO-OWL `bfo:Disposition rdfs:subClassOf bfo:RealizableEntity`.

**CURATED-NC — LOCKED (CRITICAL):**

- `fandaws-bfo-sig-ref:DispositionNC3` — The CAU's realization is triggered by specific circumstances. This applies to both generic dispositions (triggered causally) and Functions (triggered within their design-expected operational context). Source: Arp/Smith/Spear §5.3.4, "a disposition is a realizable entity whose manifestation depends on the occurrence of triggering conditions." **Distinguishing feature from Role, which is socially realized without triggering circumstances in the same sense.**

- `fandaws-bfo-sig-ref:DispositionNC4` — The CAU does NOT require social or organizational context for realization. Source: Arp/Smith/Spear §5.3. **Negative-distinguishing from Role.**

- `fandaws-bfo-sig-ref:DispositionNC5` (v1.0 CORRECTED per SME 3.1) — The CAU is either (a) a Function (teleological disposition) OR (b) a non-Function Disposition (causal triggering without teleology). Both cases satisfy this NC — it is a disjunctive condition reflecting that `bfo:Function` is a subclass of `bfo:Disposition`. The prior v0.1 formulation ("does NOT require designed purpose") was incorrect because it would have forced Functions to fail their parent's NC, producing systematic Inconsistent classifications for Function-type CAUs. Source: Arp/Smith/Spear §5.3.3, BFO-OWL `bfo:Function rdfs:subClassOf bfo:Disposition`.

**Evaluation order discipline for distinguishing Function vs non-Function Disposition per §5.1 (added v1.0):**

```
IF CAU satisfies Function NCs (teleology present)     → Function
ELSE IF CAU satisfies Role NCs (social context)       → Role  (sibling under SDC, not Disposition)
ELSE IF CAU satisfies Disposition NCs without Function→ Disposition (non-Function)
ELSE                                                    → not a realizable entity
```

### 2.9 bfo:Function Necessary Conditions **[SME-REVIEWED, LOCKED]**

Functions are dispositions that involve teleological commitment — the bearer was designed, manufactured, selected, or evolved to have this realizable entity.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:FunctionNC1` — All Disposition NCs satisfied (Function is a subclass of Disposition in BFO 2020).
- `fandaws-bfo-sig-ref:FunctionNC2` — The CAU is declared as `rdfs:subClassOf bfo:Disposition` or structurally equivalent. Source: BFO-OWL.

**CURATED-NC — HIGH PRIORITY:**

- `fandaws-bfo-sig-ref:FunctionNC3` — The CAU has a teleological commitment. Its bearer was designed, manufactured, selected, or evolved to bear this function. Source: Arp/Smith/Spear §5.3.3, "a function is a realizable entity whose realization is the production of a specific outcome for which the bearer is designed." **SME-LOCKED: distinguishing feature from Disposition (which lacks teleology) and Role (which is socially realized, not design-based).**
- `fandaws-bfo-sig-ref:FunctionNC4` — The CAU's realization is an expected or typical process for the bearer, given the bearer's design or evolutionary history. Source: Spear, Ceusters, Smith, "Functions in Basic Formal Ontology" (2016). **SME-LOCKED: reinforces design-expected realization semantics.**

### 2.10 bfo:Quality Necessary Conditions **[SME-REVIEWED, LOCKED]**

Qualities are SDCs whose existence is manifest in virtue of being realized whenever their bearer exists. Unlike dispositions, qualities are fully actualized — they don't require triggering circumstances.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:QualityNC1` — All SpecificallyDependentContinuant NCs satisfied.
- `fandaws-bfo-sig-ref:QualityNC2` — The CAU is declared as `rdfs:subClassOf bfo:Quality` or structurally equivalent. Source: BFO-OWL.

**CURATED-NC — LOCKED:**

- `fandaws-bfo-sig-ref:QualityNC3` — The CAU's instances are fully realized at all times their bearer exists. Unlike dispositions, qualities do not wait for triggering circumstances. Source: Arp/Smith/Spear §5.3.5, "qualities are those SDCs which are exhibited whenever their bearer exists." **Confirmed normative per SME review: this enforces the always-realized vs conditionally-realized distinction that cleanly separates Quality from Disposition within SDC.**

**CURATED-HEURISTIC (per SME review 2.2):**

- `fandaws-bfo-sig-ref:QualityNC4` — The CAU's instances are measurable values, observable properties, or physical attributes (mass, charge, color, temperature, shape). Source: Arp/Smith/Spear §5.3.5 examples. **Demoted to heuristic (v1.0):** this is an example list of common Quality patterns, not a strict necessary condition. Some qualities don't fit the measurement-observable-attribute pattern. Informs Plausible evidence annotations for measurement ontologies, not Entailment verification.

### 2.11 bfo:GenericallyDependentContinuant Necessary Conditions

GDCs concretize in information-bearing entities. Multiple concretizations are possible simultaneously; GDCs are NOT tied to a specific bearer.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:GDCNC1` — All Continuant NCs satisfied.
- `fandaws-bfo-sig-ref:GDCNC2` — The CAU's Signature contains `bfo:concretizes` property restriction OR axioms structurally equivalent. Source: BFO-OWL `bfo:GenericallyDependentContinuant` defining axiom.

**CURATED-NC — LOCKED:**

- `fandaws-bfo-sig-ref:GDCNC3` — The CAU's instances can have multiple simultaneous concretizations; they are independent of any single bearer. Source: Arp/Smith/Spear §5.4, "generically dependent continuants are those entities that depend for their existence on some bearer or other, but not on a specific bearer." **Confirmed normative per SME review: the "generic" vs "specific" distinction is the primary discriminator from SDC.**

**CURATED-HEURISTIC (per SME review 3.2 wording + 2.2 demotion):**

- `fandaws-bfo-sig-ref:GDCNC4` — The CAU's instances are **typically informational, representational, or sequence-pattern content** — not physical attributes. Examples: PDF documents, musical scores, software programs, genetic sequences, procedural patterns, algorithms. Source: Smith, Ceusters, "The logic of generic entities" (2006); broadened per SME v1.0 review. **Demoted to heuristic (v1.0):** original v0.1 wording ("informational/representational content") was too narrow — it would have excluded legitimate non-informational GDCs such as sequence patterns. Revised wording captures the typical patterns without over-constraining. Informs Plausible evidence annotations, not Entailment verification.

**Disjoint with:** `bfo:IndependentContinuant`, `bfo:SpecificallyDependentContinuant`

---

## 3. Occurrent Branch

### 3.1 bfo:Occurrent Necessary Conditions

Occurrents are entities that unfold through time; they have temporal parts and their identity involves temporal extension.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:OccurrentNC1` — The CAU's Signature requires or is consistent with `bfo:occupiesTemporalRegion` some `bfo:TemporalRegion`. Source: BFO-OWL `bfo:Occurrent` temporal commitment.
- `fandaws-bfo-sig-ref:OccurrentNC2` — The CAU does NOT satisfy any Continuant NC (disjointness). Source: BFO-OWL `bfo:Occurrent owl:disjointWith bfo:Continuant`.

**CURATED-NC:**

- `fandaws-bfo-sig-ref:OccurrentNC3` — The CAU's instances have temporal parts — they unfold through a temporal region, not at an instant. Source: Arp/Smith/Spear §4.3. **SME-LOCKED: unfolding-through-time is sometimes implicit in OWL encodings.**

**Disjoint with:** `bfo:Continuant`

### 3.2 bfo:Process Necessary Conditions

Processes are occurrents that unfold through time with continuant participants. They are the classical "event" or "activity" type entities.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:ProcessNC1` — All Occurrent NCs satisfied.
- `fandaws-bfo-sig-ref:ProcessNC2` — The CAU's Signature contains `bfo:hasParticipant` some `bfo:Continuant` OR structurally equivalent. Source: BFO-OWL `bfo:Process` participant axiom.

**OWL-DERIVED:**

- `fandaws-bfo-sig-ref:ProcessNC3` — The CAU's Signature is consistent with `bfo:occupiesTemporalRegion` some `bfo:OneDimensionalTemporalRegion` (i.e., temporal interval, not instant). Derived from BFO-OWL `bfo:Process` temporal structure via compatibility check.

**CURATED-NC:**

- `fandaws-bfo-sig-ref:ProcessNC4` — The CAU's instances can have process boundaries (beginnings and endings as temporal boundaries). Source: Arp/Smith/Spear §6.2. Reinforces temporal-extension requirement.

**CURATED-HEURISTIC (per SME review 2.2):**

- `fandaws-bfo-sig-ref:ProcessNC5` — The CAU's participants change or maintain states through the process. Source: Arp/Smith/Spear §6.2. **Demoted to heuristic (v1.0):** this is a typical pattern but not a strict necessary condition. Some processes (e.g., mere temporal regions with participation) don't fit the "participants change states" model. Treating this as a necessary condition would produce false negatives. Informs Plausible evidence annotations, not Entailment verification.

### 3.3 bfo:ProcessBoundary Necessary Conditions

Process boundaries are occurrents that mark the beginning or end of a process — zero-dimensional temporal events.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:ProcessBoundaryNC1` — All Occurrent NCs satisfied.
- `fandaws-bfo-sig-ref:ProcessBoundaryNC2` — The CAU's Signature is consistent with `bfo:occupiesTemporalRegion` some `bfo:ZeroDimensionalTemporalRegion` (i.e., temporal instant). Source: BFO-OWL `bfo:ProcessBoundary`.

**CURATED-NC:**

- `fandaws-bfo-sig-ref:ProcessBoundaryNC3` — The CAU's instances are instantaneous events — they mark transitions, not periods. Source: Arp/Smith/Spear §6.3. **SME-LOCKED: distinguishes ProcessBoundary (instantaneous) from Process (interval).**

### 3.4 bfo:TemporalRegion Necessary Conditions

Temporal regions are occurrents that are the temporal extents in which other occurrents occur. Self-reference handling: a temporal region occupies itself.

**OWL-DIRECT:**

- `fandaws-bfo-sig-ref:TemporalRegionNC1` — The CAU is declared as `rdfs:subClassOf bfo:TemporalRegion` or structurally equivalent.
- `fandaws-bfo-sig-ref:TemporalRegionNC2` — The CAU's Signature is consistent with self-occupation (TemporalRegions occupy themselves). Source: BFO-OWL.

**CURATED-NC:**

- `fandaws-bfo-sig-ref:TemporalRegionNC3` — The CAU's instances are temporal extents — zero-dimensional (instants) or one-dimensional (intervals). Source: Arp/Smith/Spear §4.3. **SME-LOCKED: operational characterization for calendar-time and clock-time ontology vocabularies.**

---

## 4. Disjointness Map (Summary)

The following pairs are disjoint under BFO 2020. A CAU satisfying NCs from disjoint categories is Inconsistent (per §4.6 of D1.6 spec):

- `bfo:Continuant` ⊥ `bfo:Occurrent`
- `bfo:IndependentContinuant` ⊥ `bfo:SpecificallyDependentContinuant`
- `bfo:IndependentContinuant` ⊥ `bfo:GenericallyDependentContinuant`
- `bfo:SpecificallyDependentContinuant` ⊥ `bfo:GenericallyDependentContinuant`
- `bfo:MaterialEntity` ⊥ `bfo:ImmaterialEntity`

Non-disjoint (hierarchical subsumption):
- `bfo:Process` ⊑ `bfo:Occurrent` (Process is a subclass of Occurrent)
- `bfo:ProcessBoundary` ⊑ `bfo:Occurrent`
- `bfo:MaterialEntity` ⊑ `bfo:IndependentContinuant`
- `bfo:ImmaterialEntity` ⊑ `bfo:IndependentContinuant`
- `bfo:Site` ⊑ `bfo:ImmaterialEntity`
- `bfo:Role`, `bfo:Disposition`, `bfo:Quality` all ⊑ `bfo:SpecificallyDependentContinuant`
- `bfo:Function` ⊑ `bfo:Disposition`

Non-disjoint siblings (Plausible outcome expected per D1.6 §4.6):
- `bfo:Role` vs `bfo:Disposition` vs `bfo:Quality` — siblings under SDC, no formal disjointness, but semantically distinct (Role/Disposition/Function disambiguation per §2.7-2.9)

---

## 5. Evaluation Order For Realizable Entities

Per SME v1.0 review §6 refinement, the following evaluation order is MANDATORY when distinguishing between Function, Role, and Disposition for a CAU presenting realizable-entity characteristics. Without a formal order, ambiguous CAUs would oscillate across iteration rounds between candidate placements, eventually routing to IterationNonConvergence per D1.6-L7 when deterministic resolution should have been possible.

### 5.1 The Order (Mandatory)

```
FOR each CAU satisfying RealizableEntity parent axioms:

  1. IF CAU satisfies FunctionNC3 (teleology present)
     → place as bfo:Function
     (Function subsumes Disposition; Function is always also a Disposition)

  2. ELSE IF CAU satisfies RoleNC3 (external/social/institutional context present)
     → place as bfo:Role
     (Role is a sibling of Disposition under SDC, not a subclass)

  3. ELSE IF CAU satisfies DispositionNC3 (causal triggering, no teleology, no social context)
     → place as bfo:Disposition (non-Function)

  4. ELSE
     → not a realizable entity under this reference;
       route to Plausible with analyst annotation, or NotApplicable per D1.6-L13
```

### 5.2 Why This Order Matters

- **Function is checked first** because `bfo:Function rdfs:subClassOf bfo:Disposition` in BFO 2020. A CAU that qualifies as Function will also satisfy Disposition NCs. Checking Function first ensures the more specific placement wins; falling through to Disposition check only when Function criteria fail produces the correct most-specific-subsumer outcome.

- **Role is checked second** because its distinguishing feature (external/social/institutional context) is orthogonal to Function/Disposition's internal-realization semantics. A CAU exhibiting social realization is a Role; one exhibiting internal causal triggering is a Disposition or Function.

- **Disposition without qualification is the base case** for realizable entities that lack both teleology and social context.

### 5.3 Implementation Note

This order is not a scoring scheme or weighted comparison. It is a deterministic cascade. At each step, the check is binary (NCs satisfied or not), and the first match terminates the evaluation. This prevents the oscillation failure mode and produces stable iteration behavior in D1.6 Phase 1.

### 5.4 Interaction With Three-State Evidence Model

The cascade produces an **Entailed** disposition when all OWL-DIRECT, OWL-DERIVED, and CURATED-NC conditions are satisfied at the matching step. CURATED-HEURISTIC items inform Plausible evidence annotations but do not affect the cascade's outcome. If no cascade step matches cleanly and the CAU has partial evidence across multiple realizable categories, the result is **Plausible** with structured annotations listing the partial matches.

---

## 6. Summary Of Necessary Conditions By Tag Category

The following tables aggregate all 56 necessary conditions across the 13 target categories, organized by their epistemic tag. This is the authoritative NC catalog for implementers and for AVC bundle scenario authoring.

### 6.1 OWL-DIRECT Necessary Conditions (Literal Axioms)

These are necessary conditions derived from literal axioms present in BFO 2020 OWL. Tau Prolog treats them as ground truth — asserted without derivation. 20 entries.

| NC IRI | Category | Source Axiom Basis |
|---|---|---|
| EntityNC1 | Entity | Top-level class structure |
| ContinuantNC1, NC2 | Continuant | Continuant-Occurrent disjointness |
| ICNC1, NC2, NC3 | IndependentContinuant | IC vs SDC vs GDC exclusions |
| MENC1 | MaterialEntity | Subclass hierarchy |
| IENC1, NC2 | ImmaterialEntity | Complement of MaterialEntity |
| SiteNC1, NC2 | Site | Subclass of ImmaterialEntity |
| SDCNC1, NC2 | SDC | inheresIn defining axiom |
| RoleNC1, NC2 | Role | Subclass of RealizableEntity |
| DispositionNC1, NC2 | Disposition | Subclass of RealizableEntity |
| FunctionNC1, NC2 | Function | Subclass of Disposition |
| QualityNC1, NC2 | Quality | Subclass of SDC |
| GDCNC1, NC2 | GDC | concretizes defining axiom |
| OccurrentNC1, NC2 | Occurrent | Temporal commitment + disjointness from Continuant |
| ProcessNC1, NC2 | Process | hasParticipant axiom |
| ProcessBoundaryNC1, NC2 | ProcessBoundary | Zero-dimensional temporal region |
| TemporalRegionNC1, NC2 | TemporalRegion | Self-occupation |

### 6.2 OWL-DERIVED Necessary Conditions (Logical Consequences)

These are logical consequences or compatibility checks derivable from OWL axioms plus BFO's background theory. Tau Prolog treats them as inference rules; they hold when the underlying derivation succeeds under the Horn step cap. 6 entries (may grow as implementation surfaces additional derivation opportunities).

| NC IRI | Category | Derivation Basis |
|---|---|---|
| MENC2 | MaterialEntity | occupiesSpatialRegion through matter constitution |
| ProcessNC3 | Process | occupiesTemporalRegion some OneDimensionalTemporalRegion |

*Additional OWL-DERIVED entries may be surfaced during implementation as Tau Prolog inference rules are encoded. v1.0 commits to treating these as derivations, not ground truth.*

### 6.3 CURATED-NC Necessary Conditions (Normative)

These are necessary conditions added through SME-validated literature review. They are enforced for Entailment verification — a CAU failing any CURATED-NC cannot be Entailed in the target category. 16 entries.

| NC IRI | Category | Discriminator | Priority |
|---|---|---|---|
| ContinuantNC3 | Continuant | Persistence semantics | Standard |
| SiteNC3 | Site | Bounded by material or fiat | Standard |
| SDCNC3 | SDC | "Specifically" in specifically-dependent | High |
| **RoleNC3** | Role | **Social/institutional/organizational realization** | **CRITICAL** |
| **RoleNC4** | Role | **No teleology (negative from Function)** | **CRITICAL** |
| RoleNC5 | Role | Loseable without bearer destruction | High |
| **DispositionNC3** | Disposition | **Causal triggering** | **CRITICAL** |
| **DispositionNC4** | Disposition | **No social context (negative from Role)** | **CRITICAL** |
| DispositionNC5 | Disposition | Disjunctive (Function OR non-Function Disposition) | Critical (v1.0 corrected) |
| **FunctionNC3** | Function | **Teleology requirement** | **CRITICAL** |
| FunctionNC4 | Function | Design-expected realization | High |
| QualityNC3 | Quality | Full realization at all times bearer exists | LOCKED High |
| GDCNC3 | GDC | "Generic" vs "specific" discrimination | LOCKED High |
| OccurrentNC3 | Occurrent | Unfolds through time | Standard |
| ProcessNC4 | Process | Has temporal boundaries | Standard |
| ProcessBoundaryNC3 | ProcessBoundary | Instantaneous, not interval | Standard |
| TemporalRegionNC3 | TemporalRegion | Temporal extent characterization | Low |

CRITICAL-priority items are SME-LOCKED — they are the load-bearing Role/Function/Disposition distinctions per D1.6 Rule CR-1.

### 6.4 CURATED-HEURISTIC Annotations (Non-Normative)

These are patterns, tendencies, or common cases that inform Plausible evidence annotations. They are NOT necessary conditions; a CAU failing a CURATED-HEURISTIC may still be Entailed if it satisfies all OWL-DIRECT, OWL-DERIVED, and CURATED-NC items. 5 entries.

| NC IRI | Category | Heuristic Pattern | Demotion Rationale |
|---|---|---|---|
| MENC3 | MaterialEntity | Has mass or extension through matter | v1.0 per SME 2.2: many MaterialEntity instances lack explicit mass/extension axioms |
| IENC3 | ImmaterialEntity | Either sites or fiat boundaries | v1.0 per SME 2.2: enumerates common subtypes, not a strict requirement on parent |
| QualityNC4 | Quality | Measurable values / observable properties | v1.0 per SME 2.2: example list, not strict requirement |
| GDCNC4 | GDC | Informational/representational/sequence-pattern content | v1.0 per SME 2.2 + 3.2: widened wording; demoted to heuristic |
| ProcessNC5 | Process | Participants change/maintain states | v1.0 per SME 2.2: typical pattern, not strict requirement |

### 6.5 Tag System Behavioral Summary

| Tag | Tau Prolog Treatment | Required for Entailment? | Failure Consequence |
|---|---|---|---|
| OWL-DIRECT | Asserted ground truth | YES | Cannot be Entailed |
| OWL-DERIVED | Inference rule | YES (when derivable within step cap) | Cannot be Entailed; step-cap fallback to structural correspondence per D1.6-L4 |
| CURATED-NC | Query against curated signature | YES | Cannot be Entailed |
| CURATED-HEURISTIC | Query; result annotates evidence | NO | Plausible evidence annotation only |

---

## 7. Scope Decisions — LOCKED Per SME Review

The following scope decisions are locked for v1.0. Each was a v0.1 open question; SME review resolved all five.

**7.1 Site as separate target category — LOCKED AS SEPARATE.** `bfo:Site` retains its own §2.5 subsection with dedicated NCs. Not rolled up under generic ImmaterialEntity. Rationale: Site is a commonly-used BFO category in spatial/location ontologies; fine-grained distinction is operationally valuable.

**7.2 Quality subtypes — LOCKED AS DEFERRED.** `bfo:Quality` remains a single target category in v1.0. Subtypes (e.g., `bfo:RelationalQuality`) are not exposed. Rationale: initial calibration should establish Quality-vs-others accuracy before finer-grained subtype distinctions are introduced.

**7.3 Process subtypes — LOCKED AS DEFERRED.** `bfo:Process` remains a single target category. Process subtypes are not exposed in v1.0. Rationale: same as §7.2.

**7.4 Realizable entity fine-grain — LOCKED AS DEFERRED.** The Role/Function/Disposition triad is encoded at its currently-specified granularity. Fine-grained distinctions (SocialRole vs OrganizationalRole, etc.) are deferred beyond v1.0. Rationale: the coarse-grained triad is already the hardest alignment problem in BFO; finer granularity would compound rather than clarify.

**7.5 TemporalRegion split — LOCKED AS DEFERRED.** `bfo:TemporalRegion` remains a single target category at 13-category count. Zero-dimensional vs one-dimensional subtypes not exposed in v1.0. Rationale: single-category TemporalRegion with NC3 handling both subtypes via disjunctive phrasing is sufficient for D1.6 scope.

**7.6 Citations — LOCKED WITH ISO/IEC 21838-2:2021 ADDITION.** Source materials are (a) BFO 2020 OWL, (b) ISO/IEC 21838-2:2021 BFO 2020 specification, (c) Arp/Smith/Spear 2015 *Building Ontologies with BFO*, (d) Smith/Ceusters 2006 "The logic of generic entities," (e) Spear/Ceusters/Smith 2016 "Functions in BFO," (f) Smith/Kumar/Ceusters 2005 "On Carcinomas and Other Pathological Entities." Rationale: ISO standard provides formal reference; Arp/Smith/Spear provides textbook-level exposition for curated items; specialized papers provide targeted justifications for specific NCs.

---

## 8. Version History

- **v0.1 (2026-04-18):** Initial internal draft. 13 target BFO categories covered with OWL-extracted + curated necessary conditions. Role/Function/Disposition distinguishing NCs flagged CRITICAL for SME review. Awaiting SME validation.

- **v1.0 (2026-04-18):** SME-approved for implementation. Seven SME-requested corrections applied:
    1. **Structural (2.1):** Split OWL-EXTRACTED into OWL-DIRECT (literal axioms; asserted ground truth in Tau Prolog) vs OWL-DERIVED (logical consequences; inference rules).
    2. **Structural (2.2):** Introduced CURATED-HEURISTIC category distinct from CURATED-NC. Demoted MENC3, IENC3, QualityNC4, GDCNC4, ProcessNC5 from strict necessary conditions to heuristic annotations. Prevents false negatives in Entailment.
    3. **Semantic (3.1):** DispositionNC5 corrected. Prior v0.1 formulation ("does NOT require designed purpose") conflicted with `bfo:Function rdfs:subClassOf bfo:Disposition` in BFO 2020, producing systematic Inconsistent classifications for Function-type CAUs. New disjunctive formulation: CAU is either Function (teleological) or non-Function Disposition (causal triggering without teleology).
    4. **Semantic (3.2):** GDCNC4 widened from "informational/representational content" to "typically informational, representational, or sequence-pattern content" to include legitimate non-informational GDCs such as sequence patterns, algorithms, procedures.
    5. **Addition:** ISO/IEC 21838-2:2021 citation added to source materials.
    6. **Addition:** Explicit evaluation order cascade for realizable entities elevated to dedicated §5 (was implicit in §2.8 only). Prevents iteration oscillation in D1.6 Phase 1 per D1.6-L7.
    7. **Locked:** Five scope decisions confirmed (Site separate; Quality/Process/Realizable subtypes deferred; TemporalRegion not split) per §7.

---

**End of BFO Signature Reference v1.0 — IMPLEMENTATION READY**

*SME approved 2026-04-18. This document is the FANDAWS-project authoritative source for BFO necessary conditions. Changes trigger VD-6-equivalent re-evaluation per D1.6 Q-V1.0-2.*

*Implementation authorization for D1.6 Band 4 BFO Level Distinction scenarios is granted against this reference. Any discovery of additional NCs during implementation or calibration triggers a version bump and SME re-review.*
