/**
 * Placement Sandbox — JavaScript heuristic rules for BFO class placement.
 *
 * Evaluates external classes against four heuristic categories to determine
 * BFO placement with confidence scoring. Pure function: external class data
 * in → { placement, confidence, justification } out.
 *
 * Decision D-3: JavaScript validation, not Prolog.
 * Decision D-7: Placement thresholds (≥0.7 single = Confirmed, delta rule).
 *
 * @see docs/architecture/phase-d-locked-decisions.md
 */

// ── BFO Property-to-Domain Lookup Table ──
// Property NAME as signal for BFO category (Q3 answer: option c).
// Maps known BFO property names to their BFO domain class.

const BFO_PROPERTY_DOMAIN = {
  'has_participant': 'Process',
  'participates_in': 'MaterialEntity',
  'has_part': 'IndependentContinuant',
  'part_of': 'IndependentContinuant',
  'inheres_in': 'Quality',
  'bearer_of': 'IndependentContinuant',
  'realizes': 'Process',
  'realized_in': 'RealizableEntity',
  'occurs_in': 'Process',
  'has_material_basis': 'Disposition',
  'specifically_depends_on': 'SpecificallyDependentContinuant',
  'generically_depends_on': 'GenericallyDependentContinuant',
  'concretizes': 'SpecificallyDependentContinuant',
  'has_temporal_part': 'Occurrent',
  'temporal_part_of': 'Occurrent',
};

// ── Label-Based Heuristic Patterns ──

const LABEL_PATTERNS = [
  { pattern: /process|event|activity|action|operation/i, placement: 'Process', confidence: 0.4 },
  { pattern: /quality|color|shape|size|mass|temperature/i, placement: 'Quality', confidence: 0.35 },
  { pattern: /role|function|capacity|ability/i, placement: 'RealizableEntity', confidence: 0.3 },
  { pattern: /region|location|site|place/i, placement: 'SpatialRegion', confidence: 0.3 },
  { pattern: /interval|instant|period|duration/i, placement: 'TemporalRegion', confidence: 0.3 },
];

// ── BFO Class Name Normalization ──
// Maps various forms of BFO class references to canonical category names.

const BFO_CLASS_NORMALIZE = {
  'bfo:MaterialEntity': 'MaterialEntity',
  'bfo:BFO_0000040': 'MaterialEntity',
  'MaterialEntity': 'MaterialEntity',
  'material entity': 'MaterialEntity',
  'bfo:Process': 'Process',
  'bfo:BFO_0000015': 'Process',
  'Process': 'Process',
  'process': 'Process',
  'bfo:Quality': 'Quality',
  'bfo:BFO_0000019': 'Quality',
  'Quality': 'Quality',
  'quality': 'Quality',
  'bfo:IndependentContinuant': 'IndependentContinuant',
  'bfo:BFO_0000004': 'IndependentContinuant',
  'IndependentContinuant': 'IndependentContinuant',
  'bfo:Disposition': 'Disposition',
  'bfo:BFO_0000016': 'Disposition',
  'Disposition': 'Disposition',
  'bfo:Role': 'Role',
  'bfo:BFO_0000023': 'Role',
  'Role': 'Role',
  'bfo:RealizableEntity': 'RealizableEntity',
  'bfo:BFO_0000017': 'RealizableEntity',
  'RealizableEntity': 'RealizableEntity',
  'bfo:Occurrent': 'Occurrent',
  'bfo:BFO_0000003': 'Occurrent',
  'Occurrent': 'Occurrent',
  'bfo:SpatialRegion': 'SpatialRegion',
  'bfo:BFO_0000006': 'SpatialRegion',
  'SpatialRegion': 'SpatialRegion',
  'bfo:TemporalRegion': 'TemporalRegion',
  'bfo:BFO_0000008': 'TemporalRegion',
  'TemporalRegion': 'TemporalRegion',
  'bfo:Continuant': 'Continuant',
  'bfo:BFO_0000002': 'Continuant',
  'Continuant': 'Continuant',
  'bfo:SpecificallyDependentContinuant': 'SpecificallyDependentContinuant',
  'bfo:BFO_0000020': 'SpecificallyDependentContinuant',
  'bfo:GenericallyDependentContinuant': 'GenericallyDependentContinuant',
  'bfo:BFO_0000031': 'GenericallyDependentContinuant',
  'bfo:Entity': 'Entity',
  'bfo:BFO_0000001': 'Entity',
  'Entity': 'Entity',
};

