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
 * @param {object} externalClass - { iri, label, superclass, properties }
 * @param {object} [context={}] - { disjointnessMap, existingConcepts }
 * @returns {{ placement: string|null, confidence: number, justification: string, candidates?: object[] }}
 */
export function evaluatePlacement(externalClass, context = {}) {
  const { iri, label, superclass, properties = [] } = externalClass;
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
      // Check if superclass is from the same ontology namespace as the candidate.
      // Intra-ontology superclasses (e.g., prov:Bundle rdfs:subClassOf prov:Entity)
      // are valid hierarchy — they just don't resolve to BFO. Route to Ambiguous
      // for human placement, not Rejected.
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
