# Agentic Development Principles

**A guide for effective human-AI collaborative software development**

**Version:** 1.0
**Last Updated:** 2026-01-26

---

## What is Agentic Development?

Agentic development is a collaborative approach where an AI assistant (the "agent") works alongside a human developer to build software. The agent can:

- Read and understand codebases
- Write and modify code
- Run tests and builds
- Search documentation and the web
- Make architectural decisions within defined boundaries
- Track progress and manage tasks

**Key Insight:** The agent is most effective when given clear context, structured guidance, and well-defined boundaries. Think of it as onboarding a highly capable junior developer who can work very fast but needs clear direction.

---

## Core Principles

### 1. Context is Everything

The agent has no memory between sessions. Every new session starts fresh. Therefore:

**Essential Context Documents:**
- `ROADMAP.md` - Where we're going and why
- `docs/architecture/` - How things are built and why
- `CLAUDE.md` or `AGENTS.md` - Project-specific agent instructions
- Clear directory structure with README files

**Anti-pattern:** Assuming the agent "remembers" previous conversations or decisions.

**Best Practice:** Maintain living documents that capture decisions, rationale, and current state.

### 2. Roadmap-Driven Development

A well-structured roadmap is the agent's north star.

**Roadmap Structure:**
```markdown
## Phase N: [Clear Goal Statement]

**Goal:** One sentence describing the outcome
**Status:** Not Started | In Progress | Complete
**Priority:** Critical | High | Medium | Low
**Bundle Size Budget:** +50KB max (if applicable)

### N.1 Sub-task Name

**Status:** Not started
**Priority:** High
**Effort:** Low | Medium | High

[Description of what needs to be done]

**Deliverables:**
- `src/path/to/File.js` - description
- Test coverage for X

**Acceptance Criteria:**
- [ ] Specific, measurable outcome 1
- [ ] Specific, measurable outcome 2

**NOT in scope:** [Explicitly state what this phase does NOT include]
```

**Why "NOT in scope" matters:** Agents can over-engineer. Explicitly stating boundaries prevents scope creep.

### 3. Test-Driven Development (TDD)

Tests provide:
- Clear acceptance criteria the agent can verify
- Safety net for refactoring
- Documentation of expected behavior
- Confidence for both human and agent

**TDD Flow:**
```
1. Write failing test → 2. Implement code → 3. Test passes → 4. Refactor
```

**Test Organization:**
```
tests/
├── unit/                    # Fast, isolated tests
│   ├── module-name.test.js
│   └── ...
├── integration/             # Tests that cross modules
├── golden/                  # Reference data for validation
│   ├── corpus.json          # Input/expected output pairs
│   └── snapshots/           # Approved outputs
└── fixtures/                # Shared test data
```

**Golden Test Corpuses:**
Create JSON files with input → expected output pairs:
```json
{
  "tests": [
    {
      "id": "test-001",
      "description": "Basic case",
      "input": "...",
      "expected": { ... },
      "tags": ["smoke", "critical"]
    }
  ]
}
```

The agent can then validate against these without human intervention.

### 4. Clear Acceptance Criteria

Every task needs measurable completion criteria.

**Good Acceptance Criteria:**
- ✅ "Function returns object with `name` and `type` properties"
- ✅ "All 50 test cases pass"
- ✅ "Bundle size increase < 100KB"
- ✅ "Performance < 50ms for typical input"

**Bad Acceptance Criteria:**
- ❌ "Works correctly"
- ❌ "Is well-tested"
- ❌ "Performs well"

**Template:**
```markdown
### Acceptance Criteria

**Functional:**
- [ ] Given [input], returns [output]
- [ ] Handles edge case: [description]

**Quality:**
- [ ] Test coverage > 80%
- [ ] No regression in existing tests

**Performance:**
- [ ] Executes in < Xms for typical input
- [ ] Memory usage < XMB
```

### 5. Phased Delivery with Checkpoints

Break large features into phases with clear checkpoints.

**Phase Structure:**
```
Phase 5: Feature Name
├── 5.1 Foundation (Low effort, Critical priority)
├── 5.2 Core Implementation (Medium effort, High priority)
├── 5.3 Integration (Medium effort, High priority)
└── 5.4 Polish (Low effort, Medium priority)
```

**Checkpoint Pattern:**
After each sub-phase:
1. Run all tests
2. Update roadmap status
3. Review with human before proceeding

**Why:** Prevents the agent from going too far down a wrong path.

### 6. Explicit Scope Boundaries

Agents are eager to help and may over-deliver. Set explicit boundaries.

**Scope Document:**
```markdown
## In Scope
- Feature X implementation
- Unit tests for Feature X
- Integration with existing Module Y

## Out of Scope (Do Not Implement)
- Performance optimization (future phase)
- UI changes (separate ticket)
- Backwards compatibility shims
- Documentation updates (unless explicitly requested)

## Decisions Deferred
- Choice of algorithm (await human input)
- API naming conventions (await team review)
```

