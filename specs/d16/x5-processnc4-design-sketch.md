# SME-D16-X5 — ProcessNC4 Helper Design Sketch (DRAFT)

**Status:** DRAFT v1 2026-04-25. Pending SME consolidated review with x5-continuantnc3 + x5-occurrentnc3 sketches per S-B sequencing.
**Predicate:** `cau_admits_process_boundaries(CAU)`
**Priority anchor:** High — PROV-O `prov:Activity` instances admit start/end boundaries (`prov:startedAtTime`, `prov:endedAtTime`); a Process without admissible boundaries is structurally not a Process under BFO 2020.
**Scope:** Bucket B; co-required with OccurrentNC3 for full Process Entailment per `evidence-entailed-via-ncs` BCL (x4-triage §2.1).

---

## 1. Predicate intent

**Natural-language meaning** (Arp/Smith/Spear §6.2): every Process has temporal boundaries — beginnings and endings as zero-dimensional temporal regions (`bfo:ProcessBoundary`). The predicate "admits process boundaries" attests that the CAU is *structurally compatible* with having such boundaries — it doesn't require the boundaries to be explicitly named, but the CAU must be a temporal-extension entity that *could* be bounded.

**Distinction from ProcessNC2:** ProcessNC2 (P3 OWL-DIRECT) checks for `bfo:hasParticipant some bfo:Continuant` — the Process-Continuant participation pattern. ProcessNC4 is orthogonal — it checks the Process's temporal-extent admissibility for boundary-bearing.

**Relationship to OccurrentNC3:** ProcessNC4 is a Process-level *strengthening* of OccurrentNC3. OccurrentNC3 attests temporal-unfolding generally; ProcessNC4 attests bounded temporal-unfolding (Processes have START and END boundaries, which ProcessBoundaries instantiate). A CAU that satisfies OccurrentNC3 with bounded temporal extension also satisfies ProcessNC4; a CAU that satisfies OccurrentNC3 with *unbounded* temporal extension (e.g., a permanent quality fluctuation) would NOT satisfy ProcessNC4.

**OWL-encoding observation:** "Reinforces temporal-extension requirement." The structural marker is **temporal-boundary admissibility** — restrictions or annotations that commit the CAU to having admissible start/end. In practice this surfaces via:
- Explicit `bfo:hasFirstInstant` / `bfo:hasLastInstant` restrictions
- Cardinality constraints on temporal-boundary-bearing properties
- Subclass-of `bfo:Process` (which inherits the boundary admissibility)

**What the helper attests:** the CAU's signature contains structural evidence consistent with bounded-temporal-extension semantics — Process-subtree class membership AND/OR explicit boundary-instant restrictions.

---

## 2. Signature inputs

- **`ancestorChain`** — primary affirmation via `bfo:Process` or descendant (Process subclasses inherit boundary admissibility).
- **`existentialRestrictions`** — affirmation via `bfo:hasFirstInstant` / `bfo:hasLastInstant` restrictions (explicit boundary admissibility).
- **`cardinalityRestrictions`** — affirmation via cardinality ≥ 1 on `bfo:hasFirstInstant` / `bfo:hasLastInstant`.
- **`disjointnessAssertions`** — affirmation via `owl:disjointWith bfo:Continuant` (consistent with Process-flavor, not absolute).
- **`equivalenceClaims`** — affirmation via `owl:equivalentClass bfo:Process` or descendant.

Helper does NOT consume:
- Continuant-flavored markers (irrelevant; this NC is Process-specific).

---

## 3. Return shape

```js
{
  result: boolean,
  reason: 'process_subtree_ancestor'                  // affirmation
        | 'first_instant_restriction'                 // affirmation
        | 'last_instant_restriction'                  // affirmation
        | 'first_instant_cardinality'                 // affirmation (cardinality ≥ 1)
        | 'last_instant_cardinality'                  // affirmation
        | 'equivalent_class_to_process'               // affirmation
        | 'continuant_subtree_ancestor'               // contradiction
        | 'process_boundary_subtree_ancestor'         // contradiction (boundaries are bounded by definition; a ProcessBoundary doesn't ADMIT boundaries — it IS one)
        | 'no_structural_evidence',                   // silence
  evidence: {
    matchedAncestor?: string,
    matchedFirstInstantRestriction?: { onProperty, target },
    matchedLastInstantRestriction?: { onProperty, target },
    matchedCardinality?: { onProperty, count },
    matchedEquivalence?: string,
    contradictingAncestor?: string,
  },
  groundsNC: 'ProcessNC4',
  helperIRI: 'cau_admits_process_boundaries/1',
}
```

