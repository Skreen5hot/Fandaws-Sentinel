/**
 * Relationship Validation — 7 checks for custom relationship quality.
 *
 * Phase 9.1: Verb normalization (deterministic suffix-stripping) and
 * validation checks for duplicate, inverse, hierarchy consistency,
 * reuse assessment, promotion, and refactoring.
 *
 * @see Fandaws_v3.3_Specification.md Section 6.4
 */

import { isRestrictionNode } from '../../types/type-checks.js';

// ─────────────────────────────────────────────────────────
// Verb Normalization
// ─────────────────────────────────────────────────────────

/**
 * Irregular verb lookup table (past/present participle → base form).
 * Kept small (~20 entries) to satisfy zero-dep constraint.
 */
const IRREGULAR_VERBS = new Map([
  ['ate', 'eat'],
  ['eaten', 'eat'],
  ['eating', 'eat'],
  ['ran', 'run'],
  ['running', 'run'],
  ['taught', 'teach'],
  ['teaching', 'teach'],
  ['caught', 'catch'],
  ['catching', 'catch'],
  ['thought', 'think'],
  ['thinking', 'think'],
  ['brought', 'bring'],
  ['bringing', 'bring'],
  ['bought', 'buy'],
  ['buying', 'buy'],
  ['made', 'make'],
  ['making', 'make'],
  ['said', 'say'],
  ['saying', 'say'],
  ['went', 'go'],
  ['going', 'go'],
  ['took', 'take'],
  ['taking', 'take'],
  ['gave', 'give'],
  ['giving', 'give'],
  ['kept', 'keep'],
  ['keeping', 'keep'],
  ['led', 'lead'],
  ['leading', 'lead'],
  ['held', 'hold'],
  ['holding', 'hold'],
]);

/**
 * Normalize a verb to its base/infinitive form using deterministic
 * suffix-stripping. No external dependencies.
 *
 * Rules applied in order:
 * 1. Lowercase
 * 2. Irregular verb table lookup
 * 3. Strip "-ing" (with "e" restoration for consonant patterns)
 * 4. Strip "-ied" → "-y"
 * 5. Strip "-ed"
 * 6. Strip "-ies" → "-y"
 * 7. Strip "-es" after sibilants (ch, sh, x, z, s)
 * 8. Strip trailing "-s" (not "ss")
 *
 * Known limitations: consonant doubling not reversed ("running" handled
 * via table, but "stopping" → "stopp"). Acceptable for Phase 9.
 *
 * @param {string} verb - Raw verb form
 * @returns {string} Normalized base form
 */
export function normalizeVerb(verb) {
  if (!verb || typeof verb !== 'string') return '';

  const lower = verb.toLowerCase().trim();
  if (!lower) return '';

  // 1. Irregular lookup
  if (IRREGULAR_VERBS.has(lower)) {
    return IRREGULAR_VERBS.get(lower);
  }

  // 2. Strip "-ing"
  if (lower.endsWith('ing') && lower.length > 4) {
    const stem = lower.slice(0, -3);
    // "chasing" → "chas" → "chase" (restore "e")
    // Check if stem + "e" is more natural (consonant ending)
    if (/[^aeiou]$/.test(stem) && !/[^aeiou]{2}$/.test(stem)) {
      return stem + 'e';
    }
    return stem;
  }

  // 3. Strip "-ied" → "-y" ("carried" → "carry")
  if (lower.endsWith('ied') && lower.length > 4) {
    return lower.slice(0, -3) + 'y';
  }

  // 4. Strip "-ed"
  if (lower.endsWith('ed') && lower.length > 3) {
    const stem = lower.slice(0, -2);
    // "chased" → "chas" → "chase" (restore "e")
    if (lower.endsWith('ced') || lower.endsWith('sed') || lower.endsWith('ted') || lower.endsWith('ded')) {
      // Already ends in e-consonant pattern
      if (stem.endsWith('e')) return stem;
      return stem + 'e';
    }
    // "heated" → "heat", "guarded" → "guard"
    if (lower.endsWith('ated') || lower.endsWith('eted') || lower.endsWith('ited') || lower.endsWith('oted') || lower.endsWith('uted')) {
      return lower.slice(0, -1); // just strip "d", keep the "e"
    }
    return stem;
  }

  // 5. Strip "-ies" → "-y" ("carries" → "carry")
  if (lower.endsWith('ies') && lower.length > 4) {
    return lower.slice(0, -3) + 'y';
  }

  // 6. Strip "-es" after sibilants
  if (lower.endsWith('ches') || lower.endsWith('shes') || lower.endsWith('xes') || lower.endsWith('zes') || lower.endsWith('sses')) {
    return lower.slice(0, -2);
  }

  // 7. Strip trailing "-s" (not "ss", not short words)
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 3) {
    return lower.slice(0, -1);
  }

  return lower;
}

