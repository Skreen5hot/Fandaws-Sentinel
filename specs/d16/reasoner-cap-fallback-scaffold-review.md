# Scaffold Review — `reasoner-cap-fallback-query-granularity`

**For:** SME (async review before Checkpoint 2 or standalone)
**Prepared:** 2026-04-21
**Scenario ID:** `reasoner-cap-fallback-query-granularity`
**Band:** 1 (CAU Signature Extraction)
**Verifies:** D1.6-L4, Rule LS-10
**Review time:** ~10 min async

---

## What's under review

The Week 3 scaffold for this scenario is a canned handler that returns a fixed shape matching the scenario's expected output. This document puts the scenario contract, the handler, and the spec rules side-by-side so SME can confirm the contract is faithful before the real Tau Prolog implementation lands in Weeks 4-6.

**The one decision that matters:** does the canned shape correctly encode the per-query fallback discipline (fallback applies at query granularity, not axiom-graph scope)? If yes — approve; the Week 4-6 implementation reproduces this contract against real reasoner runs. If no — flag which field is wrong and the real implementation inherits the corrected contract.

---

## The scenario contract (AVC bundle)

Source: [avc/fandaws-sentinel-d16-avc-bundle.json](../../avc/fandaws-sentinel-d16-avc-bundle.json) — search for `reasoner-cap-fallback-query-granularity`.

```json
{
  "id": "reasoner-cap-fallback-query-granularity",
  "band": 1,
  "verifies": ["D1.6-L4", "Rule LS-10"],
  "description": "Signature comparison between a CAU and a BFO category runs N necessary-condition queries. Of 5 queries, 2 exceed the 10,000-step Horn inference cap and fall back to structural correspondence matching. The remaining 3 queries complete via Tau Prolog normally. reasonerFallbackUsed flag is set per-query, not per-CAU. Overall disposition still valid; fallback is local, not wholesale.",
  "setup": {
    "cau": "ex:ComplexClass with 8 axioms",
    "targetBFO": "bfo:Process with 5 necessary conditions",
    "reasonerStepCap": 10000
  },
  "trigger": { "type": "computeSignatureComparison" },
  "expect": {
    "totalQueries": 5,
    "queriesCompletedByTauProlog": 3,
    "queriesFallenBackToStructural": 2,
    "perQueryFallbackFlags": [
      { "query": "NC1", "reasonerFallbackUsed": false, "stepsConsumed": 240 },
      { "query": "NC2", "reasonerFallbackUsed": false, "stepsConsumed": 890 },
      { "query": "NC3", "reasonerFallbackUsed": true,  "stepsConsumed": 10000, "fallbackMode": "structural-correspondence" },
      { "query": "NC4", "reasonerFallbackUsed": true,  "stepsConsumed": 10000, "fallbackMode": "structural-correspondence" },
      { "query": "NC5", "reasonerFallbackUsed": false, "stepsConsumed": 3200 }
    ],
    "dispositionValidDespiteFallback": true,
    "provenanceRecordsPerQueryDetail": true
  },
  "negative_assertions": [
    { "condition": "no wholesale regression",
      "description": "A CAU with some queries exceeding the cap MUST NOT fall back to structural correspondence for ALL its queries. Fallback is applied at query granularity per D1.6-L4 v0.2 tightening." },
    { "condition": "axiom-graph isomorphism ruled out",
      "description": "Even under fallback, the matcher MUST NOT attempt full axiom-graph isomorphism. Fallback is structural correspondence at the type-level query scope." }
  ]
}
```

---

## The scaffold handler

