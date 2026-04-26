/**
 * Bucket C — OWL-DERIVED NC helpers (4 contract-drafted NCs).
 *
 * Per SME-D16-X6 memo §1 (LOCKED 2026-04-25) + implementation plan §4.1–4.4
 * (PO-confirmed reason enums 2026-04-25).
 *
 * Scope (Commit 2 of 4 staged commits):
 *   - ICNC2: cau_does_not_require_inheres_in
 *   - ICNC3: cau_does_not_require_concretizes
 *   - IENC2: cau_incompatible_with_matter_as_part
 *   - OccurrentNC2: cau_disjoint_with_continuant
 *
 * NOT in scope for Commit 2 (lands Commit 3):
 *   - MENC2 (`cau_consistent_with_spatial_and_matter`) — SME-drafted contract §4
 *   - ProcessNC3 (`cau_consistent_with_one_dim_temporal`) — SME-drafted contract §5
 *
 * Each helper:
 *   - Async; takes {prologSession, cauIRI, signature, ancestorChain}.
 *   - Tau Prolog primary path via tryDerivationWithFallback.
 *   - Structural-correspondence fallback fires on step-cap exhaustion.
 *   - Returns {result, reason, evidence, fallbackUsed, fallbackTrigger,
 *     groundsNC, helperIRI} per Wave 2 + X5 + X6 implementation-plan §4 shape.
 *   - Throws PrologSessionContractViolationError on substrate contract
 *     violations per feedback_throw_not_warn_enforcement.md.
 *
 * Architecture: structural fallbacks are intentionally simpler than the
 * Tau Prolog primary (literal restrictions only; no ancestor inheritance
 * walk in JS). Per X6 memo §3.3, fallback rate is observable signal —
 * if a CAU consistently triggers fallback, the Prolog body needs
 * simplification, not silent acceptance.
 */

import { tryDerivationWithFallback } from './bucket-c-prolog.js';

// ── Property IRI matchers ────────────────────────────────────────────

const BFO_INHERES_IN_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000052',
  'bfo:0000052',
  'bfo:inheresIn',
]);

const BFO_CONCRETIZES_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000058',
  'bfo:0000058',
  'bfo:concretizes',
]);

const BFO_HAS_CONTINUANT_PART_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000178',
  'bfo:0000178',
  'bfo:hasContinuantPart',
]);

const MATERIAL_ENTITY_SUBTREE = new Set([
  'bfo:MaterialEntity',
  // Production extensions (e.g., cco:Artifact descendants) covered via
  // the Tau Prolog primary path's is_subclass_of derivation; structural
  // fallback uses literal MaterialEntity match only.
]);

const CONTINUANT_SUBTREE = new Set([
  'bfo:Continuant',
  'bfo:IndependentContinuant',
  'bfo:MaterialEntity',
  'bfo:ImmaterialEntity',
  'bfo:Site',
  'bfo:SpecificallyDependentContinuant',
  'bfo:GenericallyDependentContinuant',
  'bfo:Role',
  'bfo:Disposition',
  'bfo:Function',
  'bfo:Quality',
]);

const OCCURRENT_SUBTREE = new Set([
  'bfo:Occurrent',
  'bfo:Process',
  'bfo:ProcessBoundary',
  'bfo:TemporalRegion',
  'bfo:OneDimensionalTemporalRegion',
  'bfo:ZeroDimensionalTemporalRegion',
]);

function matchesPropertyIRI(propertyIRI, iriSet) {
  return iriSet.has(propertyIRI);
}

function isInheresIn(iri) { return matchesPropertyIRI(iri, BFO_INHERES_IN_IRIS); }
function isConcretizes(iri) { return matchesPropertyIRI(iri, BFO_CONCRETIZES_IRIS); }
function isHasContinuantPart(iri) { return matchesPropertyIRI(iri, BFO_HAS_CONTINUANT_PART_IRIS); }

// ── Shared structural-fallback factories ─────────────────────────────

// Property-presence check across propertyRestrictionsAsDomain + existentialRestrictions.
// Returns true iff CAU literally declares any restriction on the property.
function signatureHasPropertyRestriction(cauSignature, propertyMatcher) {
  const inDomain = (cauSignature?.propertyRestrictionsAsDomain || [])
    .some(r => propertyMatcher(r.property));
  if (inDomain) return true;
  const inExistential = (cauSignature?.existentialRestrictions || [])
    .some(r => propertyMatcher(r.onProperty));
  return inExistential;
}