// ─────────────────────────────────────────────────────────
// Validation Checks
// ─────────────────────────────────────────────────────────

/**
 * Extract all relationship restrictions from the graph.
 *
 * @param {object} graph - KnowledgeGraph
 * @returns {object[]} All relationship restriction nodes
 */
function getAllRelationships(graph) {
  const results = [];
  for (const concept of graph['fandaws:concepts'] || []) {
    for (const entry of concept['rdfs:subClassOf'] || []) {
      if (isRestrictionNode(entry) && entry['fandaws:restrictionKind'] === 'relationship') {
        results.push(entry);
      }
    }
  }
  return results;
}

/**
 * Check 2: Duplicate — same (subject, normalizedVerb, object) tuple exists.
 */
function checkDuplicate(rel, graph) {
  const verb = normalizeVerb(rel['owl:onProperty']);
  const subject = rel['fandaws:attachedTo'];
  const object = rel['owl:someValuesFrom'];

  for (const existing of getAllRelationships(graph)) {
    if (existing['@id'] === rel['@id']) continue;
    if (
      existing['fandaws:attachedTo'] === subject &&
      existing['owl:someValuesFrom'] === object &&
      normalizeVerb(existing['owl:onProperty']) === verb
    ) {
      return {
        reason: 'duplicateRelationship',
        message: `Relationship "${subject} ${verb} ${object}" already exists (normalized verb match).`,
        severity: 'error',
        relationshipId: rel['@id'],
      };
    }
  }
  return null;
}

/**
 * Check 3: Inverse — (object, normalizedVerb, subject) exists.
 */
function checkInverse(rel, graph) {
  const verb = normalizeVerb(rel['owl:onProperty']);
  const subject = rel['fandaws:attachedTo'];
  const object = rel['owl:someValuesFrom'];

  for (const existing of getAllRelationships(graph)) {
    if (
      existing['fandaws:attachedTo'] === object &&
      existing['owl:someValuesFrom'] === subject &&
      normalizeVerb(existing['owl:onProperty']) === verb
    ) {
      return {
        reason: 'inverseRelationship',
        message: `Potential inverse: "${object} ${verb} ${subject}" already exists.`,
        severity: 'error',
        relationshipId: rel['@id'],
        existingId: existing['@id'],
      };
    }
  }
  return null;
}

/**
 * Check 4: Hierarchy consistency — ancestor has same (verb, object).
 */
function checkHierarchyConsistency(rel, graph, indices) {
  const verb = normalizeVerb(rel['owl:onProperty']);
  const object = rel['owl:someValuesFrom'];
  const subjectIri = rel['fandaws:attachedTo'];

  // Walk ancestor chain
  let current = indices.iriToParent.get(subjectIri);
  while (current) {
    const concept = (graph['fandaws:concepts'] || []).find((c) => c['@id'] === current);
    if (concept) {
      for (const entry of concept['rdfs:subClassOf'] || []) {
        if (
          isRestrictionNode(entry) &&
          entry['fandaws:restrictionKind'] === 'relationship' &&
          normalizeVerb(entry['owl:onProperty']) === verb &&
          entry['owl:someValuesFrom'] === object
        ) {
          return {
            reason: 'hierarchyRedundant',
            message: `Ancestor "${current}" already has "${verb} ${object}" — child relationship is redundant.`,
            severity: 'error',
            relationshipId: rel['@id'],
            ancestorIri: current,
          };
        }
      }
    }
    current = indices.iriToParent.get(current);
  }
  return null;
}

