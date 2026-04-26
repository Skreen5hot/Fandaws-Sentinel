# SME-D16-X7 — OWL-DERIVED Dispatcher Integration

**Status:** DRAFT v1 2026-04-25. Standard cycle: this SME memo → developer ACK + implementation plan → PO pre-code confirmation → implementation. Cycle-inversion not in play; X7 is small-scope wiring against an architecturally-locked surface (X6 memo) with all reserved doors on the developer's pre-existing code.
**Owner:** SME. PO routed Option D 2026-04-25 post-X6 closure.
**Consumes:** X6 LOCKED memo (`sme-d16-x6-bucket-c-memo-v1.md`); X6 implementation plan (L2 prologSession threading); X4 memo §6.2 Bucket C scope-out clause that `dispatchCuratedNC` honored under Bucket A.
**Consumed by:** developer Commit 5+ implementation; downstream X8 AVC migration cycle (Option E sequel); production callers eventually feeding real PROV-O bytes via Workbench v0.2 or Node harness.
**Scope fence:** wire 6 OWL-DERIVED NC helpers (X6 deliverable) into the dispatcher's `evaluateNCSatisfaction` + `pipeline-orchestrator` call paths. Activates Bucket C in production. **Out of scope:** AVC migration (X8/Option E); real `.owl` parser (Node harness or Workbench v0.2); Bucket B v1.1+ helpers (RoleNC5 etc.); any new reasoning semantics.

**Tag legend** unchanged from prior X-series memos.

---

## Load-bearing context

**X6 closed the inference gap; X7 closes the integration gap.** The same shape as Phase 1 closeout's site-family-to-funnel gap that X3 closed: infrastructure landed at one layer (X6 helpers, ~120 unit tests, OWA-preservation discriminating fixture); production consumers at another layer don't yet invoke it.

Currently in `nc-dispatcher.js:246-253`: OWL-DERIVED NCs route to `undetermined` with a "Bucket C scope-out" deferredReason. That comment lands false post-X6 — Bucket C is no longer scope-out. The dispatcher needs to invoke X6 helpers when prologSession is supplied; preserve the Bucket-A undetermined behavior when prologSession is absent (TEMPORARY MIGRATION SUPPORT seam).

This is the L2 lifecycle pattern operationalized. Caller owns prologSession; threads it through `evaluatorInput.prologSession` → orchestrator → dispatcher → helper. Stateless orchestrator + stateless dispatcher; helper consumes session by reference.

---

## Executive summary

**LOCKED-FROM-PRINCIPLE:**

- Integration target: **`evaluateNCSatisfaction` OWL-DERIVED branch** (`nc-dispatcher.js:246-253`) consumes prologSession when supplied; routes through X6 helper registry; falls back to undetermined when prologSession absent.
- prologSession threading: explicit-per-call from caller → orchestrator → dispatcher → helper, per X6 §6.2 L2 lock.
- New helper registry: maps OWL-DERIVED NC `id` (e.g., `'ICNC2'`) → X6 helper function. Parallels existing CURATED-NC `HELPER_NC_OVERRIDES` and `HELPER_REGISTRY` patterns at `nc-dispatcher.js:97-122`.
- prologSession-absent semantics: legacy callers continue routing OWL-DERIVED → undetermined. Preserves TEMPORARY MIGRATION SUPPORT discipline.
- Helper async-await propagation: `evaluateNCSatisfaction` becomes async; orchestrator's `runEvaluationWithOptionalDispatcher` (already async per `pipeline-orchestrator.js:407`) awaits naturally; `evaluateSingleNC` becomes async.
- Trichotomy preservation: helper `result: true` → satisfied; `result: false` → unsatisfied; helper never produces undetermined under Option C (substrate guarantee from X6).
- Evidence map: helper's `{result, reason, evidence, fallbackUsed, fallbackTrigger, groundsNC, helperIRI}` envelope flows into dispatcher evidence map under helper-evidence shape.
- AVC regression: 70/70 must hold; existing scenarios use legacy path (no prologSession) → OWL-DERIVED behavior unchanged for them.

**SME-PROPOSED — PENDING-DEVELOPER-ACK:**

