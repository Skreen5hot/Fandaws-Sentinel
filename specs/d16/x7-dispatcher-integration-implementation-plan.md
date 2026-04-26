# SME-D16-X7 — Dispatcher Integration Developer Implementation Plan (DRAFT)

**Status:** DRAFT v1 2026-04-25. Consumes `sme-d16-x7-dispatcher-integration-memo-v1.md`. Pending PO pre-code confirmation per memo §6 step 3. **No code until confirmation.**
**Author:** Developer (Claude). Addresses memo §7 open questions: §3.2 registry-key naming, §3.4 async-cascade scope, §4.6 test rubric, §7 q4 PROCESS_SUBTREE validation.

---

## 1. ACK summary

ACK on:
- Integration target: `evaluateSingleNC` OWL-DERIVED branch (`nc-dispatcher.js:246-253`) consumes prologSession; routes through registry; falls back to undetermined when absent. Reason text rename to `'OWL-DERIVED-prolog-session-absent'` bundled.
- prologSession threading per L2 lock — explicit per-call from caller through orchestrator → dispatcher → helper.
- Helper output → trichotomy mapping per memo §2.3 (boolean only; non-boolean throws).
- Throw-not-warn at integration boundary: `DispatcherContractViolationError` for registry miss + non-boolean result; `PrologSessionContractViolationError` propagates.
- Single-commit pattern; SME-suggested staging accepted.

---

## 2. §3.2 registry-key naming

**Recommended: id-keying** (e.g., `'ICNC2'`).

Rationale: parity with existing `HELPER_NC_OVERRIDES` at `nc-dispatcher.js:111` which keys on `id` short-form. The dispatch branch already does `nc.id` lookup pattern via `nc.shortIRI.replace(/^bfo:/, '')` for HELPER_NC_OVERRIDES; OWL-DERIVED registry should match. SME lean confirmed.

---

## 3. §3.4 async-cascade scope — call-graph trace

Tracing nc-dispatcher.js current call graph:

```
evaluateNCSatisfaction (entry)
  └─> evaluateSingleNC (per required NC)
      ├─> dispatchToHelper (HELPER_NC_OVERRIDES branch — Wave 0/1/2 sync helpers)
      ├─> evaluateOwlDirect (OWL-DIRECT)
      │   ├─> evaluateP1Ancestor (P1)
      │   │   └─> evaluateAncestorCategory (P1 recursion)
      │   │       └─> evaluateSingleNC (recursive ←)
      │   ├─> evaluateP2SubClassOf (P2)
      │   ├─> evaluateP3PropertyRestrictionPresence (P3)
      │   ├─> evaluateP4ConsistencyOrAbsence (P4)
      │   └─> evaluateP5RootDeclaration (P5)
      ├─> dispatchOwlDerivedNC (NEW — OWL-DERIVED branch; awaits async helper)
      └─> dispatchCuratedNC (CURATED-NC)
          └─> dispatchToHelper (sync)
```

**Functions that need to become async (5, not 4):**

1. `evaluateNCSatisfaction` (entry)
2. `evaluateSingleNC` (awaits OWL-DERIVED branch + evaluateOwlDirect)
3. `evaluateOwlDirect` (awaits evaluateP1Ancestor whose recursion may transit through OWL-DERIVED)
4. **`evaluateP1Ancestor`** — refinement to memo §3.4 list. Calls evaluateAncestorCategory which recurses through evaluateSingleNC; if any ancestor NC is OWL-DERIVED, the recursion awaits a helper. evaluateP1Ancestor must await evaluateAncestorCategory.
5. `evaluateAncestorCategory` (recurses into async evaluateSingleNC)

Memo §3.4 enumerated 4; the 5th (`evaluateP1Ancestor`) sits between evaluateOwlDirect and evaluateAncestorCategory in the call chain. Surfacing as a refinement, not a deviation.

**Functions that stay sync** (no internal async dependency):
- `evaluateP2SubClassOf`, `evaluateP3PropertyRestrictionPresence`, `evaluateP4ConsistencyOrAbsence`, `evaluateP5RootDeclaration` — pure structural matchers; no helper invocation.
- `dispatchToHelper` — Wave 0/1/2 helpers are sync; CURATED-NC override path stays sync.
- `dispatchCuratedNC` — wraps dispatchToHelper; stays sync.
- `dispatchOwlDerivedNC` — async (NEW; awaits helperFn).

**Backwards compat**: any external sync caller of `evaluateNCSatisfaction` would break. Searching the codebase confirms only `pipeline-orchestrator.js:runEvaluationWithOptionalDispatcher` invokes it, which is already async per X6 §2.2 (`await tryDerivationWithFallback` precedent). External-test callers in `tests/unit/d16/nc-dispatcher.test.js` + `evaluateCAU-trichotomy.test.js` + `x4-triage-validation.test.js` need `await` added. Mechanical refactor; no behavior change.