/**
 * Normalize a BFO class reference to a canonical category name.
 * @param {string} ref
 * @returns {string|null}
 */
function normalizeBfoClass(ref) {
  if (!ref) return null;
  // Direct lookup
  if (BFO_CLASS_NORMALIZE[ref]) return BFO_CLASS_NORMALIZE[ref];
  // Without spaces
  const noSpaces = ref.replace(/\s+/g, '');
  if (BFO_CLASS_NORMALIZE[noSpaces]) return BFO_CLASS_NORMALIZE[noSpaces];
  // Case-insensitive search
  const lower = ref.toLowerCase().replace(/\s+/g, '');
  for (const [key, val] of Object.entries(BFO_CLASS_NORMALIZE)) {
    if (key.toLowerCase().replace(/\s+/g, '') === lower) return val;
  }
  return null;
}

/**
 * Evaluate BFO placement for an external class.
 *
 * @param {object} externalClass - { iri, label, superclass, ancestorChain, parentInOntology, properties }
 *   ancestorChain (X9 Step 7.5 2026-04-27): transitively-closed parent
 *   IRIs from immediate parent to root. Per X9 §3.1 caller-contract.
 *   When the immediate superclass doesn't resolve to BFO, the heuristic
 *   walks ancestorChain looking for an inherited BFO ancestor (NA-1.1
 *   taxonomic-descent inheritance per D1.6-L25). Backwards-compatible:
 *   absent ancestorChain → behaves identically to pre-7.5 single-level
 *   superclass check.
 *   parentInOntology (X9 Step 7.5+ 2026-04-27): boolean signaling that
 *   the immediate superclass is itself a class declared in the same
 *   ingested ontology (caller-determined; sandbox doesn't have classMap).
 *   When true and no BFO grounding is found anywhere in the chain, the
 *   sandbox returns a `deferred: true` result instead of low-confidence
 *   Ambiguous — the class has a known parent and BFO category will
 *   inherit reactively when an ancestor root is analyst-resolved.
 * @param {object} [context={}] - { disjointnessMap, existingConcepts, resolvedPlacements }
 *   resolvedPlacements (optional): Map<iri, bfoCategory> of already-
 *   resolved ancestor placements. Enables cascade-from-resolved per X9
 *   Step 7.5 NA-1.1 cascade discipline.
 * @returns {{ placement: string|null, confidence: number, justification: string, candidates?: object[], deferred?: boolean }}
 */
