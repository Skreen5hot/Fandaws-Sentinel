# D1.6 Checkpoint 2 — Live Session Prep

**For:** 90-minute live session, end of Week 3
**Scope:** narrowed per SME async decisions 2026-04-21
**Revised agenda:** Block 1 termination math (~25 min) + Block 2 Week 2 edge cases (~20 min) + Block 3 curated-process-lists schema (~15 min) + Buffer (~30 min)

---

## Block 1 — Termination-Argument Math Sanity Check (~25 min)

**SME's ask:** walk through the `|V| + |E|` bound for cascade termination (§4.2 of convergence argument) with two specific edge cases, confirming the bound holds on paper.

### Edge case A — 100+ descendants through NA-1.1 inheritance

**Setup.** A single CAU `R` (a Role class, say) with 100 descendants via `rdfs:subClassOf` — typical for deep OBO-style taxonomies. An analyst mutation triggers a reactive cascade on `R`.

**Dependency graph shape.**
- Vertices: `V = {R, D_1, D_2, ..., D_100}` → `|V| = 101`
- Edges: `rdfs:subClassOf` edges from each `D_i` to `R` (or to intermediate `D_j`). In a tree-shaped taxonomy: `|E| = 100` (one edge per descendant).

**Cascade walk.**
- Start at `R`, apply visited-set guard: mark `R` visited.
- Enumerate descendants: 100 children (in a flat tree) or structured tiers (in a balanced one).
- Walk each descendant once — visited-set guard prevents revisits.
- Evidence-delta short-circuit fires at any `D_i` whose evidence state didn't change from `R`'s mutation.

