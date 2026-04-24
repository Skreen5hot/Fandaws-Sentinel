# Critical NC Helper Predicates — SME Validation Artifact

**For:** SME (pre-implementation review of the three CRITICAL helper predicates)
**Prepared:** 2026-04-22
**Status:** ready for SME validation
**Scope:** RoleNC3, FunctionNC3, DispositionNC3 — 3 of the 9 SME-LOCKED CRITICAL items
**Implementation:** [src/core/d16/critical-nc-helpers.js](../../src/core/d16/critical-nc-helpers.js)
**Consumes:** [specs/d16/curated-process-categories-v1.0.json](curated-process-categories-v1.0.json) (SME-authored, delivered 2026-04-22, 34 entries across 3 categories)

---

## What SME is validating

Three things:

1. **Helper semantics match the prose NCs.** Each helper's boolean-return behavior corresponds to what the BFO Signature Reference §5 says the NC tests.
2. **Multi-category overlap routes correctly.** CAUs whose realization targets appear in multiple curated categories route to Plausible with evidence annotation, NOT to cascade-forced Function > Role > Disposition. Per SME's 2026-04-22 framing: "Forcing Function > Disposition > Role via BFO-OWL's taxonomic subsumption would be a category error."
3. **Non-coverage handling is honest.** CAUs whose realization targets aren't in any list route to Plausible with the `nonCoverageFromCuratedLists: true` flag — NOT to force-classified-by-heuristic.

---

## Walkthrough: Five Sample CAUs

### Sample 1: `ex:HeartPumpingFunction`

**Expected disposition:** Entailed, bfoCategory `bfo:Function`.

**Realization targets:** `['cco:PumpingProcess']`

**Helper results:**
| Helper | Result |
|---|---|
| `cauHasTeleologicalCommitment` | **true** (matched `cco:PumpingProcess` in `design_expected`) |
| `cauRealizationRequiresSocialInstitutionalContext` | false |
| `cauRealizationHasTriggeringCircumstances` | false |

**Route output:**
```json
{
  "disposition": "Entailed",
  "bfoCategory": "bfo:Function",
  "routedBy": "FunctionNC3-via-curated-list"
}
```

**SME validation:** ✅ Heart is biologically-selected-for pumping per Spear/Ceusters/Smith 2016 §3; `cco:PumpingProcess` is in `design_expected` with that source citation. Single-category match → Function per cascade.

---

### Sample 2: `ex:Fragility`

**Expected disposition:** Entailed, bfoCategory `bfo:Disposition`.

**Realization targets:** `['cco:ShatteringProcess']`

**Helper results:**
| Helper | Result |
|---|---|
| `cauHasTeleologicalCommitment` | false |
| `cauRealizationRequiresSocialInstitutionalContext` | false |
| `cauRealizationHasTriggeringCircumstances` | **true** (matched `cco:ShatteringProcess` in `causal_triggering`) |

**Route output:**
```json
{
  "disposition": "Entailed",
  "bfoCategory": "bfo:Disposition",
  "routedBy": "DispositionNC3-via-curated-list"
}
```

**SME validation:** ✅ Fragility is the borne disposition; shattering is the causally-triggered realization per Arp/Smith/Spear §5.3.4. Single-category match → Disposition (non-teleological).

---

### Sample 3: `ex:EmployeeRole`

**Expected disposition:** Entailed, bfoCategory `bfo:Role`.

**Realization targets:** `['cco:ProfessionalActivity']`

**Helper results:**
| Helper | Result |
|---|---|
| `cauHasTeleologicalCommitment` | false |
| `cauRealizationRequiresSocialInstitutionalContext` | **true** (matched `cco:ProfessionalActivity` in `social_institutional`) |
| `cauRealizationHasTriggeringCircumstances` | false |

**Route output:**
```json
{
  "disposition": "Entailed",
  "bfoCategory": "bfo:Role",
  "routedBy": "RoleNC3-via-curated-list"
}
```

**SME validation:** ✅ Professional activities are socially-realized per Arp/Smith/Spear §5.3.2 and Smith/Kumar/Ceusters 2005; `cco:ProfessionalActivity` is in `social_institutional`. Single-category match → Role.

---

### Sample 4: Multi-category CAU (the load-bearing test)

**A hypothetical CAU whose realization restrictions point to BOTH `cco:PumpingProcess` AND `cco:ShatteringProcess`.** Dual-nature realization — unusual but not malformed.

**Realization targets:** `['cco:PumpingProcess', 'cco:ShatteringProcess']`

**Helper results:**
| Helper | Result |
|---|---|
| `cauHasTeleologicalCommitment` | **true** (matched `cco:PumpingProcess`) |
| `cauRealizationRequiresSocialInstitutionalContext` | false |
| `cauRealizationHasTriggeringCircumstances` | **true** (matched `cco:ShatteringProcess`) |

**Route output (abridged; full evidence annotations in live query):**
```json
{
  "disposition": "Plausible",
  "multiCategoryOverlapDetected": true,
  "evidenceAnnotations": {
    "candidateBFOCategories": [
      { "category": "bfo:Function", "reason": "multi-category-realization-target", ... },
      { "category": "bfo:Disposition", "reason": "multi-category-realization-target", ... }
    ],
    "analystNoteRequired": "Realization spans multiple curated process categories; analyst review required per three-state evidence model. Forced-selection via cascade would produce confident-wrong classification."
  }
}
```

