# Fandaws Sentinel Supplementary Test Specification

**Coverage Gap Analysis & Developer Implementation Guide** 

* 
**Spec Version:** v3.4 


* 
**Current Test Count:** 599/599 (36 suites) 


* 
**New Tests Specified:** 14 test cases (~42 individual assertions) 


* 
**Target Test Count:** ~641+ 


* 
**Date:** 2026-02-15 


* 
**Author:** Generated from coverage gap analysis 


* 
**Applies To:** Phases 5 (current) through Phase 11 (future) 



---

## Table of Contents

This document specifies 14 supplementary test cases across 8 coverage categories identified through gap analysis of the existing 599-test suite. Each test case includes rationale, implementation-ready code, key assertions, and phase targeting.

| ID | Test Name | Category | Priority |
| --- | --- | --- | --- |
| SUP-01 | Parser → Classifier Contract — Malformed ParseResult | Pipeline Contract Tests | HIGH |
| SUP-02 | Classifier → KnowledgeEngine Contract — Unhandled Action Types | Pipeline Contract Tests | HIGH |
| SUP-03 | Full Pipeline Error Propagation | Pipeline Contract Tests | HIGH |
| SUP-04 | Hydrator — External JSON-LD with Language-Tagged Values | ConceptHydrator Edge Cases | HIGH |
| SUP-05 | Hydrator — Mixed Restriction Types in subClassOf | ConceptHydrator Edge Cases | MEDIUM |
| SUP-06 | Hydrator — Round-Trip Fidelity with Restrictions | ConceptHydrator Edge Cases | MEDIUM |
| SUP-07 | Governance Block Halts Pipeline | Governance Halt Path | MEDIUM |
| SUP-08 | Validator — Modification Mutations | Validator Expansion | HIGH |
| SUP-09 | Validator — Deletion with Orphan Prevention | Validator Expansion | HIGH |
| SUP-10 | NLParser — Adversarial and Non-Standard Input | NLParser Robustness | MEDIUM |
| SUP-11 | StateAdapter — Index Consistency After Mutation Sequences | StateAdapter Index Consistency | MEDIUM |
| SUP-12 | Multi-Turn — Blank Answer to ConversationPrompt | Multi-Turn Conversational Flows | MEDIUM |
| SUP-13 | Multi-Turn — User Rejects and Provides New Parent | Multi-Turn Conversational Flows | HIGH |
| SUP-14 | StateAdapter — Concurrent Mutation on Same Concept | Concurrency | LOW |
| 

 |  |  |  |

---

## Executive Summary

The existing 599-test suite provides strong unit-level coverage for individual components (NLParser, Classifier, Validator, StateAdapter, ConceptHydrator) and one end-to-end integration path (classification pipeline). However, gap analysis reveals 8 categories of missing coverage:

* 
**Pipeline Contract Tests (SUP-01 to SUP-03) [HIGH]:** Tests the handoff contracts between Parser→Classifier→KnowledgeEngine. It catches interface drift when components evolve independently and verifies error propagation through the full pipeline.


* 
**ConceptHydrator Edge Cases (SUP-04 to SUP-06) [HIGH/MED]:** Tests the hydrator with real-world external JSON-LD: language-tagged values, missing fields, scalar-where-array-expected, and mixed restriction types. This is critical for Phase 10/12 interop.


* 
**Governance Halt Path (SUP-07) [MEDIUM]:** Proves the pipeline stops when governance says "stop". Currently, untestable null stubs always say "go"; this injects a blocking check to verify the halt path exists.


* 
**Validator — Modification & Deletion (SUP-08 to SUP-09) [HIGH]:** Expands validator coverage beyond ADD mutations to MODIFY (reparent, rename) and DELETE (orphan prevention). These mutation types are required for Phase 6+ workflows.


* 
**NLParser Adversarial Input (SUP-10) [MEDIUM]:** Probes the regex parser with non-standard input: irregular spacing, embedded articles, plural verbs, question-form, and unicode. It documents known limitations.


* 
**StateAdapter Index Consistency (SUP-11) [MEDIUM]:** Verifies all 5 indices remain consistent after multi-step mutation sequences (create→reparent→delete). It catches silent index corruption.


* 
**Multi-Turn Conversational Flows (SUP-12 to SUP-13) [HIGH/MED]:** Tests the multi-turn interaction patterns from v1: blank answers to prompts, and user rejection leading to reclassification. These are the most common real-user correction flows.


* 
**Concurrency Safety (SUP-14) [LOW→CRIT]:** Verifies snapshot isolation and mutation atomicity under rapid sequential access. While low priority now, it becomes critical when Phase 11 (Sessions) introduces concurrent access.



Together, these 14 test cases add approximately 42 individual assertions, raising expected coverage from 599 to ~641+ tests. The tests are ordered by implementation priority: pipeline contracts first, then validator expansion, then robustness hardening.

---

## Implementation Priority Matrix

Use this table to plan sprint allocation. "Now" tests can be implemented immediately against the current Phase 5 codebase. "Phase 6" tests require the Property Workflow, and "Phase 11+" tests require Sessions/Federation.