### 7. Documentation as Code

Maintain documentation alongside code, not as an afterthought.

**Documentation Structure:**
```
docs/
├── architecture/
│   ├── design-decisions.md   # ADRs (Architecture Decision Records)
│   ├── data-flow.md          # How data moves through system
│   └── module-overview.md    # High-level module descriptions
├── development/
│   ├── roadmap.md            # Living roadmap
│   ├── contributing.md       # How to contribute
│   └── testing-strategy.md   # How we test
├── guides/
│   └── getting-started.md    # Onboarding guide
└── api/
    └── reference.md          # API documentation
```

**Architecture Decision Records (ADRs):**
```markdown
## ADR-001: Choice of X over Y

**Status:** Accepted
**Date:** 2026-01-26
**Context:** We needed to choose between X and Y for [reason]

**Decision:** We chose X because [rationale]

**Consequences:**
- Positive: [benefit 1], [benefit 2]
- Negative: [tradeoff 1]
- Neutral: [observation]
```

---

## Recommended Directory Structure

```
project-root/
├── .github/
│   └── workflows/           # CI/CD pipelines
│
├── src/                     # Source code
│   ├── core/                # Core modules (no dependencies)
│   ├── features/            # Feature modules
│   ├── utils/               # Shared utilities
│   └── index.js             # Main entry point
│
├── tests/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   ├── golden/              # Golden test data
│   └── fixtures/            # Shared test fixtures
│
├── config/                  # Configuration files
│   ├── default.json         # Default configuration
│   └── domains/             # Domain-specific configs
│
├── docs/
│   ├── architecture/        # Architecture documentation
│   ├── development/         # Development guides
│   └── api/                 # API reference
│
├── scripts/                 # Build, deploy, utility scripts
│   ├── build.js
│   └── test-runner.js
│
├── dist/                    # Built artifacts (gitignored)
│
├── examples/                # Usage examples
│
├── collaboration/           # External collaboration artifacts
│   ├── from-partner/        # Artifacts from partners
│   └── to-partner/          # Artifacts for partners
│
├── ROADMAP.md               # Living roadmap (top-level visibility)
├── CLAUDE.md                # Agent-specific instructions
├── README.md                # Project overview
├── package.json             # Dependencies and scripts
└── .gitignore
```

**Key Principles:**
- **Flat over nested:** Avoid deep nesting (max 3-4 levels)
- **Predictable locations:** Agent should guess where files are
- **Separation of concerns:** Config, source, tests, docs are distinct
- **Collaboration folder:** Keep external artifacts separate from core code

---

## Working with the Agent

### Starting a Session

Begin each session with context:

```
"We're working on [project]. Current status: [phase/task].
The roadmap is in ROADMAP.md. Please review it and confirm
you understand what we're working on."
```

### Giving Instructions

**Good Instruction:**
```
"Implement the UserAuth module (Phase 3.2 in roadmap).
- Follow the interface defined in src/types/auth.ts
- Add tests in tests/unit/user-auth.test.js
- Acceptance criteria: all tests pass, no TypeScript errors
- Do NOT implement password reset (Phase 3.4)"
```

**Poor Instruction:**
```
"Add user authentication"
```

### Reviewing Agent Work

1. **Run tests first** - Let tests catch obvious issues
2. **Check scope** - Did the agent stay within boundaries?
3. **Review architecture** - Does it fit the existing patterns?
4. **Verify no regressions** - Run full test suite

### Course Correction

When the agent goes off track:

```
"Stop. Let's reconsider the approach.

The current implementation [specific issue].

Instead, I want:
1. [Specific change 1]
2. [Specific change 2]

Please revert the changes to [file] and try again with this approach."
```

---

## Anti-Patterns to Avoid

### 1. The "Just Make It Work" Trap
**Problem:** Vague instructions lead to over-engineered solutions.
**Solution:** Provide specific acceptance criteria and scope boundaries.

### 2. The "One Big Task" Trap
**Problem:** Giving the agent a massive task increases risk of wrong direction.
**Solution:** Break into phases with checkpoints.

### 3. The "Assumed Context" Trap
**Problem:** Assuming the agent knows project history or conventions.
**Solution:** Document everything in files the agent can read.

### 4. The "No Tests" Trap
**Problem:** Without tests, neither human nor agent knows if code works.
**Solution:** TDD - write tests first, or at minimum alongside code.

### 5. The "Perfectionism" Trap
**Problem:** Spending too long on polish before validating approach.
**Solution:** Get to "works" fast, then iterate with feedback.

### 6. The "Silent Failure" Trap
**Problem:** Agent encounters an issue but continues without flagging.
**Solution:** Instruct agent to stop and ask when blocked or uncertain.

---

## Session Workflow Template

### 1. Session Start (5 min)
```
- Review ROADMAP.md current status
- Identify today's target deliverable
- Confirm acceptance criteria
```