Nine distinct reason values across six affirmation paths + two contradiction paths + one silence path.

---

## 4. Option-A/B candidate readings

**Two readings surface, paralleling OccurrentNC3's structure.**

### Option A — Process-membership-only:
Affirmation = `bfo:Process` or descendant in ancestorChain. Boundary-instant restrictions are NOT independently sufficient — only ancestor-class membership counts.

**Pros:** simplest implementation; matches BFO inheritance discipline strictly.
**Cons:** rejects affirmation for CAUs that EXPLICITLY declare `bfo:hasFirstInstant` / `bfo:hasLastInstant` restrictions but lack named Process ancestor (under-axiomatized PROV-O Activity-flavored classes). Under Wave 2 strict-reading discipline, this is acceptable — the CAU is missing its Process ancestor, which is the modeling anomaly worth surfacing as `no_structural_evidence`.

### Option B — Process-membership-OR-explicit-boundary-restriction:
Affirmation = either Process ancestor OR explicit `bfo:hasFirstInstant`/`bfo:hasLastInstant` existential-or-cardinality restriction.

**Pros:** more permissive; accommodates under-axiomatized Activity-flavored classes (PROV-O `prov:Activity` may not always carry an explicit `rdfs:subClassOf bfo:Process` annotation; but if it carries `prov:startedAtTime`/`prov:endedAtTime` — which structurally map to bfo:hasFirstInstant/hasLastInstant patterns — the affirmation should fire).
**Cons:** the boundary-instant property check is a positive structural signal, not a negative absence — so Option B doesn't violate absence-not-evidence. Risk: a CAU with a coincidental `bfo:hasFirstInstant`-shaped restriction on a non-Process entity would falsely affirm.

**Developer lean: Option B (permissive on this specific axis).** Justification: PROV-O `prov:startedAtTime`/`prov:endedAtTime` are property-shape markers strongly indicating Process-flavor even when explicit Process ancestor is absent. Wave 2's QualityNC3 lean toward Option B (strict) was about RESTRICTING affirmation paths that absence-as-evidence; here, Option B EXPANDS affirmation paths by recognizing additional positive structural evidence. The two are not in tension.

**Counterargument** (for SME review): Option B may over-affirm for under-axiomatized classes that should structurally route Plausible. SME ruling sought.

**Note: this is the one cross-helper inconsistency** in this batch — ContinuantNC3 and OccurrentNC3 take strict readings; ProcessNC4 leans permissive on the boundary-instant-restriction path. Calling out for SME consolidated review.

---

## 5. OWA/CWA posture

Same as the other two helpers: mixed CWA + deterministic-false-on-silence. Helper returns `result: false` with `no_structural_evidence` reason when no structural marker present. Trichotomy-undetermined preserved at dispatcher layer when other NCs in cascade are undetermined.

---

## 6. Edge cases