| ID | Test Name | When | Effort | Blocks |
| --- | --- | --- | --- | --- |
| SUP-01 | Parser→Classifier Contract | Now | ~1 hour | Phase 6 |
| SUP-02 | Classifier→Engine Contract | Now | ~1 hour | Phase 6+ |
| SUP-03 | Error Propagation | Now | ~2 hours | Phase 8 |
| SUP-04 | Hydrator External JSON-LD | Now | ~1 hour | Phase 10/12 |
| SUP-07 | Governance Halt Path | Now | ~1 hour | Phase 8 |
| SUP-08 | Validator MODIFY | Now | ~1.5 hours | Phase 6 |
| SUP-09 | Validator DELETE | Now | ~1 hour | Phase 9 |
| SUP-10 | NLParser Adversarial | Now | ~1 hour | — |
| SUP-11 | Index Consistency | Now | ~1.5 hours | Phase 11 |
| SUP-12 | Blank Answer Multi-Turn | Now | ~30 min | — |
| SUP-13 | Rejection Reclassification | Now | ~1 hour | Phase 8 |
| SUP-05 | Mixed Restriction Types | Phase 6 | ~30 min | — |
| SUP-06 | Round-Trip Fidelity | Phase 6 | ~1 hour | — |
| SUP-14 | Concurrency Safety | Phase 11+ | ~1 hour | Phase 12 |
| 

 |  |  |  |  |

**Estimated total effort:** ~14 hours for all "Now" tests. Recommended sprint allocation: 2 developer-days.

---

## Test Case Specifications

Each test case below includes implementation-ready code. Copy directly into the indicated test suite file, adjust imports and helper functions for your test harness, and run.

SUP-01: Parser → Classifier Contract — Malformed ParseResult 

| Field | Value |
| --- | --- |
| **Category** | Pipeline Contract Tests |
| **Target Suite** | `integration/pipeline-contracts.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | HIGH |
| **Dependencies** | NLParser, Classifier |
| 

 |  |

**Rationale**
The Classifier consumes ParseResult objects from NLParser. If a ParseResult has an unexpected shape (missing fields, wrong types), the Classifier must fail gracefully rather than throw an unhandled exception or silently produce an incorrect ClassificationAction. This test proves the interface contract between Parser and Classifier is enforced at runtime.

**Test Code**

```javascript
describe('Parser → Classifier contract', () => {
    it('SUP-01a: handles ParseResult with null subject', () => {
      const malformed = createParseResult({
        utterance: 'is a dog',
        subject: null,       // missing subject
        predicate: 'is a',
        object: 'dog'
      });
        const result = classifier.classify(malformed);
        expect(result.action).toBe('UNKNOWN');
        expect(result.error).toBeDefined();
    });

    it('SUP-01b: handles ParseResult with empty predicate', () => {
      const malformed = createParseResult({
        utterance: 'dog animal',
        subject: 'dog',
        predicate: '',       // no verb detected
        object: 'animal'
      });
        const result = classifier.classify(malformed);
        expect(result.action).toBe('UNKNOWN');
    });

    it('SUP-01c: handles ParseResult with no object', () => {
      const partial = createParseResult({
        utterance: 'dog',
        subject: 'dog',
        predicate: null,
        object: null         // single-word input
      });
      const result = classifier.classify(partial);
      // Single-word should route to LOOKUP, not CLASSIFY
      expect(result.action).not.toBe('CLASSIFY');
    });
});

```



**Key Assertions**

* Classifier never throws on malformed ParseResult — always returns a ClassificationAction.


* Missing subject → action is UNKNOWN (not CLASSIFY).


* Empty predicate → action is UNKNOWN (verb required for classification).


* Single-word (no object) → routes to LOOKUP or UNKNOWN, never CLASSIFY.



**Implementation Notes**
These tests should use the real `createParseResult` factory to ensure the type is structurally valid JSON-LD, then manually corrupt specific fields. This catches cases where future ParseResult schema changes break the Classifier.

---

SUP-02: Classifier → KnowledgeEngine Contract — Unhandled Action Types 

| Field | Value |
| --- | --- |
| **Category** | Pipeline Contract Tests |
| **Target Suite** | `integration/pipeline-contracts.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | HIGH |
| **Dependencies** | Classifier, KnowledgeEngine |
| 

 |  |

**Rationale**
The Classifier can route to action types that KnowledgeEngine does not yet handle (DESCRIBE, RELATE, DELETE, MERGE). When this happens, KnowledgeEngine must return a meaningful ConversationPrompt rather than silently dropping the request or throwing.

**Test Code**

```javascript
describe('Classifier → KnowledgeEngine contract', () => {
    const unimplemented = ['DESCRIBE', 'RELATE', 'DELETE', 'MERGE'];

    unimplemented.forEach(actionType => {
      it(`SUP-02: returns graceful prompt for ${actionType} action`, async () => {
        const action = createClassificationAction({
          action: actionType,
          subject: 'dog',
          object: actionType === 'DELETE' ? null : 'friendly',
        });
        const result = await knowledgeEngine.execute(action, adapter);

        expect(result).toBeDefined();
        expect(result['@type']).toContain('ConversationPrompt');
        // Should explain the limitation, not crash
        expect(result['fandaws:promptType']).toMatch(
          /unsupported|not.?implemented|unknown/i
        );
      });
    });
});

```



