# Phase D1 Implementation Handoff
**From:** FANDAWS Architect
**To:** FANDAWS Developer
**Date:** 2026-04-17
**Subject:** Bulk Ingestion Pipeline — Infrastructure + Class Placement

---

## What You're Receiving

Phase D1 is the first half of the bulk ingestion pipeline — the feature that enables Fandaws to ingest external ontologies (CCO, Gene Ontology, domain-specific OWL files) at scale. Phase D1 establishes the pipeline infrastructure and implements Phase 1 (class placement). Phase D2 (property disambiguation, consistency sandbox, namespace split) follows after D1 is confirmed.

1. **This cover memo**
2. **phase-d1-avc-bundle.json** — 23 scenarios
3. **phase-d-locked-decisions.md** — seven decisions covering both D1 and D2

---

## Why This Phase Is Different

Every prior phase (12, 13, B, C1, C2) operated on the conversational pipeline — a human or agent types an assertion, the system processes it, prompts fire, mutations happen. Phase D1 introduces a second entry point: the batch ingestion pipeline. External ontologies arrive as structured data (OWL/Turtle files), not as conversational utterances. The system processes them without interactive prompts, produces staging records, evaluates BFO placement with confidence scoring, and queues ambiguous items for human review.

This is the first time the system has two distinct processing pathways. The pathways share the same canonical model, the same execution lane, the same quarantine store, the same compiler, and the same pre-materialization checks. They differ in how they respond to issues: the conversational pipeline prompts; the ingestion pipeline queues.

---

## What's In Scope

| Component | What It Does |
|-----------|-------------|
| Ingestion session management | Session records with metadata, counts, permanent retention (VD-5) |
| Staging records | CandidateClass in SourceAxiomGraph. Not in canonical until promoted. |
| Phase 1 class placement | JavaScript sandbox evaluates BFO placement heuristics. Returns confidence + justification. |
| Placement lifecycle | PlacementConfirmed → promoted. PlacementAmbiguous → PendingHumanResolution. PlacementRejected → quarantine. |
| Blocking rule | Phase 2 cannot begin while Phase 1 has PendingHumanResolution items. |
| owl:equivalentClass | Promoted classes bridge Fandaws IRI to source IRI via owl:equivalentClass. |
| BFO version invalidation | BFO re-ingestion invalidates all prior placements (VD-6). |

## What's NOT In Scope (Phase D2)

Property disambiguation, merge records, auto-merge threshold, sub-property promotion, consistency sandbox, namespace split, `fan:RelationalQuality` reification, user-defined relation type classes.

---

## Key Decisions

**D-2 (Batch, Not Conversational):** The ingestion pipeline fires zero interactive prompts. No CC Path A/B. No MachineSignal. Violations produce staging record statuses or quarantine records. The human reviews after the pipeline completes, not during.

**D-3 (JavaScript Sandbox):** Class placement uses heuristic rules implemented as JavaScript functions. Not Tau Prolog. Four heuristic categories: explicit BFO superclass (high confidence), property-based inference (medium), label-based (low), disjointness consistency check (penalty). The sandbox returns `{ placement, confidence, justification }`.

**D-4 (Blocking Rule):** `PendingHumanResolution` blocks phase progression. `PlacementRejected` does NOT block — rejected classes go to quarantine and the pipeline continues. Only unresolved ambiguity blocks.

**D-7 (Placement Thresholds):** ≥0.7 single consistent placement = Confirmed. ≥0.7 with multiple candidates = Ambiguous. <0.7 = Ambiguous. No consistent placement = Rejected.

---

## New Runner Capabilities Needed

**`startIngestionSession` trigger.** Creates a session record.

**`ingestOntology` trigger.** Accepts a source ontology URL and an array of classes (each with IRI, label, optional superclass, optional properties). Runs the full Phase 1 pipeline. This is the primary trigger for most D1 scenarios.

**`stopAfterStaging` option on `ingestOntology`.** Pauses after staging records are created but before evaluation. Used by `staging-not-in-canonical` to verify isolation.

**`resolvePlacement` trigger.** Simulates a human selecting a BFO placement for an ambiguous class.

**`querySessions` trigger.** Returns all session records for inspection.

**`completedSessions` and `stagingRecords` setup fields.** Some scenarios pre-populate sessions or staging records that the trigger then acts on.

**`sequentialActions` trigger.** For the regression scenario that exercises both pipelines in sequence (conversational assertion followed by ingestion).

---

## Suggested Build Order

1. **Session management first.** Implement `IngestionSession` records on the StateAdapter. Implement `startIngestionSession` and `querySessions`. Run `session-created-with-metadata` and `session-retained-permanently`.

2. **Staging records.** Implement `CandidateClass` in `_quarantineStore` (or a dedicated staging area — the SourceAxiomGraph). Wire `ingestOntology` to create staging records. Run `staging-candidate-class-created` and `staging-not-in-canonical`.

3. **Placement sandbox.** Implement the JavaScript heuristic rules for BFO placement. Start with the explicit superclass heuristic (highest confidence, simplest logic). Run `placement-explicit-superclass-confirmed`.

4. **Placement lifecycle.** Add PlacementAmbiguous and PlacementRejected handling. Wire promotion to canonical (with `owl:equivalentClass`). Run remaining `placement-*` scenarios.

5. **Blocking rule.** Implement the phase gate that checks for PendingHumanResolution items before Phase 2 can begin. Run `blocking-*` scenarios.

6. **Batch behavior.** Verify zero prompts during ingestion. Run `batch-*` scenarios.

7. **BFO version change.** Wire BFO re-ingestion to invalidate prior placements. Run `bfo-*` scenarios.

8. **Regression last.** Run all 145 scenarios (25 + 24 + 27 + 26 + 20 + 23). All green.

---

## Architectural Note: Where Do Staging Records Live?

The spec says staging records go to `fandaws:SourceAxiomGraph`. In Phase C2, we implemented the `_quarantineStore` Map as the edge-canonical equivalent of SourceAxiomGraph. Staging records (CandidateClass, CandidateRelation) are a DIFFERENT record type from QuarantineRecords, but they live in the same store — per VD-1, SourceAxiomGraph contains exactly three record types: staging, quarantine, and raw axioms.

The implementation choice: either add CandidateClass records to `_quarantineStore` (since it IS the SourceAxiomGraph equivalent) or create a separate `_stagingStore` Map. Using `_quarantineStore` is spec-compliant (VD-1 says they coexist). Creating a separate Map is cleaner for querying. Either approach satisfies the AVC scenarios — the scenarios assert on record existence and types, not on which Map they live in.

My recommendation: use `_quarantineStore` as the SourceAxiomGraph equivalent. Add CandidateClass records to it with their `type: "CandidateClass"` field. Query by type when you need staging records only. This keeps the architecture aligned with VD-1 and avoids proliferating Maps on the StateAdapter.

---

## What "Done" Means

```
Bundle: phase-12-avc-bundle.json (v2) — 25 passing
Bundle: phase-13-avc-bundle.json (v3) — 24 passing
Bundle: phase-b-avc-bundle.json  (v2) — 27 passing
Bundle: phase-c1-avc-bundle.json (v1) — 26 passing
Bundle: phase-c2-avc-bundle.json (v1) — 20 passing
Bundle: phase-d1-avc-bundle.json (v1) — 23 passing

Total AVC: 145 passing, 0 failing
```

Spot-check transcripts: `placement-explicit-superclass-confirmed` (the core placement proof), `blocking-phase2-blocked-by-ambiguous` (the phase gate), and `batch-no-conversational-prompts` (the two-pipeline isolation).

— FANDAWS Architect
