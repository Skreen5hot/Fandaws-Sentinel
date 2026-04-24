/**
 * Three-State Evidence Evaluator — D1.6 §4 (Rules EV-1 through EV-4)
 *
 * SCAFFOLD SCOPE (Week 2):
 *   This module implements the evidence-routing shell — the logic that maps
 *   NC satisfaction patterns to dispositions (Entailed / Plausible /
 *   Inconsistent / NotApplicable) and produces evidence records in the
 *   canonical shape. It does NOT yet integrate with Tau Prolog; the
 *   satisfaction of individual NCs is supplied by the caller as a pre-computed
 *   map. Tau Prolog integration comes online in Weeks 4-6 alongside NA-1.1
 *   Taxonomic Descent.
 *
 * Routing per D1.6 §4.6:
 *   - Entailed: all required NCs for target category satisfied AND no
 *     NC of a disjoint category satisfied.
 *   - Plausible: some NCs satisfied across one or more categories but not
 *     all required for any single Entailment. Annotated with partial-match
 *     evidence.
 *   - Inconsistent: NCs of two disjoint categories both satisfied. Cannot
 *     both be correct; neither is admitted.
 *   - NotApplicable: the CAU has no BFO-relevant axioms (axiom-poor per
 *     D1.6-L13); no placement attempted.
 *
 * Operational states (PendingHumanResolution, IterationNonConvergence) are
 * routed by the iterative pipeline, not this evaluator.
 */

import bfoSignatures from '../../../specs/d16/bfo-signatures-v1.0.json' with { type: 'json' };

/**
 * Evaluate a CAU against the BFO reference.
 *
 * @param {object} input
 * @param {string} input.cauIRI — compact or full IRI of the CAU under evaluation
 * @param {string} input.targetCategory — BFO category being tested (e.g., "bfo:Process")
 * @param {Set<string>|Array<string>} input.satisfiedNCs — NC short-form IRIs (e.g., "bfo:ProcessNC1") the CAU satisfies. In production this is computed by Tau Prolog query; in scaffold mode it's supplied synthetically per test scenario.
 * @param {boolean} [input.axiomPoor] — true if the CAU has no BFO-relevant axioms (triggers NotApplicable).
 * @returns {object} evidence record
 */
