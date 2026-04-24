# Wave 1 Helpers — SME Prolog-Rule Validation Artifact

**For:** SME (per standing offer: Prolog-rule validation for SME-LOCKED CRITICAL items when helper integration complete)
**Prepared:** 2026-04-22 (Week 7)
**Scope:** RoleNC4, DispositionNC4, DispositionNC5, FunctionNC4 — 4 of the 8 remaining SME-LOCKED items, closed via Wave 1 pure-composition approach
**Implementation:** [src/core/d16/critical-nc-helpers.js](../../src/core/d16/critical-nc-helpers.js) — new `cauDoesNotHaveTeleologicalCommitment`, `cauDoesNotRequireSocialInstitutionalContext`, `cauDispositionDisjunctive`, `cauRealizationIsDesignExpected` functions alongside the Wave-0 helpers
**Review window:** 15-20 minutes per standing offer

---

## What SME is validating

The Prolog bodies for the four Wave 1 items are already drafted in [bfo-signatures-v1.0.json](bfo-signatures-v1.0.json). This artifact verifies the JavaScript helpers match the drafted Prolog semantics exactly. If the helpers correctly mirror the Prolog logic, the Week 6-8 hardening path can integrate them without further review cycles on Wave 1.

---

## Item 1: RoleNC4

**Prolog body (from `bfo-signatures-v1.0.json` line 521):** `\+ cau_has_teleological_commitment(CAU).`

**Helper implementation:** `cauDoesNotHaveTeleologicalCommitment(input)` — inverts the `result` field of `cauHasTeleologicalCommitment(input)`.

**Semantic match:** negation-as-failure. Prolog `\+ P(X)` succeeds iff `P(X)` fails; JavaScript `!inner.result` is true iff inner returned false. Equivalent.

**Validation cases:**

| CAU | realizationTargets | Inner FunctionNC3 | RoleNC4 result | Expected |
|---|---|---|---|---|
| HeartPumpingFunction | `[cco:PumpingProcess]` | true | **false** | ✅ has teleology → not-not-teleological false |
| EmployeeRole | `[cco:ProfessionalActivity]` | false | **true** | ✅ no teleology → not-not-teleological true |
| Fragility | `[cco:ShatteringProcess]` | false | **true** | ✅ no teleology → not-not-teleological true |

---

## Item 2: DispositionNC4

**Prolog body (from `bfo-signatures-v1.0.json` line 632):** `\+ cau_realization_requires_social_institutional_context(CAU).`

**Helper implementation:** `cauDoesNotRequireSocialInstitutionalContext(input)` — inverts the `result` field of `cauRealizationRequiresSocialInstitutionalContext(input)`.

**Semantic match:** same negation-as-failure pattern as RoleNC4. Equivalent.

**Validation cases:**

| CAU | realizationTargets | Inner RoleNC3 | DispositionNC4 result | Expected |
|---|---|---|---|---|
| HeartPumpingFunction | `[cco:PumpingProcess]` | false | **true** | ✅ not social → not-not-social true |
| EmployeeRole | `[cco:ProfessionalActivity]` | true | **false** | ✅ is social → not-not-social false |
| Fragility | `[cco:ShatteringProcess]` | false | **true** | ✅ not social → not-not-social true |

---

## Item 3: DispositionNC5 (the load-bearing one)

**Prolog body (from `bfo-signatures-v1.0.json`):**
```
( cau_has_teleological_commitment(CAU)
; ( \+ cau_has_teleological_commitment(CAU),
    cau_realization_has_triggering_circumstances(CAU) ) ).
```

**Helper implementation:** `cauDispositionDisjunctive(input)`. Two branches:

- **Branch A (teleological path):** if `cauHasTeleologicalCommitment.result === true`, return `true` with `branch: 'A-teleological'`.
- **Branch B (non-Function Disposition path):** else if `cauRealizationHasTriggeringCircumstances.result === true`, return `true` with `branch: 'B-causal-triggering'`. (Note: the negation guard `\+ cau_has_teleological_commitment(CAU)` from the second disjunct is already satisfied by the else — Branch A already ran and returned false.)
- Otherwise: return `false`, `branch: null`.

**Semantic match:** Prolog disjunction with negation guard on second disjunct exactly mirrors the JS if/else-if structure. The negation guard prevents Function CAUs from matching both branches — in Prolog by the `\+` constraint; in JS by the short-circuit on Branch A. Equivalent.

**Validation cases (the cascade-determinism test):**

| CAU | realizationTargets | design_expected matches | causal_triggering matches | Branch | Result | Expected |
|---|---|---|---|---|---|---|
| HeartPumpingFunction (Function) | `[cco:PumpingProcess]` | ✓ | — | **A-teleological** | true | ✅ matches first branch; Branch B never evaluated |
| Fragility (non-Function Disposition) | `[cco:ShatteringProcess]` | — | ✓ | **B-causal-triggering** | true | ✅ Branch A fails, Branch B fires |
| EmployeeRole (Role) | `[cco:ProfessionalActivity]` | — | — | **null** | false | ✅ Neither branch fires; not a Disposition |

