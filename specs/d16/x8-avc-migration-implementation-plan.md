# SME-D16-X8 — AVC Migration Cycle Developer Implementation Plan (DRAFT)

**Status:** DRAFT v1 2026-04-25. Consumes `sme-d16-x8-avc-migration-memo-v1.md`. Pending PO pre-code confirmation per memo §6 step 3. **No code until confirmation.**
**Author:** Developer (Claude). Addresses memo §3.1 / §3.2 / §4.2 / §5.

---

## 1. ACK summary

ACK on:
- 6 dispatcher-relevant scenarios migrate; SYNTHETIC_ITERATION untouched.
- Per-scenario triage at `x4-avc-triage.md §11` (parallel structure to §9 + §10).
- Bundle v6 authorization SME-owned, reactive on SWC > 0.
- Throw-not-warn discipline for X4.2 Option I (SME lean).
- 70 AVC regression must hold post-migration.
- 2-commit staging accepted (Commit 1: migration + triage + retirement; Commit 2: bundle v6 reactive on SWC, OR seam disposition only if SWC = 0).

Per-scenario migration analysis from memo §2 accepted as predictions; subject to actual dispatcher behavior at landing (per X4/X5/X6 re-triage-at-landing discipline).

---

## 2. §3.1 per-scenario signature construction strategy

Per-scenario signature construction documented inline in test fixtures. Each constructed signature aligns with the scenario's natural-language intent, NOT the synthetic allowlist's pre-asserted output (per memo §3.1 construction discipline). If real OWA-preserving inference produces dispositions that diverge from the synthetic, that's SWC — surface at landing.

### 2.1 `evidence-entailed-via-ncs` (Process target)

```js
signature: {
  // ProcessNC2 (P3 OWL-DIRECT): hasParticipant some Continuant
  existentialRestrictions: [
    { onProperty: 'bfo:hasParticipant', someValuesFrom: 'bfo:Continuant' },
    // OccurrentNC1 (P3 OWL-DIRECT): occupiesTemporalRegion
    { onProperty: 'bfo:occupiesTemporalRegion', someValuesFrom: 'bfo:OneDimensionalTemporalRegion' },
    // ProcessNC4 (X5 helper): hasFirstInstant restriction
    { onProperty: 'bfo:hasFirstInstant', someValuesFrom: 'bfo:ZeroDimensionalTemporalRegion' },
  ],
  // ... other arrays empty
},
ancestorChain: ['bfo:Process', 'bfo:Occurrent', 'bfo:Entity'],
```
Expected: full 7 required NCs determinable; ProcessNC1 P1 cascade through Occurrent satisfies; ProcessNC3 OWL-DERIVED affirms via Process ancestor (path-3); Entailed.

### 2.2 `evidence-plausible-structured-annotations` (Process + Occurrent)

Construct signature satisfying ProcessNC2 (hasParticipant) + OccurrentNC1 (occupiesTemporalRegion) but NOT ProcessNC4 (no hasFirstInstant) and NOT OccurrentNC3 unfolding (no temporal-extension). Result: partial satisfaction → Plausible with structured annotations.

### 2.3 `evidence-inconsistent-disjointness-firing`

Construct signature whose `disjointnessAssertions` directly carries `bfo:Continuant`/`bfo:Occurrent` pair — surfaces Inconsistent via direct-disjointness path (cleared at X5 per triage §9.1). Cross-category-NC-fully-satisfied path now also reachable post-X7 (per triage §10.1). Either path triggers; expected NAN.

### 2.4 `evidence-subsumption-wins` (Process most-specific over Occurrent)

Same shape as §2.1 (Process Entailed); subsumption-resolution downstream of Entailment. Expected NAN.

### 2.5 `evidence-ncs-from-curated-only` (HypotheticalPricingRole)

Trivial: empty signature + targetCategory = `'bfo:RoleSubtype_HypotheticalPricingRole'`. `requiredNCsForTarget.length === 0` path fires → Plausible with `CuratedReferenceIncomplete`. Already matches synthetic. Expected NAN.

### 2.6 `evidence-sibling-ambiguity-plausible` (Role + Disposition candidates)

