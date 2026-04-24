# §4.5 Mutation Sequence Termination — Fourth Cut (LOCKED)

**Status:** FOURTH CUT — LOCKED 2026-04-22 after combined SME review (primary SME + BFO SME). Ready to merge into `convergence-argument-v1.md`.
**Revises:** third cut 2026-04-22 with four targeted tightenings: (1) "no-op" wording replaced to preserve DP-2 provenance obligation; (2) "inheritance from Phase 1" reframed as shared L7 principle with different operational triggers (round-count vs |D|-ceiling); (3) new termination-mode framing paragraph (internal vs external termination); (4) new exclusion on termination vs semantic correctness orthogonality.
**Target:** paragraph-length companion claim to [convergence-argument-v1.md §4.2](convergence-argument-v1.md#42-the-guard).
**Section number:** §4.5 standalone — confirmed by SME lean 2026-04-21 (mutation sequence is compositional argument over independent cascades, not a refinement of single-cascade behavior).
**|D| forward-compatibility concern:** moved out of §4.5.3 to NA architecture commitments memory per SME guidance 2026-04-22 (proof doesn't carry forward-compat concerns; governing architectural document does).

---

## Draft text

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
- Implementation surface: `applyMutationSequence` in [src/core/d16/reactive-engine.js](../../src/core/d16/reactive-engine.js) (function header references this section when finalized).
- Load-bearing dependencies: [§4.2 Cascade-termination bound](convergence-argument-v1.md#42-the-guard), [§4.2.1 EVIDENCE-DELTA-SHORT-CIRCUIT](convergence-argument-v1.md#421-heuristic-evidence-delta-short-circuit-sme-specified), [§4.3 PIPELINE-REACTIVE-DECOUPLING invariant](convergence-argument-v1.md#43-interaction-with-iterative-pipeline).
- Applies D1.6-L7's general principle (CAU-specific convergence failure handling) to the sequence-level context. Phase 1 applies L7 at bounded-fallback iteration termination (round-count trigger); §4.5 applies L7 at state-space exhaustion during reactive cascades (|D|-ceiling trigger, per §4.5.2 and the `noOscillation` annotation in `src/core/d16/reactive-engine.js`).

---

## Developer notes on this cut

**Changes from first cut (responding to SME Week 6 scrutiny):**

1. **Monotonic quantity is now concrete.** Φ = sum of distinct states visited per CAU. This is strictly monotonic (never decreases), bounded above by `|V| × |D|`, and provably increases by ≥1 per non-trivial cascade. The first cut hand-waved "monotonic progress"; this cut specifies the quantity.

2. **V_active strict shrinkage is now stated at §4.5.1 cascade-local level, not sequence-level.** SME's question was "why does V_active strictly shrink (not merely not grow)?" The answer: within a single cascade, V_active strictly shrinks because every cascade step removes a CAU from V_active (either processing or short-circuiting it) and the visited-set guard prevents reintroduction. At the sequence level, V_active doesn't strictly shrink — new mutations reintroduce CAUs — so the sequence-level argument uses Φ instead. §4.5.1 and §4.5.2 compose: cascade-local shrinkage terminates each cascade, sequence-level Φ-growth bounds the cascade count.

3. **"What this bound does not guarantee" is now three precise exclusions with concrete mitigation paths for each.** First cut was loose; this cut states exactly what holds, what doesn't, and what handles each gap.

4. **Adversarial oscillation is handled via explicit D1.6-L7 inheritance.** First cut asserted IterationNonConvergence handles oscillation without showing how; this cut states the Property 3 mechanism: oscillating CAUs reach IterationNonConvergence (a new state, counted in Φ), which is absorbing, which caps the oscillation's cascade-count contribution.

**Two flagged questions from first cut:**

- **Oscillation-handling inheritance from D1.6-L7.** SME Week 6 read: "IterationNonConvergence is a per-CAU disposition that persists across the sequence (once a CAU hits that state in cascade K, it stays there in cascade K+1 unless explicitly reconciled)." This cut encodes that read in Property 3: IterationNonConvergence is an absorbing terminal state, counted once in Φ, and prevents further cascade processing of the CAU. Explicit reconciliation (analyst override) would restart the CAU's state progression, but that's a new mutation with its own bounded cascade — not a violation of the sequence-level argument. **Confirm this read matches SME intent.**

- **Section numbering §4.5 standalone vs §4.3.1 nested.** SME lean: §4.5 standalone because the sequence claim is compositional over independent cascades, not a refinement of single-cascade behavior. Second-cut draft uses §4.5 standalone per this lean. **No further question.**

**|D| forward-compatibility concern:** moved to NA architecture commitments memory per SME guidance 2026-04-22. The proof's job is to prove termination under current |D|. Forward-compatibility concerns about amendment-driven |D| expansion belong in the governing architectural document where amendment proposers will consult before drafting. New commitment 4 in `project_d16_na_architecture_commitments.md` locks the (disposition, bfoCategory) state-space cardinality as load-bearing for §4.5 convergence bounds, parallel to commitment 2's locking-on-validation-state expansion.