// ── ICNC2: cau_does_not_require_inheres_in ─────────────────────────

const ICNC2_QUERY = (cauIRI) =>
  `cau_has_property_restriction('${cauIRI}', 'bfo:inheresIn', _).`;

function icnc2StructuralFallback({ cauSignature }) {
  if (signatureHasPropertyRestriction(cauSignature, isInheresIn)) {
    return { result: false, reason: 'inheres_in_presence_structural' };
  }
  return { result: true, reason: 'inheres_in_absence_structural_fallback' };
}

/**
 * Helper for ICNC2 (OWL-DERIVED, IndependentContinuant).
 *
 * Predicate: `cau_does_not_require_inheres_in(CAU)` — IC subtree CAUs do
 * NOT require bfo:inheresIn (which is the SDC commitment). OWA-preserving
 * derivation via Tau Prolog: query for inheresIn presence (literal +
 * inherited); query failure → absence derived → result: true.
 */
export async function cauDoesNotRequireInheresIn(input) {
  return runOWADerivationHelper({
    nc: 'ICNC2',
    helperIRI: 'cau_does_not_require_inheres_in/1',
    presenceQuery: ICNC2_QUERY,
    structuralFallback: icnc2StructuralFallback,
    presenceReason: 'inheres_in_presence_derived',
    absenceReason: 'inheres_in_absence_derived',
    input,
  });
}

// ── ICNC3: cau_does_not_require_concretizes ────────────────────────

const ICNC3_QUERY = (cauIRI) =>
  `cau_has_property_restriction('${cauIRI}', 'bfo:concretizes', _).`;

function icnc3StructuralFallback({ cauSignature }) {
  if (signatureHasPropertyRestriction(cauSignature, isConcretizes)) {
    return { result: false, reason: 'concretizes_presence_structural' };
  }
  return { result: true, reason: 'concretizes_absence_structural_fallback' };
}

/**
 * Helper for ICNC3 (OWL-DERIVED, IndependentContinuant).
 *
 * Predicate: `cau_does_not_require_concretizes(CAU)` — IC subtree CAUs do
 * NOT require bfo:concretizes (which is the GDC commitment). Parallels
 * ICNC2 in shape per X6 memo §1.
 */
export async function cauDoesNotRequireConcretizes(input) {
  return runOWADerivationHelper({
    nc: 'ICNC3',
    helperIRI: 'cau_does_not_require_concretizes/1',
    presenceQuery: ICNC3_QUERY,
    structuralFallback: icnc3StructuralFallback,
    presenceReason: 'concretizes_presence_derived',
    absenceReason: 'concretizes_absence_derived',
    input,
  });
}

// ── IENC2: cau_incompatible_with_matter_as_part ────────────────────

const IENC2_QUERY = (cauIRI) =>
  `cau_has_material_continuant_part('${cauIRI}').`;

function ienc2StructuralFallback({ cauSignature, ancestorChain }) {
  // Per IENC2 contract structural-correspondence rule (signatures file +
  // X6 memo §1):
  //   Scan existentialRestrictions + universalRestrictions +
  //   propertyRestrictionsAsDomain for hasContinuantPart targets in
  //   MaterialEntity-subtree, OR ancestorChain contains MaterialEntity.
  const ancestorMaterial = (ancestorChain || []).some(a => MATERIAL_ENTITY_SUBTREE.has(a));
  if (ancestorMaterial) {
    return { result: false, reason: 'matter_as_part_presence_structural' };
  }

  const hasMaterialPart = [
    ...(cauSignature?.existentialRestrictions || []),
    ...(cauSignature?.universalRestrictions || []),
  ].some(r => isHasContinuantPart(r.onProperty) && MATERIAL_ENTITY_SUBTREE.has(r.someValuesFrom || r.allValuesFrom));

  const hasMaterialPartInDomain = (cauSignature?.propertyRestrictionsAsDomain || [])
    .some(r => isHasContinuantPart(r.property) && MATERIAL_ENTITY_SUBTREE.has(r.target));

  if (hasMaterialPart || hasMaterialPartInDomain) {
    return { result: false, reason: 'matter_as_part_presence_structural' };
  }

  return { result: true, reason: 'matter_as_part_absence_structural_fallback' };
}