### 2. Implementation (bulk of session)
```
- Agent implements with TDD
- Human reviews at checkpoints
- Course correct as needed
```

### 3. Session End (10 min)
```
- Run full test suite
- Update ROADMAP.md status
- Document any decisions made
- Note any blockers for next session
```

### 4. Handoff Notes
At the end of significant sessions, create a handoff note:

```markdown
## Session Summary - [Date]

### Completed
- [x] Task 1 (Phase X.Y)
- [x] Task 2

### In Progress
- [ ] Task 3 - blocked on [reason]

### Decisions Made
- Chose X over Y because [reason]

### Next Session
- Start with Task 3 after resolving [blocker]
- Then proceed to Phase X.Z
```

---

## Quality Gates

### Before Merging Any Code

1. **Tests Pass:** `npm test` returns 0
2. **No Regressions:** Existing tests still pass
3. **Scope Check:** Changes match intended scope
4. **Documentation:** README/docs updated if needed
5. **Human Review:** At least one human has reviewed

### Before Completing a Phase

1. **All Acceptance Criteria Met:** Checklist complete
2. **Test Coverage:** Adequate coverage for new code
3. **Integration Verified:** Works with rest of system
4. **Roadmap Updated:** Status reflects completion
5. **Demo Ready:** Can demonstrate to stakeholders

---

## Communication Patterns

### Agent → Human

**When blocked:**
```
"I'm blocked on [specific issue]. Options I see:
1. [Option A] - [pros/cons]
2. [Option B] - [pros/cons]
Which approach do you prefer, or is there another option?"
```

**When uncertain:**
```
"I'm about to [action]. My understanding is [interpretation].
Is this correct, or should I adjust?"
```

**When complete:**
```
"Phase X.Y complete:
- [Deliverable 1]: [status]
- [Deliverable 2]: [status]
- Tests: X passing, 0 failing
- Next: [suggested next step]"
```

### Human → Agent

**Setting context:**
```
"Current project: [name]
Current phase: [X.Y from roadmap]
Goal for this session: [specific outcome]
Constraints: [any limitations]"
```

**Providing feedback:**
```
"Good direction on [aspect].
Change needed: [specific change].
Reason: [why this matters]."
```

---

## Tooling Recommendations

### Essential Files

| File | Purpose | Update Frequency |
|------|---------|------------------|
| `ROADMAP.md` | Project direction | Every session |
| `CLAUDE.md` | Agent instructions | As needed |
| `package.json` | Dependencies & scripts | When adding deps |
| `tests/*` | Verification | Every implementation |

### Useful Scripts

```json
{
  "scripts": {
    "test": "run all tests",
    "test:unit": "run unit tests only",
    "test:watch": "run tests on file change",
    "build": "create production build",
    "lint": "check code style",
    "typecheck": "verify types (if TypeScript)"
  }
}
```

### CI/CD Pipeline

Minimum viable pipeline:
```yaml
on: [push, pull_request]
jobs:
  test:
    steps:
      - checkout
      - install dependencies
      - run tests
      - run linter
      - build (verify it compiles)
```

---

## Summary: The 10 Commandments of Agentic Development

1. **Document everything** - The agent can only know what's written down
2. **Roadmap first** - Know where you're going before you start
3. **Test-driven** - Tests are your safety net and acceptance criteria
4. **Phase the work** - Small batches with checkpoints
5. **Explicit scope** - State what's in AND out of scope
6. **Clear acceptance** - Measurable criteria for "done"
7. **Review at checkpoints** - Don't let the agent run too far alone
8. **Update as you go** - Keep docs current, not aspirational
9. **Structured directories** - Predictable file locations
10. **Communicate clearly** - Specific instructions, specific feedback

---

## Appendix: CLAUDE.md Template

Create this file in your project root:

```markdown
# CLAUDE.md - Agent Instructions for [Project Name]

## Project Overview
[One paragraph describing what this project does]

## Current Status
- **Phase:** [Current phase from roadmap]
- **Priority:** [What to focus on]
- **Blockers:** [Any known blockers]

## Key Files
- `ROADMAP.md` - Project roadmap and phases
- `src/index.js` - Main entry point
- `tests/` - Test directory

## Conventions
- **Code Style:** [e.g., ESLint config, formatting rules]
- **Naming:** [e.g., camelCase for functions, PascalCase for classes]
- **Testing:** [e.g., Jest, describe/it pattern]
- **Commits:** [e.g., conventional commits]

## Do NOT
- [ ] Modify files in `vendor/` directory
- [ ] Add new dependencies without asking
- [ ] Change public API signatures without discussion

## Asking for Help
If you're uncertain about:
- Architecture decisions → Ask before implementing
- Scope boundaries → Check ROADMAP.md or ask
- Existing patterns → Look at similar files first
```

---

*This guide is based on collaborative development experience with TagTeam.js and similar projects. Adjust to fit your team's needs.*
