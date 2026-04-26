# SME-D16-X3 v2 — Pipeline Orchestrator Scoping

**Status:** **LOCKED v2 + ARC COMPLETE 2026-04-24.** Supersedes `sme-d16-x3-site-family-to-funnel-memo-v1.md`. Four-commit arc delivered: 9c22963 (orchestrator module + unit tests), 65e6664 (AVC handler migration), 76b0d84 (F4 two-layer audit), 9dc5b07 (integration validation + reception memo). F4 N=5 achieved; v2 §6.2 Done satisfied in spirit; honest-admission discipline preserved in reception memo §9 (real `.owl` parsing, real Tau Prolog quarantine, real dependency graph, and live analyst override flow explicitly downstream). §3.9.1 adapter injection locked as explicit per-call parameter. §3.6 override schema v1 ACK'd.
**Owner:** SME (from `specs/d16/d16-phase1-closeout.md` §6 gap; cycle initiated by SME brief SME-D16-X3 2026-04-24; v1 reconciliation delivered same day).
**Consumes:** v1 memo + developer reconciliation response; `dp2-locked-decisions.md`; `dp2-scaffolding-design-sketch.md`; F4 negative assertions from `bundle-v5-authorization-memo.md`; F1 causedBy semantics from DP-2.2.D3.
**Consumed by:** developer implementation cycle for `pipeline-orchestrator.js`; F4 audit scenario recalibration (bundle v6 authorization pending); Band 9 "Integration" AVC scenarios (bundle v6).
**Scope fence (expanded from v1):** orchestrator module design AND integration wiring between reasoning modules ↔ funnel. Still OUT: new DP-2 invariants, new reasoning semantics, new spec rules. The orchestrator composes existing pieces; it does not introduce new semantics.

**Tag legend (unchanged from v1):**
- **LOCKED-FROM-PRINCIPLE** — derivable from existing invariants and locked decisions.
- **SME-PROPOSED — PENDING-DEVELOPER-ACK** — verified against code state; SME position stands pending developer implementation-plan ACK.
- **OPEN** — explicit deferral; developer judgment requested.

---

## Executive summary

**What v2 changes from v1:**

- Re-titled from "Site-Family-to-Funnel Integration" to "Pipeline Orchestrator Scoping." The work is building a new module, not wiring existing ones.
- §3 re-framed at orchestrator layer. The "five site families" are preserved as semantic categories; each maps to a distinct orchestrator function.
- §5 N target refined: **N = 5 via family-dispatch orchestrator entry points** (hard floor 5, structurally clean). Was N = 10 across reasoning modules in v1.
- §3.6 scope expansion: analyst override implementation is net-new code inside orchestrator scope.
- New §3.9: orchestrator module design (consolidation of reconciliation item N1).
- New §3.10: iteration-mechanics boundary preservation (N3).
- New §6.5: Band 9 "Integration" AVC band guidance (N2).
- Several v1 PENDING-RECONCILIATION items resolved by developer's code-state verification.

**What this memo locks** (LOCKED-FROM-PRINCIPLE, mostly unchanged from v1):

- New module `src/core/d16/pipeline-orchestrator.js` with 5 public entry points.
- Reasoning modules stay pure (CLAUDE.md discipline preserved).
- Funnel API Shape B already confirmed by code; no refactor.
- Two funnel methods (`writeFreshRecord` + `appendReconciliationEntry` — append method is forward-scope, activates when append semantics land).
- `causedBy` scope is intra-CAU reconciliationHistory only; caller-passed parameter; immediate-predecessor per F1.
- No `DP2NonConformanceError` suppression in core; halt-on-first-failure cascade semantics.
- F4 audit target N = 5 orchestrator call sites; hard floor 5.

**What v2 flags for developer ACK** (reduced from 9 to 4):

