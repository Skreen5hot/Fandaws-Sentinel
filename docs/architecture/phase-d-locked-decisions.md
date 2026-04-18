# Phase D Locked Architectural Decisions
**Companion to Phase D AVC bundles (D1 and D2)**
**Status: LOCKED**

---

## Decision D-1: Phase Split — D1 (Pipeline + Class Placement) and D2 (Disambiguation + Consistency)

**Rule:** Phase D is split into two sub-phases.

### D1 — Pipeline Infrastructure + Class Placement

Covers: ingestion session management, staging records, Pipeline Phase 1 (BFO class placement), placement lifecycle, blocking rule.

### D2 — Property Disambiguation + Consistency Sandbox

Covers: Pipeline Phase 2 (property disambiguation), disambiguation records, merge records, auto-merge, sub-property promotion, Pipeline Phase 3 (consistency sandbox), namespace split.

### Boundary Rule

D1 can ship independently. D2 depends on D1 (properties reference classes placed by Phase 1). Separate AVC bundles.

### Deferred Beyond D2

`fan:RelationalQuality` reification, user-defined relation type classes, n-ary canonical records. These are representation upgrades, not pipeline features.

---

## Decision D-2: Ingestion Pipeline Is Batch, Not Conversational

**Rule:** The bulk ingestion pipeline processes external ontologies as batch operations with no interactive prompts during pipeline execution. Violations produce quarantine records or `PendingHumanResolution` status — they do NOT fire conversational prompts.

### What This Means

When Fandaws ingests an external ontology (e.g., CCO v1.4):

- Phase 1 processes ALL classes in the external ontology. Each class gets a placement confidence score. High confidence → `PlacementConfirmed`. Low confidence → `PlacementAmbiguous`. No placement → `PlacementRejected`. Ambiguous placements get `PendingHumanResolution`.
- No CC Path A or CC Path B prompts fire during ingestion. The conversational consistency check is for the conversational pipeline (single assertions from a user/agent). The ingestion pipeline uses the consistency sandbox (Phase 3) for batch validation.
- After pipeline completion, the diagnostic UI surfaces all `PendingHumanResolution` items for review. The human resolves them outside the pipeline run.

### Why Not Interactive

The conversational pipeline assumes a human/agent is present and responsive. The ingestion pipeline processes hundreds or thousands of axioms. Prompting on each would be unworkable. Instead, the pipeline runs to completion, collects all issues, and presents them as a batch for review.

### Two Entry Points, Shared Validation

The conversational pipeline and the ingestion pipeline are two separate entry points into the same canonical model. They share the same pre-materialization checks, the same quarantine store, the same compiler. They differ in how they respond to violations: the conversational pipeline prompts; the ingestion pipeline queues.

---

## Decision D-3: Class Placement Sandbox — JavaScript Validation

**Rule:** The Phase 1 class placement sandbox is implemented as JavaScript validation functions, not Tau Prolog. The sandbox evaluates BFO placement heuristics and returns a confidence score.

### Placement Heuristics

The sandbox examines each external class and applies heuristic rules to determine BFO placement:

1. **Explicit BFO superclass:** If the external class declares `rdfs:subClassOf` a BFO class, placement is direct. Confidence ≥ 0.9.
2. **Property-based inference:** If the external class has properties whose domain/range are BFO-typed, the class likely belongs under the same BFO branch. Confidence 0.6–0.8 depending on property count and specificity.
3. **Label-based heuristic:** If the class label matches a known pattern (e.g., contains "process", "event", "activity" → likely `bfo:Process`). Confidence 0.3–0.5. Low confidence because labels are unreliable.
4. **Disjointness-consistent:** After tentative placement, check against the BFO Disjointness Map. If the placement would create disjointness violations with existing classes, reduce confidence.

The sandbox returns: `{ placement: bfoNodeIri, confidence: number, justification: string }`. If multiple heuristics disagree, the sandbox returns the highest-confidence placement with a justification string listing all contributing heuristics.

### Why JavaScript, Not Prolog

The spec mentions Tau Prolog as an option. For edge-canonical, JavaScript validation functions achieve the same result without adding a runtime dependency. The heuristic rules are simple enough to express as JavaScript conditions. If more complex Horn clause reasoning is needed in the future, the sandbox interface (input: external class data, output: placement + confidence) can be reimplemented with Prolog without changing the pipeline.

---

