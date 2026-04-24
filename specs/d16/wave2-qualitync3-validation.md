# QualityNC3 Helper — SME Prolog-Rule Validation Artifact

**For:** SME (standing offer: 15-20 min Prolog-rule validation)
**Prepared:** 2026-04-22 (Week 8, Wave 2 item 3 of 3 — final)
**Scope:** QualityNC3 — `cauAlwaysRealizedWhenBearerExists`. Closes Wave 2.
**Implementation:** [src/core/d16/critical-nc-helpers.js](../../src/core/d16/critical-nc-helpers.js) — new `cauAlwaysRealizedWhenBearerExists` function.
**Tests:** [tests/unit/d16/critical-nc-helpers-qualitync3.test.js](../../tests/unit/d16/critical-nc-helpers-qualitync3.test.js) — 13 unit tests, all passing.

---

## What SME is validating (per GDCNC3 closeout memo criteria)

- [ ] **Option B enforcement:** pattern 1 (`existsAt`/`inheresIn` co-extension) OR pattern 3 (continuous-attribute class subsumption) required; pattern 2 (`realizedIn`-absence alone) does NOT satisfy
- [ ] **Correct composition with Wave 0 `cauRealizationHasTriggeringCircumstances` negation:** transparent callback forwarding preserves Wave 0 semantics
- [ ] **Dual-signal adversarial case:** CAU with both `inheresIn` and `realizedIn`-causal-process → helper returns false; routes to Plausible via evaluator
- [ ] **Structured failure reasons:** three distinct reason enums cover the three failure paths (gate, negative-conjunct, positive-conjunct)
- [ ] **Consistent pattern-1/2/3 treatment** with the Option B framing

---

## Evaluation flow

```
1. Gate: inheresIn-restriction present?          → no:  reason='no_inheresIn_restrictions'
   (Quality is an SDC — must have inheresIn.)

2. Auto-extract realizationTargets from Signature
   if not passed explicitly

3. Negative conjunct: Wave 0 causal helper        → fires true: reason='triggering_realization_present'
   returns true for any realization target in
   causal_triggering curated list

4. Positive conjunct (Option B):
   Pattern 1 (existsAt + inheresIn)               → neither: reason='positive_conjunct_failed_option_b'
   OR Pattern 3 (subclass of bfo:Quality)

5. All checks pass                                 → result: true, matchedPattern: 1 or 3
```

Three distinct failure reasons for DP-2 provenance consumption (Weeks 9-11), consistent with the SDCNC3 and GDCNC3 patterns.

---

## Option B enforcement

**Under Option A (REJECTED by SME 2026-04-22 decision 1):**
- `inheresIn some X` with no `realizedIn` and no other restrictions → "admits Quality via realizedIn absence" (true)

**Under Option B (LOCKED):**
- `inheresIn some X` alone → **false**, reason `positive_conjunct_failed_option_b`
- `inheresIn some X + existsAt some T` → true via pattern 1
- `rdfs:subClassOf bfo:Quality` (via callback) → true via pattern 3

**Pattern 2 rejection operationalized:** the implementation never evaluates `realizedIn` absence as positive evidence. The only paths to `result: true` are pattern 1 (explicit co-extension evidence) or pattern 3 (explicit class subsumption evidence). Pure-absence signatures route to Plausible.

**Test coverage:**
- ✅ Pattern 1 happy path: `existsAt + inheresIn` → true
- ✅ Pattern 3 happy path: `isSubclassOf(cau, bfo:Quality)` → true
- ✅ Pattern 3 via symbolic `bfo:Quality` IRI — covers both numeric and symbolic forms
- ✅ Pattern 3 conservative-false when callback absent
- ✅ Option B strict enforcement: pure `inheresIn` without existsAt/Quality-subclass → false (Option-A-would-have-entailed case correctly rejected)

---

## Composition with Wave 0 `cauRealizationHasTriggeringCircumstances`

The negative conjunct reuses the Wave 0 helper. Transparent callback forwarding:
- `isSubclassOf` passed through to Wave 0 helper (used for curated-list subsumption matching)
- Realization targets auto-extracted from Signature's `existentialRestrictions` (filtered by `bfo:isRealizedIn` property) if not passed explicitly

This mirrors the SDCNC3 composition pattern in GDCNC3 — same discipline of passing callbacks unchanged to preserve the caller's evaluation context.

**Test case:**
- ✅ CAU with `inheresIn some ex:Glass + existsAt some ex:Glass-temporal-region + realizedIn some cco:ShatteringProcess` → helper returns false with reason `triggering_realization_present`. Wave 0 causal helper matches `cco:ShatteringProcess` to `causal_triggering`, negation fails.

