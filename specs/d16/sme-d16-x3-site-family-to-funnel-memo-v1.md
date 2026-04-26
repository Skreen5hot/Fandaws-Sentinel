# SME-D16-X3 — Site-Family-to-Funnel Integration Scoping

**Status:** DRAFT v1 2026-04-24. **Cycle inversion noted:** the standard pattern (developer pre-proposal → SME scoping memo lock) was inverted at PO direction. This memo is SME-initiated and requires developer reconciliation pass against actual code state before lock.
**Owner:** SME (from `specs/d16/d16-phase1-closeout.md` §6 gap; SME brief SME-D16-X3 from PO 2026-04-24).
**Consumes:** `dp2-locked-decisions.md`; `dp2-scaffolding-design-sketch.md` §3.2; F4 negative assertions from `bundle-v5-authorization-memo.md` §2.1; F1 causedBy semantics from DP-2.2.D3.
**Consumed by:** developer reconciliation + implementation cycle for site-family wiring; F4 audit scenario `dp2-writepath-chokepoint-exclusivity` calibration in AVC bundle v5.
**Scope fence:** integration wiring only. No new DP-2 invariants, no new spec rules, no new reasoning semantics. Locks composition pattern between five site families and the DP-2 write-path funnel.

**Tag legend:**
- **LOCKED-FROM-PRINCIPLE** — derivable from existing invariants and locked decisions; lock-eligible without developer reconciliation.
- **SME-PROPOSED — PENDING-RECONCILIATION** — depends on current code shape that SME has not verified; developer must reconcile against actual file state before lock.
- **OPEN** — explicit deferral; developer judgment requested.

---

## Executive summary

**What this memo locks** (LOCKED-FROM-PRINCIPLE):

- Two funnel entry methods with distinct contracts: `writeFreshRecord` (initial emission) + `appendReconciliationEntry` (cascade/mutation append).
- `causedBy` threads via **caller-passed parameter** (not session-scoped context); **immediate-predecessor** semantics per F1; **intra-CAU reconciliationHistory scope only** (not cross-CAU lineage).
- Orchestrator owns cascade state and predecessor-ID threading; funnel is cascade-agnostic.
- No `DP2NonConformanceError` suppression in core modules; error propagates to pipeline boundary.
- **Halt-on-first-failure** cascade semantics: succeeded emissions before the failure remain persisted; emissions after the failure are not attempted; no rollback (StateAdapter transactionality is not a given).

**What this memo flags for developer reconciliation** (9 PENDING-RECONCILIATION items across §2–§5):

- §2.2 Funnel API shape — pure validator (Shape A) vs adapter-composing (Shape B); SME preference Shape B.
- §2.3 I2a-on-append validation scope — whole-record or new-entry-only?
- §3.2 Three-state-evaluator sub-site consolidation.
- §3.3 NA-1.1 provisional `validationState` handling (F3 compliance).
- §3.3 Append-vs-fresh-write semantics on cascade-triggered state change (NA-1.3 disposition flip).
- §3.4 Reactive-engine mutationSource enum shape.
- §3.5 NotApplicable routing emission (verify records emitted, not just logged).
- §3.6 Analyst override schema details (append vs fresh-write).
- §5.1 Target N = 10 (soft target; hard floor 5, one per family).

**Scope OUT:** new invariants; new reasoning semantics; Workbench v0.2 panel adaptations (§9.3); RoleNC5 (v1.1+); class-subsumption infrastructure (v1.1+); PROV-O Pass 2 test plan modifications.

**Next action:** developer reconciliation pass against current code state, followed by SME response and lock transition.

---

## 1. Problem statement

D1.6 Phase 1 closed 2026-04-24 with 70/70 AVC scenarios passing and Band 8 (synthetic PROV-O) green. The F4 audit (`dp2-writepath-chokepoint-exclusivity`) found exactly one persist call site: the funnel definition itself. The five upstream site-family callers do not currently route through the funnel. Real PROV-O exercised through the live pipeline produces zero DP-2 records.

The integration gap is structural, not semantic. The funnel exists, validates correctly, and emits records when called directly (proven by AVC). The site families exist, perform their reasoning correctly, and have been verified against their own scenarios. What's missing is the wiring between them.

This memo locks that wiring. It does not change reasoning semantics, add invariants, or modify the funnel contract — those are scope fence violations. It specifies, for each of the five site families, exactly how the call to the funnel is composed: which production emitters run before, what `context.phase` value is passed, how `causedBy` threads through cascade-triggered emissions, and how `DP2NonConformanceError` propagates.