- §2.3 I2a-on-append validation scope — deferred until append API exists.
- §3.3 state-change append semantics on NA-1.3 cascade — deferred until append API exists.
- §3.6 analyst override schema details for net-new implementation.
- §3.9 orchestrator session lifecycle boundary (where does the orchestrator get the adapter; when does it release?).

**Scope OUT (unchanged):** new invariants; new reasoning semantics; Workbench v0.2 panel adaptations; RoleNC5 (v1.1+); class-subsumption infrastructure (v1.1+); PROV-O Pass 2 test plan modifications.

**Next action:** PO ACK of scope shift (family-wiring → orchestrator-construction, ~2–3 days, 3–4 commits) + developer implementation-plan ACK of §3.9 questions. After both, memo transitions DRAFT → LOCKED.

---

## 1. Problem statement (revised)

D1.6 Phase 1 closed 2026-04-24 with 70/70 AVC scenarios passing and Band 8 (synthetic PROV-O) green. The F4 audit found exactly one persist call site: the funnel definition itself. Real PROV-O exercised through the live pipeline produces zero DP-2 records.

**v1 diagnosis (superseded):** the five reasoning modules don't route through the funnel.

**v2 diagnosis (correct):** there is no orchestrator. The five reasoning modules are pure JSON-LD-in/JSON-LD-out computations per CLAUDE.md core-module discipline; they return disposition data, not emissions. The test harness (AVC runner) composes their outputs into records and calls the funnel for test scenarios. The production equivalent — a pipeline orchestrator that composes reasoning outputs, builds canonical records, and invokes the funnel — does not exist in `src/` today.

The integration gap is a *missing layer*, not *missing wiring*. This memo specifies that layer.

**What the orchestrator is:**

- A new module `src/core/d16/pipeline-orchestrator.js`.
- Five public entry points, one per semantic category (three-state terminal, inheritance, reactive mutation, NotApplicable routing, analyst override).
- Each entry point: (1) calls the relevant reasoning module(s); (2) composes the output into a canonical record via production emitters; (3) calls `persistCanonicalRecordViaChokepoint` with explicit context.
- Adapter is injected per session, not module-scoped.
- Reasoning modules remain pure; orchestrator is the ORCHESTRATION layer per CLAUDE.md's Computation/State/Orchestration/Integration separation.

**Load-bearing constraint preserved from v1:** the F4 audit's negative assertions (no bypass, no discarded return, no `DP2NonConformanceError` suppression, no absence-based phase routing) hold across all 5 orchestrator call sites. Any wiring that violates these is a defect to be fixed, not accommodated by weakening the audit.

---

## 2. Funnel API — Shape B confirmed

### 2.1 Shape B is already in code

Developer reconciliation verified: `src/core/d16/record-persistence.js` (52 lines) exports `persistCanonicalRecordViaChokepoint(record, context, adapter)`. Validates via `writeCanonicalRecord`; calls `adapter.persistCanonicalRecord(validation.record, context)` if adapter provided. No refactor needed.

**SME position v1 (Shape B preferred) → confirmed by code state.** The v1 reconciliation requirement dissolves; this is simply the current state.

### 2.2 Adapter-undefined convenience — F4 audit scope note

**LOCKED-FROM-PRINCIPLE.** When `adapter` is undefined, the helper returns `{...validation, persisted: false}` rather than throwing. This is a legitimate test/dry-run affordance.

F4 audit negative assertions scope to **production call sites** — those that pass an adapter. Dry-run adapter-absent paths are outside F4 scope. At lock time, document this in the F4 audit's scenario setup (bundle v6 authorization cycle).

### 2.3 Two funnel methods — append method is forward-scope

**LOCKED-FROM-PRINCIPLE.** The two-method design (`writeFreshRecord` + `appendReconciliationEntry`) is correct architecture. However, per developer reconciliation, `appendReconciliationEntry` does not currently exist — `buildReconciliationEntry` (provenance-builder.js) produces entries slotted into records at build time, not appended to persisted records.

