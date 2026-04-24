# D1.6 Convergence Argument — v1 (Draft)

**Status:** DRAFT (Week 1 deliverable; SME review scheduled before NA-1.4 Week 6)
**Version:** 0.1-draft
**Authored:** 2026-04-21
**Parent spec:** `specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md` (§3, §9.2, §10.2)
**Amendment:** `specs/d16/d16-amendment-01.md` (NA-1.1 through NA-1.4)
**Scope:** demonstrate that D1.6's Phase 1 pipeline terminates deterministically on every input, that stabilization is CAU-local (failure of one CAU does not contaminate others), and that the reactive re-evaluation engine introduced by NA-1.4 cannot non-terminate on any finite dependency graph — including graphs with `rdfs:subClassOf` cycles.

---

## 1. What This Document Argues

D1.6 introduces three separate termination claims that must hold jointly for the pipeline to be sound:

1. **Bounded-fallback convergence (spec §3.3, Rule IT-1).** The iterative Phase 1 loop terminates at round 3 at the latest. Round is a coarse unit: within a round, Signature computation, BFO comparison, and Phase 2 provisional alignment each run once per CAU.
2. **CAU-specific stabilization (spec §3.3, Rule IT-2, D1.6-L7).** Non-convergence of some CAUs does not block others. Each CAU's convergence status is tracked independently; stabilized CAUs pass through to Phase 3, oscillating CAUs route to `IterationNonConvergence`.
3. **Reactive cascade termination (amendment NA-1.4, §8.3 of D1.6 spec).** When a CAU's evidence state changes, the reactive engine re-evaluates dependent descendants. The cascade is bounded on any finite DependencyGraph, including graphs containing `rdfs:subClassOf` cycles in the source ontology (which are modeling errors but appear in real-world OBO Foundry inputs).

These three together guarantee: **no input — however pathological — can make D1.6 hang or silently produce incoherent output.**

---

## 2. Termination of Bounded-Fallback Iteration

### 2.1 Setup

After the single-pass result in spec §3.2, round 0 is complete. If single-pass sets `requiresBoundedFallback` (§3.1 trigger conditions: contradiction or ambiguity, NOT mere cross-dependency), the loop enters rounds 1-3.

Each round performs a single `(extractSignatures → compareToBFO → alignProperties → checkConvergence)` pass. The state at round `i` is the vector of `(disposition, evidence)` tuples for each of the `N` CAUs plus the vector of `(alignment, weight)` tuples for each of the `M` properties.

### 2.2 The Termination Argument

Let `S_i` be the state at the end of round `i`, for `i ∈ {0, 1, 2, 3}`.

**Claim.** Either `S_3 = S_2` (converged), or the pipeline terminates at round 3 with CAU-specific flags per D1.6-L7. In no case does the loop continue past round 3.

**Proof sketch.** The maximum-rounds cap is a hard terminator (spec §3.3, "Maximum rounds: 3"). The loop's exit condition is `(S_i == S_{i-1}) OR (i >= 3)`. Both operands are decidable in bounded time given that `N` (CAU count) and `M` (property count) are finite per session and that each round's computation is itself bounded (Signature extraction is O(axioms); BFO comparison is O(13 categories × queries per category); property alignment is O(M) per spec §8.2).

**Why the cap is 3 (principled, not budget-limit).** The 3-round cap is calibration-derived, not an arbitrary budget. Round 0 produces the single-pass result. Round 1 resolves refinements that Phase 2's property alignment feedback introduces on top of round 0 placements. Round 2 resolves refinements cascaded from round 1's placement changes (e.g., a CAU whose placement flipped in round 1 may change the property alignment context for another CAU in round 2). Round 3 exists specifically to detect oscillation — if the state vector differs between round 3 and round 2, the CAU is semantically non-convergent under the axioms available in this session, and further rounds would not help (the same input/output delta would simply repeat).

Calibration at Checkpoint 2 will confirm whether real ontologies converge within 3 rounds. If calibration shows routine 4+ round requirements, the cap is wrong and the model needs revision — not a budget bump. Conversely, if calibration shows 99%+ of sessions converge by round 1, the cap may be lowered to 2 for performance. The cap is a calibration output, not an engineering knob.

### 2.3 What "Non-Convergence" Means Operationally