**The load-bearing property:** a Function CAU (teleological) fires Branch A only. Branch B is never evaluated for Function CAUs. This preserves cascade determinism per the 2026-04-18 SME correction. Verified: HeartPumpingFunction returns branch `'A-teleological'`, never `'B-causal-triggering'`.

---

## Item 4: FunctionNC4

**Prolog body (from `bfo-signatures-v1.0.json` line 722):** `cau_realization_is_design_expected(CAU).`

**Helper implementation:** `cauRealizationIsDesignExpected(input)` — new function with its own name, but the function body is structurally identical to `cauHasTeleologicalCommitment`: queries the `design_expected` curated list; returns match results.

**Per SME scoping memo 2026-04-22 option 1:** separate helper preserves semantic distinction between FunctionNC3 (bearer design-history) and FunctionNC4 (realization design-expectedness) at the helper layer. For v1.0 curated list where both NCs would have identical behavior against the same entries, the two helpers produce identical results. The split positions future amendments to differentiate entries between the two semantics without breaking helper boundaries.

**Validation cases:**

| CAU | realizationTargets | FunctionNC4 result | FunctionNC3 (for comparison) | Expected |
|---|---|---|---|---|
| HeartPumpingFunction | `[cco:PumpingProcess]` | **true** | true | ✅ both fire for v1.0 design_expected list |
| EmployeeRole | `[cco:ProfessionalActivity]` | **false** | false | ✅ both false for non-design CAUs |
| Fragility | `[cco:ShatteringProcess]` | **false** | false | ✅ both false for causal CAUs |

**Future divergence:** if v1.1+ splits `design_expected` into "designed-for realizations" vs "realizations-by-bearers-designed-for-something-else," the two helpers can query different subsets. Current v1.0 has no such split; helpers produce identical outputs.

---

## Cascade-level integration summary

The Wave 1 helpers integrate with the existing `evaluateAllHelpers` / `routeRealizableCAUViaCuratedLists` flow at Week 6-8 hardening:

**Full-cascade evaluation for a Function CAU (HeartPumpingFunction):**

1. `routeRealizableCAUViaCuratedLists(input)` calls `evaluateAllHelpers(input)`
2. `evaluateAllHelpers` returns `singleCategory: 'design_expected'`, `matchedCategories: ['design_expected']`
3. Routing places CAU at `bfo:Function` per `routedBy: 'FunctionNC3-via-curated-list'`
4. **Additional NCs fire at the evidence-level (not routing-level):**
   - FunctionNC3: true (already in the routing path)
   - FunctionNC4: **true** (new Wave 1 helper — reinforces the design-expected realization)
   - DispositionNC4: **true** (new Wave 1 helper — confirms non-social)
   - DispositionNC5: **true** via Branch A (new Wave 1 helper — confirms Disposition under NC5's disjunction since Function ⊂ Disposition)
   - RoleNC4: **false** (new Wave 1 helper — correctly identifies teleology present, so not-not-teleological is false)

All five helpers consistent. Evidence record captures the full NC-satisfaction pattern for provenance.

---

## What SME is asked to confirm

- [ ] **RoleNC4:** JS negation-as-failure over FunctionNC3 helper is semantically equivalent to Prolog `\+ cau_has_teleological_commitment(CAU)`.
- [ ] **DispositionNC4:** JS negation-as-failure over RoleNC3 helper is semantically equivalent to Prolog `\+ cau_realization_requires_social_institutional_context(CAU)`.
- [ ] **DispositionNC5:** JS if/else-if structure correctly mirrors the Prolog disjunction with negation guard on the second disjunct. Function CAUs fire Branch A only; Branch B never evaluated for Function CAUs. Cascade determinism preserved.
- [ ] **FunctionNC4:** separate helper with identical v1.0 behavior to FunctionNC3 matches SME memo option 1. Semantic distinction preserved at helper layer; production behavior consistent.

If all four confirm: Wave 1 closes. 7 of 9 SME-LOCKED CRITICAL items integration-path-complete (RoleNC3, RoleNC4, RoleNC5 tier-3-deferred, DispositionNC3, DispositionNC4, DispositionNC5, FunctionNC3, FunctionNC4; plus SDCNC3 and QualityNC3 / GDCNC3 remaining for Wave 2).

---

## Implementation notes (secondary)

- **File:** [src/core/d16/critical-nc-helpers.js](../../src/core/d16/critical-nc-helpers.js) — four new exported functions appended to the Wave-0 helpers.
- **Regression status:** 104 suites, 2,274 tests passed, zero regressions.
- **bfo-signatures-v1.0.json:** Prolog bodies already drafted for all four items; no JSON changes needed in this cycle.
- **Not yet integrated into runner:** the Wave 1 helpers aren't yet consumed by any AVC scenario. SME approval of this artifact closes the architectural review; runner integration is the Week 6-8 hardening concern.
