/**
 * X9 Step 7.5 — Upload → Placement-Sandbox Seam Repair
 *
 * Two gaps from Aaron's Step 8 dry run:
 *   Gap 1 — parsed.classes[].superclass not threaded transitively to
 *           placement-sandbox; NA-1.1 cascade never exercised.
 *   Gap 2 — parsed.properties never generate CandidateRelation staging
 *           records at adapter ingestion time.
 *
 * Both fixed in src/adapters/state/in-memory-state-adapter.js ingestOntology
 * + src/core/ingestion/placement-sandbox.js evaluatePlacement.
 *
 * Tests cover:
 *   - Transitive ancestorChain construction (buildTransitiveAncestorChain)
 *   - 3-level subclass inheritance fixture (Aaron's dry run scenario shape)
 *   - NA-1.1 cascade-from-resolved (parent's resolved placement → child)
 *   - Topological-sort-by-ancestor-depth ordering
 *   - CandidateRelation staging records generated from parsed.properties
 *   - Acceptance preservation: existing tests still pass
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryStateAdapter, buildTransitiveAncestorChain } from '../../../src/adapters/state/in-memory-state-adapter.js';
import { evaluatePlacement, routePlacement } from '../../../src/core/ingestion/placement-sandbox.js';
import { createKnowledgeGraph } from '../../../src/types/index.js';

function adapterWithSandbox() {
  const a = new InMemoryStateAdapter();
  a.registerPlacementSandbox(evaluatePlacement, routePlacement);
  return a;
}

describe('Step 7.5 — buildTransitiveAncestorChain helper', () => {
  it('returns empty array when class has no superclass', () => {
    const classMap = new Map([
      ['ex:Root', { iri: 'ex:Root', label: 'Root', superclass: null }],
    ]);
    expect(buildTransitiveAncestorChain('ex:Root', classMap)).toEqual([]);
  });

  it('returns single-element chain when class has one parent (no grandparent in map)', () => {
    const classMap = new Map([
      ['ex:Child', { iri: 'ex:Child', superclass: 'ex:Parent' }],
    ]);
    expect(buildTransitiveAncestorChain('ex:Child', classMap)).toEqual(['ex:Parent']);
  });

  it('builds 3-level chain: Grandchild → Child → Parent → Root', () => {
    const classMap = new Map([
      ['ex:Grandchild', { iri: 'ex:Grandchild', superclass: 'ex:Child' }],
      ['ex:Child', { iri: 'ex:Child', superclass: 'ex:Parent' }],
      ['ex:Parent', { iri: 'ex:Parent', superclass: 'ex:Root' }],
      ['ex:Root', { iri: 'ex:Root', superclass: null }],
    ]);
    expect(buildTransitiveAncestorChain('ex:Grandchild', classMap)).toEqual([
      'ex:Child', 'ex:Parent', 'ex:Root',
    ]);
  });

  it('stops at first unknown ancestor (external class boundary)', () => {
    const classMap = new Map([
      ['prov:Communication', { iri: 'prov:Communication', superclass: 'prov:ActivityInfluence' }],
      ['prov:ActivityInfluence', { iri: 'prov:ActivityInfluence', superclass: 'prov:Influence' }],
      ['prov:Influence', { iri: 'prov:Influence', superclass: 'owl:Thing' }],
      // owl:Thing intentionally NOT in classMap (external)
    ]);
    expect(buildTransitiveAncestorChain('prov:Communication', classMap)).toEqual([
      'prov:ActivityInfluence', 'prov:Influence', 'owl:Thing',
    ]);
  });

  it('detects cycles defensively (BFO is single-inheritance but external ontologies may declare cycles)', () => {
    const classMap = new Map([
      ['ex:A', { iri: 'ex:A', superclass: 'ex:B' }],
      ['ex:B', { iri: 'ex:B', superclass: 'ex:A' }], // cycle
    ]);
    const chain = buildTransitiveAncestorChain('ex:A', classMap);
    // Should terminate without infinite loop; ex:B added once, then cycle detected
    expect(chain.length).toBeLessThanOrEqual(2);
    expect(chain[0]).toBe('ex:B');
  });
});

describe('Step 7.5 Gap 1 — evaluatePlacement walks transitive ancestorChain (NA-1.1 inheritance)', () => {
  it('immediate BFO superclass still wins (no regression)', () => {
    const result = evaluatePlacement({
      iri: 'ex:Foo',
      label: 'Foo',
      superclass: 'bfo:Process',
      ancestorChain: ['bfo:Process', 'bfo:Occurrent', 'bfo:Entity'],
    });
    expect(result.placement).toBe('Process');
    expect(result.confidence).toBe(0.91);
    expect(result.justification).toContain('Explicit rdfs:subClassOf bfo:Process');
  });

  it('non-BFO immediate parent + BFO grandparent → inherited via ancestorChain walk', () => {
    const result = evaluatePlacement({
      iri: 'prov:Communication',
      label: 'Communication',
      superclass: 'prov:ActivityInfluence',
      ancestorChain: ['prov:ActivityInfluence', 'bfo:Process'],
    });
    // ancestorChain[0] = prov:ActivityInfluence (non-BFO); ancestorChain[1] = bfo:Process (BFO at depth 2)
    expect(result.placement).toBe('Process');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.confidence).toBeLessThan(0.91); // diminished from direct BFO superclass
    expect(result.justification).toContain('NA-1.1');
    expect(result.justification).toContain('inherited');
  });

  it('cascade-from-resolved: parent in resolvedPlacements → child inherits authoritatively', () => {
    const resolvedPlacements = new Map([
      ['prov:ActivityInfluence', 'Process'], // analyst already resolved this ancestor
    ]);
    const result = evaluatePlacement({
      iri: 'prov:Communication',
      label: 'Communication',
      superclass: 'prov:ActivityInfluence',
      ancestorChain: ['prov:ActivityInfluence', 'prov:Influence', 'owl:Thing'],
    }, { resolvedPlacements });
    expect(result.placement).toBe('Process');
    expect(result.confidence).toBe(0.88); // cascade-from-resolved confidence
    expect(result.justification).toContain('NA-1.1 cascade');
    expect(result.justification).toContain('resolved ancestor');
  });

  it('no BFO ancestor + no resolvedPlacements + intra-ontology chain → low-confidence Ambiguous (Q4)', () => {
    const result = evaluatePlacement({
      iri: 'prov:Foo',
      label: 'Foo',
      superclass: 'prov:Bar',
      ancestorChain: ['prov:Bar', 'prov:Baz'],
    });
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  it('confidence diminishes with ancestor distance (depth 1 > depth 4)', () => {
    const r1 = evaluatePlacement({
      iri: 'ex:Near',
      superclass: 'ex:NonBfo1',
      ancestorChain: ['ex:NonBfo1', 'bfo:Process'],
    });
    const r2 = evaluatePlacement({
      iri: 'ex:Far',
      superclass: 'ex:NonBfo1',
      ancestorChain: ['ex:NonBfo1', 'ex:NonBfo2', 'ex:NonBfo3', 'ex:NonBfo4', 'bfo:Process'],
    });
    expect(r1.confidence).toBeGreaterThan(r2.confidence);
  });

  it('ancestorChain absent → behaves identically to pre-7.5 single-level superclass check (backwards-compat)', () => {
    const before = evaluatePlacement({ iri: 'ex:Foo', superclass: 'bfo:Quality' });
    expect(before.placement).toBe('Quality');
    expect(before.confidence).toBe(0.91);
  });
});

describe('Step 7.5 Gap 1 — ingestOntology topological sort + cascade-from-resolved', () => {
  let adapter;
  let graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    const graph = createKnowledgeGraph({ id: graphId });
    adapter.saveGraph(graphId, graph);
  });

  it('PROV-O-shape 3-level chain: prov:Communication → prov:ActivityInfluence → bfo:Process; descendant inherits via cascade', () => {
    const classes = [
      // Submitted in DESCENDANT-FIRST order to verify topological sort
      // produces parents-before-children evaluation order.
      { iri: 'prov:Communication', label: 'Communication', superclass: 'prov:ActivityInfluence' },
      { iri: 'prov:ActivityInfluence', label: 'ActivityInfluence', superclass: 'bfo:Process' },
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'prov-o.owl',
      classes,
      properties: [],
    });
    expect(result.sessionId).toBeTruthy();

    // Both classes should reach a placement decision via the topological
    // sort + cascade. prov:ActivityInfluence has BFO immediate superclass
    // → high confidence; prov:Communication inherits via NA-1.1 cascade.
    const axiomGraph = adapter.getSourceAxiomGraph();
    const records = [...axiomGraph.values()].filter(r =>
      r.type === 'CandidateClass' && r.ingestedInSession === result.sessionId
    );
    expect(records).toHaveLength(2);

    const activityInfluence = records.find(r => r.sourceIRI === 'prov:ActivityInfluence');
    const communication = records.find(r => r.sourceIRI === 'prov:Communication');

    // Parent: explicit BFO superclass → high confidence
    expect(activityInfluence.placementResult).toBe('Process');
    expect(activityInfluence.placementConfidence).toBe(0.91);

    // Child: cascade or inherited-BFO-ancestor placement → also Process
    expect(communication.placementResult).toBe('Process');
    expect(communication.placementConfidence).toBeGreaterThan(0.7);

    // §A.4 acceptance refinement (Reading B): descendant rows show
    // PlacementConfirmed post-cascade, NOT PendingHumanResolution. Locks
    // the work-burden-reduction architectural payload — analyst sees all
    // 31 PROV-O classes in Phase 1 Review, descendants auto-confirm via
    // NA-1.1 cascade, PendingHumanResolution reduces to root classes only.
    expect(activityInfluence.candidateStatus).toBe('PlacementConfirmed');
    expect(communication.candidateStatus).toBe('PlacementConfirmed');
    expect(communication.normalizationStatus).not.toBe('PendingHumanResolution');
  });

  it('PROV-O 4-level descent: deep descendant inherits via ancestor chain or cascade', () => {
    const classes = [
      { iri: 'ex:Greatgrandchild', label: 'GGC', superclass: 'ex:Grandchild' },
      { iri: 'ex:Grandchild', label: 'GC', superclass: 'ex:Child' },
      { iri: 'ex:Child', label: 'C', superclass: 'ex:Parent' },
      { iri: 'ex:Parent', label: 'P', superclass: 'bfo:MaterialEntity' },
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'test.owl',
      classes,
      properties: [],
    });

    const axiomGraph = adapter.getSourceAxiomGraph();
    const records = [...axiomGraph.values()].filter(r =>
      r.type === 'CandidateClass' && r.ingestedInSession === result.sessionId
    );
    expect(records).toHaveLength(4);
    // All should reach a placement (either via cascade or inherited BFO-ancestor walk)
    for (const r of records) {
      expect(r.placementResult).toBe('MaterialEntity');
      expect(r.placementConfidence).toBeGreaterThan(0.5);
    }
  });

  it('ancestorChain stored on staging record per X9 §3.1 caller-contract', () => {
    const classes = [
      { iri: 'ex:Child', label: 'C', superclass: 'ex:Parent' },
      { iri: 'ex:Parent', label: 'P', superclass: 'bfo:Process' },
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'test.owl',
      classes,
      properties: [],
    });
    const records = [...adapter.getSourceAxiomGraph().values()].filter(r =>
      r.type === 'CandidateClass' && r.ingestedInSession === result.sessionId
    );
    const child = records.find(r => r.sourceIRI === 'ex:Child');
    expect(child.ancestorChain).toEqual(['ex:Parent', 'bfo:Process']);
  });
});

describe('Step 7.5 Gap 2 — CandidateRelation staging records generated from parsed.properties', () => {
  let adapter;
  let graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
  });

  it('properties array → CandidateRelation staging records in source axiom graph', () => {
    const properties = [
      { iri: 'prov:wasGeneratedBy', label: 'was generated by', declaredDomain: 'prov:Entity', declaredRange: 'prov:Activity' },
      { iri: 'prov:used', label: 'used', declaredDomain: 'prov:Activity', declaredRange: 'prov:Entity' },
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'prov-o.owl',
      classes: [],
      properties,
    });
    expect(result.sessionId).toBeTruthy();

    const axiomGraph = adapter.getSourceAxiomGraph();
    const relations = [...axiomGraph.values()].filter(r =>
      r.type === 'CandidateRelation' && r.ingestedInSession === result.sessionId
    );
    expect(relations).toHaveLength(2);
    const wasGenBy = relations.find(r => r.sourceIRI === 'prov:wasGeneratedBy');
    expect(wasGenBy.declaredDomain).toBe('prov:Entity');
    expect(wasGenBy.declaredRange).toBe('prov:Activity');
  });

  it('CandidateRelation records preserve declaredCharacteristics + subPropertyOf', () => {
    const properties = [
      {
        iri: 'prov:wasInformedBy',
        label: 'was informed by',
        declaredDomain: 'prov:Activity',
        declaredRange: 'prov:Activity',
        declaredCharacteristics: ['transitive'],
        subPropertyOf: 'prov:wasInfluencedBy',
      },
    ];
    const result = adapter.ingestOntology(graphId, { sourceOntology: 'p.owl', classes: [], properties });
    const records = [...adapter.getSourceAxiomGraph().values()].filter(r =>
      r.type === 'CandidateRelation' && r.ingestedInSession === result.sessionId
    );
    expect(records).toHaveLength(1);
    expect(records[0].declaredCharacteristics).toEqual(['transitive']);
    expect(records[0].subPropertyOf).toBe('prov:wasInfluencedBy');
  });

  it('relations + classes generated together; types stay distinct in axiom graph', () => {
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'mixed.owl',
      classes: [{ iri: 'ex:C1', label: 'C1', superclass: null }],
      properties: [{ iri: 'ex:p1', label: 'p1', declaredDomain: 'ex:C1', declaredRange: 'ex:C1' }],
    });
    const axiomGraph = adapter.getSourceAxiomGraph();
    const classes = [...axiomGraph.values()].filter(r =>
      r.type === 'CandidateClass' && r.ingestedInSession === result.sessionId
    );
    const relations = [...axiomGraph.values()].filter(r =>
      r.type === 'CandidateRelation' && r.ingestedInSession === result.sessionId
    );
    expect(classes).toHaveLength(1);
    expect(relations).toHaveLength(1);
  });

  it('alternate property field names (domain/range/characteristics) supported', () => {
    // Some parsers emit domain/range; others emit declaredDomain/declaredRange.
    // Adapter should accept both.
    const properties = [
      { iri: 'ex:p1', label: 'p1', domain: 'ex:A', range: 'ex:B', characteristics: ['symmetric'] },
    ];
    const result = adapter.ingestOntology(graphId, { sourceOntology: 'x.owl', classes: [], properties });
    const r = [...adapter.getSourceAxiomGraph().values()].find(rec => rec.sourceIRI === 'ex:p1');
    expect(r.declaredDomain).toBe('ex:A');
    expect(r.declaredRange).toBe('ex:B');
    expect(r.declaredCharacteristics).toEqual(['symmetric']);
  });
});

describe('Step 7.5+ — PlacementDeferred for declared in-ontology parents (no BFO grounding)', () => {
  let adapter;
  let graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
  });

  it('PROV-O-shape with NO BFO grounding: descendants Deferred (parent shown in placement), root Ambiguous', () => {
    // Mimics actual PROV-O fragment: prov:Communication → prov:ActivityInfluence → prov:Influence → owl:Thing
    // None of the chain reaches BFO. Per Reading B (§A.4 architectural payload):
    //   - prov:Influence (root, no superclass): PlacementAmbiguous (yellow)
    //   - All descendants: PlacementDeferred (blue) showing parent IRI
    const classes = [
      { iri: 'prov:Communication', label: 'Communication', superclass: 'prov:ActivityInfluence' },
      { iri: 'prov:ActivityInfluence', label: 'ActivityInfluence', superclass: 'prov:Influence' },
      { iri: 'prov:Influence', label: 'Influence', superclass: null }, // root
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'prov-o.owl',
      classes,
      properties: [],
    });

    const records = [...adapter.getSourceAxiomGraph().values()].filter(r =>
      r.type === 'CandidateClass' && r.ingestedInSession === result.sessionId
    );
    expect(records).toHaveLength(3);

    const influence = records.find(r => r.sourceIRI === 'prov:Influence');
    const activityInfluence = records.find(r => r.sourceIRI === 'prov:ActivityInfluence');
    const communication = records.find(r => r.sourceIRI === 'prov:Communication');

    // Root: no superclass, no BFO grounding → Ambiguous (yellow; needs analyst BFO)
    expect(influence.candidateStatus).toBe('PlacementAmbiguous');
    expect(influence.normalizationStatus).toBe('PendingHumanResolution');

    // Descendants: declared in-ontology parent → Deferred, placement = parent IRI
    expect(activityInfluence.candidateStatus).toBe('PlacementDeferred');
    expect(activityInfluence.placementResult).toBe('prov:Influence');
    expect(activityInfluence.placementConfidence).toBe(0.7);
    expect(activityInfluence.normalizationStatus).toBe('AwaitingCascade');

    expect(communication.candidateStatus).toBe('PlacementDeferred');
    expect(communication.placementResult).toBe('prov:ActivityInfluence');
    expect(communication.placementConfidence).toBe(0.7);
    expect(communication.normalizationStatus).toBe('AwaitingCascade');
  });

  it('phase2Blocked semantics: Deferred records do NOT block Phase 2', () => {
    // Two roots (one Ambiguous, one with BFO superclass), and descendants under each.
    const classes = [
      { iri: 'prov:Influence', label: 'Influence', superclass: null }, // root → Ambiguous
      { iri: 'prov:ActivityInfluence', label: 'ActivityInfluence', superclass: 'prov:Influence' }, // Deferred
      { iri: 'prov:Communication', label: 'Communication', superclass: 'prov:ActivityInfluence' }, // Deferred
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes, properties: [],
    });

    // Root is Ambiguous → phase2Blocked = true (only roots block).
    expect(result.pipelineState.phase2Blocked).toBe(true);
    expect(result.pipelineState.unresolvedClasses).toEqual(['prov:Influence']);
    expect(result.pipelineState.unresolvedClasses).not.toContain('prov:ActivityInfluence');
    expect(result.pipelineState.unresolvedClasses).not.toContain('prov:Communication');
  });

  it('phase2Blocked = false when only Deferred + Confirmed (no Ambiguous roots)', () => {
    // All classes have BFO grounding via root with bfo:Process superclass.
    const classes = [
      { iri: 'ex:Root', label: 'R', superclass: 'bfo:Process' },          // Confirmed via BFO
      { iri: 'ex:Mid', label: 'M', superclass: 'ex:Root' },                // Confirmed via cascade
      { iri: 'ex:Leaf', label: 'L', superclass: 'ex:Mid' },                // Confirmed via cascade
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes, properties: [],
    });
    expect(result.pipelineState.phase2Blocked).toBe(false);
  });

  it('classesDeferred session counter tracks Deferred count', () => {
    const classes = [
      { iri: 'prov:Influence', label: 'I', superclass: null },
      { iri: 'prov:ActivityInfluence', label: 'A', superclass: 'prov:Influence' },
      { iri: 'prov:Communication', label: 'C', superclass: 'prov:ActivityInfluence' },
    ];
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes, properties: [],
    });
    expect(result.session.classesDeferred).toBe(2);
    expect(result.session.classesAmbiguous).toBe(1);
    expect(result.session.classesPlaced).toBe(0);
  });
});

describe('Step 7.5+ — cascadeAnalystResolution (single-engine reactive cascade)', () => {
  let adapter;
  let graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
  });

  it('cascade after analyst root resolution: descendants flip Deferred → Confirmed with inherited BFO', () => {
    const classes = [
      { iri: 'prov:Influence', label: 'I', superclass: null },
      { iri: 'prov:ActivityInfluence', label: 'A', superclass: 'prov:Influence' },
      { iri: 'prov:Communication', label: 'C', superclass: 'prov:ActivityInfluence' },
    ];
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 'p.owl', classes, properties: [],
    });
    const adapterSessionId = ingest.sessionId;

    // Analyst resolves the root to Process.
    const cascadeResult = adapter.cascadeAnalystResolution(graphId, adapterSessionId, 'prov:Influence', 'Process');

    expect(cascadeResult.cascaded).toBe(2); // ActivityInfluence + Communication
    expect(cascadeResult.conflicts).toEqual([]);

    const records = [...adapter.getSourceAxiomGraph().values()].filter(r =>
      r.type === 'CandidateClass' && r.ingestedInSession === adapterSessionId
    );
    const activityInfluence = records.find(r => r.sourceIRI === 'prov:ActivityInfluence');
    const communication = records.find(r => r.sourceIRI === 'prov:Communication');

    // Both descendants now Confirmed with inherited BFO category.
    expect(activityInfluence.candidateStatus).toBe('PlacementConfirmed');
    expect(activityInfluence.placementResult).toBe('Process');
    expect(activityInfluence.normalizationStatus).toBe('CascadedFromAnalystOverride');
    expect(activityInfluence.placementConfidence).toBe(0.88); // cascade-from-resolved confidence

    expect(communication.candidateStatus).toBe('PlacementConfirmed');
    expect(communication.placementResult).toBe('Process');
    expect(communication.normalizationStatus).toBe('CascadedFromAnalystOverride');
  });

  it('cascade reuses evaluatePlacement single-engine path (Pass-a cascade-from-resolved)', () => {
    // Verify the cascade route is the same evaluatePlacement Pass-(a) by
    // checking the placementJustification carries the canonical NA-1.1
    // cascade phrasing emitted at placement-sandbox.js Pass (a).
    const classes = [
      { iri: 'ex:Root', label: 'R', superclass: null },
      { iri: 'ex:Child', label: 'C', superclass: 'ex:Root' },
    ];
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 't.owl', classes, properties: [],
    });
    adapter.cascadeAnalystResolution(graphId, ingest.sessionId, 'ex:Root', 'Quality');

    const records = [...adapter.getSourceAxiomGraph().values()].filter(r =>
      r.type === 'CandidateClass' && r.ingestedInSession === ingest.sessionId
    );
    const child = records.find(r => r.sourceIRI === 'ex:Child');
    // Canonical Pass-(a) phrasing confirms single-engine reuse.
    expect(child.placementJustification).toContain('NA-1.1 cascade');
    expect(child.placementJustification).toContain('resolved ancestor');
  });

  it('session.classesDeferred decrements as descendants cascade-promote', () => {
    const classes = [
      { iri: 'ex:Root', label: 'R', superclass: null },
      { iri: 'ex:Child1', label: 'C1', superclass: 'ex:Root' },
      { iri: 'ex:Child2', label: 'C2', superclass: 'ex:Root' },
    ];
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 't.owl', classes, properties: [],
    });
    expect(ingest.session.classesDeferred).toBe(2);
    adapter.cascadeAnalystResolution(graphId, ingest.sessionId, 'ex:Root', 'MaterialEntity');
    expect(ingest.session.classesDeferred).toBe(0);
    expect(ingest.session.classesPlaced).toBe(2);
  });

  it('cascade is no-op for unrelated session ID', () => {
    const ingest = adapter.ingestOntology(graphId, {
      sourceOntology: 't.owl',
      classes: [
        { iri: 'ex:Root', label: 'R', superclass: null },
        { iri: 'ex:Child', label: 'C', superclass: 'ex:Root' },
      ],
      properties: [],
    });
    const result = adapter.cascadeAnalystResolution(graphId, 'fandaws:session/nonexistent', 'ex:Root', 'Process');
    expect(result.cascaded).toBe(0);
    // Original session unaffected
    const child = [...adapter.getSourceAxiomGraph().values()].find(r =>
      r.sourceIRI === 'ex:Child' && r.ingestedInSession === ingest.sessionId
    );
    expect(child.candidateStatus).toBe('PlacementDeferred');
  });

  // Multi-inheritance contradiction harness — forward-flag (skip-if-no-shape).
  // PROV-O is single-inheritance throughout, so this test covers a
  // synthetic shape representing future multi-parent ontologies. Skipping
  // is the correct behavior if no PROV-O fixture surfaces this; explicitly
  // running it documents the cascade's contradiction-aware semantics per
  // bundle v6 SWC discipline + Appendix A.2.6.
  it.skip('multi-inheritance contradiction harness: cascade surfaces conflict, does not silently overwrite', () => {
    // Hypothetical shape: ex:MultiChild has TWO declared parents (one
    // already resolved to MaterialEntity, second now resolved to Process).
    // BFO disjointness: MaterialEntity and Process are disjoint
    // (Continuant vs Occurrent). The cascade should surface this in
    // cascadeResult.conflicts rather than silently overwriting.
    //
    // NOTE: current parser shape supports single superclass field. To
    // exercise multi-inheritance, the staging record would need a
    // multiParents array. This harness is parked until parser supports
    // owl:intersectionOf / multi-superclass extraction.
    expect(true).toBe(true);
  });
});

describe('Step 7.5 — backwards-compat preservation', () => {
  let adapter;
  let graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
  });

  it('ingestOntology with classes only (no properties) still works; relationStagingIds = 0', () => {
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'classes-only.owl',
      classes: [{ iri: 'ex:C', label: 'C', superclass: 'bfo:Quality' }],
    });
    expect(result.sessionId).toBeTruthy();
    const relations = [...adapter.getSourceAxiomGraph().values()].filter(r =>
      r.type === 'CandidateRelation' && r.ingestedInSession === result.sessionId
    );
    expect(relations).toHaveLength(0);
  });

  it('classes without superclass field still place via label/property heuristics', () => {
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'flat.owl',
      classes: [
        { iri: 'ex:Process', label: 'Process activity' },
      ],
    });
    expect(result.sessionId).toBeTruthy();
    // Classes without superclass should not crash; ancestorChain = empty
    const r = [...adapter.getSourceAxiomGraph().values()].find(rec =>
      rec.type === 'CandidateClass' && rec.sourceIRI === 'ex:Process'
    );
    expect(r.ancestorChain).toEqual([]);
  });

  it('stopAfterStaging short-circuits as before (returns staged + stagedRelations counts)', () => {
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'test.owl',
      classes: [{ iri: 'ex:C', label: 'C' }],
      properties: [{ iri: 'ex:p', label: 'p' }],
      stopAfterStaging: true,
    });
    expect(result.stopped).toBe(true);
    expect(result.staged).toBe(1);
    expect(result.stagedRelations).toBe(1);
  });
});
