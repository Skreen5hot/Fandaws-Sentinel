/**
 * Bucket C — Tau Prolog session lifecycle + helper-predicate substrate +
 * step-cap-fallback orchestration. Per SME-D16-X6 memo (LOCKED 2026-04-25).
 *
 * Scope (Commit 1 of 4 staged commits per X6 memo §9 / implementation plan §6):
 *   - Session lifecycle (init / teardown / assertion isolation)
 *   - BFO 2020 background theory loaded once per session
 *   - Helper predicates referenced by NC contracts (`derivable_*` family)
 *   - Generic Prolog query runner with step-cap detection
 *   - Step-cap-fallback orchestrator (Prolog primary + structural fallback)
 *   - PrologSessionContractViolationError for throw-not-warn discipline
 *
 * NOT in scope for Commit 1 (lands Commits 2–3):
 *   - The 6 OWL-DERIVED NC implementations (ICNC2, ICNC3, MENC2, IENC2,
 *     OccurrentNC2, ProcessNC3)
 *   - nc-dispatcher.js prologSession threading
 *
 * Architecture per implementation plan §2 (L2 confirmed by SME 2026-04-25):
 *   The orchestrator is stateless. The CALLER (CLI harness, Workbench host,
 *   test fixture) owns the prologSession variable. Sessions are passed
 *   explicitly per-call into evaluateNCSatisfaction → dispatcher → helper.
 *   Init cost amortizes at the caller; the orchestrator/dispatcher do not
 *   hold session-state.
 *
 * Async API: tau-prolog v0.3.4 fires answer callbacks via setTimeout(0)
 * (see node_modules/tau-prolog/modules/core.js Thread.prototype.again
 * lines 3187–3237). All session-touching APIs are async/Promise-based.
 *
 * Step cap = 10,000 (matches Phase D2 D-12 hornInferenceStepCap; per X6
 * memo §6.4). Constant for Bucket C v1; if ever promoted to session-config,
 * X2 §4.4 amendment criteria fires synchronously.
 */

import tauProlog from 'tau-prolog';

const pl = tauProlog;

export const DEFAULT_STEP_CAP = 10000;

// ── Error classes ────────────────────────────────────────────────────

/**
 * Thrown when the Tau Prolog session is in an invalid state OR when a
 * helper invocation violates the session contract (e.g., asserting a CAU
 * that's already asserted; querying with no session). Per
 * `feedback_throw_not_warn_enforcement.md`: contract violations throw at
 * the closest enforcement layer to root cause.
 *
 * Step-cap exhaustion is NOT a contract violation — it is a designed
 * fallback trigger (per X6 memo §3.1). Step-cap exhaustion routes through
 * tryDerivationWithFallback, NOT through this error class.
 */
export class PrologSessionContractViolationError extends Error {
  constructor(message, context = {}) {
    super(`PrologSessionContractViolationError: ${message}`);
    this.name = 'PrologSessionContractViolationError';
    this.context = context;
  }
}

// ── BFO 2020 background theory ───────────────────────────────────────

