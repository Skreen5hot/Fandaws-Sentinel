# FANDAWS v2.1 Relational Architectural Specification
**Core Subsystem: Epistemological Ingestion, Relation Normalization, and Ontological Compilation**

> **Revision Summary — v2.0 → v2.1**
> This is a targeted patch revision addressing one substantive gap and two clarifying
> additions identified in architectural review of v2.0. All v2.0 content is carried
> forward unchanged.
>
> **GAP-CLOSE — BFO Disjointness Map Content Source (Section 3.8.3):**
> The BFO Disjointness Map now has a formally specified content source and computation
> method. The map contains all BFO node pairs that are disjoint either by explicit
> `owl:disjointWith` declaration in the active BFO version OR by inheritance through
> declared disjoint ancestors (inferred disjointness via transitive closure). Inferred
> disjointness is essential: `bfo:MaterialEntity` and `bfo:Process` are not explicitly
> declared disjoint — they are disjoint by inheritance through `bfo:Continuant` and
> `bfo:Occurrent`, which are explicitly declared disjoint. A map containing only
> explicitly declared pairs would miss the most common violation the conversational
> check is designed to catch. The map is computed at startup by traversing the ingested
> BFO hierarchy and propagating declared `owl:disjointWith` axioms downward through
> `rdfs:subClassOf` chains. Rule CC-4 added.
>
> **CLARIFYING — Mereological RECC Scope Note (Section 5.6.2):**
> The `has_part` mereological relation type class example is explicitly scoped to
> material mereology. Its RECC restrictions require both the `bfo:specifically_depends_on`
> target and `fan:towards` target to be `fan:materialEntity`. Temporal mereology
> (temporal interval as part of temporal region) and spatial mereology require separate
> relation type classes with different RECC restrictions. The per-type-class RECC
> pattern accommodates this by design.
>
> **CLARIFYING — Infrastructure Classes as Implementation Documentation (Section 5.10):**
> `fandaws:BFODisjointnessMap` and `fandaws:RelationDomainRangeIndex` are declared as
> OWL classes for implementation documentation purposes only. They are not part of the
> active ontological model. A reasoner consuming an exported FANDAWS graph will see
> them as empty class declarations with no instances — this is correct and harmless.
> Implementers should not expect to instantiate or query these classes via OWL reasoning.
> They are runtime data structures documented in the vocabulary namespace for
> discoverability, not ontological commitments.

---

## v2.0 Changes (Carried Forward)

> **BREAKING — BFO Placement Redesign (Sections 3.2, 3.7, 5.1):**
> `fan:RelationalQuality` base class raised from `bfo:Quality` to
> `bfo:SpecificallyDependentContinuant`. Individual relation type classes specialize
> downward per Section 3.3. BFO conformance argument in Section 3.7.
>
> **BREAKING — `bfo:inheres_in` Scope Restriction:**
> Valid only on relation type classes additionally declaring `bfo:Quality`. Using it
> on mereological or deontic relation types is a normalizer error.
>
> **ADDITIVE — Conversational Consistency Check (Section 3.8):** Two-path lightweight
> pre-commit consistency check. Path A on reclassification. Path B on new assertion.
> Machine-first/human-validate. Map lookups, not Prolog. Rules CC-1, CC-2, CC-3.
>
> **ADDITIVE — Edge-Canonical Implementation Note (Section 2.3):** Named graphs are
> the specification idiom. In-memory equivalents satisfy the same invariants.
>
> **ADDITIVE — Epoch Counter Posture (Section 2.4.3):** Implement the integer now;
> defer the stale detection machinery.
>
> **ADDITIVE — Implementation Roadmap (Section 12):** Three-phase path from
> Fandaws-Sentinel v0.x to Fandaws v2.x.

---

## 1. Executive Summary

FANDAWS is a machine-to-machine reasoning engine and ontological compiler. Its primary
function is the ingestion of human heuristics, normalization of heterogeneous and messy
external logic, and compilation of that input into pristine, computable knowledge suitable
for automated reasoning.

The human-facing UI is a diagnostic and inspection harness. It supports review, validation,
and correction, but it is not the system's conceptual center. The center is a compilation
pipeline that transforms untrusted source knowledge into canonical internal relational
structures and then into executable logical artifacts.

FANDAWS uses a dual representation architecture:

- **Canonical IR / Audit Lane:** relations and classes are reified as first-class nodes for
  metadata, provenance, explanation, and governance.
- **Execution Lane:** the compiler generates computable OWL-facing artifacts and derived
  edges for efficient reasoning.

FANDAWS operates a **two-tier enforcement architecture**:

- **Tier 1 — Normalizer Enforcement:** Programmatic checks run by the FANDAWS normalizer
  during ingestion. Behavior is normalizer-dependent.
- **Tier 2 — Reasoner-Enforced Canonical Constraints (RECC):** OWL class restrictions
  declared on relation type classes. Enforceable by any conformant OWL reasoner, with or
  without the FANDAWS normalizer running. Constraints travel with the ontology.

The system is designed to be architecturally honest: it makes its reasoning explicit, its
errors recoverable, its derivations traceable, its compiled output invalidatable without
data loss, and its provenance authority enforceable at the ontology level — including in
exported graphs consumed by third-party reasoners with no FANDAWS infrastructure present.

---

## 2. Core Architectural Principles

### 2.1 Progressive Formalization

All imported or human-authored knowledge enters FANDAWS through a staged progression:

1. **Heuristic Stage:** Assertions are captured as provisional, weakly committal statements.
2. **Normalized Stage:** Heuristic material is translated into canonical forms. Relation
   instances, class placements, structural roles, and characteristics are made explicit in
   the Audit Lane. The normalizer applies Tier 1 enforcement checks and the conversational
   consistency check (Section 3.8) where applicable.
3. **Compiled Stage:** The compiler emits execution artifacts into the Execution Lane,
   including OWL object properties, property characteristics, subclass restrictions, and
   materialized derived edges, each carrying traceable provenance.

### 2.2 Source Trust Model

FANDAWS treats all imported ontologies and external axioms as untrusted until normalized.
Source trust enforcement operates on two independent layers:

**Tier 2 (Primary) — RECC Provenance Authority:**
Relation type classes exclusively authored by a single authoritative system declare this
as an OWL class restriction using `fan:isSourceOf` (Section 5.7). Any instance lacking
the required provenance triple is non-conformant to any OWL reasoner without a normalizer
pass.

**Tier 1 (Secondary) — Normalizer Quarantine:**
The normalizer applies source trust checks during ingestion. Non-conformant axioms are
quarantined into `fandaws:SourceAxiomGraph` (Section 10).

The relationship between layers: **RECC enforces the ontological contract; the normalizer
enforces the ingestion contract.** Both must pass for a canonical record to reach
`fandaws:Normalized` status.

#### 2.2.1 Ingestion Staging

Before normalization, the normalizer writes a `fandaws:CandidateRelation` or
`fandaws:CandidateClass` staging record to `fandaws:SourceAxiomGraph` for every external
assertion under evaluation. Staging records are not yet part of the active canonical model.
See Section 10.1 for the enumeration of record types.

### 2.3 Dual Representation

FANDAWS represents relations in two coordinated forms:

- **Reified relational nodes** for audit, metadata, explanation, provenance, and correction
  (Canonical Lane).
- **Derived executable edges** for reasoning speed and compatibility (Execution Lane).

The two lanes are always coherent or flagged as incoherent. There is no silent drift.

**Edge-Canonical Implementation Note:** Named graphs are the specification idiom for
expressing lane separation and provenance carriage in this document. Edge-canonical
implementations — browser-based, zero-infrastructure deployments — achieve the same
invariants using equivalent in-memory structures. A JavaScript `Map` keyed by epoch with
provenance metadata satisfies the same guarantee as a named graph in a quad store. A
compiler pass function satisfies the same guarantee as a SPARQL materialization query. The
invariants this spec mandates are implementation-agnostic. The mechanism is not prescribed.
Any implementation that preserves the invariants while satisfying the Edge-Canonical First
Principle is compliant.

### 2.4 Compiler Sovereignty and Re-Entrancy Contract

The compiler is the source of truth for all generated reasoning-layer artifacts.

- Tier 1 metadata flags are authoritative only at the Canonical Lane.
- OWL property characteristics are emitted only by the compiler (Rule CS-1).
- `rdfs:subPropertyOf` declarations on Execution Lane properties are emitted only by the
  compiler (Rule CS-5).
- Tier 2 RECC restrictions are authored as part of relation type class schemas — never
  generated by the compiler (Rule RECC-5).
- Manual editing of compiled execution artifacts is disallowed.

#### 2.4.1 Invalidation Markers

When the compiler detects drift between the Canonical Lane and the Execution Lane:

```turtle
fandaws:compilationStatus fandaws:Stale ;
fandaws:invalidatedAt      xsd:dateTimeStamp ;
fandaws:invalidationReason "reason string" .
```

Stale execution triples are excluded from reasoner input. A stale triple is never silently
consumed.

#### 2.4.2 Recompilation Triggers