- §3.2 OWL-DERIVED helper registry shape (NC id → async helper) — developer confirms key naming + module location.
- §4.1 Async cascade through dispatcher entry points — `evaluateNCSatisfaction`, `evaluateSingleNC`, `evaluateOwlDirect` (P1 recursion). All become async due to OWL-DERIVED branch's await; developer confirms scope of async propagation.
- §4.2 Test coverage rubric for the integration surface — focus on dispatcher-helper contract (helper output → trichotomy mapping); X6 substrate tests already cover helper internals.

**OPEN:**

- X6 §3.9.1-style PROCESS_SUBTREE / ancestorChain transitive-closure caller contract — should X7 add validation at dispatcher entry, or document at signature? SME lean: document only (caller-contract trust per L2 explicit-per-call discipline).

**Scope OUT:**

- AVC scenario migration (X8/Option E).
- Real `.owl` parser harness (downstream).
- Workbench v0.2 UI (downstream).
- Bucket B v1.1+ helpers (RoleNC5 etc.; deferred per X4 §6.4).
- Any reasoning-semantic changes to X6 helpers.

**Next action:** developer ACK + implementation plan addressing §3.2 / §4.1 / §4.2. PO pre-code confirmation. Then implementation per single-commit or split-commit at developer's call.

---

## 1. Problem statement

X6 Bucket C delivered 6 OWL-DERIVED NC helpers + Tau Prolog substrate + reason enums + cross-NC interaction tests. The helpers exist in `src/core/d16/owl-derived-nc-helpers.js`, are unit-tested, and demonstrate Option C OWA preservation against Option B (per `owl-derived-nc-helpers.test.js:80-95` discriminating fixture). The substrate at `src/core/d16/bucket-c-prolog.js` is async-correct against Tau Prolog v0.3.4's setTimeout-0 callback model.

**What's missing:** the dispatcher entry path doesn't invoke them. `nc-dispatcher.js:246-253` OWL-DERIVED branch routes to `undetermined` unconditionally with a now-stale "Bucket C scope-out" comment. This means:

1. **The X6 architectural payload is unwired in production.** Real callers exercising the dispatcher get Bucket A behavior on OWL-DERIVED NCs, not Bucket C.
2. **The two BCL → NAN scenarios from x4-avc-triage §10 don't actually clear in production.** They're proven cleared *theoretically* by the per-NC unit tests; the production code path doesn't yet reach the helpers.
3. **The TEMPORARY MIGRATION SUPPORT seam at `pipeline-orchestrator.js:397` has nothing to migrate to** until the dispatcher consumes prologSession.

X7 closes this gap. Wire 6 helpers behind a registry + an async-aware dispatch path; preserve undetermined behavior when prologSession is absent (legacy callers); emit helper output into the trichotomy partition + evidence map per existing dispatcher contract.

---

## 2. Architectural locks

### 2.1 Helper invocation only when prologSession supplied

**LOCKED-FROM-PRINCIPLE.** The OWL-DERIVED dispatch branch consults a runtime check: if `evaluatorInput.prologSession` is present (and non-null), invoke X6 helper. Otherwise route undetermined per current Bucket A behavior with reason `'OWL-DERIVED-prolog-session-absent'` (renamed from current `'OWL-DERIVED-Bucket-C-deferred'`; the rename is part of X7 scope to retire stale documentation).

This preserves the legacy AVC path: 70 AVC scenarios run without prologSession; OWL-DERIVED NCs continue to route undetermined; BCL classifications hold for the 4 BCL scenarios. Migration to dispatcher path (X8/Option E) supplies prologSession; OWL-DERIVED NCs then route through X6 helpers.

### 2.2 prologSession threading per L2 lock

**LOCKED-FROM-PRINCIPLE per X6 memo §6.2.** prologSession flows: caller → `evaluatorInput.prologSession` → orchestrator's `runEvaluationWithOptionalDispatcher` (existing field per X6 implementation plan §2.2) → dispatcher's `evaluateNCSatisfaction({prologSession, ...})` → helper invocation.

No session-state holder; no implicit threading; no orchestrator-level session-init. Caller owns lifecycle; explicit per-call to dispatcher. Aligns with X3 §3.9.1 PO-routed adapter discipline.

### 2.3 Helper output → trichotomy mapping

