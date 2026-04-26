# FANDAWS D2 PROV-O Calibration Study

**Status:** [DRAFT / IN ANALYSIS / FINAL]
**Study period:** [YYYY-MM-DD] through [YYYY-MM-DD]
**Analyst:** Aaron (semantic architect)
**External reviewer:** [name if available, else "single-reviewer — see §11 Limitations"]
**System under test:** Fandaws-Sentinel, FANDAWS v2.1 + Phase D2 v1.0
**AVC certification:** 178/178 scenarios passing at test start, re-confirmed pre-flight
**Test subject:** W3C PROV-O with published BFO alignment from [alignment source]
**Report version:** [v0.1 draft / v1.0 final]

---

## §1 Executive Summary

*[WRITE LAST. One page maximum. Key findings without details. Structure:*
*- What was tested (one sentence)*
*- How the test was structured (two sentences — two-pass blind then comparative)*
*- Three to five headline findings (one line each)*
*- Principal recommendation*
*- Publishable material flag (yes/no)*
*]*

**Key findings:**
1. [Finding — e.g., "FANDAWS and human alignment agree on N of M class placements (P%); disagreements cluster around prov:Entity and prov:Bundle"]
2. [Finding — e.g., "PD-2 disjoint floor fired K times, consistent with PROV-O's cross-category property domains"]
3. [Finding — e.g., "Q quarantined axioms; R of those represent genuine BFO violations in the human alignment"]
4. [Finding]
5. [Finding]

**Principal recommendation:** [one sentence — e.g., "Extend the property-signal heuristic lookup table with PROV-O-specific patterns; see §9 for specifics"]

**Publishable material:** [yes — see §10 / no — this is internal calibration]

---

## §2 Setup

### §2.1 Configuration

| Parameter | Value | Source |
|---|---|---|
| FANDAWS version | v2.1 + D2 v1.0 | [git commit / build ID] |
| BFO version | BFO 2020 | [import IRI] |
| CCO version | [version] | [import IRI] |
| Tau Prolog version | [pinned version] | [package version] |
| Fingerprint weight vector | Domain 0.30, Range 0.30, Subcategory 0.15, Characteristics 0.10, AllowsInheresIn 0.05, Lexical 0.10 | Default (D-9) |
| Auto-merge threshold | 0.85 | D2 default |
| Auto-merge margin | 0.05 | PD-4 |
| Disambiguation floor | 0.60 | D-11 |
| Horn inference step cap | 10,000 | PS-8 |
| Placement confidence delta | 0.15 | D-7 |

### §2.2 Input Pins

| Input | URL / path | Pin |
|---|---|---|
| PROV-O Turtle | [URL] | SHA-256: [hash] |
| Human alignment | [GitHub URL] | Commit: [hash], author(s): [names] |
| PROV-O import closure | [list: included / excluded] | [hashes if included] |
| BFO reference | [URL] | [IRI] |

### §2.3 Methodology Notes

- **Two-pass structure:** Pass 1 blind (2026-MM-DD to 2026-MM-DD), Pass 2 comparative (2026-MM-DD to 2026-MM-DD). Pass 1 artifacts archived to `[path]` before Pass 2 began; not modified after archival.
- **Human alignment NOT consulted during Pass 1.** Confirmed by: [mechanism — e.g., "alignment file kept in separate directory, opened only after Pass 1 artifact directory was marked read-only"].
- **No mid-run tuning.** Configuration from §2.1 frozen throughout. [If any tuning was discussed and deferred, note here.]
- **Test acceptance (TA-*) confirmed:** All conditions from test plan §3.2 satisfied. See §6 for the invariant audit.
- **Environment:** Browser / Node.js / both [specify]. Test executed in [environment identifier].

### §2.4 What Changed During the Study

*[Any deviations from the test plan, discovered mid-study and documented for transparency. If nothing changed, say "No deviations from the test plan." If something changed, each deviation is numbered and explained. A clean study has no deviations.]*

---

## §3 Results — Category 1: Phase 1 Placement Outcomes

### §3.1 Placement Results Table

*[One row per PROV-O class. Complete the table from Pass 1 (FANDAWS columns) + Pass 2 (Human + Agreement columns).]*

