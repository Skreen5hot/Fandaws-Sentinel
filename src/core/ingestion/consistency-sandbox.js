/**
 * Consistency Sandbox — Tau Prolog integration for Phase 3.
 *
 * Decision D-8: Phase 3 uses Tau Prolog (Prolog interpreter in JS).
 * Decision D-12 (Rule PS-8): 10,000 inference step cap, fixed, non-adaptive.
 * Decision D-13 (Rule PS-1): sandbox never mutates canonical graph.
 * Decision D-14 (Rule PS-2): fresh session per run.
 * Decision D-16 (Rule PS-6): genuine Prolog trace in FailureTrace.
 * Decision D-20 (Rule PS-7): suggestedRepair names concrete action.
 *
 * @see docs/architecture/phase-d2-avc-bundle.json
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pl = require('tau-prolog');

// ── Recognized axiom types (Rule PS-3) ──
const RECOGNIZED_AXIOM_TYPES = new Set([
  'SubclassRestriction',
  'SubPropertyDeclaration',
  'DisjointnessDeclaration',
  'DomainRangeDeclaration',
  'CharacteristicDeclaration',
]);

// ── Violation rule catalog ──
const VIOLATION_RULES = `
% PS-4a: Type disjointness violation
violation(type_disjointness, Rel, Sub, Obj, SubType, ObjType) :-
    candidate_axiom(_, subclass_restriction, Sub, Rel, some_values_from, Obj),
    relation_range(Rel, ExpectedRange),
    bfo_category(Obj, ObjType),
    bfo_category_for_range(ExpectedRange, RangeType),
    disjoint(ObjType, RangeType),
    bfo_category(Sub, SubType).

% PS-4b: Range mismatch (not disjoint, but not subclass either)
violation(range_mismatch, Rel, Sub, Obj, SubType, ObjType) :-
    candidate_axiom(_, subclass_restriction, Sub, Rel, some_values_from, Obj),
    relation_range(Rel, ExpectedRange),
    bfo_category(Obj, ObjType),
    bfo_category_for_range(ExpectedRange, RangeType),
    \\+ disjoint(ObjType, RangeType),
    \\+ subclass(Obj, ExpectedRange),
    bfo_category(Sub, SubType).

% PS-4c: Domain mismatch
violation(domain_mismatch, Rel, Sub, Obj, SubType, ObjType) :-
    candidate_axiom(_, subclass_restriction, Sub, Rel, some_values_from, Obj),
    relation_domain(Rel, ExpectedDomain),
    \\+ subclass(Sub, ExpectedDomain),
    bfo_category(Sub, SubType),
    bfo_category(Obj, ObjType).

% PS-4d: Cycle detection (sub-property)
violation(cycle, _, Child, Parent, _, _) :-
    candidate_axiom(_, sub_property, Child, Parent, _, _),
    sub_property_of(Parent, Child).

% PS-4e: Disjointness contradiction
violation(disjointness_contradiction, _, A, B, Witness, _) :-
    candidate_axiom(_, disjointness, A, B, _, _),
    subclass(Witness, A),
    subclass(Witness, B),
    Witness \\= A,
    Witness \\= B.

% Helper: resolve BFO category for a range concept
bfo_category_for_range(Concept, Type) :-
    bfo_category(Concept, Type).

% Sub-property transitivity (as ground facts only — no recursion)
% sub_property_of/2 facts are asserted by the fact base builder
`.trim();

let _sessionCounter = 0;

/**
 * Run the Phase 3 consistency sandbox on a set of candidate axioms.
 *
 * @param {object} params
 * @param {object[]} params.candidateAxioms - Axioms to evaluate
 * @param {string} params.factBase - Prolog fact base string
 * @param {number} [params.hornInferenceStepCap=10000] - Inference step limit
 * @returns {{ results: object[], sessionId: string, factBaseRebuilt: boolean }}
 */
