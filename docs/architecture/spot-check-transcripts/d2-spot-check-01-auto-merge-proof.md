# D2 Spot-Check Transcript 01: Auto-Merge with owl:equivalentProperty

**Scenario:** `disambiguation-auto-merge-above-threshold` (phase-d2-avc-bundle.json, scenario 2)
**Verifies:** Rule PD-4 (auto-merge threshold + margin), Rule PD-9 (named-property-to-named-property), Decision D-10, Decision D-17
**FANDAWS Version:** v2.1, Phase D2
**Tau Prolog Version:** 0.3.4-beta
**Captured:** 2026-04-18
**Architect Confirmation:** 2026-04-18

---

## Setup

Two canonical relations:
- `fandaws:class/relation/has-part` — transitive, MaterialEntity -> MaterialEntity
- `fandaws:class/relation/located-in` — non-transitive, MaterialEntity -> MaterialEntity

Candidate: `ex:hasComponent` — transitive, MaterialEntity -> MaterialEntity, label "has component"

## Candidate Fingerprint

```
domainBFOCategory: bfo:MaterialEntity
rangeBFOCategory:  bfo:MaterialEntity
characteristics:   ["transitive"]
label:             has component
```

## Match Scores (descending)

| Canonical | Score | Domain | Range | Subcategory | Characteristics | AllowsInheresIn | Lexical |
|---|---|---|---|---|---|---|---|
| has-part | **0.933** | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0.333 |
| located-in | 0.800 | 1.0 | 1.0 | 1.0 | 0.0 | 1.0 | 0.0 |

## Margin Analysis

```
top score:    0.933 (fandaws:class/relation/has-part)
second score: 0.800 (fandaws:class/relation/located-in)
margin:       0.133
margin >= 0.05? true
top >= 0.85?    true
```

## Routing Decision

```
disposition: AutoMerged
mergedInto:  fandaws:class/relation/has-part
```

## MergeRecord

```json
{
  "type": "MergeRecord",
  "mergedCandidate": "ex:hasComponent",
  "mergedInto": "fandaws:class/relation/has-part",
  "mergeTrigger": "AutoMerge",
  "mergeConfidence": 0.933,
  "mergeRationale": "Domain match (1.0) + Range match (1.0) + Characteristic match (1.0) + Lexical partial (has component ~ has part)",
  "equivalencyAssertion": {
    "subject": "ex:hasComponent",
    "predicate": "owl:equivalentProperty",
    "object": "rel:has-part"
  },
  "mergedAt": "2026-04-18T14:14:20.904Z",
  "mergedBy": "AutoMerge/D2Pipeline",
  "ingestedInSession": "fandaws:session/example"
}
```

## What This Transcript Locks In

The equivalency assertion `ex:hasComponent owl:equivalentProperty rel:has-part` is the named-property-to-named-property form Rule PD-9 requires. The margin (0.133) well exceeds the 0.05 floor. The scoring breakdown shows structural physics dominating as designed by the D-9 weight vector.
