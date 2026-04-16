# Phase 12 Engagement Protocol
**How to work with the AVC bundle during implementation**

---

## The Three Questions This Document Answers

1. How do I run the AVC scenarios during development?
2. What do I do when a scenario fails?
3. What do I do if I think a scenario is wrong?

---

## Running the AVC Scenarios

### The Scenario Runner

The AVC bundle is a data file. It needs a runner that loads scenarios, executes them against the engine, and reports pass/fail with structured diffs.

Build the runner early — probably in the first few days of Phase 12 work. The pattern is:

```
avc/
  run.js                              (the runner CLI)
  lib/
    scenario-loader.js                (loads JSON, validates schema)
    setup-builder.js                  (translates scope setup to engine state)
    trigger-executor.js               (executes utterance or programmatic trigger)
    output-capturer.js                (captures MachineSignal, mutations, post-state)
    diff-reporter.js                  (structured diffs on failure)
  phase-12-avc-bundle.json            (the scenario bundle — read-only)
```

### Invocation

```bash
# Run the full bundle
node avc/run.js --bundle avc/phase-12-avc-bundle.json

# Run a single scenario by id
node avc/run.js --bundle avc/phase-12-avc-bundle.json --scenario compat-transitive-match

# Machine-readable output (for future CI)
node avc/run.js --bundle avc/phase-12-avc-bundle.json --reporter json

# Run scenarios matching a tag or verifies-pattern
node avc/run.js --bundle avc/phase-12-avc-bundle.json --verifies "Decision 1"
```

### What to Report When Scenarios Fail

Don't just report "N failing." Report each failure with:
- Scenario ID
- Scenario version (from the bundle)
- The `verifies` field (which architectural commitment is at risk)
- The structured diff (expected vs actual)

This matches the reporting format in the AVC v1.0 specification. Without the diff, the architect has to ask follow-up questions. With the diff, the architect can often see the problem without a conversation.

### Pending Scenarios

The bundle ships with `status: "awaits_implementation"`. Until the engine supports the full Phase 12 feature set, most scenarios will not pass. That is expected — they are the definition of done, not the current state.

The runner should distinguish three states:
- **Passing:** Scenario runs end-to-end and matches expected output.
- **Failing:** Scenario runs but output does not match. Report the diff.
- **Not yet runnable:** Scenario requires a feature that has not been implemented. Report which feature is missing (e.g., "staleCopyPrompt not implemented").

The third state lets you track progress. "5 passing, 12 failing, 8 not yet runnable" tells a clearer story than "5 of 25 passing."

---

## When a Scenario Fails

Scenarios fail for three reasons. The protocol depends on which.

### Reason 1: The implementation has a bug

This is the most common case. The scenario expected X, the implementation produced Y, the implementation is wrong.

**Protocol:** Fix the implementation. No discussion required. The scenario is the spec; the implementation conforms to the spec.

### Reason 2: The scenario is ambiguous

Sometimes a scenario's expectations are clear in the architect's head but unclear in the JSON. The implementation produced output that seems reasonable, but the scenario's expected output is different in a way you can't explain from the scenario alone.

**Protocol:** File a clarification request with the architect. Include:
- The scenario ID
- What the implementation produced
- What the scenario expected
- What is ambiguous

The architect responds with one of:
- "The expectation is correct; here's the reasoning." (Implementation fix follows.)
- "The expectation is unclear; I'm updating the scenario with version bump and clearer language." (Scenario changes; no implementation fix needed yet.)
- "There's a gap I didn't anticipate; let's discuss." (Architectural discussion precedes implementation.)

### Reason 3: The scenario is wrong

Rarely, a scenario will genuinely reflect an architectural mistake. You have context the architect didn't — maybe the expected behavior violates a constraint elsewhere in the system, or contradicts another spec, or is impossible to implement without breaking something else.

**Protocol:** File a discrepancy report (format below). Do NOT modify the scenario. Do NOT silently implement the behavior you think is correct instead.

---

