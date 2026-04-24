/**
 * NC Dispatcher — SME-D16-X4 Commit 1.
 *
 * Takes a CAU signature + target BFO category + BFO Signature Reference
 * and returns the trichotomy of NC satisfaction:
 *
 *   {
 *     satisfied:    Set<NC_IRI>,
 *     unsatisfied:  Set<NC_IRI>,
 *     undetermined: Set<NC_IRI>,
 *     evidence:     Map<NC_IRI, {matcherTrace | helperEvidence | deferredReason}>
 *   }
 *
 * Pure function; edge-canonical; no adapter dependency. Preserves the
 * absence-not-evidence principle via the `undetermined` partition — a CAU
 * whose NC satisfaction cannot be determined by Bucket A's OWL-DIRECT
 * matchers or existing Wave 0/1/2 helpers routes to `undetermined`, not
 * to `unsatisfied`.
 *
 * Scope per SME-D16-X4 v1 (Bucket A only, Tau Prolog deferred):
 *   - P1 Ancestor-satisfaction (12 OWL-DIRECT NCs): implemented here.
 *   - P2 SubClassOf-declaration (5 OWL-DIRECT NCs): implemented here.
 *   - P5 Root-declaration (1 OWL-DIRECT NC): implemented here.
 *   - P3 Property-restriction-presence (5 OWL-DIRECT NCs): deferred to Commit 2.
 *   - P4 Consistency / absence-of-pattern (4 OWL-DIRECT NCs): deferred to Commit 2.
 *   - CURATED-NC with Wave 0/1/2 helper (10 NCs): routed via helperRegistry.
 *   - CURATED-NC without helper (7 NCs): Bucket B-deferred → undetermined.
 *   - OWL-DERIVED (6 NCs): Bucket C-deferred → undetermined.
 *   - CURATED-HEURISTIC (5 NCs): excluded from Entailment per strict-policy lock.
 *
 * Invariants enforced:
 *   I-cycle: P1 ancestor recursion is cycle-safe via visited-set guard;
 *            cycle detection throws NCInferenceCycleError with visited path.
 *   I-partition: satisfied ∪ unsatisfied ∪ undetermined == required,
 *                pairwise disjoint; violation throws
 *                DispatcherContractViolationError at emission.
 *   I-strict-policy: CURATED-HEURISTIC NCs are NOT included in the
 *                    required set for Entailment evaluation.
 *
 * Design: specs/d16/sme-d16-x4-nc-inference-integration-memo-v1.md
 * Consumed by: three-state-evaluator.js (Commit 3 integration).
 */

import * as helpers from './critical-nc-helpers.js';

// ── Error classes ─────────────────────────────────────────────────

/**
 * Thrown when P1 ancestor recursion detects a cycle. Cycle detection is
 * defensive hygiene (BFO 2020 is single-inheritance, so cycles shouldn't
 * exist in practice) but cycle-safety is load-bearing discipline
 * analogous to X1 memo §4.3 subproperty-inheritance cycle-safe closure.
 */
export class NCInferenceCycleError extends Error {
  constructor(visitedPath, offendingCategory) {
    super(
      `NCInferenceCycleError: P1 ancestor recursion cycle detected. ` +
      `Visited path: ${visitedPath.join(' → ')} → ${offendingCategory}. ` +
      `BFO 2020 is single-inheritance; cycle indicates data defect in bfo-signatures-v1.0.json ancestor chain.`,
    );
    this.name = 'NCInferenceCycleError';
    this.visitedPath = visitedPath.slice();
    this.offendingCategory = offendingCategory;
  }
}

/**
 * Thrown when the dispatcher's output partition (satisfied ∪ unsatisfied
 * ∪ undetermined) does not equal the required set exactly. This is a
 * dispatcher contract violation, not a routing case — guards against
 * silent coverage holes that would otherwise appear as spurious Plausible
 * dispositions downstream.
 */