Load-bearing constraint: once this lands, the F4 audit's expected call site count rises from 1 to N (target locked in §5). The audit's negative assertions (no bypass, no discarded return, no `DP2NonConformanceError` suppression, no absence-based phase routing) must hold across all N sites. Any wiring that violates these is a defect to be fixed in the engine, not accommodated by weakening the audit.

**Note on "five families, ten sub-sites."** The five site families are `three-state-evaluator`, `inheritance-cascade`, `reactive-engine`, NotApplicable routing, and analyst override. Several families contain multiple sub-sites (three-state-evaluator has three terminals; inheritance-cascade has NA-1.1 + NA-1.3; NotApplicable has three routing mechanisms). §5 decomposes to ten sub-sites for the F4 audit count; §3 is organized by family.

---

## 2. Funnel API confirmation

### 2.1 Two architectural shapes

**Shape A — Pure validator.** `record-persistence.js` exports a function that takes a record + context, runs invariant validation (I1, I2a, I4 active per current sub-wave), returns a validated record envelope, and **does not persist**. The caller is responsible for invoking the StateAdapter persist method with the validated record.

**Shape B — Adapter-composing.** `record-persistence.js` exports a function that takes a record + context + injected StateAdapter, runs validation, and **calls adapter persist itself**. Caller never touches adapter directly for DP-2 records.

### 2.2 SME position

**SME-PROPOSED — PENDING-RECONCILIATION (Shape B preferred).** Adapter-composing with injected adapter is the stronger structural guarantee for the F4 audit. With Shape A, the audit must verify that for each validated-record envelope, a corresponding adapter persist call exists, and that no adapter persist call bypasses validation. With Shape B, the audit reduces to: every adapter persist call for a DP-2 record originates from inside the funnel; any direct adapter persist call for a DP-2-shaped record from outside the funnel is a bypass defect.

The CLAUDE.md core-module discipline (pure functions, JSON-LD in/out, no hidden state or I/O) is satisfied by Shape B *if* the adapter is passed as an injected parameter rather than imported as a module dependency. No hidden state; no module-level coupling; the funnel is still pure with respect to its inputs.

**Reconciliation requirement:** developer must verify the current API shape. If `record-persistence.js` is currently Shape A (pure validator), Shape B is a refactor — small in scope (adding an adapter parameter; calling adapter.persist after validation succeeds), but it must land before site-family wiring proceeds, otherwise each site family inherits the dual-call-site burden permanently.

If the developer pushes back — i.e., Shape A is currently in production and the dual-call burden is acceptable — SME will reconsider on grounds of refactor cost vs. audit strength. The architectural preference is Shape B; the principle is *single chokepoint for both validation and persistence*. If Shape A is retained, the F4 audit's negative assertions must extend to cover validator-bypass as well as persist-bypass, doubling the audit surface.

### 2.3 Two funnel methods regardless of shape

**LOCKED-FROM-PRINCIPLE.** Whichever shape is selected, the funnel exposes two methods with distinct contracts:

- **`writeFreshRecord(record, context, [adapter])`** — for NA-1.1 (provisional inheritance) and three-state-evaluator terminals (initial emission). Validates and persists (Shape B) or returns validated envelope (Shape A) for a brand-new record.
- **`appendReconciliationEntry(cauId, entry, context, [adapter])`** — for NA-1.2 / NA-1.3 / NA-1.4 (reconciliation cascade and reactive mutation). Validates a single new `reconciliationHistory` entry against the existing record, performs the append, persists the updated record (Shape B) or returns the updated envelope (Shape A).

Both methods route through identical invariant gates (I1, I2a, I4 currently; I2b and I3 post-DP-2.3.2). Both honor `context.phase`. Both return an envelope that includes the persisted entry's ID for downstream `causedBy` threading (§4).

Rationale for two methods rather than one polymorphic `writeOrAppend`: F4 audit clarity. Two well-named entry points let the audit assert "any DP-2 record persistence flows through one of these two methods" with no internal-dispatch ambiguity. Polymorphism would require the audit to inspect call-site arguments to distinguish fresh-write from append, which is a weaker structural check.

**SME-PROPOSED — PENDING-RECONCILIATION (I2a scope on append).** When `appendReconciliationEntry` runs, does I2a re-validate the whole record (including all prior reconciliationHistory entries, explanation, provenance) or only the new entry being appended? Two readings, both defensible:

