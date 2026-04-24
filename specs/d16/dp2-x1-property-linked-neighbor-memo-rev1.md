# SME-DP2-X1 — "Property-Linked Neighbor" Operational Definition

**Status:** REV1 2026-04-23. Incorporates external review cycle findings filtered through SME disposition. Gating deliverable for DP-2.2; not blocking for DP-2.1 or DP-2.3.0.
**Owner:** SME (from `docs/architecture/week9-11-forward-flags.md` Item 1).
**Consumes:** `project_d16_na_architecture_commitments.md` (NA-1.3 cascade framing); `feedback_absence_not_evidence.md` (criterion rejection grounding).
**Consumed by:** `DependencyGraph` construction (v1.1.0 amendment path); NA-1.3 cascade traversal; DP-2.2 `reconciliationHistory` entries with `triggeringEvent: 'parent_reconciliation'`.
**Scope fence:** defines *property* linkage only. Subsumption-based dependency, property-chain entailment beyond direct domain/range/restriction, and SWRL/SHACL-mediated dependency are out of scope for this memo and are handled by separate mechanisms (NA-1.1 for subsumption; the other two are deferred to v1.1+ per Wave 3 disposition discipline).
**Rev1 changes:** §2.2 symmetry clarification; new §2.4 ontological scope note; §4.3 cycle-safety requirement; §4.5 nested-expression flattening clarification; §4.9 strengthened from soft assumption to hard precondition with mandatory detection; §6 "parent" terminology clarification.

---

## 1. Problem statement

`DependencyGraph` provides NA-1.3 cascade with the neighbor set of a reconciled CAU. "Neighbor" must be defined operationally: given two CAUs C₁ and C₂ in the session's CAU set, the graph must answer `isNeighbor(C₁, C₂): bool` deterministically, at session-build time, without per-query helper invocation.

The handoff memo's SME lean (2026-04-22) named three candidate criteria:

1. Domain/range co-occupation via a shared ObjectProperty.
2. Restriction-mediated linkage where one CAU's class axioms cite the other via `onProperty`.
3. Shared NC-satisfaction-pattern membership (e.g., both CAUs satisfy RoleNC3).

The SME lean was: **IN: (1) and (2). OUT: (3).** This memo formalizes that lean into an operational definition, validates it against worked examples, enumerates corner cases, and establishes amendment criteria.

Load-bearing consequence: DP-2.2's `reconciliationHistory` entries with `triggeringEvent: 'parent_reconciliation'` cite the parent CAU by reference. "Parent" in that context means a CAU whose reconciliation caused NA-1.3 cascade to re-evaluate the current CAU. If the neighbor relation under-covers genuine dependencies, cascade misses re-evaluation and emitted records misrepresent the reasoning chain. If the neighbor relation over-covers, cascade fires spuriously and provenance records become noisy without semantic payoff. The definition must be tight.

---

## 2. Operational definition

### 2.1 Formal statement