---

## 4. §4.6 test rubric

Estimated ~12 new tests, fitting in existing `nc-dispatcher.test.js`:

| Category | Count | Shape |
|---|---|---|
| Per-helper integration | 6 | One per OWL-DERIVED NC: construct prologSession + minimal CAU signature → assert satisfied/unsatisfied + helperEvidence shape |
| Legacy-path prologSession-absent | 1 | OWL-DERIVED NC without prologSession → undetermined with `'OWL-DERIVED-prolog-session-absent'` reason |
| Cross-cascade integration | 2 | (a) Process target with prologSession → ProcessNC1/2/3/4 + OccurrentNC1/2/3 all determinable; (b) Continuant target with prologSession → ContinuantNC1/2/3 + ICNC2/ICNC3/IENC2 all determinable for IndependentContinuant subtype |
| Contract violation | 3 | (a) Helper-returns-non-boolean → DispatcherContractViolationError; (b) PrologSessionContractViolationError propagates unchanged from substrate; (c) Registry-miss for hypothetical OWL-DERIVED with no helper → DispatcherContractViolationError (synthetic via test-only NC injection) |

**Plus existing test updates** (mechanical async/await additions):
- `nc-dispatcher.test.js` existing tests: add `await` on `evaluateNCSatisfaction` calls.
- `evaluateCAU-trichotomy.test.js`: same.
- `x4-triage-validation.test.js`: same.

Net new tests: ~12. Net existing-test changes: mechanical await additions (~30-50 sites).

---

## 5. §7 q4 PROCESS_SUBTREE caller-contract validation

**Recommended: document-only.** SME lean confirmed.

Rationale:
- L2 explicit-per-call discipline already trusts caller-supplied inputs (per X3 §3.9.1 PO routing precedent, repeated at X6 §6.2 lock). Adding runtime validation at dispatcher entry would bloat the surface for a caller-contract trust violation.
- Per-NC helpers themselves perform the structural checks they need (e.g., ProcessNC3 helper checks for Process subtree directly via `PROCESS_SUBTREE.has(a)`); a non-transitive ancestorChain produces correct under-affirmation rather than incorrect over-affirmation. Honest-degraded behavior, not silently-wrong.
- If a future call site routinely supplies non-transitive chains and surfaces unexpected dispositions, the right fix is at the call site (compute transitive closure once at orchestrator session-init) rather than at dispatcher.

**Documentation update:** add to `evaluateNCSatisfaction` JSDoc: `ancestorChain MUST be transitively closed (specific → general) per L2 caller-contract.` Bundle into the JSDoc cleanup at §5.2 of the SME memo.

---

## 6. Open questions for PO

1. **Async cascade 5-function vs 4-function** (§3 above) — `evaluateP1Ancestor` added to the cascade based on call-graph trace. Confirms or revises memo §3.4 list.
2. **Registry-miss test mechanism** — §4 contract-violation (c) test requires injecting a synthetic OWL-DERIVED NC into the test fixture (not present in `bfo-signatures-v1.0.json`) to exercise the registry-miss throw. Either (a) test-only fixture injection via direct NC record construction, or (b) skip this test and rely on the missing-entry case being structurally impossible (all 6 OWL-DERIVED NCs in the signatures file ARE registered). Developer leans (a) — covers the throw path explicitly per throw-not-warn discipline.
3. **JSDoc updates** — bundle into single commit or split? Suggest: bundle (per memo §5.2 documentation hygiene).

---

## 7. Outstanding queue

- **PO:** review this implementation plan; rule on §6 open questions; pre-code confirmation per memo §6 step 3.
- **SME:** reactive — co-rule on §6 q1 (5-function cascade); accept §6 q2 + q3 if PO routes pragmatically.
- **Developer:** idle pending PO green light for single-commit implementation.

---

## 8. References

- `specs/d16/sme-d16-x7-dispatcher-integration-memo-v1.md` — SME scoping memo with locked decisions + reserved doors.
- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` §6.2 — L2 prologSession lifecycle lock grounding §2 above.
- `src/core/d16/nc-dispatcher.js:97-122` — existing helper-registry patterns paralleled by OWL_DERIVED_HELPER_REGISTRY.
- `src/core/d16/nc-dispatcher.js:246-253` — current OWL-DERIVED branch (refactor target).
- `src/core/d16/owl-derived-nc-helpers.js` — X6 helper invocation surface.
- `feedback_throw_not_warn_enforcement.md` — DispatcherContractViolationError discipline grounding §4 contract-violation tests.