| Trigger | Scope |
|---|---|
| Canonical relation instance created or updated | Affected relation type and all instances |
| Canonical confidence score updated (any direction) | Affected instance and execution named graph |
| Relation type schema modified | All instances of that relation type |
| RECC restriction added, modified, or removed | All instances; full reasoner re-evaluation |
| BFO/CCO import version change | Full recompilation; all placement decisions invalidated |
| BFO subcategory declaration changed on a relation type class | All instances of that type |
| User-asserted characteristic reviewed and accepted | Affected property and instances |
| Quarantine release | Affected axiom and downstream derivations |
| Ingestion session completes with new or modified canonical records | All relation type instances whose domain or range classes were affected by Phase 1 placement in the session |
| Conversational consistency check produces confirmed reclassification | All execution artifacts whose domain or range class was the reclassified concept |

#### 2.4.3 Compilation Epoch

Every execution artifact carries a `fandaws:compilationEpoch` — a monotonically increasing
integer incremented on each compiler pass.

**Implementation posture:** The epoch integer field MUST be implemented immediately on
every execution artifact. It is trivially cheap — an integer that increments. Deferring
it forces a painful backfill migration when stale detection arrives. Deferring the stale
detection, retraction cascading, and tier-boundary evaluation machinery built on top of it
does not. The counter goes in now. The machinery follows in Phase 2.

---

## 3. Ontological Commitments

### 3.1 Relation as First-Class Entity

FANDAWS treats a relation as a first-class node in the canonical model. The system reifies
the relation type and its asserted instances so they can be reasoned over, audited, and
normalized as objects, independent of raw RDF predicates.

### 3.2 BFO Alignment — Base Placement (BREAKING CHANGE from v1.9.1)

**`fan:RelationalQuality` is a subclass of `bfo:SpecificallyDependentContinuant`.**

This replaces the prior `bfo:Quality` base placement. The full conformance argument is in
Section 3.7.

```turtle
fan:RelationalQuality rdfs:subClassOf bfo:SpecificallyDependentContinuant ;
    rdfs:label "relational quality" ;
    skos:definition """A FANDAWS reification class representing a canonical audit record
    of a relation between entities. As a specifically dependent continuant, a relational
    quality instance cannot exist without its primary bearer. Individual relation type
    classes further specialize into the appropriate BFO subcategory based on the
    semantic nature of the relation being reified.""" .
```

External classes ingested through Phase 1 are placed into the BFO hierarchy and registered
as canonical class records (Section 4.6).

### 3.3 BFO Subcategory Specialization by Relation Type

Individual relation type classes declare their BFO subcategory by adding an additional
`rdfs:subClassOf` declaration beyond `fan:RelationalQuality`. This declaration is based on
the semantic nature of the relation being reified, not on arbitrary convention.

**Rule BFO-2** governs this decision. The mapping table:

| Relation Nature | BFO Subcategory Added | Rationale |
|---|---|---|
| Inherence-type (quality directed at entity; e.g., redness inheres in apple) | `bfo:Quality` | The reified instance genuinely is a quality of its bearer; the `bfo:inheres_in` exception path is only available on these types |
| Mereological (part-whole, spatial containment) | *(none beyond base)* | Canonical record makes no Quality claim; BFO mereology is expressed in the Execution Lane via compiled properties |
| Participation (process-participant, role-bearer) | *(none beyond base)* | Same as mereological |
| Deontic (obligation, commitment, permission) | `bfo:Disposition` | Deontic relations are realizable — they can be fulfilled or violated; this places them under `bfo:RealizableEntity` → `bfo:Disposition` |
| Role-assignment (agent role, organizational role) | `bfo:Role` | Roles are realizable entities that depend on context; `bfo:Role` is the correct BFO placement |

This specialization is declared on the relation type class schema, not on canonical
instances:

```turtle
# Inherence-type: additionally declares bfo:Quality
<https://fandaws.org/class/inheres_in> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Quality ;
    rdfs:label "inheres in relation" .

# Mereological: no additional subcategory
<https://fandaws.org/class/has_part> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ;
    rdfs:label "has part relation" .

# Deontic: additionally declares bfo:Disposition
<https://fandaws.org/class/obligated_to> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Disposition ;
    rdfs:label "obligated to relation" .
```

The compiler reads the BFO subcategory declaration as a Tier 1 metadata signal and uses
it to inform execution predicate generation. Relation types with `bfo:Disposition` or
`bfo:Role` subcategory declarations trigger different execution artifact patterns than
mereological or inherence-type relations.

### 3.4 Primary Dependence: `specifically_depends_on` as the Default

**Rule SD-1 governs all relational quality instances.**

All `fan:RelationalQuality` instances MUST use `bfo:specifically_depends_on` to link to
their primary bearer unless the conditions for `bfo:inheres_in` are explicitly satisfied.

### 3.5 When `inheres_in` Is Permitted (Restricted)

`bfo:inheres_in` may be used only when ALL FOUR conditions are met:

1. The relation type class additionally declares `bfo:Quality` as a subcategory
   (i.e., it is an inherence-type relation per Section 3.3).
2. The bearer is an `IndependentContinuant` (BFO 2020 restriction).
3. The quality does not require a second distinct entity for instantiation
   (note: this condition is met by design for inherence-type relations).
4. The relation type schema explicitly declares `fandaws:allowsInheresIn true`.

Attempting to use `bfo:inheres_in` on a mereological, deontic, or role-assignment relation
type class is a normalizer error. The normalizer will reject the assertion, surface a
structured feedback record, and propose `bfo:specifically_depends_on` as the correction.

### 3.6 Multi-Relatum Dependence

- **Primary bearer:** `bfo:specifically_depends_on` (default) or `bfo:inheres_in`
  (exception — inherence-type relations only).
- **Additional relata:** `fan:towards` (binary) or `fan:RelatumSlot` (n-ary).

### 3.7 BFO Conformance Argument for `fan:RelationalQuality`

This section provides the formal argument for presentation to BFO conformance reviewers.
It supersedes the prior "controlled extension" framing, which was a retreat rather than a
defense.

#### 3.7.1 Why Not `bfo:Quality` as the Base

`bfo:Quality` is a specifically dependent continuant that inheres in exactly one bearer.
BFO's definition does not require a second entity for a Quality's instantiation. A
relational quality instance — by the very name — requires both a bearer and at least one
relatum. The relatum is not optional metadata; it is constitutive. Placing
`fan:RelationalQuality` directly under `bfo:Quality` implies that every canonical record is
a quality in the BFO sense, which overclaims for mereological, deontic, and role-assignment
relations where the canonical record is a reification device, not a quality.

#### 3.7.2 Why Not `bfo:RelationalQuality` (BFO_0000145)

BFO 2020 includes `bfo:RelationalQuality` (BFO_0000145) as a subclass of Quality, defined
as a quality that inheres in multiple bearers simultaneously. The canonical example is the
distance between two objects — it inheres in both objects at once. This is not the pattern
FANDAWS's canonical records represent. A canonical record of `[Wheel] has_part [Car]` has
one primary bearer (`Wheel`) and one relatum (`Car`). The Car is not a bearer of the
relational quality — it is the entity toward which the quality is directed. Subclassing
BFO_0000145 would import the wrong "multiple simultaneous bearers" semantics and would
draw the same conformance critique we are resolving.

#### 3.7.3 Why `bfo:SpecificallyDependentContinuant` Is the Correct Base

A `bfo:SpecificallyDependentContinuant` is an entity that specifically depends on one or
more other entities for its existence. A FANDAWS canonical record `:rel1` representing the
relation between `:Redness` and `:TheApple` cannot exist if `:Redness` ceases to exist.
The record specifically depends on its primary bearer. This is the exact condition
`bfo:SpecificallyDependentContinuant` captures, and it is true of canonical records
regardless of what kind of relation they reify.

The property `bfo:specifically_depends_on` has `bfo:SpecificallyDependentContinuant` as
its domain in BFO 2020. By placing `fan:RelationalQuality` under this class, all uses of
`bfo:specifically_depends_on` on canonical instances are domain-conformant by construction.
This is not incidental — it is why the base placement is correct.

#### 3.7.4 Downward Specialization Is Principled

The pattern of declaring BFO subcategory on individual relation type classes (Section 3.3)
is not ad hoc. Each declaration is independently defensible:

- A canonical record of *redness inheres in apple* genuinely is a `bfo:Quality` of apple.
  The instance `:Redness_Instance_001` is the specific redness that apple bears. This is
  a textbook BFO quality. Declaring `bfo:Quality` on the inherence-type relation class is
  correct and fully conformant.
- A canonical record of *wheel is part of car* is not a quality of wheel. It is a
  structural relationship captured in the Execution Lane as a compiled mereological
  property. The canonical record is a reification device. No further subcategory claim
  beyond `bfo:SpecificallyDependentContinuant` is made, because no further claim is
  warranted.
- A canonical record of *agent A is obligated to perform action B* is a disposition of
  agent A — it can be fulfilled (the action is performed) or violated (it is not). BFO's
  `bfo:Disposition` is exactly a specifically dependent continuant that is realized in
  processes. Declaring `bfo:Disposition` on deontic relation type classes is the correct
  BFO placement for obligations and commitments.

