# Fandaws-Sentinel Workbench v0.2 Specification
**Ingest Mode — Edge-Canonical Workspace for Bulk Ontology Ingestion**
**Version:** 1.0 (Implementation-Ready)
**Status:** Awaits implementation. AVC bundle companion: `workbench-v0.2-avc-bundle.json`
**Parent specs:** FANDAWS v2.1, Phase D1 spec, Phase D2 spec v1.0
**Depends on:** Phase D2 complete and certified (178/178 AVC scenarios). Workbench v0.1 Converse + Export modes.

---

## Revision Preamble

### Scope Statement

Workbench v0.2 adds **Ingest mode** as a third top-level workspace alongside Converse and Export. Ingest mode is the UI surface for the D1/D2 bulk ingestion pipeline — before v0.2, the pipeline has functional JavaScript + Tau Prolog implementations with a 178-scenario AVC suite but no UI. An analyst can trigger ingestion only by issuing console commands and reading JSON logs.

The primary driver for v0.2 is the PROV-O Calibration Study (see `fandaws-provo-test-plan.md`), which requires a UI that lets the analyst perform three-phase ingestion with resolution decisions captured as structured artifacts ready to populate the study report. The secondary driver is general testability: anyone evaluating FANDAWS who is not a FANDAWS developer needs a UI to exercise the D1/D2 pipeline.

v0.2 is scoped to deliver exactly the UI that makes PROV-O testable plus the minimum state persistence needed for multi-day analysis. It deliberately does NOT deliver: alignment comparison UIs, re-run-with-tweaked-config buttons, live fingerprint-weight-vector tuning, or any feature oriented toward ontology editors who want to modify promoted classes in-place. Those remain conversational-pipeline concerns addressed through Converse mode.

### Design Invariants (Load-Bearing)

Three invariants govern the v0.2 UI shape. Violations require architectural review, not a fix-as-you-go pass:

- **Invariant W-1 — Workspace, not wizard.** Ingest mode is a persistent workspace with panels that can be navigated non-linearly. The analyst may move between Phase 1, Phase 2, Phase 3 Review panels in any order, pause mid-phase to switch to Converse mode, and return with state intact. A wizard (forced linear progression) would fight the actual workflow where batch ingestion and conversational reflection interleave.

- **Invariant W-2 — UI never simplifies the analyst's evidence.** Fingerprint breakdowns show all six dimensions with weighted contributions. FailureTraces show the Prolog trace verbatim in monospace. Margin calculations are explicit. If the UI rounds, summarizes, or elides information the analyst needs to write a disagreement case analysis, the UI has weakened the test value of the underlying pipeline.

- **Invariant W-3 — Invariants visibly enforced at the UI layer.** PD-6 structural narrowing (sub-property promotion target picker greys out broader-than-parent choices). PD-9 named-property-only merges (merge target selector rejects `owl:topObjectProperty`). PD-10 weight vector bounds (session configuration form rejects invalid weights at submit). PS-1 sandbox purity (content-hash display on Session Summary shows before/after equality). The analyst sees the invariants holding, not just the system enforcing them silently.

### What Changed from v0.1

v0.1 shipped Converse mode and Export mode. v0.2 adds Ingest mode and extends session persistence:

- **Converse mode:** unchanged. Continues to support CC Path A/B conversational consistency checking.
- **Export mode:** unchanged. Continues to emit Turtle from the live canonical graph.
- **Ingest mode:** new. Six panels (Sessions / Upload / Phase 1 Review / Phase 2 Review / Phase 3 Review / Session Summary).
- **State persistence:** extended to `localStorage` for IngestionSession records, staging records, disambiguation records, merge records, and quarantine records. Sessions survive page reloads. Explicit "clear all sessions" action available for test hygiene.
- **Mode switcher:** extended from two tabs to three. State of non-active modes preserved when switching.

No existing v0.1 functionality is modified or removed.

---

## 1. Scope and Continuity

### 1.1 What v0.1 Established (Carried Forward Unchanged)

- Converse mode: single-assertion conversational input, CC Path A/B checking with consequence prompts, MachineSignal envelope pattern.
- Export mode: Turtle serialization of canonical graph, exclusion-list filtering of staging/quarantine records, namespace prefix declarations.
- Mode switcher at top of workspace.
- Edge-canonical first principle: browser-only, no backend, Node.js-compatible for testing.

### 1.2 What v0.2 Adds

- Ingest mode with six panels (§2 through §7 of this spec).
- localStorage persistence for ingestion session artifacts.
- Mode switcher extended to three modes.
- Invariant-visible affordances per Invariant W-3.
- Session-archiving mechanism supporting the PROV-O test's two-pass blind/comparative structure.

### 1.3 What v0.2 Explicitly Defers to Later Workbench Versions

| Capability | Deferred to | Reason |
|---|---|---|
| Alignment comparison UI (FANDAWS vs external alignment) | v0.3 or later | Test-specific artifact; belongs in the report template, not in the workbench |
| Re-run with different configuration | v0.3 | Implementable via "new session" today; dedicated UI is polish |
| Live fingerprint weight vector visualization | v0.3 | Useful for calibration tuning but not required for first real-world test |
| In-place editing of promoted canonical classes in Ingest mode | Never — this belongs in Converse mode | Preserves D1 Decision D-2 pipeline separation |
| Per-axiom Phase 3 re-run button | v0.3 | Spec supports the capability (v2.1 §3.8.4) but UI surface is beyond PROV-O scope |
| Batch Phase 2/Phase 3 resolution (resolve N items with one action) | v0.3 | Manual per-item resolution is the correct UX for a calibration study |
| Multi-user or collaborative ingestion | Not currently planned | FANDAWS is single-operator edge-canonical |
| Import-closure handling (follow owl:imports transitively) | v0.3 | PROV-O test uses direct-only; closure behavior deserves its own acceptance testing |

### 1.4 Edge-Canonical First Principle (Preserved)

Ingest mode runs entirely in the browser with no backend. All persistence is `localStorage`. All ingestion pipeline execution (D1 and D2 including Tau Prolog) runs in the browser thread (or a Web Worker in implementations that choose that refinement, though v0.2 does not require it). File uploads are read via `FileReader` API; no upload-to-server. Pasted Turtle is parsed in-browser.

---

## 2. Panel 1 — Sessions

### 2.1 Purpose

The Sessions panel is the entry point to Ingest mode. It lists all IngestionSession records (active and completed), surfaces their current state, and provides the action to create a new session. It is what the analyst sees first when switching to Ingest mode, and what they return to between sessions.

### 2.2 UI Structure

**Main area:** A list of session cards. Each card displays:
- Session ID (short form)
- Source ontology IRI and short name
- Started date/time, completed date/time (if complete)
- Current phase: "Uploading" / "Phase 1 In Progress" / "Phase 1 Complete — Phase 2 Pending" / "Phase 2 In Progress" / "Phase 2 Complete — Phase 3 Pending" / "Phase 3 In Progress" / "Session Complete"
- Summary counts: classesIngested, classesPlaced, candidateRelationCount, candidateAxiomCount, quarantinedCount, blocking-items-count
- Blocking indicator: red pill "N items blocking phase N+1" when PendingHumanResolution items exist

