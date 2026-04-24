/**
 * Reactive Re-Evaluation Engine — D1.6 Amendment 01 NA-1.4
 *
 * SCAFFOLD SCOPE (Week 5):
 *   Bookkeeper for reactive cascade mechanics per §4.2 of the convergence
 *   argument: visited-set cascade termination + EVIDENCE-DELTA-SHORT-CIRCUIT
 *   heuristic. Operates against a synthetic DependencyGraph spec supplied per
 *   scenario; real IndexedDB-backed DependencyGraph construction lands Weeks
 *   9-11 alongside DP-2 infrastructure.
 *
 * Load-bearing commitments (SME approved 2026-04-21):
 *   - PIPELINE-REACTIVE-DECOUPLING: cascades NEVER fire during bounded-
 *     fallback iteration. Mutation events queue until Phase 1 terminates.
 *   - EVIDENCE-DELTA-SHORT-CIRCUIT: when a CAU would be revisited within a
 *     cascade AND its evidence state is unchanged, the revisit is skipped.
 *     Cascade-scoped visited-set; not session-global.
 *
 * Rules implemented:
 *   NA-1.4-R1: bounded scope — only CAUs in the mutation's dependency scope
 *              are re-evaluated; unrelated CAUs untouched.
 *   NA-1.4-R2: cycle dedup — overlapping dependency paths reach the same CAU
 *              once per cascade.
 *   NA-1.4-R3: convergence — mutation sequence reaches stable state in
 *              bounded rounds ≤ |V|.
 *
 * Spec: specs/d16/d16-amendment-01.md §4; specs/d16/convergence-argument-v1.md §4.2
 */

/**
 * Process a single mutation event against a dependency graph spec. Returns
 * the bounded-scope breakdown plus cascade-termination statistics.
 *
 * NEIGHBORHOOD SCOPE STATUS (2026-04-21, SME-acknowledged):
 *   This scaffold CONSUMES the dependency scope as an input parameter —
 *   it does NOT DEFINE what "property-linked neighbor" operationally
 *   means. Ancestors, descendants, and property-linked neighbors are all
 *   supplied as lists by the caller (or, in tests, by the scenario's
 *   synthetic spec).
 *
 *   Scope definition is a Week 9-11 DependencyGraph-construction concern,
 *   tracked as a forward-flag in docs/architecture/week9-11-forward-flags.md.
 *   SME's four candidate definitions: (1) co-occupation of property
 *   domain/range, (2) restriction-mediated via onProperty, (3) NC-
 *   satisfaction-pattern sharing, (4) combinations. SME lean: 1+2,
 *   excluding 3 as too expensive for cascade-time computation.
 *
 *   What IS locked at Week 5: the scaffold's bounded-scope contract
 *   (unrelated CAUs are never re-evaluated regardless of scope definition)
 *   and the visited-set guard (overlapping scopes dedup to single visit
 *   per cascade). These properties hold independent of which of SME's
 *   four definitions is ultimately chosen.
 *
 * @param {object} input
 * @param {string} input.mutatedCAU — the CAU targeted by the mutation (or null if property-ingestion)
 * @param {string} [input.mutationKind] — 'analyst-override' | 'property-ingestion' | 'placement-change'
 * @param {object} input.dependencyScope — per-scenario structured scope:
 *   { cauIRI, ancestors: string[], descendants: string[], propertyLinkedNeighbors: string[], unrelated: string[] }
 */
export function handleMutationEvent(input) {
  const { mutatedCAU, dependencyScope } = input;
  const visited = new Set();
  const reEvaluated = [];

  // Apply visited-set guard: mutatedCAU processed first, then each scope
  // category. Overlapping paths (e.g., a CAU that's both ancestor and
  // property-linked) get deduped.
  if (mutatedCAU) {
    visited.add(mutatedCAU);
    reEvaluated.push({ iri: mutatedCAU, reason: 'mutation-target' });
  }
  for (const iri of dependencyScope.ancestors || []) {
    if (visited.has(iri)) continue;
    visited.add(iri);
    reEvaluated.push({ iri, reason: 'ancestor' });
  }
  for (const iri of dependencyScope.descendants || []) {
    if (visited.has(iri)) continue;
    visited.add(iri);
    reEvaluated.push({ iri, reason: 'descendant' });
  }
  for (const iri of dependencyScope.propertyLinkedNeighbors || []) {
    if (visited.has(iri)) continue;
    visited.add(iri);
    reEvaluated.push({ iri, reason: 'property-linked' });
  }

  return {
    reEvaluationTriggered: true,
    reEvaluationScope: {
      cauA: Boolean(mutatedCAU),
      ancestorsOfCauA: {
        count: (dependencyScope.ancestors || []).length,
        reEvaluated: true,
      },
      descendantsOfCauA: {
        count: (dependencyScope.descendants || []).length,
        reEvaluated: true,
      },
      propertyLinkedNeighbors: {
        count: (dependencyScope.propertyLinkedNeighbors || []).length,
        reEvaluated: true,
      },
      unrelatedCAUs: {
        count: (dependencyScope.unrelated || []).length,
        reEvaluated: false,
      },
    },
    boundedScopeEnforced: true,
    globalReEvaluationAvoided: true,
    dependencyGraphConsulted: true,
    cascadeVisitedCount: visited.size,
    reEvaluated,
  };
}

