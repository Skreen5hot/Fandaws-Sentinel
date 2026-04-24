# Handoff Memo — Wave 2 Closed, DP-2 Kickoff Pending

**For:** new Claude session starting on D1.6 Band 6 DP-2 infrastructure work
**Secondary audience:** Aaron (verify framing accuracy before handoff)
**Written:** 2026-04-23, end of session that closed Wave 2
**Reading order:** this memo first, then MEMORY.md (auto-loaded), then the linked artifacts in the order specified below.

---

## Where You Are

D1.6 Phase 1 architecture work is 81% complete by AVC scenario count (**56 of 69 scenarios passing**, zero regressions across 107 test suites / 2,314 passing / 24 skipped). All 6 SME-LOCKED CRITICAL items validated. Wave 2 closed yesterday with all three axiom-pattern helpers (SDCNC3, GDCNC3, QualityNC3) SME-approved.

**10 of 11 SME-LOCKED items integration-path-complete.** Only RoleNC5 remains, deferred to v1.1+ by design (Wave 3 disposition per scoping memo).

**The 13 remaining D1.6 AVC scenarios all cluster at DP-2 infrastructure** — the Band 6 invariant work scoped for Weeks 9-11. DP-2 infrastructure does not exist yet; building it is the next substantive phase.

---

## Critical Context You Need Before Coding Anything

### 1. The three-role review loop

This project has a consistent review cadence:

- **Aaron** (project architect) — directs priorities, scope, and session rhythm. Approves architectural decisions; does not validate Prolog/NC semantics directly.
- **SME** (BFO ontology + formal-verification reviewer) — validates helper implementations against Prolog rule bodies and BFO Signature Reference. 15-20 min review windows per artifact. Review cycles have been the primary signoff mechanism for all 10 validated SME-LOCKED items.
- **Secondary BFO SME** (occasional) — participated in §4.5 convergence argument review. Persistent-vs-occasional engagement is Aaron's call; see `project_d16_bfo_sme_review_patterns` for the mechanism-misread to re-clarify if they return.

Aaron and SME communicate via email-style subject-lined messages. You may see "[SME]" or "[Architect]" signatures in the transcript. Both get cc'd on each other's messages. Your responses go to both implicitly.

**The working pattern:** developer ships → developer produces validation artifact → SME reviews (15-20 min) → decisions apply → next cycle. Aaron intervenes on scope or priority questions; SME on semantic correctness.

### 2. The scaffold/production split discipline

Every band of D1.6 work has followed the same pattern, and SME has explicitly endorsed it for DP-2:

1. **Scaffold layer** — per-scenario synthetic inputs encoded in the AVC bundle. Handler routes on synthetic data without needing upstream infrastructure. AVC scenarios go green on contract shape first.
2. **Production layer** — real implementation against actual data. Consumes the same contract the scaffold satisfied. Drop-in replacement. Validated via SME Prolog-rule review.
3. **Split discipline** — both layers persist; scaffold handlers remain as fallback for regression.

**Anti-pattern:** writing production layer first. Causes late regression detection and architectural mistakes surface during production implementation.

Full discipline: `feedback_scaffold_production_split.md`.

### 3. Seven feedback-pattern memories encode review-derived constraints

Read these before making any architectural proposal; they encode non-obvious constraints SME has articulated across the 8 review cycles:

| Memory | One-line rule |
|---|---|
| `feedback_proof_discipline.md` | Honest demotion to heuristic over unproven "may/might" proof |
| `feedback_named_invariants.md` | Load-bearing commitments get formal names, not prose |
| `feedback_rationale_precision.md` | Flag spec-touch implications per option; don't overstate mitigation coverage |
| `feedback_scaffold_production_split.md` | Scaffold + production coexist; scaffold persists as fallback |
| `feedback_absence_not_evidence.md` | Absence of axiomatic evidence for one category is NOT positive evidence for another |
| `feedback_structured_failure_reasons.md` | Helpers return `reason` enum alongside `result: false`; DP-2 consumes these |
| `feedback_transparent_callback_forwarding.md` | Composing helpers forward caller's callbacks unchanged |