export class DispatcherContractViolationError extends Error {
  constructor(required, satisfied, unsatisfied, undetermined) {
    const partition = new Set([...satisfied, ...unsatisfied, ...undetermined]);
    const missing = [...required].filter((x) => !partition.has(x));
    const extra = [...partition].filter((x) => !required.has(x));
    super(
      `DispatcherContractViolationError: partition does not equal required set. ` +
      `Missing from partition (NCs not evaluated): ${JSON.stringify(missing)}. ` +
      `Extra in partition (NCs beyond required): ${JSON.stringify(extra)}. ` +
      `Invariant: satisfied ∪ unsatisfied ∪ undetermined must equal required exactly.`,
    );
    this.name = 'DispatcherContractViolationError';
    this.missing = missing;
    this.extra = extra;
  }
}

// ── Helper registry — predicate name → helper function ────────────

// Maps Prolog predicate names (as they appear in bfo-signatures-v1.0.json
// body_draft) to Wave 0/1/2 helpers in critical-nc-helpers.js. Only
// predicates with existing helpers appear here; missing predicates route
// to Bucket B deferral.
const HELPER_REGISTRY = Object.freeze({
  cau_realization_requires_social_institutional_context: helpers.cauRealizationRequiresSocialInstitutionalContext,
  cau_has_teleological_commitment: helpers.cauHasTeleologicalCommitment,
  cau_realization_has_triggering_circumstances: helpers.cauRealizationHasTriggeringCircumstances,
  cau_bearer_is_particular_not_generic: helpers.cauBearerIsParticularNotGeneric,
  cau_admits_multiple_simultaneous_concretizations: helpers.cauAdmitsMultipleSimultaneousConcretizations,
  cau_always_realized_when_bearer_exists: helpers.cauAlwaysRealizedWhenBearerExists,
  cau_disposition_disjunctive: helpers.cauDispositionDisjunctive,
  cau_realization_is_design_expected: helpers.cauRealizationIsDesignExpected,
});

// NCs whose full body_draft is handled inline by a helper (not reducible to
// a single predicate dispatch). These are the Wave 0/1/2 helpers that ARE
// the NC's evaluation, not a conjunctive predicate within a larger body.
const HELPER_NC_OVERRIDES = Object.freeze({
  RoleNC3: helpers.cauRealizationRequiresSocialInstitutionalContext,
  FunctionNC3: helpers.cauHasTeleologicalCommitment,
  DispositionNC3: helpers.cauRealizationHasTriggeringCircumstances,
  SDCNC3: helpers.cauBearerIsParticularNotGeneric,
  GDCNC3: helpers.cauAdmitsMultipleSimultaneousConcretizations,
  QualityNC3: helpers.cauAlwaysRealizedWhenBearerExists,
  RoleNC4: helpers.cauDoesNotHaveTeleologicalCommitment,
  DispositionNC4: helpers.cauDoesNotRequireSocialInstitutionalContext,
  DispositionNC5: helpers.cauDispositionDisjunctive,
  FunctionNC4: helpers.cauRealizationIsDesignExpected,
});

// ── BFO ancestor chain (for P1 recursion + P2 subClassOf check) ───

// Single-inheritance chain per BFO 2020. Used by P1 for parent-category
// lookup and by P2 operationalization. Maintained here as a single source
// of truth for dispatcher purposes; callers can pass their own
// ancestorChain override if needed.
const BFO_PARENT = Object.freeze({
  'bfo:Entity': null,
  'bfo:Continuant': 'bfo:Entity',
  'bfo:IndependentContinuant': 'bfo:Continuant',
  'bfo:MaterialEntity': 'bfo:IndependentContinuant',
  'bfo:ImmaterialEntity': 'bfo:IndependentContinuant',
  'bfo:Site': 'bfo:ImmaterialEntity',
  'bfo:SpecificallyDependentContinuant': 'bfo:Continuant',
  'bfo:Role': 'bfo:SpecificallyDependentContinuant',
  'bfo:Disposition': 'bfo:SpecificallyDependentContinuant',
  'bfo:Function': 'bfo:Disposition',
  'bfo:Quality': 'bfo:SpecificallyDependentContinuant',
  'bfo:GenericallyDependentContinuant': 'bfo:Continuant',
  'bfo:Occurrent': 'bfo:Entity',
  'bfo:Process': 'bfo:Occurrent',
  'bfo:ProcessBoundary': 'bfo:Occurrent',
  'bfo:TemporalRegion': 'bfo:Occurrent',
});