A CAU `C` is non-convergent at round 3 iff its disposition tuple `(disposition, evidence_summary)` differs between `S_3` and `S_2`. Such CAUs are flagged `IterationNonConvergence` and routed to PendingHumanResolution. Their evidence records preserve the full per-round history (§4.6, every disposition change is an evidence transition). This makes the oscillation analyzable by analysts without replaying the session.

---

## 3. CAU-Specific Stabilization

### 3.1 Why It Matters

Naïve all-or-nothing iteration blocks the whole session on a single bad CAU. For a 10,000-class OBO ontology, one oscillating CAU would force manual triage on every other CAU's downstream property alignment. D1.6-L7 rejects this.

### 3.2 Independence Argument

A CAU's disposition at round `i` is a function of:
- its own Signature (axiom-level; invariant across rounds since axioms don't change)
- the BFO category Signatures (invariant across rounds; version-bumped separately)
- **upstream property alignments** (may change across rounds as Phase 2 refines)

**The CAU-level independence claim (what the termination argument needs).** For every CAU `C`, the decision to flag `C` as `IterationNonConvergence` at round 3 depends only on `C`'s own per-round history. No other CAU's state affects this decision. This is trivially true because the flagging rule in spec §3.3 is local: `flag(C) iff disposition(C, S_3) != disposition(C, S_2)`. Phase 3 admission is also local: stabilized CAUs pass through regardless of how many other CAUs are flagged.

This is the load-bearing claim for termination. It says: no CAU's failure to converge delays, blocks, or corrupts another CAU's stabilization. The session terminates in bounded time with a partition of CAUs into `{stabilized, flagged}`.

**Cluster-level oscillation propagation (a separate, unproven observation).** Two CAUs `C_1` and `C_2` that share an upstream property `p` *may* co-oscillate if the Phase 2 alignment of `p` oscillates. They *may also* stabilize independently even when `p` oscillates — e.g., if `C_1`'s disposition is robust to the specific alignment choice and `C_2`'s is not. Whether they actually co-oscillate depends on the shape of the BFO categories their Signatures are competing against, and on whether the category choice for each is sensitive to `p`'s alignment at the specific round.

**This is not proven, and the termination argument does not rely on it.** The argument explicitly does not claim that coupled CAUs form an oscillation equivalence class. Cluster-level flagging, if ever introduced to improve analyst ergonomics, is a UI-layer decoration, not a soundness claim. The spec currently flags per-CAU (§3.3, §4.6); the implementation implements per-CAU; this document proves per-CAU. If cluster-level semantics are wanted later, a separate argument must justify them.

Spec §3.3 and §4.6 encode the per-CAU discipline: the round-0 → round-3 history is stored per-CAU, and `IterationNonConvergence` is assigned per-CAU. Phase 3 runs on the non-flagged CAUs. Flagged CAUs are held out for analyst resolution without blocking the rest.

### 3.3 Calibration Expectation

For PROV-O (≈30 classes, test bed): expect 0 oscillations. For CCO Core (≈100 classes): expect <5% oscillations, mostly in the Role/Function/Disposition triad (where §5 cascade of the BFO reference applies). For NCBITaxon subset (≈5,000 classes): expected <1% oscillations based on an axiom-density prior (low axiom density per class → less coupling through property alignment → fewer oscillation opportunities). Calibration against a NCBITaxon subset at Checkpoint 2 (Week 3-4) will confirm or revise these numbers. The prior is not a measurement; it is a hypothesis to be tested.

---

## 4. Reactive Cascade Termination (NA-1.4)

### 4.1 The Problem

NA-1.4 replaces batch re-evaluation with reactive: when CAU `C`'s evidence state changes (due to a mutation event per amendment §2), the engine walks the DependencyGraph and re-evaluates descendants. Naïvely, cycles in the source ontology's `rdfs:subClassOf` graph (e.g., `A subClassOf B; B subClassOf A` — a real modeling error that appears in some OBO archives) would make the cascade non-terminating.

### 4.2 The Guard

Spec §8.3 and the amendment commit to two termination guards:

1. **Cycle-breaking via visited-set.** The cascade walker maintains a per-cascade visited set. When a CAU would be re-visited, the cascade branch terminates (not the whole cascade — descendants below the revisit point are not re-walked a second time within this cascade).
2. **Evidence-delta short-circuit.** If a revisit happens and the CAU's evidence state has not changed since the first visit within this cascade, the cascade branch terminates. This applies when the ontology has no cycle but has overlapping dependency paths (e.g., `D` has parents `B` and `C`, both of which have parent `A`; `A`'s mutation causes two paths to `D`, but the second arrival finds `D` already stable).

