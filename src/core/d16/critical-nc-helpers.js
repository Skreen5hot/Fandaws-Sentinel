/**
 * Critical NC Helper Predicates — D1.6 §2.5 query surface for CRITICAL
 * CURATED-NC items grounded in the curated process category lists.
 *
 * Implements the three helper predicates cited by the SME-LOCKED CRITICAL
 * items in bfo-signatures-v1.0.json:
 *
 *   - cauRealizationRequiresSocialInstitutionalContext (RoleNC3 grounds,
 *     and RoleNC4 negative, DispositionNC4 negative — same source-of-truth)
 *   - cauHasTeleologicalCommitment (FunctionNC3 grounds, and RoleNC4
 *     negative, DispositionNC5 disjunctive first branch)
 *   - cauRealizationHasTriggeringCircumstances (DispositionNC3 grounds,
 *     DispositionNC5 disjunctive second branch when non-teleological)
 *
 * Each helper consumes the curated list delivered 2026-04-22 at
 * specs/d16/curated-process-categories-v1.0.json and returns a boolean
 * membership per the list's semantics: the CAU's realization target IRI
 * matches a list entry directly OR is a (transitive) subclass of an entry
 * whose `include_subclasses` is true.
 *
 * MULTI-CATEGORY OVERLAP RULE (SME-specified 2026-04-22, load-bearing):
 *   A CAU whose realization targets multiple categories produces multiple
 *   `true` results — one per matching helper. The correct downstream
 *   resolution is Plausible with multi-category evidence annotation, NOT
 *   force-selection by §5.1 precedence or by BFO-OWL taxonomic subsumption.
 *   The helpers return raw membership; the evaluator orchestrates the
 *   Plausible-routing decision. See project_d16_curated_process_lists_delivery.md
 *   for the commitment framing.
 *
 * SUBSUMPTION SUPPORT:
 *   For `include_subclasses: true` entries, the helper needs to query the
 *   candidate ontology's rdfs:subClassOf hierarchy. This scaffold accepts
 *   an optional subsumption-query callback; production implementation
 *   (Week 6-8 hardening) loads the candidate class hierarchy into Tau Prolog
 *   at Phase 3 initialization (see docs/architecture/week9-11-forward-flags.md
 *   for the design decision point).
 *
 * Spec refs:
 *   - specs/d16/bfo-signatures-v1.0.json (NC body_drafts reference these helpers)
 *   - specs/d16/curated-process-categories-v1.0.json (source of truth for entries)
 *   - specs/d16/bfo-signature-reference-v1_0.md §5 (evaluation-cascade discipline)
 */

import curatedLists from '../../../specs/d16/curated-process-categories-v1.0.json' with { type: 'json' };

const CATEGORIES = curatedLists['curated_process_categories_v1.0'].categories;

/**
 * Test whether a target-process IRI is in a curated category per the list's
 * entry semantics. Core shared implementation.
 *
 * @param {string} targetIRI — the realization-target process class IRI
 * @param {'social_institutional'|'design_expected'|'causal_triggering'} categoryKey
 * @param {(subIRI: string, superIRI: string) => boolean} [isSubclassOf]
 *   — optional callback resolving class-level subsumption in the candidate
 *     ontology. If omitted, the helper matches entries directly only
 *     (no subclass walk) and returns a conservative false for subsumable
 *     matches. Production should provide this callback.
 * @returns {{matched: boolean, matchedEntry: object|null, viaSubsumption: boolean}}
 */
export function targetInCategory(targetIRI, categoryKey, isSubclassOf = null) {
  const category = CATEGORIES[categoryKey];
  if (!category) {
    throw new Error(`targetInCategory: unknown category key '${categoryKey}'. Valid keys: ${Object.keys(CATEGORIES).join(', ')}`);
  }
  for (const entry of category.entries) {
    if (entry.iri === targetIRI) {
      return { matched: true, matchedEntry: entry, viaSubsumption: false };
    }
    if (entry.include_subclasses && isSubclassOf && isSubclassOf(targetIRI, entry.iri)) {
      return { matched: true, matchedEntry: entry, viaSubsumption: true };
    }
  }
  return { matched: false, matchedEntry: null, viaSubsumption: false };
}