Construct signature satisfying SDC + Role + Disposition NC commitments EXCEPT RoleNC5 (v1.1+ deferred, no helper). Dispatcher routes RoleNC5 undetermined → Role candidate trichotomy carries undetermined → Plausible at the candidate level with annotations.

Expected: BCL (Role-residual on RoleNC5 v1.1+) at minimum; possibly SA if annotation structure differs in scenario-semantic ways.

### 2.7 Construction discipline summary

- Signature construction is the **load-bearing developer work**; SME reviews at implementation-plan landing.
- Each scenario's signature includes a brief inline comment citing the dispatcher path it exercises.
- Tests assert on the `evaluateCAU` output disposition; intermediate trichotomy dispositions logged for debugging but not asserted (avoids over-coupling to dispatcher internals).

---

## 3. §3.2 prologSession lifecycle

**Recommended: Option B (per-suite shared session).** SME lean confirmed.

Reasoning:
- X6 substrate's assertion-isolation discipline is well-tested (`tests/unit/d16/bucket-c-prolog-session.test.js` cross-CAU-no-leakage suite). The substrate guarantees `withCAUAssertions` retracts per-CAU facts before next CAU evaluates.
- Setup cost amortizes: BFO axiom load happens once per suite (~50ms in tests); per-scenario init would add ~50ms × 6 = 300ms suite overhead.
- `tests/avc/d16-runner.test.js` already runs all SYNTHETIC_NC_SATISFACTION scenarios in a single suite block; per-suite shared session fits cleanly.

Concrete shape:
```js
let prologSession;
beforeAll(async () => { prologSession = await initBucketCPrologSession(); });
afterAll(() => teardownPrologSession(prologSession));
```

Each migrated scenario invokes the dispatcher with the shared `prologSession`. Assertion isolation enforced by the substrate.

Fall-back to Option A only if per-scenario assertion-state interference surfaces during implementation (treated as a substrate defect, not a test-isolation concern).

---

## 4. §4.2 seam disposition

**Recommended: Option I (collapse to required-prologSession contract).** SME lean confirmed.

Reasoning:
- Post-X8, all in-tree callers supply prologSession (legacy SYNTHETIC_NC_SATISFACTION path retires). The seam's prologSession-absent path is unused in production.
- Retaining Option II (defensive scaffolding for hypothetical external callers) violates CLAUDE.md's "Don't design for hypothetical future requirements" discipline. If a future external caller emerges that genuinely cannot supply prologSession, a clear contract-violation throw points them to the right pattern; better than silent graceful-degradation that masks misuse.
- Throw-not-warn discipline at the seam matches the discipline applied at the OWL-DERIVED branch (X7).

**Concrete shape:**

`pipeline-orchestrator.js:runEvaluationWithOptionalDispatcher` post-X8:
- Caller-supplies-cauSignature+bfoSignatureReference still triggers dispatcher path (preserved per X3).
- Caller MUST also supply `prologSession`. Absence becomes contract violation: throws TypeError.
- Legacy-path-no-cauSignature-no-bfoSignatureReference fallback to `evaluateCAU(input)` direct call REMAINS — that's the SYNTHETIC_ITERATION path which is out of X8 scope.

Documentation:
- Seam comment updated: "TEMPORARY MIGRATION SUPPORT" marker retired; replaced with "DUAL-MODE: dispatcher path requires prologSession; legacy iteration-mechanics path stays per X4 §2.7."
- `pipeline-orchestrator.js:397` comment block rewritten.

If at implementation time external-caller compat surfaces specific concern (e.g., a downstream Workbench v0.2 design constraint), fall back to Option II.

---

## 5. §5 Band 9 candidates

Two candidates worth flagging during implementation:

1. **X7 cross-cascade Process test** — generalized to bundle-scenario form. Currently at `tests/unit/d16/nc-dispatcher.test.js` cross-cascade suite; promoted to AVC band would expose BCL-cascade-unblock behavior in the production AVC catalog.

2. **X6 OWA-preservation discriminating fixture** (Role descendant → ICNC2 unsatisfied via SDC inheritance) — the architectural-payload citation. Currently at `tests/unit/d16/owl-derived-nc-helpers.test.js:80-95`; promoted to AVC would expose Option C OWA preservation in the AVC catalog (vs Option B regression risk).

