# SME Authorization — AVC Bundle v6 (X8 SWC Amendment)

**Status:** v1.0 2026-04-25. SME authorization for the `fandaws-sentinel-d16-avc-bundle.json` version bump from v5 to v6. Closes the first SWC-driven amendment cycle across the X4-X8 arc; bundle v6 amendment list landed populated post-X8 Commit 1 per `specs/d16/x4-avc-triage.md` §11.3.
**Owner:** SME (bundle-version bumps require SME authorization per handoff-memo NOT-TO-DO discipline; F4-analogous staging from bundle v5 precedent).
**Consumes:** X8 implementation plan (`specs/d16/x8-avc-migration-implementation-plan.md`); X4 triage §11 SWC classification + amendment-shape proposal (§11.3); reception memo §16; X5/X6/X7 closure context establishing the empty-batch-persistence-as-honest-discipline rationale that validates this amendment as load-bearing rather than ceremonial.
**Consumed by:** developer Commit 2 (bundle v5 → v6 amendment commit per X8 memo §6 staging); future X-N migration cycles citing v6 as the precedent for amendment-on-real-inference-divergence.
**Scope fence:** authorizes v5 → v6 bump for ONE scenario amendment only — `evidence-inconsistent-disjointness-firing`. If the developer surfaces additional amendment-worthy cases during Commit 2 implementation (e.g., scenario assertion shape that depends on the amended scenario), route back to SME for separate authorization or v6 expansion. Keep v6 patch minimal and reviewable.

---

## 1. Problem statement

The X4-X7 arc held bundle v6 amendments empty across four cycles per the proof-discipline rationale: amending speculatively codifies partial-coverage state as permanent. X8 — the AVC migration cycle — exercised real-inference dispatcher against the 6 dispatcher-relevant SYNTHETIC_NC_SATISFACTION scenarios for the first time. Per X4 triage §11, **5 of 6 scenarios produced NAN; 1 produced SWC**.

The SWC entry — `evidence-inconsistent-disjointness-firing` — surfaces the load-bearing architectural finding that validates the empty-batch deferral discipline:

**Real-inference structural P4 logic prevents the synthetic allowlist's premise from being satisfiable.**

- Synthetic allowlist pre-asserted Continuant + Occurrent NCs all fully satisfied → BFO disjointness fires → Inconsistent. The allowlist mechanism didn't verify the satisfiability — it asserted both as Sets without checking that any actual signature could satisfy both.
- Real dispatcher (post-X4-X7 coverage) refuses: ContinuantNC1 (P4 OWL-DIRECT) requires NO `bfo:occupiesTemporalRegion` restriction in signature (the P4 contradicted check); OccurrentNC1 (P3 OWL-DIRECT) requires PRESENT `bfo:occupiesTemporalRegion` restriction. **Structurally incompatible.** No honest signature can satisfy both.
- The dispatcher's actual output: multi-inheritance ancestor chain (Continuant + Occurrent) triggers `disjointness_explicit_violation` on OccurrentNC2 (X6 helper, X5 contradiction-wins precedence) and `occurrent_subtree_ancestor` contradiction on ContinuantNC3 (X5 helper). Partial satisfaction across both targets → **Plausible-with-coverage-gap**.

The scenario's original premise — "CAU satisfies necessary conditions of two disjoint BFO categories simultaneously" — is unreachable under real inference. The amendment redefines the scenario to verify what the real dispatcher actually catches: multi-inheritance modeling-anomaly produces Plausible via contradiction-wins precedence, NOT Inconsistent via disjointness-firing.

This is exactly what `feedback_proof_discipline.md` and `feedback_absence_not_evidence.md` are designed to surface — the synthetic allowlist's premise was a structural over-commitment that real-inference legitimately refuses. Bundle v5's expectation codified the unreachable premise; v6 corrects to the reachable disposition.

---

## 2. Scenario amendment specification

### 2.1 Amendment target

