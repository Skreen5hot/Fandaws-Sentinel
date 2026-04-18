/**
 * Fingerprint Matcher — structural fingerprint comparison for Phase 2
 * property disambiguation.
 *
 * Decision D-8: Phase 2 is JavaScript (arithmetic fingerprint scoring).
 * Decision D-9: Weight vector bounds enforced.
 * Rule PD-1 (Invariant I-1): schema-only fingerprints.
 * Rule PD-2: disjoint hard floor (score = 0.0).
 * Rule PD-10: six fingerprint dimensions.
 *
 * @see docs/architecture/phase-d2-avc-bundle.json
 */

/**
 * Default fingerprint weight vector (Decision D-9).
 */
export const DEFAULT_WEIGHT_VECTOR = {
  domain: 0.30,
  range: 0.30,
  bfoSubcategory: 0.15,
  characteristics: 0.10,
  allowsInheresIn: 0.05,
  lexical: 0.10,
};

/**
 * Validate a fingerprint weight vector against D-9 bounds.
 * Structural physics (domain + range + bfoSubcategory) MUST sum to >= 0.70.
 * Lexical weight MUST NOT exceed 0.10.
 *
 * @param {object} weights
 * @returns {{ valid: boolean, error?: object }}
 */
export function validateWeightVector(weights) {
  const w = { ...DEFAULT_WEIGHT_VECTOR, ...weights };
  const structuralSum = (w.domain || 0) + (w.range || 0) + (w.bfoSubcategory || 0);
  const lexicalWeight = w.lexical || 0;

  if (structuralSum < 0.70 || lexicalWeight > 0.10) {
    return {
      valid: false,
      error: {
        code: 'WeightVectorNonConformant',
        offendingComponent: lexicalWeight > 0.10 ? 'lexical' : 'structuralSum',
        boundViolated: lexicalWeight > 0.10
          ? `lexical weight ${lexicalWeight} exceeds maximum 0.10`
          : `structural sum ${structuralSum} below minimum 0.70`,
        structuralSum,
        lexicalWeight,
      },
    };
  }
  return { valid: true };
}

/**
 * Build a structural fingerprint from a candidate relation's schema declarations.
 * Rule PD-1 (Invariant I-1): instance data MUST NOT influence the fingerprint.
 *
 * @param {object} candidate - { declaredDomain, declaredRange, declaredCharacteristics, bfoSubcategory, allowsInheresIn, label }
 * @returns {object} Fingerprint
 */
export function buildFingerprint(candidate) {
  return {
    domainBFOCategory: candidate.declaredDomain || null,
    rangeBFOCategory: candidate.declaredRange || null,
    bfoSubcategory: candidate.bfoSubcategory || null,
    characteristics: normalizeCharacteristics(candidate.declaredCharacteristics || []),
    allowsInheresIn: candidate.allowsInheresIn || false,
    label: (candidate.label || '').toLowerCase().trim(),
  };
}

/**
 * Normalize OWL characteristic declarations to simple strings.
 */
function normalizeCharacteristics(chars) {
  return chars.map(c => {
    if (c === 'owl:TransitiveProperty' || c === 'transitive') return 'transitive';
    if (c === 'owl:SymmetricProperty' || c === 'symmetric') return 'symmetric';
    if (c === 'owl:ReflexiveProperty' || c === 'reflexive') return 'reflexive';
    return c.toLowerCase();
  }).sort();
}

/**
 * Normalize a BFO class reference for comparison.
 */
function normalizeBfo(ref) {
  if (!ref) return null;
  // Strip bfo: prefix and normalize case
  const clean = ref.replace(/^bfo:/, '').replace(/^BFO_\d+/, '');
  return clean.toLowerCase().replace(/[_\s-]/g, '');
}

/**
 * Check if two BFO categories are disjoint.
 *
 * @param {string} a - BFO category
 * @param {string} b - BFO category
 * @param {Set<string>} disjointnessMap - Set of "A|B" pair strings
 * @returns {boolean}
 */
function areDisjoint(a, b, disjointnessMap) {
  if (!a || !b || !disjointnessMap || disjointnessMap.size === 0) return false;

  // Normalize for lookup — the disjointness map uses various formats
  const normA = a.replace(/^bfo:/, '');
  const normB = b.replace(/^bfo:/, '');

  // Try direct lookup
  const key1 = [normA, normB].sort().join('|');
  if (disjointnessMap.has(key1)) return true;

  // Try with bfo: prefix
  const key2 = [`bfo:${normA}`, `bfo:${normB}`].sort().join('|');
  if (disjointnessMap.has(key2)) return true;

  // Try CamelCase variants
  const camelA = normA.replace(/([a-z])([A-Z])/g, '$1 $2');
  const camelB = normB.replace(/([a-z])([A-Z])/g, '$1 $2');
  const key3 = [camelA, camelB].sort().join('|');
  if (disjointnessMap.has(key3)) return true;

  return false;
}