export function evaluatePlacement(externalClass, context = {}) {
  const { iri, label, superclass, ancestorChain = [], parentInOntology = false, properties = [] } = externalClass;
  const { resolvedPlacements } = context;
  const candidates = [];
  const justifications = [];

  // ── Heuristic 1: Explicit BFO superclass ──
  const normalizedSuper = normalizeBfoClass(superclass);
  if (normalizedSuper) {
    candidates.push({ placement: normalizedSuper, confidence: 0.91, source: 'explicit_superclass' });
    justifications.push(`Explicit rdfs:subClassOf ${superclass} (0.91)`);
  } else if (superclass && !normalizedSuper) {
    // Superclass declared but doesn't resolve to any BFO node
    // Don't immediately reject — other heuristics may still apply
    justifications.push(`Declared superclass ${superclass} does not resolve to a known BFO class`);
  }

  // ── X9 Step 7.5 Heuristic 1b: Transitive ancestor walk (NA-1.1 cascade) ──
  // When immediate superclass doesn't resolve to BFO, walk the ancestor
  // chain looking for (a) a previously-resolved ancestor placement
  // (cascade-from-resolved per D1.6-L25), then (b) an inherited BFO
  // ancestor (heuristic). Confidence diminishes with distance.
  if (!normalizedSuper && ancestorChain.length > 0) {
    let cascadeFired = false;
    // Pass (a): cascade from resolved-placement of any ancestor (NA-1.1)
    if (resolvedPlacements) {
      for (let depth = 0; depth < ancestorChain.length; depth++) {
        const ancestor = ancestorChain[depth];
        const inherited = resolvedPlacements.get(ancestor);
        if (inherited) {
          // Cascade-from-resolved: child inherits parent's authoritative placement.
          // Confidence stays high (0.88) since parent's placement was authoritative.
          candidates.push({ placement: inherited, confidence: 0.88, source: `cascade_from_resolved:${ancestor}` });
          justifications.push(`NA-1.1 cascade: inherits ${inherited} from resolved ancestor ${ancestor} at depth ${depth + 1} (0.88)`);
          cascadeFired = true;
          break;
        }
      }
    }
    // Pass (b): walk to first BFO-resolvable ancestor (heuristic)
    if (!cascadeFired) {
      for (let depth = 0; depth < ancestorChain.length; depth++) {
        const ancestor = ancestorChain[depth];
        const norm = normalizeBfoClass(ancestor);
        if (norm) {
          // Confidence diminishes with distance: 0.91 - 0.05 * (depth + 1).
          // depth 0 (immediate-grandparent BFO) → 0.86; depth 4 → 0.66.
          const conf = Math.max(0.50, 0.91 - 0.05 * (depth + 1));
          candidates.push({ placement: norm, confidence: conf, source: `inherited_bfo_ancestor:${ancestor}` });
          justifications.push(`NA-1.1 inherited ${norm} from ancestor ${ancestor} at depth ${depth + 1} (${conf.toFixed(2)})`);
          break;
        }
      }
    }
  }

  // ── Heuristic 2: Property-based inference ──
  for (const prop of properties) {
    const propName = prop.name || prop.iri?.split(/[/#]/).pop() || '';
    const bfoDomain = BFO_PROPERTY_DOMAIN[propName];
    if (bfoDomain) {
      const propConfidence = 0.65;
      candidates.push({ placement: bfoDomain, confidence: propConfidence, source: `property:${propName}` });
      justifications.push(`Property ${propName} suggests ${bfoDomain} (${propConfidence})`);
    }
  }

  // ── Heuristic 3: Label-based heuristic ──
  if (label) {
    for (const { pattern, placement, confidence } of LABEL_PATTERNS) {
      if (pattern.test(label)) {
        candidates.push({ placement, confidence, source: `label:${label}` });
        justifications.push(`Label "${label}" matches ${placement} pattern (${confidence})`);
        break; // Only first label match
      }
    }
  }

  // ── No candidates at all ──
  if (candidates.length === 0) {
    if (superclass) {
      // X9 Step 7.5+ (2026-04-27): if the parent is declared in the
      // same ingested ontology (caller signals via parentInOntology),
      // the class is NOT placement-ambiguous — it has a known parent;
      // BFO grounding will inherit reactively when an ancestor root is
      // analyst-resolved. Returns deferred:true so routePlacement can
      // produce PlacementDeferred (a third disposition distinct from
      // Confirmed/Ambiguous). Reading B work-burden-reduction lock:
      // PendingHumanResolution reduces to ~3-5 root classes only.
      if (parentInOntology) {
        return {
          placement: superclass,
          confidence: 0.7,
          justification: `Declared rdfs:subClassOf ${superclass} (in-ontology parent). BFO category will inherit when an ancestor root is analyst-resolved.`,
          candidates: [],
          deferred: true,
        };
      }

      // Check if superclass is from the same ontology namespace as the candidate.
      // Intra-ontology superclasses (e.g., prov:Bundle rdfs:subClassOf prov:Entity)
      // are valid hierarchy — they just don't resolve to BFO. Route to Ambiguous
      // for human placement, not Rejected.
      // NOTE: this branch fires only when parentInOntology was NOT set — e.g.,
      // legacy callers or test fixtures. The parentInOntology path above is
      // the production route for ingestOntology callers post-Step-7.5+.
      const candidateNs = iri ? iri.replace(/[^/#]*$/, '') : '';
      const superNs = superclass.replace(/[^/#]*$/, '');
      const isIntraOntology = candidateNs && superNs && candidateNs === superNs;

      if (isIntraOntology) {
        // Intra-ontology superclass — fall through to Ambiguous, not Rejected
        return {
          placement: null,
          confidence: 0.1,
          justification: `Superclass "${superclass}" is from the same ontology (intra-ontology hierarchy). No BFO mapping found. Manual placement required.`,
          candidates: [],
        };
      }

      // External superclass that doesn't resolve to BFO → Rejected (Q4: tried and failed)
      return {
        placement: null,
        confidence: 0,
        justification: `No consistent placement found. Declared superclass "${superclass}" does not resolve to any BFO node.`,
        candidates: [],
        noSuperclassResolution: true,
      };
    }
    // No superclass, no hints → low-confidence Ambiguous (Q4: absence of evidence)
    return {
      placement: null,
      confidence: 0.1,
      justification: 'No BFO superclass, no property signals, no label matches. Manual placement required.',
      candidates: [],
    };
  }

  // ── Aggregate candidates ──
  // Group by placement, take highest confidence per placement
  const placementMap = new Map();
  for (const c of candidates) {
    const existing = placementMap.get(c.placement);
    if (!existing || c.confidence > existing.confidence) {
      placementMap.set(c.placement, c);
    }
  }

  const sorted = [...placementMap.values()].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];

  // ── X9 Step 7.5+ (2026-04-27): declared-parent precedence ──
  // When a class has a declared in-ontology parent (parentInOntology), the
  // parent assertion is a stronger signal than weak label/property hints
  // (heuristics 2, 3 at confidence < 0.7). Per SME spec: "classes that
  // have a subClassOf those are NOT ambiguous and should match the
  // specified parent class". If no candidate clears the 0.7 confirmation
  // threshold, prefer Deferred (parent IRI shown, awaits cascade) over
  // low-confidence routing that would silently render as PlacementAmbiguous.
  if (parentInOntology && top.confidence < 0.7) {
    return {
      placement: superclass,
      confidence: 0.7,
      justification: `Declared rdfs:subClassOf ${superclass} (in-ontology parent) outranks weak heuristics: ${justifications.join(' + ')}. BFO category will inherit when an ancestor root is analyst-resolved.`,
      candidates: [],
      deferred: true,
    };
  }

  // ── Heuristic 4: Disjointness consistency check ──
  // If we have a disjointness map and the top placement would create violations,
  // reduce confidence
  if (context.disjointnessMap && top.placement) {
    // Check if the placement conflicts with existing concepts in the graph
    // This is a simplistic check — full implementation would scan restrictions
    // For now, just validate the placement is not self-contradictory
  }

  // ── Decision D-7: Threshold routing ──
  if (sorted.length > 1) {
    const delta = top.confidence - sorted[1].confidence;
    return {
      placement: top.placement,
      confidence: top.confidence,
      justification: justifications.join(' + '),
      candidates: sorted,
      delta,
    };
  }

  return {
    placement: top.placement,
    confidence: top.confidence,
    justification: justifications.join(' + '),
    candidates: sorted,
  };
}

/**
 * Route a placement result to a status based on Decision D-7 thresholds.
 *
 * @param {{ placement, confidence, candidates, delta }} result
 * @param {number} [confidenceDelta=0.15] - Configurable delta threshold
 * @returns {{ status: string, placement: string|null }}
 */
export function routePlacement(result, confidenceDelta = 0.15) {
  // Declared superclass that doesn't resolve → Rejected (Q4)
  if (result.noSuperclassResolution) {
    return { status: 'PlacementRejected', placement: null };
  }

  // X9 Step 7.5+ (2026-04-27): declared in-ontology parent without BFO
  // grounding → Deferred (third disposition; awaits cascade from analyst-
  // resolved root). Placement column shows the parent IRI literally.
  if (result.deferred) {
    return { status: 'PlacementDeferred', placement: result.placement };
  }

  // No placement and very low confidence → Ambiguous (needs human)
  if (!result.placement && result.confidence < 0.7) {
    return { status: 'PlacementAmbiguous', placement: null };
  }

  const { confidence, candidates = [], delta } = result;

  // Multiple candidates with small delta → Ambiguous
  if (candidates.length > 1 && delta !== undefined && delta < confidenceDelta && confidence >= 0.7) {
    return { status: 'PlacementAmbiguous', placement: result.placement };
  }

  // Single candidate (or clear winner) with high confidence → Confirmed
  if (confidence >= 0.7) {
    return { status: 'PlacementConfirmed', placement: result.placement };
  }

  // Low confidence → Ambiguous
  return { status: 'PlacementAmbiguous', placement: result.placement };
}
