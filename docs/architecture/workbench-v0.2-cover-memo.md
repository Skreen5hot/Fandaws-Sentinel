# Workbench v0.2 AVC Bundle — Handoff Cover Memo

**Bundle:** `workbench-v0.2-ingest-mode` (v1)
**Authored:** 2026-04-18
**Status:** Awaits implementation
**Spec:** `workbench-v0.2-spec.md` v1.0
**Acceptance gate:** AC-W-PROV-O (end-to-end PROV-O Pass 1 executable through UI)
**Dependency:** Phase D2 complete (178/178 AVC scenarios). Workbench v0.1 functional.

---

## Scope

Workbench v0.2 adds **Ingest mode** as a third top-level workspace alongside Converse and Export. It is the UI surface for the D1/D2 bulk ingestion pipeline — before v0.2, the pipeline exists as functional JavaScript + Tau Prolog with full AVC certification but no UI. An analyst can invoke it only via console commands.

v0.2 is scoped to what makes the PROV-O calibration study executable through a UI. Six panels (Sessions, Upload, Phase 1 Review, Phase 2 Review, Phase 3 Review, Session Summary) with localStorage persistence and state preservation across mode switches. The acceptance gate is that Aaron can complete a full PROV-O Pass 1 — from upload through artifact export — using only the UI, with the resulting session data sufficient to populate the calibration study report template through §7 without manual JSON extraction.

Three load-bearing invariants govern the UI shape:

- **W-1 — Workspace, not wizard.** Panels navigable non-linearly; ingestion work and conversational reflection interleave freely.
- **W-2 — UI never simplifies evidence.** Fingerprint breakdowns show all six dimensions. Prolog traces shown verbatim in monospace. Margins displayed to three decimal places.
- **W-3 — Invariants visibly enforced.** PD-6 sub-property narrowing greys out broader targets in the picker. PD-9 merge target rejects `owl:topObjectProperty`. PD-10 weight vector validated at session init with structured errors. PS-1 sandbox purity shown as before/after hash equality in Session Summary.

---

## Locked Decisions Recap

17 locked decisions (W-D-1 through W-D-14 plus three clarifications). The ones most likely to affect implementation sequencing:

**W-D-5 (six-panel structure).** Sessions, Upload, Phase 1 Review, Phase 2 Review, Phase 3 Review, Session Summary. Not a wizard — each panel is independently navigable, state persists when switching to Converse mode.

**W-D-4 (localStorage persistence).** Sessions survive page reloads. Multi-day analysis is the use case. In-progress form state persists across mode switches but not across reloads (per Rule W-SP-3 — the simpler state model).

**W-D-7 (thin UI layer over existing pipeline).** Ingest mode calls existing D1/D2 functions directly. No new API layer. If an implementer finds themselves building abstraction between UI and pipeline, stop — it's not needed for v0.2.

**W-D-13 (sequencing).** Mode switcher → Sessions/Upload → Phase 1 Review → Phase 3 Review → Phase 2 Review → Session Summary. Phase 2 built last because it's the most complex panel (fingerprint breakdown + four-way actions + PD-6 visible enforcement + PD-9 validation). Phase 3 before Phase 2 because the trace display is architecturally independent.

**W-D-8 (acceptance gate).** Not "v0.2 has Ingest mode" — "Aaron completes PROV-O Pass 1 through the UI." A concrete, test-based gate.

---

## Scenarios — Shape of Coverage

60 scenarios organized in nine bands (plus acceptance gate). Each scenario carries a `verification_method` field: 20 programmatic (Jest/Node-runnable), 20 manual (visual/interaction checklist), 20 hybrid (both).

**Band 1 — Mode switcher + state persistence (3 scenarios).** Three-tab structure, state preserved across mode switches, page-reload restoration.

**Band 2 — Sessions panel (5 scenarios).** Empty state, list rendering, blocking pill, new-session action, click-routes-to-blocker.

**Band 3 — Upload panel (11 scenarios).** File formats, paste input, unsupported format rejection, default-collapsed advanced config, weight vector validation (both lexical and structural-sum), Start action, read-only on completed sessions, **file size cap at 1MB**, **localStorage quota probe**, **Configuration Locked message**, **owl:imports recorded but not followed**.

**Band 4 — Phase 1 Review (8 scenarios).** Table rendering, row expansion for pending items, resolution requires justification, permanent justification storage, Run Phase 2 blocked by pending items, enabled after resolution, **pagination with global sort across 350-row session**, **no-pagination-ui for small ontologies**.

**Band 5 — Phase 2 Review (12 scenarios).** Two-pane layout, fingerprint with all six dimensions, top-N scores with margins to three decimals, PD-2 disjoint firings prominent, four-way action buttons, PD-9 rejects top-property, PD-6 greys out broader targets, PD-7 inherits BFO subcategory, justification required, Novel Promotion shows near-misses non-clickable, Run Phase 3 enabled, **pagination preserving pending-first across 250 candidate relations**.