/**
 * Helper for IENC2 (OWL-DERIVED, ImmaterialEntity).
 *
 * Predicate: `cau_incompatible_with_matter_as_part(CAU)` — ImmaterialEntity
 * is structurally incompatible with having matter as continuant part.
 * Tau Prolog query: `cau_has_material_continuant_part`; query failure →
 * absence derived → result: true.
 */
export async function cauIncompatibleWithMatterAsPart(input) {
  return runOWADerivationHelper({
    nc: 'IENC2',
    helperIRI: 'cau_incompatible_with_matter_as_part/1',
    presenceQuery: IENC2_QUERY,
    structuralFallback: ienc2StructuralFallback,
    presenceReason: 'matter_as_part_presence_derived',
    absenceReason: 'matter_as_part_absence_derived',
    input,
  });
}

// ── OccurrentNC2: cau_disjoint_with_continuant ─────────────────────

const OCCURRENT_NC2_QUERY = (cauIRI) =>
  `derivable_cau_disjoint_with('${cauIRI}', 'bfo:Continuant').`;

function occurrentNC2StructuralFallback({ ancestorChain }) {
  const hasContinuant = (ancestorChain || []).some(a => CONTINUANT_SUBTREE.has(a));
  if (hasContinuant) {
    return { result: false, reason: 'continuant_nc_satisfied' };
  }
  return { result: true, reason: 'disjointness_structural_fallback' };
}

/**
 * Helper for OccurrentNC2 (OWL-DERIVED, Occurrent).
 *
 * Predicate: `cau_disjoint_with_continuant(CAU)` — Occurrent subtree CAUs
 * are disjoint from Continuant per BFO 2020. Differs from the absence-based
 * trio (ICNC2/ICNC3/IENC2): query SUCCESS → disjointness derived → result:
 * true. Includes pre-check for multi-inheritance modeling anomaly per
 * implementation plan §4.5 (X5 contradiction-wins precedence).
 */
export async function cauDisjointWithContinuant(input) {
  const { prologSession, cauIRI, signature, ancestorChain = [] } = input;
  if (!prologSession) {
    throw new TypeError('cauDisjointWithContinuant: prologSession required (Bucket C OWA derivation)');
  }
  if (!signature) {
    throw new TypeError('cauDisjointWithContinuant: signature required');
  }

  // Multi-inheritance pre-check — modeling anomaly precedence per X5
  // contradiction-wins lock. CAU declaring both Continuant + Occurrent
  // ancestor routes to explicit-violation reason regardless of Prolog
  // outcome (which would falsely claim disjointness via Occurrent ancestor).
  const hasContinuantAncestor = ancestorChain.some(a => CONTINUANT_SUBTREE.has(a));
  const hasOccurrentAncestor = ancestorChain.some(a => OCCURRENT_SUBTREE.has(a));
  if (hasContinuantAncestor && hasOccurrentAncestor) {
    return {
      result: false,
      reason: 'disjointness_explicit_violation',
      evidence: {
        contradictingAncestors: {
          continuant: ancestorChain.find(a => CONTINUANT_SUBTREE.has(a)),
          occurrent: ancestorChain.find(a => OCCURRENT_SUBTREE.has(a)),
        },
      },
      fallbackUsed: false,
      fallbackTrigger: null,
      groundsNC: 'OccurrentNC2',
      helperIRI: 'cau_disjoint_with_continuant/1',
    };
  }

  const trial = await tryDerivationWithFallback({
    prologSession, cauIRI, cauSignature: signature, ancestorChain,
    queryString: OCCURRENT_NC2_QUERY(cauIRI),
    structuralFallback: occurrentNC2StructuralFallback,
  });

  if (trial.fallbackUsed) {
    return {
      result: trial.fallbackResult.result,
      reason: trial.fallbackResult.reason,
      evidence: { ancestorChain: ancestorChain.slice() },
      fallbackUsed: true,
      fallbackTrigger: trial.fallbackTrigger,
      groundsNC: 'OccurrentNC2',
      helperIRI: 'cau_disjoint_with_continuant/1',
    };
  }

  if (trial.derivedOutcome === 'succeeded') {
    return {
      result: true,
      reason: 'disjointness_derived',
      evidence: { ancestorChain: ancestorChain.slice() },
      fallbackUsed: false,
      fallbackTrigger: null,
      groundsNC: 'OccurrentNC2',
      helperIRI: 'cau_disjoint_with_continuant/1',
    };
  }

  // derivedOutcome === 'failed' — Prolog couldn't derive disjointness;
  // CAU is structurally on the Continuant side per BFO axioms.
  return {
    result: false,
    reason: 'continuant_nc_satisfied',
    evidence: { ancestorChain: ancestorChain.slice() },
    fallbackUsed: false,
    fallbackTrigger: null,
    groundsNC: 'OccurrentNC2',
    helperIRI: 'cau_disjoint_with_continuant/1',
  };
}

