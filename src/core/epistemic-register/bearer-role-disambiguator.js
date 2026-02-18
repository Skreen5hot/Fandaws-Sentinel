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

// Credential patterns checked before structural to prevent "has_jurisdiction"
// matching structural "has_" prefix (BRD-17, ADV-06).
const CREDENTIAL_PATTERNS = [
  /^has[_ ]?(degree|certification|license|credential|diploma|permit|accreditation|jurisdiction)/i,
  /^(certified|licensed|qualified|authorized|accredited|registered|enrolled)/i,
  /^(works[_ ]?at|reports[_ ]?to|employed[_ ]?by|affiliated[_ ]?with)/i,
  // Catch credential keywords appearing after an intermediate qualifier (ADV-06):
  // e.g., "has_surgical_certification" — "certification" is inherently credential.
  /(certification|accreditation|credential|diploma|jurisdiction)[_ ]?$/i,
];

const BEHAVIORAL_PATTERNS = [
  /^(diagnoses|treats|heals|protects|nurtures|teaches|educates|adjudicates|guards|serves|advises|manages|leads|supervises)/i,
];

/**
 * Classify a property label as structural, credential, behavioral, or unclassified.
 *
 * Unknown properties default to 'unclassified' (not 'behavioral') to avoid
 * generating false IEE review noise. Sensitivity is a positive signal, not
 * a default state (BRD-11).
 *
 * @param {string} propertyLabel - Property label (owl:onProperty value)
 * @returns {'structural' | 'credential' | 'behavioral' | 'unclassified'}
 */
function classifyPropertyType(propertyLabel) {
  if (!propertyLabel || typeof propertyLabel !== 'string') return 'unclassified';

  // Credential checked before structural to prevent "has_jurisdiction"
  // matching structural "has_" prefix (BRD-17, ADV-06).
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(propertyLabel)) return 'credential';
  }

  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.test(propertyLabel)) return 'structural';
  }

  for (const pattern of BEHAVIORAL_PATTERNS) {
    if (pattern.test(propertyLabel)) return 'behavioral';
  }

  return 'unclassified';
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

  if (kind === 'behavioral') {
    // Positively-identified behavioral property → heightened sensitivity
    return {
      bfoCategory: BFO.role,
      retargeted: false,
      propertyType: 'behavioral',
      sensitivity: 'heightened',
    };
  }

  // unclassified — unknown property on Role: no sensitivity (BRD-11)
  return {
    bfoCategory: BFO.role,
    retargeted: false,
    propertyType: 'unclassified',
    sensitivity: 'normal',
  };
}