**Claim.** Combining these two guards, every cascade terminates in at most `|V| + |E|` operations on the DependencyGraph, where `V` is CAUs and `E` is edges. This is independent of whether the graph contains cycles.

**Proof sketch.** Visited-set termination guarantees each CAU is processed at most once per cascade. Edge termination guarantees each parent-child relationship is walked at most once per cascade. Both bounds are trivially finite on finite graphs.

### 4.2.1 Heuristic EVIDENCE-DELTA-SHORT-CIRCUIT (SME-specified)

> During a reactive cascade, if a CAU `C` would be revisited within the same cascade AND `C`'s evidence state at the moment of revisit is identical to its evidence state at first visit within this cascade, the revisit is skipped.
>
> Formally: for any CAU `C`, any cascade identifier `cascade_id`, and any times `t_first_visit < t_revisit` both within `cascade_id`:
>
> ```
> visited(C, cascade_id) ∧ evidence(C, t_revisit) == evidence(C, t_first_visit)
>     ⇒ skip(C) at t_revisit
> ```

**Why it is stated as a heuristic, not a law.** The visited-set guard in §4.2 already guarantees cascade termination. EVIDENCE-DELTA-SHORT-CIRCUIT is stronger than strictly necessary for termination — it additionally catches the case where a cycle-free graph has overlapping dependency paths (e.g., diamond-shaped inheritance) that would otherwise process the same CAU twice with the same input. The heuristic makes cascade work O(unique CAU visits) rather than O(edge traversals), which is the practical-performance claim. Strict termination is O(|V| + |E|) either way.

**Equivalence check semantics.** Evidence state equality is a deep-equality comparison of the CAU's `{disposition, annotations, flagged_ncs}` tuple as of the two timestamps. Two evidence states with the same disposition but different annotation histories count as different, even if the difference is structurally redundant — this is intentional, to avoid false positives that could skip a legitimate cascade step.

**Cascade-scoped, not session-scoped.** The visited set is scoped to a single cascade (identified by the triggering mutation event). A subsequent cascade starts with an empty visited set. This matters: a CAU legitimately revisits in cascade `k+1` after having been visited in cascade `k`, because the second cascade operates on a potentially different state.

**Where it is used.** This heuristic fires in two situations:
1. **Diamond paths in dependency graphs** — e.g., `D` has parents `B` and `C`, both descend from `A`. Cascade triggered by mutation on `A` reaches `D` twice. Second arrival is short-circuited.
2. **Rdfs:subClassOf cycles in source ontology** — e.g., `A subClassOf B; B subClassOf A`. Combined with the visited-set guard in §4.2, this yields double protection: the visited set breaks the cycle at the walker level, and evidence-delta confirms the terminated branch would have been a no-op if continued.

**SME Checkpoint 3 requirement.** Implementation must emit a cascade-level summary log that reports `(unique_visits, short_circuits, visited_set_terminations, edge_count)` per cascade. SME reviews this log against the test fixtures at Checkpoint 3 (Week 8) to validate the heuristic fires where expected and does not fire where it shouldn't.

### 4.3 Interaction with Iterative Pipeline

A reactive cascade happens AFTER Phase 1 convergence — not during iteration. Mutation events are analyst actions on a session that has already stabilized (or flagged oscillations). So the cascade termination argument is decoupled from the iterative pipeline termination argument. Both can be proven separately, and they do not compose in a way that could create a super-loop.

**Invariant PIPELINE-REACTIVE-DECOUPLING (load-bearing).**

> Reactive cascades MUST NOT fire during bounded-fallback iteration (rounds 1-3). Mutation events queued during iteration are held until Phase 1 terminates and processed in arrival order after the iterative pipeline has either converged or emitted per-CAU `IterationNonConvergence` flags.

