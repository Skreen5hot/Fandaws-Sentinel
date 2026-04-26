/**
 * Bucket C — Tau Prolog session lifecycle integration tests.
 *
 * Per X6 memo §6 + implementation plan §5.2 #1, #2:
 *   - Session init at orchestrator start (here: caller-owned per L2 lock)
 *   - Assertion isolation across CAUs in session
 *   - Step-cap-fallback orchestration with fallbackUsed annotation
 *   - Throw-not-warn discipline for contract violations
 *
 * Tau Prolog v0.3.4 fires answer callbacks via setTimeout(0); the substrate
 * is async/Promise-based. All session-touching tests use await.
 *
 * No NC implementations exercised here — those land Commits 2 + 3.
 */

import { describe, it, expect } from '@jest/globals';
import {
  initBucketCPrologSession,
  teardownPrologSession,
  assertCAU,
  retractCAU,
  withCAUAssertions,
  runPrologQuery,
  tryDerivationWithFallback,
  PrologSessionContractViolationError,
  DEFAULT_STEP_CAP,
  _internals,
} from '../../../src/core/d16/bucket-c-prolog.js';

function emptySignature() {
  return {
    propertyRestrictionsAsDomain: [],
    propertyRestrictionsAsRange: [],
    existentialRestrictions: [],
    cardinalityRestrictions: [],
    universalRestrictions: [],
    hasValueRestrictions: [],
    disjointnessAssertions: [],
    equivalenceClaims: [],
    characteristics: [],
    normalizedEnumerations: [],
  };
}

describe('Bucket C — session lifecycle', () => {
  it('initBucketCPrologSession returns a handle with default step cap 10000', async () => {
    const handle = await initBucketCPrologSession();
    expect(handle.session).toBeTruthy();
    expect(handle.stepCap).toBe(10000);
    expect(handle.stepCap).toBe(DEFAULT_STEP_CAP);
    expect(handle.assertedCAUs).toBeInstanceOf(Set);
    expect(handle.assertedCAUs.size).toBe(0);
    expect(handle.teardownComplete).toBe(false);
    teardownPrologSession(handle);
  });

  it('respects custom step cap', async () => {
    const handle = await initBucketCPrologSession({ stepCap: 500 });
    expect(handle.stepCap).toBe(500);
    teardownPrologSession(handle);
  });

  it('rejects on invalid stepCap', async () => {
    await expect(initBucketCPrologSession({ stepCap: 0 })).rejects.toThrow(PrologSessionContractViolationError);
    await expect(initBucketCPrologSession({ stepCap: -1 })).rejects.toThrow(/positive integer/);
    await expect(initBucketCPrologSession({ stepCap: 1.5 })).rejects.toThrow(/positive integer/);
  });

  it('teardownPrologSession marks session complete and is idempotent', async () => {
    const handle = await initBucketCPrologSession();
    teardownPrologSession(handle);
    expect(handle.teardownComplete).toBe(true);
    expect(handle.session).toBeNull();
    expect(() => teardownPrologSession(handle)).not.toThrow();
  });

  it('post-teardown operations throw PrologSessionContractViolationError', async () => {
    const handle = await initBucketCPrologSession();
    teardownPrologSession(handle);
    await expect(assertCAU(handle, 'ex:CAU', emptySignature(), [])).rejects.toThrow(PrologSessionContractViolationError);
    expect(() => runPrologQuery(handle, 'is_subclass_of(X, Y).')).toThrow(/torn down|null/);
  });
});

