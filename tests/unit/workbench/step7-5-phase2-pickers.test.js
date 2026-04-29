/**
 * X9 Step 7.5++++ — Phase 2 BFO subcategory picker (PromoteAsNewRelation)
 * + in-session sibling parent options (PromoteAsSubProperty picker).
 *
 * Closes the UX gap surfaced after Step 7.5+++: 11 of 44 PROV-O properties
 * remained orphan-warned in Phase 3 because PromoteAsNewRelation hardcoded
 * bfoSubcategory: null and the Sub-Property picker only listed 3 hardcoded
 * seed canonicals (no in-session siblings).
 *
 * Tests cover:
 *   - BFO_SUBCATEGORY_OPTIONS shape (7 BFO categories + Skip)
 *   - findPickerCandidate searches record.scores AND in-session siblings
 *   - Promote w/ bfoSubcategory writes through to canonical → orphan suppressed
 *   - Promote w/ bfoSubcategory: null → orphan still fires (skip path)
 *   - Cascade PD-7 inheritance: descendants inherit parent's bfoSubcategory
 *   - In-session sibling visible as Sub-Property parent candidate
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  BFO_SUBCATEGORY_OPTIONS,
  findPickerCandidate,
} from '../../../docs/workbench/js/panels/ingest/phase2-review-panel.js';
import { runViolationHarness } from '../../../docs/workbench/js/panels/ingest/phase3-review-panel.js';
import { InMemoryStateAdapter, buildTransitiveAncestorChain } from '../../../src/adapters/state/in-memory-state-adapter.js';
import {
  evaluatePlacement,
  routePlacement,
  BFO_OBJECT_PROPERTIES,
} from '../../../src/core/ingestion/placement-sandbox.js';
import { createKnowledgeGraph } from '../../../src/types/index.js';

function adapterWithSandbox() {
  const a = new InMemoryStateAdapter();
  a.registerPlacementSandbox(evaluatePlacement, routePlacement);
  return a;
}

describe('Step 7.5++++ — BFO_SUBCATEGORY_OPTIONS constant', () => {
  it('exposes 7 BFO categories + 1 Skip option', () => {
    expect(BFO_SUBCATEGORY_OPTIONS).toHaveLength(8);
    const values = BFO_SUBCATEGORY_OPTIONS.map(o => o.value);
    expect(values).toContain('bfo:Quality');
    expect(values).toContain('bfo:Disposition');
    expect(values).toContain('bfo:Process');
    expect(values).toContain('bfo:Role');
    expect(values).toContain('bfo:RealizableEntity');
    expect(values).toContain('bfo:GenericallyDependentContinuant');
    expect(values).toContain('bfo:SpecificallyDependentContinuant');
    expect(values).toContain(null); // Skip option
  });

  it('every option has a value field and a non-empty label', () => {
    for (const opt of BFO_SUBCATEGORY_OPTIONS) {
      expect(Object.prototype.hasOwnProperty.call(opt, 'value')).toBe(true);
      expect(typeof opt.label).toBe('string');
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

describe('Step 7.5++++ — findPickerCandidate (Gap B helper)', () => {
  it('returns null when parentId is null/empty', () => {
    expect(findPickerCandidate({ scores: [] }, null, [])).toBeNull();
    expect(findPickerCandidate({ scores: [] }, '', [])).toBeNull();
  });

  it('finds candidate in record.scores (seed/graph case)', () => {
    const record = {
      scores: [
        { canonicalId: 'fandaws:class/relation/has-part', score: 0.9, bfoSubcategory: 'bfo:MaterialEntity' },
      ],
    };
    const result = findPickerCandidate(record, 'fandaws:class/relation/has-part', []);
    expect(result).not.toBeNull();
    expect(result.canonicalId).toBe('fandaws:class/relation/has-part');
    expect(result.bfoSubcategory).toBe('bfo:MaterialEntity');
  });

  it('finds candidate in in-session siblings when not in scores', () => {
    const record = { iri: 'prov:wasInformedBy', scores: [] };
    const allRecords = [
      { iri: 'prov:wasInformedBy', scores: [] }, // self — must not match
      {
        iri: 'prov:wasInfluencedBy',
        canonicalRelationIRI: 'fandaws:class/relation/abc/wasinfluencedby',
        bfoSubcategoryAtPromote: 'bfo:Process',
        action: 'PromoteAsNewRelation',
      },
    ];
    const result = findPickerCandidate(record, 'fandaws:class/relation/abc/wasinfluencedby', allRecords);
    expect(result).not.toBeNull();
    expect(result.canonicalId).toBe('fandaws:class/relation/abc/wasinfluencedby');
    expect(result.bfoSubcategory).toBe('bfo:Process');
    expect(result.source).toBe('in-session');
  });

  it('does NOT return self as a candidate even if canonicalRelationIRI matches', () => {
    const record = {
      iri: 'prov:wasInformedBy',
      canonicalRelationIRI: 'fandaws:class/relation/self/wasinformedby',
      scores: [],
    };
    const allRecords = [record];
    const result = findPickerCandidate(record, 'fandaws:class/relation/self/wasinformedby', allRecords);
    expect(result).toBeNull();
  });

  it('skips Rejected siblings (parent that was rejected cannot be used)', () => {
    const record = { iri: 'prov:child', scores: [] };
    const allRecords = [
      {
        iri: 'prov:rejectedParent',
        canonicalRelationIRI: 'fandaws:class/relation/x/rejected',
        action: 'Reject',
      },
    ];
    const result = findPickerCandidate(record, 'fandaws:class/relation/x/rejected', allRecords);
    expect(result).toBeNull();
  });

  it('falls back to inheritedBfoSubcategory when bfoSubcategoryAtPromote is null', () => {
    const record = { iri: 'prov:child', scores: [] };
    const allRecords = [
      {
        iri: 'prov:parent',
        canonicalRelationIRI: 'fandaws:class/relation/x/parent',
        bfoSubcategoryAtPromote: null,
        inheritedBfoSubcategory: 'bfo:Quality',
        action: 'PromoteAsSubProperty',
      },
    ];
    const result = findPickerCandidate(record, 'fandaws:class/relation/x/parent', allRecords);
    expect(result.bfoSubcategory).toBe('bfo:Quality');
  });
});

describe('Step 7.10 — findPickerCandidate BFO catalog source pool', () => {
  it('resolves a BFO 2020 root object property via the bfoCatalog argument', () => {
    const record = { iri: 'cco:ont00001787', scores: [] };
    const result = findPickerCandidate(
      record,
      'obo:BFO_0000056',
      [],
      BFO_OBJECT_PROPERTIES,
    );
    expect(result).not.toBeNull();
    expect(result.canonicalId).toBe('obo:BFO_0000056');
    expect(result.label).toBe('participates in');
    expect(result.source).toBe('bfo');
  });

  it('returns null when parentId points at unknown BFO IRI', () => {
    const record = { iri: 'ex:test', scores: [] };
    const result = findPickerCandidate(record, 'obo:BFO_9999999', [], BFO_OBJECT_PROPERTIES);
    expect(result).toBeNull();
  });

  it('record.scores match takes precedence over BFO catalog match for same IRI', () => {
    // Degenerate case: if a BFO IRI somehow ends up in record.scores
    // (unlikely but possible if the analyst already promoted under it),
    // the scores entry wins so its bfoSubcategory annotation is used.
    const record = {
      iri: 'ex:test',
      scores: [{ canonicalId: 'obo:BFO_0000056', score: 1.0, bfoSubcategory: 'bfo:Process', source: 'scored' }],
    };
    const result = findPickerCandidate(record, 'obo:BFO_0000056', [], BFO_OBJECT_PROPERTIES);
    expect(result.bfoSubcategory).toBe('bfo:Process');
    expect(result.source).toBe('scored');
  });

  it('in-session sibling match takes precedence over BFO catalog match for same IRI', () => {
    const record = { iri: 'ex:test', scores: [] };
    const allRecords = [
      {
        iri: 'ex:other',
        canonicalRelationIRI: 'obo:BFO_0000056',
        action: 'Merge',
        bfoSubcategoryAtPromote: 'bfo:Process',
      },
    ];
    const result = findPickerCandidate(record, 'obo:BFO_0000056', allRecords, BFO_OBJECT_PROPERTIES);
    expect(result.source).toBe('in-session');
  });

  it('PromoteAsSubProperty under BFO catalog parent writes correct subPropertyOf to canonical', () => {
    // End-to-end: analyst sub-properties cco:ont00001787 ("agent in")
    // under obo:BFO_0000056 (BFO participates_in) via the picker.
    // promoteCanonicalRelation writes rdfs:subClassOf [obo:BFO_0000056]
    // — Phase 3 orphan rule (Step 7.5+++) recognizes the parent.
    const adapter = adapterWithSandbox();
    const graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 'cco.ttl', classes: [],
      properties: [{ iri: 'cco:ont00001787', label: 'agent in' }],
    });
    const result = adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'cco:ont00001787',
      candidateLabel: 'agent in',
      subPropertyOf: 'obo:BFO_0000056',
      ingestedInSession: ingest.sessionId,
    });
    expect(result.canonicalRelationIRI).toBeTruthy();
    const graph = adapter._graphs.get(graphId);
    const canonical = graph['fandaws:concepts'].find(c =>
      c['@id'] === result.canonicalRelationIRI
    );
    expect(canonical['rdfs:subClassOf']).toContain('obo:BFO_0000056');

    // Phase 3: zero orphan warnings (Step 7.5+++ recognizes
    // rdfs:subClassOf as a relation-class parent attribution).
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v => v.ruleName === 'OrphanClassViolation');
    expect(orphans).toHaveLength(0);
  });
});

describe('Step 7.5++++ — Gap A end-to-end: BFO subcategory write-through', () => {
  let adapter, graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
  });

  it('promoteCanonicalRelation w/ bfoSubcategory: bfo:Process → Phase 3 orphan suppressed', () => {
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes: [],
      properties: [{ iri: 'prov:wasInfluencedBy', label: 'wasInfluencedBy' }],
    });
    // Simulate analyst clicking PromoteAsNewRelation with bfo:Process selected.
    adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'prov:wasInfluencedBy',
      candidateLabel: 'wasInfluencedBy',
      declaredDomain: null,
      declaredRange: null,
      bfoSubcategory: 'bfo:Process',
      ingestedInSession: ingest.sessionId,
    });

    const graph = adapter._graphs.get(graphId);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v =>
      v.ruleName === 'OrphanClassViolation' && v.label === 'wasinfluencedby'
    );
    expect(orphans).toHaveLength(0);
  });

  it('promoteCanonicalRelation w/ bfoSubcategory: null (Skip) → Phase 3 orphan still fires', () => {
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes: [],
      properties: [{ iri: 'prov:alternateOf', label: 'alternateOf' }],
    });
    adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'prov:alternateOf',
      candidateLabel: 'alternateOf',
      declaredDomain: null,
      declaredRange: null,
      bfoSubcategory: null, // Skip path
      ingestedInSession: ingest.sessionId,
    });
    const graph = adapter._graphs.get(graphId);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v =>
      v.ruleName === 'OrphanClassViolation' && v.label === 'alternateof'
    );
    expect(orphans).toHaveLength(1);
    expect(orphans[0].message).toMatch(/Relation class has no parent/);
  });

  it('cascade PD-7: descendants inherit parent bfoSubcategory from canonical record', () => {
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes: [],
      properties: [
        { iri: 'prov:wasInfluencedBy', label: 'wasInfluencedBy' },
        { iri: 'prov:wasInformedBy', label: 'wasInformedBy', subPropertyOf: 'prov:wasInfluencedBy' },
      ],
    });
    // Promote root with bfo:Process.
    const rootResult = adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'prov:wasInfluencedBy',
      candidateLabel: 'wasInfluencedBy',
      declaredDomain: null,
      declaredRange: null,
      bfoSubcategory: 'bfo:Process',
      ingestedInSession: ingest.sessionId,
    });
    // Cascade fires.
    const cascade = adapter.cascadeSubPropertyResolution(
      graphId,
      ingest.sessionId,
      'prov:wasInfluencedBy',
      rootResult.canonicalRelationIRI,
      'PromoteAsNewRelation',
    );
    expect(cascade.cascaded).toHaveLength(1);
    expect(cascade.cascaded[0].inheritedBfoSubcategory).toBe('bfo:Process');

    // Verify the cascaded child's canonical record carries bfoSubcategory.
    const graph = adapter._graphs.get(graphId);
    const childCanonical = graph['fandaws:concepts'].find(c =>
      c['rdfs:label'] === 'wasInformedBy' && c['@type']?.includes('fandaws:RelationTypeClass')
    );
    expect(childCanonical['fandaws:bfoSubcategory']).toBe('bfo:Process');
    expect(childCanonical['rdfs:subClassOf']).toContain(rootResult.canonicalRelationIRI);

    // Phase 3: zero orphan warnings — root has BFO grounding, child has subClassOf.
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    expect(violations.filter(v => v.ruleName === 'OrphanClassViolation')).toHaveLength(0);
  });
});

describe('Step 7.5+++++ — Override escape hatch on RelationDeferred row', () => {
  it('Override flips RelationDeferred record to NovelPromotionPanel; subsequent resolveAction promotes manually', () => {
    // Simulates the panel-side Override path: analyst clicks
    // "Override → resolve manually" on a deferred row whose parent was
    // Rejected (or stalled). The override mutates record.routing.disposition
    // and clears parentPropertyInOntology. The record then renders with
    // standard action buttons; analyst Promotes as new relation.
    const adapter = adapterWithSandbox();
    const graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));

    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes: [],
      properties: [
        { iri: 'prov:wasInfluencedBy', label: 'wasInfluencedBy' },
        { iri: 'prov:hadPrimarySource', label: 'hadPrimarySource', subPropertyOf: 'prov:wasInfluencedBy' },
      ],
    });

    // Simulate analyst Reject of wasInfluencedBy → cascade reverts
    // hadPrimarySource to NovelPromotionPanel via cascadeSubPropertyResolution.
    const cascade = adapter.cascadeSubPropertyResolution(
      graphId, ingest.sessionId, 'prov:wasInfluencedBy', null, 'Reject'
    );
    expect(cascade.revertedToNovel).toEqual(['prov:hadPrimarySource']);

    // The Phase 2 panel-side simulation: build a Phase 2 record matching
    // the post-Reject state (record.routing.disposition still says
    // RelationDeferred until panel applies the revert). The Override
    // button does the same flip the cascade does, but for stalled rows
    // whose parent stayed unresolved (no cascade fired).
    const phase2Record = {
      iri: 'prov:hadPrimarySource',
      label: 'hadPrimarySource',
      subPropertyOf: 'prov:wasInfluencedBy',
      parentPropertyInOntology: true,
      routing: { disposition: 'RelationDeferred', parentPropertyIRI: 'prov:wasInfluencedBy' },
      action: null,
      resolved: false,
    };

    // Apply Override (the panel handler's mutation, replicated in test):
    phase2Record.routing = {
      ...phase2Record.routing,
      disposition: 'NovelPromotionPanel',
      cascadeRevertedFrom: 'RelationDeferred',
      overrideTrigger: 'AnalystManualOverride',
    };
    phase2Record.parentPropertyInOntology = false;

    expect(phase2Record.routing.disposition).toBe('NovelPromotionPanel');
    expect(phase2Record.routing.overrideTrigger).toBe('AnalystManualOverride');
    expect(phase2Record.routing.cascadeRevertedFrom).toBe('RelationDeferred');
    expect(phase2Record.parentPropertyInOntology).toBe(false);

    // Analyst can now Promote manually with BFO subcategory; canonical
    // record gets created independent of the rejected parent.
    const result = adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: phase2Record.iri,
      candidateLabel: phase2Record.label,
      bfoSubcategory: 'bfo:Process',
      ingestedInSession: ingest.sessionId,
    });
    expect(result.canonicalRelationIRI).toBeTruthy();

    // Phase 3: zero orphan warnings on the manually-rooted property.
    const graph = adapter._graphs.get(graphId);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    const orphans = violations.filter(v =>
      v.ruleName === 'OrphanClassViolation' && v.label === 'hadprimarysource'
    );
    expect(orphans).toHaveLength(0);
  });
});

describe('Step 7.5++++ — Gap B: in-session sibling visible to Sub-Property picker', () => {
  it('records[] containing a promoted sibling exposes it via findPickerCandidate', () => {
    // Simulate the post-promotion records[] state in the Phase 2 panel
    // after analyst PromoteAsNewRelation'd wasInfluencedBy with bfo:Process.
    const records = [
      {
        iri: 'prov:wasInfluencedBy',
        label: 'wasInfluencedBy',
        canonicalRelationIRI: 'fandaws:class/relation/wasinfluencedby-uuid/wasinfluencedby',
        bfoSubcategoryAtPromote: 'bfo:Process',
        action: 'PromoteAsNewRelation',
        resolved: true,
      },
      {
        iri: 'prov:influenced',
        label: 'influenced',
        scores: [
          { canonicalId: 'fandaws:class/relation/has-part', score: 0.2 },
          { canonicalId: 'fandaws:class/relation/inheres-in', score: 0.15 },
        ],
        action: null,
        resolved: false,
      },
    ];
    const candidateIri = 'fandaws:class/relation/wasinfluencedby-uuid/wasinfluencedby';
    const result = findPickerCandidate(records[1], candidateIri, records);
    expect(result).not.toBeNull();
    expect(result.canonicalId).toBe(candidateIri);
    expect(result.source).toBe('in-session');
    expect(result.bfoSubcategory).toBe('bfo:Process');
  });

  it('Sub-Property cascade routes through in-session sibling parent (full pipeline)', () => {
    const adapter = adapterWithSandbox();
    const graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes: [],
      properties: [
        { iri: 'prov:wasInfluencedBy', label: 'wasInfluencedBy' },
        // No declared subPropertyOf — analyst will manually pick wasInfluencedBy
        // as parent via the new in-session-aware Sub-Property picker.
        { iri: 'prov:influenced', label: 'influenced' },
      ],
    });
    // Step 1: Analyst promotes wasInfluencedBy as new relation w/ bfo:Process.
    const rootResult = adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'prov:wasInfluencedBy',
      candidateLabel: 'wasInfluencedBy',
      bfoSubcategory: 'bfo:Process',
      ingestedInSession: ingest.sessionId,
    });
    // Step 2: Analyst promotes influenced as Sub-Property of wasInfluencedBy
    // (which is now in-session, NOT in the original 3 seeds).
    const childResult = adapter.promoteCanonicalRelation(graphId, {
      candidateIRI: 'prov:influenced',
      candidateLabel: 'influenced',
      bfoSubcategory: 'bfo:Process', // PD-7 inherits
      subPropertyOf: rootResult.canonicalRelationIRI,
      ingestedInSession: ingest.sessionId,
    });
    expect(childResult.canonicalRelationIRI).toBeTruthy();

    // Phase 3: zero orphans.
    const graph = adapter._graphs.get(graphId);
    const { violations } = runViolationHarness(graph, [], [], { Fandaws: {} });
    expect(violations.filter(v => v.ruleName === 'OrphanClassViolation')).toHaveLength(0);

    // Verify child's canonical record points to root canonical via rdfs:subClassOf.
    const childCanonical = graph['fandaws:concepts'].find(c =>
      c['rdfs:label'] === 'influenced'
    );
    expect(childCanonical['rdfs:subClassOf']).toContain(rootResult.canonicalRelationIRI);
  });
});