// ── Main dispatcher ───────────────────────────────────────────────

/**
 * Evaluate NC satisfaction for a CAU at a target BFO category.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {object} input.cauSignature           - per extractCAUSignature output
 * @param {string} input.targetBFOCategory      - e.g., 'bfo:Process'
 * @param {object} input.bfoSignatureReference  - bfo-signatures-v1.0.json content
 * @param {Array<string>} [input.ancestorChain] - named rdfs:subClassOf ancestors of the CAU, from specific→general. Required for P2 NCs. Pass [] if CAU has no named subClassOf axioms.
 * @returns {{satisfied: Set<string>, unsatisfied: Set<string>, undetermined: Set<string>, evidence: Map<string, object>}}
 */
export function evaluateNCSatisfaction(input) {
  const {
    cauIRI, cauSignature, targetBFOCategory, bfoSignatureReference,
    ancestorChain = [],
  } = input;

  if (!cauSignature) throw new TypeError('evaluateNCSatisfaction: cauSignature required.');
  if (!targetBFOCategory) throw new TypeError('evaluateNCSatisfaction: targetBFOCategory required.');
  if (!bfoSignatureReference) throw new TypeError('evaluateNCSatisfaction: bfoSignatureReference required.');

  const required = enumerateRequiredNCs(targetBFOCategory, bfoSignatureReference);
  const state = {
    satisfied: new Set(),
    unsatisfied: new Set(),
    undetermined: new Set(),
    evidence: new Map(),
    // Memoization across P1 recursion — avoids re-computing ancestor NC
    // resolution for categories reached through multiple paths.
    ancestorCategoryCache: new Map(),
  };

  for (const nc of required) {
    evaluateSingleNC({
      nc, cauIRI, cauSignature, ancestorChain, bfoSignatureReference,
      state, visited: new Set([targetBFOCategory]),
    });
  }

  // Invariant check: partition must equal required exactly.
  const requiredSet = new Set(required.map((nc) => nc.shortIRI));
  if (!partitionEquals(requiredSet, state.satisfied, state.unsatisfied, state.undetermined)) {
    throw new DispatcherContractViolationError(
      requiredSet, state.satisfied, state.unsatisfied, state.undetermined,
    );
  }

  return {
    satisfied: state.satisfied,
    unsatisfied: state.unsatisfied,
    undetermined: state.undetermined,
    evidence: state.evidence,
  };
}

// ── Per-NC evaluation dispatch ────────────────────────────────────

function evaluateSingleNC({ nc, cauIRI, cauSignature, ancestorChain, bfoSignatureReference, state, visited }) {
  const ncId = nc.shortIRI;

  // NC override: some CURATED-NCs route via their dedicated helper rather
  // than via predicate-name lookup (when helper IS the NC's evaluation).
  const ncIdShort = nc.shortIRI.replace(/^bfo:/, '');
  if (HELPER_NC_OVERRIDES[ncIdShort]) {
    dispatchToHelper({
      nc, helperFn: HELPER_NC_OVERRIDES[ncIdShort],
      cauIRI, cauSignature, state,
    });
    return;
  }

  switch (nc.tag) {
    case 'CURATED-HEURISTIC':
      // Per strict-policy lock: CURATED-HEURISTIC NCs are NOT included in
      // the required set. This switch arm is a safety net — if a
      // CURATED-HEURISTIC somehow reached here, something upstream is
      // broken. Route to undetermined with explicit reason.
      state.undetermined.add(ncId);
      state.evidence.set(ncId, {
        deferredReason: 'curated-heuristic-excluded-from-entailment',
        note: 'Strict-policy lock: CURATED-HEURISTIC tags are annotation-only and excluded from required-NC set. This NC should not have been enumerated.',
      });
      return;

    case 'OWL-DIRECT':
      evaluateOwlDirect({ nc, cauIRI, cauSignature, ancestorChain, bfoSignatureReference, state, visited });
      return;

    case 'OWL-DERIVED':
      // Bucket C scope-out.
      state.undetermined.add(ncId);
      state.evidence.set(ncId, {
        deferredReason: 'OWL-DERIVED-Bucket-C-deferred',
        note: 'OWL-DERIVED NCs require subsumption/restriction-composition inference. Deferred to Bucket C per SME-D16-X4 memo §6.2.',
      });
      return;

    case 'CURATED-NC':
      dispatchCuratedNC({ nc, cauIRI, cauSignature, state });
      return;

    default:
      state.undetermined.add(ncId);
      state.evidence.set(ncId, {
        deferredReason: 'unknown-nc-tag',
        note: `NC tag '${nc.tag}' not recognized by dispatcher.`,
      });
  }
}

