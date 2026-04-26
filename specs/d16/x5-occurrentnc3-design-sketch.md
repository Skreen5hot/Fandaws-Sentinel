# SME-D16-X5 — OccurrentNC3 Helper Design Sketch (DRAFT)

**Status:** DRAFT v1 2026-04-25. Pending SME consolidated review with x5-continuantnc3 + x5-processnc4 sketches per S-B sequencing.
**Predicate:** `cau_unfolds_through_time(CAU)`
**Priority anchor:** High — PROV-O `prov:Activity` is Occurrent; unfolding-through-time is core semantic for any Occurrent alignment.
**Scope:** Bucket B; enables BCL scenarios involving Occurrent ancestors (notably `evidence-entailed-via-ncs` per x4-triage §2.1) to clear toward Entailed once helper lands.

---

## 1. Predicate intent

**Natural-language meaning** (Arp/Smith/Spear §4.3): Occurrents have temporal parts — they unfold across a temporal region rather than existing wholly at any single instant. An Activity at t1...t2 is composed of temporal sub-parts; the Activity is not the same entity at any one instant as it is across the full temporal extent.

**Distinction from ContinuantNC3:** Continuants persist *with* identity through time; Occurrents have temporal parts that *constitute* the Occurrent across time. Identity-persistence vs. temporal-part-composition is the load-bearing semantic difference between Continuant and Occurrent.

**OWL-encoding observation** (from NC description): "Unfolding-through-time is sometimes implicit in OWL encodings." The structural marker is therefore **temporal-extension axioms** — restrictions that commit the CAU to occupying a temporal region with extent (not just to existing at instants).

**What the helper attests:** the CAU's signature contains structural evidence consistent with temporal-extension semantics — Occurrent-subtree class membership AND/OR temporal-extension restrictions (`bfo:occupiesTemporalRegion` with non-zero-dimensional filler, `bfo:hasTemporalPart` restrictions, etc.).

---

## 2. Signature inputs

- **`ancestorChain`** — primary affirmation via Occurrent-subtree class membership.
- **`existentialRestrictions`** — affirmation via `bfo:occupiesTemporalRegion` with `bfo:OneDimensionalTemporalRegion` (or unspecified-but-not-ZeroDim) filler; affirmation via `bfo:hasTemporalPart`.
- **`disjointnessAssertions`** — affirmation via `owl:disjointWith bfo:Continuant`.
- **`equivalenceClaims`** — affirmation via `owl:equivalentClass bfo:Occurrent` or descendant.

Helper does NOT consume:
- `propertyRestrictionsAsRange` (not relevant to CAU's own temporal extension).

**Note on overlap with OccurrentNC1 (P3 OWL-DIRECT in X4):** OccurrentNC1 checks for *any* `bfo:occupiesTemporalRegion` restriction (asserts CAU occupies *some* TR). OccurrentNC3 is stricter — it requires the CAU's temporal-extension to be substantive (non-zero-dimensional, or compositional via `bfo:hasTemporalPart`). A CAU that satisfies OccurrentNC1 with a ZeroDimensionalTemporalRegion filler does NOT automatically satisfy OccurrentNC3 (that's a `bfo:ProcessBoundary` shape, not a Process unfolding shape).

---

## 3. Return shape

```js
{
  result: boolean,
  reason: 'occurrent_subtree_ancestor'                   // affirmation
        | 'temporal_extension_restriction'               // affirmation (occupiesTR with non-zero-dim filler OR hasTemporalPart)
        | 'disjoint_with_continuant'                     // affirmation
        | 'equivalent_class_to_occurrent'                // affirmation
        | 'continuant_subtree_ancestor'                  // contradiction
        | 'zero_dimensional_temporal_only'               // contradiction (boundary-like, not unfolding)
        | 'no_structural_evidence',                      // silence
  evidence: {
    matchedAncestor?: string,
    matchedTemporalExtension?: { onProperty, target },
    matchedDisjointness?: string,
    matchedEquivalence?: string,
    contradictingAncestor?: string,
    zeroDimRestrictions?: Array<{onProperty, target}>,
  },
  groundsNC: 'OccurrentNC3',
  helperIRI: 'cau_unfolds_through_time/1',
}
```

Seven distinct reason values across four affirmation paths + two contradiction paths + one silence path.

---

## 4. Option-A/B candidate readings

**Two defensible structural operationalizations surface here.**

### Option A — Permissive (OccurrentNC1-equivalent affirmation):
Any presence of `bfo:occupiesTemporalRegion` (regardless of filler dimensionality) counts as temporal-extension affirmation.

**Pros:** simpler; matches OccurrentNC1's structural pattern directly.
**Cons:** under-discriminates. A `ProcessBoundary` (zero-dimensional temporal region occupier) would satisfy this reading even though it does NOT unfold; ProcessBoundary is the boundary, not the unfolding entity. Wave 2 Option A pattern (rejected for QualityNC3) — risks confident-wrong on boundary-shaped CAUs.