#### 3.7.5 Summary Position

FANDAWS uses `bfo:SpecificallyDependentContinuant` as the base class for its reification
class because:

1. Canonical records specifically depend on their primary bearers for existence — this is
   the defining criterion of `bfo:SpecificallyDependentContinuant`.
2. The BFO property `bfo:specifically_depends_on` requires this domain — base placement
   here makes all primary bearer links domain-conformant by construction.
3. Different relation types warrant different BFO subcategory claims — the downward
   specialization pattern expresses these claims on the relation type class, where they
   belong, not on the base class, where they would overclaim.

This is a specialization of BFO, not an extension that violates it. Every declaration is
independently justified by the semantic nature of the relation being reified.

### 3.8 Conversational Consistency Check

The conversational pipeline (single-assertion, user-by-user input) requires a lightweight
consistency enforcement mechanism that fires before assertions are written to the canonical
model. This is distinct from the full three-phase bulk ingestion pipeline but enforces the
same BFO disjointness constraints using equivalent logic via Map lookups rather than
Prolog queries.

The check operates on two trigger paths. Both use the machine-first/human-validate
pattern: the machine computes the consequence, presents it to the user with a structured
prompt, and requires explicit confirmation before writing anything to the canonical model.

#### 3.8.1 Path A — Reclassification Trigger

**Trigger:** A user reclassifies an existing canonical concept to a different BFO node.

**Check procedure:**
1. Compute the set of all canonical restrictions where the reclassified concept appears
   as the object (i.e., as the `owl:someValuesFrom` target of a restriction on any
   relation type class, or as a `fan:towards` or `bfo:specifically_depends_on` target
   in any existing canonical instance).
2. For each such restriction, retrieve the BFO category expected by the relation's domain
   or range declaration.
3. Check whether the concept's **new** BFO category is disjoint with the expected
   category under the BFO disjointness map.
4. Collect all violations as a structured list: `(relation, subject concept, expected BFO
   category, new BFO category, disjointness pair)`.

**Prompt output:** The consequence-aware reclassification prompt gains a third consequence
category — **Restrictions that would become type-invalid** — alongside the existing
inheritance loss and structural consequence categories:

```
Reclassifying [Concept] from [CurrentBFONode] to [NewBFONode].

Knowledge that would be lost:
  - [inheritance losses from existing prompt]

Structural consequences:
  - [structural consequences from existing prompt]

Restrictions that would become type-invalid:
  - [SubjectConcept] [Relation] [Concept] — '[Relation]' connects
    [SubjectBFOCategory] to [NewBFOCategory]. These categories are
    disjoint in BFO. This restriction would be structurally invalid
    after reclassification.

What would you like to do?
  [Confirm reclassification]  [Cancel]  [Review each invalid restriction]
```

**Outcome:**
- If user confirms: reclassification proceeds, invalid restrictions are quarantined with
  `fandaws:QuarantineRecord` entries carrying the disjointness violation as a structured
  failure trace (consistent with the `fandaws:FailureTrace` schema in Section 10.4).
- If user cancels: no change is written to the canonical model.
- If user selects "Review each": individual confirmation is required per invalid
  restriction before the reclassification is committed.

#### 3.8.2 Path B — New Assertion Trigger

**Trigger:** A user asserts a new relation between two existing canonical entities.

**Check procedure:**
1. Retrieve the BFO categories of both entities from the canonical model.
2. Retrieve the domain and range BFO expectations of the relation being asserted from
   the relation type class schema (Tier 1 metadata: `fandaws:hasPrimaryDomain` and the
   RECC structural conformance restriction on `fan:towards`).
3. Check whether the subject entity's BFO category is disjoint with the relation's
   expected domain, or the object entity's BFO category is disjoint with the relation's
   expected range.
4. If a disjointness is detected, surface a pre-commit warning before writing.

**Prompt output:**

```
You are asserting: [SubjectConcept] [Relation] [ObjectConcept]

Warning — type mismatch detected:
  '[Relation]' expects its subject to be a [ExpectedDomain].
  '[SubjectConcept]' is currently classified as [ActualSubjectBFONode].
  [ExpectedDomain] and [ActualSubjectBFONode] are disjoint in BFO.

This assertion would create a structurally invalid triple in the
canonical model.

What would you like to do?
  [Assert anyway and quarantine]  [Cancel]  [Reclassify [SubjectConcept] first]
```

**Outcome:**
- "Assert anyway and quarantine": the assertion is written to the canonical model with
  `fandaws:normalizationStatus fandaws:Quarantined` and a structured failure trace
  attached. It does not compile into the Execution Lane until the violation is resolved.
- "Cancel": nothing is written.
- "Reclassify first": the reclassification flow (Path A) is initiated for the subject or
  object concept before the assertion is written.

#### 3.8.3 Shared Infrastructure

Both paths depend on two shared data structures maintained by the canonical model:

**BFO Disjointness Map:** A lookup structure keyed on BFO node pairs, returning `true`
if the pair is disjoint in the active BFO version. Implemented as a JavaScript `Map` in
edge-canonical deployments or as a named graph in quad-store deployments.

**Content source and computation (v2.1):** The map contains ALL BFO node pairs that are
disjoint, whether by explicit declaration or by inheritance through declared disjoint
ancestors. This distinction is critical. BFO 2020 explicitly declares only a small set
of top-level disjointness axioms — most notably `bfo:Continuant owl:disjointWith
bfo:Occurrent`. It does not explicitly declare that `bfo:MaterialEntity` is disjoint
with `bfo:Process`. However, `bfo:MaterialEntity` is a subclass of `bfo:Continuant`,
and `bfo:Process` is a subclass of `bfo:Occurrent`. Because their ancestor classes are
declared disjoint, MaterialEntity and Process are disjoint by inheritance. A map
containing only explicitly declared pairs would miss this — and would fail to catch
the most common violation the conversational check is designed to prevent.

The map is computed at startup by the following procedure:

1. Load all explicit `owl:disjointWith` axioms from the ingested BFO hierarchy into a
   seed set of disjoint pairs.
2. Traverse the full `rdfs:subClassOf` graph of the BFO hierarchy.
3. For each explicit disjoint pair `(A, B)`, add all pairs `(A', B')` where `A'` is a
   subclass of `A` (at any depth) and `B'` is a subclass of `B` (at any depth). This
   is the transitive closure of disjointness through subclass inheritance.
4. The resulting set — explicit pairs plus all inferred pairs — is the complete
   BFO Disjointness Map for the active BFO version.

The map is rebuilt whenever the active BFO version changes (Rule VD-6). It is never
persisted to the Execution Lane.

**Example — MaterialEntity / Process:**
```
Explicit: bfo:Continuant  owl:disjointWith  bfo:Occurrent
Subclass:  bfo:MaterialEntity  rdfs:subClassOf  bfo:Continuant
Subclass:  bfo:Process         rdfs:subClassOf  bfo:Occurrent
Inferred:  (bfo:MaterialEntity, bfo:Process) → disjoint ✓
```

Without inferred disjointness, the check `?- disjoint(bfo:MaterialEntity, bfo:Process)`
would return `false`, and the most common class of violation — connecting a material
entity to a process via a structural property — would pass silently through the
conversational check.

**Relation Domain/Range Index:** A lookup structure keyed on relation type IRI, returning
the expected domain and range BFO categories from the relation type class schema. Built
from Tier 1 metadata (`fandaws:hasPrimaryDomain`) and RECC structural conformance
restrictions. Rebuilt on any relation type schema modification.

Both structures are maintained in memory during a session and rebuilt on startup from
the canonical model. They are never persisted to the Execution Lane.

**Rule CC-4:** The BFO Disjointness Map MUST include inferred disjointness computed
via transitive closure through `rdfs:subClassOf` chains from explicitly declared
`owl:disjointWith` pairs. A map containing only explicitly declared pairs is
non-conformant.

#### 3.8.4 Relationship to Full Three-Phase Pipeline

The conversational consistency check is not a replacement for the Phase 3 consistency
sandbox. It is a lightweight pre-commit gate that catches the most common class of
violation — BFO type disjointness — before an assertion enters the canonical model. Its
scope is narrower than the full sandbox:

| Capability | Conversational Check (Path A/B) | Phase 3 Sandbox |
|---|---|---|
| BFO type disjointness | ✓ | ✓ |
| Range mismatch | ✓ (via index lookup) | ✓ |
| Domain mismatch | ✓ (via index lookup) | ✓ |
| Cycle detection | ✗ | ✓ |
| Multi-axiom consistency across full graph | ✗ | ✓ |
| External ontology bulk validation | ✗ | ✓ |
| Horn clause derivation | ✗ | ✓ |

Conversational assertions that pass the lightweight check enter the canonical model with
`fandaws:normalizationStatus fandaws:Normalized` directly — they do not go through the
full three-phase pipeline. Assertions quarantined by the lightweight check remain in
`fandaws:Quarantined` status and may be submitted to the full Phase 3 sandbox for deeper
analysis.

