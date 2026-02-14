/**
 * DeferredResult — marker for operations that could not complete.
 *
 * Typically due to offline status or integration unavailability.
 * Captures enough context to retry when connectivity is restored.
 *
 * @see Fandaws_v3.3_Specification.md Section 4.2.7
 */

/**
 * Create a new DeferredResult.
 *
 * @param {object} params
 * @param {string} params.operation - The operation that was deferred
 * @param {object} params.input - The input that triggered the operation
 * @param {string} params.reason - Why the operation was deferred
 * @param {string|null} [params.retryAfter] - Suggested retry time (ISO 8601)
 * @param {boolean} [params.fallbackUsed] - Whether a degraded fallback was used
 * @returns {object} JSON-LD DeferredResult node
 */
export function createDeferredResult({
  operation,
  input,
  reason,
  retryAfter = null,
  fallbackUsed = false,
}) {
  return {
    '@type': 'fandaws:DeferredResult',
    'fandaws:operation': operation,
    'fandaws:input': input,
    'fandaws:reason': reason,
    'fandaws:retryAfter': retryAfter,
    'fandaws:fallbackUsed': fallbackUsed,
  };
}