**Forward-scope implication:** at v2 lock, the orchestrator uses `writeFreshRecord` for all five entry points initially. The `appendReconciliationEntry` method activates when append semantics are added — likely when true cascade-driven mutation of persisted records is implemented. Until then, reconciliation-cascade records are fresh-written with full history composed at build time.

**OPEN (deferred implementation decision):** when the append API lands, §3.3 state-change-on-append semantics and §2.3 I2a-on-append validation scope re-activate as decisions.

---

## 3. Pipeline orchestrator — per-function spec

### 3.1 Module surface

**LOCKED-FROM-PRINCIPLE.** `src/core/d16/pipeline-orchestrator.js` exposes five public functions:

| Function | Semantic role | Reasoning modules composed | Funnel method |
|---|---|---|---|
| `orchestrateThreeStateTerminal` | CAU initial classification with clear signature | `three-state-evaluator` → explanation/provenance/hash emitters | `writeFreshRecord` |
| `orchestrateInheritance` | Axiom-poor CAU provisional-then-validated placement | `applyProvisionalInheritance` (NA-1.1) → `reconcileSignal` (NA-1.2) → emitters | `writeFreshRecord` |
| `orchestrateReactive` | NA-1.4 mutation-triggered re-evaluation | `reactive-engine` → emitters | `writeFreshRecord` (until append API lands) |
| `orchestrateNotApplicable` | NotApplicable routing (automatic/default_axiom_poor/manual) | evaluator's NotApplicable branch OR inheritance's routingMechanism → emitters | `writeFreshRecord` |
| `orchestrateAnalystOverride` | Human override of prior automated classification | NET-NEW path → emitters with priorAutomatedDisposition | `writeFreshRecord` (until append API lands) |

Each function takes `(cauIRI, inputs, context, adapter)` where:
- `inputs` carries the pre-computed reasoning-module inputs (signature, parent for inheritance, mutation event for reactive, override data for analyst).
- `context` carries `phase: 'production'`, `mechanism: <family-specific>`, and `causedBy: <entry ID | null>` per §4.
- `adapter` is injected at session start by the caller (see §3.9).

Each function makes **exactly one** funnel call. Multiple funnel calls inside one orchestrator function is a smell; per-family split is the discipline.

### 3.2 orchestrateThreeStateTerminal

**Input:** CAU with computed signature; BFO Signatures reference.

**Composition:**
1. Call `evaluateCAU(cau, signature, bfoSigRef)` — returns disposition object with one of four return paths: Entailed / Plausible / Inconsistent / NotApplicable-axiom-poor.
2. **Branch on disposition:**
   - If Entailed / Plausible / Inconsistent → continue this function.
   - If NotApplicable-axiom-poor → delegate to `orchestrateNotApplicable` (this is how the four-branch split collapses to five orchestrator functions).
3. Build record via emitters using `context.mechanism: <disposition-name>` (e.g., `'three_state_entailed'`).
4. Call `persistCanonicalRecordViaChokepoint(record, context, adapter)`.
5. Return the funnel envelope (for optional caller use; never discarded inline — see F4 assertion §5.3).

**LOCKED-FROM-PRINCIPLE — mechanism enum:** `'three_state_entailed' | 'three_state_plausible' | 'three_state_inconsistent'`. These are the `context.mechanism` values for the three non-NotApplicable paths.

**causedBy:** `null` (initial classification, originates chain).

### 3.3 orchestrateInheritance

**Input:** axiom-poor CAU; inheritable parent's disposition; parent reference.

**Composition (F3-preserving):**
1. Call `applyProvisionalInheritance(cau, parent)` — returns disposition data with `validationState: 'provisional'`.
2. **Immediately call `reconcileSignal(provisional_result, signatures)`** (NA-1.2) — transitions `validationState` to one of `'validated_no_conflict' | 'soft_conflict_detected' | 'hard_conflict_detected'`.
3. Post-transition, build record via emitters with `context.mechanism: 'inheritance'` and the reconciled state.
4. Call `persistCanonicalRecordViaChokepoint`.