// ── Pattern implementations ──────────────────────────────────────

function evaluateOwlDirect({ nc, cauIRI, cauSignature, ancestorChain, bfoSignatureReference, state, visited }) {
  const pattern = classifyOwlDirectPattern(nc);
  const ncId = nc.shortIRI;

  switch (pattern) {
    case 'P1':
      evaluateP1Ancestor({ nc, cauIRI, cauSignature, ancestorChain, bfoSignatureReference, state, visited });
      return;

    case 'P2':
      evaluateP2SubClassOf({ nc, ancestorChain, state });
      return;

    case 'P5':
      evaluateP5RootDeclaration({ nc, cauSignature, state });
      return;

    case 'P3':
    case 'P4':
      // Deferred to Commit 2. Per §3.3 acceptance posture, OWL-DIRECT
      // matchers must not return `undetermined` for OWL-DIRECT NCs —
      // but this is a scope-out (the matcher doesn't exist yet), not a
      // coverage gap within a scoped matcher. The trichotomy-undetermined
      // here is a pre-Commit-2 marker; Commit 2 replaces with deterministic
      // satisfied/unsatisfied.
      state.undetermined.add(ncId);
      state.evidence.set(ncId, {
        deferredReason: `${pattern}-deferred-to-commit-2`,
        note: `Pattern ${pattern} (${pattern === 'P3' ? 'property-restriction-presence' : 'consistency/absence-of-pattern'}) matcher scheduled for SME-D16-X4 Commit 2.`,
      });
      return;

    default:
      state.undetermined.add(ncId);
      state.evidence.set(ncId, {
        deferredReason: 'owl-direct-unclassified',
        note: `OWL-DIRECT NC ${ncId} could not be classified into P1/P2/P3/P4/P5.`,
      });
  }
}

// P1 pattern: NC asserts "All X NCs satisfied" — evaluate ancestor
// category's NCs in a LOCAL sub-trichotomy (not leaked into top-level
// state.satisfied/unsatisfied/undetermined, which must remain scoped to
// the target category's required set per the partition invariant).
// This NC is satisfied iff ALL ancestor NCs are satisfied, unsatisfied
// iff ANY ancestor NC is unsatisfied, undetermined iff no unsatisfied
// but some undetermined.
//
// Ancestor sub-trichotomy IS cached in state.ancestorCategoryCache to
// avoid re-computing for categories reached through multiple P1 paths
// (e.g., evaluating Function NCs triggers Disposition → SDC → Continuant;
// evaluating Disposition NCs directly triggers SDC → Continuant again).
function evaluateP1Ancestor({ nc, cauIRI, cauSignature, ancestorChain, bfoSignatureReference, state, visited }) {
  const ncId = nc.shortIRI;
  const ancestorCategory = extractAncestorCategoryFromDescription(nc);

  if (!ancestorCategory) {
    state.undetermined.add(ncId);
    state.evidence.set(ncId, {
      deferredReason: 'p1-ancestor-extraction-failed',
      note: `P1 NC ${ncId} description did not yield an ancestor category IRI.`,
    });
    return;
  }

  // Cycle-safety per X1 §4.3 analog.
  if (visited.has(ancestorCategory)) {
    throw new NCInferenceCycleError([...visited], ancestorCategory);
  }

  const ancestorTrichotomy = evaluateAncestorCategory({
    ancestorCategory, cauIRI, cauSignature, ancestorChain,
    bfoSignatureReference, cache: state.ancestorCategoryCache,
    visited: new Set([...visited, ancestorCategory]),
  });

  const dispositions = [];
  for (const ancNC of ancestorTrichotomy.ncs) {
    const aid = ancNC.shortIRI;
    if (ancestorTrichotomy.satisfied.has(aid)) dispositions.push('satisfied');
    else if (ancestorTrichotomy.unsatisfied.has(aid)) dispositions.push('unsatisfied');
    else if (ancestorTrichotomy.undetermined.has(aid)) dispositions.push('undetermined');
    else dispositions.push('missing');
  }

  let disposition;
  if (dispositions.includes('missing')) disposition = 'undetermined';
  else if (dispositions.includes('unsatisfied')) disposition = 'unsatisfied';
  else if (dispositions.includes('undetermined')) disposition = 'undetermined';
  else disposition = 'satisfied';

  state[disposition].add(ncId);
  state.evidence.set(ncId, {
    matcherTrace: {
      pattern: 'P1',
      ancestorCategory,
      ancestorNCs: ancestorTrichotomy.ncs.map((x) => x.shortIRI),
      ancestorDispositions: dispositions,
    },
  });
}