**Key Assertions**

* KnowledgeEngine never throws on unimplemented action types.


* Returns a valid ConversationPrompt (not null, not undefined).


* Prompt type clearly communicates the limitation.


* No state mutation occurs on unhandled action.



**Implementation Notes**
As new phases land (Phase 6 = properties, Phase 7 = descriptions, Phase 9 = relationships), remove the corresponding action type from the unimplemented list and add dedicated tests.

---

SUP-03: Full Pipeline Error Propagation 

| Field | Value |
| --- | --- |
| **Category** | Pipeline Contract Tests |
| **Target Suite** | `integration/pipeline-contracts.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | HIGH |
| **Dependencies** | NLParser, Classifier, KnowledgeEngine, Validator, StateAdapter |
| 

 |  |

**Rationale**
When the Validator returns an EpistemicFailure, the KnowledgeEngine must propagate that failure as a user-facing ConversationPrompt. When the StateAdapter throws during `applyMutation()`, the engine must catch the exception and produce a meaningful response.

**Test Code**

```javascript
describe('Pipeline error propagation', () => {
    it('SUP-03a: Validator EpistemicFailure becomes ConversationPrompt', async () => {
      // Force a cycle: dog → animal → dog
      await preloadGraph({ animal: null, dog: 'animal' });

      const result = await pipeline.process('animal is a dog');

      // Should NOT throw — should produce a prompt explaining the cycle
      expect(result['@type']).toContain('ConversationPrompt');
      expect(result['fandaws:promptType']).toMatch(/cycle|invalid|cannot/i);

      // Graph must be unchanged
      const snapshot = adapter.getSnapshot();
      const animal = findByLabel(snapshot, 'animal');
      expect(animal['skos:broader']).toBeNull(); // still root
    });

    it('SUP-03b: StateAdapter mutation failure is caught', async () => {
      // Inject a failing adapter
      const failingAdapter = {
        ...adapter,
        applyMutation: () => {
          throw new Error('Storage write failed');
        },
      };

      const result = await pipeline.process(
        'newconcept is a root',
        { adapter: failingAdapter }
      );
      expect(result['@type']).toContain('ConversationPrompt');
      expect(result['fandaws:promptType']).toMatch(/error|fail/i);
    });

    it('SUP-03c: NLParser failure on unparseable input', async () => {
      const result = await pipeline.process('!@#$%^&*()');

      expect(result).toBeDefined();
      // Should gracefully indicate it cannot understand
      expect(result['@type']).toContain('ConversationPrompt');
    });
});

```



**Key Assertions**

* Cycle detection produces a user-facing prompt, not an exception.


* Storage failures are caught and surfaced to the user.


* Unparseable input produces a prompt, not an error.


* No mutation occurs on any error path.



**Implementation Notes**
SUP-03b requires the pipeline to accept an adapter injection point. If the current architecture hard-wires the adapter, this test reveals a coupling problem that should be fixed.

---

SUP-04: Hydrator — External JSON-LD with Language-Tagged Values 

| Field | Value |
| --- | --- |
| **Category** | ConceptHydrator Edge Cases |
| **Target Suite** | `unit/concept-hydrator.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | HIGH |
| **Dependencies** | ConceptHydrator |
| 

 |  |

**Rationale**
When Fandaws receives JSON-LD from an external SPARQL endpoint or SKOS import, string fields like `prefLabel` may arrive as language-tagged objects instead of bare strings. The hydrator must handle both forms.

**Test Code**

```javascript
describe('Hydrator — external JSON-LD forms', () => {
    it('SUP-04a: hydrates language-tagged prefLabel', () => {
      const external = {
        '@id': 'ext:concept/dog',
        '@type': ['owl:Class', 'skos:Concept'],
        'rdfs:label': 'Dog',
        'skos:prefLabel': { '@value': 'dog', '@language': 'en' },
        'skos:definition': {
          '@value': 'A domesticated carnivore',
          '@language': 'en'
        },
        'skos:broader': null,
        'dcterms:created': '2025-01-01T00:00:00Z',
      };

      const view = hydrate(external);

      expect(view.canonicalLabel).toBe('dog'); // string, not object
      expect(view.definition).toBe('A domesticated carnivore');
      expect(view.displayLabel).toBe('Dog');
    });

    it('SUP-04b: hydrates when subClassOf is absent (not null, not [])', () => {
      const minimal = {
        '@id': 'ext:concept/thing',
        '@type': ['owl:Class', 'skos:Concept'],
        'rdfs:label': 'Thing',
        'skos:prefLabel': 'thing',
        // subClassOf completely absent
      };
      const view = hydrate(minimal);
      expect(view.bfoAncestor).toBeNull();
      expect(view.properties).toEqual([]);
    });

    it('SUP-04c: hydrates when subClassOf is a bare string (not array)', () => {
      const singleParent = {
        '@id': 'ext:concept/dog',
        '@type': ['owl:Class', 'skos:Concept'],
        'rdfs:label': 'Dog',
        'skos:prefLabel': 'dog',
        'rdfs:subClassOf': 'cco:Organism',    // scalar, not array
      };

      const view = hydrate(singleParent);
      expect(view.bfoAncestor).toBe('cco:Organism');
      expect(view.properties).toEqual([]);
    });

    it('SUP-04d: hydrates altLabel as scalar (no @container: @set)', () => {
      const singleAlt = {
        '@id': 'ext:concept/dog',
        '@type': ['owl:Class', 'skos:Concept'],
        'rdfs:label': 'Dog',
        'skos:prefLabel': 'dog',
        'skos:altLabel': 'pupper',    // scalar, not array
      };

      const view = hydrate(singleAlt);
      expect(view.synonyms).toEqual(['pupper']);
      expect(Array.isArray(view.synonyms)).toBe(true);
    });
});

```