**Critical F3 preservation:** steps 1 and 2 MUST run sequentially within the same orchestrator function, with no emission between. A persisted record with terminal `validationState: 'provisional'` is an F3 defect per DP-2.2 V1 confirmation. The orchestrator's single-function-per-family composition ensures NA-1.1 output never traverses the chokepoint alone.

**causedBy:** `null` (inheritance emission is initial record for the CAU; parent-child lineage captured in a separate provenance field, not `causedBy` per §4.1 scope note).

### 3.4 orchestrateReactive

**Input:** mutation event (from dispatcher upstream); CAU affected; prior record reference (for reconstructing context).

**Composition:**
1. Call `reactive-engine` entry point (e.g., `handleMutationEvent`) — returns re-evaluation outcome.
2. Build record via emitters with `context.mechanism: 'reactive'` and `mutationKind: <existing enum: 'analyst-override' | 'property-ingestion' | 'placement-change'>`.
3. Call `persistCanonicalRecordViaChokepoint`.

**mutationKind enum — LOCKED AS-IS.** The existing enum values `'analyst-override' | 'property-ingestion' | 'placement-change'` (hyphenated) are retained. Matches Band 5 AVC scenarios (`reactive-re-evaluation-trigger` uses `mutationKind: 'property-ingestion'`). My v1 proposal (`'axiom_change' | 'helper_state_change' | 'user_action'`) is withdrawn — code + AVC consistency wins.

**causedBy:** per §4.3 table. If NA-1.4 fires in response to a prior NA-1.3 cascade entry, `causedBy: <NA-1.3 entry ID>`. If from non-cascade source, `null`.

**Note on emission under current no-append API:** until `appendReconciliationEntry` lands, reactive re-evaluation produces a fresh record with the full reconciliationHistory composed in-memory. When append API lands, this shifts to true append semantics. Both paths go through the same orchestrator function; the internal invocation differs.

### 3.5 orchestrateNotApplicable

**Input:** CAU; routing mechanism enum (`'automatic' | 'default_axiom_poor' | 'manual'`); reasoning context.

**Composition:**
1. Receive the NotApplicable decision (either from `evaluateCAU`'s fourth return path or from `applyProvisionalInheritance`'s `routingMechanism: 'na_1_1_inheritance'` path).
2. Build record via emitters with `context.mechanism: <routing-mechanism>` and single-element axiom evidence naming the trigger per DP-2.1.D3 floor.
3. Call `persistCanonicalRecordViaChokepoint`.

**Note on family consolidation vs distinct entry point:** `orchestrateNotApplicable` is a distinct entry point because NotApplicable has its own evidence-shape discipline (single-element floor, routing-trigger-named). The three mechanisms (`automatic`, `default_axiom_poor`, `manual`) are `context.mechanism` values within this single function, not separate entry points. F4 audit sees one call site for NotApplicable; sub-mechanism coverage is traced via `context.mechanism`.

**causedBy:** `null` (placement decision, not cascade continuation).

### 3.6 orchestrateAnalystOverride

**Scope note: NET-NEW code.** Per developer reconciliation, analyst override has no `src/` implementation today — only a test handler. This orchestrator function introduces the production path.

**Input:** CAU; override data (analystId, timestamp, rationale); prior automated disposition (for audit).

**Composition (initial implementation using `writeFreshRecord` pending append API):**
1. Receive override decision from caller (UI layer or pipeline boundary).
2. Build record via emitters with `context.mechanism: 'analyst_override'`, `priorAutomatedDisposition: <prior>`, override metadata threaded through.
3. Call `persistCanonicalRecordViaChokepoint`.

