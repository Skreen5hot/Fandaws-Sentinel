# SME-D16-X9 — Workbench v0.2 Ingest Mode Integration Scoping

**Status:** LOCK-IN-PROGRESS 2026-04-25. Four PO routing decisions locked 2026-04-25: (1) full implementation scope (X9-full, NOT X9-bridge — see §2); (2) PROV-O test plan contained substitute (P-3 — plan absent from tree per verified search; SME-drafted procedure at §5.2 below); (3) single cycle with rolling SME reviews per W-D-13 panel landing (R-B — see §8); (4) cycle-standard developer pre-proposal first (no tracer-bullet implementation — see §8). Standard cycle proceeds: this memo → developer pre-proposal + implementation plan → PO pre-code confirmation → implementation per W-D-13. **Cycle character differs from X3-X8.** X3-X8 cycles locked novel architectural decisions; X9 is INTEGRATION SCOPING + IMPLEMENTATION — workbench-v0.2-spec.md is implementation-ready with 22+ locked decisions, and SME's role is to bridge that spec's assumptions with post-X8 D1.6 architecture.

**PO load-bearing context (2026-04-25 routing message):** *"I feel as though I am flying blind without the ability to directly test."* X9 closes the analyst-facing testing gap. Aaron-executable contained substitute procedure at §5.2 enables direct testing as soon as Sessions+Upload panel lands; no need to wait for AC-W-PROV-O dry run.
**Owner:** SME (PO routed Option G post-X8 v6 ACK 2026-04-25). PO-value framing: "Can I ingest real PROV-O through the Workbench?" — this cycle is the answer.
**Consumes:** `docs/architecture/workbench-v0.2-spec.md` v1.0 (719 lines, authored 2026-04-18 — predates X3-X8 D1.6 arc); `docs/architecture/workbench-v0.2-cover-memo.md` (205 lines); `docs/architecture/workbench-v0.2-avc-bundle.json` (60 scenarios); `project_d16_phase_d2_consistency_sandbox_async_defect.md` (banked Phase D2 maintenance trigger); X3-X8 closure context (orchestrator surface, dispatcher integration, prologSession L2 lifecycle, bundle v6 SWC behavior).
**Consumed by:** developer X9 implementation cycle per W-D-13 sequencing (mode switcher → Sessions+Upload → Phase 1 Review → Phase 3 Review → Phase 2 Review → Session Summary → cross-panel → AC-W-PROV-O dry run); future v0.3 cycles consuming X9's deliverables as the new baseline.
**Scope fence:** Workbench v0.2 Ingest Mode UI per workbench-v0.2-spec.md as authoritative. **Integration-bridging scope** for X-arc adjacencies: prologSession lifecycle attachment to UI flow; §9.3 Phase 1/2/3 Review panel adaptations to surface DP-2 record fields; dispatcher invocation under W-D-7 "thin UI layer" discipline; Phase D2 consistency-sandbox defect escalation trigger; PROV-O test plan artifact gap. **Out of scope:** new architectural decisions (workbench-v0.2-spec.md is the architectural lock); v0.3+ deferred features per spec Appendix B; Pass 2 calibration analysis (post-acceptance-gate).

**Tag legend:**
- **LOCKED-FROM-SPEC** — workbench-v0.2-spec.md authoritative; SME confirms applicability post-X8.
- **LOCKED-FROM-PRINCIPLE** — derivable from existing invariants + X-arc closures.
- **SME-PROPOSED — PENDING-DEVELOPER-ACK** — integration-bridge depends on code shape developer verifies.
- **OPEN** — explicit deferral or escalation trigger.

---

## Load-bearing context

**X9 closes the Aaron-facing PO-value gap that has been the architectural target since the original Phase 1 closeout.** From Aaron's PO question early in the X-arc: *"What do I need to do to validate the value delivered in Phase 1. Can I go to the workbench and ingest the real Prov-o?"* The honest answer through X3-X8 was no — first because the orchestrator wasn't wired (X3); then because reasoning was hollow (X4-X6); then because dispatcher integration was unwired (X7); then because synthetic allowlists masked behavior (X8). Each cycle closed one layer.

X9 closes the last layer: real `.owl` ingestion through the UI, dispatcher path consumed, DP-2 records surfaced, AC-W-PROV-O acceptance gate satisfied. **Aaron at the keyboard completes PROV-O Pass 1 through the UI** — the W-D-8 acceptance criterion is concrete and binary.

**Critical scope-character difference from X3-X8.** Those cycles' SME memos locked novel architectural decisions per design-sketch deliberation. X9's architectural decisions are already locked in workbench-v0.2-spec.md (authored 2026-04-18, predating the X-arc). SME's job for X9 is **integration bridging** — the spec assumes "thin UI layer over existing pipeline" (W-D-7), but the "existing pipeline" reshaped substantially across X3-X8. The bridge is what this memo specifies.

---

## Executive summary

**LOCKED-FROM-SPEC (workbench-v0.2-spec.md authoritative; X9 confirms post-X8 applicability):**

