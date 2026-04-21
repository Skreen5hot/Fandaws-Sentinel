# Response To D1.6 Implementation Questions

**From:** Aaron
**To:** [Developer]
**Re:** D1.6 v1.1.0 implementation prerequisites
**Date:** 2026-04-18

Your read is exactly right. D1.6 v1.1.0 is an architectural replacement of D1's placement sandbox and D2's Phase 3 harness, not an incremental patch. 14-16 weeks is the realistic calendar. Your questions catch real gaps in what I handed you — let me close each one.

---

## Q1: Where does the D1.6 Spec v1.1.0 live?

The spec was produced in specification work but hasn't been committed to the repo yet. I'll commit it at:

```
/specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md
```

Following the existing convention for D1 and D2 specs. File is ~111KB, 1,103 lines. You'll have it in the repo before end of day today. Until then, treat the amendment document + BFO Signature Reference + handoff memo as your working context — the spec mostly formalizes what the amendment text describes, with cross-references to D1.6-L1 through L25, the rules catalog (EV-*, NA-*, LS-*, IT-*, PH2-*, DP-*-R*), and the explanation schema in §7.2.

If you hit a reference in those documents and need the corresponding spec section before I commit it, ping me and I'll extract the relevant section.

---

## Q2: Where does the D1.6 AVC bundle v3 live?

Same situation. Will commit at:

```
/avc/fandaws-sentinel-d16-avc-bundle.json
```

Following the phase-d1-avc-bundle.json pattern. 87,703 bytes, 68 scenarios across 8 bands. This is a net-new bundle, not a modification of phase-d1-avc-bundle.json.

**On the question you implied but didn't quite ask:** phase-d1-avc-bundle.json stays in the repo as a historical artifact. Don't delete it. It documents what the old confidence-routing model tested. Some of its scenarios have D1.6 equivalents (those are preserved per D1.6-L18); most don't translate and are historical-only.

---

## Q3: D1.6 is a replacement for shipped D1 (confirmed)

D1.6 replaces D1's placement sandbox core logic. Specifically:

**Gets replaced (substantially rewritten):**
- `src/core/ingestion/placement-sandbox.js` — the confidence-routing evaluator becomes the three-state evidence model evaluator
- Phase 1 routing categories: Confirmed/Ambiguous/Rejected → Entailed/Plausible/Inconsistent/NotApplicable
- Phase 3 JS-side violation harness → Tau Prolog NC evaluation via BFO Signature Reference
- Isolated per-class evaluation → CAU-based evaluation with NA-1.1 taxonomic descent

**Stays (reused as scaffolding):**
- Pipeline wiring (phase orchestration, session lifecycle)
- Workbench v0.2 UI panels (Phase 1 Review, Phase 2 Review — adapted but not replaced)
- Canonical-graph write methods (DP-2 builds on this foundation)
- Export engine (JSON bundle output, adapted for new disposition schema)
- Tau Prolog reasoner infrastructure (reused; new queries are NC-based)

**Per D1.6-L18:** ~100-110 of the existing 178 AVC scenarios survive as regression tests. That's roughly 40% of existing AVC retired, mostly from phase-d1-avc-bundle.json. The new D1.6 bundle (68 scenarios) is the primary contract going forward. Treat the preserved historical scenarios as regression safety, not specification.

Answer: **D1.6 replaces D1 core logic. The recent fixes are in code paths that get rewritten. Don't optimize against the existing D1 behavior — that's sunk cost.**

---

## Q4: The recent PROV-O run doesn't count for D1.6 acceptance

Your instinct is right. The fissure fix commit (intra-ontology Ambiguous routing, canonical-graph writes, Phase 3 rule naming) operates under D1's confidence-routing model. D1.6's entailment model doesn't have "Ambiguous" as a category — its sibling concept is "Plausible with structured annotations," which has different semantics.

**What survives from the recent work:**
- Canonical-graph write wiring — DP-2 builds directly on this. The foundation you just laid is exactly what DP-2's mandatory provenance fields attach to. Not wasted.
- Phase 3 infrastructure — Tau Prolog is reused; the rule-naming cleanup carries forward
- Integration insights — you learned where the pipeline has coupling issues; D1.6's implementation will benefit

