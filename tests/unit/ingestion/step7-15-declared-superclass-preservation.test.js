/**
 * X9 Step 7.15 (2026-04-29) — Preserve declared superclass IRI through
 * canonical promotion.
 *
 * User report: ingested Geospatial Region (subClassOf obo:BFO_0000029 /
 * Site) but the canonical record showed rdfs:subClassOf →
 * IndependentContinuant. The Phase 1 placement bucket
 * (IndependentContinuant) was overwriting the leaf-class declared parent
 * (Site, BFO_0000029). Same applied to many other CCO classes —
 * BFO_0000026 (OneDimensionalSpatialRegion) collapsed to SpatialRegion,
 * BFO_0000028 (ThreeDimensionalSpatialRegion) collapsed to SpatialRegion,
 * etc.
 *
 * Fix: two-pass lookup in _promoteCandidate.
 *   Pass 1 (PRIMARY): declared-superclass IRI matches an existing graph
 *     concept's owl:equivalentClass → use that concept as broaderIri.
 *     BFO infrastructure carries obo:BFO_NNNNNNN in owl:equivalentClass;
 *     in-session CCO parents carry cco:ont* the same way.
 *   Pass 2 (FALLBACK): placement-bucket label match (legacy behavior).
 *     Fires only when declared parent doesn't resolve to a graph concept.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryStateAdapter } from '../../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../../src/types/index.js';

const GRAPH_ID = 'fandaws:graph/test';

function adapter() {
  const a = new InMemoryStateAdapter();
  a.saveGraph(GRAPH_ID, createKnowledgeGraph({ id: GRAPH_ID }));
  return a;
}

// Pre-load BFO infrastructure concepts mimicking what ensureBfoIngestion
// produces — specifically the leaf classes the test cares about.
function preloadBfoConcepts(a) {
  const graph = a._graphs.get(GRAPH_ID);
  graph['fandaws:concepts'].push(
    {
      '@id': 'fandaws:class/uuid-ic/independent-continuant',
      '@type': ['owl:Class', 'skos:Concept'],
      'skos:prefLabel': 'independent continuant',
      'rdfs:label': 'independent continuant',
      'owl:equivalentClass': ['http://purl.obolibrary.org/obo/BFO_0000004'],
      'fandaws:isImported': true,
    },
    {
      '@id': 'fandaws:class/uuid-site/site',
      '@type': ['owl:Class', 'skos:Concept'],
      'skos:prefLabel': 'site',
      'rdfs:label': 'site',
      'owl:equivalentClass': ['http://purl.obolibrary.org/obo/BFO_0000029'],
      'fandaws:isImported': true,
    },
    {
      '@id': 'fandaws:class/uuid-sr/spatial-region',
      '@type': ['owl:Class', 'skos:Concept'],
      'skos:prefLabel': 'spatial region',
      'rdfs:label': 'spatial region',
      'owl:equivalentClass': ['http://purl.obolibrary.org/obo/BFO_0000006'],
      'fandaws:isImported': true,
    },
    {
      '@id': 'fandaws:class/uuid-1dsr/one-dimensional-spatial-region',
      '@type': ['owl:Class', 'skos:Concept'],
      'skos:prefLabel': 'one-dimensional spatial region',
      'rdfs:label': 'one-dimensional spatial region',
      'owl:equivalentClass': ['http://purl.obolibrary.org/obo/BFO_0000026'],
      'fandaws:isImported': true,
    },
  );
  a._graphs.set(GRAPH_ID, graph);
}

describe('Step 7.15 — declared superclass IRI preserved through promotion', () => {
  let a;
  beforeEach(() => {
    a = adapter();
    preloadBfoConcepts(a);
  });

  it('Geospatial Region (subClassOf BFO_0000029 / Site) preserves Site as parent', () => {
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'cco:ont00000472',
      sourceLabel: 'Geospatial Region',
      sourceOntology: 'GeospatialOntology.ttl',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000029', // Site (declared)
      placementResult: 'IndependentContinuant', // Phase 1 bucket (NOT used as parent)
      placementConfidence: 0.91,
    }, 'fandaws:session/test');

    const graph = a._graphs.get(GRAPH_ID);
    const geoRegion = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Geospatial Region');
    expect(geoRegion).toBeDefined();
    expect(geoRegion['skos:broader']).toBe('fandaws:class/uuid-site/site');
    expect(geoRegion['rdfs:subClassOf']).toContain('fandaws:class/uuid-site/site');
    // CRITICAL: NOT pointing at independent-continuant (the placement bucket).
    expect(geoRegion['rdfs:subClassOf']).not.toContain('fandaws:class/uuid-ic/independent-continuant');
  });

  it('Object Track (subClassOf BFO_0000026 / OneDimensionalSpatialRegion) preserves the leaf, not SpatialRegion', () => {
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'cco:ont00000205',
      sourceLabel: 'Object Track',
      sourceOntology: 'GeospatialOntology.ttl',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000026',
      placementResult: 'SpatialRegion',
      placementConfidence: 0.91,
    }, 'fandaws:session/test');

    const graph = a._graphs.get(GRAPH_ID);
    const obj = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Object Track');
    expect(obj['skos:broader']).toBe('fandaws:class/uuid-1dsr/one-dimensional-spatial-region');
    expect(obj['rdfs:subClassOf']).not.toContain('fandaws:class/uuid-sr/spatial-region');
  });

  it('in-session CCO parent preserved (declared parent already in canonical graph)', () => {
    // Step 1: promote a parent CCO class.
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'cco:ont00000472',
      sourceLabel: 'Geospatial Region',
      sourceOntology: 'GeospatialOntology.ttl',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000029',
      placementResult: 'IndependentContinuant',
      placementConfidence: 0.91,
    }, 'fandaws:session/test');

    // Step 2: promote a child CCO class whose superclass is the parent CCO IRI.
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'cco:ont00000213',
      sourceLabel: 'Subcontinent',
      sourceOntology: 'GeospatialOntology.ttl',
      superclass: 'cco:ont00000472', // Geospatial Region (in-session parent)
      placementResult: 'IndependentContinuant',
      placementConfidence: 0.88,
    }, 'fandaws:session/test');

    const graph = a._graphs.get(GRAPH_ID);
    const parentCanonical = graph['fandaws:concepts'].find(c =>
      c['owl:equivalentClass']?.includes('cco:ont00000472')
    );
    const child = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Subcontinent');
    expect(parentCanonical).toBeDefined();
    expect(child['skos:broader']).toBe(parentCanonical['@id']);
    expect(child['rdfs:subClassOf']).toContain(parentCanonical['@id']);
  });

  it('placement-bucket fallback fires when declared superclass does NOT resolve in graph', () => {
    // Declared superclass points at an unloaded/external IRI.
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'ex:Floater',
      sourceLabel: 'Floater',
      sourceOntology: 'test.ttl',
      superclass: 'http://example.org/UnloadedParent',
      placementResult: 'IndependentContinuant',
      placementConfidence: 0.5,
    }, 'fandaws:session/test');

    const graph = a._graphs.get(GRAPH_ID);
    const floater = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Floater');
    // Fallback to placement bucket — IndependentContinuant.
    expect(floater['skos:broader']).toBe('fandaws:class/uuid-ic/independent-continuant');
  });

  it('no superclass + placement-bucket falls back correctly', () => {
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'ex:Rooted',
      sourceLabel: 'Rooted',
      sourceOntology: 'test.ttl',
      superclass: null,
      placementResult: 'SpatialRegion',
      placementConfidence: 0.91,
    }, 'fandaws:session/test');

    const graph = a._graphs.get(GRAPH_ID);
    const rooted = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Rooted');
    expect(rooted['skos:broader']).toBe('fandaws:class/uuid-sr/spatial-region');
  });

  it('declared superclass preferred even when placement bucket would point at a different graph concept', () => {
    // Critical: the bug was that placement-bucket was being used INSTEAD
    // of declared. This test pins down that declared wins when both
    // would resolve.
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'cco:ont00000017',
      sourceLabel: 'Minor Axis',
      sourceOntology: 'GeospatialOntology.ttl',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000026', // OneDimensionalSpatialRegion (leaf)
      placementResult: 'SpatialRegion', // The Phase 1 BUCKET label
      placementConfidence: 0.91,
    }, 'fandaws:session/test');

    const graph = a._graphs.get(GRAPH_ID);
    const minorAxis = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Minor Axis');
    // Declared parent wins — points at the leaf, not the bucket.
    expect(minorAxis['skos:broader']).toBe('fandaws:class/uuid-1dsr/one-dimensional-spatial-region');
    expect(minorAxis['rdfs:subClassOf'][0]).toBe('fandaws:class/uuid-1dsr/one-dimensional-spatial-region');
  });

  it('owl:equivalentClass on canonical concept preserves the declared source IRI', () => {
    // Regression: existing behavior. owl:equivalentClass should still
    // point to the declared source IRI (e.g., cco:ont00000472).
    a._promoteCandidate(GRAPH_ID, {
      sourceIRI: 'cco:ont00000472',
      sourceLabel: 'Geospatial Region',
      sourceOntology: 'GeospatialOntology.ttl',
      superclass: 'http://purl.obolibrary.org/obo/BFO_0000029',
      placementResult: 'IndependentContinuant',
      placementConfidence: 0.91,
    }, 'fandaws:session/test');

    const graph = a._graphs.get(GRAPH_ID);
    const geoRegion = graph['fandaws:concepts'].find(c => c['rdfs:label'] === 'Geospatial Region');
    expect(geoRegion['owl:equivalentClass']).toContain('cco:ont00000472');
  });
});
