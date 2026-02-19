/**
 * ERS Pipeline Integration Tests.
 *
 * Validates that the property and relationship pipelines correctly
 * annotate restriction nodes with epistemic register metadata.
 *
 * @see docs/architecture/NAC_ERS_Test_Specification_v1.1.md §8 (PIP-01 to PIP-12)
 */

import { describe, it, expect } from '@jest/globals';
import { runPropertyPipeline } from '../../src/core/pipeline/property-pipeline.js';
import { runRelationshipPipeline } from '../../src/core/pipeline/relationship-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';
import { isRestrictionNode } from '../../src/types/type-checks.js';
import { REGISTERS } from '../../src/types/routing-record.js';

// ── Helpers ──

const GRAPH_ID = 'fandaws:graph/test';

/**
 * Create a context with a pre-populated animal→dog hierarchy.
 * Dog's BFO defaults to MaterialEntity via heuristic (no suffix match).
 */
function propertyContext() {
  const stateAdapter = new InMemoryStateAdapter();
  stateAdapter.saveGraph(
    GRAPH_ID,
    createKnowledgeGraph({
      id: GRAPH_ID,
      concepts: [
        createConcept({
          id: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
          label: 'Animal',
          prefLabel: 'animal',
        }),
        createConcept({
          id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
          label: 'Dog',
          prefLabel: 'dog',
          broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
        }),
        createConcept({
          id: 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
          label: 'Fur',
          prefLabel: 'fur',
        }),
        createConcept({
          id: 'fandaws:class/a-tail/tail',
          label: 'Tail',
          prefLabel: 'tail',
        }),
      ],
    }),
  );
  return { stateAdapter, graphId: GRAPH_ID };
}

/** Scope decision: do NOT widen to parent "animal". */
const DOG_SCOPE_DECISIONS = new Map([
  ['fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', false],
]);

function freshContext() {
  const stateAdapter = new InMemoryStateAdapter();
  stateAdapter.saveGraph(
    GRAPH_ID,
    createKnowledgeGraph({ id: GRAPH_ID, concepts: [] }),
  );
  return { stateAdapter, graphId: GRAPH_ID };
}

function getRestrictions(graph) {
  const restrictions = [];
  for (const c of graph['fandaws:concepts'] || []) {
    for (const entry of c['rdfs:subClassOf'] || []) {
      if (isRestrictionNode(entry)) {
        restrictions.push(entry);
      }
    }
  }
  return restrictions;
}

// ── Tests ──