// ── Shared OWA-derivation runner ────────────────────────────────────

// Common shape for the absence-based NC trio (ICNC2/ICNC3/IENC2):
//   - Tau Prolog query checks for PRESENCE of the property/relation.
//   - Query SUCCESS → presence derived → NC unsatisfied.
//   - Query FAIL    → absence derived  → NC satisfied.
//   - Cap exhausted → structural fallback.
async function runOWADerivationHelper({
  nc, helperIRI, presenceQuery, structuralFallback,
  presenceReason, absenceReason, input,
}) {
  const { prologSession, cauIRI, signature, ancestorChain = [] } = input;
  if (!prologSession) {
    throw new TypeError(`${helperIRI}: prologSession required (Bucket C OWA derivation)`);
  }
  if (!signature) {
    throw new TypeError(`${helperIRI}: signature required`);
  }

  const trial = await tryDerivationWithFallback({
    prologSession, cauIRI, cauSignature: signature, ancestorChain,
    queryString: presenceQuery(cauIRI),
    structuralFallback,
  });

  if (trial.fallbackUsed) {
    return {
      result: trial.fallbackResult.result,
      reason: trial.fallbackResult.reason,
      evidence: { ancestorChain: ancestorChain.slice() },
      fallbackUsed: true,
      fallbackTrigger: trial.fallbackTrigger,
      groundsNC: nc,
      helperIRI,
    };
  }

  if (trial.derivedOutcome === 'succeeded') {
    // Presence derived → NC unsatisfied (CAU has the property).
    return {
      result: false,
      reason: presenceReason,
      evidence: { ancestorChain: ancestorChain.slice() },
      fallbackUsed: false,
      fallbackTrigger: null,
      groundsNC: nc,
      helperIRI,
    };
  }

  // Absence derived → NC satisfied.
  return {
    result: true,
    reason: absenceReason,
    evidence: { ancestorChain: ancestorChain.slice() },
    fallbackUsed: false,
    fallbackTrigger: null,
    groundsNC: nc,
    helperIRI,
  };
}

// ── §3.1 shared cau_consistent_with runner (Commit 3) ──────────────
//
// Extracted per implementation plan §3.1 (SME-approved 2026-04-25). MENC2
// and ProcessNC3 both invoke `cau_consistent_with(CAU, Property, Filler)`
// via the Tau Prolog helper rule `cau_admits_property_restriction/3`. The
// shared runner queries the Prolog rule with NC-specific filler and lets
// each NC's helper interpret the outcome.

const PROCESS_SUBTREE = new Set([
  'bfo:Process',
  // Production extensions (cco:PlanExecution, etc.) covered via Tau Prolog
  // is_subclass_of derivation; structural pre-check uses literal Process only.
]);

const BFO_OCCUPIES_TEMPORAL_REGION_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000196',
  'bfo:0000196',
  'bfo:occupiesTemporalRegion',
]);

const BFO_ONE_DIM_TR_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000038',
  'bfo:0000038',
  'bfo:OneDimensionalTemporalRegion',
]);

const BFO_ZERO_DIM_TR_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000148',
  'bfo:0000148',
  'bfo:ZeroDimensionalTemporalRegion',
]);

const BFO_TEMPORAL_REGION_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000008',
  'bfo:0000008',
  'bfo:TemporalRegion',
]);

