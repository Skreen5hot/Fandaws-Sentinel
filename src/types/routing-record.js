/**
 * Epistemic Register constants and RegisterRoutingRecord factory.
 *
 * The three-register model distinguishes:
 * - R1 (Axiomatic): Definitional properties. Exceptions are contradictions.
 * - R2 (Normative): Statistically typical. Exceptions are expected.
 * - R3 (Aspirational): Value judgments. Framework-dependent.
 *
 * @see docs/architecture/NAC_Developer_Guide_v1.2.md
 */

// ── Register IRIs ──

export const REGISTERS = {
  AXIOMATIC: 'fandaws:register/axiomatic',
  NORMATIVE: 'fandaws:register/normative',
  ASPIRATIONAL: 'fandaws:register/aspirational',
};

// ── Routing method IRIs ──

export const ROUTING_METHODS = {
  APS: 'fandaws:method/aps', // Phase 14+ stub
  DOMAIN: 'fandaws:method/domain', // Session domain match
  STRUCTURAL: 'fandaws:method/structural', // BFO alignment
  WHITELIST: 'fandaws:method/whitelist', // Domain whitelist
  TELEOLOGICAL: 'fandaws:method/teleological', // Keyword detection
  FALLBACK: 'fandaws:method/fallback', // R2 default
  OVERRIDE: 'fandaws:method/override', // User override
};

// ── Routing strength IRIs ──

export const ROUTING_STRENGTHS = {
  STRUCTURAL: 'fandaws:strength/structural', // BFO category match
  DOMAIN: 'fandaws:strength/domain', // Session domain match
  HEURISTIC: 'fandaws:strength/heuristic', // Keyword or pattern match
};

/**
 * Create a RegisterRoutingRecord — immutable audit trail for ERS decisions.
 *
 * @param {object} params
 * @param {string} params.id - Unique routing record IRI
 * @param {string} params.subjectConcept - Concept IRI the restriction is attached to
 * @param {string} params.restrictionIri - The owl:Restriction IRI being annotated
 * @param {string} params.assignedRegister - Register IRI (REGISTERS.*)
 * @param {string} params.routingMethod - Method IRI (ROUTING_METHODS.*)
 * @param {string} params.trigger - Human-readable description of routing trigger
 * @returns {object} JSON-LD RegisterRoutingRecord node
 */
export function createRoutingRecord({
  id,
  subjectConcept,
  restrictionIri,
  assignedRegister,
  routingMethod,
  trigger,
}) {
  return {
    '@id': id,
    '@type': 'fandaws:RegisterRoutingRecord',
    'fandaws:subjectConcept': subjectConcept,
    'fandaws:property': restrictionIri,
    'fandaws:assignedRegister': assignedRegister,
    'fandaws:routingMethod': routingMethod,
    'fandaws:trigger': trigger,
    'fandaws:createdAt': new Date().toISOString(),
    'fandaws:createdBy': 'ers:service',
  };
}