- **Whole-record re-validation.** Stronger guarantee — guards against external corruption of persisted state between emissions. Cost: repeated work per append; may be material on long histories.
- **New-entry-only validation.** Cheaper; assumes persisted state is immutable-once-written (record can only change by append). Requires a separate invariant check at persist-layer to guarantee the assumption.

SME's preference is whole-record on the first append per session (to catch cold-load corruption) and new-entry-only on subsequent same-session appends (amortized cost). But this is an implementation-layer decision that depends on current I2a scope and adapter guarantees. Developer reconciliation resolves.

---

## 3. Per-site-family integration spec

### 3.1 General pattern (applies to all five families)

**LOCKED-FROM-PRINCIPLE.** Every site-family call to the funnel follows this pattern:

1. **Run production emitters** in fixed order: `explanation-builder` → `provenance-builder` → `reproducibility-hash` (Note: hash is `<zeros-placeholder>` with `_scaffold: true` until DP-2.3.2 lands; that is the I2b bypass token, working as designed). *DP-2.3.2 has since landed (commit 36755a1); update note at lock time.*
2. **Compose the canonical record** from the emitter outputs per the §7.2 schema.
3. **Construct context object** with explicit `phase: 'production'`, the site-family identifier, and (for cascade-triggered emissions) the `causedBy` predecessor entry ID.
4. **Call the funnel** — `writeFreshRecord` or `appendReconciliationEntry` per emission semantics.
5. **Capture the returned envelope** and (if the site family triggers downstream cascade) thread the persisted entry ID forward.
6. **Do not catch `DP2NonConformanceError`** — let it propagate to the pipeline boundary per §3.7.

### 3.2 three-state-evaluator.js terminals

**Three sub-sites: Entailed, Plausible, Inconsistent.**

Each terminal builds its own record per the structured-evidence-by-candidate schema (§7.2 / §4.2 of the DP-2 sketch). All three are fresh-write emissions — three-state-evaluator is the initial classification point for a CAU.

**Wiring per terminal:**

| Terminal | Method | Phase | causedBy |
|---|---|---|---|
| Entailed | `writeFreshRecord` | `'production'` | `null` |
| Plausible | `writeFreshRecord` | `'production'` | `null` |
| Inconsistent | `writeFreshRecord` | `'production'` | `null` |

`causedBy` is `null` because three-state-evaluator terminals are initial classifications, not cascade responses — they originate the cascade chain rather than continuing one. (See §4.1 footnote: `causedBy` scope is intra-CAU reconciliationHistory, not cross-CAU lineage.)

**SME-PROPOSED — PENDING-RECONCILIATION:** keep the three sub-sites as distinct call sites, not consolidated into a single dispatch. Consolidation to a `writeTerminalRecord(terminal, ...)` would obscure per-terminal auditability. Counter-position: if the developer's grep reveals these already share a single emission helper internally, the consolidated form may be retained provided the call-site reads as terminal-explicit at the F4 audit level. Open to developer judgment.

### 3.3 inheritance-cascade.js — NA-1.1 and NA-1.3

**Two sub-sites: NA-1.1 provisional inheritance write, NA-1.3 reconciliation cascade append.**

**NA-1.1 (provisional inheritance):** fresh-write. When inheritance produces a new provisional CAU classification, this is its initial record. `writeFreshRecord`, `phase: 'production'`, `causedBy: null`.

*Clarification on `causedBy: null` for NA-1.1.* The inheritance relationship to the parent CAU IS a causal relationship in the semantic sense, but `causedBy` is not the right field for capturing it. Per F1, `causedBy` scope is **intra-CAU reconciliationHistory chain-walkability** — it threads entries within a single CAU's own history. The parent-child inheritance linkage is captured by a separate field in the provenance schema (likely `inheritedFrom` or equivalent per §7.3 — verify shape at reconciliation). Conflating the two would produce ambiguous chain-walks (is the predecessor intra-CAU or cross-CAU?) and break the F4 audit's structural check.

**SME-PROPOSED — PENDING-RECONCILIATION:** confirm that NA-1.1 produces records with `validationState: 'provisional'` and that I2a accepts these per the F3 resolution (terminal-`provisional` rejected; in-flight `provisional` accepted — the distinction holds by structural invariant per the DP-2.2 V1 answer, since chokepoint is invoked at persist time only). If NA-1.1 marks `provisional` as terminal in any path (i.e., persists without NA-1.2 having run), that's a separate defect to surface, not absorb.