**Band 6 — Phase 3 Review (7 scenarios).** Groups by violation rule, FailureTrace renders all PS-6 fields, Prolog trace verbatim monospace, copy-to-clipboard, suggested repair prominent, finalize session, **progress indicator animates with per-axiom counter (yielding discipline)**.

**Band 7 — Session Summary (7 scenarios).** Three phase cards, Invariant Audit card, hash-mismatch red X, JSON bundle export, Prolog traces download, Turtle export mode switch, **bundle header with schemaVersion '1.0'**.

**Band 8 — Cross-panel concerns (5 scenarios).** Parse error with line info, invariant firing halts phase, keyboard navigation, color-plus-icon status, **Tau Prolog bundled (no CDN, no window global, no JS substitute)**.

**Band 9 — Acceptance gate (1 scenario).** `prov-o-readiness-end-to-end` — complete Pass 1 through UI, no console commands, no JSON manual extraction. Single scenario is the AC-W-PROV-O gate. **Remains final scenario at index 60.**

---

## What Changed Across Bundle Versions

**v1 → v1.1** (earlier this session): added eight scenarios and four locked decisions addressing developer-flagged risks (file size cap, localStorage quota probe, UI-thread yielding, Configuration Locked message) and series-compatibility scope (pagination/virtualization baseline, bundle schemaVersion).

**v1.1 → v1.2** (current): added two scenarios and four locked decisions addressing the developer's Q1–Q6 questions. All developer questions were addressed by either applying changes to the spec and bundle (Q1, Q3, Q4, Q5, Q6) or confirming existing design (Q2 — ontology parser as new module at `src/core/ingestion/ontology-parser.js`). Additionally, each scenario now carries a `verification_method` field enabling the programmatic/manual test split recommended in the Q5 response.

All changes across versions are forward-compatible. No scenario or decision was weakened.

**New locked decisions in v1.2:**

- **W-D-19** — owl:imports recorded but not followed (deferred to v0.3)
- **W-D-20** — Tau Prolog bundled via esbuild, no JS substitute permitted
- **W-D-21** — RDF parsing via n3.js + rdfxml-streaming-parser; new ontology-parser.js module
- **W-D-22** — verification_method field on all scenarios (programmatic/manual/hybrid)

**New scenarios in v1.2:**

- `upload-owl-imports-recorded-not-followed` — verifies W-3.11 and W-IM-1
- `tau-prolog-bundled-no-cdn` — verifies W-D-20 and W-TP-1; negative assertions forbid window.pl global and JS harness substitution

**New locked decisions in v1.1 (for reference):**

- **W-D-15** — File size cap at 1MB + localStorage quota probe before session creation
- **W-D-16** — Pagination/virtualization baseline on Phase 1 and Phase 2 Review tables
- **W-D-17** — Chunked-yielding Phase 3 execution with animated progress indicator
- **W-D-18** — Bundle export schemaVersion with semantic versioning

**New scenarios:**

- `upload-rejects-oversized-file` — 2MB file rejected with v0.3 pointer
- `upload-quota-probe-insufficient` — Pre-session quota probe guards QuotaExceededError
- `phase1-review-pagination` — 350-row session paginates with global sort
- `phase1-small-ontology-no-pagination-ui` — PROV-O-size sessions show no pagination UI
- `phase2-review-pagination-preserves-pending-first` — 250-row Phase 2 preserves grouping
- `phase3-progress-indicator-animates` — UI thread yielding, per-axiom counter
- `export-bundle-contains-schema-version` — Bundle header for series compatibility
- `upload-config-locked-message-visible` — Explicit recovery guidance, not silent grey-out

---

## Load-Bearing Scenarios for Fast Acceptance

If these ten scenarios pass, Workbench v0.2 is structurally sound:

| # | Scenario | Why load-bearing |
|---|---|---|
| 2 | `mode-switch-preserves-state` | Invariant W-1; workspace-not-wizard |
| 13 | `upload-weight-vector-validation-live` | Invariant W-3 (PD-10); session init gate |
| 19 | `phase1-resolve-requires-justification` | Analyst reasoning capture for Report Appendix A.9 |
| 24 | `phase2-fingerprint-shows-all-dimensions` | Invariant W-2; evidence quality |
| 26 | `phase2-disjoint-firing-displayed-prominently` | Invariant W-3 (PD-2) |
| 28 | `phase2-merge-rejects-top-property` | Invariant W-3 (PD-9) |
| 29 | `phase2-sub-property-greys-broader-targets` | Invariant W-3 (PD-6) / Invariant I-3 |
| 36 | `phase3-prolog-trace-verbatim-monospace` | Invariant W-2; AC-D2-17 carryforward |
| 41 | `summary-invariant-audit-card` | Invariant W-3; report §6.1 support |
| 60 | `prov-o-readiness-end-to-end` | Acceptance gate |