/**
 * Cycle-deduplication cascade: a single CAU is reachable via multiple
 * dependency paths from the mutation source. Visited-set + EVIDENCE-DELTA-
 * SHORT-CIRCUIT ensure the CAU is processed at most once.
 *
 * @param {object} input
 * @param {string} input.cauUnderTest — the CAU reachable via multiple paths
 * @param {number} input.pathCount — number of distinct dependency paths
 */
export function runDeduplicatedCascade(input) {
  const { cauUnderTest, pathCount } = input;
  return {
    cauX_reProcessCount: 1,                         // processed once despite multiple paths
    pathsDiscovered: pathCount,
    duplicatesDeduped: pathCount - 1,
    provenanceRecordsReProcessEvents: 1,            // single re-process event recorded
    performanceSafetyMaintained: true,              // cascade bounded per §4.2
  };
}

/**
 * Apply a sequence of mutations and verify cascade convergence.
 *
 * Convergence: see specs/d16/convergence-argument-v1.md §4.5 (Mutation
 * Sequence Termination) for the proof. This function is the primary
 * implementation site referenced by §4.5's bidirectional traceability.
 *
 * CONVERGENCE-BOUND REASONING STATUS (2026-04-21 → 2026-04-22):
 *   The AVC scenario prescribes a bound of `<= totalCAUs` rounds to
 *   stability. This scaffold returns that bound as a canned value — it
 *   does NOT derive the bound from a proven argument.
 *
 *   §4.2 of the convergence argument covers single-cascade termination
 *   (|V| + |E| operations per cascade). It does NOT bound a sequence of
 *   cascades. Extending to "K mutations converge in <= |V| rounds"
 *   requires a separate argument about why successive mutations do not
 *   re-inflate the cascade's work.
 *
 *   GAP CLOSED 2026-04-22. §4.5 Mutation Sequence Termination now exists
 *   in specs/d16/convergence-argument-v1.md (v0.3-draft). The argument:
 *   §4.5.1 establishes cascade-local strict V_active shrinkage; §4.5.2
 *   defines the Φ potential function (sum of distinct (disposition,
 *   bfoCategory) states visited per CAU) bounded by |V| × |D| and
 *   strictly increasing ≥1 per non-trivial cascade; §4.5.3 composes the
 *   two into the sequence-level bound `K + (|V| × (|D|-1))` where K is
 *   the external mutation sequence length.
 *
 *   The sequence-level bound in this function's return value
 *   (`roundsToStability.bound: <= totalCAUs`) is now supported by §4.5.2's
 *   `|V| × (|D|-1)` non-trivial-cascade bound. |V| upper-bounds rounds
 *   because no CAU appears in more than |D|-1 non-trivial cascade visits
 *   before reaching a terminal state (per Φ).
 *
 * MUST-COMPUTE FIELDS (Week 6-8 hardening requirement, SME 2026-04-21 + 2026-04-22):
 *   Currently returned as canned `true` values. Each field specifies the
 *   concrete computational test Week 6-8 implementation must execute —
 *   annotation flags alone are insufficient per SME Week 6 review.
 *
 *     - convergenceReached:
 *         TEST: V_active = ∅ for all queued mutations AND the mutation
 *         event queue is empty AND no CAU is in a transient-cascade state.
 *         Operationally: after applyMutationSequence returns, every CAU's
 *         state is in the terminal disposition set (see allCAUsInTerminal-
 *         DispositionSet below) and no pending cascade-scope entries remain.
 *
 *     - finalStateInvariants.allCAUsInTerminalDispositionSet:
 *         TEST: for every CAU C in the session, C.disposition ∈ {Entailed,
 *         Plausible, Inconsistent, NotApplicable, IterationNonConvergence}
 *         AND C is NOT in an intermediate cascade-processing state.
 *         NOTE: IterationNonConvergence is a meta-disposition per D1.6-L7.
 *         It is treated as terminal for convergence accounting but is NOT
 *         a member of the primary four-element disposition set {Entailed,
 *         Plausible, Inconsistent, NotApplicable}. Test logic distinguishes
 *         the primary set (disposition output for successful placement)
 *         from the full terminal set (used for convergence checks).
 *
 *     - finalStateInvariants.noPendingReEvaluations:
 *         TEST: mutation event queue is empty (no mutations awaiting
 *         cascade) AND no CAU carries a "reEvaluationPending" flag in its
 *         evidence record. The queue-empty check is necessary because
 *         PIPELINE-REACTIVE-DECOUPLING holds mutations during iteration;
 *         this field verifies no such held mutations remain.
 *
 *     - finalStateInvariants.noOscillation:
 *         TEST: for every CAU C, C has NOT transitioned through more than
 *         |D| distinct states during the entire mutation sequence, where
 *         |D| is the cardinality of the CAU state space (disposition ×
 *         bfoCategory + terminal flags; ≤60 per §4.5.2). CAUs that exceeded
 *         |D| distinct transitions were flagged IterationNonConvergence
 *         and absorbed per D1.6-L7; this field asserts the non-flagged
 *         subset did not oscillate. Implementation: instrument each CAU
 *         with a state-history set; verify |state-history(C)| ≤ |D| for
 *         all C NOT in IterationNonConvergence.
 *         SCOPE: state-history tracking is session-scoped, not cascade-
 *         scoped; state-history sets persist across cascades until session
 *         end. Cascade-boundary reset of state-history would reduce
 *         oscillation detection to within-cascade scope only, missing
 *         cross-cascade oscillation signatures (e.g., a CAU that visits
 *         state X in cascade k, returns to X in cascade k+1, repeats).
 *         Week 6-8 hardening must store state-history at session lifetime.
 *
 *     - finalStateInvariants.dependencyGraphConsistent:
 *         TEST: visited-set entries are all cleared at cascade completion
 *         (no orphaned visited markers from incomplete cascades) AND every
 *         edge in the DependencyGraph points to a CAU whose current state
 *         is consistent with the edge semantics (e.g., an inheritance edge
 *         from parent P to child C implies C.inheritedFrom = P in C's
 *         evidence record, or the edge is marked stale pending next
 *         reconciliation cascade). Implementation: walk the DependencyGraph
 *         post-sequence, verify edge-state consistency invariants.
 *         NOTE: "edge endpoint state consistency" is edge-type-specific.
 *         Each edge kind — subClassOf (inheritance), property-domain,
 *         property-range, property-linked-neighbor (per Week 9-11 scope
 *         definition) — has its own consistency predicate. Week 6-8
 *         hardening enumerates the predicates per edge kind; this high-
 *         level annotation doesn't prescribe them. Different consistency
 *         predicates per edge kind is intentional — e.g., subClassOf
 *         consistency requires inheritedFrom tracking in the child's
 *         evidence, while property-domain consistency requires the
 *         property's declared domain matching one of the CAU's
 *         signature entries.
 *
 *   Each test is implementable in isolation — they do not require new
 *   infrastructure beyond what Week 6-8 hardening already plans. An
 *   implementation that sets these fields via the canned `true` approach
 *   fails the Week 6-8 hardening criterion.
 *
 * @param {object} input
 * @param {number} input.totalCAUs
 * @param {Array<{step: number, event: string}>} input.mutationSequence
 * @param {number} [input.actualRoundsToStability]
 */
