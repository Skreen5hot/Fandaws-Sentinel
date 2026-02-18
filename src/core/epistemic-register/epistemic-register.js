/**
 * Epistemic Register Service (ERS) — 6-step routing pipeline.
 *
 * Routes restriction nodes (properties and relationships) to one of
 * three epistemic registers based on BFO alignment, session domain,
 * teleological signals, and domain whitelists.
 *
 * Pipeline:
 *   1. APS precedent lookup (stub — Phase 14+)
 *   2. Session domain check
 *   3. BFO alignment + Bearer/Role disambiguation
 *   4. Domain whitelist (session-level, covered by Step 2)
 *   5. Teleological signal detection (flag only, no auto-R3)
 *   6. Fallback → R2 (Normative)
 *
 * Pure function: deterministic, stateless, JSON-LD in → annotation out.
 *
 * @see docs/architecture/NAC_Developer_Guide_v1.2.md §7
 */

import { BFO } from '../knowledge-engine/bfo-heuristic.js';
import { generateRoutingRecordIri, DEFAULT_SCOPE } from '../knowledge-engine/iri-generator.js';
import { createRoutingRecord, REGISTERS, ROUTING_METHODS } from '../../types/routing-record.js';
import { lookupBfoRegister, AXIOMATIC_DOMAINS } from './bfo-register-map.js';
import { disambiguateBearerRole } from './bearer-role-disambiguator.js';
import { detectTeleological } from './teleological-detector.js';

// ── Internal helpers ──

/**
 * Extract BFO category from a concept's rdfs:subClassOf array.
 *
 * @param {object} concept - JSON-LD Concept node
 * @returns {string|null} BFO IRI or null
 */
function getBfoCategory(concept) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  for (const entry of subClassOf) {
    if (typeof entry === 'string' && entry.startsWith('bfo:')) {
      return entry;
    }
  }
  return null;
}

/**
 * Find a concept in the graph by IRI.
 *
 * @param {string} iri - Concept IRI
 * @param {object} graph - KnowledgeGraph
 * @returns {object|null} Concept node or null
 */
function findConcept(iri, graph) {
  if (!iri || !graph) return null;
  return (graph['fandaws:concepts'] || []).find((c) => c['@id'] === iri) || null;
}

/**
 * Build a routing result with a RegisterRoutingRecord.
 *
 * @param {object} restriction - The restriction being annotated
 * @param {string} register - Register IRI
 * @param {string} method - Routing method IRI
 * @param {string} trigger - Human-readable trigger description
 * @param {string[]} flags - Routing flags
 * @param {string} scope - Scope IRI
 * @returns {{ register: string, routingRecord: object, flags: string[] }}
 */
function buildResult(restriction, register, method, trigger, flags, scope) {
  const restrictionIri = restriction['@id'] || 'unknown';
  const recordIri = generateRoutingRecordIri(restrictionIri, scope);

  const record = createRoutingRecord({
    id: recordIri,
    subjectConcept: restriction['fandaws:attachedTo'] || '',
    restrictionIri,
    assignedRegister: register,
    routingMethod: method,
    trigger,
  });

  return { register, routingRecord: record, flags: [...flags] };
}

// ── Public API ──

/**
 * Route a restriction node to an epistemic register.
 *
 * @param {object} restriction - owl:Restriction node (property or relationship)
 * @param {object} [context={}] - Routing context
 * @param {object} [context.graph] - KnowledgeGraph snapshot
 * @param {object} [context.session] - ConversationSession (for domain)
 * @param {object} [context.config] - Configuration overrides
 * @param {string} [context.utterance] - Raw utterance (for teleological detection)
 * @param {string} [context.scope] - Scope IRI for routing record IRI generation
 * @returns {{ register: string, routingRecord: object, flags: string[] }}
 */