// Curated subset of BFO 2020 class hierarchy + disjointness assertions
// + helper-predicate definitions referenced by NC contracts. Encoded as
// Prolog facts/rules; loaded once per session.
//
// Per-CAU predicates (asserted/retracted at runtime via dynamic-clause
// manipulation) MUST be declared `:- dynamic(...)` at the top so that
// assertz/retractall succeed without the static-predicate type error.
const BFO_BACKGROUND_PROGRAM = `
  :- dynamic(cau_ancestor/2).
  :- dynamic(cau_property_restriction/4).
  :- dynamic(cau_disjointness/2).
  :- dynamic(cau_equivalence/2).
  :- dynamic(cau_cardinality/3).

  bfo_parent_of('bfo:Continuant', 'bfo:Entity').
  bfo_parent_of('bfo:Occurrent', 'bfo:Entity').
  bfo_parent_of('bfo:IndependentContinuant', 'bfo:Continuant').
  bfo_parent_of('bfo:SpecificallyDependentContinuant', 'bfo:Continuant').
  bfo_parent_of('bfo:GenericallyDependentContinuant', 'bfo:Continuant').
  bfo_parent_of('bfo:MaterialEntity', 'bfo:IndependentContinuant').
  bfo_parent_of('bfo:ImmaterialEntity', 'bfo:IndependentContinuant').
  bfo_parent_of('bfo:Site', 'bfo:ImmaterialEntity').
  bfo_parent_of('bfo:Role', 'bfo:SpecificallyDependentContinuant').
  bfo_parent_of('bfo:Disposition', 'bfo:SpecificallyDependentContinuant').
  bfo_parent_of('bfo:Function', 'bfo:Disposition').
  bfo_parent_of('bfo:Quality', 'bfo:SpecificallyDependentContinuant').
  bfo_parent_of('bfo:Process', 'bfo:Occurrent').
  bfo_parent_of('bfo:ProcessBoundary', 'bfo:Occurrent').
  bfo_parent_of('bfo:TemporalRegion', 'bfo:Occurrent').
  bfo_parent_of('bfo:OneDimensionalTemporalRegion', 'bfo:TemporalRegion').
  bfo_parent_of('bfo:ZeroDimensionalTemporalRegion', 'bfo:TemporalRegion').

  is_subclass_of(X, X).
  is_subclass_of(X, Y) :- bfo_parent_of(X, Y).
  is_subclass_of(X, Z) :- bfo_parent_of(X, Y), is_subclass_of(Y, Z).

  bfo_disjoint_pair('bfo:Continuant', 'bfo:Occurrent').
  bfo_disjoint_pair('bfo:IndependentContinuant', 'bfo:SpecificallyDependentContinuant').
  bfo_disjoint_pair('bfo:IndependentContinuant', 'bfo:GenericallyDependentContinuant').
  bfo_disjoint_pair('bfo:SpecificallyDependentContinuant', 'bfo:GenericallyDependentContinuant').
  bfo_disjoint_pair('bfo:MaterialEntity', 'bfo:ImmaterialEntity').
  bfo_disjoint_pair('bfo:Process', 'bfo:ProcessBoundary').
  bfo_disjoint_pair('bfo:Process', 'bfo:TemporalRegion').
  bfo_disjoint_pair('bfo:ProcessBoundary', 'bfo:TemporalRegion').
  bfo_disjoint_pair('bfo:OneDimensionalTemporalRegion', 'bfo:ZeroDimensionalTemporalRegion').

  derivable_disjoint(X, Y) :- bfo_disjoint_pair(X, Y).
  derivable_disjoint(X, Y) :- bfo_disjoint_pair(Y, X).
  derivable_disjoint(X, Y) :- is_subclass_of(X, X1), bfo_disjoint_pair(X1, Y1), is_subclass_of(Y, Y1).
  derivable_disjoint(X, Y) :- is_subclass_of(X, X1), bfo_disjoint_pair(Y1, X1), is_subclass_of(Y, Y1).

  bfo_property_domain('bfo:inheresIn', 'bfo:SpecificallyDependentContinuant').
  bfo_property_domain('bfo:concretizes', 'bfo:GenericallyDependentContinuant').
  bfo_property_domain('bfo:occupiesTemporalRegion', 'bfo:Occurrent').
  bfo_property_domain('bfo:occupiesSpatialRegion', 'bfo:MaterialEntity').

  ancestor_inherits_property(CAU, Property) :-
    cau_ancestor(CAU, Ancestor),
    bfo_property_domain(Property, DomainClass),
    is_subclass_of(Ancestor, DomainClass).

  cau_has_property_restriction(CAU, Property, _) :-
    cau_property_restriction(CAU, Property, _, _).
  cau_has_property_restriction(CAU, Property, Target) :-
    cau_property_restriction(CAU, Property, _, Target).
  cau_has_property_restriction(CAU, Property, _) :-
    ancestor_inherits_property(CAU, Property).

  derivable_cau_disjoint_with(CAU, OtherClass) :-
    cau_ancestor(CAU, Ancestor),
    derivable_disjoint(Ancestor, OtherClass).
  derivable_cau_disjoint_with(CAU, OtherClass) :-
    cau_disjointness(CAU, Asserted),
    is_subclass_of(Asserted, OtherClass).

  cau_admits_property_restriction(CAU, Property, Filler) :-
    cau_property_restriction(CAU, Property, _, Filler).
  cau_admits_property_restriction(CAU, Property, Filler) :-
    cau_property_restriction(CAU, Property, _, Target),
    is_subclass_of(Target, Filler).
  cau_admits_property_restriction(CAU, Property, _) :-
    ancestor_inherits_property(CAU, Property).

  cau_has_continuant_part_chain_terminating_in_material(CAU) :-
    cau_property_restriction(CAU, 'bfo:hasContinuantPart', _, Target),
    is_subclass_of(Target, 'bfo:MaterialEntity').
  cau_has_continuant_part_chain_terminating_in_material(CAU) :-
    cau_ancestor(CAU, 'bfo:MaterialEntity').
  cau_has_continuant_part_chain_terminating_in_material(CAU) :-
    cau_ancestor(CAU, Ancestor),
    is_subclass_of(Ancestor, 'bfo:MaterialEntity').

  cau_has_material_continuant_part(CAU) :-
    cau_has_continuant_part_chain_terminating_in_material(CAU).
`;