Source: [tests/avc/d16-runner.test.js:277-299](../../tests/avc/d16-runner.test.js#L277-L299).

```javascript
function handleComputeSignatureComparison(scenario) {
  // reasoner-cap-fallback-query-granularity: scaffold returns the exact
  // shape the scenario prescribes — 5 queries (all Process NCs including the
  // CURATED-HEURISTIC NC5, because queries run per-NC regardless of tag), 2
  // of which (NC3, NC4) hit the 10000-step cap and fall back to structural
  // correspondence. Demonstrates per-query (not wholesale) fallback per
  // D1.6-L4 and Rule LS-10. Real step counts come from Tau Prolog in Week 4-6.
  const canned = [
    { query: 'NC1', reasonerFallbackUsed: false, stepsConsumed: 240 },
    { query: 'NC2', reasonerFallbackUsed: false, stepsConsumed: 890 },
    { query: 'NC3', reasonerFallbackUsed: true,  stepsConsumed: 10000, fallbackMode: 'structural-correspondence' },
    { query: 'NC4', reasonerFallbackUsed: true,  stepsConsumed: 10000, fallbackMode: 'structural-correspondence' },
    { query: 'NC5', reasonerFallbackUsed: false, stepsConsumed: 3200 },
  ];
  return {
    totalQueries: canned.length,
    queriesCompletedByTauProlog: canned.filter(q => !q.reasonerFallbackUsed).length,
    queriesFallenBackToStructural: canned.filter(q => q.reasonerFallbackUsed).length,
    perQueryFallbackFlags: canned,
    dispositionValidDespiteFallback: true,
    provenanceRecordsPerQueryDetail: true,
  };
}
```

Registered in the trigger registry at [tests/avc/d16-runner.test.js:452](../../tests/avc/d16-runner.test.js#L452):

```javascript
computeSignatureComparison: handleComputeSignatureComparison,
```

---

## Spec rules the shape enforces

### D1.6-L4 (original + v0.2 tightening)

> Signature comparison uses type-level Tau Prolog pattern entailment under background theory. NOT axiom-graph isomorphism. **Fallback to structural correspondence at query granularity when 10K step cap exceeded.**

The "at query granularity" clause is the v0.2 tightening. Prior formulation allowed wholesale fallback; the tightened rule restricts fallback to individual queries that hit the cap, leaving remaining queries to complete via Tau Prolog normally. The `perQueryFallbackFlags` array operationalizes this — each NC query carries its own `reasonerFallbackUsed` boolean, not a CAU-level flag.

### Rule LS-10

> Tau Prolog pattern entailment answers type-level queries only ("does this CAU entail BFO category X membership?"), not axiom-graph isomorphism. Per §2.5 and SME v0.1 correction to Q1.4.

The negative_assertion "axiom-graph isomorphism ruled out" reinforces this at the fallback boundary. Even when a query falls back, the fallback is "structural correspondence at the type-level query scope" — still type-level, just without Prolog inference. Not a degraded fall-through to full-graph matching.

### Spec §2.5 Step 6

> Queries exceeding the cap fall back to weak structural-correspondence matching for that specific query; the fallback is recorded in the Signature comparison's reasonerFallbackUsed field. Fallback is applied at the type-level query granularity, not at the axiom-graph level (per SME v0.1 review) — this ensures fallback is a local compromise rather than a wholesale pattern-matching regression.

The scaffold's `perQueryFallbackFlags[*].reasonerFallbackUsed` field is the literal surfacing of this spec commitment.

---

## Scaffold-mode transparency

**What the scaffold does:** returns canned 5-query/2-fallback shape with fictional step counts (240, 890, 10000, 10000, 3200) matching the scenario's prescribed values exactly.

**What the scaffold does NOT do:**
- Run any actual Tau Prolog queries. The step counts are scenario fixtures, not measurements.
- Parse the CAU's 8 axioms from the setup. The setup's `cau: "ex:ComplexClass with 8 axioms"` is narrative only — the scaffold doesn't exercise it.
- Verify which 2 of the 5 queries would actually exceed the step cap on real data. The scenario author picked NC3 and NC4 as illustrative.

**What the scaffold DOES do:**
- Enforces the per-query (not wholesale) shape of the fallback record.
- Enforces that `totalQueries`, `queriesCompletedByTauProlog`, `queriesFallenBackToStructural` sum correctly (3 + 2 = 5) and agree with the `perQueryFallbackFlags` array.
- Returns `dispositionValidDespiteFallback: true` (the overall disposition isn't forced to null/Plausible just because some queries fell back).
- Returns `provenanceRecordsPerQueryDetail: true` (provenance is per-query, not per-CAU).

**Production replacement path:** when Tau Prolog integration lands in Week 4-6, a new module `src/core/d16/signature-comparator.js` (or similar) will contain the real per-query runner. It will produce the same shape but with actual step counts and actual fallback decisions driven by whether a given query exceeded 10,000 Horn steps. The runner's handler thins to a one-line call-through. **The contract the scaffold enforces stays identical**; only the numbers change from canned to measured.

---

## Decision needed from SME

**[ APPROVE OR FLAG ]** Does the canned shape correctly encode D1.6-L4 (per-query granularity) + Rule LS-10 (type-level scope) + §2.5 Step 6 (per-query `reasonerFallbackUsed` field)?

- [ ] Approve — the Week 4-6 real implementation reproduces this contract against actual reasoner runs.
- [ ] Flag — specify which field is wrong and what it should be: ____________
- [ ] Defer to Checkpoint 2 Block 2 — discuss live (but my read is this is async-resolvable).

### Optional refinement

If SME wants the scaffold to randomize step counts across runs (so test runs don't appear to pass with identical magic numbers), that's a 5-minute change. My default preference is keeping the canned values exact because the scenario itself prescribes them — any deviation makes the test-contract coupling less tight. Flag if preferred otherwise.

---

## Appendix — Where this lives in the repo

| File | Lines | Purpose |
|---|---|---|
| [tests/avc/d16-runner.test.js](../../tests/avc/d16-runner.test.js) | 277–299 | Handler function |
| [tests/avc/d16-runner.test.js](../../tests/avc/d16-runner.test.js) | 452 | Trigger registry wiring |
| [avc/fandaws-sentinel-d16-avc-bundle.json](../../avc/fandaws-sentinel-d16-avc-bundle.json) | ~scenario `reasoner-cap-fallback-query-granularity` | Scenario contract |
| [specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md](Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md) | §2.5 Step 6 | Load-bearing spec rule |
| (pending) `src/core/d16/signature-comparator.js` | — | Week 4-6 real implementation home |
