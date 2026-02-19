/**
 * Shared utilities for Workbench panels.
 */

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** BFO numeric IRI → human-readable label */
export const BFO_LABELS = {
  'bfo:BFO_0000001': 'Entity',
  'bfo:BFO_0000040': 'Material Entity',
  'bfo:BFO_0000015': 'Process',
  'bfo:BFO_0000019': 'Quality',
  'bfo:BFO_0000023': 'Role',
  'bfo:BFO_0000016': 'Disposition',
  'bfo:BFO_0000034': 'Function',
  'bfo:BFO_0000017': 'Realizable Entity',
  'bfo:BFO_0000006': 'Spatial Region',
  'bfo:BFO_0000008': 'Temporal Region',
  'bfo:BFO_0000031': 'GDC',
};

/** BFO numeric IRI → CSS class suffix for dot color */
export const BFO_DOT_MAP = {
  'bfo:BFO_0000001': 'entity',
  'bfo:BFO_0000040': 'material',
  'bfo:BFO_0000015': 'process',
  'bfo:BFO_0000019': 'quality',
  'bfo:BFO_0000023': 'role',
  'bfo:BFO_0000016': 'disposition',
  'bfo:BFO_0000034': 'disposition',
  'bfo:BFO_0000017': 'continuant',
  'bfo:BFO_0000006': 'immaterial',
  'bfo:BFO_0000008': 'occurrent',
  'bfo:BFO_0000031': 'continuant',
};

/**
 * Resolve BFO label from an IRI (handles both numeric and named forms).
 * @param {string} iri - e.g. 'bfo:BFO_0000040' or 'bfo:MaterialEntity'
 * @returns {string} Human-readable label or stripped IRI
 */
export function bfoLabel(iri) {
  return BFO_LABELS[iri] || iri.replace('bfo:', '').replace(/_/g, ' ');
}

/**
 * Resolve BFO CSS dot class from an IRI.
 * @param {string} iri
 * @returns {string} CSS suffix
 */
export function bfoDotClass(iri) {
  return BFO_DOT_MAP[iri] || 'default';
}

/**
 * Extract ERS register shortcode from a restriction's routing record or epistemicRegister field.
 * @param {object} restriction - A restriction node from rdfs:subClassOf
 * @returns {{ cls: string, label: string }|null}
 */
export function ersRegisterInfo(restriction) {
  // Try direct epistemicRegister field first, then routing record
  const reg = restriction['fandaws:epistemicRegister']
    || restriction['fandaws:routingRecord']?.['fandaws:assignedRegister']
    || '';
  if (reg.includes('axiomatic')) return { cls: 'r1', label: 'R1' };
  if (reg.includes('normative')) return { cls: 'r2', label: 'R2' };
  if (reg.includes('aspirational')) return { cls: 'r3', label: 'R3' };
  return null;
}
