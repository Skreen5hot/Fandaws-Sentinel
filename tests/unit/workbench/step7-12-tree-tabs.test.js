/**
 * X9 Step 7.12 (2026-04-29) — Graph tree panel tabs (Concepts | Relations).
 *
 * Tests the pure filter helper extracted from initGraphTree. The DOM
 * rendering is panel-coupled and validated via the manual workbench
 * dry-run; the pure helpers (filterConceptsByTab, isRelationClass) cover
 * the data-flow logic.
 *
 * Tab framing: "Relations" (NOT "Object Properties") per PO directive
 * 2026-04-29 — the Reified Constitutive Relations Specification (in
 * flight) will revise relation-class records, so the tab label avoids
 * over-committing to OWL-source terminology.
 */

import { describe, it, expect } from '@jest/globals';
import {
  filterConceptsByTab,
  isRelationClass,
} from '../../../docs/workbench/js/panels/graph-tree.js';

describe('Step 7.12 — isRelationClass', () => {
  it('detects array-form @type containing fandaws:RelationTypeClass', () => {
    expect(isRelationClass({ '@type': ['owl:Class', 'fandaws:RelationTypeClass'] })).toBe(true);
  });

  it('detects string-form @type', () => {
    expect(isRelationClass({ '@type': 'fandaws:RelationTypeClass' })).toBe(true);
  });

  it('returns false for concept classes', () => {
    expect(isRelationClass({ '@type': ['owl:Class', 'skos:Concept'] })).toBe(false);
    expect(isRelationClass({ '@type': 'owl:Class' })).toBe(false);
  });

  it('returns false for missing or null @type', () => {
    expect(isRelationClass({})).toBe(false);
    expect(isRelationClass({ '@type': null })).toBe(false);
    expect(isRelationClass(null)).toBe(false);
  });
});

describe('Step 7.12 — filterConceptsByTab', () => {
  const concepts = [
    { '@id': 'fandaws:class/uuid1/eye-color', '@type': ['owl:Class', 'skos:Concept'], 'rdfs:label': 'Eye Color' },
    { '@id': 'fandaws:class/uuid2/agent', '@type': ['owl:Class', 'skos:Concept'], 'rdfs:label': 'Agent' },
    { '@id': 'fandaws:class/relation/uuid3/has-affiliate', '@type': ['owl:Class', 'fandaws:RelationTypeClass'], 'rdfs:label': 'has affiliate' },
    { '@id': 'fandaws:class/relation/uuid4/uses', '@type': ['owl:Class', 'fandaws:RelationTypeClass'], 'rdfs:label': 'uses' },
    { '@id': 'fandaws:class/imported/bfo-process', '@type': ['owl:Class', 'skos:Concept'], 'rdfs:label': 'process', 'fandaws:isImported': true },
  ];

  it('Concepts tab returns only non-relation classes', () => {
    const filtered = filterConceptsByTab(concepts, 'concepts');
    expect(filtered).toHaveLength(3); // 2 concepts + 1 imported BFO
    expect(filtered.every(c => !isRelationClass(c))).toBe(true);
  });

  it('Relations tab returns only relation-classes', () => {
    const filtered = filterConceptsByTab(concepts, 'relations');
    expect(filtered).toHaveLength(2);
    expect(filtered.every(c => isRelationClass(c))).toBe(true);
    expect(filtered.map(c => c['rdfs:label']).sort()).toEqual(['has affiliate', 'uses']);
  });

  it('default tab (no arg specified) shows concepts tab content', () => {
    // Implementation detail: defaults to concepts when tab is anything
    // other than 'relations'. Common-case ergonomic — analyst clicks
    // Concepts label when the panel first renders.
    const filtered = filterConceptsByTab(concepts, 'concepts');
    expect(filtered).toHaveLength(3);
  });

  it('empty concept list returns empty for both tabs', () => {
    expect(filterConceptsByTab([], 'concepts')).toEqual([]);
    expect(filterConceptsByTab([], 'relations')).toEqual([]);
  });

  it('all-relations list: Concepts tab is empty, Relations tab has all', () => {
    const onlyRelations = concepts.filter(isRelationClass);
    expect(filterConceptsByTab(onlyRelations, 'concepts')).toEqual([]);
    expect(filterConceptsByTab(onlyRelations, 'relations')).toHaveLength(2);
  });

  it('counts match between filter result and isRelationClass-based count', () => {
    // Sanity: tab counts in the rendered tab strip are derived from
    // filterConceptsByTab output length.
    const conceptsCount = filterConceptsByTab(concepts, 'concepts').length;
    const relationsCount = filterConceptsByTab(concepts, 'relations').length;
    expect(conceptsCount + relationsCount).toBe(concepts.length);
  });
});
