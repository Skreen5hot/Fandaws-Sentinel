/**
 * Shadows Annotation — attached to concepts created via the "refine"
 * conflict resolution action (Section 5.11.2).
 *
 * When a caller rejects all existing definitions and defines a term
 * fresh at the local scope, the new concept carries a fandaws:shadows
 * annotation recording which higher-scope definitions it overrides.
 *
 * Also includes DisambiguatedFrom for the "createDistinct" action.
 *
 * @see Fandaws_v3.3_Specification.md Section 5.11.2
 */

/**
 * Create a Shadows annotation for a locally refined concept.
 *
 * @param {object} params
 * @param {object[]} params.overriddenDefinitions - Array of overridden definition references
 * @param {string} params.overriddenDefinitions[].scopeType - "context" | "user" | "global"
 * @param {string} params.overriddenDefinitions[].graphId - Source graph identifier
 * @param {string} params.overriddenDefinitions[].conceptIri - Overridden concept IRI
 * @param {string} params.disambiguatedDisplayLabel - Required display label that differs from shadowed concept
 * @returns {object} Shadows annotation object
 */
export function createShadowsAnnotation({
  overriddenDefinitions,
  disambiguatedDisplayLabel,
}) {
  return {
    '@type': 'fandaws:ShadowsAnnotation',
    'fandaws:shadows': overriddenDefinitions.map((def) => ({
      'fandaws:scopeType': def.scopeType,
      'fandaws:graphId': def.graphId,
      'fandaws:conceptIri': def.conceptIri,
    })),
    'fandaws:disambiguatedDisplayLabel': disambiguatedDisplayLabel,
  };
}

/**
 * Create a DisambiguatedFrom annotation for concepts created via "createDistinct".
 *
 * @param {object} params
 * @param {string} params.originalTerm - The shared term that was disambiguated
 * @param {string} params.graphId - Source graph where the original definition lives
 * @param {string} params.conceptIri - Original concept IRI
 * @returns {object} DisambiguatedFrom annotation object
 */
export function createDisambiguatedFromAnnotation({
  originalTerm,
  graphId,
  conceptIri,
}) {
  return {
    '@type': 'fandaws:DisambiguatedFromAnnotation',
    'fandaws:originalTerm': originalTerm,
    'fandaws:graphId': graphId,
    'fandaws:conceptIri': conceptIri,
  };
}
