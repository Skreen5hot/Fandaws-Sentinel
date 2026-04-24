# SDCNC3 Helper — SME Prolog-Rule Validation Artifact

**For:** SME (per standing offer: 15-20 min Prolog-rule validation when helper integration complete)
**Prepared:** 2026-04-22 (Week 8, Wave 2 item 1 of 3)
**Scope:** SDCNC3 — `cauBearerIsParticularNotGeneric`. First of three Wave 2 axiom-pattern helpers. GDCNC3 blocked until SME validates; QualityNC3 parallelizable.
**Implementation:** [src/core/d16/critical-nc-helpers.js](../../src/core/d16/critical-nc-helpers.js) — new `cauBearerIsParticularNotGeneric` function with conservative-false callback discipline.
**Tests:** [tests/unit/d16/critical-nc-helpers-sdcnc3.test.js](../../tests/unit/d16/critical-nc-helpers-sdcnc3.test.js) — 13 unit tests, all passing.

---

## What SME is validating

- [ ] Prolog body `cau_bearer_is_particular_not_generic(CAU).` (from `bfo-signatures-v1.0.json`) maps to JavaScript implementation semantically.
- [ ] Pattern 1 / Pattern 2 / Pattern 3 coverage matches the locked design sketch.
- [ ] Conservative-false when `isNamedIndividual` / `isSingletonClass` callbacks are absent (your SME scrutiny criterion).
- [ ] No recursion on circular bearer relationships (your SME adversarial case).
- [ ] Pattern 3 simplified implementation matches decision 3 (no curated bearer-class list; cardinality-1 on `inheresIn` alone suffices).

If all five confirm: SDCNC3 closes; GDCNC3 implementation unblocks; QualityNC3 can proceed in parallel.

---

## Pattern coverage

### Pattern 1 — Target is `owl:NamedIndividual`

**Implementation:** checks if the `isNamedIndividual` callback (optional) returns true for any `inheresIn` target IRI.

**Conservative-false discipline:** if callback is absent, pattern 1 is never satisfied regardless of target IRIs. This is the pure-CWA posture per the locked design — the helper does not inspect raw triples or attempt IRI-structure heuristics (e.g., "does this IRI look like an individual?"). Callback-absent → helper cannot confirm individuality → pattern 1 false.

Test cases:
- ✅ With callback returning true for `ex:Alice` → result true, matchedPattern: 1
- ✅ Without callback → result false (other patterns still evaluated)

### Pattern 2 — Target is singleton class

**Implementation:** checks if the `isSingletonClass` callback (optional) returns true for any `inheresIn` target IRI. Same conservative-false discipline as pattern 1.

Test cases:
- ✅ With callback returning true for `ex:SingletonClass` → result true, matchedPattern: 2
- ✅ Without callback → result false

### Pattern 3 (SIMPLIFIED per SME decision 3) — Cardinality-1 on `inheresIn`

**Implementation:** scans `signature.cardinalityRestrictions` for entries where `onProperty` is `bfo:inheresIn` (numeric `bfo:0000052` or symbolic forms) AND `cardinality === 1` OR `qualifiedCardinality === 1`.

**No curated bearer-class list required** per SME decision 3. The cardinality constraint encodes "specifically dependent on the one bearer this restriction describes"; the class identity is secondary. Pattern 3 is Signature-resolvable without callbacks.

Test cases:
- ✅ `cardinality: 1` on inheresIn → result true, matchedPattern: 3
- ✅ `qualifiedCardinality: 1` on inheresIn → result true, matchedPattern: 3
- ✅ `cardinality: 1` on unrelated property → result false (property gate)
- ✅ `minCardinality: 2` on inheresIn → result false (multi-bearer)

---

## Gate: inheresIn presence

**Before any pattern check:** helper verifies `signature.propertyRestrictionsAsDomain` contains at least one entry with `property` matching a bfo:inheresIn IRI. CAUs without `inheresIn` restrictions short-circuit to false with `reason: 'no_inheresIn_restrictions'` — the CAU cannot be specifically-dependent if it doesn't declare inherence.

Test cases:
- ✅ No inheresIn restrictions → result false, reason `no_inheresIn_restrictions`

---