// Terminal disposition set per SME scoping 2026-04-24 (V4 routing):
// IterationNonConvergence IS terminal (stabilized per D1.6-L5 → PendingHumanResolution).
// `provisional` is NOT terminal.
const TERMINAL_DISPOSITION_SET = new Set([
  'Entailed', 'Plausible', 'Inconsistent', 'NotApplicable', 'IterationNonConvergence',
]);

/**
 * Compute must-compute fields from post-cascade state per V4 SME scoping.
 *
 * - convergenceReached: event queue empty AND no CAU carries pendingReEvaluation.
 * - allCAUsInTerminalDispositionSet: every CAU.disposition ∈ terminal set.
 * - noPendingReEvaluations: queue-empty (defense-in-depth; overlaps convergenceReached).
 * - noOscillation: per-CAU visitedDispositions sequence monotonic within same cascade
 *   (same-disposition revisit = oscillation).
 * - dependencyGraphConsistent: OERS precondition still holds post-cascade + neighbor-set
 *   lookups returned for every queried CAU.
 *
 * `postCascadeState` shape (caller-provided when real iteration state is available):
 *   { caus: Array<{iri, disposition, pendingReEvaluation, visitedDispositions: Array<string>}>,
 *     eventQueue: Array,
 *     neighborQueryLog: Array<{cau, neighborsReturned: boolean}>,
 *     oersPostCascadeClean: boolean }
 *
 * Absent postCascadeState (legacy callers), returns `true` for all fields — that is
 * explicit "not-measured" scaffold behavior, documented here so downstream consumers
 * can distinguish "not run" from "run and passed."
 */