## Filing a Discrepancy Report

When you believe a scenario is wrong, file a report with this structure:

```markdown
# Discrepancy Report: [scenario-id]

**Bundle:** phase-12-avc-bundle.json
**Scenario version:** [version from bundle]
**Reporter:** [developer name]
**Date:** [ISO date]

## The Scenario's Expectation

[Quote or summarize what the scenario expects]

## What I Believe Should Happen Instead

[Describe the behavior you believe is correct]

## Why

[Reasoning. This is the most important section. Reference specs,
architectural commitments, implementation constraints, or logical
contradictions with other scenarios.]

## Suggested Resolution

[Options:
 - Scenario should be updated to match correct behavior [describe]
 - Scenario should be removed because [reasoning]
 - A new scenario should be added to capture the case [describe]
 - I'm unsure — requesting architect guidance]

## Blocking Status

[Is implementation blocked on this, or can I continue on other scenarios?]
```

The architect will read the report and respond with a decision. Expected turnaround: within one working day for non-blocking reports, same-day for blocking reports.

### What Counts as a Legitimate Discrepancy

- **Contradiction with locked decisions.** If a scenario contradicts Decision 1, 2, 3, or the IRI minting rules, the scenario is wrong (or the locked decision needs revision, which is a separate conversation).
- **Contradiction with another scenario.** If two scenarios both pass only by different implementations, one is wrong.
- **Implementation impossibility.** If the expected behavior cannot be produced without violating a constraint elsewhere, the scenario needs revision.
- **Specification gap.** If the scenario expects behavior the Phase 12 spec doesn't describe, either the spec is incomplete or the scenario is over-reaching.

### What Does NOT Count as a Legitimate Discrepancy

- "This seems too strict." Strictness is the point.
- "My implementation does something different, and I think it's fine." Maybe it is, but the scenario is the contract. File the report; don't reconcile silently.
- "This would be hard to implement." Hardness is not wrongness.
- "The existing codebase doesn't work this way." The existing codebase may be wrong; the scenario reflects intent, not legacy.

---

## What "Done" Looks Like

Phase 12 is complete when the AVC runner reports:

```
Bundle: phase-12-avc-bundle.json (v2)
Status: 25 passing, 0 failing, 0 not-yet-runnable

All scenarios passing. Phase 12 complete.
```

Not "22 passing and 3 reconciled." Not "24 passing and 1 skipped." All 25.

When you reach this state, notify the architect. The architect will:
1. Review the runner output.
2. Spot-check 2-3 scenarios by reading the actual engine behavior (transcripts, exports).
3. Confirm Phase 12 complete, or file findings if spot-checks reveal issues.

After architect confirmation, the bundle status flips from `awaits_implementation` to `active`. From that point forward, the runner runs AVC on every build, and regressions are caught automatically.

---

## Ongoing: After Phase 12

Once Phase 12 passes:

- The AVC runner becomes part of your regular test cycle. Run it alongside the existing 2034-test suite on every commit.
- New architectural commitments become new AVC scenarios, authored by the architect, handed to you.
- If an AVC scenario regresses, treat it like a P0 bug. AVC regressions mean architectural commitments are at risk.
- Any change that touches MachineSignal schemas, the graph-state export, or the mutation log requires architect review before merge. These are the AVC's assertion surfaces.

---

## Final Word

This protocol exists because the AVC system works only if both sides hold up their end.

The architect's end: scenarios are locked before implementation, clearly traceable to specs, responsive to discrepancy reports, patient with first-cycle rough edges.

The developer's end: scenarios are not modified without sign-off, failures are reported with diffs, discrepancies are escalated through the report protocol rather than reconciled silently.

When both sides hold the line, the AVC catches architectural regressions that unit tests miss. When either side breaks the protocol, the system collapses back into "all tests pass, intent lost."

Phase 12 is the first phase using this system. It will teach us what needs refinement. Expect some friction on the first cycle. Report friction honestly — it improves the protocol for Phase 13 and beyond.