- Six-panel structure per W-D-5: Sessions / Upload / Phase 1 Review / Phase 2 Review / Phase 3 Review / Session Summary.
- Workspace-not-wizard discipline per Invariant W-1.
- UI-never-simplifies-evidence per Invariant W-2 (six-dim fingerprint, verbatim Prolog traces, three-decimal margins).
- Visible-invariant-enforcement per Invariant W-3 (PD-6 greying, PD-9 rejection, PD-10 weight validation, PS-1 hash equality).
- Build sequencing per W-D-13: mode switcher → Sessions+Upload → Phase 1 Review → Phase 3 Review → Phase 2 Review → Session Summary → cross-panel → AC-W-PROV-O.
- Thin-UI-layer-over-existing-pipeline per W-D-7.
- 60 AVC scenarios (20 programmatic / 20 manual / 20 hybrid per W-D-22).
- Edge-canonical preservation per §1.4: localStorage persistence, no backend, browser-thread Tau Prolog (with chunked yielding per W-TY-1), n3.js + rdfxml-streaming-parser bundled (W-D-21), Tau Prolog bundled-no-CDN (W-D-20).
- Acceptance gate AC-W-PROV-O: PROV-O Pass 1 executable end-to-end through UI.

**LOCKED-FROM-PRINCIPLE (X-arc bridges; not in spec but derivable):**

- prologSession lifecycle attaches to **Sessions panel "New Ingestion Session" action** (init at session creation) and **"Finalize Session" action** (teardown at session completion) per X6 §6.2 L2 caller-owned lifecycle. The Sessions/Upload/Session Summary panels are the natural lifecycle anchors.
- DP-2 record fields surface in Phase 1/2/3 Review panels per D1.6 §9.3 + bundle v6 amendment behavior. Specifically: explanation / provenance / reproducibilityHash visible at appropriate points.
- DUAL-MODE seam discipline (X8 §4.2 Option I): dispatcher path requires prologSession; legacy iteration-mechanics path stays for SYNTHETIC_ITERATION scenarios. UI invokes dispatcher path only.
- Throw-not-warn discipline at integration boundaries — `DispatcherContractViolationError`, `PrologSessionContractViolationError` propagate to UI as visible errors (not silent fallbacks).
- 70/70 D1.6 AVC + bundle v6 SWC scenario must hold across X9 implementation (regression preservation).

**SME-PROPOSED — PENDING-DEVELOPER-ACK (4 integration questions for developer pre-proposal):**

- §3.1 prologSession lifecycle attach point — Sessions/Upload init, Session Summary teardown? Confirm against actual session creation flow in v0.1 framework.
- §3.2 DP-2 record surfacing strategy in Phase 1/2/3 Review panels — what exactly displays where? §9.3 of D1.6 references the requirement; X9 specifies it.
- §3.3 W-D-7 "no new API layer" discipline preservation — given the X3-X8 reshape, is direct `pipelineOrchestrator.orchestrate*()` invocation sufficient, or does some thin coordinator emerge?
- §3.4 Bundle v6 SWC scenario behavior in Phase 1/2/3 Review panels — when the dispatcher returns Plausible-via-multi-inheritance-contradiction-wins, what's the analyst-facing surfacing?

**OPEN (escalation triggers; not blocking X9 entry):**

- §4 Phase D2 consistency-sandbox.js async defect (banked at `project_d16_phase_d2_consistency_sandbox_async_defect.md`) — if Phase 3 Review implementation surfaces the defect at PROV-O scale, Phase D2 maintenance cycle priority escalates.
- ~~§5 PROV-O Calibration Study test plan absence~~ — **RESOLVED 2026-04-25 via P-3 routing.** Contained substitute procedure at §5.2; AC-W-PROV-O satisfied by completing §5.2 procedure. Full test plan defers to v0.3+.

**Scope OUT (carried forward from spec Appendix B):** alignment comparison UI; live weight vector visualization; re-run-with-tweaked-config dedicated button; per-axiom Phase 3 re-run; batch resolution; import-closure handling (W-IM-1); multi-user; full WCAG AA; automated browser testing; Web Worker Tau Prolog; large-ontology performance tuning. All deferred to v0.3+.

**Next action:** developer ACK + implementation plan addressing §3.1-§3.4 + sequencing per W-D-13.

---

## 1. Problem statement

Workbench v0.2 spec is implementation-ready (W-D-1 through W-D-22 locked; 60 AVC scenarios; six panels with detailed acceptance criteria). The spec's W-D-7 "thin UI layer over existing pipeline" assumes the D1/D2 pipeline exists with stable invocation surfaces. **X3-X8 reshaped that surface substantially:**

- X3 introduced `pipeline-orchestrator.js` with 5 entry points + caller-owned adapter (§3.9.1 explicit-per-call).
- X4-X6 added the NC dispatcher with trichotomy partition + Tau Prolog substrate + 6 OWL-DERIVED helpers.
- X7 wired OWL-DERIVED helpers into the dispatcher with prologSession L2 caller-owned lifecycle.
- X8 retired SYNTHETIC_NC_SATISFACTION; collapsed TEMPORARY MIGRATION SUPPORT seam; surfaced first SWC and bundle v6.

