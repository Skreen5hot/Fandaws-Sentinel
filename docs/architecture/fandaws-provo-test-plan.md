# FANDAWS Phase D2 Real-World Calibration Study — PROV-O Ingestion

**Document type:** Pre-execution test plan
**Authored:** 2026-04-18
**Status:** Awaiting approval to execute
**Author:** Aaron (semantic architect) with Claude (drafting support)
**System under test:** Fandaws-Sentinel, FANDAWS v2.1 + Phase D2 v1.0 (178/178 AVC scenarios passing)
**Test subject:** W3C PROV-O ontology with published BFO alignment

---

## 1. Purpose and Framing

### 1.1 This Is a Calibration Study, Not a Validation

This test is NOT a pass/fail validation against a ground-truth alignment. The published human PROV-O↔BFO alignment is ONE defensible answer among several that experts might produce; PROV-O's BFO-compatibility has been actively debated in the ontology literature. Treating the human alignment as ground truth would encode one author's judgment calls as correct and measure FANDAWS's deviation from them — which is not what the D2 pipeline is designed to do.

Instead, this test treats the human alignment as a **reference point for disagreement analysis**. Every disagreement between FANDAWS and the human becomes a specific question: "On what principled grounds is each party right?" The answers to those questions are the output of the study.

### 1.2 What This Test Is Designed to Reveal

Six things, in order of priority:

1. **Whether FANDAWS's invariants hold on real-world input.** Invariants I-1, I-2, I-3 plus all governing rules (PD-1 through PD-10, PS-1 through PS-9) were verified on synthetic fixtures by the AVC suite. This is the first run against an external ontology.
2. **Whether the heuristic calibration (weights, thresholds, cap) produces defensible decisions on non-synthetic input.**
3. **Whether FANDAWS surfaces alignment problems the human alignment missed.** Any quarantine or disjointness violation against a relation the human declared clean is material finding.
4. **Whether FANDAWS's disagreements with the human are principled.** For each divergence, a written analysis of which party is right and why.
5. **Whether the four disambiguation routes (auto-merge, disambiguation, novel promotion, sub-property) are exercised in defensible proportions.** All routes should fire at least once on PROV-O.
6. **Whether the namespace split and export hygiene survive a real import.** No external IRI leakage into canonical taxonomy; three namespaces coexist cleanly in exported Turtle.

### 1.3 What This Test Is NOT

- Not a validation of FANDAWS as "correct." FANDAWS is correct when it produces decisions consistent with its specification; the specification's alignment with ground truth is a separate question.
- Not a performance benchmark. Timing and memory are ancillary observations, not primary signals.
- Not a replacement for the AVC suite. AVC scenarios test invariants on fixtures designed to isolate them; this test exercises the full pipeline on uncontrolled input.
- Not sufficient on its own to validate the D2 pipeline broadly. PROV-O is ~30 classes and ~30 properties. A single real-world test establishes a data point, not a trend.

---

## 2. Test Subject

### 2.1 PROV-O Source

**Canonical source:** W3C PROV-O Recommendation, https://www.w3.org/TR/prov-o/
**Machine-readable form:** http://www.w3.org/ns/prov-o# (Turtle/RDF/XML)
**Pinned version:** The W3C Recommendation version (2013-04-30). Record SHA-256 of the fetched Turtle file in the test log.
**Classes of interest (approximate):** prov:Entity, prov:Activity, prov:Agent, prov:Collection, prov:EmptyCollection, prov:Bundle, prov:Location, prov:Influence (plus Starting/Ending/Generation/Usage/Communication/Start/End subclasses), prov:Plan, prov:Role, prov:SoftwareAgent, prov:Organization, prov:Person.
**Properties of interest (approximate):** prov:wasGeneratedBy, prov:used, prov:wasInformedBy, prov:wasAttributedTo, prov:wasAssociatedWith, prov:actedOnBehalfOf, prov:wasDerivedFrom, prov:wasRevisionOf, prov:wasQuotedFrom, prov:hadPrimarySource, prov:wasInvalidatedBy, prov:atTime, prov:startedAtTime, prov:endedAtTime, prov:hadMember.

