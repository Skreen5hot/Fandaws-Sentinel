/**
 * Triple Extractor — unit tests.
 *
 * Covers: IRI expansion/compaction, concept triple extraction,
 * property/relationship restrictions, determinism, edge cases.
 */

import { describe, it, expect } from '@jest/globals';
import {
  extractTriples,
  expandIri,
  compactIri,
  NAMESPACE_MAP,
} from '../../src/core/export-engine/triple-extractor.js';
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

describe('Triple Extractor', () => {
  describe('expandIri', () => {
    it('expands fandaws: prefix', () => {
      expect(expandIri('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(
        'https://fandaws.org/schema/class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      );
    });

    it('expands owl: prefix', () => {
      expect(expandIri('owl:Class')).toBe(
        'http://www.w3.org/2002/07/owl#Class',
      );
    });

    it('expands skos: prefix', () => {
      expect(expandIri('skos:Concept')).toBe(
        'http://www.w3.org/2004/02/skos/core#Concept',
      );
    });

    it('returns full URI unchanged', () => {
      const full = 'http://example.org/foo';
      expect(expandIri(full)).toBe(full);
    });

    it('handles unknown prefix by returning as-is', () => {
      expect(expandIri('unknown:bar')).toBe('unknown:bar');
    });
  });

  describe('compactIri', () => {
    it('compacts full fandaws URI to prefixed form', () => {
      expect(compactIri('https://fandaws.org/schema/class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog')).toBe(
        'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      );
    });

    it('returns non-matching URI as-is', () => {
      expect(compactIri('http://example.org/foo')).toBe(
        'http://example.org/foo',
      );
    });
  });

  describe('extractTriples', () => {
    it('extracts rdf:type triples for dual-typed concept', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const typeTriples = triples.filter(
        (t) =>
          t.subject === expandIri('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog') &&
          t.predicate === expandIri('rdf:type'),
      );
      expect(typeTriples).toHaveLength(2);
      expect(typeTriples.map((t) => t.object).sort()).toEqual([
        expandIri('owl:Class'),
        expandIri('skos:Concept'),
      ]);
    });

    it('extracts rdfs:label as literal triple', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const labelTriple = triples.find(
        (t) => t.predicate === expandIri('rdfs:label'),
      );
      expect(labelTriple).toBeDefined();
      expect(labelTriple.object).toBe('Dog');
      expect(labelTriple.objectType).toBe('literal');
    });

    it('extracts skos:prefLabel as literal triple', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const prefLabelTriple = triples.find(
        (t) => t.predicate === expandIri('skos:prefLabel'),
      );
      expect(prefLabelTriple).toBeDefined();
      expect(prefLabelTriple.object).toBe('dog');
      expect(prefLabelTriple.objectType).toBe('literal');
    });

    it('extracts skos:broader as URI triple', () => {
      const dog = makeConcept(
        'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        'Dog',
        'dog',
        'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
      );
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const broaderTriple = triples.find(
        (t) => t.predicate === expandIri('skos:broader'),
      );
      expect(broaderTriple).toBeDefined();
      expect(broaderTriple.object).toBe(expandIri('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal'));
      expect(broaderTriple.objectType).toBe('uri');
    });

    it('extracts fandaws:algorithmicDefinition as literal triple', () => {
      const dog = createConcept({
        id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        label: 'Dog',
        prefLabel: 'dog',
        definition: 'Dog is an Animal.',
      });
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const defTriple = triples.find(
        (t) => t.predicate === expandIri('fandaws:algorithmicDefinition'),
      );
      expect(defTriple).toBeDefined();
      expect(defTriple.object).toBe('Dog is an Animal.');
    });

    it('extracts dcterms:created as typed literal', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const createdTriple = triples.find(
        (t) => t.predicate === expandIri('dcterms:created'),
      );
      expect(createdTriple).toBeDefined();
      expect(createdTriple.objectType).toBe('literal');
      expect(createdTriple.datatype).toBe(expandIri('xsd:dateTime'));
    });

    it('skips dcterms:modified when null', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      // dcterms:modified is null by default in createConcept
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const modifiedTriple = triples.find(
        (t) => t.predicate === expandIri('dcterms:modified'),
      );
      expect(modifiedTriple).toBeUndefined();
    });

    it('extracts property restriction triples', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const prop = createProperty({
        id: 'fandaws:prop/dog--fur',
        verbIri: 'fandaws:property/has',
        verbLabel: 'has',
        objectConceptIri: 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
      });
      dog['rdfs:subClassOf'] = [prop];

      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const restrictionIri = expandIri('fandaws:prop/dog--fur');

      // rdfs:subClassOf link
      const subClassTriple = triples.find(
        (t) =>
          t.predicate === expandIri('rdfs:subClassOf') &&
          t.object === restrictionIri,
      );
      expect(subClassTriple).toBeDefined();

      // rdf:type owl:Restriction
      const typeTriple = triples.find(
        (t) =>
          t.subject === restrictionIri &&
          t.predicate === expandIri('rdf:type') &&
          t.object === expandIri('owl:Restriction'),
      );
      expect(typeTriple).toBeDefined();

      // owl:onProperty
      const onPropTriple = triples.find(
        (t) =>
          t.subject === restrictionIri &&
          t.predicate === expandIri('owl:onProperty'),
      );
      expect(onPropTriple).toBeDefined();

      // owl:hasValue
      const hasValueTriple = triples.find(
        (t) =>
          t.subject === restrictionIri &&
          t.predicate === expandIri('owl:hasValue'),
      );
      expect(hasValueTriple).toBeDefined();
      expect(hasValueTriple.object).toBe('yes');
      expect(hasValueTriple.objectType).toBe('literal');
    });

    it('extracts relationship restriction triples', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const rel = createRelationship({
        id: 'fandaws:rel/5871e405-5c67-5f25-b3bb-4be118e09176/dog--chase--cat',
        verbIri: 'chase',
        subject: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        object: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat',
      });
      dog['rdfs:subClassOf'] = [rel];

      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const restrictionIri = expandIri('fandaws:rel/5871e405-5c67-5f25-b3bb-4be118e09176/dog--chase--cat');

      // owl:someValuesFrom
      const someValuesTriple = triples.find(
        (t) =>
          t.subject === restrictionIri &&
          t.predicate === expandIri('owl:someValuesFrom'),
      );
      expect(someValuesTriple).toBeDefined();
      expect(someValuesTriple.object).toBe(expandIri('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat'));
      expect(someValuesTriple.objectType).toBe('uri');
    });

    it('extracts multiple concepts in sorted order', () => {
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'cat');
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      // Insert out of order
      const graph = makeGraph([dog, cat]);
      const triples = extractTriples(graph);

      // First subject is dog (UUID 4d... sorts before cat's UUID a0...)
      expect(triples[0].subject).toBe(expandIri('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog'));
    });

    it('handles empty concept array', () => {
      const graph = makeGraph([]);
      const triples = extractTriples(graph);
      expect(triples).toHaveLength(0);
    });

    it('extracts BFO bare IRI from rdfs:subClassOf as URI triple', () => {
      const dog = createConcept({
        id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        label: 'Dog',
        prefLabel: 'dog',
        bfoMapping: 'bfo:BFO_0000040',
      });
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const bfoTriple = triples.find(
        (t) =>
          t.predicate === expandIri('rdfs:subClassOf') &&
          t.object === expandIri('bfo:BFO_0000040'),
      );
      expect(bfoTriple).toBeDefined();
      expect(bfoTriple.objectType).toBe('uri');
      expect(bfoTriple.object).toBe('http://purl.obolibrary.org/obo/BFO_0000040');
    });

    it('sorts BFO triples before restriction triples in rdfs:subClassOf', () => {
      const dog = createConcept({
        id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        label: 'Dog',
        prefLabel: 'dog',
        bfoMapping: 'bfo:BFO_0000040',
      });
      const prop = createProperty({
        id: 'fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur',
        verbIri: 'fandaws:property/has',
        verbLabel: 'has',
        objectConceptIri: 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
        propertyLabel: 'fur',
        attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        value: 'yes',
      });
      dog['rdfs:subClassOf'].push(prop);
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      const subClassTriples = triples.filter(
        (t) => t.predicate === expandIri('rdfs:subClassOf'),
      );
      // BFO bare IRI comes first, then restriction IRI
      expect(subClassTriples.length).toBeGreaterThanOrEqual(2);
      expect(subClassTriples[0].object).toBe(expandIri('bfo:BFO_0000040'));
    });

    it('handles concept with no properties or relationships', () => {
      const dog = makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog');
      const graph = makeGraph([dog]);
      const triples = extractTriples(graph);

      // Should have type triples + label + prefLabel + created (no subClassOf)
      const subClassTriples = triples.filter(
        (t) => t.predicate === expandIri('rdfs:subClassOf'),
      );
      expect(subClassTriples).toHaveLength(0);
    });

    it('produces identical output for same input (determinism)', () => {
      const dog = makeConcept(
        'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
        'Dog',
        'dog',
        'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
      );
      const cat = makeConcept('fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', 'Cat', 'cat');
      const graph = makeGraph([dog, cat]);

      const result1 = JSON.stringify(extractTriples(graph));
      const result2 = JSON.stringify(extractTriples(graph));
      const result3 = JSON.stringify(extractTriples(graph));

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });
});