The spec is unaware of these reshapes (authored 2026-04-18 vs X-arc beginning 2026-04-24). **X9's job is the bridge:** preserve the spec's UI architecture exactly as locked while specifying the integration touchpoints where workbench-v0.2 meets post-X8 D1.6.

The bridge has four touchpoints that need explicit specification:

1. **prologSession lifecycle in UI flow.** Spec doesn't address Tau Prolog session management; W-D-7 "thin UI layer" implies the UI just invokes existing functions. Post-X6, the dispatcher requires prologSession passed per-call. UI is the caller; UI owns the lifecycle.
2. **DP-2 record surfacing.** Spec discusses CandidateClass / CandidateRelation / CandidateAxiom + analyst justifications. Post-X3 + X8, the pipeline emits DP-2 canonical records (explanation/provenance/reproducibilityHash). §9.3 of D1.6 spec references panel adaptations; this memo specifies them.
3. **Dispatcher invocation pattern under W-D-7.** Direct `evaluateNCSatisfaction(...)` calls? Through `orchestrateThreeStateTerminal(...)` and siblings? Or thin coordinator?
4. **SWC scenario behavior surfacing.** When the dispatcher produces Plausible-via-contradiction-wins (X8 SWC pattern), how does the UI surface the multi-inheritance modeling-anomaly to the analyst?

---

## 2. Scope per spec — confirmation post-X8

Six-panel structure unchanged. AC-W-PROV-O unchanged. Build sequencing unchanged. The spec's locked decisions remain intact post-X8. SME confirmation:

| Spec lock | X8-aware verdict |
|---|---|
| W-D-5 six-panel structure | LOCKED-FROM-SPEC — no X-arc change affects panel count or structure |
| W-D-7 thin UI layer | LOCKED-FROM-SPEC — preserved; X-arc reshape changes "existing pipeline" surface but doesn't introduce new API layer requirement |
| W-D-13 build sequencing | LOCKED-FROM-SPEC — Phase 3 Review before Phase 2 Review remains correct given dispatcher integration; Tau Prolog substrate is shared |
| W-D-8 acceptance gate | LOCKED-FROM-SPEC — AC-W-PROV-O concrete and binary; X9 lands when Aaron completes Pass 1 through UI |
| 60 AVC scenarios | LOCKED-FROM-SPEC — programmatic/manual/hybrid split preserved per W-D-22 |
| Edge-canonical | LOCKED-FROM-SPEC — preserved across X-arc; bucket-c-prolog.js maintains edge-canonical posture |

§9.3 DP-2 panel adaptations: spec touches this lightly via Invariant W-2 (UI never simplifies evidence) and §11 parent-spec integration. X9 specifies the bridge per §3.2 below.

---

## 3. Integration touchpoints — SME-proposed bridges

### 3.1 prologSession lifecycle attach point

**SME-PROPOSED — PENDING-DEVELOPER-ACK.** Per X6 §6.2 L2 lock, prologSession is caller-owned with explicit-per-call passing to dispatcher. The UI is the caller. Suggested attach pattern:

- **Init:** Sessions panel "New Ingestion Session" button creates an IngestionSession record AND awaits `initBucketCPrologSession({stepCap: 10000})`. Session record stores prologSession reference (in-memory only; not localStorage-serialized — Tau Prolog session is not JSON-serializable).
- **Per-CAU evaluation:** Phase 1/2/3 Review panels and the underlying handlers pass prologSession through to `pipelineOrchestrator.orchestrate*()` via context. For Phase 2 disambiguation and Phase 3 consistency, separate D2 mechanisms (consistency-sandbox.js) own their own Tau Prolog handles per Decision D-12 — this prologSession is specifically for D1.6 Phase 1 NC inference.
- **Teardown:** Session Summary "Finalize Session" action awaits `teardownPrologSession(prologSession)` before navigating. Mid-session navigation away (Sessions panel) does NOT teardown — session stays alive for return navigation.
- **Page reload semantics:** prologSession is in-memory only. Reload destroys it. On reload, if user navigates back to a session whose phase requires dispatcher invocation (e.g., re-running Phase 1 review with new resolutions), the UI re-initializes prologSession transparently. **W-SP-2 page-reload state restoration is preserved for IngestionSession + staging records; prologSession re-initialization is implicit.**

**Architectural pattern:** parallels the v0.1 framework's `WorkbenchStateManager` lifecycle (per spec §12.1). prologSession is session-scoped state managed by the Sessions panel, parallel to how v0.1 manages adapter state. Developer verifies the attach pattern matches v0.1 framework conventions; refines at implementation plan.

### 3.2 DP-2 record surfacing strategy in Phase 1/2/3 Review panels

**SME-PROPOSED — PENDING-DEVELOPER-ACK.** Spec doesn't deeply specify §9.3 DP-2 panel adaptations. Suggested surfacing per panel:

**Phase 1 Review (per spec §4):**
- Each CandidateClass row already shows placement / confidence / status / justification.
- **Add expandable "DP-2 Record" subsection** within row expansion (alongside justification): explanation summary (disposition + reason), provenance summary (mechanism + causedBy chain if cascade triggered), reproducibilityHash (truncated SHA-256 with click-to-copy).
- Multi-inheritance-contradiction CAUs (X8 SWC pattern) display the contradiction reasons (`occurrent_subtree_ancestor`, `disjointness_explicit_violation`) prominently in the explanation summary — this is what makes Plausible-via-contradiction surface honestly to the analyst per Invariant W-2.

**Phase 2 Review (per spec §5):**
- Spec already specifies fingerprint breakdown / top-N candidates / four-way actions. DP-2 records emerge here from MergeRecord / DisambiguationRecord creation.
- **Add DP-2 record indicator** on each canonical record (small icon) linking to a side-panel showing DP-2 fields. Lower priority than fingerprint display per Invariant W-2 hierarchy (fingerprint is the load-bearing evidence; DP-2 record is provenance audit).

**Phase 3 Review (per spec §6):**
- Spec already specifies FailureTrace + verbatim Prolog trace.
- **Add DP-2 record alongside FailureTrace** for QuarantineRecord items: explanation cites the violation rule + reasoner state; provenance records the Tau Prolog session (Decision D-12 hornInferenceStepCap); reproducibilityHash SHA-256.
- **Phase D2 sandbox prologSession is distinct from D1.6 Phase 1 prologSession** — surface this to analyst if relevant; otherwise transparent.

**Session Summary (per spec §7):**
- Invariant Audit card already specifies PS-1 hash / PS-9 closure / PD-2 firings / PD-10 weight vector.
- **Add DP-2 invariants subsection:** I1 schema gate count, I2a content validation count, I2b hash correctness count, I3 deterministic hash status, I4 dictionary discipline count. All green checks expected for a clean PROV-O session.

This specifies §9.3 in concrete terms. Developer reviews; refinements during implementation surface at SME implementation review per W-D-13 staging.

### 3.3 Dispatcher invocation pattern under W-D-7

**LOCKED-FROM-PRINCIPLE per W-D-7 + X-arc closures.** UI panels invoke `pipelineOrchestrator.orchestrate*()` directly. No new coordinator layer. Specifically:

- Phase 1 Review handler invokes `orchestrateThreeStateTerminal` / `orchestrateInheritance` / `orchestrateNotApplicable` per CAU disposition path.
- Phase 2 Review handler invokes existing D2 disambiguation router (unchanged from D2).
- Phase 3 Review handler invokes existing D2 consistency-sandbox.js (unchanged from D2; **see §4 escalation trigger**).
- Reactive cascades within Phase 1 (NA-1.4 mutation events) invoke `orchestrateReactive`.
- Analyst override during Phase 1 Review invokes `orchestrateAnalystOverride` (X3 Commit 1 path; previously unit-test-only — X9 is its first integration consumer).

Adapter is passed per-call per X3 §3.9.1. prologSession is passed per-call per X6 §6.2 L2. Both are caller-owned (UI session-scoped state).

This preserves W-D-7 strictly. If a coordinator layer emerges during implementation (e.g., a `runPhase1ResolutionFlow()` wrapper that bundles orchestrator calls + state management), surface at SME implementation review for evaluation against W-D-7 discipline.

### 3.4 SWC scenario behavior surfacing

**SME-PROPOSED — PENDING-DEVELOPER-ACK.** Bundle v6 SWC scenario (`evidence-inconsistent-disjointness-firing`) demonstrates a real-inference behavior the analyst will encounter on multi-inheritance modeling anomalies in real ontologies (PROV-O has some — `prov:Activity` has multiple BFO parents structurally). The UI surfacing strategy:

- **In Phase 1 Review row:** when a CAU's dispatcher output cites `disjointness_explicit_violation` or `occurrent_subtree_ancestor` reasons (or analogous contradiction reasons), display a yellow indicator badge ("Multi-inheritance contradiction detected").
- **In row expansion:** explanation subsection prominently shows the contradiction reasons + the conflicting ancestor classes in the CAU's signature.
- **Resolution path:** the analyst's Resolve action either confirms the contradiction (analyst override path → `orchestrateAnalystOverride`) or modifies the source ontology (out-of-scope for v0.2; surfaced as guidance text "Source ontology contains multi-inheritance modeling anomaly; consider editing in source").

This is honest signal per Invariant W-2 — the analyst sees what real inference catches, not a smoothed-over disposition.

---

## 4. Phase D2 consistency-sandbox.js defect — escalation trigger (OPEN)

**Banked context:** `project_d16_phase_d2_consistency_sandbox_async_defect.md`. The defect: synchronous while-loop pattern over Tau Prolog queries in `consistency-sandbox.js` is structurally broken under v0.3.4's setTimeout-0 callback model. Latent because no current tests exercise at scale.

**X9 implication:** Phase 3 Review depends on consistency-sandbox.js. PROV-O ~30 axioms may complete in single frame and not surface the defect (single setTimeout-0 callback fires synchronously enough for short queries). Or it may surface as Phase 3 hanging; if so:

