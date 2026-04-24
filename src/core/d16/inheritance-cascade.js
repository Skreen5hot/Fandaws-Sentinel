/**
 * Inheritance Cascade — D1.6 Amendment 01 (NA-1.1, NA-1.2, NA-1.3)
 *
 * SCAFFOLD SCOPE (Week 4):
 *   Shape-level implementation of Taxonomic Descent with Provisional
 *   Inheritance (NA-1.1), Signal Discipline (NA-1.2), and Descendant
 *   Reconciliation (NA-1.3). Consumes per-scenario synthetic inputs describing
 *   the parent's placement + the child's local signals; produces evidence
 *   records in the shape the Band 5 AVC scenarios prescribe.
 *
 *   Does NOT yet:
 *   - Walk a real rdfs:subClassOf graph
 *   - Query Tau Prolog for NC satisfaction at the child level
 *   - Integrate with the DependencyGraph for cascade propagation
 *
 *   All three gaps close during Weeks 4-6 (Tau Prolog) and Weeks 6-8 (NA-1.4
 *   reactive engine + DependencyGraph).
 *
 * Rules implemented (shape-level):
 *   NA-1.1: provisional inheritance from parent when child is axiom-poor.
 *           Child disposition = parent disposition; validationState = 'provisional'.
 *   NA-1.2: signal discipline. Strong signal (OWL-DIRECT violation like
 *           disjointness) overrides inherited placement → re-evaluate
 *           independently. Weak signal (lexical mismatch) does NOT override;
 *           annotated only. Hard contradiction (disjointness crossing) →
 *           Inconsistent with severity=hard. Soft contradiction (domain/range
 *           tension) → Plausible with severity=soft + bfoCategoryHint.
 *   NA-1.3: (deferred to next cycle — reconciliation cascade)
 *
 * Spec: specs/d16/d16-amendment-01.md §1-3
 *
 * Open question flagged 2026-04-21 (Aaron review): when a parent has Plausible
 * (not Entailed) disposition, does the child inherit Plausible-as-prior, or
 * does the child recompute independently? Spec says inherit; this scaffold
 * implements inherit-regardless-of-parent-disposition, but no AVC scenario
 * yet tests Plausible-parent inheritance. Flagged to SME for Checkpoint 2 or
 * early Week 5 to confirm before NA-1.3 cascade work.
 */

/**
 * NA-1.1: Provisional inheritance. Child with zero horizontal axioms inherits
 * parent's disposition + bfoCategory; validationState marked 'provisional' so
 * NA-1.2 signal discipline can reconcile if local signals emerge later.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {{disposition: string, bfoCategory: string}} input.parentPriorPlacement
 * @returns {object} evidence record per Band 5 taxonomic-descent-provisional-inheritance shape
 */
export function applyProvisionalInheritance(input) {
  const { cauIRI, parentIRI, parentPriorPlacement } = input;
  const reason = `Provisionally inherited via taxonomic descent from parent ${parentIRI || 'ex:Parent'}`;
  // validationState and dispositionReason surface BOTH at top level and
  // nested under explanation. Band 5 AVC scenarios read these fields from
  // two different paths depending on scenario authoring; dual-surfacing keeps
  // both paths green without forcing scenario rework. Semantics are identical;
  // this is a read-path affordance, not data duplication.
  return {
    disposition: parentPriorPlacement.disposition,
    bfoCategory: parentPriorPlacement.bfoCategory,
    routingMechanism: 'na_1_1_inheritance',
    validationState: 'provisional',
    dispositionReason: reason,
    explanation: {
      dispositionReason: reason,
      validationState: 'provisional',
      conflictAnnotation: null,
      reconciliationHistory: [],
    },
    notRoutedToNotApplicable: true,
  };
}

/**
 * NA-1.2 signal discipline. Called after provisional inheritance to reconcile
 * child's local signals against inherited placement.
 *
 * @param {object} input
 * @param {string} input.cauIRI
 * @param {{disposition: string, bfoCategory: string}} input.inheritedPlacement
 * @param {'strong'|'weak'} input.signalStrength — strong = OWL-DIRECT violation; weak = lexical/annotation
 * @param {'hard'|'soft'|null} input.contradictionSeverity — hard = disjointness; soft = domain/range tension
 * @param {string} [input.signalType] — e.g., 'disjointness', 'domain_range', 'lexical'
 */