**Key Assertions**

* Language-tagged objects are unwrapped to bare strings.


* Missing fields produce safe defaults, not exceptions.


* Scalar values where arrays are expected are wrapped in arrays.



**Implementation Notes**
These tests are the first line of defense for Phase 10 and Phase 12, where external documents will flow into the system.

---

SUP-05: Hydrator — Mixed Restriction Types in subClassOf 

| Field | Value |
| --- | --- |
| **Category** | ConceptHydrator Edge Cases |
| **Target Suite** | `unit/concept-hydrator.test.js` |
| **v2 Phase** | Phase 6 (Properties) |
| **Priority** | MEDIUM |
| **Dependencies** | ConceptHydrator |
| 

 |  |

**Rationale**
A single concept can have `someValuesFrom`, `allValuesFrom`, and `hasValue` restrictions simultaneously. The hydrator must correctly identify each restriction type.

**Test Code**

```javascript
describe('Hydrator — mixed restriction types', () => {
    it('SUP-05: correctly maps all three restriction types', () => {
      const concept = {
        '@id': 'fandaws:concept/golden-retriever',
        '@type': ['owl:Class', 'skos:Concept'],
        'rdfs:label': 'Golden Retriever',
        'skos:prefLabel': 'golden retriever',
        'rdfs:subClassOf': [
          'cco:Organism',
          {
            '@type': 'owl:Restriction',
            'onProperty': 'cco:is_bearer_of',
            'someValuesFrom': 'fandaws:disposition/friendly'
          },
          {
            '@type': 'owl:Restriction',
            'onProperty': 'cco:has_quality',
            'allValuesFrom': 'fandaws:quality/golden-coat'
          },
          {
            '@type': 'owl:Restriction',
            'onProperty': 'fandaws:prop/leg-count',
            'hasValue': 'fandaws:value/four'
          }
        ]
      };

      const view = hydrate(concept);
      expect(view.bfoAncestor).toBe('cco:Organism');
      expect(view.properties).toHaveLength(3);
      expect(view.properties[0].restrictionType).toBe('some');
      expect(view.properties[1].restrictionType).toBe('all');
      expect(view.properties[2].restrictionType).toBe('exact');
    });
});

```



**Key Assertions**

* 
`someValuesFrom` → restrictionType "some".


* 
`allValuesFrom` → restrictionType "all".


* 
`hasValue` → restrictionType "exact".


* BFO/CCO class parent is separated from restrictions correctly.



---

SUP-06: Hydrator — Round-Trip Fidelity with Restrictions 

| Field | Value |
| --- | --- |
| **Category** | ConceptHydrator Edge Cases |
| **Target Suite** | `unit/concept-hydrator.test.js` |
| **v2 Phase** | Phase 6 (Properties) |
| **Priority** | MEDIUM |
| **Dependencies** | ConceptHydrator |
| 

 |  |

**Rationale**
Data written via `dehydrate()` must survive a `hydrate()` → `dehydrate()` round-trip without loss or corruption, especially for OWL restrictions.

**Test Code**

```javascript
describe('Hydrator — round-trip fidelity', () => {
    it('SUP-06: restrictions survive hydrate → dehydrate → hydrate', () => {
      const original = {
        '@context': 'https://fandaws.org/context/v2.1.jsonld',
        '@id': 'fandaws:concept/test',
        '@type': ['owl:Class', 'skos:Concept'],
        'label': 'Test Concept',
        'prefLabel': 'test concept',
        'altLabel': ['tc', 'test'],
        'definition': 'A test',
        'broader': 'fandaws:concept/parent',
        'subClassOf': [
          'cco:Entity',
          {
            '@type': 'owl:Restriction',
            'onProperty': 'cco:is_bearer_of',
            'someValuesFrom': 'fandaws:disposition/test-disp'
          }
        ],
        'inScheme': 'fandaws:scheme/test',
        'created': '2026-01-01T00:00:00Z',
        'modified': '2026-01-01T00:00:00Z',
        'wasDerivedFrom': ['fandaws:concept/old-test']
      };

      const view = hydrate(original);
      const rehydrated = dehydrate(view);
      const view2 = hydrate(rehydrated);

      // All fields must match after round-trip
      expect(view2.id).toBe(view.id);
      expect(view2.displayLabel).toBe(view.displayLabel);
      expect(view2.canonicalLabel).toBe(view.canonicalLabel);
      expect(view2.synonyms).toEqual(view.synonyms);
      expect(view2.definition).toBe(view.definition);
      expect(view2.parentId).toBe(view.parentId);
      expect(view2.bfoAncestor).toBe(view.bfoAncestor);
      expect(view2.properties).toEqual(view.properties);
      expect(view2.mergedFrom).toEqual(view.mergedFrom);
    });
});

```



