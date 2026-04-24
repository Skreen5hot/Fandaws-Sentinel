/**
 * DP-2 Schema Validator — D1.6 §7.2 / §7.3 / §7.4
 *
 * Hand-rolled schema + shape-level content validator for canonical records.
 * No runtime dependencies per edge-canonical constraint.
 *
 * Enforces named invariants:
 *   I1  — Schema Gate: explanation + provenance + reproducibilityHash all
 *         present with top-level shape conforming to spec.
 *   I2a — Shape-Level Content Validation:
 *         - axiomEvidence non-empty (single-element floor for NotApplicable
 *           per DP-2.1.D3 lock)
 *         - iterationHistory non-empty (DP-2-R2)
 *         - hash field present + syntactically well-formed
 *         - validationState not terminal-`provisional` (per F3 resolution,
 *           NA architecture Commitment 2: provisional is in-flight only)
 *
 * I2b (hash-value correctness) is NOT enforced here — activates at DP-2.3.2.
 * The `_scaffold: true` sentinel on `reproducibilityHash` is the I2b bypass.
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §7.2-§7.5
 * Design: specs/d16/dp2-scaffolding-design-sketch.md §3 (DP-2.1)
 */

const VALID_DISPOSITIONS = new Set([
  'Entailed',
  'Plausible',
  'Inconsistent',
  'NotApplicable',
]);

const VALID_VALIDATION_STATES = new Set([
  'validated_no_conflict',
  'soft_conflict_detected',
  'hard_conflict_detected',
  'provisional',
  'not_inherited',
]);

const VALID_NOTAPPLICABLE_ROUTING = new Set([
  'automatic',
  'default_axiom_poor',
  'manual',
]);

const HEX64_RE = /^[0-9a-f]{64}$/;

/**
 * Validate a canonical record against DP-2 I1 (schema) + I2a (shape-level content).
 *
 * Returns `{ ok: true, errors: [] }` on success, or
 *         `{ ok: false, errors: [...] }` with structured error entries.
 *
 * Each error has shape: `{ rule, path, message }`.
 *   - rule: the DP-2 rule citation (e.g. 'DP-2-R1', 'DP-2-I2a')
 *   - path: dot-notation path to the offending field
 *   - message: human-readable error with rule citation suitable for
 *              propagation to DP2NonConformanceError
 *
 * @param {object} record
 * @returns {{ok: boolean, errors: Array<{rule: string, path: string, message: string}>}}
 */
export function validateCanonicalRecord(record) {
  const errors = [];

  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    errors.push({
      rule: 'DP-2-I1',
      path: '',
      message: 'DP-2 non-conformant: record must be a non-null object.',
    });
    return { ok: false, errors };
  }

  if (!('disposition' in record)) {
    errors.push({
      rule: 'DP-2-I1',
      path: 'disposition',
      message: 'DP-2 non-conformant: disposition field missing. Canonical records require disposition to route I2a validation.',
    });
  } else if (!VALID_DISPOSITIONS.has(record.disposition)) {
    errors.push({
      rule: 'DP-2-I1',
      path: 'disposition',
      message: `DP-2 non-conformant: disposition must be one of Entailed | Plausible | Inconsistent | NotApplicable. Got: ${JSON.stringify(record.disposition)}.`,
    });
  }

  validateExplanation(record, errors);
  validateProvenance(record, errors);
  validateReproducibilityHash(record, errors);

  return { ok: errors.length === 0, errors };
}

