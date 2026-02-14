/**
 * ResolvedFrom Annotation — provenance metadata attached to concepts
 * copied from a higher scope via copy-on-resolve.
 *
 * Enables traceability: downstream consumers can verify where a concept
 * originated and whether the source has since changed.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.11, Appendix A.10
 */

/**
 * Create a ResolvedFrom annotation.
 *
 * @param {object} params
 * @param {string} params.graphId - Source graph identifier
 * @param {string} params.conceptIri - Original concept IRI in the source graph
 * @param {string} params.scopeType - "context" | "user" | "global"
 * @param {string} params.resolvedAt - ISO 8601 datetime when the copy was made
 * @param {string|null} [params.graphVersion] - Version hash of the source graph at resolution time
 * @returns {object} ResolvedFrom annotation object
 */
export function createResolvedFromAnnotation({
  graphId,
  conceptIri,
  scopeType,
  resolvedAt,
  graphVersion = null,
}) {
  return {
    'fandaws:resolvedFrom.graphId': graphId,
    'fandaws:resolvedFrom.conceptIri': conceptIri,
    'fandaws:resolvedFrom.scopeType': scopeType,
    'fandaws:resolvedFrom.resolvedAt': resolvedAt,
    'fandaws:resolvedFrom.graphVersion': graphVersion,
  };
}
