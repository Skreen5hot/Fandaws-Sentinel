# TagTeam.js / Fandaws Integration Brief

**Date:** 2026-02-18
**From:** TagTeam.js Team
**To:** Fandaws Team
**Re:** Phase 5 — TagTeamAdapter Implementation
**Authority:** Fandaws v3.3 Specification §10.4.1

---

## 1. What TagTeam.js Is

TagTeam.js is a **discourse-model semantic parser** — it analyzes natural language to determine *what the user said and how they said it*. It produces structured JSON-LD graphs containing entities, acts (verbs), semantic roles (agent, patient, recipient, instrument, etc.), and ontological classifications grounded in BFO/CCO.

TagTeam.js is **not** a world-model system. It does not maintain a knowledge graph, validate assertions against existing knowledge, or build concept hierarchies. That is Fandaws' job.

### What TagTeam.js Does Today

| Capability | Status | Metric |
|-----------|--------|--------|
| POS tagging | Production | 93.5% accuracy (Penn Treebank trained) |
| Dependency parsing | Production | 85.3% UAS / 83.2% LAS (UD v2 trained) |
| Entity extraction | Production | 90.3% F1 on 200-sentence gold set |
| Semantic role assignment | Baseline | 59.3% F1 (known improvement path to ~80%) |
| Copular detection | Production | 96.9% accuracy |
| Passive voice handling | Production | Correct agent/patient reversal |
| Coordination splitting | Production | 80.0% accuracy |
| Ditransitive patterns | Production | Correct iobj/obj separation |
| Confidence annotations | Production | Per-arc margin scores from trained parser |
| Two-Tier ICE architecture | Production | Discourse referents + ontological classifications |
| Edge-canonical execution | Production | Browser UMD bundle (5.49 MB / 0.97 MB gzipped) |
| Deterministic computation | Production | Same input always produces same output |

### What TagTeam.js Does Not Do

- No knowledge graph maintenance
- No concept hierarchy building
- No scope resolution or deduplication
- No validation of assertions against existing knowledge
- No description generation
- No conversation state management

These are all Fandaws responsibilities.

---

## 2. Why We Need Fandaws

TagTeam.js and Fandaws are **complementary systems** that occupy different layers of the same pipeline:

```
User utterance
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  TagTeam.js (Discourse Model)                        │
│  "What did the user say?"                            │
│                                                      │
│  Input:  Raw text                                    │
│  Output: ParseResult (subject, predicate, object,    │
│          verbType, confidence, discourse annotations) │
└──────────────────────┬───────────────────────────────┘
                       │ JSON-LD ParseResult
                       ▼
┌──────────────────────────────────────────────────────┐
│  Fandaws (World Model)                               │
│  "What is the world?"                                │
│                                                      │
│  Classifier → KnowledgeEngine → Validator →          │
│  StateAdapter → DescriptionEngine                    │
│                                                      │
│  Output: Committed knowledge graph mutations         │
└──────────────────────────────────────────────────────┘
```

**Without Fandaws**, TagTeam.js can parse text and produce semantic graphs, but those graphs are ephemeral — they describe a single utterance with no persistence, no validation against existing knowledge, and no accumulation into a coherent world model.

**Without TagTeam.js**, Fandaws uses its built-in regex/grammar NLParser, which handles simple patterns ("X is a Y", "X has Y") but lacks:
- Trained statistical models for robust parsing of diverse input
- Dependency structure for complex sentences (passives, ditransitives, coordination)
- Semantic role assignment (who did what to whom)
- Confidence scores derived from actual parse quality
- Discourse annotations (speech act, modality, hedging)

**Together**, the pipeline gains: robust parsing → structured routing → validated knowledge commitment.

---

## 3. What We Are Building (Phase 5 Scope)

Four adapter modules that bridge TagTeam's output to Fandaws' input contract:

### 3.1 TagTeamAdapter (`src/adapters/TagTeamAdapter.js`)

Implements the three-method interface from §10.4.1:

| Method | Returns | Description |
|--------|---------|-------------|
| `parse(request)` | ParseResult | Accept TagTeamParseRequest, run TagTeam pipeline, return standard ParseResult |
| `isAvailable()` | boolean | Report whether TagTeam models are loaded |
| `getCapabilities()` | ParserCapabilities | Report supported linguistic features |

### 3.2 FandawsParseResultMapper (`src/adapters/FandawsParseResultMapper.js`)