### Option B — Strict (dimensionality-aware temporal-extension):
Affirmation requires either:
- `bfo:occupiesTemporalRegion` with filler that is NOT `bfo:ZeroDimensionalTemporalRegion` (i.e., explicitly OneDimensional or unspecified-but-extension-capable), OR
- `bfo:hasTemporalPart` restriction (compositional unfolding evidence).

**Pros:** correctly distinguishes unfolding from boundary semantics. Aligns with Arp/Smith/Spear §4.3's "temporal parts" emphasis.
**Cons:** more code; requires inspection of restriction filler beyond just property name.

**Developer lean: Option B (strict)**, matching Wave 2's QualityNC3/GDCNC3 strict-reading discipline. Permissive reading conflates ProcessBoundary with Process at the OccurrentNC3 level, which proof-discipline rejects.

**Per `feedback_absence_not_evidence.md`:** under Option B, a CAU lacking either restriction class routes `result: false` with `no_structural_evidence` — undetermined-flavor downstream via dispatcher's trichotomy when other evidence exists. Under Option A, the same CAU might falsely affirm via OccurrentNC1's restriction alone.

---

## 5. OWA/CWA posture

**Same posture as ContinuantNC3 sketch §5:** mixed CWA + helper-returns-false-on-silence. Strict reading; absence is deterministic-false with `no_structural_evidence` reason. Trichotomy-undetermined preserved at dispatcher layer (when other NCs in cascade are undetermined).

---

## 6. Edge cases

| Case | Behavior | Reason |
|---|---|---|
| ancestorChain has `bfo:Occurrent` | result: true | `occurrent_subtree_ancestor` |
| ancestorChain has `bfo:Process` (Occurrent descendant) | result: true | `occurrent_subtree_ancestor` |
| ancestorChain has both `bfo:Occurrent` AND `bfo:Continuant` | result: false | `continuant_subtree_ancestor` (contradiction wins) |
| existentialRestrictions has `bfo:occupiesTemporalRegion some bfo:OneDimensionalTemporalRegion` | result: true | `temporal_extension_restriction` |
| existentialRestrictions has `bfo:occupiesTemporalRegion some bfo:TemporalRegion` (unspecified dimensionality) | result: true | `temporal_extension_restriction` (extension-capable; per Option B strict, "unspecified" admits unfolding) |
| existentialRestrictions has `bfo:occupiesTemporalRegion some bfo:ZeroDimensionalTemporalRegion` ONLY | result: false | `zero_dimensional_temporal_only` (boundary-shape, not unfolding) |
| existentialRestrictions has `bfo:hasTemporalPart` restriction | result: true | `temporal_extension_restriction` |
| disjointnessAssertions has `bfo:Continuant` | result: true | `disjoint_with_continuant` |
| equivalenceClaims has `bfo:Occurrent` or descendant | result: true | `equivalent_class_to_occurrent` |
| Empty ancestorChain + no temporal-extension restriction + no disjointness/equivalence | result: false | `no_structural_evidence` |
| ancestorChain has `bfo:ProcessBoundary` only (no Process / Occurrent intermediate) | result: false | `zero_dimensional_temporal_only` (ProcessBoundary IS a zero-dim Occurrent, but doesn't unfold) — **flagged for SME review** |

**Last edge case — ProcessBoundary special-case:** technically a ProcessBoundary IS an Occurrent (subClassOf bfo:Occurrent in BFO 2020), so the "Occurrent ancestor" path would route true. But a ProcessBoundary doesn't *unfold* — it's the instantaneous boundary. Strict OccurrentNC3 reading should distinguish. This requires the helper to recognize bfo:ProcessBoundary as a special non-unfolding Occurrent ancestor. **Flagging for SME review at consolidated session** — could be deferred to a future refinement if PROV-O doesn't exercise ProcessBoundary CAUs.

---

## 7. Test coverage plan

~12–14 tests covering each of the eleven edge-case rows + 2–3 adversarial cases (e.g., temporal-part restriction with missing filler; multi-inheritance Continuant+Occurrent fixture).

---

## 8. SME consolidated-review concerns

Specific to OccurrentNC3:
- **Option B selection**: confirm strict reading per Wave 2 precedent. Permissive (Option A) risks ProcessBoundary false-affirmation.
- **ProcessBoundary special-case**: per §6 last row, surface decision on whether OccurrentNC3 strict reading must exclude ProcessBoundary explicitly or whether the precedence "ancestor-affirmation wins over zero-dim-only" applies.
- **`bfo:hasTemporalPart` recognition**: confirm this is in scope for the matcher's existential-restriction check (current cau-signature.js extractor produces `existentialRestrictions[]`; helper inspects `onProperty` for `bfo:hasTemporalPart`).
- **OccurrentNC1 / OccurrentNC3 boundary**: confirm OccurrentNC3 is meaningfully stricter than OccurrentNC1 (vs. SME accepting these as redundant — in which case OccurrentNC3 simplifies to "OccurrentNC1 + Occurrent-subtree-ancestor").

Cross-helper consistency:
- Reason enum naming aligns with ContinuantNC3 sketch (snake_case; affirmation/contradiction/silence paths).
- Multi-inheritance contradiction-wins precedence aligns with ContinuantNC3 + ContinuantNC2 X4 lint refinement.
