# Phase 13 Locked Architectural Decisions
**Companion to phase-13-avc-bundle.json**
**Status: LOCKED — not subject to revision during Phase 13 implementation**

---

## Decision A: MachineSignal Schema — Layered

**Rule:** Every MachineSignal consists of a common envelope plus a prompt-type-specific extension payload. No flat schema.

### Envelope Fields (present on every MachineSignal)

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `promptType` | string (registered) | yes | Identifies which prompt type this is. Must be in the registry. |
| `constraintType` | enum | yes | The ontological constraint category. Values: `subsumption`, `inherence`, `disjointness`, `scopeLevel`. |
| `options` | array of strings | yes | Valid response choices. May be empty for informational prompts (e.g., importedConceptGuard). |
| `expectedSchema` | JSON Schema object | yes | Valid JSON Schema (draft-07+) describing the response contract. |
| `candidateIRIs` | array of IRIs | no | Populated when the prompt involves disambiguation between specific concepts. |
| `hierarchyContext` | object | no | Relevant subgraph context. Populated for disambiguation and conflict prompts. |

### Extension Payload (prompt-type-specific)

Each registered prompt type defines its own extension fields. The extension is a sibling of the envelope fields, not nested inside the envelope. Example structure:

```json
{
  "envelope": {
    "promptType": "reclassificationConsequence",
    "constraintType": "subsumption",
    "options": ["keep_current", "reclassify_subtree", "reclassify_only"],
    "expectedSchema": { ... }
  },
  "extension": {
    "caseType": "weakening",
    "subject": "animal",
    "currentParent": "organism",
    "proposedParent": "material entity",
    "lostProperties": [ ... ]
  }
}
```

### Why Layered

A flat schema with 15+ fields, most null on any given prompt, is an anti-pattern. The layered approach mirrors OWL class hierarchy: the envelope is the base class, each prompt type is a subclass with its own properties. An agent processing a MachineSignal reads the envelope to determine the prompt type, then reads the extension for type-specific data. No null-field parsing, no conditional logic based on which fields happen to be populated.

### Stability Contract

Envelope fields are frozen. Adding a new envelope field requires architect sign-off. Extension fields per prompt type are frozen once the prompt type is registered. Adding a new extension field to an existing prompt type requires architect sign-off because AVC scenarios assert on extension shapes.

---

## Decision B: Prompt Type Registry

**Rule:** MachineSignal may only be emitted with a registered `promptType`. Unregistered types trigger `SchemaValidationError` at emit time, not at consumption time.

### Registered Types

| Prompt Type | Source Phase | constraintType | Extension Fields |
|-------------|-------------|----------------|------------------|
| `reclassificationConsequence` | Consequence-Aware Reclass | `subsumption` | `caseType`, `subject`, `currentParent`, `proposedParent`, `lostProperties` |
| `conflictResolution` | Phase 12 | `scopeLevel` | `term`, `definitions` |
| `staleCopyPrompt` | Phase 12 | `scopeLevel` | `term`, `localVersion`, `sourceVersion`, `differences` |
| `refineDisambiguationRequired` | Phase 12 | `scopeLevel` | `attemptedLabel`, `conflictingTerm` |
| `objectResolution` | Property Workflow | `inherence` | TBD during implementation |
| `homonymDisambiguation` | Homonym Detection | `subsumption` | `candidates`, `hierarchyContext` |
| `importedConceptGuard` | Ontology Ingestion | `inherence` | `blockedConcept`, `reason`, `isImported` |
| `deadlockRemediation` | Phase 13 (new) | varies | `concept`, `mutationType`, `rejectionCount`, `suggestedRepair` or `deferralReason` |

### Extensibility

New prompt types can be registered. Registration requires:
1. A unique `promptType` string.
2. A documented extension schema.
3. Architect sign-off.

Once registered, the type and its extension schema are frozen. The registry is additive-only in normal operation.

### Validation

When the engine emits a MachineSignal, the orchestration adapter MUST validate that `promptType` is in the registry before emitting. If not registered:
- Throw `SchemaValidationError` with `reason: "unregistered_prompt_type"` and `registeredTypes: [...]`.
- Do NOT emit the MachineSignal to the agent.
- Do NOT silently fall back to a default type.

This catches developer coding errors (forgetting to register a new type) at the source, not at the consumer.

---

## Decision C: `expectedSchema` — Full JSON Schema

**Rule:** Every MachineSignal's `expectedSchema` field is a valid JSON Schema object (draft-07 or newer) that fully describes the response contract.

### What This Means

An M2M agent with no prior knowledge of the Fandaws protocol can:
1. Receive a MachineSignal.
2. Read `expectedSchema`.
3. Use any standard JSON Schema library to validate or generate a response.
4. Submit a conformant response.

No Fandaws-specific SDK is required. The schema IS the SDK.

### Minimum Schema Requirements

Every `expectedSchema` MUST include:
- `$schema` (or equivalent version indicator)
- `type: "object"`
- `properties` with at least one required property
- `required` array listing mandatory response fields

### Example

For a `reclassificationConsequence` prompt:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "choice": {
      "type": "string",
      "enum": ["keep_current", "reclassify_subtree", "reclassify_only"]
    }
  },
  "required": ["choice"],
  "additionalProperties": false
}
```

### Validation of Agent Responses

When the engine receives an agent response, it MUST validate the response against the `expectedSchema` that was emitted with the prompt. If validation fails:
- Return `SchemaValidationError` with the specific validation failure.
- Re-present the same prompt with the same MachineSignal.
- Do NOT apply any mutation.

---

## Decision D: Deadlock Cascade at Rejection 5

**Rule:** Five consecutive rejections for the same (concept, mutationType) pair triggers deadlock detection. The system then executes a synchronous, deterministic remediation cascade.

### Cascade Steps

```
Rejections 1-4:  Normal rejection handling (per existing workflow)