The last two are especially relevant for DP-2 scaffolding: DP-2 provenance records will consume the helper `reason` enums directly (structured-failure-reasons pattern was adopted early specifically to avoid retrofit when Band 6 lands).

### 4. The curated list + OWA/CWA boundary

Wave 0/1 helpers operate closed-world over complete curated lists (`specs/d16/curated-process-categories-v1.0.json`, 34 entries). Wave 2 helpers operate on CAU Signatures which may be partial, so OWA treatment applies where absence-based reasoning would over-commit.

Full posture per-helper in `project_d16_owa_cwa_boundary_wave2.md`. DP-2 work will reason over canonical records, which are complete by construction (every record has `{explanation, provenance, reproducibilityHash}`); CWA is likely appropriate for most DP-2 logic. Flag to SME if the OWA/CWA question resurfaces during Band 6 scaffolding.

---

## What The Next Substantive Work Is

**Band 6 — DP-2 Invariant Enforcement — 10 scenarios.**

Per D1.6 spec §5-6 and Rules DP-2-R1 through DP-2-R5: every canonical record produced by D1.6 must carry three mandatory fields:
- `explanation` — structured reasoning for why the record exists (DP-2-R1)
- `provenance` — session + iteration history + axiom sources (DP-2-R2)
- `reproducibilityHash` — SHA-256 per-round + authoritative Final Hash (DP-2-R3)

Records missing any field are non-conformant and fail AVC verification. The 10 Band 6 scenarios exercise these invariants:

| Scenario | Trigger | Verifies |
|---|---|---|
| `dp2-explanation-mandatory-entailed` | `verifyDP2Conformance` | DP-2, DP-2-R1 |
| `dp2-explanation-mandatory-plausible` | `verifyDP2Conformance` | DP-2, DP-2-R1 |
| `dp2-explanation-mandatory-inconsistent` | `verifyDP2Conformance` | DP-2, DP-2-R1 |
| `dp2-explanation-mandatory-notapplicable` | `verifyDP2Conformance` | DP-2, DP-2-R1 |
| `dp2-provenance-iteration-history` | `verifyIterationHistory` | DP-2, DP-2-R2 |
| `dp2-reproducibility-hash-per-round-and-final` | `retrieveReproducibilityHash` | DP-2, DP-2-R3, Q-V1.0-1 |
| `dp2-reproducibility-cross-session` | `compareFinalHashes` | DP-2-R3, Q-V1.0-1 |
| `dp2-schema-validation-rejects-missing-explanation` | `attemptCanonicalWrite` | DP-2, Rule DP-2-R4 |
| `dp2-schema-validation-rejects-empty-axiom-evidence` | `attemptCanonicalWrites` | DP-2-R1, §7.5 Content Validation |
| `dp2-axiom-dictionary-deduplication` | `inspectProvenanceStorage` | DP-2-R5, Q-V1.0-4 |

**Plus 3 DP-2-dependent scenarios from other bands:**
- `evidence-inconsistent-override-path` (Band 3) — `analystOverrideCAU` trigger
- `notapplicable-provenance-fields` (Band 5) — `retrieveCanonicalRecord` trigger
- `provo-end-to-end-acceptance` (Band 8) — `runFullPhase1Through3` trigger — **the terminal acceptance gate**

13 total. All blocked until DP-2 infrastructure exists.

---

## Recommended First Actions For The New Session

1. **Confirm memory loaded.** MEMORY.md should surface the project-memory index automatically. Spot-check by naming two feedback patterns and one project memory — if the session can recite them, memory is loaded.

2. **Read `project_d16_wave2_closeout.md`** in full. That's the phase-state-immediately-before-you anchor.

