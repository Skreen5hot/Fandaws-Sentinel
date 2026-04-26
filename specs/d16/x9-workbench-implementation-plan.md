# SME-D16-X9 — Workbench v0.2 Ingest Mode Developer Pre-Proposal + Implementation Plan (DRAFT)

**Status:** DRAFT v1 2026-04-25. Consumes `sme-d16-x9-workbench-v02-integration-memo-v1.md` + `docs/architecture/workbench-v0.2-spec.md` (authoritative). Pending PO pre-code confirmation per memo §8 step 3. **No code until confirmation.**
**Author:** Developer (Claude). Addresses memo §3.1–§3.4 + sequencing per W-D-13. Cycle character: integration scoping + implementation against an architecturally-locked surface.

---

## 1. ACK summary

ACK on:
- All §2 LOCKED-FROM-SPEC items unchanged post-X8 (six-panel structure, W-D-7 thin-UI-layer, W-D-13 sequencing, W-D-8 acceptance gate, edge-canonical preservation).
- Integration-bridging scope only — no new architectural decisions; spec is the ground state.
- §5.2 contained PROV-O substitute procedure as AC-W-PROV-O acceptance.
- R-B single cycle with rolling SME reviews per W-D-13 panel landing.
- Critical preservation: 70/70 D1.6 AVC + bundle v6 SWC scenario hold across X9.
- Phase D2 consistency-sandbox.js defect as Phase 3 Review escalation trigger (not blocking entry).

**Codebase verification:** `docs/workbench/` already contains v0.2 skeleton: `workbench.html` (mode switcher + Converse/Ingest/Export tabs); `js/workbench-state.js` (`WorkbenchStateManager` with `InMemoryStateAdapter` + `SynchronousOrchestrationAdapter` + EventBus); `js/panels/ingest/` (sessions/upload/phase1/phase2/phase3/session-summary skeleton files); `js/panels/ingest/ingest-state.js` with `createSession()`. **W-D-13 step 1 and partial step 2 exist in scaffolding form**; X9 fills in the production behavior + integration touchpoints.

---

## 2. §3.1 prologSession lifecycle attach point

**Recommended: SME's anchors confirmed.** Sessions panel "New Ingestion Session" → init; Session Summary "Finalize Session" → teardown. Refinement against v0.1 framework conventions:

### 2.1 Attach pattern

`ingestState` (existing module at `docs/workbench/js/panels/ingest/ingest-state.js`) extends to manage prologSession alongside session records:

```js
// In ingest-state.js
async createSession(opts = {}) {
  // ... existing IngestionSession creation ...
  const prologSession = await Fandaws.initBucketCPrologSession({ stepCap: 10000 });
  this._activePrologSessions.set(sessionId, prologSession);
  return { id: sessionId, session, prologSession };
}

getPrologSession(sessionId) {
  let session = this._activePrologSessions.get(sessionId);
  if (!session || session.teardownComplete) {
    // Re-init transparently on reload (W-SP-2 page-reload semantics)
    session = await Fandaws.initBucketCPrologSession({ stepCap: 10000 });
    this._activePrologSessions.set(sessionId, session);
  }
  return session;
}

async finalizeSession(sessionId) {
  // ... existing finalization ...
  const prologSession = this._activePrologSessions.get(sessionId);
  if (prologSession) {
    Fandaws.teardownPrologSession(prologSession);
    this._activePrologSessions.delete(sessionId);
  }
}
```

### 2.2 Persistence semantics

- **prologSession is in-memory only.** Not localStorage-serialized (Tau Prolog session is not JSON-serializable).
- **IngestionSession record (localStorage) does NOT include prologSession field.** Schema unchanged from v0.1 skeleton.
- **Page reload re-init is transparent.** When user navigates back to a session whose phase requires dispatcher invocation (Phase 1/2/3 Review), `getPrologSession(sessionId)` lazily re-initializes. BFO axiom load is a one-time per-page-session cost (~50ms; acceptable for analyst workflow).
- **Mid-session navigation** (Sessions panel ↔ Upload ↔ Phase X Review) does NOT teardown. Session stays alive for return navigation.
- **W-SP-2 preservation:** IngestionSession + staging records persist normally; prologSession re-init implicit and invisible to analyst.

### 2.3 Lifecycle anchors