- **Escalation: Phase D2 maintenance cycle priority elevates from "future" to "blocks X9."** Refactor consistency-sandbox.js to async pattern matching `bucket-c-prolog.js` precedent; estimated ~2-3 days additional runway.
- **Sequencing:** if surfaced during Phase 3 Review implementation (per W-D-13 step 4), escalation lands before continuing to Phase 2 Review. Developer flags at implementation time; SME drafts maintenance scoping; PO routes priority.

**Mitigation:** chunked-yielding pattern per W-TY-1 + W-5.14 may mask the defect even at scale. If chunked yielding works for PROV-O scope, Phase D2 maintenance stays banked. Real escalation trigger is "Phase 3 implementation surfaces visible UI freeze or non-completion."

---

## 5. PROV-O Pass 1 — P-1 routing (test plan + report template located 2026-04-25)

### 5.1 Resolution path — P-1 (REVISED 2026-04-25 post-Step-3-landing)

Per PO routing 2026-04-25: *"Use contained substitute procedure for PROV-O acceptance if no test plan is found."* Initial Glob search 2026-04-25 returned no match for `prov-o-calibration-study-test-plan.md` and routing landed P-3 (contained substitute at §5.2). **Revision discovery 2026-04-25 post-Step-3:** the search filename was wrong. The actual test plan lives at `docs/architecture/fandaws-provo-test-plan.md` (412 lines, authored 2026-04-18) and is referenced under that filename by `workbench-v0.2-spec.md` line 16. Companion `docs/architecture/fandaws-provo-study-report-template.md` (619 lines) provides the populate-as-you-go report template. Both documents are in tree and authoritative.

**P-1 LOCKED (revised from P-3):** AC-W-PROV-O is satisfied by completing the test plan §5.2 Pass 1 procedure (steps 1-12) end-to-end through the UI + populating report template §3-§7 from Workbench artifacts + TA-1 through TA-8 acceptance conditions per test plan §3.2 all holding. Pass 2 comparative analysis + report §8-§12 (Disagreement Analysis, Calibration Findings, Publishable Findings, Limitations, Next Steps) defer to v0.3+ analytical work per test plan §10 R-7 series consideration.

**§5.2 below preserved as Aaron-executable concrete reference;** maps directly to test plan §5.2 step numbers (the contained substitute and the test plan procedure converge — same six panels, same Pass 1 flow). §5.5 progressive-testability mapping cites test plan §5.2 step numbers as authoritative.

### 5.2 Contained Pass 1 Procedure — Aaron-executable, no missing-document references

**Scope:** end-to-end PROV-O ingestion through Workbench v0.2 Ingest Mode UI, no console commands, no manual JSON extraction. Source: `docs/architecture/prov-o.owl` (W3C PROV-O bundled in tree).

**Step 1 — Sessions panel entry.**
- Open Workbench in browser; switch to Ingest mode (third tab per W-D-5).
- Sessions panel renders empty state on first run (per W-2.6) OR existing sessions list.
- **Acceptance check:** Sessions panel reachable; "New Ingestion Session" button visible.

**Step 2 — New session + upload.**
- Click "New Ingestion Session" button. UI navigates to Upload panel; new session ID displayed at top.
- Upload `docs/architecture/prov-o.owl` via file input (or paste contents — both per W-3.1).
- Source preview shows estimated class/property count (per W-3.3).
- Default configuration accepted (advanced panel collapsed; defaults visible per W-3.4).
- Click "Start Session & Run Phase 1".
- **Acceptance checks:** file accepted (under 1MB per W-3.9); quota probe passes (per W-3.10); IngestionSession record created; staging records visible; navigation to Phase 1 Review per W-3.6; `owl:imports` declarations recorded but not followed per W-3.11 / W-IM-1.

**Step 3 — Phase 1 Review.**
- Phase 1 Review panel renders CandidateClass table for all PROV-O classes (~30 per spec context).
- Each row shows source IRI, label, placement (BFO node), confidence, status, justification.
- **DP-2 record subsection (X9 §3.2):** expandable per row showing explanation summary, provenance summary, reproducibilityHash (truncated). Multi-inheritance contradiction CAUs (e.g., `prov:Activity` if it surfaces) display contradiction reasons prominently.
- Resolve any PendingHumanResolution items: select placement + provide justification (per W-4.4).
- Click "Run Phase 2" once blocking count reaches zero.
- **Acceptance checks:** all CandidateClass records visible; DP-2 fields surface per X9 §3.2; resolution UI requires both placement + justification (per W-4.4); justification stored permanently (per W-4.5); Run Phase 2 button enabled only when blocking-count zero (per W-4.6).