**When append API lands:** this function transitions to `appendReconciliationEntry` semantics — override becomes an append entry rather than a superseding record. Per v1 §3.6, SME read is that override is semantically an append (state transition on the CAU's record, preserving prior in history). Lock that when append semantics land.

**causedBy:** `null` (human decision, not cascade continuation). Prior automated disposition captured in `priorAutomatedDisposition` field, not `causedBy`.

**SME-PROPOSED — PENDING-DEVELOPER-ACK:** the override metadata schema (required fields, optional fields, analyst identity representation). Developer proposes the schema during implementation; SME reviews against §7.2 + analystOverrideCAU test-handler shape at ACK time.

### 3.7 Error semantics — DP2NonConformanceError propagation (unchanged from v1)

**LOCKED-FROM-PRINCIPLE.** No orchestrator function catches `DP2NonConformanceError`. The error propagates to the pipeline boundary (caller of the orchestrator), where boundary-layer error handling logs structured failure and either halts the run or marks the input as failed-with-structured-reason.

Checkable mechanically by F4 audit: any `try { ... orchestrate*(...) ... } catch (DP2NonConformanceError)` block inside `pipeline-orchestrator.js` or any reasoning module is a defect.

### 3.8 Partial-cascade-failure — halt-on-first-failure (unchanged from v1)

**LOCKED-FROM-PRINCIPLE.** If cascade orchestration fires `orchestrateReactive` or `orchestrateInheritance` across N neighbors and the kth emission throws `DP2NonConformanceError`:

1. Emissions 1..k-1 persisted (no rollback — StateAdapter transactionality not guaranteed).
2. Emission k fails; error surfaces to the cascade driver.
3. Emissions k+1..N NOT attempted. Cascade halts.
4. Cascade driver re-raises with cascade context to pipeline boundary.

**OPEN (scope-out):** cascade-state recovery strategy. Deferred to a separate decision cycle; this memo locks emission discipline, not recovery.

### 3.9 Orchestrator module design — consolidation of reconciliation N1

**Topics that must be resolved in developer implementation plan (pre-code):**

**9.1 Adapter injection boundary.** The adapter is passed per-call to each orchestrator function. Where does it come from upstream?

**SME-PROPOSED — PENDING-DEVELOPER-ACK (session-scoped holder).** A session-init helper (e.g., `initOrchestratorSession(adapter)`) returns a closure object that wraps each orchestrator function with the session's adapter pre-bound. Callers invoke `session.orchestrateThreeStateTerminal(cau, inputs, context)` — adapter is already bound; no per-call passing. Keeps orchestrator functions pure-in-signature (no hidden state); session object is the injection boundary.

Alternative: pass adapter as explicit fourth parameter on every call. Simpler; more verbose at call sites.

Developer preference solicited. Either is defensible; session-scoped holder matches the v1.1.0 extension schema's `sessionId` threading and is SME's lean.

**9.2 Orchestrator location for composition logic.** The orchestrator composes reasoning modules. Where does the composition sequence (evaluate → inherit → reconcile) live?

**LOCKED-FROM-PRINCIPLE.** Inside each orchestrator function, not in a separate "pipeline driver." Orchestrator functions are self-contained per-family; there is no master sequencer that calls them in order. Callers (Workbench Ingest Mode, Node harness, test handlers) invoke orchestrator functions per CAU based on the CAU's classification path.

**9.3 CAU-to-orchestrator-function routing.** Given a CAU, which orchestrator function runs? This is a routing decision that must be made *outside* the orchestrator — typically in the pipeline caller.

**LOCKED-FROM-PRINCIPLE (routing pattern).** The routing caller (e.g., Workbench pipeline driver) inspects the CAU's signature + context and dispatches:

- Axiom-rich CAU with clear signature → `orchestrateThreeStateTerminal`.
- Axiom-poor CAU with inheritable parent → `orchestrateInheritance`.
- Axiom-poor CAU with no inheritable parent → `orchestrateNotApplicable` (with `'default_axiom_poor'`).
- Mutation event from reactive engine → `orchestrateReactive`.
- User action in review panel → `orchestrateAnalystOverride`.

This routing logic is NOT part of this memo's scope (it's pipeline-caller concern, not orchestrator concern). The orchestrator provides the 5 dispatch targets; the caller picks.