**LOCKED-FROM-PRINCIPLE.** Each X6 helper returns `{result, reason, evidence, fallbackUsed, fallbackTrigger, groundsNC, helperIRI}`. Dispatcher integration:

- `helper.result === true` → `state.satisfied.add(ncId)`.
- `helper.result === false` → `state.unsatisfied.add(ncId)`.
- Helper never produces undetermined under Option C (substrate guarantee; X6 §2.3 deterministic-outcome lock). Defensive assertion: if a helper returns neither true nor false, throw `DispatcherContractViolationError` per `feedback_throw_not_warn_enforcement.md`.

**Evidence map shape:**
```js
state.evidence.set(ncId, {
  helperEvidence: {
    helperName: 'cauDoesNotRequireInheresIn',
    reason: 'inheres_in_absence_derived',
    evidence: { ancestorChain: [...] },
    fallbackUsed: false,
    fallbackTrigger: null,
    result: true,
  },
});
```

Matches the existing `dispatchToHelper` evidence shape at `nc-dispatcher.js:867-874`. CURATED-NC and OWL-DERIVED helpers use the same evidence-map convention.

### 2.4 Async cascade

**LOCKED-FROM-PRINCIPLE.** X6 helpers are async (substrate is async per Tau Prolog v0.3.4). Dispatcher functions on the path-from-entry-to-helper become async:

- `evaluateNCSatisfaction` → async.
- `evaluateSingleNC` → async (it dispatches to the OWL-DERIVED branch which awaits a helper).
- `evaluateOwlDirect` → async (the P1 recursion calls `evaluateAncestorCategory` which calls `evaluateSingleNC`).
- `evaluateAncestorCategory` → async (P1 recursion).
- `evaluateOwlDirect` patterns P2/P3/P4/P5 stay sync internally but the wrapping `evaluateOwlDirect` async-await passes through.

`pipeline-orchestrator.js:runEvaluationWithOptionalDispatcher` is already async per X6 implementation plan §2.2 (`await tryDerivationWithFallback` precedent). The orchestrator already awaits at the dispatcher boundary.

### 2.5 Throw-not-warn at integration boundary

**LOCKED-FROM-PRINCIPLE per `feedback_throw_not_warn_enforcement.md`.** Integration-layer defects (helper missing, helper return shape malformed, helper throws unexpected error) surface as `DispatcherContractViolationError` at the OWL-DERIVED branch — not silent fall-through to undetermined. Tau Prolog substrate's own `PrologSessionContractViolationError` propagates upward through the helper unchanged.

The branch's existing `'unknown-nc-tag'` default (line 259-264) handles unknown tags — that path stays. The new OWL-DERIVED branch does not collapse into the default; explicit-tag routing per the existing switch pattern.

---

## 3. Implementation specification

### 3.1 Module organization

**LOCKED-FROM-PRINCIPLE.** Keep dispatch logic in `nc-dispatcher.js`. Add a new helper registry section parallel to existing `HELPER_REGISTRY` (line 97) and `HELPER_NC_OVERRIDES` (line 111). Helpers themselves stay in `src/core/d16/owl-derived-nc-helpers.js` (X6 deliverable).

### 3.2 OWL-DERIVED helper registry

**SME-PROPOSED — PENDING-DEVELOPER-ACK on key naming.** Suggested shape:

```js
import * as owlDerivedHelpers from './owl-derived-nc-helpers.js';

// Maps NC `id` (e.g., 'ICNC2', 'ICNC3', 'IENC2', 'OccurrentNC2', 'MENC2', 'ProcessNC3')
// to async helper function. Keys match the `id` field in bfo-signatures-v1.0.json.
const OWL_DERIVED_HELPER_REGISTRY = Object.freeze({
  ICNC2: owlDerivedHelpers.cauDoesNotRequireInheresIn,
  ICNC3: owlDerivedHelpers.cauDoesNotRequireConcretizes,
  IENC2: owlDerivedHelpers.cauIncompatibleWithMatterAsPart,
  OccurrentNC2: owlDerivedHelpers.cauDisjointWithContinuant,
  MENC2: owlDerivedHelpers.cauConsistentWithSpatialAndMatter,
  ProcessNC3: owlDerivedHelpers.cauConsistentWithOneDimTemporal,
});
```

