# GDCNC3 Helper — SME Prolog-Rule Validation Artifact

**For:** SME (standing offer: 15-20 min Prolog-rule validation)
**Prepared:** 2026-04-22 (Week 8, Wave 2 item 2 of 3)
**Scope:** GDCNC3 — `cauAdmitsMultipleSimultaneousConcretizations`. Second of three Wave 2 helpers. QualityNC3 parallelizable after this validates.
**Implementation:** [src/core/d16/critical-nc-helpers.js](../../src/core/d16/critical-nc-helpers.js) — new `cauAdmitsMultipleSimultaneousConcretizations` function.
**Tests:** [tests/unit/d16/critical-nc-helpers-gdcnc3.test.js](../../tests/unit/d16/critical-nc-helpers-gdcnc3.test.js) — 14 unit tests, all passing.

---

## What SME is validating (per Week 8 green-light memo criteria)

- [ ] **Option B enforcement:** pattern 2 (explicit `minCardinality > 1`) OR pattern 3 (cross-instance-concretization axioms) required; pattern 1's cardinality-absence alone does NOT satisfy.
- [ ] **Correct composition with SDCNC3 helper negation:** negative conjunct uses the now-validated `cauBearerIsParticularNotGeneric` helper; callbacks forwarded transparently.
- [ ] **Dual-signal adversarial case:** concretizes + inheresIn-particular → false due to negative-conjunct failure.
- [ ] **`cco:DesignativeInformationContentEntity` negative regression:** concretizes restriction present but no `minCardinality` → routes to false under Option B, not Entailed GDC.
- [ ] **Structured failure reasons per-branch** (per feedback_structured_failure_reasons memory): four distinct reason strings cover the four failure paths.

---

## Evaluation flow

```
1. Gate: concretizes-restriction present?         → no:  reason='no_concretizes_restrictions'

2. Cardinality-1 disqualifier present?            → yes: reason='cardinality_limits_to_single_concretization'
   (cardinality===1 OR qualifiedCardinality===1
    OR maxCardinality===1 on concretizes)

3. Option B positive conjunct:                    → fail: reason='positive_conjunct_failed_option_b'
   pattern 2 (minCardinality>1) OR pattern 3
   (cross-instance via callback)

4. Negative conjunct: SDCNC3 returns false?        → fail: reason='particular_bearer_present_via_sdcnc3'

5. All checks pass                                 → result: true, matchedPattern: 2 or 3
```

Each failure path emits a distinct `reason` enum string for DP-2 provenance consumption in Weeks 9-11 per the structured-failure-reasons pattern SME surfaced during SDCNC3 validation.

---

## Option B enforcement

**Under Option A (REJECTED by SME 2026-04-22 decision 2):**
- `concretizes some X` with no cardinality → admits multiple (true)

**Under Option B (LOCKED):**
- `concretizes some X` with no cardinality → **false**, reason `positive_conjunct_failed_option_b`
- `concretizes some X + minCardinality 2` → true via pattern 2
- `concretizes some X + cross-instance-axioms` (via callback) → true via pattern 3

The implementation flow rejects pattern-1-alone at step 3. The only paths to `result: true` require explicit multi-concretization evidence.

**Test coverage:**
- ✅ Canonical Option-A-would-have-fired case: `concretizes some ex:Book` with no cardinality → Option B returns false
- ✅ Pattern 2 positive: `minCardinality: 2` → true
- ✅ Pattern 3 positive: callback returns true → true
- ✅ Pattern 3 conservative-false: callback absent → false
- ✅ Pattern-2 edge case: `minCardinality: 1` does NOT count as "multiple" → false
- ✅ Property-gating: `minCardinality: 5` on unrelated property → false

---

## Cardinality-1 disqualifier (precedes positive-conjunct check)

Cardinality-1 fires **before** the positive-conjunct check because it's a structural contradiction that overrides other signals. A CAU with `concretizes exactly 1 X` AND `minCardinality 2` has contradictory axioms — the helper resolves this conservatively: cardinality-1 wins, helper returns false with reason `cardinality_limits_to_single_concretization`.

Three variants covered:
- ✅ `cardinality: 1` on concretizes → disqualified
- ✅ `qualifiedCardinality: 1` on concretizes → disqualified
- ✅ `maxCardinality: 1` on concretizes → disqualified

Even when a `minCardinality: 2` is also present (contradictory axioms), cardinality-1 wins per structural-contradiction resolution.

---

## Composition with SDCNC3 helper negation

GDCNC3's negative conjunct `\+ cau_bearer_is_particular_not_generic(CAU)` reuses the now-validated SDCNC3 helper. The GDCNC3 helper forwards `isNamedIndividual` and `isSingletonClass` callbacks to SDCNC3 transparently, so any caller-provided individuation callbacks apply uniformly.

Test case:
- ✅ `concretizes minCardinality: 2` (pattern 2 fires) + `inheresIn cardinality: 1` (SDCNC3 pattern 3 fires) → helper returns false, reason `particular_bearer_present_via_sdcnc3`, with full SDCNC3 result attached in `sdcnc3Result` field

