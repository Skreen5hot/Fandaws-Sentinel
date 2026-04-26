# Week 9-11 Forward-Flag Queue

**Purpose:** track decisions that were deliberately deferred from earlier cycles to the Week 9-11 DP-2 infrastructure phase, so they don't surface as surprises when the work actually begins. Each entry names the question, states the deferral cycle, names the decision-maker, and captures any preferred direction that has already been voiced.

**Status (2026-04-24):** DP-2 arc complete; D1.6 Phase 1 closed (70/70 AVC passing, Band 8 PROV-O acceptance green). Queue post-closeout status summary:

| Item | Status |
|---|---|
| 1. DependencyGraph property-linked neighbor | **RESOLVED** 2026-04-23 via `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` |
| 2. `bfo-signature-cache.js` hardening (3 sub-items) | **PARTIAL** — 2.3 (session-hash registry) landed DP-2.3.1; 2.1 (runtime guards) and 2.2 (temporal-regex shift) remain open |
| 3. `applyMutationSequence` must-compute fields | **RESOLVED** 2026-04-24 via V4 in DP-2.3.1 with SME scoping |
| 4. §4.3/4.5 convergence argument companion | **RESOLVED** (delivered during Weeks 6-7 as §4.5 standalone section) |
| 5. Class-subsumption for curated-list `include_subclasses: true` | **Still deferred** — developer decision at v1.1+ scoping |
| 6. CCO demo Quality exemplar fixture | **Still deferred** — low priority, v1.1+ |

**Posture post-closeout:** this file is reference-only. Items 5 and 6 remain genuinely deferred. Items 2.1 and 2.2 are opportunistic cleanup (Week 11+ or retired if ingestion pipeline changes obviate them). No open SME or developer commitments block on this queue.

---

## 1. DependencyGraph: operational definition of "property-linked neighbor" — **RESOLVED 2026-04-23**

**Resolution:** SME delivered `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` (REV1). Developer ACK same day. Definition: (1) domain/range co-occupation OR (2) restriction-mediated linkage via named-class unfolding. NC-satisfaction-pattern sharing explicitly excluded. Symmetric/undirected. Corner cases locked (self-edges dropped, no transitive closure, subproperty inheritance with cycle-safety, DNF extraction, OERS hard precondition with fail-fast per §4.9). Integration: `DependencyGraph.getNeighbors(cau) → Set<CAU>`. Matches the SME lean voiced at flagging time.

**Original flagging context (preserved for history):**

**Flagged:** 2026-04-21 (Week 5 review, SME Artifact 3 response).
**Decision owner:** SME, with Aaron ratification. Amendment or spec-supplement scope.
**Why deferred:** the scope-definition decision has ontological implications that shouldn't be made at Week 5 scaffold time. The Week 5 reactive-engine scaffold consumes the scope as an input parameter, so all four candidate definitions are currently compatible with the scaffold's interface. The choice locks in a semantic surface that should be deliberated alongside actual DependencyGraph construction.

**The four candidate definitions (SME 2026-04-21):**

1. **Domain/range co-occupation.** CAUs that appear in the domain or range of a property whose domain/range the mutated CAU also appears in.
2. **Restriction-mediated via onProperty.** CAUs referenced in restrictions whose `onProperty` matches a property appearing in the mutated CAU's Signature.
3. **NC-satisfaction-pattern sharing.** CAUs that share any NC-satisfaction pattern affected by the mutation.
4. **Combination(s) of the above.**

**SME lean:** combination of (1) and (2), explicitly excluding (3) as too expensive for cascade-time computation. SME will produce a candidate operational definition for amendment or spec-supplement inclusion when DependencyGraph work begins.

**Why the choice matters:** too narrow misses genuine cascading effects; too broad reprocesses irrelevant CAUs and soft-violates the bounded-scope spirit even while technically satisfying its letter. Affects the `handleMutationEvent` scope reach in [src/core/d16/reactive-engine.js](../../src/core/d16/reactive-engine.js).

**What's already locked (Week 5):** the scaffold's bounded-scope contract (unrelated CAUs are never re-evaluated regardless of scope definition) and the visited-set guard (overlapping scopes dedup to single visit per cascade). Those properties hold independent of definition choice.

---

## 2. `bfo-signature-cache.js` hardening items (3 items) — **PARTIAL**

**Flagged:** 2026-04-21 (Week 3 review). Fully specified in [project_d16_week9_11_backlog.md](../../../.claude/projects/c--Users-aaron-OneDrive-Documents-Fandaws-Sentinel/memory/project_d16_week9_11_backlog.md) memory.

**Sub-item status (2026-04-24):**