/**
 * Compute match confidence between a candidate fingerprint and a canonical
 * relation type's fingerprint.
 *
 * Rule PD-2: if domain BFO categories are disjoint → score = 0.0 exactly.
 *
 * @param {object} candidateFp - Candidate fingerprint
 * @param {object} canonicalFp - Canonical relation type fingerprint
 * @param {object} weights - Weight vector
 * @param {object} context - { disjointnessMap }
 * @returns {{ score: number, components: object, disjointFloorTriggered: boolean }}
 */
export function computeMatchScore(candidateFp, canonicalFp, weights = DEFAULT_WEIGHT_VECTOR, context = {}) {
  // Rule PD-2: disjoint hard floor — domain disjointness forces 0.0
  if (context.disjointnessMap && areDisjoint(candidateFp.domainBFOCategory, canonicalFp.domainBFOCategory, context.disjointnessMap)) {
    return { score: 0.0, components: {}, disjointFloorTriggered: true };
  }

  // Also check range disjointness
  if (context.disjointnessMap && areDisjoint(candidateFp.rangeBFOCategory, canonicalFp.rangeBFOCategory, context.disjointnessMap)) {
    return { score: 0.0, components: {}, disjointFloorTriggered: true };
  }

  const components = {};

  // Domain match
  components.domain = normalizeBfo(candidateFp.domainBFOCategory) === normalizeBfo(canonicalFp.domainBFOCategory) ? 1.0 : 0.0;

  // Range match
  components.range = normalizeBfo(candidateFp.rangeBFOCategory) === normalizeBfo(canonicalFp.rangeBFOCategory) ? 1.0 : 0.0;

  // BFO subcategory match
  if (!candidateFp.bfoSubcategory && !canonicalFp.bfoSubcategory) {
    components.bfoSubcategory = 1.0; // Both null = match
  } else {
    components.bfoSubcategory = normalizeBfo(candidateFp.bfoSubcategory) === normalizeBfo(canonicalFp.bfoSubcategory) ? 1.0 : 0.0;
  }

  // Characteristic set match (Jaccard-style)
  const cChars = new Set(candidateFp.characteristics);
  const kChars = new Set(canonicalFp.characteristics);
  if (cChars.size === 0 && kChars.size === 0) {
    components.characteristics = 1.0;
  } else {
    const intersection = [...cChars].filter(c => kChars.has(c)).length;
    const union = new Set([...cChars, ...kChars]).size;
    components.characteristics = union > 0 ? intersection / union : 0.0;
  }

  // allowsInheresIn match
  components.allowsInheresIn = (candidateFp.allowsInheresIn === canonicalFp.allowsInheresIn) ? 1.0 : 0.0;

  // Lexical similarity (simple normalized Levenshtein-ish)
  components.lexical = computeLexicalSimilarity(candidateFp.label, canonicalFp.label);

  // Weighted sum
  const score =
    components.domain * weights.domain +
    components.range * weights.range +
    components.bfoSubcategory * weights.bfoSubcategory +
    components.characteristics * weights.characteristics +
    components.allowsInheresIn * weights.allowsInheresIn +
    components.lexical * weights.lexical;

  return { score: Math.round(score * 1000) / 1000, components, disjointFloorTriggered: false };
}

/**
 * Simple lexical similarity: common word overlap ratio.
 */
function computeLexicalSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(/[\s_-]+/).filter(Boolean));
  const wordsB = new Set(b.split(/[\s_-]+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Score a candidate against all canonical relation types.
 *
 * @param {object} candidateFp - Candidate fingerprint
 * @param {object[]} canonicals - Array of { id, fingerprint }
 * @param {object} weights - Weight vector
 * @param {object} context - { disjointnessMap }
 * @returns {object[]} Sorted scores (descending)
 */
export function scoreAgainstAll(candidateFp, canonicals, weights = DEFAULT_WEIGHT_VECTOR, context = {}) {
  const results = [];
  for (const canonical of canonicals) {
    const match = computeMatchScore(candidateFp, canonical.fingerprint, weights, context);
    results.push({
      canonicalId: canonical.id,
      canonicalLabel: canonical.label || canonical.id,
      ...match,
    });
  }
  return results.sort((a, b) => b.score - a.score);
}