3. **Read `project_d16_week9_11_backlog.md` + `docs/architecture/week9-11-forward-flags.md`** (6 open forward-flags). Several directly affect DP-2 work:
   - Item 2: bfo-signature-cache hardening (session-hash registry is needed by Week 6 reactive engine — you'll inherit the unfulfilled requirement; scope decision needed)
   - Item 3: must-compute fields in `applyMutationSequence` — the canned `true` values get real implementations during DP-2 hardening
   - Item 4: §4.5 convergence argument companion (already merged; listed for tracking completeness)
   - Item 5: class-subsumption infrastructure for curated list `include_subclasses: true` entries
   - Item 6: CCO Quality exemplar fixture expansion (optional, low-pri)

4. **Read D1.6 spec §5 (DP-2 Invariant Enforcement) and §7.5 (Content Validation).** These are the authoritative DP-2 contracts. `specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md`.

5. **Inspect the 10 Band 6 scenarios** via `avc/fandaws-sentinel-d16-avc-bundle.json` (use the per-band query from this memo as a starting filter). Each scenario has a concrete expected shape; Band 6 is amenable to scaffold scaffolding per the usual pattern.

6. **Produce a DP-2 scaffolding design sketch** analogous to the Wave 2 design sketch (`specs/d16/wave2-helpers-design-sketch.md`). SME has explicitly invited pre-implementation design-sketch reviews for architecturally-novel cycles; Band 6 DP-2 qualifies. 24-hour async review from SME offered.

**Do not code DP-2 scaffolding before producing the design sketch.** The Wave 2 cycle proved the design-sketch-first approach produces cleaner validation outcomes. Writing DP-2 scaffolding directly would skip the architectural-decision-surface step that SME review relies on.

---

## What's In Place For You To Build On

### Source modules (all in `src/core/d16/`)

- **cau-signature.js** — Band 1 extractor; emits 12 axiom-kind fields + reproducibility hash
- **turtle-to-triples.js** — n3.js wrapper with prefix compaction helpers
- **bfo-signature-cache.js** — scaffold in-memory cache + VD-6 version-bump emitter; hardening flagged for Weeks 9-11
- **three-state-evaluator.js** — Entailed/Plausible/Inconsistent/NotApplicable routing with D1.6-L12 subsumption-vs-disjointness resolution
- **iteration-mechanics.js** — Phase 1 single-pass + bounded-fallback iteration per §3 of spec and §2 of convergence argument
- **inheritance-cascade.js** — NA-1.1 provisional inheritance + NA-1.2 signal discipline + NA-1.3 reconciliation cascade
- **reactive-engine.js** — NA-1.4 mutation event handler + sequence termination; `applyMutationSequence` has MUST-COMPUTE fields flagged for Week 6-8 hardening (still pending)
- **dp1-diagnostic.js** — Band 7 session-level soft-gate diagnostic (complete)
- **critical-nc-helpers.js** — Wave 0 + Wave 1 + Wave 2 helpers (10 total — 3 CRITICAL, 4 CRITICAL from composition, 3 axiom-pattern). All SME-validated.

### Spec artifacts (`specs/d16/`)

- **`Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md`** — authoritative D1.6 spec (1,103 lines, v1.1.0)
- **`bfo-signature-reference-v1_0.md`** — prose NC reference (55 NCs, SME-locked)
- **`bfo-signatures-v1.0.json`** — machine-readable NC encoding with Prolog body drafts
- **`curated-process-categories-v1.0.json`** — SME-authored curated lists (34 entries across 3 categories)
- **`convergence-argument-v1.md`** — termination proof v0.3 with §4.5 Mutation Sequence Termination merged 2026-04-22
- **`d16-amendment-01.md`** — Taxonomic Descent + Reactive Engine amendment (NA-1.1 through NA-1.4)
- **3 Wave 2 validation artifacts** (SDCNC3, GDCNC3, QualityNC3) + **Wave 1 validation artifact** + **reasoner-cap-fallback scaffold review** + **E2.7 flag doc** + **Wave 2 design sketch (LOCKED)** — full artifact history preserved for reference

### Test infrastructure

- **tests/avc/d16-runner.test.js** — 68-scenario (now 69 with plausible-inheritance-clean) D1.6 AVC runner with trigger-handler registry pattern; synthetic-set allowlists scope which scenarios use which handler paths
- **tests/unit/d16/** — 3 Wave 2 helper unit-test files (40 tests total, all passing)

### The CCO demo

- **scripts/d16-cco-demo.js** — extraction + production routing demo over 12-class CCO fixture; shows Signature extraction → realization target discovery → routeRealizableCAUViaCuratedLists end-to-end. HeartPumpingFunction routes Function; Fragility routes Disposition. Captured output at `specs/d16/fixtures/cco-core-demo-output.txt`.

---

## Known SME Standing Offers (Still Active)

From the most recent cycles:

- **Prolog-rule validation** on remaining CRITICAL/High-priority items when Tau Prolog integration lands (RoleNC5 is the only unvalidated item, but deferred to v1.1+)
- **Pre-implementation design review** for architecturally-novel work (DP-2 scaffolding qualifies; 24h review cycle)
- **Week 6-8 hardening regression review** when `applyMutationSequence` MUST-COMPUTE fields are implemented

---

## Things NOT To Do In The First Cycle

- **Don't code DP-2 scaffolding directly.** Design sketch first.
- **Don't add curated-list entries.** None needed per the scoping memo; any expansion triggers VD-6 re-evaluation.
- **Don't revisit RoleNC5.** Deferred to v1.1+ by design; outside current scope.
- **Don't assume OWA posture for DP-2 helpers.** DP-2 operates over canonical records which are complete by construction; CWA is likely appropriate. Flag to SME if OWA questions arise.
- **Don't bump `bundle_version` in the AVC bundle without SME direction.** Bundle is at v4; changes require SME authorization (past pattern).
- **Don't delete scaffold handlers after production lands.** Retain as fallback — SME preference documented in scaffold/production split feedback memory.

---

## Things To Expect During DP-2 Work

- **More architectural novelty than Wave 2.** Wave 2 was composition + axiom-pattern work; DP-2 introduces new infrastructure surfaces (session registry, reproducibility-hash pipeline, provenance storage schema, schema validation). Expect SME to apply deeper scrutiny per the pattern-continuation note in Wave 1 signoff ("deeper scrutiny reserved for novel-structure cycles").
- **Several forward-flags converge.** Session-hash registry (Week 9-11 backlog item 3) is needed for DP-2. Must-compute fields in `applyMutationSequence` become real implementations. Consider whether forward-flags resolve in-place during DP-2 scaffolding.
- **13 scenarios open in one phase.** Largest single-phase scenario count. Pacing may require splitting into sub-waves (e.g., DP-2.1 schema validation, DP-2.2 provenance plumbing, DP-2.3 reproducibility hashing). Aaron will likely direct sub-wave structure.

---

## Quick-Reference Commands

```bash
# Run full test suite (should report 107 suites, 2,314 passed, 24 skipped before new work)
npx --node-options=--experimental-vm-modules jest

# Run just D1.6 AVC scenarios
npx --node-options=--experimental-vm-modules jest tests/avc/d16-runner.test.js

# Run CCO demo
node scripts/d16-cco-demo.js

# Inspect Band 6 scenarios
node -e "const b = require('./avc/fandaws-sentinel-d16-avc-bundle.json'); b.scenarios.filter(s => s.band === 6).forEach(s => console.log(s.id, '|', s.trigger.type));"
```

---

## One Honest Caveat

This handoff memo is written at Wave 2 closure with 8 substantive review cycles behind us. The pattern has held reliably, but DP-2 is architecturally novel in ways prior phases weren't (persistence surfaces, schema validation, cross-session concerns). Some of the patterns captured in feedback memories may not transfer cleanly — be ready to flag that to Aaron or SME when you encounter a case where they don't. "Pattern A worked for Wave 2 but doesn't apply here because ___" is a legitimate observation; don't force-fit.

**Particularly watch for:** when DP-2 scaffolding needs to reason about cross-session state (the compatibility-degraded flag from DP-1 flows into DP-2 records; session-hash registry bridges Phase 1 to DP-2). Cross-session concerns may require new patterns not in the current feedback set.

---

## End State

At the point of this handoff:
- Wave 2 closed cleanly with SME approval
- 10 of 11 SME-LOCKED items integration-path-complete
- All durable memory artifacts current
- No mid-flight work
- 107 test suites / 2,314 tests passing / zero regressions
- Next phase (DP-2 infrastructure) fully scoped and ready for design-sketch cycle

Start with the first-action list above. Design sketch first; coding after SME approves the scoping. Good luck.