Both are unit-test isolated. Elevation = separate cycle from X8 per memo §5; flagged at landing for SME judgment.

**Not flagged:** I won't manufacture additional candidates beyond these two known fixtures; the bar is "AVC-band-eligible scenarios surfaced organically during X8 implementation," not "speculative authoring."

---

## 6. Suggested staging — single commit unless SWC > 0

Following SME §6 staging:

**Commit 1 (X8 main):**
- Migrate 6 scenarios to dispatcher-path inputs per §2 above.
- Per-suite shared prologSession lifecycle per §3.
- Triage artifact `x4-avc-triage.md §11` extension (post-X8 migration triage; per-scenario classification; summary delta; bundle v6 amendment list).
- SYNTHETIC_NC_SATISFACTION allowlist deleted from `tests/avc/d16-runner.test.js:1624-1715`; `:184` synthetic-lookup collapses to dispatcher invocation.
- Seam disposition Option I collapse per §4 — `pipeline-orchestrator.js:397` comment + contract update.
- Reception memo `provo-reception-live-commit4.md §16` extension.
- Mechanical async/await additions in any newly-async test paths.
- 70 AVC regression confirmed.

**Commit 2 (reactive on SWC > 0):**
- SME drafts bundle v6 authorization memo (separate artifact).
- PO ACKs.
- Bundle v5 → v6 amendment commit lands (developer-authored from SME memo).

**Single-commit fallback** if SWC = 0: Commit 1 only; bundle v6 authorization remains undrafted (consistent with X4-X7 empty-batch persistence). Reception memo §16 documents the deferral.

Estimated runway ~1 week per memo §6.

---

## 7. Open questions for PO

1. **Seam disposition Option I confirmed?** — collapse to required-prologSession contract for in-tree callers; SYNTHETIC_ITERATION path (out of dispatcher scope per X4 §2.7) preserved as legacy. Developer leans Option I per §4 above.
2. **Per-scenario signature shape sketches** in §2 — confirm SME-acceptable as starting point; refinements during implementation surface at SME implementation review.
3. **Band 9 elevation** of the 2 candidates flagged in §5 — confirm flagged-only-not-elevated at X8 scope; separate cycle if SME judges warranted.
4. **`evidence-sibling-ambiguity-plausible` BCL vs SA classification** — judgment call at landing. Developer's signature construction may surface annotation differences that tilt classification one way; SME adjudicates per §3.3 BCL/SA distinction.

---

## 8. Outstanding queue

- **PO:** review plan; rule on §7 open questions; pre-code confirmation per memo §6 step 3.
- **SME:** reactive — co-rule on §7; bundle v6 authorization memo drafted reactive on Commit 1 SWC count.
- **Developer:** idle pending PO green light for Commit 1 (single-commit pattern unless SWC > 0 surfaces at landing).

---

## 9. References

- `specs/d16/sme-d16-x8-avc-migration-memo-v1.md` — SME scoping memo with locked decisions + reserved doors.
- `specs/d16/sme-d16-x7-dispatcher-integration-memo-v1.md` — X7 dispatcher integration grounding §3 above.
- `specs/d16/sme-d16-x6-bucket-c-memo-v1.md` §6.2 — L2 prologSession lifecycle.
- `tests/avc/d16-runner.test.js:1624-1715` — SYNTHETIC_NC_SATISFACTION allowlist (X8 migration target).
- `tests/avc/d16-runner.test.js:184` — synthetic-lookup at handler entry (collapses post-migration).
- `src/core/d16/pipeline-orchestrator.js:397` — TEMPORARY MIGRATION SUPPORT seam (§4 disposition target).
- `tests/unit/d16/bucket-c-prolog-session.test.js` — assertion-isolation discipline supporting §3 per-suite shared prologSession.
- `feedback_throw_not_warn_enforcement.md` — discipline grounding §4 Option I.
- `feedback_proof_discipline.md` — re-triage-at-landing-not-pre-stage grounding §2.7 + §6 SWC reactivity.
- CLAUDE.md "Don't design for hypothetical future requirements" — grounding §4 Option I rejection of defensive scaffolding.