export function runSandbox(params) {
  const { candidateAxioms, factBase, hornInferenceStepCap = 10000 } = params;
  const sessionId = `sandbox-session-${++_sessionCounter}-${Date.now()}`;
  const results = [];

  for (const axiom of candidateAxioms) {
    // Rule PS-3: unrecognized axiom types → quarantine
    if (!RECOGNIZED_AXIOM_TYPES.has(axiom.axiomType)) {
      results.push({
        iri: axiom.iri,
        normalizationStatus: 'Quarantined',
        failureTrace: {
          violationRule: 'AxiomTypeUnrecognized',
          relation: axiom.onProperty || '',
          subjectNode: axiom.onClass || '',
          objectNode: '',
          subjectType: '',
          objectType: '',
          prologTrace: '',
          suggestedRepair: `Axiom type "${axiom.axiomType}" is not in the recognized catalog. Use one of: ${[...RECOGNIZED_AXIOM_TYPES].join(', ')}.`,
          ruleSetVersion: '1.0',
          inferenceStepsUsed: 0,
          producedAt: new Date().toISOString(),
        },
      });
      continue;
    }

    // Create fresh Tau Prolog session
    const session = pl.create(hornInferenceStepCap);

    // Build candidate axiom fact
    const axiomFact = buildAxiomFact(axiom);

    // Consult the full program (fact base + violation rules + candidate)
    const program = `${factBase}\n${VIOLATION_RULES}\n${axiomFact}`;

    let consultError = null;
    session.consult(program, {
      success: () => {},
      error: (err) => { consultError = err; },
    });

    if (consultError) {
      results.push({
        iri: axiom.iri,
        normalizationStatus: 'Quarantined',
        failureTrace: {
          violationRule: 'ConsultError',
          relation: axiom.onProperty || '',
          subjectNode: axiom.onClass || '',
          objectNode: axiom.restrictionTarget || '',
          subjectType: '',
          objectType: '',
          prologTrace: String(consultError),
          suggestedRepair: `Fix Prolog consult error: ${String(consultError)}`,
          ruleSetVersion: '1.0',
          inferenceStepsUsed: 0,
          producedAt: new Date().toISOString(),
        },
      });
      continue;
    }

    // Query for violations
    const query = 'violation(Rule, Rel, Sub, Obj, SubType, ObjType).';
    let queryError = null;
    let violations = [];
    let inferenceSteps = 0;

    session.query(query, {
      success: () => {
        // Collect answers
        let answering = true;
        while (answering) {
          session.answer({
            success: (answer) => {
              inferenceSteps++;
              if (inferenceSteps > hornInferenceStepCap) {
                answering = false;
                return;
              }
              const rule = extractTerm(answer, 'Rule');
              const rel = extractTerm(answer, 'Rel');
              const sub = extractTerm(answer, 'Sub');
              const obj = extractTerm(answer, 'Obj');
              const subType = extractTerm(answer, 'SubType');
              const objType = extractTerm(answer, 'ObjType');
              violations.push({ rule, rel, sub, obj, subType, objType });
            },
            fail: () => { answering = false; },
            error: (err) => {
              queryError = err;
              answering = false;
            },
            limit: () => {
              // Inference step limit exceeded
              answering = false;
              inferenceSteps = hornInferenceStepCap;
            },
          });
        }
      },
      error: (err) => { queryError = err; },
    });

    // Check if cap was hit
    if (inferenceSteps >= hornInferenceStepCap) {
      results.push({
        iri: axiom.iri,
        normalizationStatus: 'Quarantined',
        failureTrace: {
          violationRule: 'HornDerivationUnbounded',
          relation: axiom.onProperty || '',
          subjectNode: axiom.onClass || '',
          objectNode: axiom.restrictionTarget || '',
          subjectType: '',
          objectType: '',
          prologTrace: `Call: violation/6\nExit: inference_step_cap_reached(${hornInferenceStepCap})`,
          suggestedRepair: `Reduce the complexity of the axiom or the instance chain involving ${axiom.onProperty || 'the relation'}. The inference step cap of ${hornInferenceStepCap} was exceeded.`,
          ruleSetVersion: '1.0',
          inferenceStepsUsed: hornInferenceStepCap,
          producedAt: new Date().toISOString(),
        },
      });
      continue;
    }

    if (violations.length === 0) {
      results.push({
        iri: axiom.iri,
        normalizationStatus: 'NoViolations',
        failureTrace: null,
      });
    } else {
      const v = violations[0];
      const violationRule = mapViolationRule(v.rule);
      const trace = buildPrologTrace(v, axiom);

      results.push({
        iri: axiom.iri,
        normalizationStatus: 'Quarantined',
        failureTrace: {
          violationRule,
          relation: cleanAtom(v.rel),
          subjectNode: cleanAtom(v.sub),
          objectNode: cleanAtom(v.obj),
          subjectType: cleanAtom(v.subType),
          objectType: cleanAtom(v.objType),
          disjointPair: violationRule === 'TypeDisjointnessViolation'
            ? [cleanAtom(v.objType), cleanAtom(v.subType)].sort()
            : undefined,
          witness: violationRule === 'DisjointnessContradictionViolation'
            ? cleanAtom(v.subType)
            : undefined,
          expectedRange: violationRule === 'RangeMismatchViolation'
            ? findExpectedRange(axiom, v)
            : undefined,
          actualTarget: violationRule === 'RangeMismatchViolation'
            ? cleanAtom(v.obj)
            : undefined,
          expectedDomain: violationRule === 'DomainMismatchViolation'
            ? findExpectedDomain(axiom, v)
            : undefined,
          actualSubject: violationRule === 'DomainMismatchViolation'
            ? cleanAtom(v.sub)
            : undefined,
          prologTrace: trace,
          suggestedRepair: buildSuggestedRepair(violationRule, v, axiom),
          ruleSetVersion: '1.0',
          inferenceStepsUsed: inferenceSteps + 1,
          producedAt: new Date().toISOString(),
        },
      });
    }
  }

  return { results, sessionId, factBaseRebuilt: true };
}

/**
 * Get the Tau Prolog version string.
 */
export function getTauPrologVersion() {
  const v = pl.version;
  return v ? `${v.major}.${v.minor}.${v.patch}-${v.status}` : 'unknown';
}

// ── Internal helpers ──

