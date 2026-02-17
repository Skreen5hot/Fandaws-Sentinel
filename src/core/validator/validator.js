/**
 * Validator — orchestrates all validation checks on a proposed GraphMutation.
 *
 * Pure function: accepts mutation + graph, returns ValidationResult.
 * Never calls StateAdapter. Collects ALL violations (not fail-fast).
 *
 * v2.1: Uses isConceptNode/isRestrictionNode, skos:broader, owl:onProperty.
 *
 * @see Fandaws_v3.3_Specification.md Section 6
 */

import { createValidationResult } from '../../types/validation-result.js';
import { isConceptNode, isRestrictionNode } from '../../types/type-checks.js';
import { checkCompoundStatement, checkStructuralGrounding } from './input-sanitizer.js';
import { checkMutationForCycles } from './sanity-check.js';
import { checkPropertyRedundancy } from './property-redundancy.js';
import { checkGovernanceBlock } from './governance-check.js';
import { BFO } from '../knowledge-engine/bfo-heuristic.js';

/**
 * Validate a proposed GraphMutation against a KnowledgeGraph.
 *
 * Runs all checks and collects violations. Returns a ValidationResult
 * with valid=true only if zero violations are found.
 *
 * @param {object} mutation - GraphMutation JSON-LD node
 * @param {object} graph - Current KnowledgeGraph JSON-LD
 * @param {object} [options] - Additional context
 * @param {Map<string, string>} [options.propertyLabels] - IRI → label map
 * @returns {object} ValidationResult JSON-LD node
 */
export function validate(mutation, graph, options = {}) {
  const violations = [];
  const additions = mutation['fandaws:additions'] || [];
  const modifications = mutation['fandaws:modifications'] || [];
  const deletions = mutation['fandaws:deletions'] || [];
  const merges = mutation['fandaws:merges'] || [];

  // ─── 1. Compound Statement Check ──────────────────────
  const compoundViolation = checkCompoundStatement(mutation);
  if (compoundViolation) {
    violations.push(compoundViolation);
  }

  // ─── 2. Structural Grounding Check ────────────────────
  const conceptAdditions = additions.filter((node) => isConceptNode(node));
  for (const concept of conceptAdditions) {
    const groundingViolation = checkStructuralGrounding(
      concept,
      graph,
      mutation,
    );
    if (groundingViolation) {
      violations.push(groundingViolation);
    }
  }

  // ─── 3. Cycle Detection ───────────────────────────────
  const cycleViolations = checkMutationForCycles(mutation, graph);
  violations.push(...cycleViolations);

  // ─── 4. Property Redundancy ───────────────────────────
  const propertyAdditions = additions.filter(
    (node) => isRestrictionNode(node) && node['fandaws:restrictionKind'] === 'property',
  );
  for (const property of propertyAdditions) {
    const { violations: propViolations } = checkPropertyRedundancy(
      property,
      graph,
      options,
    );
    violations.push(...propViolations);
  }

  // ─── 5. Relationship Basics ───────────────────────────
  const relationshipAdditions = additions.filter(
    (node) => isRestrictionNode(node) && node['fandaws:restrictionKind'] === 'relationship',
  );
  for (const rel of relationshipAdditions) {
    const relViolation = checkRelationshipBasics(rel, graph, mutation);
    if (relViolation) {
      violations.push(relViolation);
    }
  }

  // ─── 6. Modification Checks ───────────────────────────
  for (const mod of modifications) {
    const modViolation = checkModification(mod, graph);
    if (modViolation) {
      violations.push(modViolation);
    }
  }

  // ─── 7. Deletion Checks ──────────────────────────────
  for (const iri of deletions) {
    const delViolation = checkDeletion(iri, graph);
    if (delViolation) {
      violations.push(delViolation);
    }
  }

  // ─── 8. Merge Checks ─────────────────────────────────
  for (const merge of merges) {
    const mergeViolation = checkMerge(merge, graph);
    if (mergeViolation) {
      violations.push(mergeViolation);
    }
  }

  // ─── 9. Governance Check (Phase 4b) ───────────────────
  for (const concept of conceptAdditions) {
    const govResult = checkGovernanceBlock(concept, graph);
    if (govResult.blocked) {
      violations.push({
        reason: 'governanceBlock',
        message: govResult.reason,
        conceptIri: concept['@id'],
        epistemicFailure: govResult.epistemicFailure,
      });
    }
  }

  // Also check concepts targeted by modifications
  for (const mod of modifications) {
    const targetIri = mod['@id'] || mod['fandaws:target'];
    if (targetIri) {
      const mockConcept = { '@id': targetIri };
      const govResult = checkGovernanceBlock(mockConcept, graph);
      if (govResult.blocked) {
        violations.push({
          reason: 'governanceBlock',
          message: govResult.reason,
          conceptIri: targetIri,
          epistemicFailure: govResult.epistemicFailure,
        });
      }
    }
  }

  // ─── 10. BFO Cross-Category Check (advisory) ───────────
  const bfoCrossViolations = checkBfoCrossCategory(
    conceptAdditions,
    modifications,
    graph,
  );
  violations.push(...bfoCrossViolations);

  return createValidationResult({
    valid: violations.length === 0,
    violations,
  });
}