function validateExplanation(record, errors) {
  if (!('explanation' in record)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation',
      message: 'DP-2 non-conformant: explanation field missing. Rule DP-2-R1 enforces mandatory explanation on all canonical records.',
    });
    return;
  }

  const e = record.explanation;
  if (e === null || typeof e !== 'object' || Array.isArray(e)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation',
      message: 'DP-2 non-conformant: explanation must be a non-null object.',
    });
    return;
  }

  if (typeof e.dispositionReason !== 'string' || e.dispositionReason.length === 0) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.dispositionReason',
      message: 'DP-2 non-conformant: explanation.dispositionReason must be a non-empty string.',
    });
  }

  if (!Array.isArray(e.axiomEvidence)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.axiomEvidence',
      message: 'DP-2 non-conformant: explanation.axiomEvidence must be an array.',
    });
  } else if (e.axiomEvidence.length === 0) {
    errors.push({
      rule: 'DP-2-I2a',
      path: 'explanation.axiomEvidence',
      message: `DP-2 non-conformant: explanation.axiomEvidence is empty. §7.5 Content Validation requires non-empty evidence list${record.disposition === 'NotApplicable' ? ' (NotApplicable: single-element floor per DP-2.1.D3 naming the routing trigger)' : ''}.`,
    });
  }

  if (!Array.isArray(e.reasoningSteps)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.reasoningSteps',
      message: 'DP-2 non-conformant: explanation.reasoningSteps must be an array (may be empty).',
    });
  }

  if (!Array.isArray(e.alternativesConsidered)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.alternativesConsidered',
      message: 'DP-2 non-conformant: explanation.alternativesConsidered must be an array (may be empty).',
    });
  }

  if (!('validationState' in e)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.validationState',
      message: 'DP-2 non-conformant: explanation.validationState is required (v1.1.0 schema discipline §7.2).',
    });
  } else if (!VALID_VALIDATION_STATES.has(e.validationState)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.validationState',
      message: `DP-2 non-conformant: explanation.validationState must be one of validated_no_conflict | soft_conflict_detected | hard_conflict_detected | provisional | not_inherited. Got: ${JSON.stringify(e.validationState)}.`,
    });
  } else if (e.validationState === 'provisional') {
    errors.push({
      rule: 'DP-2-I2a',
      path: 'explanation.validationState',
      message: 'DP-2 non-conformant: explanation.validationState is terminal-`provisional` at persist time. Per NA architecture Commitment 2 (F3 resolution), `provisional` is reconciliation-pending and in-flight only — NA-1.2 must complete before the record is persisted. A persisted record with validationState=provisional means NA-1.2 never ran and is a defect.',
    });
  }

  if (!('conflictAnnotation' in e)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.conflictAnnotation',
      message: 'DP-2 non-conformant: explanation.conflictAnnotation is required; set to null for CAUs with no conflict.',
    });
  } else if (e.conflictAnnotation !== null && (typeof e.conflictAnnotation !== 'object' || Array.isArray(e.conflictAnnotation))) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.conflictAnnotation',
      message: 'DP-2 non-conformant: explanation.conflictAnnotation must be null or an object.',
    });
  }

  if (!Array.isArray(e.reconciliationHistory)) {
    errors.push({
      rule: 'DP-2-R1',
      path: 'explanation.reconciliationHistory',
      message: 'DP-2 non-conformant: explanation.reconciliationHistory must be an array (may be empty).',
    });
  }
}

function validateProvenance(record, errors) {
  if (!('provenance' in record)) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance',
      message: 'DP-2 non-conformant: provenance field missing. Rule DP-2-R2 enforces mandatory provenance on all canonical records.',
    });
    return;
  }

  const p = record.provenance;
  if (p === null || typeof p !== 'object' || Array.isArray(p)) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance',
      message: 'DP-2 non-conformant: provenance must be a non-null object.',
    });
    return;
  }

  if (typeof p.sessionId !== 'string' || p.sessionId.length === 0) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.sessionId',
      message: 'DP-2 non-conformant: provenance.sessionId must be a non-empty string.',
    });
  }

  if (!Array.isArray(p.iterationHistory)) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.iterationHistory',
      message: 'DP-2 non-conformant: provenance.iterationHistory must be an array.',
    });
  } else if (p.iterationHistory.length === 0) {
    errors.push({
      rule: 'DP-2-I2a',
      path: 'provenance.iterationHistory',
      message: 'DP-2 non-conformant: provenance.iterationHistory is empty. §7.5 Content Validation requires at least one iteration history entry (round 0 present even for single-pass sessions).',
    });
  }

  if (!Array.isArray(p.crossCAUInfluences)) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.crossCAUInfluences',
      message: 'DP-2 non-conformant: provenance.crossCAUInfluences must be an array (may be empty).',
    });
  }

  if (!Array.isArray(p.propertyAlignmentsConsumed)) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.propertyAlignmentsConsumed',
      message: 'DP-2 non-conformant: provenance.propertyAlignmentsConsumed must be an array (may be empty).',
    });
  }

  if (p.reasonerState === null || typeof p.reasonerState !== 'object' || Array.isArray(p.reasonerState)) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.reasonerState',
      message: 'DP-2 non-conformant: provenance.reasonerState must be an object.',
    });
  }

  if (typeof p.authorTimestamp !== 'string' || p.authorTimestamp.length === 0) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.authorTimestamp',
      message: 'DP-2 non-conformant: provenance.authorTimestamp must be a non-empty ISO-8601 string.',
    });
  }

  if (typeof p.compatibilityDegraded !== 'boolean') {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.compatibilityDegraded',
      message: 'DP-2 non-conformant: provenance.compatibilityDegraded must be boolean.',
    });
  }

  if (!('analystOverride' in p)) {
    errors.push({
      rule: 'DP-2-R2',
      path: 'provenance.analystOverride',
      message: 'DP-2 non-conformant: provenance.analystOverride is required (boolean or override-details object).',
    });
  }
}