export function routeToRegister(restriction, context = {}) {
  const { graph, session, config, utterance, scope = DEFAULT_SCOPE } = context;

  // ── Config gate: ERS can be disabled ──
  if (config && config.epistemicRegisterEnabled === false) {
    return null;
  }

  const flags = [];

  // ── Step 1: APS precedent lookup (stub — Phase 14+) ──
  // Always returns null. Extension point for Analogical Precedent Service.

  // ── Step 2: Session domain check (produces CANDIDATE, does not return) ──
  let domainCandidate = null;
  let domainTrigger = null;
  if (session && session['fandaws:domain']) {
    const domain = session['fandaws:domain'].toLowerCase();
    const axiomaticDomains = config?.axiomaticDomains || AXIOMATIC_DOMAINS;
    if (axiomaticDomains.includes(domain)) {
      domainCandidate = REGISTERS.AXIOMATIC;
      domainTrigger = `session-domain:${domain}`;
    } else {
      // Non-axiomatic domain → R2 via DOMAIN method (not fallback)
      domainCandidate = REGISTERS.NORMATIVE;
      domainTrigger = `session-domain:${domain}`;
    }
  }

  // ── Step 3: BFO alignment + Bearer/Role disambiguation ──
  // BFO > Session Domain: if BFO alignment exists, it overrides the domain candidate.
  const attachedTo = restriction['fandaws:attachedTo'];
  const concept = findConcept(attachedTo, graph);

  if (concept) {
    const bfoCategory = getBfoCategory(concept);

    if (bfoCategory === BFO.role) {
      // Bearer/Role disambiguation for Role subjects
      const disambiguation = disambiguateBearerRole(restriction, concept, graph);
      const lookup = lookupBfoRegister(disambiguation.bfoCategory);

      if (lookup) {
        if (disambiguation.sensitivity === 'heightened') {
          flags.push('role-heightened-sensitivity');
        }
        if (disambiguation.retargeted) {
          flags.push('bearer-retarget');
        }

        // ── Step 5 (teleological) always runs, even when BFO matched ──
        applyTeleologicalFlags(utterance, flags, disambiguation.sensitivity === 'heightened');

        return buildResult(
          restriction, lookup.register, ROUTING_METHODS.STRUCTURAL,
          `bfo:${disambiguation.bfoCategory}+${disambiguation.propertyType}`, flags, scope,
        );
      }
    } else if (bfoCategory) {
      const lookup = lookupBfoRegister(bfoCategory);
      if (lookup) {
        // ── Step 5 (teleological) always runs, even when BFO matched ──
        applyTeleologicalFlags(utterance, flags, false);

        return buildResult(
          restriction, lookup.register, ROUTING_METHODS.STRUCTURAL,
          `bfo:${bfoCategory}`, flags, scope,
        );
      }
    }
  }

  // ── Step 2 fallthrough: use domain candidate if BFO returned null ──
  if (domainCandidate) {
    // ── Step 5 (teleological) runs for domain candidates too ──
    applyTeleologicalFlags(utterance, flags, false);

    return buildResult(
      restriction, domainCandidate, ROUTING_METHODS.DOMAIN,
      domainTrigger, flags, scope,
    );
  }

  // ── Step 4: Domain whitelist ──
  // Currently session-level only (covered by Step 2).
  // Property-level domain whitelisting deferred to Phase 14+.

  // ── Step 5: Teleological signal detection ──
  applyTeleologicalFlags(utterance, flags, false);

  // ── Step 6: Fallback → R2 (Normative) ──
  return buildResult(
    restriction, REGISTERS.NORMATIVE, ROUTING_METHODS.FALLBACK,
    'fallback', flags, scope,
  );
}

/**
 * Apply teleological flags from utterance analysis (Step 5).
 * Mutates the flags array. Never auto-routes to R3.
 *
 * @param {string|null} utterance - Raw utterance
 * @param {string[]} flags - Flags array to mutate
 * @param {boolean} hasRoleSensitivity - Whether role-heightened-sensitivity is already set
 */
function applyTeleologicalFlags(utterance, flags, hasRoleSensitivity) {
  if (!utterance) return;
  const teleological = detectTeleological(utterance);
  if (teleological.detected) {
    flags.push('teleological-signal');
    // Deontic flag: when deontic keyword + role heightened sensitivity
    if (teleological.deontic && hasRoleSensitivity) {
      flags.push('deontic-role-definition');
    }
  }
}

/**
 * Validate a user-initiated register override.
 *
 * R3 (Aspirational) requires a non-null worldviewContext tag.
 * R1/R2 overrides are always accepted.
 *
 * @param {string} targetRegister - Target register IRI
 * @param {object} [options={}]
 * @param {string|null} [options.worldviewContext] - Required for R3
 * @returns {{ accepted: boolean, error?: string }}
 */
export function validateRegisterOverride(targetRegister, options = {}) {
  const { worldviewContext = null } = options;

  if (targetRegister === REGISTERS.ASPIRATIONAL && !worldviewContext) {
    return {
      accepted: false,
      error: 'Register 3 (Aspirational) requires a non-null fandaws:worldviewContext tag.',
    };
  }

  return { accepted: true };
}