describe('Bucket C — BFO background theory', () => {
  it('BFO class hierarchy is queryable via is_subclass_of', async () => {
    const handle = await initBucketCPrologSession();
    expect((await runPrologQuery(handle, "is_subclass_of('bfo:Process', 'bfo:Occurrent').")).outcome).toBe('succeeded');
    expect((await runPrologQuery(handle, "is_subclass_of('bfo:Function', 'bfo:Entity').")).outcome).toBe('succeeded');
    expect((await runPrologQuery(handle, "is_subclass_of('bfo:Process', 'bfo:Continuant').")).outcome).toBe('failed');
    teardownPrologSession(handle);
  });

  it('BFO disjointness is derivable for top-level pair', async () => {
    const handle = await initBucketCPrologSession();
    expect((await runPrologQuery(handle, "derivable_disjoint('bfo:Continuant', 'bfo:Occurrent').")).outcome).toBe('succeeded');
    expect((await runPrologQuery(handle, "derivable_disjoint('bfo:Occurrent', 'bfo:Continuant').")).outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('BFO disjointness propagates through subclass closure', async () => {
    const handle = await initBucketCPrologSession();
    const r = await runPrologQuery(handle, "derivable_disjoint('bfo:Process', 'bfo:MaterialEntity').");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('BFO disjointness includes MaterialEntity / ImmaterialEntity sibling pair', async () => {
    const handle = await initBucketCPrologSession();
    const r = await runPrologQuery(handle, "derivable_disjoint('bfo:MaterialEntity', 'bfo:ImmaterialEntity').");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('BFO disjointness includes OneDim/ZeroDim TR sibling pair (ProcessNC3 §5.4 cross-NC)', async () => {
    const handle = await initBucketCPrologSession();
    const r = await runPrologQuery(handle, "derivable_disjoint('bfo:OneDimensionalTemporalRegion', 'bfo:ZeroDimensionalTemporalRegion').");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });
});

describe('Bucket C — assertion isolation', () => {
  it('assertCAU adds CAU facts queryable via cau_ancestor', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:MyCAU', emptySignature(), ['bfo:MaterialEntity', 'bfo:IndependentContinuant', 'bfo:Continuant']);
    expect(handle.assertedCAUs.has('ex:MyCAU')).toBe(true);

    const r = await runPrologQuery(handle, "cau_ancestor('ex:MyCAU', 'bfo:MaterialEntity').");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('assertCAU encodes propertyRestrictionsAsDomain into Prolog facts', async () => {
    const handle = await initBucketCPrologSession();
    const sig = emptySignature();
    sig.propertyRestrictionsAsDomain.push({
      property: 'bfo:inheresIn',
      restrictionKind: 'someValuesFrom',
      target: 'bfo:MaterialEntity',
    });
    await assertCAU(handle, 'ex:RoleCAU', sig, []);

    const r = await runPrologQuery(handle, "cau_property_restriction('ex:RoleCAU', 'bfo:inheresIn', _, _).");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('assertCAU twice on same CAU rejects', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:CAU', emptySignature(), []);
    await expect(assertCAU(handle, 'ex:CAU', emptySignature(), [])).rejects.toThrow(/already asserted/);
    teardownPrologSession(handle);
  });

  it('retractCAU removes per-CAU facts', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:CAU', emptySignature(), ['bfo:Process']);
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU', 'bfo:Process').")).outcome).toBe('succeeded');

    await retractCAU(handle, 'ex:CAU');
    expect(handle.assertedCAUs.has('ex:CAU')).toBe(false);
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU', 'bfo:Process').")).outcome).toBe('failed');
    teardownPrologSession(handle);
  });

  it('retractCAU is idempotent on unasserted CAU', async () => {
    const handle = await initBucketCPrologSession();
    await expect(retractCAU(handle, 'ex:NeverAsserted')).resolves.not.toThrow();
    teardownPrologSession(handle);
  });

  it('assertion isolation: two CAUs in sequence do not leak facts', async () => {
    const handle = await initBucketCPrologSession();

    await assertCAU(handle, 'ex:CAU1', emptySignature(), ['bfo:Process']);
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU1', 'bfo:Process').")).outcome).toBe('succeeded');
    await retractCAU(handle, 'ex:CAU1');

    await assertCAU(handle, 'ex:CAU2', emptySignature(), ['bfo:MaterialEntity']);
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU1', 'bfo:Process').")).outcome).toBe('failed');
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU2', 'bfo:MaterialEntity').")).outcome).toBe('succeeded');
    await retractCAU(handle, 'ex:CAU2');
    teardownPrologSession(handle);
  });

  it('withCAUAssertions retracts even when callback throws', async () => {
    const handle = await initBucketCPrologSession();
    await expect(
      withCAUAssertions(handle, 'ex:CAU', emptySignature(), ['bfo:Continuant'], async () => {
        throw new Error('callback threw');
      }),
    ).rejects.toThrow('callback threw');
    expect(handle.assertedCAUs.has('ex:CAU')).toBe(false);
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU', 'bfo:Continuant').")).outcome).toBe('failed');
    teardownPrologSession(handle);
  });

  it('withCAUAssertions returns callback value on success', async () => {
    const handle = await initBucketCPrologSession();
    const value = await withCAUAssertions(handle, 'ex:CAU', emptySignature(), [], async () => 42);
    expect(value).toBe(42);
    expect(handle.assertedCAUs.has('ex:CAU')).toBe(false);
    teardownPrologSession(handle);
  });

  it('assertCAU rejects on missing cauIRI', async () => {
    const handle = await initBucketCPrologSession();
    await expect(assertCAU(handle, '', emptySignature(), [])).rejects.toThrow(/cauIRI required/);
    await expect(assertCAU(handle, null, emptySignature(), [])).rejects.toThrow(/cauIRI required/);
    teardownPrologSession(handle);
  });
});

describe('Bucket C — query execution outcomes', () => {
  it('runPrologQuery distinguishes succeeded / failed', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:CAU', emptySignature(), ['bfo:Continuant']);

    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU', 'bfo:Continuant').")).outcome).toBe('succeeded');
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU', 'bfo:Process').")).outcome).toBe('failed');
    teardownPrologSession(handle);
  });

  it('runPrologQuery throws on invalid query string', () => {
    expect(() => runPrologQuery({ session: {}, teardownComplete: false }, '')).toThrow(/queryString required/);
    expect(() => runPrologQuery({ session: {}, teardownComplete: false }, null)).toThrow(/queryString required/);
  });
});

describe('Bucket C — derivable property restriction inheritance', () => {
  it('CAU with no inheresIn restriction but SDC ancestor → cau_has_property_restriction succeeds (derived)', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:RoleCAU', emptySignature(), ['bfo:Role', 'bfo:SpecificallyDependentContinuant', 'bfo:Continuant']);

    const r = await runPrologQuery(handle, "cau_has_property_restriction('ex:RoleCAU', 'bfo:inheresIn', _).");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('CAU with no inheresIn restriction and IndependentContinuant ancestor → cau_has_property_restriction fails', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:RockCAU', emptySignature(), ['bfo:MaterialEntity', 'bfo:IndependentContinuant']);

    const r = await runPrologQuery(handle, "cau_has_property_restriction('ex:RockCAU', 'bfo:inheresIn', _).");
    expect(r.outcome).toBe('failed');
    teardownPrologSession(handle);
  });

  it('OWA preservation: CAU with literal inheresIn restriction → presence derivable directly', async () => {
    const handle = await initBucketCPrologSession();
    const sig = emptySignature();
    sig.propertyRestrictionsAsDomain.push({ property: 'bfo:inheresIn', restrictionKind: 'someValuesFrom', target: 'bfo:MaterialEntity' });
    await assertCAU(handle, 'ex:CAU', sig, []);

    const r = await runPrologQuery(handle, "cau_has_property_restriction('ex:CAU', 'bfo:inheresIn', _).");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });
});

describe('Bucket C — derivable disjointness (OccurrentNC2 substrate)', () => {
  it('CAU with bfo:Process ancestor → derivable_cau_disjoint_with bfo:Continuant', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:Activity', emptySignature(), ['bfo:Process', 'bfo:Occurrent']);

    const r = await runPrologQuery(handle, "derivable_cau_disjoint_with('ex:Activity', 'bfo:Continuant').");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('CAU with bfo:MaterialEntity ancestor → NOT derivable_cau_disjoint_with bfo:Continuant', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:Rock', emptySignature(), ['bfo:MaterialEntity', 'bfo:IndependentContinuant', 'bfo:Continuant']);

    const r = await runPrologQuery(handle, "derivable_cau_disjoint_with('ex:Rock', 'bfo:Continuant').");
    expect(r.outcome).toBe('failed');
    teardownPrologSession(handle);
  });
});

describe('Bucket C — matter-constitution helpers (MENC2/IENC2 substrate)', () => {
  it('CAU with MaterialEntity ancestor → matter-constitution-compat derivable', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:Rock', emptySignature(), ['bfo:MaterialEntity', 'bfo:IndependentContinuant']);

    const r = await runPrologQuery(handle, "cau_has_continuant_part_chain_terminating_in_material('ex:Rock').");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('CAU with hasContinuantPart restriction targeting MaterialEntity → matter-constitution-compat derivable', async () => {
    const handle = await initBucketCPrologSession();
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:hasContinuantPart', someValuesFrom: 'bfo:MaterialEntity' });
    await assertCAU(handle, 'ex:CompositeCAU', sig, ['bfo:IndependentContinuant']);

    const r = await runPrologQuery(handle, "cau_has_continuant_part_chain_terminating_in_material('ex:CompositeCAU').");
    expect(r.outcome).toBe('succeeded');
    teardownPrologSession(handle);
  });

  it('CAU with ImmaterialEntity ancestor only → matter-constitution-compat NOT derivable', async () => {
    const handle = await initBucketCPrologSession();
    await assertCAU(handle, 'ex:SiteCAU', emptySignature(), ['bfo:Site', 'bfo:ImmaterialEntity', 'bfo:IndependentContinuant']);

    const r = await runPrologQuery(handle, "cau_has_continuant_part_chain_terminating_in_material('ex:SiteCAU').");
    expect(r.outcome).toBe('failed');
    teardownPrologSession(handle);
  });
});

describe('Bucket C — tryDerivationWithFallback orchestration', () => {
  it('derivation succeeds within cap → fallbackUsed: false', async () => {
    const handle = await initBucketCPrologSession();
    const result = await tryDerivationWithFallback({
      prologSession: handle,
      cauIRI: 'ex:Activity',
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:Process', 'bfo:Occurrent'],
      queryString: "derivable_cau_disjoint_with('ex:Activity', 'bfo:Continuant').",
      structuralFallback: () => ({ result: false, reason: 'fallback-should-not-fire' }),
    });
    expect(result.derivedOutcome).toBe('succeeded');
    expect(result.fallbackUsed).toBe(false);
    expect(result.fallbackTrigger).toBeNull();
    expect(result.fallbackResult).toBeNull();
    teardownPrologSession(handle);
  });

  it('derivation fails (no answer) within cap → fallbackUsed: false, derivedOutcome failed', async () => {
    const handle = await initBucketCPrologSession();
    const result = await tryDerivationWithFallback({
      prologSession: handle,
      cauIRI: 'ex:Rock',
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:MaterialEntity'],
      queryString: "cau_has_property_restriction('ex:Rock', 'bfo:inheresIn', _).",
      structuralFallback: () => ({ result: true, reason: 'fallback-should-not-fire' }),
    });
    expect(result.derivedOutcome).toBe('failed');
    expect(result.fallbackUsed).toBe(false);
    expect(result.fallbackResult).toBeNull();
    teardownPrologSession(handle);
  });

  it('cap exhaustion fires structural fallback with annotation', async () => {
    // Per-query step cap resets per call. Empirically: assertz queries
    // take ~10 steps each; disjointness derivation across deep ancestor
    // chain takes ~80+ steps. Cap=30 lets assertz succeed but exhausts
    // the derivation query.
    const handle = await initBucketCPrologSession({ stepCap: 30 });
    const fallbackCalls = [];
    const result = await tryDerivationWithFallback({
      prologSession: handle,
      cauIRI: 'ex:DeepCAU',
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:Function', 'bfo:Disposition', 'bfo:SpecificallyDependentContinuant', 'bfo:Continuant', 'bfo:Entity'],
      queryString: "derivable_cau_disjoint_with('ex:DeepCAU', 'bfo:Process').",
      structuralFallback: ({ cauSignature, ancestorChain }) => {
        fallbackCalls.push({ cauSignature, ancestorChain });
        return { result: true, reason: 'structural_disjointness_via_subtree' };
      },
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackTrigger).toBe('step_cap_exhausted');
    expect(result.fallbackResult).toEqual({ result: true, reason: 'structural_disjointness_via_subtree' });
    expect(result.derivedOutcome).toBeNull();
    expect(fallbackCalls).toHaveLength(1);
    expect(fallbackCalls[0].ancestorChain).toContain('bfo:Function');
    teardownPrologSession(handle);
  });

  it('throws when structuralFallback is not a function', async () => {
    const handle = await initBucketCPrologSession();
    await expect(tryDerivationWithFallback({
      prologSession: handle,
      cauIRI: 'ex:CAU',
      cauSignature: emptySignature(),
      ancestorChain: [],
      queryString: 'true.',
      structuralFallback: null,
    })).rejects.toThrow(/structuralFallback function required/);
    teardownPrologSession(handle);
  });

  it('retracts CAU assertions after derivation regardless of outcome', async () => {
    const handle = await initBucketCPrologSession();
    await tryDerivationWithFallback({
      prologSession: handle,
      cauIRI: 'ex:CAU',
      cauSignature: emptySignature(),
      ancestorChain: ['bfo:Process'],
      queryString: "cau_ancestor('ex:CAU', 'bfo:Process').",
      structuralFallback: () => ({ result: false, reason: 'unused' }),
    });
    expect(handle.assertedCAUs.has('ex:CAU')).toBe(false);
    expect((await runPrologQuery(handle, "cau_ancestor('ex:CAU', 'bfo:Process').")).outcome).toBe('failed');
    teardownPrologSession(handle);
  });
});

describe('Bucket C — buildCAUAssertQueries (internal)', () => {
  it('encodes ancestorChain as cau_ancestor assertz queries', () => {
    const queries = _internals.buildCAUAssertQueries('ex:X', emptySignature(), ['bfo:A', 'bfo:B']);
    expect(queries).toContain("assertz(cau_ancestor('ex:X', 'bfo:A')).");
    expect(queries).toContain("assertz(cau_ancestor('ex:X', 'bfo:B')).");
  });

  it('encodes existential restrictions with someValuesFrom kind', () => {
    const sig = emptySignature();
    sig.existentialRestrictions.push({ onProperty: 'bfo:inheresIn', someValuesFrom: 'bfo:MaterialEntity' });
    const queries = _internals.buildCAUAssertQueries('ex:X', sig, []);
    expect(queries).toContain("assertz(cau_property_restriction('ex:X', 'bfo:inheresIn', 'someValuesFrom', 'bfo:MaterialEntity')).");
  });

  it('encodes disjointnessAssertions and equivalenceClaims', () => {
    const sig = emptySignature();
    sig.disjointnessAssertions = ['bfo:Occurrent'];
    sig.equivalenceClaims = ['bfo:Continuant'];
    const queries = _internals.buildCAUAssertQueries('ex:X', sig, []);
    expect(queries).toContain("assertz(cau_disjointness('ex:X', 'bfo:Occurrent')).");
    expect(queries).toContain("assertz(cau_equivalence('ex:X', 'bfo:Continuant')).");
  });

  it('escapes single quotes in IRIs', () => {
    const queries = _internals.buildCAUAssertQueries("ex:Don't", emptySignature(), ['bfo:Continuant']);
    expect(queries[0]).toContain("'ex:Don\\'t'");
  });
});
