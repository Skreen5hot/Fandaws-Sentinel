# Architecture Decision Records

Decisions made during implementation, with rationale.

## ADR-001: ES Modules over CommonJS

**Status:** Accepted
**Date:** 2026-02-14
**Context:** The project needs a module system that works in both browser and Node.js (edge-canonical constraint).

**Decision:** Use ES Modules (`import`/`export`) exclusively. No CommonJS `require()`.

**Consequences:**
- Positive: Native browser support, tree-shaking, future-proof
- Positive: Aligns with edge-canonical principle (browser runs unmodified code)
- Negative: Requires `"type": "module"` in package.json and `--experimental-vm-modules` for Jest

## ADR-002: esbuild for Browser Bundling

**Status:** Accepted
**Date:** 2026-02-14
**Context:** The stakeholder review UI needs a browser-consumable bundle of `src/index.js`. Options: esbuild, Rollup, Webpack, or manual concatenation.

**Decision:** Use esbuild to bundle `src/index.js` → `docs/dist/fandaws.js` (ESM, es2020 target, no minification).

**Consequences:**
- Positive: Sub-second builds (~50ms), zero config, native ESM output
- Positive: No minification keeps bundle readable for stakeholder review
- Positive: Sourcemaps included for debugging
- Negative: Added as devDependency (but zero runtime deps still holds)
- Bundle size: ~10KB (well within budget)

## ADR-003: TagTeam Decision Gate — NLParser Evaluation

**Status:** Accepted
**Date:** 2026-02-15
**Context:** Phase 8 (Pipeline Integration) requires evaluating whether the built-in regex/grammar NLParser is sufficient for the full conversation pipeline or whether a TagTeam.js NLParser adapter should be introduced. The evaluation criteria (ROADMAP Phase 8) specify: run the golden corpus through the regex NLParser, measure success rate, and proceed with TagTeam.js only if success rate falls below 95%.

**Evaluation Results:**
- NLParser golden corpus: 52/52 entries pass (100% success rate)
- Classification pipeline golden corpus: 19/19 entries pass (100%)
- Property pipeline golden corpus: 16/16 entries pass (100%)
- Total parse-dependent test entries: 87, all passing
- False-positive rate: 0%
- Ambiguity handling: N/A (regex parser is deterministic)
- Performance: < 1ms per utterance

**Decision:** Continue with the built-in regex NLParser. No TagTeam.js adapter is needed at this time.

**Rationale:**
1. 100% success rate on all golden corpora exceeds the 95% threshold
2. The regex parser is fully deterministic — identical input always produces identical output
3. All three verb types (classification, property, custom relationship) are correctly parsed
4. Performance is well within budget (< 1ms per utterance vs 40ms pipeline target)
5. Zero external dependencies aligns with the edge-canonical constraint
6. Known limitations are documented and scoped for future phases:
   - Multi-word subjects in custom relationships use single-word heuristic (Phase 9)
   - No plural normalization (Phase 9.1)

**Revisit Conditions:**
- Phase 9 custom relationship corpus reveals parsing failures > 5%
- User testing surfaces common utterance patterns the regex parser cannot handle
- Cross-lingual support requirements extend beyond locale-specific patterns

## ADR-004: Navigation Restructure Plan

**Status:** Proposed
**Date:** 2026-02-16
**Context:** The stakeholder review site now has 7 horizontal tabs (Roadmap, Identity Playground, Type Explorer, Property Demo, Description Demo, Conversation, Test Results). Phase 9 (Relationships) will likely need a demo tab, pushing to 8. The horizontal tab bar is at capacity.

**Decision:** Before Phase 9 adds a new tab, consolidate per-phase demo tabs into a single "Demos" tab with an internal sub-navigation (dropdown or vertical sidebar). Keep Roadmap, Conversation (primary product demo), and Test Results as top-level tabs.

**Proposed structure:**
```
[Conversation] [Demos ▾] [Roadmap] [Test Results]
                  └─ Identity Playground
                  └─ Type Explorer
                  └─ Classification (was implicit in playground)
                  └─ Property Demo
                  └─ Description Demo
                  └─ Relationship Demo (Phase 9)
```

**Rationale:**
1. Conversation tab is the primary product demo and should remain prominent
2. Component-level demos (identity, types, property, description) are developer/review tools, not end-user features
3. Sub-navigation scales to Phase 12+ without horizontal overflow
4. Roadmap and Test Results are cross-cutting concerns, not phase-specific demos

**Implementation:** Phase 9 pre-work, before the Relationship Demo tab is added.

## ADR-005: Adapter Performance Tracking

**Status:** Noted
**Date:** 2026-02-16
**Context:** The InMemoryStateAdapter test suite duration increased from ~2,925ms (Phase 7) to ~3,337ms (Phase 8), a 14% regression. The suite count (93 tests) did not change, suggesting heavier graph state in test fixtures due to more concepts, properties, and index maintenance per snapshot.

**Observation:** Not blocking. The regression is attributable to richer graph state in shared test infrastructure rather than algorithmic degradation. However, by Phase 12 (Federation) with cross-graph queries and larger fixture graphs, this trend could compound.

**Action items:**
- Monitor adapter suite duration each phase (target: < 5s)
- If duration exceeds 5s, profile `snapshot-and-swap` and index rebuild paths
- Consider fixture partitioning (small/medium/large graph fixtures) if growth continues