### 3.9 BFO/CCO Dependency Management and Snapshot Versioning

#### 3.9.1 Active Version Declaration

```turtle
fandaws:OntologyHeader a owl:Ontology ;
    fandaws:activeBFOVersion    "2020"^^xsd:string ;
    fandaws:activeBFOImportIRI  <http://purl.obolibrary.org/obo/bfo/2020/bfo.owl> ;
    fandaws:activeCCOVersion    "1.4"^^xsd:string ;
    fandaws:versionDeclaredAt   "2025-04-01T00:00:00Z"^^xsd:dateTimeStamp .
```

#### 3.9.2 Sandbox Snapshot Policy

The Tau Prolog sandbox loads a fact-serialized snapshot of the active BFO hierarchy at
session start. This snapshot is versioned, immutable within a session, and regenerated
when the active BFO version changes.

#### 3.9.3 Version Change Consequences

A BFO or CCO version change triggers: full recompilation, invalidation of all Phase 1
placement decisions, invalidation of all BFO subcategory declarations on relation type
classes (Rule BFO-2 declarations must be reviewed against the new hierarchy), and a
`fandaws:VersionChangeEvent` record written to the Canonical Lane.

---

## 4. Logical Design

### 4.1 What Is Stored Canonically

#### 4.1.1 Relation Instance Record

Each canonical relation instance stores:

| Property | Description |
|---|---|
| Relation type | The class this instance belongs to |
| Primary bearer | Via `bfo:specifically_depends_on` (default) or `bfo:inheres_in` (exception — inherence-type only) |
| Secondary relatum | Via `fan:towards` (binary); RECC enforces type on this link |
| Additional relata | Via ordered `fan:RelatumSlot` nodes (n-ary only) |
| Provenance triple | `<AuthoritativeSystem> fan:isSourceOf <instance>` — standalone triple |
| Source system | Metadata annotation |
| Import timestamp | Metadata annotation |
| Asserting agent | Metadata annotation |
| Confidence | Numeric `[0.0–1.0]` with basis |
| Normalization status | See Section 4.1.3 |
| Compilation status | See Section 4.1.4 |
| Compilation epoch | On the instance itself |
| Compiler feedback | Human-readable string if `CompilerRejected` or `Stale` |
| Human notes | Annotation-layer text |

#### 4.1.2 Canonical Class Record

Each canonical class record stores:

| Property | Description |
|---|---|
| OWL class declaration | `rdf:type owl:Class` |
| BFO placement | `rdfs:subClassOf <bfo:Node>` |
| Source IRI mapping | `owl:equivalentClass <externalIRI>` |
| Source ontology | `fandaws:sourceOntology` |
| Source IRI | `fandaws:sourceIRI` |
| Placement confidence | `fandaws:placementConfidence` — decimal `[0.0–1.0]` |
| Placement justification | `fandaws:placementJustification` — human-readable string |
| Normalization status | See Section 4.1.3 |
| Compilation status | See Section 4.1.5 |
| Ingestion session | `fandaws:ingestedInSession` |

#### 4.1.3 Normalization Status Vocabulary

| Value | Meaning | Applies To |
|---|---|---|
| `fandaws:Pending` | Received; not yet processed | Relation instances, class records |
| `fandaws:Staged` | Written to SourceAxiomGraph; sandbox not yet run | Candidate records |
| `fandaws:Normalized` | Passed all checks; ready for compilation | Relation instances, class records |
| `fandaws:Quarantined` | Failed check; written to quarantine | Any |
| `fandaws:Rejected` | Permanently excluded | Any |
| `fandaws:PlacementConfirmed` | Phase 1 sandbox: single consistent placement ≥ 0.7 | Candidate class records |
| `fandaws:PlacementAmbiguous` | Phase 1 sandbox: multiple placements or confidence < 0.7 | Candidate class records |
| `fandaws:PlacementRejected` | Phase 1 sandbox: no consistent placement | Candidate class records |
| `fandaws:PendingHumanResolution` | Surfaced to UI; blocked pending human action | Candidate class records, DisambiguationRecords |
| `fandaws:NoViolations` | Phase 3 sandbox: no violations; cleared for compilation | Candidate axiom records |

`fandaws:PendingHumanResolution` is a blocking terminal state. Phase N+1 cannot begin
while any Phase N item holds this status.

#### 4.1.4 Compilation Status Vocabulary — Relation Instances

| Value | Meaning |
|---|---|
| `fandaws:Uncompiled` | Normalized but not yet compiled |
| `fandaws:Compiled` | Execution artifacts generated and current |
| `fandaws:Stale` | Execution artifacts exist but are out of date |
| `fandaws:CompilerRejected` | Compiler refused to generate artifacts; feedback record present |
| `fandaws:Retracted` | Execution artifacts deleted; tombstone retained |

#### 4.1.5 Compilation Status Vocabulary — Canonical Class Records

Class records have a two-state simplified lifecycle. They do not produce execution triples
and do not participate in epoch, stale detection, or retraction.

| Value | Meaning |
|---|---|
| `fandaws:ClassRegistered` | Placed, normalized, and active in the canonical taxonomy |
| `fandaws:ClassDeprecated` | Superseded or merged; no longer active |

Class records transition to `fandaws:ClassDeprecated` only on merge or explicit operator
deprecation. A BFO version change resets normalization status to `fandaws:Pending` for
re-evaluation but does not change compilation status.

### 4.2 What Is Generated (Execution Lane)

The compiler may generate:

- Executable OWL object properties.
- Property characteristics (compiler-only, per CS-1).
- `rdfs:subPropertyOf` declarations (compiler-only, per CS-5).
- Materialized relation assertions in provenance-bearing named graphs.
- OWL subclass restrictions compiled from validated axioms.
- Binary projections of n-ary canonical records where declared.
- Explicit inverses where policy requires.
- Deontic execution patterns for relation type classes declaring `bfo:Disposition` or
  `bfo:Role` subcategory (compiler reads BFO subcategory as a Tier 1 signal for artifact
  pattern selection).

The compiler **never** emits `owl:NegativePropertyAssertion` or any negation construct
into the Execution Lane (Section 7).

### 4.3 Provenance Carriage Through Materialized Edges

#### 4.3.1 Relation-Instance-Derived Execution Graphs

```turtle
GRAPH fan:exec_rel_001 {
    :Redness rel:inheres_in :TheApple .
}

fan:exec_rel_001
    rdf:type                  fandaws:ExecutionGraph ;
    fandaws:sourceCanonical   :Inherence_Instance_001 ;
    fandaws:confidence        "0.99"^^xsd:decimal ;
    fandaws:compiledAt        "2025-04-01T12:00:00Z"^^xsd:dateTimeStamp ;
    fandaws:compilationEpoch  "1"^^xsd:integer ;
    fandaws:compilationStatus fandaws:Compiled .
```

#### 4.3.2 Axiom-Derived Execution Graphs

```turtle
GRAPH fan:exec_axiom_car_has_engine {
    fan:class_ex_car rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty rel:has_part ;
          owl:someValuesFrom fan:class_ex_engine ] .
}

fan:exec_axiom_car_has_engine
    rdf:type                  fandaws:ExecutionGraph ;
    fandaws:sourceAxiom       fandaws:candidate_axiom_car_has_engine ;
    fandaws:sandboxResult     fandaws:NoViolations ;
    fandaws:compiledAt        "2025-04-01T12:05:00Z"^^xsd:dateTimeStamp ;
    fandaws:compilationEpoch  "2"^^xsd:integer ;
    fandaws:compilationStatus fandaws:Compiled .
```

**Provenance link rule:** Every `fandaws:ExecutionGraph` MUST carry exactly one of
`fandaws:sourceCanonical` or `fandaws:sourceAxiom`. Carrying both or neither is a
compiler error (Rule VD-2).

#### 4.3.3 Confidence Mapping Policy

| Canonical Confidence | Execution Lane Behavior |
|---|---|
| `[0.9–1.0]` | Materialized as asserted triple in `fandaws:ExecutionGraph` |
| `[0.7–0.9)` | Materialized with `fandaws:confidence` annotation; flagged for reasoner |
| `[0.5–0.7)` | Materialized into `fandaws:TentativeGraph`; excluded from default reasoning |
| `< 0.5` | Not materialized; retained in Canonical Lane only |

Configurable per relation type via `fandaws:compilationConfidenceThreshold`.

### 4.4 Retraction Policy for Confidence Downgrades

Any confidence update crossing a tier boundary activates the Retraction Protocol
atomically:

1. Mark prior execution graph `fandaws:Retracted` with timestamp and reason.
2. Delete execution triples from the named graph; retain tombstone.
3. Cascade to derived artifacts: inverses, projections, sub-property children, and
   dependent named graphs.
4. Re-materialize into correct new tier if applicable.
5. Surface in diagnostic UI as actionable event.

Upgrades follow the symmetric reverse protocol. All transitions are atomic.

```
         upgrade                    upgrade                    upgrade
  < 0.5 ─────────► [0.5–0.7) ─────────► [0.7–0.9) ─────────► [0.9–1.0]
[No exec]  ◄─────── [Tentative] ◄─────── [Flagged]  ◄─────── [Asserted]
         downgrade                   downgrade                  downgrade
```