const BFO_OCCUPIES_SPATIAL_REGION_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000171',
  'bfo:0000171',
  'bfo:occupiesSpatialRegion',
]);

function isOccupiesTemporalRegion(iri) { return BFO_OCCUPIES_TEMPORAL_REGION_IRIS.has(iri); }
function isOneDimTR(iri) { return BFO_ONE_DIM_TR_IRIS.has(iri); }
function isZeroDimTR(iri) { return BFO_ZERO_DIM_TR_IRIS.has(iri); }
function isTemporalRegion(iri) { return BFO_TEMPORAL_REGION_IRIS.has(iri); }
function isOccupiesSpatialRegion(iri) { return BFO_OCCUPIES_SPATIAL_REGION_IRIS.has(iri); }

// ── MENC2: cau_consistent_with_spatial_and_matter (Commit 3) ──────

const MENC2_SPATIAL_QUERY = (cauIRI) =>
  `cau_admits_property_restriction('${cauIRI}', 'bfo:occupiesSpatialRegion', _).`;
const MENC2_MATTER_QUERY = (cauIRI) =>
  `cau_has_continuant_part_chain_terminating_in_material('${cauIRI}').`;

function menc2SpatialStructural({ cauSignature, ancestorChain }) {
  const ancestorMaterial = (ancestorChain || []).some(a => MATERIAL_ENTITY_SUBTREE.has(a));
  if (ancestorMaterial) return true;
  const inDomain = (cauSignature?.propertyRestrictionsAsDomain || [])
    .some(r => isOccupiesSpatialRegion(r.property));
  if (inDomain) return true;
  const inExistential = (cauSignature?.existentialRestrictions || [])
    .some(r => isOccupiesSpatialRegion(r.onProperty));
  return inExistential;
}

function menc2MatterStructural({ cauSignature, ancestorChain }) {
  const ancestorMaterial = (ancestorChain || []).some(a => MATERIAL_ENTITY_SUBTREE.has(a));
  if (ancestorMaterial) return true;
  const hasMaterialPart = [
    ...(cauSignature?.existentialRestrictions || []),
    ...(cauSignature?.universalRestrictions || []),
  ].some(r => isHasContinuantPart(r.onProperty) && MATERIAL_ENTITY_SUBTREE.has(r.someValuesFrom || r.allValuesFrom));
  if (hasMaterialPart) return true;
  const hasMaterialPartInDomain = (cauSignature?.propertyRestrictionsAsDomain || [])
    .some(r => isHasContinuantPart(r.property) && MATERIAL_ENTITY_SUBTREE.has(r.target));
  return hasMaterialPartInDomain;
}

function menc2StructuralFallback({ cauSignature, ancestorChain }) {
  const spatialOk = menc2SpatialStructural({ cauSignature, ancestorChain });
  if (!spatialOk) {
    return { result: false, reason: 'spatial_consistency_failed' };
  }
  const matterOk = menc2MatterStructural({ cauSignature, ancestorChain });
  if (!matterOk) {
    return { result: false, reason: 'matter_constitution_failed' };
  }
  return { result: true, reason: 'spatial_and_matter_structural_fallback' };
}

/**
 * Helper for MENC2 (OWL-DERIVED, MaterialEntity).
 * SME-drafted contract per X6 memo §4.
 *
 * Two-conjunct predicate. Failure-mode discrimination requires querying
 * each conjunct independently when the conjunction fails (so the reason
 * surfaces which conjunct caused failure: spatial vs matter).
 */
