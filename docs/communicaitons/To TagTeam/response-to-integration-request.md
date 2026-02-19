This is a well-prepared brief. The TagTeam team clearly understands the boundary between discourse model and world model, and the questions are precise. Here's the Fandaws response to each item.

---

**Preamble: The Spec Reference Is Wrong**

The brief cites Fandaws v3.3 §10.4.1 throughout. Fandaws is on v3.4 — the specification was hardened during this review cycle. The section numbers may have shifted. The TagTeam team should re-validate all section references against v3.4 before implementation. The badge on the Sentinel site reads "Spec v3.4" and has since Phase 1 delivery.

---

**Q1: §2.8 Determinism Constraint — Confirmed with Nuance**

The TagTeam team's reading is correct. §2.8 applies to core computation modules (§3.2 enumerated list). TagTeam.js operates behind the TagTeamAdapter boundary as a Tier 2 integration. The adapter interface (`parse`, `isAvailable`, `getCapabilities`) is the contract surface — what happens inside the adapter is the adapter's business.

However, the word "deterministic" matters independently of §2.8. Fandaws requires deterministic exports ("3 export runs → byte-identical output"). If TagTeam.js produces different ParseResults for the same input on different runs, the downstream graph would differ, which breaks export determinism. The brief states "same input always produces same output" — good. But this needs to be a tested invariant, not just an assertion. The test fixture set (Q10) should include a determinism suite: run the same 50 inputs 3 times, assert byte-identical ParseResult output each time.

One additional concern: the brief says TagTeam uses an "averaged perceptron" and calls the parameters "neural network weights in the technical sense." They aren't. An averaged perceptron is a linear classifier, not a neural network. The distinction matters because it affects how the Fandaws community (particularly the BFO ontologists you work with) will perceive the system. Don't call them neural network weights in any public-facing documentation — it invites unnecessary §2.8 challenges from reviewers who read "neural network" and stop there.

---

**Q2: Latency Budget — Acceptable, Defer Optimization**

The 40ms pipeline budget is a soft target, not a hard SLA. At p50 = 15.95ms for TagTeam plus ~33ms remaining budget for the five downstream modules, the total pipeline fits comfortably. At p95 = 27.44ms, it's tight but within tolerance — the downstream modules currently execute well under budget (the entire 1,098-test suite runs in ~8 seconds, which is ~7ms average per test including setup/teardown).

Defer the optimization work (model caching, feature hashing) until after 5A-5C. Measure actual end-to-end latency with the real adapter in place before investing in parser performance. The bottleneck might not be where you expect — the StateAdapter's reverse-relationship index maintenance (3,368ms for 93 tests) is the slowest module in the current pipeline, not the parser.

---

**Q3: Multi-Act Sentences — Option B, with a Constraint**

Return `ParseResult[]`. This is the correct design for three reasons.

First, Fandaws already processes one mutation per ParseResult through the Classifier → KnowledgeEngine → Validator → StateAdapter pipeline. Multiple acts in one ParseResult would require the pipeline to handle compound mutations, which the Validator explicitly rejects (compound statement rejection, Phase 4). Returning an array lets the OrchestrationAdapter loop over individual ParseResults and process each through the existing single-mutation pipeline.

Second, the conversation simulation corpus (Phase 8, 22 entries) already tests multi-turn scenarios where each turn is one utterance → one ParseResult → one mutation. Multi-act handling fits naturally as "one utterance → N ParseResults → N sequential mutations."

Third, ordering matters. "The nurse treated the patient and administered medication" should produce two ParseResults where the treatment comes first. The array preserves ordering; a single ParseResult with secondary-acts does not guarantee processing order.

**The constraint:** the adapter return type change from `ParseResult` to `ParseResult[]` needs a corresponding change in the OrchestrationAdapter's `processUtterance()` method. Currently it expects a single ParseResult from `parser.parse()`. This is a small change — wrap single results in an array for backward compatibility with the built-in NLParser — but it must be coordinated. The Fandaws team will update the OrchestrationAdapter interface to accept `ParseResult | ParseResult[]` and normalize internally.

---

**Q4: Conversation History — Deferred, Confirmed**