### 4.5 What Is Not Mixed

The system strictly segregates: canonical relation metadata (Tier 1 passive flags), RECC
restrictions (Tier 2 active OWL axioms), BFO subcategory declarations (Section 3.3 —
schema-level, compiler-read), OWL property characteristics (compiler output only), source
annotations and staging records (SourceAxiomGraph), runtime-derived conclusions (Execution
Lane named graphs), compiler feedback records, negation records (Canonical Lane only), and
deprecated instance properties (`fan:domain`, `fan:range`).

### 4.6 Canonical Class Record — Extended Definition

See Section 4.1.2 for property inventory.

**BFO subcategory on class records:** The BFO node declared in `rdfs:subClassOf` on a
canonical class record is the placement determined by the Phase 1 sandbox. It is distinct
from the BFO subcategory declared on a *relation type class* schema (Section 3.3). Class
records describe the concept being classified; relation type class schemas describe the
nature of the relation being reified. These are different declarations serving different
purposes.

**Equivalent class aliasing:** `owl:equivalentClass` on a canonical class record is a
schema-level OWL assertion written by the normalizer on promotion. It is not a Tier 1
compiler flag and not a RECC restriction. The compiler does not act on it.

### 4.7 Disambiguation Record

When Phase 2 property ingestion cannot be auto-resolved, the normalizer writes a
`fandaws:DisambiguationRecord` and halts ingestion of the affected property.

```turtle
fandaws:disambiguation_ex_contains a fandaws:DisambiguationRecord ;
    fandaws:candidate        fandaws:candidate_ex_contains ;
    fandaws:sandboxVerdict   fandaws:ExactOverlap ;
    fandaws:conflictsWith    fan:RelationType_hasPart ;
    fandaws:availableActions ( fandaws:Merge fandaws:Reject
                               fandaws:PromoteAsSubProperty
                               fandaws:PromoteAsNewRelation ) ;
    fandaws:surfacedAt       "2025-04-01T12:01:00Z"^^xsd:dateTimeStamp ;
    fandaws:surfaceReason    "Auto-merge threshold not met: confidence 0.72 < 0.85." ;
    fandaws:normalizationStatus fandaws:PendingHumanResolution .
```

### 4.8 Merge Record Structure

When auto-merge fires or a human operator selects Merge, the normalizer writes merge
record properties to the existing canonical relation type class.

`owl:equivalentProperty` is asserted between the external IRI and the existing execution
property. This is a precise, bounded claim between two named properties — not equivalent
to the vacuous `owl:equivalentProperty owl:topObjectProperty` pattern, which was correctly
removed. The auto-merge threshold (0.85 default) and human disambiguation fallback are the
safeguards. The assertion is only written after confirmation.

Auto-merge **never** modifies the existing relation's label, BFO placement, BFO
subcategory declaration, Tier 1 metadata flags, or RECC restrictions.

---

## 5. Class and Property Model

### 5.1 Core Class (BREAKING CHANGE from v1.9.1)

```turtle
fan:RelationalQuality rdf:type owl:Class ;
    rdfs:subClassOf bfo:SpecificallyDependentContinuant ;
    rdfs:label "relational quality" ;
    skos:definition """A FANDAWS reification class representing a canonical audit record
    of a relation between entities. As a specifically dependent continuant, a relational
    quality instance cannot exist without its primary bearer. Individual relation type
    classes further specialize into the appropriate BFO subcategory (bfo:Quality,
    bfo:Disposition, bfo:Role, or none) based on the semantic nature of the relation
    being reified. See Section 3.3 and 3.7 for the full conformance argument.""" .
```

### 5.2 Primary Dependence Properties

```turtle
# Default: all relational quality instances — Rule SD-1
# Domain: bfo:SpecificallyDependentContinuant (satisfied by base class placement)
bfo:specifically_depends_on rdf:type owl:ObjectProperty .

# Exception: inherence-type relation instances only — Rule SD-2 (further restricted in v2.0)
# Valid only on relation type classes that additionally declare bfo:Quality (Section 3.3)
bfo:inheres_in rdf:type owl:ObjectProperty .
```

### 5.3 Secondary Relation-Linking Property

```turtle
fan:towards rdf:type owl:ObjectProperty ;
    rdfs:label "towards" ;
    skos:definition """Relates a relational quality to a secondary entity. Binary relations
    only. For n-ary relations use fan:RelatumSlot exclusively (Rule NR-1).""" .
```

### 5.4 N-Ary Relation Representation: The RelatumSlot Pattern

FANDAWS does not perform native OWL reasoning across n-ary structures. N-ary canonical
records are structural payloads for downstream FNSR services. The compiler emits binary
projections where declared.

```turtle
fan:RelatumSlot    rdf:type owl:Class .
fan:hasRelatumSlot rdf:type owl:ObjectProperty ;
    rdfs:domain fan:RelationalQuality ; rdfs:range fan:RelatumSlot .
fan:slotIndex  rdf:type owl:DatatypeProperty ;
    rdfs:range xsd:nonNegativeInteger .  # ordering only — Rule NR-3
fan:slotRole   rdf:type owl:ObjectProperty .  # semantic mapping — Rule NR-3
fan:slotType   rdf:type owl:ObjectProperty .
fan:slotFiller rdf:type owl:ObjectProperty .
```

### 5.5 Canonical Metadata Properties — Tier 1 (Compiler-Processed, Passive)

```turtle
fandaws:hasPrimaryDomain               rdf:type owl:ObjectProperty .
fandaws:isTransitive                   rdf:type owl:DatatypeProperty ; rdfs:range xsd:boolean .
fandaws:isSymmetric                    rdf:type owl:DatatypeProperty ; rdfs:range xsd:boolean .
fandaws:isFunctional                   rdf:type owl:DatatypeProperty ; rdfs:range xsd:boolean .
fandaws:allowsInheresIn                rdf:type owl:DatatypeProperty ; rdfs:range xsd:boolean .
fandaws:compilationConfidenceThreshold rdf:type owl:DatatypeProperty ; rdfs:range xsd:decimal .
fandaws:binaryProjectionPolicy         rdf:type owl:ObjectProperty .
fandaws:bfoSubcategory                 rdf:type owl:ObjectProperty ;
    skos:definition """The BFO subcategory additionally declared on this relation type
    class (Section 3.3). Compiler reads this as a Tier 1 signal for execution artifact
    pattern selection. Values: bfo:Quality, bfo:Disposition, bfo:Role, or absent.""" .
```

### 5.6 RECC Properties — Tier 2 (Reasoner-Enforced, Active)

```turtle
fan:domain rdf:type owl:ObjectProperty ; owl:deprecated true ;
    rdfs:label "domain participant (DEPRECATED v1.9)" .
fan:range  rdf:type owl:ObjectProperty ; owl:deprecated true ;
    rdfs:label "range participant (DEPRECATED v1.9)" .
fan:isSourceOf rdf:type owl:ObjectProperty ;
    rdfs:label "is source of" ;
    skos:definition """Asserted by an authoritative system to claim authorship of a
    reified canonical instance. Must be asserted as a standalone triple outside any
    instance subject block (Rule RECC-4).""" .
```

RECC structural conformance restrictions are placed directly on `bfo:specifically_depends_on`
and `fan:towards`. For inherence-type relations using the `bfo:inheres_in` exception path,
restrictions are placed on `bfo:inheres_in` instead.

#### 5.6.1 Combined RECC Declaration — Inherence-Type Relation (v2.0 canonical form)

```turtle
<https://fandaws.org/class/inheres_in> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Quality ;            # BFO subcategory: inherence-type
    rdfs:label "inheres in relation" ;
    rdfs:subClassOf prop:domain , prop:range ;

    # Tier 1 metadata
    fandaws:allowsInheresIn                true ;
    fandaws:compilationConfidenceThreshold "0.7"^^xsd:decimal ;
    fandaws:bfoSubcategory                 bfo:Quality ;

    # Tier 2 RECC: structural conformance
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:quality ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] ,

    # Tier 2 RECC: provenance authority
        [ rdf:type owl:Restriction ;
          owl:onProperty [ owl:inverseOf fan:isSourceOf ] ;
          owl:hasValue :AuthoritativeSystemY ] .
```

#### 5.6.2 Combined RECC Declaration — Mereological Relation (v2.0 canonical form)

> **Scope note (v2.1):** This example is scoped to **material mereology** specifically.
> The RECC restrictions below require both the `bfo:specifically_depends_on` target and
> the `fan:towards` target to be `fan:materialEntity`. This is correct for BFO's material
> part-whole relations (wheel is part of car; chamber is part of heart) but excludes
> temporal mereology (a temporal interval is part of a temporal region) and spatial
> mereology (a spatial region is part of a larger spatial region). Those require separate
> relation type classes with different RECC restrictions and different BFO expected types.
> The per-type-class RECC pattern accommodates this by design — each mereological variant
> gets its own class with its own type constraints. The example below is
> `has_part` for material entities only.