## Decision D-4: Blocking Rule — Phase N+1 Cannot Begin While Phase N Has Unresolved Items

**Rule:** `PendingHumanResolution` is a blocking terminal state for phase progression. The ingestion pipeline MUST NOT advance to Phase 2 while any Phase 1 item has `PendingHumanResolution` status. Similarly, Phase 3 cannot begin while Phase 2 items are unresolved.

### What This Means

After Phase 1 completes:
- All `PlacementConfirmed` classes → promoted to canonical class records.
- All `PlacementRejected` classes → quarantined.
- All `PlacementAmbiguous` classes → `PendingHumanResolution`.

If ANY classes are `PendingHumanResolution`, the pipeline halts. The human resolves each ambiguous placement (selects a BFO node, or rejects the class). Only after ALL Phase 1 items are resolved does Phase 2 begin.

### Why Blocking

Phase 2 (property disambiguation) needs to know the BFO placement of every class referenced in property domains and ranges. If a class placement is unresolved, the property disambiguation sandbox cannot determine whether a property's domain/range types are consistent. Allowing Phase 2 to proceed with unresolved classes would produce unreliable disambiguation verdicts.

### Session-Level Tracking

The `fandaws:IngestionSession` record tracks the count of items per status at each phase gate:
- `fandaws:classesPlaced` — PlacementConfirmed count
- `fandaws:classesAmbiguous` — PlacementAmbiguous count (must reach 0 before Phase 2)
- `fandaws:propertiesCompiled` — Phase 2 compiled count
- `fandaws:propertiesQuarantined` — Phase 2 quarantined count

---

## Decision D-5: Ingestion Session Records — Permanent, Never Deleted

**Rule:** Per VD-5, `fandaws:IngestionSession` records are retained permanently in the Canonical Lane. They are never deleted even after all items are resolved.

### Session Record Shape

```javascript
{
  sessionId: "fandaws:session/2026-04-17/001",
  type: "IngestionSession",
  sourceOntology: "https://example.org/cco/1.4",
  sessionStartedAt: "2026-04-17T10:00:00Z",
  sessionCompletedAt: "2026-04-17T10:05:00Z",    // null if in progress
  compilationEpochAtCompletion: 45,
  classesIngested: 120,
  classesPlaced: 115,
  classesAmbiguous: 3,                             // initially; resolved to 0 before Phase 2
  classesRejected: 2,
  propertiesIngested: 80,
  propertiesCompiled: 72,
  propertiesMerged: 5,
  propertiesQuarantined: 3,
  axiomsIngested: 200,
  axiomsCompiled: 195,
  axiomsQuarantined: 5,
  autoMergeThreshold: 0.85
}
```

### Why Permanent

Ingestion sessions are audit records. They answer: "when was CCO ingested? How many classes were placed? How many were quarantined? What was the auto-merge threshold?" Deleting them erases provenance history.

---

## Decision D-6: Candidate Staging Records

**Rule:** Every external class and property enters the pipeline as a staging record in `fandaws:SourceAxiomGraph` before evaluation. Staging records are not part of the active canonical model.

### CandidateClass Shape

```javascript
{
  type: "CandidateClass",
  sourceIRI: "ex:Engine",
  sourceLabel: "Engine",
  sourceOntology: "https://example.org/ExternalOntologyX",
  candidateStatus: "PlacementConfirmed",     // or PlacementAmbiguous, PlacementRejected
  placementConfidence: 0.91,
  placementJustification: "Explicit rdfs:subClassOf bfo:MaterialEntity (0.6) + disjointness-consistent (0.31)",
  ingestedInSession: "fandaws:session/2026-04-17/001"
}
```

### CandidateRelation Shape

```javascript
{
  type: "CandidateRelation",
  sourceIRI: "ex:contains",
  sourceLabel: "contains",
  sourceOntology: "https://example.org/ExternalOntologyX",
  candidateDomain: "fan:class/.../spatial-region",
  candidateRange: "fan:class/.../material-entity",
  candidateTransitive: true,
  candidateStatus: "Pending",
  ingestedInSession: "fandaws:session/2026-04-17/001"
}
```

### Lifecycle

Staging records transition: `Pending` → evaluation → one of:
- `PlacementConfirmed` (classes) / `NoViolations` (axioms) → promoted to canonical
- `PlacementAmbiguous` / `DisambiguationRequired` → `PendingHumanResolution`
- `PlacementRejected` / `Quarantined` → quarantine store