`evidence-inconsistent-disjointness-firing` at `avc/fandaws-sentinel-d16-avc-bundle.json:785-816` (Band 3).

### 2.2 Amendment shape — three facets

**Facet 1: `expect.disposition` change.** `"Inconsistent"` → `"Plausible"`.

**Facet 2: `expect.routedTo` review.** Pre-v6: `"PendingHumanResolution"` (consistent with Inconsistent disposition per D1.6-L11). Post-v6: developer judgment per the actual dispatcher output. Per `feedback_throw_not_warn_enforcement.md` adjacent reasoning + the X4 §6.3 honest-admission rule: surface what real inference produces; do not normalize to a routing decision unless the dispatcher confirms it. **SME guidance:** if real inference produces Plausible without explicit human-resolution routing (most likely; multi-inheritance Plausible is automatic Plausible), remove `routedTo` field or set to a Plausible-appropriate routing target.

**Facet 3: `expect.explanation` shape change.** Pre-v6 expected `disjointnessViolation: "bfo:Continuant owl:disjointWith bfo:Occurrent"` + `resolvedBy: "disjointness-immediate-inconsistent"`. Post-v6 expects evidence annotations citing the multi-inheritance contradiction surfacing path:

- Per-target trichotomy showing partial satisfaction (Continuant: ContinuantNC3 contradicted via `occurrent_subtree_ancestor` reason; Occurrent: OccurrentNC2 contradicted via `disjointness_explicit_violation` reason).
- `evidenceAnnotations.candidateBFOCategories` listing both Continuant and Occurrent.
- Reason enums from helper output (`occurrent_subtree_ancestor`, `disjointness_explicit_violation`) preserved for DP-2 provenance traceability per X6 helper return shape.

The exact JSON shape is developer's call at Commit 2 implementation, per the dispatcher's actual emission. SME will review the amendment commit before bundle v6 lands.

**Facet 4: `verifies` array review.** Pre-v6 cites `D1.6-L11`, `D1.6-L12`, `Rule EV-4`. Post-v6:

- **D1.6-L11** (Inconsistent routes to analyst review) — the scenario no longer demonstrates this. **Remove from verifies.** D1.6-L11 still stands as a spec rule; it's just no longer demonstrated by this scenario.
- **D1.6-L12** (mixed-evidence resolution; disjoint categories = Inconsistent immediately) — the scenario no longer demonstrates this either. **Remove from verifies.** D1.6-L12 still stands as a spec rule; it's just no longer demonstrated here. A separate scenario demonstrating L12 via direct `owl:disjointWith` axiom assertion (not cross-category-NC-fully-satisfied path) may need to land in a future cycle to preserve L12 coverage; flag for v1.1+ scoping.
- **Rule EV-4** — developer reviews if EV-4 still applies.
- **Add references** to multi-inheritance contradiction-wins precedence: SME-D16-X5 OccurrentNC3 §5.4 + SME-D16-X6 ProcessNC3 §3.2 + SME-D16-X7 cross-cascade attestation.

### 2.3 Amendment rationale annotation

The amended scenario gains an `assertion_updated_2026_04_25` annotation field documenting the amendment cause (parallel to the existing `assertion_updated_2026_04_21` field on multiple scenarios from v3 → v4 assertion-tightening). Suggested annotation:

> *"Amended at v6 per X8 SWC. Original v5 expectation (Inconsistent via cross-category disjointness firing on Continuant + Occurrent NCs fully-satisfied) was structurally unreachable under real-inference dispatcher: ContinuantNC1's P4 hasOccupiesTemporalRegion contradiction precludes simultaneous full-satisfaction with OccurrentNC1's required occupiesTemporalRegion. Synthetic allowlist (v3-v5) pre-asserted both fully satisfied without verification; real dispatcher correctly refuses. Amended expectation: Plausible via multi-inheritance contradiction-wins precedence per SME-D16-X5/X6/X7 architectural locks. The amendment validates the empty-batch persistence across X4-X7 — speculative authorization at any prior commit would have either codified the structural error as permanent (Option a: leave Inconsistent expectation) or codified partial-coverage outcome (Option b: amend to Plausible-with-OWL-DERIVED-undetermined when Bucket C wasn't yet landed). Real-inference under full coverage produces the load-bearing rationale."*