/**
 * Helper for RoleNC3, RoleNC4 (negative), DispositionNC4 (negative).
 *
 * TRUE if any of the CAU's realization targets is in the social_institutional
 * list (directly or via subsumption).
 *
 * @param {object} input
 * @param {string[]} input.realizationTargets — IRIs from the CAU's
 *   `bfo:isRealizedIn` (or equivalent) restrictions
 * @param {Function} [input.isSubclassOf]
 */
export function cauRealizationRequiresSocialInstitutionalContext(input) {
  const { realizationTargets = [], isSubclassOf } = input;
  const matches = [];
  for (const target of realizationTargets) {
    const result = targetInCategory(target, 'social_institutional', isSubclassOf);
    if (result.matched) matches.push({ target, ...result });
  }
  return {
    result: matches.length > 0,
    matches,
    groundsNC: 'RoleNC3',
    helperIRI: 'cau_realization_requires_social_institutional_context/1',
  };
}

/**
 * Helper for FunctionNC3, RoleNC4 (negative), DispositionNC5 (first branch
 * of the disjunction).
 *
 * TRUE if any of the CAU's realization targets is in the design_expected
 * list (directly or via subsumption). Covers both design-intent (artifact
 * functions) and evolutionary-selection (biological functions) per
 * Spear/Ceusters/Smith 2016.
 */
export function cauHasTeleologicalCommitment(input) {
  const { realizationTargets = [], isSubclassOf } = input;
  const matches = [];
  for (const target of realizationTargets) {
    const result = targetInCategory(target, 'design_expected', isSubclassOf);
    if (result.matched) matches.push({ target, ...result });
  }
  return {
    result: matches.length > 0,
    matches,
    groundsNC: 'FunctionNC3',
    helperIRI: 'cau_has_teleological_commitment/1',
  };
}

/**
 * Helper for DispositionNC3, DispositionNC5 (second branch of disjunction
 * when non-teleological).
 *
 * TRUE if any of the CAU's realization targets is in the causal_triggering
 * list (directly or via subsumption).
 */
export function cauRealizationHasTriggeringCircumstances(input) {
  const { realizationTargets = [], isSubclassOf } = input;
  const matches = [];
  for (const target of realizationTargets) {
    const result = targetInCategory(target, 'causal_triggering', isSubclassOf);
    if (result.matched) matches.push({ target, ...result });
  }
  return {
    result: matches.length > 0,
    matches,
    groundsNC: 'DispositionNC3',
    helperIRI: 'cau_realization_has_triggering_circumstances/1',
  };
}

/**
 * Evaluate all three helpers against a CAU's realization targets and return
 * the combined result. Surfaces multi-category overlap explicitly — the
 * caller decides how to route (cascade vs Plausible) per the SME-specified
 * multi-category overlap rule (see project_d16_curated_process_lists_delivery.md).
 *
 * @returns {object}
 *   {
 *     social: HelperResult,
 *     design: HelperResult,
 *     causal: HelperResult,
 *     matchCount: number — how many helpers returned true
 *     multiCategory: boolean — true if matchCount > 1; signals to caller to route Plausible
 *     singleCategory: string|null — category key if matchCount === 1, else null
 *   }
 */
export function evaluateAllHelpers(input) {
  const social = cauRealizationRequiresSocialInstitutionalContext(input);
  const design = cauHasTeleologicalCommitment(input);
  const causal = cauRealizationHasTriggeringCircumstances(input);
  const matches = [
    { key: 'social_institutional', result: social.result },
    { key: 'design_expected', result: design.result },
    { key: 'causal_triggering', result: causal.result },
  ].filter(m => m.result);

  return {
    social,
    design,
    causal,
    matchCount: matches.length,
    multiCategory: matches.length > 1,
    singleCategory: matches.length === 1 ? matches[0].key : null,
    matchedCategories: matches.map(m => m.key),
  };
}

/**
 * Route a realizable-entity CAU per the curated-list helpers. Implements
 * the SME-specified multi-category overlap rule: single match → cascade
 * placement; multi-match → Plausible with evidence annotation; zero-match →
 * Plausible (non-coverage handling per the curated list's policy field).
 *
 * This is the function that replaces the synthetic-flag-based
 * `routeRealizableCAU` in the Band 4 scaffold. It consumes actual CAU
 * realization targets + the curated lists + optional subsumption resolver.
 */