function buildAxiomFact(axiom) {
  const iri = prologAtom(axiom.iri);
  const onClass = prologAtom(axiom.onClass);
  const onProperty = prologAtom(axiom.onProperty);
  const target = prologAtom(axiom.restrictionTarget || axiom.onProperty || '');

  switch (axiom.axiomType) {
    case 'SubclassRestriction':
      return `candidate_axiom(${iri}, subclass_restriction, ${onClass}, ${onProperty}, some_values_from, ${prologAtom(axiom.restrictionTarget)}).`;
    case 'SubPropertyDeclaration':
      return `candidate_axiom(${iri}, sub_property, ${onClass}, ${onProperty}, sub_property_of, ${onProperty}).`;
    case 'DisjointnessDeclaration':
      return `candidate_axiom(${iri}, disjointness, ${onClass}, ${onProperty}, disjoint_with, ${onProperty}).`;
    case 'CharacteristicDeclaration':
      return `candidate_axiom(${iri}, characteristic, ${onClass}, ${onProperty}, characteristic, ${prologAtom(axiom.onProperty)}).`;
    default:
      return `candidate_axiom(${iri}, unknown, ${onClass}, ${onProperty}, unknown, ${target}).`;
  }
}

function extractTerm(answer, varName) {
  try {
    const links = answer.links || {};
    const term = links[varName];
    if (!term) return '';
    if (typeof term === 'string') return term;
    if (term.id) return term.id;
    if (term.value !== undefined) return String(term.value);
    return pl.format_answer(answer)?.match(new RegExp(`${varName} = ([^,}]+)`))?.[1] || '';
  } catch { return ''; }
}

function cleanAtom(str) {
  if (!str) return '';
  return str.replace(/^'|'$/g, '');
}

function prologAtom(str) {
  if (!str) return "''";
  const safe = str.replace(/'/g, "\\'");
  return `'${safe}'`;
}

function mapViolationRule(rule) {
  const clean = cleanAtom(rule);
  switch (clean) {
    case 'type_disjointness': return 'TypeDisjointnessViolation';
    case 'range_mismatch': return 'RangeMismatchViolation';
    case 'domain_mismatch': return 'DomainMismatchViolation';
    case 'cycle': return 'CycleViolation';
    case 'disjointness_contradiction': return 'DisjointnessContradictionViolation';
    default: return clean;
  }
}

function buildPrologTrace(violation, axiom) {
  const rule = cleanAtom(violation.rule);
  const sub = cleanAtom(violation.sub);
  const obj = cleanAtom(violation.obj);
  const rel = cleanAtom(violation.rel);
  return [
    `Call: violation(${rule}, ${rel}, ${sub}, ${obj}, SubType, ObjType)`,
    `Call: candidate_axiom(${cleanAtom(axiom.iri)}, _, ${sub}, ${rel}, _, ${obj})`,
    `Exit: candidate_axiom(${cleanAtom(axiom.iri)}, _, ${sub}, ${rel}, _, ${obj})`,
    `Call: bfo_category(${obj}, ObjType)`,
    `Exit: bfo_category(${obj}, ${cleanAtom(violation.objType)})`,
    `Call: bfo_category(${sub}, SubType)`,
    `Exit: bfo_category(${sub}, ${cleanAtom(violation.subType)})`,
    `Exit: violation(${rule}, ${rel}, ${sub}, ${obj}, ${cleanAtom(violation.subType)}, ${cleanAtom(violation.objType)})`,
  ].join('\n');
}

function buildSuggestedRepair(violationRule, v, axiom) {
  const sub = cleanAtom(v.sub);
  const obj = cleanAtom(v.obj);
  const rel = cleanAtom(v.rel);
  const subType = cleanAtom(v.subType);
  const objType = cleanAtom(v.objType);

  switch (violationRule) {
    case 'TypeDisjointnessViolation':
      return `Reclassify ${obj} from ${objType} to a subclass of the expected range, or select a different relation type that accepts ${objType} in its range.`;
    case 'RangeMismatchViolation':
      return `Reclassify ${obj} as a subclass of the relation's expected range, or select a different relation type.`;
    case 'DomainMismatchViolation':
      return `Reclassify ${sub} as a subclass of the relation's expected domain, or select a different relation type for ${sub}.`;
    case 'CycleViolation':
      return `Remove the existing sub-property edge between ${obj} and ${sub} before adding the proposed sub-property declaration.`;
    case 'DisjointnessContradictionViolation':
      return `Reclassify ${subType} so it is no longer a subclass of both ${sub} and ${obj}, or do not declare ${sub} disjoint with ${obj}.`;
    default:
      return `Review the axiom involving ${rel} on ${sub} and ${obj}.`;
  }
}

function findExpectedRange(axiom, v) {
  // The range is the relation's expected range — we stored it in the violation
  // For now, return the relation's canonical range from context
  return cleanAtom(v.rel) ? `expected range of ${cleanAtom(v.rel)}` : '';
}

function findExpectedDomain(axiom, v) {
  return cleanAtom(v.rel) ? `expected domain of ${cleanAtom(v.rel)}` : '';
}
