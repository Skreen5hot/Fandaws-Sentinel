# CLAUDE.md - Agent Instructions for Fandaws Sentinel

## Project Overview

Fandaws (Fact and Answer Web Service) is an edge-canonical conversational knowledge-building platform. Users and agents teach the system through natural language, creating structured concept hierarchies with classifications, properties, and relationships — all stored as JSON-LD. The core pipeline runs unmodified in a browser or Node.js with no required infrastructure.

## Current Status

- **Phase:** 0–12 Complete (16 of 17 roadmap phases — 94%)
- **Test Suite:** 96 suites, 2,034 tests passing (11 skipped for unimplemented features)
- **Build:** 311.9 KB bundled (esbuild)
- **Blockers:** None
- **Completed Tracks:**
  - **Track A (Linguistics & IO):** P2, P7, P10, P10b — all complete
  - **Track B (Graph Mechanics):** P3, P4, P4b, P5, P6, P8, P9 — all complete
  - **Track C (Lifecycle):** P11, P12 — all complete. AVC model introduced at P12.
  - **Convergence Gate (P8):** Passed — regex NLParser at 100%, ADR-003 accepted
- **Cross-Cutting Specs (post-roadmap):**
  - BFO Ontology Ingestion Phase A (v1.4) — complete
  - OWL Restriction Structural Correction (v1.1) — complete
  - Consequence-Aware Reclassification — complete (3 options: keep/subtree/only)
  - Homonym Detection (v1.3) — Phase A complete
  - Workbench v0.1 — complete (GitHub Pages)
- **Remaining Roadmap:** P13 (M2M Protocol), P14 (Ecosystem Adapters)
- **Remaining Specs:** Ontology Ingestion Phase B (general ontology import, needs Workbench v0.2 UI)

## Key Files

- `ROADMAP.md` — Project roadmap and phases
- `Fandaws_v3.3_Specification.md` — Authoritative functional specification (v3.4)
- `src/index.js` — Main entry point
- `src/core/` — Core computation modules (NLParser, Classifier, KnowledgeEngine, Validator, DescriptionEngine, ExportEngine, ScopeResolver)
- `src/adapters/` — Pluggable adapter implementations (State, Integration, Orchestration)
- `src/types/` — JSON-LD data type definitions and factories
- `config/default.json` — Default configuration (Section 11.1 of spec)
- `tests/` — Test directory
- `docs/` — Stakeholder review UI (vanilla HTML/CSS/JS, deployed via GitHub Pages)
- `docs/dist/fandaws.js` — esbuild bundle of src/ (generated, gitignored)
- `.github/workflows/ci.yml` — CI/CD: test → build → deploy to GitHub Pages

## Architecture Constraints

These are non-negotiable. Every implementation decision must satisfy all six simultaneously:

1. **Edge-Canonical** — Must run in browser or via `node src/index.js`. No server required.
2. **No Required Infrastructure** — No databases, message brokers, or background workers in core.
3. **Deterministic** — Same inputs → same outputs. No hidden state.
4. **Separation of Concerns** — Computation (CORE) is pure. State/Orchestration/Integration are PLUGGABLE adapters.
5. **JSON-LD Canonical** — All inputs, outputs, and inter-component contracts are JSON-LD.
6. **Offline-First** — Offline is a valid mode, not an error state.

## Critical Rule: No Probabilistic Core

No core computation module may use LLMs, neural networks, or probabilistic inference. The NLParser uses grammar/regex. The Classifier uses enum matching. The KnowledgeEngine uses graph traversal. The Validator uses rule evaluation. All core computation is deterministic and reproducible.

## Conventions

- **Code Style:** ES Modules (`import`/`export`), no CommonJS
- **Naming:** camelCase for functions/variables, PascalCase for classes/types
- **Testing:** Jest with ES module support, describe/it pattern
- **File naming:** kebab-case for files (e.g., `knowledge-engine.js`)
- **Module pattern:** Each core module is a pure function or stateless class — JSON-LD in, JSON-LD out
- **No mutable state:** Core modules must not hold state between invocations or perform I/O directly

## Do NOT

- Add any external runtime dependency without explicit discussion
- Use LLMs or probabilistic inference inside core computation modules
- Introduce hidden state or environment-coupled behavior in core modules
- Assume the existence of databases, servers, or network connectivity in core logic
- Modify the JSON-LD context namespace (`fandaws:`) without discussion
- Skip writing tests — every module needs unit tests with JSON-LD fixtures

## Asking for Help

If you're uncertain about:
- Architecture decisions → Check `Fandaws_v3.3_Specification.md` first, then ask
- Scope boundaries → Check `ROADMAP.md` or ask
- Existing patterns → Look at similar modules in `src/core/` first
- JSON-LD shapes → Check `src/types/` and Appendix A of the spec