**NA-1.3 (reconciliation cascade — append-only):** When a parent CAU's reconciliation triggers re-evaluation of a property-linked neighbor (per X1 definition), the neighbor's record receives a new `reconciliationHistory` entry. `appendReconciliationEntry`, `phase: 'production'`, `causedBy: <id of the parent's triggering reconciliationHistory entry>` (see §4).

**Locked entry shape for NA-1.3 appends:**
- `triggeringEvent: 'parent_reconciliation'`
- `parentCau: <parent CAU IRI>`
- `causedBy: <parent's reconciliation entry ID>`
- `mechanism: 'na_1_3_cascade'`

**SME-PROPOSED — PENDING-RECONCILIATION (state-change on cascade).** If NA-1.3 cascade re-evaluates a CAU that was previously `Entailed` and the new evaluation produces `Inconsistent`, how is the record shape updated?

Two readings:

- **Append-plus-state-update.** `appendReconciliationEntry` appends the new entry AND updates top-level mutable fields (`disposition`, `bfoCategory`, `validationState`) to reflect the new classification. reconciliationHistory preserves the journey; top-level fields reflect current state. The funnel call must be aware of state transitions.
- **Append-only, top-level stale.** `appendReconciliationEntry` only appends the history entry. Top-level fields remain frozen at the initial classification. "Current disposition" must be derived by walking reconciliationHistory to the latest entry, not read from top-level.

SME preference is append-plus-state-update — top-level fields should be authoritative for quick reads, history should carry the journey. But this requires the funnel to know which mutable fields to update per event type. Developer reconciliation resolves whether the current record schema's top-level fields are intended as "current" (mutable) or "initial" (immutable). **Hard constraint regardless:** whichever reading holds, reconciliationHistory is append-only; prior entries are never mutated or removed.

### 3.4 reactive-engine.js — NA-1.4

**One sub-site: NA-1.4 mutation-triggered re-evaluation.**

NA-1.4 fires when a mutation (axiom add/remove, helper-state change, etc.) invalidates prior reconciliation. It always operates on existing records — it appends, never fresh-writes. `appendReconciliationEntry`, `phase: 'production'`.

**causedBy threading:** if the NA-1.4 firing is itself caused by a prior NA-1.3 cascade event (the reactive engine is a downstream consumer of cascade output), `causedBy` cites the immediate predecessor — the NA-1.3 entry that triggered the re-evaluation. Per F1, this is *immediate* predecessor, not cascade root. If NA-1.4 fires from a non-cascade source (direct user mutation, axiom-set update from ingestion, etc.), `causedBy: null`.

**Locked entry shape for NA-1.4 appends:**
- `triggeringEvent: 'reactive_mutation'`
- `mutationSource: <enum: 'axiom_change' | 'helper_state_change' | 'user_action'>` *(SME-PROPOSED — verify enum against current reactive-engine code)*
- `causedBy: <predecessor entry ID> | null`
- `mechanism: 'na_1_4_reactive'`

State-change-on-append semantics per §3.3 (cascade) apply equivalently here.

### 3.5 NotApplicable routing — three mechanisms

**Three sub-sites: automatic, default_axiom_poor, manual.**

Per DP-2.2.D4 closed enum, each NotApplicable routing decision is a distinct mechanism that must be named explicitly. Per DP-2.1.D3, the evidence list has a single-element floor and the routing trigger must be present.

**Wiring per mechanism:** each is a fresh-write emission of a NotApplicable-typed record. `writeFreshRecord`, `phase: 'production'`, `causedBy: null` (NotApplicable routing is a placement decision, not a cascade response).

| Mechanism | Method | Phase | causedBy | Single-element evidence |
|---|---|---|---|---|
| automatic | `writeFreshRecord` | `'production'` | `null` | routing trigger named: `'automatic'` |
| default_axiom_poor | `writeFreshRecord` | `'production'` | `null` | routing trigger named: `'default_axiom_poor'` |
| manual | `writeFreshRecord` | `'production'` | `null` | routing trigger named: `'manual'` |

**SME-PROPOSED — PENDING-RECONCILIATION:** confirm that NotApplicable routing in current code emits records (not just logs decisions). If routing currently produces no record, the wiring task includes adding the emission, not just routing it through the funnel. This is a Phase 1 closeout gap that may be larger than "wiring" if so — flag at reconciliation pass.

