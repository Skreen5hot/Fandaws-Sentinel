/**
 * Turtle Export — full-vocabulary KnowledgeGraph serialization.
 *
 * Exports all triples (both SKOS and OWL vocabularies) as Turtle.
 * No filtering — preserves complete graph information.
 *
 * @see Fandaws_v3.3_Specification.md Section 3.2.6, 5.7
 */

import { extractTriples } from './triple-extractor.js';
import { serializeTurtle } from './turtle-serializer.js';
import { VERB_TO_SCHEMA } from './relation-type-schemas.js';
import { isRestrictionNode } from '../../types/type-checks.js';

// ── Full Prefixes ──

const ALL_PREFIXES = {
  bfo: 'http://purl.obolibrary.org/obo/',
  dcterms: 'http://purl.org/dc/terms/',
  fandaws: 'https://fandaws.org/schema/',
  fan: 'https://fandaws.org/schema/fan/',
  owl: 'http://www.w3.org/2002/07/owl#',
  prov: 'http://www.w3.org/ns/prov#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  rel: 'https://fandaws.org/schema/executionProperty/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

// ── Public API ──

/**
 * Export a KnowledgeGraph as Turtle with full vocabulary.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @param {object} [config={}] - Export configuration
 * @returns {string} Turtle serialization
 */
export function exportTurtle(graph, config = {}) {
  const allTriples = extractTriples(graph, config);
  let turtle = serializeTurtle(allTriples, ALL_PREFIXES);

  const concepts = graph['fandaws:concepts'] || [];

  // ── Phase D2: Emit rel: ObjectProperty declarations for canonical relation type classes ──
  // Rule EX-2: each rel:{name} property gets a standalone declaration with
  // rdfs:domain, rdfs:range, and owl:PropertyCharacteristic.
  const relationTypeClasses = concepts.filter((c) => {
    const types = Array.isArray(c['@type']) ? c['@type'] : [c['@type']];
    return types.includes('fandaws:RelationTypeClass');
  });

  if (relationTypeClasses.length > 0) {
    turtle += '\n# ── Phase D2: Canonical Relation Type Classes (rel: namespace) ──\n';
    for (const cls of relationTypeClasses) {
      const execIRI = cls['fandaws:executionPropertyIRI'];
      if (!execIRI) continue;

      const chars = cls['fandaws:relationCharacteristics'] || [];
      const typeList = ['owl:ObjectProperty'];
      for (const ch of chars) {
        if (ch === 'transitive' || ch === 'owl:TransitiveProperty') typeList.push('owl:TransitiveProperty');
        if (ch === 'symmetric' || ch === 'owl:SymmetricProperty') typeList.push('owl:SymmetricProperty');
        if (ch === 'reflexive' || ch === 'owl:ReflexiveProperty') typeList.push('owl:ReflexiveProperty');
        if (ch === 'functional' || ch === 'owl:FunctionalProperty') typeList.push('owl:FunctionalProperty');
        if (ch === 'inverseFunctional' || ch === 'owl:InverseFunctionalProperty') typeList.push('owl:InverseFunctionalProperty');
      }

      const lines = [`${execIRI} a ${typeList.join(' , ')} ;`];
      if (cls['rdfs:label']) lines.push(`    rdfs:label ${JSON.stringify(cls['rdfs:label'])} ;`);
      if (cls['fandaws:relationDomain']) lines.push(`    rdfs:domain ${cls['fandaws:relationDomain']} ;`);
      if (cls['fandaws:relationRange']) lines.push(`    rdfs:range ${cls['fandaws:relationRange']} ;`);

      // Sub-property: look up parent's execution IRI
      const parents = cls['rdfs:subClassOf'] || [];
      for (const parentIRI of parents) {
        const parent = concepts.find((c) => c['@id'] === parentIRI);
        if (parent?.['fandaws:executionPropertyIRI']) {
          lines.push(`    rdfs:subPropertyOf ${parent['fandaws:executionPropertyIRI']} ;`);
        }
      }

      // owl:equivalentProperty bridges from external source IRIs
      const equivs = cls['owl:equivalentProperty'] || [];
      for (const eq of equivs) {
        // Emit as separate standalone triple on the source IRI
        // (named-property-to-named-property form, Rule PD-9)
      }

      // Replace last semicolon with period
      if (lines[lines.length - 1].endsWith(' ;')) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, -2) + ' .';
      }
      turtle += '\n' + lines.join('\n') + '\n';

      // Separate block for owl:equivalentProperty (Rule PD-9 named-to-named)
      for (const eq of equivs) {
        const srcIri = eq.source || eq;
        const tgtIri = eq.target || execIRI;
        turtle += `\n<${srcIri}> owl:equivalentProperty ${tgtIri} .\n`;
      }
    }
  }

  // Append RECC relation type class schemas (Rule RECC-5: verbatim seed set).
  // Scan all restrictions for Tier 2A verbs that map to a relation type class.
  // Only emit each schema once, regardless of how many restrictions use it.
  const emittedSchemas = new Set();
  for (const concept of concepts) {
    for (const entry of (concept['rdfs:subClassOf'] || [])) {
      if (!isRestrictionNode(entry)) continue;
      const onProp = entry['owl:onProperty'];
      if (typeof onProp !== 'string') continue;
      // Extract verb tail from fandaws:objectProperty/<verb>
      const verbPrefix = 'fandaws:objectProperty/';
      if (!onProp.startsWith(verbPrefix)) continue;
      const verb = onProp.slice(verbPrefix.length);
      if (verb in VERB_TO_SCHEMA && !emittedSchemas.has(verb)) {
        emittedSchemas.add(verb);
        turtle += '\n' + VERB_TO_SCHEMA[verb].schema.trim() + '\n';
      }
    }
  }

  return turtle;
}
