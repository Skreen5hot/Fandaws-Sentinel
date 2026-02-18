# FONDAS v2: Ingestion, Validation & Normalization Engine (IVNE) Specification

**Version:** 2.1
**Date:** February 2026
**Author:** Aaron Damiano
**Organization:** Ontology of Freedom Initiative
**Status:** FINAL
**Supersedes:** v2.0
**Scope:** Phase 14 (Ecosystem Adapters) & Phase 12 (Federation)
**Role:** Normative implementation of `IntegrationAdapter.importOntology()`

---

# 1. Architectural Integration

## 1.1 Purpose and Position

The IVNE is the normative implementation of the `IntegrationAdapter.importOntology(source)` method defined in Fandaws v3.4 (Section 10.3.3). It compiles external OWL 2 DL and RDF ontologies into the Fandaws Fragment — a structurally reduced subset of OWL that guarantees O(1) concept lookup and deterministic graph traversal within the Fandaws Core.

The IVNE is not a general-purpose OWL reasoner, nor does it attempt to preserve the full semantic expressivity of OWL 2 DL. It is a **Monotonic Structural Reduction Engine**: a deterministic compiler that maps OWL axioms into the Fandaws data model (Fandaws v3.4, Section 4.2) while documenting every semantic loss as machine-readable metadata. This design reflects the same epistemic honesty that governs all Fandaws operations — imported knowledge carries explicit provenance about what was preserved, what was discarded, and why.

The IVNE occupies the Integration layer (Fandaws v3.4, Section 2.4). It performs no I/O directly. Source ontology retrieval (from file, HTTP, or IPFS) is handled by the IntegrationAdapter's transport layer. The IVNE receives a parsed OWL/RDF graph and returns a Fandaws `OntologyImportResult`. All output passes through the standard Fandaws Validator (Fandaws v3.4, Section 3.2.4) before it is committed to any scope.

## 1.2 Architectural Constraints

The IVNE inherits all six Fandaws architectural constraints (Fandaws v3.4, Section 2):

1. **Edge-Canonical:** The IVNE must execute in a browser or via `node index.js`. No SPARQL endpoints, OWL API servers, or Java-based reasoners are required.
2. **No Required Infrastructure:** The IVNE operates on in-memory OWL/RDF parse trees. No database, message broker, or background worker is assumed.
3. **Determinism:** Given the same input ontology, the IVNE must produce byte-identical output. The Normalization phase (Section 2, τ_N) guarantees this.
4. **Separation of Concerns:** The IVNE is pure computation. It does not persist state, manage sessions, or contact external services.
5. **JSON-LD Canonical Representation:** The IVNE's output is a JSON-LD `OntologyImportResult`. Internal intermediate representations are permitted but must be losslessly derivable from the JSON-LD form.
6. **Offline First-Class:** The IVNE operates entirely offline. Source ontology files must be locally available. If a source URI cannot be resolved, the IntegrationAdapter returns a `DeferredResult` before the IVNE is invoked.

Additionally, the IVNE respects Constraint 2.8 (No Probabilistic Core Computation). All classification, flattening, normalization, and ID generation is rule-based and deterministic. No language model, embedding model, or probabilistic inference is used at any stage.

## 1.3 Interface Contract

The IVNE implements a single entry point:

| Method | Input | Output |
|---|---|---|
| `compile(parsedOntology, config)` | A parsed OWL/RDF graph (as a JSON-LD or RDF/JS object) plus an `IVNEConfiguration` | An `OntologyImportResult` (Fandaws v3.4, Section 10.3.3) containing a `KnowledgeGraph` fragment, unmapped entities, and a `ReductionManifest` |

The `compile` method is a pure function. It holds no state between invocations. The `IntegrationAdapter.importOntology()` method wraps `compile` with transport (fetching the source file), caching (storing results with provenance envelopes per Fandaws v3.4, Section 3.3.2), and error handling (returning `DeferredResult` on transport failure).

## 1.4 Scope Destination

Imported graphs are stored as **read-only Global Scope entries** with `trustLevel: "experimental"` (Fandaws v3.4, Section 4.2.8). They are never merged directly into a User or Context scope. The import-to-scope pathway is:

1. The IVNE produces an `OntologyImportResult` containing a `KnowledgeGraph` fragment.
2. The `IntegrationAdapter` wraps the result with a provenance envelope (Fandaws v3.4, Section 3.3.2).
3. The `OrchestrationAdapter` publishes the graph to IPFS via the `IPFSAdapter` (Fandaws v3.4, Section 10.7.1), producing a CID.
4. The `OrchestrationAdapter` creates a new `ScopeEntry` in the caller's `ScopeConfiguration` with the CID, `trustLevel: "experimental"`, and `staleCopyAction: "fork"` (default for imported ontologies, since upstream OWL ontologies may refactor without notice).
5. The ScopeResolver (Fandaws v3.4, Section 3.2.7) discovers imported concepts during normal scope resolution. Concepts are pulled into the local graph via copy-on-resolve only when referenced.

This pathway ensures that imported knowledge never bypasses the Fandaws semantic firewall. A concept from Gene Ontology enters the local graph only when a user or agent explicitly references it — at which point the ScopeResolver triggers, the concept is copied with `fandaws:resolvedFrom` provenance, and the caller can inspect, refine, or override it through the normal conversational workflow.

---

# 2. Mathematical Definition

The transformation function τ is defined as:

    τ: OWL_2_DL → Fandaws_Fragment

    τ = τ_N ∘ τ_R ∘ τ_F

Where:

1. **τ_F (Flattening):** Compiles nested OWL class expressions into a dependency graph of named nodes. This step is **lossy** for disjunctions (∪) and **necessary-conditions-only** for conjunctions (∩). Every lossy transformation produces a `SemanticLossRecord` (Section 4).
2. **τ_R (Restriction Lifting):** Reifies anonymous restrictions (existential, universal, cardinality) into named or inline nodes, ensuring all logic is addressable within the Fandaws graph model.
3. **τ_N (Normalization):** Enforces canonical ordering and structural hashing to guarantee bit-identical output across runs. This step also performs Identity Simplification (Fandaws v3.4, Section 6.6) on all labels to produce `fandaws:canonicalLabel` values compatible with Termidium deduplication.

Each phase is a pure function. The composition τ_N ∘ τ_R ∘ τ_F is evaluated left-to-right: flattening first, then restriction lifting, then normalization.

---

# 3. The Primitive Axiom Basis (PAB)

All incoming OWL axioms must be compiled into one of the eight atomic forms defined here. Axioms that cannot be compiled are either rejected with a specific rejection reason, downgraded with a `SemanticLossRecord`, or stored as opaque annotations for reference.

## 3.1 Class Primitives

| ID | OWL Form | Fandaws Mapping | Compiler Behavior |
|---|---|---|---|
| **P1** | `A SubClassOf B` (named) | `fandaws:parent` | Direct mapping. A becomes a child of B in the concept hierarchy. If both A and B have labels, they receive label-based IRIs (Section 5). |
| **P2** | `A EquivalentTo B` (named) | Termidium merge | Both concepts are created; the IVNE emits a `GraphMutation` with a merge operation. Termidium (Fandaws v3.4, Section 6.2) resolves which survives using its standard tie-breaking policy (depth, creation time, assertion count). |
| **P3** | `A DisjointWith B` | `owl:disjointWith` annotation | Stored as a property on both concepts. The Fandaws Validator uses disjointness during sanity checks but does not perform DL reasoning over it. The OCE (Fandaws v3.4, Section 10.4.3) consumes disjointness axioms for ontological coherence validation. |

## 3.2 Property Primitives

| ID | OWL Form | Fandaws Mapping | Compiler Behavior |
|---|---|---|---|
| **P4** | `P SubPropertyOf Q` | Property hierarchy | Direct mapping to the Fandaws property model. Produces a `fandaws:Relationship` with `fandaws:subRelationshipOf` pointing to the parent property. |
| **P5** | `A SubClassOf (P some B)` | `fandaws:Property` with existential semantics | A receives a property "P" with object B. Mapped as: A has at least one P-related B. This is the primary representation for OWL restrictions in Fandaws. |
| **P6** | `A SubClassOf (P only B)` | `fandaws:Property` with universal annotation | A receives a property "P" restricted to B. Stored as a property with `fandaws:quantifier: "universal"`. The KnowledgeEngine does not enforce universality at runtime, but the OCE and IEE can consume this annotation. |

## 3.3 Extended Primitives