| PROV-O Class | FANDAWS Placement | FANDAWS Confidence | FANDAWS Status | Human Placement | Human Confidence | Agreement | Case # (if disagreement) |
|---|---|---|---|---|---|---|---|
| prov:Entity | [BFO node] | [0.00] | [status] | [BFO node] | [stated / tentative / explicit-with-caveat / not-covered] | [Agrees / Disagrees / F-amb-H-conf / F-conf-H-amb / Rejected-by-one] | [C1 / -] |
| prov:Activity | | | | | | | |
| prov:Agent | | | | | | | |
| prov:Collection | | | | | | | |
| prov:EmptyCollection | | | | | | | |
| prov:Bundle | | | | | | | |
| prov:Location | | | | | | | |
| prov:Influence | | | | | | | |
| prov:InstantaneousEvent | | | | | | | |
| prov:Generation | | | | | | | |
| prov:Usage | | | | | | | |
| prov:Communication | | | | | | | |
| prov:Start | | | | | | | |
| prov:End | | | | | | | |
| prov:Invalidation | | | | | | | |
| prov:Derivation | | | | | | | |
| prov:Revision | | | | | | | |
| prov:Quotation | | | | | | | |
| prov:PrimarySource | | | | | | | |
| prov:Attribution | | | | | | | |
| prov:Association | | | | | | | |
| prov:Delegation | | | | | | | |
| prov:Plan | | | | | | | |
| prov:Role | | | | | | | |
| prov:Person | | | | | | | |
| prov:Organization | | | | | | | |
| prov:SoftwareAgent | | | | | | | |
| [additional classes encountered during ingestion] | | | | | | | |

### §3.2 Placement Outcome Distribution

| Disposition | Count | Percentage |
|---|---|---|
| PlacementConfirmed (≥ 0.9) | | |
| PlacementConfirmed (0.7 – 0.9) | | |
| PlacementAmbiguous → PendingHumanResolution | | |
| PlacementRejected | | |
| **Total** | | 100% |

### §3.3 Agreement Distribution

| Cell | Count | Percentage | Notes |
|---|---|---|---|
| Both confident + agree | | | Pipeline working as designed |
| Both confident + disagree | | | Highest-signal cases; see §8 |
| FANDAWS confident + Human ambiguous | | | FANDAWS made calls human avoided |
| FANDAWS ambiguous + Human confident | | | Conservative sandbox OR overconfident human |
| FANDAWS rejected + Human placed | | | Missing heuristic signal (investigate) |
| Human not covered | | | Cannot enter disagreement analysis |

### §3.4 Notable Cases in Category 1

*[Narrative section. For each case worth calling out beyond the table:]*

**Case [N]: [identifier, e.g., "prov:Entity placement"]**

*[Brief narrative — what FANDAWS did, what the human did, why this is interesting. Full analysis in §8 if this is a disagreement case.]*

---

## §4 Results — Category 2: Phase 2 Disambiguation Distribution

### §4.1 Property Disambiguation Results Table

*[One row per PROV-O object property.]*

| PROV-O Property | Domain BFO | Range BFO | Subcategory | Characteristics | Top Score | 2nd Score | Margin | Route | Target (if merged) | Human Target | Case # (if disagreement) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| prov:wasGeneratedBy | [bfo node] | | | | | | | [AutoMerged / DisambiguationRecord / NovelPromotion / Rejected] | | | [C# / -] |
| prov:used | | | | | | | | | | | |
| prov:wasInformedBy | | | | | | | | | | | |
| prov:wasAttributedTo | | | | | | | | | | | |
| prov:wasAssociatedWith | | | | | | | | | | | |
| prov:actedOnBehalfOf | | | | | | | | | | | |
| prov:wasDerivedFrom | | | | | | | | | | | |
| prov:wasRevisionOf | | | | | | | | | | | |
| prov:wasQuotedFrom | | | | | | | | | | | |
| prov:hadPrimarySource | | | | | | | | | | | |
| prov:wasInvalidatedBy | | | | | | | | | | | |
| prov:startedAtTime | | | | | | | | | | | |
| prov:endedAtTime | | | | | | | | | | | |
| prov:atTime | | | | | | | | | | | |
| prov:hadMember | | | | | | | | | | | |
| prov:qualifiedAttribution | | | | | | | | | | | |
| prov:qualifiedAssociation | | | | | | | | | | | |
| prov:qualifiedUsage | | | | | | | | | | | |
| prov:qualifiedGeneration | | | | | | | | | | | |
| prov:qualifiedDerivation | | | | | | | | | | | |
| prov:specializationOf | | | | | | | | | | | |
| prov:alternateOf | | | | | | | | | | | |
| prov:hadRole | | | | | | | | | | | |
| prov:hadActivity | | | | | | | | | | | |
| prov:hadPlan | | | | | | | | | | | |
| [additional properties encountered] | | | | | | | | | | | |

