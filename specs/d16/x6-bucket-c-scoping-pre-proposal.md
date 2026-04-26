# SME-D16-X6 — Bucket C Scoping Pre-Proposal (DRAFT)

**Status:** DRAFT v1 2026-04-25. Pending PO + SME deliberation per Option 2 routing.
**Scope:** OWL-DERIVED NC inference — 6 NCs reclassified or originally tagged OWL-DERIVED. Closes 2 of 3 remaining BCL scenarios per X5 re-triage §9.
**Coupling:** Tightly coupled to PO Tau Prolog deliberation cycle queued since X4 memo §5.2. Pre-proposal scope is to enumerate options against concrete NC bodies; mechanism choice is PO + SME's call.

**Lean-suppression notice (load-bearing):** This document deliberately does NOT rank options. The X4-era memo §5 framing was abstract; grounding in the 6 OWL-DERIVED NCs that actually need closure surfaces structural facts (e.g., 4 of 6 already have `owa_helper_contract` fields drafted as hybrid). Those facts are not developer preferences — they're load-bearing scope inputs. PO + SME deliberation should weigh those facts; developer pre-proposal stops at enumeration.

---

## 1. Pre-proposal scope

Bucket C closes the OWL-DERIVED ancestor-cascade gap surfaced in X5 re-triage §9.4: P1-cascade NCs (e.g., ProcessNC1) recurse through ancestor categories whose required-set contains OWL-DERIVED NCs that route undetermined regardless of CURATED-NC helper coverage. Closing this gap unblocks the 2 of 3 remaining BCL scenarios that route to NAN/Entailed once OWL-DERIVED NCs resolve.

Out-of-scope for this pre-proposal:
- v1.1+ RoleNC5 (the 3rd remaining BCL scenario; orthogonal to OWL-DERIVED)
- Real `.owl` parser harness (downstream of any Bucket C mechanism choice)
- Workbench v0.2 Ingest Mode UI

---

## 2. Six OWL-DERIVED NCs in Bucket C — per-NC inventory

Enumerated from `specs/d16/bfo-signatures-v1.0.json` (filter `tag === 'OWL-DERIVED'`).

| # | NC | Category | body_draft | helper_contract drafted? | Structural-correspondence inputs |
|---|---|---|---|---|---|
| 1 | ICNC2 | bfo:IndependentContinuant | `owa_absence_check(CAU, 'bfo:inheresIn', _)` | YES — full hybrid contract | inheresIn restriction absence in propertyRestrictionsAsDomain + existentialRestrictions |
| 2 | ICNC3 | bfo:IndependentContinuant | `owa_absence_check(CAU, 'bfo:concretizes', _)` | YES — references ICNC2 contract | concretizes restriction absence (same arrays) |
| 3 | MENC2 | bfo:MaterialEntity | `cau_consistent_with(CAU, 'bfo:occupiesSpatialRegion', _), cau_has_matter_constitution_compat(CAU)` | NO | occupiesSpatialRegion presence-or-derivability + matter-constitution compat (predicate not yet defined) |
| 4 | IENC2 | bfo:ImmaterialEntity | `owa_absence_check_property(CAU, matter_as_part)` | YES — full hybrid contract incl. structural-correspondence rule | hasContinuantPart restrictions targeting MaterialEntity-subtree (transitive) |
| 5 | OccurrentNC2 | bfo:Occurrent | `owa_disjointness_check(CAU, 'bfo:Continuant')` | YES — full hybrid contract | absence of Continuant NC satisfaction at Signature level |
| 6 | ProcessNC3 | bfo:Process | `cau_consistent_with(CAU, 'bfo:occupiesTemporalRegion', 'bfo:OneDimensionalTemporalRegion')` | NO | occupiesTemporalRegion presence + filler dimensionality compatibility |

**Structural facts:**
- 4 of 6 NCs (ICNC2, ICNC3, IENC2, OccurrentNC2) have `owa_helper_contract` fields explicitly drafted as **hybrid** (Tau Prolog primary, structural-correspondence fallback on step-cap exhaustion). This is not a developer-introduced lean — it is the curated state of the signatures file as of SME async decision 2.1 (2026-04-21).
- 2 of 6 NCs (MENC2, ProcessNC3) use `cau_consistent_with` predicate without an explicit contract. These are positive consistency checks, not absence-based; they have a different mechanism profile from the 4 absence-based NCs.
- Of the 4 hybrid-drafted contracts, IENC2's contract includes a fully-specified structural-correspondence fallback rule (scans existentialRestrictions + universalRestrictions + propertyRestrictionsAsDomain for hasContinuantPart targets in MaterialEntity-subtree). This is implementable today against the existing Signature extractor without schema extension.
- `tau-prolog` is already a project dependency (added at Phase D2). No new runtime dep needed for any option below.