## Adversarial cases (per SME locked design sketch)

### Singleton-via-negative-enumeration

**Scenario:** CAU with `inheresIn some ex:ClassWithDifferentFromConstraints` where effective membership is constrained to one individual via `owl:differentFrom` assertions.

**Implementation behavior:** helper returns false. The current Signature extractor does not surface `owl:differentFrom` enumeration constraints, and pattern 2 requires explicit singleton flagging via the `isSingletonClass` callback. A caller without visibility into differentFrom assertions cannot determine singleton-ness; conservative-false routes the CAU to Plausible.

**SME-documented decision:** this is correct behavior for v1.0; expanding pattern 2 to handle negative-enumeration requires axiom-graph reasoning beyond v1.0 helper scope. Revisit if OBO calibration surfaces the pattern as common.

Test case: ✅ `inheresIn some ex:ClassWithDifferentFromConstraints` without callbacks → result false

### Circular bearer relationships

**Scenario:** CAU A `inheresIn` B, B `inheresIn` A.

**Implementation behavior:** helper evaluates CAU A's Signature only. It does not recurse into B's declarations. If A's Signature has no pattern-1/2/3 evidence, helper returns false for A — the circular-dependency data-validity concern is the source-ontology author's problem.

Test case: ✅ `inheresIn some ex:B` without callbacks → result false; test completes (no infinite loop/recursion)

---

## Aaron Band 4 regression observation: cco:AgentRole

From the Band 4 hardening regression review: `cco:AgentRole` in the CCO demo fixture has:

```turtle
rdfs:subClassOf [
  a owl:Restriction ;
  owl:onProperty bfo:0000052 ;       # inheresIn
  owl:cardinality "1"^^xsd:nonNegativeInteger ;
  owl:onClass cco:Agent
]
```

**Pattern 3 positive case.** Helper's test against this fixture shape:
- `inheresInTargets`: `['http://www.ontologyrepository.com/CommonCoreOntologies/Agent']`
- `cardinalityRestrictions`: `[{onProperty: 'bfo:0000052', cardinality: 1}]`
- Helper returns: `result: true, matchedPattern: 3`

Test case: ✅ passes.

---

## Full test summary

13 unit tests, all passing:

| Category | Tests | Status |
|---|---|---|
| Gate (no inheresIn) | 1 | ✅ |
| Pattern 1 (NamedIndividual) | 2 | ✅ |
| Pattern 2 (singleton class) | 2 | ✅ |
| Pattern 3 (cardinality-1 simplified) | 4 | ✅ |
| Generic-bearer negative cases | 1 | ✅ |
| Adversarial: singleton-via-negative-enumeration | 1 | ✅ |
| Adversarial: circular bearer relationships | 1 | ✅ |
| Aaron regression: cco:AgentRole pattern-3 positive | 1 | ✅ |

No regressions in the broader test suite (all pre-existing tests continue to pass).

---

## Implementation notes

- **Dependencies:** none. SDCNC3 is Wave 2 item 1 with no upstream helper dependencies. Ships before GDCNC3 (which negates it).
- **Signature fields consumed:** `propertyRestrictionsAsDomain` (filtered by inheresIn property), `cardinalityRestrictions` (filtered by inheresIn + cardinality-1 values).
- **Callbacks accepted:** `isNamedIndividual(iri) → boolean`, `isSingletonClass(iri) → boolean`. Both optional; conservative-false when absent.
- **No integration into AVC scenarios yet.** Helper is ready for Week 8-onward runner integration alongside GDCNC3 and QualityNC3; AVC scenarios that would exercise SDCNC3 don't exist in the current v3-bundle.

---

## What proceeds after SME validation

- **SME ✅ → GDCNC3 unblocks** (Wave 2 item 2, depends on SDCNC3 helper existing for its negative conjunct). Estimated 2-4 hours per scoping memo.
- **QualityNC3 can proceed in parallel** if capacity permits — independent of SDCNC3/GDCNC3.
- **SME flag → revision cycle** before GDCNC3 coding begins. Preserves the pause-point discipline Aaron named.

Per standing offer, review window is 15-20 minutes. No blocking dependencies for the remaining Wave 2 work; cleanly serializable if SME prefers one-at-a-time.