// ── Session lifecycle ────────────────────────────────────────────────

/**
 * Initialize a Tau Prolog session for Bucket C OWL-DERIVED inference.
 * BFO 2020 axioms + helper predicates loaded once.
 *
 * Returns a Promise so the caller can await BFO-program consult completion.
 *
 * @param {object} [options]
 * @param {number} [options.stepCap=10000]
 * @returns {Promise<object>} prologSession handle
 */
export async function initBucketCPrologSession({ stepCap = DEFAULT_STEP_CAP } = {}) {
  if (!Number.isInteger(stepCap) || stepCap <= 0) {
    throw new PrologSessionContractViolationError(
      `stepCap must be a positive integer; got ${stepCap}`,
      { stepCap },
    );
  }

  const session = pl.create(stepCap);

  await new Promise((resolve, reject) => {
    session.consult(BFO_BACKGROUND_PROGRAM, {
      success: () => resolve(),
      error: (err) => reject(new PrologSessionContractViolationError(
        `BFO background-theory consult failed: ${prologErrToString(err)}`,
        { consultErr: err },
      )),
    });
  });

  return {
    session,
    stepCap,
    assertedCAUs: new Set(),
    teardownComplete: false,
  };
}

/**
 * Teardown — synchronous; clears assertion-tracking state and detaches the
 * session reference. Idempotent.
 */
export function teardownPrologSession(prologSession) {
  if (!prologSession || prologSession.teardownComplete) return;
  prologSession.assertedCAUs.clear();
  prologSession.session = null;
  prologSession.teardownComplete = true;
}

// ── Per-CAU assertion isolation ──────────────────────────────────────

/**
 * Assert a CAU's signature + ancestor chain into the Prolog session.
 * MUST be paired with retractCAU before evaluating a different CAU.
 * Async — awaits assertz queries.
 */
export async function assertCAU(prologSession, cauIRI, cauSignature, ancestorChain = []) {
  guardSession(prologSession);
  if (!cauIRI) {
    throw new PrologSessionContractViolationError('cauIRI required for assertCAU');
  }
  if (prologSession.assertedCAUs.has(cauIRI)) {
    throw new PrologSessionContractViolationError(
      `CAU ${cauIRI} already asserted in session; retract before re-asserting`,
      { cauIRI, asserted: [...prologSession.assertedCAUs] },
    );
  }

  const assertQueries = buildCAUAssertQueries(cauIRI, cauSignature, ancestorChain);
  for (const q of assertQueries) {
    await runDynamicClauseQuery(prologSession, q);
  }

  prologSession.assertedCAUs.add(cauIRI);
}

/**
 * Retract all per-CAU facts. Idempotent.
 */