export async function cauConsistentWithSpatialAndMatter(input) {
  const { prologSession, cauIRI, signature, ancestorChain = [] } = input;
  if (!prologSession) {
    throw new TypeError('cauConsistentWithSpatialAndMatter: prologSession required');
  }
  if (!signature) {
    throw new TypeError('cauConsistentWithSpatialAndMatter: signature required');
  }

  const groundsNC = 'MENC2';
  const helperIRI = 'cau_consistent_with_spatial_and_matter/1';
  const evidence = { ancestorChain: ancestorChain.slice() };

  // Conjunct 1: spatial-occupation consistency
  const spatial = await tryDerivationWithFallback({
    prologSession, cauIRI, cauSignature: signature, ancestorChain,
    queryString: MENC2_SPATIAL_QUERY(cauIRI),
    structuralFallback: ({ cauSignature, ancestorChain: chain }) => {
      const ok = menc2SpatialStructural({ cauSignature, ancestorChain: chain });
      return ok
        ? { result: true, reason: 'spatial_and_matter_structural_fallback' }
        : { result: false, reason: 'spatial_consistency_failed' };
    },
  });

  if (spatial.fallbackUsed) {
    if (spatial.fallbackResult.result === false) {
      return {
        result: false, reason: 'spatial_consistency_failed', evidence,
        fallbackUsed: true, fallbackTrigger: 'step_cap_exhausted', groundsNC, helperIRI,
      };
    }
    // Spatial fallback says consistent — fall through to matter check via fallback shape too
    return runMENC2MatterAfterSpatialFallback({ ...input, evidence, helperIRI, groundsNC });
  }

  if (spatial.derivedOutcome === 'failed') {
    return {
      result: false, reason: 'spatial_consistency_failed', evidence,
      fallbackUsed: false, fallbackTrigger: null, groundsNC, helperIRI,
    };
  }

  // Conjunct 1 succeeded. Evaluate conjunct 2.
  const matter = await tryDerivationWithFallback({
    prologSession, cauIRI, cauSignature: signature, ancestorChain,
    queryString: MENC2_MATTER_QUERY(cauIRI),
    structuralFallback: ({ cauSignature, ancestorChain: chain }) => {
      const ok = menc2MatterStructural({ cauSignature, ancestorChain: chain });
      return ok
        ? { result: true, reason: 'spatial_and_matter_structural_fallback' }
        : { result: false, reason: 'matter_constitution_failed' };
    },
  });

  if (matter.fallbackUsed) {
    return {
      result: matter.fallbackResult.result,
      reason: matter.fallbackResult.reason,
      evidence,
      fallbackUsed: true,
      fallbackTrigger: 'step_cap_exhausted',
      groundsNC, helperIRI,
    };
  }

  if (matter.derivedOutcome === 'failed') {
    return {
      result: false, reason: 'matter_constitution_failed', evidence,
      fallbackUsed: false, fallbackTrigger: null, groundsNC, helperIRI,
    };
  }

  return {
    result: true, reason: 'spatial_and_matter_derived', evidence,
    fallbackUsed: false, fallbackTrigger: null, groundsNC, helperIRI,
  };
}

async function runMENC2MatterAfterSpatialFallback(input) {
  const { prologSession, cauIRI, signature, ancestorChain, evidence, groundsNC, helperIRI } = input;
  const matter = await tryDerivationWithFallback({
    prologSession, cauIRI, cauSignature: signature, ancestorChain,
    queryString: MENC2_MATTER_QUERY(cauIRI),
    structuralFallback: ({ cauSignature, ancestorChain: chain }) => {
      const ok = menc2MatterStructural({ cauSignature, ancestorChain: chain });
      return ok
        ? { result: true, reason: 'spatial_and_matter_structural_fallback' }
        : { result: false, reason: 'matter_constitution_failed' };
    },
  });
  if (matter.fallbackUsed) {
    return {
      result: matter.fallbackResult.result,
      reason: matter.fallbackResult.reason,
      evidence, fallbackUsed: true, fallbackTrigger: 'step_cap_exhausted', groundsNC, helperIRI,
    };
  }
  if (matter.derivedOutcome === 'succeeded') {
    return {
      result: true, reason: 'spatial_and_matter_structural_fallback',
      evidence, fallbackUsed: true, fallbackTrigger: 'step_cap_exhausted', groundsNC, helperIRI,
    };
  }
  return {
    result: false, reason: 'matter_constitution_failed',
    evidence, fallbackUsed: true, fallbackTrigger: 'step_cap_exhausted', groundsNC, helperIRI,
  };
}

// ── ProcessNC3: cau_consistent_with_one_dim_temporal (Commit 3) ──

const PROCESS_NC3_QUERY = (cauIRI) =>
  `cau_admits_property_restriction('${cauIRI}', 'bfo:occupiesTemporalRegion', 'bfo:OneDimensionalTemporalRegion').`;