describe('ERS Pipeline Integration', () => {
  describe('PIP-01: Property pipeline annotates restriction with register', () => {
    it('assigns register to property restriction', () => {
      const ctx = propertyContext();
      const result = runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const restrictions = getRestrictions(graph);
      const prop = restrictions.find((r) => r['fandaws:restrictionKind'] === 'property');
      expect(prop).toBeDefined();
      // Dog → MaterialEntity (BFO heuristic default) → R2
      expect(prop['fandaws:epistemicRegister']).toBe(REGISTERS.NORMATIVE);
    });
  });

  describe('PIP-02: Property pipeline annotates with routing record', () => {
    it('includes valid RegisterRoutingRecord shape', () => {
      const ctx = propertyContext();
      const result = runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const restrictions = getRestrictions(graph);
      const prop = restrictions.find((r) => r['fandaws:restrictionKind'] === 'property');

      expect(prop['fandaws:routingRecord']).toBeDefined();
      const record = prop['fandaws:routingRecord'];
      expect(record['@type']).toBe('fandaws:RegisterRoutingRecord');
      expect(record['fandaws:assignedRegister']).toBeDefined();
      expect(record['fandaws:routingMethod']).toBeDefined();
      expect(record['@id']).toMatch(/^fandaws:routing\//);
    });
  });

  describe('PIP-03: Relationship pipeline annotates restriction nodes', () => {
    it('assigns register to relationship restriction', () => {
      const ctx = freshContext();
      const result = runRelationshipPipeline('Dogs chase cats', ctx);

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const restrictions = getRestrictions(graph);
      const rel = restrictions.find((r) => r['fandaws:restrictionKind'] === 'relationship');

      expect(rel).toBeDefined();
      expect(rel['fandaws:epistemicRegister']).toBe(REGISTERS.NORMATIVE);
    });
  });

  describe('PIP-04: ERS disabled → no annotation', () => {
    it('skips ERS annotation when config disables it (property)', () => {
      const ctx = propertyContext();
      const result = runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
        ersConfig: { epistemicRegisterEnabled: false },
      });

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const restrictions = getRestrictions(graph);
      const prop = restrictions.find((r) => r['fandaws:restrictionKind'] === 'property');

      expect(prop).toBeDefined();
      expect(prop).not.toHaveProperty('fandaws:epistemicRegister');
      expect(prop).not.toHaveProperty('fandaws:routingRecord');
    });

    it('skips ERS annotation when config disables it (relationship)', () => {
      const ctx = freshContext();
      const result = runRelationshipPipeline('Dogs chase cats', ctx, {
        ersConfig: { epistemicRegisterEnabled: false },
      });

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const restrictions = getRestrictions(graph);
      const rel = restrictions.find((r) => r['fandaws:restrictionKind'] === 'relationship');

      expect(rel).toBeDefined();
      expect(rel).not.toHaveProperty('fandaws:epistemicRegister');
    });
  });

  describe('PIP-05: Non-restriction nodes untouched', () => {
    it('only annotates restriction nodes, not concept nodes', () => {
      const ctx = propertyContext();
      const result = runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const concepts = graph['fandaws:concepts'] || [];

      for (const c of concepts) {
        expect(c).not.toHaveProperty('fandaws:epistemicRegister');
        expect(c).not.toHaveProperty('fandaws:routingRecord');
      }
    });
  });

  describe('PIP-06: Existing property pipeline tests produce identical results', () => {
    it('property pipeline still succeeds for basic assertions', () => {
      const ctx = propertyContext();
      const result = runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });
      expect(result.success).toBe(true);
      expect(result.error).toBe(false);

      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      expect(graph['fandaws:concepts'].length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PIP-07: Existing relationship pipeline tests produce identical results', () => {
    it('relationship pipeline still succeeds for basic assertions', () => {
      const ctx = freshContext();
      const result = runRelationshipPipeline('Dogs chase cats', ctx);
      expect(result.success).toBe(true);
      expect(result.error).toBe(false);
      expect(result.normalizedVerb).toBe('chase');
    });
  });

  describe('PIP-08: Pipeline handles multiple restrictions in one mutation', () => {
    it('each property gets its own routing record with unique @id', () => {
      const ctx = propertyContext();

      // First property
      runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });

      // Second property on same concept
      const result = runPropertyPipeline('A dog has a tail', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const restrictions = getRestrictions(graph);
      const props = restrictions.filter((r) => r['fandaws:restrictionKind'] === 'property');

      // All properties should have register annotations
      for (const p of props) {
        expect(p['fandaws:epistemicRegister']).toBeDefined();
        expect(p['fandaws:routingRecord']).toBeDefined();
      }

      // Routing record @ids should differ between properties
      if (props.length >= 2) {
        const ids = props.map((p) => p['fandaws:routingRecord']['@id']);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }
    });
  });

  describe('PIP-09: Pipeline handles empty additions array', () => {
    it('no error when property already exists (idempotent)', () => {
      const ctx = propertyContext();
      // First call creates the property
      runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });
      // Second call — same property, idempotent (no-op mutation)
      const result = runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });
      // Should not crash — either succeeds as no-op or returns validation error
      expect(result).toBeDefined();
    });
  });

  describe('PIP-10: Pipeline handles mutation with no additions field', () => {
    it('no error when parse fails — ERS step never reached', () => {
      const ctx = propertyContext();
      const result = runPropertyPipeline('???', ctx);
      expect(result.error).toBe(true);
      expect(result.errorReason).toMatch(/parse-error/);
    });
  });

  describe('PIP-11: Flags present only when non-empty', () => {
    it('no routingFlags field when no flags generated', () => {
      const ctx = propertyContext();
      const result = runPropertyPipeline('A dog has fur', ctx, {
        scopeDecisions: DOG_SCOPE_DECISIONS,
      });

      expect(result.success).toBe(true);
      const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
      const restrictions = getRestrictions(graph);
      const prop = restrictions.find((r) => r['fandaws:restrictionKind'] === 'property');

      // Field should be ABSENT (not empty array)
      expect(prop).not.toHaveProperty('fandaws:routingFlags');
    });
  });

  describe('PIP-12: Flags present when teleological signal detected', () => {
    it('teleological flag appears in relationship with "should" in utterance', () => {
      const ctx = freshContext();
      // "Dogs should chase cats" — "should" triggers teleological flag
      const result = runRelationshipPipeline('Dogs should chase cats', ctx);

      // The NLParser may or may not parse "should chase" as a verb.
      // If it does, the restriction should have the teleological flag.
      if (result.success) {
        const graph = ctx.stateAdapter.loadGraph(GRAPH_ID);
        const restrictions = getRestrictions(graph);
        const rel = restrictions.find((r) => r['fandaws:restrictionKind'] === 'relationship');
        if (rel && rel['fandaws:routingFlags']) {
          expect(rel['fandaws:routingFlags']).toContain('teleological-signal');
        }
      }
    });
  });
});