The annotation preserves bidirectional traceability: bundle scenario references X8 SWC + X5/X6/X7 architectural locks; the X4-§11 triage references this scenario as the SWC entry; this memo references both directions.

### 2.4 Negative assertions review

Pre-v6 has one negative assertion: *"no evidence-count tiebreaker — disjoint categories with mixed evidence MUST produce Inconsistent, NOT most-evidence-wins."*

Post-v6: this assertion no longer applies (the scenario doesn't surface disjoint-categories-with-mixed-evidence; it surfaces multi-inheritance contradiction). Developer judgment: remove the negative assertion or rewrite to reflect the amended verification surface (e.g., *"no silent acceptance of multi-inheritance modeling anomaly — partial trichotomy surfaces honestly via contradiction reasons, NOT collapsed to satisfied"*).

---

## 3. Bundle-file patch

### 3.1 Field updates

Apply to `avc/fandaws-sentinel-d16-avc-bundle.json`:

| Field | Before | After |
|---|---|---|
| `bundle_version` | `5` | `6` |
| `total_scenarios` | `70` | `70` (unchanged — amendment, not addition) |
| `band_breakdown["Band 3 — Three-State Evidence Transitions"]` | `7` | `7` (unchanged) |

### 3.2 Scenarios array

Modify the `evidence-inconsistent-disjointness-firing` entry in-place per §2.2 facets. Preserve `id`, `band`, `description` updated to reflect amended verification surface.

**Suggested updated `description`:** *"CAU with multi-inheritance ancestor chain (Continuant-subtree AND Occurrent-subtree). Real-inference dispatcher's P4 contradiction logic + helper contradiction-wins precedence produce Plausible (not Inconsistent) — multi-inheritance modeling-anomaly surfaces honestly via partial-trichotomy with contradiction reasons. Amended at v6 per X8 SWC: original v5 expectation was structurally unreachable; this verifies what real inference legitimately catches."*

### 3.3 Revision history

Append v6 entry:

```json
{
  "version": 6,
  "date": "2026-04-25",
  "note": "First SWC-driven amendment across the X4-X8 arc. Single scenario amended: evidence-inconsistent-disjointness-firing — original v5 expectation (Inconsistent via cross-category disjointness firing) was structurally unreachable under real-inference dispatcher per X8 SWC discovery. P4 OWL-DIRECT logic (ContinuantNC1's hasOccupiesTemporalRegion contradiction) prevents simultaneous full-satisfaction of Continuant + Occurrent NCs from any honest signature. Amended to expect Plausible via multi-inheritance contradiction-wins precedence per SME-D16-X5/X6/X7 architectural locks. Total scenarios unchanged (70). Validates the empty-batch persistence across X4-X7 — speculative authorization at any prior commit would have codified either structural error or partial-coverage state as permanent.",
  "sme_authorization": "specs/d16/bundle-v6-authorization-memo.md"
}
```

### 3.4 Patch discipline

This memo authorizes ONLY the fields and scenario amendment enumerated above. If Commit 2 surfaces collateral amendments (e.g., negative-assertion rewrites, related scenarios that depend on the amended one), route to SME for separate authorization or v6 expansion before bundling. Keep the v6 patch minimal and reviewable per F4 / v5 discipline.

---

## 4. Acceptance criteria

This authorization is consumed cleanly if the developer:

1. Applies the §3 patch — amended scenario per §2.2 facets, version bump, revision_history entry, optional description rewrite.
2. Removes the `it.skip` SWC-marker on the scenario at `tests/avc/d16-runner.test.js` (skip-gate landed at X8 Commit 1 pending v6).
3. Re-runs the AVC suite — 76/76 pass (no skips on Band 6 v6 amendments; SYNTHETIC_ITERATION still 0 net change).
4. Re-runs full repo regression — 70/70 D1.6 AVC + supporting unit-test/integration-test suites green.
5. Updates triage `x4-avc-triage.md §11.3` "Bundle v6 amendment list — POPULATED" to "LANDED" with commit reference.
6. Updates reception memo `provo-reception-live-commit4.md §16.5` from "1 entry; SME memo reactive" to "v6 landed".

On acceptance, `x4-avc-triage.md §11.3` and `provo-reception-live-commit4.md §16.5` reach their terminal state for the X8 cycle. SME-D16-X8 arc closes.

---

## 5. Architectural framing — the bundle finally moves

X4-X7 produced four cycles of empty-batch persistence on bundle v6. The honest-discipline rationale held: amending speculatively at any of:

- **X4 (Bucket A landing):** would have codified BCL as permanent — Bucket B/C deferred coverage was the cause; amending would have made partial-coverage permanent.
- **X5 (Bucket B PROV-O subset):** would have codified Bucket-C-deferred OWL-DERIVED ancestor cascade as permanent; amending would have surfaced the residual blocker shift as scenario corruption rather than honest-finding.
- **X6 (Bucket C OWL-DERIVED):** would have codified the partial-migration boundary as permanent; the dispatcher path wasn't yet integrated post-X6 (X7 wired it).
- **X7 (Dispatcher integration):** would have anticipated SWC count without exercising real dispatcher against migrated scenarios; X8 was the cycle that surfaced actual SWC.

X8 — and only X8 — surfaces the load-bearing amendment cause: real-inference dispatcher refuses what the synthetic allowlist asserted, in a way that validates the dispatcher (not corrects it) and amends the synthetic (not the dispatcher). This is the architecturally rare path where the test changes, not the implementation, because the implementation is correct and the test was over-committing.

The single SWC entry is small; the pattern that landed it is large. Banking the framing for future X-N cycles: when an amendment-vs-implementation question surfaces, real-inference's structural commitments are the load-bearing source of truth; synthetic pre-assertions defer to them.

---

## 6. References

- `specs/d16/x4-avc-triage.md` §11.3 — SWC entry source enumeration.
- `specs/d16/sme-d16-x8-avc-migration-memo-v1.md` §3.5 — bundle v6 authorization SME-owned reactive on SWC > 0 (this memo fulfills).
- `specs/d16/bundle-v5-authorization-memo.md` — F4-analogous staging precedent.
- `avc/fandaws-sentinel-d16-avc-bundle.json:785-816` — amendment target.
- `tests/avc/d16-runner.test.js` — Commit 2 unskips the SWC-marker scenario post-amendment.
- `specs/d16/provo-reception-live-commit4.md §16.5` — bundle v6 status target update.
- Architectural locks consumed: SME-D16-X5 OccurrentNC3 §5.4 (multi-inheritance contradiction-wins); SME-D16-X6 ProcessNC3 §3.2 (ZeroDim contradiction precedence); SME-D16-X7 cross-cascade attestation (production-path BCL-cascade-unblock).
- Feedback memory: `feedback_proof_discipline.md` (re-triage-at-landing-not-pre-stage; honest-admission discipline that validates this amendment); `feedback_absence_not_evidence.md` (synthetic over-commitment refuses to materialize under real inference).

---

## 7. Standing posture

**Authorization issued.** Developer Commit 2 (bundle v5 → v6 amendment commit) green-lit per X8 memo §6 staging. SME reviews the amendment commit before bundle v6 lands; PO ACKs the bump.

**Outstanding queue post-this-memo:**
- Developer: Commit 2 — bundle patch + scenario un-skip + triage/reception memo updates.
- SME: review Commit 2 amendment shape against §2.2/§2.3 specifications; reactive on developer surfacing additional v6 expansion scope (none anticipated).
- PO (Aaron): v6 ACK touchpoint at Commit 2 landing — confirm bundle v5 → v6 bump per the §1-§5 framing.
