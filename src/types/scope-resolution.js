/**
 * ScopeResolution — output of the ScopeResolver.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.9, Appendix A.10/A.11
 */

/**
 * Create a new ScopeResolution.
 *
 * @param {object} params
 * @param {string} params.term - The term that was resolved
 * @param {string} params.status - "resolved" | "conflict" | "unknown"
 * @param {object|null} [params.resolvedConcept] - Copied concept if resolved
 * @param {object|null} [params.sourceScope] - Which scope provided the resolution
 * @param {object|null} [params.conflictReport] - Conflict details if conflict
 * @param {object[]} [params.skippedScopes] - Unavailable scopes (offline)
 * @returns {object} JSON-LD ScopeResolution node
 */
export function createScopeResolution({
  term,
  status,
  resolvedConcept = null,
  sourceScope = null,
  conflictReport = null,
  skippedScopes = [],
}) {
  return {
    '@type': 'fandaws:ScopeResolution',
    'fandaws:term': term,
    'fandaws:status': status,
    'fandaws:resolvedConcept': resolvedConcept,
    'fandaws:sourceScope': sourceScope,
    'fandaws:conflictReport': conflictReport,
    'fandaws:skippedScopes': skippedScopes,
  };
}