function validateReproducibilityHash(record, errors) {
  if (!('reproducibilityHash' in record)) {
    errors.push({
      rule: 'DP-2-R3',
      path: 'reproducibilityHash',
      message: 'DP-2 non-conformant: reproducibilityHash field missing. Rule DP-2-R3 enforces mandatory reproducibility hash on all canonical records.',
    });
    return;
  }

  const h = record.reproducibilityHash;
  if (h === null || typeof h !== 'object' || Array.isArray(h)) {
    errors.push({
      rule: 'DP-2-R3',
      path: 'reproducibilityHash',
      message: 'DP-2 non-conformant: reproducibilityHash must be a non-null object.',
    });
    return;
  }

  if (h.algorithm !== 'SHA-256') {
    errors.push({
      rule: 'DP-2-R3',
      path: 'reproducibilityHash.algorithm',
      message: `DP-2 non-conformant: reproducibilityHash.algorithm must be "SHA-256". Got: ${JSON.stringify(h.algorithm)}.`,
    });
  }

  const isScaffold = h._scaffold === true;

  if (!Array.isArray(h.perRoundHashes)) {
    errors.push({
      rule: 'DP-2-R3',
      path: 'reproducibilityHash.perRoundHashes',
      message: 'DP-2 non-conformant: reproducibilityHash.perRoundHashes must be an array.',
    });
  } else {
    h.perRoundHashes.forEach((entry, i) => {
      validatePerRoundHashEntry(entry, i, isScaffold, errors);
    });
  }

  if (h.finalHash === null || typeof h.finalHash !== 'object' || Array.isArray(h.finalHash)) {
    errors.push({
      rule: 'DP-2-R3',
      path: 'reproducibilityHash.finalHash',
      message: 'DP-2 non-conformant: reproducibilityHash.finalHash must be an object.',
    });
  } else {
    validateFinalHash(h.finalHash, isScaffold, errors);
  }
}

function validatePerRoundHashEntry(entry, idx, isScaffold, errors) {
  const path = `reproducibilityHash.perRoundHashes[${idx}]`;

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push({
      rule: 'DP-2-R3',
      path,
      message: `DP-2 non-conformant: ${path} must be an object.`,
    });
    return;
  }

  if (typeof entry.round !== 'number' || !Number.isInteger(entry.round) || entry.round < 0) {
    errors.push({
      rule: 'DP-2-R3',
      path: `${path}.round`,
      message: `DP-2 non-conformant: ${path}.round must be a non-negative integer.`,
    });
  }

  validateHashString(entry.hash, `${path}.hash`, isScaffold, errors);

  if (!Array.isArray(entry.inputsHashed)) {
    errors.push({
      rule: 'DP-2-R3',
      path: `${path}.inputsHashed`,
      message: `DP-2 non-conformant: ${path}.inputsHashed must be an array.`,
    });
  }
}

function validateFinalHash(fh, isScaffold, errors) {
  validateHashString(fh.hash, 'reproducibilityHash.finalHash.hash', isScaffold, errors);

  if (fh.authoritative !== true) {
    errors.push({
      rule: 'DP-2-R3',
      path: 'reproducibilityHash.finalHash.authoritative',
      message: 'DP-2 non-conformant: reproducibilityHash.finalHash.authoritative must be true.',
    });
  }

  if (!Array.isArray(fh.inputsHashed)) {
    errors.push({
      rule: 'DP-2-R3',
      path: 'reproducibilityHash.finalHash.inputsHashed',
      message: 'DP-2 non-conformant: reproducibilityHash.finalHash.inputsHashed must be an array.',
    });
  }
}

function validateHashString(hash, path, isScaffold, errors) {
  if (typeof hash !== 'string' || hash.length === 0) {
    errors.push({
      rule: 'DP-2-I2a',
      path,
      message: `DP-2 non-conformant: ${path} must be a non-empty string.`,
    });
    return;
  }
  if (!isScaffold && !HEX64_RE.test(hash)) {
    errors.push({
      rule: 'DP-2-I2a',
      path,
      message: `DP-2 non-conformant: ${path} must be 64-char lowercase hex. Scaffold records may use placeholder values tagged with reproducibilityHash._scaffold:true (interim I2b bypass token). Got: ${JSON.stringify(hash).slice(0, 80)}.`,
    });
  }
}

/**
 * Public helper: the set of valid NotApplicable routing mechanism values.
 * Closed enum in v1.0 per DP-2.2.D4 lock.
 */
export function validNotApplicableRoutingMechanisms() {
  return Array.from(VALID_NOTAPPLICABLE_ROUTING);
}