**Why it is load-bearing.** If a mutation event fires during round `i` and triggers a cascade that modifies CAUs participating in that round, the iterative pipeline's state vector `S_i` becomes non-deterministic in round `i`'s result. The termination argument in §2.2 assumes `S_i` is a function of `S_{i-1}` plus the round-`i` computation. A mid-round cascade breaks that assumption, and the 3-round cap is no longer a sufficient terminator — a cascade-triggered state change could restart the oscillation window indefinitely. The whole termination claim in §2 collapses.

**Spec commitment.** This invariant must be written into spec §3.3 or §8.3 as an explicit commitment before NA-1.4 implementation begins in Week 6. The queue mechanism (how events are held, how ordering is preserved across multiple analyst actions, how the queue is drained after Phase 1 terminates) is a Week 6 implementation deliverable but the invariant itself is a Week 2 spec-update deliverable.

**Future-proofing.** If a future feature proposes "continuous re-evaluation during exploratory editing" or "live cascade during iteration," it must either (a) restate and prove a new termination argument that covers the interleaved case, or (b) reject the proposal. There is no third path; this invariant is not negotiable without replacing the entire termination argument.

### 4.4 Calibration Expectation

For NCBITaxon (5,000 classes, deep hierarchy): worst-case cascade depth ≈ 15 levels. Wall-clock expectation on standard hardware: <500ms per cascade. IndexedDB-backed DependencyGraph storage (50-80MB at NCBITaxon scale per amendment §4.2) adds I/O latency but does not affect termination.

### 4.5 Mutation Sequence Termination

Section §4.2 bounds a single cascade at `|V| + |E|` operations. That argument does not, by itself, bound a *sequence* of mutations. This section establishes the sequence-level claim: every finite mutation sequence applied to a finite DependencyGraph terminates, and the number of cascades the sequence produces is bounded by `|V| × |D|`, where `|D|` is the size of the CAU state space (disposition × bfoCategory + terminal flags).

The argument composes cascade-local strict shrinkage (§4.5.1) with sequence-level monotonic progress (§4.5.2).

#### 4.5.1 Cascade-local strict shrinkage of V_active

