/**
 * NullIntegrationAdapter — offline-mode integration adapter.
 *
 * Returns DeferredResult for all external lookups. Used when no
 * external services are available (offline-first default).
 *
 * @see Fandaws_v3.3_Specification.md Section 12.3
 */

import { IntegrationAdapter } from './integration-adapter.js';
import { createDeferredResult } from '../../types/deferred-result.js';

export class NullIntegrationAdapter extends IntegrationAdapter {
  lookupDictionary(term) {
    return createDeferredResult({
      operation: 'lookupDictionary',
      input: { term },
      reason: 'offline',
    });
  }

  lookupBFO(concept) {
    return createDeferredResult({
      operation: 'lookupBFO',
      input: { concept },
      reason: 'offline',
    });
  }

  importOntology(source) {
    return createDeferredResult({
      operation: 'importOntology',
      input: { source },
      reason: 'offline',
    });
  }
}