// ─────────────────────────────────────────────────────────
// Internal helpers (not exported)
// ─────────────────────────────────────────────────────────

/**
 * Collect all restriction IRIs from concepts' rdfs:subClassOf arrays.
 */
function collectRestrictionIris(graph) {
  const concepts = graph['fandaws:concepts'] || [];
  const iris = new Set();
  for (const concept of concepts) {
    for (const entry of concept['rdfs:subClassOf'] || []) {
      if (isRestrictionNode(entry) && entry['@id']) {
        iris.add(entry['@id']);
      }
    }
  }
  return iris;
}

/**
 * Check basic relationship validity: subject and object must exist,
 * no exact duplicate tuple.
 */
function checkRelationshipBasics(rel, graph, mutation) {
  const subject = rel['fandaws:attachedTo'];
  const object = rel['owl:someValuesFrom'];
  const verb = rel['owl:onProperty'];

  if (!subject || !object) {
    return {
      reason: 'incompleteRelationship',
      message: 'Relationship must have both subject and object.',
      relationshipId: rel['@id'],
    };
  }

  // Check subject exists (in graph or mutation additions)
  const graphConcepts = graph['fandaws:concepts'] || [];
  const additions = mutation['fandaws:additions'] || [];
  const allConceptIris = new Set([
    ...graphConcepts.map((c) => c['@id']),
    ...additions
      .filter((n) => isConceptNode(n))
      .map((c) => c['@id']),
  ]);

  if (!allConceptIris.has(subject)) {
    return {
      reason: 'danglingReference',
      message: `Relationship subject "${subject}" does not exist.`,
      relationshipId: rel['@id'],
      missingIri: subject,
    };
  }

  if (!allConceptIris.has(object)) {
    return {
      reason: 'danglingReference',
      message: `Relationship object "${object}" does not exist.`,
      relationshipId: rel['@id'],
      missingIri: object,
    };
  }

  // Check for exact duplicate tuple (scan concept rdfs:subClassOf for matching restrictions)
  for (const concept of graphConcepts) {
    for (const entry of concept['rdfs:subClassOf'] || []) {
      if (
        isRestrictionNode(entry) &&
        entry['fandaws:restrictionKind'] === 'relationship' &&
        entry['fandaws:attachedTo'] === subject &&
        entry['owl:someValuesFrom'] === object &&
        entry['owl:onProperty'] === verb
      ) {
        return {
          reason: 'duplicateRelationship',
          message: `Relationship "${subject} ${verb} ${object}" already exists.`,
          relationshipId: rel['@id'],
        };
      }
    }
  }

  return null;
}

/**
 * Check that a modification target exists and flag parent-change cycles
 * (cycle detection already covers parent changes via checkMutationForCycles,
 * so this only checks existence).
 */
function checkModification(mod, graph) {
  const targetIri = mod['@id'] || mod['fandaws:target'];
  if (!targetIri) {
    return {
      reason: 'invalidModification',
      message: 'Modification must specify a target IRI.',
    };
  }

  const graphConcepts = graph['fandaws:concepts'] || [];
  const restrictionIris = collectRestrictionIris(graph);
  const allIris = new Set([
    ...graphConcepts.map((c) => c['@id']),
    ...restrictionIris,
  ]);

  if (!allIris.has(targetIri)) {
    return {
      reason: 'targetNotFound',
      message: `Modification target "${targetIri}" does not exist in the graph.`,
      targetIri,
    };
  }

  return null;
}

