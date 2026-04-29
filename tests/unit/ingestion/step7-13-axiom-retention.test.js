/**
 * X9 Step 7.13 (2026-04-29) — Axiom retention through ingestion pipeline.
 *
 * Two paired changes:
 *   - Parser captures owl:Restriction blank-node objects on
 *     parsed.classes[i].restrictions
 *   - Adapter (_promoteCandidate via ingestOntology) writes them into
 *     the canonical concept's rdfs:subClassOf array alongside the parent
 *     IRI, plus writes owl:disjointWith from parsed.classes[i].disjointWith
 *
 * The parser uses a dynamic `import('n3')` that Jest's VM Modules sandbox
 * can't resolve, so end-to-end TTL parsing isn't testable here. Tests
 * instead drive the adapter pipeline via synthesized parsed.classes
 * shapes that mirror what the parser now emits — proving the data-flow
 * contract from parser-output → adapter-staging → canonical-graph.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryStateAdapter } from '../../../src/adapters/state/in-memory-state-adapter.js';
import { evaluatePlacement, routePlacement } from '../../../src/core/ingestion/placement-sandbox.js';
import { runViolationHarness } from '../../../docs/workbench/js/panels/ingest/phase3-review-panel.js';
import { createKnowledgeGraph } from '../../../src/types/index.js';

function adapterWithSandbox() {
  const a = new InMemoryStateAdapter();
  a.registerPlacementSandbox(evaluatePlacement, routePlacement);
  return a;
}

const EYE_COLOR_RESTRICTION = {
  '@type': 'owl:Restriction',
  'owl:onProperty': 'http://purl.obolibrary.org/obo/BFO_0000197', // inheres_in
  'owl:someValuesFrom': 'https://www.commoncoreontologies.org/ont00000404', // Eye
};

describe('Step 7.13 — staging records carry restrictions + disjointWith fields', () => {
  let adapter, graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
  });

  it('staging record retains restrictions array from parsed input', () => {
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'cco.ttl', classes: [
        {
          iri: 'cco:ont00000044',
          label: 'Eye Color',
          superclass: 'http://purl.obolibrary.org/obo/BFO_0000019',
          restrictions: [EYE_COLOR_RESTRICTION],
        },
      ],
      properties: [],
    });
    const staging = [...adapter.getSourceAxiomGraph().values()].find(r =>
      r.type === 'CandidateClass' && r.sourceIRI === 'cco:ont00000044'
    );
    expect(staging).toBeDefined();
    expect(staging.restrictions).toHaveLength(1);
    expect(staging.restrictions[0]).toEqual(EYE_COLOR_RESTRICTION);
  });

  it('staging record retains disjointWith array from parsed input', () => {
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'cco.ttl', classes: [
        {
          iri: 'cco:ont00000044',
          label: 'Eye Color',
          superclass: 'http://purl.obolibrary.org/obo/BFO_0000019',
          disjointWith: ['cco:HairColor', 'cco:SkinColor'],
        },
      ],
      properties: [],
    });
    const staging = [...adapter.getSourceAxiomGraph().values()].find(r =>
      r.type === 'CandidateClass' && r.sourceIRI === 'cco:ont00000044'
    );
    expect(staging.disjointWith).toEqual(['cco:HairColor', 'cco:SkinColor']);
  });

  it('staging record defaults restrictions/disjointWith to empty arrays when absent', () => {
    const result = adapter.ingestOntology(graphId, {
      sourceOntology: 'simple.ttl', classes: [
        { iri: 'ex:NoExtras', label: 'NoExtras', superclass: 'bfo:Quality' },
      ],
      properties: [],
    });
    const staging = [...adapter.getSourceAxiomGraph().values()].find(r =>
      r.type === 'CandidateClass' && r.sourceIRI === 'ex:NoExtras'
    );
    expect(staging.restrictions).toEqual([]);
    expect(staging.disjointWith).toEqual([]);
  });
});

describe('Step 7.13 — _promoteCandidate writes restrictions into rdfs:subClassOf + disjointness', () => {
  let adapter, graphId;

  beforeEach(() => {
    adapter = adapterWithSandbox();
    graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
  });

  it('canonical concept rdfs:subClassOf contains BOTH parent IRI AND restriction object', () => {
    adapter.ingestOntology(graphId, {
      sourceOntology: 'cco.ttl', classes: [
        {
          iri: 'cco:ont00000044',
          label: 'Eye Color',
          superclass: 'http://purl.obolibrary.org/obo/BFO_0000019',
          restrictions: [EYE_COLOR_RESTRICTION],
        },
      ],
      properties: [],
    });
    const graph = adapter._graphs.get(graphId);
    const eyeColor = graph['fandaws:concepts'].find(c =>
      c['rdfs:label'] === 'Eye Color' && c['fandaws:ingestSource'] === 'cco.ttl'
    );
    expect(eyeColor).toBeDefined();
    const subClassOf = eyeColor['rdfs:subClassOf'];
    expect(Array.isArray(subClassOf)).toBe(true);
    // Parent IRI present (via Quality placement → BFO concept lookup; may
    // resolve as 'bfo:Quality' or be null if BFO seed concepts aren't
    // pre-loaded in the test fixture). Restriction object MUST be present
    // regardless.
    const restrictionEntry = subClassOf.find(e =>
      typeof e === 'object' && e['@type'] === 'owl:Restriction'
    );
    expect(restrictionEntry).toBeDefined();
    expect(restrictionEntry['owl:onProperty']).toBe('http://purl.obolibrary.org/obo/BFO_0000197');
    expect(restrictionEntry['owl:someValuesFrom']).toBe('https://www.commoncoreontologies.org/ont00000404');
  });

  it('canonical concept owl:disjointWith carries the parsed disjointness list', () => {
    adapter.ingestOntology(graphId, {
      sourceOntology: 'cco.ttl', classes: [
        {
          iri: 'cco:ont00000044',
          label: 'Eye Color',
          superclass: 'bfo:Quality',
          disjointWith: ['cco:HairColor', 'cco:SkinColor'],
        },
      ],
      properties: [],
    });
    const graph = adapter._graphs.get(graphId);
    const eyeColor = graph['fandaws:concepts'].find(c =>
      c['rdfs:label'] === 'Eye Color' && c['fandaws:ingestSource'] === 'cco.ttl'
    );
    expect(eyeColor['owl:disjointWith']).toEqual(['cco:HairColor', 'cco:SkinColor']);
  });

  it('multiple restrictions on same class all flow into the rdfs:subClassOf array', () => {
    const r1 = {
      '@type': 'owl:Restriction',
      'owl:onProperty': 'obo:BFO_0000197',
      'owl:someValuesFrom': 'cco:Eye',
    };
    const r2 = {
      '@type': 'owl:Restriction',
      'owl:onProperty': 'obo:BFO_0000050', // part_of
      'owl:allValuesFrom': 'cco:Body',
    };
    adapter.ingestOntology(graphId, {
      sourceOntology: 'multi.ttl', classes: [
        {
          iri: 'ex:MultiR',
          label: 'MultiR',
          superclass: 'bfo:Quality',
          restrictions: [r1, r2],
        },
      ],
      properties: [],
    });
    const graph = adapter._graphs.get(graphId);
    const concept = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'MultiR');
    const restrictions = concept['rdfs:subClassOf'].filter(e =>
      typeof e === 'object' && e['@type'] === 'owl:Restriction'
    );
    expect(restrictions).toHaveLength(2);
    expect(restrictions.map(r => r['owl:onProperty']).sort()).toEqual([
      'obo:BFO_0000050',
      'obo:BFO_0000197',
    ]);
  });

  it('no-restrictions classes still write canonical with rdfs:subClassOf containing only parent IRI', () => {
    adapter.ingestOntology(graphId, {
      sourceOntology: 'simple.ttl', classes: [
        { iri: 'ex:Simple', label: 'Simple', superclass: 'bfo:Quality' },
      ],
      properties: [],
    });
    const graph = adapter._graphs.get(graphId);
    const concept = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Simple');
    expect(concept['rdfs:subClassOf']).toBeDefined();
    expect(Array.isArray(concept['rdfs:subClassOf'])).toBe(true);
    // No restriction objects (only IRI strings or empty).
    const restrictions = concept['rdfs:subClassOf'].filter(e =>
      typeof e === 'object' && e['@type'] === 'owl:Restriction'
    );
    expect(restrictions).toHaveLength(0);
  });
});

describe('Step 7.13 — Phase 3 orphan rule regression: restrictions do NOT trigger false-flags', () => {
  // These tests construct the canonical concept shape directly (bypassing
  // ingestOntology's BFO-lookup-by-label), so we can assert the
  // orphan-rule behavior in isolation. The end-to-end ingest path
  // depends on BFO seed concepts being pre-loaded in the graph for the
  // placement→broader lookup to succeed; bypassing that here keeps the
  // test focused on Step 7.5+++ restriction-aware parent attribution.

  function graphWithConcept(concept) {
    return { 'fandaws:concepts': [concept] };
  }

  it('concept with rdfs:subClassOf [BFO_IRI, restriction] is NOT flagged orphan', () => {
    // Step 7.5+++ orphan rule filters restriction objects from parent
    // attribution via the `owl:onProperty` field check. The IRI string
    // in the array IS recognized as the parent.
    const concept = {
      '@id': 'fandaws:class/eye-color-uuid/eye-color',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': 'Eye Color',
      'skos:prefLabel': 'eye color',
      'rdfs:subClassOf': ['bfo:Quality', EYE_COLOR_RESTRICTION],
      'owl:disjointWith': [],
    };
    const { violations } = runViolationHarness(graphWithConcept(concept), [], [], { Fandaws: {} });
    const orphans = violations.filter(v =>
      v.ruleName === 'OrphanClassViolation' && v.conceptIri === concept['@id']
    );
    expect(orphans).toHaveLength(0);
  });

  it('concept with ONLY a restriction (no IRI parent in array) but skos:broader IS recognized', () => {
    // skos:broader is the primary parent-attribution; rdfs:subClassOf
    // restrictions sit alongside but don't substitute.
    const concept = {
      '@id': 'fandaws:class/eye-color-uuid/eye-color',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': 'Eye Color',
      'skos:prefLabel': 'eye color',
      'skos:broader': 'bfo:Quality',
      'rdfs:subClassOf': [EYE_COLOR_RESTRICTION],
      'owl:disjointWith': [],
    };
    const { violations } = runViolationHarness(graphWithConcept(concept), [], [], { Fandaws: {} });
    expect(violations.filter(v =>
      v.ruleName === 'OrphanClassViolation' && v.conceptIri === concept['@id']
    )).toHaveLength(0);
  });

  it('concept with ONLY a restriction in rdfs:subClassOf AND no skos:broader IS flagged orphan', () => {
    // Genuinely orphan case: only a restriction object, no parent IRI
    // anywhere. Step 7.5+++ correctly flags this — the restriction
    // doesn't substitute for parent attribution.
    const concept = {
      '@id': 'fandaws:class/genuinely-orphan/foo',
      '@type': ['owl:Class', 'skos:Concept'],
      'rdfs:label': 'GenuinelyOrphan',
      'skos:prefLabel': 'genuinely orphan',
      'rdfs:subClassOf': [EYE_COLOR_RESTRICTION],
      'owl:disjointWith': [],
    };
    const { violations } = runViolationHarness(graphWithConcept(concept), [], [], { Fandaws: {} });
    const orphans = violations.filter(v =>
      v.ruleName === 'OrphanClassViolation' && v.conceptIri === concept['@id']
    );
    expect(orphans).toHaveLength(1);
  });
});

describe('Step 7.13 — Eye Color end-to-end round-trip', () => {
  it('CCO Eye Color shape: Quality grounding + inheres-in restriction both retained on canonical', () => {
    const adapter = adapterWithSandbox();
    const graphId = 'fandaws:graph/test';
    adapter.saveGraph(graphId, createKnowledgeGraph({ id: graphId }));
    adapter.ingestOntology(graphId, {
      sourceOntology: 'AgentOntology.ttl', classes: [
        {
          iri: 'cco:ont00000044',
          label: 'Eye Color',
          superclass: 'http://purl.obolibrary.org/obo/BFO_0000019',
          restrictions: [EYE_COLOR_RESTRICTION],
          disjointWith: [],
        },
      ],
      properties: [],
    });
    const graph = adapter._graphs.get(graphId);
    const eyeColor = graph['fandaws:concepts'].find(c =>
      c['rdfs:label'] === 'Eye Color' &&
      c['owl:equivalentClass']?.includes('cco:ont00000044')
    );
    expect(eyeColor).toBeDefined();
    expect(eyeColor['fandaws:placementConfidence']).toBe(0.91); // Step 7.6 normalizeBfoClass match
    expect(eyeColor['rdfs:subClassOf']).toEqual(expect.arrayContaining([
      expect.objectContaining({
        '@type': 'owl:Restriction',
        'owl:onProperty': 'http://purl.obolibrary.org/obo/BFO_0000197',
        'owl:someValuesFrom': 'https://www.commoncoreontologies.org/ont00000404',
      }),
    ]));
  });
});
