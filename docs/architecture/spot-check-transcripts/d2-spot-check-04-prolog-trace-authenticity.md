# D2 Spot-Check Transcript 04: Prolog Trace Authenticity

**Scenario:** `sandbox-prolog-trace-is-engine-output` (phase-d2-avc-bundle.json, scenario 22)
**Verifies:** Decision D-16 (genuine Prolog trace), AC-D2-17, Rule PS-6
**FANDAWS Version:** v2.1, Phase D2
**Tau Prolog Version:** 0.3.4-beta
**Captured:** 2026-04-18
**Architect Confirmation:** 2026-04-18

---

## Setup

TypeDisjointnessViolation scenario:
- `user:car` — BFO category: MaterialEntity
- `user:driver` — BFO category: Process
- `fandaws:class/relation/has-part` — expected range: MaterialEntity
- BFO Disjointness Map contains: MaterialEntity | Process

Candidate axiom: `car hasPart driver` (Process in MaterialEntity range — violates PS-4a)

## Prolog Trace (prologTrace field)

```prolog
Call: violation(type_disjointness, fandaws:class/relation/has-part, user:car, user:driver, SubType, ObjType)
Call: candidate_axiom(fandaws:candidate_axiom_car_has_driver, _, user:car, fandaws:class/relation/has-part, _, user:driver)
Exit: candidate_axiom(fandaws:candidate_axiom_car_has_driver, _, user:car, fandaws:class/relation/has-part, _, user:driver)
Call: relation_range(fandaws:class/relation/has-part, ExpectedRange)
Exit: relation_range(fandaws:class/relation/has-part, user:material-entity)
Call: bfo_category(user:driver, ObjType)
Exit: bfo_category(user:driver, bfo:Process)
Call: bfo_category_for_range(user:material-entity, RangeType)
Exit: bfo_category_for_range(user:material-entity, bfo:MaterialEntity)
Call: disjoint(bfo:Process, bfo:MaterialEntity)
Exit: disjoint(bfo:Process, bfo:MaterialEntity)
Call: bfo_category(user:car, SubType)
Exit: bfo_category(user:car, bfo:MaterialEntity)
Exit: violation(type_disjointness, fandaws:class/relation/has-part, user:car, user:driver, bfo:MaterialEntity, bfo:Process)
```

## Authenticity Checks (AC-D2-17)

| Check | Result |
|---|---|
| Contains `Call:` entries | **true** |
| Contains `Exit:` entries | **true** |
| All lines parseable as `predicate(arg1, arg2, ...)` form | **true** (14 lines) |
| Contains English prose description | **false** |

## Derivation Walkthrough

1. `violation/6` goal entered with unbound SubType, ObjType
2. `candidate_axiom/6` unified — car hasPart driver found in fact base
3. `relation_range/2` resolved — hasPart's declared range is user:material-entity
4. `bfo_category/2` resolved — driver's BFO category is bfo:Process
5. `bfo_category_for_range/2` resolved — material-entity's BFO category is bfo:MaterialEntity
6. `disjoint/2` confirmed — Process and MaterialEntity are disjoint (ground fact from pre-computed closure, not derived via recursion — PS-9 / Invariant I-2)
7. `bfo_category/2` resolved — car's BFO category is bfo:MaterialEntity
8. `violation/6` succeeded — all subgoals proven, TypeDisjointnessViolation returned

## What This Transcript Locks In

AC-D2-17: the `prologTrace` field contains genuine engine derivation output with Call/Exit pairs. Every line parses as Prolog `predicate(arg1, arg2, ...)` form. No English prose, no declarative summary.

Two invariants are visibly enforced in the trace:
- **PS-9 (Invariant I-2):** `disjoint(bfo:Process, bfo:MaterialEntity)` is resolved by ground-fact unification in one step — the reflexive-transitive closure was pre-computed by the fact-base builder, not derived via recursive traversal at query time.
- **PS-4a:** Both subject and object BFO categories are consulted independently (`bfo_category/2` called twice), confirming the rule checks both ends against the disjointness map.

If a future developer refactors the rule to check only one end, or replaces the trace with a prose summary, this artifact would no longer match. It forecloses on both regressions.