### 3.10 iteration-mechanics boundary preservation — N3

**LOCKED-FROM-PRINCIPLE.** `iteration-mechanics.js` stays pure. It provides iteration simulation + convergence verification (`runPhase1`, `applyMutationSequence`). It does NOT become the orchestrator. It does not gain I/O, adapter references, or funnel invocations.

The orchestrator consumes iteration-mechanics' output where iteration is involved (e.g., within `orchestrateThreeStateTerminal` when the disposition requires iterated reasoning). iteration-mechanics' interface remains: signatures + reasoning inputs in → iteration outcome out.

**Why this matters:** iteration-mechanics participates in the `applyMutationSequence` must-compute fields (V4 in DP-2.3.1 per the forward-flag queue). Those computations must remain deterministic and testable as pure logic. Adding I/O would compromise the §4.5 convergence argument's load-bearing pure-function assumption.

---

## 4. causedBy threading spec (unchanged from v1)

See v1 §4. All subsections (4.1 threading mechanism; 4.2 immediate-predecessor semantics; 4.3 threading boundaries table; 4.4 orchestrator responsibility) survive reconciliation without revision. The orchestrator-layer framing replaces family-layer framing; threading discipline is unchanged.

**One note on §4.3 table: all entries now read "orchestrator emission" rather than "family emission" — the cascade drivers (within inheritance-cascade.js and reactive-engine.js for cross-CAU traversal) hand the predecessor entry ID to the orchestrator function via the `context.causedBy` parameter. Reasoning modules themselves don't thread causedBy; the cascade driver does.

---

## 5. F4 audit target — N = 5

### 5.1 Target N — locked

**LOCKED-FROM-PRINCIPLE (N = 5, hard floor 5).**

Enumerated per §3:

| Orchestrator function | Method | mechanism value(s) | Count |
|---|---|---|---|
| `orchestrateThreeStateTerminal` | `writeFreshRecord` | `three_state_entailed` / `three_state_plausible` / `three_state_inconsistent` | 1 |
| `orchestrateInheritance` | `writeFreshRecord` | `inheritance` | 1 |
| `orchestrateReactive` | `writeFreshRecord` (then append) | `reactive` + `mutationKind` sub-enum | 1 |
| `orchestrateNotApplicable` | `writeFreshRecord` | `automatic` / `default_axiom_poor` / `manual` | 1 |
| `orchestrateAnalystOverride` | `writeFreshRecord` (then append) | `analyst_override` | 1 |
| **Total** | | | **5** |

Each orchestrator function makes exactly one funnel call (in its success path). Sub-site coverage within a function (Entailed vs Plausible vs Inconsistent for three-state; three routing mechanisms for NotApplicable) is traced via `context.mechanism`, not via distinct call sites.

### 5.2 Consolidation tolerance — closed

Unlike v1's soft-target-10-hard-floor-5, v2 locks at exactly 5. The orchestrator architecture rules out the consolidation-to-fewer option because each of the 5 families has semantically-distinct discipline (evidence-shape floors, F3 coupling, state-transition semantics). Cross-family consolidation would lose the per-family invariant enforcement.

Developer may propose shared internal helpers that reduce duplication within the orchestrator module (e.g., a shared `emitRecord(record, context, adapter)` called from each of the 5 functions). F4 audit sees 5 call sites to the shared helper, one per orchestrator function. That's acceptable; what's NOT acceptable is fewer than 5 publicly-exposed orchestrator functions.

### 5.3 Negative assertions — unchanged from v1