**Alternative shape (developer judgment):** keyed by NC IRI (e.g., `'bfo:ICNC2'`). Either works; SME lean is `id` keying for parity with existing CURATED-NC override map at `nc-dispatcher.js:111` which uses NC ID short-form keys. Developer confirms.

### 3.3 Dispatch branch — refactored

**LOCKED-FROM-PRINCIPLE on shape; SME-PROPOSED on prologSession-absent reason rename:**

```js
// In evaluateSingleNC — OWL-DERIVED branch (replaces current lines 246-253):
case 'OWL-DERIVED': {
  await dispatchOwlDerivedNC({
    nc, cauIRI, cauSignature, ancestorChain, prologSession, state,
  });
  return;
}
```

Where:

```js
async function dispatchOwlDerivedNC({
  nc, cauIRI, cauSignature, ancestorChain, prologSession, state,
}) {
  const ncId = nc.shortIRI;
  const helperFn = OWL_DERIVED_HELPER_REGISTRY[nc.id];

  // Legacy / migration-support path: prologSession absent → undetermined.
  if (!prologSession) {
    state.undetermined.add(ncId);
    state.evidence.set(ncId, {
      deferredReason: 'OWL-DERIVED-prolog-session-absent',
      note: 'OWL-DERIVED dispatcher requires prologSession (X6 Bucket C). Legacy callers without prologSession route undetermined per TEMPORARY MIGRATION SUPPORT seam at pipeline-orchestrator.js:397.',
    });
    return;
  }

  // Helper missing — implementation defect surface.
  if (!helperFn) {
    throw new DispatcherContractViolationError(
      `OWL-DERIVED NC '${nc.id}' has no helper in OWL_DERIVED_HELPER_REGISTRY. ` +
      `Per X6 §6.2, all 6 OWL-DERIVED NCs (ICNC2/ICNC3/MENC2/IENC2/OccurrentNC2/ProcessNC3) must be registered.`
    );
  }

  // Invoke helper.
  let result;
  try {
    result = await helperFn({
      prologSession, cauIRI, signature: cauSignature, ancestorChain,
    });
  } catch (err) {
    // Substrate errors (PrologSessionContractViolationError) propagate.
    // TypeError on missing inputs propagate.
    throw err;
  }

  // Map helper result → trichotomy partition.
  if (result.result === true) {
    state.satisfied.add(ncId);
  } else if (result.result === false) {
    state.unsatisfied.add(ncId);
  } else {
    // Defensive: helper returned non-boolean — contract violation.
    throw new DispatcherContractViolationError(
      `OWL-DERIVED helper '${result.helperIRI}' returned non-boolean result: ${JSON.stringify(result.result)}. ` +
      `Per X6 §2.3, OWL-DERIVED helpers under Option C produce deterministic boolean outcomes.`
    );
  }

  state.evidence.set(ncId, {
    helperEvidence: {
      helperName: helperFn.name || result.helperIRI || '(anonymous)',
      reason: result.reason,
      evidence: result.evidence,
      fallbackUsed: result.fallbackUsed,
      fallbackTrigger: result.fallbackTrigger,
      groundsNC: result.groundsNC,
      helperIRI: result.helperIRI,
      result: result.result,
    },
  });
}
```

### 3.4 evaluateSingleNC + evaluateNCSatisfaction async propagation

**SME-PROPOSED — PENDING-DEVELOPER-ACK on scope of async cascade.** Three functions become async:

- `evaluateNCSatisfaction` (entry point) — async; awaits on `evaluateSingleNC` per-NC loop.
- `evaluateSingleNC` — async; awaits on `evaluateOwlDirect` and on `dispatchOwlDerivedNC`.
- `evaluateOwlDirect` — async; the P1 case awaits `evaluateAncestorCategory`; P2/P3/P4/P5 cases stay sync but the wrapping function awaits.
- `evaluateAncestorCategory` (P1 recursion) — async; awaits on inner `evaluateSingleNC`.

Other helpers (`evaluateP2SubClassOf`, `evaluateP3PropertyRestrictionPresence`, `evaluateP4ConsistencyOrAbsence`, `evaluateP5RootDeclaration`) stay sync — their internals don't touch async. Wrapping `evaluateOwlDirect` awaits when needed; when not (P2/P3/P4/P5 paths), the await is a no-op.