```turtle
<https://fandaws.org/class/has_part> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ;  # no additional BFO subcategory
    rdfs:label "has part relation (material)" ;
    rdfs:subClassOf prop:domain , prop:range ;

    # Tier 1 metadata
    fandaws:isTransitive                   true ;
    fandaws:compilationConfidenceThreshold "0.8"^^xsd:decimal ;
    # fandaws:bfoSubcategory absent — no overclaim

    # Tier 2 RECC: structural conformance (material entities only)
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:materialEntity ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] .
```

#### 5.6.3 Combined RECC Declaration — Deontic Relation (v2.0 canonical form)

```turtle
<https://fandaws.org/class/obligated_to> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Disposition ;        # BFO subcategory: deontic
    rdfs:label "obligated to relation" ;
    rdfs:subClassOf prop:domain , prop:range ;

    # Tier 1 metadata
    fandaws:compilationConfidenceThreshold "0.85"^^xsd:decimal ;
    fandaws:bfoSubcategory                 bfo:Disposition ;

    # Tier 2 RECC: structural conformance
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom bfo:Agent ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:Action ] .
```

### 5.7 Authority Scope Patterns

**Pattern A — Single Authority (`owl:hasValue`):** Every instance must have exactly one
named system as source.

**Pattern B — Authorized Class (`owl:someValuesFrom fan:AuthorizedSystem`):** Every
instance must have at least one member of the authorized class as source.

**Pattern C — Open Provenance:** No RECC provenance restriction. Normalizer quarantine
is sole enforcement.

### 5.8 Structural Role Taxonomy: `prop:has`, `prop:domain`, `prop:range`

Schema-level compiler instruction classes. Not instance-level properties.

```turtle
prop:has rdf:type owl:Class ;
    rdfs:label "has (structural role)" ;
    rdfs:subClassOf fan:RelationalQuality ;
    rdfs:subClassOf [ owl:onProperty fan:has ; owl:someValuesFrom fan:entity ] .

prop:domain rdf:type owl:Class ;
    rdfs:label "domain (structural role)" ;
    rdfs:subClassOf fan:RelationalQuality ;
    rdfs:subClassOf [ owl:onProperty fan:has ; owl:someValuesFrom fan:entity ] .

prop:range rdf:type owl:Class ;
    rdfs:label "range (structural role)" ;
    rdfs:subClassOf fan:RelationalQuality ;
    rdfs:subClassOf
        [ owl:onProperty [ owl:inverseOf fan:has ] ; owl:someValuesFrom fan:entity ] .
```

### 5.9 Ingestion Vocabulary

All properties and classes introduced by the Ingestion Pipeline Specification v1.0. See
v1.9.1 Section 5.9 for full declarations. Carried forward unchanged.

### 5.10 Conversational Consistency Check Vocabulary (v2.0 New)

```turtle
fandaws:ConversationalViolation rdf:type owl:Class ;
    rdfs:label "conversational violation" ;
    skos:definition """A lightweight consistency violation detected by the conversational
    consistency check (Section 3.8) before an assertion is written to the canonical model.
    Carries the same structural information as a fandaws:FailureTrace but is produced by
    Map lookup rather than Prolog sandbox.""" .

fandaws:checkTrigger rdf:type owl:ObjectProperty ;
    rdfs:domain fandaws:ConversationalViolation ;
    skos:definition """The event that triggered this check. Values:
    fandaws:ReclassificationTrigger (Path A) or fandaws:NewAssertionTrigger (Path B).""" .

fandaws:ReclassificationTrigger rdf:type fandaws:CheckTrigger ;
    rdfs:label "reclassification trigger" .

fandaws:NewAssertionTrigger rdf:type fandaws:CheckTrigger ;
    rdfs:label "new assertion trigger" .

fandaws:priorBFOCategory rdf:type owl:ObjectProperty ;
    rdfs:domain fandaws:ConversationalViolation ;
    skos:definition "The BFO category the concept held before the reclassification." .

fandaws:proposedBFOCategory rdf:type owl:ObjectProperty ;
    rdfs:domain fandaws:ConversationalViolation ;
    skos:definition "The BFO category proposed by the reclassification or new assertion." .

fandaws:invalidatedRestrictions rdf:type owl:ObjectProperty ;
    rdfs:domain fandaws:ConversationalViolation ;
    skos:definition """RDF list of restriction records that would become type-invalid
    as a result of this reclassification or assertion.""" .

fandaws:BFODisjointnessMap rdf:type owl:Class ;
    rdfs:label "BFO disjointness map" ;
    skos:definition """In-memory lookup structure containing all BFO node pairs that are
    disjoint by explicit owl:disjointWith declaration or by inheritance through declared
    disjoint ancestors (transitive closure). Computed at startup from the ingested BFO
    hierarchy. Maintained by the normalizer. Rebuilt on BFO version change. Never
    persisted to the Execution Lane. See Section 3.8.3 for full computation procedure
    and Rule CC-4 for conformance requirement.""" .

fandaws:RelationDomainRangeIndex rdf:type owl:Class ;
    rdfs:label "relation domain range index" ;
    skos:definition """In-memory lookup structure keyed on relation type IRI, returning
    expected domain and range BFO categories from Tier 1 metadata and RECC restrictions.
    Rebuilt on relation type schema modification. Never persisted to Execution Lane.""" .
```

> **Implementation documentation note (v2.1):** `fandaws:BFODisjointnessMap` and
> `fandaws:RelationDomainRangeIndex` are declared as OWL classes for implementation
> discoverability only. They are **not part of the active ontological model**. A
> conformant OWL reasoner consuming an exported FANDAWS graph will see them as empty
> class declarations with no instances. This is correct and harmless — they are runtime
> data structures that exist in memory during a normalizer session, not ontological
> individuals that are instantiated or reasoned over. Implementers must not attempt to
> query or populate these classes via OWL reasoning. Their presence in the vocabulary
> namespace is documentation convention, not an ontological commitment.

---

## 6. Execution Edge Generation

### 6.1 The Property Chain Ghost Problem

Standard OWL 2 DL `owl:propertyChainAxiom` cannot restrict logic based on the class of
an intermediate node. FANDAWS resolves this through Compiler Materialization.

### 6.2 Graph Materialization Policy

The compiler queries the Canonical Lane and computationally materializes execution edges.
Structural role declarations (Section 5.8) drive execution predicate generation. RECC
restrictions ensure instance conformance. The compiler additionally reads the BFO
subcategory declared on the relation type class (Section 3.3) to select the appropriate
execution artifact pattern.

**Pre-materialization check (five-point in v2.0):**

1. RECC structural conformance: `bfo:specifically_depends_on` and `fan:towards` targets
   match declared types.
2. RECC provenance authority: required `fan:isSourceOf` triple is present.
3. BFO subcategory consistency: if `bfo:inheres_in` is used on the instance, the relation
   type class must declare `bfo:Quality` as a subcategory (Section 3.5 restriction).
4. Confidence meets `fandaws:compilationConfidenceThreshold`.
5. Normalization status is `fandaws:Normalized`.

Failures on checks 1–3 set `fandaws:compilationStatus fandaws:CompilerRejected`.

### 6.3 Sub-Property Execution Artifacts — Rule CS-5

`rdfs:subPropertyOf` on Execution Lane properties is compiler-only output. Sub-property
execution properties participate in the full stale detection and retraction system. Parent
retraction cascades to all sub-property children (Rule RT-3).

### 6.4 Safe Sub-Property Minting for Export

| Rule | Specification |
|---|---|
| Naming | `fandaws:exec_{relationType}_{role}` |
| Namespace | Always `fandaws:exec_`; never BFO or CCO |
| Versioning | `owl:versionInfo` matching compilation epoch |
| Registration | `fandaws:MintedPropertyRegistry` |
| Deprecation | `owl:deprecated true` before removal |

### 6.5 Compiler Feedback for User-Asserted Characteristics

1. Set `fandaws:compilationStatus fandaws:CompilerRejected`.
2. Write structured feedback to Canonical Lane.
3. Surface in diagnostic UI.
4. Emit no execution artifact.
5. Mark prior compiled artifacts `fandaws:Stale`.

---

## 7. Closed-World and Negation Policy

### 7.1 Default Posture

FANDAWS operates under the Open World Assumption. An unasserted relation is not a negated
relation.

### 7.2 Execution Lane Negation: Explicit Prohibition

**The compiler NEVER emits `owl:NegativePropertyAssertion` or any negation construct into
the Execution Lane.** Unconditional. Negation is strictly a Canonical Lane concern.

### 7.3 Canonical Negation Representation

```turtle
fan:NegatedRelation rdf:type owl:Class ;
    rdfs:subClassOf fan:RelationalQuality .

fandaws:negationBasis        rdf:type owl:DatatypeProperty ;
    rdfs:domain fan:NegatedRelation ; rdfs:range xsd:string .
fandaws:negationEvidenceType rdf:type owl:ObjectProperty ;
    rdfs:domain fan:NegatedRelation .
```

### 7.4 Closed-World Scopes

Closed-world scope declarations are maintained exclusively in the Canonical Lane. Never
compiled into the Execution Lane.

