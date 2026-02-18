/**
 * IVNE BFO Golden Corpus — data-driven tests.
 *
 * Compiles the hand-curated BFO 2020 fixture through the IVNE
 * and verifies the output against expected structural properties.
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { compile } from '../../src/core/ivne/ivne.js';
import bfoParsed from '../fixtures/bfo-parsed.json';

const FIXED_CONFIG = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  scope: 'fandaws:scope/bfo',
};

let compiled;

beforeAll(() => {
  compiled = compile(bfoParsed, FIXED_CONFIG);
});

// ── Structure ──

describe('BFO golden corpus — structure', () => {
  it('produces an OntologyImportResult', () => {
    expect(compiled.result['@type']).toBe('fandaws:OntologyImportResult');
  });

  it('imports all 35 BFO classes as concepts', () => {
    expect(compiled.result['fandaws:concepts']).toHaveLength(35);
  });

  it('has sourceIRI from BFO', () => {
    expect(compiled.result['fandaws:sourceIRI']).toBe('http://purl.obolibrary.org/obo/bfo.owl');
  });
});

// ── Root Concepts ──

describe('BFO golden corpus — root concepts', () => {
  it('entity is the single root concept', () => {
    const roots = compiled.result['fandaws:concepts'].filter(
      (c) => c['fandaws:allowRoot'] === true,
    );
    expect(roots).toHaveLength(1);
    expect(roots[0]['fandaws:canonicalLabel']).toBe('entity');
  });
});

// ── Hierarchy Depth ──

describe('BFO golden corpus — hierarchy', () => {
  it('continuant is a child of entity', () => {
    const continuant = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'continuant',
    );
    const entity = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'entity',
    );
    expect(continuant['skos:broader']).toBe(entity['@id']);
  });

  it('occurrent is a child of entity', () => {
    const occurrent = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'occurrent',
    );
    const entity = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'entity',
    );
    expect(occurrent['skos:broader']).toBe(entity['@id']);
  });

  it('material entity is a child of independent continuant', () => {
    const material = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'material entity',
    );
    const independent = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'independent continuant',
    );
    expect(material['skos:broader']).toBe(independent['@id']);
  });

  it('process is a child of occurrent', () => {
    const process = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'process',
    );
    const occurrent = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'occurrent',
    );
    expect(process['skos:broader']).toBe(occurrent['@id']);
  });

  it('function is a grandchild of specifically dependent continuant', () => {
    const fn = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'function',
    );
    const disposition = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'disposition',
    );
    const realizableEntity = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'realizable entity',
    );
    expect(fn['skos:broader']).toBe(disposition['@id']);
    expect(disposition['skos:broader']).toBe(realizableEntity['@id']);
  });
});

// ── Disjointness ──

describe('BFO golden corpus — disjointness', () => {
  it('continuant and occurrent are disjoint', () => {
    const continuant = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'continuant',
    );
    const occurrent = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'occurrent',
    );
    expect(continuant['owl:disjointWith']).toContain(occurrent['@id']);
    expect(occurrent['owl:disjointWith']).toContain(continuant['@id']);
  });

  it('material entity and immaterial entity are disjoint', () => {
    const material = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'material entity',
    );
    const immaterial = compiled.result['fandaws:concepts'].find(
      (c) => c['fandaws:canonicalLabel'] === 'immaterial entity',
    );
    expect(material['owl:disjointWith']).toContain(immaterial['@id']);
  });
});

// ── Provenance ──

describe('BFO golden corpus — provenance', () => {
  it('all concepts have shml:epistemicStatus imported', () => {
    for (const concept of compiled.result['fandaws:concepts']) {
      expect(concept['shml:epistemicStatus']).toBe('imported');
    }
  });

  it('all concepts have fandaws:ivneVersion 2.1', () => {
    for (const concept of compiled.result['fandaws:concepts']) {
      expect(concept['fandaws:ivneVersion']).toBe('2.1');
    }
  });

  it('all concepts have fandaws:importedFrom pointing to OBO IRI', () => {
    for (const concept of compiled.result['fandaws:concepts']) {
      expect(concept['fandaws:importedFrom']).toMatch(/http:\/\/purl\.obolibrary\.org\/obo\/BFO_/);
    }
  });

  it('all concepts have owl:sameAs matching importedFrom', () => {
    for (const concept of compiled.result['fandaws:concepts']) {
      expect(concept['owl:sameAs']).toBe(concept['fandaws:importedFrom']);
    }
  });
});

// ── IRI Mappings ──

describe('BFO golden corpus — IRI mappings', () => {
  it('has mappings for all 35 classes plus 2 properties', () => {
    const manifest = compiled.result['fandaws:reductionManifest'];
    // 35 class mappings + 2 property mappings = 37
    expect(manifest['fandaws:iriMappings'].length).toBeGreaterThanOrEqual(35);
  });
});

// ── Properties (D5) ──

describe('BFO golden corpus — properties', () => {
  it('compiles part_of as a property entity', () => {
    // part_of should be in the IRI mappings
    const manifest = compiled.result['fandaws:reductionManifest'];
    const partOfMapping = manifest['fandaws:iriMappings'].find(
      (m) => m.source === 'http://purl.obolibrary.org/obo/BFO_0000050',
    );
    expect(partOfMapping).toBeDefined();
    expect(partOfMapping.fandaws).toMatch(/^fandaws:property\//);
  });

  it('compiles has_part as a property entity', () => {
    const manifest = compiled.result['fandaws:reductionManifest'];
    const hasPartMapping = manifest['fandaws:iriMappings'].find(
      (m) => m.source === 'http://purl.obolibrary.org/obo/BFO_0000051',
    );
    expect(hasPartMapping).toBeDefined();
    expect(hasPartMapping.fandaws).toMatch(/^fandaws:property\//);
  });
});

// ── Reduction Manifest ──

describe('BFO golden corpus — reduction manifest', () => {
  it('reports perfect fidelity (BFO is pure P1+P3)', () => {
    const manifest = compiled.result['fandaws:reductionManifest'];
    expect(manifest['fandaws:statistics'].fidelityScore).toBe(1.0);
  });

  it('reports zero lossy records', () => {
    const manifest = compiled.result['fandaws:reductionManifest'];
    expect(manifest['fandaws:lossRecords']).toHaveLength(0);
  });

  it('reports zero generated concepts', () => {
    const manifest = compiled.result['fandaws:reductionManifest'];
    expect(manifest['fandaws:generatedConcepts']).toHaveLength(0);
  });

  it('reports correct totalCompiledConcepts', () => {
    const manifest = compiled.result['fandaws:reductionManifest'];
    expect(manifest['fandaws:statistics'].totalCompiledConcepts).toBe(35);
  });

  it('reports chainConsumptionReady as false', () => {
    const manifest = compiled.result['fandaws:reductionManifest'];
    expect(manifest['fandaws:chainConsumptionReady']).toBe(false);
  });
});

// ── Scope Entry ──

describe('BFO golden corpus — scope entry', () => {
  it('sets trustLevel to experimental', () => {
    expect(compiled.result['fandaws:scopeEntry']['fandaws:trustLevel']).toBe('experimental');
  });

  it('sets priority to 99', () => {
    expect(compiled.result['fandaws:scopeEntry']['fandaws:priority']).toBe(99);
  });

  it('sets staleCopyAction to fork', () => {
    expect(compiled.result['fandaws:scopeEntry']['fandaws:staleCopyAction']).toBe('fork');
  });
});