export function evaluateCAU(input) {
  // SME-D16-X4 Commit 3: trichotomy integration.
  //
  // API accepts one of two input modes:
  //   (a) Legacy: input.satisfiedNCs — Set or Array of NC short-IRIs. No
  //       undetermined information; every non-satisfied NC is treated as
  //       implicitly unsatisfied. Preserves SYNTHETIC_NC_SATISFACTION
  //       allowlist tests + any caller pre-computing satisfied directly.
  //   (b) Trichotomy: input.ncEvaluation — { satisfied, unsatisfied,
  //       undetermined, evidence } from nc-dispatcher. Carries
  //       coverage-gap information via undetermined Set for Plausible
  //       routing per §4.1 branch #3.
  //
  // Mode detection: if ncEvaluation is provided, use it; else legacy.
  //
  // Cross-category disjointness check (Inconsistent routing): evaluateCAU
  // inspects input.satisfiedNCs for NCs of disjoint categories. Under
  // trichotomy mode, the orchestrator is responsible for combining
  // satisfied sets across target + disjoint categories into a unified
  // satisfiedNCs set. If only ncEvaluation is provided (no cross-category
  // satisfied), Inconsistent can still fire via signature-level direct
  // disjointness axioms (consumed in future commits); the pure-NC-
  // satisfaction path to Inconsistent requires the orchestrator to supply
  // cross-category coverage.
  const usingTrichotomy = !!input.ncEvaluation;
  const satisfied = usingTrichotomy
    ? new Set([...input.ncEvaluation.satisfied, ...(input.satisfiedNCs || [])])
    : new Set(input.satisfiedNCs || []);
  const undetermined = usingTrichotomy
    ? new Set(input.ncEvaluation.undetermined)
    : new Set();

  if (input.axiomPoor) {
    return {
      disposition: 'NotApplicable',
      bfoCategory: null,
      explanation: {
        reason: 'axiom-poor CAU; no BFO-relevant axioms declared (D1.6-L13)',
        satisfiedConditionIRIs: [],
        unsatisfiedConditionIRIs: [],
        disjointViolations: [],
      },
    };
  }

  const targetCategory = input.targetCategory;
  const requiredNCsForTarget = necessaryConditionsFor(targetCategory);

  // CuratedReferenceIncomplete warning path (D1.6-L9): if the curated BFO
  // Signature Reference has zero required NCs for the target category, we
  // cannot reach Entailed — Entailment requires mechanical satisfaction of
  // curated conditions. Route to Plausible with explicit warning so the
  // analyst knows the blocker is a curation gap, not a CAU-axiom gap.
  // Implementer MUST NOT fall back to heuristic NC inference per D1.6-L9.
  if (requiredNCsForTarget.length === 0) {
    return {
      disposition: 'Plausible',
      warning: 'CuratedReferenceIncomplete',
      bfoCategory: targetCategory,
      explanation: {
        blockedEntailment: 'curated reference lacks necessary conditions for target category',
        satisfiedConditionIRIs: [],
        unsatisfiedConditionIRIs: [],
        disjointViolations: [],
      },
    };
  }

  const satisfiedForTarget = requiredNCsForTarget.filter(nc => satisfied.has(nc.shortIRI));
  const undeterminedForTarget = requiredNCsForTarget.filter(nc => undetermined.has(nc.shortIRI));
  // Under trichotomy: unsatisfied = required - satisfied - undetermined.
  // Under legacy: unsatisfied = required - satisfied (undetermined is empty).
  const unsatisfiedForTarget = requiredNCsForTarget.filter(
    nc => !satisfied.has(nc.shortIRI) && !undetermined.has(nc.shortIRI)
  );

  const disjointCategories = disjointWith(targetCategory);
  const disjointViolations = [];
  for (const dc of disjointCategories) {
    const dcNCs = necessaryConditionsFor(dc);
    const dcSatisfied = dcNCs.filter(nc => satisfied.has(nc.shortIRI));
    if (dcSatisfied.length === dcNCs.length && dcNCs.length > 0) {
      disjointViolations.push({
        disjointCategory: dc,
        satisfiedNCs: dcSatisfied.map(n => n.shortIRI),
      });
    }
  }

  if (disjointViolations.length > 0) {
    return {
      disposition: 'Inconsistent',
      bfoCategory: targetCategory,
      explanation: {
        satisfiedConditionIRIs: satisfiedForTarget.map(n => n.shortIRI),
        unsatisfiedConditionIRIs: unsatisfiedForTarget.map(n => n.shortIRI),
        undeterminedConditionIRIs: undeterminedForTarget.map(n => n.shortIRI),
        disjointViolations,
      },
    };
  }

  // §4.1 Rule 1: satisfied.size === required.size implies no coverage gap.
  // Per SME clarification §3 note on Rule 1 redundancy (SME approved
  // simplification), the single conjunct suffices under partition invariant.
  // Invariant: unsatisfied + undetermined = ∅ by partition.
  const allRequiredSatisfied = satisfiedForTarget.length === requiredNCsForTarget.length;
  if (allRequiredSatisfied) {
    return {
      disposition: 'Entailed',
      bfoCategory: targetCategory,
      explanation: {
        satisfiedConditionIRIs: satisfiedForTarget.map(n => n.shortIRI),
        unsatisfiedConditionIRIs: [],
        undeterminedConditionIRIs: [],
        disjointViolations: [],
      },
    };
  }

  // Plausible routing — distinguish coverage-gap (undetermined NCs present)
  // from partial-match (unsatisfied NCs present, no undetermined) per §4.1
  // routing branches #3, #4, #5.
  const hasUndetermined = undeterminedForTarget.length > 0;
  const hasUnsatisfied = unsatisfiedForTarget.length > 0;
  const allUndetermined = hasUndetermined && satisfiedForTarget.length === 0 && !hasUnsatisfied;

  const plausibleAnnotation = allUndetermined
    ? 'all-required-undetermined'
    : hasUndetermined
      ? 'partial-coverage-with-undetermined'
      : 'partial-match';

  return {
    disposition: 'Plausible',
    bfoCategory: targetCategory,
    explanation: {
      satisfiedConditionIRIs: satisfiedForTarget.map(n => n.shortIRI),
      unsatisfiedConditionIRIs: unsatisfiedForTarget.map(n => n.shortIRI),
      undeterminedConditionIRIs: undeterminedForTarget.map(n => n.shortIRI),
      disjointViolations: [],
      partialMatchRatio: requiredNCsForTarget.length > 0
        ? satisfiedForTarget.length / requiredNCsForTarget.length
        : 0,
      plausibleAnnotation,
      coverageGap: hasUndetermined
        ? {
          undeterminedCount: undeterminedForTarget.length,
          requiredCount: requiredNCsForTarget.length,
          deferredReasons: usingTrichotomy
            ? collectDeferredReasonsForTarget(undeterminedForTarget, input.ncEvaluation.evidence)
            : [],
        }
        : null,
    },
  };
}