Single-utterance parsing first. Conversation history is a Phase 11 (Session Lifecycle) concern on the Fandaws side — the `createConversationSession` type factory exists but session management isn't implemented yet. There's no conversation history to pass until Phase 11 ships. The `conversationHistory` field in TagTeamParseRequest should accept `null` or `[]` for the initial integration. Wire it up when Phase 11 provides actual session state.

---

**Q5: Knowledge Graph Context — Deferred, Confirmed**

Defer. `getCapabilities()` reporting `knowledgeGraphContext: false` is the correct signal. The Fandaws specification marks AC-5.15 as advisory, not required. The ScopeResolver (Phase 12) is the module that would most benefit from parser-side graph context (disambiguation between "mouse the animal" and "mouse the device"), but Phase 12 isn't started. Build the adapter without graph context. The `knowledgeGraphId` parameter should be accepted and ignored, with a clear code comment noting it's reserved for Phase 12 integration.

---

**Q6: Copular Relation Inference — Pass Through, Don't Re-Derive**

This is the most architecturally significant question in the brief. TagTeam detects 7 copular patterns. Fandaws' built-in NLParser detects exactly one: "X is a Y" → `classification`. The Classifier currently re-derives the workflow from the ParseResult's verb and structure.

The right answer is: **pass the relation type through, and extend the ParseResult schema.**

Add a `fandaws:relationHint` field to ParseResult. This is not a `verbType` — it's a hint from the parser about the semantic relationship detected. Values:

| relationHint | Source Pattern | Fandaws Routing |
|---|---|---|
| `rdfs:subClassOf` | "X is a Y" | classification workflow (existing) |
| `bfo:part_of` | "X is part of Y" | customRelationship with verb "part-of" |
| `cco:member_of` | "X is a member of Y" | customRelationship with verb "member-of" |
| `bfo:located_in` | "X is located in Y" | customRelationship with verb "located-in" |
| `bfo:has_part` | "X consists of Y" | customRelationship with verb "has-part" |
| `null` | Non-copular patterns | Classifier derives from verbType as today |

The Classifier will check `relationHint` first. If present, it routes directly. If null, it falls back to the existing verbType-based routing. This is a backward-compatible extension — the built-in NLParser never sets `relationHint`, so the fallback path is exercised exactly as today.

This matters because "X is part of Y" currently routes through the built-in NLParser as a classification ("X is [part of Y]") which is wrong — it would create a concept called "part of Y" and classify X under it. TagTeam correctly identifies this as a mereological relation, not a subsumption. The `relationHint` field lets Fandaws route it correctly.

The relation IRIs (`bfo:part_of`, `cco:member_of`, `bfo:located_in`) align with BFO/CCO — this is exactly the kind of ontological grounding that should flow from TagTeam's ICE architecture into Fandaws' relationship workflow. The relationship workflow (Phase 9) already handles arbitrary verbs; these just become special verbs with standardized IRIs instead of lemmatized user verbs.

---

**Q7: Passive Voice — Semantic Agent, Confirmed**

`fandaws:subject` = semantic agent. `fandaws:object` = semantic patient.

"The patient was treated by the doctor" → `subject: "doctor"`, `object: "patient"`, `predicate: "treat"`.

The Fandaws pipeline reasons about who did what to whom, not about syntactic structure. The KnowledgeEngine creates relationships as `subject --[verb]--> object`, which means "doctor treats patient" — correct. If we used the syntactic subject, we'd get "patient treats doctor" — wrong.

The brief already states TagTeam handles passive voice with correct agent/patient reversal. This is the right behavior. No change needed.

---

**Q8: Entity Granularity — Option B Now, Option C Later**

Option A (plain strings) loses information that Fandaws will need. Option C (schema extension) is premature — we don't know yet what the downstream consumption patterns will be.