**Top bar:** "New Ingestion Session" button. Starts an empty session and navigates to the Upload panel.

**Empty state:** When no sessions exist, main area shows instructional text with "New Ingestion Session" as the only action.

### 2.3 Interactions

- **Click a session card:** Navigates to the appropriate phase review panel for that session's current state. If blocking items exist, navigates to the panel containing the blocker.
- **New Session button:** Creates a new IngestionSession with a generated ID and navigates to Upload panel.
- **Session card hover:** Shows additional metadata tooltip (Tau Prolog version, weight vector, Horn cap — the full configuration from §2.3 of the D2 spec).
- **No delete action in v0.2.** Per Rule VD-5, sessions are never deleted. Implementations MAY provide a "clear all sessions" action for test hygiene but it is destructive and must be confirmed.

### 2.4 Acceptance Criteria

- **W-2.1:** Sessions list renders all IngestionSession records from `localStorage`.
- **W-2.2:** Each session card displays current phase derived from session state (staging records exist but Phase 1 not triggered → "Phase 1 Pending"; Phase 1 complete with no PendingHumanResolution items → "Phase 1 Complete — Phase 2 Pending"; etc.).
- **W-2.3:** Blocking-items indicator shows count of PendingHumanResolution items across all currently-active phases for that session.
- **W-2.4:** "New Ingestion Session" button creates a session with a fresh UUID and navigates to Upload panel.
- **W-2.5:** Clicking a session card with phase "Phase 2 In Progress" and blocking items navigates directly to Phase 2 Review panel with that session active.
- **W-2.6:** Empty state displays when `localStorage` contains zero sessions.
- **W-2.7:** Sessions persist across page reloads (localStorage-backed).

---

## 3. Panel 2 — Upload

### 3.1 Purpose

Upload panel lets the analyst provide the source ontology (Turtle/OWL file or pasted text) and configure ingestion session parameters. It is where the session becomes concrete — staging records created, Phase 1 sandbox triggered.

### 3.2 UI Structure

**Top:** Session ID display (read-only, generated by the New Session action).

**Source input block:**
- File input: accepts `.ttl`, `.owl`, `.rdf`, `.n3`, `.nt`
- Paste area: textarea for direct paste of source text
- Format auto-detection: attempted from file extension or content sniff; displayed as confirmed-or-override

**Configuration block** — the six parameters from D2 spec §2.3, presented as a collapsible panel titled "Session Configuration (advanced)" with defaults shown:
- Source ontology IRI (auto-extracted from imported content, editable)
- Auto-merge threshold (default 0.85)
- Auto-merge margin (default 0.05)
- Disambiguation floor (default 0.60)
- Fingerprint weight vector (default D-9; all six weights editable)
- Horn inference step cap (default 10,000)
- Placement confidence delta (default 0.15)

**Weight vector validation display:** Shows structural sum (target ≥ 0.70) and lexical weight (target ≤ 0.10) as live values with red/green indicators per PD-10.

**Start button:** "Start Session & Run Phase 1" — creates staging records, runs Phase 1 class placement sandbox, navigates to Phase 1 Review panel.

### 3.3 Interactions

- **File upload:** Reads file via `FileReader`, displays source size and estimated class/property counts in preview.
- **Paste:** Same preview on input.
- **Advanced config toggle:** Expands configuration block. Collapsed by default — analyst using default configuration should not have to navigate the full parameter set.
- **Weight vector edits:** Live validation; Start button greys out if PD-10 bounds violated.
- **Start button:**
  - Validates configuration (structural sum, lexical cap, other sanity checks).
  - On validation failure, displays structured error naming the offending parameter and bound violated.
  - On success, writes IngestionSession record with configuration snapshot, creates CandidateClass staging records, invokes Phase 1 sandbox, navigates to Phase 1 Review.

### 3.4 Acceptance Criteria

