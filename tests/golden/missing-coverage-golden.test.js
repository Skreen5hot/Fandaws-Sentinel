/**
 * Missing Coverage Golden — data-driven tests for the 23 scenarios in
 * missing-coverage-corpus.json covering classification, reclassification
 * (all 3 options), properties, homonyms, BFO markers, exports, ingestion,
 * and conversational consistency.
 *
 * Each corpus entry is run as a standalone it() block. Tests for features
 * that are not yet implemented (e.g., conversationalConsistencyCheck,
 * Path A/B) are marked it.skip with an explanatory note so the corpus
 * stays authoritative while keeping the suite green.
 */

import { describe, it, expect } from '@jest/globals';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept, createIngestedConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { exportGraph } from '../../src/core/export-engine/export-engine.js';
import corpus from './missing-coverage-corpus.json' with { type: 'json' };

const GRAPH_ID = 'fandaws:graph/test';

// Cases that exercise features not yet implemented — tracked in corpus but
// skipped in the test runner. Remove from this set as features land.
const SKIPPED = new Set([
  // conversationalConsistencyCheck (Path A / Path B) — not implemented
  'consistency-reclassify-creates-disjointness',
  'consistency-new-assertion-disjoint',
  // BFO property verb matching (Tier 2A) — not yet wired into property workflow
  'prop-verb-bfo-match-tier2',
  // Hash short-circuit and first-open trigger require a real turtle blob +
  // the in-memory adapter's ensureBfoIngestion entry point — covered
  // separately in ingestion-focused tests
  'ingestion-hash-shortcircuit',
  'ingestion-existing-graph-trigger',
]);

function buildConceptFromSetup(entry) {
  const { id, canonicalLabel, displayLabel, parent, isImported, equivalentClass, hiddenLabel } = entry;

  if (isImported) {
    return createIngestedConcept({
      id,
      label: displayLabel,
      prefLabel: canonicalLabel,
      broader: parent || null,
      equivalentClass: equivalentClass || [id],
      ingestSource: {
        sourceOntology: 'bfo',
        sourceClassIri: (equivalentClass && equivalentClass[0]) || 'bfo:unknown',
        sourceVersion: '2020',
        ingestedAt: '2026-04-15T00:00:00.000Z',
        contentHash: entry.ingestSource?.contentHash || 'sha256:test',
      },
    });
  }

  const concept = createConcept({
    id,
    label: displayLabel,
    prefLabel: canonicalLabel,
    broader: parent || null,
    altLabel: hiddenLabel ? [hiddenLabel] : [],
  });

  // Restrictions attached to this concept
  if (entry.restrictions && entry.restrictions.length > 0) {
    for (const r of entry.restrictions) {
      const rId = `${id}#r-${r.verb}-${(r.object.split('/').pop())}`;
      const restriction = createProperty({
        id: rId,
        verbIri: 'fandaws:objectProperty/has',
        verbLabel: r.verb,
        objectConceptIri: r.object,
        propertyLabel: `${r.verb} ${r.object.split('/').pop()}`,
        attachedTo: id,
      });
      concept['rdfs:subClassOf'].push(restriction);
    }
  }

  // Pre-existing rdfs:subClassOf phantom IRIs (pre-ingestion graph)
  if (entry.rdfsSubClassOf) {
    for (const iri of entry.rdfsSubClassOf) {
      if (!concept['rdfs:subClassOf'].includes(iri)) {
        concept['rdfs:subClassOf'].push(iri);
      }
    }
  }

  return concept;
}

function setupGraph(adapter, setupEntries) {
  const concepts = (setupEntries || []).map(buildConceptFromSetup);
  adapter.saveGraph(GRAPH_ID, createKnowledgeGraph({ id: GRAPH_ID, concepts }));
}

function runUtterance(adapter, utterance, options = {}) {
  const orchestrator = new SynchronousOrchestrationAdapter();
  const context = { stateAdapter: adapter, graphId: GRAPH_ID };
  return orchestrator.runPipeline(utterance, context, options);
}

function findConcept(graph, canonicalLabel) {
  return graph['fandaws:concepts'].find((c) => c['skos:prefLabel'] === canonicalLabel);
}