Transforms TagTeam's rich semantic graph into Fandaws' flat ParseResult contract:

| TagTeam Output | Fandaws ParseResult Field |
|---------------|--------------------------|
| Agent entity | `fandaws:subject` |
| Patient entity | `fandaws:object` |
| Act (verb) | `fandaws:predicate` |
| Copular detection | `fandaws:verbType = "classification"` |
| "has" + NP | `fandaws:verbType = "property"` |
| Active transitive | `fandaws:verbType = "customRelationship"` |
| Arc confidence margins | `fandaws:confidence` (minimum margin in extraction path) |
| Parser identifier | `fandaws:parserImplementation = "tagteam-js"` |

### 3.3 VerbTypeClassifier (`src/adapters/VerbTypeClassifier.js`)

Routes TagTeam semantic structures to Fandaws workflow types:

| TagTeam Pattern | Fandaws verbType | Example |
|----------------|------------------|---------|
| Copular + "is a" + NP | `classification` | "A collie is a herding dog" |
| Copular + "is" + adjective | `property` | "The server is fast" |
| "has" + NP object | `property` | "A dog has four legs" |
| Active transitive | `customRelationship` | "The doctor treated the patient" |
| Passive + "by" agent | `customRelationship` | "The patient was treated by the doctor" |
| Intransitive | `customRelationship` | "The patient recovered" |

### 3.4 DiscourseAnnotationExtractor (`src/adapters/DiscourseAnnotationExtractor.js`)

Extracts discourse-level metadata not available from the built-in NLParser:

| Annotation | Detection Method | Values |
|-----------|------------------|--------|
| Speech act | Sentence-final punctuation + auxiliary inversion + imperative mood | assertion, question, directive |
| Modality | Modal verb detection (may, might, must, should, could, would) | realis, epistemic, deontic |
| Hedging | Adverb detection (probably, possibly, perhaps, likely) | true/false |
| Negation | Negation particle detection (not, n't, never, no) | true/false |

---

## 4. What We Expect from Fandaws

### 4.1 Contract Stability

We are implementing against the ParseResult schema defined in §10.4.1. We need assurance that:

1. The **TagTeamParseRequest** schema (utterance, conversationHistory, knowledgeGraphId) is stable
2. The **ParseResult** schema (subject, predicate, object, verbType, confidence, parserImplementation, discourseAnnotations) is stable
3. The **verbType enum** (classification, property, customRelationship) is complete — no additional types planned
4. The **TagTeamAdapter interface** (parse, isAvailable, getCapabilities) is the complete integration surface

### 4.2 Downstream Consumption

We need to understand how our output is consumed:

1. **Classifier**: Does the Classifier use `fandaws:verbType` directly, or does it re-derive the workflow from the ParseResult? If we set `verbType = "classification"`, does the Classifier trust that, or does it independently verify "X is a Y" patterns?

2. **Discourse annotations**: Which downstream modules consume `fandaws:discourseAnnotations`? Are speech act, modality, and hedging used in the Validator, KnowledgeEngine, or ConversationPrompt generation? Or are they stored as metadata only?

3. **Negation**: The spec says negation should "prevent false-positive knowledge commitments." Does the Classifier check `discourseAnnotations.negated`, or does the KnowledgeEngine? We need to know the consumption point to ensure our negation signal reaches it.

### 4.3 Fallback Behavior

Per §10.4.1: "If TagTeam.js is not loaded, the OrchestrationAdapter falls back to the built-in NLParser."

We need clarity on:
- Is fallback binary (TagTeam loaded = use TagTeam, not loaded = use built-in)?
- Or can the OrchestrationAdapter fall back per-utterance based on `fandaws:confidence` below a threshold?
- If TagTeam returns a very low confidence score (e.g., < 0.3), should the OrchestrationAdapter re-parse with the built-in parser?

### 4.4 Error Contract

What should TagTeam do when parsing fails completely (e.g., empty string, non-text input, language not supported)?
- Return a ParseResult with `confidence = 0` and empty fields?
- Throw an error that the OrchestrationAdapter catches?
- Return a specific error type defined in the contract?

---

## 5. Open Questions

### Q1: Determinism Constraint and Trained Weights

**Fandaws §2.8** states: "No core computation module may use probabilistic inference, neural network weights, language model API calls, or any non-deterministic reasoning method."

TagTeam.js uses **trained perceptron weights** for POS tagging and dependency parsing. These weights are fixed at training time and produce **deterministic output** — same input always produces same output. There is no inference-time randomness, no API calls, no sampling.

However, the weights were *derived* from statistical training on UD-EWT treebank data. They are "neural network weights" in the technical sense (averaged perceptron parameters), even though the runtime is a simple dot-product classifier, not a neural network.

**Our reading**: §10.4.1 explicitly defines TagTeam.js as a Tier 2 integration accessed through the TagTeamAdapter — it is not a "core computation module" under §3.2. The constraint in §2.8 applies to core modules (NLParser, Classifier, KnowledgeEngine, Validator, DescriptionEngine, ExportEngine). TagTeam replaces the NLParser via an adapter boundary, which is explicitly allowed by the Integration layer architecture.

**Request**: Please confirm this reading. Does TagTeam.js satisfy §2.8 by operating behind the adapter boundary, even though its internal computation uses trained weights?

### Q2: Latency Budget

**Fandaws §10.8.4** targets < 5ms for the built-in NLParser and < 40ms for the full pipeline.

TagTeam.js current performance:
- p50: 15.95 ms
- p95: 27.44 ms

This means TagTeam consumes ~16ms of the 40ms pipeline budget at p50, leaving ~24ms for Classifier + KnowledgeEngine + Validator + StateAdapter + DescriptionEngine (their combined target is ~33ms).

**Question**: Is this acceptable? The p50 latency is 3x the built-in NLParser target, but the total pipeline still fits within the 40ms budget at p50. At p95 (27.44ms), the pipeline would be tight but feasible.

We have identified improvement paths (model caching: -3ms, feature hashing: -2ms) that could reduce p50 to ~11ms. Should we prioritize this before or after the adapter implementation?

### Q3: Multi-Act Sentences

TagTeam.js can extract multiple acts from a single sentence:
- "The nurse treated the patient and administered medication" → 2 acts

The ParseResult schema defines a single subject/predicate/object triple. **How should multi-act sentences be handled?**

Options:
- **(A)** Return one ParseResult for the primary (first/highest-confidence) act
- **(B)** Return an array of ParseResult objects, one per act
- **(C)** Return one ParseResult with a secondary-acts array in discourseAnnotations

We lean toward **(B)** as it preserves information, but this changes the adapter return type from `ParseResult` to `ParseResult[]`. Please advise.

### Q4: Conversation History — Initial Scope

The TagTeamParseRequest includes `fandaws:conversationHistory`. TagTeam.js currently operates statelessly — each parse is independent with no conversation context.

**Question**: Is conversation history required for the initial integration, or can we implement single-utterance parsing first and add history support later? If required, what is the expected format of the Utterance[] array?

### Q5: Knowledge Graph Context — Initial Scope

The spec states TagTeam "may also consume the current KnowledgeGraph as parsing context to improve disambiguation" (AC-5.15, marked advisory in our roadmap).

**Question**: Can we defer knowledge graph context to a later phase? Our initial adapter will accept `knowledgeGraphId` but not use it. The `getCapabilities()` response will report `knowledgeGraphContext: false`.

### Q6: Copular Relation Inference

TagTeam.js detects 7 copular relation patterns:

| Pattern | Relation |
|---------|----------|
| "X is a Y" | rdfs:subClassOf |
| "X is a member of Y" | cco:member_of |
| "X is part of Y" | bfo:part_of |
| "X is a component of Y" | cco:has_part (inverse) |
| "X is located in Y" | bfo:located_in |
| "X consists of Y" | bfo:has_part |
| "X belongs to Y" | cco:member_of |

**Question**: Should these relation types be included in the ParseResult, or does the Fandaws Classifier re-derive them? The current ParseResult schema has no field for relation type. Should we add it to `discourseAnnotations`, or propose a schema extension?

### Q7: Passive Voice — Subject/Object Mapping

For passive sentences, the syntactic subject is the semantic patient:
- "The patient was treated by the doctor"
  - Syntactic subject: "the patient" (but is the patient, not the agent)
  - Semantic agent: "the doctor" (from "by" phrase)

**Question**: Should `fandaws:subject` contain the **semantic agent** ("doctor") or the **syntactic subject** ("patient")? We assume semantic agent, since Fandaws' Classifier needs to know who performed the action. Please confirm.

### Q8: Entity Granularity

TagTeam.js extracts entities with ontological types (cco:Person, cco:Organization, bfo:Quality, etc.) and a Two-Tier ICE architecture (discourse referents + ontological classifications).

The ParseResult schema expects simple strings for subject/object.

**Question**: Should we strip entities down to plain text strings, or is there a way to pass through the richer typing information? Options:
- **(A)** Plain strings only: `fandaws:subject = "the doctor"`
- **(B)** Strings with type hints in discourseAnnotations: `fandaws:subject = "doctor"` + `discourseAnnotations.subjectType = "cco:Person"`
- **(C)** Propose a ParseResult schema extension for typed entities

### Q9: Fandaws Implementation Status

What is the current implementation status of the Fandaws modules we'll integrate with?

| Module | Question |
|--------|----------|
| OrchestrationAdapter | Is there a reference implementation we can test against? |
| Classifier | Is it implemented? Can we run our ParseResult through it? |
| Built-in NLParser | Is it implemented? Can we compare outputs? |
| StateAdapter | Is there an InMemoryStateAdapter we can use for integration tests? |

If Fandaws modules are not yet implemented, we can build and test the TagTeamAdapter in isolation using mock consumers, then integrate when the Fandaws pipeline is available.

### Q10: Testing Strategy

The spec (§9.1) says: "Each core computation module is tested by providing JSON-LD input fixtures and asserting JSON-LD output matches expected results."

**Proposal**: We will provide a test fixture set of ~50 TagTeamParseRequest/ParseResult pairs covering:
- 15 classification patterns ("X is a Y")
- 10 property patterns ("X has Y")
- 15 customRelationship patterns (active, passive, ditransitive)
- 5 discourse annotation patterns (questions, directives, hedging, modality, negation)
- 5 edge cases (empty input, very long input, non-English, coordination)

The Fandaws team can use these fixtures to validate that their OrchestrationAdapter correctly routes TagTeam output through the pipeline.

**Question**: Is this the right approach? Should fixtures be authored jointly?

---

## 6. Proposed Timeline

| Phase | Scope | Duration |
|-------|-------|----------|
| **5A** | Core adapter (parse, isAvailable, getCapabilities) + VerbTypeClassifier + ParseResultMapper | 1 sprint |
| **5B** | DiscourseAnnotationExtractor (speech act, modality, hedging, negation) | 1 sprint |
| **5C** | Test fixtures + integration testing with Fandaws pipeline (if available) | 1 sprint |
| **5D** | Knowledge graph context (AC-5.15, if prioritized) | Deferred |

We can begin **5A immediately** — the adapter, classifier, and mapper depend only on the ParseResult schema, which is defined in the spec. No Fandaws runtime dependency.

**5C** depends on Fandaws module availability. If Fandaws modules aren't ready, we'll ship the adapter with mock-based tests and defer integration testing.

---

## 7. Shared Constraints

Both systems already share these architectural principles:

| Constraint | TagTeam.js | Fandaws |
|-----------|------------|---------|
| Edge-canonical | Browser + Node.js | Browser + Node.js |
| JSON-LD canonical | All output is JSON-LD | All contracts are JSON-LD |
| BFO/CCO alignment | Entity types from BFO/CCO | Concept types from BFO |
| Deterministic | Fixed trained weights | Pure computation modules |
| No infrastructure | Zero external dependencies | No required servers/DBs |
| Offline-first | Fully offline | Offline as first-class mode |

This alignment means integration should be straightforward at the data contract level. The main work is mapping TagTeam's richer semantic representation into Fandaws' flatter ParseResult schema without losing information that downstream modules need.

---

## 8. Action Items

| # | Owner | Action |
|---|-------|--------|
| 1 | Fandaws | Confirm §2.8 reading (Q1) — trained weights behind adapter boundary |
| 2 | Fandaws | Confirm latency budget acceptability (Q2) |
| 3 | Fandaws | Decide multi-act handling: single vs. array ParseResult (Q3) |
| 4 | Fandaws | Confirm conversation history can be deferred (Q4) |
| 5 | Fandaws | Confirm knowledge graph context can be deferred (Q5) |
| 6 | Fandaws | Advise on copular relation type passthrough (Q6) |
| 7 | Fandaws | Confirm subject = semantic agent for passives (Q7) |
| 8 | Fandaws | Decide entity granularity in ParseResult (Q8) |
| 9 | Fandaws | Report implementation status of consuming modules (Q9) |
| 10 | Joint | Agree on test fixture strategy (Q10) |
| 11 | TagTeam | Begin 5A implementation (adapter + classifier + mapper) |
| 12 | TagTeam | Provide 50-fixture test set for Fandaws validation |