export function routeRealizableCAUViaCuratedLists(input) {
  const combined = evaluateAllHelpers(input);

  if (combined.multiCategory) {
    // SME-specified: multi-category → Plausible with evidence annotation.
    // Do NOT force-select via §5.1 cascade or taxonomic subsumption.
    return {
      disposition: 'Plausible',
      evidenceAnnotations: {
        candidateBFOCategories: combined.matchedCategories.map(key => ({
          category: categoryKeyToBFOClass(key),
          reason: 'multi-category-realization-target',
          helperMatches: combinedHelperMatches(combined, key),
        })),
        analystNoteRequired: 'Realization spans multiple curated process categories; analyst review required per three-state evidence model. Forced-selection via cascade would produce confident-wrong classification.',
        structureIsJSON: true,
      },
      multiCategoryOverlapDetected: true,
    };
  }

  if (combined.singleCategory === 'design_expected') {
    return { disposition: 'Entailed', bfoCategory: 'bfo:Function', routedBy: 'FunctionNC3-via-curated-list' };
  }
  if (combined.singleCategory === 'social_institutional') {
    return { disposition: 'Entailed', bfoCategory: 'bfo:Role', routedBy: 'RoleNC3-via-curated-list' };
  }
  if (combined.singleCategory === 'causal_triggering') {
    return { disposition: 'Entailed', bfoCategory: 'bfo:Disposition', routedBy: 'DispositionNC3-via-curated-list' };
  }

  // No match — non-coverage handling per curated-list policy.
  return {
    disposition: 'Plausible',
    evidenceAnnotations: {
      candidateBFOCategories: [
        { category: 'bfo:Role' },
        { category: 'bfo:Function' },
        { category: 'bfo:Disposition' },
      ],
      analystNoteRequired: 'Role/Function/Disposition distinction requires context analyst must supply',
      nonCoverageFromCuratedLists: true,
    },
  };
}

function categoryKeyToBFOClass(key) {
  const map = {
    social_institutional: 'bfo:Role',
    design_expected: 'bfo:Function',
    causal_triggering: 'bfo:Disposition',
  };
  return map[key] || null;
}

function combinedHelperMatches(combined, categoryKey) {
  const keyToHelper = {
    social_institutional: combined.social,
    design_expected: combined.design,
    causal_triggering: combined.causal,
  };
  return keyToHelper[categoryKey].matches;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Wave 2 helpers (Week 8) — per SME locked design sketch 2026-04-22.
 * Axiom-pattern helpers reasoning over CAU Signatures (not curated lists).
 * OWA/CWA posture per helper; see specs/d16/wave2-helpers-design-sketch.md.
 * Awaiting SME Prolog-rule validation per the standing offer.
 *
 * Implementation order per Aaron Week 8 green-light: SDCNC3 → GDCNC3 (depends
 * on SDCNC3 helper) → QualityNC3 (independent, parallelizable).
 * ────────────────────────────────────────────────────────────────────────── */

const BFO_INHERES_IN_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000052',
  'bfo:0000052',
  'bfo:inheresIn',
]);

function isInheresInProperty(iri) {
  return BFO_INHERES_IN_IRIS.has(iri);
}

/**
 * Helper for SDCNC3 (High-priority; tagged CURATED-NC but sme_locked:false).
 * Prolog body: cau_bearer_is_particular_not_generic(CAU).
 *
 * OWA/CWA posture: pure CWA (positive check only). No derivation attempt
 * needed. Absence of inheresIn or absence of particular-bearer patterns
 * returns false — the CAU is not particular-bearing at the axiom level.
 *
 * Three patterns satisfy the helper (any one suffices):
 *   1. Target of inheresIn is owl:NamedIndividual (via isNamedIndividual callback)
 *   2. Target of inheresIn is singleton class (via isSingletonClass callback)
 *   3. Cardinality-1 on inheresIn (simplified per SME 2026-04-22 decision 3)
 *
 * Conservative-false when callbacks absent: pattern 1 and pattern 2 require
 * their respective callbacks to return true. Pattern 3 is Signature-resolvable.
 * If both callbacks are absent and pattern 3 doesn't fire, the helper returns
 * false — routing the caller to treat the CAU as generic-bearing.
 *
 * Does NOT recurse into bearer's own declarations (per SME adversarial test
 * case: circular bearer relationships evaluate at CAU level only).
 *
 * @param {object} input
 * @param {object} input.signature — the CAU's Normalized Logical Signature
 * @param {Function} [input.isNamedIndividual] — optional (iri) => boolean
 * @param {Function} [input.isSingletonClass] — optional (iri) => boolean
 * @returns {object}
 */