**Bound check.**
- Per-CAU visits: ≤ 101 (each vertex processed once).
- Per-edge walks: ≤ 100 (each subClassOf edge traversed once).
- Total operations: `|V| + |E| = 201`.
- **Claim holds.** Cascade terminates deterministically on a finite-tree inheritance graph regardless of depth (up to the DependencyGraph's practical size limits).

**Subtle point to flag:** the visited-set guard alone gives the `|V|` bound. The evidence-delta heuristic is what gives the O(*unique state changes*) improvement — without it, we still terminate, just with more no-op work at each vertex. SME may want to confirm this separation explicitly.

### Edge case B — Cyclic `rdfs:subClassOf` ring of 5 CAUs

**Setup.** Five CAUs `A → B → C → D → E → A` via `rdfs:subClassOf`. This is a modeling error in the source ontology, but one that appears in real OBO archives.

**Dependency graph shape.**
- Vertices: `V = {A, B, C, D, E}` → `|V| = 5`
- Edges: 5 subClassOf edges forming a ring → `|E| = 5`

**Cascade walk (mutation triggers on `A`).**
- Visit `A`, mark visited.
- Walk edge `A→B`, visit `B` (evidence recomputed given `A`'s change), mark visited.
- Walk edge `B→C`, visit `C`, mark visited.
- Walk edge `C→D`, visit `D`, mark visited.
- Walk edge `D→E`, visit `E`, mark visited.
- Walk edge `E→A` — `A` already in visited-set → **cycle-breaking fires, branch terminates, `cycleDetectionTriggered` flag raised in session metadata.**

**Bound check.**
- Per-CAU visits: 5 (each once).
- Per-edge walks: 5 (each attempted once; the cycle-closing edge is walked but not followed).
- Total operations: `|V| + |E| = 10`.
- **Claim holds.** Cycle detection terminates the ring cleanly; 5 CAUs processed, cascade bounded at 10 operations.

**Subtle point to flag:** the cycle-closing edge IS walked (the walker has to look at `E→A` to notice `A` is visited), but it is NOT followed. So `|E|` counts "edges attempted" not "edges traversed into new state." SME may want to confirm that "attempted" is the right accounting unit for the bound.

### Questions to raise in Block 1

1. **Is `|V| + |E|` the right bound, or should it be `O(|V| + |E|)` (asymptotic, allowing constant-factor per-visit work)?** The per-visit work for evidence-delta comparison is a deep-equality check on the evidence record — potentially O(#ncs) — which pushes the asymptotic bound to `O((|V| + |E|) · #ncs)`. Does this matter at OBO scale?

2. **What happens when a 100-descendant cascade hits evidence-delta short-circuit at depth 3?** Formally, should the bound's `|V|` count include the short-circuited descendants (they were visited, just skipped) or exclude them (they weren't processed)? This is an accounting question but matters for calibration reporting.

3. **DependencyGraph construction cost.** The cascade termination bound assumes the DependencyGraph is already materialized. For NCBITaxon-scale (5K+ classes), construction itself is non-trivial. Is that cost accounted for elsewhere in the argument, or does it belong here?

---

## Block 2 — Week 2 Implementation Edge Cases (~20 min)

### Edge cases surfaced during Week 2 scaffolding

#### E2.1 — Blank-node equivalent-class leaks when not wrapping owl:oneOf

**Context.** The extractor handles `CAU owl:equivalentClass [ ... ]` by walking into the blank node. If the blank node contains `owl:oneOf`, the oneOf normalization fires; otherwise the blank node's IRI leaks into `equivalenceClaims`.

**Fix already applied** (2026-04-21): `equivalenceClaims` only records named-node equivalents; blank-node equivalents are passed to the oneOf-detection loop. If the blank node is neither a oneOf nor a restriction, it's currently silently dropped.

**Question for SME:** is silent drop correct for blank-node equivalents that are neither oneOf nor restriction, or should they surface in a `droppedAxioms` provenance note with reason "unrecognized-complex-class-expression"?

#### E2.2 — Sub-property closure diagnostic weight through BFO scope

**Context.** When a restriction on `cco:hasAgent` (non-BFO) has closure to `bfo:hasParticipant` (BFO inherence-bearing), the extractor recomputes weight per ancestor:
- Direct `cco:hasAgent`: diagnosticWeight Medium
- Inherited `bfo:hasParticipant`: diagnosticWeight High

This is implemented (Week 2), but surfaces a semantic question: **does the High-weight inherited entry override the Medium-weight direct entry in Prolog queries, or do both contribute independently?**

**Current answer:** both contribute independently — the queries are OR'd across all domain restrictions. This is the simpler semantic.

**Alternative:** inherited entries could be treated as derivative-of-direct — if the direct Medium-weight fires, the inherited High-weight is suppressed. This would prevent a diagnostic weight "inflation" from closure.

**SME input needed:** which semantic is correct? The calibration outcome differs.

#### E2.3 — `cau_consistent_with/3` semantics under OWA reclassification

**Context.** Per SME async 2.1, ICNC2/ICNC3/IENC2/OccurrentNC2 now use owa_absence_check helpers. The `cau_consistent_with/3` helper (used by MENC2, ProcessNC3, TemporalRegionNC2, OccurrentNC1, ProcessBoundaryNC2) is still on the table for decomposition — **does strict-policy CURATED-NC enforcement change the priority of this decomposition?**

Specifically: with CURATED-NC gating, any misbehavior in `cau_consistent_with` now affects Entailment gating directly, not just evidence decoration. Does that elevate the decomposition from "defer to Checkpoint 3" to "must-fix before Band 4 calibration"?

#### E2.4 — Scaffold synthetic NC-satisfaction sets will need updating as more Band 3 scenarios come online

**Context.** Each Band 3 AVC scenario requires a scenario-specific synthetic satisfied-NC set in the runner (until Tau Prolog integration lands in Week 4-6). After SME async 2.2, these synthetic sets must include relevant CURATED-NC items per strict policy.

**Operational question:** should the synthetic-set authoring responsibility stay with the developer (mechanical translation of scenario narrative into NC codes) or shift to the SME (authoritative judgment of which NCs a scenario-described CAU satisfies)?

**Default:** stays with developer, with SME spot-check in Checkpoint 3. Flag if SME prefers otherwise.

#### E2.5 — Cardinality dual-read discipline at Prolog predicate library growth

**Per SME async 2.3:** `propertyRestrictionsAsDomain` and `cardinalityRestrictions` both carry cardinality data by design. Prolog queries that compute cardinality arithmetic MUST read from the typed list only, or they double-count.

**Question for Block 2:** is there a lightweight check (a unit test, a Prolog-lib convention, a predicate-name regex) that catches accidental double-reads as the library grows? This is a discipline issue with no mechanical guard yet — worth naming now.

#### E2.7 — NA-1.1 Plausible-parent inheritance semantics (SME-anticipated, Week 4 surfaced)

**Context.** Aaron anticipated this question in the Week 4 clearance memo: when a parent CAU has a Plausible (not Entailed) disposition, does the child inherit Plausible-as-prior, or does the child recompute independently? Spec says inherit; the Week 4 Band 5 scaffold implements inherit-regardless-of-parent-disposition.

**Evidence from the scaffold.** `taxonomic-descent-soft-vs-hard-contradiction` subCaseHard has `inheritedPlacement: { disposition: 'Plausible', bfoCategory: 'bfo:Process' }` — encoding Plausible-parent inheritance followed by NA-1.2 signal discipline override. This passes the AVC scenario, but there's no scenario that tests the *positive* Plausible-parent inheritance case (child with no signals inheriting Plausible cleanly).

**Question for SME.** Confirm the scaffold's inherit-regardless semantic. Two alternatives worth ruling out:
- Children of Plausible parents recompute independently (stricter, but costs the whole point of taxonomic descent for axiom-poor children)
- Children inherit Plausible as disposition but discard bfoCategory (inherit the uncertainty, not the specific hint)

**Priority:** 5-minute decision in Block 2. If SME confirms inherit-regardless: document in spec amendment 01 §1. If SME directs recompute or discard-hint: the `applyProvisionalInheritance` helper in [src/core/d16/inheritance-cascade.js](../../src/core/d16/inheritance-cascade.js) needs a branch for parent.disposition === 'Plausible'; 10-minute implementation change.

**Should we add a positive-test scenario to the bundle?** Yes — a new `taxonomic-descent-plausible-inheritance-clean` scenario that asserts the inherit-regardless contract explicitly. Candidate for Week 5 AVC bundle addition once SME confirms the semantic.

#### E2.6 — ContinuantNC1/NC2 classification consistency with the OWA reclassification

**Context.** Aaron flagged on JSON review 2026-04-21: ContinuantNC1 ("CAU does NOT require temporal participation") is a negative-commitment NC derivable from BFO's Continuant/Occurrent disjointness — semantically parallel to OccurrentNC2 ("Does NOT satisfy any Continuant NC"). OccurrentNC2 moved to OWL-DERIVED under SME async 2.1; ContinuantNC1 stayed OWL-DIRECT. Same asymmetry applies to ContinuantNC2.

**The judgment call:** is temporal participation structurally detectable in Signatures in a way that makes CWA-encoding correct for ContinuantNC1/NC2 (axioms either force temporal participation or they don't, no derivation ambiguity)? If yes: document in `classification_notes`. If no: reclassify for consistency.

**Priority:** 5-minute decision; shouldn't compete with E2.2 for Block 2's substantive time. Flagging so SME comes prepared.

---

## Block 3 — JSON Schema for Curated Process Lists (~15 min)

**Context.** SME is delivering three curated process category lists before Week 4:
1. Social/institutional processes (grounds RoleNC3)
2. Design-expected/evolved-for processes (grounds FunctionNC3)
3. Causal/triggering-circumstance processes (grounds DispositionNC3)

SME asked: come with a preferred schema shape; we lock during Block 3.

### Candidate schemas

#### Option 1 — Flat array of IRIs per category

```json
{
  "curated_process_categories_v1.0": {
    "social_institutional": [
      "http://purl.obolibrary.org/obo/BFO_XXXX",
      "http://example.org/cco/CommercialTransaction",
      ...
    ],
    "design_expected": [
      "http://example.org/cco/PumpingProcess",
      ...
    ],
    "causal_triggering": [
      "http://example.org/cco/ShatteringProcess",
      ...
    ]
  }
}
```

**Pros:** trivially machine-readable; Prolog query is a simple membership check.
**Cons:** no source citation per item; no way to track peer-review provenance; no way to encode "this item is a subsumer — include all subclasses."

#### Option 2 — Hierarchical structure matching BFO subsumption

```json
{
  "curated_process_categories_v1.0": {
    "social_institutional": {
      "roots": ["http://purl.obolibrary.org/obo/BFO_XXXX"],
      "include_subclasses": true
    },
    "design_expected": {
      "roots": [...],
      "include_subclasses": true
    },
    ...
  }
}
```

**Pros:** concise; one root can cover many descendants.
**Cons:** requires the runtime to compute subclass closure per query (expensive at NCBITaxon scale); semantic ambiguity on "include_subclasses" when the subclass itself crosses into another category.

#### Option 3 — Tagged entries with source citations (preferred)

```json
{
  "curated_process_categories_v1.0": {
    "schema_version": "1.0",
    "source_materials": [
      "Arp/Smith/Spear 2015 §5.3.2-5.3.4",
      "Spear/Ceusters/Smith 2016",
      ...
    ],
    "categories": {
      "social_institutional": {
        "description": "Processes realized through social/institutional participation.",
        "grounds_nc": "RoleNC3",
        "entries": [
          {
            "iri": "http://example.org/cco/CommercialTransaction",
            "include_subclasses": true,
            "source": "Arp/Smith/Spear 2015 §5.3.2 example set",
            "notes": "Inclusive of barter processes per Smith & Ceusters 2010."
          },
          ...
        ]
      },
      "design_expected": { ... },
      "causal_triggering": { ... }
    }
  }
}
```

**Pros:** source-traceable (each entry has a citation for peer-review auditing per SME's "mission-critical source code" framing); per-entry subclass inclusion decision; self-documenting grounds-NC linkage.
**Cons:** verbose; more cost to author per item; slightly more Prolog-query machinery to consume.

### Developer preference (for Block 3 discussion)

**Option 3.** Rationale:

1. **Advisory 2 framing.** SME treats the curated BFO JSON as mission-critical source code requiring adversarial peer review. Source citations per entry support that review discipline — a reviewer can check "Does Arp/Smith/Spear §5.3.2 actually list CommercialTransaction as socially-realized?" against the claim. Flat arrays give no audit trail.

2. **Per-entry subclass decisions.** At OBO scale, "include all subclasses of X" as a blanket rule will eventually cross category boundaries (a commercial transaction might have a technology subclass that's design-expected rather than socially-realized). Per-entry decision puts control at the right granularity.

3. **Grounds-NC linkage.** Each category explicitly names which NC it grounds. Helps the three-state evaluator route queries correctly, and helps SME validate that the category definitions align with the NCs they're supposed to support.

4. **Schema version field.** Enables the VD-6 re-evaluation trigger (Q-V1.0-2) to fire when the curated lists change — critical for correctness discipline.

### Alternative if Option 3 is too heavy

**Hybrid**: Option 3 for the first cut (when author time is already sunk into careful definition); degrade to a stripped schema (no per-entry source citations) only if authoring cost becomes prohibitive. The `notes` field can always be added later without a schema break.

### Decisions needed in Block 3

- [ ] Schema shape: Option 1, 2, 3, or hybrid?
- [ ] Subclass-inclusion semantics: per-entry flag, global setting, or always-include?
- [ ] Source-citation format: freeform string, structured `{author, year, section}`, or IRI to a bibliography file?
- [ ] File location: `specs/d16/curated-process-categories-v1.0.json` (alongside the other curated artifacts)?
- [ ] Version-bump policy: does a new entry trigger VD-6 re-evaluation, or only a semantic change to an existing entry's `include_subclasses` flag?

### What the implementer needs in exchange

Once SME delivers the populated schema, the three-state evaluator's helper predicates (`cau_realization_requires_social_institutional_context`, `cau_has_teleological_commitment`, `cau_realization_has_triggering_circumstances`) can be operationalized. Estimated implementation: ~2-3 days once schema + population arrive.

---

## Buffer (~30 min) — Reserved

For depth on any block that needs it, or early release if all three blocks close within 60 minutes.

---

## Pre-Session Checklist (Developer)

- [x] SME async decisions 2.1, 2.2, 2.3 applied to code/artifacts
- [x] JSON reclassified (4 items OWL-DERIVED with OWA bodies)
- [x] Three-state evaluator strict-CURATED-NC policy active
- [x] AVC scenario `evidence-entailed-via-ncs` assertion updated
- [x] Cardinality dual-read discipline documented in extractor header
- [x] Full test suite green (zero regressions)
- [x] Block 1 math worked through on paper with two edge cases
- [x] Block 2 edge cases catalogued (5 items)
- [x] Block 3 schema options drafted with developer preference + rationale
- [ ] Spec updates delegated to Aaron:
  - `PIPELINE-REACTIVE-DECOUPLING` invariant to spec §3.3
  - Option B teleology archival note under Rule EV-3
  - Plausible-proportion metric capture in Week 3-4 calibration