Option B is the pragmatic middle ground. `fandaws:subject = "doctor"` with `discourseAnnotations.subjectType = "cco:Person"` and `discourseAnnotations.objectType = "bfo:MaterialEntity"` (or whatever the entity's BFO/CCO classification is).

This matters immediately because the BFO heuristic module (Phase 10, 50 tests) currently infers BFO categories from suffix heuristics ("running" → process, "dog" → materialEntity). If TagTeam provides an actual ontological classification from its ICE architecture, that classification should override the heuristic. The flow would be:

1. TagTeam parses "The doctor treated the patient"
2. ParseResult includes `subjectType: "cco:Person"`, `objectType: "cco:Person"`
3. KnowledgeEngine creates concepts "doctor" and "patient"
4. Instead of running `inferBfoCategory("doctor")` (which would return `materialEntity` — technically correct but imprecise), the engine checks `discourseAnnotations.subjectType`
5. If a CCO type is provided, map it to the appropriate BFO parent (`cco:Person → bfo:BFO_0000040` materialEntity)
6. Store the more specific CCO type as an additional `rdfs:subClassOf` or `rdf:type` annotation

This is a natural extension of the existing BFO infrastructure. The `bfo-heuristic.js` module's `inheritBfoCategory()` function already has a "if parent has bfoMapping, use it" path — TagTeam's type hints are just another source of BFO mapping, higher priority than suffix heuristics.

For the initial adapter (5A), pass the types through as `discourseAnnotations` fields. The Fandaws pipeline will consume them when the KnowledgeEngine is updated to check for parser-provided type hints. That update can happen independently of the adapter implementation.

---

**Q9: Implementation Status — Full Report**

| Module | Status | Available for Integration |
|---|---|---|
| OrchestrationAdapter | **Implemented** (Phase 8). `SynchronousOrchestrationAdapter` routes to classification/property/relationship pipelines. 23 tests. | Yes — but needs the `ParseResult[]` change from Q3 |
| Classifier | **Implemented** (Phase 2). Enum-routing based on verbType. 19 tests. | Yes |
| Built-in NLParser | **Implemented** (Phase 2). Deterministic regex-based. 57 tests + 52 golden corpus. | Yes — use as comparison baseline |
| StateAdapter | **Implemented** (Phase 3). InMemoryStateAdapter with 5 indices. 93 tests. | Yes |
| KnowledgeEngine | **Implemented** (Phase 5). Full classification workflow. 23 tests. | Yes |
| Validator | **Implemented** (Phase 4). 34 tests + 6 sub-module suites. | Yes |
| DescriptionEngine | **Implemented** (Phase 7). 36 tests + 27 golden corpus. Verb conjugation working. | Yes |
| ExportEngine | **Implemented** (Phase 10). SKOS, OWL, Turtle, RDF/XML. BFO triples in export. | Yes |
| Session Lifecycle | **Not Started** (Phase 11). | No — conversation history (Q4) blocked on this |
| ScopeResolver | **Not Started** (Phase 12). | No — knowledge graph context (Q5) blocked on this |

**Everything the TagTeam adapter needs to integrate with is implemented and tested.** The entire pipeline from parse → classify → engine → validate → state → describe → export is operational with 1,098 passing tests. The TagTeam team can test against the real Fandaws pipeline, not mocks. The Sentinel demo site at `https://skreen5hot.github.io/Fandaws-Sentinel/` has a live Conversation Demo that exercises the full pipeline.

---

**Q10: Testing Strategy — Joint Authoring, Agreed**

The 50-fixture proposal is good. The distribution (15 classification + 10 property + 15 relationship + 5 discourse + 5 edge) is reasonable. Joint authoring is the right approach because the fixtures need to satisfy two contracts simultaneously: TagTeam's output schema and Fandaws' consumption expectations.

Three additions to the fixture set:

1. **Determinism suite** (per Q1): Run all 50 inputs 3×, assert byte-identical output. This isn't 50 additional fixtures — it's a test harness that runs the existing 50 three times.

2. **Regression parity suite**: Take the existing Fandaws golden corpora (15 identity, 52 NL-parser, 20 classification, 16 property, 15 relationship, 27 description = 145 entries) and run their input utterances through TagTeam. The TagTeam ParseResult for "A dog is an animal" should produce a ParseResult that, when fed through the Fandaws pipeline, produces the same graph mutation as the built-in NLParser's ParseResult. Any divergence is a bug in either the adapter mapping or the fixture expectations.

3. **TagTeam-only capabilities**: Add ~10 fixtures for patterns the built-in NLParser can't handle — passives, ditransitives, coordination, copular relations beyond "is a". These demonstrate the value-add of TagTeam over the built-in parser and become the regression set for future TagTeam improvements.

Total: ~60 fixtures (50 proposed + 10 TagTeam-unique), plus the determinism harness and parity harness running against existing Fandaws golden corpora.

---

**Responses to Contract Stability (§4.1)**

1. **TagTeamParseRequest schema**: Stable. The three fields (utterance, conversationHistory, knowledgeGraphId) won't change. `conversationHistory` and `knowledgeGraphId` are nullable until Phases 11 and 12.

2. **ParseResult schema**: Stable with one extension — add `fandaws:relationHint` per Q6 response. This is additive (new optional field, null by default), not breaking.

3. **verbType enum**: The three values (classification, property, customRelationship) are complete. No additional types planned. The `relationHint` field (Q6) provides sub-classification within `customRelationship` without expanding the enum.

4. **TagTeamAdapter interface**: The three methods are the complete integration surface. No additional methods planned for the adapter contract.

---

**Responses to Downstream Consumption (§4.2)**

1. **Classifier trust**: The Classifier uses `verbType` directly. If TagTeam sets `verbType = "classification"`, the Classifier routes to the classification workflow without re-deriving. The built-in NLParser also sets verbType, and the Classifier trusts it. This is the contract — the parser is responsible for correct classification, not the Classifier.

2. **Discourse annotations**: Currently, no downstream module consumes discourse annotations. They will be stored as metadata on the ParseResult. Future consumption points: the Validator should check `negated` (to prevent "A dog is not a cat" from creating a classification), and the ConversationPrompt generator could use `speechAct = "question"` to generate clarifying responses instead of assertions. But these are Phase 11+ enhancements. For now, store and forward.

3. **Negation consumption point**: It should be the Classifier. If `discourseAnnotations.negated = true`, the Classifier should route to a `negation` handler (which doesn't exist yet) instead of the positive classification/property/relationship workflows. Until that handler exists, the Classifier should reject negated utterances with a ConversationPrompt: "I understand you're saying X is *not* Y, but I can only record positive assertions right now." This is a small Classifier update that the Fandaws team will implement as part of the adapter integration.

---

**Responses to Fallback Behavior (§4.3)**

Binary fallback initially. If `isAvailable()` returns true, use TagTeam. If false, use built-in NLParser. No per-utterance confidence-based fallback in the initial integration.

Confidence-based fallback is a good idea for later — if TagTeam returns `confidence < 0.3`, re-parse with the built-in parser and take the higher-confidence result. But this requires the OrchestrationAdapter to hold references to both parsers and implement a comparison protocol. That's Phase 5D scope, not 5A.

---

**Responses to Error Contract (§4.4)**

Return a ParseResult with `confidence = 0`, `subject = null`, `object = null`, `predicate = null`, `verbType = null`, and `discourseAnnotations.error = "description of failure"`. Do not throw. The OrchestrationAdapter checks for null verbType and falls back to the built-in NLParser. This gives the pipeline a graceful degradation path — TagTeam failure doesn't crash the system, it just means one utterance gets parsed by the simpler parser.

---

**Summary of Decisions**

| # | Decision |
|---|---|
| Q1 | Confirmed — trained weights behind adapter boundary satisfy §2.8. Add determinism test harness. |
| Q2 | Acceptable — defer optimization to post-5C. |
| Q3 | Option B — `ParseResult[]`. Fandaws will update OrchestrationAdapter to accept array. |
| Q4 | Deferred — null/empty conversationHistory until Phase 11. |
| Q5 | Deferred — accept and ignore knowledgeGraphId until Phase 12. |
| Q6 | Pass through — new `fandaws:relationHint` field added to ParseResult schema. |
| Q7 | Confirmed — semantic agent in subject, semantic patient in object. |
| Q8 | Option B now — type hints in discourseAnnotations. Option C deferred. |
| Q9 | All consuming modules implemented and testable. Full pipeline available. |
| Q10 | Joint authoring. 60 fixtures + determinism harness + parity harness. |

The TagTeam team can begin 5A immediately. The Fandaws pipeline is ready for integration testing.