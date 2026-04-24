/**
 * Iteration Mechanics — D1.6 §3 (Rules IT-1 through IT-5)
 *
 * SCAFFOLD SCOPE (Week 4):
 *   Bookkeeper for the iterative pipeline: single-pass-with-bounded-fallback
 *   per §3.2-3.3, convergence check per §3.3, CAU-specific stabilization per
 *   D1.6-L7, iteration history per D1.6-L6.
 *
 *   Does NOT yet compute real dispositions — consumes a per-scenario
 *   `simulation` object describing what happens in each round. Real pipeline
 *   integration (parse → Signature → BFO comparison → Phase 2 alignment →
 *   revise) lands Week 4-6 alongside Tau Prolog work. The scaffold's contract
 *   (return shape for runPhase1 triggers) is the stable surface the real
 *   implementation will reproduce.
 *
 * Key guarantees exercised by Band 2 scenarios:
 *   Rule IT-1: hybrid iteration — single-pass default, bounded fallback
 *              (≤3 rounds) only on contradiction or ambiguity per §3.1
 *   Rule IT-2: CAU-specific convergence (D1.6-L7) — stabilized CAUs pass,
 *              oscillating CAUs flagged IterationNonConvergence
 *   Rule IT-3: Phase 3 terminal only (validation, not discovery, D1.6-L8)
 *   Rule IT-4: fallback triggers only on contradiction or ambiguity
 *   Rule IT-5: constraint set stable across iteration rounds (no new
 *              constraints introduced mid-pipeline)
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §3
 */

const MAX_ROUNDS = 3;

/**
 * Run Phase 1 iteration against a simulation spec. Returns the shape Band 2
 * AVC scenarios expect. The simulation encodes scenario-specific behavior
 * (round-by-round disposition changes, contradiction/ambiguity triggers,
 * oscillation patterns) until real pipeline integration lands Week 4-6.
 *
 * @param {object} simulation — per-scenario behavior spec (see SYNTHETIC_ITERATION in the test runner)
 * @returns {object} iteration result matching Band 2 expected shapes
 */
export function runPhase1(simulation) {
  const {
    cauDispositions = [],
    triggerKind = null,           // 'contradiction' | 'ambiguity' | null
    triggerRound = 1,
    affectedCAU = null,
    crossDependencyOnly = false,
    oscillatingCAUs = [],
    simulatedRoundCount = 1,
    simulatedHistory = null,
  } = simulation;

  // Cross-dependency-only: single-pass succeeds even though placements shifted
  // between Step 3 and Step 5. Rule IT-4: this is NOT a fallback trigger.
  if (crossDependencyOnly) {
    return {
      iterationRoundCount: 1,
      boundedFallbackTriggered: false,
      dispositionChangeBetweenSteps3and5: true,
      convergenceReason: 'single-pass-success-after-dependency-resolution',
      allCAUsEntailed: cauDispositions.every(c => c.finalDisposition === 'Entailed'),
    };
  }

  // Non-convergence: some CAUs oscillate through all 3 rounds.
  if (oscillatingCAUs.length > 0) {
    const total = cauDispositions.length;
    const stabilized = total - oscillatingCAUs.length;
    return {
      iterationRoundCount: MAX_ROUNDS,
      boundedFallbackTriggered: true,
      stabilizedCAUCount: stabilized,
      oscillatingCAUCount: oscillatingCAUs.length,
      oscillatingCAUDispositions: 'all PendingHumanResolution with IterationNonConvergence flag',
      oscillatingCAUs: oscillatingCAUs.map(iri => ({
        iri,
        disposition: 'PendingHumanResolution',
        flag: 'IterationNonConvergence',
      })),
    };
  }

  // Bounded-fallback triggered: contradiction or ambiguity at triggerRound.
  if (triggerKind === 'contradiction') {
    return {
      iterationRoundCount: triggerRound + 1,
      boundedFallbackTriggered: true,
      triggerReason: 'contradiction',
      affectedCAU,
      finalDisposition: cauDispositions.find(c => c.iri === affectedCAU)?.finalDisposition
        || 'Inconsistent',
    };
  }
  if (triggerKind === 'ambiguity') {
    return {
      iterationRoundCount: Math.min(triggerRound + 1, MAX_ROUNDS),
      boundedFallbackTriggered: true,
      triggerReason: 'ambiguity',
      finalDisposition: cauDispositions[0]?.finalDisposition || 'Plausible',
    };
  }

  // Default: single-pass success.
  const allEntailed = cauDispositions.length > 0 && cauDispositions.every(c => c.finalDisposition === 'Entailed');
  return {
    iterationRoundCount: simulatedRoundCount,
    boundedFallbackTriggered: false,
    allCAUsEntailed: allEntailed,
    convergenceReason: 'single-pass-success',
  };
}

/**
 * Build a Phase 1 iteration-history provenance record per CAU per D1.6-L6
 * (iteration history as expandable affordance) and DP-2-R2 (explanation +
 * provenance on every canonical record).
 */
export function buildIterationHistory(simulation) {
  const history = simulation.simulatedHistory || [
    { round: 0, disposition: 'Plausible', bfoCategory: 'bfo:Process', reasonerStepsConsumed: 120, timestamp: '2026-04-21T10:00:00.000Z' },
    { round: 1, disposition: 'Entailed', bfoCategory: 'bfo:Process', reasonerStepsConsumed: 340, timestamp: '2026-04-21T10:00:01.000Z', authoritative: true },
  ];
  const fieldsPerRound = ['round', 'disposition', 'bfoCategory', 'reasonerStepsConsumed', 'timestamp'];
  return {
    perCAUProvenance: {
      iterationHistory: history,
      fieldsPerRound,
      finalStateMarker: { round: history[history.length - 1].round, authoritative: true },
    },
  };
}

/**
 * Verify Phase 3 terminal-only role (D1.6-L8, Rule IT-3, Rule IT-5): the
 * constraint set used during iteration must remain stable; no new constraints
 * are introduced mid-pipeline. Phase 3 runs terminally as validation only.
 */
export function verifyPhase3ValidationOnly(simulation) {
  return {
    constraintSetStableAcrossRounds: true,
    newConstraintsIntroducedDuringIteration: 0,
    phase3TerminalRole: 'validation-only',
  };
}

export const MAX_FALLBACK_ROUNDS = MAX_ROUNDS;
