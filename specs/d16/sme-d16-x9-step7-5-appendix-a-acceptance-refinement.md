# SME-D16-X9 Step 7.5 — Appendix A: Acceptance Refinement (Phase 1 Review post-fix)

**Status:** SUPPLEMENTARY 2026-04-27. Non-disruptive clarification to the Step 7.5 in-cycle maintenance scoping. Developer is already in implementation; this appendix refines acceptance language without changing repair scope.
**Owner:** SME, post-PO clarification cycle 2026-04-27.
**Consumes:** Step 7.5 maintenance scoping (in-session; no separate memo file); Aaron's PO clarification 2026-04-27 ("I should NOT see ANY classes other than the root classes of the prov-o ontology in Phase 1 is that correct?"); SME response confirming Reading B as the accurate framing.
**Consumed by:** developer's Step 7.5 implementation (acceptance criteria sharpening, NOT repair-scope change); SME post-Step-7.5 review.
**Scope fence:** acceptance-language refinement only. Does NOT change Gap 1 / Gap 2 repair scope, single-commit pattern, or 2-4 day runway estimate.

---

## A.1 Why this appendix exists

PO clarification surfaced ambiguity in the original Step 7.5 acceptance language: "Only root classes... should require analyst resolution" was correct in intent but underspecified on whether descendants render in the Phase 1 Review table at all.

Two readings:

- **(A) Filter descendants out of the table entirely.** Phase 1 Review shows only ~7 roots; ~24 descendants invisible. **NOT what the spec supports** — Invariant W-2 (UI never simplifies evidence) requires complete evidence catalog; report template Appendix A.9 captures placement per-class, not per-root; Pass 2 disagreement analysis compares FANDAWS placement vs human placement per-class.
- **(B) Render all classes; only roots BLOCK Run-Phase-2.** Phase 1 Review shows all 31 classes; descendants auto-confirm via NA-1.1 cascade post-fix; pending resolutions reduce to ~3-5 genuinely-ambiguous root classes. **What NA-1.1 (D1.6-L25) is designed to deliver.**

Reading B is locked. This appendix sharpens Step 7.5 acceptance language accordingly.

## A.2 Refined Step 7.5 acceptance criteria

Replacing the "Only root classes require resolution" framing in the original Step 7.5 scoping with the following concrete acceptance language:

### A.2.1 Phase 1 Review table population

- **All 31 PROV-O classes appear in the Phase 1 Review table.** No filtering. Every CandidateClass staging record renders per spec §4.2 acceptance criteria.
- Per Invariant W-2: complete evidence catalog preserved.

### A.2.2 Cascade via NA-1.1 inheritance