### 3.6 Analyst override path — Band 3 analystOverrideCAU

**One sub-site: analyst override emission.**

Analyst override is an explicit human action that re-classifies a CAU. SME's default read is **append, not fresh-write**: override is a state transition layered on top of the existing record, carrying the prior automated classification in reconciliationHistory for audit purposes. `appendReconciliationEntry`, `phase: 'production'`, `causedBy: null` (override is human decision, not cascade continuation, even if it follows prior automated entries).

**Locked entry shape for analyst override appends:**
- `triggeringEvent: 'analyst_override'`
- `analystId: <identifier>`
- `timestamp: <ISO>`
- `rationale: <string, per analystOverrideCAU schema>`
- `priorAutomatedDisposition: <prior disposition — for audit>`
- `causedBy: null`
- `mechanism: 'analyst_override'`

State-change-on-append semantics per §3.3 apply (top-level `disposition` updates to the override's outcome; history preserves the prior).

**SME-PROPOSED — PENDING-RECONCILIATION (append vs fresh-write).** If the current Band 3 `analystOverrideCAU` trigger emits as fresh-write rather than append, the lock here is wrong — flag at reconciliation. The choice depends on whether override is semantically "a new record supersedes old" or "the CAU's record is augmented." SME's read is the latter per §7.2 v1.1.0 extension schema (reconciliationHistory + `conflictAnnotation` are designed to carry override context), but developer verification on current implementation shape is required.

### 3.7 Error semantics — DP2NonConformanceError propagation

**LOCKED-FROM-PRINCIPLE.** No site-family caller catches `DP2NonConformanceError`. The error propagates to the pipeline boundary, where pipeline-layer error handling logs structured failure information and either halts the run (batch context) or marks the input as failed-with-structured-reason (streaming context).

Rationale: `DP2NonConformanceError` indicates a structural defect in the emitting code — production emitters generated a record that cannot pass invariant validation. This is a bug, not a data anomaly. Suppressing it at the site-family layer would hide bugs from the pipeline operator; "fix the engine, don't weaken the test" applied to runtime: fix the emitter, don't suppress the error.

This rule is checkable mechanically by the F4 audit: any `try { ... funnel-call ... } catch (DP2NonConformanceError) { ... }` block in core modules is a defect. Pipeline-layer (boundary) handlers are permitted; core-module suppression is not.

### 3.8 Partial-cascade-failure semantics — halt-on-first-failure

**LOCKED-FROM-PRINCIPLE.** If NA-1.3 cascades to N neighbors and the kth emission throws `DP2NonConformanceError`:

1. Emissions 1..k-1 have already persisted (per §3.7: error propagates; no rollback).
2. Emission k fails; error surfaces to the cascade orchestrator.
3. Emissions k+1..N are **not attempted**. The cascade halts.
4. The orchestrator re-raises (or wraps with cascade context: which parent, which hop, how many emissions succeeded before failure) to the pipeline boundary.
5. Pipeline-boundary handler logs structured failure and routes per context (batch halt vs streaming mark-as-failed).

Rationale:

- **No rollback.** StateAdapter transactionality is not a CLAUDE.md guarantee (StateAdapter is pluggable). Successful emissions 1..k-1 remain persisted; cascade state is visibly partial. This is the cost of no-transaction architecture and should be surfaced honestly rather than hidden behind best-effort continuation.
- **Halt, not continue.** Continuing past emission k would allow known-bug state (emission k's failing record) to influence emissions k+1..N (which may cite the failing one via `causedBy` or neighbor lookup). Continuation hides the defect and contaminates downstream state.
- **Orchestrator re-raises, not funnel.** The funnel is cascade-agnostic. The orchestrator knows it's in a cascade; it's the right layer to annotate the error with cascade context before re-raising.

**OPEN (not in scope for this memo):** cascade-state recovery strategy. If emissions 1..k-1 remain persisted with a partially-invalidated cascade (some neighbors re-evaluated, others not), how does the system reach consistent state on the next cascade trigger? Candidate strategies: idempotent re-cascade (next trigger re-evaluates all N regardless of prior state), explicit repair protocol (admin action). Deferred to a separate recovery-strategy decision; this memo's scope is emission wiring only.

---

## 4. causedBy threading spec

### 4.1 Threading mechanism

**LOCKED-FROM-PRINCIPLE.** `causedBy` threads via **caller-passed parameter**, not session-scoped cascade context.

Each funnel call returns an envelope including the persisted entry's ID. Callers that trigger downstream cascade events thread that ID forward to the cascade orchestrator, which passes it to the next emission's `causedBy` parameter.

Rationale: explicit data flow over implicit context. Session-scoped cascade context is structurally similar to absence-based routing — it relies on ambient state that must be correctly populated and read at every call site. Explicit parameter threading is harder to forget (the call site is missing a required argument), easier to audit (grep for `causedBy:` in funnel calls), and consistent with the transparent-callback-forwarding principle (no wrapping, no implicit defaults).

**Scope note (load-bearing).** `causedBy` scope is **intra-CAU reconciliationHistory chain-walkability only**. It threads entries within a single CAU's own history. Cross-CAU lineage (e.g., the parent-child inheritance relationship in NA-1.1, or the property-linked-neighbor relationship that triggered NA-1.3 cascade) is captured by *separate* provenance fields (`inheritedFrom`, `parentCau`, etc.). Conflating the two would produce ambiguous chain-walks and break both the F4 audit and operator-level audit tooling.

### 4.2 Predecessor semantics — immediate, not root

Per DP-2.2.D3 with F1 fold-in: `causedBy` cites the **immediate** predecessor in the cascade chain, not the cascade root. If A reconciles → triggers B → triggers C, then C's `causedBy` references B's entry ID, not A's. Chain-walkability is preserved by walking `causedBy` references hop-by-hop; the cascade root is reachable via this walk but not cited directly.

This is the F1 lock from the DP-2 review cycle and is non-negotiable here.

### 4.3 Threading boundaries

**LOCKED-FROM-PRINCIPLE for the cases below; OPEN for additional patterns surfaced by reconciliation:**

| Cascade pattern | causedBy source |
|---|---|
| Three-state-evaluator initial classification → originates chain | `null` (initial) |
| NA-1.1 inheritance emission → initial record for a CAU | `null` (initial; inheritance lineage is a separate field) |
| NA-1.3 cascade fired from parent reconciliation | Parent's reconciliationHistory entry ID (immediate predecessor) |
| NA-1.3 multi-hop within single cascade pass (A→B→C) | C's `causedBy` = B's entry ID (not A's) |
| NA-1.4 reactive fired from prior NA-1.3 cascade entry | The triggering NA-1.3 entry's ID |
| NA-1.4 reactive fired from non-cascade mutation source | `null` (originates new chain) |
| NotApplicable routing decision | `null` (placement decision, not cascade) |
| Analyst override | `null` (human decision, not cascade continuation) |

**SME-PROPOSED — PENDING-RECONCILIATION:** confirm that NA-1.3 cascade is implemented as discrete hops with discrete entry emissions per hop, not as a single batch update at cascade fixed-point. If batch-update, the per-hop-predecessor threading model needs revisit.

### 4.4 Orchestrator responsibility, not funnel responsibility

The funnel does not compute or infer `causedBy`. It records whatever the caller provides. The cascade orchestrator (the loop or driver in `inheritance-cascade.js` or `reactive-engine.js` that walks the dependency graph and dispatches re-evaluations) is responsible for tracking which entry ID triggered each downstream emission and threading it through.

This keeps the funnel pure with respect to cascade state. The funnel does not know about cascades; it knows about records and entries. The orchestrator knows about cascades.

---

## 5. F4 audit target — expected call site count

### 5.1 Target N

**SME-PROPOSED — PENDING-RECONCILIATION (target N = 10).**

Enumerated per §3:

| Site family | Sub-sites | Method | Count |
|---|---|---|---|
| three-state-evaluator | Entailed, Plausible, Inconsistent | `writeFreshRecord` | 3 |
| inheritance-cascade | NA-1.1, NA-1.3 | `writeFreshRecord`, `appendReconciliationEntry` | 2 |
| reactive-engine | NA-1.4 | `appendReconciliationEntry` | 1 |
| NotApplicable routing | automatic, default_axiom_poor, manual | `writeFreshRecord` | 3 |
| analyst override | analyst_override | `appendReconciliationEntry` | 1 |
| **Total** | | | **10** |

### 5.2 Tolerance for consolidation

If the developer's grep reveals current code organization that consolidates some sub-sites into shared emission helpers (e.g., a single three-state-evaluator emission point with internal terminal-state branching), N may reduce. Acceptance condition: each consolidated site must produce **F4-audit-traceable evidence** of which sub-path triggered each emission — typically by passing the sub-path identifier in the context object so the audit can reconstruct sub-site coverage from emission logs or trace output.

**Hard floor on N:** 5 (one per site family). Below 5 means cross-family consolidation, which is a smell — the five families are semantically distinct and should not share an emission entry point. If the developer proposes N < 5, SME pushback expected.

### 5.3 Negative assertions (unchanged from F4 baseline)

The F4 audit's negative assertions hold across all N sites:

1. **No bypass.** No DP-2 record reaches StateAdapter persist except through the funnel.
2. **No discarded return value.** The funnel's returned envelope is captured and used (for `causedBy` threading or for caller-side post-emission logic). Discarded returns are a smell; they suggest the caller doesn't know what to do with the persisted entry's ID, which suggests the cascade-threading wiring is incomplete.
3. **No `DP2NonConformanceError` suppression.** Per §3.7, no core-module catch blocks for this error type.
4. **No absence-based phase routing.** Every funnel call passes `context.phase` as a literal `'production'` or `'scaffold'` value, or as a propagated value from a phase-explicit caller boundary.

---

## 6. Acceptance criteria

### 6.1 Integration tests required

**LOCKED-FROM-PRINCIPLE.** The following test cases must pass before integration is considered complete:

1. **Per-site-family emission test (one per sub-site, N tests).** Exercise each site family's emission path with a minimal valid input; assert that exactly one funnel call results, with correct method, phase, and (where applicable) `causedBy`.
2. **Cross-family cascade test.** Exercise NA-1.3 cascade triggered by three-state-evaluator initial classification; assert that emitted records form a chain-walkable `causedBy` sequence from cascade root to terminal.
3. **NA-1.3 → NA-1.4 chain test.** Exercise a mutation that fires NA-1.4 in response to a prior NA-1.3 entry; assert immediate-predecessor `causedBy` semantics (NA-1.4 entry references NA-1.3 entry, not cascade root).
4. **Partial-cascade-failure test.** Inject a deliberately-invalid emission at hop k of an N-hop cascade; assert emissions 1..k-1 persisted, emissions k+1..N NOT attempted, error surfaced with cascade context at pipeline boundary.
5. **F4 audit re-run.** After wiring, re-run `dp2-writepath-chokepoint-exclusivity`; assert call site count equals locked target N (or the developer-reconciled value); assert all four negative assertions hold.
6. **Real PROV-O end-to-end test.** Exercise the live pipeline against the synthetic PROV-O input set used in Band 8; assert that DP-2 records are produced (count > 0); assert that record shape conforms to §7.2 schema; assert that the records' `mechanism` distribution matches expected coverage of the five site families.
7. **70 AVC regression test.** Re-run all 70 Phase 1 AVC scenarios; assert no regressions.

### 6.2 "Done" definition

Integration is done when all seven test categories pass, the F4 audit reports the locked N, and the live pipeline produces conformant DP-2 records on real PROV-O input.

### 6.3 Honest-admission rule on defects surfaced during wiring

**LOCKED-FROM-PRINCIPLE.** This is the load-bearing rule for the integration cycle.

If wiring surfaces a defect in a production emitter (record fails I2a; `validationState` ends up terminal-`provisional`; `causedBy` cannot be threaded because the orchestrator doesn't have the predecessor ID; etc.), the resolution is to **fix the emitter or the orchestrator**, not to:

- Soften the invariant.
- Add a default value that masks the defect.
- Suppress `DP2NonConformanceError` at the site family.
- Mark the test as expected-failure.
- Carve a per-site-family exemption.

The principle is the same as Wave 2's "fix the engine, don't weaken the test." Applied here: if the integration test fails because the engine is wrong, fix the engine. If the integration test fails because the test is wrong, document why explicitly and fix the test with PO acknowledgement. The third option — silent accommodation — is not on the table.

### 6.4 Bidirectional traceability

**LOCKED-FROM-PRINCIPLE.** Each wired site-family source file gains a header reference to this memo (`// Wired per SME-D16-X3 §3.X`). This memo's §3 site-family subsections, on lock, are updated with the resolved file paths and grep-confirmed sub-site locations from the developer's reconciliation pass. Readers walking either direction (memo → file or file → memo) must reach the other end.

---

## 7. Process pattern — going forward

The standard pattern for SME-D16-X scoping cycles is:

1. **Developer pre-proposal.** Developer enumerates current persist-adjacent code in each site family (via grep + inspection); proposes wiring patterns; identifies surprises (sub-sites not anticipated; current code shape incompatible with expected pattern; defects discovered en route).
2. **SME scoping memo.** SME reviews pre-proposal; locks decisions per architectural questions; resolves each site-family wiring; flags scope violations.
3. **Developer ACK + implementation plan.** Developer responds with implementation plan, estimates, and any pushbacks on locked decisions.
4. **Implementation lands with bidirectional traceability.** Headers reference the memo; memo references the files.

**Cycle inversion notice:** this memo was produced under inverted cycle (step 2 before step 1), at PO direction. This means the SME positions tagged **PENDING-RECONCILIATION** carry explicit provisional-until-verified status. The developer's reconciliation pass IS the substitute for the missing step 1.

**Reconciliation pass deliverable shape:**
- Confirm or revise each PENDING-RECONCILIATION tag by reading the actual code state.
- Surface any sub-sites or families not anticipated in §3.
- Flag any LOCKED-FROM-PRINCIPLE position that conflicts with current code shape.
- Identify defects discovered during enumeration (per §6.3 — fix at the engine, not by weakening the lock).

After reconciliation, the memo updates from DRAFT to LOCK-IN-PROGRESS, then to LOCKED following developer ACK on the reconciliation outcome.

---

## 8. References

- `specs/d16/d16-phase1-closeout.md` §6 (gap statement); §7 (Pass 2 prerequisites); §8 (module list)
- `specs/d16/dp2-locked-decisions.md` — DP-2 decision context; F1, P1, P2 resolutions
- `specs/d16/dp2-scaffolding-design-sketch.md` §3.2 (site family enumeration); §4.2 (record builder structure); §7.2 (record schema)
- `specs/d16/bundle-v5-authorization-memo.md` §2.1 (F4 negative assertions); §4.5 (site family orientation)
- `src/core/d16/record-persistence.js` (the funnel) — *referenced; SME has not directly read; §2 reconciliation depends on this*
- `src/core/d16/canonical-record-writer.js` (validator + scaffold emitters)
- `src/core/d16/explanation-builder.js`, `provenance-builder.js`, `reproducibility-hash.js` (production emitters)
- Site-family source files: `three-state-evaluator.js`, `inheritance-cascade.js`, `reactive-engine.js`, plus NotApplicable routing and analyst override locations — *exact paths to be confirmed by reconciliation*
- Project memory: `project_d16_dp2_design_review_cycle.md`; `project_d16_na_architecture_commitments.md`
- Feedback memory: `feedback_scaffold_production_split.md`; `feedback_absence_not_evidence.md`; `feedback_structured_failure_reasons.md`; `feedback_transparent_callback_forwarding.md`; `feedback_proof_discipline.md`
- SME-D16-X1 (`dp2-x1-property-linked-neighbor-memo-rev1.md`) — definition consumed by NA-1.3 cascade per §3.3

---

**Reserved doors for developer pushback:**

- §2.2 Shape A vs Shape B — refactor cost may dominate audit-strength benefit if Shape A is deeply embedded; SME open to retaining Shape A with extended audit surface.
- §2.3 I2a-on-append scope — whole-record vs new-entry-only; implementation-cost-dependent; SME preference is hybrid (whole-record on first append per session, new-entry-only thereafter), but open to developer-proposed alternative.
- §3.3 State-change-on-append semantics — depends on current schema treatment of top-level mutable fields; lock reflects SME's read of §7.2 v1.1.0 extension intent but needs code verification.
- §3.6 Analyst override append-vs-fresh-write — lock reflects SME's schema read; if current implementation is fresh-write, flag and revise.
- §3.X other PENDING-RECONCILIATION tags — any may flip on actual code inspection; the lock is the principle (per-sub-site auditability, fresh vs append distinction, causedBy null-for-initial), not the specific count or method assignment.
- §5.1 N = 10 — soft target. Hard floor is 5 (one per family). Anywhere in [5, 10] is acceptable provided sub-site traceability holds.
- §4.3 NA-1.3 single-hop vs multi-hop emission — if cascade is implemented as batch update at fixed-point rather than per-hop emission, the threading model needs revisit.

**Next action:** developer reconciliation pass against actual code state, addressing each PENDING-RECONCILIATION tag, surfacing unanticipated cases, and either confirming or flagging conflicts with locked-from-principle positions. Followed by SME response and lock transition.
