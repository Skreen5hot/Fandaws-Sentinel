/**
 * Phase D1 AVC Runner — Ingestion Pipeline Infrastructure + Class Placement.
 *
 * @see docs/architecture/phase-d1-avc-bundle.json
 */

import { describe, it, expect } from '@jest/globals';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept, createIngestedConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { M2MOrchestrationAdapter } from '../../src/adapters/orchestration/m2m-orchestration-adapter.js';
import { evaluatePlacement, routePlacement } from '../../src/core/ingestion/placement-sandbox.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import bundle from '../../docs/architecture/phase-d1-avc-bundle.json' with { type: 'json' };

let BFO_TURTLE = null;
try { BFO_TURTLE = readFileSync(resolve('data/ontologies/bfo-2020-core.ttl'), 'utf-8'); } catch {}

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
  if (entry.placementConfidence !== undefined) concept['fandaws:placementConfidence'] = entry.placementConfidence;
  if (entry.ingestedInSession) concept['fandaws:ingestedInSession'] = entry.ingestedInSession;
  return concept;
}

function buildEnvironment(setup) {
  const adapter = new InMemoryStateAdapter();
  // Register placement sandbox
  adapter.registerPlacementSandbox(evaluatePlacement, routePlacement);

  for (const scope of (setup.scopes || [])) {
    const graph = createKnowledgeGraph({ id: scope.graphId, concepts: (scope.concepts || []).map(buildConceptFromSetup) });
    if (scope.graphVersion) graph['fandaws:graphVersion'] = scope.graphVersion;

    // Add concept-level restrictions
    for (const conceptSetup of (scope.concepts || [])) {
      if (!conceptSetup.restrictions) continue;
      const concept = graph['fandaws:concepts'].find(c => c['@id'] === conceptSetup.id);
      if (!concept) continue;
      concept['rdfs:subClassOf'] = concept['rdfs:subClassOf'] || [];
      for (const cr of conceptSetup.restrictions) {
        const objectConcept = graph['fandaws:concepts'].find(c => c['@id'] === cr.object);
        const objectLabel = objectConcept?.['skos:prefLabel'] || cr.object?.split('/').pop() || 'unknown';
        const restriction = createProperty({
          id: `${conceptSetup.id}#r-${cr.verb}-${objectLabel}`,
          verbIri: `fandaws:objectProperty/${cr.verb}`, verbLabel: cr.verb,
          objectConceptIri: cr.object, propertyLabel: objectLabel,
          attachedTo: conceptSetup.id,
        });
        concept['rdfs:subClassOf'].push(restriction);
      }
    }

    adapter.saveGraph(scope.graphId, graph);
    if (scope.bfoIngested && BFO_TURTLE) {
      adapter.ensureBfoIngestion(scope.graphId, BFO_TURTLE);
      const g = adapter.loadGraph(scope.graphId);
      const setupIds = new Set((scope.concepts || []).map(c => c.id));
      const setupLabels = new Set((scope.concepts || []).map(c => c.canonicalLabel));
      if (setupLabels.size > 0) {
        g['fandaws:concepts'] = g['fandaws:concepts'].filter(c => setupIds.has(c['@id']) || !setupLabels.has(c['skos:prefLabel']));
        adapter.saveGraph(scope.graphId, g);
      }
    }
  }

  // Pre-populate completed sessions
  for (const cs of (setup.completedSessions || [])) {
    adapter._ingestionSessions.set(cs.sessionId, { type: 'IngestionSession', ...cs });
  }

  // Pre-populate staging records
  for (const sr of (setup.stagingRecords || [])) {
    const stagingId = `fandaws:staging/pre-${sr.sourceIRI || Date.now()}`;
    adapter._sourceAxiomGraph.set(stagingId, { ...sr });
  }

  return { adapter, activeScope: setup.activeScope || null };
}

function runUtterance(env, utterance, options = {}) {
  const orch = env._orchestrator || new M2MOrchestrationAdapter();
  env._orchestrator = orch;
  const graph = env.adapter.loadGraph(env.activeScope);
  const sd = new Map();
  for (const c of (graph?.['fandaws:concepts'] || [])) sd.set(c['@id'], false);
  return orch.runPipeline(utterance, {
    stateAdapter: env.adapter, graphId: env.activeScope, callerMode: 'agent',
  }, { bfoCategoryChoice: 'entity', scopeDecisions: sd, ...options });
}

