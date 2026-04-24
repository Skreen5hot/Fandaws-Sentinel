/**
 * Provenance Builder — D1.6 §7.3.
 *
 * Produces the §7.3 provenance shape for canonical records. DP-2-R2 requires
 * every canonical record to carry provenance with at least one iteration
 * history entry.
 *
 * Consumes:
 *   - session state: sessionId, compatibilityDegraded (DP-1 sticky flag)
 *   - iteration state: rounds[] with per-round reasoner state snapshot
 *   - cross-CAU influence records (explicit callback per D2.2 lock)
 *   - property-alignment records (Phase 2 iteration feedback)
 *   - override info (analyst override with originalDisposition)
 *
 * Per Band 6 scenario `dp2-provenance-iteration-history`, iteration history
 * entries MUST contain `{round, disposition, bfoCategory, reasonerStepsConsumed, timestamp}`.
 *
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §4.2
 * Decisions: D2.2 (explicit callback), D2.3 (single-writer reconciliationHistory)
 */

/**
 * Build a production provenance object satisfying DP-2-R2 + I2a.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {string} input.sessionId
 * @param {object} input.iterationState
 *   - rounds: Array<{round, disposition, bfoCategory, reasonerStepsConsumed, timestamp}>
 *   - crossCAUInfluences?: Array<{influencingCAU, influence}>
 *   - propertyAlignmentsConsumed?: Array<{property, alignedTo, round}>
 * @param {object} input.sessionState
 *   - compatibilityDegraded?: boolean (DP-1 sticky, from dp1-diagnostic session state)
 *   - backgroundTheoryVersion: string (bfoVersion + curatedVersion composite)
 * @param {object} [input.overrideInfo]
 *   - analystOverride: true | false | object (override details)
 *   - originalDisposition?: string (pre-override disposition)
 * @param {string} [input.authorTimestamp] - defaults to new Date().toISOString()
 * @returns {object} provenance per §7.3
 */
export function buildProvenance({
  cauIRI,
  sessionId,
  iterationState,
  sessionState,
  overrideInfo,
  authorTimestamp,
}) {
  if (!sessionId) throw new TypeError('buildProvenance: sessionId is required.');
  if (!iterationState || !Array.isArray(iterationState.rounds)) {
    throw new TypeError('buildProvenance: iterationState.rounds must be an array.');
  }
  if (iterationState.rounds.length === 0) {
    throw new TypeError(
      'buildProvenance: iterationState.rounds must be non-empty (DP-2-R2 / I2a: round 0 required even for single-pass sessions).'
    );
  }

  const ts = authorTimestamp || new Date().toISOString();
  const iterationHistory = iterationState.rounds.map((r) => ({
    round: r.round,
    disposition: r.disposition,
    bfoCategory: r.bfoCategory ?? null,
    reasonerStepsConsumed: r.reasonerStepsConsumed ?? 0,
    timestamp: r.timestamp || ts,
  }));

  const totalSteps = iterationHistory.reduce(
    (sum, entry) => sum + (entry.reasonerStepsConsumed || 0),
    0,
  );
  const fallbackInvoked = iterationHistory.length > 1;

  const analystOverride = resolveOverrideField(overrideInfo);

  return {
    sessionId,
    iterationHistory,
    crossCAUInfluences: (iterationState.crossCAUInfluences || []).slice(),
    propertyAlignmentsConsumed: (iterationState.propertyAlignmentsConsumed || []).slice(),
    reasonerState: {
      backgroundTheoryVersion: sessionState?.backgroundTheoryVersion || 'unknown',
      stepCountConsumed: totalSteps,
      fallbackInvoked,
    },
    authorTimestamp: ts,
    compatibilityDegraded: sessionState?.compatibilityDegraded === true,
    analystOverride,
  };
}

function resolveOverrideField(overrideInfo) {
  if (!overrideInfo) return false;
  if (overrideInfo.analystOverride === true) {
    // Return the override-details object shape when originalDisposition is present.
    if (overrideInfo.originalDisposition) {
      return {
        analystOverride: true,
        originalDisposition: overrideInfo.originalDisposition,
      };
    }
    return true;
  }
  return false;
}

/**
 * Build a reconciliationHistory entry for emission by NA-1.3 cascade or
 * NA-1.4 reactive engine. Per D2.3 lock: single-writer, append-only, no
 * coalescing. F1 causal linkage: `causedBy` references a prior entry's
 * index when the writer knows causality at write time.
 *
 * @param {object} input
 * @param {object} input.priorPlacement  — {disposition, bfoCategory}
 * @param {string} input.triggeringEvent — 'parent_reconciliation' | 'property_ingestion' | 'analyst_override' | 'na14_mutation'
 * @param {object} input.updatedPlacement — {disposition, bfoCategory}
 * @param {number | null} [input.causedBy] — index of prior entry this was caused by (F1)
 * @param {string} [input.timestamp]
 * @returns {object} reconciliationHistory entry
 */
export function buildReconciliationEntry({
  priorPlacement,
  triggeringEvent,
  updatedPlacement,
  causedBy = null,
  timestamp,
}) {
  const VALID_TRIGGERS = new Set([
    'parent_reconciliation',
    'property_ingestion',
    'analyst_override',
    'na14_mutation',
  ]);
  if (!VALID_TRIGGERS.has(triggeringEvent)) {
    throw new TypeError(
      `buildReconciliationEntry: triggeringEvent must be one of {${Array.from(VALID_TRIGGERS).join(', ')}}. Got: ${JSON.stringify(triggeringEvent)}.`
    );
  }
  return {
    priorPlacement: { ...priorPlacement },
    triggeringEvent,
    updatedPlacement: { ...updatedPlacement },
    causedBy,
    timestamp: timestamp || new Date().toISOString(),
  };
}