// §3.2 ZeroDim contradiction-wins precedence (LOCKED 2026-04-25): a CAU
// declaring bfo:occupiesTemporalRegion some bfo:ZeroDimensionalTemporalRegion
// routes unsatisfied with zero_dim_contradiction reason regardless of
// whether OneDim positive paths also fire. Parallels X5 OccurrentNC3
// multi-inheritance contradiction-wins.
function processNC3HasZeroDimContradiction(cauSignature) {
  const restrictions = [
    ...(cauSignature?.existentialRestrictions || []),
    ...(cauSignature?.universalRestrictions || []),
  ];
  return restrictions.some(r =>
    isOccupiesTemporalRegion(r.onProperty) &&
    isZeroDimTR(r.someValuesFrom || r.allValuesFrom)
  );
}

function processNC3StructuralFallback({ cauSignature, ancestorChain }) {
  // Negative path: ZeroDim contradiction (already pre-checked but covered
  // here for correctness if fallback fires after an unguarded path).
  if (processNC3HasZeroDimContradiction(cauSignature)) {
    return { result: false, reason: 'zero_dim_contradiction' };
  }

  // Positive path 3: Process or descendant in ancestor chain.
  const processAncestor = (ancestorChain || []).find(a => PROCESS_SUBTREE.has(a));
  if (processAncestor) {
    return { result: true, reason: 'process_ancestor_inherits_one_dim' };
  }

  // Positive path 1/2: occupiesTemporalRegion restriction with
  // OneDim, TemporalRegion (parent), or unspecified filler.
  const hasOneDimRestriction = (cauSignature?.existentialRestrictions || []).some(r => {
    if (!isOccupiesTemporalRegion(r.onProperty)) return false;
    const filler = r.someValuesFrom;
    if (filler == null) return true; // unspecified — no contradiction with OneDim
    return isOneDimTR(filler) || isTemporalRegion(filler);
  });
  if (hasOneDimRestriction) {
    return { result: true, reason: 'one_dim_temporal_consistency_structural_fallback' };
  }

  // No positive evidence; no contradiction.
  return { result: false, reason: 'no_temporal_extension_evidence' };
}

/**
 * Helper for ProcessNC3 (OWL-DERIVED, Process).
 * SME-drafted contract per X6 memo §5.
 *
 * Three positive paths to satisfaction (per §5.2):
 *   1. occupiesTemporalRegion with OneDim filler → one_dim_temporal_consistency_derived
 *   2. occupiesTemporalRegion with parent (TemporalRegion) filler — admitted under OWA
 *   3. Process ancestor in chain → process_ancestor_inherits_one_dim (distinct reason per implementation plan §4.6)
 *
 * One negative path: ZeroDim contradiction (§3.2 LOCKED 2026-04-25 precedence).
 * Pre-checked structurally before Tau Prolog query so contradiction wins
 * over OneDim positive evidence in dual-restriction case.
 */