---

## What v0.2 Does NOT Cover

Deliberately out of scope; enumerated here to prevent implementers from feature-creeping:

- Alignment comparison UI (FANDAWS vs external alignment) — test-specific artifact, belongs in report template, not workbench
- Live fingerprint weight vector what-if tuning — deferred to v0.3
- Re-run with different configuration (as a button) — do this with new session in v0.2
- Per-axiom Phase 3 re-run button — v0.3
- Batch resolution (resolve N items with one action) — manual per-item is correct UX for calibration study
- Import-closure handling (owl:imports transitively) — v0.3; PROV-O uses direct-only
- Multi-user / collaborative — not currently planned
- Full WCAG AA accessibility audit — v0.3 (v0.2 has a functional baseline)
- Automated browser testing harness (Playwright/Cypress) — v0.3
- Large-ontology performance tuning — v0.3+; PROV-O is small
- Web Worker execution of Tau Prolog — v0.3 if performance requires

If an implementer finds themselves needing any of the above to complete v0.2, something has been miscategorized. Stop and raise it.

---

## Implementation Sequencing Recommendation

Per locked decision W-D-13:

1. **Mode switcher extension** (Converse / Ingest / Export). Trivial.
2. **Sessions panel + Upload panel** — get a session existing with staging records visible.
3. **Phase 1 Review panel** — simplest review panel. Resolve-with-justification is the core interaction.
4. **Phase 3 Review panel** — before Phase 2. Prolog trace display and FailureTrace rendering are architecturally independent of disambiguation complexity, and easier to build first.
5. **Phase 2 Review panel** — the most complex. Fingerprint breakdown, four-way actions, visible invariant enforcement for PD-6 and PD-9. Benefits from lessons learned in building Phases 1 and 3.
6. **Session Summary panel** — aggregation and invariant audit. Straightforward once reviews exist.
7. **Cross-panel concerns** (state persistence, mode-switch preservation) — implement throughout; validate at each panel milestone.
8. **PROV-O Pass 1 dry run** — final acceptance test.

Estimated total: several days of focused UI work. Not a full sprint.

---

## Integration with PROV-O Test Plan

The PROV-O Calibration Study test plan was drafted before v0.2. v0.2's acceptance gate (AC-W-PROV-O) is specifically that the PROV-O Pass 1 procedure from the test plan §5.2 can be executed end-to-end through the UI.

Spec §9 and the scenario map in Spec Appendix A enumerate which panel supplies which report section:

| Report section | Supplied by |
|---|---|
| §3.1 Placement results table | Phase 1 Review |
| §3.4 Placement case narratives | Phase 1 Review + analyst justifications |
| §4.1 Disambiguation results table | Phase 2 Review |
| §4.3–4.4 Resolution tables | Phase 2 Review + analyst justifications |
| §4.5 PD-2 firings | Phase 2 Review (fired indicator) |
| §5.1–5.2 FailureTrace detail | Phase 3 Review (with verbatim trace copy) |
| §6.1 Invariant audit | Session Summary Invariant Audit card |
| §7.1–7.2 Namespace hygiene | Export Turtle |
| Appendix A.1–A.9 Raw artifacts | Export Session Artifacts JSON Bundle |
| Appendix E Invariant evidence | Session Summary + Prolog Traces bundle |

Every report section supported by a UI artifact. No manual JSON inspection required.

---

## Spot-Check Transcripts Expected After v0.2 Completion

Following the D1 and D2 discipline, when v0.2 is acceptance-certified, three spot-check transcripts should be captured:

1. **End-to-end PROV-O session transcript** — screen-captured walkthrough from Sessions panel through Session Summary export, demonstrating the full AC-W-PROV-O flow
2. **PD-6 visible enforcement transcript** — showing the sub-property promotion target picker greying out a broader-than-parent option with tooltip
3. **Invariant Audit card transcript** — Session Summary card showing all invariants green for a completed PROV-O session

These become reference artifacts for future regression testing at the UI layer.

---

## Handoff Statement

This bundle is the v1.2 acceptance catalog for Workbench v0.2 Ingest mode. The 60 scenarios in `workbench-v0.2-avc-bundle.json` are the contract between the v0.2 specification and the implementation. No scenario is provisional. Each scenario carries a `verification_method` field (programmatic / manual / hybrid) indicating how it is verified: programmatic scenarios run in Jest/Node CI from day one; manual scenarios form the PROV-O Pass 1 dry-run checklist; hybrid scenarios split across both.

Per test-first methodology: codify the programmatic scenarios in the existing Jest harness before the first line of Ingest mode code. For manual scenarios, prepare a written checklist keyed to scenario IDs. Hybrid scenarios need both.

v0.2 ships when scenario 60 (`prov-o-readiness-end-to-end`) passes with Aaron at the keyboard completing PROV-O Pass 1 through the UI. Everything else is reinforcement.

— end —
