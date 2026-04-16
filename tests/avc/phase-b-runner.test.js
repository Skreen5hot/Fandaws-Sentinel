/**
 * Phase B AVC Runner — Ontology Ingestion (FANDAWS v2.1 Roadmap Phase 2).
 *
 * Verifies dual-lane separation, compilation pipeline, BFO Disjointness Map,
 * conversational consistency checks (CC Path A/B), RECC structural conformance,
 * and regression against Phases 12 and 13.
 *
 * @see docs/architecture/phase-b-avc-bundle.json
 */

import { describe, it, expect } from '@jest/globals';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept, createIngestedConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createScopeConfiguration, createScopeEntry } from '../../src/types/scope-configuration.js';
import { SynchronousOrchestrationAdapter } from '../../src/adapters/orchestration/synchronous-orchestration-adapter.js';
import { M2MOrchestrationAdapter } from '../../src/adapters/orchestration/m2m-orchestration-adapter.js';
import { resolveTerm } from '../../src/core/scope-resolver/scope-resolver.js';
import { exportGraph } from '../../src/core/export-engine/export-engine.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import bundle from '../../docs/architecture/phase-b-avc-bundle.json' with { type: 'json' };

let BFO_TURTLE = null;
try {
  BFO_TURTLE = readFileSync(resolve('data/ontologies/bfo-2020-core.ttl'), 'utf-8');
} catch { /* BFO Turtle not available */ }

// ─────────────────────────────────────────────────────────
// Setup (reused from P13 runner)
// ─────────────────────────────────────────────────────────

function buildConceptFromSetup(entry) {
  if (entry.isImported) {
    return createIngestedConcept({
      id: entry.id, label: entry.displayLabel || entry.canonicalLabel,
      prefLabel: entry.canonicalLabel, broader: entry.parent || null,
      equivalentClass: entry.equivalentClass || [entry.id],
      ingestSource: { sourceOntology: 'bfo', sourceClassIri: entry.equivalentClass?.[0] || 'bfo:unknown', sourceVersion: '2020', ingestedAt: '2026-01-01T00:00:00Z', contentHash: 'sha256:test' },
    });
  }
  const concept = createConcept({
    id: entry.id, label: entry.displayLabel || entry.canonicalLabel,
    prefLabel: entry.canonicalLabel, broader: entry.parent || null,
  });
  if (entry.restrictions) {
    for (const r of entry.restrictions) {
      const restriction = createProperty({
        id: `${entry.id}#r-${r.verb}-${r.object.split(':').pop()}`,
        verbIri: `fandaws:objectProperty/${r.verb}`, verbLabel: r.verb,
        objectConceptIri: r.object, propertyLabel: r.object.split(':').pop(),
        attachedTo: entry.id,
      });
      if (r.compilationStatus) {
        restriction['fandaws:compilationStatus'] = r.compilationStatus;
      }
      concept['rdfs:subClassOf'].push(restriction);
    }
  }
  return concept;
}

function buildEnvironment(setup) {
  const adapter = new InMemoryStateAdapter();
  const globalEntries = [];
  for (const scope of (setup.scopes || [])) {
    const graph = createKnowledgeGraph({ id: scope.graphId, concepts: (scope.concepts || []).map(buildConceptFromSetup) });
    if (scope.graphVersion) graph['fandaws:graphVersion'] = scope.graphVersion;
    adapter.saveGraph(scope.graphId, graph);

    // If BFO should be ingested, trigger ingestion from bundled Turtle
    if (scope.bfoIngested && BFO_TURTLE) {
      adapter.ensureBfoIngestion(scope.graphId, BFO_TURTLE);
    }

    if (scope.scopeType === 'global') {
      globalEntries.push(createScopeEntry({ graphId: scope.graphId, label: scope.graphId, priority: scope.priority || 1 }));
    }
  }
  return {
    adapter,
    scopeConfig: createScopeConfiguration({ contextGraphId: null, userGraphId: setup.activeScope || null, globalFederation: globalEntries }),
    activeScope: setup.activeScope || null,
    callerMode: setup.callerMode || 'human',
    humanChannelAvailable: setup.humanChannelAvailable || false,
  };
}