export function cauBearerIsParticularNotGeneric(input) {
  const { signature, isNamedIndividual, isSingletonClass } = input;
  if (!signature) throw new Error('cauBearerIsParticularNotGeneric: signature required');

  // Gate: CAU must have at least one inheresIn restriction.
  const inheresInRestrictions = (signature.propertyRestrictionsAsDomain || [])
    .filter(r => isInheresInProperty(r.property));
  if (inheresInRestrictions.length === 0) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'no_inheresIn_restrictions',
      groundsNC: 'SDCNC3',
      helperIRI: 'cau_bearer_is_particular_not_generic/1',
    };
  }

  // Pattern 3 (simplified): cardinality-1 on inheresIn.
  // Matches cardinality OR qualifiedCardinality equal to 1.
  const cardinality1Matches = (signature.cardinalityRestrictions || []).filter(r =>
    isInheresInProperty(r.onProperty) &&
    (r.cardinality === 1 || r.qualifiedCardinality === 1)
  );
  if (cardinality1Matches.length > 0) {
    return {
      result: true,
      matchedPattern: 3,
      matches: cardinality1Matches,
      groundsNC: 'SDCNC3',
      helperIRI: 'cau_bearer_is_particular_not_generic/1',
      semanticNote: 'Pattern 3 (simplified): cardinality-1 on inheresIn. No curated bearer-class list per SME decision 3.',
    };
  }

  // Pattern 1: target is NamedIndividual (requires callback; conservative-false otherwise).
  if (isNamedIndividual) {
    const individualMatches = inheresInRestrictions.filter(r => isNamedIndividual(r.target));
    if (individualMatches.length > 0) {
      return {
        result: true,
        matchedPattern: 1,
        matches: individualMatches,
        groundsNC: 'SDCNC3',
        helperIRI: 'cau_bearer_is_particular_not_generic/1',
        semanticNote: 'Pattern 1: target of inheresIn is owl:NamedIndividual.',
      };
    }
  }

  // Pattern 2: target is singleton class (requires callback; conservative-false otherwise).
  if (isSingletonClass) {
    const singletonMatches = inheresInRestrictions.filter(r => isSingletonClass(r.target));
    if (singletonMatches.length > 0) {
      return {
        result: true,
        matchedPattern: 2,
        matches: singletonMatches,
        groundsNC: 'SDCNC3',
        helperIRI: 'cau_bearer_is_particular_not_generic/1',
        semanticNote: 'Pattern 2: target of inheresIn is singleton class.',
      };
    }
  }

  return {
    result: false,
    matchedPattern: null,
    reason: 'no_pattern_satisfied',
    inheresInTargetsConsidered: inheresInRestrictions.map(r => r.target),
    callbacksPresent: {
      isNamedIndividual: Boolean(isNamedIndividual),
      isSingletonClass: Boolean(isSingletonClass),
    },
    groundsNC: 'SDCNC3',
    helperIRI: 'cau_bearer_is_particular_not_generic/1',
    semanticNote: 'No pattern satisfied. inheresIn restrictions present but target(s) are generic-class or callbacks unavailable to confirm individual/singleton status.',
  };
}

const BFO_CONCRETIZES_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000058',
  'bfo:0000058',
  'bfo:concretizes',
]);

function isConcretizesProperty(iri) {
  return BFO_CONCRETIZES_IRIS.has(iri);
}