// Evaluate an ancestor category's NC set into a local sub-trichotomy.
// Cached per ancestorCategory to avoid re-computation across multiple P1
// paths. The sub-trichotomy is NOT merged into the parent state; its sole
// purpose is to drive P1 NC disposition upstream.
function evaluateAncestorCategory({ ancestorCategory, cauIRI, cauSignature, ancestorChain, bfoSignatureReference, cache, visited }) {
  if (cache.has(ancestorCategory)) return cache.get(ancestorCategory);

  const ancestorNCs = enumerateRequiredNCs(ancestorCategory, bfoSignatureReference);
  const subState = {
    satisfied: new Set(),
    unsatisfied: new Set(),
    undetermined: new Set(),
    evidence: new Map(),
    ancestorCategoryCache: cache, // shared across recursion
  };
  for (const ancNC of ancestorNCs) {
    evaluateSingleNC({
      nc: ancNC, cauIRI, cauSignature, ancestorChain,
      bfoSignatureReference, state: subState, visited,
    });
  }
  const result = {
    ncs: ancestorNCs,
    satisfied: subState.satisfied,
    unsatisfied: subState.unsatisfied,
    undetermined: subState.undetermined,
  };
  cache.set(ancestorCategory, result);
  return result;
}

// P2 pattern: CAU declared as rdfs:subClassOf a specific BFO class. The
// ancestor chain (passed by caller) is walked for presence of the target
// BFO class.
function evaluateP2SubClassOf({ nc, ancestorChain, state }) {
  const ncId = nc.shortIRI;
  const targetAncestor = extractSubClassOfTargetFromDescription(nc);

  if (!targetAncestor) {
    state.undetermined.add(ncId);
    state.evidence.set(ncId, {
      deferredReason: 'p2-target-extraction-failed',
      note: `P2 NC ${ncId} description did not yield a target subClassOf IRI.`,
    });
    return;
  }

  if (!Array.isArray(ancestorChain)) {
    // Empty ancestorChain is legitimate (CAU has no named subClassOf);
    // missing ancestorChain is a caller contract violation.
    state.undetermined.add(ncId);
    state.evidence.set(ncId, {
      deferredReason: 'p2-ancestor-chain-not-provided',
      note: 'Dispatcher caller did not supply ancestorChain; P2 evaluation cannot proceed.',
    });
    return;
  }

  const isDescendant = ancestorChain.includes(targetAncestor);
  state[isDescendant ? 'satisfied' : 'unsatisfied'].add(ncId);
  state.evidence.set(ncId, {
    matcherTrace: {
      pattern: 'P2',
      targetAncestor,
      ancestorChain: ancestorChain.slice(),
      matched: isDescendant,
    },
  });
}

// P5 pattern: EntityNC1 — declared as owl:Class with at least one
// BFO-relevant axiom. "BFO-relevant" operationalized as: signature has
// any BFO-namespace reference in restrictions / characteristics /
// disjointness / equivalence.
function evaluateP5RootDeclaration({ nc, cauSignature, state }) {
  const ncId = nc.shortIRI;

  const hasBfoRelevantAxiom = signatureHasBfoRelevantAxiom(cauSignature);

  state[hasBfoRelevantAxiom ? 'satisfied' : 'unsatisfied'].add(ncId);
  state.evidence.set(ncId, {
    matcherTrace: {
      pattern: 'P5',
      hasBfoRelevantAxiom,
      sources: hasBfoRelevantAxiom ? describeBfoRelevantSources(cauSignature) : [],
    },
  });
}

