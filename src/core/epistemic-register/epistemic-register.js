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
  const flags = [];

  // ── Step 1: APS precedent lookup (stub — Phase 14+) ──
  // Always returns null. Extension point for Analogical Precedent Service.

  // ── Step 2: Session domain check ──
  if (session && session['fandaws:domain']) {
    const domain = session['fandaws:domain'].toLowerCase();
    const axiomaticDomains = config?.axiomaticDomains || AXIOMATIC_DOMAINS;
    if (axiomaticDomains.includes(domain)) {
      return buildResult(
        restriction, REGISTERS.AXIOMATIC, ROUTING_METHODS.DOMAIN,
        `session-domain:${domain}`, flags, scope,
      );
    }
  }

  // ── Step 3: BFO alignment + Bearer/Role disambiguation ──
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
        return buildResult(
          restriction, lookup.register, ROUTING_METHODS.STRUCTURAL,
          `bfo:${disambiguation.bfoCategory}+${disambiguation.propertyType}`, flags, scope,
        );
      }
    } else if (bfoCategory) {
      const lookup = lookupBfoRegister(bfoCategory);
      if (lookup) {
        return buildResult(
          restriction, lookup.register, ROUTING_METHODS.STRUCTURAL,
          `bfo:${bfoCategory}`, flags, scope,
        );
      }
    }
  }

  // ── Step 4: Domain whitelist ──
  // Currently session-level only (covered by Step 2).
  // Property-level domain whitelisting deferred to Phase 14+.

  // ── Step 5: Teleological signal detection ──
  if (utterance) {
    const teleological = detectTeleological(utterance);
    if (teleological.detected) {
      flags.push('teleological-signal');
      // Flag only — do NOT auto-route to R3.
      // IEE (Phase 14+) will evaluate whether to promote to R3.
    }
  }

  // ── Step 6: Fallback → R2 (Normative) ──
  return buildResult(
    restriction, REGISTERS.NORMATIVE, ROUTING_METHODS.FALLBACK,
    'fallback', flags, scope,
  );
}
