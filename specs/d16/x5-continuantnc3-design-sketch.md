# SME-D16-X5 — ContinuantNC3 Helper Design Sketch (DRAFT)

**Status:** DRAFT v1 2026-04-25. Pending SME consolidated review with x5-occurrentnc3 + x5-processnc4 sketches per S-B sequencing.
**Predicate:** `cau_identity_persists_through_time(CAU)`
**Priority anchor:** Highest — PROV-O `prov:Entity` is Continuant; identity-persistence is core semantic for any Continuant alignment.
**Scope:** Bucket B (per SME-D16-X5 routing); enables BCL scenarios involving Continuant ancestors to clear toward Entailed once helper lands.

---

## 1. Predicate intent

**Natural-language meaning** (Arp/Smith/Spear §4.2): Continuants maintain numerical identity across time. A Continuant instance at t1 is the same entity as that instance at t2, even though its qualities may change. This is the semantic distinction from Occurrents (which have temporal parts and unfold).

**OWL-encoding observation** (from NC description): "Persistence semantics are normatively required; OWL-level axioms do not express persistence directly." Identity-persistence is **inferred from structural class membership in BFO 2020**, not from a dedicated OWL axiom. The helper therefore reads structural markers, not direct persistence axioms.

**What the helper attests:** the CAU's signature contains structural evidence consistent with persistence-through-time semantics — specifically, BFO Continuant-subtree class membership (which by BFO axiom commits to persistence) AND absence of structural patterns that would contradict persistence (e.g., explicit temporal-part decomposition typical of Occurrents).

---

## 2. Signature inputs

Helper consumes from CAU signature (per `extractCAUSignature` output):

- **`ancestorChain`** (from caller; inheritance walk over `rdfs:subClassOf` named-class edges) — primary affirmation source.
- **`disjointnessAssertions`** — affirmation via `owl:disjointWith bfo:Occurrent` (asserts non-Occurrent membership).
- **`existentialRestrictions`** — contradiction check: presence of `bfo:occupiesTemporalRegion`, `bfo:hasTemporalPart`, or `bfo:hasFirstInstant`/`bfo:hasLastInstant` patterns suggests Occurrent-style temporal decomposition.
- **`equivalenceClaims`** — affirmation via `owl:equivalentClass bfo:Continuant` or descendant.

