# CLAUDE.md - Agent Instructions for Fandaws Sentinel

## Project Overview

Fandaws (Fact and Answer Web Service) is an edge-canonical conversational knowledge-building platform. Users and agents teach the system through natural language, creating structured concept hierarchies with classifications, properties, and relationships — all stored as JSON-LD. The core pipeline runs unmodified in a browser or Node.js with no required infrastructure.

## Current Status

- **Phase:** 0–1 Complete → Tracks A/B/C now unblocked
- **Priority:** Begin parallel tracks — Track A: P2 (NLParser), Track B: P3 (StateAdapter), Track C: P11 (Sessions)
- **Blockers:** None
- **Roadmap:** 15 phases (0–14) across 3 parallel tracks. See `ROADMAP.md` for full dependency graph and acceptance criteria
- **Track A (Linguistics & IO):** P2, P7, P10 — NLParser, DescriptionEngine, ExportEngine
- **Track B (Graph Mechanics):** P3, P4, P5, P6, P9 — StateAdapter, Validator, Workflows, Termidium
- **Track C (Lifecycle):** P11, P12 — Sessions, ScopeResolver
- **Convergence:** P2 + P5 + P7 → Phase 8 (Pipeline Integration + TagTeam Decision Gate)

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