**SME validation:** ✅ **This is the load-bearing case.** Routes to Plausible with multi-category evidence annotation per SME's 2026-04-22 framing. Does NOT force-select Function via BFO-OWL's Function ⊂ Disposition subsumption; does NOT apply the §5.1 cascade (which would pick Function because FunctionNC3 fires first). Analyst note explicitly flags that cascade-forced selection would be a category error.

Per SME: "Forcing Function > Disposition > Role via BFO-OWL's taxonomic subsumption would be a category error (BFO's Function-is-a-Disposition relationship is taxonomic, not precedence) and would produce confident-wrong classifications on CAUs that genuinely have dual-nature realization." Implementation honors this by detecting multi-category overlap and short-circuiting to Plausible before cascade logic runs.

---

### Sample 5: Non-coverage CAU

**A CAU whose realization target is a custom user-ontology process not in any curated category.**

**Realization targets:** `['ex:UnknownCustomProcess']`

**Helper results:** all three false.

**Route output:**
```json
{
  "disposition": "Plausible",
  "evidenceAnnotations": {
    "candidateBFOCategories": [
      { "category": "bfo:Role" },
      { "category": "bfo:Function" },
      { "category": "bfo:Disposition" }
    ],
    "analystNoteRequired": "Role/Function/Disposition distinction requires context analyst must supply",
    "nonCoverageFromCuratedLists": true
  }
}
```

**SME validation:** ✅ Per curated-list policy `non_coverage_handling`: routes to Plausible with explicit non-coverage flag. Lists are calibration-target coverage, not exhaustive; non-coverage is Plausible-worthy, not heuristic-classifiable.

---

## Scope of the helper implementation

**What each helper returns:**

```
helper(input: { realizationTargets: string[], isSubclassOf?: Function })
  → {
      result: boolean,
      matches: [{ target, matchedEntry, viaSubsumption }...],
      groundsNC: string,
      helperIRI: string
    }
```

**Membership rules:**
1. **Direct match:** entry's `iri` === one of the CAU's realization targets.
2. **Subsumption match:** entry has `include_subclasses: true` AND the candidate ontology's subsumption resolver returns true for `isSubclassOf(target, entry.iri)`.
3. **Nothing else.** No heuristic extrapolation; no partial matching; no fuzzy IRI alignment.

**Subsumption support:**
- `isSubclassOf` is an optional callback provided by the caller. If omitted, the helper matches entries directly only (conservative false for subsumable matches).
- Production integration must supply this callback. Forward-flag: which infrastructure resolves subsumption? Two candidates (Week 6-8 hardening decision):
  - (a) Load candidate ontology's `rdfs:subClassOf` hierarchy into Tau Prolog fact base at Phase 3 initialization
  - (b) Extend existing subsumption infrastructure (`cau-signature.js` LS-3 + `subsumption_map` in `bfo-signatures-v1.0.json`) to cover class relations
- Tracked in [docs/architecture/week9-11-forward-flags.md](../../docs/architecture/week9-11-forward-flags.md).

## What SME is asked to confirm

- [ ] **Helper semantics match intent** for all three predicates against the curated lists.
- [ ] **Multi-category routing to Plausible is correct** per the 2026-04-22 framing — cascade-forced selection via BFO-OWL subsumption would be a category error; Plausible with evidence annotation is the correct resolution.
- [ ] **Non-coverage routing is correct** per curated-list `non_coverage_handling` policy.
- [ ] **Forward-flag subsumption-infrastructure decision** is appropriately scoped — neither (a) Tau Prolog fact-load nor (b) subsumption-infrastructure extension is pre-committed; deferred to Week 6-8 hardening decision as noted.
- [ ] **Six remaining SME-LOCKED CRITICAL items** (RoleNC4 negative, RoleNC5, DispositionNC4 negative, DispositionNC5 disjunctive, FunctionNC4, plus SDCNC3, QualityNC3, GDCNC3 from the High-priority set) follow the same curated-list-plus-helper pattern. Same validation approach, pending further curation as each NC's helper becomes concrete.

If all four items confirm: helpers lock for Band 4 real-implementation path. Inconsistencies flagged for revision before Band 4 hardening proceeds.

## Implementation notes (secondary)

- **File:** `src/core/d16/critical-nc-helpers.js` (~230 lines including full-module documentation)
- **Entry point for evaluator integration:** `routeRealizableCAUViaCuratedLists` replaces the synthetic-flag-based `routeRealizableCAU` in the Band 4 scaffold. Drop-in replacement once integrated.
- **Tests:** no unit tests yet; cross-checked against Band 4 scaffold scenarios (all still green). SME approval on this artifact is the gate for writing helper-specific unit tests.
- **Bidirectional traceability:** the three CRITICAL NC entries in `bfo-signatures-v1.0.json` now cite the curated list file AND the helper implementation via new `helper_definition_source` fields. Specs flow to curated list flow to code; reader can trace any direction.
