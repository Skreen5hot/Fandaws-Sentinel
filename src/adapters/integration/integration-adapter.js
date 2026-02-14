/**
 * IntegrationAdapter Interface
 *
 * Handles all external communication. When unavailable, each method must
 * define graceful degradation behavior. No method may invoke probabilistic
 * inference or language model APIs.
 *
 * Implementations: NullIntegrationAdapter (returns DeferredResult for all methods)
 *
 * @see Fandaws_v3.3_Specification.md Section 3.3.2
 */

/**
 * @interface IntegrationAdapter
 *
 * @method lookupDictionary(term: string): DictionaryResult | DeferredResult
 *   Look up a term in an external dictionary.
 *   Returns DeferredResult when offline.
 *
 * @method lookupBFO(concept: object): BFOMapping | DeferredResult
 *   Map a concept to Basic Formal Ontology categories.
 *   Returns DeferredResult when offline.
 *
 * @method importOntology(source: string): KnowledgeGraph | DeferredResult
 *   Import an external ontology as a partial knowledge graph.
 *
 * All results must include a provenance envelope (Section 3.3.2):
 *   - fandaws:provenance.provider
 *   - fandaws:provenance.version
 *   - fandaws:provenance.inputHash
 *   - fandaws:provenance.outputHash
 *   - fandaws:provenance.retrievedAt
 *   - fandaws:provenance.fromCache
 */

export class IntegrationAdapter {
  lookupDictionary(_term) { throw new Error('IntegrationAdapter.lookupDictionary() not implemented'); }
  lookupBFO(_concept) { throw new Error('IntegrationAdapter.lookupBFO() not implemented'); }
  importOntology(_source) { throw new Error('IntegrationAdapter.importOntology() not implemented'); }
}