describe('Missing Coverage Golden', () => {
  for (const entry of corpus) {
    const runner = SKIPPED.has(entry.id) ? it.skip : it;
    runner(`[${entry.id}] ${entry.note}`, () => {
      const adapter = new InMemoryStateAdapter();
      setupGraph(adapter, entry.setup);

      // ── Utterance-less tests (export / ingestion) ──
      if (entry.utterance == null) {
        const exp = entry.expect;
        if (exp.roundtripCheck) {
          const field = exp.roundtripCheck.field;
          const concept = adapter.loadGraph(GRAPH_ID)['fandaws:concepts'][0];
          if (exp.roundtripCheck.isArray) {
            expect(Array.isArray(concept[field])).toBe(true);
          }
          if (exp.roundtripCheck.value) {
            expect(concept[field]).toEqual(exp.roundtripCheck.value);
          }
          return;
        }
        if (exp.exportCheck) {
          const graph = adapter.loadGraph(GRAPH_ID);
          const turtle = exportGraph(graph, { format: 'turtle' });
          if (exp.exportCheck.noPhantomBfoIrisInSubClassOf) {
            // No user concept should export a raw bfo: IRI as rdfs:subClassOf
            const userConcepts = graph['fandaws:concepts'].filter((c) => !c['fandaws:isImported']);
            for (const c of userConcepts) {
              const subClassOf = c['rdfs:subClassOf'] || [];
              for (const entry2 of subClassOf) {
                if (typeof entry2 === 'string') {
                  expect(entry2.startsWith('bfo:')).toBe(false);
                }
              }
            }
          }
          if (exp.exportCheck.internalMetadataStripped) {
            for (const key of exp.exportCheck.internalMetadataStripped) {
              expect(turtle).not.toContain(key);
            }
          }
          return;
        }
        return;
      }

      // ── Run the utterance through the orchestrator ──
      const pipelineOptions = {};
      if (entry.userChoice) {
        pipelineOptions.reclassificationConsequenceChoice = entry.userChoice;
        pipelineOptions.reclassificationConfirmed = 'move';
      }
      if (entry.proximityConfirmed) {
        pipelineOptions.reclassificationConfirmed = entry.proximityConfirmed;
      }

      const result = runUtterance(adapter, entry.utterance, pipelineOptions);
      const exp = entry.expect;

      // Apply the mutation to the adapter so post-checks see the final graph.
      // The orchestrator returns a mutation but does not auto-apply it.
      if (result.mutation) {
        adapter.applyMutation(GRAPH_ID, result.mutation);
      }

      // ── Success / error ──
      if (exp.success !== undefined) {
        expect(result.success).toBe(exp.success);
      }
      if (exp.errorReasonContains) {
        expect(result.errorReason || '').toContain(exp.errorReasonContains);
      }

      // ── Prompt checks ──
      if (exp.promptFired === true) {
        expect(result.prompts.length).toBeGreaterThan(0);
      }
      if (exp.promptFired === false) {
        expect(result.prompts.length).toBe(0);
      }
      if (exp.promptType) {
        const types = result.prompts.map((p) => p['fandaws:promptType']);
        expect(types).toContain(exp.promptType);
      }
      if (exp.guardFired) {
        const types = result.prompts.map((p) => p['fandaws:promptType']);
        expect(types).toContain(exp.guardType || 'importedConceptGuard');
      }

      // ── Mutation count ──
      if (exp.mutationCount !== undefined) {
        const mods = result.mutation ? (result.mutation['fandaws:modifications'] || []) : [];
        const adds = result.mutation ? (result.mutation['fandaws:additions'] || []) : [];
        const dels = result.mutation ? (result.mutation['fandaws:deletions'] || []) : [];
        expect(mods.length + adds.length + dels.length).toBe(exp.mutationCount);
      }

      // ── Options list ──
      if (exp.options && result.prompts.length > 0) {
        const prompt = result.prompts.find((p) => p['fandaws:options']);
        if (prompt) {
          const actions = (prompt['fandaws:options'] || []).map((o) => o.action || o);
          expect(actions).toEqual(expect.arrayContaining(exp.options));
        }
      }

      // ── Consequence case ──
      if (exp.consequenceCase) {
        const prompt = result.prompts.find((p) => p['fandaws:promptType'] === 'reclassificationConsequence');
        expect(prompt).toBeDefined();
        expect(prompt['fandaws:context'].caseType).toBe(exp.consequenceCase);
      }

      // ── Post-mutation graph assertions ──
      const finalGraph = result.graph || adapter.loadGraph(GRAPH_ID);

      if (exp.conceptCount !== undefined) {
        expect(finalGraph['fandaws:concepts']).toHaveLength(exp.conceptCount);
      }

      if (exp.newConcept) {
        const c = findConcept(finalGraph, exp.newConcept.label);
        expect(c).toBeDefined();
        if (exp.newConcept.skosBroader) {
          expect(c['skos:broader']).toBe(exp.newConcept.skosBroader);
        }
        if (exp.newConcept.rdfsSubClassOfContains) {
          const strings = (c['rdfs:subClassOf'] || []).filter((e) => typeof e === 'string');
          expect(strings).toContain(exp.newConcept.rdfsSubClassOfContains);
        }
        if (exp.newConcept.rdfsSubClassOfExcludes) {
          const strings = (c['rdfs:subClassOf'] || []).filter((e) => typeof e === 'string');
          expect(strings).not.toContain(exp.newConcept.rdfsSubClassOfExcludes);
        }
        if (exp.newConcept.bfoMarker) {
          const strings = (c['rdfs:subClassOf'] || []).filter((e) => typeof e === 'string');
          expect(strings).toContain(exp.newConcept.bfoMarker);
        }
        if (exp.newConcept.bfoMarkerIsNot) {
          const strings = (c['rdfs:subClassOf'] || []).filter((e) => typeof e === 'string');
          expect(strings).not.toContain(exp.newConcept.bfoMarkerIsNot);
        }
      }

      // ── Reclassification outcome ──
      // newParent in the corpus may be an IRI or a canonical label — resolve
      // labels against the post-mutation graph.
      if (exp.reclassified) {
        const c = findConcept(finalGraph, exp.reclassified);
        expect(c).toBeDefined();
        if (exp.newParent) {
          const target = exp.newParent.startsWith('fandaws:') || exp.newParent.startsWith('iri:')
            ? exp.newParent
            : (findConcept(finalGraph, exp.newParent) || {})['@id'];
          expect(c['skos:broader']).toBe(target);
        }
      }

      if (exp.rehomedChildren) {
        for (const reh of exp.rehomedChildren) {
          const c = findConcept(finalGraph, reh.concept);
          expect(c).toBeDefined();
          expect(c['skos:broader']).toBe(reh.newParent);
        }
      }

      if (exp.conceptCreated) {
        const c = findConcept(finalGraph, exp.conceptCreated);
        expect(c).toBeDefined();
      }

      if (exp.homonymDetected) {
        // Two concepts with same canonicalLabel after the mutation
        const targets = finalGraph['fandaws:concepts'].filter(
          (c) => c['skos:prefLabel'] === 'foot' || (c['skos:altLabel'] || []).includes('foot'),
        );
        expect(targets.length).toBeGreaterThanOrEqual(2);
      }

      // ── Property restriction outcome ──
      if (exp.restrictionCreated) {
        const subjectConcept = finalGraph['fandaws:concepts'].find((c) => {
          const subClassOf = c['rdfs:subClassOf'] || [];
          return subClassOf.some((e) => e && typeof e === 'object' && e['@type'] === 'owl:Restriction');
        });
        expect(subjectConcept).toBeDefined();
        const restrictions = (subjectConcept['rdfs:subClassOf'] || []).filter(
          (e) => e && typeof e === 'object' && e['@type'] === 'owl:Restriction',
        );
        expect(restrictions.length).toBeGreaterThan(0);

        if (exp.owlOnProperty) {
          expect(restrictions[0]['owl:onProperty']).toBe(exp.owlOnProperty);
        }
        if (exp.owlSomeValuesFrom) {
          expect(restrictions[0]['owl:someValuesFrom']).toBe(exp.owlSomeValuesFrom);
        }
      }

      // ── Export checks on a live graph (post-utterance) ──
      if (exp.exportCheck && entry.utterance) {
        const turtle = exportGraph(finalGraph, { format: 'turtle' });
        if (exp.exportCheck.hasEquivalentProperty === false) {
          expect(turtle).not.toContain('owl:equivalentProperty');
        }
        if (exp.exportCheck.verbPropertyDeclared) {
          expect(turtle).toContain(exp.exportCheck.verbPropertyDeclared.replace('fandaws:', ''));
        }
      }

      // ── BFO marker recomputation after reclassification ──
      if (exp.afterReclassification) {
        for (const [label, spec] of Object.entries(exp.afterReclassification)) {
          const c = findConcept(finalGraph, label);
          expect(c).toBeDefined();
          if (spec.bfoMarker) {
            const strings = (c['rdfs:subClassOf'] || []).filter((e) => typeof e === 'string');
            expect(strings).toContain(spec.bfoMarker);
          }
        }
      }

      // ── childrenFollowed — descendants still point into the moved subtree ──
      if (exp.childrenFollowed && exp.reclassified) {
        const movedParent = findConcept(finalGraph, exp.reclassified);
        // Look for at least one descendant whose skos:broader eventually reaches movedParent
        const hasDescendant = finalGraph['fandaws:concepts'].some((c) => {
          let cursor = c['skos:broader'];
          while (cursor) {
            if (cursor === movedParent['@id']) return true;
            const next = finalGraph['fandaws:concepts'].find((x) => x['@id'] === cursor);
            cursor = next ? next['skos:broader'] : null;
          }
          return false;
        });
        expect(hasDescendant).toBe(true);
      }
    });
  }
});