Helper does NOT consume:
- `propertyRestrictionsAsRange` (not relevant to the CAU's own persistence)
- `cardinalityRestrictions` (orthogonal to persistence semantics)

---

## 3. Return shape

Per Wave 2 precedent + `feedback_structured_failure_reasons.md`:

```js
{
  result: boolean,
  reason: 'continuant_subtree_ancestor'           // affirmation (result: true)
        | 'disjoint_with_occurrent'                // affirmation (result: true)
        | 'equivalent_class_to_continuant'         // affirmation (result: true)
        | 'temporal_part_decomposition_present'    // contradiction (result: false)
        | 'occurrent_subtree_ancestor'             // contradiction (result: false)
        | 'no_structural_evidence',                // silence (result: false)
  evidence: {
    matchedAncestor?: string,                       // for affirmation/contradiction via ancestorChain
    matchedDisjointness?: string,                   // for disjoint_with_occurrent
    matchedEquivalence?: string,                    // for equivalent_class_to_continuant
    contradictingRestrictions?: Array<{onProperty, target}>,  // for temporal_part_decomposition_present
  },
  groundsNC: 'ContinuantNC3',
  helperIRI: 'cau_identity_persists_through_time/1',
}
```

**Reason enum design:** six distinct values across three affirmation paths + two contradiction paths + one silence path. DP-2 provenance consumes `reason` strings as `contributionRole` values per Wave 0/1/2 pattern.

---

## 4. Option-A/B candidate readings

Single defensible reading. No genuine A/B branch surfaced.

**Considered alternative:** look for explicit `bfo:existsAt` restriction as affirmation (existsAt asserts persistence-at-temporal-region). **Rejected** — `bfo:existsAt` is a relational property between Continuants and TemporalRegions; its presence in a Continuant's signature is downstream of Continuant membership, not an independent affirmation. Including it would double-count the same evidence.

**Selected reading**: structural class-membership affirmation (via ancestor / disjointness / equivalence) is the strict structural marker. Contradiction via temporal-decomposition restrictions is independent contradiction evidence (an Occurrent-flavored CAU with these restrictions is structurally unfit even if some Continuant marker also appears).

---

## 5. OWA/CWA posture

**Mixed CWA + helper-returns-false-on-silence.**

Per `feedback_absence_not_evidence.md`: absence of structural evidence is NOT positive evidence of non-persistence. However, the helper's contract (per dispatcher integration) is to return `{result: boolean}` deterministically. Silence routes to `result: false` with `reason: 'no_structural_evidence'`.

**Trichotomy preservation at dispatcher layer:** the dispatcher consumes the helper's `false` return, but the routing in three-state-evaluator interprets it via the trichotomy. Per the X4 design, helpers don't produce `undetermined`; the dispatcher routes helper-returned-false to `unsatisfied`. Under absence-not-evidence discipline, downstream Plausible-with-coverage-gap routing is achieved via OTHER undetermined NCs in the cascade, not via this helper.

**Strict-reading discipline preserved:** the helper actively asserts structural evidence; absence is a deterministic-false response, not silent affirmation. SME may revise to undetermined-on-silence at review if cross-helper consistency requires; current sketch leans deterministic-false with explicit `no_structural_evidence` reason for downstream auditability.

**Posture per Wave 2 precedent:** matches SDCNC3 pattern (positive structural check; absence is `false`).

---

## 6. Edge cases

| Case | Behavior | Reason |
|---|---|---|
| ancestorChain has `bfo:Continuant` | result: true | `continuant_subtree_ancestor` |
| ancestorChain has both `bfo:Continuant` AND `bfo:Occurrent` (multi-inheritance anomaly) | result: false | `occurrent_subtree_ancestor` (contradiction wins) |
| disjointnessAssertions has `bfo:Occurrent` | result: true | `disjoint_with_occurrent` |
| equivalenceClaims has `bfo:Continuant` | result: true | `equivalent_class_to_continuant` |
| existentialRestrictions has `bfo:hasTemporalPart` | result: false | `temporal_part_decomposition_present` |
| Empty ancestorChain + no disjointness + no equivalence + no contradicting restrictions | result: false | `no_structural_evidence` |
| `bfo:existsAt` restriction present (no other markers) | result: false | `no_structural_evidence` (existsAt not counted as independent affirmation per §4) |

**Multi-inheritance anomaly:** when both Continuant and Occurrent ancestors appear, contradiction-wins-over-affirmation precedence holds (matches ContinuantNC2 P4 matcher discipline from X4 Commit 2). Surfaced as `result: false` with the contradiction reason; user-ontology modeling error visible downstream.

---

## 7. Test coverage plan

Following SDCNC3 unit-test precedent: ~10–12 tests covering each of the seven edge-case rows above + 2–3 adversarial cases (e.g., ancestor chain with Continuant ancestor THROUGH an intermediate non-BFO class; deeply-nested equivalentClass via blank-node restriction).

---

## 8. SME consolidated-review concerns

Cross-helper consistency to verify at review:
- All three helpers (this + OccurrentNC3 + ProcessNC4) use deterministic-false-on-silence, not undetermined-on-silence. Confirm this is the locked posture for Wave 2-style helpers (vs. P4 OWL-DIRECT matchers which DO use undetermined-on-silence per X4 Commit 2).
- Reason enum naming convention: snake_case strings. Consistent across all three sketches.
- Multi-inheritance precedence: contradiction-wins. Consistent with ContinuantNC2 lint refinement banked at X4 Commit 3.
- `bfo:existsAt` rejection from affirmation list — applies symmetrically to OccurrentNC3 (no `bfo:occupiesTemporalRegion` as independent OccurrentNC3 affirmation; that's OccurrentNC1's territory).

---

## 9. References

- `specs/d16/bfo-signatures-v1.0.json` — ContinuantNC3 record (id, description, source: Arp/Smith/Spear §4.2)
- `src/core/d16/critical-nc-helpers.js` — Wave 2 helper precedent (SDCNC3, GDCNC3, QualityNC3)
- `feedback_structured_failure_reasons.md` — reason enum discipline
- `feedback_absence_not_evidence.md` — absence-not-evidence load-bearing principle
- `project_d16_owa_cwa_boundary_wave2.md` — Wave 2 OWA/CWA posture per helper
- `specs/d16/sme-d16-x4-nc-inference-integration-memo-v1.md` §6.1 — Bucket B queued helpers
- `specs/d16/x4-avc-triage.md` — BCL scenarios this helper unlocks
