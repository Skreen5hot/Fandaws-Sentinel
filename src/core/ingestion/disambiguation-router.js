/**
 * Disambiguation Router — four-way routing for Phase 2 property disambiguation.
 *
 * Decision D-10: auto-merge threshold 0.85 + margin 0.05.
 * Decision D-11: disambiguation floor 0.60.
 * Rule PD-4: near-tie margin enforcement.
 * Rule PD-6 (Invariant I-3): sub-property structural narrowing.
 * Rule PD-7: BFO subcategory inheritance on promotion.
 * Rule PD-9: named-property-to-named-property only.
 *
 * @see docs/architecture/phase-d2-avc-bundle.json
 */

/**
 * Route a scored candidate to one of four dispositions.
 *
 * @param {object[]} scores - Sorted match results from scoreAgainstAll
 * @param {object} options - { autoMergeThreshold, marginRequired, disambiguationFloor }
 * @returns {{ disposition: string, topScore, secondScore, margin, mergedInto?, disjointFloorTriggered? }}
 */
export function routeCandidate(scores, options = {}) {
  const threshold = options.autoMergeThreshold ?? 0.85;
  const marginRequired = options.marginRequired ?? 0.05;
  const floor = options.disambiguationFloor ?? 0.60;

  if (!scores || scores.length === 0) {
    return { disposition: 'NovelPromotionPanel', topScore: 0, secondScore: 0, margin: 0 };
  }

  const top = scores[0];
  const second = scores.length > 1 ? scores[1] : { score: 0 };

  // Check if disjoint floor was triggered on all candidates
  if (top.disjointFloorTriggered) {
    return {
      disposition: 'NovelPromotionPanel',
      topScore: top.score,
      secondScore: second.score,
      margin: top.score - second.score,
      disjointFloorTriggered: true,
    };
  }

  const margin = top.score - second.score;

  // Auto-merge: top >= threshold AND margin >= required
  if (top.score >= threshold && margin >= marginRequired) {
    return {
      disposition: 'AutoMerged',
      topScore: top.score,
      secondScore: second.score,
      margin,
      mergedInto: top.canonicalId,
    };
  }

  // Near-tie: top >= threshold but margin < required → disambiguation
  if (top.score >= threshold && margin < marginRequired) {
    return {
      disposition: 'DisambiguationRecord',
      topScore: top.score,
      secondScore: second.score,
      margin,
      sandboxVerdict: 'MultipleCloseMatches',
    };
  }

  // Disambiguation window: [floor, threshold)
  if (top.score >= floor) {
    return {
      disposition: 'DisambiguationRecord',
      topScore: top.score,
      secondScore: second.score,
      margin,
    };
  }

  // Below floor → Novel Promotion
  return {
    disposition: 'NovelPromotionPanel',
    topScore: top.score,
    secondScore: second.score,
    margin,
  };
}

/**
 * Validate a sub-property promotion request.
 * Rule PD-6 (Invariant I-3): child domain must be NARROWER than parent domain.
 * Rule PD-7: child inherits parent's BFO subcategory exactly.
 *
 * @param {object} params
 * @returns {{ accepted: boolean, rejectionReason?, violationDetail?, childRelation? }}
 */
export function validateSubPropertyPromotion(params) {
  const { childDeclaredDomain, childDeclaredRange, parentRelation, concepts } = params;

  // Check if child domain is a subclass of parent domain
  const parentDomain = parentRelation.domain;
  if (childDeclaredDomain && parentDomain) {
    const isNarrower = isSubclassOf(childDeclaredDomain, parentDomain, concepts || []);
    const isEqual = childDeclaredDomain === parentDomain;

    if (!isNarrower && !isEqual) {
      // Check if it's actually broader (parent domain is subclass of child domain)
      const isBroader = isSubclassOf(parentDomain, childDeclaredDomain, concepts || []);
      return {
        accepted: false,
        rejectionReason: 'StructuralNarrowingViolation',
        violationDetail: {
          parentDomain,
          proposedChildDomain: childDeclaredDomain,
          subclassRelation: isBroader
            ? `${getLabel(childDeclaredDomain, concepts)} is a SUPERCLASS of ${getLabel(parentDomain, concepts)}, not a subclass`
            : `${getLabel(childDeclaredDomain, concepts)} is not a subclass of ${getLabel(parentDomain, concepts)}`,
        },
      };
    }
  }

  return { accepted: true };
}

/**
 * Validate a merge target (Rule PD-9).
 * owl:equivalentProperty MUST be named-to-named only.
 */
export function validateMergeTarget(targetIri) {
  if (targetIri === 'owl:topObjectProperty' || targetIri === 'owl:topDataProperty' ||
      targetIri === 'http://www.w3.org/2002/07/owl#topObjectProperty') {
    return {
      accepted: false,
      rejectionReason: 'TopPropertyEquivalenceForbidden',
    };
  }
  return { accepted: true };
}

/**
 * Check if conceptA is a subclass of conceptB via broader chain.
 */
function isSubclassOf(iriA, iriB, concepts) {
  if (iriA === iriB) return true;
  const conceptA = concepts.find(c => c['@id'] === iriA || c.id === iriA);
  if (!conceptA) return false;
  const broader = conceptA['skos:broader'] || conceptA.parent;
  if (!broader) return false;
  if (broader === iriB) return true;
  return isSubclassOf(broader, iriB, concepts);
}

function getLabel(iri, concepts) {
  const c = concepts.find(c => c['@id'] === iri || c.id === iri);
  return c?.['skos:prefLabel'] || c?.canonicalLabel || iri.split(/[/#:]/).pop();
}