/**
 * Helper for GDCNC3 (High-priority SME-LOCKED).
 * Prolog body: cau_admits_multiple_simultaneous_concretizations(CAU),
 *              \+ cau_bearer_is_particular_not_generic(CAU).
 *
 * OWA/CWA posture: mixed — positive conjunct Option B (strict); negative
 * conjunct reuses SDCNC3 helper.
 *
 * Option B per SME locked decision 2 (2026-04-22):
 *   - Pattern 2 (explicit `minCardinality > 1` on concretizes) OR
 *   - Pattern 3 (cross-instance-concretization axioms via callback)
 * must hold. Pattern 1 (cardinality-absence alone) does NOT satisfy —
 * absence of constraint evidence is NOT positive evidence of admits-multiple
 * per the architectural principle "absence of axiomatic evidence for one
 * category is NOT positive evidence for another."
 *
 * Cardinality-1 disqualifier: if concretizes has cardinality === 1,
 * qualifiedCardinality === 1, or maxCardinality === 1, the CAU admits
 * only one concretization — helper returns false regardless of other signals.
 *
 * Structured failure reasons per SME observation 2026-04-22:
 *   - 'no_concretizes_restrictions' — gate failure (no concretizes axioms)
 *   - 'positive_conjunct_failed_option_b' — gate passed but no pattern 2/3 evidence
 *   - 'cardinality_limits_to_single_concretization' — pattern 1/2/3 present but cardinality-1 disqualifier fires
 *   - 'particular_bearer_present_via_sdcnc3' — negative-conjunct fails (SDCNC3 fires true)
 *
 * @param {object} input
 * @param {object} input.signature
 * @param {Function} [input.hasCrossInstanceConcretizationAxioms] — optional (signature) => boolean for pattern 3
 * @param {Function} [input.isNamedIndividual] — forwarded to SDCNC3 helper for the negative conjunct
 * @param {Function} [input.isSingletonClass] — forwarded to SDCNC3 helper
 */
export function cauAdmitsMultipleSimultaneousConcretizations(input) {
  const { signature, hasCrossInstanceConcretizationAxioms, isNamedIndividual, isSingletonClass } = input;
  if (!signature) throw new Error('cauAdmitsMultipleSimultaneousConcretizations: signature required');

  // Gate: must have at least one concretizes restriction.
  const concretizesRestrictions = (signature.propertyRestrictionsAsDomain || [])
    .filter(r => isConcretizesProperty(r.property));
  if (concretizesRestrictions.length === 0) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'no_concretizes_restrictions',
      groundsNC: 'GDCNC3',
      helperIRI: 'cau_admits_multiple_simultaneous_concretizations/1',
    };
  }

  // Cardinality-1 disqualifier: check BEFORE positive conjunct because even if
  // pattern 2 fires on minCardinality>1, an explicit cardinality-1 contradicts
  // admits-multiple. Single disqualifier wins.
  const cardinality1Disqualifier = (signature.cardinalityRestrictions || []).filter(r =>
    isConcretizesProperty(r.onProperty) &&
    (r.cardinality === 1 || r.qualifiedCardinality === 1 || r.maxCardinality === 1)
  );
  if (cardinality1Disqualifier.length > 0) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'cardinality_limits_to_single_concretization',
      disqualifierMatches: cardinality1Disqualifier,
      groundsNC: 'GDCNC3',
      helperIRI: 'cau_admits_multiple_simultaneous_concretizations/1',
      semanticNote: 'Cardinality-1 constraint on concretizes disqualifies admits-multiple even when other signals are present.',
    };
  }

  // Positive conjunct (Option B strict):
  //   Pattern 2: explicit minCardinality > 1 on concretizes
  //   OR
  //   Pattern 3: cross-instance-concretization axioms via callback
  const pattern2Matches = (signature.cardinalityRestrictions || []).filter(r =>
    isConcretizesProperty(r.onProperty) &&
    typeof r.minCardinality === 'number' && r.minCardinality > 1
  );
  const pattern3 = hasCrossInstanceConcretizationAxioms
    ? hasCrossInstanceConcretizationAxioms(signature)
    : false;

  if (pattern2Matches.length === 0 && !pattern3) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'positive_conjunct_failed_option_b',
      pattern2Checked: pattern2Matches.length,
      pattern3CallbackProvided: Boolean(hasCrossInstanceConcretizationAxioms),
      pattern3Result: pattern3,
      groundsNC: 'GDCNC3',
      helperIRI: 'cau_admits_multiple_simultaneous_concretizations/1',
      semanticNote: 'Option B strict: pattern 1 (cardinality-absence) alone does NOT satisfy. Requires explicit minCardinality > 1 or cross-instance axioms.',
    };
  }

  const matchedPattern = pattern2Matches.length > 0 ? 2 : 3;

  // Negative conjunct: SDCNC3 must return false.
  const sdcnc3Result = cauBearerIsParticularNotGeneric({ signature, isNamedIndividual, isSingletonClass });
  if (sdcnc3Result.result) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'particular_bearer_present_via_sdcnc3',
      sdcnc3Result,
      positiveConjunctWouldHaveFired: matchedPattern,
      groundsNC: 'GDCNC3',
      helperIRI: 'cau_admits_multiple_simultaneous_concretizations/1',
      semanticNote: 'Negative conjunct failed: SDCNC3 fires true (CAU is particular-bearing). Routes to Plausible via multi-category evaluator review per three-state evidence model.',
    };
  }

  return {
    result: true,
    matchedPattern,
    pattern2Matches: matchedPattern === 2 ? pattern2Matches : [],
    pattern3Fired: matchedPattern === 3,
    sdcnc3Result: sdcnc3Result.result,
    groundsNC: 'GDCNC3',
    helperIRI: 'cau_admits_multiple_simultaneous_concretizations/1',
    semanticNote: `Positive conjunct fired via pattern ${matchedPattern}; negative conjunct satisfied (SDCNC3 false). CAU admits multiple simultaneous concretizations and is not particular-bearing.`,
  };
}