1. **Runtime guards for test-only `seedCache` / `resetForTests` — STILL OPEN.** Not absorbed by DP-2 arc per developer self-admission during DP-2.3.1 cycle. Scaffold-via-JSDoc tolerable until production paths invoke these functions (none currently do). Opportunistic cleanup for Week 11+ or retire if adapter architecture shifts make it moot.
2. **Temporal-detection regex → axiom-inspection shift — STILL OPEN.** Upstream-deferred; hinged on Week 4-6 real OWL extraction work that was itself deferred. Downstream-of-blocked, not blocker-of-anything. Remains deferred; revisit when OWL extraction work is scheduled.
3. **Session-hash registry infrastructure — RESOLVED 2026-04-24** via DP-2.3.1 commit. Extension to `bfo-signature-cache.js`; provenance consults registry (not live cache), closing the cache-mutation failure mode. Backgroundtheoryversion provenance citation now registry-backed.

---

## 3. Must-compute fields in `applyMutationSequence` — **RESOLVED 2026-04-24**

**Resolution:** landed DP-2.3.1 commit 1636ae2 as V4 of the SME verification cycle. Originally claimed closed in DP-2.2 design-sketch §4.2; the actual code landing did not happen until SME review surfaced the gap during DP-2.2 ACK.

**SME scoping applied:**
- **"terminal disposition"** = 5-element set `{Entailed, Plausible, Inconsistent, NotApplicable, IterationNonConvergence}` for convergence accounting (per D1.6-L5 + L7). Exposed as `terminalDispositionSet` (new field).
- **"primary dispositionSet"** = 4-element analyst-visible set (unchanged; IterationNonConvergence excluded to preserve existing AVC scenario contract). Developer caught this distinction mid-implementation; SME banked the field-split pattern.
- **"oscillation"** = same-disposition revisit within a single cascade walk (per-CAU per-cascade `visitedDispositions: Set<string>`).
- **`convergenceReached`** = event queue empty AND no CAU has `pendingReEvaluation` true.
- **`dependencyGraphConsistent`** = X1 §4.9 fail-fast precondition holds post-cascade + neighbor-set lookups returned for every queried CAU.

**Original flagging context (preserved for history):**

**Flagged:** 2026-04-21 (Week 5 signoff, SME Artifact 2 response).
**Decision owner:** implementer at Week 6-8 hardening kickoff.

**Scaffold fields that were returned as canned `true`:**
- `convergenceReached`
- `finalStateInvariants.allCAUsInTerminalDispositionSet`
- `finalStateInvariants.noPendingReEvaluations`
- `finalStateInvariants.noOscillation`
- `finalStateInvariants.dependencyGraphConsistent`

**Original must-compute requirement (SME):** when real reactive-engine logic lands, these MUST be computed from actual cascade-walk state inspection — not declared. Any implementation that preserves the canned values without computing them fails SME's Week 6-8 hardening criterion. Inline comments in [reactive-engine.js](../../src/core/d16/reactive-engine.js) marked each field with `// MUST-COMPUTE: Week 6-8 hardening`.

---

## 4. §4.3 convergence argument companion claim — **RESOLVED**

**Resolution:** delivered during Weeks 6-7 as §4.5 standalone section in `specs/d16/convergence-argument-v1.md`. The original "§4.3 companion" framing was superseded when the section was promoted to §4.5 mutation-sequence-termination claim with dedicated treatment rather than appendix-style addition to §4.2.

**Original flagging context (preserved for history):**

**Flagged:** 2026-04-21 (Week 5 signoff, SME Artifact 2 response).
**Decision owner:** Aaron + developer, collaboratively drafted; SME-reviewed before NA-1.4 ships production.
**Why NOT deferred to Week 9-11:** this is a Week 6 deliverable, not a Week 9-11 one. Listed here for tracking completeness so nothing about the reactive engine's proven-foundation status falls through cracks.

**Target:** paragraph-length §4.3 companion to `specs/d16/convergence-argument-v1.md` §4.2. Skeleton from SME 2026-04-21: PIPELINE-REACTIVE-DECOUPLING plus EVIDENCE-DELTA-SHORT-CIRCUIT jointly prevent revisit inflation across the sequence, because (a) mutations are queued until prior cascades terminate (no mid-cascade stacking) and (b) within a queued cascade, state that hasn't changed since prior cascade doesn't re-trigger propagation. Monotonic progress on CAU state across the sequence.

**Bidirectional traceability requirement:** when written, §4.3 references `applyMutationSequence` location in reactive-engine.js AND the function's header references §4.3. Mirrors the pattern in `reactive-engine.js` header's PIPELINE-REACTIVE-DECOUPLING reference.

---

## 5. Class-subsumption infrastructure for curated-list `include_subclasses: true` entries — **STILL DEFERRED**

**Status post-D1.6 Phase 1 closure (2026-04-24):** remains genuinely deferred. D1.6 Phase 1 closed without resolving this — helpers landed with the `isSubclassOf` callback API intact and the "conservatively-bias-toward-Plausible" degraded-mode behavior documented. Revisit at v1.1+ scoping, or earlier if PROV-O Pass 2 calibration surfaces non-coverage as a material gap.