Within a single cascade, define `V_active(t)` = the set of CAUs still to be processed by the cascade walker at time `t`. At cascade start, `V_active` contains the mutation target plus its dependency-scope (ancestors, descendants, property-linked neighbors per §4.2.1-handling). At each cascade step, the walker pops one CAU from `V_active` and either (a) processes it (transitions its state per the mutation's implications) and removes it from `V_active`, or (b) short-circuits it via EVIDENCE-DELTA and removes it from `V_active` without state change. The visited-set guard prevents reintroduction of any CAU into `V_active` within the same cascade.

**Claim.** `V_active` strictly shrinks at each cascade step. Therefore every cascade reaches `V_active = ∅` in at most `|V|` steps, bounded by §4.2's `|V| + |E|` operations when edge walks are included.

This is the same result §4.2 proves; §4.5.1 makes the strict-shrinkage property explicit because §4.5.2 requires it.

#### 4.5.2 Sequence-level monotonic progress via state-visit potential

Define a potential function over the session:

> `Φ(t) = Σ over all CAUs C of |distinct (disposition, bfoCategory) states C has been in through time t|`

where a CAU's state space includes the four dispositions `{Entailed, Plausible, Inconsistent, NotApplicable}` combined with their bfoCategory assignment, plus `IterationNonConvergence` as an absorbing terminal state.

**Property 1 (bounded above).** Φ is bounded by `|V| × |D|` where `|D|` is the finite cardinality of the per-CAU state space. For the current disposition/category axes plus IterationNonConvergence, `|D|` is a constant depending on the number of BFO target categories (13 + 1 for NotApplicable + 1 for IterationNonConvergence = 15) times the number of dispositions (4) — a session-independent constant ≤ 60.

**Property 2 (monotonically non-decreasing).** Φ never decreases across time. A CAU that has been in state `s` retains the count of `s` in its distinct-states-visited set even if later cascades move it out of `s`. Revisits to previously-visited states do not increase Φ (they are not distinct).

**Property 3 (strictly increases per non-trivial cascade).** Every cascade that does non-trivial work causes at least one CAU to transition to a state it has not previously been in, OR flags a CAU as IterationNonConvergence (itself a new terminal state the CAU has not been in). Either way, Φ grows by at least 1.

- *If the cascade causes a CAU to visit a new (disposition, bfoCategory) state:* Φ grows by 1 directly.
- *If the cascade causes a CAU to revisit prior states only:* the cascade's EVIDENCE-DELTA short-circuits will catch it at revisit time (state unchanged from prior visit), contributing zero work. A cascade with no non-short-circuit transitions does not advance Φ and is not counted toward the Φ-based bound. It still produces a provenance record per DP-2 and terminates within the single-cascade §4.2 bound.
- *If a CAU oscillates through previously-visited states enough times that it reaches the `noOscillation` ceiling (|D| distinct states visited, per §4.5.2 state-space cardinality):* the CAU is flagged IterationNonConvergence per D1.6-L7's general principle — the same disposition Phase 1 applies to oscillating CAUs in bounded-fallback iteration, applied here at state-space exhaustion during reactive cascades. Either way, Φ grows by 1.

**Combining:** Φ starts at `|V|` (each CAU counted once for its initial disposition) and is bounded above by `|V| × |D|`. Each non-trivial cascade increases Φ by ≥1. Therefore the total number of non-trivial cascades across any mutation sequence is bounded by `|V| × (|D| - 1) = O(|V|)`.

**Bounding trivial cascades.** The Φ argument bounds only *non-trivial* cascades — those where at least one CAU transitions to a new state. A trivial cascade (all CAUs short-circuited via EVIDENCE-DELTA; Φ unchanged) contributes no progress and is not counted in the `|V| × (|D| - 1)` bound. Trivial cascades are bounded by the external mutation sequence length, which is finite per the session-lifecycle assumption that mutation sequences terminate. PIPELINE-REACTIVE-DECOUPLING queues each arriving mutation exactly once (i.e., the queue neither drops nor duplicates arrivals; it does not claim that a given mutation type appears at most once per session); the queue drains in arrival order. Therefore the total cascade count across a sequence of K externally-applied mutations is bounded by `K + (|V| × (|D| - 1))` — at most K trivial cascades plus the O(|V|) non-trivial cascades — which is finite for any finite K.

This closes the bounding argument: non-trivial cascades bounded internally by Φ; trivial cascades bounded externally by sequence length.

#### 4.5.3 What this bound does and does not guarantee

**Guaranteed:**
- Any finite mutation sequence against a finite DependencyGraph terminates in bounded cascades.
- Cascade count bound is `O(|V|)` where V is the CAU set, with specific constant `|V| × (|D| - 1)` where `|D|` is the state-space cardinality.
- Each individual cascade is §4.2-bounded at `|V| + |E|` operations.
- Therefore total sequence-level work is bounded by `|V| × (|D| - 1) × (|V| + |E|) = O(|V|² + |V|·|E|)`.

**Not guaranteed:**

(1) **Wall-clock performance at OBO scale is not addressed by this argument.** For `|V| = 5,000` (NCBITaxon subset target) and dense `|E|`, `O(|V|² + |V|·|E|)` is potentially in the 10⁸-operation range per full mutation sequence. This is tractable on standard hardware but not cheap. If calibration (Weeks 3-4 and onward) shows this dominating session wall-clock, the fix is reactive batching or amortization in a future phase — not a re-derivation of termination. The termination argument holds regardless of whether the constant factor is acceptable.

(2) **Sequences with deliberately adversarial oscillation are handled by IterationNonConvergence, not by this argument.** An analyst who repeatedly reverses their own overrides on the same CAU can drive `|D|` visits per CAU to its maximum, saturating the bound but not exceeding it. Once a CAU reaches the IterationNonConvergence terminal state (per the D1.6-L7 inheritance described in §4.5.2 Property 3), subsequent cascades skip it — the adversarial sequence cannot indefinitely inflate cascade count. This is the same behavior D1.6-L7 applies to Phase 1 bounded-fallback iteration; the sequence-level argument inherits it without modification.

(3) **Non-finite sequences are explicitly out of scope.** The argument assumes K mutations in a queue is finite. An unbounded analyst-mutation stream is a session-lifecycle concern handled by session limits, not by the reactive engine's termination argument. If session duration is unbounded, the reactive engine terminates *each* mutation's cascade in bounded time but does not terminate the session itself. That is the correct separation. In the termination-mode framing below, this is internal-termination still holding (each cascade terminates) while external-termination failing (no finite K).

(4) **Semantic correctness of terminal classifications is not addressed by this argument.** The proof establishes that the reactive engine terminates; it does not establish that the terminal disposition assigned to each CAU is the correct ontological classification. Semantic correctness is the concern of the NC-based evaluation machinery (Rule EV-* family, BFO Signature Reference, three-state evidence model per D1.6-L9), not of the termination argument. Termination and correctness are orthogonal properties; both must hold for the system to be sound, but they're proved separately.

**Termination-mode framing.** The argument above establishes two distinct termination modes that compose. **Internal termination** operates on the cascade and non-trivial-cascade layers: bounded cascades via §4.5.1 V_active shrinkage, and O(|V|) non-trivial cascades via §4.5.2 Φ-growth. Internal termination holds independent of the input stream. **External termination** operates on the trivial-cascade layer: trivial cascades are bounded by the finite mutation sequence length K per the session-lifecycle assumption. External termination depends on the input stream being finite. Both modes must hold for the composed bound `K + (|V| × (|D|-1))` to apply. This means the reactive engine is weakly terminating internally (will always make progress given input) and strongly terminating under finite input (will always complete under any finite K). An unbounded mutation stream would preserve internal termination but not the external bound — see exclusion (3) above.

**Bidirectional traceability:**
- Implementation surface: `applyMutationSequence` in [src/core/d16/reactive-engine.js](../../src/core/d16/reactive-engine.js) (function header references this section).
- Load-bearing dependencies: §4.2 Cascade-termination bound, §4.2.1 EVIDENCE-DELTA-SHORT-CIRCUIT, §4.3 PIPELINE-REACTIVE-DECOUPLING invariant.
- Applies D1.6-L7's general principle (CAU-specific convergence failure handling) to the sequence-level context. Phase 1 applies L7 at bounded-fallback iteration termination (round-count trigger); §4.5 applies L7 at state-space exhaustion during reactive cascades (|D|-ceiling trigger, per §4.5.2 and the `noOscillation` annotation in `src/core/d16/reactive-engine.js`).

---

## 5. Known Edge Cases and Their Handling

### 5.1 Empty Ontology

Parse produces 0 CAUs. Phase 1 runs zero iterations, terminates immediately. DP-1 threshold check on empty input is a no-op (0% of 0 is undefined; session metadata records the empty state without firing DP-1).

### 5.2 Single-CAU Ontology

Phase 1 runs single-pass; no cross-dependency on property alignment is possible. Round 0 is final. Cannot oscillate.

### 5.3 Cyclic `rdfs:subClassOf`

Source-ontology modeling error. Detected at DependencyGraph construction (spec §8.1). Flagged in session metadata. Cascade walker applies cycle-breaking per §4.2. Does not block Phase 1 convergence.

### 5.4 Cyclic `rdfs:subPropertyOf`

Handled at Signature extraction (Rule LS-9, spec §2.3 Step 2). Visited-set guard in `ancestorsOfProperty`; `cycleDetectionTriggered` flag surfaced on Signature provenance. The cycle-closing edge is skipped; closure traversal still terminates on remaining edges.

### 5.5 Ontology Where Every CAU is NotApplicable

DP-1 fires at session start (>40% NotApplicable threshold, spec §7). Analyst may opt into exploratoryMode to continue; otherwise session halts with a soft-gate diagnostic. Not a convergence failure — an ontology-quality signal.

### 5.6 Ontology Where Every CAU is Inconsistent

DP-1 fires (>30% Inconsistent threshold). Same handling as §5.5.

### 5.7 Concurrent Mutation Events

Amendment §2.3: mutation events are serialized at the session level. If two arrive concurrently, the second waits until the first's cascade terminates. Termination of cascade 1 is guaranteed per §4.2; cascade 2 then starts on the post-cascade-1 state.

---

## 6. What SME Review Should Scrutinize

- **§2.2 round cap.** Is 3 rounds the right calibration default, or should it be configurable per-session? Current spec fixes it; calibration studies in Weeks 3-4 inform Checkpoint 2.
- **§3.2 coupling treatment.** Is cluster-level (rather than CAU-level) flagging the right semantic for tightly-coupled oscillation? Current spec flags per-CAU; cluster-level would give better analyst ergonomics on a few tightly coupled CAUs, but worse on loosely-coupled clusters that happen to all oscillate.
- **§4.3 decoupling assumption.** The argument relies on reactive cascades happening strictly after Phase 1 termination. If a future feature allows "continuous re-evaluation during exploratory editing," this assumption breaks and a super-loop becomes possible. Flag this as a forward-looking constraint on the architecture.
- **§5.5, §5.6 DP-1 semantics.** Is the >40% / >30% threshold conservative enough, or too conservative? Default values come from the spec; Checkpoint 1 calibration confirms against CCO Core.

---

## 7. What This Argument Does NOT Prove

- It does not prove **correctness** — only termination. A pipeline can terminate with wrong dispositions. Correctness is an AVC-bundle concern (68 scenarios across 8 bands).
- It does not prove **performance bounds** beyond the asymptotic ones above. 60-second wall-clock budget at 100-class scale (§2.5 spec) is a calibration expectation, not a proof.
- It does not cover Phase 2 property disambiguation termination — that's covered by D2's existing proof (Rule PD-1 through PD-9, Phase D2 spec).
- It does not cover Phase 3 consistency sandbox termination — that's covered by the Horn step cap (PS-8 from D2, 10,000 steps, hard termination).

---

## 8. Next Steps

- **Week 2-3:** Calibration runs on PROV-O, CCO Core sample. Record actual round counts. If >1% of CAUs reach round 3, revisit §2.2.
- **Checkpoint 2 (Week 3-4):** SME reviews this document. Adjustments incorporated into v0.2.
- **Week 6 (NA-1.4 implementation start):** v1.0 required. Reactive cascade termination guard implemented and tested against cyclic-subclass test fixtures.
- **Checkpoint 3 (Week 8):** SME validates this document against implementation. Final v1.0 signed off. Becomes source of truth for D1.6 termination discipline.

---

## Version History

- **v0.1-draft (2026-04-21):** initial Week 1 draft. Covers bounded-fallback iteration (§2), CAU-specific stabilization (§3), reactive cascade termination (§4), known edge cases (§5). Open for SME review at Checkpoint 2. Not yet proven against real calibration data.

- **v0.2-draft (2026-04-21):** Aaron-review revisions applied.
  1. §2.2 reframed 3-round cap as calibration-derived (principled) rather than "one more chance" (budget-limit).
  2. §3.2 rewritten: separated load-bearing CAU-level independence claim (proven, carries termination) from cluster-level oscillation observation (acknowledged as unproven heuristic; not relied on). Option (b) from Aaron review — honest demotion.
  3. §3.3 softened "expected" claims to explicit hypothesis language pending Checkpoint 2 calibration.
  4. §4.2.1 added: EVIDENCE-DELTA-SHORT-CIRCUIT heuristic named and formally stated. Equivalence-check semantics, cascade-scoping, use cases, and SME Checkpoint 3 validation requirement explicit.
  5. §4.3 promoted to named **Invariant PIPELINE-REACTIVE-DECOUPLING** with load-bearing flag. Explains why it is load-bearing (breaking it collapses §2). Spec commitment identified: update §3.3 or §8.3 before NA-1.4 Week 6 implementation. Future-proofing clause: any future "live cascade" feature must restate or reject.

- **v0.3-draft (2026-04-22):** §4.5 Mutation Sequence Termination added. Closes the sequence-level bound gap surfaced during Week 5 signoff; SME Week 5 identified the `applyMutationSequence` `<= |V|` rounds bound as extrapolated from §4.2 without a separate argument. §4.5 provides the argument. Four cuts produced iteratively:
  - Cut 1 (2026-04-21): skeleton.
  - Cut 2 (2026-04-22): concrete Φ potential function; V_active strict shrinkage moved to §4.5.1 cascade-local; three precise exclusions in §4.5.3.
  - Cut 3 (2026-04-22): trivial-cascade external bound added (`K + (|V| × (|D|-1))`) per SME Week 6 scrutiny; |D| forward-compatibility concern migrated to NA architecture commitments memory as commitment 4.
  - Cut 4 (2026-04-22, LOCKED): "no-op" wording replaced with DP-2 provenance preservation; "inheritance from Phase 1" reframed as shared D1.6-L7 principle with different operational triggers (Phase 1 round-count vs §4.5 |D|-ceiling); termination-mode framing (internal vs external termination); exclusion (4) on termination-vs-correctness orthogonality added per BFO SME combined review.
