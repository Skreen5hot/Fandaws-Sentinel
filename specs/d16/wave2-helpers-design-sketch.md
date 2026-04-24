# Wave 2 Helpers — Pre-Implementation Design Sketch (LOCKED)

**Status:** LOCKED 2026-04-22. All five decision points resolved by SME per Wave 2 design-sketch review. Implementation green-lit for Week 8.
**Scope:** SDCNC3, QualityNC3, GDCNC3 — the 3 Wave 2 axiom-pattern helpers needed for 3 of 5 High-priority SME-LOCKED items.
**Target implementation window:** Week 8. Week 7 remainder: Band 4 scaffold-to-production hardening per SME Week-7-remainder direction.

**SME decisions (2026-04-22):**
1. **QualityNC3 OWA/CWA → Option B (strict).** SME override of developer's pragmatic Option A lean. Load-bearing principle: absence of axiomatic evidence for one category is NOT positive evidence for another category. Three-state evidence model prefers Plausible-over-confident-wrong; false positives on under-extracted Signatures worse than false negatives on minimal-but-correct Signatures (Plausible routing is recoverable via analyst review).
2. **GDCNC3 OWA/CWA → Option B (strict).** Same principle; resolved jointly with Decision 1.
3. **SDCNC3 Pattern 3 simplified (no curated bearer-class list).** Ship v1.0 with patterns 1 (NamedIndividual) + 2 (singleton class) + simplified pattern 3 (cardinality-1 on `inheresIn` without requiring target-class curation). Revisit in v1.1+ only if calibration shows under-matching.
4. **Wave 2 ordering confirmed:** SDCNC3 → GDCNC3 → QualityNC3. Parallel development on QualityNC3 permissible if developer capacity supports.
5. **Four adversarial test cases added per SME.** Integrated into test-case tables below; ~30 minutes additional specification work within the 4-8 hour estimate.

---

## OWA/CWA posture per helper (SME Wave 1 observation)

SME's Wave 1 signoff flagged: Wave 0/1 negation-as-failure works as closed-world over **complete curated lists**. Wave 2 helpers don't have curated lists — they reason over CAU Signatures, which may be partial. Three Wave 2 helpers have distinct postures:

| Helper | Mode | Reasoning |
|---|---|---|
| SDCNC3 `cauBearerIsParticularNotGeneric` | **Pure CWA (positive check)** | Helper asks "does the CAU have `bfo:inheresIn` pointing to a particular bearer?" — positive-presence check. No OWA concern. If the axiom is absent from the Signature, the helper returns false (correct: we can't call something "particularly bearing" without evidence of particular-bearing axioms). |
| QualityNC3 `cauAlwaysRealizedWhenBearerExists` | **Mixed CWA + OWA** | Positive check for continuous-realization axioms AND negative check for absence of `bfo:realizedIn` restrictions. The negative branch needs OWA treatment — a Quality CAU might legitimately omit `realizedIn` because it's continuously borne, but we can't assume absence from Signature = absence from semantics without derivation attempt. |
| GDCNC3 `cauAdmitsMultipleSimultaneousConcretizations` | **Mixed CWA + OWA** | Positive check on `bfo:concretizes` presence AND negative check on cardinality-1 restrictions. Cardinality absence under OWA means "no cardinality constraint declared" — which admits multiple concretizations. Need derivation attempt before concluding admittance. |

Per-helper OWA treatment specified in the sections below.

---

## Helper 1: `cauBearerIsParticularNotGeneric` (SDCNC3)

**Grounds NC:** SDCNC3 (High-priority; tagged CURATED-NC but `sme_locked: false`).

**Prolog body (from `bfo-signatures-v1.0.json`):** `cau_bearer_is_particular_not_generic(CAU).`

**BFO semantic (from Arp/Smith/Spear §5.3):** "a specifically dependent continuant is such that its existence requires the existence of that particular bearer." The "particular" vs "generic" distinction is the primary discriminator from GDC (which admits multiple simultaneous bearers).

### Function signature

```javascript
export function cauBearerIsParticularNotGeneric(input) {
  // input: { signature: SignatureObject }
  // returns: { result: boolean, evidence: object, groundsNC: 'SDCNC3', helperIRI: '...' }
}
```

### Axiom-pattern specification

Helper succeeds iff the CAU's Signature contains **at least one** `bfo:inheresIn` property restriction whose target indicates a particular bearer. Three patterns count as "particular":

1. **Target is an `owl:NamedIndividual`** (directly or via a `rdf:type` assertion in the Signature's axioms).
2. **Target is a class expression with a singleton-membership constraint** (e.g., `owl:oneOf` of a single individual, or `owl:hasValue` on a specific instance).
3. **Target is a class with `owl:qualifiedCardinality 1` on the `inheresIn` restriction AND the class is a subclass of a bearer-designation class** (curated bearer-class list may or may not exist by Week 8; see note).

Signature surface consulted: the Wave 0 extractor's `propertyRestrictionsAsDomain` array filtered by `onProperty === 'bfo:inheresIn'`, cross-referenced with the Signature's `cardinalityRestrictions` array.

### Test case shapes

| Test | Signature fragment | Expected |
|---|---|---|
| Individual bearer | `inheresIn some ex:Alice` (Alice is `owl:NamedIndividual`) | true |
| Singleton class | `inheresIn some (oneOf: ex:Alice)` | true |
| Cardinality-1 on inheresIn (simplified pattern 3) | `inheresIn exactly 1 ex:HumanBearer` | true |
| Generic class bearer (no constraint) | `inheresIn some ex:Human` (ex:Human is a class, no singleton/cardinality) | false |
| No inheresIn restriction | Signature has no `inheresIn` entry | false |
| **Adversarial: singleton-via-negative-enumeration** (SME-added) | `inheresIn some ex:Class` + `owl:differentFrom` assertions constraining effective membership to one individual | **Documented decision:** helper routes to Plausible because pattern-2 coverage doesn't reach negative-enumeration form in v1.0. Expanding pattern 2 to handle this would require axiom-graph reasoning beyond current helper scope; acceptable to defer. |
| **Adversarial: circular bearer relationships** (SME-added) | CAU A `inheresIn` B, B `inheresIn` A | Helper does NOT recurse into B; treats A's declaration as evidence at A's level only. Returns true for A (inheresIn targets B, which is a class expression). B's declarations are evaluated independently when B is the CAU under evaluation. Data-validity concern (circular dependency in source ontology) is the source-ontology author's concern, not the helper's. |

### OWA/CWA posture

**Pure CWA (positive check only).** Helper returns true iff axiom evidence is present; false otherwise. No derivation attempt needed. If a Signature lacks `inheresIn` restrictions entirely, the CAU is not "particularly bearing" at the axiom level — consistent with SDC's semantic requirement that particular-bearing be explicit.

**Edge case:** a CAU might be semantically an SDC (per class-hierarchy subsumption) but have an under-specified Signature that lacks the `inheresIn` restriction. The helper correctly returns false, which routes the CAU to Plausible rather than forced-SDC. This matches the three-state evidence model's posture on incomplete Signatures.

### Dependencies

- **Wave 0 extractor fields used:** `propertyRestrictionsAsDomain`, `cardinalityRestrictions`.
- **No new curated list needed** per SME scoping memo.
- **Optional enhancement (Week 8+):** a curated "bearer-class list" to catch pattern 3 (cardinality-1 on inheresIn targeting bearer-designation class) more reliably. Not required for v1.0.

---

## Helper 2: `cauAlwaysRealizedWhenBearerExists` (QualityNC3)

**Grounds NC:** QualityNC3 (High-priority SME-LOCKED).

**Prolog body (from `bfo-signatures-v1.0.json`):** `cau_always_realized_when_bearer_exists(CAU), \+ cau_realization_has_triggering_circumstances(CAU).`

**BFO semantic (from Arp/Smith/Spear §5.3.5):** "qualities are those SDCs which are exhibited whenever their bearer exists." Unlike Dispositions (conditionally realized on triggering) and Roles (contextually realized on social participation), Qualities are continuously realized — they don't wait for trigger conditions.

### Function signature

```javascript
export function cauAlwaysRealizedWhenBearerExists(input) {
  // input: { signature: SignatureObject, realizationTargets?: string[], isSubclassOf?: Function }
  // returns: { result: boolean, positiveEvidence: ..., negativeEvidence: ..., groundsNC: 'QualityNC3', ... }
}
```

**Note:** Prolog body has two conjuncts. The helper composes them internally: both must succeed for the helper to return true. The second conjunct reuses `cauRealizationHasTriggeringCircumstances` (Wave 0).

### Axiom-pattern specification

**Positive conjunct** (continuous-realization evidence): helper succeeds iff the CAU's Signature indicates that realization is co-extensional with bearer existence. Patterns:

1. **Presence of `bfo:existsAt` cross-referencing with `bfo:inheresIn`** — CAU exists whenever bearer exists (both share temporal scope).
2. **Absence of `bfo:realizedIn` restrictions** — Quality doesn't wait to be realized in a process; it's manifested continuously.
3. **Presence of continuous-attribute patterns** (e.g., `rdfs:subClassOf bfo:Quality` direct or transitive).

Pattern 2 is the primary positive signal; patterns 1 and 3 reinforce.

**Negative conjunct** (no triggering circumstances): reuses the Wave 0 `cauRealizationHasTriggeringCircumstances` helper — asks whether any realization target is in the `causal_triggering` curated list. If the result is false, the CAU doesn't have triggering-circumstance realization, which is a requirement for Quality.

### Test case shapes

| Test | Signature fragment | Positive evidence (Option B: patterns 1 OR 3 required) | Negative (not-causal) | Expected helper result |
|---|---|---|---|---|
| Pure Quality (no realization target, only inheresIn) | `inheresIn some ex:Ball` (no `realizedIn`, no explicit existsAt, not declared subclass of bfo:Quality) | ✗ (neither pattern 1 nor pattern 3 holds — pattern 2 absence does NOT count under Option B) | ✓ (vacuously — no targets) | **false** (routes to Plausible — Option B strict posture) |
| Quality with explicit continuous realization | `inheresIn some ex:Ball` + `existsAt some ex:Ball-temporal-region` | ✓ (pattern 1) | ✓ | true |
| Subclass-of-Quality declaration | `rdfs:subClassOf bfo:Quality` (directly or transitively) | ✓ (pattern 3) | ✓ (vacuously) | true |
| Disposition (causal triggering) | `inheresIn some ex:Glass` + `realizedIn some cco:ShatteringProcess` | ✗ | ✗ | false |
| Function (design-expected — not a Quality) | `inheresIn some ex:Heart` + `realizedIn some cco:PumpingProcess` | ✗ | ✓ (design, not causal) | false (positive conjunct fails) |
| Under-specified Signature | `rdfs:subClassOf bfo:Quality` only, no `inheresIn` | ✓ (pattern 3 holds) | ✓ vacuously | true (pattern 3 sufficient under Option B) |
| **Adversarial: dual-signal case** (SME-added) | `inheresIn some ex:Bearer` + `realizedIn some cco:ShatteringProcess` (positive pattern 3 may or may not hold) | — | ✗ (causal triggering present) | **false** (negative-conjunct failure dominates; routes to Plausible via multi-category evaluator review even if positive conjunct satisfied) |

### OWA/CWA posture — Option B (LOCKED per SME 2026-04-22)

**Mixed: positive conjunct requires explicit continuous-realization evidence (patterns 1 or 3); negative conjunct reuses Wave 0's `cauRealizationHasTriggeringCircumstances`.**

**Load-bearing architectural principle (SME 2026-04-22):** absence of axiomatic evidence for one category is NOT positive evidence for another category. Treating absence of `realizedIn` as positive evidence of continuous realization is a positive classification on negative evidence — exactly the failure mode the three-state evidence model was designed to prevent.

**Positive conjunct requirement:** at least one of patterns 1 or 3 must hold (explicit `existsAt + inheresIn` temporal co-extension, OR explicit `rdfs:subClassOf bfo:Quality` direct/transitive). Pattern 2 alone (absence of `realizedIn`) does NOT satisfy the positive conjunct.

**Negative conjunct:** reuses Wave 0's `cauRealizationHasTriggeringCircumstances`. Returns true iff the CAU has at least one realization target in the `causal_triggering` curated list. The negation `\+` succeeds iff no realization target is causal-triggering. Correct by construction.

**Under-specified Signatures route to Plausible more aggressively under Option B.** A CAU with `rdfs:subClassOf bfo:Quality` but no other axioms satisfies pattern 3 (subclass membership) and qualifies. A CAU with only `inheresIn` declarations (no pattern 1 or 3) fails the positive conjunct and routes to Plausible. SME rationale: false positives on confident-wrong Quality classifications are worse than false negatives routing to Plausible for analyst review; Plausible is recoverable.

### Dependencies

- **Wave 0 extractor fields used:** `propertyRestrictionsAsDomain`, `existentialRestrictions`.
- **Wave 0 helper reused:** `cauRealizationHasTriggeringCircumstances` (for the negative conjunct).
- **Subsumption callback** for pattern 3 (Quality-class membership): same optional callback as Wave 0 helpers.

---

## Helper 3: `cauAdmitsMultipleSimultaneousConcretizations` (GDCNC3)

**Grounds NC:** GDCNC3 (High-priority SME-LOCKED).

**Prolog body (from `bfo-signatures-v1.0.json`):** `cau_admits_multiple_simultaneous_concretizations(CAU), \+ cau_bearer_is_particular_not_generic(CAU).`

**BFO semantic (from Arp/Smith/Spear §5.4):** "generically dependent continuants are those entities that depend for their existence on some bearer or other, but not on a specific bearer." The canonical example: an information content entity (a text) can be concretized in multiple physical artifacts (multiple book copies) simultaneously.

### Function signature

```javascript
export function cauAdmitsMultipleSimultaneousConcretizations(input) {
  // input: { signature: SignatureObject }
  // returns: { result: boolean, positiveEvidence: ..., negativeEvidence: ..., groundsNC: 'GDCNC3', ... }
}
```

**Depends on SDCNC3 helper existing** — the negation in the second conjunct reuses `cauBearerIsParticularNotGeneric`. SDCNC3 must ship before GDCNC3 can integrate.

### Axiom-pattern specification

**Positive conjunct** (multiple-concretization admission): helper succeeds iff the CAU's Signature contains `bfo:concretizes` restrictions WITHOUT cardinality constraints limiting to single concretization. Patterns:

1. **`concretizes some InformationBearerClass` with no `owl:cardinality 1` or `owl:qualifiedCardinality 1` on the restriction** — admits multiple simultaneous concretizations.
2. **Explicit `owl:minCardinality` but no `owl:maxCardinality` on concretizes** — admits an unbounded number of simultaneous concretizations.
3. **`concretizes some InformationBearerClass` AND presence of cross-instance-concretization axioms** (rare; present in some advanced IAO ontologies).

Pattern 1 is the primary signal; patterns 2 and 3 are reinforcements.

**Negative conjunct** (not specifically dependent): reuses SDCNC3's `cauBearerIsParticularNotGeneric`. Negation succeeds iff the CAU does NOT have particular-bearer axioms. A GDC depends on *some* bearer (generic); an SDC depends on *that* bearer (particular); the negation ensures we're not on the SDC side of the split.

### Test case shapes

| Test | Signature fragment | Positive (Option B: patterns 2 OR 3 required) | Negative (not-particular) | Expected helper result |
|---|---|---|---|---|
| Information content entity (canonical GDC) | `concretizes some ex:Book` (no cardinality) | ✗ (pattern 1 absence alone insufficient under Option B — needs explicit minCardinality or cross-instance axioms) | ✓ | **false** (routes to Plausible) |
| Software program (multi-installation with explicit minCardinality) | `concretizes some ex:PhysicalMachine` + `minCardinality 2` | ✓ (pattern 2) | ✓ | true |
| Information entity with cross-instance-concretization axioms | `concretizes some ex:Bearer` + explicit axioms permitting same CAU → multiple concretization instances | ✓ (pattern 3) | ✓ | true |
| SDC (specifically dependent) | `inheresIn some ex:Alice` (particular) | ✗ (no concretizes) | ✗ (particular bearer present) | false |
| Cardinality-1 on concretizes (edge case) | `concretizes exactly 1 ex:Bearer` | ✗ (cardinality limits to 1) | ✓ | false |
| Under-specified | `rdfs:subClassOf bfo:GDC` only, no restrictions | ✗ (pattern 2/3 require explicit multi-cardinality or cross-instance axioms; subclass declaration insufficient) | ✓ vacuously | false (routes to Plausible) |
| **Adversarial: dual-signal case** (SME-added) | `concretizes some ex:InformationBearer` + `inheresIn some ex:ParticularAlice` | Even if pattern 2/3 holds | ✗ (SDCNC3 fires true — particular bearer present) | **false** (negative-conjunct failure dominates; routes to Plausible for multi-category analyst review) |

### OWA/CWA posture — Option B (LOCKED per SME 2026-04-22, resolved jointly with QualityNC3)

**Mixed: positive conjunct requires explicit multi-concretization evidence (patterns 2 or 3); negative conjunct reuses SDCNC3 helper.**

Same load-bearing principle as QualityNC3: absence of cardinality-1 constraint is absence-of-constraint-evidence, not positive evidence of multi-concretization admission.

**Positive conjunct requirement:** pattern 2 (explicit `owl:minCardinality n>1` on `concretizes`) OR pattern 3 (cross-instance-concretization axioms) must hold. Pattern 1's absence-of-cardinality-1 alone is necessary-but-not-sufficient.

**Negative conjunct:** reuses SDCNC3's `cauBearerIsParticularNotGeneric`. Negation succeeds iff the CAU does NOT have particular-bearer axioms.

**Under-specified GDC Signatures (those with only `rdfs:subClassOf bfo:GDC` declaration and `concretizes` without explicit multi-cardinality) route to Plausible.** This is the intended conservative posture per SME: false-GDC classifications via absence-of-cardinality-1 produce downstream errors that are more expensive to diagnose than Plausible routing with analyst review.

### Dependencies

- **Wave 0 extractor fields used:** `propertyRestrictionsAsDomain`, `cardinalityRestrictions`.
- **Wave 2 helper reused:** `cauBearerIsParticularNotGeneric` (SDCNC3 — must ship first).
- **No new curated list needed** per SME scoping memo.

---

## Integration considerations

### Implementation ordering

SDCNC3 first (no dependencies), then GDCNC3 (depends on SDCNC3), QualityNC3 independent (can ship in parallel). SME scoping memo Wave 2 ordering matches: SDCNC3 → GDCNC3 → QualityNC3.

### Cascade-level integration

Wave 2 helpers don't change the realizable-entity cascade (Function → Role → Disposition). They operate on parent categories:
- **SDCNC3:** feeds into SDC Entailment (distinguishes SDC from GDC within dependent continuants)
- **QualityNC3:** feeds into Quality Entailment (distinguishes Quality from Disposition within SDC subtypes)
- **GDCNC3:** feeds into GDC Entailment (distinguishes GDC from SDC at the dependent-continuant split)

At the routing layer, Wave 2 helpers populate the evidence record per CAU; they don't gate cascade decisions in the same way Wave 0 realizable-entity helpers do.

### No new curated list assertion

Per SME scoping memo 2026-04-22: no new curated process category lists required. Wave 2 helpers reason over axiom patterns in the CAU's Signature, not over process-category membership. If any helper design surfaces a need for a curated list during implementation (e.g., a curated "bearer-designation class" list to strengthen SDCNC3 pattern 3), that becomes a separate amendment discussion, not in-scope for v1.0.

---

## SME decisions (LOCKED 2026-04-22)

- ✅ **QualityNC3 OWA/CWA:** Option B (strict). SME override of developer's pragmatic Option A lean. Load-bearing principle: absence of evidence for one category is NOT positive evidence for another.
- ✅ **GDCNC3 OWA/CWA:** Option B (strict). Resolved jointly with QualityNC3.
- ✅ **SDCNC3 Pattern 3:** simplified (no curated bearer-class list). Cardinality-1 on `inheresIn` alone is sufficient signal for specific-bearer semantics; revisit in v1.1+ only if under-matching surfaces.
- ✅ **Wave 2 implementation ordering:** SDCNC3 → GDCNC3 → QualityNC3 confirmed. Parallel development permissible if developer capacity supports.
- ✅ **Adversarial test cases:** 4 added (2 for SDCNC3, 1 each for QualityNC3 and GDCNC3). Integrated into test-case tables above.

Wave 2 implementation green-lit for Week 8 (~4-8 hours per scoping memo + ~30 min adversarial case specification).

---

## Nice-to-have delivery also in this message: `cauDispositionDisjunctive` function body

Per SME Wave 1 signoff: the actual 15-line function body would close residual uncertainty on the short-circuit semantics. Full body verbatim:

```javascript
export function cauDispositionDisjunctive(input) {
  const design = cauHasTeleologicalCommitment(input);
  const causal = cauRealizationHasTriggeringCircumstances(input);

  // Branch A: Function CAU (teleological) — satisfies DispositionNC5.
  if (design.result) {
    return {
      result: true,
      branch: 'A-teleological',
      branchAMatches: design.matches,
      branchBMatches: [],
      groundsNC: 'DispositionNC5',
      helperIRI: 'cau_disposition_disjunctive/1',
      semanticNote: 'Branch A fired: CAU has teleological commitment; is a Function (Function ⊂ Disposition in BFO 2020).',
    };
  }

  // Branch B: non-Function Disposition (no teleology AND has triggering circumstances).
  // The negation guard here (!design.result) is already established by the if-branch above.
  if (causal.result) {
    return {
      result: true,
      branch: 'B-causal-triggering',
      branchAMatches: [],
      branchBMatches: causal.matches,
      groundsNC: 'DispositionNC5',
      helperIRI: 'cau_disposition_disjunctive/1',
      semanticNote: 'Branch B fired: CAU has no teleological commitment AND has triggering circumstances; is a non-Function Disposition.',
    };
  }

  // Neither branch fires — CAU is not a Disposition per NC5.
  return {
    result: false,
    branch: null,
    branchAMatches: [],
    branchBMatches: [],
    groundsNC: 'DispositionNC5',
    helperIRI: 'cau_disposition_disjunctive/1',
    semanticNote: 'Neither disjunct fired: no teleological commitment and no triggering circumstances. Not a Disposition under NC5.',
  };
}
```

The short-circuit semantic: `if (design.result)` returns before `if (causal.result)` can evaluate. Equivalent to Prolog `\+ cau_has_teleological_commitment(CAU)` in the second disjunct. Function CAUs exit via the first `if`; Branch B never runs for them.

---

## Count correction applied

Per SME Wave 1 signoff: total CRITICAL SME-LOCKED items = **6** (RoleNC3, RoleNC4, FunctionNC3, DispositionNC3, DispositionNC4, DispositionNC5), not 9. FunctionNC4, RoleNC5, SDCNC3, QualityNC3, GDCNC3 are High-priority, not CRITICAL.

Post-Wave-1 status: **all 6 CRITICAL items integration-path-complete.** 2 of 5 High-priority complete (FunctionNC4 from Wave 1). Wave 2 addresses SDCNC3, QualityNC3, GDCNC3 (3 of remaining 3 High). Wave 3 defers RoleNC5 to v1.1+.
