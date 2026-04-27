/**
 * X9 Step 7.5+++ — Phase 3 OrphanClassViolation must recognize
 * relation-class parent-attribution fields.
 *
 * Step 7.5++ regression: every cascaded relation class was flagged
 * OrphanClassViolation because runViolationHarness only built parentMap
 * from skos:broader, ignoring rdfs:subClassOf[0] (sub-property parent
 * canonical IRI written by promoteCanonicalRelation) and
 * fandaws:bfoSubcategory (BFO category attribution for relation classes).
 *
 * Tests cover:
 *   - Relation class with rdfs:subClassOf[0] → NOT flagged
 *   - Relation class with fandaws:bfoSubcategory → NOT flagged
 *   - Relation class with neither → IS flagged with relation-specific repair text
 *   - Concept class with skos:broader → NOT flagged (regression)
 *   - Concept class with neither → IS flagged with concept-specific repair text
 *   - PROV-O-shape fixture (44 cascaded sub-properties) → 0 or near-0 orphans, NOT 44
 *   - owl:Restriction objects on rdfs:subClassOf are filtered (not parents)
 */

import { describe, it, expect } from '@jest/globals';
import { runViolationHarness } from '../../../docs/workbench/js/panels/ingest/phase3-review-panel.js';

function makeGraph(concepts) {
  return { 'fandaws:concepts': concepts };
}