function collectDeferredReasonsForTarget(undeterminedNCs, evidence) {
  if (!evidence) return [];
  const reasons = [];
  for (const nc of undeterminedNCs) {
    const ev = evidence.get(nc.shortIRI);
    if (ev && ev.deferredReason) {
      reasons.push({ nc: nc.shortIRI, reason: ev.deferredReason });
    }
  }
  return reasons;
}

/**
 * Enumerate necessary conditions for a BFO category from the reference JSON.
 *
 * STRICT POLICY (effective 2026-04-21 per SME async decision 2.2):
 *   OWL-DIRECT, OWL-DERIVED, AND CURATED-NC are ALL required for Entailment.
 *   Only CURATED-HEURISTIC is excluded (annotation-only per tag_behavior).
 *
 *   Rationale: the Role/Function/Disposition triad discrimination depends
 *   entirely on CURATED-NC items (RoleNC3, DispositionNC3, FunctionNC3, etc.)
 *   — downgrading CURATED-NC to annotation-only would collapse the cascade
 *   and systematically misclassify the triad. SME: "We cannot compromise the
 *   physics of the system to make tests pass."
 *
 *   Prior Week-2 scaffold policy (OWL-tagged only) is reverted. Band 3 AVC
 *   scenarios whose Entailment expectations excluded CURATED-NC items have
 *   had their assertions updated to match the strict policy.
 *
 * @param {string} category — e.g., "bfo:Process"
 * @returns {Array<{shortIRI: string, tag: string, fullIRI: string}>}
 */
export function necessaryConditionsFor(category) {
  const out = [];
  for (const nc of bfoSignatures.necessary_conditions) {
    if (nc.category !== category) continue;
    if (nc.tag === 'CURATED-HEURISTIC') continue; // annotation-only per tag_behavior
    out.push({
      shortIRI: `bfo:${nc.id}`,
      tag: nc.tag,
      fullIRI: nc.iri,
    });
  }
  return out;
}

/**
 * Return categories disjoint with `category` per the disjointness map.
 */
export function disjointWith(category) {
  const out = new Set();
  for (const pair of bfoSignatures.disjointness_map) {
    if (pair.left === category) out.add(pair.right);
    if (pair.right === category) out.add(pair.left);
  }
  return [...out];
}

/**
 * Return true if subCategory is a (direct or transitive) subclass of superCategory
 * per the subsumption map in the BFO reference.
 */
export function isSubsumedBy(subCategory, superCategory) {
  if (subCategory === superCategory) return false;
  const queue = [subCategory];
  const seen = new Set([subCategory]);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const pair of bfoSignatures.subsumption_map) {
      if (pair.sub === current) {
        if (pair.super === superCategory) return true;
        if (!seen.has(pair.super)) { seen.add(pair.super); queue.push(pair.super); }
      }
    }
  }
  return false;
}

/**
 * Evaluate a CAU against a list of candidate BFO categories. Returns the
 * per-category evaluation shape (one record per category with satisfied /
 * unsatisfied / total). Does NOT pick a winner — use resolveBestPlacement
 * for that.
 */
export function evaluateCAUAgainstCategories(input, categories) {
  return categories.map(category => {
    const result = evaluateCAU({ ...input, targetCategory: category });
    const requiredNCs = necessaryConditionsFor(category);
    return {
      category,
      disposition: result.disposition,
      conditionsSatisfied: result.explanation.satisfiedConditionIRIs.length,
      conditionsTotal: requiredNCs.length,
      satisfiedConditionIRIs: result.explanation.satisfiedConditionIRIs,
      unsatisfiedConditionIRIs: result.explanation.unsatisfiedConditionIRIs,
      disjointViolations: result.explanation.disjointViolations,
    };
  });
}

/**
 * Apply D1.6-L12 resolution to a set of per-category results.
 *
 * Routing:
 *   - Any Inconsistent via disjointness: final disposition Inconsistent (short-circuits)
 *   - All-Entailed set contains disjoint pair: Inconsistent
 *   - All-Entailed set forms subsumption chain: most-specific subsumer wins (Entailed)
 *   - All-Entailed set has non-disjoint siblings: Plausible with annotations
 *   - Any Entailed + some Plausible: Entailed if the Entailed is the most-specific; else Plausible
 *   - All Plausible: Plausible with structured evidence annotations
 *   - All NotApplicable: NotApplicable
 */