| ID | OWL Form | Compiler Behavior |
|---|---|---|
| **P7** | `P ∘ Q → R` (Property Chain) | **Retained with complexity annotation.** Property chains of any length are compiled to `owl:propertyChainAxiom` and stored as annotations on the resulting property. Chains exceeding 3 hops receive a `fandaws:complexityWarning` annotation with `fandaws:chainLength` recording the actual hop count. The Fandaws Core does not materialize chains at runtime. Downstream consumers (FNSR rule engine, OCE) may materialize them if their execution context supports it. No chain is rejected solely for length. **Consumer Obligation:** This annotation is only useful if downstream consumers actively look for `owl:propertyChainAxiom` and `fandaws:complexityWarning` during graph ingestion. FNSR (Fandaws v3.4, Section 10.5.1) and OCE (Fandaws v3.4, Section 10.4.3) specifications MUST be updated to include property chain consumption in their ingestion contracts. Until those specifications are updated, property chains are retained for provenance and future-proofing but are not actively consumed. The IVNE ships a `chainConsumptionReady` field on the `ReductionManifest` (Section 11.2) that reports `true` only when the configured FNSR/OCE versions support chain ingestion. |
| **P8** | `A SubClassOf (P min/max/exactly n B)` | **Dual Representation.** (1) **Logical:** The existential component (min ≥ 1) is compiled as P5 (`P some B`), ensuring Fandaws can represent "A has at least one P-related B." (2) **Structural:** The full cardinality constraint is preserved as a `fandaws:cardinalityConstraint` property (Section 3.4) on the concept. This structured property is ignored by the KnowledgeEngine but is available to the OCE for state-transition validation (Fandaws v3.4, Section 10.4.3) and to the IEE for normative baseline reasoning (Fandaws v3.4, Section 10.5.2). Min-cardinality-0 axioms (vacuously true) are dropped entirely with a `SemanticLossRecord` of type `vacuousDrop`. |

## 3.4 CardinalityConstraint Schema

The `fandaws:cardinalityConstraint` is a first-class structured property that preserves the full cardinality information from the source ontology. Unlike annotations that "the reasoner ignores," this property is part of the concept's formal property set and is consumable by any downstream system.

| Field | Type | Description |
|---|---|---|
| @type | fandaws:CardinalityConstraint | Type discriminator |
| fandaws:property | IRI | The property being constrained (e.g., `fandaws:concept/wheel`) |
| fandaws:constrainedClass | IRI | The class on which the constraint is declared (e.g., `fandaws:concept/car`) |
| fandaws:minCardinality | integer \| null | Minimum count. Null if unconstrained. |
| fandaws:maxCardinality | integer \| null | Maximum count. Null if unconstrained. |
| fandaws:exactCardinality | integer \| null | Exact count. If present, min and max are both set to this value for consistency. |
| fandaws:qualifiedOver | IRI \| null | The qualifier class (e.g., `fandaws:concept/wheel` in "exactly 4 Wheels"). Null for unqualified cardinality. |
| fandaws:sourceAxiom | string | The original OWL Manchester Syntax or Functional Syntax string, preserved verbatim for audit. |
| fandaws:reductionNote | string | Human-readable note explaining the dual representation (e.g., "Existential component compiled as P5; full constraint preserved here for OCE/IEE consumption"). |

**Consistency Invariant:** The IVNE Pre-Filter (Section 9.1) enforces the following invariant on every `CardinalityConstraint` before it is emitted. Violation of this invariant is an `IVNEInternalError`, not a validation warning — it indicates a compiler bug, not a source ontology problem.

1. If `exactCardinality` is non-null, then `minCardinality` MUST equal `exactCardinality` AND `maxCardinality` MUST equal `exactCardinality`.
2. If both `minCardinality` and `maxCardinality` are non-null, then `minCardinality` MUST be ≤ `maxCardinality`.
3. If `minCardinality` is non-null, it MUST be ≥ 0.
4. If `maxCardinality` is non-null, it MUST be ≥ 1 (a maxCardinality of 0 implies the property is forbidden, which should be compiled as a disjointness or complement assertion, not a cardinality constraint).

An inconsistent `CardinalityConstraint` (e.g., `exact=4, min=3`) would cause undefined behavior in the OCE's state-transition validator. This invariant prevents that class of error at the source.

**Example:**

```json
{
  "@type": "fandaws:CardinalityConstraint",
  "fandaws:property": "fandaws:concept/has_wheel",
  "fandaws:constrainedClass": "fandaws:concept/car",
  "fandaws:minCardinality": 4,
  "fandaws:maxCardinality": 4,
  "fandaws:exactCardinality": 4,
  "fandaws:qualifiedOver": "fandaws:concept/wheel",
  "fandaws:sourceAxiom": "Car SubClassOf (has_wheel exactly 4 Wheel)",
  "fandaws:reductionNote": "Existential component (has_wheel some Wheel) compiled as P5. Full cardinality preserved for OCE state-transition validation."
}
```

---

# 4. Semantic Loss Tracking

## 4.1 Design Rationale

The IVNE's defining architectural commitment is that **every semantic loss is reified as machine-readable metadata**. This distinguishes it from ontology converters that silently discard expressivity. Downstream consumers — particularly FNSR services, the OCE, and the IEE — must be able to distinguish between ontological commitments that are faithfully preserved and those that are approximated.

Semantic loss tracking is not a debugging feature; it is a formal contract between the IVNE and the rest of the ecosystem. An FNSR service that encounters a `unionGeneralization` loss record on a concept knows not to derive strong defeasible expectations from it. An IEE worldview evaluator that encounters a `cardinalityDowngrade` knows the normative baseline for that concept's structure may be weaker than the source ontology intended.

## 4.2 SemanticLossRecord Schema

Every lossy transformation produces a `SemanticLossRecord` attached to the affected concept(s) as a `fandaws:semanticLoss` property.

| Field | Type | Description |
|---|---|---|
| @type | fandaws:SemanticLossRecord | Type discriminator |
| fandaws:lossType | enum | The category of loss. See Section 4.3 for the enumeration. |
| fandaws:severity | enum | `informational`, `degraded`, `lossy`. See Section 4.4. |
| fandaws:affectedConcepts | IRI[] | Concepts whose semantics are weakened by this loss. |
| fandaws:sourceAxiom | string | The original OWL axiom (Manchester Syntax) that was reduced. |
| fandaws:compiledForm | string | What the axiom was compiled to in the Fandaws Fragment. |
| fandaws:lostSemantics | string | Human-readable description of what was lost. |
| fandaws:downstreamImpact | object | Machine-readable impact assessment for each consuming system. |
| fandaws:sourceOntology | IRI | The ontology from which the axiom originated. |
| fandaws:ivneRunId | IRI | The IVNE compilation run that produced this record. |

## 4.3 Loss Type Enumeration

| Loss Type | PAB Source | Description |
|---|---|---|
| `intersectionFlattening` | Conjunction | An `A and B` expression was flattened into a generated superclass. Necessary conditions preserved; sufficient conditions lost. |
| `unionGeneralization` | Disjunction | An `A or B` expression was generalized into a common superclass. The constraint that instances must be one of the specific disjuncts is lost. |
| `cardinalityDowngrade` | P8 | An exact or max cardinality was compiled to existential-only in the logical layer. The structural `fandaws:cardinalityConstraint` preserves the full constraint but is not enforced by the KnowledgeEngine. |
| `complementDrop` | N/A | A `ComplementOf` expression in subject position was rejected. The IVNE cannot represent negation-as-failure. |
| `enumerationDrop` | N/A | A `OneOf` (enumerated class) was rejected. Fandaws does not support closed-world enumeration in its concept model. |
| `vacuousDrop` | P8 | A min-cardinality-0 constraint (trivially true) was dropped. No semantic content is lost. |
| `universalWeakening` | P6 | A universal quantification was compiled as a property with `fandaws:quantifier: "universal"`. The KnowledgeEngine does not enforce universality. |
| `chainComplexityFlag` | P7 | A property chain exceeds 3 hops. The chain is retained but flagged for manual review. |

## 4.4 Severity Levels

| Severity | Meaning | Downstream Behavior |
|---|---|---|
| `informational` | The transformation preserves all reasoning-relevant semantics. The note is for audit only. | No action required. Examples: `vacuousDrop`, `intersectionFlattening` (which preserves necessary conditions). |
| `degraded` | Some semantics are weakened but the core assertion remains valid. Downstream services should adjust confidence. | FNSR DES marks derived expectations as `Weak/Generic`. OCE lowers confidence on coherence checks involving this concept. Examples: `cardinalityDowngrade`, `universalWeakening`, `chainComplexityFlag`. |
| `lossy` | Critical semantic content is discarded. Downstream services should not derive strong conclusions from this concept's structure. | FNSR DES suppresses defeasible expectations from this concept. OCE treats constraints involving this concept as advisory only. IEE flags ethical reasoning that depends on this concept's classification as potentially ungrounded. Examples: `unionGeneralization`, `complementDrop`, `enumerationDrop`. |

## 4.5 Downstream Impact Structure

The `fandaws:downstreamImpact` object provides machine-readable guidance for each consuming system:

```json
{
  "fnsr": {
    "des": "suppress",
    "css": "flagAsApproximate",
    "aps": "reduceStructuralSimilarityWeight",
    "mdre": "noImpact"
  },
  "oce": "advisoryOnly",
  "iee": "flagAsWeaklyGrounded",
  "shml": "markProvisional"
}
```

The impact values are enums consumed by each service. This structure enables automated degradation: an FNSR service loading a Fandaws graph can programmatically filter or adjust its reasoning based on loss records without human intervention.