**Key Assertions**

* All scalar and array fields survive round-trip exactly.


* OWL restriction structure is preserved.


* BFO ancestor is not duplicated or lost.



---

SUP-07: Governance Block Halts Pipeline 

| Field | Value |
| --- | --- |
| **Category** | Governance Halt Path |
| **Target Suite** | `unit/governance-check.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | MEDIUM |
| **Dependencies** | KnowledgeEngine, checkGovernanceBlock |
| 

 |  |

**Rationale**
Phase 4b created null governance stubs. This test injects a blocking governance check and verifies the engine respects it by halting the pipeline.

**Test Code**

```javascript
describe('Governance halt path', () => {
    it('SUP-07a: pipeline halts when governance returns block', async () => {
      // Create a governance check that blocks everything
      const blockingGovernance = {
        checkGovernanceBlock: () => ({
          blocked: true,
          reason: createGovernanceEpistemicFailure({
            code: 'GOV-001',
            message: 'Ontological Constraint Engine rejected mutation',
          }),
        }),
      };

      const result = await knowledgeEngine.execute(
        createClassificationAction({
          action: 'CLASSIFY',
          subject: 'dog',
          object: 'animal',
        }),
        adapter,
        { governance: blockingGovernance }
      );

      // Engine should return the governance failure as a prompt
      expect(result['@type']).toContain('ConversationPrompt');
      expect(result['fandaws:promptType']).toMatch(/blocked|governance|rejected/i);

      // No mutation should have occurred
      expect(adapter.getSnapshot().concepts).toHaveLength(0);
    });

    it('SUP-07b: pipeline proceeds when governance returns clear', async () => {
      const permissiveGovernance = {
        checkGovernanceBlock: () => ({ blocked: false }),
      };

      const result = await knowledgeEngine.execute(
        createClassificationAction({
          action: 'CLASSIFY',
          subject: 'dog',
          object: 'animal',
        }),
        adapter,
        { governance: permissiveGovernance }
      );

      // Mutation should succeed
      const snapshot = adapter.getSnapshot();
      expect(findByLabel(snapshot, 'dog')).toBeDefined();
      expect(findByLabel(snapshot, 'animal')).toBeDefined();
    });
});

```



**Key Assertions**

* Blocking governance check prevents any state mutation.


* Governance failure is surfaced as a ConversationPrompt.


* Permissive governance allows normal pipeline flow.



---

SUP-08: Validator — Modification Mutations 

| Field | Value |
| --- | --- |
| **Category** | Validator Expansion |
| **Target Suite** | `unit/validator.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | HIGH |
| **Dependencies** | Validator, StateAdapter |
| 

 |  |

**Rationale**
The existing tests focus on ADD mutations. MODIFY mutations have distinct validation requirements: concept existence, cycle prevention on reparenting, and label uniqueness.

**Test Code**

```javascript
describe('Validator — MODIFY mutations', () => {
    it('SUP-08a: rejects MODIFY on non-existent concept', () => {
      const result = validator.validate(
        createMutation('MODIFY', {
          target: 'fandaws:concept/ghost',  // does not exist
          'skos:broader': null,
        }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/not found|does not exist/i);
    });

    it('SUP-08b: rejects MODIFY that creates cycle', async () => {
      await preloadGraph({
        animal: null,
        mammal: 'animal',
        dog: 'mammal',
      });

      const result = validator.validate(
        createMutation('MODIFY', {
          target: animalId,
          'skos:broader': dogId,  // animal → dog → mammal → animal = cycle
        }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('CVS-005');
    });

    it('SUP-08c: rejects MODIFY with prefLabel collision', async () => {
      await preloadGraph({
        animal: null,
        plant: null,   // separate root
      });

      const result = validator.validate(
        createMutation('MODIFY', {
          target: plantId,
          'skos:prefLabel': 'animal',  // collides with existing
        }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/duplicate|collision|already exists/i);
    });

    it('SUP-08d: accepts valid MODIFY (reparent)', async () => {
      await preloadGraph({
        animal: null,
        mammal: 'animal',
        canine: null,    // separate root
        dog: 'canine',
      });

      const result = validator.validate(
        createMutation('MODIFY', {
          target: dogId,
          'skos:broader': mammalId,  // reparent dog under mammal
        }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(true);
    });
});

```



**Key Assertions**

* MODIFY on non-existent concept is rejected with clear error.


* MODIFY that creates cycle triggers CVS-005.


* MODIFY that causes prefLabel collision is rejected.



---

SUP-09: Validator — Deletion with Orphan Prevention 

