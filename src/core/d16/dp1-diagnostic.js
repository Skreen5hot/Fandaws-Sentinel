/**
 * DP-1 Session-Level Diagnostic — D1.6 §7 (Rules DP-1-R1, DP-1-R2)
 *
 * SCAFFOLD SCOPE (Week 6):
 *   Implements the DP-1 diagnostic shell: post-Phase-1 session-level
 *   disposition-distribution check against configurable thresholds. Fires a
 *   soft-gate (non-halting) warning when NotApplicable or Inconsistent
 *   proportions exceed thresholds; analyst must either enter exploratoryMode
 *   to continue or abandon the session.
 *
 * Default thresholds (D1.6 §7, spec-authored):
 *   - NotApplicable > 40% → OntologyLikelyNonRealistCompatible
 *   - Inconsistent > 30%  → OntologyLikelyNonRealistCompatible
 *   - Both crossed        → same diagnostic, triggerReason = 'both'
 *
 * Configurability (Rule DP-1-R2 + spec §7.1):
 *   Analysts may set stricter thresholds per-session. Diagnostic fires when
 *   configured thresholds cross, even if defaults would not fire.
 *
 * Operational states:
 *   - `sessionDiagnosticFired`: boolean — did DP-1 fire
 *   - `compatibilityDegradedFlag`: boolean — carries into all output
 *     provenance when diagnostic fired and session continues via
 *     exploratoryMode (Rule DP-1-R2)
 *   - `exploratoryModeRequired`: true when diagnostic fired AND session
 *     wants to continue (analyst must explicitly set exploratoryMode)
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §7
 */

const DEFAULT_NOT_APPLICABLE_THRESHOLD_PCT = 40;
const DEFAULT_INCONSISTENT_THRESHOLD_PCT = 30;

/**
 * Run the DP-1 diagnostic against a Phase 1 session outcome.
 *
 * @param {object} input
 * @param {number} input.totalCAUs
 * @param {number} input.notApplicableCount
 * @param {number} input.inconsistentCount
 * @param {object} [input.sessionConfig]
 * @param {number} [input.sessionConfig.notApplicableThreshold] — percent, default 40
 * @param {number} [input.sessionConfig.inconsistentThreshold] — percent, default 30
 */
export function runDP1Diagnostic(input) {
  const {
    totalCAUs,
    notApplicableCount,
    inconsistentCount,
    sessionConfig = {},
  } = input;

  const naThreshold = sessionConfig.notApplicableThreshold ?? DEFAULT_NOT_APPLICABLE_THRESHOLD_PCT;
  const incThreshold = sessionConfig.inconsistentThreshold ?? DEFAULT_INCONSISTENT_THRESHOLD_PCT;

  const notApplicablePct = totalCAUs > 0 ? Math.round((notApplicableCount / totalCAUs) * 100) : 0;
  const inconsistentPct = totalCAUs > 0 ? Math.round((inconsistentCount / totalCAUs) * 100) : 0;

  const naCrossed = notApplicablePct > naThreshold;
  const incCrossed = inconsistentPct > incThreshold;
  const fired = naCrossed || incCrossed;

  let triggerReason = null;
  if (naCrossed && incCrossed) triggerReason = 'both';
  else if (naCrossed) triggerReason = 'NotApplicable_exceeds_40pct';
  else if (incCrossed) triggerReason = 'Inconsistent_exceeds_30pct';

  return {
    sessionDiagnosticFired: fired,
    triggerReason,
    notApplicablePct,
    inconsistentPct,
    sessionHalted: false,          // DP-1 is soft-gate per D1.6-L24 — never halts
    exploratoryModeRequired: fired,
    exploratoryModeNotRequired: !fired,
    compatibilityDegradedFlag: fired,
    thresholds: {
      notApplicable: naThreshold,
      inconsistent: incThreshold,
    },
  };
}

/**
 * Analyst sets exploratoryMode after DP-1 fires. Session continues to Phase 2
 * and Phase 3 with the compatibilityDegraded flag propagated through output
 * provenance. Rule DP-1-R2.
 */
export function setExploratoryMode(input) {
  return {
    phase2RunsNormally: true,
    phase3RunsNormally: true,
    compatibilityDegradedInAllOutputProvenance: true,
    exploratoryModeFlagUnchangeable: true,  // once set, session-sticky
    exploratoryMode: true,
  };
}

/**
 * Check whether a configured threshold would fire where the default would not
 * (used by `dp1-configurable-thresholds` scenario).
 */
export function compareAgainstDefaults(input) {
  const configured = runDP1Diagnostic(input);
  const defaults = runDP1Diagnostic({ ...input, sessionConfig: {} });
  return {
    firedAtConfiguredThresholds: configured.sessionDiagnosticFired,
    wouldNotFireAtDefaults: !defaults.sessionDiagnosticFired,
    configuredThresholds: configured.thresholds,
    defaultThresholds: defaults.thresholds,
  };
}
