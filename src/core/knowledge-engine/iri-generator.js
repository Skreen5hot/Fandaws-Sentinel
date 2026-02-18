/**
 * IRI Generator — deterministic IRI generation from canonical labels.
 *
 * Converts canonical labels into stable, URL-safe IRIs using UUID v5
 * hashes for collision safety across scopes.
 *
 * IRI scheme: fandaws:class/{uuid5}/{slug}
 * UUID v5 inputs: scope + ":" + canonicalLabel
 *
 * The slug is cosmetic and frozen at creation time — it never updates
 * even if the concept's display label later changes. The UUID alone
 * is the identity; the slug is an opaque, human-readable path component.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.1
 */

import { uuid5, FANDAWS_NAMESPACE } from './uuid5.js';

// ── Constants ──

export const DEFAULT_SCOPE = 'fandaws:scope/default';

// ── Slug Algorithm ──

/**
 * Slugify a string using the shared IRI slug algorithm.
 *
 * @param {string} input - Canonical label (lowercase, trimmed)
 * @returns {string} URL-safe slug
 */
function slugify(input) {
  return input
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/[^a-z0-9\-]/g, '')    // strip non-alphanumeric (except hyphens)
    .replace(/-{2,}/g, '-')         // collapse multiple hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens
}

// ── Concept IRI ──

/**
 * Generate a deterministic concept IRI from a canonical label.
 *
 * @param {string} canonicalLabel - Normalized label from simplify()
 * @param {string} [scope=DEFAULT_SCOPE] - Scope IRI for UUID v5 input
 * @returns {string} Concept IRI (e.g., "fandaws:class/{uuid5}/dog")
 */
export function generateConceptIri(canonicalLabel, scope = DEFAULT_SCOPE) {
  if (!canonicalLabel || typeof canonicalLabel !== 'string') {
    throw new Error('generateConceptIri requires a non-empty canonical label');
  }

  const slug = slugify(canonicalLabel);
  if (slug === '') {
    throw new Error('generateConceptIri produced an empty slug from: ' + canonicalLabel);
  }

  const hash = uuid5(FANDAWS_NAMESPACE, scope + ':' + canonicalLabel);
  return `fandaws:class/${hash}/${slug}`;
}

// ── Property IRI ──

/**
 * Generate a deterministic property IRI from a canonical label.
 *
 * @param {string} canonicalLabel - Normalized property label
 * @param {string} [scope=DEFAULT_SCOPE] - Scope IRI for UUID v5 input
 * @returns {string} Property IRI (e.g., "fandaws:property/{uuid5}/fur")
 */
export function generatePropertyIri(canonicalLabel, scope = DEFAULT_SCOPE) {
  if (!canonicalLabel || typeof canonicalLabel !== 'string') {
    throw new Error('generatePropertyIri requires a non-empty canonical label');
  }

  const slug = slugify(canonicalLabel);
  if (slug === '') {
    throw new Error('generatePropertyIri produced an empty slug from: ' + canonicalLabel);
  }

  const hash = uuid5(FANDAWS_NAMESPACE, scope + ':property:' + canonicalLabel);
  return `fandaws:property/${hash}/${slug}`;
}

// ── Restriction IRI ──

/**
 * Generate a deterministic restriction IRI from concept and property labels.
 *
 * Centralizes restriction IRI generation that was previously inline in
 * property-workflow.js. Used for OWL restriction nodes that attach
 * properties to concepts.
 *
 * @param {string} conceptLabel - Canonical label of the concept
 * @param {string} propertyLabel - Canonical label of the property
 * @param {string} [scope=DEFAULT_SCOPE] - Scope IRI for UUID v5 input
 * @returns {string} Restriction IRI (e.g., "fandaws:restriction/{uuid5}/dog--fur")
 */
export function generateRestrictionIri(conceptLabel, propertyLabel, scope = DEFAULT_SCOPE) {
  if (!conceptLabel || typeof conceptLabel !== 'string') {
    throw new Error('generateRestrictionIri requires a non-empty concept label');
  }
  if (!propertyLabel || typeof propertyLabel !== 'string') {
    throw new Error('generateRestrictionIri requires a non-empty property label');
  }

  const conceptSlug = slugify(conceptLabel);
  const propSlug = slugify(propertyLabel);

  if (!conceptSlug || !propSlug) {
    throw new Error(`generateRestrictionIri produced empty slug from: "${conceptLabel}", "${propertyLabel}"`);
  }

  const hash = uuid5(FANDAWS_NAMESPACE, scope + ':' + conceptLabel + '--' + propertyLabel);
  return `fandaws:restriction/${hash}/${conceptSlug}--${propSlug}`;
}

// ── Relationship IRI ──

/**
 * Generate a deterministic relationship restriction IRI from subject, verb, and object.
 *
 * @param {string} subjectCanonical - Canonical label of the subject
 * @param {string} verb - Normalized verb
 * @param {string} objectCanonical - Canonical label of the object
 * @param {string} [scope=DEFAULT_SCOPE] - Scope IRI for UUID v5 input
 * @returns {string} Relationship IRI (e.g., "fandaws:rel/{uuid5}/dog--chase--cat")
 */
export function generateRelationshipIri(subjectCanonical, verb, objectCanonical, scope = DEFAULT_SCOPE) {
  if (!subjectCanonical || typeof subjectCanonical !== 'string') {
    throw new Error('generateRelationshipIri requires a non-empty subject');
  }
  if (!verb || typeof verb !== 'string') {
    throw new Error('generateRelationshipIri requires a non-empty verb');
  }
  if (!objectCanonical || typeof objectCanonical !== 'string') {
    throw new Error('generateRelationshipIri requires a non-empty object');
  }

  const subjectSlug = slugify(subjectCanonical);
  const verbSlug = slugify(verb);
  const objectSlug = slugify(objectCanonical);

  if (!subjectSlug || !verbSlug || !objectSlug) {
    throw new Error(`generateRelationshipIri produced empty slug from: "${subjectCanonical}", "${verb}", "${objectCanonical}"`);
  }

  const hash = uuid5(FANDAWS_NAMESPACE, scope + ':' + subjectCanonical + '--' + verb + '--' + objectCanonical);
  return `fandaws:rel/${hash}/${subjectSlug}--${verbSlug}--${objectSlug}`;
}

// ── Routing Record IRI ──

/**
 * Generate a deterministic routing record IRI from a restriction IRI.
 *
 * 1:1 with restrictions — same restriction always gets the same routing record IRI.
 *
 * @param {string} restrictionIri - The restriction IRI being annotated
 * @param {string} [scope=DEFAULT_SCOPE] - Scope IRI
 * @returns {string} Routing record IRI (e.g., "fandaws:routing/{uuid5}")
 */
export function generateRoutingRecordIri(restrictionIri, scope = DEFAULT_SCOPE) {
  if (!restrictionIri || typeof restrictionIri !== 'string') {
    throw new Error('generateRoutingRecordIri requires a non-empty restriction IRI');
  }

  const hash = uuid5(FANDAWS_NAMESPACE, scope + ':routing:' + restrictionIri);
  return `fandaws:routing/${hash}`;
}
