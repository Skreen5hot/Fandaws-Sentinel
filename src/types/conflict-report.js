/**
 * ConflictReport — emitted when the ScopeResolver detects incompatible
 * definitions of the same term across different scopes.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.10, Appendix A.11
 */

/**
 * Create a ConflictingDefinition descriptor.
 *
 * @param {object} params
 * @param {string} params.conceptIri - Concept IRI in source graph
 * @param {string} params.scopeType - "context" | "user" | "global"
 * @param {string} params.graphId - Source graph identifier
 * @param {string[]} params.parentChain - IS_A chain from concept to root (display labels)
 * @param {string} params.definition - Generated description string
 * @param {string[]} [params.properties] - Direct property display labels
 * @returns {object} ConflictingDefinition descriptor
 */
export function createConflictingDefinition({
  conceptIri,
  scopeType,
  graphId,
  parentChain,
  definition,
  properties = [],
}) {
  return {
    'fandaws:conceptIri': conceptIri,
    'fandaws:scopeType': scopeType,
    'fandaws:graphId': graphId,
    'fandaws:parentChain': parentChain,
    'fandaws:definition': definition,
    'fandaws:properties': properties,
  };
}

/**
 * Create a ResolutionOption descriptor.
 *
 * @param {object} params
 * @param {string} params.action - "useDefinition" | "createDistinct" | "refine"
 * @param {string} params.label - Human-readable description of the option
 * @param {number|null} [params.targetDefinition] - Index into definitions array (for useDefinition)
 * @returns {object} ResolutionOption descriptor
 */
export function createResolutionOption({
  action,
  label,
  targetDefinition = null,
}) {
  return {
    'fandaws:action': action,
    'fandaws:label': label,
    'fandaws:targetDefinition': targetDefinition,
  };
}

/**
 * Create a ConflictReport.
 *
 * @param {object} params
 * @param {string} params.term - The conflicting term
 * @param {object[]} params.definitions - ConflictingDefinition descriptors
 * @param {object[]} params.resolutionOptions - ResolutionOption descriptors
 * @returns {object} JSON-LD ConflictReport node
 */
export function createConflictReport({
  term,
  definitions,
  resolutionOptions,
}) {
  return {
    '@type': 'fandaws:ConflictReport',
    'fandaws:term': term,
    'fandaws:definitions': definitions,
    'fandaws:resolutionOptions': resolutionOptions,
  };
}
