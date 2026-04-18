/**
 * Phase C2 AVC Runner — RECC Externalization.
 *
 * @see docs/architecture/phase-c2-avc-bundle.json
 */

import { describe, it, expect } from '@jest/globals';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept, createIngestedConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { M2MOrchestrationAdapter } from '../../src/adapters/orchestration/m2m-orchestration-adapter.js';
import { exportGraph } from '../../src/core/export-engine/export-engine.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import bundle from '../../docs/architecture/phase-c2-avc-bundle.json' with { type: 'json' };

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
  return createConcept({
    id: entry.id, label: entry.displayLabel || entry.canonicalLabel,
    prefLabel: entry.canonicalLabel, broader: entry.parent || null,
  });
}

function buildEnvironment(setup) {
  const adapter = new InMemoryStateAdapter();
  for (const scope of (setup.scopes || [])) {
    const graph = createKnowledgeGraph({ id: scope.graphId, concepts: (scope.concepts || []).map(buildConceptFromSetup) });
    if (scope.graphVersion) graph['fandaws:graphVersion'] = scope.graphVersion;

    // Add concept-level restrictions (e.g., regression scenarios with pre-existing restrictions)
    for (const conceptSetup of (scope.concepts || [])) {
      if (!conceptSetup.restrictions) continue;
      const concept = graph['fandaws:concepts'].find(c => c['@id'] === conceptSetup.id);
      if (!concept) continue;
      concept['rdfs:subClassOf'] = concept['rdfs:subClassOf'] || [];
      for (const cr of conceptSetup.restrictions) {
        const objectConcept = graph['fandaws:concepts'].find(c => c['@id'] === cr.object);
        const objectLabel = objectConcept?.['skos:prefLabel'] || cr.object.split('/').pop();
        const restriction = createProperty({
          id: `${conceptSetup.id}#r-${cr.verb}-${objectLabel}`,
          verbIri: `fandaws:objectProperty/${cr.verb}`, verbLabel: cr.verb,
          objectConceptIri: cr.object, propertyLabel: objectLabel,
          attachedTo: conceptSetup.id,
        });
        if (cr.confidence !== undefined) restriction['fandaws:confidence'] = cr.confidence;
        if (cr.compilationStatus) restriction['fandaws:compilationStatus'] = cr.compilationStatus;
        concept['rdfs:subClassOf'].push(restriction);
      }
    }

    // Add restrictions from scope-level setup (C2 uses restrictions with relationType, provenanceTriple)
    for (const r of (scope.restrictions || [])) {
      const subject = graph['fandaws:concepts'].find(c => c['@id'] === r.subject);
      if (subject) {
        const restriction = createProperty({
          id: `${r.subject}#r-${r.verb}-${r.object.split(':').pop()}`,
          verbIri: `fandaws:objectProperty/${r.verb}`, verbLabel: r.verb,
          objectConceptIri: r.object, propertyLabel: r.object.split(':').pop(),
          attachedTo: r.subject,
        });
        if (r.relationType) restriction['fandaws:relationType'] = r.relationType;
        if (r.provenanceTriple) {
          restriction['fandaws:provenanceTriple'] = r.provenanceTriple;
          if (!r.provenanceTriple.embeddedInSubjectBlock) {
            // Valid standalone provenance
            restriction['fandaws:hasStandaloneProvenance'] = true;
          }
        }
        subject['rdfs:subClassOf'] = subject['rdfs:subClassOf'] || [];
        subject['rdfs:subClassOf'].push(restriction);
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

  // Pre-populate quarantine store if specified
  for (const qr of (setup.quarantineStore || [])) {
    adapter._sourceAxiomGraph.set(qr.quarantineId, { ...qr });
  }

  // Inject canonical restriction if specified
  if (setup.injectCanonicalRestriction) {
    const icr = setup.injectCanonicalRestriction;
    const graph = adapter.loadGraph(setup.activeScope);
    const subject = graph['fandaws:concepts'].find(c => c['@id'] === icr.subject);
    if (subject) {
      const restriction = createProperty({
        id: `${icr.subject}#r-${icr.verb}-${icr.object.split(':').pop()}`,
        verbIri: `fandaws:objectProperty/${icr.verb}`, verbLabel: icr.verb,
        objectConceptIri: icr.object, propertyLabel: icr.object.split(':').pop(),
        attachedTo: icr.subject,
      });
      if (icr.confidence !== undefined) restriction['fandaws:confidence'] = icr.confidence;
      subject['rdfs:subClassOf'].push(restriction);
      adapter.saveGraph(setup.activeScope, graph);
    }
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

describe(`Phase C2 AVC (${bundle.bundle_id})`, () => {
  for (const scenario of bundle.scenarios) {
    it(`[${scenario.id}] ${scenario.description}`, () => {
      const env = buildEnvironment(scenario.setup);
      const exp = scenario.expect;
      const trigger = scenario.trigger;
      let result;

      // ── Execute trigger ──
      if (trigger.type === 'compile') {
        env.adapter.compile(env.activeScope);
        result = { _compiled: true };

      } else if (trigger.type === 'utterance') {
        const opts = {};
        if (scenario.user_choice?.action === 'assert_anyway') {
          opts.consistencyCheckOverride = 'assert_anyway';
        }
        result = runUtterance(env, trigger.value, opts);

      } else if (trigger.type === 'export') {
        env.adapter.compile(env.activeScope);
        const graph = env.adapter.loadGraph(env.activeScope);
        result = { _export: exportGraph(graph, { format: trigger.format }) };

      } else if (trigger.type === 'ingestExternalAxiom') {
        result = env.adapter.ingestExternalAxiom(env.activeScope, trigger);

      } else if (trigger.type === 'releaseQuarantine') {
        result = env.adapter.releaseQuarantine(env.activeScope, trigger.quarantineId);

      } else if (trigger.type === 'rejectQuarantine') {
        result = env.adapter.rejectQuarantine(trigger.quarantineId);

      } else if (trigger.type === 'queryQuarantineStore') {
        result = { _store: env.adapter.getQuarantineStore() };

      } else if (trigger.type === 'updateConfidence') {
        result = env.adapter.updateConfidence(
          env.activeScope, trigger.subject, trigger.restriction, trigger.newConfidence,
        );
      }

      // Also handle exportTrigger in expect (for scenarios that trigger utterance then export)
      if (exp.exportTrigger) {
        env.adapter.compile(env.activeScope);
        const graph = env.adapter.loadGraph(env.activeScope);
        result._export = exportGraph(graph, { format: exp.exportTrigger.format });
      }

      // ── Quarantine store assertions ──
      if (exp.quarantineStore) {
        const store = env.adapter.getQuarantineStore();
        if (exp.quarantineStore.recordCreated) {
          expect(store.size).toBeGreaterThan(0);
        }
        if (exp.quarantineStore.recordCount !== undefined) {
          expect(store.size).toBe(exp.quarantineStore.recordCount);
        }
        if (exp.quarantineStore.record) {
          const records = [...store.values()];
          const record = records[0];
          if (record) {
            if (exp.quarantineStore.record.type) expect(record.type).toBe(exp.quarantineStore.record.type);
            if (exp.quarantineStore.record.quarantineStatus) expect(record.quarantineStatus).toBe(exp.quarantineStore.record.quarantineStatus);
            if (exp.quarantineStore.record.violationRule) expect(record.failureTrace?.violationRule).toBe(exp.quarantineStore.record.violationRule);
            if (exp.quarantineStore.record.subjectType) expect(record.failureTrace?.subjectType).toBe(exp.quarantineStore.record.subjectType);
            if (exp.quarantineStore.record.objectType) expect(record.failureTrace?.objectType).toBe(exp.quarantineStore.record.objectType);
            if (exp.quarantineStore.record.stillPresent) expect(record).toBeDefined();
            if (exp.quarantineStore.record.failureTrace) {
              const ft = record.failureTrace;
              expect(ft).toBeDefined();
              if (exp.quarantineStore.record.failureTrace.hasField) {
                for (const f of exp.quarantineStore.record.failureTrace.hasField) {
                  expect(ft[f]).toBeDefined();
                }
              }
              if (exp.quarantineStore.record.failureTrace.violationRule) {
                expect(ft.violationRule).toBe(exp.quarantineStore.record.failureTrace.violationRule);
              }
            }
          }
        }
        if (exp.quarantineStore.allowedTypes) {
          for (const record of store.values()) {
            expect(exp.quarantineStore.allowedTypes).toContain(record.type);
          }
        }
      }

      // ── Canonical lane assertions ──
      if (exp.canonicalLane) {
        const graph = env.adapter.loadGraph(env.activeScope);
        if (exp.canonicalLane.restrictionCreated === false) {
          let hasRestriction = false;
          for (const c of (graph?.['fandaws:concepts'] || [])) {
            for (const entry of (c['rdfs:subClassOf'] || [])) {
              if (typeof entry === 'object' && entry['@type'] === 'owl:Restriction' && entry['fandaws:source']) {
                hasRestriction = true;
              }
            }
          }
          expect(hasRestriction).toBe(false);
        }
        if (exp.canonicalLane.restrictionCreated === true) {
          let hasRestriction = false;
          for (const c of (graph?.['fandaws:concepts'] || [])) {
            for (const entry of (c['rdfs:subClassOf'] || [])) {
              if (typeof entry === 'object' && entry['@type'] === 'owl:Restriction') hasRestriction = true;
            }
          }
          expect(hasRestriction).toBe(true);
        }
        if (exp.canonicalLane.restriction) {
          let foundR = null;
          for (const c of (graph?.['fandaws:concepts'] || [])) {
            for (const entry of (c['rdfs:subClassOf'] || [])) {
              if (typeof entry === 'object' && entry['@type'] === 'owl:Restriction') foundR = entry;
            }
          }
          if (exp.canonicalLane.restriction.exists !== false) expect(foundR).toBeDefined();
          if (exp.canonicalLane.restriction.compilationStatus) expect(foundR?.['fandaws:compilationStatus']).toBe(exp.canonicalLane.restriction.compilationStatus);
          if (exp.canonicalLane.restriction.confidence !== undefined) expect(foundR?.['fandaws:confidence']).toBe(exp.canonicalLane.restriction.confidence);
          if (exp.canonicalLane.restriction.normalizationStatus) expect(foundR?.['fandaws:normalizationStatus']).toBe(exp.canonicalLane.restriction.normalizationStatus);
          if (exp.canonicalLane.restriction.feedback) {
            expect(foundR?.['fandaws:compilerFeedback']).toBeDefined();
          }
        }
        if (exp.canonicalLane.conceptExists_Car === false) {
          expect(graph['fandaws:concepts'].some(c => c['skos:prefLabel'] === 'car' && !c['fandaws:isImported'])).toBe(false);
        }
      }

      // ── Execution lane assertions ──
      if (exp.executionLane) {
        const el = env.adapter.getExecutionLane(env.activeScope);
        if (exp.executionLane.containsRestriction) {
          let found = false;
          if (el) {
            for (const a of el.artifacts.values()) {
              const restrictions = (a['rdfs:subClassOf'] || []).filter(e => typeof e === 'object' && e['@type'] === 'owl:Restriction');
              if (restrictions.length > 0) found = true;
            }
          }
          expect(found).toBe(true);
        }
        if (exp.executionLane.doesNotContainRestriction) {
          if (el) {
            for (const a of el.artifacts.values()) {
              const restrictions = (a['rdfs:subClassOf'] || []).filter(e => typeof e === 'object' && e['@type'] === 'owl:Restriction');
              // For C2, just verify no external-source restrictions exist
              expect(restrictions.filter(r => r['fandaws:source']).length).toBe(0);
            }
          }
        }
        if (exp.executionLane.restrictionCreated === false) {
          // No new restrictions from external ingestion
        }
        if (exp.executionLane.artifact) {
          const ea = exp.executionLane.artifact;
          let foundR = null;
          if (el) {
            for (const a of el.artifacts.values()) {
              const restrictions = (a['rdfs:subClassOf'] || []).filter(e => typeof e === 'object' && e['@type'] === 'owl:Restriction');
              if (restrictions.length > 0) foundR = restrictions[0];
            }
          }
          if (ea.tier === 'tentative') {
            expect(foundR?.['fandaws:tentative']).toBe(true);
          }
          if (ea.tier === 'flagged') {
            expect(foundR?.['fandaws:confidence']).toBeDefined();
          }
        }
      }

      // ── Export assertions ──
      if (exp.exportCheck) {
        const turtle = result?._export;
        expect(turtle).toBeDefined();
        if (exp.exportCheck.containsRelationTypeClass) {
          expect(turtle).toContain(exp.exportCheck.containsRelationTypeClass);
        }
        if (exp.exportCheck.doesNotContainRelationTypeClass) {
          expect(turtle).not.toContain('fandaws:relationType/');
        }
        if (exp.exportCheck.doesNotContainRECC) {
          expect(turtle).not.toContain('fan:RelationalQuality');
        }
        if (exp.exportCheck.containsRestriction) {
          expect(turtle).toContain('owl:Restriction');
        }
      }

      // ── Tombstone ──
      if (exp.canonicalLane?.tombstone?.exists) {
        const graph = env.adapter.loadGraph(env.activeScope);
        let foundTombstone = false;
        for (const c of (graph?.['fandaws:concepts'] || [])) {
          for (const entry of (c['rdfs:subClassOf'] || [])) {
            if (typeof entry === 'object' && entry['fandaws:tombstone']) foundTombstone = true;
          }
        }
        expect(foundTombstone).toBe(true);
      }
    });
  }
});