| Anchor | Action | Module |
|---|---|---|
| Sessions panel "New Ingestion Session" click | `ingestState.createSession()` → init prologSession | `sessions-panel.js` calls `ingest-state.js` |
| Sessions panel session-card click (return to session) | `ingestState.getPrologSession(id)` → reuse OR re-init | `sessions-panel.js` |
| Phase 1/2/3 Review panel handler invoking orchestrator | reads `prologSession` from `ingestState.getPrologSession(activeSessionId)` | `phase1/2/3-review-panel.js` |
| Session Summary "Finalize Session" click | `ingestState.finalizeSession(id)` → teardown prologSession | `session-summary-panel.js` |
| Window unload (browser close) | implicit GC; no explicit teardown needed | n/a |

### 2.4 Trade-offs vs alternative anchors

Considered: prologSession at `WorkbenchStateManager` level (alongside the global adapter). **Rejected** — prologSession is per-session-scoped state; the global adapter is per-workbench-tab-scoped. Mismatched lifecycles. The `ingestState`-level attachment matches scoping naturally and parallels v0.1's per-graph state pattern.

---

## 3. §3.2 DP-2 record surfacing strategy

**Recommended: SME's per-panel strategy confirmed with one refinement at Phase 1 Review.**

### 3.1 Phase 1 Review (per spec §4 + memo §3.2)

ACK SME-proposed:
- Expandable "DP-2 Record" subsection within row expansion: explanation summary, provenance summary, reproducibilityHash (truncated SHA-256, click-to-copy).
- Multi-inheritance contradiction CAUs display contradiction reasons prominently.

**Refinement:** add SWC-marker badge to row header (not just expansion) when contradiction reasons present. Per Invariant W-2, the analyst should see the anomaly without expanding (visual scanning over a 30-row Phase 1 table). Aligns with §3.4 SWC surfacing strategy.

### 3.2 Phase 2 Review (per spec §5 + memo §3.2)

ACK SME-proposed: small DP-2-record icon on each canonical record, side-panel link. Lower priority than fingerprint per W-2 hierarchy. No refinements.

### 3.3 Phase 3 Review (per spec §6 + memo §3.2)

ACK SME-proposed: DP-2 record alongside FailureTrace; explanation cites violation rule + reasoner state.