/**
 * Check whether deleting a concept would orphan its children.
 * Returns a warning violation (not blocking, but informational).
 */
function checkDeletion(iri, graph) {
  const graphConcepts = graph['fandaws:concepts'] || [];
  const hasChildren = graphConcepts.some(
    (c) => c['skos:broader'] === iri,
  );

  if (hasChildren) {
    return {
      reason: 'orphanRisk',
      message: `Deleting "${iri}" would orphan its children.`,
      conceptIri: iri,
      severity: 'warning',
    };
  }

  return null;
}

/**
 * Extract the BFO category IRI from a concept's rdfs:subClassOf array.
 *
 * @param {object} concept - Concept node
 * @returns {string|null} BFO IRI or null
 */
function getBfoMapping(concept) {
  if (!concept) return null;
  const subClassOf = concept['rdfs:subClassOf'] || [];
  for (const entry of subClassOf) {
    if (typeof entry === 'string' && entry.startsWith('bfo:')) {
      return entry;
    }
  }
  return null;
}

/**
 * Advisory check: flag when a child's BFO category differs from its parent's.
 * Not blocking — advisory only. BFO.entity is excluded (universal root).
 */
function checkBfoCrossCategory(conceptAdditions, modifications, graph) {
  const violations = [];
  const graphConcepts = graph['fandaws:concepts'] || [];
  const conceptMap = new Map(graphConcepts.map((c) => [c['@id'], c]));

  // Check new concept additions with a broader parent
  for (const concept of conceptAdditions) {
    const parentIri = concept['skos:broader'];
    if (!parentIri) continue;

    const childBfo = getBfoMapping(concept);
    const parent = conceptMap.get(parentIri);
    const parentBfo = getBfoMapping(parent);

    if (
      childBfo && parentBfo &&
      childBfo !== parentBfo &&
      childBfo !== BFO.entity &&
      parentBfo !== BFO.entity
    ) {
      violations.push({
        reason: 'bfoCrossCategory',
        message: `"${concept['rdfs:label'] || concept['@id']}" (${childBfo}) has a different BFO category than its parent (${parentBfo}). This may indicate an ontological mismatch.`,
        conceptIri: concept['@id'],
        parentIri,
        childBfo,
        parentBfo,
        severity: 'advisory',
      });
    }
  }

  // Check modifications that change skos:broader
  for (const mod of modifications) {
    if (mod['fandaws:field'] !== 'skos:broader') continue;

    const childIri = mod['@id'];
    const newParentIri = mod['fandaws:value'];
    if (!childIri || !newParentIri) continue;

    const child = conceptMap.get(childIri);
    const parent = conceptMap.get(newParentIri);
    const childBfo = getBfoMapping(child);
    const parentBfo = getBfoMapping(parent);

    if (
      childBfo && parentBfo &&
      childBfo !== parentBfo &&
      childBfo !== BFO.entity &&
      parentBfo !== BFO.entity
    ) {
      violations.push({
        reason: 'bfoCrossCategory',
        message: `Reclassifying "${child?.['rdfs:label'] || childIri}" (${childBfo}) under a parent with different BFO category (${parentBfo}). This may indicate an ontological mismatch.`,
        conceptIri: childIri,
        parentIri: newParentIri,
        childBfo,
        parentBfo,
        severity: 'advisory',
      });
    }
  }

  return violations;
}

/**
 * Check merge operation: source and target must exist and differ.
 */
function checkMerge(merge, graph) {
  const source = merge['fandaws:source'] || merge.source;
  const target = merge['fandaws:target'] || merge.target;

  if (!source || !target) {
    return {
      reason: 'incompleteMerge',
      message: 'Merge must specify both source and target.',
    };
  }

  if (source === target) {
    return {
      reason: 'selfMerge',
      message: `Cannot merge concept "${source}" into itself.`,
      conceptIri: source,
    };
  }

  const graphConcepts = graph['fandaws:concepts'] || [];
  const conceptIris = new Set(graphConcepts.map((c) => c['@id']));

  if (!conceptIris.has(source)) {
    return {
      reason: 'mergeSourceNotFound',
      message: `Merge source "${source}" does not exist.`,
      missingIri: source,
    };
  }

  if (!conceptIris.has(target)) {
    return {
      reason: 'mergeTargetNotFound',
      message: `Merge target "${target}" does not exist.`,
      missingIri: target,
    };
  }

  return null;
}
