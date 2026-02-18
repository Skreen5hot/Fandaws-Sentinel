/**
 * Epistemic Register Service — unit tests.
 *
 * Covers: full 6-step pipeline traces for each BFO category,
 * session domain override, teleological flag-only, fallback,
 * bearer/role integration, missing graph graceful degradation.
 */

import { describe, it, expect } from '@jest/globals';
import { BFO } from '../../src/core/knowledge-engine/bfo-heuristic.js';
import { REGISTERS, ROUTING_METHODS } from '../../src/types/routing-record.js';
import { routeToRegister } from '../../src/core/epistemic-register/epistemic-register.js';

// ── Test fixtures ──

function makeGraph(concepts = []) {
  return { '@type': 'fandaws:KnowledgeGraph', 'fandaws:concepts': concepts };
}

function makeConcept(id, bfoCategory = null, broader = null) {
  const concept = { '@id': id, '@type': ['owl:Class', 'skos:Concept'], 'rdfs:subClassOf': [] };
  if (bfoCategory) concept['rdfs:subClassOf'].push(bfoCategory);
  if (broader) concept['skos:broader'] = broader;
  return concept;
}

function makeRestriction(id = 'fandaws:restriction/test/r1', attachedTo = 'fandaws:class/test/dog', property = 'fur') {
  return {
    '@id': id,
    '@type': 'owl:Restriction',
    'owl:onProperty': property,
    'owl:hasValue': true,
    'fandaws:attachedTo': attachedTo,
    'fandaws:restrictionKind': 'property',
  };
}

function makeSession(domain = null) {
  const session = { '@type': 'fandaws:ConversationSession' };
  if (domain) session['fandaws:domain'] = domain;
  return session;
}