Let O be the active ontology (including imports transitively closed over the session's import graph). Let CAU(O) be the set of canonical CAUs in scope for the current session after OERS entity resolution. Let ObjProp(O) be the set of ObjectProperties declared or inferred in O. For each P ∈ ObjProp(O), let `domain(P)` and `range(P)` be the **named-class unfoldings** of P's declared domain and range class expressions — i.e., the set of named classes appearing in the disjunctive normal form of the class expression, inclusive of subproperty-inherited constraints.

For each C ∈ CAU(O), let `Restrictions(C)` be the set of class-expression axioms in which C participates as subject (SubClassOf or EquivalentClass axioms asserting a restriction on C), and for each R ∈ Restrictions(C), let `onProperty(R)` ∈ ObjProp(O) and `target(R)` be the named-class unfolding of R's filler.

**Definition.** Two CAUs C₁, C₂ ∈ CAU(O) are **property-linked neighbors** iff at least one of the following holds:

- **(1) Domain/range co-occupation.** ∃P ∈ ObjProp(O) such that C₁ ∈ domain(P) and C₂ ∈ range(P), or symmetrically C₂ ∈ domain(P) and C₁ ∈ range(P).
- **(2) Restriction-mediated linkage.** ∃R ∈ Restrictions(C₁) such that C₂ ∈ target(R), or symmetrically ∃R ∈ Restrictions(C₂) such that C₁ ∈ target(R).

`isNeighbor(C₁, C₂) ≡ (1) ∨ (2)`.

### 2.2 Symmetry

The relation is **symmetric**: `isNeighbor(C₁, C₂) ⇔ isNeighbor(C₂, C₁)`. Both (1) and (2) are written in symmetric form above. DependencyGraph edges are therefore undirected.

Rationale: NA-1.3 cascade propagates *reconciliation events* (evidence profile updates, category re-determination), not category-specific changes in one direction. A change to C₁'s profile can invalidate or refine reasoning about C₂ via the same property relationship, regardless of whether C₁ appears in domain or range position. Directional edges would require cascade logic to reason about which direction the propagation should flow per-event-type, which is both complex and unnecessary for soundness. Undirected is the conservative choice.

**Note on symmetry as operational abstraction.** Symmetry is an operational abstraction for cascade propagation, not a claim about the directionality of the underlying ontological relations. Domain/range in OWL is inherently directional (a triple `P(s,o)` places subject and object in distinct roles), and a restriction `C₁ ⊑ ∃P.C₂` is a statement about C₁, not about C₂. The DependencyGraph's undirected edges compress this directional structure into a sound-for-cascade abstraction. Consumers of DependencyGraph should treat it as a cascade-propagation structure, not as a substrate for formal OWL reasoning. If formal reasoning over the relational structure is ever needed, it should be routed back to the underlying axiom set, not derived from the graph.

### 2.3 Anti-definition

Criterion (3) — **NC-satisfaction-pattern sharing** — is **excluded**. Two CAUs do not become property-linked neighbors merely by both satisfying the same BFO necessary-condition pattern (e.g., both being RoleNC3-satisfying, both being FunctionNC4-satisfying).

Grounding in `feedback_absence_not_evidence.md`: NC-satisfaction is a categorical-membership fact, not a semantic-dependency fact. If C₁ and C₂ are both Roles, C₁ being reconciled does not imply C₂ needs re-evaluation — they may be semantically unrelated Roles in unrelated domains. Shared categorical membership is structurally similar to the Week 7 rejected "precedence via BFO-OWL subsumption" argument: taxonomic relatedness is not causal relatedness.

Tractability reinforces the correctness argument (see §5) but is not the load-bearing reason for rejection. Even at zero evaluation cost, (3) would be semantically wrong as a neighbor criterion.

### 2.4 Ontological scope note

The property-linked neighbor relation captures dependency induced by explicitly axiomatized ObjectProperty structure and class restrictions at the level of named classes. It is a **conservative approximation**: it may include edges that do not correspond to actual instance-level dependence (e.g., a property declared with broad domain and range whose instances happen never to co-occur), and it may omit dependencies that arise solely from complex anonymous class expressions beyond named-class extraction, from higher-order axioms, or from rule-based formalisms (SWRL, SHACL shapes) not reduced to ObjectProperty structure. This approximation is intentional and sufficient for the NA-1.3 cascade propagation semantics — over-approximation produces confirmable no-op re-evaluations (safe); the specific under-approximation classes named above are enumerated in §7 as amendment triggers rather than defects.

---

## 3. Worked example

### 3.1 CAU set

Consider a three-CAU fragment from a hypothetical PROV-O-adjacent ingestion (category-TBD CAUs for this example — this is pre-placement):

| CAU | IRI (abbreviated) |
|---|---|
| C₁ | `:Action` |
| C₂ | `:Agent` |
| C₃ | `:Plan` |

### 3.2 Relevant axioms

```
# (a) ObjectProperty with declared domain/range
ObjectProperty: :performedBy
  Domain: :Action
  Range:  :Agent

# (b) Class restriction
Class: :Action
  SubClassOf: :hasPlan some :Plan

# (c) Shared NC pattern (hypothetical)
# Both :Action and :Plan satisfy RoleNC3.
# (No axiom materializes this; it is a Wave-2-helper-evaluable fact.)
```

### 3.3 Neighbor computation under the locked definition

- **C₁ (`:Action`) and C₂ (`:Agent`).** Criterion (1) fires on axiom (a): `:Action ∈ domain(:performedBy)` and `:Agent ∈ range(:performedBy)`. **Neighbors.**
- **C₁ (`:Action`) and C₃ (`:Plan`).** Criterion (2) fires on axiom (b): `:Plan ∈ target(R)` where R is the `:hasPlan some :Plan` restriction on `:Action`. **Neighbors.**
- **C₂ (`:Agent`) and C₃ (`:Plan`).** No ObjectProperty declares a domain/range pairing of these two. Neither appears in a restriction on the other's class axioms. The NC-sharing fact (c) does not contribute. **Not neighbors.**

### 3.4 Cascade behavior under the locked definition

Suppose `:Action` is reconciled (parent-reconciliation event fires in NA-1.3). The cascade queries `DependencyGraph.getNeighbors(:Action)` and receives `{:Agent, :Plan}`. Both are re-evaluated; `reconciliationHistory` on `:Agent` and `:Plan` each receive a new entry with `triggeringEvent: 'parent_reconciliation'` and `parentCau: ':Action'`.

Suppose later `:Plan` is reconciled. `getNeighbors(:Plan)` returns `{:Action}` only — `:Agent` is not a neighbor of `:Plan` and is not re-evaluated. This is the correct outcome: the `:Agent` / `:Plan` relationship was NC-pattern-sharing only, which is (3) and excluded.

---

## 4. Corner cases

The following cases were surfaced during definition formalization. Each has a locked resolution.

### 4.1 Self-linkage

A restriction of the form `C₁ SubClassOf :followedBy some :C₁` creates C₁ as both subject and target, so under criterion (2), `isNeighbor(C₁, C₁)` evaluates true. **Resolution:** permitted but deduplicated at DependencyGraph construction time — self-edges are dropped. Self-reconciliation already re-evaluates the CAU by virtue of being the reconciled entity; a self-edge in the neighbor set would cause redundant work but not incorrectness. Dropping is simpler.

### 4.2 Transitive closure

If `isNeighbor(A, B)` and `isNeighbor(B, C)` but not `isNeighbor(A, C)`, is A a neighbor of C? **No.** The definition is per-edge and not transitive-closed. Cascade may *reach* C from A through two propagation hops (reconciliation of A triggers re-evaluation of B; B's resulting reconciliation triggers re-evaluation of C), but that is cascade-dynamics, not graph-topology. DependencyGraph stores direct edges only; transitive closure is computed on demand if ever needed (no current consumer requires it).

### 4.3 Subproperty chains

If P ⊑ Q and Q has `domain(Q) ∋ C₁, range(Q) ∋ C₂`, does P inherit the same domain/range? **Yes**, under standard OWL 2 semantics — subproperty inherits domain/range constraints. Both P and Q contribute to criterion (1). **Resolution:** the unfolding of `domain(P)` and `range(P)` includes inherited constraints from superproperty declarations. The `bfo-signature-cache` axiom inspection path must compute this inheritance at session build time; it is a one-time cost.

**Correctness constraint on the closure computation.** OBO-scale ontologies in scope for this project (BFO, CCO, PROV-O, NCBITaxon calibration set, and larger OBO Foundry ingestion targets in the post-D1.6 horizon) include `rdfs:subPropertyOf` chains that are deep and, in poorly modeled cases, cyclical. The closure computation that flattens superproperty-inherited domain/range into `domain(P)` and `range(P)` **must terminate on cyclical subproperty lattices**. The specific termination mechanism — cycle detection on traversal, tarjan-style SCC pre-pass, bounded-depth traversal with diagnostic on cap-hit, or other — is developer choice, but the correctness constraint is mandatory: a session build that cannot complete closure on a cyclical lattice must surface a structured diagnostic, not hang or crash. This constraint is load-bearing because OBO Foundry imports will eventually exercise it.

### 4.4 Class-expression domain/range

If `domain(P) = :C₁ ⊔ :C_X` (disjunction), does C₁ count as a domain class of P? **Yes.** Any named class appearing in the disjunctive normal form of the domain expression contributes. Similarly for intersections — any named class in the conjunction contributes (even though the *extension* of the intersection may be narrower than any single conjunct).

Rationale: the cascade's job is to *not miss* genuine dependencies. Under-counting named classes in class expressions would miss cascade opportunities. The risk of over-counting is acceptable because the cascade's downstream work — actual re-evaluation — is bounded by Wave 2 helper costs, not by neighbor-set size.

### 4.5 Anonymous class expressions and nested property structure in restriction targets

If a restriction's filler is anonymous (e.g., `:hasPlan some (:Plan ⊓ :Approved)`), what are the property-linked targets? **All named classes appearing in the anonymous expression** — here both `:Plan` and `:Approved`. Named-class extraction is recursive through class expression structure, including through nested existential and universal restrictions.

**Clarification on nested property structure.** Recursive extraction captures the named classes transitively but **does not preserve the chain of properties mediating them**. For a restriction `C₁ ⊑ ∃P.(A ⊓ ∃Q.B)`, recursive extraction yields named-class targets `{A, B}` and produces edges `C₁—A` and `C₁—B`. The edge `C₁—B` is present and correct (B is a property-linked target of C₁), but the fact that B's relation to C₁ is mediated by P-then-Q (rather than by P alone) is **flattened away** in the graph edge. The edge is sound for cascade purposes — a change in B should propagate re-evaluation to C₁ regardless of path depth — but consumers of edge *metadata* (if captured per the §8 edge-metadata note) should record the outermost property of the attributing restriction and explicitly document that nested property chains are not separately attributed. This is a capture-fidelity limitation of the definition, not a soundness gap: the edge exists, which is what cascade requires.

### 4.6 Annotation properties

AnnotationProperties (e.g., `rdfs:comment`, `skos:prefLabel`, `bfo:definition`) are **excluded** from the neighbor computation regardless of any domain/range declarations on them. Annotations are metadata; they carry no semantic dependency. Only ObjectProperties contribute.

### 4.7 DataProperties

DataProperties (e.g., `:hasAge` with range `xsd:integer`) cannot establish CAU-to-CAU linkage by construction — their range is a datatype, not a class. A DataProperty with a named class as domain still only establishes a relationship to a datatype, not to another CAU. **Excluded** from criterion (1). DataProperty restrictions on a CAU (e.g., `:Person SubClassOf :hasAge some xsd:integer[>18]`) likewise do not contribute to criterion (2) because the target is a datatype literal, not a CAU.

### 4.8 Inverse properties

If P has declared or inferred inverse P⁻¹ and both have domain/range, both contribute independently to criterion (1). No special handling: the union of contributions over all ObjectProperties already covers inverses.

### 4.9 Equivalent classes and OERS canonicalization

If `C₁ ≡ C₂`, the two classes denote the same CAU and should be canonicalized into a single node prior to graph construction.

**Hard precondition.** CAU(O) is required to be **post-OERS-resolution**. The DependencyGraph builder MUST NOT operate on an un-canonicalized CAU set. This is not a soft assumption — it is a correctness precondition of the neighbor relation. Operating on un-canonicalized input would produce duplicate nodes for logically identical classes, missing edges between equivalent-class-aliases, and inconsistent cascade behavior depending on which alias triggers.

**Mandatory detection on precondition violation.** The builder must detect un-canonicalized equivalence at graph-construction time — specifically, if any declared `owl:equivalentClass` axiom names two classes both present as distinct nodes in the input CAU set. On detection, the builder must either (a) fail-fast with a structured diagnostic citing the equivalence axiom and the offending classes, forcing upstream OERS resolution before retry, or (b) apply a graph-collapse operation to canonicalize equivalent classes into a single node prior to edge computation, with the collapse recorded in the session's provenance state. The choice between (a) and (b) is a developer-owned recovery-strategy decision; detection itself is mandatory. Silent operation on un-canonicalized input is a correctness defect.

SME preference for guidance: (a) fail-fast is cleaner for invariant-disciplined operation and avoids masking upstream OERS regressions. (b) graph-collapse may be preferred if OERS has known limits in the current session's ontology surface and operators want forward progress with an audit trail. Either is architecturally acceptable; silent pass-through is not.

### 4.10 Imports and scope

ObjectProperty declarations in imported ontologies contribute to neighbor computation for CAUs in the current session's scope. However, the neighbor relation is computed only over `CAU(O)` — the session's canonical CAU set. A property whose domain or range is a class outside CAU(O) simply doesn't contribute an edge for out-of-scope classes, but may still contribute for in-scope ones.

---

## 5. Tractability argument

### 5.1 Cost of the locked definition

DependencyGraph is built once per session, after CAU canonicalization and before the first NA-1.3 cascade event. The build procedure:

1. Enumerate ObjProp(O), extracting named classes from each property's domain and range (with subproperty inheritance, subject to §4.3 cycle-safety). Cost: linear in |ObjProp(O)|, modulo closure-computation cost governed by §4.3 termination strategy.
2. For each C ∈ CAU(O), enumerate Restrictions(C) and extract named-class targets (recursively through class expressions per §4.5). Cost: linear in total restriction count, modulo expression-tree depth.
3. Build adjacency structure over CAU(O). Cost: linear in edge count.

Total: O(|ObjProp(O)| + |Restrictions| + |E|) where |E| is the resulting edge count. Typical ontology size bounds |E| well below the O(n²) worst case. For a 500-CAU session with ~200 properties and ~1000 restrictions, build completes in tens of milliseconds on the reference edge-canonical target, assuming the subproperty closure termination strategy does not introduce superlinear cost on the encountered lattice.

Per-query cost: O(degree(C)) — constant-time average for adjacency lookup of a CAU's neighbors.

### 5.2 Cost of the rejected (3)

NC-satisfaction-pattern sharing would require evaluating each NC helper on every CAU pair, or at minimum evaluating each NC helper on every CAU once (to build category membership) and then pair-matching within each category. Even the optimistic O(n × k × helper_cost) precomputation (n CAUs, k NC patterns) is prohibitive at session-build time for nontrivial n: with n = 500, k = 11 SME-LOCKED patterns, and Wave 2 helper cost on the order of milliseconds per invocation, precomputation is single-digit minutes — unacceptable for session startup.

More importantly, this cost buys semantically suspect edges. Two CAUs both satisfying RoleNC3 are categorically similar but not dependency-linked. Cascade propagation along NC-pattern-sharing edges would fire re-evaluation on unrelated Roles whenever any one Role reconciles — which is dispositional noise, not dependency signal.

(3) fails both on correctness and cost. Correctness is the load-bearing rejection reason; cost closes the door.

---

## 6. Integration points

The definition is consumed at three points.

**DependencyGraph construction.** The graph builder implements the definition literally — iterate ObjProp(O), iterate Restrictions per CAU, accumulate the symmetric closure. Exposed API: `DependencyGraph.getNeighbors(cau) → Set<CAU>`.

**NA-1.3 cascade traversal.** When a parent-reconciliation event fires on CAU C, cascade calls `getNeighbors(C)` and schedules each returned CAU for re-evaluation. Cascade terminates by the standard NA-1.3 fixed-point discipline (per `project_d16_na_architecture_commitments.md`); the neighbor definition does not introduce termination obligations of its own because the graph is finite and undirected.

**DP-2.2 `reconciliationHistory` entries.** Each entry emitted by NA-1.3 cascade carries `triggeringEvent: 'parent_reconciliation'` and `parentCau: <IRI>`. The parent IRI is the CAU whose reconciliation triggered this re-evaluation via the neighbor relation. If the revised sketch's `causedBy` field (from F1 fold-in) is populated, it cites the prior `reconciliationHistory` entry on the parent CAU that represented the triggering reconciliation event.

**Terminology note on "parent".** In the DP-2.2 schema terms `parent_reconciliation` and `parentCau`, "parent" denotes an **event-level causal role**, not a structural graph-theoretic parent. The DependencyGraph is undirected (§2.2), so there is no graph-theoretic parent/child relation between any two neighbor CAUs. "Parent" in the DP-2.2 context means: the CAU whose reconciliation event triggered the cascade invocation that re-evaluated the current CAU. This terminology is established by the DP-2.2 schema and is retained here for consistency with that schema; readers encountering "parent" elsewhere in DP-2 or cascade code should interpret it through the event-causal-role lens, not through a directed-graph lens.

---

## 7. Amendment criteria

The definition is locked for v1.0 and amendment-governed. Triggers for reconsideration:

**Legitimate triggers:**

- **Cascade under-coverage surfaced empirically.** If DP-2.2 scenarios or Workbench v0.2 Phase 2 Review surface cases where a CAU was clearly dependency-linked to a parent but NA-1.3 did not re-evaluate it, the definition has missed a dependency pathway. Candidate extensions: SWRL-rule-mediated linkage, SHACL-shape-mediated linkage, property-chain axiom linkage, higher-order-axiom-mediated linkage. These match the under-approximation classes named in §2.4.
- **NA-1.4 reactive engine mutation coverage.** If the Week 9-11 NA-1.4 parallel track surfaces a need for directional edges (e.g., mutations that propagate only downstream), the definition could be extended to support an optional directional variant. Undirected stays as the default.
- **Imported ontology scope changes.** If session-scope semantics change such that ObjectProperty contributions from imports need different handling (e.g., cached vs runtime-resolved imports), the §4.10 handling rule is updated without changing the core definition.
- **Subproperty closure cost emergence.** If OBO Foundry ingestion empirically surfaces subproperty lattices whose cycle-safe closure (§4.3) exceeds acceptable session-build latency bounds, the closure computation may move from eager (at build time) to lazy (at first neighbor query). This would be a structural change to the build procedure, not to the definition itself.

**Non-triggers — rejection stands:**

- **Cost alone for reintroducing (3).** Even if helper evaluation becomes dramatically cheaper, NC-satisfaction-pattern sharing remains semantically wrong as a neighbor criterion. The correctness argument, not the cost argument, is load-bearing.
- **Cascade over-propagation complaints absent semantic evidence.** If the definition fires re-evaluation on neighbors that don't change disposition, that is not over-coverage — it is the cascade doing its job of confirming invariance. Noise in `reconciliationHistory` is acceptable; missed propagation is not.

---

## 8. What this memo does not decide

- **Graph storage format.** IndexedDB-backed v1.1.0 amendment is referenced in the DP-2 sketch §8 as a dependency; the in-memory and persisted representations are developer decisions.
- **Edge metadata.** The definition produces edges; whether each edge carries metadata (property ID used, restriction axiom cited, criterion (1) vs (2)) is a separate capture decision. Recommendation: capture the *criterion* (1 or 2) and the *outermost property IRI* responsible for the edge, because this feeds DP-2.2 `reconciliationHistory` diagnostic richness. Per §4.5, nested-property-chain attribution is not separately preserved; the outermost property is the recommended recorded attribution. Left to developer discretion.
- **Subproperty closure termination strategy.** Per §4.3, the closure must terminate on cyclical lattices, but the specific mechanism (cycle-detection on traversal, SCC pre-pass, bounded-depth cap with diagnostic, etc.) is developer choice.
- **OERS precondition violation recovery.** Per §4.9, detection is mandatory, but the choice between fail-fast and graph-collapse is developer-owned. SME preference for fail-fast is noted as guidance, not constraint.
- **Incremental update.** Whether the graph is recomputed on any axiom change or updated incrementally is a performance decision, not a semantic one. Both are valid under this memo.
- **NA-1.4 reactive engine edge-type selection.** NA-1.4 may consume a subset of DependencyGraph edges (e.g., only mutation-affected edges) or add its own edge types. Out of scope for this memo.
- **Subsumption-based dependency.** SubClassOf dependency is handled by NA-1.1 inheritance logic per the NA architecture commitments. This memo does not duplicate that mechanism. If subsumption edges are ever added to DependencyGraph as a convenience for unified cascade traversal, that is a separate amendment.

---

## 9. Lock completion contribution

This memo resolves **SME-DP2-X1**, one of two SME-owed deliverables gating full lock of `dp2-locked-decisions.md`. On developer acknowledgement that the definition is implementable as specified and that no corner case has been missed that affects DP-2.2 implementation planning, X1 transitions to **Resolved** and DP-2.2 unblocks. SME-DP2-X2 (config hash allow-list) remains the final gating item.

**Reserved door for developer pushback:**

- If the corner-case resolutions in §4 create implementation difficulty that changes the cost calculus in §5 (e.g., subproperty-inheritance cycle-safe closure turns out expensive on realistic ontologies beyond §4.3's one-time-cost claim), surface that and we will reconsider §4.3 specifically — possibly moving to a lazy closure strategy per §7's amendment trigger.
- If the developer sees a cascade-coverage case the worked example in §3 missed, surface it now rather than post-implementation.
- If `DependencyGraph.getNeighbors` has API semantics that conflict with §6's integration sketch (e.g., already has a directional-edge API in the v1.1.0 amendment), flag that — the definition is independent of API shape, but the integration description may need revision.
- If the OERS precondition detection (§4.9) surfaces that equivalent-class axioms in OBO imports frequently produce false-positive "un-canonicalized" detections due to benign cross-import overlaps, surface that — detection semantics may need refinement to distinguish OERS-resolvable from OERS-resolved equivalences.

**Next action:** developer review of REV1; SME acknowledgement on response; status transition on `dp2-locked-decisions.md` §3 SME-DP2-X1 row.