**Step 4 — Phase 2 Review.**
- Phase 2 Review panel renders CandidateRelation list grouped by disposition (left pane); detail per selected (right pane).
- Right pane shows fingerprint with all six dimensions + weights (per W-5.2 / Invariant W-2); top-N candidate matches with margins to three decimals (per W-5.3 / W-5.4); PD-2 disjoint firings if present (per W-5.5).
- Resolve DisambiguationRecord items via four-way action buttons (Merge / Reject / PromoteAsSubProperty / PromoteAsNewRelation per W-5.6) with required justifications.
- **DP-2 record indicator (X9 §3.2):** small icon on each canonical record linking to side-panel DP-2 view.
- Click "Run Phase 3" once blocking count reaches zero.
- **Acceptance checks:** all CandidateRelation records visible; six-dim fingerprint with three-decimal margins (Invariant W-2); PD-9 rejects `owl:topObjectProperty` (per W-5.7); PD-6 greys broader-than-parent targets (per W-5.8); Run Phase 3 enabled only when blocking-count zero (per W-5.13).

**Step 5 — Phase 3 Review.**
- Phase 3 Review panel renders candidate axioms grouped by outcome (left pane); detail per selected (right pane).
- Right pane FailureTrace section shows all PS-6 fields tabularly; Prolog trace verbatim in monospace (per W-6.3 / Invariant W-2 / AC-D2-17).
- Copy Prolog trace via copy-to-clipboard button (per W-6.4).
- **DP-2 record alongside FailureTrace (X9 §3.2):** explanation cites violation rule + reasoner state.
- Click "Finalize Session". UI navigates to Session Summary.
- **Acceptance checks:** all candidate axioms visible; FailureTrace fields complete per W-6.2; Prolog trace verbatim per W-6.3; suggested repair displayed prominently per W-6.5; Finalize Session writes sessionCompletedAt per W-6.7.
- **Phase D2 consistency-sandbox.js defect escalation trigger:** if Phase 3 hangs / progress indicator freezes / completion never reaches Session Summary → escalation to Phase D2 maintenance cycle per X9 §4. Banked at `project_d16_phase_d2_consistency_sandbox_async_defect.md`.

**Step 6 — Session Summary.**
- Session Summary panel renders metadata, three phase summary cards, **Invariant Audit card with PS-1 / PS-2 / PS-9 / PD-2 / PD-10 + DP-2 invariants subsection (I1/I2a/I2b/I3/I4) per X9 §3.2**.
- All Invariant Audit indicators show green checks (per W-7.4) for a clean PROV-O session.
- Click "Export Session Artifacts as JSON Bundle". File downloads with bundle header `schemaVersion: "1.0"` per W-7.7.
- Click "Export Canonical Graph as Turtle". Switches to Export mode with session-scoped context.
- **Acceptance checks:** Invariant Audit card all-green per W-7.3 / W-7.4; JSON Bundle downloads with valid schemaVersion per W-7.7 / W-7.10; Turtle export switches mode per W-7.6.

### 5.3 Acceptance gate satisfied when:

1. ✅ All six panels reachable end-to-end.
2. ✅ At least one CandidateClass placement visible in Phase 1 Review.
3. ✅ At least one CandidateRelation disambiguation visible in Phase 2 Review (or zero relations is acceptable for PROV-O if all merge cleanly auto-Merged).
4. ✅ At least one FailureTrace OR all-NoViolations result in Phase 3 Review.
5. ✅ Invariant Audit card all-green in Session Summary.
6. ✅ JSON Bundle exports as valid JSON with schemaVersion "1.0".
7. ✅ Turtle export switches to Export mode with canonical graph populated.
8. ✅ Zero console commands required throughout.
9. ✅ Zero manual JSON extraction required throughout.
10. ✅ DP-2 record fields surface per X9 §3.2 in Phase 1/2/3 Review + Session Summary.
11. ✅ 70/70 D1.6 AVC + bundle v6 SWC scenario regression preserved (verified by Jest CI).

### 5.4 What this contained procedure does NOT validate

- **Pass 2 calibration analysis** — comparing FANDAWS Pass 1 output to external alignments. v0.3+ deliverable.
- **Calibration findings** — interesting behaviors in PROV-O alignment. Out of acceptance-gate scope; observational artifact for the analyst.
- **Report template population through §7** — full report template completion. Defers to v0.3+ test plan.

These are the deferrals AC-W-PROV-O originally scoped via the missing test plan. P-3 contained substitute keeps X9 acceptable while v0.3+ work fills in the analytical layer.

### 5.5 Aaron-executable enabling capability — early testability

**PO context: "flying blind without the ability to directly test."** The contained procedure enables direct testing per W-D-13 sub-step landing:

- After **W-D-13 step 2** (Sessions + Upload panels): Aaron can upload prov-o.owl and observe staging records; partial Step 1-2 of §5.2 procedure.
- After **W-D-13 step 3** (Phase 1 Review): Aaron can complete Step 3 of §5.2; resolve placements; observe DP-2 record fields surface per X9 §3.2.
- After **W-D-13 step 4** (Phase 3 Review): Aaron can complete Step 5 of §5.2 if Phase 2 trivial / auto-merge-clean; observe Phase D2 consistency-sandbox behavior at PROV-O scale (escalation trigger surfacing point).
- After **W-D-13 step 5** (Phase 2 Review): full §5.2 procedure executable end-to-end.
- After **W-D-13 step 6** (Session Summary): final acceptance.