---

## Dual-signal adversarial case (per SME locked design sketch)

**Scenario:** CAU with realization targets spanning both GDC-style evidence (concretizes) and SDC-style evidence (inheresIn-particular). Ambiguous dual-nature CAU.

**Implementation behavior:** positive conjunct fires (pattern 2 evidence present), but negative conjunct fails because SDCNC3 fires true. Helper returns false with reason `particular_bearer_present_via_sdcnc3`. The full SDCNC3 result and the `positiveConjunctWouldHaveFired` pattern are included in the return payload for downstream DP-2 provenance.

Downstream routing per three-state evidence model: CAU routes to Plausible with multi-category analyst review, NOT forced-GDC via override or forced-SDC via ambiguity. This matches SME's 2026-04-22 framing that dual-nature realization routes to Plausible, not cascade-forced selection.

Test case: ✅ passes with full reason trail.

---

## Aaron Band 4 regression observation: cco:DesignativeInformationContentEntity

From Band 4 hardening regression review — the fixture class:

```turtle
cco:DesignativeInformationContentEntity a owl:Class ;
  rdfs:subClassOf bfo:0000031 ;     # GDC
  rdfs:subClassOf [
    a owl:Restriction ;
    owl:onProperty bfo:0000058 ;    # concretizes
    owl:someValuesFrom bfo:0000040
  ]
```

`concretizes` restriction present, no cardinality constraints. Under Option A this would have fired positive (cardinality-absence as multi-concretization evidence). Under Option B it does NOT fire — helper returns false, reason `positive_conjunct_failed_option_b`.

**This is the SME-preferred posture.** Routes to Plausible rather than false-GDC entailment. Under-specified GDC signatures route conservatively per "absence of axiomatic evidence for one category is NOT positive evidence for another."

Test case: ✅ passes. The CCO demo fixture is now a regression-protected negative case under Option B.

---

## Structured failure reasons (per SDCNC3 review feedback pattern)

Four distinct failure paths, each emitting a unique `reason` enum for DP-2 provenance consumption:

| Failure path | `reason` enum | Payload |
|---|---|---|
| Gate: no concretizes restriction | `no_concretizes_restrictions` | `{result, matchedPattern: null, reason, groundsNC, helperIRI}` |
| Cardinality-1 disqualifier | `cardinality_limits_to_single_concretization` | `+ disqualifierMatches: [...]` |
| Positive conjunct failed (Option B) | `positive_conjunct_failed_option_b` | `+ pattern2Checked, pattern3CallbackProvided, pattern3Result` |
| Negative conjunct failed (SDCNC3 fires) | `particular_bearer_present_via_sdcnc3` | `+ sdcnc3Result (full), positiveConjunctWouldHaveFired` |

Downstream DP-2 consumers (Weeks 9-11) can route on reason string without case-splitting on boolean + context. Each payload's diagnostic fields feed the `explanation` and `provenance` of the canonical record.

---

## Full test summary

14 unit tests, all passing:

| Category | Tests | Status |
|---|---|---|
| Gate (no concretizes) | 1 | ✅ |
| Pattern 2 positive conjunct | 3 | ✅ |
| Pattern 3 positive conjunct | 2 | ✅ |
| Option B strict enforcement (Pattern 1 alone fails) | 1 | ✅ |
| Cardinality-1 disqualifier (3 variants) | 3 | ✅ |
| Negative conjunct (SDCNC3 fires) | 1 | ✅ |
| Happy path | 1 | ✅ |
| Adversarial: dual-signal case | 1 | ✅ |
| Aaron regression: cco:DesignativeInformationContentEntity under Option B | 1 | ✅ |

---

## Implementation notes

- **Dependencies:** SDCNC3 (validated). GDCNC3's negative conjunct reuses `cauBearerIsParticularNotGeneric`.
- **Signature fields consumed:** `propertyRestrictionsAsDomain` (filtered by concretizes), `cardinalityRestrictions` (filtered by concretizes + cardinality variants).
- **Callbacks accepted:** `hasCrossInstanceConcretizationAxioms(signature) → boolean` for pattern 3; `isNamedIndividual`/`isSingletonClass` forwarded to SDCNC3 helper.
- **No integration into AVC scenarios yet.** Helper is ready for Week 8-onward runner integration alongside SDCNC3 and QualityNC3.

---

## What proceeds after SME validation

- **SME ✅ → Wave 2 continues to QualityNC3** (item 3, can have been proceeding in parallel per Aaron's memo). Estimated 2-4 hours per scoping memo.
- **SME ✅ → 4 of 5 High-priority SME-LOCKED items integration-path-complete** (FunctionNC4 from Wave 1; SDCNC3 + GDCNC3 from Wave 2). RoleNC5 remains deferred to v1.1+.
- **SME flag → revision cycle** before QualityNC3 coding proceeds or ships.

Per SME standing offer, review window is 15-20 minutes per helper. No blocking dependencies for QualityNC3 (independent of SDCNC3/GDCNC3).
