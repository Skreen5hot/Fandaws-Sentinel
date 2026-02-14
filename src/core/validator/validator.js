/**
 * Validator — orchestrates all validation checks on a proposed GraphMutation.
 *
 * Pure function: accepts mutation + graph, returns ValidationResult.
 * Never calls StateAdapter. Collects ALL violations (not fail-fast).
 *
 * @see Fandaws_v3.3_Specification.md Section 6
 */

import { createValidationResult } from '../../types/validation-result.js';
import { checkCompoundStatement, checkStructuralGrounding } from './input-sanitizer.js';
import { checkMutationForCycles } from './sanity-check.js';
import { checkPropertyRedundancy } from './property-redundancy.js';
import { checkGovernanceBlock } from './governance-check.js';

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
  const conceptAdditions = additions.filter(
    (node) => node['@type'] === 'fandaws:Concept',
  );
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
    (node) => node['@type'] === 'fandaws:Property',
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
    (node) => node['@type'] === 'fandaws:Relationship',
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

  return createValidationResult({
    valid: violations.length === 0,
    violations,
  });
}

// ─────────────────────────────────────────────────────────
// Internal helpers (not exported)
// ─────────────────────────────────────────────────────────

/**
 * Check basic relationship validity: subject and object must exist,
 * no exact duplicate tuple.
 */
function checkRelationshipBasics(rel, graph, mutation) {
  const subject = rel['fandaws:subject'];
  const object = rel['fandaws:object'];
  const verb = rel['fandaws:verb'];

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
      .filter((n) => n['@type'] === 'fandaws:Concept')
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

  // Check for exact duplicate tuple
  const graphRels = graph['fandaws:relationships'] || [];
  const isDuplicate = graphRels.some(
    (existing) =>
      existing['fandaws:subject'] === subject &&
      existing['fandaws:object'] === object &&
      existing['fandaws:verb'] === verb,
  );

  if (isDuplicate) {
    return {
      reason: 'duplicateRelationship',
      message: `Relationship "${subject} ${verb} ${object}" already exists.`,
      relationshipId: rel['@id'],
    };
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
  const graphRels = graph['fandaws:relationships'] || [];
  const allIris = new Set([
    ...graphConcepts.map((c) => c['@id']),
    ...graphRels.map((r) => r['@id']),
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
    (c) => c['fandaws:parent'] === iri,
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