---

## 3. Three mechanism options — concrete impact per NC

Options enumerated WITHOUT ranking. Each option's row describes how that mechanism would resolve each NC.

### Option A — Tau Prolog primary (no structural fallback)

| NC | Behavior under Option A |
|---|---|
| ICNC2 | Load CAU + ancestors + BFO axioms into Tau Prolog session; query `derivable(cau_has_property_restriction(CAU, 'bfo:inheresIn', _))`; satisfied iff query fails (absence derived). Step cap → undetermined (no fallback). |
| ICNC3 | Same shape as ICNC2 over `bfo:concretizes`. |
| MENC2 | Drafts `cau_consistent_with` + `cau_has_matter_constitution_compat` as Prolog rules; query for satisfiability. Requires defining `cau_has_matter_constitution_compat` predicate in Bucket C scope. |
| IENC2 | Query `derivable(cau_has_material_continuant_part(CAU))`; satisfied iff fails. Step cap → undetermined. |
| OccurrentNC2 | Query `disjoint(CAU, 'bfo:Continuant')` against BFO disjointness axioms. Step cap → undetermined. |
| ProcessNC3 | Query consistency of `occupiesTemporalRegion(CAU, 'bfo:OneDimensionalTemporalRegion')`; satisfied iff consistent. |

**Impact:** Real OWA-preserving derivation across all 6 NCs. Step-cap exhaustion routes undetermined (preserves absence-not-evidence). Initialization cost: BFO axioms loaded once per session; per-CAU Prolog assertions added incrementally. Edge-canonical: ✓ (Tau Prolog runs in browser + Node).

### Option B — Structural-correspondence primary (no Tau Prolog)

| NC | Behavior under Option B |
|---|---|
| ICNC2 | Scan signature.propertyRestrictionsAsDomain + existentialRestrictions for `bfo:inheresIn`; satisfied iff absent. Pure structural check. |
| ICNC3 | Same shape over `bfo:concretizes`. |
| MENC2 | Scan for `bfo:occupiesSpatialRegion` presence + matter-constitution-compat structural marker (definition required). Heuristic-flavored without derivation. |
| IENC2 | Apply IENC2's drafted structural-correspondence rule directly (no Tau Prolog gate). Edge-canonical: ✓. |
| OccurrentNC2 | Check absence of Continuant NC satisfaction at the dispatcher's already-computed Continuant-target sub-trichotomy. Reuses existing dispatcher infrastructure. |
| ProcessNC3 | Scan for `bfo:occupiesTemporalRegion` with filler in `bfo:OneDimensionalTemporalRegion`-subtree (or unspecified-but-extension-capable). |

**Impact:** No Tau Prolog runtime cost; all checks resolvable from Signature + ancestor chain + dispatcher state. Risk: pure structural-correspondence is CWA-flavored on the absence-based NCs (ICNC2, ICNC3, IENC2, OccurrentNC2) — a CAU might have `bfo:inheresIn` derivable from its ancestor's axioms but not literally declared on the CAU itself. This is exactly the case SME async decision 2.1 reclassified ICNC2/ICNC3/IENC2/OccurrentNC2 OWL-DERIVED to AVOID. Adopting Option B for these 4 NCs would re-introduce the CWA over-commitment SME flagged.

### Option C — Hybrid (Tau Prolog primary + structural-correspondence fallback on step-cap exhaustion)

| NC | Behavior under Option C |
|---|---|
| ICNC2 | Tau Prolog query first; on step-cap exhaustion, fall back to structural-correspondence absence check. Satisfied if either layer confirms absence. Per drafted `owa_helper_contract`. |
| ICNC3 | Same shape as ICNC2. |
| MENC2 | Tau Prolog query for consistency; structural-correspondence fallback for occupiesSpatialRegion presence + matter-constitution-compat marker. Contract not yet drafted; would require SME drafting in this cycle. |
| IENC2 | Tau Prolog query for matter-as-part derivability; structural-correspondence fallback per drafted IENC2 rule. Per drafted `owa_helper_contract`. |
| OccurrentNC2 | Tau Prolog query for derivable disjointness; structural-correspondence fallback to absence-of-Continuant-NC-satisfaction. Per drafted `owa_helper_contract`. |
| ProcessNC3 | Tau Prolog query for OneDim consistency; structural-correspondence fallback to filler-dimensionality scan. Contract not yet drafted. |

**Impact:** Matches the curated state of 4 of 6 NCs' `owa_helper_contract` fields directly. 2 of 6 NCs (MENC2, ProcessNC3) require contract drafting in this cycle. OWA-preserving on the absence-based NCs; structural-correspondence layer provides edge-canonical guarantee when Tau Prolog session times out. Initialization cost: same as Option A.

---

## 4. Cross-cutting considerations