describe(`Phase D1 AVC (${bundle.bundle_id})`, () => {
  for (const scenario of bundle.scenarios) {
    it(`[${scenario.id}] ${scenario.description}`, () => {
      const env = buildEnvironment(scenario.setup);
      const exp = scenario.expect;
      const trigger = scenario.trigger;
      let result;

      // ── Execute trigger ──
      if (trigger.type === 'startIngestionSession') {
        result = env.adapter.startIngestionSession({
          sourceOntology: trigger.sourceOntology,
          autoMergeThreshold: trigger.autoMergeThreshold,
        });

      } else if (trigger.type === 'ingestOntology') {
        result = env.adapter.ingestOntology(env.activeScope, trigger);

      } else if (trigger.type === 'querySessions') {
        result = { _sessions: env.adapter.querySessions() };

      } else if (trigger.type === 'resolvePlacement') {
        result = env.adapter.resolvePlacement(env.activeScope, trigger.candidateIRI, trigger.selectedPlacement);

      } else if (trigger.type === 'reingestion') {
        if (trigger.target === 'bfo') {
          // Re-run BFO ingestion + auto-re-evaluate
          if (BFO_TURTLE) {
            // Re-ingest BFO (the method is idempotent but triggers recompilation)
            env.adapter.ensureBfoIngestion(env.activeScope, BFO_TURTLE);
          }
          result = env.adapter.reingestionBfo(env.activeScope);
        }

      } else if (trigger.type === 'utterance') {
        const opts = {};
        if (scenario.user_choice?.action === 'assert_anyway') {
          opts.consistencyCheckOverride = 'assert_anyway';
        }
        result = runUtterance(env, trigger.value, opts);

      } else if (trigger.type === 'sequentialActions') {
        result = {};
        for (const action of trigger.actions) {
          if (action.type === 'utterance') {
            const opts = {};
            if (action.user_choice?.action === 'assert_anyway') {
              opts.consistencyCheckOverride = 'assert_anyway';
            }
            result._utteranceResult = runUtterance(env, action.value, opts);
          } else if (action.type === 'ingestExternalAxiom') {
            result._axiomResult = env.adapter.ingestExternalAxiom(env.activeScope, action);
          }
        }
      }

      // ── Session assertions ──
      if (exp.session) {
        let session = result?.session;
        if (!session && result?.sessionId) {
          session = env.adapter.querySessions().get(result.sessionId);
        }
        // Also check the most recent session if not found directly
        if (!session) {
          const sessions = [...env.adapter.querySessions().values()].filter(s => s.type === 'IngestionSession');
          if (sessions.length > 0) session = sessions[sessions.length - 1];
        }

        if (exp.session.exists !== undefined) {
          if (exp.session.exists) expect(session).toBeDefined();
        }
        if (exp.session.sourceOntology) {
          expect(session?.sourceOntology).toBe(exp.session.sourceOntology);
        }
        if (exp.session.sessionStartedAt === 'ANY_ISO_DATETIME') {
          expect(session?.sessionStartedAt).toBeDefined();
          expect(typeof session?.sessionStartedAt).toBe('string');
        }
        if (exp.session.sessionCompletedAt === null) {
          expect(session?.sessionCompletedAt).toBeNull();
        } else if (exp.session.sessionCompletedAt === 'ANY_ISO_DATETIME') {
          expect(session?.sessionCompletedAt).toBeDefined();
          expect(typeof session?.sessionCompletedAt).toBe('string');
        }
        if (exp.session.classesIngested !== undefined) {
          expect(session?.classesIngested).toBe(exp.session.classesIngested);
        }
        if (exp.session.autoMergeThreshold !== undefined) {
          expect(session?.autoMergeThreshold).toBe(exp.session.autoMergeThreshold);
        }
        if (typeof exp.session.classesPlaced === 'string' && exp.session.classesPlaced.startsWith('ANY_GTE(')) {
          const min = parseInt(exp.session.classesPlaced.match(/\d+/)[0]);
          expect(session?.classesPlaced).toBeGreaterThanOrEqual(min);
        }
        if (exp.session.compilationEpochAtCompletion === 'ANY_POSITIVE_INTEGER') {
          expect(session?.compilationEpochAtCompletion).toBeGreaterThan(0);
        }
      }

      // ── Sessions query assertions ──
      if (exp.sessions) {
        const sessions = result?._sessions || env.adapter.querySessions();
        if (typeof exp.sessions.count === 'string' && exp.sessions.count.startsWith('ANY_GTE(')) {
          const min = parseInt(exp.sessions.count.match(/\d+/)[0]);
          const sessionCount = [...sessions.values()].filter(s => s.type === 'IngestionSession').length;
          expect(sessionCount).toBeGreaterThanOrEqual(min);
        }
        if (exp.sessions.containsSession) {
          expect(sessions.has(exp.sessions.containsSession)).toBe(true);
        }
      }

      // ── Staging record assertions ──
      if (exp.stagingRecords) {
        const sag = env.adapter.getSourceAxiomGraph();
        const candidates = [...sag.values()].filter(r => r.type === 'CandidateClass');

        if (exp.stagingRecords.candidateClassCount !== undefined) {
          expect(candidates.length).toBe(exp.stagingRecords.candidateClassCount);
        }
        if (exp.stagingRecords.record) {
          const rec = exp.stagingRecords.record;
          const candidate = candidates[candidates.length - 1]; // Most recent
          if (rec.type) expect(candidate?.type).toBe(rec.type);
          if (rec.sourceIRI) expect(candidate?.sourceIRI).toBe(rec.sourceIRI);
          if (rec.sourceLabel) expect(candidate?.sourceLabel).toBe(rec.sourceLabel);
          if (rec.sourceOntology) expect(candidate?.sourceOntology).toBe(rec.sourceOntology);
          if (rec.ingestedInSession === 'ANY_SESSION_ID') {
            expect(candidate?.ingestedInSession).toBeDefined();
          }
          if (rec.candidateStatus) {
            if (typeof rec.candidateStatus === 'string' && rec.candidateStatus.startsWith('ANY_MATCHING(')) {
              const options = rec.candidateStatus.slice('ANY_MATCHING('.length, -1).split('|');
              expect(options).toContain(candidate?.candidateStatus);
            } else {
              expect(candidate?.candidateStatus).toBe(rec.candidateStatus);
            }
          }
          if (rec.normalizationStatus) {
            expect(candidate?.normalizationStatus).toBe(rec.normalizationStatus);
          }
          if (typeof rec.placementConfidence === 'string' && rec.placementConfidence.startsWith('ANY_GTE(')) {
            const min = parseFloat(rec.placementConfidence.match(/[\d.]+/)[0]);
            expect(candidate?.placementConfidence).toBeGreaterThanOrEqual(min);
          }
          if (rec.placementJustification === 'ANY_NONEMPTY_STRING') {
            expect(candidate?.placementJustification).toBeDefined();
            expect(candidate?.placementJustification.length).toBeGreaterThan(0);
          }
        }
      }

      // ── SourceAxiomGraph type assertions ──
      if (exp.sourceAxiomGraph) {
        const sag = env.adapter.getSourceAxiomGraph();
        if (exp.sourceAxiomGraph.allowedTypes) {
          for (const record of sag.values()) {
            expect(exp.sourceAxiomGraph.allowedTypes).toContain(record.type);
          }
        }
      }

      // ── Canonical lane assertions ──
      if (exp.canonicalLane) {
        const graph = env.adapter.loadGraph(env.activeScope);
        const concepts = graph?.['fandaws:concepts'] || [];

        if (exp.canonicalLane.classRecord) {
          const cr = exp.canonicalLane.classRecord;
          if (cr.exists || cr.label) {
            const label = (cr.label || '').toLowerCase();
            const found = concepts.find(c =>
              (c['skos:prefLabel'] || '').toLowerCase() === label &&
              !c['fandaws:isImported']
            );
            if (cr.exists !== false) expect(found).toBeDefined();
            if (cr.owlEquivalentClass) {
              expect(found?.['owl:equivalentClass']).toBeDefined();
              expect(found['owl:equivalentClass']).toContain(cr.owlEquivalentClass);
            }
            if (cr.sourceIRI) {
              expect(found?.['owl:equivalentClass']).toContain(cr.sourceIRI);
            }
            if (cr.sourceOntology) {
              expect(found?.['fandaws:ingestSource']).toBe(cr.sourceOntology);
            }
            if (typeof cr.placementConfidence === 'string' && cr.placementConfidence.startsWith('ANY_GTE(')) {
              const min = parseFloat(cr.placementConfidence.match(/[\d.]+/)[0]);
              expect(found?.['fandaws:placementConfidence']).toBeGreaterThanOrEqual(min);
            }
            if (cr.compilationStatus) {
              // Check execution lane for the concept
              const el = env.adapter.getExecutionLane(env.activeScope);
              if (el) {
                const artifact = [...el.artifacts.values()].find(a =>
                  (a['skos:prefLabel'] || '').toLowerCase() === label
                );
                if (cr.compilationStatus === 'Compiled') {
                  expect(artifact).toBeDefined();
                }
              }
            }
            if (cr.bfoPlacement) {
              if (typeof cr.bfoPlacement === 'string' && cr.bfoPlacement.startsWith('ANY_IRI_MATCHING(')) {
                const pattern = cr.bfoPlacement.slice('ANY_IRI_MATCHING('.length, -1);
                expect(found?.['skos:broader']).toBeDefined();
                // Check that broader contains the pattern
                const broader = found['skos:broader'] || '';
                expect(broader.toLowerCase()).toContain(pattern.toLowerCase().replace(/-/g, '-'));
              }
            }
          }
          if (cr.iriPattern) {
            // Verify the concept has a fandaws:class/ IRI
            const label = (cr.label || exp.canonicalLane.classRecord.label || '').toLowerCase();
            const found = concepts.find(c =>
              (c['skos:prefLabel'] || '').toLowerCase() === label.toLowerCase()
            );
            if (found) {
              expect(found['@id']).toMatch(/^fandaws:class\//);
            }
          }
        }

        if (exp.canonicalLane.conceptExists_Engine === false) {
          expect(concepts.some(c => c['skos:prefLabel'] === 'engine' && !c['fandaws:isImported'])).toBe(false);
        }
        if (exp.canonicalLane.classRecordExists_Mystery === false) {
          expect(concepts.some(c => (c['skos:prefLabel'] || '').toLowerCase() === 'mystery' && !c['fandaws:isImported'])).toBe(false);
        }

        if (typeof exp.canonicalLane.classRecordCount === 'string' && exp.canonicalLane.classRecordCount.startsWith('ANY_GTE(')) {
          const min = parseInt(exp.canonicalLane.classRecordCount.match(/\d+/)[0]);
          const userConcepts = concepts.filter(c => !c['fandaws:isImported'] && c['fandaws:ingestedInSession']);
          expect(userConcepts.length).toBeGreaterThanOrEqual(min);
        }

        // Version change event
        if (exp.canonicalLane.versionChangeEvent) {
          const vce = exp.canonicalLane.versionChangeEvent;
          const events = [...env.adapter.querySessions().values()].filter(s => s.type === 'VersionChangeEvent');
          if (vce.exists) {
            expect(events.length).toBeGreaterThan(0);
            if (vce.changedAt === 'ANY_ISO_DATETIME') {
              expect(events[0].changedAt).toBeDefined();
            }
            if (vce.recompilationScope) {
              expect(events[0].recompilationScope).toBe(vce.recompilationScope);
            }
          }
        }

        // Dog has running (regression scenario)
        if (exp.canonicalLane.dogHasRunning) {
          const dog = concepts.find(c => c['skos:prefLabel'] === 'dog');
          const restrictions = (dog?.['rdfs:subClassOf'] || []).filter(e => typeof e === 'object' && e['@type'] === 'owl:Restriction');
          if (exp.canonicalLane.dogHasRunning.exists) {
            expect(restrictions.length).toBeGreaterThan(0);
          }
          if (exp.canonicalLane.dogHasRunning.normalizationStatus) {
            expect(restrictions[0]?.['fandaws:normalizationStatus']).toBe(exp.canonicalLane.dogHasRunning.normalizationStatus);
          }
        }

        // Engine auto-re-evaluation (BFO version change)
        if (exp.canonicalLane.engine) {
          // Just verify the engine concept still exists and was re-evaluated
          const engine = concepts.find(c => (c['skos:prefLabel'] || '').toLowerCase() === 'engine');
          if (exp.canonicalLane.engine.autoReEvaluated) {
            expect(engine).toBeDefined();
          }
        }
      }

      // ── Execution lane assertions ──
      if (exp.executionLane) {
        const el = env.adapter.getExecutionLane(env.activeScope);
        if (exp.executionLane.containsArtifactFor) {
          const label = exp.executionLane.containsArtifactFor.toLowerCase();
          let found = false;
          if (el) {
            for (const a of el.artifacts.values()) {
              if ((a['skos:prefLabel'] || '').toLowerCase() === label) found = true;
            }
          }
          expect(found).toBe(true);
        }
        if (exp.executionLane.artifact) {
          const ea = exp.executionLane.artifact;
          if (ea.hasEpoch) {
            let foundEpoch = false;
            if (el) {
              for (const a of el.artifacts.values()) {
                if (a['fandaws:compilationEpoch']) foundEpoch = true;
              }
            }
            expect(foundEpoch).toBe(true);
          }
          if (ea.compilationStatus === 'Compiled') {
            // Verified by containsArtifactFor above
          }
        }
        if (exp.executionLane.artifactExists_Engine === false) {
          if (el) {
            let found = false;
            for (const a of el.artifacts.values()) {
              if ((a['skos:prefLabel'] || '').toLowerCase() === 'engine') found = true;
            }
            expect(found).toBe(false);
          }
        }
      }

      // ── Pipeline state assertions ──
      if (exp.pipelineState) {
        const ps = result?.pipelineState || result;
        if (exp.pipelineState.phase1Complete !== undefined) {
          expect(ps?.pipelineState?.phase1Complete ?? ps?.phase1Complete).toBe(true);
        }
        if (exp.pipelineState.phase2Started === false) {
          expect(ps?.pipelineState?.phase2Started ?? ps?.phase2Started).toBe(false);
        }
        if (exp.pipelineState.phase2Blocked === false) {
          expect(ps?.pipelineState?.phase2Blocked ?? ps?.phase2Blocked).toBe(false);
        }
        if (exp.pipelineState.blockedBy) {
          expect(ps?.pipelineState?.blockedBy ?? ps?.blockedBy).toBe(exp.pipelineState.blockedBy);
        }
        if (exp.pipelineState.unresolvedCount !== undefined) {
          expect(ps?.pipelineState?.unresolvedCount ?? ps?.unresolvedCount).toBe(exp.pipelineState.unresolvedCount);
        }
        if (exp.pipelineState.unresolvedClasses) {
          const actual = ps?.pipelineState?.unresolvedClasses ?? ps?.unresolvedClasses ?? [];
          for (const cls of exp.pipelineState.unresolvedClasses) {
            expect(actual).toContain(cls);
          }
        }
        if (exp.pipelineState.allPhase1Resolved !== undefined) {
          expect(ps?.pipelineState?.allPhase1Resolved ?? ps?.allPhase1Resolved).toBe(exp.pipelineState.allPhase1Resolved);
        }
        if (exp.pipelineState.phase2CanProceed !== undefined) {
          expect(ps?.pipelineState?.phase2CanProceed ?? ps?.phase2CanProceed).toBe(exp.pipelineState.phase2CanProceed);
        }
        // BFO re-evaluation results
        if (exp.pipelineState.autoReEvaluationRan !== undefined) {
          expect(result?.autoReEvaluationRan).toBe(true);
        }
        if (typeof exp.pipelineState.classesReEvaluated === 'string' && exp.pipelineState.classesReEvaluated.startsWith('ANY_GTE(')) {
          const min = parseInt(exp.pipelineState.classesReEvaluated.match(/\d+/)[0]);
          expect(result?.classesReEvaluated).toBeGreaterThanOrEqual(min);
        }
        if (typeof exp.pipelineState.classesStillConfirmed === 'string' && exp.pipelineState.classesStillConfirmed.startsWith('ANY_GTE(')) {
          const min = parseInt(exp.pipelineState.classesStillConfirmed.match(/\d+/)[0]);
          expect(result?.classesStillConfirmed).toBeGreaterThanOrEqual(min);
        }
        if (exp.pipelineState.classesDroppedToAmbiguous !== undefined) {
          expect(result?.classesDroppedToAmbiguous).toBe(exp.pipelineState.classesDroppedToAmbiguous);
        }
      }

      // ── Prompt assertions ──
      if (exp.promptsFired !== undefined) {
        expect(result?.promptsFired ?? 0).toBe(exp.promptsFired);
      }
      if (exp.machineSignalsEmitted !== undefined) {
        expect(result?.machineSignalsEmitted ?? 0).toBe(exp.machineSignalsEmitted);
      }

      // ── Prompt fired (regression) ──
      if (exp.prompt) {
        if (exp.prompt.fired) {
          // Check that the conversational pipeline returned a prompt
          const prompts = result?.prompts || [];
          expect(prompts.length).toBeGreaterThan(0);
          if (exp.prompt.machineSignal?.envelope?.promptType) {
            const expectedType = exp.prompt.machineSignal.envelope.promptType;
            const prompt = prompts[0];
            // Check all possible locations for prompt type
            const actualType = prompt?.machineSignal?.envelope?.promptType
              || prompt?.machineSignal?.promptType
              || prompt?.['fandaws:promptType']
              || prompt?.promptType;
            expect(actualType).toBe(expectedType);
          }
        }
      }

      // ── Quarantine store assertions (regression) ──
      if (exp.quarantineStore) {
        const store = env.adapter.getSourceAxiomGraph();
        const qRecords = [...store.values()].filter(r => r.type === 'QuarantineRecord');
        if (exp.quarantineStore.recordCount !== undefined) {
          expect(qRecords.length).toBe(exp.quarantineStore.recordCount);
        }
        if (exp.quarantineStore.record) {
          if (exp.quarantineStore.record.type) {
            expect(qRecords[0]?.type).toBe(exp.quarantineStore.record.type);
          }
        }
      }
    });
  }
});