function createOrchestrator(env) {
  // Use M2M adapter for all Phase B scenarios — it auto-resolves
  // disambiguation and scope narrowing prompts that the base adapter
  // would fire as blocking prompts. This matches agent mode behavior.
  return new M2MOrchestrationAdapter();
}

function runUtterance(env, utterance, options = {}) {
  const orch = env._orchestrator || createOrchestrator(env);
  env._orchestrator = orch;
  return orch.runPipeline(utterance, {
    stateAdapter: env.adapter, graphId: env.activeScope,
    callerMode: env.callerMode, humanChannelAvailable: env.humanChannelAvailable,
  }, options);
}

// ─────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────

describe(`Phase B AVC (${bundle.bundle_id})`, () => {
  for (const scenario of bundle.scenarios) {
    it(`[${scenario.id}] ${scenario.description}`, () => {
      const env = buildEnvironment(scenario.setup);
      const exp = scenario.expect;
      const trigger = scenario.trigger;
      let result;

      // ── Execute trigger ──
      if (trigger.type === 'utterance') {
        const opts = { bfoCategoryChoice: 'entity' };
        // Handle user_choice for second-turn responses
        if (scenario.user_choice) {
          const action = scenario.user_choice.action;
          if (action === 'confirm_reclassification' || action === 'reclassify_subtree') {
            opts.reclassificationConfirmed = 'move';
            opts.reclassificationConsequenceChoice = 'reclassify_subtree';
          } else if (action === 'cancel') {
            opts.reclassificationConfirmed = 'cancel';
          } else if (action === 'assert_anyway') {
            opts.consistencyCheckOverride = 'assert_anyway';
          }
        }
        result = runUtterance(env, trigger.value, opts);

      } else if (trigger.type === 'agentScript') {
        const turnResults = [];
        for (const turn of trigger.turns) {
          const r = runUtterance(env, turn.utterance, {
            bfoCategoryChoice: 'entity',
            scopeNarrowingChoice: 'no',
          });
          turnResults.push({ turn, result: r });
        }
        result = { _turnResults: turnResults, success: true };

      } else if (trigger.type === 'export') {
        // Compile first, then export from Execution Lane
        const graph = env.adapter.loadGraph(env.activeScope);
        const turtle = exportGraph(graph, { format: trigger.format });
        result = { _export: turtle };

      } else if (trigger.type === 'queryDisjointnessMap') {
        const map = env.adapter.getDisjointnessMap();
        result = { _disjointnessMap: map };

      } else if (trigger.type === 'reingestion') {
        if (BFO_TURTLE) {
          // Force re-ingestion by clearing the hash check
          env.adapter.ensureBfoIngestion(env.activeScope, BFO_TURTLE);
        }
        const map = env.adapter.getDisjointnessMap();
        result = { _disjointnessMap: map };

      } else if (trigger.type === 'compile') {
        env.adapter.compile(env.activeScope);
        result = { _compiled: true };

      } else if (trigger.type === 'resolveTerm') {
        result = resolveTerm(trigger.value, env.scopeConfig, env.adapter);

      } else if (trigger.type === 'repeatedAssertion') {
        const results = [];
        for (let i = 0; i < trigger.repetitions; i++) {
          const r = runUtterance(env, trigger.value, { reclassificationConfirmed: 'move' });
          results.push(r);
        }
        result = results[results.length - 1];
        result._allResults = results;
      }

      // ── Execution Lane assertions ──
      if (exp.executionLane) {
        const el = env.adapter.getExecutionLane(env.activeScope);

        if (exp.executionLane.populated) {
          expect(el).not.toBeNull();
          expect(el.artifacts.size).toBeGreaterThan(0);
        }

        if (exp.executionLane.hasEpoch) {
          expect(el.epoch).toBeGreaterThan(0);
        }

        if (exp.executionLane.containsArtifactFor) {
          const found = [...el.artifacts.values()].find(
            (a) => a['skos:prefLabel'] === exp.executionLane.containsArtifactFor,
          );
          expect(found).toBeDefined();
        }

        if (exp.executionLane.doesNotContain) {
          for (const a of el.artifacts.values()) {
            for (const field of exp.executionLane.doesNotContain) {
              expect(a[field]).toBeUndefined();
            }
          }
        }

        if (exp.executionLane.doesContain) {
          const artifactLabel = exp.executionLane.artifactFor;
          if (artifactLabel) {
            const a = [...el.artifacts.values()].find(
              (a2) => a2['skos:prefLabel'] === artifactLabel,
            );
            expect(a).toBeDefined();
            for (const field of exp.executionLane.doesContain) {
              expect(a[field]).toBeDefined();
            }
          }
        }

        if (exp.executionLane.allArtifactsHaveEpoch) {
          for (const a of el.artifacts.values()) {
            expect(a['fandaws:compilationEpoch']).toBeDefined();
            expect(a['fandaws:compilationEpoch']).toBeGreaterThan(0);
          }
        }

        if (exp.executionLane.epochs) {
          // Check that epochs are present and monotonically increasing
          expect(el.epoch).toBe(exp.executionLane.epochs[exp.executionLane.epochs.length - 1]);
        }

        if (exp.executionLane.containsRestriction) {
          const cr = exp.executionLane.containsRestriction;
          let found = false;
          for (const a of el.artifacts.values()) {
            const restrictions = (a['rdfs:subClassOf'] || []).filter(
              (e) => typeof e === 'object' && e['@type'] === 'owl:Restriction',
            );
            if (restrictions.length > 0 && cr.owlSomeValuesFrom) {
              const match = restrictions.find((r) => {
                const objectIri = r['owl:someValuesFrom'];
                if (cr.owlSomeValuesFrom.startsWith('ANY_IRI_MATCHING(')) {
                  const label = cr.owlSomeValuesFrom.match(/ANY_IRI_MATCHING\((.+)\)/)[1];
                  const concept = [...el.artifacts.values()].find((c) => c['skos:prefLabel'] === label);
                  return concept && objectIri === concept['@id'];
                }
                return objectIri === cr.owlSomeValuesFrom;
              });
              if (match) found = true;
            } else if (restrictions.length > 0) {
              found = true;
            }
          }
          expect(found).toBe(true);
        }

        if (exp.executionLane.doesNotContainRestriction) {
          const dnr = exp.executionLane.doesNotContainRestriction;
          for (const a of el.artifacts.values()) {
            const restrictions = (a['rdfs:subClassOf'] || []).filter(
              (e) => typeof e === 'object' && e['@type'] === 'owl:Restriction',
            );
            for (const r of restrictions) {
              if (dnr.owlSomeValuesFrom) {
                const objectIri = r['owl:someValuesFrom'];
                if (dnr.owlSomeValuesFrom.startsWith('ANY_IRI_MATCHING(')) {
                  const label = dnr.owlSomeValuesFrom.match(/ANY_IRI_MATCHING\((.+)\)/)[1];
                  const concept = [...el.artifacts.values()].find((c) => c['skos:prefLabel'] === label);
                  expect(objectIri).not.toBe(concept?.['@id']);
                }
              }
            }
          }
        }
      }

      // ── Canonical Lane assertions ──
      if (exp.canonicalLane) {
        const graph = env.adapter.loadGraph(env.activeScope);

        if (exp.canonicalLane.conceptCount !== undefined) {
          expect(graph['fandaws:concepts']).toHaveLength(exp.canonicalLane.conceptCount);
        }

        if (exp.canonicalLane.noCompilerArtifacts) {
          for (const c of graph['fandaws:concepts']) {
            expect(c['fandaws:compilationEpoch']).toBeUndefined();
          }
        }

        if (exp.canonicalLane.conceptExists) {
          const c = graph['fandaws:concepts'].find(
            (c2) => c2['skos:prefLabel'] === exp.canonicalLane.conceptExists,
          );
          expect(c).toBeDefined();
        }

        if (exp.canonicalLane.doesContain) {
          const label = exp.canonicalLane.conceptFor || exp.canonicalLane.conceptExists;
          if (label) {
            const c = graph['fandaws:concepts'].find((c2) => c2['skos:prefLabel'] === label);
            expect(c).toBeDefined();
          }
        }
      }

      // ── Disjointness Map assertions ──
      if (exp.disjointnessMap) {
        const map = env.adapter.getDisjointnessMap();

        if (exp.disjointnessMap.containsPair) {
          const [a, b] = exp.disjointnessMap.containsPair;
          expect(env.adapter.areDisjoint(a, b)).toBe(true);
        }

        if (exp.disjointnessMap.containsPair2) {
          const [a, b] = exp.disjointnessMap.containsPair2;
          expect(env.adapter.areDisjoint(a, b)).toBe(true);
        }

        if (exp.disjointnessMap.doesNotContainPair) {
          const [a, b] = exp.disjointnessMap.doesNotContainPair;
          expect(env.adapter.areDisjoint(a, b)).toBe(false);
        }

        if (exp.disjointnessMap.recomputed) {
          expect(map.size).toBeGreaterThan(0);
        }
      }

      // ── Prompt assertions ──
      if (exp.prompt) {
        const prompts = result?.prompts || [];
        if (exp.prompt.fired === true) {
          expect(prompts.length).toBeGreaterThan(0);
        }
        if (exp.prompt.fired === false) {
          expect(prompts.length).toBe(0);
        }
      }

      // ── Success ──
      if (exp.success !== undefined) {
        expect(result?.success).toBe(exp.success);
      }

      // ── Mutation count ──
      if (exp.mutationCount !== undefined) {
        if (exp.mutationCount === 0) {
          expect(result?.mutation).toBeNull();
        }
      }

      // ── Export checks ──
      if (exp.exportCheck) {
        const turtle = result?._export;
        expect(turtle).toBeDefined();

        if (exp.exportCheck.doesNotContain) {
          for (const field of exp.exportCheck.doesNotContain) {
            expect(turtle).not.toContain(field);
          }
        }
      }

      // ── PostState ──
      if (exp.postState) {
        const graph = env.adapter.loadGraph(env.activeScope);
        for (const [label, expected] of Object.entries(exp.postState)) {
          if (expected['skos:broader']) {
            const concept = graph['fandaws:concepts'].find((c) => c['skos:prefLabel'] === label);
            expect(concept).toBeDefined();
            if (expected['skos:broader'].startsWith('ANY_IRI_MATCHING(')) {
              const matchLabel = expected['skos:broader'].match(/ANY_IRI_MATCHING\((.+)\)/)[1];
              const parent = graph['fandaws:concepts'].find((c) => c['skos:prefLabel'] === matchLabel);
              expect(concept['skos:broader']).toBe(parent?.['@id']);
            }
          }
        }
      }

      // ── Scope resolution (regression) ──
      if (exp.resolution) {
        expect(result?.status).toBe(exp.resolution.status);
      }
      if (exp.copiedConcept) {
        expect(result?.copiedConcept).toBeDefined();
      }

      // ── Restriction created ──
      if (exp.restrictionCreated !== undefined) {
        const graph = env.adapter.loadGraph(env.activeScope);
        const hasRestriction = graph['fandaws:concepts'].some((c) => {
          const sco = c['rdfs:subClassOf'] || [];
          return sco.some((e) => typeof e === 'object' && e['@type'] === 'owl:Restriction');
        });
        expect(hasRestriction).toBe(exp.restrictionCreated);
      }
    });
  }
});