1. **No bypass.** No DP-2 record reaches StateAdapter persist except through one of the 5 orchestrator functions.
2. **No discarded return value.** The funnel's returned envelope is captured. (Within orchestrator functions, the return is the function's return value; the routing caller decides whether to use it.)
3. **No `DP2NonConformanceError` suppression.** No core-module catch blocks.
4. **No absence-based phase routing.** Every funnel call passes `context.phase` as literal `'production'` or `'scaffold'`.

---

## 6. Acceptance criteria

### 6.1 Integration tests required (revised from v1)

**LOCKED-FROM-PRINCIPLE.** The following test cases must pass before integration is considered complete:

1. **Per-orchestrator-function test (5 tests).** Exercise each orchestrator function with minimal valid input; assert exactly one funnel call, correct method, phase, and `context.mechanism`.
2. **Sub-mechanism coverage test.** For `orchestrateThreeStateTerminal`: exercise all three disposition branches; assert distinct `context.mechanism` values emitted. For `orchestrateNotApplicable`: exercise all three routing mechanisms.
3. **F3 coupling test for `orchestrateInheritance`.** Assert that a CAU passed to `orchestrateInheritance` produces a record with `validationState` in `{validated_no_conflict, soft_conflict_detected, hard_conflict_detected}` — never `provisional`.
4. **Cross-orchestrator cascade test.** Exercise NA-1.3 cascade: `orchestrateThreeStateTerminal` on parent → cascade driver triggers `orchestrateReactive` on neighbor; assert `causedBy` chain-walkability.
5. **Partial-cascade-failure test.** Inject invalid emission at hop k; assert emissions 1..k-1 persisted, k+1..N not attempted, error surfaces with cascade context.
6. **F4 audit re-run.** After wiring, re-run `dp2-writepath-chokepoint-exclusivity`; assert call site count = 5; assert all four negative assertions hold.
7. **Real PROV-O end-to-end test.** Exercise live pipeline against synthetic PROV-O Band 8 input set via orchestrator; assert DP-2 records produced (count > 0); schema conforms to §7.2; mechanism distribution covers the 5 families.
8. **70 AVC regression test.** All Phase 1 AVC scenarios still pass.

### 6.2 "Done" definition (unchanged intent, revised count)

Integration is done when all 8 test categories pass, F4 audit reports N = 5, and the live pipeline produces conformant DP-2 records on real PROV-O input via the orchestrator.

### 6.3 Honest-admission rule (unchanged from v1)

If wiring surfaces a defect in a production emitter or reasoning module, fix the emitter or reasoning module — do NOT soften the invariant, mask with defaults, suppress errors at orchestrator layer, mark tests as expected-failure, or carve per-family exemptions. Same "fix the engine, don't weaken the test" discipline from Wave 2.

### 6.4 Bidirectional traceability (revised)

`src/core/d16/pipeline-orchestrator.js` module header references this memo (`// Scoped per SME-D16-X3 v2`). Each orchestrator function's JSDoc references the specific §3.X subsection. This memo's §3 functions, on lock, are updated with the resolved implementation signatures from the developer's implementation plan.

### 6.5 Band 9 "Integration" AVC band — guidance

**LOCKED-FROM-PRINCIPLE on band choice.** Integration tests live in a new Band 9 "Integration" rather than extending Band 5 (which tests reasoning-module interfaces via summary shapes) or Band 8 (which is the PROV-O acceptance terminal gate).

Rationale: Band 5 tests reasoning-module correctness; Band 9 tests orchestrator-layer integration. Conflating them would erode the semantic distinction between "the reasoning modules compute correctly" and "the orchestrator composes reasoning into conformant records." Band 8 stays clean as the terminal gate.

**Bundle version impact:** landing Band 9 requires bundle v5 → v6 bump. That's a separate SME authorization cycle when Band 9 scenarios are authored (analogous to bundle v5's F4 authorization). NOT in this memo's scope.