describe('Epistemic Register Service', () => {
  describe('routeToRegister — return shape', () => {
    it('returns register, routingRecord, and flags', () => {
      const restriction = makeRestriction();
      const result = routeToRegister(restriction);

      expect(result).toHaveProperty('register');
      expect(result).toHaveProperty('routingRecord');
      expect(result).toHaveProperty('flags');
      expect(Array.isArray(result.flags)).toBe(true);
    });

    it('routingRecord has correct @type', () => {
      const result = routeToRegister(makeRestriction());
      expect(result.routingRecord['@type']).toBe('fandaws:RegisterRoutingRecord');
    });

    it('routingRecord has deterministic @id', () => {
      const r = makeRestriction('fandaws:restriction/test/stable');
      const result1 = routeToRegister(r);
      const result2 = routeToRegister(r);
      expect(result1.routingRecord['@id']).toBe(result2.routingRecord['@id']);
    });
  });

  describe('Step 2: Session domain override', () => {
    it('routes to R1 when session domain is mathematics and no BFO (ERS-14)', () => {
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/number', 'factors');
      const number = makeConcept('fandaws:class/test/number'); // no BFO alignment
      const graph = makeGraph([number]);
      const session = makeSession('mathematics');

      const result = routeToRegister(restriction, { graph, session });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.DOMAIN);
    });

    it('routes to R1 when session domain is geometry', () => {
      const restriction = makeRestriction();
      const session = makeSession('geometry');
      const result = routeToRegister(restriction, { session });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
    });

    it('routes to R1 when session domain is formal logic', () => {
      const restriction = makeRestriction();
      const session = makeSession('formal logic');
      const result = routeToRegister(restriction, { session });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
    });

    it('is case-insensitive for domain matching', () => {
      const restriction = makeRestriction();
      const session = makeSession('Mathematics');
      const result = routeToRegister(restriction, { session });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
    });

    it('does not override for non-axiomatic domains', () => {
      const restriction = makeRestriction();
      const session = makeSession('biology');
      const result = routeToRegister(restriction, { session });
      // Falls through to Step 3+ or fallback
      expect(result.register).not.toBe(REGISTERS.AXIOMATIC);
    });

    it('respects config-provided axiomatic domains', () => {
      const restriction = makeRestriction();
      const session = makeSession('physics');
      const config = { axiomaticDomains: ['physics'] };
      const result = routeToRegister(restriction, { session, config });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
    });
  });

  describe('Step 3: BFO alignment', () => {
    it('routes spatialRegion to R1', () => {
      const triangle = makeConcept('fandaws:class/test/triangle', BFO.spatialRegion);
      const graph = makeGraph([triangle]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/triangle');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.STRUCTURAL);
    });

    it('routes temporalRegion to R1', () => {
      const concept = makeConcept('fandaws:class/test/moment', BFO.temporalRegion);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/moment');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
    });

    it('routes genDepContinuant to R1', () => {
      const concept = makeConcept('fandaws:class/test/info', BFO.genDepContinuant);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/info');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.AXIOMATIC);
    });

    it('routes materialEntity to R2', () => {
      const dog = makeConcept('fandaws:class/test/dog', BFO.materialEntity);
      const graph = makeGraph([dog]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/dog');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });

    it('routes quality to R2', () => {
      const concept = makeConcept('fandaws:class/test/redness', BFO.quality);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/redness');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });

    it('routes process to R2', () => {
      const concept = makeConcept('fandaws:class/test/running', BFO.process);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/running');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });

    it('routes disposition to R2', () => {
      const concept = makeConcept('fandaws:class/test/fragility', BFO.disposition);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/fragility');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });

    it('routes function to R2 (not R3 — explicit protection)', () => {
      const concept = makeConcept('fandaws:class/test/pumping', BFO.function);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/pumping');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.register).not.toBe(REGISTERS.ASPIRATIONAL);
    });

    it('routes realizableEntity to R2', () => {
      const concept = makeConcept('fandaws:class/test/solubility', BFO.realizableEntity);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/solubility');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });

    it('routes entity to R2', () => {
      const concept = makeConcept('fandaws:class/test/thing', BFO.entity);
      const graph = makeGraph([concept]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/thing');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });
  });

  describe('Step 3b: Bearer/Role disambiguation', () => {
    it('routes structural property on Role to R2 with bearer-retarget flag', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role, 'fandaws:class/test/human');
      const human = makeConcept('fandaws:class/test/human', BFO.materialEntity);
      const graph = makeGraph([doctor, human]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/doctor', 'has_arm');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.flags).toContain('bearer-retarget');
    });

    it('routes behavioral property on Role to R2 with sensitivity flag', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role);
      const graph = makeGraph([doctor]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/doctor', 'diagnoses');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.flags).toContain('role-heightened-sensitivity');
    });

    it('routes credential property on Role to R2 without sensitivity', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role);
      const graph = makeGraph([doctor]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/doctor', 'has_license');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.flags).not.toContain('role-heightened-sensitivity');
    });
  });

  describe('Step 5: Teleological detection (flag only)', () => {
    it('adds teleological-signal flag but does NOT route to R3', () => {
      const restriction = makeRestriction();
      const result = routeToRegister(restriction, {
        utterance: 'Judges should be impartial',
      });

      expect(result.register).toBe(REGISTERS.NORMATIVE); // NOT R3
      expect(result.flags).toContain('teleological-signal');
    });

    it('does not add flag for non-teleological utterances', () => {
      const restriction = makeRestriction();
      const result = routeToRegister(restriction, {
        utterance: 'Dogs have four legs',
      });

      expect(result.flags).not.toContain('teleological-signal');
    });

    it('combines teleological flag with BFO routing (ERS-19)', () => {
      const dog = makeConcept('fandaws:class/test/dog', BFO.materialEntity);
      const graph = makeGraph([dog]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/dog');

      // BFO resolves to R2, teleological flag still fires (flag only, not route)
      const result = routeToRegister(restriction, {
        graph,
        utterance: 'Dogs should have four legs',
      });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.flags).toContain('teleological-signal');
    });
  });

  describe('Step 6: Fallback', () => {
    it('falls back to R2 when no graph provided', () => {
      const restriction = makeRestriction();
      const result = routeToRegister(restriction);

      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.FALLBACK);
    });

    it('falls back to R2 when concept has no BFO category', () => {
      const dog = makeConcept('fandaws:class/test/dog');
      const graph = makeGraph([dog]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/dog');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.FALLBACK);
    });

    it('falls back to R2 when concept not found in graph', () => {
      const graph = makeGraph([]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/nonexistent');

      const result = routeToRegister(restriction, { graph });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });
  });

  describe('priority: BFO > session domain > fallback (ERS-17)', () => {
    it('BFO alignment overrides session domain (ERS-17)', () => {
      const dog = makeConcept('fandaws:class/test/dog', BFO.materialEntity);
      const graph = makeGraph([dog]);
      const session = makeSession('geometry');
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/dog');

      const result = routeToRegister(restriction, { graph, session });
      expect(result.register).toBe(REGISTERS.NORMATIVE); // BFO materialEntity → R2
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.STRUCTURAL);
    });

    it('session domain wins when BFO is absent (ERS-17b)', () => {
      const widget = makeConcept('fandaws:class/test/widget'); // no BFO
      const graph = makeGraph([widget]);
      const session = makeSession('geometry');
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/widget');

      const result = routeToRegister(restriction, { graph, session });
      expect(result.register).toBe(REGISTERS.AXIOMATIC); // domain candidate used
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.DOMAIN);
    });
  });

  describe('never auto-routes to R3', () => {
    it('no pipeline step ever returns R3', () => {
      // Even with teleological utterance, result is R2 + flag
      const restriction = makeRestriction();
      const result = routeToRegister(restriction, {
        utterance: 'People should have purpose and duty',
      });

      expect(result.register).not.toBe(REGISTERS.ASPIRATIONAL);
    });
  });

  describe('routing record audit trail', () => {
    it('includes subjectConcept in routing record', () => {
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/dog');
      const result = routeToRegister(restriction);
      expect(result.routingRecord['fandaws:subjectConcept']).toBe('fandaws:class/test/dog');
    });

    it('includes property (restrictionIri) in routing record', () => {
      const restriction = makeRestriction('fandaws:restriction/test/r1');
      const result = routeToRegister(restriction);
      expect(result.routingRecord['fandaws:property']).toBe('fandaws:restriction/test/r1');
    });

    it('includes trigger description in routing record', () => {
      const result = routeToRegister(makeRestriction());
      expect(result.routingRecord['fandaws:trigger']).toBeTruthy();
    });

    it('includes timestamp in routing record', () => {
      const result = routeToRegister(makeRestriction());
      expect(result.routingRecord['fandaws:createdAt']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('ERS-11: Deontic flag', () => {
    it('adds deontic-role-definition flag for duty + role sensitivity', () => {
      const judge = makeConcept('fandaws:class/test/judge', BFO.role);
      const graph = makeGraph([judge]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/judge', 'adjudicates');

      const result = routeToRegister(restriction, {
        graph,
        utterance: 'Judges have a duty to adjudicate impartially.',
      });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.flags).toContain('role-heightened-sensitivity');
      expect(result.flags).toContain('deontic-role-definition');
    });
  });

  describe('ERS-15: Non-axiomatic session domain → R2 via DOMAIN', () => {
    it('routes biology session domain to R2 via DOMAIN method', () => {
      const cell = makeConcept('fandaws:class/test/cell'); // no BFO
      const graph = makeGraph([cell]);
      const session = makeSession('biology');
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/cell');

      const result = routeToRegister(restriction, { graph, session });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.DOMAIN);
    });
  });

  describe('ERS-20: Teleological + Role → double flag', () => {
    it('combines teleological-signal and role-heightened-sensitivity', () => {
      const teacher = makeConcept('fandaws:class/test/teacher', BFO.role);
      const graph = makeGraph([teacher]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/teacher', 'educates');

      const result = routeToRegister(restriction, {
        graph,
        utterance: 'Teachers are supposed to educate.',
      });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.flags).toContain('teleological-signal');
      expect(result.flags).toContain('role-heightened-sensitivity');
    });
  });

  describe('ERS-23: Missing utterance → teleological skipped', () => {
    it('skips teleological detection when utterance is null', () => {
      const doctor = makeConcept('fandaws:class/test/doctor', BFO.role);
      const graph = makeGraph([doctor]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/doctor', 'diagnoses');

      const result = routeToRegister(restriction, { graph, utterance: null });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.flags).toContain('role-heightened-sensitivity');
      expect(result.flags).not.toContain('teleological-signal');
    });
  });

  describe('ERS-24: Missing session → session domain step skipped', () => {
    it('falls to fallback when session is null', () => {
      const restriction = makeRestriction();
      const result = routeToRegister(restriction, { session: null });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.FALLBACK);
    });
  });

  describe('ERS-25: Config disables ERS → null', () => {
    it('returns null when epistemicRegisterEnabled is false', () => {
      const restriction = makeRestriction();
      const result = routeToRegister(restriction, {
        config: { epistemicRegisterEnabled: false },
      });
      expect(result).toBeNull();
    });
  });

  describe('ERS-27: APS stub always returns null', () => {
    it('routing method is never APS', () => {
      const restriction = makeRestriction();
      const result = routeToRegister(restriction);
      expect(result.routingRecord['fandaws:routingMethod']).not.toBe(ROUTING_METHODS.APS);
    });
  });

  describe('ERS-28: Routing record createdBy', () => {
    it('routing record has createdBy = ers:service', () => {
      const result = routeToRegister(makeRestriction());
      expect(result.routingRecord['fandaws:createdBy']).toBe('ers:service');
    });
  });

  describe('ERS-29: Routing record method matches step that fired', () => {
    it('BFO match → STRUCTURAL method', () => {
      const triangle = makeConcept('fandaws:class/test/triangle', BFO.spatialRegion);
      const graph = makeGraph([triangle]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/triangle');

      const result = routeToRegister(restriction, { graph });
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.STRUCTURAL);
    });

    it('domain match → DOMAIN method', () => {
      const number = makeConcept('fandaws:class/test/number');
      const graph = makeGraph([number]);
      const session = makeSession('mathematics');
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/number');

      const result = routeToRegister(restriction, { graph, session });
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.DOMAIN);
    });

    it('no match → FALLBACK method', () => {
      const gadget = makeConcept('fandaws:class/test/gadget');
      const graph = makeGraph([gadget]);
      const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/gadget');

      const result = routeToRegister(restriction, { graph });
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.FALLBACK);
    });
  });

  describe('ERS-30: R3 is never auto-assigned (exhaustive)', () => {
    it('no BFO category maps to R3', () => {
      const bfoCategories = [
        BFO.spatialRegion, BFO.temporalRegion, BFO.genDepContinuant,
        BFO.materialEntity, BFO.quality, BFO.disposition, BFO.function,
        BFO.process, BFO.realizableEntity, BFO.role, BFO.entity,
      ];
      for (const bfo of bfoCategories) {
        const concept = makeConcept('fandaws:class/test/c', bfo);
        const graph = makeGraph([concept]);
        const restriction = makeRestriction('fandaws:restriction/test/r1', 'fandaws:class/test/c');

        const result = routeToRegister(restriction, {
          graph,
          utterance: 'This should have purpose and duty',
        });
        expect(result.register).not.toBe(REGISTERS.ASPIRATIONAL);
      }
    });

    it('fallback never returns R3', () => {
      const result = routeToRegister(makeRestriction(), {
        utterance: 'People should have purpose duty ought supposed to designed to intended to meant to',
      });
      expect(result.register).not.toBe(REGISTERS.ASPIRATIONAL);
    });
  });

  describe('graceful degradation', () => {
    it('handles empty context (ERS-22)', () => {
      const result = routeToRegister(makeRestriction(), {});
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });

    it('handles null graph → fallback (ERS-22)', () => {
      const result = routeToRegister(makeRestriction(), { graph: null });
      expect(result.register).toBe(REGISTERS.NORMATIVE);
      expect(result.routingRecord['fandaws:routingMethod']).toBe(ROUTING_METHODS.FALLBACK);
    });

    it('handles missing restriction @id', () => {
      const restriction = { '@type': 'owl:Restriction', 'fandaws:attachedTo': 'test' };
      const result = routeToRegister(restriction);
      expect(result.register).toBe(REGISTERS.NORMATIVE);
    });
  });
});