Direct-testability comes online progressively. This addresses the PO "flying blind" framing without requiring full v0.2 implementation before any testing.

---

## 6. Acceptance criteria

### 6.1 Per-spec acceptance — unchanged

- All 60 AVC scenarios from `workbench-v0.2-avc-bundle.json` pass.
- 20 programmatic scenarios run in Jest CI.
- 20 manual scenarios verified during PROV-O Pass 1 dry run.
- 20 hybrid scenarios verified via both methods.
- AC-W-PROV-O: Aaron completes PROV-O Pass 1 end-to-end through UI.

### 6.2 X-arc preservation

- 70/70 D1.6 AVC regression preserved across X9 implementation.
- Bundle v6 SWC scenario (`evidence-inconsistent-disjointness-firing`) continues to pass post-X9.
- DUAL-MODE seam discipline preserved: dispatcher path requires prologSession in UI invocations; legacy iteration-mechanics path stays for SYNTHETIC_ITERATION (untouched).
- All X-arc memos remain consistent with X9 deliverables (no need to amend X3-X8 memos).

### 6.3 Integration-bridge acceptance

- prologSession lifecycle attached per §3.1; init at session creation, teardown at finalization.
- DP-2 record fields surface in Phase 1/2/3 Review + Session Summary per §3.2.
- Dispatcher invocation pattern preserves W-D-7 thin-UI-layer discipline per §3.3.
- SWC scenario behavior surfaces honestly to analyst per §3.4.

### 6.4 PROV-O test plan disposition

Per §5 routing — (P-1) located, (P-2) drafted, or (P-3) substituted. Acceptance closes only when AC-W-PROV-O has an executable procedure.

### 6.5 Escalation triggers — passively observed

- Phase D2 consistency-sandbox.js async defect: surface during Phase 3 Review implementation; if triggered, Phase D2 maintenance cycle blocks X9 continuation.
- Bundle v6 → v7 cycle: if X9 implementation surfaces additional SWC opportunities during dispatcher behavior in real PROV-O, route to bundle v7 authorization (separate cycle from X9).
- Band 9 AVC elevation: per X8 §5, the X7 cross-cascade test + X6 OWA-preservation discriminating fixture remain candidates for Band 9 elevation (separate cycle).

---

## 7. Open questions for developer pre-proposal