These apply across all options and should inform PO + SME deliberation:

- **Tau Prolog initialization cost.** Loading BFO axioms + CAU assertions has a per-session cost. For Workbench v0.2 ingest mode (interactive), this is a one-time per-session cost. For batch / programmatic use, the cost amortizes across CAUs in a session. Edge-canonical posture preserved (Tau Prolog runs in browser).
- **Step cap configuration.** Tau Prolog requires a step cap to bound query time. The drafted contracts cite step-cap-exhaustion as the trigger for structural fallback (Options A and C). Cap value is a deliberation input — too low and structural fallback fires constantly (defeats Option A); too high and the dispatcher blocks on long queries.
- **Edge-canonical preservation.** All three options are edge-canonical. Option B is the only one that doesn't load a Prolog session.
- **OWA preservation discipline.** SME async decision 2.1 was specifically about preserving OWA on the absence-based NCs (ICNC2, ICNC3, IENC2, OccurrentNC2). Options A and C preserve OWA via derivation-then-fallback. Option B re-introduces the CWA over-commitment for these 4 NCs.
- **Helper contract drafting workload.** Option A: no contract drafting needed (Prolog rules ARE the contract). Option B: 4 NCs need fresh CWA-flavored structural rules (the 4 absence-based ones); this is contract drafting that SME explicitly avoided in async decision 2.1. Option C: 2 NCs (MENC2, ProcessNC3) need fresh hybrid contracts; the other 4 reuse drafted contracts.
- **Synergy with future cycles.** Real `.owl` parsing (downstream Phase 1 closeout obligation) will produce richer Signatures that may benefit from Tau Prolog's derivation capability. Workbench v0.2 Ingest Mode (also downstream) will surface user-pasted ontology fragments where Tau Prolog's OWA semantics matter most.
- **Failure mode visibility.** Tau Prolog cycle / unification errors must be caught and routed to undetermined per existing dispatcher discipline (DispatcherContractViolationError pattern). Hybrid layer adds a second possible failure mode: structural-correspondence rule defects.

---

## 5. Open questions for PO + SME deliberation

Surfaced for the deliberation; not pre-answered:

1. **Mechanism selection.** Option A / Option B / Option C / a different shape PO + SME surface (e.g., Option C-with-Option-B-as-degraded-fallback, where Tau Prolog is feature-flagged off entirely on cold-start environments).
2. **Step cap value.** If Option A or C, what cap? (Existing project precedent: Phase D2 introduced tau-prolog without a documented cap; Bucket C is the right place to lock one.)
3. **MENC2 + ProcessNC3 contract drafting.** Required for Options A and C. Question: SME drafts in this cycle, or scope-reduce Bucket C to the 4 NCs with drafted contracts and defer MENC2 + ProcessNC3 to a follow-up?
4. **AVC scenarios.** Which BCL scenarios from x4-avc-triage.md §9 transition to NAN once Bucket C lands? Re-triage at landing (consistent with X4/X5 discipline) or pre-stage in this scoping cycle?
5. **Bundle v6 amendment trajectory.** Bucket C may surface SWC classifications (synthetic-wrong-corrected) for the first time across the X4–X6 arc, depending on whether OWL-DERIVED resolution differs from prior synthetic allowlists. SME bundle v6 authorization deliberation may finally have amendment-worthy cases.
6. **Tau Prolog initialization integration point.** If Options A or C: does the Tau Prolog session live at the dispatcher level (per-call), at the orchestrator level (per-session), or at a higher level (per-Workbench-tab)? Lifecycle implications for memoization + caching.

---

## 6. Outstanding queue

- **PO:** review pre-proposal; deliberate mechanism choice with SME against §3 + §4 + §5
- **SME:** reactive — co-deliberate with PO; rule on contract-drafting scope (§5 q3); rule on step-cap value (§5 q2); rule on Bundle v6 trajectory (§5 q5)
- **Developer:** idle pending PO + SME deliberation outcome; ready to author Bucket C implementation cycle once mechanism is locked

---

## 7. References

- `specs/d16/bfo-signatures-v1.0.json` — OWL-DERIVED NC records + drafted `owa_helper_contract` fields
- `specs/d16/sme-d16-x4-nc-inference-integration-memo-v1.md` §5.2 — Tau Prolog deliberation cycle queue
- `specs/d16/x4-avc-triage.md` §9 — post-X5 re-triage; Bucket C unblocking surface
- `specs/d16/provo-reception-live-commit4.md` §14 — X5 reception memo addendum; Bucket C as next architecturally-adjacent cycle
- `feedback_cycle_inversion_reconciliation_discipline.md` — lean-suppression discipline grounding §1's framing
- `project_d16_x5_bucket_b_closeout.md` — Bucket B → Bucket C residual blocker shift, banked 2026-04-25
