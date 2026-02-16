/**
 * ExportEngine Orchestrator — unit tests.
 *
 * Covers: format dispatch, error handling, read-only guarantee,
 * pure function behavior, edge cases.
 */

import { describe, it, expect } from '@jest/globals';
import { exportGraph } from '../../src/core/export-engine/export-engine.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

// ── Helpers ──

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeConcept(id, label, prefLabel) {
  return createConcept({ id, label, prefLabel });
}

// ── Tests ──

describe('ExportEngine', () => {
  describe('Format dispatch', () => {
    it('format "skos" delegates to SKOS exporter', () => {
      const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog', 'dog')]);
      const result = exportGraph(graph, { format: 'skos' });
      expect(result).toContain('skos:Concept');
      expect(result).not.toContain('owl:Class');
    });

    it('format "owl" delegates to OWL exporter', () => {
      const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog', 'dog')]);
      const result = exportGraph(graph, { format: 'owl' });
      expect(result).toContain('owl:Class');
      expect(result).not.toContain('skos:Concept');
    });

    it('format "rdf" delegates to RDF/XML exporter', () => {
      const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog', 'dog')]);
      const result = exportGraph(graph, { format: 'rdf' });
      expect(result).toContain('<?xml');
      expect(result).toContain('<rdf:RDF');
    });

    it('format "turtle" delegates to Turtle exporter', () => {
      const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog', 'dog')]);
      const result = exportGraph(graph, { format: 'turtle' });
      expect(result).toContain('@prefix');
      expect(result).toContain('owl:Class');
      expect(result).toContain('skos:Concept');
    });
  });

  describe('Error handling', () => {
    it('unknown format throws with supported formats list', () => {
      const graph = makeGraph([]);
      expect(() => exportGraph(graph, { format: 'json' })).toThrow(
        /unknown format.*json.*Supported formats/i,
      );
    });

    it('null format throws with descriptive error', () => {
      const graph = makeGraph([]);
      expect(() => exportGraph(graph, { format: null })).toThrow(/format is required/i);
    });

    it('missing format throws with descriptive error', () => {
      const graph = makeGraph([]);
      expect(() => exportGraph(graph, {})).toThrow(/format is required/i);
    });

    it('missing graph throws with descriptive error', () => {
      expect(() => exportGraph(null, { format: 'skos' })).toThrow(/graph is required/i);
    });

    it('invalid graph (no concepts) throws', () => {
      expect(() => exportGraph({ '@type': 'fandaws:KnowledgeGraph' }, { format: 'skos' })).toThrow(
        /fandaws:concepts/i,
      );
    });
  });

  describe('Read-only guarantee', () => {
    it('does not mutate the input graph', () => {
      const dog = makeConcept('fandaws:concept/dog', 'Dog', 'dog');
      const graph = makeGraph([dog]);
      const graphBefore = JSON.stringify(graph);

      exportGraph(graph, { format: 'skos' });
      exportGraph(graph, { format: 'owl' });
      exportGraph(graph, { format: 'turtle' });
      exportGraph(graph, { format: 'rdf' });

      expect(JSON.stringify(graph)).toBe(graphBefore);
    });
  });

  describe('Pure function', () => {
    it('same inputs produce identical output (determinism)', () => {
      const graph = makeGraph([makeConcept('fandaws:concept/dog', 'Dog', 'dog')]);
      const r1 = exportGraph(graph, { format: 'turtle' });
      const r2 = exportGraph(graph, { format: 'turtle' });
      expect(r1).toBe(r2);
    });

    it('handles graph with 0 concepts gracefully', () => {
      const graph = makeGraph([]);
      const result = exportGraph(graph, { format: 'turtle' });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('format matching is case-insensitive', () => {
      const graph = makeGraph([]);
      expect(() => exportGraph(graph, { format: 'SKOS' })).not.toThrow();
      expect(() => exportGraph(graph, { format: 'Turtle' })).not.toThrow();
    });
  });
});
