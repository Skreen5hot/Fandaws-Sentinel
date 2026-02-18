/**
 * Bearer/Role Disambiguator — classifies property type on Role subjects.
 *
 * When the subject concept has BFO category bfo:Role, property assertions
 * may apply to the Role itself (behavioral/credential) or to the Bearer
 * (the MaterialEntity that holds the role). This module classifies the
 * property type and optionally re-targets BFO lookup to the Bearer.
 *
 * Three property types:
 * - Structural: physical attributes (has_arm, has_weight) → re-target to Bearer
 * - Credential: qualifications (has_license, certified) → Role path, no sensitivity
 * - Behavioral: actions/obligations (diagnoses, protects) → Role path, heightened sensitivity
 *
 * Known v1 limitation: Property classification uses regex patterns on English
 * property labels. Brittle for non-English or opaque IRIs (e.g., obo:RO_0000086).
 * Phase 14+ upgrade path: BFO alignment of the property's range type.
 *
 * @see docs/architecture/NAC_Developer_Guide_v1.2.md §6
 * @see ERS v2.3 §6.4
 */

import { BFO } from '../knowledge-engine/bfo-heuristic.js';

// ── Property Type Patterns (v1: English regex) ──

const STRUCTURAL_PATTERNS = [
  /^has[_ ]?(arm|leg|wing|eye|weight|height|mass|size|length|hand|foot|tail|ear|tooth|teeth|finger|toe|head|brain|heart|bone|muscle|skin|hair|fur|feather)/i,
  /^(weighs|measures|contains|holds)/i,
  /^(tall|short|heavy|light|large|small)/i,
];

const CREDENTIAL_PATTERNS = [
  /^has[_ ]?(degree|certification|license|credential|diploma|permit|accreditation)/i,
  /^(certified|licensed|qualified|authorized|accredited|registered|enrolled)/i,
  /^(works[_ ]?at|reports[_ ]?to|employed[_ ]?by|affiliated[_ ]?with)/i,
];

/**
 * Classify a property label as structural, credential, or behavioral.
 *
 * @param {string} propertyLabel - Property label (owl:onProperty value)
 * @returns {'structural' | 'credential' | 'behavioral'}
 */
function classifyPropertyType(propertyLabel) {
  if (!propertyLabel || typeof propertyLabel !== 'string') return 'behavioral';

  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.test(propertyLabel)) return 'structural';
  }

  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(propertyLabel)) return 'credential';
  }

  return 'behavioral';
}

/**
 * Extract the BFO category from a concept's rdfs:subClassOf array.
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
 * Walk ancestor chain to find the nearest MaterialEntity bearer.
 *
 * @param {object} concept - Starting concept (the Role)
 * @param {object} graph - KnowledgeGraph
 * @returns {boolean} true if a MaterialEntity ancestor was found
 */
function hasBearer(concept, graph) {
  const concepts = graph['fandaws:concepts'] || [];
  let currentIri = concept['skos:broader'];
  const visited = new Set();

  while (currentIri && !visited.has(currentIri)) {
    visited.add(currentIri);
    const ancestor = concepts.find((c) => c['@id'] === currentIri);
    if (!ancestor) break;

    const bfo = getBfoCategory(ancestor);
    if (bfo === BFO.materialEntity) return true;

    currentIri = ancestor['skos:broader'];
  }

  return false;
}

/**
 * Disambiguate Bearer vs. Role for a property assertion on a Role concept.
 *
 * @param {object} restriction - owl:Restriction node being routed
 * @param {object} concept - The subject concept (which has bfo:Role category)
 * @param {object} graph - KnowledgeGraph snapshot
 * @returns {{ bfoCategory: string, retargeted: boolean, propertyType: string, sensitivity: string }}
 */
export function disambiguateBearerRole(restriction, concept, graph) {
  const propertyLabel = restriction['owl:onProperty'] || '';
  const kind = classifyPropertyType(propertyLabel);

  if (kind === 'structural') {
    // Attempt to find a MaterialEntity bearer in the ancestor chain
    if (hasBearer(concept, graph)) {
      return {
        bfoCategory: BFO.materialEntity,
        retargeted: true,
        propertyType: 'structural',
        sensitivity: 'normal',
      };
    }
    // No bearer found — fall back to Role path but without sensitivity
    return {
      bfoCategory: BFO.role,
      retargeted: false,
      propertyType: 'structural',
      sensitivity: 'normal',
    };
  }

  if (kind === 'credential') {
    return {
      bfoCategory: BFO.role,
      retargeted: false,
      propertyType: 'credential',
      sensitivity: 'normal',
    };
  }

  // behavioral (default for Role)
  return {
    bfoCategory: BFO.role,
    retargeted: false,
    propertyType: 'behavioral',
    sensitivity: 'heightened',
  };
}