### §4.2 Route Distribution

| Route | Count | Percentage |
|---|---|---|
| AutoMerged | | |
| DisambiguationRecord (window [0.60, 0.85) or near-tie) | | |
| NovelPromotionPanel (< 0.60) | | |
| Rejected | | |
| **Total** | | 100% |

*Expected distribution from test plan: ~20-40% auto-merge, ~30-50% disambiguation, ~15-30% novel promotion, <5% rejection. Observed shape vs expected: [commentary].*

### §4.3 Sub-Disposition Outcomes (Disambiguation Panel Resolutions)

*[For every DisambiguationRecord the analyst resolved during Pass 1, record how it was resolved.]*

| Candidate | Resolution | Target (if merged/sub-property) | Justification |
|---|---|---|---|
| [prov:...] | [Merge / Reject / PromoteAsSubProperty / PromoteAsNewRelation] | | |

### §4.4 Novel Promotion Resolutions

*[For every NovelPromotionPanel item, record how it was resolved.]*

| Candidate | Resolution | Justification |
|---|---|---|
| [prov:...] | [PromoteAsNewRelation / Reject / manual Merge override] | |

### §4.5 PD-2 Disjoint Floor Firings

*[Every case where FANDAWS forced a match confidence to 0.0 due to disjointness.]*

| Candidate | Canonical Target | Disjoint Pair | Lexical Similarity (for reference) |
|---|---|---|---|
| [prov:...] | [fandaws:class/relation/...] | [bfo:X, bfo:Y] | [decimal] |