---

# 5. Unified Identity Generation

## 5.1 Design Rationale

The IVNE must produce IRIs that are compatible with the Fandaws IRI model (Fandaws v3.4, Section 4.2.1) so that Termidium deduplication, ScopeResolver matching, and UI display work identically for imported and conversationally-created concepts. This means:

- Named concepts from the source ontology receive label-based IRIs (`fandaws:concept/{canonicalLabel}`), identical in structure to concepts created through the conversational pipeline.
- Anonymous concepts (generated by intersection/union flattening or restriction lifting) receive hash-based IRIs (`fandaws:gen/{hash}`), clearly distinguishable as generated artifacts.
- Every imported concept carries a `fandaws:importedFrom` annotation preserving the original source IRI for provenance and cross-reference.

## 5.2 Named Concept IRI Generation

For any OWL class or property that has an `rdfs:label` or can derive a human-readable label from its URI fragment:

1. **Extract label:** Use `rdfs:label` (preferred), `skos:prefLabel`, or the URI local name (the fragment after `#` or the last path segment).
2. **Apply Identity Simplification** (Fandaws v3.4, Section 6.6): trim, collapse whitespace, remove leading articles, apply NFKC normalization, apply locale-aware case folding, expand abbreviations.
3. **Mint IRI:** `fandaws:concept/{canonicalLabel}`.
4. **Store dual labels:** `fandaws:displayLabel` preserves the original label casing and form. `fandaws:canonicalLabel` stores the normalized form.
5. **Store provenance:** `fandaws:importedFrom` records the original OWL IRI.

**Example:**

| Source | rdfs:label | Display Label | Canonical Label | Fandaws IRI | importedFrom |
|---|---|---|---|---|---|
| `obo:GO_0005634` | "nucleus" | "Nucleus" | "nucleus" | `fandaws:concept/nucleus` | `obo:GO_0005634` |
| `obo:BFO_0000040` | "material entity" | "Material Entity" | "material entity" | `fandaws:concept/material_entity` | `obo:BFO_0000040` |
| `ex:MyOntology#RedBloodCell` | "Red Blood Cell" | "Red Blood Cell" | "red blood cell" | `fandaws:concept/red_blood_cell` | `ex:MyOntology#RedBloodCell` |

**Label Extraction Priority:** When multiple label sources exist, the IVNE uses this priority order:

1. `rdfs:label` with a language tag matching the configured locale (Fandaws v3.4, Section 11.1).
2. `rdfs:label` with no language tag.
3. `skos:prefLabel` with matching locale.
4. `skos:prefLabel` with no language tag.
5. URI local name (fragment or last path segment), with underscore-to-space conversion and camelCase splitting.

If no label can be extracted by any method, the concept is treated as anonymous and receives a hash-based IRI (Section 5.3).

## 5.3 Anonymous/Generated Concept IRI Generation

For concepts generated by the Flattening phase (intersection/union generated superclasses) or Restriction Lifting phase (reified anonymous restrictions):

1. **Deep Sort:** Recursively sort all operands in the expression tree alphabetically by their canonical labels (not source URIs). This ensures that `(A and B)` and `(B and A)` produce the same hash.
2. **Quantifier Normalization:** Normalize `someValuesFrom` and `minCardinality 1` to the same canonical form before hashing.
3. **Serialize:** Produce a canonical string representation of the normalized expression.
4. **Hash:** SHA-256 over the canonical string.
5. **Mint IRI:** `fandaws:gen/{hash_prefix_12}` (first 12 characters of the hex digest). The 12-character prefix provides ~48 bits of collision resistance, which is sufficient for knowledge graphs under 10 million generated concepts.
6. **Store expression source:** `fandaws:generatedFrom` records the canonical string used for hashing, enabling verification and debugging.

**Collision Handling:** Before minting, the IVNE checks whether `fandaws:gen/{hash_prefix}` already exists. The collision check is performed in two scopes, in order:

1. **Current import batch:** If the IRI exists in the output graph being constructed by this compilation run, and the `generatedFrom` values are identical, the existing node is reused (implicit deduplication within the same import).
2. **Global scope federation:** If the IRI exists in any previously imported global scope graph (discovered via the StateAdapter's `loadGraph` for each scope in the active `ScopeConfiguration`), the IVNE compares `generatedFrom` values:
   - If identical: the concept is semantically identical across imports. The IVNE reuses the IRI but does **not** merge the nodes — the concept exists independently in each scope graph. The ScopeResolver handles cross-scope identity at query time.
   - If different: this is a hash collision across different imports. The prefix is extended by 4 characters and the check is repeated against both scopes, up to the full 64-character hash.

A full-hash collision (64-character match with different `generatedFrom`) is treated as an `IVNEInternalError`. This two-scope check prevents semantic conflation where `gen/abc123456789` means "intersection(A, B)" in one imported ontology and "union(C, D)" in another.

## 5.4 Cross-Reference with Source Ontology

Every imported concept — whether named or generated — carries provenance annotations linking it to the source ontology:

| Annotation | Type | Description |
|---|---|---|
| `fandaws:importedFrom` | IRI \| null | Original OWL IRI for named concepts. Null for generated concepts. |
| `fandaws:generatedFrom` | string \| null | Canonical expression string for generated concepts. Null for named concepts. |
| `fandaws:sourceOntology` | IRI | The ontology from which this concept was imported. |
| `fandaws:ivneVersion` | string | The IVNE version that performed the compilation. |
| `owl:sameAs` | IRI \| null | For named concepts, an `owl:sameAs` triple linking the Fandaws IRI to the original OWL IRI. This enables external systems that reference the original IRI to trace it into the Fandaws graph. Null for generated concepts. |

## 5.5 ScopeResolver Collision Handling

When the IVNE produces `fandaws:concept/nucleus` and a concept with that canonical label already exists in a higher-priority global scope, no special action is required during import. The import graph is stored as its own scope entry with its own priority. The ScopeResolver's standard resolution algorithm (Fandaws v3.4, Section 3.2.7) handles the collision at query time:

- If the existing concept and the imported concept have compatible IS_A chains (they converge to a common ancestor within the deduplication depth), the higher-priority scope's definition wins. The imported definition is available but shadowed.
- If the IS_A chains are incompatible, the ScopeResolver emits a `ConflictReport` (Fandaws v3.4, Section 4.2.10) and the caller resolves the conflict through the standard cross-scope conflict resolution workflow (Fandaws v3.4, Section 5.11).

No IVNE-specific collision logic is needed. The existing Fandaws architecture handles it.

---

# 6. Flattening Strategy (τ_F)

## 6.1 Overview

The Flattening phase traverses the OWL class expression tree and compiles compound expressions into the Fandaws graph model. Each compound expression becomes either a set of named subsumption axioms (P1) or a generated concept node with subsumption links to its operands. The key invariant: after flattening, no anonymous compound class expressions remain in the graph. Every node is addressable by IRI.

## 6.2 Intersection Flattening (∩)

**Input:** `Class: X SubClassOf: (A and B)`

**Operational Semantics:**

1. Generate named concept I_AB using the hash-based IRI scheme (Section 5.3) from the canonical expression `intersection(A, B)`.
2. Assert: `A SubClassOf I_AB` AND `B SubClassOf I_AB`.
3. Rewrite: `X SubClassOf I_AB`.
4. Attach `SemanticLossRecord` with `lossType: "intersectionFlattening"`, `severity: "informational"` to I_AB.
5. Store `fandaws:sourceAxiom: "X SubClassOf (A and B)"` on I_AB.

**Semantic Preservation:** This preserves **necessary conditions**: any instance of X is necessarily an A and a B (because X is a subclass of something that both A and B are subclasses of). It loses **sufficient conditions**: we cannot infer that any thing which is both an A and a B is an X or an I_AB. The `informational` severity reflects that this loss rarely affects practical reasoning — most downstream consumers need necessary conditions (inheritance, property propagation) rather than sufficient conditions (automatic classification).

**Nested Intersections:** `X SubClassOf (A and (B and C))` is flattened recursively:

1. Inner intersection: generate I_BC from `intersection(B, C)`, assert `B SubClassOf I_BC`, `C SubClassOf I_BC`.
2. Outer intersection: generate I_A_IBC from `intersection(A, I_BC)`, assert `A SubClassOf I_A_IBC`, `I_BC SubClassOf I_A_IBC`.
3. Rewrite: `X SubClassOf I_A_IBC`.

Each generated node carries its own `SemanticLossRecord`.

## 6.3 Union Flattening (∪) — LOSSY

**Input:** `Class: Y SubClassOf: (A or B)`

**Operational Semantics:**

1. Generate named concept U_AB using the hash-based IRI scheme from the canonical expression `union(A, B)`.
2. Assert: `A SubClassOf U_AB` AND `B SubClassOf U_AB`.
3. Rewrite: `Y SubClassOf U_AB`.
4. Attach `SemanticLossRecord` with `lossType: "unionGeneralization"`, `severity: "lossy"` to U_AB.
5. Store `fandaws:sourceAxiom: "Y SubClassOf (A or B)"` on U_AB.
6. Store `fandaws:disjuncts: [IRI_A, IRI_B]` on U_AB, preserving the original disjunct membership for downstream consumers that need it.

**Semantic Loss:**

- *Original meaning:* Instances of Y must be A **or** B (exclusive membership in at least one disjunct).
- *Fandaws meaning:* Instances of Y are of type U_AB (a common superclass of A and B). The constraint that Y must be one of the specific subtypes is lost. Fandaws permits Y to be a generic U_AB with no further classification.
- *Impact:* This is a controlled loss of precision to prevent branching in the graph model. The `lossy` severity ensures downstream consumers are aware.

**Downstream Consumer Guidance:**

The `fandaws:downstreamImpact` on the `SemanticLossRecord` instructs:

- **FNSR DES (Defeasible Expectation Service):** Suppress defeasible expectations derived from U_AB. Do not generate "Y is typically a U_AB" because U_AB is a synthetic generalization, not a natural kind.
- **FNSR CSS (Counterfactual Simulation Service):** When simulating counterfactuals involving Y, flag that the disjunct constraint is lost. The `fandaws:disjuncts` array on U_AB enables CSS to reconstruct the original constraint if needed.
- **OCE:** Treat classification constraints involving U_AB as advisory. Do not reject state transitions solely because they violate a union-flattened classification.
- **IEE:** Flag ethical reasoning that depends on Y's classification under U_AB as `weaklyGrounded` — the classification is an approximation, not a precise ontological commitment.

## 6.4 Complement Handling

**Input:** `Class: Z SubClassOf: (not A)`

**Behavior:** The IVNE cannot represent negation-as-failure within the Fandaws Fragment. Complement expressions are handled as follows:

- **Complement in object position** (e.g., `X SubClassOf (P some (not A))`): Rejected. A `SemanticLossRecord` with `lossType: "complementDrop"`, `severity: "lossy"` is generated and attached to X.
- **Complement in subject position** (e.g., `(not A) SubClassOf B`): Rejected. Same `SemanticLossRecord`.
- **Disjoint union** (e.g., `A DisjointUnionOf (B, C)`): The disjointness component is compiled as P3 (`B DisjointWith C`). The covering axiom (every A is a B or C) is compiled via union flattening (Section 6.3) with its associated loss record.

## 6.5 Enumeration Handling

**Input:** `Class: W EquivalentTo: {a, b, c}` (OneOf)

**Behavior:** Fandaws does not support closed-world enumeration in its concept model. Enumerated classes are rejected entirely. A `SemanticLossRecord` with `lossType: "enumerationDrop"`, `severity: "lossy"` is generated. The enumerated individuals (a, b, c) are noted in the `sourceAxiom` field for audit but are not imported.

**Rationale:** Fandaws concepts are open-world: a concept can always have new instances. Importing a closed-world enumeration would create a semantic mismatch that could corrupt downstream reasoning. The `lossy` severity ensures this is visible.

## 6.6 Traversal and Cycle Detection

The Flattening phase traverses the OWL class expression tree depth-first. The traversal maintains a `visitedSet` of class expression hashes. If a cycle is detected (a class expression references itself, directly or transitively):

1. The specific cyclic axiom branch is dropped.
2. The non-cyclic components of the expression are compiled normally.
3. A `SemanticLossRecord` with `lossType: "cycleDrop"`, `severity: "lossy"` is generated, recording the cyclic path.
4. Both concepts involved in the cycle are imported as disconnected nodes (no parent-child relationship).

Cycle detection is independent of depth limits. The IVNE does not impose a recursion depth limit on expression nesting — it relies on the `visitedSet` for termination.

---

# 7. Restriction Lifting (τ_R)

## 7.1 Overview

After flattening, the graph may contain anonymous restriction nodes (existential, universal, cardinality). The Restriction Lifting phase ensures every restriction is either:

1. **Inlined** as a property on the parent concept (for simple restrictions with reference count 1), or
2. **Named** as a generated concept node with its own IRI (for complex or multiply-referenced restrictions).

## 7.2 The Safe Re-folding Rule

A restriction node R_gen representing a simple restriction (P5 or P6) MAY be re-folded inline into its parent's property list IF AND ONLY IF:

1. **Reference Count == 1:** R_gen is referenced by exactly one parent class.
2. **Not Anchored:** R_gen is NOT referenced in any:
   - Property Chain (P7)
   - Disjointness Assertion (P3)
   - Equivalence Axiom (P2)
   - Domain or Range definition
   - Another restriction's filler position
3. **Not Loss-Carrying:** R_gen does not carry a `SemanticLossRecord` with severity `lossy`. Lossy nodes must remain named so that downstream consumers can identify them.

If ALL conditions are met, R_gen is dissolved: its property assertion is attached directly to the parent concept, and R_gen is removed from the graph. This reduces graph noise without breaking structural anchors.

If ANY condition fails, R_gen MUST remain as a named node (with a hash-based IRI from Section 5.3).

## 7.3 Cardinality Lifting

Cardinality restrictions receive the dual representation defined in Section 3.3, P8:

1. The existential component (min ≥ 1) becomes a standard P5 property assertion on the parent concept.
2. The full cardinality constraint becomes a `fandaws:CardinalityConstraint` structured property (Section 3.4) on the same concept.

Both representations reference the same property IRI and qualified class, ensuring consistency.

---

# 8. Normalization (τ_N)

## 8.1 Purpose

The Normalization phase guarantees that the IVNE's output is deterministic: given the same input ontology, the output is byte-identical across runs, across platforms, and across IVNE versions (for the same specification version). This is essential for IPFS content-addressing (Fandaws v3.4, Section 10.7.1), where the CID of the output graph must be reproducible.

## 8.2 Algorithm

1. **Label Normalization:** Apply Identity Simplification (Fandaws v3.4, Section 6.6) to all `fandaws:canonicalLabel` values.
2. **Deep Sort:** Recursively sort all arrays in the JSON-LD output:
   - `fandaws:concepts` sorted by `@id` (lexicographic).
   - `fandaws:properties` sorted by `@id`.
   - `fandaws:relationships` sorted by `@id`.
   - `fandaws:semanticLoss` arrays sorted by `fandaws:sourceAxiom` (lexicographic).
   - All `fandaws:children` arrays sorted by `@id`.
3. **Timestamp Normalization:** All `fandaws:createdAt` timestamps on imported concepts are set to the IVNE run start time (a single deterministic value), not to the time each concept was individually processed.
4. **Quantifier Normalization:** `someValuesFrom` and `minCardinality 1` are normalized to the same canonical PAB form (P5) before they appear in the output.
5. **Whitespace Normalization:** The JSON-LD output uses 2-space indentation, no trailing whitespace, LF line endings. This is a serialization concern but affects CID computation.

## 8.3 Determinism Verification

The IVNE ships with a determinism test harness. The test:

1. Compiles a reference ontology (a bundled OWL file) twice.
2. Computes SHA-256 of both outputs.
3. Asserts the hashes are identical.

This test runs as part of the standard Fandaws test suite (Fandaws v3.4, Section 9).

---

# 9. Validation Alignment

## 9.1 Two-Stage Validation

The IVNE's output passes through two validation stages before it is committed to any scope:

**Stage 1: IVNE Pre-Filter (runs during compilation)**

The IVNE applies its own validation gates during the Flattening phase. These gates reject or downgrade axioms that cannot be represented in the Fandaws Fragment:

| Gate | Action | Result |
|---|---|---|
| `OneOf` detected | Reject axiom | `SemanticLossRecord` (enumerationDrop, lossy) |
| `ComplementOf` in subject position | Reject axiom | `SemanticLossRecord` (complementDrop, lossy) |
| Property chain > 3 hops | Flag, retain | `SemanticLossRecord` (chainComplexityFlag, degraded) |
| Cardinality min/max/exact | Dual representation | `SemanticLossRecord` (cardinalityDowngrade, degraded) |
| Cycle detected | Drop cyclic branch | `SemanticLossRecord` (cycleDrop, lossy) |
| No extractable label | Generate hash-based IRI | No loss record (structural decision, not semantic loss) |

The IVNE Pre-Filter does NOT check for Fandaws structural integrity (circular hierarchies, property redundancy, structural grounding). Those checks belong to Stage 2.

**Stage 2: Standard Fandaws Validator (runs on the output graph)**

After the IVNE produces its `OntologyImportResult`, the standard Fandaws Validator (Fandaws v3.4, Section 3.2.4) runs on the output `KnowledgeGraph` fragment. The Validator enforces:

- Sanity Check (no circular hierarchies) — Fandaws v3.4, Section 6.5
- Structural Grounding (every concept has a parent, an allowRoot flag, or a typed property) — Fandaws v3.4, Section 6.1
- Property Redundancy Prevention (no duplicate or inherited-redundant properties) — Fandaws v3.4, Section 6.3
- Termidium deduplication within the imported graph — Fandaws v3.4, Section 6.2

**Root Concept Handling:** OWL ontologies typically have multiple root classes (e.g., `owl:Thing`, BFO top-level categories). These are imported with the `fandaws:allowRoot: true` flag to satisfy structural grounding without requiring a parent classification.

**Validation Failures:** If the Validator rejects any concept in the imported graph, that concept is excluded from the output and a `ValidationRejection` record is appended to the `OntologyImportResult.unmappedEntities` array. The rejection does not halt the entire import — other valid concepts are retained.

## 9.2 OCE Post-Validation (Optional)

If the OCE is available (Fandaws v3.4, Section 10.4.3), the OrchestrationAdapter may submit the imported graph for ontological coherence validation after the Fandaws Validator has approved it. This follows the standard Validator/OCE governance flow (Fandaws v3.4, Section 10.4.3): the Validator is authoritative for structural integrity; the OCE adds ontological depth in either strict or advisory mode depending on configuration.

---

# 10. Epistemic Status and Provenance

## 10.1 Imported vs. Conversational Knowledge

Fandaws knowledge graphs can contain concepts from two fundamentally different epistemic sources:

1. **Conversational concepts:** Created through the Fandaws semantic firewall — parsed by the NLParser, scope-narrowed, disambiguated, validated through dialogue, and committed by explicit user or agent action. These carry `shml:epistemicStatus: "committed"`.

2. **Imported concepts:** Bulk-loaded by the IVNE from external ontologies. These have not passed through the semantic firewall. They carry `shml:epistemicStatus: "imported"`.

This distinction is critical for downstream consumers. An FNSR service reasoning over imported concepts should know that those concepts were not negotiated through the Fandaws pipeline and may contain structural assumptions from the source ontology that have not been validated against the caller's knowledge context.

## 10.2 Provenance Annotations

Every concept produced by the IVNE carries the following provenance annotations, in addition to the standard Fandaws concept fields:

| Annotation | Type | Description |
|---|---|---|
| `shml:epistemicStatus` | enum | Always `"imported"` for IVNE-produced concepts. |
| `dcterms:source` | IRI | The URI of the source ontology file or endpoint. |
| `prov:wasDerivedFrom` | IRI | The IVNE run identifier (a unique IRI per compilation run). |
| `fandaws:importedFrom` | IRI \| null | The original OWL IRI of this concept (null for generated concepts). |
| `fandaws:ivneVersion` | string | The IVNE specification version (e.g., "2.1"). |
| `fandaws:compiledAt` | dateTime | When the IVNE compilation was performed. |

These annotations are metadata on the concept node. They do not affect the concept's position in the hierarchy, its properties, or its relationships. They are consumed by:

- **SHML** (Fandaws v3.4, Section 10.4.2): When wrapping imported concepts as assertions, SHML uses `epistemicStatus: "imported"` to frame them as external claims rather than self-generated commitments.
- **HIRI** (Fandaws v3.4, Section 10.5.3): When publishing an imported graph to IPFS, the HIRI manifest entry includes a `taintLevel` derived from the IVNE's semantic loss records.
- **IEE** (Fandaws v3.4, Section 10.5.2): When evaluating ethical implications of imported concepts, the IEE notes the `imported` status and may flag concepts whose ethical framing depends on assumptions from the source ontology that have not been independently validated.

## 10.3 IntegrationAdapter Provenance Envelope

The `IntegrationAdapter.importOntology()` wrapper adds the standard provenance envelope (Fandaws v3.4, Section 3.3.2) to the IVNE's output:

| Field | Value |
|---|---|
| `fandaws:provenance.provider` | `"ivne-v2.1"` |
| `fandaws:provenance.version` | The IVNE build version |
| `fandaws:provenance.inputHash` | SHA-256 of the source ontology file |
| `fandaws:provenance.outputHash` | SHA-256 of the output JSON-LD |
| `fandaws:provenance.retrievedAt` | When the compilation completed |
| `fandaws:provenance.fromCache` | Whether the result was served from a previous compilation cache |

---

# 11. Reduction Manifest

## 11.1 Purpose

Every IVNE compilation run produces a `ReductionManifest` — a top-level summary document that accompanies the `OntologyImportResult`. The manifest provides a complete audit trail of the compilation: what was imported, what was reduced, what was rejected, and what semantic losses were incurred. It is the IVNE's equivalent of a compiler's diagnostic output.

## 11.2 ReductionManifest Schema

| Field | Type | Description |
|---|---|---|
| @type | fandaws:ReductionManifest | Type discriminator |
| fandaws:ivneRunId | IRI | Unique identifier for this compilation run |
| fandaws:ivneVersion | string | IVNE specification version |
| fandaws:sourceOntology | IRI | Source ontology URI |
| fandaws:sourceHash | string | SHA-256 of the source ontology file |
| fandaws:compiledAt | dateTime | Compilation timestamp |
| fandaws:statistics | ManifestStatistics | Quantitative summary (see below) |
| fandaws:lossRecords | SemanticLossRecord[] | All semantic loss records generated during compilation |
| fandaws:rejectedAxioms | RejectedAxiom[] | Axioms rejected by the IVNE Pre-Filter |
| fandaws:validationFailures | ValidationRejection[] | Concepts rejected by the Fandaws Validator (Stage 2) |
| fandaws:iriMappings | IRIMapping[] | Complete mapping from source OWL IRIs to Fandaws IRIs |
| fandaws:generatedConcepts | IRI[] | All hash-based IRIs created by flattening/lifting |
| fandaws:configUsed | IVNEConfiguration | The configuration parameters used for this run |
| fandaws:chainConsumptionReady | boolean | `true` only when the configured FNSR and OCE versions support `owl:propertyChainAxiom` ingestion. When `false`, property chains in the output graph are retained for provenance and future-proofing but are not actively consumed by any downstream service. See Section 3.3, P7 Consumer Obligation. |

**ManifestStatistics:**

| Field | Type | Description |
|---|---|---|
| fandaws:totalSourceAxioms | integer | Number of axioms in the source ontology |
| fandaws:totalCompiledConcepts | integer | Number of concepts in the output graph |
| fandaws:totalGeneratedConcepts | integer | Number of hash-based (generated) concepts |
| fandaws:totalProperties | integer | Number of properties in the output graph |
| fandaws:totalRelationships | integer | Number of relationships in the output graph |
| fandaws:totalPropertyChains | integer | Number of property chains compiled (P7). If `chainConsumptionReady` is false, these are retained but not actively consumed. |
| fandaws:totalLossRecords | integer | Number of semantic loss records |
| fandaws:lossByType | object | Count of loss records per `lossType` |
| fandaws:lossBySeverity | object | Count of loss records per `severity` |
| fandaws:totalRejected | integer | Number of axioms rejected (Pre-Filter + Validator) |
| fandaws:compilationDurationMs | integer | Wall-clock compilation time in milliseconds |
| fandaws:fidelityScore | float [0,1] | Ratio of informational-severity losses to total losses. A score of 1.0 means all transformations were semantically lossless. A score of 0.0 means every transformation was lossy. |

The `fidelityScore` provides a single-number summary of import quality. It is not a deep semantic measure — it is a quick heuristic for the OrchestrationAdapter and curator review workflow (Fandaws v3.4, Section 5.13.2) to triage which imports need the most attention.

---

# 12. Ecosystem Integration

## 12.1 FNSR Consumption of Imported Graphs

When an FNSR service (Fandaws v3.4, Section 10.5.1) ingests a knowledge graph containing IVNE-imported concepts, it must process the `SemanticLossRecord` annotations to adjust its reasoning:

| FNSR Service | Loss-Aware Behavior |
|---|---|
| **MDRE** (Multi-Domain Reasoning Engine) | Subsumption chains are reliable (P1 is lossless). MDRE's deductive reasoning is unaffected by most IVNE reductions. Exception: if a union-flattened concept appears in a syllogistic premise, MDRE should flag the conclusion as `approximate`. |
| **DES** (Defeasible Expectation Service) | Defeasible expectations derived from concepts with `unionGeneralization` loss records are suppressed or flagged as `Weak/Generic`. Expectations from `intersectionFlattening` are safe (necessary conditions are preserved). |
| **CSS** (Counterfactual Simulation Service) | When modifying a concept with a `cardinalityDowngrade`, CSS should consult the `fandaws:CardinalityConstraint` for the original constraint. When simulating membership changes for union-flattened concepts, CSS should consult `fandaws:disjuncts` for the original disjunct list. |
| **APS** (Analogical Precedent Service) | Structural similarity calculations should reduce the weight of hierarchy paths that pass through generated concepts (`fandaws:gen/*` IRIs) or concepts with `lossy` severity loss records. |
| **AES** (Abductive Elicitation Service) | When detecting knowledge gaps in imported subgraphs, AES should check loss records before generating hypotheses. A missing property might not be a gap — it might be a `complementDrop` or `enumerationDrop` that was intentionally excluded. |

## 12.2 IEE Consumption of Imported Graphs

The IEE (Fandaws v3.4, Section 10.5.2) evaluates imported concepts with awareness that their epistemic status is weaker than conversational concepts:

- If an ethical evaluation depends on a concept's classification (e.g., "Is this entity a person?"), and that classification passes through a union-flattened node, the IEE should note in its evaluation report that the classification is an approximation.
- If an ethical evaluation depends on a cardinality constraint (e.g., "A family requires at least 2 members"), the IEE should consult the `fandaws:CardinalityConstraint` rather than relying on the existential-only logical representation.
- Ethical Contestation Flags (Fandaws v3.4, Section 10.5.2) may be raised against imported concepts, but the IEE should set severity to `advisory` rather than `blocking` for imported concepts, since blocking would prevent any use of the imported ontology until human review.

## 12.3 OCE Consumption of Imported Graphs

The OCE (Fandaws v3.4, Section 10.4.3) consumes the `OCEConstraintExport` contract. When the export is derived from an IVNE-imported graph:

- Disjointness axioms (P3) are reliable and can be used for full ontological coherence checking.
- Subsumption axioms (P1) are reliable.
- Cardinality constraints should be read from `fandaws:CardinalityConstraint` properties, not from the existential-only logical layer.
- Property chains (P7) with `chainComplexityFlag` should be evaluated with reduced confidence.
- Constraints derived from union-flattened concepts should be treated as advisory regardless of the `fandaws:oceMode` configuration setting.

## 12.4 HIRI Taint Level Derivation

When an imported graph is published to IPFS via the HIRI protocol (Fandaws v3.4, Section 10.5.3), the `hiri:taintLevel` on the manifest entry is derived from the IVNE's `ReductionManifest`:

| Fidelity Score Range | HIRI Taint Level | Interpretation |
|---|---|---|
| 0.95 – 1.00 | L0 | Near-lossless import. Reasoning is fully trustworthy. |
| 0.80 – 0.94 | L1 | Minor losses (informational + some degraded). Reasoning is reliable with caveats. |
| 0.50 – 0.79 | L2 | Significant losses. Downstream consumers should check loss records for relevant concepts. |
| 0.20 – 0.49 | L3 | Heavy losses. Graph is useful for reference but not for automated reasoning. |
| 0.00 – 0.19 | L4 | Severely reduced. Most semantic content was discarded. Manual curation required. |

---

# 13. Configuration

The IVNE is configured via a JSON-LD `IVNEConfiguration` document passed to the `compile` method. All parameters have defaults consistent with the Fandaws v3.4 configuration model (Section 11.1).

| Parameter | Type | Default | Description |
|---|---|---|---|
| `ivne:locale` | string | `"en"` | BCP 47 language tag for Identity Simplification during label extraction. Inherits from `fandaws:locale`. |
| `ivne:abbreviationTable` | object | `{}` | Domain-specific abbreviation expansions. Inherits from `fandaws:abbreviationTable`. |
| `ivne:labelExtractionPriority` | string[] | `["rdfs:label", "skos:prefLabel", "uriFragment"]` | Priority order for label extraction (Section 5.2). |
| `ivne:hashPrefixLength` | integer | `12` | Number of hex characters for generated concept IRI prefixes (Section 5.3). |
| `ivne:chainComplexityThreshold` | integer | `3` | Property chain hop count above which a `chainComplexityFlag` is emitted. Chains are never rejected. |
| `ivne:defaultTrustLevel` | enum | `"experimental"` | Trust level assigned to the imported scope entry. |
| `ivne:defaultStaleCopyAction` | enum | `"fork"` | Stale copy action assigned to the imported scope entry. `"fork"` is the default because upstream OWL ontologies may refactor without notice. |
| `ivne:importRoots` | IRI[] \| null | `null` | If non-null, only the subtrees rooted at these classes are imported. The rest of the ontology is ignored. This enables selective import of specific domains from large ontologies. |
| `ivne:excludePatterns` | string[] | `[]` | IRI patterns (regex) to exclude from import. Useful for filtering out ontology-internal bookkeeping classes. |
| `ivne:bfoAlignmentMode` | enum | `"auto"` | How to handle BFO alignment for imported concepts. `"auto"`: use existing BFO annotations in the source ontology, fall back to heuristic. `"preserve"`: only use explicit BFO annotations from the source. `"disabled"`: no BFO alignment during import. |
| `ivne:maxConcepts` | integer | `50000` | Safety limit on the number of concepts in a single import run. Imports exceeding this limit are rejected with an error. Prevents runaway memory consumption on large ontologies. |
| `ivne:fnsrChainSupport` | boolean | `false` | Whether the configured FNSR deployment supports `owl:propertyChainAxiom` ingestion. When `false`, `chainConsumptionReady` on the ReductionManifest is set to `false`. Set to `true` only after the FNSR specification has been updated to consume property chain annotations (see Section 3.3, P7 Consumer Obligation). |
| `ivne:oceChainSupport` | boolean | `false` | Whether the configured OCE deployment supports property chain materialization. Independent of `fnsrChainSupport` — either or both may be enabled. `chainConsumptionReady` is `true` when at least one of these flags is `true`. |

---

# 14. OntologyImportResult Contract

The IVNE's output conforms to the `OntologyImportResult` contract defined in Fandaws v3.4 (Section 10.3.3), extended with IVNE-specific fields.

## 14.1 Extended OntologyImportResult Schema

| Field | Type | Description |
|---|---|---|
| @type | fandaws:OntologyImportResult | Type discriminator |
| fandaws:sourceIRI | IRI | Origin of the imported ontology |
| fandaws:concepts | Concept[] | Extracted concepts mapped to Fandaws schema, with IVNE provenance annotations |
| fandaws:relationships | Relationship[] | Extracted relationships |
| fandaws:unmappedEntities | UnmappedEntity[] | Entities that could not be cleanly mapped to Fandaws types, including Validator rejections |
| fandaws:importMethod | enum | `"owl"`, `"rdf"`, `"turtle"`, `"owl-functional"` |
| fandaws:reductionManifest | ReductionManifest | The complete compilation audit trail (Section 11) |
| fandaws:cardinalityConstraints | CardinalityConstraint[] | All cardinality constraints extracted from the source, as structured properties |
| fandaws:semanticLossRecords | SemanticLossRecord[] | All loss records, duplicated here for top-level access (also attached to individual concepts) |
| fandaws:scopeEntry | ScopeEntry | A pre-configured ScopeEntry for the imported graph, ready to be added to a ScopeConfiguration |

## 14.2 Pre-Configured ScopeEntry

The IVNE pre-populates a `ScopeEntry` (Fandaws v3.4, Section 4.2.8) for the imported graph:

```json
{
  "fandaws:graphId": "fandaws:graph/import-{sourceHash_prefix}",
  "fandaws:label": "Imported: {sourceOntologyLabel} v{version}",
  "fandaws:ipfsCid": null,
  "fandaws:priority": 99,
  "fandaws:trustLevel": "experimental",
  "fandaws:staleCopyAction": "fork"
}
```

The `fandaws:ipfsCid` is null at compile time. The `OrchestrationAdapter` fills it in after publishing to IPFS. The `priority: 99` ensures the imported graph is searched last in the global federation, below any manually curated scopes. The `trustLevel: "experimental"` and `staleCopyAction: "fork"` defaults can be overridden by the `IVNEConfiguration`.

---

# 15. Testing Strategy

## 15.1 Unit Testing

Each IVNE phase (Flattening, Restriction Lifting, Normalization) is tested in isolation:

- **Flattening tests:** Provide OWL class expressions as JSON-LD input. Assert that the output contains the expected named concepts, subsumption axioms, and `SemanticLossRecord` annotations.
- **Restriction Lifting tests:** Provide a flattened graph with anonymous restrictions. Assert that restrictions are either inlined (re-folded) or named according to the Safe Re-folding Rule (Section 7.2).
- **Normalization tests:** Provide two semantically equivalent but syntactically different OWL inputs (e.g., `(A and B)` vs `(B and A)`). Assert that both produce byte-identical output.

## 15.2 Determinism Testing

The determinism test harness (Section 8.3) runs as part of every CI build. It compiles a reference ontology suite covering all PAB forms and loss types, verifying SHA-256 reproducibility.

## 15.3 Round-Trip Testing

For each PAB form, a round-trip test verifies that:

1. An OWL axiom is compiled by the IVNE into a Fandaws concept.
2. The concept is exported back to OWL via the ExportEngine (Fandaws v3.4, Section 3.2.6).
3. The exported OWL axiom is semantically equivalent to the original for lossless forms (P1, P2, P3, P4, P5, P6), or is a valid weakening for lossy forms (P7, P8, unions, intersections).

Round-trip testing validates that the IVNE's reductions are correctly reflected in the ExportEngine's output — ensuring that downstream consumers who receive an OWL export of an imported graph are not misled about the graph's semantic content.

## 15.4 Integration Testing with Fandaws Validator

Integration tests verify that the IVNE's output passes the standard Fandaws Validator:

- Import a well-formed OWL ontology. Assert zero Validator rejections.
- Import an OWL ontology with circular hierarchies. Assert the IVNE's cycle detector fires during flattening and that the Validator does not encounter cycles in the output.
- Import an OWL ontology with root concepts. Assert that `fandaws:allowRoot: true` is set and structural grounding passes.

## 15.5 Reference Ontology Suite

The IVNE ships with a reference ontology suite for testing:

| Ontology | Size | Purpose |
|---|---|---|
| `test-pab-basic.owl` | ~50 axioms | Covers all 8 PAB forms with simple examples |
| `test-unions.owl` | ~30 axioms | Exercises union flattening with nested and multi-disjunct unions |
| `test-cardinality.owl` | ~40 axioms | Exercises all cardinality forms (min, max, exact, qualified, unqualified) |
| `test-cycles.owl` | ~20 axioms | Contains deliberate circular references for cycle detector testing |
| `test-large.owl` | ~5000 axioms | Performance benchmark for compilation time against M2M latency targets |
| `test-bfo-aligned.owl` | ~200 axioms | BFO-aligned ontology for testing BFO annotation preservation |

---

# 16. Performance Targets

The IVNE's compilation time is not subject to the per-utterance latency targets in Fandaws v3.4 (Section 10.8.4) because ontology import is a batch operation, not an interactive one. However, the IVNE should complete in reasonable time to support M2M workflows where agents import ontologies programmatically.

| Metric | Target | Notes |
|---|---|---|
| Compilation throughput | ≥ 500 axioms/second | For in-memory OWL parse trees on a modern browser or Node.js runtime |
| Memory overhead | ≤ 2x source ontology size | The output graph plus intermediate data structures should not exceed twice the source file's parsed size |
| Maximum compilation time | ≤ 60 seconds | For ontologies up to the `ivne:maxConcepts` limit (50,000 concepts). Larger imports should be chunked. |

---

# 17. Glossary

| Term | Definition |
|---|---|
| Anonymous Concept | An OWL class expression that has no explicit name (IRI) in the source ontology. Generated by intersection, union, or restriction expressions. The IVNE assigns these hash-based IRIs. |
| Dual Representation | The P8 compilation strategy where cardinality constraints are stored both as an existential property (for KnowledgeEngine compatibility) and as a structured `CardinalityConstraint` (for OCE/IEE consumption). |
| Fandaws Fragment | The subset of OWL 2 DL that can be represented in the Fandaws data model. Defined by the eight Primitive Axiom Basis forms. |
| Fidelity Score | A ratio [0,1] summarizing the semantic quality of an IVNE import. 1.0 = all transformations were lossless. 0.0 = all transformations were lossy. |
| IVNE Pre-Filter | The first validation stage that runs during IVNE compilation, rejecting or downgrading axioms that cannot be represented in the Fandaws Fragment. |
| Monotonic Structural Reduction | The IVNE's compilation model: incoming OWL axioms are reduced to simpler forms while preserving necessary conditions. The reduction is monotonic (it only adds or preserves subsumption relationships, never removes them). |
| Primitive Axiom Basis (PAB) | The eight atomic axiom forms (P1–P8) into which all OWL axioms are compiled. |
| Reduction Manifest | A compilation-run-level audit document summarizing all semantic losses, rejections, IRI mappings, and statistics. |
| Restriction Lifting | The τ_R phase that reifies anonymous OWL restrictions into named or inline Fandaws nodes. |
| Safe Re-folding | The rule governing when a generated restriction node can be dissolved inline into its parent concept's property list. |
| Semantic Loss Record | A machine-readable metadata annotation documenting a specific semantic loss during IVNE compilation. Consumed by FNSR, OCE, IEE, and SHML for loss-aware reasoning. |
| Chain Consumption Ready | A boolean flag on the ReductionManifest indicating whether at least one downstream consumer (FNSR or OCE) is configured to actively consume `owl:propertyChainAxiom` annotations. When `false`, property chains are retained for provenance but are not actively reasoned over. |
| Consistency Invariant | The set of rules enforced on `CardinalityConstraint` records to prevent inconsistent min/max/exact values from reaching the OCE. Violation is an `IVNEInternalError`. |
| Consumer Obligation | The principle that IVNE annotations (property chains, complexity warnings) are only useful if downstream specifications are updated to consume them. The IVNE documents obligations; consuming systems must implement them. |

---

# 18. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.one | Feb 2026 | Aaron Damiano | Initial IVNE specification. Standalone engine, not integrated with Fandaws architecture. |
| 2.0 | Feb 2026 | Aaron Damiano | Complete rewrite integrating with Fandaws v3.4 architecture. Mapped to `IntegrationAdapter.importOntology()`. Added Semantic Loss Tracking with machine-readable loss records and downstream impact guidance. Unified IRI generation with Fandaws label-based model. Dual representation for cardinality constraints. Removed arbitrary property chain hop rejection. Two-stage validation alignment (IVNE Pre-Filter + Fandaws Validator). Scope destination as read-only experimental global scope. Epistemic status distinction (`imported` vs `committed`). Reduction Manifest for compilation audit. Full ecosystem integration guidance for FNSR, IEE, OCE, HIRI. Configuration model. Testing strategy with reference ontology suite. Performance targets. |
| 2.1 | Feb 2026 | Aaron Damiano | Final hardening from architectural review. IRI collision handling expanded to check against global scope federation, not just current import batch, preventing semantic conflation across independent imports (Section 5.3). Property chain Consumer Obligation added to P7: FNSR/OCE specifications must be updated to consume `owl:propertyChainAxiom` before chains are actively useful; `chainConsumptionReady` flag added to ReductionManifest (Section 11.2) and gated by new `ivne:fnsrChainSupport` / `ivne:oceChainSupport` configuration parameters (Section 13). CardinalityConstraint Consistency Invariant added to Section 3.4: enforces `exact=min=max` when `exactCardinality` is present, `min ≤ max`, `min ≥ 0`, `max ≥ 1`, preventing inconsistent records from reaching the OCE. Added `totalPropertyChains` to ManifestStatistics. Status promoted to FINAL. |

---

# Appendix A: Canonical JSON-LD Examples

## A.1 IVNEConfiguration

```json
{
  "@type": "ivne:Configuration",
  "ivne:locale": "en",
  "ivne:abbreviationTable": {},
  "ivne:labelExtractionPriority": ["rdfs:label", "skos:prefLabel", "uriFragment"],
  "ivne:hashPrefixLength": 12,
  "ivne:chainComplexityThreshold": 3,
  "ivne:defaultTrustLevel": "experimental",
  "ivne:defaultStaleCopyAction": "fork",
  "ivne:importRoots": null,
  "ivne:excludePatterns": [],
  "ivne:bfoAlignmentMode": "auto",
  "ivne:maxConcepts": 50000
}
```

## A.2 Imported Concept (Named, with Provenance)

```json
{
  "@id": "fandaws:concept/nucleus",
  "@type": "fandaws:Concept",
  "fandaws:displayLabel": "Nucleus",
  "fandaws:canonicalLabel": "nucleus",
  "fandaws:parent": "fandaws:concept/organelle",
  "fandaws:children": [],
  "fandaws:properties": ["fandaws:property/nucleus-has-membrane"],
  "fandaws:bfoMapping": "bfo:0000040",
  "fandaws:depth": 4,
  "fandaws:createdAt": "2026-02-15T10:00:00Z",
  "fandaws:mergedFrom": [],
  "fandaws:allowRoot": false,
  "shml:epistemicStatus": "imported",
  "dcterms:source": "http://purl.obolibrary.org/obo/go.owl",
  "prov:wasDerivedFrom": "fandaws:ivne-run/run-20260215-001",
  "fandaws:importedFrom": "obo:GO_0005634",
  "fandaws:ivneVersion": "2.1",
  "fandaws:compiledAt": "2026-02-15T10:00:00Z",
  "owl:sameAs": "obo:GO_0005634"
}
```

## A.3 Generated Concept (Union Flattening, with Loss Record)

```json
{
  "@id": "fandaws:gen/a7ffc6f8bf1e",
  "@type": "fandaws:Concept",
  "fandaws:displayLabel": "Union(Alcoholic Beverage, Non-Alcoholic Beverage)",
  "fandaws:canonicalLabel": "union_a7ffc6f8bf1e",
  "fandaws:parent": null,
  "fandaws:children": [
    "fandaws:concept/alcoholic_beverage",
    "fandaws:concept/non_alcoholic_beverage"
  ],
  "fandaws:properties": [],
  "fandaws:depth": 0,
  "fandaws:createdAt": "2026-02-15T10:00:00Z",
  "fandaws:allowRoot": true,
  "fandaws:generatedFrom": "union(alcoholic_beverage, non_alcoholic_beverage)",
  "fandaws:disjuncts": [
    "fandaws:concept/alcoholic_beverage",
    "fandaws:concept/non_alcoholic_beverage"
  ],
  "shml:epistemicStatus": "imported",
  "dcterms:source": "http://example.org/beverages.owl",
  "prov:wasDerivedFrom": "fandaws:ivne-run/run-20260215-001",
  "fandaws:importedFrom": null,
  "fandaws:ivneVersion": "2.1",
  "fandaws:semanticLoss": [
    {
      "@type": "fandaws:SemanticLossRecord",
      "fandaws:lossType": "unionGeneralization",
      "fandaws:severity": "lossy",
      "fandaws:affectedConcepts": [
        "fandaws:concept/beverage",
        "fandaws:gen/a7ffc6f8bf1e"
      ],
      "fandaws:sourceAxiom": "Beverage SubClassOf (AlcoholicBeverage or NonAlcoholicBeverage)",
      "fandaws:compiledForm": "Beverage SubClassOf gen/a7ffc6f8bf1e; AlcoholicBeverage SubClassOf gen/a7ffc6f8bf1e; NonAlcoholicBeverage SubClassOf gen/a7ffc6f8bf1e",
      "fandaws:lostSemantics": "The constraint that every Beverage must be either an AlcoholicBeverage or a NonAlcoholicBeverage is lost. Fandaws permits Beverage instances that are generic gen/a7ffc6f8bf1e without further classification.",
      "fandaws:downstreamImpact": {
        "fnsr": {
          "des": "suppress",
          "css": "flagAsApproximate",
          "aps": "reduceStructuralSimilarityWeight",
          "mdre": "noImpact"
        },
        "oce": "advisoryOnly",
        "iee": "flagAsWeaklyGrounded",
        "shml": "markProvisional"
      },
      "fandaws:sourceOntology": "http://example.org/beverages.owl",
      "fandaws:ivneRunId": "fandaws:ivne-run/run-20260215-001"
    }
  ]
}
```

## A.4 CardinalityConstraint Example

```json
{
  "@id": "fandaws:concept/car",
  "@type": "fandaws:Concept",
  "fandaws:displayLabel": "Car",
  "fandaws:canonicalLabel": "car",
  "fandaws:parent": "fandaws:concept/vehicle",
  "fandaws:properties": [
    "fandaws:property/car-has-wheel"
  ],
  "fandaws:cardinalityConstraints": [
    {
      "@type": "fandaws:CardinalityConstraint",
      "fandaws:property": "fandaws:concept/has_wheel",
      "fandaws:constrainedClass": "fandaws:concept/car",
      "fandaws:minCardinality": 4,
      "fandaws:maxCardinality": 4,
      "fandaws:exactCardinality": 4,
      "fandaws:qualifiedOver": "fandaws:concept/wheel",
      "fandaws:sourceAxiom": "Car SubClassOf (has_wheel exactly 4 Wheel)",
      "fandaws:reductionNote": "Existential component (has_wheel some Wheel) compiled as P5. Full cardinality preserved for OCE state-transition validation."
    }
  ],
  "fandaws:semanticLoss": [
    {
      "@type": "fandaws:SemanticLossRecord",
      "fandaws:lossType": "cardinalityDowngrade",
      "fandaws:severity": "degraded",
      "fandaws:affectedConcepts": ["fandaws:concept/car"],
      "fandaws:sourceAxiom": "Car SubClassOf (has_wheel exactly 4 Wheel)",
      "fandaws:compiledForm": "Car has property has_wheel (existential: some Wheel); CardinalityConstraint(exact=4, qualified=Wheel) stored as structured hint",
      "fandaws:lostSemantics": "The KnowledgeEngine does not enforce that Car has exactly 4 Wheels. The existential layer only guarantees at least one Wheel. The full constraint is preserved in fandaws:CardinalityConstraint for OCE/IEE consumption.",
      "fandaws:downstreamImpact": {
        "fnsr": {
          "des": "useCardinalityConstraint",
          "css": "useCardinalityConstraint",
          "aps": "noImpact",
          "mdre": "noImpact"
        },
        "oce": "useCardinalityConstraint",
        "iee": "useCardinalityConstraint",
        "shml": "noImpact"
      },
      "fandaws:sourceOntology": "http://example.org/vehicles.owl",
      "fandaws:ivneRunId": "fandaws:ivne-run/run-20260215-001"
    }
  ],
  "shml:epistemicStatus": "imported",
  "dcterms:source": "http://example.org/vehicles.owl",
  "prov:wasDerivedFrom": "fandaws:ivne-run/run-20260215-001",
  "fandaws:importedFrom": "ex:Vehicle#Car",
  "fandaws:ivneVersion": "2.1"
}
```

## A.5 ReductionManifest Example

```json
{
  "@type": "fandaws:ReductionManifest",
  "fandaws:ivneRunId": "fandaws:ivne-run/run-20260215-001",
  "fandaws:ivneVersion": "2.1",
  "fandaws:sourceOntology": "http://example.org/beverages.owl",
  "fandaws:sourceHash": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "fandaws:compiledAt": "2026-02-15T10:00:00Z",
  "fandaws:statistics": {
    "fandaws:totalSourceAxioms": 150,
    "fandaws:totalCompiledConcepts": 87,
    "fandaws:totalGeneratedConcepts": 12,
    "fandaws:totalProperties": 45,
    "fandaws:totalRelationships": 23,
    "fandaws:totalPropertyChains": 2,
    "fandaws:totalLossRecords": 8,
    "fandaws:lossByType": {
      "unionGeneralization": 3,
      "cardinalityDowngrade": 4,
      "intersectionFlattening": 1
    },
    "fandaws:lossBySeverity": {
      "informational": 1,
      "degraded": 4,
      "lossy": 3
    },
    "fandaws:totalRejected": 2,
    "fandaws:compilationDurationMs": 340,
    "fandaws:fidelityScore": 0.73
  },
  "fandaws:lossRecords": ["..."],
  "fandaws:rejectedAxioms": [
    {
      "fandaws:axiom": "Beverage EquivalentTo {Water, Juice, Soda, Beer, Wine}",
      "fandaws:reason": "enumerationDrop",
      "fandaws:severity": "lossy"
    },
    {
      "fandaws:axiom": "(not Alcoholic) SubClassOf SafeForChildren",
      "fandaws:reason": "complementDrop",
      "fandaws:severity": "lossy"
    }
  ],
  "fandaws:validationFailures": [],
  "fandaws:iriMappings": [
    {
      "fandaws:sourceIRI": "ex:Beverages#Nucleus",
      "fandaws:fandawsIRI": "fandaws:concept/nucleus",
      "fandaws:method": "labelBased"
    }
  ],
  "fandaws:generatedConcepts": [
    "fandaws:gen/a7ffc6f8bf1e"
  ],
  "fandaws:chainConsumptionReady": false,
  "fandaws:configUsed": {
    "ivne:locale": "en",
    "ivne:chainComplexityThreshold": 3,
    "ivne:defaultTrustLevel": "experimental",
    "ivne:maxConcepts": 50000,
    "ivne:fnsrChainSupport": false,
    "ivne:oceChainSupport": false
  }
}
```

## A.6 Pre-Configured ScopeEntry

```json
{
  "fandaws:graphId": "fandaws:graph/import-9f86d081",
  "fandaws:label": "Imported: Beverages Ontology v1.0",
  "fandaws:ipfsCid": null,
  "fandaws:priority": 99,
  "fandaws:trustLevel": "experimental",
  "fandaws:staleCopyAction": "fork"
}
```

## A.7 Property Chain with Complexity Warning

```json
{
  "@id": "fandaws:concept/has_ancestor",
  "@type": "fandaws:Relationship",
  "fandaws:verb": "has ancestor",
  "fandaws:displayLabel": "has ancestor",
  "fandaws:canonicalLabel": "has ancestor",
  "owl:propertyChainAxiom": [
    "fandaws:concept/has_parent",
    "fandaws:concept/has_parent",
    "fandaws:concept/has_parent",
    "fandaws:concept/has_parent"
  ],
  "fandaws:complexityWarning": {
    "fandaws:chainLength": 4,
    "fandaws:threshold": 3,
    "fandaws:note": "Property chain exceeds complexity threshold. Chain is retained for reference but not materialized by the Fandaws Core. Downstream consumers (FNSR rule engine, OCE) may materialize if supported."
  },
  "fandaws:semanticLoss": [
    {
      "@type": "fandaws:SemanticLossRecord",
      "fandaws:lossType": "chainComplexityFlag",
      "fandaws:severity": "degraded",
      "fandaws:sourceAxiom": "has_parent o has_parent o has_parent o has_parent -> has_ancestor",
      "fandaws:compiledForm": "Stored as owl:propertyChainAxiom annotation; not materialized at runtime",
      "fandaws:lostSemantics": "The chain is not materialized by the Fandaws KnowledgeEngine. Transitive closure must be computed by downstream consumers if needed.",
      "fandaws:downstreamImpact": {
        "fnsr": {
          "des": "noImpact",
          "css": "noImpact",
          "aps": "noImpact",
          "mdre": "materializeIfNeeded"
        },
        "oce": "advisoryOnly",
        "iee": "noImpact",
        "shml": "noImpact"
      }
    }
  ],
  "shml:epistemicStatus": "imported",
  "fandaws:importedFrom": "ex:Genealogy#has_ancestor"
}
```
