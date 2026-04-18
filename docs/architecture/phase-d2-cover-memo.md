# Phase D2 AVC Bundle — Handoff Cover Memo

**Bundle:** `phase-d2-disambiguation-consistency-sandbox` (v1)
**Authored:** 2026-04-17
**Status:** Awaits implementation
**Parent spec:** FANDAWS v2.1 + Phase D2 Specification v1.0 (SME-approved)
**Dependency:** Phase D1 must be complete and green. D2 consumes D1's canonical class records, Phase 1 placement outputs, and quarantine store infrastructure as fact-base input.

---

## Scope

Phase D2 closes the bulk-ingestion pipeline identified in FANDAWS v2.1 §12 Phase 3. It delivers the three remaining components that D1 deliberately left unbuilt:

1. **Property disambiguation (Phase 2 of the ingestion pipeline).** Fingerprint-based matching of external relations against the canonical relation type inventory, with auto-merge, disambiguation-window, novel-promotion, and sub-property-promotion routing. JavaScript-only; no inference engine required.

2. **Merge records.** Permanent audit trail for every merge action (auto and human-confirmed), carrying the `owl:equivalentProperty` bridge between the external IRI and the execution-property IRI.

3. **Consistency sandbox (Phase 3 of the ingestion pipeline).** Tau Prolog rule engine evaluating candidate axioms against a fact-serialized snapshot of the canonical graph. Produces genuine Prolog derivation traces in every FailureTrace. Bounded by a fixed inference step cap.

4. **Namespace split on relation promotion.** When a candidate is merged or newly promoted, the canonical relation type class gets a fresh `fandaws:class/relation/UUID/label` IRI. The external IRI is preserved only via `owl:equivalentProperty`, bridging to the `rel:` execution property. Three namespaces coexist (external, canonical schema, execution) with one named-to-named bridge each.

D2 is purely additive to v2.1. No parent-spec rule is modified, weakened, or superseded.

---

## Locked Decisions Recap

The bundle contains 16 locked decisions (D-8 through D-20 plus three clarifications). The ones most likely to matter for implementation sequencing:

**D-8 (engine topology).** Phase 2 is JavaScript. Phase 3 is Tau Prolog. Both run edge-canonical with no backend. The engine boundary is at the Phase 2→3 handoff, not scattered through the pipeline.

**D-9, D-11 (fingerprint math).** Weight vector is hardened: structural physics ≥ 0.70, lexical ≤ 0.10. The 0.60 disambiguation floor is arithmetic-derived — a Domain+Range+Subcategory match scores 0.75 (above floor, into human review), a Domain+Lexical-only match scores 0.40 (below floor, into Novel Promotion). The floor cutoff is exactly where the two routings diverge.

**D-12, D-14, D-15 (sandbox invariants).** Tau Prolog inference step cap is 10,000, fixed per session, never adaptive. Fresh session per Phase 3 run. Subclass reflexive-transitive closure is asserted as ground facts — violation rules never recurse on `subclass/2` at query time. Together these preserve Invariant I-2 on the Prolog side.

**D-13 (sandbox purity).** Sandbox never mutates the canonical graph. Routing to quarantine/NoViolations happens in JS after the Prolog session returns, not inside the engine. Verified by content-hash comparison (scenario 23).

**D-16 (trace authenticity).** `prologTrace` is genuine engine output with Call/Exit/Redo entries, not a hand-rolled declarative summary. Parseable back as Prolog source. Scenario 22 enforces this at acceptance.

**D-17 (namespace split).** External IRI never enters the canonical taxonomy directly. Fresh `fandaws:class/relation/UUID/label` IRI is minted. `owl:equivalentProperty` bridges source IRI to the compiled `rel:` execution property — which is a named-to-named assertion, never to `owl:topObjectProperty` (D-19, PD-9).

**D-18 (blocking).** Phase 3 does not begin while any Phase 2 item is in `PendingHumanResolution`. Sequential within a session. Parallel execution is a D4 question.

---

## Scenarios — Shape of Coverage

33 scenarios total, organized in four bands:

**Band 1 — Phase 2 Property Disambiguation (13 scenarios).** Covers the five tests Aaron specified (T-PD-1 through T-PD-5) plus seven additions requested implicitly by the "merge records" and "namespace split" scope: margin-blocks-near-tie (PD-4 safeguard), valid sub-property promotion (PD-6 positive case), PromoteAsNewRelation with namespace split (D-17), full MergeRecord structure, MergeRecord permanence after deprecation (PD-8), top-property equivalence rejection (PD-9), weight vector bounds enforcement (PD-10), and the schema-only fingerprint invariant (PD-1 / Invariant I-1).

**Band 2 — Phase 3 Consistency Sandbox (15 scenarios).** Covers the six tests Aaron specified (T-PS-1 through T-PS-6) plus nine additions for completeness: the two missing rule-catalog entries (PS-4c Domain Mismatch, PS-4e Disjointness Contradiction), and seven sandbox-discipline tests — Prolog trace authenticity (AC-D2-17), graph purity (PS-1 via hash check), session lifecycle (PS-2), subclass closure as ground facts (PS-9), unrecognized axiom quarantine (PS-3), inference cap immutability (PS-8), and suggestedRepair specificity (PS-7).