const BFO_EXISTS_AT_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000108',
  'bfo:0000108',
  'bfo:existsAt',
]);

const BFO_IS_REALIZED_IN_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000054',
  'bfo:0000054',
  'bfo:isRealizedIn',
  'bfo:realizedIn',
]);

const BFO_QUALITY_IRIS = new Set([
  'http://purl.obolibrary.org/obo/BFO_0000019',
  'bfo:0000019',
  'bfo:Quality',
]);

function isExistsAtProperty(iri) {
  return BFO_EXISTS_AT_IRIS.has(iri);
}

function isRealizedInProperty(iri) {
  return BFO_IS_REALIZED_IN_IRIS.has(iri);
}

/**
 * Helper for QualityNC3 (High-priority SME-LOCKED).
 * Prolog body: cau_always_realized_when_bearer_exists(CAU),
 *              \+ cau_realization_has_triggering_circumstances(CAU).
 *
 * OWA/CWA posture: mixed — positive conjunct Option B (strict); negative
 * conjunct reuses Wave 0 cauRealizationHasTriggeringCircumstances.
 *
 * Option B per SME locked decision 1 (2026-04-22):
 *   - Pattern 1 (existsAt + inheresIn co-extension) OR
 *   - Pattern 3 (continuous-attribute class subsumption via isSubclassOf callback targeting bfo:Quality)
 * must hold. Pattern 2 (realizedIn-absence alone) does NOT satisfy — per
 * the architectural principle "absence of axiomatic evidence for one
 * category is NOT positive evidence for another."
 *
 * Structured failure reasons per SME-surfaced pattern:
 *   - 'no_inheresIn_restrictions' — gate failure
 *   - 'triggering_realization_present' — negative conjunct fails (Wave 0 causal helper fires true)
 *   - 'positive_conjunct_failed_option_b' — gate passed but no pattern 1/3 evidence
 *
 * @param {object} input
 * @param {object} input.signature
 * @param {string[]} [input.realizationTargets] — optional; auto-extracted from signature.existentialRestrictions if omitted
 * @param {Function} [input.isSubclassOf] — optional (sub, super) => boolean for pattern 3 and Wave 0 helper
 */