**What doesn't survive:**
- Confidence-score thresholds and routing logic
- Ambiguous category as a first-class disposition
- Phase 1 decision-making under the current model

**Recommendation: no PROV-O dry run before D1.6 implementation begins.** That would be testing code that's about to be rewritten. The next PROV-O run that matters is the acceptance gate in Week 14-16 against D1.6 v1.1.0.

---

## Q5: Convergence argument document is your deliverable

You draft it. SME reviews it. This is implementation-adjacent work, not specification authorship.

**What to include (1-2 pages):**
1. **Termination argument.** Finite disposition lattice (4 states) + bounded dependency graph traversal + cycle deduplication = finite convergence. State the argument precisely.
2. **Cycle-breaking heuristic.** For rdfs:subClassOf cycles (which shouldn't exist in well-formed ontologies but appear in real-world data): precise specification of how the cascade terminates. The SME's suggestion was "visiting a CAU twice in the same mutation cascade without a change in evidence state terminates that branch." Formalize that.
3. **Monotonic shrinking argument.** Each round's re-evaluation operates on a strictly smaller dependency subgraph than the prior round (under cycle deduplication). State this formally.
4. **Edge cases.** What happens with orphan nodes, disconnected subgraphs, or mutation of root classes. Brief coverage.

**Timing:** Draft during Week 1 of implementation. Send to SME for review by end of Week 2. SME needs to sign off before Week 6 when NA-1.4 implementation begins. If SME raises issues, we have weeks 3-5 (inheritance cascade work in Band 5) to resolve before NA-1.4 is on the critical path.

**Format:** Markdown, in the repo at `/specs/d16/convergence-argument-v1.md`. Version this document — SME feedback may produce revisions before the argument locks.

---

## What Gets Handed To You Next

Today:

1. **Spec committed** at `/specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md` (by end of day)
2. **AVC bundle committed** at `/avc/fandaws-sentinel-d16-avc-bundle.json` (by end of day)
3. **BFO Signature Reference committed** at `/specs/d16/bfo-signature-reference-v1_0.md` (may already be there — check; if not, today)
4. **Amendment document committed** at `/specs/d16/d16-amendment-01.md` as permanent record

Week 1:

5. You begin Band 1 implementation (CAU Signature extraction) + convergence argument document draft in parallel
6. Placement-sandbox.js rewrite begins. phase-d1-avc-bundle.json stays in repo but is no longer the active contract.
7. SME engaged for BFO Signature Reference operational questions as they surface

Week 2-3:

8. SME Checkpoint 1 on Signature extraction against CCO Core module sample
9. Convergence argument document delivered to SME for review
10. Band 1 implementation stabilizes; Band 2-3 (iteration + three-state evidence) begins

---

## On The Scope Realization

You're right that this is roughly equivalent to the Phase D1 + D2 build combined, with new infrastructure layered on. Let me acknowledge what this means:

The 14-16 week calendar is real. The scope is genuine. I'm not going to pretend otherwise.

What I want from you:
- Test-first discipline against the 68-scenario bundle. The scenarios define "done."
- SME checkpoint compliance. Don't skip checkpoints to save calendar time. The late-surfacing flaws in D1 → D1.5 → D1.6 all came from insufficient pre-implementation review; we're not repeating that pattern.
- Flag drift early. If an implementation choice surfaces a spec issue, raise it. A spec amendment is cheap; post-facto rework is not.
- Convergence argument document is a real deliverable, not a formality. SME review of it is what keeps NA-1.4 from being an open-ended time sink.

What I'll commit to from my side:
- Spec + bundle in repo today as promised
- SME engagement on-demand for operational questions, not gated by checkpoint schedule
- Scope discipline. If mid-implementation a new feature seems attractive, it goes to D1.6.1 or D2.1, not into D1.6. Calendar doesn't slip for scope creep.
- You have architectural authority on implementation choices within the spec. Don't ask permission for technical decisions the spec doesn't cover; use your judgment and surface significant choices in SME checkpoints.

---

Ready to proceed. Confirm receipt and flag any of these answers that don't give you what you need.

Aaron