Rejection 5:     DEADLOCK DETECTED → begin cascade:

Step 1: Auto-repair
  → System generates a repair suggestion
  → Present to agent via deadlockRemediation prompt
  → If accepted: apply repair, log as deadlockResolution, done
  → If rejected: proceed to Step 2

Step 2: Deferred Resolution
  → System offers to park the mutation for later resolution
  → Present to agent via deadlockRemediation prompt
  → If accepted: park mutation, log as deadlockResolution, done
  → If rejected: proceed to Step 3

Step 3: Human Escalation (conditional)
  → Only if humanChannelAvailable === true
  → System escalates to human operator
  → If human resolves: apply resolution, log as deadlockResolution, done
  → If human channel not available: skip to Step 4
  → If human cannot resolve: proceed to Step 4

Step 4: EpistemicFailure (terminal)
  → System emits EpistemicFailure event
  → Pair tagged with resolutionStatus: "EpistemicFailure"
  → Mutation dropped
  → Session continues for other pairs
```

### Rejection Counting

Rejections are counted per `(concept, mutationType)` pair per session. The pair is identified after Identity Simplification — "a dog is a process", "dogs are processes", and "a Dog is Process" all normalize to the same `(dog, reclassification)` pair.

Different mutation types on the same concept are separate pairs. "a dog is a process" (reclassification) and "a dog has wings" (property assertion) are two different pairs with independent rejection counts.

### Why Cascade, Not Graduated Thresholds

Graduated thresholds (Step 1 at rejection 5, Step 2 at rejection 6, Step 3 at rejection 7) introduce non-determinism: the agent or context may change between rejections 5 and 6, making the cascade order unpredictable. The synchronous cascade at rejection 5 is deterministic: one trigger, four fallback options tried in order, terminal if all fail. This is testable as a state machine with known transitions.

---

## Decision E: EpistemicFailure — Terminal for Pair, Not Session

**Rule:** EpistemicFailure is terminal for the specific `(concept, mutationType)` pair. The session continues for all other pairs.

### EpistemicFailure Event Shape (Appendix A.6 Conformant)

```json
{
  "type": "EpistemicFailure",
  "concept": "dog",
  "mutationType": "reclassification",
  "attemptCount": 5,
  "rejectionReasons": [
    "BFO disjointness: MaterialEntity and Process are disjoint",
    ...
  ],
  "suggestedActions": [
    "Reclassify dog under a non-disjoint parent",
    "Review BFO placement of the target concept"
  ]
}
```

### Required Fields

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `type` | string: "EpistemicFailure" | yes | Event type identifier |
| `concept` | string | yes | The concept involved in the failed mutation |
| `mutationType` | string | yes | The mutation type that was being attempted |
| `attemptCount` | integer | yes | Total rejection count for this pair |
| `rejectionReasons` | array of strings | yes | All distinct rejection reasons across attempts |
| `suggestedActions` | array of strings | yes | Constructive suggestions for the agent or human |

### Session Isolation

After EpistemicFailure on pair X:
- The agent can assert on pair Y without restriction.
- The session's rate limit counter continues (EpistemicFailure rejections DO count toward rate limit).
- The failed pair is blocked for the remainder of the session. Re-attempting the same pair triggers immediate re-emission of the EpistemicFailure event without re-running the cascade.

---

## Decision F: Rate Limiting — Per Session, 100/min

**Rule:** Each session has an independent rate limit of 100 assertions per 60-second sliding window.

### RateLimitExceeded Error Shape

```json
{
  "type": "RateLimitExceeded",
  "assertionCount": 101,
  "windowSeconds": 60,
  "limit": 100,
  "retryAfter": 23,
  "retryAfterUnit": "seconds"
}
```

### Required Fields

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `type` | string: "RateLimitExceeded" | yes | Error type identifier |
| `assertionCount` | integer | yes | How many assertions were made in the window |
| `windowSeconds` | integer | yes | The rate limit window (60) |
| `limit` | integer | yes | The per-session limit (100) |
| `retryAfter` | integer | yes | Seconds until the agent can resume |
| `retryAfterUnit` | string: "seconds" | yes | Unit for retryAfter |

### Boundary Behavior

- Exactly 100 assertions in 60 seconds: within limit, no error.
- 101st assertion within 60 seconds of the first: `RateLimitExceeded`.
- After `retryAfter` seconds: session resumes, window resets.

### Scope

- Per session: each session has its own counter. One session's rate limit does not affect another.
- Sliding window: the window is the last 60 seconds, not calendar minutes. An assertion at t=30s and another at t=90s are in different windows.

---

## Decision Audit Trail

| Decision | Approved Date | Version |
|----------|---------------|---------|
| A (Layered MachineSignal Schema) | 2026-04-16 | v1 — locked |
| B (Prompt Type Registry — 8 types) | 2026-04-16 | v1 — locked |
| C (Full JSON Schema for expectedSchema) | 2026-04-16 | v1 — locked |
| D (Deadlock Cascade at Rejection 5) | 2026-04-16 | v1 — locked |
| E (EpistemicFailure Terminal for Pair) | 2026-04-16 | v1 — locked |
| F (Rate Limiting Per Session 100/min) | 2026-04-16 | v1 — locked |

Changes to any locked decision require architect review and bundle version bump.