export async function cauConsistentWithOneDimTemporal(input) {
  const { prologSession, cauIRI, signature, ancestorChain = [] } = input;
  if (!prologSession) {
    throw new TypeError('cauConsistentWithOneDimTemporal: prologSession required');
  }
  if (!signature) {
    throw new TypeError('cauConsistentWithOneDimTemporal: signature required');
  }

  const groundsNC = 'ProcessNC3';
  const helperIRI = 'cau_consistent_with_one_dim_temporal/1';
  const evidence = { ancestorChain: ancestorChain.slice() };

  // §3.2 ZeroDim contradiction pre-check — wins over positive paths.
  if (processNC3HasZeroDimContradiction(signature)) {
    return {
      result: false, reason: 'zero_dim_contradiction', evidence,
      fallbackUsed: false, fallbackTrigger: null, groundsNC, helperIRI,
    };
  }

  const trial = await tryDerivationWithFallback({
    prologSession, cauIRI, cauSignature: signature, ancestorChain,
    queryString: PROCESS_NC3_QUERY(cauIRI),
    structuralFallback: processNC3StructuralFallback,
  });

  if (trial.fallbackUsed) {
    return {
      result: trial.fallbackResult.result,
      reason: trial.fallbackResult.reason,
      evidence,
      fallbackUsed: true,
      fallbackTrigger: trial.fallbackTrigger,
      groundsNC, helperIRI,
    };
  }

  if (trial.derivedOutcome === 'succeeded') {
    // Distinguish path-3 (Process ancestor inherits) from path-1/2 (literal
    // OneDim/TemporalRegion restriction). Per implementation plan §4.6 and
    // ProcessNC3 §5.4 asymmetric Occurrent handling: bare bfo:Occurrent
    // ancestor (which inherits occupiesTemporalRegion property domain via
    // BFO axioms) is INSUFFICIENT — ProcessNC3 is Process-specific
    // strengthening of OccurrentNC3.
    const processAncestor = ancestorChain.find(a => PROCESS_SUBTREE.has(a));
    if (processAncestor) {
      return {
        result: true,
        reason: 'process_ancestor_inherits_one_dim',
        evidence: { ...evidence, matchedAncestor: processAncestor },
        fallbackUsed: false,
        fallbackTrigger: null,
        groundsNC, helperIRI,
      };
    }

    const hasLiteralCompatibleRestriction = (signature.existentialRestrictions || []).some(r =>
      isOccupiesTemporalRegion(r.onProperty) &&
      (r.someValuesFrom == null || isOneDimTR(r.someValuesFrom) || isTemporalRegion(r.someValuesFrom))
    );
    if (hasLiteralCompatibleRestriction) {
      return {
        result: true,
        reason: 'one_dim_temporal_consistency_derived',
        evidence,
        fallbackUsed: false,
        fallbackTrigger: null,
        groundsNC, helperIRI,
      };
    }

    // Prolog succeeded via Occurrent property-domain inheritance only —
    // asymmetric Occurrent handling rejects (mere Occurrent insufficient).
    return {
      result: false,
      reason: 'no_temporal_extension_evidence',
      evidence,
      fallbackUsed: false,
      fallbackTrigger: null,
      groundsNC, helperIRI,
    };
  }

  // derivedOutcome === 'failed' — no positive evidence found.
  return {
    result: false, reason: 'no_temporal_extension_evidence', evidence,
    fallbackUsed: false, fallbackTrigger: null, groundsNC, helperIRI,
  };
}

// ── Reason enum exports for test coverage assertions ────────────────

export const ICNC2_REASONS = Object.freeze([
  'inheres_in_absence_derived',
  'inheres_in_absence_structural_fallback',
  'inheres_in_presence_derived',
  'inheres_in_presence_structural',
]);

export const ICNC3_REASONS = Object.freeze([
  'concretizes_absence_derived',
  'concretizes_absence_structural_fallback',
  'concretizes_presence_derived',
  'concretizes_presence_structural',
]);

export const IENC2_REASONS = Object.freeze([
  'matter_as_part_absence_derived',
  'matter_as_part_absence_structural_fallback',
  'matter_as_part_presence_derived',
  'matter_as_part_presence_structural',
]);

export const OCCURRENT_NC2_REASONS = Object.freeze([
  'disjointness_derived',
  'disjointness_structural_fallback',
  'continuant_nc_satisfied',
  'disjointness_explicit_violation',
]);

export const MENC2_REASONS = Object.freeze([
  'spatial_and_matter_derived',
  'spatial_and_matter_structural_fallback',
  'spatial_consistency_failed',
  'matter_constitution_failed',
]);

export const PROCESS_NC3_REASONS = Object.freeze([
  'one_dim_temporal_consistency_derived',
  'one_dim_temporal_consistency_structural_fallback',
  'process_ancestor_inherits_one_dim',
  'zero_dim_contradiction',
  'no_temporal_extension_evidence',
]);

// ── Internal exports for tests ──────────────────────────────────────

export const _internals = Object.freeze({
  isInheresIn,
  isConcretizes,
  isHasContinuantPart,
  isOccupiesTemporalRegion,
  isOccupiesSpatialRegion,
  isOneDimTR,
  isZeroDimTR,
  isTemporalRegion,
  signatureHasPropertyRestriction,
  icnc2StructuralFallback,
  icnc3StructuralFallback,
  ienc2StructuralFallback,
  occurrentNC2StructuralFallback,
  menc2SpatialStructural,
  menc2MatterStructural,
  menc2StructuralFallback,
  processNC3HasZeroDimContradiction,
  processNC3StructuralFallback,
});