1. **§3.1 prologSession lifecycle attach** — confirm Sessions panel "New Ingestion Session" / Session Summary "Finalize Session" as the lifecycle anchors. Refine if v0.1 framework conventions surface a different natural attach point.
2. **§3.2 DP-2 record surfacing** — confirm the per-panel surfacing strategy. Adjust visual hierarchy (where DP-2 fields appear; what's expandable vs always-visible) per Invariant W-2 evidence-density discipline.
3. **§3.3 dispatcher invocation pattern** — confirm direct `pipelineOrchestrator.orchestrate*()` calls preserve W-D-7. If a coordinator layer emerges naturally, surface for SME evaluation.
4. **§3.4 SWC behavior surfacing** — confirm yellow indicator + expanded explanation pattern. Adjust per spec's existing color/iconography conventions.
5. ~~§5 PROV-O test plan resolution~~ — **RESOLVED via P-3 routing 2026-04-25.** Contained substitute procedure at §5.2 is the AC-W-PROV-O acceptance criterion. No developer action needed on this question.

---

## 8. Process pattern — PO routing locks 2026-04-25

**Cycle structure: R-B single cycle with rolling SME reviews per W-D-13 panel landing (LOCKED 2026-04-25).** Not sub-cycle structure (R-A); not a series of named sub-X cycles. X9 stays one cycle name; SME reviews per panel landing rather than per-commit. Closer to spec's "several days of focused UI work" framing without artificially fragmenting.

**Pre-proposal first (LOCKED 2026-04-25).** Cycle-standard discipline; no tracer-bullet implementation. Pre-proposal is where developer surfaces v0.1 framework conventions that affect §3.1 prologSession attach and §3.2 DP-2 surfacing patterns.

Standard cycle (cycle inversion not in play; spec ground state is solid; X-arc bridges are the open scope):

1. ✅ This SME memo (integration scoping + contained PROV-O substitute procedure).
2. ☐ **Developer pre-proposal + implementation plan** addressing §3.1-§3.4 + sequencing per W-D-13.
3. ☐ **PO pre-code confirmation.**
4. ☐ Implementation per W-D-13 sequencing with rolling SME reviews per panel landing.

**Rolling SME review pattern (R-B locked):** SME reviews land at each W-D-13 panel commit, not per-PR or per-commit. Review scope per panel:

- **Mode switcher commit:** light review; structural sanity check.
- **Sessions + Upload commit:** §3.1 prologSession attach pattern review; W-3.9 / W-3.10 / W-IM-1 verification; **§5.2 Step 1-2 Aaron-executable per "flying blind" framing — Aaron can directly test post-this-commit.**
- **Phase 1 Review commit:** §3.2 DP-2 record surfacing review; W-4.10 pagination; first integration consumer of `orchestrate*()` family — verification of W-D-7 thin-UI-layer discipline; **§5.2 Step 3 Aaron-executable.**
- **Phase 3 Review commit:** §3.2 DP-2 surfacing alongside FailureTrace; W-5.14 chunked yielding verification; **§4 escalation trigger evaluation — does Phase D2 consistency-sandbox defect surface at PROV-O scale?**; **§5.2 Step 5 Aaron-executable.**
- **Phase 2 Review commit:** most complex; PD-6/PD-9 visible enforcement; §3.2 DP-2 indicator on canonical records; **§5.2 Step 4 Aaron-executable.**
- **Session Summary commit:** §3.2 DP-2 invariants subsection on Invariant Audit card; W-7.7 / W-7.10 bundle export; **§5.2 Step 6 Aaron-executable.**
- **Cross-panel + AC-W-PROV-O commit:** acceptance gate satisfied per §5.2 + §5.3 checklist; SME final review; PO acceptance.

**Suggested staging follows W-D-13 (locked in spec):**

1. **Mode switcher extension.** Sub-day.
2. **Sessions panel + Upload panel** + prologSession init at "New Session" per §3.1. Includes W-3.9 file-size cap + W-3.10 quota probe + W-IM-1 imports-recorded-not-followed.
3. **Phase 1 Review panel** + DP-2 record surfacing per §3.2. Resolve-with-justification core interaction. Includes W-4.10 pagination from day one. **First integration consumer of `orchestrateThreeStateTerminal` / `orchestrateInheritance` / `orchestrateNotApplicable` / `orchestrateAnalystOverride`.**
4. **Phase 3 Review panel** + DP-2 record alongside FailureTrace per §3.2. Includes W-5.14 chunked yielding from day one. **Phase D2 consistency-sandbox.js defect escalation trigger lives here per §4.**
5. **Phase 2 Review panel** + DP-2 record indicator on canonical records per §3.2. Most complex panel; PD-6 / PD-9 visible enforcement.
6. **Session Summary panel** + DP-2 invariants subsection on Invariant Audit card per §3.2. Bundle export per W-7.7 + W-SV-1.
7. **Cross-panel concerns.** Validated at each panel milestone.
8. **PROV-O Pass 1 dry run** — AC-W-PROV-O acceptance test. prologSession teardown at finalization completes the lifecycle.

**Estimated runway:** spec §12.5 says "several days of focused UI work — not a full sprint" pre-X-arc. Post-X-arc integration adds runway: ~1.5-3 weeks total accounting for §3.1-§3.4 integration-bridge work + Phase D2 consistency-sandbox defect escalation if surfaced + PROV-O test plan resolution.

---

## 9. References

- `docs/architecture/workbench-v0.2-spec.md` v1.0 — authoritative spec; X9 preserves entirely.
- `docs/architecture/workbench-v0.2-cover-memo.md` — locked decisions overview.
- `docs/architecture/workbench-v0.2-avc-bundle.json` — 60 AVC scenarios.
- `specs/d16/sme-d16-x3-pipeline-orchestrator-memo-v2.md` §3.9.1 — explicit-per-call adapter discipline (precedent for §3.1 prologSession discipline).
- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` §6.2 — L2 prologSession lifecycle (caller-owned).
- `specs/d16/sme-d16-x7-dispatcher-integration-memo-v1.md` — OWL-DERIVED dispatcher integration; X9's first production consumer.
- `specs/d16/sme-d16-x8-avc-migration-memo-v1.md` — DUAL-MODE seam discipline; X9 inherits.
- `specs/d16/bundle-v6-authorization-memo.md` — SWC scenario amendment context for §3.4.
- `specs/d16/x4-avc-triage.md` §11 — post-X8 triage; X9's regression baseline.
- `specs/d16/provo-reception-live-commit4.md` §16 — X8 post-arc carry-forward; X9 extends.
- Project memory: `project_d16_phase_d2_consistency_sandbox_async_defect.md` — §4 escalation trigger.
- Feedback memory: `feedback_throw_not_warn_enforcement.md` (DispatcherContractViolationError UI surfacing); `feedback_proof_discipline.md` (analyst-facing honest-admission for SWC behavior); `feedback_cycle_inversion_reconciliation_discipline.md` (X9 is standard cycle, not inverted).

---

## 10. Reserved doors for developer pushback

- §3.1 prologSession attach point — alternate lifecycle anchors if v0.1 framework conventions surface them.
- §3.2 DP-2 record surfacing strategy — visual hierarchy and expansion details per Invariant W-2.
- §3.3 coordinator layer if it emerges naturally during implementation — evaluate against W-D-7.
- §3.4 SWC behavior surfacing — color/iconography per spec conventions.
- §5 PROV-O test plan resolution path — developer or Aaron may locate the missing plan (P-1).
- W-D-13 sequencing refinements — spec is locked, but if implementation surfaces a reason to re-sequence (e.g., Phase 3 Review's consistency-sandbox defect blocking before Phase 2 Review can land), developer flags for SME evaluation.

---

**Next action:** developer ACK + implementation plan. PO pre-code confirmation. Standard cycle proceeds.