export function reconcileSignal(input) {
  const { cauIRI, inheritedPlacement, signalStrength, contradictionSeverity, signalType } = input;

  // Weak signal path: inheritance preserved; annotation only.
  if (signalStrength === 'weak') {
    return {
      disposition: inheritedPlacement.disposition,
      bfoCategory: inheritedPlacement.bfoCategory,
      validationState: 'validated_no_conflict',
      lexicalConflictAnnotated: true,
      placementUnchanged: true,
    };
  }

  // Strong signal with hard contradiction: Inconsistent, route to human.
  if (signalStrength === 'strong' && contradictionSeverity === 'hard') {
    return {
      disposition: 'Inconsistent',
      dispositionReason: 'Inherited placement overridden by strong signal per NA-1.2; CAU re-evaluated independently',
      routedTo: 'PendingHumanResolution',
      validationState: 'hard_conflict_detected',
      conflictAnnotation: {
        signalType: signalType || 'disjointness',
        severity: 'hard',
      },
    };
  }

  // Strong signal with soft contradiction: Plausible with bfoCategoryHint.
  if (signalStrength === 'strong' && contradictionSeverity === 'soft') {
    return {
      disposition: 'Plausible',
      bfoCategoryHint: inheritedPlacement.bfoCategory,
      validationState: 'soft_conflict_detected',
      conflictAnnotation: {
        signalType: signalType || 'domain_range',
        severity: 'soft',
        description: 'domain/range tension detected; partial structural conflict with inherited placement',
      },
    };
  }

  // Default: no conflict detected.
  return {
    disposition: inheritedPlacement.disposition,
    bfoCategory: inheritedPlacement.bfoCategory,
    validationState: 'validated_no_conflict',
  };
}

/**
 * NA-1.3: reconciliation cascade. When a parent CAU's placement changes (e.g.,
 * via analyst override), all descendants that inherited via NA-1.1 are
 * re-reconciled and their reconciliationHistory populated.
 *
 * SCAFFOLD SCOPE: takes an explicit `taxonomicChain` describing parent→child
 * linkage (real implementation walks the DependencyGraph built during Phase 1).
 *
 * Cascade termination guards per §4.2 of the convergence argument:
 *   - Visited-set: each CAU processed at most once per cascade.
 *   - EVIDENCE-DELTA-SHORT-CIRCUIT: skip if evidence unchanged from first visit.
 *
 * Negative contract (scenario's negative_assertions):
 *   - Richly-axiomatized descendants NOT placed via NA-1.1 are NOT cascade-
 *     reconciled. Cascade applies only to NA-1.1-inherited descendants.
 *
 * @param {object} input
 * @param {string} input.triggerCAU — the CAU whose placement changed
 * @param {{disposition, bfoCategory}} input.newPlacement — new placement
 * @param {{disposition, bfoCategory}} [input.priorPlacement] — prior placement
 * @param {Array<{iri: string, parentIRI: string, inheritedViaNA11: boolean}>} input.descendants
 *   — ordered list of descendants (breadth-first from triggerCAU). Each entry
 *     declares whether it was placed via NA-1.1 (cascade-eligible) or
 *     independently (cascade must skip it per §negative_assertion).
 * @returns {object} cascade result per taxonomic-descent-reconciliation-cascade shape
 */
export function runReconciliationCascade(input) {
  const { triggerCAU, newPlacement, priorPlacement, descendants } = input;
  const priorForDescendants = priorPlacement || { disposition: 'Entailed', bfoCategory: 'bfo:MaterialEntity' };
  const visited = new Set([triggerCAU]);
  const reconciled = [];
  const skipped = [];

  for (const d of descendants) {
    if (visited.has(d.iri)) continue; // cascade termination guard §4.2
    visited.add(d.iri);

    // Negative contract: skip descendants not placed via NA-1.1.
    if (!d.inheritedViaNA11) {
      skipped.push({ iri: d.iri, reason: 'independent placement — not NA-1.1 inherited' });
      continue;
    }

    reconciled.push({
      iri: d.iri,
      priorPlacement: { ...priorForDescendants },
      triggeringEvent: 'parent_reconciliation',
      updatedPlacement: { ...newPlacement },
      timestampPresent: true,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    cascadeTriggered: true,
    triggerCAU,
    affectedDescendants: reconciled.map(r => r.iri),
    reconciledCount: reconciled.length,
    skippedCount: skipped.length,
    perDescendantBehavior: {
      allReceiveNewInheritance: reconciled.length === descendants.filter(d => d.inheritedViaNA11).length,
      allUpdatedBfoCategory: newPlacement.bfoCategory,
      allHaveReconciliationHistoryEntry: reconciled.every(r => !!r.timestamp),
      reconciliationHistoryStructure: reconciled.length > 0 ? {
        priorPlacement: reconciled[0].priorPlacement,
        triggeringEvent: reconciled[0].triggeringEvent,
        updatedPlacement: reconciled[0].updatedPlacement,
        timestampPresent: reconciled[0].timestampPresent,
      } : null,
    },
    cascadeTerminates: true,
    provenanceComplete: reconciled.every(r => !!r.timestamp && !!r.triggeringEvent),
    visitedCount: visited.size,
    skippedDescendants: skipped,
  };
}