/**
 * Check 5: Reuse assessment — same verb already used in graph.
 */
function checkReuseAssessment(rel, graph) {
  const verb = normalizeVerb(rel['owl:onProperty']);
  const subject = rel['fandaws:attachedTo'];
  const object = rel['owl:someValuesFrom'];

  for (const existing of getAllRelationships(graph)) {
    if (existing['@id'] === rel['@id']) continue;
    if (
      normalizeVerb(existing['owl:onProperty']) === verb &&
      (existing['fandaws:attachedTo'] !== subject || existing['owl:someValuesFrom'] !== object)
    ) {
      return {
        reason: 'verbReuse',
        message: `Verb "${verb}" is already used in another relationship. Consider sub-relationship.`,
        severity: 'warning',
        relationshipId: rel['@id'],
        existingId: existing['@id'],
      };
    }
  }
  return null;
}

/**
 * Check 6: Promotion — sub-relationship that covers all parent's children.
 */
function checkPromotion(rel, graph, indices) {
  if (!rel['fandaws:subRestrictionOf']) return null;

  const verb = normalizeVerb(rel['owl:onProperty']);
  const subjectIri = rel['fandaws:attachedTo'];
  const parentIri = indices.iriToParent.get(subjectIri);
  if (!parentIri) return null;

  const siblings = indices.iriToChildren.get(parentIri) || new Set();
  if (siblings.size < 2) return null;

  // Check if all siblings have the same relationship
  let allHaveIt = true;
  for (const siblingIri of siblings) {
    const sibling = (graph['fandaws:concepts'] || []).find((c) => c['@id'] === siblingIri);
    if (!sibling) { allHaveIt = false; break; }
    const hasRel = (sibling['rdfs:subClassOf'] || []).some(
      (e) =>
        isRestrictionNode(e) &&
        e['fandaws:restrictionKind'] === 'relationship' &&
        normalizeVerb(e['owl:onProperty']) === verb,
    );
    if (!hasRel) { allHaveIt = false; break; }
  }

  if (allHaveIt) {
    return {
      reason: 'promotionCandidate',
      message: `All children of "${parentIri}" have "${verb}" — consider promoting to parent.`,
      severity: 'warning',
      relationshipId: rel['@id'],
      parentIri,
    };
  }
  return null;
}

/**
 * Check 7: Refactoring — subject and object in same subtree.
 */
function checkRefactoring(rel, indices) {
  const subject = rel['fandaws:attachedTo'];
  const object = rel['owl:someValuesFrom'];

  // Walk up from subject
  let current = subject;
  const subjectAncestors = new Set();
  while (current) {
    subjectAncestors.add(current);
    current = indices.iriToParent.get(current);
  }

  // Walk up from object — if it hits a subject ancestor, same subtree
  current = object;
  while (current) {
    if (subjectAncestors.has(current)) {
      return {
        reason: 'sameSubtree',
        message: `Subject and object share ancestor "${current}" — consider if IS_A is more appropriate.`,
        severity: 'warning',
        relationshipId: rel['@id'],
        sharedAncestor: current,
      };
    }
    current = indices.iriToParent.get(current);
  }

  return null;
}

/**
 * Run all 7 validation checks on a relationship restriction.
 *
 * @param {object} rel - Relationship owl:Restriction node
 * @param {object} graph - KnowledgeGraph
 * @param {object} indices - Graph indices (iriToParent, iriToChildren, etc.)
 * @returns {{ violations: object[] }} Array of violation descriptors
 */
export function validateRelationship(rel, graph, indices) {
  const violations = [];

  // Checks 2-4: blocking
  const dup = checkDuplicate(rel, graph);
  if (dup) violations.push(dup);

  const inv = checkInverse(rel, graph);
  if (inv) violations.push(inv);

  const hier = checkHierarchyConsistency(rel, graph, indices);
  if (hier) violations.push(hier);

  // Checks 5-7: advisory
  const reuse = checkReuseAssessment(rel, graph);
  if (reuse) violations.push(reuse);

  const promo = checkPromotion(rel, graph, indices);
  if (promo) violations.push(promo);

  const refactor = checkRefactoring(rel, indices);
  if (refactor) violations.push(refactor);

  return { violations };
}