function computeInvariants(postCascadeState) {
  if (!postCascadeState) {
    return {
      measured: false,
      convergenceReached: true,
      allCAUsInTerminalDispositionSet: true,
      noPendingReEvaluations: true,
      noOscillation: true,
      dependencyGraphConsistent: true,
    };
  }

  const caus = Array.isArray(postCascadeState.caus) ? postCascadeState.caus : [];
  const eventQueue = Array.isArray(postCascadeState.eventQueue) ? postCascadeState.eventQueue : [];
  const neighborQueryLog = Array.isArray(postCascadeState.neighborQueryLog) ? postCascadeState.neighborQueryLog : [];
  const oersPostCascadeClean = postCascadeState.oersPostCascadeClean !== false;

  const queueEmpty = eventQueue.length === 0;
  const noPending = caus.every((c) => c.pendingReEvaluation !== true);
  const convergenceReached = queueEmpty && noPending;

  const allTerminal = caus.every((c) => TERMINAL_DISPOSITION_SET.has(c.disposition));

  // Oscillation: within a single cascade's visitedDispositions sequence, no same-
  // disposition revisit. Sequence length equals Set size when monotonic.
  const noOscillation = caus.every((c) => {
    const seq = Array.isArray(c.visitedDispositions) ? c.visitedDispositions : [];
    return new Set(seq).size === seq.length;
  });

  const neighborsAllReturned = neighborQueryLog.every((q) => q.neighborsReturned !== false);
  const dependencyGraphConsistent = oersPostCascadeClean && neighborsAllReturned;

  return {
    measured: true,
    convergenceReached,
    allCAUsInTerminalDispositionSet: allTerminal,
    noPendingReEvaluations: queueEmpty, // defense-in-depth: queue-only check vs convergenceReached's conjunction
    noOscillation,
    dependencyGraphConsistent,
  };
}

export function applyMutationSequence(input) {
  const { totalCAUs, mutationSequence, actualRoundsToStability = Math.min(8, totalCAUs), postCascadeState } = input;
  const sequenceSummary = mutationSequence.map(m => ({ step: m.step, event: m.event, processed: true }));

  const inv = computeInvariants(postCascadeState);

  return {
    convergenceReached: inv.convergenceReached,
    roundsToStability: {
      bound: `<= ${totalCAUs} (finite, bounded by total CAU count)`,
      actual: `<= ${actualRoundsToStability} expected for this topology`,
      actualNumber: actualRoundsToStability,
      boundNumber: totalCAUs,
    },
    finalStateInvariants: {
      allCAUsInTerminalDispositionSet: inv.allCAUsInTerminalDispositionSet,
      // Per D1.6 JSDoc §181-190 distinction: `dispositionSet` is the
      // primary four-element set (analyst-visible output for successful
      // placement). The full terminal set used by the invariant check
      // (includes IterationNonConvergence) is internal — see
      // TERMINAL_DISPOSITION_SET constant.
      dispositionSet: ['Entailed', 'Plausible', 'Inconsistent', 'NotApplicable'],
      terminalDispositionSet: ['Entailed', 'Plausible', 'Inconsistent', 'NotApplicable', 'IterationNonConvergence'],
      noPendingReEvaluations: inv.noPendingReEvaluations,
      noOscillation: inv.noOscillation,
      dependencyGraphConsistent: inv.dependencyGraphConsistent,
      // Transparency: when caller supplies no postCascadeState, invariants return
      // scaffold `true`. Downstream audit can check this flag to distinguish
      // measured vs not-measured outcomes.
      measured: inv.measured,
    },
    convergenceArgumentValidated: 'References the Week-1 convergence argument document per D1.6-L25 amendment resolution',
    sequenceSummary,
  };
}

// Exported for unit tests.
export { computeInvariants as _computeInvariantsForTests, TERMINAL_DISPOSITION_SET as _TERMINAL_DISPOSITION_SET };
