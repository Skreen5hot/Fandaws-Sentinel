/**
 * Export Formats — Turtle + RDF/XML combined tests.
 *
 * Covers: Turtle syntax (prefixes, semicolons, dots, compact IRIs, escaping),
 * RDF/XML syntax (XML header, namespaces, rdf:Description, escaping).
 */

import { describe, it, expect } from '@jest/globals';
import { exportTurtle } from '../../src/core/export-engine/turtle-export.js';
import { exportRDF } from '../../src/core/export-engine/rdf-xml-export.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

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
        propertyIri: 'fur',
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
});