**Original flagging context (preserved for history):**

**Flagged:** 2026-04-22 (curated lists delivery).
**Decision owner:** developer, with Aaron ratification. Week 6-8 hardening scope.
**Why deferred:** the `include_subclasses: true` flag on entries in `specs/d16/curated-process-categories-v1.0.json` (majority of the 34 entries) requires class-level subsumption queries at Phase 3 time. The Week 6 helper scaffold at `src/core/d16/critical-nc-helpers.js` accepts an optional `isSubclassOf(subIRI, superIRI)` callback — production must supply it, but the infrastructure decision should be made alongside actual Week 6-8 hardening implementation context, not pre-committed at scaffold time.

**Two candidate designs:**

1. **Load candidate ontology's `rdfs:subClassOf` hierarchy into Tau Prolog fact base at Phase 3 initialization.** Class relations become Prolog facts; subsumption queries run via Tau Prolog resolution. Same architectural pattern as the existing reasoner-cap path for property subsumption.

2. **Extend existing subsumption infrastructure** (`cau-signature.js` LS-3 sub-property closure + `subsumption_map` field in `bfo-signatures-v1.0.json`) to class relations. Reuses the walker already proven in Band 1 extractor.

**Tradeoffs:**
- (1) integrates naturally with Tau Prolog query surface but requires fact-loading at Phase 3 init (cost at session start for OBO-scale hierarchies).
- (2) keeps class-subsumption in the extractor layer; query surface stays JavaScript; fact-loading cost amortized across the extractor pass.

**SME input:** neither pre-committed; both defensible. SME's 2026-04-22 framing: "Whether that happens via Phase 3 initialization loading the class hierarchy into the Tau Prolog fact base, or via the existing subsumption infrastructure extending to class relations, is a developer decision — both are defensible; the requirement itself is what matters."

**What's locked at Week 6:** the helper's API surface (`isSubclassOf` callback parameter) is compatible with either implementation. Choice of (1) vs (2) at Week 6-8 hardening doesn't require re-threading the helper signature.

**Impact if not decided:** without a subsumption resolver, `include_subclasses: true` entries degrade to direct-match-only. This conservatively biases toward non-coverage (helpers return false where they should return true), routing more CAUs to Plausible with `nonCoverageFromCuratedLists: true`. Not semantically wrong (Plausible is the honest answer when you can't resolve), but misses coverage the curated lists intend to provide.

---

## 6. CCO demo fixture — Quality exemplar with full evidence restrictions — **STILL DEFERRED**

**Status post-D1.6 Phase 1 closure (2026-04-24):** low-priority deferred item. Band 8 PROV-O acceptance passed without this fixture addition; QualityNC3 coverage remains synthetic-signature unit-test-only. Revisit alongside other fixture-expansion decisions at v1.1+ or if PROV-O Pass 2 calibration benefits from CCO Quality regression coverage.

**Original flagging context (preserved for history):**

**Flagged:** 2026-04-22 (Wave 2 closeout, SME QualityNC3 validation memo).
**Decision owner:** developer, optional at Week 9-11 DP-2 fixture-expansion planning.
**Why deferred:** the Band 4 CCO demo fixture's 12 CAUs don't include a Quality class with full evidence restrictions — `cco:Color` has `inheresIn some bfo:0000040` but no existsAt and no explicit `rdfs:subClassOf bfo:Quality`, so under QualityNC3 Option B it routes false (correctly, but doesn't exercise positive paths). SDCNC3 has `cco:AgentRole` as a regression case; GDCNC3 has `cco:DesignativeInformationContentEntity`; QualityNC3 has no equivalent.

**Forward action:** when Week 9-11 DP-2 acceptance gate scoping begins, consider adding a CCO Quality exemplar with either:
- `existsAt some TemporalRegion` + `inheresIn some Bearer` (exercises QualityNC3 pattern 1), OR
- Explicit `rdfs:subClassOf bfo:Quality` declaration that the extractor surfaces as a subclass chain feeding the `isSubclassOf` callback (exercises QualityNC3 pattern 3).

**Not blocking.** QualityNC3 helper is validated via synthetic-signature unit tests (13 passing). The forward-flag is about regression coverage against real CCO data, not about helper correctness.

**Priority:** low. Lands alongside other DP-2 fixture-expansion decisions when Band 6 work begins.

---

## Adding to this queue

When a decision is deliberately deferred during implementation:
1. Add a new numbered section here with the flagged date, decision owner, and rationale for deferral.
2. Note any preferred direction that's already been voiced (by Aaron, SME, or developer).
3. Reference the source document where the deferral was recorded (review doc, memo, memory file).
4. If the deferral is time-sensitive (e.g., must be resolved before a specific band's work can ship), state the deadline and the band/week it gates.

**Do not use this queue for open technical questions that have not been deliberately deferred.** Those go in issue trackers or per-band TODO scaffolds.