**Integration test suites at §6.1 #1–#5 can live in `tests/avc/d16-runner.test.js` as Band 9 scenarios once the bundle is authorized. Tests #6 (F4 re-run) and #8 (AVC regression) are existing scenarios. Test #7 (real PROV-O end-to-end) extends Band 8 — the existing `provo-end-to-end-acceptance` scenario gains a variant that runs through the orchestrator instead of the synthetic builder path.**

---

## 7. Process pattern — update

Per v1 §7, the standard cycle is: developer pre-proposal → SME scoping memo → developer ACK + implementation → implementation lands with bidirectional traceability.

**v1 → v2 transition documented:** v1 was SME-initiated (cycle inverted). Developer reconciliation surfaced architectural framing conflict. SME accepted in full; v2 is the revised scope. This is the expected outcome when cycle inversion fires; see `feedback_cycle_inversion_reconciliation_discipline.md` (banked from this arc) for the durable pattern.

**v2 path to lock:**

1. ✅ SME v2 delivered 2026-04-24.
2. ☐ PO (Aaron) ACK of scope shift (family-wiring → orchestrator-construction; ~2–3 days; 3–4 commits).
3. ☐ Developer ACK of §3.9 session-adapter-boundary preference (9.1) and §3.6 override-schema proposal.
4. Memo transitions DRAFT v2 → LOCKED on 2+3.

Developer implementation proceeds on LOCKED status.

---

## 8. References

- `specs/d16/sme-d16-x3-site-family-to-funnel-memo-v1.md` (v1 superseded by this memo)
- `specs/d16/d16-phase1-closeout.md` §6 (gap); §7 (Pass 2 prereqs); §8 (module list)
- `specs/d16/dp2-locked-decisions.md` — DP-2 decision context; F1, P1, P2 resolutions
- `specs/d16/dp2-scaffolding-design-sketch.md` §3.2; §4.2; §7.2 (record schema)
- `specs/d16/bundle-v5-authorization-memo.md` §2.1 (F4 negative assertions)
- `src/core/d16/record-persistence.js` — the funnel (Shape B confirmed)
- `src/core/d16/canonical-record-writer.js` (validator)
- `src/core/d16/explanation-builder.js`, `provenance-builder.js`, `reproducibility-hash.js` (production emitters)
- `src/core/d16/three-state-evaluator.js`, `inheritance-cascade.js`, `reactive-engine.js`, `iteration-mechanics.js`, `dp1-diagnostic.js` (reasoning modules — to be composed, not modified)
- Project memory: `project_d16_dp2_design_review_cycle.md`; `project_d16_na_architecture_commitments.md`
- Feedback memory: `feedback_scaffold_production_split.md`; `feedback_absence_not_evidence.md`; `feedback_structured_failure_reasons.md`; `feedback_transparent_callback_forwarding.md`; `feedback_proof_discipline.md`; **`feedback_cycle_inversion_reconciliation_discipline.md`** (new, banked from this arc)
- `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` — definition consumed by NA-1.3 cascade per §3.4

---

## Reserved doors for developer pushback (pruned from v1)

- §2.3 I2a-on-append scope: deferred until append API lands.
- §3.3 State-change-on-append: deferred until append API lands.
- §3.6 Analyst override schema: developer proposes during implementation; SME reviews at ACK.
- §3.9 Orchestrator module design: two items (9.1 adapter injection boundary, 9.3 routing pattern) — SME preference stated but developer judgment welcome.
- §5.1 N = 5: **not negotiable downward.** Hard floor 5, hard ceiling 5 (within-module internal helpers allowed).
- §6.5 Band 9 band choice: locked on rationale; developer may propose alternative band structure with written reasoning.

v1's 9 PENDING-RECONCILIATION items → v2's 4 OPEN items (mostly append-API-deferred). The reconciliation did its work.

**Next action:** PO ACK of scope shift + developer ACK of §3.9 questions. Memo transitions DRAFT → LOCKED.
