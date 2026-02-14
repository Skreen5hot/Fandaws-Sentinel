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