| Field | Value |
| --- | --- |
| **Category** | Validator Expansion |
| **Target Suite** | `unit/validator.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | HIGH |
| **Dependencies** | Validator, StateAdapter |
| 

 |  |

**Rationale**
Deleting a concept that has children would orphan those children. The Validator must reject such deletion.

**Test Code**

```javascript
describe('Validator — DELETE mutations', () => {
    it('SUP-09a: rejects DELETE on concept with children', async () => {
      await preloadGraph({
        animal: null,
        mammal: 'animal',
        dog: 'mammal',
      });

      const result = validator.validate(
        createMutation('DELETE', { target: mammalId }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/children|orphan|dependent/i);
    });

    it('SUP-09b: accepts DELETE on leaf concept', async () => {
      await preloadGraph({
        animal: null,
        mammal: 'animal',
        dog: 'mammal',
      });

      const result = validator.validate(
        createMutation('DELETE', { target: dogId }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(true);
    });

    it('SUP-09c: rejects DELETE on non-existent concept', () => {
      const result = validator.validate(
        createMutation('DELETE', { target: 'fandaws:concept/ghost' }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(false);
    });

    it('SUP-09d: accepts DELETE on root with no children', async () => {
      await preloadGraph({ standalone: null });
      const result = validator.validate(
        createMutation('DELETE', { target: standaloneId }),
        adapter.getSnapshot()
      );
      expect(result.valid).toBe(true);
    });
});

```



**Key Assertions**

* Concept with children cannot be deleted (orphan prevention).


* Leaf concept (no children) can be deleted.


* Non-existent concept deletion is rejected.



---

SUP-10: NLParser — Adversarial and Non-Standard Input 

| Field | Value |
| --- | --- |
| **Category** | NLParser Robustness |
| **Target Suite** | `golden/nl-parser-golden.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | MEDIUM |
| **Dependencies** | NLParser |
| 

 |  |

**Rationale**
Real users produce irregular capitalization, whitespace, and verb forms. These tests probe the regex-based parser's boundaries.

**Test Code**

```javascript
// Additional golden corpus entries for nl-parser-golden.test.js
const adversarialCorpus = [
    {
      id: 'adv-01',
      utterance: 'DOG    is a    ANIMAL',
      expected: { subject: 'dog', predicate: 'is a', object: 'animal' },
      note: 'Irregular caps + multiple spaces'
    },
    {
      id: 'adv-02',
      utterance: 'the dog is an animal',
      expected: { subject: 'dog', predicate: 'is', object: 'animal' },
      note: 'Articles on both subject and object'
    },
    {
      id: 'adv-03',
      utterance: 'The United States is a country',
      expected: {
        subject: 'the united states',   // protected proper noun
        predicate: 'is a',
        object: 'country'
      },
      note: 'Article is PART OF subject (protected noun)',
      config: { protectedNouns: ['the united states'] }
    },
    {
      id: 'adv-04',
      utterance: 'dogs are animals',
      expected: { subject: 'dogs', predicate: 'are', object: 'animals' },
      note: 'Plural verb form'
    },
    {
      id: 'adv-05',
      utterance: 'a Bengal Tiger is a Pantherinae',
      expected: {
        subject: 'bengal tiger',
        predicate: 'is a',
        object: 'pantherinae'
      },
      note: 'Multi-word subject with leading article'
    },
    {
      id: 'adv-06',
      utterance: 'cat',
      expected: { subject: 'cat', predicate: null, object: null },
      note: 'Single-word input (lookup, not classification)'
    },
    {
      id: 'adv-07',
      utterance: '   ',
      expected: null,
      note: 'Whitespace-only rejected pre-parse'
    },
    {
      id: 'adv-08',
      utterance: 'Golden Retriever has friendly temperament',
      expected: {
        subject: 'golden retriever',
        predicate: 'has',
        object: 'friendly temperament'
      },
      note: 'Property assignment verb (Phase 6 readiness)'
    },
    {
      id: 'adv-09',
      utterance: 'Is dog an animal?',
      expected: { subject: 'dog', predicate: 'is', object: 'animal' },
      note: 'Question-form input with inverted word order'
    },
    {
      id: 'adv-10',
      utterance: 'café is a restaurant',
      expected: { subject: 'café', predicate: 'is a', object: 'restaurant' },
      note: 'Unicode diacritics in subject'
    },
];

```



**Key Assertions**

* Parser normalizes whitespace and case before pattern matching.


* Articles are stripped from subject/object but preserved in protected proper nouns.


* Plural verb forms ("are") are recognized.


* Question-form input is parsed despite inverted word order.


* Unicode diacritics pass through without corruption.



---

SUP-11: StateAdapter — Index Consistency After Mutation Sequences 

| Field | Value |
| --- | --- |
| **Category** | StateAdapter Index Consistency |
| **Target Suite** | `unit/in-memory-state-adapter.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | MEDIUM |
| **Dependencies** | InMemoryStateAdapter |
| 

 |  |

**Rationale**
The adapter maintains 5 indices. These tests verify index consistency after complex multi-step sequences.

**Test Code**

```javascript
describe('StateAdapter — index consistency after sequences', () => {
    it('SUP-11a: create → reparent → verify all indices', async () => {
      // Create: Animal (root), Mammal → Animal, Dog → Animal
      await adapter.applyMutation(createAddMutation(animal));
      await adapter.applyMutation(createAddMutation(mammal)); // → animal
      await adapter.applyMutation(createAddMutation(dog));     // → animal

      // Reparent: Dog → Mammal
      await adapter.applyMutation(createModifyMutation(
        dogId, { 'skos:broader': mammalId }
      ));

      const snap = adapter.getSnapshot();
      // canonicalLabel index
      expect(snap.getByCanonicalLabel('dog')).toBeDefined();
      // parent index: dog's parent is now mammal
      expect(snap.getParent(dogId)).toBe(mammalId);
      // children index: animal has 1 child (mammal), NOT 2
      expect(snap.getChildren(animalId)).toEqual([mammalId]);
      // children index: mammal has 1 child (dog)
      expect(snap.getChildren(mammalId)).toEqual([dogId]);
    });

    it('SUP-11b: create → delete leaf → verify index cleanup', async () => {
      await adapter.applyMutation(createAddMutation(animal));
      await adapter.applyMutation(createAddMutation(dog)); // → animal

      await adapter.applyMutation(createDeleteMutation(dogId));

      const snap = adapter.getSnapshot();
      // canonicalLabel index: "dog" should be gone
      expect(snap.getByCanonicalLabel('dog')).toBeUndefined();
      // children index: animal should have no children
      expect(snap.getChildren(animalId)).toEqual([]);
      // parent index: no entry for dog
      expect(snap.getParent(dogId)).toBeUndefined();
    });

    it('SUP-11c: create A → create B(→A) → create C(→B) → delete B' +
       ' should fail (orphan check)', async () => {
      await adapter.applyMutation(createAddMutation(animal));
      await adapter.applyMutation(createAddMutation(mammal));  // → animal
      await adapter.applyMutation(createAddMutation(dog));      // → mammal

      // Deleting mammal should fail because dog depends on it
      await expect(
        adapter.applyMutation(createDeleteMutation(mammalId))
      ).rejects.toThrow(/children|orphan/i);

      // All indices must be unchanged after failed delete
      const snap = adapter.getSnapshot();
      expect(snap.getByCanonicalLabel('mammal')).toBeDefined();
      expect(snap.getChildren(mammalId)).toEqual([dogId]);
    });
});

```



**Key Assertions**

* After reparent, old parent's children index is updated AND new parent's children index is updated.


* After delete, all 5 indices are cleaned up.


* Failed mutation leaves all indices unchanged (atomicity).



---

SUP-12: Multi-Turn — Blank Answer to ConversationPrompt 

| Field | Value |
| --- | --- |
| **Category** | Multi-Turn Conversational Flows |
| **Target Suite** | `integration/classification-pipeline.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | MEDIUM |
| **Dependencies** | Full pipeline |
| 

 |  |

**Rationale**
After the system emits a ConversationPrompt asking "What is X?", the user may submit an empty answer. The system must reject the empty answer and re-prompt without mutating state.

**Test Code**

```javascript
describe('Multi-turn — blank answer handling', () => {
    it('SUP-12a: empty answer to UNKNOWN_CONCEPT prompt', async () => {
      const result1 = await pipeline.process('zorblax');
      // System doesn't know this — asks what it is
      expect(result1['@type']).toContain('ConversationPrompt');

      // User submits empty string
      const result2 = await pipeline.process('');

      // Should re-prompt or reject, NOT create a concept
      expect(adapter.getSnapshot().concepts).toHaveLength(0);
    });

    it('SUP-12b: whitespace-only answer to prompt', async () => {
      const result1 = await pipeline.process('zorblax');
      const result2 = await pipeline.process('   ');

      expect(adapter.getSnapshot().concepts).toHaveLength(0);
    });
});

```



**Key Assertions**

* No concept is created from empty or whitespace-only follow-up.


* System produces a meaningful re-prompt or error.



---

SUP-13: Multi-Turn — User Rejects and Provides New Parent 

| Field | Value |
| --- | --- |
| **Category** | Multi-Turn Conversational Flows |
| **Target Suite** | `integration/classification-pipeline.test.js` |
| **v2 Phase** | Phase 5 (current) |
| **Priority** | HIGH |
| **Dependencies** | Full pipeline |
| 

 |  |

**Rationale**
User says "dog", system suggests existing parent, user says "no", user provides novel parent "canine." The system must handle rejection → re-prompt → new classification without corrupting state.

**Test Code**

```javascript
describe('Multi-turn — rejection and reclassification', () => {
    it('SUP-13: user rejects suggestion, provides new parent', async () => {
      // Preload: Animal (root) with existing child Mammal
      await preloadGraph({ animal: null, mammal: 'animal' });

      // User enters "dog" — system may suggest existing parents
      const r1 = await pipeline.process('dog');

      // If system prompts "What is dog?"
      // User says "canine" (novel parent)
      const r2 = await pipeline.process('dog is a canine');

      const snapshot = adapter.getSnapshot();
      const dog = findByLabel(snapshot, 'dog');
      const canine = findByLabel(snapshot, 'canine');

      // Both should exist
      expect(dog).toBeDefined();
      expect(canine).toBeDefined();

      // Canine is a new root, Dog is under Canine
      expect(canine['skos:broader']).toBeNull();
      expect(dog['skos:broader']).toBe(canine['@id']);

      // Original tree unchanged
      expect(findByLabel(snapshot, 'animal')['skos:broader']).toBeNull();
      expect(findByLabel(snapshot, 'mammal')['skos:broader']).toBe(
        findByLabel(snapshot, 'animal')['@id']
      );
    });
});

```



**Key Assertions**

* New parent concept is created as root when user provides novel term.


* Subject concept is placed under new parent, not under rejected suggestion.


* Existing graph is not mutated by the rejection flow.



---

SUP-14: StateAdapter — Concurrent Mutation on Same Concept 

| Field | Value |
| --- | --- |
| **Category** | Concurrency |
| **Target Suite** | `unit/in-memory-state-adapter.test.js` |
| **v2 Phase** | Phase 11 (Sessions) |
| **Priority** | LOW |
| **Dependencies** | InMemoryStateAdapter |
| 

 |  |

**Rationale**
When Phase 11 (Sessions) introduces concurrent access, race conditions could cause state corruption. This test verifies behavior when two mutations are submitted in rapid succession targeting the same concept.

**Test Code**

```javascript
describe('StateAdapter — concurrent mutation safety', () => {
    it('SUP-14a: rapid sequential mutations on same concept', async () => {
      await adapter.applyMutation(createAddMutation(animal));
      await adapter.applyMutation(createAddMutation(dog)); // → animal

      // Two rapid reparents — only last should win
      const p1 = adapter.applyMutation(
        createModifyMutation(dogId, { 'skos:definition': 'first' })
      );
      const p2 = adapter.applyMutation(
        createModifyMutation(dogId, { 'skos:definition': 'second' })
      );

      await Promise.all([p1, p2]);

      const snap = adapter.getSnapshot();
      const dog = snap.getById(dogId);

      // Definition should be one of the two — never corrupted
      expect(['first', 'second']).toContain(dog['skos:definition']);
    });

    it('SUP-14b: mutation after snapshot read is consistent', async () => {
      await adapter.applyMutation(createAddMutation(animal));

      // Take snapshot
      const snapBefore = adapter.getSnapshot();

      // Mutate
      await adapter.applyMutation(createAddMutation(dog));
      // → animal

      // Old snapshot should NOT see the new concept
      expect(snapBefore.getByCanonicalLabel('dog')).toBeUndefined();

      // New snapshot SHOULD see it
      const snapAfter = adapter.getSnapshot();
      expect(snapAfter.getByCanonicalLabel('dog')).toBeDefined();
    });
});

```



**Key Assertions**

* Rapid sequential mutations do not corrupt state.


* Snapshot isolation — old snapshots do not see new mutations.


* No partial mutations are visible (atomicity).



---

## Appendix A: File Placement Guide

Where to place each test in the Fandaws Sentinel project structure:

| Test IDs | File Path | Notes |
| --- | --- | --- |
| SUP-01–03 | `test/integration/pipeline-contracts.test.js` | New file — contract tests between pipeline stages |
| SUP-04–06 | `test/unit/concept-hydrator.test.js` | Extend existing suite (currently 17 tests) |
| SUP-07 | `test/unit/governance-check.test.js` | Extend existing suite (currently 10 tests) |
| SUP-08–09 | `test/unit/validator.test.js` | Extend existing suite (currently 26 tests) |
| SUP-10 | `test/golden/nl-parser-golden.test.js` | Add to adversarial section of existing golden corpus |
| SUP-11 | `test/unit/in-memory-state-adapter.test.js` | Extend existing suite (currently 86 tests) |
| SUP-12–13 | `test/integration/classification-pipeline.test.js` | Extend existing suite (currently 24 tests) |
| SUP-14 | `test/unit/in-memory-state-adapter.test.js` | Extend existing suite — flag as Phase 11 prerequisite |
| 

 |  |  |

---

## Appendix B: Relationship to v1 Test Migration

This document complements the v1 → v2 Test Case Migration (fandaws-v1-test-migration.md). The v1 migration focused on converting 13 specific test scenarios from the original 2018 test suite. This supplementary specification addresses systemic coverage gaps that no v1 test case covered:

| v1 Source |  | v2 Supplementary Test |
| --- | --- | --- |
| v1 TC-02 (Blank Answer) | → | SUP-12 (expanded to multi-turn) |
| v1 TC-05 (Rejection + Reclassification) | → | SUP-13 (expanded with state verification) |
| v1 TC-08/09 (Autolexical) | → | Already covered by existing CVS-005 tests |
| v1 TC-10 (Descendant Cycle) | → | Already covered by existing CVS-005 tests |
| No v1 equivalent | → | SUP-01–03 (pipeline contract tests — new) |
| No v1 equivalent | → | SUP-04–06 (hydrator edge cases — new) |
| No v1 equivalent | → | SUP-07 (governance halt path — new) |
| No v1 equivalent | → | SUP-08–09 (MODIFY/DELETE validation — new) |
| 

 |  |  |