### 2.2 Human BFO Alignment Source

**Source:** The GitHub repository Aaron identified as having recently aligned PROV-O to BFO.
**Pinned version:** Specific commit hash. Record in the test log.
**Author(s):** Recorded for the disagreement analysis (because the analysis discusses the human's reasoning, the person should be named).
**Format conversion:** If the alignment is not already in a FANDAWS-ingestible form, a conversion step is required. This conversion is part of the test setup, not the test itself. The conversion MUST preserve the human's placement decisions and confidence indicators without interpretation.

### 2.3 FANDAWS Configuration for This Run

These configuration values MUST be recorded and frozen before the test begins. Mid-run configuration changes invalidate the study.

| Parameter | Value | Source |
|---|---|---|
| FANDAWS version | v2.1 + D2 v1.0 | AVC-confirmed 2026-04-18 |
| BFO version | Active BFO 2020 | Recorded in IngestionSession |
| CCO version | Active | Recorded in IngestionSession |
| Fingerprint weight vector | Default (D-9) — Domain 0.30, Range 0.30, Subcategory 0.15, Characteristics 0.10, AllowsInheresIn 0.05, Lexical 0.10 | PD-10 compliant |
| Auto-merge threshold | 0.85 (D2 default) | PD-4 |
| Disambiguation floor | 0.60 | D-11 |
| Auto-merge margin | 0.05 | PD-4 |
| Horn inference step cap | 10,000 | PS-8 |
| Tau Prolog version | Pinned version used in AVC suite | Recorded in IngestionSession |
| Placement confidence delta | 0.15 (D1 default) | D-7 |

**No tuning during the test.** If an intermediate result suggests a parameter should change, record the finding and complete the run with the original configuration. Post-run analysis decides whether re-running with revised parameters is warranted.

---

## 3. Test Design

### 3.1 Two-Pass Structure

**Pass 1 — Blind.** Ingest PROV-O into FANDAWS without reference to the human alignment. Capture every decision FANDAWS makes at each phase. Archive the output.

**Pass 2 — Comparative.** Load the human alignment and produce the five diagnostic outputs (Section 4). Analyze disagreements.

The two-pass structure is load-bearing. Looking at the human alignment before or during Pass 1 biases the reading of FANDAWS's output. The analyst will be tempted to explain away FANDAWS disagreements as "obvious errors" that the human got right. Pass 1 forces FANDAWS's decisions to be evaluated on their own before the human reference is introduced.

**Operational implication:** Pass 1 and Pass 2 should be performed by the same analyst (Aaron), but Pass 1 must be complete and archived before any portion of the human alignment is viewed.

### 3.2 Acceptance Conditions for a Successful Test Run

These are conditions for the *test itself* to be considered valid, NOT conditions for FANDAWS to "pass." A valid test may still surface problems; an invalid test teaches nothing.

- **TA-1:** The ingestion session completed without runtime errors. (Crashes in the pipeline would invalidate the data.)
- **TA-2:** All session metadata was captured: session record, staging records, merge records, FailureTraces, compilation epochs.
- **TA-3:** The canonical graph content-hash was captured before Phase 3 started and compared after Phase 3 ended. Equality is required (PS-1).
- **TA-4:** Every Phase 1 placement has a justification string (D-3).
- **TA-5:** Every Phase 2 disambiguation record has a scoring breakdown sufficient to reconstruct the confidence (PD-5).
- **TA-6:** Every Phase 3 quarantine record has a complete FailureTrace including a genuine Prolog trace with Call/Exit/Redo entries (PS-6, D-16).
- **TA-7:** The exported Turtle parses cleanly and contains the expected three-namespace structure.
- **TA-8:** No invariant (I-1, I-2, I-3) fired as a violation during the run. If any did, STOP and file an implementation bug — the test does not proceed to Pass 2.

If any TA-* fails, the test is aborted and re-planned. The point is that an aborted test is not a finding about PROV-O or about FANDAWS's decisions; it's a finding about the test infrastructure or the implementation.

---

## 4. Five Diagnostic Categories

Each category produces a structured output that becomes a section of the final report.

### 4.1 Category 1 — Phase 1 Placement Outcomes

**For every PROV-O class, record:**
- Class IRI and label
- FANDAWS placement (BFO node)
- FANDAWS confidence score
- FANDAWS status (PlacementConfirmed / PlacementAmbiguous / PlacementRejected / PendingHumanResolution)
- Human placement (BFO node)
- Human confidence indicator (if published; "stated" / "tentative" / "explicit with caveat" counts as indicator)
- Agreement: Agrees / Disagrees / FANDAWS-ambiguous-human-confident / FANDAWS-confident-human-ambiguous / Rejected-by-one-party

**Diagnostic focus:**

The interesting cells are:

1. **FANDAWS-confident + Human-confident + Disagrees.** This is the highest-signal cell. Both parties made a strong claim; only one can be right. For each case, write a paragraph of analysis: which party's reasoning is more defensible given PROV-O's definition and BFO's commitments?

2. **FANDAWS-confident + Human-ambiguous.** FANDAWS made a call the human wasn't willing to make. Is the call defensible? If yes, FANDAWS has contributed. If no, the heuristic is overconfident.

3. **FANDAWS-ambiguous + Human-confident.** The sandbox was too conservative OR the human was overconfident. Inspect the heuristic signals FANDAWS found — if they genuinely conflict, the human may have been premature.

4. **FANDAWS-rejected + Human-placed.** Serious diagnostic. FANDAWS found no signal; the human did. This usually means the heuristic lookup table is missing an entry — but before tuning, verify the human's placement is actually defensible.

**Expected outcomes for PROV-O specifically:**

- `prov:Entity` → expected to route through disambiguation. Entity is BFO's top-level concept; PROV:Entity is more restricted. Signals should conflict. FANDAWS should NOT auto-place. If it does, heuristic is overconfident.
- `prov:Activity` → expected to confidently place under `bfo:Process`. Strong convergent signals (has_participant-style properties, occurs_at, etc.).
- `prov:Agent` → genuinely contested in the literature. Either PlacementAmbiguous or a confident placement worth analyzing.
- `prov:Plan` → property-signal driven. Plans don't participate in processes directly; likely GenericallyDependentContinuant or Role. Worth watching.
- `prov:Bundle` → the hardest case. Bundles are reified provenance records. BFO placement is genuinely unclear. If FANDAWS confidently places this, analyze why.

### 4.2 Category 2 — Phase 2 Disambiguation Distribution

**For every PROV-O object property, record:**
- Property IRI and label
- Fingerprint: {domainBFO, rangeBFO, subcategory, characteristics, allowsInheresIn}
- Top 3 canonical relation type scores with breakdown
- Margin between top two scores
- Route taken: AutoMerged / DisambiguationRecord / NovelPromotionPanel / Rejected
- For AutoMerged: target canonical, confidence, MergeRecord ID
- For DisambiguationRecord: sandboxVerdict, proposed matches list
- For NovelPromotionPanel: confirmation that top score < 0.60
- Human alignment target (if any)
- Agreement analysis

**Diagnostic focus:**

1. **PD-2 disjoint hard floor firings.** For each property where FANDAWS forced the match confidence to 0.0 due to disjointness, record which canonical relation was rejected and why. PROV-O has Activity-domained properties that should fingerprint 0.0 against MaterialEntity-domained canonicals. If this NEVER fires, something is wrong with the fixture (either PROV-O's domains, the canonical inventory, or the disjointness map).

2. **Near-tie margin blocking.** Record every case where both top candidates exceeded 0.85 but the margin was <0.05. These are the PD-4 safeguard cases. Each one should route to disambiguation, not auto-merge.

3. **Distribution shape.** Report the percentage of properties in each route. Expected rough distribution for PROV-O: 20-40% auto-merge (the well-behaved cases), 30-50% disambiguation (the PROV-vs-BFO judgment calls), 15-30% novel promotion (PROV-specific provenance relations with no canonical counterpart), <5% rejection. Departures from this shape are diagnostic.

4. **Sub-property promotion opportunities.** PROV-O has relations like `prov:wasRevisionOf` (a sub-kind of `prov:wasDerivedFrom`) and `prov:hadPrimarySource` (ditto). If the canonical inventory contains `wasDerivedFrom` or equivalent, these should route to disambiguation with a sub-property promotion option surfaced. Track whether the operator chose Merge, PromoteAsSubProperty, or PromoteAsNewRelation, and whether the structural narrowing check (PD-6) enforced parent-child subclass relations correctly.

### 4.3 Category 3 — Phase 3 Sandbox Violations

**For every quarantined axiom, record:**
- Candidate axiom IRI and type (SubclassRestriction / SubPropertyDeclaration / etc.)
- FailureTrace fields (violationRule, subjectNode, objectNode, subjectType, objectType, disjointPair where applicable)
- Prolog trace (full text, Call/Exit/Redo entries verbatim)
- Inference steps used
- Suggested repair string
- Human alignment position: does the human alignment contain this axiom? If yes, did the human flag it as problematic?
- Analyst verdict: Is the quarantine defensible? Is the suggested repair actionable?

**Diagnostic focus:**

Every quarantine on a real-world import is a specific finding. There are four possible readings of a FailureTrace:

1. **Valid violation caught, human alignment also doesn't include this axiom.** Good — pipeline is working; both FANDAWS and the human rejected the axiom.

2. **Valid violation caught, human alignment INCLUDES this axiom.** This is the high-value outcome. FANDAWS has surfaced a BFO violation the human missed. Publish-worthy if the analysis holds up.

3. **Invalid violation — FANDAWS wrong, human right.** The rule catalog or the fact base has a bug. Specifically: the rule was too aggressive, OR the fact base is missing a critical disjointness or subclass fact, OR the Phase 1 placement FANDAWS made produces this spurious violation as a downstream consequence.

4. **Both FANDAWS and human flagged, different repairs.** FANDAWS caught the problem; the disagreement is about how to fix it. This is the richest case for the disagreement analysis — it means both parties see the inconsistency but resolve it differently.

**Specific watch items for PROV-O:**

- If any axiom on `prov:Activity` involves a range that FANDAWS classifies under Continuant (e.g., `prov:Activity hasParticipant prov:Entity` if Entity is placed as MaterialEntity), and the canonical `hasParticipant`-equivalent has a Process-domain expectation, FANDAWS may flag cross-category violations. Inspect whether this is a genuine problem or a Phase 1 mis-placement cascade.
- If `prov:Bundle`-related axioms quarantine, the question becomes whether Bundle's nature as a reified provenance record is BFO-coherent at all. This has been debated in the literature.
- If transitivity declarations on properties like `prov:wasDerivedFrom` trigger Horn derivation checks that quarantine on range violations, the specific derivation chain should be captured.

### 4.4 Category 4 — Invariant Audit

**For each invariant, record:**

| Invariant | Check method | Expected | Observed |
|---|---|---|---|
| I-1 schema-only fingerprints | Inspect fingerprint-matcher.js calls; confirm no `canonicalInstance` predicates consulted during fingerprinting | No instance data touched | — |
| I-2 no recursive subclass at query time | Inspect Tau Prolog session after fact-base load; confirm no `subclass/2` clauses with recursive body | Zero recursive clauses | — |
| I-3 structural narrowing on sub-property promotion | For each sub-property promotion offered, attempt a broader-target promotion and confirm rejection | Rejection with structured correction notice | — |
| PS-1 sandbox purity | Canonical graph content-hash before vs after Phase 3 | Equal | — |
| PS-2 fresh session per run | Capture session ID for Phase 3 run, confirm new ID distinct from any prior | Distinct | — |
| PS-9 closure as ground facts | Inspect fact base for ground `subclass(X, Y)` facts representing transitive closure | Present | — |
| PD-2 disjoint floor | At least one property fingerprinted to 0.0 due to disjointness | ≥1 firing | — |
| PD-9 named-property-only merges | Inspect every MergeRecord; confirm no `owl:topObjectProperty` as `owl:equivalentProperty` target | Zero violations | — |
| PD-10 weight vector bounds | Session start log shows weight vector validated | Structural sum ≥ 0.70, lexical ≤ 0.10 | — |
| PS-8 inference cap immutable | Attempt to reconfigure cap mid-session (test probe, not actual tuning) | Rejection | — |

**TA-8 consequence:** If ANY invariant fires as a violation, the test aborts. These are structural correctness guarantees that hold under all inputs; a failure means an implementation bug, not an alignment finding.

### 4.5 Category 5 — Namespace Hygiene on Export

**After ingestion completes, export the canonical graph as Turtle and inspect:**

- [ ] Every promoted PROV-O class has a `fandaws:class/UUID/label` canonical IRI
- [ ] No `prov:` IRI appears in subject position for canonical class records
- [ ] `owl:equivalentClass` bridges every canonical class record to its `prov:` source IRI (single assertion per class)
- [ ] Every MergeRecord has `owl:equivalentProperty` bridging the `prov:` source property IRI to a `rel:` execution property IRI
- [ ] No `owl:equivalentProperty` targets `owl:topObjectProperty` or any other schema-top property (PD-9)
- [ ] `fandaws:sourceIRI`, `fandaws:sourceOntology`, `fandaws:ingestedInSession` annotations present on all promoted records
- [ ] `owl:imports` is NOT declared for PROV-O (promoted classes are `fandaws:isImported: false` per D1 decision)
- [ ] Prefix declarations in the header cover all three namespaces plus BFO, CCO, and source
- [ ] No dangling IRIs (every IRI used in a triple either appears as a subject somewhere or is a known external — BFO, CCO, OWL, etc.)

This category catches one specific class of implementation defect where the external IRI accidentally leaks into the canonical taxonomy. On a synthetic fixture this might go unnoticed because the analyst wrote the fixture; on real-world input it's the canary.

---

## 5. Execution Procedure

### 5.1 Pre-Flight Checklist

Before any ingestion command is issued:

- [ ] FANDAWS 178/178 AVC suite re-run and confirmed green (evidence that the system is in the state the AVC certifies)
- [ ] PROV-O Turtle file fetched, SHA-256 recorded
- [ ] Human alignment file fetched, commit hash recorded, NOT opened or inspected by the analyst
- [ ] Configuration parameters (Section 2.3) logged to session record
- [ ] Test environment has canonical graph snapshot before Phase 3 start hooks enabled (for PS-1 hash check)
- [ ] Tau Prolog version pinned and recorded
- [ ] Clean output directory prepared; all artifacts will be written there

### 5.2 Pass 1 — Blind Ingestion

1. Start IngestionSession with configuration from 2.3.
2. Feed PROV-O classes into the ingestion pipeline (Phase 1 class placement).
3. Review Phase 1 outputs: inspect PlacementAmbiguous items, resolve manually using ONLY PROV-O's own definitions and BFO/CCO — NOT the human alignment.
4. Record every resolution decision with justification.
5. Trigger Phase 2 (property disambiguation). Feed PROV-O object properties.
6. For each DisambiguationRecord and Novel Promotion, make the resolution decision using ONLY FANDAWS's presented evidence (fingerprint breakdown, proposed matches) plus PROV-O's definitions — NOT the human alignment.
7. Record every resolution with analyst reasoning.
8. Trigger Phase 3 (Tau Prolog consistency sandbox). Feed candidate axioms extracted from PROV-O (subclass restrictions on PROV-O classes, characteristic declarations on PROV-O properties).
9. Record every FailureTrace.
10. Export canonical graph as Turtle.
11. Record IngestionSession summary with final counts.
12. Archive all Pass 1 artifacts to a separate directory and DO NOT MODIFY.

### 5.3 Pass 2 — Comparative Analysis

1. Open the human alignment.
2. For each PROV-O class, produce the Category 1 row comparing FANDAWS's decision to the human's.
3. For each PROV-O property, produce the Category 2 row.
4. For each FailureTrace, produce the Category 3 row including the human alignment's position.
5. Run the Category 4 invariant audit.
6. Inspect the exported Turtle for Category 5 namespace hygiene.
7. Write disagreement analyses for every divergence.

### 5.4 Report Production

The report follows the structure in Section 6. Budget time for actual analysis, not just tabulation. A reasonable budget: 2-3 days for Pass 1, 3-5 days for Pass 2 and report writing. If it takes less, you're not analyzing deeply enough.

---

## 6. Report Structure (Pre-Specified)

The final document, working title "FANDAWS D2 PROV-O Calibration Study," should have these sections in order:

**§1 Executive Summary.** One page. Key findings without details. Written LAST.

**§2 Setup.** Configuration, versions, pin hashes, analyst identity, methodology notes.

**§3 Results — Category 1 Phase 1 Placement.** Tabular output plus interpretation. Each disagreement row accompanied by analysis paragraph.

**§4 Results — Category 2 Phase 2 Disambiguation.** Tabular output plus distribution analysis plus specific cases worth flagging.

**§5 Results — Category 3 Phase 3 Sandbox.** Every FailureTrace with full Prolog trace verbatim. Analyst verdict per case.

**§6 Results — Category 4 Invariant Audit.** Pass/fail matrix. Commentary on any firings.

**§7 Results — Category 5 Namespace Hygiene.** Turtle excerpt samples. Checklist outcome.

**§8 Disagreement Analysis.** The heart of the report. Each FANDAWS-vs-human disagreement treated as its own case. Structured per case as: claim, FANDAWS position, human position, independent analysis, verdict.

**§9 Calibration Findings.** What the study reveals about FANDAWS's calibration. Heuristic lookup table gaps, threshold tuning recommendations, rule catalog extensions. Each recommendation tied to specific evidence.

**§10 Publishable Findings.** If any BFO-violation in the human alignment surfaced, or any methodological insight worth external presentation, enumerated here for possible venue selection.

**§11 Limitations.** Honest list of what this study does not establish. Small ontology, single domain, single analyst, single human alignment, etc.

**§12 Next Steps.** What to test next. The PROV-O test should establish a template for subsequent calibration studies on larger or differently-flavored ontologies.

**Appendices.**
- A: Pass 1 raw artifacts (session record, all staging records, all merge records, all FailureTraces)
- B: Full exported Turtle
- C: SHA-256 hashes of all inputs
- D: Disagreement worksheet (the analyst's working notes that fed §8)

---

## 7. Disagreement Analysis Methodology

Because the quality of the study rests on §8 of the report, the methodology for analyzing disagreements deserves explicit specification.

### 7.1 Per-Disagreement Template

For each FANDAWS-vs-human disagreement, produce a structured case:

```
CASE [N]: [identifier, e.g., "PROV-O Entity placement"]

CLAIM AT ISSUE: [what is being placed/matched/evaluated]

FANDAWS POSITION:
  Decision: [placement or routing]
  Confidence: [score]
  Reasoning: [heuristic signals FANDAWS consulted, paraphrased from justification string]

HUMAN POSITION:
  Decision: [placement or routing]
  Stated reasoning: [from the alignment document if available]
  Inferred reasoning: [if not stated, analyst's best reconstruction]

INDEPENDENT ANALYSIS:
  PROV-O says: [relevant text from PROV-O definition]
  BFO says: [relevant text from BFO 2020]
  Literature says: [if any published BFO-alignment discussion applies]
  
VERDICT:
  [ ] FANDAWS is more defensible. Reasoning: [...]
  [ ] Human is more defensible. Reasoning: [...]
  [ ] Both are defensible; the disagreement reflects a genuine modeling choice, not an error. Reasoning: [...]
  [ ] Neither is fully defensible; a third position is better. Reasoning: [...]

IMPLICATIONS:
  For FANDAWS: [calibration change suggested? rule addition? no action?]
  For the human alignment: [revision suggested? no action?]
  For future testing: [what this case teaches about how to test]
```

### 7.2 Verdict Honesty Requirements

The analyst (Aaron) MUST be prepared to rule against FANDAWS in some cases. The study's credibility depends on it. If the report contains zero cases where the verdict is "Human is more defensible," either PROV-O is unusually FANDAWS-friendly OR the analyst is biased. Neither is a good outcome.

Conversely, if the report contains many cases of "Both are defensible," that is also suspicious — it suggests the analyst is avoiding hard calls. Genuine disagreement analysis should force hard calls.

A reasonable prior for PROV-O, given its contested BFO-alignment status: expect 10-20% of disagreements to be "FANDAWS more defensible," 20-40% "Human more defensible," 30-50% "Both defensible (modeling choice)," 10-20% "Third position better." Significant departures from this shape are themselves findings.

---

## 8. Risk Register

Risks that could compromise the study:

**R1: Heuristic lookup table misses PROV-specific signals.** Phase 1 placements may be systematically under-confident because the property-signal table was built for generic BFO-compatible vocabularies and doesn't know about `prov:` prefixed properties. MITIGATION: Record findings, don't tune. If the pattern is clear, post-study tuning is warranted.

**R2: Fact base loading produces large Prolog session.** PROV-O is small but its import closure (referenced BFO, time ontology, etc.) could inflate. MITIGATION: Record fact base size and session load time. If loading exceeds 5 seconds in browser, investigate but don't abort.

**R3: Horn inference cap trips on legitimate PROV-O derivations.** Some transitive properties might chain through enough canonical instances to exceed 10,000 steps. MITIGATION: Expected in ≤5% of axioms. If more than 10% trip, the cap may be too conservative for real-world ontologies; record and recommend revisiting PS-8 (but do not change mid-study).

**R4: Human alignment is incomplete or ambiguous on some classes.** Not every PROV-O entity may have a stated human placement. MITIGATION: Mark "Human: not covered" in the results table. These cases still provide FANDAWS data but can't enter disagreement analysis.

**R5: Analyst subconsciously biases Pass 1 based on prior knowledge of PROV-O.** Aaron has seen PROV-O before; strict blinding from the human alignment is achievable, but blinding from general PROV-O knowledge is not. MITIGATION: Record Pass 1 reasoning explicitly. If reasoning references "PROV-O authors probably intended X," flag as possibly biased; if it references only PROV-O's own text and BFO's own text, it's acceptable.

**R6: Tau Prolog version drift between AVC suite and this study.** MITIGATION: Pin version, recorded in Section 2.3. Re-run AVC suite against pinned version before the study to confirm continued pass.

**R7: Test produces insufficient disagreements to analyze.** If FANDAWS and the human agree on 95% of decisions, the study's main output (disagreement analysis) is thin. MITIGATION: This is itself a finding — either FANDAWS is well-calibrated or the human alignment was conservative. Report accordingly; don't manufacture disagreements.

---

## 9. Success Criteria for the Study Itself

The STUDY (not FANDAWS) is successful if:

- **S-1:** All TA-* (test acceptance) conditions from §3.2 are met.
- **S-2:** Every disagreement between FANDAWS and the human is analyzed — no row in the results table is left with "agreement: disagrees" without a corresponding case in §8.
- **S-3:** At least one calibration finding is produced (§9 of the report).
- **S-4:** The report is reviewed by at least one external reader before publication/archival. (For a first real-world test, a second pair of eyes catches the biases the analyst missed.)
- **S-5:** All artifacts archived per §6 appendices.

The study is NOT unsuccessful if FANDAWS disagrees with the human frequently. Frequent disagreement is a feature of the test design.

---

## 10. Approval Gates

Before executing, confirm:

- [ ] This test plan approved by Aaron
- [ ] D2 implementation stable (178/178 AVC passing on the pinned build)
- [ ] Spot-check transcripts for D2 complete (the 4 items identified post-D2-completion)
- [ ] Time budget allocated: 5-8 days for the full study
- [ ] Archive destination identified (where artifacts will be stored for long-term reference)
- [ ] External reviewer identified for S-4 (if applicable)

Once approved, this document becomes immutable for the duration of the test. Changes to the plan mid-test invalidate the study. If a flaw in the plan is discovered during execution, record the finding, complete the study under the original plan, and revise the plan for subsequent studies.

---

**End of Test Plan**