### 7.5 Downstream FNSR Deontic Contract

FNSR deontic services must follow this lookup order:

1. Check for `fan:NegatedRelation` record in the Canonical Lane.
2. Check for `fandaws:ClosedWorldScope` covering the relevant named graph.
3. If neither: **ontological silence** — not negation.

Violating this order is an integration contract violation.

---

## 8. Error Handling and Repair

When an assertion conflicts with the normalized model:

1. Reject the invalid assertion.
2. Propose a logically consistent alternative.
3. Preserve in `fandaws:SourceAxiomGraph`.
4. Set `fandaws:normalizationStatus fandaws:Quarantined`.
5. Expose in diagnostic UI with full provenance and proposed repair.

Conversational consistency check violations (Section 3.8) produce
`fandaws:ConversationalViolation` records before any assertion is written. These are
pre-commit warnings, not post-commit quarantine records. If the user confirms the
quarantine path, a standard `fandaws:QuarantineRecord` with `fandaws:failureTrace` is
written at that point.

---

## 9. Complete Turtle Skeleton

```turtle
@prefix owl:     <http://www.w3.org/2002/07/owl#> .
@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix bfo:     <http://purl.obolibrary.org/obo/BFO_> .
@prefix fan:     <https://dev.fandaws.com/fan/> .
@prefix prop:    <https://fandaws.org/schema/objectProperty/> .
@prefix rel:     <https://fandaws.org/schema/executionProperty/> .
@prefix fandaws: <https://fandaws.org/meta/> .

###############################################################
### 0. FOUNDATIONAL                                         ###
###############################################################

# v2.0 BREAKING CHANGE: bfo:SpecificallyDependentContinuant replaces bfo:Quality
fan:RelationalQuality a owl:Class ;
    rdfs:subClassOf bfo:SpecificallyDependentContinuant .

fan:entity         a owl:Class ; owl:equivalentClass bfo:Entity .
fan:quality        a owl:Class ; owl:equivalentClass bfo:Quality .
fan:materialEntity a owl:Class ; owl:equivalentClass bfo:MaterialEntity .
fan:isSourceOf     a owl:ObjectProperty .
fan:has            a owl:ObjectProperty .
fan:towards        a owl:ObjectProperty .
fan:domain         a owl:ObjectProperty ; owl:deprecated true .
fan:range          a owl:ObjectProperty ; owl:deprecated true .

###############################################################
### 1. STRUCTURAL ROLE TAXONOMY                             ###
###############################################################

prop:has    a owl:Class ; rdfs:subClassOf fan:RelationalQuality ;
    rdfs:subClassOf [ owl:onProperty fan:has ; owl:someValuesFrom fan:entity ] .
prop:domain a owl:Class ; rdfs:subClassOf fan:RelationalQuality ;
    rdfs:subClassOf [ owl:onProperty fan:has ; owl:someValuesFrom fan:entity ] .
prop:range  a owl:Class ; rdfs:subClassOf fan:RelationalQuality ;
    rdfs:subClassOf [ owl:onProperty [ owl:inverseOf fan:has ] ;
                      owl:someValuesFrom fan:entity ] .

###############################################################
### 2A. RELATION TYPE SCHEMA — INHERENCE TYPE               ###
###        (additionally declares bfo:Quality)              ###
###############################################################

<https://fandaws.org/class/inheres_in> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Quality ;           # inherence-type: BFO Quality subcategory
    rdfs:label "inheres in relation" ;
    rdfs:subClassOf prop:domain , prop:range ;
    fandaws:allowsInheresIn                true ;
    fandaws:compilationConfidenceThreshold "0.7"^^xsd:decimal ;
    fandaws:bfoSubcategory                 bfo:Quality ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:quality ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty [ owl:inverseOf fan:isSourceOf ] ;
          owl:hasValue :AuthoritativeSystemY ] .

###############################################################
### 2B. RELATION TYPE SCHEMA — MEREOLOGICAL TYPE            ###
###        (no additional BFO subcategory)                  ###
###############################################################

<https://fandaws.org/class/has_part> a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ; # mereological: no subcategory beyond base
    rdfs:label "has part relation" ;
    rdfs:subClassOf prop:domain , prop:range ;
    fandaws:isTransitive                   true ;
    fandaws:compilationConfidenceThreshold "0.8"^^xsd:decimal ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:materialEntity ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] .

###############################################################
### 3. CANONICAL INSTANCE — INHERENCE TYPE                  ###
###############################################################

:TheApple          a fan:materialEntity .
:Redness           a fan:quality .
:AuthoritativeSystemY a fan:entity .

:Inherence_Instance_001 a <https://fandaws.org/class/inheres_in> ;
    rdfs:label "Reified Inherence Record 001" ;
    bfo:specifically_depends_on :Redness ;  # primary bearer (Rule SD-1)
    fan:towards                 :TheApple ; # range participant
    fandaws:confidence          "0.99"^^xsd:decimal ;
    fandaws:normalizationStatus fandaws:Normalized ;
    fandaws:compilationStatus   fandaws:Compiled ;
    fandaws:compilationEpoch    "1"^^xsd:integer .

# Standalone provenance triple (Rule RECC-4)
:AuthoritativeSystemY fan:isSourceOf :Inherence_Instance_001 .

###############################################################
### 4. COMPILER OUTPUT — INHERENCE TYPE (Execution Lane)    ###
### GENERATED BY FANDAWS — DO NOT EDIT MANUALLY             ###
###############################################################

rel:inheres_in a owl:ObjectProperty ;
    rdfs:label  "inheres in (compiled)" ;
    rdfs:domain fan:quality ;
    rdfs:range  fan:materialEntity .

GRAPH fan:exec_rel_001 {
    :Redness rel:inheres_in :TheApple .
}

fan:exec_rel_001 a fandaws:ExecutionGraph ;
    fandaws:sourceCanonical   :Inherence_Instance_001 ;
    fandaws:confidence        "0.99"^^xsd:decimal ;
    fandaws:compiledAt        "2025-04-01T12:00:00Z"^^xsd:dateTimeStamp ;
    fandaws:compilationEpoch  "1"^^xsd:integer ;
    fandaws:compilationStatus fandaws:Compiled .
```

---

## 10. Quarantine Store: `fandaws:SourceAxiomGraph`

### 10.1 Record Type Enumeration

Three record types only — staging records, quarantine records, raw source axioms. No other
record types may be written to this graph (Rule VD-1). Never loaded into the active
reasoning model.

### 10.2 Quarantine Record Structure

`fandaws:QuarantineRecord` carries `fandaws:failureTrace` (typed `fandaws:FailureTrace`,
required for Phase 3 violations per Rule VD-4) and `fandaws:sourceAxiomRef`.

### 10.3 Quarantine Lifecycle

`fandaws:PendingReview` → `fandaws:Rejected` or `fandaws:Released`. Release triggers
recompilation (Rule QS-2).

### 10.4 Failure Trace and Violation Rule Taxonomy

`fandaws:FailureTrace` carries: `fandaws:violationRule`, `fandaws:relation`,
`fandaws:subjectNode`, `fandaws:objectNode`, `fandaws:subjectType`, `fandaws:objectType`,
`fandaws:disjointPair`, `fandaws:prologTrace`, `fandaws:suggestedRepair`.

Violation rule instances: `fandaws:TypeDisjointnessViolation`,
`fandaws:RangeMismatchViolation`, `fandaws:DomainMismatchViolation`,
`fandaws:CycleViolation`. See v1.9.1 Section 10.4 for full declarations, carried forward
unchanged.

### 10.5 UI Surface

Four surfaced item categories: ambiguous placement, disambiguation required, quarantined
axiom, dependency error. Quarantined Phase 3 axioms render the full failure trace panel.
Conversational violations (Section 3.8) are presented pre-commit through the consequence
prompt UI, not through the quarantine panel.

---

## 11. Implementation Notes

- **BFO Base Placement (v2.0):** `fan:RelationalQuality` subclasses
  `bfo:SpecificallyDependentContinuant`. All uses of `bfo:specifically_depends_on` on
  canonical instances are domain-conformant by construction. Individual relation type
  classes specialize downward per Section 3.3.
- **`bfo:inheres_in` Restriction (v2.0):** Valid only on inherence-type relation type
  classes that additionally declare `bfo:Quality`. The normalizer rejects it elsewhere.
- **Conversational Consistency Check:** Two trigger paths (Section 3.8). Both are Map
  lookups using the BFO Disjointness Map and Relation Domain/Range Index. Neither requires
  Prolog. Both integrate into the existing consequence-aware prompt UI as an additional
  consequence category. Both fire before any assertion is written to the canonical model.
- **Edge-Canonical Implementation:** Named graphs are the specification idiom. In-memory
  equivalents satisfy the same invariants in edge-canonical deployments. The spec mandates
  invariants, not mechanisms.
- **Epoch Counter:** Must be implemented immediately. The integer counter is trivially
  cheap. Stale detection machinery may be deferred to Phase 2.