**Caller surface:** `runEvaluationWithOptionalDispatcher` already awaits per X6 §2.2; `evaluateNCSatisfaction` returning a Promise is consumed cleanly. No orchestrator surface change beyond awaiting the new async dispatcher.

### 3.5 prologSession-absent reason text — banking the rename

**SME-PROPOSED — minor cleanup.** Current `'OWL-DERIVED-Bucket-C-deferred'` reason text at `nc-dispatcher.js:250` lands stale post-X6. Rename to `'OWL-DERIVED-prolog-session-absent'` with note pointing to TEMPORARY MIGRATION SUPPORT seam.

This is a documentation correctness fix bundled into X7. Not a contract change; reason values are diagnostic-not-load-bearing for trichotomy partition.

---

## 4. Test coverage requirements

### 4.1 Per-helper integration test (6 NCs)

For each X6 helper, one new test exercising the dispatcher → helper invocation path:

1. **Construct minimal prologSession** with helper-relevant background theory loaded.
2. **Invoke `evaluateNCSatisfaction`** with prologSession + targetBFOCategory + cauSignature whose helper would resolve.
3. **Assert** resulting trichotomy: target NC in `satisfied` or `unsatisfied`; not in `undetermined`.
4. **Assert** evidence map includes `helperEvidence` with correct `groundsNC`, `reason`, `result`.

These tests verify the integration boundary (registry lookup + prologSession threading + result mapping). Helper internals are X6 substrate concern.

### 4.2 prologSession-absent legacy path test (1 test)

Invoke `evaluateNCSatisfaction` against an OWL-DERIVED NC's required-set without prologSession; assert NC routes to `undetermined` with reason `'OWL-DERIVED-prolog-session-absent'`. Backwards-compat preserved.

### 4.3 Cross-cascade test (1-2 tests)

Process-target evaluation with prologSession supplied: dispatcher invokes ProcessNC3 helper (OWL-DERIVED) + ProcessNC1/2 (OWL-DIRECT) + ProcessNC4 (CURATED-NC via existing helper) + cascade through Occurrent NCs (NC1/2/3). Assert all 7 required NCs determinable (none undetermined under full Bucket A + B + C coverage). This is the BCL-cascade-unblock test in production.

### 4.4 Contract violation tests (2-3 tests)

- Helper registry missing entry → `DispatcherContractViolationError`.
- Helper returns non-boolean result → `DispatcherContractViolationError`.
- Helper throws `PrologSessionContractViolationError` → propagates unchanged.

### 4.5 70 AVC regression

All Phase 1 AVC scenarios pass (no prologSession in legacy path; OWL-DERIVED routes undetermined; BCL behavior preserved for the 4 BCL scenarios pending X8 migration).

### 4.6 Estimated test totals

| Category | Tests |
|---|---|
| Per-helper integration (6 × 1) | 6 |
| Legacy-path prologSession-absent | 1 |
| Cross-cascade integration | 1-2 |
| Contract violation | 2-3 |
| **Total new** | **~10-12** |

Plus 70 AVC regression (existing). Net gain expected: ~10-12 new tests. Suite count likely +0 (fits in existing `nc-dispatcher.test.js`).

---

## 5. Acceptance criteria

### 5.1 Per-acceptance-test class

1. ✅ All §4.1 per-helper integration tests pass.
2. ✅ §4.2 legacy path test passes; `'OWL-DERIVED-prolog-session-absent'` reason verified.
3. ✅ §4.3 cross-cascade test demonstrates 7-NC full determinability for Process target with prologSession.
4. ✅ §4.4 contract-violation tests verify throw-not-warn discipline at integration boundary.
5. ✅ 70 AVC regression: no Phase 1 regression.
6. ✅ Code review confirms async cascade is correct (no missing `await`; no Promise-returning function called synchronously).

### 5.2 Documentation hygiene

- Stale `'OWL-DERIVED-Bucket-C-deferred'` reason text removed; replaced with `'OWL-DERIVED-prolog-session-absent'`.
- Dispatch branch comment updated: explicit reference to X7 + X6 + TEMPORARY MIGRATION SUPPORT seam.
- `evaluateNCSatisfaction` JSDoc updated to document `prologSession` parameter (when it triggers OWL-DERIVED dispatch; absence semantics).

