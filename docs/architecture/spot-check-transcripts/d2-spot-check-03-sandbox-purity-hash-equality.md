# D2 Spot-Check Transcript 03: Sandbox Purity Content-Hash Equality

**Scenario:** `sandbox-purity-no-canonical-mutation` (phase-d2-avc-bundle.json, scenario 23)
**Verifies:** Rule PS-1 (sandbox never mutates canonical), Decision D-13
**FANDAWS Version:** v2.1, Phase D2
**Tau Prolog Version:** 0.3.4-beta
**Captured:** 2026-04-18
**Architect Confirmation:** 2026-04-18

---

## Setup

Canonical graph with 3 concepts:
- `user:car` (MaterialEntity)
- `user:engine` (MaterialEntity)
- `user:material-entity` (imported BFO anchor)

Canonical relation: `fandaws:class/relation/has-part` (MaterialEntity -> MaterialEntity)

## Candidate Axiom

```
user:car hasPart user:engine
(car is MaterialEntity, engine is MaterialEntity, hasPart expects MaterialEntity range)
```

Expected outcome: NoViolations (structurally valid axiom).

## Canonical Graph Hash BEFORE Sandbox

```
f58d51f4e9820bd58612ba3bb8736c325807ae3b6e97ce3e36a19a5d484c89fa
concept count: 3
```

## Sandbox Execution

```
Session created:     sandbox-session-1776521719111
Fact base rebuilt:   true (fresh per PS-2)
Rules consulted:     PS-4a through PS-4f
Result:              NoViolations
Session destroyed:   true
```

## Canonical Graph Hash AFTER Sandbox

```
f58d51f4e9820bd58612ba3bb8736c325807ae3b6e97ce3e36a19a5d484c89fa
concept count: 3
```

## Purity Verification

```
hashBefore: f58d51f4e9820bd58612ba3bb8736c325807ae3b6e97ce3e36a19a5d484c89fa
hashAfter:  f58d51f4e9820bd58612ba3bb8736c325807ae3b6e97ce3e36a19a5d484c89fa
hashes equal? true  <-- RULE PS-1 SATISFIED
```

## What This Transcript Locks In

Rule PS-1: zero triples added, modified, or retracted in the canonical graph by sandbox execution. Routing to NoViolations happened AFTER the sandbox returned, in the JS pipeline stage, not inside Tau Prolog. Content hash is byte-identical before and after.

This is the architectural boundary between the Prolog engine and the canonical graph that Decision D-13 establishes. If a future revision refactors the sandbox to write results directly into the graph from within an engine callback, this hash would differ. The transcript is the canary.