function signatureHasBfoRelevantAxiom(sig) {
  const lists = [
    sig.propertyRestrictionsAsDomain || [],
    sig.propertyRestrictionsAsRange || [],
    sig.existentialRestrictions || [],
    sig.universalRestrictions || [],
    sig.cardinalityRestrictions || [],
    sig.hasValueRestrictions || [],
  ];
  for (const lst of lists) {
    for (const entry of lst) {
      if (isBfoIRI(entry.onProperty) || isBfoIRI(entry.property) || isBfoIRI(entry.someValuesFrom) || isBfoIRI(entry.allValuesFrom) || isBfoIRI(entry.target)) {
        return true;
      }
    }
  }
  for (const d of (sig.disjointnessAssertions || [])) if (isBfoIRI(d)) return true;
  for (const e of (sig.equivalenceClaims || [])) if (isBfoIRI(e)) return true;
  for (const c of (sig.characteristics || [])) if (isBfoIRI(c)) return true;
  return false;
}

function describeBfoRelevantSources(sig) {
  const srcs = [];
  if ((sig.existentialRestrictions || []).some((e) => isBfoIRI(e.onProperty) || isBfoIRI(e.someValuesFrom))) srcs.push('existentialRestrictions');
  if ((sig.cardinalityRestrictions || []).some((c) => isBfoIRI(c.onProperty))) srcs.push('cardinalityRestrictions');
  if ((sig.disjointnessAssertions || []).some((d) => isBfoIRI(d))) srcs.push('disjointnessAssertions');
  if ((sig.equivalenceClaims || []).some((e) => isBfoIRI(e))) srcs.push('equivalenceClaims');
  return srcs;
}

function isBfoIRI(iri) {
  return typeof iri === 'string' && (iri.startsWith('bfo:') || iri.includes('purl.obolibrary.org/obo/BFO'));
}

// ── CURATED-NC dispatch via body_draft predicate name ─────────────

function dispatchCuratedNC({ nc, cauIRI, cauSignature, state }) {
  const ncId = nc.shortIRI;
  const predicate = extractLeadingPredicateName(nc);

  if (!predicate) {
    state.undetermined.add(ncId);
    state.evidence.set(ncId, {
      deferredReason: 'curated-nc-body-draft-empty',
      note: `CURATED-NC ${ncId} has no body_draft predicate extractable.`,
    });
    return;
  }

  const helperFn = HELPER_REGISTRY[predicate];
  if (!helperFn) {
    state.undetermined.add(ncId);
    state.evidence.set(ncId, {
      deferredReason: `Bucket-B-deferred-${predicate}`,
      note: `CURATED-NC ${ncId} depends on predicate '${predicate}' which has no Wave 0/1/2 helper. Deferred to Bucket B per SME-D16-X4 §6.1.`,
    });
    return;
  }

  dispatchToHelper({ nc, helperFn, cauIRI, cauSignature, state });
}

function dispatchToHelper({ nc, helperFn, cauIRI, cauSignature, state }) {
  const ncId = nc.shortIRI;
  let helperResult;
  try {
    helperResult = helperFn({ cauIRI, signature: cauSignature });
  } catch (err) {
    state.undetermined.add(ncId);
    state.evidence.set(ncId, {
      deferredReason: 'helper-invocation-threw',
      error: err.message,
    });
    return;
  }

  if (helperResult && helperResult.result === true) {
    state.satisfied.add(ncId);
  } else {
    state.unsatisfied.add(ncId);
  }
  state.evidence.set(ncId, {
    helperEvidence: {
      helperName: helperFn.name || '(anonymous)',
      reason: helperResult && helperResult.reason,
      evidence: helperResult && helperResult.evidence,
      result: helperResult && helperResult.result,
    },
  });
}

// ── Required-NC enumeration ──────────────────────────────────────