**Refinement on Phase D2 vs D1.6 prologSession distinction:** SME notes "Phase D2 sandbox prologSession is distinct from D1.6 Phase 1 prologSession — surface this to analyst if relevant; otherwise transparent." For X9 v0.2: **transparent** (analyst doesn't need to distinguish). DP-2 record's `provenance.mechanism` field already captures the mechanism (consistency-sandbox vs nc-dispatcher); analysts who care can read provenance. Surface ONLY if Phase D2 defect (memo §4) escalates to user-visible error.

### 3.4 Session Summary (per spec §7 + memo §3.2)

ACK SME-proposed: DP-2 invariants subsection on Invariant Audit card (I1/I2a/I2b/I3/I4 indicators).

**Refinement:** order Invariant Audit subsections to match spec §8.5 catalog → DP-2 invariants section appended after PD/PS rules. Visual grouping: WORKBENCH invariants (PS/PD) above the line; DP-2 invariants (I1-I4) below. Preserves spec's existing visual hierarchy.

### 3.5 Visual hierarchy decision (Invariant W-2 compliance)

DP-2 surfacing is **provenance audit, not load-bearing evidence.** Hierarchy:
1. **Always-visible (top):** disposition, placement, status, fingerprint (Phase 2), FailureTrace (Phase 3).
2. **One-click expand:** justification, DP-2 record summary, contradiction reasons.
3. **Side-panel / icon:** full DP-2 record with all fields.

This matches Invariant W-2's "UI never simplifies evidence" while not flooding the table view with provenance fields the analyst doesn't need at first scan.

---

## 4. §3.3 dispatcher invocation pattern under W-D-7

**LOCKED-FROM-PRINCIPLE confirmed.** Direct `pipelineOrchestrator.orchestrate*()` calls; no new coordinator layer.

### 4.1 Per-panel handler pattern

```js
// In phase1-review-panel.js handler
import { orchestrateThreeStateTerminal, orchestrateAnalystOverride } from '@fandaws/orchestrator';

async function resolveCAU(cauIRI, placement, justification) {
  const prologSession = ingestState.getPrologSession(activeSessionId);
  const adapter = wbState._adapter;
  const context = { sessionId: activeSessionId, phase: 'production' };

  return await orchestrateThreeStateTerminal(cauIRI, {
    evaluatorInput: { ..., prologSession },  // explicit per-call (X6 §6.2 L2)
    explanationInput: ...,
    iterationState: ...,
    sessionState: ...,
  }, context, adapter);
}
```

### 4.2 W-D-7 preservation discipline

- **No `runPhase1ResolutionFlow()` wrappers.** If implementation surfaces a desire for one (bundling state-mutation + orchestrator call + EventBus emit), surface for SME evaluation per §10 reserved doors.
- **EventBus for state propagation, not for orchestration.** EventBus emits `phase1-resolution-recorded` AFTER orchestrator returns; doesn't bundle the call.
- **Adapter + prologSession explicit per-call.** No closures binding either.

### 4.3 Migration-path callers (D1.6 mature; X9 is post-migration)

Post-X8, `runEvaluationWithOptionalDispatcher` requires prologSession when dispatcher path invoked (DUAL-MODE seam Option I lock). UI path always supplies prologSession → throws-on-absence is correct enforcement. Iteration-mechanics legacy path NOT used by UI panels (those are SYNTHETIC_ITERATION-only per X4 §2.7).

---

## 5. §3.4 SWC behavior surfacing

**Recommended: SME's yellow-indicator pattern confirmed with iconography refinement.**

### 5.1 Surface treatment

- **Phase 1 Review row badge:** yellow `⚠` icon + text "Multi-inheritance anomaly" when contradiction reasons present in DP-2 record.
- **Row expansion explanation:** prominent block at top of expansion citing the contradiction reasons (`occurrent_subtree_ancestor`, `disjointness_explicit_violation`) + the conflicting ancestor classes from CAU signature.
- **Resolution path:**
  - **Confirm contradiction:** analyst override path → `orchestrateAnalystOverride`. Justification text required (per W-4.4).
  - **Modify source ontology:** out-of-scope for v0.2 per spec Appendix B in-place editing deferral. Surfaced as guidance text: "Source ontology contains multi-inheritance modeling anomaly; consider editing in source ontology before re-ingestion."

### 5.2 Color/iconography conventions

v0.1 framework uses badge classes (`badge--green`, `badge--accent` per `index.html`). For v0.2 SWC indicator: align with existing convention via new `badge--warning` class (yellow). Iconography: Unicode `⚠` as text content (no SVG dependency); pairs with text per W-A-2 (color is not sole carrier of meaning).

### 5.3 Distinct from disposition badges

The SWC indicator is **additive** to the disposition badge (Plausible/Entailed/Inconsistent/etc.). A multi-inheritance Plausible CAU shows BOTH the Plausible disposition badge AND the warning badge. Visual order: disposition first (load-bearing per Invariant W-2), warning second (flag for analyst attention).

---

## 6. W-D-13 sequencing — staging plan

Per memo §8 + spec W-D-13 + verified existing skeleton:

| Step | Memo description | Existing skeleton state | X9 commit scope |
|---|---|---|---|
| 1 | Mode switcher extension | ✅ exists (`workbench.html` lines 33-39) | Verification only; no new work |
| 2 | Sessions + Upload panels + prologSession init per §2 | ⚠ skeleton exists; production behavior gap | Production wiring + §2 prologSession lifecycle + W-3.9 file cap + W-3.10 quota probe + W-IM-1 imports-recorded-not-followed |
| 3 | Phase 1 Review panel + DP-2 surfacing per §3 | ⚠ skeleton exists; integration gap | First production consumer of orchestrator family; W-4.10 pagination; §3.1 + §3.4 (SWC indicator) |
| 4 | Phase 3 Review panel + DP-2 alongside FailureTrace per §3 | ⚠ skeleton exists; integration gap | W-5.14 chunked yielding; **§4 escalation trigger evaluation** |
| 5 | Phase 2 Review panel + DP-2 indicator per §3 | ⚠ skeleton exists; integration gap | Most complex panel; PD-6/PD-9 visible enforcement |
| 6 | Session Summary + DP-2 invariants per §3 | ⚠ skeleton exists; integration gap | W-7.7/W-SV-1 bundle export |
| 7 | Cross-panel concerns | validated per panel | W-SP-2 reload + W-SI-2 isolation + W-EH-1/2/3 |
| 8 | PROV-O Pass 1 dry run (§5.2) | n/a | AC-W-PROV-O acceptance gate |

**Per-step Aaron-executable progressively** per memo §5.5: each commit landing enables direct testing of the corresponding §5.2 procedure step. Closes the "flying blind" framing.

### 6.1 Estimated runway breakdown

- Step 2 (Sessions + Upload): 2-3 days. Production wiring + integration.
- Step 3 (Phase 1 Review): 3-4 days. First orchestrator consumer; DP-2 surfacing precedent.
- Step 4 (Phase 3 Review): 2-3 days. Tau Prolog defect escalation buffer + chunked yielding.
- Step 5 (Phase 2 Review): 4-5 days. Most complex panel.
- Step 6 (Session Summary): 1-2 days.
- Step 7-8 (cross-panel + dry run): 1-2 days.

**Total: ~13-19 days = ~2.5-3.5 weeks.** Aligns with memo §8 estimate (~1.5-3 weeks; my estimate adds buffer for §4 defect escalation if surfaced).

---

## 7. Open questions for PO + SME

1. **Confirm skeleton-vs-rewrite scope** — the `docs/workbench/js/panels/ingest/` skeleton files exist. Per W-D-7 thin-UI-layer + spec implementation-readiness, X9 fills production behavior into skeleton (NOT rewrites). Confirm developer reads skeleton as starting point, not greenfield.
2. **prologSession schema documentation** — confirm `IngestionSession` record schema explicitly excludes prologSession field (per §2.2 non-serialization). Documented inline in `ingest-state.js`; surface for SME spec-touch concern if any.
3. **SWC badge `badge--warning` class addition** — new CSS class in `workbench.css`. Surface for review.
4. **Phase D2 consistency-sandbox.js defect timing** — escalation trigger is at Step 4 (Phase 3 Review) per memo §4. If defect surfaces, Phase D2 maintenance cycle interrupts X9 for ~2-3 days. Confirm sequencing acceptable — X8 surfaced bundle-amendment-during-cycle precedent for in-cycle scope expansion.
5. **W-D-22 hybrid AVC scenarios** — 60-scenario AVC bundle in `docs/architecture/workbench-v0.2-avc-bundle.json`. Programmatic-vs-manual split defines test harness; need to land programmatic ones in Jest + manual ones documented for Aaron's PROV-O dry run. Confirm AVC test-harness landing schedule (per panel commit vs end-of-arc).

---

## 8. Outstanding queue

- **PO:** review plan; rule on §7 q1-q5; pre-code confirmation per memo §8 step 3.
- **SME:** reactive on §7 q1-q5; rolling reviews per W-D-13 panel commits per memo §8.
- **Developer:** idle pending PO green light; Step 1 verification + Step 2 Sessions+Upload production wiring on green.

---

## 9. References

- `specs/d16/sme-d16-x9-workbench-v02-integration-memo-v1.md` — SME integration scoping memo.
- `docs/architecture/workbench-v0.2-spec.md` — authoritative spec (W-D-1 through W-D-22; six-panel structure; AC-W-PROV-O).
- `docs/architecture/workbench-v0.2-cover-memo.md` — locked decisions overview (W-D-7, W-D-13, W-D-22).
- `docs/architecture/workbench-v0.2-avc-bundle.json` — 60 AVC scenarios for test harness.
- `docs/workbench/` — existing v0.1+v0.2 skeleton (mode switcher, ingest panels, ingest-state.js).
- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` §6.2 — L2 prologSession lifecycle grounding §2 above.
- `specs/d16/sme-d16-x8-avc-migration-memo-v1.md` §4 — DUAL-MODE seam discipline grounding §4.3 above.
- `specs/d16/bundle-v6-authorization-memo.md` — SWC scenario behavior grounding §5.
- `project_d16_phase_d2_consistency_sandbox_async_defect.md` — Step 4 escalation trigger.
- Feedback memory: `feedback_throw_not_warn_enforcement.md` (DispatcherContractViolationError UI surfacing); `feedback_proof_discipline.md` (analyst-facing honest-admission for SWC); CLAUDE.md "Don't design for hypothetical future requirements" (grounding §4.2 W-D-7 preservation discipline).