export function resolveBestPlacement(perCategoryResults) {
  const inconsistents = perCategoryResults.filter(r => r.disposition === 'Inconsistent');
  if (inconsistents.length > 0) {
    const first = inconsistents[0];
    const violation = first.disjointViolations[0];
    return {
      disposition: 'Inconsistent',
      bfoCategory: first.category,
      routedTo: 'PendingHumanResolution',
      explanation: {
        disjointnessViolation: violation
          ? `${first.category} owl:disjointWith ${violation.disjointCategory}`
          : 'disjointness detected',
        conditionsSatisfied: Object.fromEntries(
          perCategoryResults.map(r => [r.category, r.conditionsSatisfied])
        ),
        resolvedBy: 'disjointness-immediate-inconsistent',
      },
    };
  }

  const entailed = perCategoryResults.filter(r => r.disposition === 'Entailed');

  // Check for disjointness among Entailed categories
  for (let i = 0; i < entailed.length; i++) {
    for (let j = i + 1; j < entailed.length; j++) {
      const disjoints = disjointWith(entailed[i].category);
      if (disjoints.includes(entailed[j].category)) {
        return {
          disposition: 'Inconsistent',
          bfoCategory: null,
          routedTo: 'PendingHumanResolution',
          explanation: {
            disjointnessViolation: `${entailed[i].category} owl:disjointWith ${entailed[j].category}`,
            conditionsSatisfiedLeft: entailed[i].conditionsSatisfied,
            conditionsSatisfiedRight: entailed[j].conditionsSatisfied,
            resolvedBy: 'disjointness-immediate-inconsistent',
          },
        };
      }
    }
  }

  if (entailed.length === 1) {
    return {
      disposition: 'Entailed',
      bfoCategory: entailed[0].category,
      explanation: {
        satisfiedConditionIRIs: entailed[0].satisfiedConditionIRIs,
        unsatisfiedConditionIRIs: [],
        disjointViolations: [],
      },
    };
  }

  if (entailed.length >= 2) {
    // Find the most-specific category — one that is subsumed by every other in the set
    const winners = entailed.filter(candidate =>
      entailed.every(other => candidate === other || isSubsumedBy(candidate.category, other.category))
    );
    if (winners.length === 1) {
      return {
        disposition: 'Entailed',
        bfoCategory: winners[0].category,
        resolution: {
          strategy: 'most-specific-subsumer',
          rationale: `${winners[0].category} rdfs:subClassOf ${entailed.find(e => e !== winners[0]).category}; most specific subsumer wins per D1.6-L12`,
          evidenceCountBreakdown: 'not_used_for_resolution',
        },
        explanation: {
          satisfiedConditionIRIs: winners[0].satisfiedConditionIRIs,
          unsatisfiedConditionIRIs: [],
          disjointViolations: [],
        },
      };
    }
    // Non-subsumption sibling ambiguity → Plausible
    return {
      disposition: 'Plausible',
      evidenceAnnotations: {
        candidateBFOCategories: entailed.map(r => ({
          category: r.category,
          conditionsSatisfied: r.conditionsSatisfied,
          conditionsTotal: r.conditionsTotal,
          satisfiedConditionIRIs: r.satisfiedConditionIRIs,
        })),
        structureIsJSON: true,
        textualProse: 'absent',
      },
    };
  }

  // No Entailed — aggregate Plausible annotations
  const plausibles = perCategoryResults.filter(r => r.disposition === 'Plausible' && r.conditionsSatisfied > 0);
  if (plausibles.length > 0) {
    return {
      disposition: 'Plausible',
      evidenceAnnotations: {
        candidateBFOCategories: plausibles.map(r => ({
          category: r.category,
          conditionsSatisfied: r.conditionsSatisfied,
          conditionsTotal: r.conditionsTotal,
          satisfiedConditionIRIs: r.satisfiedConditionIRIs,
          axiomsContributing: [], // populated in real Tau Prolog integration
        })),
        structureIsJSON: true,
        textualProse: 'absent',
      },
    };
  }

  return {
    disposition: 'NotApplicable',
    bfoCategory: null,
    explanation: { reason: 'no category matched', satisfiedConditionIRIs: [], unsatisfiedConditionIRIs: [], disjointViolations: [] },
  };
}