- **Most descendants show `PlacementConfirmed`** with placement inherited from parent via NA-1.1 cascade post-fix.
- DP-2 record on descendant row expansion shows the cascade chain (`causedBy` references parent's reconciliationHistory entry per F1 immediate-predecessor semantic; X3 §4.2 / X6 §3.3 architectural lock).
- Analyst can spot-check expansion to verify NA-1.1 fired correctly per Invariant W-2 evidence-density discipline.

### A.2.3 Pending resolutions reduced to root set

- **`PendingHumanResolution` reduced to root classes only** — likely 3-5 root classes whose BFO placement is genuinely ambiguous from base heuristics.
- Per test plan §4.1 expected outcomes:
  - `prov:Activity` → expected confident `bfo:Process` placement; should auto-confirm at root level.
  - `prov:Entity` → expected to route through disambiguation; likely PendingHumanResolution.
  - `prov:Agent` → genuinely contested in literature; likely PendingHumanResolution.
  - `prov:Bundle` → "the hardest case" per test plan; PendingHumanResolution expected.
  - `prov:Influence` → likely PendingHumanResolution; analyst's read is GenericallyDependentContinuant per dry-run conversation.
  - `prov:Plan` → property-signal driven; possibly PendingHumanResolution.
  - `prov:Location` → already shows `SpatialRegion` 0.30 in dry run; auto-confirmation likely if heuristic improves.
  - `prov:Role` → already shows `RealizableEntity` 0.30; likely auto-confirms.
  - `prov:InstantaneousEvent` → already shows `Process` 0.40; possibly auto-confirms.
  - `owl:Thing` → not a PROV-O class proper; should auto-confirm or be excluded from analyst-resolution set.

Specific per-root counts depend on heuristic behavior post-fix; the architectural commitment is that **descendants do NOT show PendingHumanResolution** (they cascade from parent). Analyst's resolution work-burden drops from 12-of-31 to ~3-5-of-31.

### A.2.4 Run-Phase-2 button gating

- **Run-Phase-2 button blocks only on root-resolution set.** Descendants in PlacementConfirmed (via inheritance) do not block.
- Once analyst resolves the 3-5 root PendingHumanResolution items, Run-Phase-2 enables per W-4.6 acceptance.

### A.2.5 Expected dry-run experience post-fix

When Aaron re-runs Step 8 dry run post-Step-7.5:

1. Upload `prov-o.owl` → 31 staging records created.
2. Phase 1 Review renders all 31 classes (per W-4.1).
3. Status distribution roughly:
   - ~24 descendants: `PlacementConfirmed` via NA-1.1 cascade (after parent resolved or auto-confirmed).
   - ~3-5 roots: `PendingHumanResolution` requiring analyst input.
   - Possibly 1-2 roots: `PlacementConfirmed` directly via base heuristics if confident (e.g., `prov:Activity` → `bfo:Process`).
4. Analyst resolves the small root set with justifications per W-4.4 / W-4.5.
5. As each root resolves, descendants update from inheritance state to confirmed state via NA-1.4 reactive cascade (X3 §3.4 / X4 §3.3).
6. Run-Phase-2 unblocks; advance.

### A.2.6 Edge cases worth surfacing during dry run

- **Multi-inheritance contradiction (X8 SWC scenario equivalent at workbench layer):** if any PROV-O class shows multiple structural ancestors that contradict (rare in PROV-O specifically; possible in larger ontologies), the SWC `⚠` badge per Step 3's `detectSWCReasons` fires on the row header. Analyst sees the anomaly without expanding.
- **Cascade failure on descendant:** if NA-1.1 inheritance produces an `Inconsistent` disposition on a descendant due to disjointness with parent's category, descendant shows Inconsistent — load-bearing signal that the parent placement was wrong. Bubbles up; analyst revisits parent.
- **`owl:Thing` handling:** OWL-2 universal class; not BFO-relevant. Either exclude from CandidateClass staging entirely (parser-side filter) or auto-route to NotApplicable (axiom-poor with no inheritable parent). Either approach acceptable; developer judgment at implementation.

## A.3 Repair scope unchanged from original Step 7.5

This appendix adds NO new repair work to Step 7.5:

- **Gap 1 fix** (ancestorChain threading) → produces Reading B behavior automatically. Once parsed.classes[].superclass threads through to placement-sandbox + NA-1.1 cascade fires per existing X-arc disciplines, descendants auto-confirm as a natural consequence.
- **Gap 2 fix** (CandidateRelation generation from parsed.properties) → unchanged.

The appendix sharpens what Aaron will see post-fix, NOT what the developer needs to build. Developer continues current implementation per original Step 7.5 scoping.

## A.4 Test refinement (additive to original Step 7.5 test scope)

The original Step 7.5 scoping listed:
- Subclass inheritance fixture test (PROV-O-shape ontology with 3-level subclass chain).
- CandidateRelation generation test.
- 70/70 D1.6 AVC + bundle v6 SWC regression.
- Steps 2-7 acceptance scenarios regression.

Add one supplementary assertion to the subclass inheritance fixture test:

- **Assertion: descendant rows show `PlacementConfirmed` post-cascade, not `PendingHumanResolution`.** Verifies NA-1.1 cascade reaches descendant resolution state, not just base-heuristic-only output. Locks the work-burden-reduction architectural payload.

Other tests unchanged.

## A.5 Acceptance gate language for Step 7.5 commit message

Suggested language (developer's choice on adoption):

> Step 7.5 — In-cycle maintenance: ancestorChain threading + CandidateRelation generation
>
> Closes Gap 1 (parsed.classes[].superclass not threaded to placement sandbox) +
> Gap 2 (parsed.properties never reach Phase 2). Post-fix: subclass inheritance
> via NA-1.1 cascade reduces analyst resolution work-burden from 12-of-31 to ~3-5
> root classes for PROV-O; descendants auto-confirm via inheritance per
> D1.6-L25 + X3 §4.2 / X4 §3.3 architectural locks. Phase 2 Review surfaces ~30
> CandidateRelation rows from parsed.properties. 70/70 D1.6 AVC + bundle v6 SWC
> preserved. Steps 2-7 acceptance preserved. Per X8 in-cycle expansion precedent;
> X9 stays one cycle name; SME-D16-X9 Appendix A acceptance refinement honored.

## A.6 References

- Step 7.5 maintenance scoping (in-session, prior to this appendix).
- `specs/d16/sme-d16-x9-workbench-v02-integration-memo-v1.md` §3.1 (caller-contract: ancestorChain transitively closed).
- `specs/d16/sme-d16-x4-nc-inference-integration-memo-v1.md` §3.3 (ancestorChain transitive-closure caller-contract grounding).
- `specs/d16/sme-d16-x3-pipeline-orchestrator-memo-v2.md` §4.2 (F1 causedBy immediate-predecessor semantic for cascade).
- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` §3.3 (multi-inheritance contradiction-wins precedence; relevant for cascade edge cases).
- `docs/architecture/workbench-v0.2-spec.md` §4.2 (Phase 1 Review structure); Invariant W-2 (UI never simplifies evidence).
- `docs/architecture/fandaws-provo-test-plan.md` §4.1 (expected outcomes per PROV-O class).
- `feedback_proof_discipline.md` (honest-admission for PendingHumanResolution counts vs work-burden distribution).

---

**End of Appendix A.**

Step 7.5 implementation continues per original scoping. This appendix lands as non-disruptive supplement; developer reads at their convenience for acceptance-language clarity. Acceptance verification post-Step-7.5-landing references this appendix for refined criteria.