### 5.3 BCL-cascade-unblock attestation in production

Post-X7 landing: the cross-cascade test (§4.3) is the production-path attestation that Bucket C closes the BCL cascade-blocker pattern. X6 unit tests proved this at helper-isolation; X7 integration test proves it at dispatcher-integration.

This forms the substrate for X8 Option E (AVC migration cycle) to migrate scenarios to dispatcher path; migrated scenarios will exercise X7's integration directly.

---

## 6. Process pattern

Standard cycle:

1. ✅ This SME memo (small scope; scoping memo only).
2. ☐ **Developer ACK + implementation plan** addressing §3.2 registry-key naming, §4.1 async-cascade scope, §4.6 test rubric.
3. ☐ **PO pre-code confirmation.**
4. ☐ Implementation — single commit suggested given small scope; developer may split if test-organization concerns surface.

**Suggested staging (single-commit pattern):**

- New `OWL_DERIVED_HELPER_REGISTRY` constant.
- New `dispatchOwlDerivedNC` async function.
- Refactored OWL-DERIVED case in `evaluateSingleNC`.
- Async cascade through `evaluateNCSatisfaction`, `evaluateSingleNC`, `evaluateOwlDirect`, `evaluateAncestorCategory`.
- Reason text rename.
- ~10-12 new tests + 70 AVC regression.

---

## 7. Open questions for developer ACK

1. **§3.2 registry-key naming** — `'ICNC2'` (NC id, parallels existing CURATED-NC override map) vs `'bfo:ICNC2'` (NC IRI short form, parallels `enumerateRequiredNCs` `shortIRI` synthesis at `nc-dispatcher.js:886`). SME lean: id-keying for parity with override map; both work.
2. **§3.4 async-cascade scope** — confirm only `evaluateNCSatisfaction`, `evaluateSingleNC`, `evaluateOwlDirect`, `evaluateAncestorCategory` need async. Other helpers (`evaluateP2SubClassOf`, etc.) stay sync. Developer reviews actual call graph.
3. **§4.6 test rubric proportions** — 6 per-helper integration + 1 legacy + 1-2 cross-cascade + 2-3 contract violation = ~10-12 new tests. Developer adjusts based on actual coverage gaps surfaced during implementation.
4. **PROCESS_SUBTREE caller-contract documentation** (open per executive summary) — should X7 add validation at dispatcher entry that ancestorChain is transitively closed, or document only at signature? SME lean: document only.

---

## 8. References

- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` §6.2 — L2 prologSession lifecycle lock.
- `specs/d16/x6-bucket-c-implementation-plan.md` §2.2 — caller-owned prologSession concrete shape.
- `src/core/d16/nc-dispatcher.js:246-253` — current OWL-DERIVED scope-out branch (X7 refactor target).
- `src/core/d16/owl-derived-nc-helpers.js` — X6 helper deliverables (X7 invocation targets).
- `src/core/d16/bucket-c-prolog.js` — X6 substrate; async surface.
- `src/core/d16/pipeline-orchestrator.js:397, 407` — TEMPORARY MIGRATION SUPPORT seam + already-async `runEvaluationWithOptionalDispatcher`.
- `tests/unit/d16/nc-dispatcher.test.js` — existing dispatcher test suite; X7 tests extend.
- Feedback memory: `feedback_throw_not_warn_enforcement.md` (DispatcherContractViolationError discipline); `feedback_cycle_inversion_reconciliation_discipline.md` (cycle-standard discipline applied to small scope).
- Project memory: SME-D16-X6 closure entries; `project_d16_phase_d2_consistency_sandbox_async_defect.md` (banked Phase D2 defect; not X7 scope but adjacent surface).

---

## 9. Reserved doors for developer pushback

- §3.2 registry-key naming — id vs IRI; either works.
- §3.4 async cascade scope — developer's call graph trace may surface additional functions needing async.
- §3.5 reason rename — non-substantive cleanup; if developer prefers different wording, fine.
- §4.6 test count — adjust per actual coverage surfacing.
- §7 PROCESS_SUBTREE validation — SME lean is "document only"; developer may propose runtime validation if it adds value without bloat.

---

**Next action:** developer ACK + implementation plan. Standard cycle.
