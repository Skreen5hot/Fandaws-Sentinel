import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { describeConcept } from '../../src/core/description-engine/description-engine.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

const corpusPath = new URL('./description-engine-corpus.json', import.meta.url);
const { corpus } = JSON.parse(readFileSync(corpusPath, 'utf-8'));

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/**
 * Build a real JSON-LD concept from a compact corpus entry format.
 * Attaches properties and relationships to rdfs:subClassOf.
 */
function buildConcept(entry) {
  const c = createConcept({
    id: entry.id,
    label: entry.label,
    prefLabel: entry.prefLabel,
    broader: entry.broader || null,
  });

  // BFO process flag — marks concept as a process for process template
  if (entry.bfoProcess) {
    c['rdfs:subClassOf'].push('bfo:BFO_0000015');
  }

  // Attach properties
  if (entry.properties) {
    for (const prop of entry.properties) {
      c['rdfs:subClassOf'].push({
        '@type': 'owl:Restriction',
        'owl:onProperty': prop,
        'fandaws:restrictionKind': 'property',
      });
    }
  }

  // Attach relationships
  if (entry.relationships) {
    for (const rel of entry.relationships) {
      c['rdfs:subClassOf'].push({
        '@type': 'owl:Restriction',
        'owl:onProperty': rel.verb,
        'owl:someValuesFrom': rel.object,
        'fandaws:attachedTo': rel.subject,
        'fandaws:restrictionKind': 'relationship',
      });
    }
  }

  return c;
}

/**
 * Build a graph containing the target concept and any graph context concepts.
 */
function buildGraph(conceptEntry, graphConceptEntries) {
  const targetConcept = buildConcept(conceptEntry);
  const graphConcepts = (graphConceptEntries || []).map((gc) =>
    buildConcept(gc),
  );

  // Include target concept in graph if not already present
  const allConcepts = [...graphConcepts];
  if (!allConcepts.find((c) => c['@id'] === targetConcept['@id'])) {
    allConcepts.push(targetConcept);
  }

  return {
    concept: targetConcept,
    graph: createKnowledgeGraph({
      id: 'fandaws:graph/test',
      concepts: allConcepts,
    }),
  };
}

// ─────────────────────────────────────────────────────────
// Corpus-driven tests
// ─────────────────────────────────────────────────────────

describe('DescriptionEngine — Golden Corpus', () => {
  it(`corpus has 20+ test cases (has ${corpus.length})`, () => {
    expect(corpus.length).toBeGreaterThanOrEqual(20);
  });

  for (const entry of corpus) {
    it(`[${entry.id}] ${entry.note}`, () => {
      const { concept, graph } = buildGraph(entry.concept, entry.graphConcepts);
      const result = describeConcept(concept, graph);
      expect(result).toBe(entry.expected);
    });
  }
});