- **W-3.1:** File upload accepts Turtle, OWL, RDF, N3, NT formats; rejects others with clear error.
- **W-3.2:** Paste input accepts same formats; format auto-detection visible and editable.
- **W-3.3:** Source preview shows estimated class count and property count before Start.
- **W-3.4:** Default configuration visible in advanced panel; six parameters editable.
- **W-3.5:** Weight vector validation live per PD-10; Start button disabled when bounds violated; structured error identifies offending parameter.
- **W-3.6:** Start button triggers Phase 1 sandbox, creates session + staging records, navigates to Phase 1 Review.
- **W-3.7:** Configuration is immutable after session start; Upload panel is read-only for completed sessions. The read-only Start button displays the text "Configuration Locked. Start a New Session to change parameters." — not just a greyed-out button, but explicit guidance toward the correct recovery action.
- **W-3.8:** Tau Prolog version recorded on the IngestionSession at start (per Rule D2-2).
- **W-3.9:** File size validation on upload. Uploaded files exceeding 1MB (1,048,576 bytes) are rejected with the message: "Workbench v0.2 is calibrated for small ontologies (e.g., PROV-O, ~50KB). Larger ontology support is deferred to v0.3. File received: [size]." Pasted text content is also subject to the 1MB limit. Rationale: browsers enforce a synchronous 5MB localStorage quota per origin, and a single oversized session can brick the UI by triggering QuotaExceededError mid-save. The 1MB source limit reserves sufficient headroom for staging records, merge records, quarantine records, and analyst justifications across the session's lifecycle.
- **W-3.10:** Before session creation, available localStorage quota is probed via a small write-delete test. If quota is insufficient (less than 2MB free), upload is rejected with guidance to clear older sessions from the Sessions panel. This is defense-in-depth against the QuotaExceededError failure mode.
- **W-3.11:** `owl:imports` declarations present in the uploaded source are recorded in the IngestionSession metadata (as `declaredImports: [IRI, IRI, ...]`) but NOT followed during ingestion. Only classes and properties directly declared in the uploaded file are treated as candidates. References to entities in imported ontologies (e.g., PROV-O's references to `time:` or `foaf:` IRIs) appear as external IRIs in domain/range positions and are handled by the D1/D2 pipeline's existing external-reference machinery. Full import-closure handling is deferred to v0.3. Rationale: following imports transitively would turn a PROV-O ingestion into a multi-ontology batch, which is out of scope for v0.2's calibration-study design (test plan §2.2 specifies direct-only).

---

## 4. Panel 3 — Phase 1 Review

### 4.1 Purpose

Phase 1 Review shows the results of the class placement sandbox for the active session. The analyst reviews placement dispositions, resolves PlacementAmbiguous items, and advances to Phase 2 when ready.

### 4.2 UI Structure

**Top bar:** Session ID (link back to Sessions panel), phase status badge, phase counts summary (total candidates, PlacementConfirmed, PlacementAmbiguous, PlacementRejected).

**Main area:** Table of CandidateClass staging records, one row per class:
- Source IRI
- Source label
- Source superclass (if declared)
- Placement (BFO node) — editable for PendingHumanResolution rows
- Confidence score
- Status badge (PlacementConfirmed / PlacementAmbiguous / PlacementRejected / PendingHumanResolution)
- Justification (expandable row detail showing the full justification string)
- Action cell: for PendingHumanResolution rows, inline "Resolve" action

**Sort and filter:**
- Filter: All / Confirmed / Ambiguous / Rejected / Pending
- Sort: by label, by confidence, by status
- Default: status (Pending first, then Ambiguous, then Confirmed, then Rejected)

**Resolve interaction** (for each PendingHumanResolution row):
- Expanding the row reveals: "Select placement" dropdown populated with BFO nodes the sandbox considered (plus "Other — specify BFO node" option), and a required justification textarea.
- "Confirm resolution" button commits the placement, updates status to PlacementConfirmed, records the analyst's justification, and promotes the class to canonical.

**Bottom bar:**
- Blocking-items counter: "N items still require resolution"
- "Run Phase 2" button: enabled only when blocking count is zero; greyed out otherwise with tooltip "N items in PendingHumanResolution blocking Phase 2"

### 4.3 Interactions

- **Expand row:** Shows justification string in full; for PendingHumanResolution, shows the resolution UI.
- **Resolve action:** Requires both a placement selection AND a non-empty justification. Save is disabled until both provided.
- **Run Phase 2 button:** Only active when Phase 1 has zero PendingHumanResolution items (enforces Rule D2-1 / Decision D-18). Clicking triggers the disambiguation router on all CandidateRelation records and navigates to Phase 2 Review.

### 4.4 Acceptance Criteria

- **W-4.1:** Table renders all CandidateClass records for the active session.
- **W-4.2:** Each row displays placement, confidence, status, and justification.
- **W-4.3:** PendingHumanResolution rows display inline resolution UI on expand.
- **W-4.4:** Resolution requires both placement selection and non-empty justification; submit disabled otherwise.
- **W-4.5:** Analyst justification text is stored permanently on the CandidateClass record (becomes part of Pass 1 analyst reasoning log — Appendix A.9 in the PROV-O report template).
- **W-4.6:** Run Phase 2 button is greyed out while any PendingHumanResolution remains; clicking (when enabled) triggers Phase 2 and navigates.
- **W-4.7:** Run Phase 2 button tooltip names specific blocking items when hovered in greyed state.
- **W-4.8:** Status filter works; default sort surfaces blocking items first.
- **W-4.9:** For previously-resolved items, the justification text is read-only but visible (audit trail).
- **W-4.10:** Table supports pagination or virtualization for large result sets. Default page size: 100 rows. For sessions with more than 100 CandidateClass records, UI renders only the visible page (virtualized scroll) or paginates with page-forward/back controls. Pagination is invisible overhead for small ontologies (≤ 100 classes) where no pagination UI is shown. Blocking-items navigation must still work correctly across pages — clicking a session card with blocking items must land the analyst on the page containing the first blocker, not just page 1.
- **W-4.11:** Default sort (blocking items first) operates across ALL rows, not just the current page. Filter operates globally.

---

## 5. Panel 4 — Phase 2 Review

### 5.1 Purpose

Phase 2 Review shows the disambiguation dispositions for every CandidateRelation in the active session. This is the most information-dense panel in the workbench because the fingerprint breakdown, top-N candidate scores, and four-way action resolution all live here.

### 5.2 UI Structure

**Top bar:** Session ID link, phase status badge, disposition counts (AutoMerged / DisambiguationRecord / NovelPromotionPanel / Rejected / Blocking).

**Main area:** Two-pane layout:
- **Left pane:** List of CandidateRelation records grouped by disposition. Status-first sort: PendingHumanResolution (DisambiguationRecord and Novel Promotion) first, then AutoMerged, then Rejected. Each list item shows label, top score, and disposition badge.
- **Right pane:** Detail view of the selected candidate. Changes based on disposition.

**Right pane detail — DisambiguationRecord case:**

*Fingerprint section:*
- Candidate fingerprint displayed as a six-dimension table:
  | Dimension | Value | Weight |
  |---|---|---|
  | Domain BFO category | bfo:... | 0.30 |
  | Range BFO category | bfo:... | 0.30 |
  | BFO subcategory | Quality/Disposition/Role/null | 0.15 |
  | Characteristics | {...} | 0.10 |
  | allowsInheresIn | true/false | 0.05 |
  | Lexical similarity to top match | decimal | 0.10 |

*Top-N candidate matches section:*

For each proposed match (top 3), a card displays:
- Target canonical relation IRI and label
- Total score (decimal to three places)
- Per-dimension contribution breakdown (each of the six dimensions × its weight = contribution; sum = total score)
- Margin to next candidate (for top), Margin to top (for second and third)

*Disjoint firing indicator:* If PD-2 forced any candidate score to 0.0, displayed prominently with "Disjoint: bfo:X × bfo:Y forced match to 0.0" per disjoint pair.

*Resolution actions:* Four buttons — Merge / Reject / PromoteAsSubProperty / PromoteAsNewRelation.
- Merge: opens target-picker listing proposed matches with named-property-only validation (PD-9); rejects `owl:topObjectProperty` and any schema-top target.
- Reject: requires rejection reason text field.
- PromoteAsSubProperty: opens parent-picker showing proposed matches + target fingerprint picker for child. Child domain/range selector visibly greys out any BFO node that is not a subclass of the parent's domain/range (PD-6 visible enforcement). Parent BFO subcategory is auto-inherited and read-only (PD-7).
- PromoteAsNewRelation: minimal form; most fields pre-filled from the candidate fingerprint; analyst confirms.

*Resolution justification:* Required textarea for all four actions.

**Right pane detail — NovelPromotionPanel case:**

- Fingerprint section (same as above)
- "No proposed matches above 0.60 disambiguation floor" explanatory text
- Top-3 scored below floor shown for reference (so analyst can see near-misses) but not as clickable merge targets
- Resolution actions: PromoteAsNewRelation (default), Reject, manual-Merge override (requires typing the target IRI)

**Right pane detail — AutoMerged case (read-only):**
- Fingerprint section
- Target canonical (auto-merge winner)
- Winning score and margin
- MergeRecord link (to view the emitted record)

**Bottom bar:**
- Blocking-items counter
- "Run Phase 3" button: enabled only when blocking count is zero

### 5.3 Interactions

- **Select candidate in left pane:** Loads detail in right pane.
- **Resolve action (four-way buttons):** Per-action form as described in 5.2. Submit writes MergeRecord (or creates the newly promoted canonical) and updates the candidate to Normalized status.
- **PD-6 visible enforcement:** In sub-property promotion target picker, options that would produce a broader-than-parent child are displayed in grey with a tooltip "Target broader than parent — not allowed (Invariant I-3, Rule PD-6)".
- **PD-9 enforcement:** In merge target picker, `owl:topObjectProperty` and any other schema-top property is not listable; manual-override text field rejects with structured error.
- **Run Phase 3 button:** Enabled when zero PendingHumanResolution. Clicking builds the Tau Prolog fact base, instantiates a new session, runs Phase 3, navigates to Phase 3 Review. During this, a progress indicator is shown (fact-base serialization is the slowest step; Phase 3 execution itself should be sub-second for PROV-O-sized input).

### 5.4 Acceptance Criteria

- **W-5.1:** Left pane lists all CandidateRelation records for the session grouped by disposition; PendingHumanResolution items first.
- **W-5.2:** Right pane fingerprint section shows all six dimensions with values and weights, no abbreviation or summarization (Invariant W-2).
- **W-5.3:** Top-N candidate matches card shows per-dimension contribution breakdown; analyst can reconstruct the total score by summing.
- **W-5.4:** Margin to next/top candidate displayed with three decimal places.
- **W-5.5:** PD-2 disjoint firings are prominently indicated when present.
- **W-5.6:** Four-way resolution actions present and functional for every DisambiguationRecord.
- **W-5.7:** Merge target picker rejects `owl:topObjectProperty` (PD-9). Manual override text field also rejects with structured error.
- **W-5.8:** Sub-property promotion target picker visibly greys out broader-than-parent options (PD-6 visible enforcement — Invariant W-3).
- **W-5.9:** Sub-property promotion auto-inherits parent's BFO subcategory; child subcategory field is read-only (PD-7).
- **W-5.10:** Resolution justification textarea is required and non-empty before submit.
- **W-5.11:** Novel Promotion panel case shows top-3 scored below floor for reference; these are not clickable merge targets.
- **W-5.12:** AutoMerged case is read-only with link to emitted MergeRecord.
- **W-5.13:** Run Phase 3 button enables only when zero PendingHumanResolution remains.
- **W-5.14:** Phase 3 trigger displays progress indicator during fact-base serialization and Tau Prolog execution. The progress indicator MUST visibly update (spinner animates, progress text updates) during execution — a frozen spinner is non-conformant. Implementation uses `setTimeout` or `requestAnimationFrame` chunking between axiom evaluations to yield the browser thread; Web Worker migration remains deferred to v0.3 per Decision W-D-9.
- **W-5.15:** Left pane candidate list supports pagination or virtualization for large result sets. Default page size: 100 rows. Grouping by disposition is preserved across pages — the analyst should never have to page-forward to find all PendingHumanResolution items; these are always surfaced first. Selection of a candidate navigates the right pane regardless of page position.
- **W-5.16:** Phase 3 progress indicator displays current-axiom-count and total-axiom-count during execution (e.g., "Processing axiom 47 of 284"), not just a generic spinner. This gives the analyst feedback that the thread is making progress, not frozen.

---

## 6. Panel 5 — Phase 3 Review

### 6.1 Purpose

Phase 3 Review shows the results of the Tau Prolog consistency sandbox: which candidate axioms passed with NoViolations, which were quarantined with FailureTraces, and the full engine derivation for each quarantined axiom.

### 6.2 UI Structure

**Top bar:** Session ID link, phase status badge, summary counts (candidateAxiomCount, noViolationsCount, quarantinedCount, hornUnboundedCount, axiomTypeUnrecognizedCount).

**Main area:** Two-pane layout:
- **Left pane:** List of candidate axioms grouped by outcome. Quarantined items grouped by violation rule (TypeDisjointnessViolation, RangeMismatchViolation, DomainMismatchViolation, CycleViolation, DisjointnessContradictionViolation, HornDerivationUnbounded, AxiomTypeUnrecognized). NoViolations axioms in a separate section.
- **Right pane:** Detail view of the selected axiom.

**Right pane detail — Quarantined case:**

*Axiom summary:*
- Axiom IRI
- Axiom type
- Subject / predicate / target triple in plain display

*FailureTrace fields* — tabular, all eight (or more) required fields (per Rule PS-6):
- violationRule
- relation
- subjectNode
- objectNode
- subjectType (BFO category)
- objectType (BFO category)
- disjointPair (if applicable)
- inferenceStepsUsed
- ruleSetVersion
- producedAt

*Prolog derivation trace:*
- Displayed in monospace block, verbatim (Invariant W-2).
- Call/Exit/Redo entries preserved.
- Copy-to-clipboard button for archival.
- Line count displayed ("14 lines" or similar).

*Suggested repair:*
- Displayed prominently as the primary affordance above the fold.
- Full text from the FailureTrace, no truncation.
- Formatted as a highlighted box (not just inline text).

**Right pane detail — NoViolations case:**

- Axiom summary
- Pass indicator with inferenceStepsUsed
- Link to canonical compilation target (if axiom compiled to Execution Lane)

**Bottom bar:**
- "Finalize Session" button: closes the session (sets sessionCompletedAt), navigates to Session Summary.
- "Re-run Sandbox" button: for debugging — not PROV-O-critical. Can be hidden in release UI. Requires confirmation dialog noting that re-running creates a new session ID per Rule PS-2.

### 6.3 Interactions

- **Select axiom in left pane:** Loads detail in right pane.
- **Copy Prolog trace:** Copies verbatim engine output to clipboard. Matching format is critical — the analyst will paste this directly into the PROV-O report template §5.2.
- **Finalize Session:** Sets sessionCompletedAt timestamp, writes Phase 3 summary block to IngestionSession record, navigates to Session Summary.

### 6.4 Acceptance Criteria

- **W-6.1:** Left pane lists all candidate axioms grouped by outcome; quarantined items sub-grouped by violation rule.
- **W-6.2:** Right pane FailureTrace section shows all required fields per Rule PS-6.
- **W-6.3:** Prolog trace displayed verbatim in monospace block; Call/Exit/Redo entries preserved (AC-D2-17 carried forward from D2 spec).
- **W-6.4:** Prolog trace copy-to-clipboard button emits the exact engine output suitable for paste into report template §5.2.
- **W-6.5:** Suggested repair displayed prominently above the fold as highlighted box (Invariant W-2 — primary affordance).
- **W-6.6:** NoViolations case shows inferenceStepsUsed and links to compilation target where applicable.
- **W-6.7:** Finalize Session writes sessionCompletedAt, Phase 3 summary block, and navigates.
- **W-6.8:** Re-run Sandbox action (if exposed) requires confirmation and creates new session ID per PS-2.

---

## 7. Panel 6 — Session Summary

### 7.1 Purpose

Session Summary is the final view of a completed ingestion session. It presents aggregate results, confirms the invariant audit visibly, and provides the entry point to export the canonical graph.

### 7.2 UI Structure

**Top:** Session metadata block (ID, source ontology, started/completed timestamps, duration, configuration snapshot).

**Phase summary blocks** — three cards, one per phase:
- **Phase 1 Summary Card:** candidateClassCount, placementConfirmedCount, placementAmbiguousCount, placementRejectedCount. Link to Phase 1 Review.
- **Phase 2 Summary Card:** candidateRelationCount, autoMergedCount, humanMergedCount, promotedNewCount, promotedSubPropertyCount, rejectedCount. Link to Phase 2 Review.
- **Phase 3 Summary Card:** candidateAxiomCount, noViolationsCount, quarantinedCount (sub-broken by rule), hornUnboundedCount. Link to Phase 3 Review.

**Invariant Audit Card** — visible confirmation of key invariants for this session:
- PS-1 sandbox purity: canonical graph SHA-256 before Phase 3 / after Phase 3 / equality status (green check when equal)
- PS-2 fresh Phase 3 session: Phase 3 session ID distinct from any prior session
- PS-9 closure as ground facts: fact-base summary confirming no recursive subclass clauses
- PD-2 disjoint firings: count of PD-2 firings observed this session
- PD-10 weight vector applied: structural sum and lexical weight shown
- Horn inference step cap effective: 10,000 (or configured)
- Tau Prolog version recorded

*This card is the UI expression of Invariant W-3 — the analyst sees the invariants holding for this specific session.*

**Records inventory:**
- MergeRecord count with link to a MergeRecord list view (simple table)
- DisambiguationRecord count (resolved and any remaining)
- QuarantineRecord count with link to Phase 3 Review

**Export block:**
- "Export Canonical Graph as Turtle" button → triggers Export mode with this session's scope active
- "Export Session Artifacts as JSON Bundle" button → generates a JSON bundle suitable for archival (per PROV-O test plan §5.2 Pass 1 artifact archival requirement)
- "Download Prolog Traces" button → generates a bundle of all Phase 3 Prolog traces verbatim

### 7.3 Interactions

- **Navigate to phase panel:** Phase summary cards link to the corresponding Review panel for spot-checking.
- **Export Turtle:** Switches mode to Export with session-scoped context.
- **Export JSON Bundle:** Generates downloadable JSON containing all session artifacts:
  - Bundle header: `schemaVersion` field (string, e.g., "1.0"), `workbenchVersion` field (string, e.g., "0.2"), `fandawsVersion` field (string, e.g., "2.1 + D2 v1.0"), `generatedAt` timestamp
  - IngestionSession record
  - All staging records (CandidateClass, CandidateRelation, CandidateAxiom)
  - All MergeRecords
  - All DisambiguationRecords (resolved and surface records)
  - All QuarantineRecords with full FailureTraces including Prolog traces
  - Analyst resolution justifications (Phase 1 and Phase 2 resolutions)
  - Configuration snapshot
  - Invariant audit results
- **Download Prolog Traces:** Generates a separate downloadable file containing every Prolog trace from the session, tagged with its corresponding axiom IRI and violation rule.

### 7.4 Acceptance Criteria

- **W-7.1:** Session metadata block displays all recorded session fields.
- **W-7.2:** Three phase summary cards display counts from IngestionSession phase1Summary, phase2Summary, phase3Summary.
- **W-7.3:** Invariant audit card displays PS-1 hash equality (before/after SHA-256 values), PS-2 session ID, PS-9 closure confirmation, PD-2 firing count, PD-10 weight vector, Horn cap, Tau Prolog version.
- **W-7.4:** PS-1 hash equality is displayed with a green check when hashes match, red X when they do not (the latter indicates implementation bug).
- **W-7.5:** MergeRecord count links to a simple table view showing every merge with source IRI, canonical target, and equivalencyAssertion.
- **W-7.6:** Export Turtle button triggers Export mode with session-scoped canonical graph.
- **W-7.7:** Export JSON Bundle generates a downloadable JSON containing all artifacts enumerated in 7.3, including the bundle header with `schemaVersion`, `workbenchVersion`, `fandawsVersion`, and `generatedAt` fields. The schemaVersion enables cross-session and cross-test comparison (critical for the calibration-study series where Test 1 bundles must remain parseable by later tooling versions).
- **W-7.8:** Download Prolog Traces generates a downloadable file with every trace verbatim.
- **W-7.9:** Session Summary is read-only; no edit actions in this panel.
- **W-7.10:** Bundle header `schemaVersion` follows semantic versioning (MAJOR.MINOR). v0.2 ships with schemaVersion "1.0". Any future schema change that removes or renames fields increments MAJOR; additions increment MINOR. Tools consuming bundles must tolerate unknown additive fields (MINOR changes).

---

## 8. Cross-Panel Concerns

### 8.1 Mode Switching and State Persistence

**Rule W-SP-1:** Switching between Converse, Ingest, and Export modes preserves state for all three modes. Ingest mode state includes: currently-selected session, currently-viewed panel within Ingest, scroll position within the panel, any in-progress resolution form contents.

**Rule W-SP-2:** Page reload restores the last-active session and panel where possible. All IngestionSession records, staging records, MergeRecords, DisambiguationRecords, QuarantineRecords, and analyst justifications persist in `localStorage`.

**Rule W-SP-3:** In-progress resolution forms (partially-filled justification text, partial dropdown selection) are preserved across mode switches within the same page session. They are NOT required to persist across page reloads — that would over-complicate the state model.

### 8.2 Session Isolation

**Rule W-SI-1:** Only one session is "active" for review at any time. Switching to a different session navigates to that session's appropriate phase panel. The active session's ID is displayed in the top bar of every Ingest panel.

**Rule W-SI-2:** Changes to session A (e.g., resolving a Phase 2 disambiguation) do not affect session B, even if they share source IRIs. Sessions are independent per Rule PS-2 carried forward.

### 8.3 Error Handling

**Rule W-EH-1:** Parsing errors on upload (malformed Turtle, unsupported format) are displayed with specific line/position information where available. The session is not created; the analyst remains on the Upload panel.

**Rule W-EH-2:** Pipeline errors during Phase 1/2/3 execution (e.g., Tau Prolog consulting failure, fact-base serialization failure) are displayed with enough detail for the developer to file a bug report but do not corrupt the session. The session remains in its last consistent state.

**Rule W-EH-3:** An invariant firing as a violation during execution (e.g., PS-1 hash mismatch, PS-9 recursive clause detected) halts the current phase, displays a prominent error banner naming the invariant and the evidence, and does not permit progression. Per TA-8 of the PROV-O test plan, this condition invalidates any in-progress study and requires a bug report before proceeding.

### 8.4 Accessibility

**Rule W-A-1:** All interactive elements are keyboard-accessible.
**Rule W-A-2:** Color is not the sole carrier of meaning — status indicators pair color with iconography or text.
**Rule W-A-3:** Monospace Prolog trace blocks have copy-to-clipboard for analysts who need to paste into external tools.
**Rule W-A-4:** Resolution forms are fully keyboard-navigable; justification textareas support standard edit bindings.

Note on v0.2 scope: accessibility is required but not exhaustive (no full WCAG AA audit in this release). Explicit WCAG compliance is deferred to v0.3.

### 8.5 Visible Invariant Enforcement (Invariant W-3 Catalog)

The complete list of invariants visibly enforced in v0.2 UI:

| Invariant / Rule | Panel | Visible Enforcement |
|---|---|---|
| PD-10 (weight vector bounds) | Upload | Start button disabled when structural sum < 0.70 or lexical > 0.10; structured error names offending parameter |
| PD-2 (disjoint hard floor) | Phase 2 Review | Disjoint firings displayed prominently with "Disjoint: bfo:X × bfo:Y forced match to 0.0" |
| PD-4 (auto-merge margin) | Phase 2 Review | Margin displayed to three decimals; near-tie cases (<0.05) visibly route to DisambiguationRecord |
| PD-6 (structural narrowing) | Phase 2 Review — sub-property promotion picker | Broader-than-parent targets greyed out with tooltip explaining why |
| PD-7 (BFO subcategory inheritance) | Phase 2 Review — sub-property promotion picker | Parent's subcategory auto-filled and read-only on child |
| PD-9 (named-property only merges) | Phase 2 Review — merge target picker | `owl:topObjectProperty` and schema-top targets not listable; manual entry rejected |
| PS-1 (sandbox purity) | Session Summary — Invariant Audit card | Before/after SHA-256 equality displayed with green check |
| PS-2 (fresh session per run) | Session Summary — Invariant Audit card | Phase 3 session ID displayed, compared to prior |
| PS-6 (complete FailureTrace) | Phase 3 Review | All required fields displayed in FailureTrace section; missing fields would be visible as blanks |
| PS-8 (inference cap immutable) | Upload (after session start) | Horn cap is read-only on active sessions; attempt to reconfigure shows error |
| PS-9 (closure as ground facts) | Session Summary — Invariant Audit card | Fact base summary confirms no recursive subclass clauses |

The analyst glancing at Session Summary should be able to confirm, in under a minute, that every invariant applicable to this session held.

---

## 9. Acceptance Gate — PROV-O Readiness

### 9.1 The Gate Condition

Workbench v0.2 is "shipped" when the following single acceptance criterion holds:

**AC-W-PROV-O:** Aaron can complete a full PROV-O ingestion (upload → Phase 1 Review → Phase 2 Review → Phase 3 Review → Session Summary → export) using only the UI, with the resulting session data sufficient to populate the FANDAWS D2 PROV-O Calibration Study report template through §7 (Namespace Hygiene) without manual JSON extraction or console-command intervention.

"Sufficient to populate" means:
- The Category 1 placement results table (report §3.1) can be filled from the Phase 1 Review panel.
- The Category 2 disambiguation results table (report §4.1) can be filled from the Phase 2 Review panel.
- The Category 3 FailureTrace subsections (report §5.2) can be filled from the Phase 3 Review panel, with Prolog traces copied verbatim from the UI.
- The Category 4 Invariant Audit matrix (report §6.1) can be filled from the Session Summary Invariant Audit card.
- The Category 5 Namespace Hygiene checklist (report §7.1) can be filled from the exported Turtle.
- Pass 1 analyst resolution justifications (report Appendix A.8, A.9) are captured in the UI and exported via the JSON bundle.

The gate is satisfied by successful execution of the PROV-O test plan's Pass 1. The test itself does not need to be analysis-complete (Pass 2 and subsequent analysis can occur after v0.2 is declared shipped); what's required is that Pass 1 can be executed end-to-end through the UI.

### 9.2 What the Gate Does Not Require

- The PROV-O test producing interesting findings (that's a separate question).
- UI polish beyond functional completeness — v0.2 is the first Ingest mode release; v0.3 will refine based on the PROV-O study's observations.
- Accessibility WCAG AA audit — deferred to v0.3.
- Performance benchmarking at scale — PROV-O is small (~30 classes, ~30 properties); large-ontology performance is v0.3+ concern.
- Workbench AVC scenarios being written before UI implementation — the AVC bundle for Workbench v0.2 (`workbench-v0.2-avc-bundle.json`) is authored concurrently with this spec and serves as the UI-level test harness, distinct from the D1/D2 pipeline AVC scenarios.

### 9.3 Workbench AVC Bundle

A companion AVC bundle (`workbench-v0.2-avc-bundle.json`) enumerates scenarios covering each panel's acceptance criteria (W-2.\*, W-3.\*, W-4.\*, W-5.\*, W-6.\*, W-7.\*), the cross-panel concerns (W-SP-\*, W-SI-\*, W-EH-\*, W-A-\*), and a PROV-O-readiness integration scenario matching AC-W-PROV-O.

Coverage expectations:
- Per-panel rendering and interaction scenarios (approximately 6-10 per panel)
- State persistence scenarios across mode switches and page reloads (approximately 5)
- Invariant visibility scenarios confirming Invariant W-3 catalog items render correctly (one per catalog row)
- Error handling scenarios per W-EH-\*
- One end-to-end PROV-O-readiness scenario exercising the full flow

Estimated total: approximately 55-70 scenarios. The bundle is authored before UI implementation begins, per test-first methodology.

---

## 10. Governing Rules — Workbench v0.2 Additions

| Rule ID | Rule |
|---|---|
| **W-1** (Invariant) | Ingest mode is a workspace, not a wizard. Panels navigable non-linearly; state persists across mode switches. |
| **W-2** (Invariant) | UI never simplifies analyst's evidence. Fingerprint breakdowns show all dimensions with weights. FailureTraces show Prolog traces verbatim. Margins displayed to three decimals. |
| **W-3** (Invariant) | Invariants from the FANDAWS / D1 / D2 specs are visibly enforced in the UI per the §8.5 catalog. |
| **W-SP-1** | Mode-switch state preservation: switching between Converse / Ingest / Export preserves state in all three. |
| **W-SP-2** | Page-reload state restoration: last-active session and panel restored from `localStorage`. |
| **W-SP-3** | In-progress forms preserved across mode switches within the same page session; not required across reloads. |
| **W-SI-1** | Single active session for review at any time; session ID displayed in top bar of every Ingest panel. |
| **W-SI-2** | Changes to session A do not affect session B; sessions are independent (carries forward Rule PS-2). |
| **W-EH-1** | Parse errors on upload display specific line/position information; session not created on error. |
| **W-EH-2** | Pipeline errors during phase execution displayed with bug-report-ready detail; session remains in last consistent state. |
| **W-EH-3** | Invariant firing as violation during execution halts current phase, displays prominent error banner, invalidates any in-progress PROV-O study per TA-8. |
| **W-FS-1** | File size cap: uploaded source content (file or paste) MUST NOT exceed 1MB. Reserves headroom within the browser's 5MB localStorage quota for derived session records. |
| **W-FS-2** | localStorage quota probe at upload. If insufficient free space (<2MB), upload rejected with guidance to clear older sessions. Defense-in-depth against synchronous QuotaExceededError mid-save. |
| **W-PG-1** | Review tables (Phase 1, Phase 2) paginate or virtualize for large result sets. Default page size 100. Sort and filter operate globally across all pages. |
| **W-TY-1** | Phase 3 evaluation loop MUST yield to the browser render thread between chunks of axiom evaluations (setTimeout or requestAnimationFrame). Progress indicator MUST animate visibly — a frozen spinner is non-conformant. |
| **W-SV-1** | Bundle exports carry `schemaVersion`, `workbenchVersion`, `fandawsVersion`, and `generatedAt` in a bundle header. v0.2 ships with `schemaVersion` "1.0". Future changes follow semantic versioning with MAJOR/MINOR discipline. |
| **W-IM-1** | `owl:imports` declarations recorded in IngestionSession metadata as `declaredImports` but NOT followed during ingestion. Only directly-declared classes and properties in the uploaded file become candidates. References to entities in imported ontologies appear as external IRIs. Full import-closure handling deferred to v0.3. |
| **W-TP-1** | Tau Prolog bundled into v0.2 output via esbuild at build time. No runtime CDN fetch, no script-tag global, no JS-harness substitute. Version pinned via `package.json` dependency. Same engine version runs in Node.js test harness and browser. Substituting a non-Prolog implementation would invalidate the D2 specification guarantees and any calibration study run against it. |
| **W-A-1** through **W-A-4** | Accessibility: keyboard navigation, color-plus-icon meaning, copy-to-clipboard on monospace blocks, keyboard-navigable forms. |
| **W-PROV-O** | Workbench v0.2 acceptance gate: PROV-O Pass 1 executable end-to-end through UI with sufficient artifact capture to populate report template through §7. |

---

## 11. Integration with Parent Specs

| Parent spec | Workbench v0.2 Engagement |
|---|---|
| FANDAWS v2.1 §2.2 Source Trust Model | Upload panel validation rejects malformed source; Staging records visible in Phase 1 Review |
| FANDAWS v2.1 §3.8 Conversational Consistency Check | Preserved via Converse mode; Ingest mode does not fire Path A/B |
| FANDAWS v2.1 §4.7 Disambiguation Record | Phase 2 Review renders every field of the record |
| FANDAWS v2.1 §4.8 Merge Record | Phase 2 Review creates records on merge action; Session Summary lists them |
| FANDAWS v2.1 §10 Quarantine Store | Phase 3 Review renders QuarantineRecords with complete FailureTraces |
| FANDAWS v2.1 Rule VD-5 (sessions never deleted) | Sessions panel carries all historical sessions |
| FANDAWS v2.1 Rule VD-6 (BFO version change) | If BFO re-ingested during active session, Ingest mode halts session and displays version-change event |
| Phase D1 Decision D-2 (two pipelines) | Ingest mode and Converse mode remain distinct pathways; no cross-mode mutation |
| Phase D1 Decision D-4 (blocking rule) | Phase N+1 button disabled while Phase N has PendingHumanResolution |
| Phase D2 Rules PD-\*, PS-\* | All rules applicable at UI layer visibly enforced per §8.5 |
| Phase D2 AC-D2-17 (Prolog trace authenticity) | Phase 3 Review displays trace verbatim in monospace |

No parent-spec rule is modified, weakened, or superseded. Workbench v0.2 is purely additive.

---

## 12. Implementation Notes

### 12.1 Architecture Posture

- **Frontend framework:** Use the existing Workbench v0.1 framework unchanged. Do NOT rewrite for v0.2. v0.1 is vanilla JS with an event bus pattern (`WorkbenchStateManager` + `EventBus` + panel modules with `init`/`show`/`hide` lifecycle). v0.2 extends this pattern. New panel modules live under `docs/workbench/js/panels/ingest/` following the existing convention. Cross-panel communication uses events on the existing bus: `ingest:session:created`, `ingest:phase1:resolved`, `ingest:phase2:resolved`, `ingest:phase3:complete`, and similar.
- **State management:** Extend the existing `WorkbenchStateManager` pattern. Add `localStorage` persistence for Ingest mode artifacts per §12.4 schema.
- **D1/D2 pipeline integration:** Ingest mode calls the existing D1/D2 pipeline functions (`startIngestionSession`, `resolvePlacement`, `resolveDisambiguation`, `runPhase3Sandbox`, etc.) directly — no new API layer. The UI is a thin rendering layer over existing pipeline state.
- **RDF parsing:** For parsing uploaded ontology files (Turtle, RDF/XML, N-Triples, N3), use `n3.js` (primary parser for Turtle/N-Triples/N3) plus `rdfxml-streaming-parser` (for RDF/XML). Both are maintained, browser-compatible, and emit a compatible quad/triple abstraction. This is the standard edge-canonical RDF handling in JavaScript. Both libraries are bundled into the v0.2 output via esbuild at build time — no runtime CDN load, no network dependency. Format is detected from file extension with a content sniff fallback (Turtle files contain `@prefix` declarations, RDF/XML files begin with `<?xml` or `<rdf:RDF`).
- **Ontology parser:** A new module at `src/core/ingestion/ontology-parser.js` takes a format-agnostic triple stream (from `n3.js` or `rdfxml-streaming-parser`) and produces the D1/D2 pipeline input shape (`{ classes: [...], properties: [...] }`). This is separate from `src/adapters/integration/turtle-ingestion-adapter.js`, which handles BFO-specific ingestion and remains unchanged. The new parser identifies: `owl:Class` declarations, `rdfs:subClassOf` edges, `owl:ObjectProperty` declarations, `rdfs:domain` and `rdfs:range`, property characteristics (`owl:TransitiveProperty`, `owl:SymmetricProperty`, `owl:ReflexiveProperty`, `owl:InverseFunctionalProperty`, etc.), `rdfs:label` with language-tag handling (prefer `@en`, fall back to no-language), `owl:equivalentClass`, and `owl:disjointWith`. Anonymous classes in restriction positions (e.g., `rdfs:domain` as a blank-node intersection) are emitted as `ComplexExpression` markers in the pipeline input; the D1 sandbox routes these to PlacementAmbiguous, and the D2 Phase 2 sandbox routes them to DisambiguationRecord. Full OWL expression handling (union, intersection, restrictions as first-class inputs) is deferred to v0.3.
- **Tau Prolog execution:** Bundled into the v0.2 output via esbuild at build time (see Decision W-D-19 below). Runs in the browser thread for v0.2. JavaScript in the browser is single-threaded, so the Phase 3 evaluation loop MUST yield to the browser's render thread between axiom evaluations — otherwise the UI (progress spinner, scroll, hover states) freezes for the duration of the phase. Implementation uses `setTimeout(fn, 0)` or `requestAnimationFrame` between chunks of axiom evaluations. A reasonable chunk size is 10-25 axioms per yield point; this keeps the progress indicator animating while maintaining throughput. The PROV-O ingestion (~30 axioms) may complete in a single frame, but the chunked-yielding pattern should be in place from the start so later tests at higher scale don't require a rewrite. Web Worker migration remains deferred to v0.3 per Decision W-D-9 and is only needed if even chunked execution shows perceptible freezing at larger scales.

### 12.2 Testing Strategy

- UI acceptance scenarios live in `workbench-v0.2-avc-bundle.json`. These complement, not replace, the D1/D2 pipeline AVC suite.
- Each scenario in the bundle carries a `verification_method` field indicating how it is verified: `programmatic` (runnable in Jest/Node without a browser — e.g., state persistence, bundle schema, hash capture, data transformations), `manual` (requires human eyes on rendered UI — e.g., color coding, hover tooltips, visual prominence), or `hybrid` (programmatic data-layer assertion plus manual visual verification).
- Programmatic scenarios are written as Jest tests alongside the D1/D2 AVC suite from day one. These can run headless in CI.
- Manual scenarios form a checklist executed during the PROV-O Pass 1 dry run. They are NOT skipped — they are verified with Aaron at the keyboard during AC-W-PROV-O execution.
- Automated browser testing (Playwright, Cypress, or equivalent) deferred to v0.3 per Decision W-D-11.
- PROV-O Pass 1 execution is the final acceptance test (per AC-W-PROV-O).

### 12.3 Design System Considerations

- v0.2 does not introduce a new design system; it extends v0.1's existing style.
- Monospace blocks (Prolog traces) use the codebase's existing monospace conventions.
- Color palette: status indicators use green/yellow/red with icon pairing (accessibility Rule W-A-2). Avoid red-green-only distinctions.
- Density: the information-rich panels (Phase 2 Review fingerprint breakdown) may require denser typography than Converse mode uses; that is acceptable as long as readable.

### 12.4 localStorage Schema Considerations

- Schema should be versioned so future upgrades can migrate cleanly. Every localStorage record includes a `schemaVersion` field matching the bundle export schemaVersion.
- Suggested keys: `fandaws:sessions`, `fandaws:staging_records:{sessionId}`, `fandaws:merge_records:{sessionId}`, `fandaws:disambiguation_records:{sessionId}`, `fandaws:quarantine_records:{sessionId}`, `fandaws:justifications:{sessionId}`.
- Total localStorage usage for a PROV-O-sized session should be well under 1MB. Per W-3.9 the uploaded source is capped at 1MB, which reserves headroom for the session's derived records within the browser's 5MB quota.
- Before session creation (W-3.10), probe available quota with a write-delete test. If insufficient, reject with guidance to clear older sessions. This is defense-in-depth against QuotaExceededError — the synchronous nature of localStorage makes that exception capable of bricking the UI mid-save.
- Serialization: JSON, no binary formats.
- On page load, if `schemaVersion` of stored records is older than the current Workbench version can support, sessions are marked read-only with an "archived format" indicator. Migration logic in future versions is out of scope for v0.2.

### 12.5 What to Build First (Implementation Sequencing)

1. **Mode switcher extension** (Converse / Ingest / Export). Tiny scope.
2. **Sessions panel + Upload panel** — gets a session to exist with staging records visible. Includes the file-size validation (W-3.9) and quota probe (W-3.10) from day one.
3. **Phase 1 Review panel** — simplest of the three review panels; resolve-with-justification is the core interaction. Includes pagination/virtualization (W-4.10) from day one to prevent retrofit pain.
4. **Phase 3 Review panel** — before Phase 2, because the Prolog trace display and FailureTrace rendering are architecturally independent of disambiguation complexity. Include the chunked-yielding pattern (W-5.14) from day one.
5. **Phase 2 Review panel** — the most complex. Fingerprint breakdown, four-way actions, visible invariant enforcement for PD-6 and PD-9. Includes pagination/virtualization (W-5.15) from day one. Build last because the others inform the shape.
6. **Session Summary panel** — after the review panels exist, this is aggregation and invariant-audit rendering. Include bundle header with schemaVersion (W-7.7, W-7.10) from day one.
7. **Cross-panel concerns** (state persistence, mode-switch preservation) — implement throughout, validated at each panel milestone.
8. **PROV-O Pass 1 dry run** — final acceptance test.

### 12.6 Spot-Check Transcript Targets (Expected)

Following the discipline from D1 and D2, when Workbench v0.2 is acceptance-certified, three spot-check transcripts should be captured as reference artifacts:

1. **End-to-end PROV-O session transcript** — screen-captured walkthrough of Pass 1 from upload through Session Summary export.
2. **PD-6 visible enforcement transcript** — showing the sub-property promotion target picker greying out a broader-than-parent option, with the tooltip visible.
3. **Invariant Audit card transcript** — screenshot of Session Summary Invariant Audit showing all invariants green for a completed PROV-O session.

These transcripts serve the same role as D1 and D2 transcripts: reference artifacts that lock in "what this looks like when working correctly" against future UI regressions.

### 12.7 Calibration-Study Series Compatibility

Workbench v0.2's acceptance gate is the PROV-O Calibration Study (AC-W-PROV-O). The PROV-O test is the first in a planned series of real-world calibration studies that may include CCO modules, IOF modules, GO subsets, Schema.org, and larger-scale tests. v0.2 is designed for PROV-O scale but should not require re-architecting for moderate scale-up (up to ~500 classes, within the file-size ceiling of W-3.9).

Series-compatibility requirements the implementation MUST satisfy:

- **Consistent artifact shape across tests.** Every calibration study produces the same JSON bundle structure (per W-7.7), differentiated only by `schemaVersion`, content, and the session's source ontology IRI. This enables cross-test comparison tooling in v0.3+.
- **schemaVersion stability across v0.2.** The v0.2 bundle schemaVersion is "1.0". No additive or subtractive changes to this schema within v0.2. Any future change is v0.3+ and increments the version.
- **Pagination and virtualization baseline (W-4.10, W-5.15).** Built into v0.2 even though PROV-O does not require them. This prevents a forced rewrite when the second test (potentially a CCO module) arrives with ~200 rows.
- **Chunked-yielding Phase 3 execution (W-5.14, §12.1).** Built in from day one so scale-up does not freeze the UI.

What v0.2 does NOT guarantee for the series:

- Large-ontology support (GO full, OBI full). These are v0.3+ with the explicit understanding that Web Worker execution may be required, as may streaming imports.
- Cross-test comparison UI (side-by-side session comparison). v0.3 deliverable.
- Automated series execution (batch-running multiple tests). v0.3+ if demand arises.

The implementer should proceed from v0.2 spec as-authored; the series-compatibility considerations here are forward-looking guardrails, not additional scope.

---

## Appendix A: Panel-to-Report-Template Mapping

For quick reference during PROV-O study execution, the mapping from Workbench v0.2 panels to PROV-O report template sections:

| Workbench panel | Report template section | What gets captured |
|---|---|---|
| Upload | Report §2.1, §2.3 | Configuration snapshot, methodology note of blind Pass 1 |
| Phase 1 Review | Report §3.1, §3.4, Appendix A.9 | Placement results table, placement disagreement narratives, analyst reasoning log |
| Phase 2 Review | Report §4.1, §4.3, §4.4, §4.5, §4.6, Appendix A.8 | Disambiguation table, resolution tables, PD-2 firings, disagreement narratives, analyst reasoning log |
| Phase 3 Review | Report §5.1, §5.2 | Quarantine summary, per-axiom FailureTrace detail with Prolog traces |
| Session Summary Invariant Audit | Report §6.1 | Invariant check matrix with concrete evidence |
| Export Turtle | Report §7.1, §7.2, Appendix B | Namespace hygiene checklist, Turtle excerpts |
| Export JSON Bundle | Report Appendix A (all subsections) | Raw artifact archive |
| Export Prolog Traces | Report Appendix A.7, E.4 | Trace archive, invariant audit evidence |

---

## Appendix B: Deferred Features (for v0.3 and Beyond)

For continuity with future Workbench versions, the features deliberately deferred from v0.2:

- Alignment comparison UI (FANDAWS vs external alignment side-by-side)
- Live fingerprint weight vector visualization with what-if tuning
- Re-run with different configuration (dedicated button, not "new session" workaround)
- Per-axiom Phase 3 re-run
- Batch resolution (resolve N disambiguation items with one action)
- Import-closure handling (follow owl:imports transitively)
- Multi-user / collaborative ingestion (if ever)
- Full WCAG AA accessibility audit
- Automated browser testing harness (Playwright/Cypress)
- Web Worker execution of Tau Prolog (if performance requires)
- Large-ontology performance tuning
- Progress bars / long-running operation handling for ontologies >1000 classes

---

**End of Workbench v0.2 Specification**

*Implementation-ready. Acceptance gate: AC-W-PROV-O. Companion AVC bundle: `workbench-v0.2-avc-bundle.json`.*
