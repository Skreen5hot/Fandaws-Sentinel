/**
 * BFO-to-Register Map — maps BFO upper-level categories to epistemic registers.
 *
 * The BFO category of the subject concept is the primary signal for
 * determining the epistemic register of a property or relationship.
 *
 * @see docs/architecture/NAC_Developer_Guide_v1.2.md §5.1
 * @see ERS v2.3 §3.1
 */

import { BFO } from '../knowledge-engine/bfo-heuristic.js';
import { REGISTERS, ROUTING_STRENGTHS } from '../../types/routing-record.js';

// ── BFO → Register Map ──
// Every BFO category maps to a register + routing strength.
// Explicit entries prevent silent "corrections" (e.g., function→R3).

export const BFO_REGISTER_MAP = {
  // R1 — Axiomatic (definitional, no variation)
  [BFO.spatialRegion]:    { register: REGISTERS.AXIOMATIC, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.temporalRegion]:   { register: REGISTERS.AXIOMATIC, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.genDepContinuant]: { register: REGISTERS.AXIOMATIC, strength: ROUTING_STRENGTHS.STRUCTURAL },

  // R2 — Normative (typical, admits exceptions)
  [BFO.materialEntity]:   { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.quality]:          { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.disposition]:      { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.function]:         { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.process]:          { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.realizableEntity]: { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.STRUCTURAL },
  [BFO.role]:             { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.HEURISTIC },
  [BFO.entity]:           { register: REGISTERS.NORMATIVE, strength: ROUTING_STRENGTHS.HEURISTIC },
};

// ── Axiomatic Domain Whitelist ──
// Session domains that override the fallback to R1.

export const AXIOMATIC_DOMAINS = ['mathematics', 'geometry', 'formal logic'];

/**
 * Look up the register assignment for a BFO category.
 *
 * @param {string} bfoCategory - BFO IRI (e.g., "bfo:BFO_0000040")
 * @returns {{ register: string, strength: string } | null} Map entry or null
 */
export function lookupBfoRegister(bfoCategory) {
  if (!bfoCategory || typeof bfoCategory !== 'string') return null;
  return BFO_REGISTER_MAP[bfoCategory] || null;
}