export async function retractCAU(prologSession, cauIRI) {
  guardSession(prologSession);
  if (!prologSession.assertedCAUs.has(cauIRI)) return;

  const cauAtom = prologAtom(cauIRI);
  const retractQueries = [
    `retractall(cau_ancestor(${cauAtom}, _)).`,
    `retractall(cau_property_restriction(${cauAtom}, _, _, _)).`,
    `retractall(cau_disjointness(${cauAtom}, _)).`,
    `retractall(cau_equivalence(${cauAtom}, _)).`,
    `retractall(cau_cardinality(${cauAtom}, _, _)).`,
  ];
  for (const q of retractQueries) {
    await runDynamicClauseQuery(prologSession, q);
  }

  prologSession.assertedCAUs.delete(cauIRI);
}

/**
 * Convenience wrapper — assert, run callback, retract (try/finally-safe).
 */
export async function withCAUAssertions(prologSession, cauIRI, cauSignature, ancestorChain, fn) {
  await assertCAU(prologSession, cauIRI, cauSignature, ancestorChain);
  try {
    return await fn();
  } finally {
    await retractCAU(prologSession, cauIRI);
  }
}

// ── Query execution with step-cap detection ──────────────────────────

/**
 * Execute a Prolog query against the session. Returns a Promise resolving
 * to one of:
 *   { outcome: 'succeeded' }     — first answer found.
 *   { outcome: 'failed' }        — no answers.
 *   { outcome: 'cap_exhausted' } — step cap hit before definitive answer.
 *
 * Rejects with PrologSessionContractViolationError on Prolog runtime
 * errors (predicate undefined, malformed query). Step-cap exhaustion
 * does NOT reject — it resolves with outcome: 'cap_exhausted'.
 */
export function runPrologQuery(prologSession, queryString) {
  guardSession(prologSession);
  if (typeof queryString !== 'string' || queryString.length === 0) {
    throw new PrologSessionContractViolationError(
      `queryString required; got ${typeof queryString}`,
      { queryString },
    );
  }

  return new Promise((resolve, reject) => {
    prologSession.session.query(queryString, {
      success: () => {
        prologSession.session.answer({
          success: () => resolve({ outcome: 'succeeded' }),
          fail: () => resolve({ outcome: 'failed' }),
          error: (err) => reject(new PrologSessionContractViolationError(
            `Prolog query runtime error: ${prologErrToString(err)}`,
            { queryString, queryErr: err },
          )),
          limit: () => resolve({ outcome: 'cap_exhausted' }),
        });
      },
      error: (err) => reject(new PrologSessionContractViolationError(
        `Prolog query parse error: ${prologErrToString(err)}`,
        { queryString, queryErr: err },
      )),
    });
  });
}

// ── Step-cap-fallback orchestrator ───────────────────────────────────

/**
 * Run a derivation query under step-cap; on cap exhaustion, invoke the
 * caller-supplied structural-correspondence fallback. Result includes
 * `fallbackUsed: boolean` annotation per X6 memo §3.3 provenance discipline.
 *
 * @returns {Promise<{
 *   derivedOutcome: 'succeeded'|'failed'|null,
 *   fallbackUsed: boolean,
 *   fallbackTrigger: 'step_cap_exhausted'|null,
 *   fallbackResult: object|null,
 * }>}
 */
export async function tryDerivationWithFallback({
  prologSession, cauIRI, cauSignature, ancestorChain, queryString, structuralFallback,
}) {
  if (typeof structuralFallback !== 'function') {
    throw new PrologSessionContractViolationError(
      `structuralFallback function required; got ${typeof structuralFallback}`,
    );
  }

  return withCAUAssertions(prologSession, cauIRI, cauSignature, ancestorChain, async () => {
    const queryResult = await runPrologQuery(prologSession, queryString);

    if (queryResult.outcome === 'cap_exhausted') {
      const fallbackResult = structuralFallback({ cauSignature, ancestorChain });
      return {
        derivedOutcome: null,
        fallbackUsed: true,
        fallbackTrigger: 'step_cap_exhausted',
        fallbackResult,
      };
    }

    return {
      derivedOutcome: queryResult.outcome,
      fallbackUsed: false,
      fallbackTrigger: null,
      fallbackResult: null,
    };
  });
}

