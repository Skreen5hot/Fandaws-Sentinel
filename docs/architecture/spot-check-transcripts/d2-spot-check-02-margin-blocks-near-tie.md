# D2 Spot-Check Transcript 02: Margin Blocks Near-Tie

**Scenario:** `disambiguation-auto-merge-margin-blocks-near-tie` (phase-d2-avc-bundle.json, scenario 3)
**Verifies:** Rule PD-4 (margin enforcement), Decision D-10
**FANDAWS Version:** v2.1, Phase D2
**Tau Prolog Version:** 0.3.4-beta
**Captured:** 2026-04-18
**Architect Confirmation:** 2026-04-18

---

## Setup

Two structurally identical canonicals:
- `fandaws:class/relation/contains` — transitive, MaterialEntity -> MaterialEntity
- `fandaws:class/relation/has-part` — transitive, MaterialEntity -> MaterialEntity

Candidate: `ex:includes` — transitive, MaterialEntity -> MaterialEntity, label "includes"

## Candidate Fingerprint

```
domainBFOCategory: bfo:MaterialEntity
rangeBFOCategory:  bfo:MaterialEntity
characteristics:   ["transitive"]
label:             includes
```

## Match Scores (descending)

| Canonical | Score | Domain | Range | Subcategory | Characteristics | AllowsInheresIn | Lexical |
|---|---|---|---|---|---|---|---|
| contains | **0.900** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0.0 |
| has-part | **0.900** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0.0 |

## Margin Analysis

```
top score:    0.900 (fandaws:class/relation/contains)
second score: 0.900 (fandaws:class/relation/has-part)
margin:       0.0000
margin >= 0.05? false  <-- THIS IS THE KEY CHECK
top >= 0.85?    true
```

## Routing Decision

```
disposition:     DisambiguationRecord
sandboxVerdict:  MultipleCloseMatches
mergedInto:      (none — auto-merge REFUSED)
```

## Rule PD-4 Enforcement

```
Both canonicals score above 0.85 threshold? YES
Margin between them: 0.0000 < 0.05 required minimum
Auto-merge fires? NO — margin too small
Disposition: DisambiguationRecord with MultipleCloseMatches
Human must choose between contains and has-part
```

## What This Transcript Locks In

PD-4's second condition — margin >= 0.05 — prevents auto-merge even when both candidates individually exceed the 0.85 threshold. Without this invariant, a near-tie at 0.88/0.86 would silently merge into whichever canonical happened to sort first, which is the exact failure mode PD-4 was written to prevent. This transcript is the canonical reference for "threshold alone is insufficient."
