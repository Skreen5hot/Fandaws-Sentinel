/**
 * Unit tests — evaluateCAU trichotomy integration (SME-D16-X4 Commit 3).
 *
 * Covers the five routing branches under trichotomy mode:
 *   1. satisfied === required → Entailed
 *   2. unsatisfied + disjointCategoryFullySatisfied → Inconsistent
 *   3. satisfied < required && undetermined > 0 → Plausible (coverage-gap)
 *   4. satisfied < required && undetermined === 0 && unsatisfied > 0 → Plausible (partial-match)
 *   5. satisfied.size === 0 && all required undetermined → Plausible (all-undetermined)
 *
 * Plus legacy-mode backward-compat.
 */

import { evaluateCAU, necessaryConditionsFor } from '../../../src/core/d16/three-state-evaluator.js';

function ncIds(category) {
  return necessaryConditionsFor(category).map((nc) => nc.shortIRI);
}

describe('evaluateCAU trichotomy mode — routing branches', () => {
  it('Branch 1: satisfied === required → Entailed', () => {
    const processNCs = ncIds('bfo:Process');
    const result = evaluateCAU({
      cauIRI: 'ex:P',
      targetCategory: 'bfo:Process',
      ncEvaluation: {
        satisfied: new Set(processNCs),
        unsatisfied: new Set(),
        undetermined: new Set(),
        evidence: new Map(),
      },
      satisfiedNCs: processNCs, // also pass for cross-category disjoint check (same set)
    });
    expect(result.disposition).toBe('Entailed');
    expect(result.bfoCategory).toBe('bfo:Process');
    expect(result.explanation.undeterminedConditionIRIs).toEqual([]);
  });

  it('Branch 2: disjoint category fully satisfied → Inconsistent', () => {
    const icNCs = ncIds('bfo:IndependentContinuant');
    const sdcNCs = ncIds('bfo:SpecificallyDependentContinuant');
    const result = evaluateCAU({
      cauIRI: 'ex:Inc',
      targetCategory: 'bfo:IndependentContinuant',
      ncEvaluation: {
        satisfied: new Set(icNCs),
        unsatisfied: new Set(),
        undetermined: new Set(),
        evidence: new Map(),
      },
      satisfiedNCs: [...icNCs, ...sdcNCs], // cross-category: triggers disjointness
    });
    expect(result.disposition).toBe('Inconsistent');
    expect(result.explanation.disjointViolations.length).toBeGreaterThan(0);
  });

  it('Branch 3: satisfied < required AND undetermined > 0 → Plausible coverage-gap', () => {
    const processNCs = ncIds('bfo:Process');
    const result = evaluateCAU({
      cauIRI: 'ex:Pl',
      targetCategory: 'bfo:Process',
      ncEvaluation: {
        satisfied: new Set(processNCs.slice(0, 2)),
        unsatisfied: new Set(),
        undetermined: new Set(processNCs.slice(2)),
        evidence: new Map(
          processNCs.slice(2).map((nc) => [nc, { deferredReason: 'Bucket-B-deferred-test' }]),
        ),
      },
      satisfiedNCs: processNCs.slice(0, 2),
    });
    expect(result.disposition).toBe('Plausible');
    expect(result.explanation.plausibleAnnotation).toBe('partial-coverage-with-undetermined');
    expect(result.explanation.coverageGap).not.toBeNull();
    expect(result.explanation.coverageGap.undeterminedCount).toBeGreaterThan(0);
    expect(result.explanation.coverageGap.deferredReasons.length).toBeGreaterThan(0);
  });

  it('Branch 4: satisfied < required AND unsatisfied > 0 AND undetermined === 0 → Plausible partial-match', () => {
    const processNCs = ncIds('bfo:Process');
    const result = evaluateCAU({
      cauIRI: 'ex:Pm',
      targetCategory: 'bfo:Process',
      ncEvaluation: {
        satisfied: new Set(processNCs.slice(0, 1)),
        unsatisfied: new Set(processNCs.slice(1)),
        undetermined: new Set(),
        evidence: new Map(),
      },
      satisfiedNCs: processNCs.slice(0, 1),
    });
    expect(result.disposition).toBe('Plausible');
    expect(result.explanation.plausibleAnnotation).toBe('partial-match');
    expect(result.explanation.coverageGap).toBeNull();
  });

  it('Branch 5: satisfied.size === 0 AND all required undetermined → Plausible all-undetermined', () => {
    const processNCs = ncIds('bfo:Process');
    const result = evaluateCAU({
      cauIRI: 'ex:All-U',
      targetCategory: 'bfo:Process',
      ncEvaluation: {
        satisfied: new Set(),
        unsatisfied: new Set(),
        undetermined: new Set(processNCs),
        evidence: new Map(),
      },
      satisfiedNCs: [],
    });
    expect(result.disposition).toBe('Plausible');
    expect(result.explanation.plausibleAnnotation).toBe('all-required-undetermined');
    expect(result.explanation.coverageGap.undeterminedCount).toBe(processNCs.length);
  });
});

describe('evaluateCAU legacy mode — backward compatibility', () => {
  it('legacy satisfiedNCs Set path produces same output shape (minus undetermined annotations)', () => {
    const processNCs = ncIds('bfo:Process');
    const legacyResult = evaluateCAU({
      cauIRI: 'ex:Legacy',
      targetCategory: 'bfo:Process',
      satisfiedNCs: processNCs,
    });
    expect(legacyResult.disposition).toBe('Entailed');
    // Legacy mode produces undeterminedConditionIRIs as [] (no trichotomy)
    expect(legacyResult.explanation.undeterminedConditionIRIs).toEqual([]);
  });

  it('legacy Plausible mode (some satisfied, none explicitly undetermined)', () => {
    const processNCs = ncIds('bfo:Process');
    const legacyResult = evaluateCAU({
      cauIRI: 'ex:Legacy',
      targetCategory: 'bfo:Process',
      satisfiedNCs: processNCs.slice(0, 1),
    });
    expect(legacyResult.disposition).toBe('Plausible');
    expect(legacyResult.explanation.plausibleAnnotation).toBe('partial-match');
  });

  it('legacy axiomPoor path produces NotApplicable', () => {
    const legacyResult = evaluateCAU({
      cauIRI: 'ex:AP',
      axiomPoor: true,
    });
    expect(legacyResult.disposition).toBe('NotApplicable');
  });
});

describe('evaluateCAU trichotomy — undetermined evidence flow', () => {
  it('deferredReasons in evidence are captured in coverageGap output', () => {
    const processNCs = ncIds('bfo:Process');
    const evidence = new Map();
    for (const nc of processNCs) {
      evidence.set(nc, { deferredReason: `Bucket-B-deferred-${nc}` });
    }
    const result = evaluateCAU({
      cauIRI: 'ex:UTest',
      targetCategory: 'bfo:Process',
      ncEvaluation: {
        satisfied: new Set(),
        unsatisfied: new Set(),
        undetermined: new Set(processNCs),
        evidence,
      },
      satisfiedNCs: [],
    });
    expect(result.explanation.coverageGap.deferredReasons.length).toBe(processNCs.length);
    for (const r of result.explanation.coverageGap.deferredReasons) {
      expect(r.reason).toMatch(/Bucket-B-deferred/);
    }
  });
});