**Design-expected realizations DO NOT block QualityNC3:**
- ✅ CAU with realization target `cco:PumpingProcess` (in `design_expected`, not `causal_triggering`) → Wave 0 causal helper returns false → negation succeeds → QualityNC3 can fire if positive conjunct satisfied.

Note: this means a CAU with both `rdfs:subClassOf bfo:Quality` AND `realizedIn cco:PumpingProcess` would satisfy QualityNC3 at the helper level. The cascade-level routing (`routeRealizableCAUViaCuratedLists`) handles the contradictory-signal case: the CAU would fire Function (via design_expected match) AND the positive of QualityNC3 — multi-category overlap routes to Plausible per the 2026-04-22 architectural decision, NOT cascade-forced to Function.

---

## Dual-signal adversarial case (per SME locked design sketch)

**Scenario:** CAU with both `inheresIn some ex:Bearer` (SDC signal) AND `realizedIn some cco:ShatteringProcess` (causal-triggered disposition signal).

**Implementation behavior:** even if the CAU satisfies pattern 1 (existsAt + inheresIn) at step 4, the negative conjunct at step 3 fails because `cco:ShatteringProcess` is in `causal_triggering`. Helper short-circuits with reason `triggering_realization_present`.

Full return payload includes `causalTriggeringMatches` (the matched curated-list entry) and `realizationTargetsChecked` (the targets scanned) for DP-2 provenance.

Test case: ✅ passes.

---

## Structured failure reasons

Three distinct failure paths, each emitting a unique `reason` enum:

| Failure path | `reason` enum | Payload |
|---|---|---|
| Gate: no inheresIn | `no_inheresIn_restrictions` | `{result, matchedPattern: null, reason, groundsNC, helperIRI}` |
| Negative conjunct failed | `triggering_realization_present` | `+ causalTriggeringMatches, realizationTargetsChecked` |
| Positive conjunct failed | `positive_conjunct_failed_option_b` | `+ pattern1Checked, pattern3Checked (full diagnostic objects)` |

Consistent with SDCNC3 (1 reason) and GDCNC3 (4 reasons) — each failure path is distinct from the others; downstream DP-2 provenance can route on the string alone without re-parsing state.

---

## Realization-targets auto-extraction

The helper auto-extracts `realizationTargets` from the Signature when not passed explicitly. Scans `signature.existentialRestrictions` for entries where `onProperty` matches `bfo:isRealizedIn` (numeric `bfo:0000054` or symbolic variants) and collects the `someValuesFrom` targets.

This simplifies caller code: at runner integration time, passing the Signature alone is sufficient — no need to pre-extract realization targets. The helper handles the extraction internally.

Test case: ✅ auto-extraction confirms the Wave 0 causal helper sees the same target list whether caller passes it explicitly or lets the helper extract it.

---

## Full test summary

13 unit tests, all passing:

| Category | Tests | Status |
|---|---|---|
| Gate (no inheresIn) | 1 | ✅ |
| Pattern 1 positive conjunct | 2 | ✅ |
| Pattern 3 positive conjunct | 3 | ✅ |
| Option B strict enforcement (Pattern 2 alone fails) | 1 | ✅ |
| Negative conjunct fires | 2 | ✅ |
| Happy path (Option B satisfied both branches) | 2 | ✅ |
| Adversarial: dual-signal case | 1 | ✅ |
| Realization-target auto-extraction | 1 | ✅ |

---

## Implementation notes

- **Dependencies:** Wave 0 `cauRealizationHasTriggeringCircumstances` (the negation). Independent of Wave 2's SDCNC3/GDCNC3.
- **Signature fields consumed:** `propertyRestrictionsAsDomain` (filtered by inheresIn, existsAt), `existentialRestrictions` (filtered by isRealizedIn for auto-extraction).
- **Callbacks accepted:** `isSubclassOf(sub, super) → boolean` for pattern 3 and Wave 0 helper; forwarded transparently.
- **No integration into AVC scenarios yet.** Helper is ready for Week 9-11 DP-2-era runner integration alongside SDCNC3 and GDCNC3.

---

## What proceeds after SME validation

- **SME ✅ → Wave 2 closes.** All 3 axiom-pattern helpers integration-path-complete.
- **5 of 5 High-priority SME-LOCKED items integration-path-complete** except RoleNC5 (Wave 3, deferred to v1.1+): FunctionNC4 (Wave 1) + SDCNC3 + GDCNC3 + QualityNC3 (Wave 2) + RoleNC5-deferred.
- **6 of 6 CRITICAL SME-LOCKED items remain integration-path-complete** (Wave 0 + Wave 1 validated).
- **Total:** 10 of 11 SME-LOCKED items integration-path-complete. Only RoleNC5 (v1.1+ deferral) remains.
- **Wave 2 closure memo** can be written summarizing the three-helper cycle for durable project memory.

Per SME standing offer, review window is 15-20 minutes. Wave 2 is one validation away from full closure.