- **BFO Conformance:** The full conformance argument is in Section 3.7. The position is
  Position A refined: `bfo:SpecificallyDependentContinuant` as the base, with
  principled downward specialization per relation type.
- **ExecutionGraph Provenance:** Exactly one of `fandaws:sourceCanonical` or
  `fandaws:sourceAxiom`. Carrying both or neither is a compiler error (Rule VD-2).
- **FNSR Integration Posture:** Downstream services consume the Execution Lane for binary
  logic. They query the Canonical Lane for negation records, closed-world scopes, n-ary
  canonical records, and deontic/role-type relation records where the BFO subcategory
  declaration informs reasoning. The negation lookup order in Section 7.5 is an
  integration contract that must not be bypassed.

---

## 12. Implementation Roadmap

This roadmap formalizes the path from the current Fandaws-Sentinel conversational
workbench to the full FANDAWS compilation pipeline, as agreed in the architectural review.

### Phase 1 — Fandaws-Sentinel v0.x (Current)

**Characteristics:** Single-lane. Browser-based. Zero infrastructure. Conversational
input. Export engine as primitive compiler.

**What exists:**
- In-memory graph is both canonical record and execution artifact.
- Progressive Formalization Tier 1 (bare property) and Tier 2 (BFO property).
- Export engine reads live graph and emits Turtle with exclusion list filtering.
- `verifyIntegrity()` warnings as primitive quarantine.
- BFO ingestion.

**What is missing relative to this spec:** Dual-lane separation, compilation epoch,
stale detection, RECC enforcement, conversational consistency check.

### Phase 2 — Fandaws v1.x (Next)

**Target:** Dual-lane separation. JavaScript compiler pass. Conversational consistency
check. Epoch counter.

**Additions:**
- Canonical Lane: existing in-memory graph with provenance metadata.
- Execution Lane: derived JavaScript Map/object structure built by a compiler pass after
  every mutation. Replaces the export exclusion list pattern.
- Compilation epoch counter on every execution artifact (trivially cheap integer).
- **Conversational consistency check (Sections 3.8, 5.10):** BFO Disjointness Map and
  Relation Domain/Range Index maintained in memory. Path A fires on reclassification.
  Path B fires on new assertion introduction. Both surface through the consequence-aware
  prompt UI as an additional consequence category.
- `fandaws:compilationStatus` field on all canonical records.
- RECC structural conformance enforced at normalization time via JavaScript index lookup
  (equivalent to OWL reasoner enforcement in non-edge-canonical deployments).

### Phase 3 — Fandaws v2.x (Future)

**Target:** Full pipeline per this spec. Multi-service consumption. Named graph support.

**Additions:**
- Full three-phase bulk ingestion pipeline (Phase 1 class placement, Phase 2 property
  disambiguation, Phase 3 consistency sandbox).
- Tau Prolog or JavaScript sandbox for Horn clause validation.
- Quarantine store with structured failure traces and diagnostic UI.
- Disambiguation records and merge record structure.
- Named graph support (quad store or equivalent).
- Stale detection, retraction cascading, and tier-boundary evaluation machinery.
- Multi-service Execution Lane consumption with epoch-based coherence guarantees.
- Full RECC layer enforceable by third-party OWL reasoners on exported graphs.

---

## Appendix A: Summary of Governing Rules

| Rule ID | Rule |
|---|---|
| **BFO-1** | `fan:RelationalQuality` subclasses `bfo:SpecificallyDependentContinuant` as its base BFO placement; it does not directly subclass `bfo:Quality`, `bfo:RelationalQuality` (BFO_0000145), or any other BFO node |
| **BFO-2** | Individual relation type classes declare their BFO subcategory by adding `rdfs:subClassOf bfo:Quality`, `rdfs:subClassOf bfo:Disposition`, or `rdfs:subClassOf bfo:Role` based on the semantic nature of the relation; mereological and participation relations make no subcategory declaration beyond the base |
| **BFO-3** | `bfo:inheres_in` is valid only on instances of relation type classes that declare `bfo:Quality` as a BFO subcategory; using it on mereological, deontic, or role-assignment relation types is a normalizer error |
| **SD-1** | All `fan:RelationalQuality` instances use `bfo:specifically_depends_on` as default bearer link; domain conformance is satisfied by the `bfo:SpecificallyDependentContinuant` base class placement |
| **SD-2** | `bfo:inheres_in` requires: relation type declares `bfo:Quality` subcategory AND explicit `fandaws:allowsInheresIn true`; RECC restrictions placed on `bfo:inheres_in` on the exception path |
| **CC-1** | Reclassification of any canonical concept MUST trigger Path A of the conversational consistency check before the reclassification is written to the canonical model |
| **CC-2** | Introduction of a new relation assertion between two existing canonical entities MUST trigger Path B of the conversational consistency check before the assertion is written to the canonical model |
| **CC-3** | Both conversational consistency check paths use the machine-first/human-validate pattern; no assertion is written to the canonical model without explicit human confirmation when a violation is detected |
| **CC-4** | The BFO Disjointness Map MUST include inferred disjointness computed via transitive closure through `rdfs:subClassOf` chains from explicitly declared `owl:disjointWith` pairs; a map containing only explicitly declared pairs is non-conformant |
| **CS-1** | No OWL property characteristic may be emitted except by the compiler |
| **CS-2** | All execution triples carry a compilation epoch and provenance named graph |
| **CS-3** | Stale execution triples are excluded from reasoner input |
| **CS-4** | Retracted execution triples are deleted from the active model; tombstone records retained |
| **CS-5** | `rdfs:subPropertyOf` on Execution Lane properties is compiler-only output; subject to full stale and retraction protocol; parent retraction cascades to all sub-property children |
| **NR-1** | Binary relations use `fan:towards`; n-ary relations use `fan:RelatumSlot` exclusively |
| **NR-2** | `fan:towards` on a relation type with more than one additional relatum is a normalizer error |
| **NR-3** | The compiler uses `fan:slotRole` to map relatum slots to execution predicates; `fan:slotIndex` is for ordering only |
| **NR-4** | All `fan:slotRole` values must be declared in `fandaws:RoleRegistry`; undeclared roles are a normalizer error |
| **NR-5** | FANDAWS does not perform native OWL reasoning across n-ary structures |
| **CW-1** | Absence of assertion is ontological silence unless a closed-world scope is declared |
| **CW-2** | Confirmed non-existence is represented explicitly via `fan:NegatedRelation` in the Canonical Lane |
| **CW-3** | The compiler NEVER emits `owl:NegativePropertyAssertion` or any negation construct into the Execution Lane |
| **CF-1** | Compiler rejection of a user-asserted characteristic produces a structured feedback record |
| **CF-2** | No execution artifact is emitted for a `fandaws:CompilerRejected` relation type |
| **RT-1** | Any confidence update triggers a recompilation check and tier-boundary evaluation |
| **RT-2** | Confidence downgrade crossing a tier boundary activates the Retraction Protocol atomically |
| **RT-3** | Retraction cascades to all derived artifacts: inverses, projections, dependent named graphs, and sub-property execution properties |
| **RT-4** | Retraction tombstones are retained permanently in the Canonical Lane for audit |
| **QS-1** | Quarantined axioms are never loaded into the active reasoning model |
| **QS-2** | Quarantine release triggers recompilation of all affected relation types |
| **RECC-1** | Any constraint that must be enforced without the normalizer running MUST be declared as a Tier 2 RECC restriction on the relation type class |
| **RECC-2** | Structural conformance restrictions MUST be placed directly on `bfo:specifically_depends_on` and `fan:towards`; deprecated instance properties must not appear in canonical instance records |
| **RECC-3** | Single-authority relation types MUST declare a `owl:hasValue` RECC using the inverse of `fan:isSourceOf` |
| **RECC-4** | The standalone provenance triple MUST be asserted outside the instance subject block as an independent triple |
| **RECC-5** | RECC restrictions are schema-level declarations authored on relation type classes; never generated by the compiler |
| **RECC-6** | RECC violations detected during normalization are quarantined with a structured RECC violation record |
| **SR-1** | The compiler reads `prop:has`, `prop:domain`, and `prop:range` declarations as authoritative role inventories; structural roles are never inferred from instance data |
| **SR-2** | Structural role class declarations drive execution predicate generation; RECC restrictions enforce instance conformance; neither substitutes for the other |
| **VD-1** | `fandaws:SourceAxiomGraph` contains exactly three record types: staging records, quarantine records, and raw source axioms |
| **VD-2** | Every `fandaws:ExecutionGraph` carries exactly one of `fandaws:sourceCanonical` or `fandaws:sourceAxiom`; carrying both or neither is a compiler error |
| **VD-3** | Canonical class records use the two-state compilation lifecycle; they do not participate in the epoch, stale detection, or retraction protocol |
| **VD-4** | Phase 3 quarantine records MUST carry a structured `fandaws:FailureTrace` |
| **VD-5** | `fandaws:IngestionSession` records are retained permanently; never deleted |
| **VD-6** | BFO/CCO version changes invalidate all prior Phase 1 placement decisions and all BFO subcategory declarations on relation type classes; all must be re-evaluated before the next ingestion session |