export function cauAlwaysRealizedWhenBearerExists(input) {
  const { signature, isSubclassOf } = input;
  if (!signature) throw new Error('cauAlwaysRealizedWhenBearerExists: signature required');

  // Gate: must have at least one inheresIn restriction (Quality is SDC).
  const inheresInRestrictions = (signature.propertyRestrictionsAsDomain || [])
    .filter(r => isInheresInProperty(r.property));
  if (inheresInRestrictions.length === 0) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'no_inheresIn_restrictions',
      groundsNC: 'QualityNC3',
      helperIRI: 'cau_always_realized_when_bearer_exists/1',
    };
  }

  // Realization targets: use input if provided, else auto-extract from Signature.
  const realizationTargets = input.realizationTargets !== undefined
    ? input.realizationTargets
    : (signature.existentialRestrictions || [])
        .filter(r => isRealizedInProperty(r.onProperty))
        .map(r => r.someValuesFrom);

  // Negative conjunct: no causal-triggering realization.
  // Reuses Wave 0 helper; callbacks forwarded transparently.
  const causalResult = cauRealizationHasTriggeringCircumstances({
    realizationTargets,
    isSubclassOf,
  });
  if (causalResult.result) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'triggering_realization_present',
      causalTriggeringMatches: causalResult.matches,
      realizationTargetsChecked: realizationTargets,
      groundsNC: 'QualityNC3',
      helperIRI: 'cau_always_realized_when_bearer_exists/1',
      semanticNote: 'Negative conjunct failed: CAU has realization target in causal_triggering curated list. Routes to Plausible via multi-category evaluator review — Quality requires always-realized semantics, incompatible with triggered realization.',
    };
  }

  // Positive conjunct (Option B strict):
  //   Pattern 1: existsAt + inheresIn co-extension
  //   OR
  //   Pattern 3: CAU is subclass of bfo:Quality via callback
  const existsAtRestrictions = (signature.propertyRestrictionsAsDomain || [])
    .filter(r => isExistsAtProperty(r.property));
  const pattern1 = existsAtRestrictions.length > 0 && inheresInRestrictions.length > 0;

  const pattern3 = isSubclassOf
    ? Array.from(BFO_QUALITY_IRIS).some(q => isSubclassOf(signature.cauIRI, q))
    : false;

  if (!pattern1 && !pattern3) {
    return {
      result: false,
      matchedPattern: null,
      reason: 'positive_conjunct_failed_option_b',
      pattern1Checked: {
        existsAtPresent: existsAtRestrictions.length > 0,
        inheresInPresent: inheresInRestrictions.length > 0,
        coExtensionConfirmed: pattern1,
      },
      pattern3Checked: {
        isSubclassOfCallbackProvided: Boolean(isSubclassOf),
        isSubclassOfQuality: pattern3,
      },
      groundsNC: 'QualityNC3',
      helperIRI: 'cau_always_realized_when_bearer_exists/1',
      semanticNote: 'Option B strict: pattern 2 (realizedIn-absence alone) does NOT satisfy. Requires pattern 1 (existsAt + inheresIn co-extension) or pattern 3 (subclass of bfo:Quality).',
    };
  }

  const matchedPattern = pattern1 ? 1 : 3;
  return {
    result: true,
    matchedPattern,
    pattern1Evidence: matchedPattern === 1 ? {
      existsAtMatches: existsAtRestrictions,
      inheresInMatches: inheresInRestrictions,
    } : null,
    pattern3Evidence: matchedPattern === 3 ? {
      cauIRI: signature.cauIRI,
      subclassOfQuality: true,
    } : null,
    negativeConjunctSatisfied: true,
    realizationTargetsChecked: realizationTargets,
    groundsNC: 'QualityNC3',
    helperIRI: 'cau_always_realized_when_bearer_exists/1',
    semanticNote: `Positive conjunct fired via pattern ${matchedPattern}; negative conjunct satisfied (no causal-triggering realization). CAU is always-realized when bearer exists.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Wave 1 helpers (Week 7) — per SME scoping memo 2026-04-22.
 * Pure composition / negation of the three Wave-0 helpers above.
 * Prolog bodies already drafted in bfo-signatures-v1.0.json; awaiting SME
 * Prolog-rule validation per the standing offer.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Helper for RoleNC4 (CRITICAL). Prolog body: `\+ cau_has_teleological_commitment(CAU).`
 *
 * TRUE if the CAU's realization targets are NOT in the design_expected list.
 * Negation of FunctionNC3 helper. Negation-as-failure semantic: absence of
 * design-expected realization is evidence of non-teleology.
 */
export function cauDoesNotHaveTeleologicalCommitment(input) {
  const inner = cauHasTeleologicalCommitment(input);
  return {
    result: !inner.result,
    innerHelperResult: inner.result,
    groundsNC: 'RoleNC4',
    helperIRI: 'not_cau_has_teleological_commitment/1',
    semanticNote: 'Negation-as-failure over FunctionNC3 helper. True iff no realization target in design_expected curated list.',
  };
}

/**
 * Helper for DispositionNC4 (CRITICAL). Prolog body: `\+ cau_realization_requires_social_institutional_context(CAU).`
 *
 * TRUE if the CAU's realization targets are NOT in the social_institutional list.
 * Negation of RoleNC3 helper. Negation-distinguishing feature from Role.
 */
export function cauDoesNotRequireSocialInstitutionalContext(input) {
  const inner = cauRealizationRequiresSocialInstitutionalContext(input);
  return {
    result: !inner.result,
    innerHelperResult: inner.result,
    groundsNC: 'DispositionNC4',
    helperIRI: 'not_cau_realization_requires_social_institutional_context/1',
    semanticNote: 'Negation-as-failure over RoleNC3 helper. True iff no realization target in social_institutional curated list.',
  };
}

/**
 * Helper for DispositionNC5 (CRITICAL-v1.0-corrected). Prolog body:
 *   ( cau_has_teleological_commitment(CAU)
 *   ; ( \+ cau_has_teleological_commitment(CAU),
 *       cau_realization_has_triggering_circumstances(CAU) ) ).
 *
 * Disjunctive: CAU is either (a) a Function (teleological disposition) OR
 * (b) a non-Function Disposition (causal triggering without teleology).
 *
 * The negation guard on the second disjunct prevents Function CAUs from
 * matching both branches, which would defeat cascade determinism. This is
 * the 2026-04-18 SME correction recorded in bfo-signatures-v1.0.json
 * classification_notes.dispositionNC5_disjunctive_form.
 */
export function cauDispositionDisjunctive(input) {
  const design = cauHasTeleologicalCommitment(input);
  const causal = cauRealizationHasTriggeringCircumstances(input);

  // Branch A: Function CAU (teleological) — satisfies DispositionNC5.
  if (design.result) {
    return {
      result: true,
      branch: 'A-teleological',
      branchAMatches: design.matches,
      branchBMatches: [],
      groundsNC: 'DispositionNC5',
      helperIRI: 'cau_disposition_disjunctive/1',
      semanticNote: 'Branch A fired: CAU has teleological commitment; is a Function (Function ⊂ Disposition in BFO 2020).',
    };
  }

  // Branch B: non-Function Disposition (no teleology AND has triggering circumstances).
  // The negation guard here (!design.result) is already established by the if-branch above.
  if (causal.result) {
    return {
      result: true,
      branch: 'B-causal-triggering',
      branchAMatches: [],
      branchBMatches: causal.matches,
      groundsNC: 'DispositionNC5',
      helperIRI: 'cau_disposition_disjunctive/1',
      semanticNote: 'Branch B fired: CAU has no teleological commitment AND has triggering circumstances; is a non-Function Disposition.',
    };
  }

  // Neither branch fires — CAU is not a Disposition per NC5.
  return {
    result: false,
    branch: null,
    branchAMatches: [],
    branchBMatches: [],
    groundsNC: 'DispositionNC5',
    helperIRI: 'cau_disposition_disjunctive/1',
    semanticNote: 'Neither disjunct fired: no teleological commitment and no triggering circumstances. Not a Disposition under NC5.',
  };
}

/**
 * Helper for FunctionNC4 (High-priority). Prolog body: `cau_realization_is_design_expected(CAU).`
 *
 * Per SME scoping memo 2026-04-22 (option 1): a separate helper that queries
 * the same `design_expected` curated list as FunctionNC3. Semantic distinction
 * preserved at the helper layer — FunctionNC3 is about bearer's design
 * history (was it designed-for?); FunctionNC4 is about realization's design-
 * expectedness (is this realization what was designed-for?). For v1.0 curated
 * list, both produce identical results, but the split lets future amendments
 * differentiate list entries between "teleologically committed but not design-
 * expected for this realization" cases without breaking helper boundaries.
 */
export function cauRealizationIsDesignExpected(input) {
  const { realizationTargets = [], isSubclassOf } = input;
  const matches = [];
  for (const target of realizationTargets) {
    const result = targetInCategory(target, 'design_expected', isSubclassOf);
    if (result.matched) matches.push({ target, ...result });
  }
  return {
    result: matches.length > 0,
    matches,
    groundsNC: 'FunctionNC4',
    helperIRI: 'cau_realization_is_design_expected/1',
    semanticNote: 'Queries design_expected curated list (same as FunctionNC3 per v1.0 scoping). Separate helper preserves bearer-history vs realization-expectedness distinction at helper layer.',
  };
}

/**
 * Return the populated curated-list metadata for inspection / validation
 * / reporting. Used by the SME validation artifact.
 */
export function curatedListsMetadata() {
  const d = curatedLists['curated_process_categories_v1.0'];
  return {
    schemaVersion: d.schema_version,
    versionIdentifier: d.version_identifier,
    authoredDate: d.authored_date,
    authoredBy: d.authored_by,
    totalEntries: Object.values(d.categories).reduce((sum, c) => sum + c.entries.length, 0),
    categoryCounts: Object.fromEntries(
      Object.entries(d.categories).map(([key, cat]) => [key, cat.entries.length])
    ),
    sourceMaterials: d.source_materials,
  };
}