**Band 3 — Composition and Blocking (3 scenarios).** Sequential-execution contract (D2-1), session summary completeness (D2-2), and the conversational-quarantine re-evaluation path (v2.1 §3.8.4).

**Band 4 — Regression and Boundary Conditions (2 scenarios).** BFO mid-session version change halts (VD-6 in D2 context), and the conversational pipeline remains unaffected by D2 deployment.

---

## Acceptance Targets at a Glance

If these ten scenarios pass, D2 is structurally sound. Everything else is reinforcement:

| # | Scenario | Why load-bearing |
|---|---|---|
| 1 | `fingerprint-schema-only` | Invariant I-1; without it the whole pipeline is miscategorized |
| 6 | `disambiguation-disjoint-hard-floor` | PD-2; the homonym-with-different-physics safeguard |
| 7 | `promote-as-sub-property-narrowing-rejected` | Invariant I-3; disambiguation panel not an attack surface |
| 15 | `sandbox-type-disjointness` | Invariant I-2; the archetypal BFO violation caught |
| 20 | `sandbox-horn-unbounded` | PS-8; proves no runaway browser sessions |
| 22 | `sandbox-prolog-trace-is-engine-output` | D-16; genuine trace, not summary |
| 23 | `sandbox-purity-no-canonical-mutation` | PS-1; sandbox never touches canonical |
| 25 | `sandbox-subclass-closure-asserted-as-facts` | PS-9; keeps Invariant I-2 intact under Tau Prolog |
| 29 | `blocking-phase3-blocked-by-phase2-pending` | D2-1; sequential-execution contract |
| 33 | `reg-conversational-check-unchanged` | No collateral damage to D1 behavior |

---

## What D2 Does NOT Cover

For clarity when reviewing the scenarios — the following are intentionally out of scope and remain for later phases:

- **Dual-lane (Canonical / Execution) separation** — D3. D2 operates on the existing D1 single-lane in-memory graph with the fact-base derivation running in JS.
- **Compilation epoch machinery** — D3. The integer counter is already present (per v2.1 §2.4.3); the stale detection and retraction cascade that reads it is D3 work.
- **Incremental fact-base rebuilding** — D3/D4, profile-gated. PS-2 mandates fresh rebuild every run. Optimization only after profiling.
- **Named-graph / quad-store persistence** — D4. Edge-canonical in-memory structures remain sufficient through D3.
- **Multi-service FNSR consumption** — D4.
- **TagTeam-origin provenance weighting** — D4 or later. D2 is source-agnostic; TagTeam candidates are ingested the same as any other external relation source.

If an implementer finds themselves needing any of the above to make a D2 scenario pass, something has been miscategorized. Stop and raise it before proceeding.

---

## Implementation Sequencing Suggestion

The bundle permits any test order, but there's a natural build-up:

1. **Start with the fingerprint machinery** (scenarios 1, 2, 4, 5, 6). These exercise Phase 2 end-to-end with no Tau Prolog involvement and no merge records. If scoring is wrong, nothing downstream works.
2. **Add routing logic** (scenarios 3, 7, 8, 9). Margin rule, sub-property narrowing (positive and negative), and promotion with namespace split. These verify the four human resolution actions.
3. **Add merge records and validation** (scenarios 10, 11, 12, 13). Structural and permanence invariants; weight-vector validation at session init.
4. **Stand up Tau Prolog integration** (scenario 14 first — the clean-axiom path). Proves engine consulting works end-to-end with no violations.
5. **Add the rule catalog** (scenarios 15, 16, 17, 18, 19, 20). One rule at a time. Each rule delivers one violation category.
6. **Harden trace production** (scenarios 21, 22). FailureTrace completeness and Prolog trace authenticity.
7. **Verify session discipline** (scenarios 23, 24, 25, 26, 27, 28). Purity, freshness, closure discipline, unknown-type quarantine, cap immutability, repair specificity.
8. **Compose the two phases** (scenarios 29, 30, 31). Blocking, session record, conversational re-evaluation.
9. **Regression pass** (scenarios 32, 33). BFO change behavior and conversational pipeline unchanged.

---

## Handoff Statement

This bundle is the v1 acceptance catalog for Fandaws-Sentinel Phase D2. The scenarios in `phase-d2-avc-bundle.json` are the contract between the Phase D2 specification (v1.0, SME-approved) and the D2 implementation. No scenario is provisional; all 33 are authored for execution.

Proceed to implementation against the test harness. The scenarios are designed to be codified in the same JavaScript test infrastructure used for Phase D1 — run in a browser with no backend (Karma or plain page) and in Node.js against a file-based canonical graph. Tau Prolog should be pinned to a specific version in the test environment so trace output is stable across runs; the pinned version is recorded per session as `fandaws:tauPrologVersion`.

Per test-first methodology, the scenarios themselves should be codified before the first line of D2 implementation code.

— end —
