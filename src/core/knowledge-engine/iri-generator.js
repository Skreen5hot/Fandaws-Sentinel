/**
 * IRI Generator — deterministic IRI generation from canonical labels.
 *
 * Converts a canonical label (output of Identity Simplification) into a
 * stable, URL-safe IRI suitable for use as a JSON-LD @id.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.1
 */

/**
 * Generate a deterministic concept IRI from a canonical label.
 *
 * @param {string} canonicalLabel - Normalized label from simplify()
 * @param {string} [namespace='fandaws:concept'] - IRI namespace prefix
 * @returns {string} Concept IRI (e.g., "fandaws:concept/golden-retriever")
 */
export function generateConceptIri(canonicalLabel, namespace = 'fandaws:concept') {
  if (!canonicalLabel || typeof canonicalLabel !== 'string') {
    throw new Error('generateConceptIri requires a non-empty canonical label');
  }

  const slug = canonicalLabel
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/[^a-z0-9\-]/g, '')    // strip non-alphanumeric (except hyphens)
    .replace(/-{2,}/g, '-')         // collapse multiple hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens

  if (slug === '') {
    throw new Error('generateConceptIri produced an empty slug from: ' + canonicalLabel);
  }

  return `${namespace}/${slug}`;
}

/**
 * Generate a deterministic property IRI from a canonical label.
 *
 * Uses the same slug algorithm as generateConceptIri but with a
 * `fandaws:property` default namespace.
 *
 * @param {string} canonicalLabel - Normalized property label
 * @param {string} [namespace='fandaws:property'] - IRI namespace prefix
 * @returns {string} Property IRI (e.g., "fandaws:property/fur")
 */
export function generatePropertyIri(canonicalLabel, namespace = 'fandaws:property') {
  if (!canonicalLabel || typeof canonicalLabel !== 'string') {
    throw new Error('generatePropertyIri requires a non-empty canonical label');
  }

  const slug = canonicalLabel
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/[^a-z0-9\-]/g, '')    // strip non-alphanumeric (except hyphens)
    .replace(/-{2,}/g, '-')         // collapse multiple hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens

  if (slug === '') {
    throw new Error('generatePropertyIri produced an empty slug from: ' + canonicalLabel);
  }

  return `${namespace}/${slug}`;
}

/**
 * Slugify a string using the shared IRI slug algorithm.
 *
 * @param {string} input
 * @returns {string}
 */
function slugify(input) {
  return input
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a deterministic relationship restriction IRI from subject, verb, and object slugs.
 *
 * @param {string} subjectCanonical - Canonical label of the subject
 * @param {string} verb - Normalized verb
 * @param {string} objectCanonical - Canonical label of the object
 * @param {string} [namespace='fandaws:rel'] - IRI namespace prefix
 * @returns {string} Relationship IRI (e.g., "fandaws:rel/dog--chase--cat")
 */
export function generateRelationshipIri(subjectCanonical, verb, objectCanonical, namespace = 'fandaws:rel') {
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

  return `${namespace}/${subjectSlug}--${verbSlug}--${objectSlug}`;
}