*Count: [N] firings.* [Commentary: if zero, investigate fixture. If many, confirms PROV-O's cross-category domain behavior.]

### §4.6 Notable Cases in Category 2

*[Narrative section for properties worth calling out beyond the table.]*

---

## §5 Results — Category 3: Phase 3 Sandbox Violations

### §5.1 Quarantine Summary

| Metric | Value |
|---|---|
| Total candidate axioms submitted to Phase 3 | |
| NoViolations (compilable) | |
| Quarantined (any violation) | |
| HornDerivationUnbounded | |
| AxiomTypeUnrecognized | |

### §5.2 FailureTrace Detail Per Quarantined Axiom

*[One subsection per quarantined axiom. Full Prolog trace verbatim.]*

#### §5.2.1 [Axiom IRI or short identifier]

**Axiom:** [subclassRestriction / subPropertyDeclaration / disjointnessDeclaration / domainRangeDeclaration / characteristicDeclaration]

**Operands:** [subject, predicate, target or equivalent]

**Violation rule:** [TypeDisjointnessViolation / RangeMismatchViolation / DomainMismatchViolation / CycleViolation / DisjointnessContradictionViolation / HornDerivationUnbounded / AxiomTypeUnrecognized]

**Failure trace fields:**

| Field | Value |
|---|---|
| violationRule | |
| relation | |
| subjectNode | |
| objectNode | |
| subjectType | |
| objectType | |
| disjointPair (if applicable) | |
| inferenceStepsUsed | |
| ruleSetVersion | |
| producedAt | |

**Prolog derivation trace (verbatim):**

```prolog
[full engine output with Call/Exit/Redo entries]
```

**Suggested repair (from FailureTrace):** [repair string]

**Human alignment position:**
- Does the human alignment include this axiom? [yes / no / implicit]
- If yes, does the human flag it as problematic? [yes / no / no comment]

**Analyst verdict:**
- [ ] Valid violation — FANDAWS right, human alignment also does not include this axiom. No action.
- [ ] Valid violation — FANDAWS right, human alignment INCLUDES this axiom. **Publishable finding.** See §10.
- [ ] Invalid violation — FANDAWS wrong due to [Phase 1 mis-placement cascade / missing fact base entry / rule catalog bug]. See §9 for recommendation.
- [ ] Both right, different repairs. See §8 Case [N] for analysis.

**Analyst reasoning:** [paragraph]

#### §5.2.2 [next axiom...]

*[Continue per axiom]*

### §5.3 Quarantine Category Summary

*[Cross-tabulation of verdict × violation rule, showing where FANDAWS's quarantines land across the four-way verdict dimension.]*

| Verdict | TypeDisjointness | RangeMismatch | DomainMismatch | Cycle | DisjointnessContradiction | HornUnbounded | AxiomTypeUnrecognized |
|---|---|---|---|---|---|---|---|
| Valid — both agree | | | | | | | |
| Valid — FANDAWS surfaced alignment flaw | | | | | | | |
| Invalid — FANDAWS wrong | | | | | | | |
| Both right, different repair | | | | | | | |

---

## §6 Results — Category 4: Invariant Audit

### §6.1 Invariant Check Matrix

| Invariant | Rule | Check Method | Expected | Observed | Pass/Fail |
|---|---|---|---|---|---|
| I-1 schema-only fingerprints | PD-1 | Inspect fingerprint builder calls; confirm no `canonicalInstance` predicates consulted during fingerprinting | No instance data touched | | |
| I-2 no recursive subclass at query time | PS-4a, PS-9 | Inspect Tau Prolog session after fact-base load; confirm no recursive `subclass/2` clauses | Zero recursive clauses | | |
| I-3 structural narrowing on sub-property promotion | PD-6 | Attempt a broader-target promotion; confirm rejection | Rejection with structured correction notice | | |
| PS-1 sandbox purity | PS-1 | Canonical graph SHA-256 hash before vs after Phase 3 | Equal | Before: [hash] / After: [hash] | |
| PS-2 fresh session per run | PS-2 | Capture session ID for Phase 3 run; confirm distinct from prior | Distinct | | |
| PS-8 inference cap immutable mid-session | PS-8 | Attempt to reconfigure cap mid-session (probe) | Rejection | | |
| PS-9 closure as ground facts | PS-9 | Inspect fact base for ground `subclass(X, Y)` facts representing closure | Present, no recursive clauses | | |
| PD-2 disjoint floor | PD-2 | At least one property fingerprinted to 0.0 due to disjointness | ≥1 firing | [N firings] | |
| PD-9 named-property-only merges | PD-9 | Inspect every MergeRecord; confirm no `owl:topObjectProperty` as target | Zero violations | | |
| PD-10 weight vector bounds | PD-10 | Session start log shows weight vector validated | Structural sum ≥ 0.70, lexical ≤ 0.10 | Structural: [sum] / Lexical: [weight] | |

### §6.2 TA-8 Status

*[TA-8 from test plan: if ANY invariant fires as a violation, the test aborts. If any row above shows Fail, document the bug and note that the report's findings may be compromised downstream of the failing invariant.]*

- [ ] All invariants held. Study valid under TA-8.
- [ ] Invariant [X] fired as violation. **TA-8 triggered. Study findings downstream of this invariant are compromised.** Bug report filed at [location]. Report retained for investigation record.

### §6.3 Commentary

*[If everything passed, a short paragraph confirming the architecture held under real-world input. If anything failed, extended discussion of what it means.]*

---

## §7 Results — Category 5: Namespace Hygiene

### §7.1 Export Inspection Checklist

- [ ] Every promoted PROV-O class has a `fandaws:class/UUID/label` canonical IRI
- [ ] No `prov:` IRI appears in subject position for canonical class records
- [ ] `owl:equivalentClass` bridges every canonical class record to its `prov:` source IRI
- [ ] Every MergeRecord has `owl:equivalentProperty` bridging the source property IRI to a `rel:` execution property IRI
- [ ] No `owl:equivalentProperty` targets `owl:topObjectProperty` or any other schema-top property (PD-9)
- [ ] `fandaws:sourceIRI`, `fandaws:sourceOntology`, `fandaws:ingestedInSession` annotations present on all promoted records
- [ ] `owl:imports` NOT declared for PROV-O (promoted classes are `fandaws:isImported: false`)
- [ ] Prefix declarations cover all three namespaces (`fandaws:`, `rel:`, `prov:`) plus BFO, CCO, OWL
- [ ] No dangling IRIs

### §7.2 Turtle Excerpts

**Example promoted class record:**

```turtle
[paste exemplar turtle showing a promoted PROV-O class with fandaws: IRI, 
 owl:equivalentClass bridge to prov: IRI, and fandaws:* annotations]
```

**Example MergeRecord with named-property bridge:**

```turtle
[paste exemplar MergeRecord showing owl:equivalentProperty connecting 
 prov: IRI to rel: IRI]
```

**Three-namespace coexistence:**

```turtle
[paste a triple or two showing all three namespaces in play]
```

### §7.3 Anomalies

*[Any export oddities noted. If none, say "No anomalies observed in Turtle export."]*

---

## §8 Disagreement Analysis

### §8.1 Preamble

This section is the heart of the report. Per the test plan §7.1, each FANDAWS-vs-human disagreement is treated as an independent case with structured analysis. Cases are numbered C1, C2, C3, ... and cross-referenced from §3 and §4 results tables.

**Verdict distribution (filled when §8 complete):**

| Verdict | Count | Percentage |
|---|---|---|
| FANDAWS more defensible | | |
| Human more defensible | | |
| Both defensible (modeling choice) | | |
| Third position better | | |
| **Total** | | 100% |

*Expected distribution per test plan §7.2: ~10-20% FANDAWS, ~20-40% Human, ~30-50% Both, ~10-20% Third. Observed shape: [commentary].*

### §8.2 Cases

---

#### Case C1: [case identifier, e.g., "prov:Entity placement"]

**Claim at issue:** [one sentence describing what is being placed, matched, or evaluated]

**FANDAWS position:**
- Decision: [placement / routing / merge target]
- Confidence: [score or status]
- Reasoning: [paraphrased from justification string — what heuristic signals FANDAWS consulted]

**Human position:**
- Decision: [placement / routing / merge target]
- Stated reasoning: [quote or paraphrase from the alignment source if stated]
- Inferred reasoning: [analyst's best reconstruction if reasoning not stated]

**Independent analysis:**
- **PROV-O says:** [relevant text from PROV-O definition]
- **BFO says:** [relevant text from BFO 2020]
- **Literature says:** [if any published BFO-alignment discussion applies — Smith, Ceusters, Arp et al., etc.]

**Verdict:**
- [ ] FANDAWS more defensible. Reasoning: [...]
- [ ] Human more defensible. Reasoning: [...]
- [ ] Both defensible; modeling choice, not error. Reasoning: [...]
- [ ] Neither fully defensible; third position better. Reasoning: [...]

**Implications:**
- *For FANDAWS:* [calibration change suggested? rule addition? no action?]
- *For the human alignment:* [revision suggested? no action?]
- *For future testing:* [what this case teaches about how to test]

---

#### Case C2: [next case]

*[Continue per disagreement, following the same template]*

---

*[Repeat case template for every row in §3.1 or §4.1 flagged "Disagrees" or in §5.2 with non-"both agree" verdict.]*

---

## §9 Calibration Findings

### §9.1 Overview

*[Narrative paragraph summarizing what the study reveals about FANDAWS's calibration. Group findings into three buckets: heuristic table gaps, threshold tuning, rule catalog extensions.]*

### §9.2 Heuristic Lookup Table Gaps

*[Each gap tied to specific case(s) where it appeared. If the study produced no heuristic table findings, say so explicitly.]*

| Gap | Evidence | Recommendation |
|---|---|---|
| [e.g., "prov:* properties carry provenance signal not in current table"] | Cases C3, C7, C11 | [e.g., "Add entries for prov:wasGeneratedBy → Process domain, prov:used → Process range, etc."] |
| | | |

### §9.3 Threshold Tuning Considerations

*[Each recommendation tied to specific evidence.]*

| Parameter | Current | Observation | Recommendation |
|---|---|---|---|
| Auto-merge threshold | 0.85 | [e.g., "N auto-merges, all analyst-validated as correct"] | [Keep / Revise to X / Defer decision pending more studies] |
| Auto-merge margin | 0.05 | | |
| Disambiguation floor | 0.60 | | |
| Lexical weight | 0.10 | | |
| Horn step cap | 10,000 | | |

### §9.4 Rule Catalog Extensions

*[If any cases revealed violations the current PS-4a-f catalog doesn't detect, document here. Most calibration studies will not produce this; if none, say so.]*

| Proposed rule | Cases supporting | Prolog clause draft |
|---|---|---|
| | | |

### §9.5 Placement Sandbox Heuristic Priorities

*[If the study reveals that placement heuristics are correctly ordered or incorrectly ordered, comment. D1's Decision D-3 orders heuristics: explicit superclass > property signal > label signal > disjointness consistency. If this ordering produced surprises on PROV-O, note here.]*

---

## §10 Publishable Findings

### §10.1 Assessment

Is any finding from this study worth external publication? Candidate outcomes:

- **FANDAWS surfaced a BFO violation the human alignment missed.** If yes, §10.2 develops the case for submission to ICBO, FOIS, or JOWO.
- **FANDAWS produced a better aligned version of a contested PROV-O class.** If yes, §10.3 develops.
- **Methodological contribution: the calibration-study methodology itself is novel.** If yes, §10.4 develops.
- **Negative result: FANDAWS and the human converge on all decisions, demonstrating the pipeline's alignment.** Publishable as confidence-building result.

*[For this study: check applicable boxes and develop only those sections.]*

### §10.2 Specific BFO Violation Findings

*[One section per publishable finding. Structure: the violation, the analysis, the proposed alignment correction, the implication for PROV-O BFO-compatibility literature.]*

### §10.3 [other publishable finding sections as applicable]

### §10.4 Recommended Venues

*[If any publishable finding emerged, which venues are appropriate:]*
- ICBO (International Conference on Biomedical Ontology) — appropriate for BFO-alignment findings
- FOIS (Formal Ontology in Information Systems) — appropriate for methodological contributions
- JOWO (Joint Ontology Workshops) — broader ontology engineering audience
- OWL community venues — if the findings concern OWL reasoning or compilation
- Workshop paper first, then full paper — standard progression

### §10.5 Decision

*[Bottom-line: does the project pursue publication based on this study? If yes, who drafts, on what timeline? If no, archive the findings as internal calibration.]*

---

## §11 Limitations

*[Honest list. The study's credibility depends on this section being thorough.]*

- **Single ontology.** PROV-O is small (~30 classes, ~30 properties) and its BFO-compatibility characteristics may not generalize. Broader validation requires larger ontologies (CCO, GO subsets, OBI) and ontologies from different domains (engineering, legal, not just biomedical).
- **Single human alignment reference.** PROV-O↔BFO alignment is a contested problem with multiple published approaches. This study compares against one of them. Agreement or disagreement with one reference does not establish agreement or disagreement with the consensus of BFO-literate ontologists.
- **Single analyst.** Aaron performed both Pass 1 and Pass 2. Cognitive blinding from the human alignment was achieved by archival discipline; blinding from general PROV-O prior knowledge was not achievable. Single-analyst studies are a known weakness.
- [If no external reviewer: **No external review of disagreement analysis.** The §8 verdicts represent one analyst's informed judgment. External BFO-literate review is recommended before any publication derived from this study.]
- **No statistical analysis of confidence calibration.** Each case analyzed qualitatively; no attempt at quantitative confidence-interval work. Future calibration studies might build this out.
- **Tau Prolog pinned version.** Findings are specific to the pinned engine version. Engine upgrades require re-validation (per `fandaws:tauPrologVersion` discipline in D2 spec).
- **No performance benchmarking.** Study focused on correctness, not throughput. Large-ontology performance characteristics (CCO-scale, GO-scale) unstudied.
- [Any other limitations discovered during execution]

---

## §12 Next Steps

### §12.1 For FANDAWS

*[Based on §9 findings. Concrete action items:]*

1. [e.g., "Extend property-signal heuristic lookup table with PROV-O-specific entries identified in §9.2"]
2. [e.g., "Defer threshold re-tuning until at least two more calibration studies completed"]
3. [e.g., "File bug report for [invariant / rule catalog issue] identified in Case C#"]

### §12.2 For the Calibration-Study Series

*[PROV-O was the first in a planned series per test plan §10 R-7. Next subjects:]*

1. **Subject 2 (suggested):** [e.g., "A CCO module or subset — ideally not one already aligned by FANDAWS team members, to avoid tautology"]
2. **Subject 3 (suggested):** [e.g., "A non-biomedical ontology — engineering, legal, or social science — to test domain generalization"]
3. **Longitudinal study consideration:** If PROV-O evolves (which it does as W3C updates), re-run this study on the new version to test FANDAWS's stability across ontology revisions.

### §12.3 For the Report Itself

- [ ] External review (if not yet done)
- [ ] Archival to [destination]
- [ ] Filing of any bug reports from §6.2 or §9
- [ ] Publication decision from §10.5 executed

---

## Appendices

### Appendix A: Pass 1 Raw Artifacts

*[List of archived artifacts from Pass 1, with paths. These should be preserved unmodified as primary evidence.]*

- A.1: IngestionSession record — `[path]`
- A.2: All CandidateClass staging records — `[path]`
- A.3: All CandidateRelation staging records — `[path]`
- A.4: All MergeRecords — `[path]`
- A.5: All DisambiguationRecords (resolved and unresolved) — `[path]`
- A.6: All Novel Promotion records — `[path]`
- A.7: All QuarantineRecords and FailureTraces — `[path]`
- A.8: Pass 1 analyst reasoning log (disambiguation and novel-promotion resolution justifications) — `[path]`
- A.9: Phase 1 analyst reasoning log (PlacementAmbiguous resolution justifications) — `[path]`

### Appendix B: Exported Turtle

*[Either inline if reasonable length, or path reference.]*

- B.1: Canonical graph export (post-D2) — `[path]`
- B.2: Diff against pre-D2 canonical state — `[path]`

### Appendix C: Input Hashes and Provenance

| Input | Hash (SHA-256) | Source | Date fetched |
|---|---|---|---|
| PROV-O Turtle | | | |
| Human alignment | | | |
| BFO import | | | |
| CCO import | | | |

### Appendix D: Disagreement Worksheet

*[Analyst's working notes from Pass 2. Per test plan §7.1, this is where the reasoning was developed before being polished into §8. Retained for audit trail.]*

- D.1: Case working notes per §8 case — `[path]`

### Appendix E: Invariant Audit Evidence

*[Concrete evidence for each §6.1 matrix row: hash captures, session ID comparisons, reconfiguration-attempt logs, etc.]*

- E.1: PS-1 hash check artifact — before/after snapshot
- E.2: PS-2 session ID log
- E.3: PS-8 reconfiguration-attempt log
- E.4: PS-9 fact-base inspection — clause list confirming ground facts only
- E.5: PD-2 firing log — each candidate × canonical pair forced to 0.0
- E.6: PD-9 merge audit — every MergeRecord inspected
- E.7: PD-10 weight vector validation log

### Appendix F: Pre-flight Checklist

*[Filled-in version of test plan §5.1 confirming test was well-prepared.]*

- [x] FANDAWS 178/178 AVC suite re-run and confirmed green, date: [date]
- [x] PROV-O Turtle file fetched, SHA-256 recorded
- [x] Human alignment file fetched, commit hash recorded, NOT opened during Pass 1
- [x] Configuration parameters logged to session record
- [x] Canonical graph snapshot hooks enabled
- [x] Tau Prolog version pinned: [version]
- [x] Clean output directory prepared: `[path]`

---

**End of Report**

*— Report template generated [date]. Populated during PROV-O calibration study [date range]. Finalized [date].*
