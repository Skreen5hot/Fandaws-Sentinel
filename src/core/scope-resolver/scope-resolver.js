/**
 * ScopeResolver — null stub implementation.
 *
 * Always returns status "unknown". The pipeline orchestrator skips this
 * entirely when scopeResolutionEnabled === false (the default).
 *
 * Real implementation deferred to Phase 12.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.4
 */

import { createScopeResolution } from '../../types/scope-resolution.js';

/**
 * Resolve a term against configured scopes.
 *
 * @param {string} term - The term to resolve
 * @param {object|null} [scopeConfig=null] - ScopeConfiguration (unused in stub)
 * @returns {object} JSON-LD ScopeResolution node with status "unknown"
 */
export function resolveScope(term, scopeConfig = null) {
  return createScopeResolution({
    term,
    status: 'unknown',
  });
}