describe('Step 7.5+++ — runViolationHarness OrphanClassViolation parentMap expansion', () => {
  it('relation class with rdfs:subClassOf[0] IRI is NOT flagged orphan', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/relation/parent-uuid/parent',
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': 'parent relation',
        'rdfs:subClassOf': [],
        'fandaws:bfoSubcategory': 'bfo:Quality', // parent has BFO grounding → non-orphan
      },
      {
        '@id': 'fandaws:class/relation/child-uuid/child',
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': 'child relation',
        'rdfs:subClassOf': ['fandaws:class/relation/parent-uuid/parent'],
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    expect(orphans).toHaveLength(0);
  });

  it('relation class with fandaws:bfoSubcategory is NOT flagged orphan', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/relation/x/inheres-in',
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': 'inheres in',
        'rdfs:subClassOf': [],
        'fandaws:bfoSubcategory': 'bfo:Quality',
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    expect(violations.filter(v => v.ruleName === 'OrphanClassViolation')).toHaveLength(0);
  });

  it('relation class with NEITHER parent IS flagged orphan with relation-specific repair text', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/relation/x/genuine-orphan',
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': 'genuine orphan',
        'rdfs:subClassOf': [],
        // no fandaws:bfoSubcategory
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].message).toMatch(/Relation class has no parent/);
    expect(orphans[0].suggestedRepair).toMatch(/sub-property|BFO subcategory/);
  });

  it('concept class with skos:broader is NOT flagged orphan (regression)', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/uuid/concept-parent',
        '@type': ['owl:Class', 'skos:Concept'],
        'skos:prefLabel': 'parent concept',
        'skos:broader': 'bfo:MaterialEntity',
      },
      {
        '@id': 'fandaws:class/uuid/concept-child',
        '@type': ['owl:Class', 'skos:Concept'],
        'skos:prefLabel': 'child concept',
        'skos:broader': 'fandaws:class/uuid/concept-parent',
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    expect(violations.filter(v => v.ruleName === 'OrphanClassViolation')).toHaveLength(0);
  });

  it('concept class with NEITHER parent IS flagged with concept-specific repair text (regression)', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/uuid/lonely',
        '@type': ['owl:Class', 'skos:Concept'],
        'skos:prefLabel': 'lonely',
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].message).toBe('Class has no parent and is not a BFO root.');
    expect(orphans[0].suggestedRepair).toMatch(/parent class under a BFO category/);
  });

  it('owl:Restriction objects on rdfs:subClassOf are NOT treated as parents', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/relation/r/restriction-only',
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': 'restriction-only',
        'rdfs:subClassOf': [
          // Restriction object, not an IRI → NOT a parent.
          { '@type': 'owl:Restriction', 'owl:onProperty': 'fandaws:objectProperty/has-part', 'owl:someValuesFrom': 'bfo:MaterialEntity' },
        ],
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    // Should still be flagged orphan since the restriction is not a parent.
    expect(orphans).toHaveLength(1);
  });

  it('object-form rdfs:subClassOf entries with @id (no owl:onProperty) ARE treated as parents', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/relation/parent/p',
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'fandaws:bfoSubcategory': 'bfo:Quality',
      },
      {
        '@id': 'fandaws:class/relation/child/c',
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:subClassOf': [
          { '@id': 'fandaws:class/relation/parent/p' }, // object-form IRI reference
        ],
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    expect(violations.filter(v => v.ruleName === 'OrphanClassViolation')).toHaveLength(0);
  });

  it('PROV-O-shape: 1 root + 43 cascaded sub-properties → at most 1 orphan warning, NOT 44', () => {
    // Mimics post-Step-7.5++ state: analyst Promoted prov:wasInfluencedBy
    // as new relation (with bfoSubcategory) → 1 root canonical with BFO
    // grounding. Cascade promoted 43 sub-properties (e.g., wasInformedBy,
    // wasGeneratedBy, the qualified* family) as PromoteAsSubProperty of
    // the root's canonical IRI. All 44 should be non-orphan.
    const rootIRI = 'fandaws:class/relation/wasInfluencedBy-uuid/wasinfluencedby';
    const concepts = [
      {
        '@id': rootIRI,
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': 'wasInfluencedBy',
        'fandaws:bfoSubcategory': 'bfo:Process',
        'rdfs:subClassOf': [],
      },
    ];
    for (let i = 0; i < 43; i++) {
      concepts.push({
        '@id': `fandaws:class/relation/sub-${i}-uuid/sub-${i}`,
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': `sub-${i}`,
        'rdfs:subClassOf': [rootIRI],
      });
    }
    const { violations } = runViolationHarness(makeGraph(concepts), [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    expect(orphans).toHaveLength(0); // root has BFO subcategory, all 43 cascaded children inherit via subClassOf
  });

  it('PROV-O-shape with unparented root: only the root flags orphan, NOT all 44', () => {
    // If analyst PromotedAsNewRelation without BFO subcategory, the root
    // is genuinely orphan. Cascaded children are still non-orphan
    // because they have rdfs:subClassOf[0] pointing to the root.
    const rootIRI = 'fandaws:class/relation/root-uuid/root';
    const concepts = [
      {
        '@id': rootIRI,
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': 'unparented root',
        'rdfs:subClassOf': [],
        // no fandaws:bfoSubcategory → genuinely orphan
      },
    ];
    for (let i = 0; i < 43; i++) {
      concepts.push({
        '@id': `fandaws:class/relation/sub-${i}-uuid/sub-${i}`,
        '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
        'rdfs:label': `sub-${i}`,
        'rdfs:subClassOf': [rootIRI],
      });
    }
    const { violations } = runViolationHarness(makeGraph(concepts), [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].conceptIri).toBe(rootIRI);
  });

  it('@type as string (not array) is also recognized', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/relation/x/string-type',
        '@type': 'fandaws:RelationTypeClass',
        'rdfs:label': 'string-type',
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].message).toMatch(/Relation class/);
  });

  it('bfo:-prefixed IRIs are skipped (BFO roots)', () => {
    const graph = makeGraph([
      { '@id': 'bfo:Process', 'rdfs:label': 'process' },
      { '@id': 'bfo:MaterialEntity', 'rdfs:label': 'material entity' },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    expect(violations.filter(v => v.ruleName === 'OrphanClassViolation')).toHaveLength(0);
  });

  it('fandaws:isImported concepts are skipped (BFO infrastructure)', () => {
    const graph = makeGraph([
      {
        '@id': 'fandaws:class/imported/some-bfo',
        'rdfs:label': 'imported',
        'fandaws:isImported': true,
      },
    ]);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    expect(violations.filter(v => v.ruleName === 'OrphanClassViolation')).toHaveLength(0);
  });
});
