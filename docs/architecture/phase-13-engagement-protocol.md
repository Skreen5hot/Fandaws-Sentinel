# Phase 13 Engagement Protocol
**How to work with the AVC bundle during M2M Conversation Protocol implementation**

---

## What's Different From Phase 12

Phase 12 established the AVC process. Phase 13 uses the same process with three additions:

1. **Runner extensions.** The Phase 12 runner handled single triggers. Phase 13 requires four new trigger types and two new setup fields. These must be built before scenario execution can begin.

2. **Two bundles running simultaneously.** Phase 12's bundle remains active. Phase 13's bundle is additive. Both must pass on every build. A Phase 13 change that regresses a Phase 12 scenario is a P0 bug.

3. **Foundational infrastructure.** MachineSignal is the assertion surface for all future AVC bundles. Getting it wrong here propagates errors to every subsequent phase. Extra care on the schema shape is warranted.

---

## Runner Extensions Required

### New Trigger Types

**`repeatedAssertion`**
```json
{
  "type": "repeatedAssertion",
  "value": "a dog is a process",
  "repetitions": 5,
  "agentResponseToEachPrompt": { "choice": "reclassify_subtree" }
}
```
Execute the same assertion N times. After each assertion, if a prompt fires, apply the specified `agentResponseToEachPrompt`. Track the cumulative rejection count for the `(concept, mutationType)` pair. Report the count at the end.

**`agentScript`**
```json
{
  "type": "agentScript",
  "turns": [
    { "utterance": "a dog is a mammal", "expectedPrompt": null, "expectedMutation": "classification" },
    { "utterance": "a dog chases a cat", "expectedPrompt": null, "expectedMutation": "relationship" }
  ]
}
```
Execute a sequence of turns. Each turn has an utterance, an optional expected prompt (null if no prompt expected), an optional agent response (if a prompt is expected), and an expected outcome. The runner loops through turns sequentially, capturing at each step. A failure at any turn reports which turn failed and the diff for that turn.

**`burstAssertions`**
```json
{
  "type": "burstAssertions",
  "count": 101,
  "withinSeconds": 60
}
```
Execute N assertions as fast as possible (or within the specified time window). Used for rate limit testing. The assertions can be simple (e.g., "concept-N is a thing" with incrementing N). The runner must track wall-clock time and assertion count.

**`internalEmit`**
```json
{
  "type": "internalEmit",
  "value": "inventedPromptType"
}
```
Simulate an internal code path attempting to emit an unregistered prompt type. This tests the registry validation, not the user-facing pipeline. The runner must call the MachineSignal emission path directly with the specified prompt type and capture the resulting error.

### New Setup Fields

**`callerMode`** — `"agent"` or `"human"`. Passed to the orchestration adapter. Determines whether MachineSignal is populated (agent) or null (human).

**`humanChannelAvailable`** — Boolean. Determines whether cascade step 3 (human escalation) is available. Default false.

**`priorState`** — Object describing pre-existing session state beyond graph setup. Used for scenarios that require an EpistemicFailure to already exist on a pair before the trigger fires.

### New Capture Fields

**`agentResponse`** — When a scenario specifies an agent response to a prompt, the runner must apply it and capture the post-response state. Analogous to Phase 12's `user_choice`.

**Performance capture** — The `sim-performance-no-disambiguation` scenario asserts `performanceMs.lessThan: 40`. The runner must measure wall-clock time from trigger to mutation-applied and report it.

---

## Running the AVC

### Both Bundles on Every Build

```bash
# Run Phase 12 bundle
node avc/run.js --bundle avc/phase-12-avc-bundle.json

# Run Phase 13 bundle
node avc/run.js --bundle avc/phase-13-avc-bundle.json

# Or run all bundles
node avc/run.js --corpus avc/
```

Both must report all-passing. A failure in either bundle blocks the build.

### Progress Tracking

Phase 13 has 24 scenarios across three groups. Track progress by group:

```
MachineSignal Schema (10):  [■■■■■■□□□□] 6/10
Deadlock Prevention  (10):  [■■□□□□□□□□] 2/10
M2M Simulation       (4):   [□□□□]       0/4
```

The groups are ordered by dependency. MachineSignal scenarios should pass first because deadlock and simulation scenarios depend on MachineSignal being correct.

---

## When a Scenario Fails

Same protocol as Phase 12. Three reasons, three responses:

**Bug in implementation:** Fix it. The scenario is the spec.