function enumerateRequiredNCs(category, bfoSignatureReference) {
  const all = bfoSignatureReference.necessary_conditions || [];
  return all
    .filter((nc) => nc.category === category && nc.tag !== 'CURATED-HEURISTIC')
    // Synthesize shortIRI per the three-state-evaluator convention
    // (bfo-signatures-v1.0.json stores `id` + `iri`; dispatcher + callers
    // key off `bfo:<id>` short form).
    .map((nc) => ({ ...nc, shortIRI: nc.shortIRI || `bfo:${nc.id}` }));
}

// ── Pattern classification (OWL-DIRECT → P1/P2/P3/P4/P5) ─────────

const P1_IDS = new Set(['ICNC1', 'MENC1', 'IENC1', 'SiteNC1', 'SDCNC1', 'RoleNC1', 'DispositionNC1', 'FunctionNC1', 'QualityNC1', 'GDCNC1', 'ProcessNC1', 'ProcessBoundaryNC1']);
const P2_IDS = new Set(['RoleNC2', 'DispositionNC2', 'FunctionNC2', 'QualityNC2', 'TemporalRegionNC1']);
const P3_IDS = new Set(['SDCNC2', 'GDCNC2', 'ProcessNC2', 'OccurrentNC1', 'ProcessBoundaryNC2']);
const P4_IDS = new Set(['ContinuantNC1', 'ContinuantNC2', 'SiteNC2', 'TemporalRegionNC2']);
const P5_IDS = new Set(['EntityNC1']);

function classifyOwlDirectPattern(nc) {
  const id = nc.id || nc.shortIRI.replace(/^bfo:/, '');
  if (P1_IDS.has(id)) return 'P1';
  if (P2_IDS.has(id)) return 'P2';
  if (P3_IDS.has(id)) return 'P3';
  if (P4_IDS.has(id)) return 'P4';
  if (P5_IDS.has(id)) return 'P5';
  return null;
}

// ── Metadata extraction from NC records ──────────────────────────

// P1: extract "All X NCs satisfied" → X (ancestor category). BFO_PARENT
// map is authoritative; the NC description is the human-readable form.
function extractAncestorCategoryFromDescription(nc) {
  // BFO_PARENT keyed on the nc.category gives the ancestor directly.
  return BFO_PARENT[nc.category] || null;
}

// P2: extract "Declared as rdfs:subClassOf bfo:X" → bfo:X (target).
function extractSubClassOfTargetFromDescription(nc) {
  const desc = nc.description || '';
  const match = desc.match(/rdfs:subClassOf\s+(bfo:[A-Za-z0-9_]+)/);
  if (match) return match[1];
  // Fallback: TemporalRegionNC1 etc. — the target is frequently the NC's
  // own category (self-declaration); use that as heuristic.
  return null;
}

// CURATED-NC body_draft: extract leading predicate name.
// Examples:
//   "cau_bearer_is_particular_not_generic(CAU)." → 'cau_bearer_is_particular_not_generic'
//   "cau_admits_multiple_simultaneous_concretizations(CAU), \\+ cau_bearer_is_particular_not_generic(CAU)."
//      → 'cau_admits_multiple_simultaneous_concretizations'
function extractLeadingPredicateName(nc) {
  const body = nc.prolog && nc.prolog.body_draft;
  if (!body) return null;
  const match = body.match(/([a-z_][a-z0-9_]*)\s*\(/);
  return match ? match[1] : null;
}

// ── Partition-equality check ─────────────────────────────────────

function partitionEquals(required, satisfied, unsatisfied, undetermined) {
  const union = new Set([...satisfied, ...unsatisfied, ...undetermined]);
  if (union.size !== required.size) return false;
  for (const r of required) if (!union.has(r)) return false;
  // Check pairwise disjoint.
  for (const s of satisfied) if (unsatisfied.has(s) || undetermined.has(s)) return false;
  for (const u of unsatisfied) if (undetermined.has(u)) return false;
  return true;
}

// ── Exported for tests ───────────────────────────────────────────

export const _internals = Object.freeze({
  HELPER_REGISTRY,
  HELPER_NC_OVERRIDES,
  BFO_PARENT,
  classifyOwlDirectPattern,
  extractAncestorCategoryFromDescription,
  extractSubClassOfTargetFromDescription,
  extractLeadingPredicateName,
  signatureHasBfoRelevantAxiom,
});