// ── Internal helpers ─────────────────────────────────────────────────

function guardSession(prologSession) {
  if (!prologSession || !prologSession.session || prologSession.teardownComplete) {
    throw new PrologSessionContractViolationError(
      'prologSession is null, missing session, or already torn down',
      { hasSession: Boolean(prologSession?.session), teardownComplete: prologSession?.teardownComplete },
    );
  }
}

function prologAtom(iri) {
  if (iri == null) return "''";
  return `'${String(iri).replace(/'/g, "\\'")}'`;
}

function prologErrToString(err) {
  if (err == null) return 'unknown';
  if (typeof err === 'string') return err;
  if (typeof pl?.format_answer === 'function') {
    try { return pl.format_answer(err); } catch { /* fall through */ }
  }
  return String(err);
}

function buildCAUAssertQueries(cauIRI, cauSignature, ancestorChain) {
  const cauAtom = prologAtom(cauIRI);
  const queries = [];

  for (const ancestor of ancestorChain || []) {
    queries.push(`assertz(cau_ancestor(${cauAtom}, ${prologAtom(ancestor)})).`);
  }

  for (const r of (cauSignature?.propertyRestrictionsAsDomain || [])) {
    const property = prologAtom(r.property);
    const restKind = prologAtom(r.restrictionKind || 'unspecified');
    const target = prologAtom(r.target == null ? '_unspecified' : r.target);
    queries.push(`assertz(cau_property_restriction(${cauAtom}, ${property}, ${restKind}, ${target})).`);
  }

  for (const r of (cauSignature?.existentialRestrictions || [])) {
    const property = prologAtom(r.onProperty);
    const target = prologAtom(r.someValuesFrom == null ? '_unspecified' : r.someValuesFrom);
    queries.push(`assertz(cau_property_restriction(${cauAtom}, ${property}, 'someValuesFrom', ${target})).`);
  }

  for (const d of (cauSignature?.disjointnessAssertions || [])) {
    queries.push(`assertz(cau_disjointness(${cauAtom}, ${prologAtom(d)})).`);
  }

  for (const e of (cauSignature?.equivalenceClaims || [])) {
    queries.push(`assertz(cau_equivalence(${cauAtom}, ${prologAtom(e)})).`);
  }

  for (const c of (cauSignature?.cardinalityRestrictions || [])) {
    const property = prologAtom(c.onProperty);
    const count = c.cardinality ?? c.qualifiedCardinality ?? c.minCardinality ?? c.maxCardinality ?? 0;
    queries.push(`assertz(cau_cardinality(${cauAtom}, ${property}, ${count})).`);
  }

  return queries;
}

// Run a dynamic-clause query (assertz / retractall) — these always
// produce one true answer. Throws on Prolog error or step-cap exhaustion
// (the latter is a contract violation for cheap dynamic-clause queries).
function runDynamicClauseQuery(prologSession, queryString) {
  return new Promise((resolve, reject) => {
    prologSession.session.query(queryString, {
      success: () => {
        prologSession.session.answer({
          success: () => resolve(),
          fail: () => resolve(), // unexpected for assertz/retractall but harmless
          error: (err) => reject(new PrologSessionContractViolationError(
            `Internal query error during assertz/retractall: ${prologErrToString(err)}`,
            { queryString, queryErr: err },
          )),
          limit: () => reject(new PrologSessionContractViolationError(
            `Step cap exhausted during assertz/retractall — should not happen for dynamic-clause manipulation`,
            { queryString },
          )),
        });
      },
      error: (err) => reject(new PrologSessionContractViolationError(
        `Internal query parse error during assertz/retractall: ${prologErrToString(err)}`,
        { queryString, queryErr: err },
      )),
    });
  });
}

// ── Exported for tests ───────────────────────────────────────────────

export const _internals = Object.freeze({
  BFO_BACKGROUND_PROGRAM,
  buildCAUAssertQueries,
  prologAtom,
});
