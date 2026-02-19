/**
 * Export Formats — Turtle + RDF/XML combined tests.
 *
 * Covers: Turtle syntax (prefixes, semicolons, dots, compact IRIs, escaping),
 * RDF/XML syntax (XML header, namespaces, rdf:Description, escaping).
 */

import { describe, it, expect } from '@jest/globals';
import { exportTurtle } from '../../src/core/export-engine/turtle-export.js';
import { exportRDF } from '../../src/core/export-engine/rdf-xml-export.js';
import { exportOWL } from '../../src/core/export-engine/owl-export.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { REGISTERS } from '../../src/types/routing-record.js';

// ── Helpers ──

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeConcept(id, label, prefLabel, broader = null) {
  return createConcept({ id, label, prefLabel, broader });
}

// ── Tests ──

describe('Export Formats', () => {
  describe('Turtle export', () => {
    it('produces output with @prefix declarations', () => {
      const result = exportTurtle(makeGraph([]));
      expect(result).toContain('@prefix');
      expect(result).toContain('@prefix skos:');
      expect(result).toContain('@prefix owl:');
    });

    it('uses semicolons between predicates of same subject', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportTurtle(makeGraph([dog]));
      expect(result).toContain(';');
    });

    it('uses dot to terminate subject blocks', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportTurtle(makeGraph([dog]));
      // Should end subject blocks with .
      expect(result).toMatch(/\.\s*$/m);
    });

    it('compacts IRIs using declared prefixes', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportTurtle(makeGraph([dog]));
      expect(result).toContain('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog');
    });

    it('escapes special characters in literals', () => {
      const concept = makeConcept('fandaws:class/0bf07a6b-44d0-59c3-8688-74c07b3163f6/test', 'He said "hello"', 'test');
      const result = exportTurtle(makeGraph([concept]));
      expect(result).toContain('He said \\"hello\\"');
    });

    it('emits all concept types and properties', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const prop = createProperty({
        id: 'fandaws:prop/dog--fur',
        propertyConceptIri: 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
      });
      dog['rdfs:subClassOf'] = [prop];
      const result = exportTurtle(makeGraph([dog]));

      expect(result).toContain('owl:Class');
      expect(result).toContain('skos:Concept');
      expect(result).toContain('owl:Restriction');
    });

    it('emits BFO rdfs:subClassOf triple with compact bfo: prefix', () => {
      const dog = createConcept({
        id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        label: 'Dog',
        prefLabel: 'dog',
        bfoMapping: 'bfo:BFO_0000040',
      });
      const result = exportTurtle(makeGraph([dog]));
      expect(result).toContain('@prefix bfo:');
      expect(result).toContain('bfo:BFO_0000040');
      expect(result).toContain('rdfs:subClassOf');
    });

    it('is deterministic: same graph produces byte-identical output', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'cat');
      const graph = makeGraph([dog, cat]);

      const r1 = exportTurtle(graph);
      const r2 = exportTurtle(graph);
      const r3 = exportTurtle(graph);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('empty graph produces only prefix declarations', () => {
      const result = exportTurtle(makeGraph([]));
      expect(result).toContain('@prefix');
      // Should not have any subject blocks
      expect(result).not.toContain('fandaws:concept');
    });

    it('handles typed literals with datatype annotation', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportTurtle(makeGraph([dog]));
      // dcterms:created should have xsd:dateTime type
      expect(result).toContain('^^<http://www.w3.org/2001/XMLSchema#dateTime>');
    });
  });

  describe('RDF/XML export', () => {
    it('produces valid XML with declaration header', () => {
      const result = exportRDF(makeGraph([]));
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('includes namespace declarations on rdf:RDF', () => {
      const result = exportRDF(makeGraph([]));
      expect(result).toContain('xmlns:rdf=');
      expect(result).toContain('xmlns:rdfs=');
      expect(result).toContain('xmlns:owl=');
      expect(result).toContain('xmlns:skos=');
    });

    it('wraps each concept in rdf:Description', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportRDF(makeGraph([dog]));
      expect(result).toContain('<rdf:Description rdf:about=');
      expect(result).toContain('</rdf:Description>');
    });

    it('emits rdf:type as child elements', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportRDF(makeGraph([dog]));
      expect(result).toContain('<rdf:type rdf:resource=');
    });

    it('emits URI objects as rdf:resource attributes', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
      const result = exportRDF(makeGraph([dog]));
      expect(result).toContain('rdf:resource=');
    });

    it('emits literal objects as element text content', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const result = exportRDF(makeGraph([dog]));
      expect(result).toContain('>Dog</');
    });

    it('escapes XML special characters', () => {
      const concept = makeConcept('fandaws:class/0bf07a6b-44d0-59c3-8688-74c07b3163f6/test', 'A & B <C>', 'test');
      const result = exportRDF(makeGraph([concept]));
      expect(result).toContain('A &amp; B &lt;C&gt;');
    });

    it('emits BFO rdfs:subClassOf in RDF/XML', () => {
      const dog = createConcept({
        id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        label: 'Dog',
        prefLabel: 'dog',
        bfoMapping: 'bfo:BFO_0000040',
      });
      const result = exportRDF(makeGraph([dog]));
      expect(result).toContain('xmlns:bfo=');
      expect(result).toContain('BFO_0000040');
    });

    it('is deterministic: same graph produces byte-identical output', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'cat');
      const graph = makeGraph([dog, cat]);

      const r1 = exportRDF(graph);
      const r2 = exportRDF(graph);
      const r3 = exportRDF(graph);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('empty graph produces valid empty rdf:RDF element', () => {
      const result = exportRDF(makeGraph([]));
      expect(result).toContain('<rdf:RDF');
      expect(result).toContain('</rdf:RDF>');
    });
  });

  describe('Epistemic register metadata export', () => {
    function makeConceptWithRegisterProperty() {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const prop = createProperty({
        id: 'fandaws:restriction/test/dog--fur',
        propertyConceptIri: 'fandaws:property/test/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
        epistemicRegister: REGISTERS.NORMATIVE,
        routingFlags: ['role-heightened-sensitivity'],
      });
      dog['rdfs:subClassOf'] = [prop];
      return makeGraph([dog]);
    }

    function makeConceptWithoutRegister() {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const prop = createProperty({
        id: 'fandaws:restriction/test/dog--fur',
        propertyConceptIri: 'fandaws:property/test/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
      });
      dog['rdfs:subClassOf'] = [prop];
      return makeGraph([dog]);
    }

    it('Turtle emits fandaws:epistemicRegister triple when present', () => {
      const graph = makeConceptWithRegisterProperty();
      const result = exportTurtle(graph);
      expect(result).toContain('fandaws:epistemicRegister');
      expect(result).toContain('fandaws:register/normative');
    });

    it('Turtle emits fandaws:routingFlags triple when present', () => {
      const graph = makeConceptWithRegisterProperty();
      const result = exportTurtle(graph);
      expect(result).toContain('fandaws:routingFlags');
      expect(result).toContain('role-heightened-sensitivity');
    });

    it('Turtle omits register triples when not present', () => {
      const graph = makeConceptWithoutRegister();
      const result = exportTurtle(graph);
      expect(result).not.toContain('fandaws:epistemicRegister');
      expect(result).not.toContain('fandaws:routingFlags');
    });

    it('RDF/XML emits register metadata when present', () => {
      const graph = makeConceptWithRegisterProperty();
      const result = exportRDF(graph);
      expect(result).toContain('epistemicRegister');
      expect(result).toContain('register/normative');
    });

    it('RDF/XML omits register triples when not present', () => {
      const graph = makeConceptWithoutRegister();
      const result = exportRDF(graph);
      expect(result).not.toContain('epistemicRegister');
    });

    it('multiple flags are emitted in sorted order', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const prop = createProperty({
        id: 'fandaws:restriction/test/dog--fur',
        propertyConceptIri: 'fandaws:property/test/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
        epistemicRegister: REGISTERS.NORMATIVE,
        routingFlags: ['teleological-signal', 'bearer-retarget'],
      });
      dog['rdfs:subClassOf'] = [prop];
      const graph = makeGraph([dog]);
      const result = exportTurtle(graph);
      // Both flags present
      expect(result).toContain('bearer-retarget');
      expect(result).toContain('teleological-signal');
      // Sorted: bearer-retarget before teleological-signal
      const bearerIdx = result.indexOf('bearer-retarget');
      const teleoIdx = result.indexOf('teleological-signal');
      expect(bearerIdx).toBeLessThan(teleoIdx);
    });

    it('relationship restriction also emits register metadata', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const rel = createRelationship({
        id: 'fandaws:rel/test/dog--chase--cat',
        verb: 'fandaws:property/test/chase',
        subjectIri: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        objectIri: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
        epistemicRegister: REGISTERS.AXIOMATIC,
      });
      dog['rdfs:subClassOf'] = [rel];
      const graph = makeGraph([dog]);
      const result = exportTurtle(graph);
      expect(result).toContain('fandaws:epistemicRegister');
      expect(result).toContain('fandaws:register/axiomatic');
    });

    it('OWL export includes register metadata (EXP-03)', () => {
      const graph = makeConceptWithRegisterProperty();
      const result = exportOWL(graph);
      expect(result).toContain('epistemicRegister');
      expect(result).toContain('register/normative');
    });

    it('routing record internals NOT exported in annotation-only profile (EXP-07)', () => {
      const graph = makeConceptWithRegisterProperty();
      const result = exportTurtle(graph);
      // Register and flags are exported, but routing record method/trigger are NOT
      expect(result).toContain('fandaws:epistemicRegister');
      expect(result).not.toContain('fandaws:routingMethod');
      expect(result).not.toContain('fandaws:trigger');
    });

    it('multiple restrictions with different registers (EXP-08)', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const prop1 = createProperty({
        id: 'fandaws:restriction/test/dog--fur',
        propertyConceptIri: 'fandaws:property/test/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
        epistemicRegister: REGISTERS.NORMATIVE,
      });
      const prop2 = createProperty({
        id: 'fandaws:restriction/test/dog--sides',
        propertyConceptIri: 'fandaws:property/test/sides',
        propertyLabel: 'sides',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: '4',
        epistemicRegister: REGISTERS.AXIOMATIC,
      });
      dog['rdfs:subClassOf'] = [prop1, prop2];
      const graph = makeGraph([dog]);
      const result = exportTurtle(graph);
      expect(result).toContain('fandaws:register/normative');
      expect(result).toContain('fandaws:register/axiomatic');
    });
  });
});