---

## Decision D-7: Placement Confidence Thresholds

**Rule:** The Phase 1 sandbox routes placement decisions based on confidence:

| Confidence Range | Result |
|-----------------|--------|
| ≥ 0.7 (single consistent placement, or top candidate leads by ≥ 0.15 delta) | `PlacementConfirmed` — auto-promoted to canonical |
| ≥ 0.7 (multiple placements with confidence delta < 0.15) | `PlacementAmbiguous` — human must choose |
| < 0.7 (single placement) | `PlacementAmbiguous` — confidence too low for auto-promotion |
| No consistent placement | `PlacementRejected` — quarantined |

### Confidence Delta Rule

When the sandbox produces multiple candidate placements, the top two are compared. If their confidence scores differ by less than 0.15, neither is clearly dominant — the placement is `PlacementAmbiguous`. If the delta is ≥ 0.15, the highest-confidence placement wins and the class is `PlacementConfirmed`.

Example: MaterialEntity at 0.82 and Process at 0.71 → delta = 0.11 < 0.15 → Ambiguous. MaterialEntity at 0.85 and Process at 0.55 → delta = 0.30 ≥ 0.15 → Confirmed (MaterialEntity wins).

The 0.15 delta is a tunable parameter, not a hardcoded constant. It can be adjusted per ingestion session via a session option if experience shows it's too lenient or too strict.

### Why 0.7

Matches the Flagged tier boundary from C1 confidence tiers. Below 0.7 is "tentative" territory — the system doesn't trust its own judgment enough to auto-promote. Above 0.7 with a single clear winner means the heuristics agree and the placement is defensible.

---

## Clarification: Rename `_quarantineStore` to `_sourceAxiomGraph`

**Applied after SME review.** The `_quarantineStore` Map on StateAdapter is renamed to `_sourceAxiomGraph` to match VD-1 terminology. The Map holds staging records (CandidateClass, CandidateRelation), quarantine records (QuarantineRecord), and raw source axioms (RawSourceAxiom). Calling it `_quarantineStore` was misleading when it also holds healthy staging records.

This is a rename, not a restructuring. All Phase C2 quarantine scenarios continue to pass — they assert on record types and states, not on Map variable names.

---

## Clarification: BFO Re-Ingestion Auto-Re-Evaluation

**Applied after SME review.** VD-6 says all prior Phase 1 placement decisions must be re-evaluated on BFO version change. The re-evaluation is automatic, not manual:

1. BFO re-ingestion triggers the JavaScript sandbox to re-run on ALL previously placed classes using the new BFO hierarchy.
2. If re-evaluation produces `PlacementConfirmed` at ≥ 0.7 (same or different placement), the class stays canonical. If the placement CHANGED, the class is flagged with `fandaws:placementChanged: true` for optional review but is NOT set to `PendingHumanResolution`.
3. If re-evaluation drops confidence below 0.7, THEN the class is set to `PendingHumanResolution`.
4. The human reviews only the classes where the BFO update created actual ambiguity — not the vast majority whose placement is unchanged.

This prevents a BFO update from throwing thousands of previously confirmed classes back to manual review when only a handful are actually affected.

---

## Decision Audit Trail

| Decision | Description | Status |
|----------|-------------|--------|
| D-1 | Phase split: D1 (pipeline + class placement) + D2 (disambiguation + consistency) | LOCKED |
| D-2 | Ingestion pipeline is batch, not conversational — no interactive prompts | LOCKED |
| D-3 | Class placement sandbox: JavaScript validation, not Prolog | LOCKED |
| D-4 | Blocking rule: Phase N+1 cannot begin with PendingHumanResolution items | LOCKED |
| D-5 | Ingestion session records: permanent, never deleted (VD-5) | LOCKED |
| D-6 | Candidate staging records: CandidateClass and CandidateRelation shapes | LOCKED |
| D-7 | Placement thresholds: ≥0.7 single = Confirmed, multiple with delta < 0.15 = Ambiguous, <0.7 = Ambiguous, none = Rejected | LOCKED |
| — | Clarification: `_quarantineStore` renamed to `_sourceAxiomGraph` (VD-1 alignment) | LOCKED |
| — | Clarification: BFO re-ingestion auto-re-evaluates; only classes dropping below 0.7 go to PendingHumanResolution | LOCKED |