**Ambiguous scenario:** File a clarification request. Include the scenario ID, what the implementation produced, what the scenario expected, and what's ambiguous.

**Wrong scenario:** File a discrepancy report per the format below. Do NOT modify the scenario.

### Discrepancy Report Format

```markdown
# Discrepancy Report: [scenario-id]

**Bundle:** phase-13-avc-bundle.json
**Scenario version:** [version from bundle]
**Reporter:** [developer name]
**Date:** [ISO date]

## The Scenario's Expectation
[Quote or summarize]

## What I Believe Should Happen Instead
[Describe]

## Why
[Reasoning — reference specs, locked decisions, other scenarios,
or implementation constraints]

## Suggested Resolution
[Options]

## Blocking Status
[Is implementation blocked on this?]
```

---

## Anticipated Questions

Based on the bundle's complexity, here are questions I expect. Answers are included to save a round-trip:

**Q: Should `deadlockRemediation` use a different MachineSignal for each cascade step (auto-repair vs deferral vs escalation), or one prompt type with step-specific extension fields?**

A: One prompt type (`deadlockRemediation`), different extension fields per step. The `options` array changes per step (`["accept_repair", "reject_repair"]` for auto-repair, `["accept_deferral", "reject_deferral"]` for deferral). The cascade step is identifiable from the `options` content.

**Q: What does the auto-repair suggestion contain? The scenarios say `"suggestedRepair": "ANY_NONEMPTY_STRING"` which is loose.**

A: The repair content is implementation-specific and not architecturally locked. A reasonable repair for "dog is a process" might be "Consider classifying dog under a non-disjoint BFO category such as MaterialEntity." The scenario asserts that a suggestion EXISTS, not that it has a specific wording. If you want to propose a structured repair format, file a clarification request and I'll review.

**Q: For `burstAssertions`, what should the 101 assertions contain? Random concepts?**

A: Sequential concept creation is fine: "concept-1 is a thing", "concept-2 is a thing", etc. The content doesn't matter for rate limiting — only the count and timing matter. Use the simplest assertions that don't trigger disambiguation or prompts.

**Q: The `ms-human-mode-null` scenario asserts `machineSignal: null`. Currently the orchestration adapter doesn't emit a `machineSignal` field at all in human mode. Is `undefined` acceptable, or must it be explicitly `null`?**

A: Must be explicitly `null`. The field MUST be present with value `null`, not absent. This is a deliberate contract: consumers checking `if (prompt.machineSignal)` get `false` in human mode regardless of whether they check for null or undefined. Consumers checking `if ('machineSignal' in prompt)` get `true` in both modes — the field always exists. This prevents "is MachineSignal not supported, or is this just human mode?" ambiguity.

**Q: The performance scenario says < 40ms. Is that mean, median, P99, or single-sample?**

A: Single assertion, single measurement, wall-clock. The scenario runs one assertion and measures. If it consistently exceeds 40ms, that's a performance problem. If it occasionally spikes due to GC or system load, re-run. The intent is "the pipeline does not add material overhead for MachineSignal generation." A 38ms result is fine. A 120ms result is a bug. A 42ms result in a noisy environment is worth investigating but not blocking.

---

## What "Done" Looks Like

```
Bundle: phase-12-avc-bundle.json (v2)
Status: 25 passing, 0 failing

Bundle: phase-13-avc-bundle.json (v1)
Status: 24 passing, 0 failing

Total AVC: 49 passing, 0 failing
```

When you reach this state, notify the architect. Spot-check transcripts will be requested for 2-3 scenarios (likely `ms-agent-roundtrip`, `dl-all-remediation-exhausted-epistemic-failure`, and `sim-agent-hits-deadlock-continues`). After transcript confirmation, Phase 13 is confirmed complete.

---

## After Phase 13

MachineSignal is the permanent assertion surface. Every future phase's AVC scenarios will assert against it. The MachineSignal schema is now a shared contract between:
- The engine (emits it)
- The AVC runner (asserts against it)
- Future M2M agents (consume it)
- Future FNSR services (may consume it)

Changes to MachineSignal after Phase 13 ships require architect sign-off AND a review of all existing AVC scenarios that assert on the affected fields. This is the cost of building foundational infrastructure correctly: changes are expensive because dependents are many. The benefit is that the contract is stable and trustworthy.

Treat MachineSignal schema stability with the same seriousness as BFO placement decisions. Both are ontological commitments that outlive any single phase.