| Case | Behavior | Reason |
|---|---|---|
| ancestorChain has `bfo:Process` | result: true | `process_subtree_ancestor` |
| ancestorChain has `bfo:Process` descendant (e.g., `cco:PlanExecution`) | result: true | `process_subtree_ancestor` |
| ancestorChain has `bfo:ProcessBoundary` only | result: false | `process_boundary_subtree_ancestor` (boundaries don't ADMIT boundaries) |
| ancestorChain has `bfo:Continuant` | result: false | `continuant_subtree_ancestor` |
| existentialRestrictions has `bfo:hasFirstInstant some bfo:ZeroDimensionalTemporalRegion` (Option B affirmation) | result: true | `first_instant_restriction` |
| existentialRestrictions has `bfo:hasLastInstant some ...` | result: true | `last_instant_restriction` |
| cardinalityRestrictions has `bfo:hasFirstInstant minCardinality 1` | result: true | `first_instant_cardinality` |
| equivalenceClaims has `bfo:Process` | result: true | `equivalent_class_to_process` |
| ancestorChain has both `bfo:Process` AND `bfo:Continuant` | result: false | `continuant_subtree_ancestor` (contradiction wins) |
| Empty signature + empty ancestorChain | result: false | `no_structural_evidence` |
| ancestorChain has `bfo:Occurrent` (parent of Process) but no Process descendant + no boundary restriction | result: false | `no_structural_evidence` (Occurrent admits non-Process subtypes; mere Occurrent-ness insufficient) |

**Note on last row:** OccurrentNC3 affirms on `bfo:Occurrent` ancestor; ProcessNC4 does NOT. ProcessNC4 is *Process*-specific, so an Occurrent that isn't a Process (e.g., Quality realization) shouldn't satisfy ProcessNC4. This asymmetry is correct per the NC's intent.

---

## 7. Test coverage plan

~14–16 tests covering each of the eleven edge-case rows + 3–4 adversarial cases (e.g., Process with ONLY boundary restrictions and no explicit Process ancestor; Process descendant via deep `rdfs:subClassOf` chain; multi-inheritance Process+Continuant fixture).

---

## 8. SME consolidated-review concerns

Specific to ProcessNC4:
- **Option A vs Option B**: developer leans B (permissive on boundary-instant-restriction affirmation). SME confirmation needed; this is the one within-batch inconsistency in posture choice.
- **`bfo:ProcessBoundary` contradiction precedence**: confirm `process_boundary_subtree_ancestor` is the right contradiction signal — a ProcessBoundary IS an Occurrent in BFO 2020, but doesn't admit further boundaries. SME ruling.
- **Asymmetric Occurrent handling**: ProcessNC4 does NOT affirm on `bfo:Occurrent` ancestor (only on `bfo:Process` or descendant). OccurrentNC3 DOES affirm on `bfo:Occurrent` ancestor. Confirm asymmetry is intentional per "ProcessNC4 is Process-specific strengthening of OccurrentNC3."

Cross-helper consistency:
- Reason enum naming aligns (snake_case; affirmation/contradiction/silence categorization).
- Multi-inheritance contradiction-wins precedence aligns.
- Helper return shape `{result, reason, evidence, groundsNC, helperIRI}` aligns with Wave 2 helpers.

---

## 9. Combined-coverage observation

Once all three helpers (ContinuantNC3, OccurrentNC3, ProcessNC4) land:

- BCL scenario `evidence-entailed-via-ncs` (x4-triage §2.1): unblocked. Process target requires ProcessNC1–4 + OccurrentNC1–3 satisfaction; Bucket A covered ProcessNC1/2/3 + OccurrentNC1/2; Bucket B fills ProcessNC4 + OccurrentNC3. All seven required NCs reachable; scenario clears to Entailed.
- BCL scenario `evidence-inconsistent-disjointness-firing` (x4-triage §2.3): unblocked. Continuant target requires ContinuantNC1/2/3; Bucket B fills ContinuantNC3. Cross-category Inconsistent path resumes.
- BCL scenario `evidence-subsumption-wins` (x4-triage §2.4): unblocked alongside §2.1.
- BCL scenario `evidence-sibling-ambiguity-plausible` (x4-triage §2.6): partially unblocked (Role still requires RoleNC5 helper, deferred to v1.1+; this scenario's Role candidate may stay BCL or shift to NAN depending on assertion granularity per X4 §6).

**Three of four BCL scenarios clear to NAN/SWC post-X5.** The fourth (sibling-ambiguity) remains partially-BCL until v1.1+ RoleNC5. This is the natural sequencing path; no scope expansion needed in X5.

---

## 10. References

Same as ContinuantNC3 sketch §9 + OccurrentNC3 sketch §9 + Wave 2 design sketch precedent at `specs/d16/wave2-helpers-design-sketch.md`.
