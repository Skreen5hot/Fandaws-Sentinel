# Phase C Locked Architectural Decisions
**Companion to Phase C AVC bundles (C1 and C2)**
**Status: LOCKED — approved with C-6 clarification applied**

---

## Decision C-1: Phase Split — C1 (Internal Lifecycle) and C2 (External RECC)

**Rule:** Phase C is split into two sub-phases with a clean dependency boundary.

### C1 — Compilation Lifecycle (Internal Machinery)

Covers: full compilation status lifecycle (Uncompiled → Compiled → Stale → CompilerRejected → Retracted), confidence tier mapping, retraction protocol, five-point pre-materialization check completion.

These are internal to the compiler. No export format changes. No quarantine store. No provenance authority visible externally. The execution lane gets smarter; the export doesn't change shape.

### C2 — RECC Externalization (External-Facing Changes)

Covers: provenance authority enforcement, RECC restrictions in exports, quarantine store with structured failure traces, relation type class schemas in exports.

Depends on C1's lifecycle machinery. Retraction and CompilerRejected states must exist before RECC violations can produce them. Confidence tiers must exist before quarantine-released records can enter at reduced confidence.

### Boundary Rule

C1 can ship and be verified independently. C2 cannot ship without C1. The AVC bundles are separate: `phase-c1-avc-bundle.json` and `phase-c2-avc-bundle.json`. Both must pass for Phase C to be confirmed complete, but C1 passes first.

### Scope Table

| Subsection | C1 | C2 |
|------------|----|----|
| C.1 Full Compilation Status Lifecycle | ✓ | |
| C.2 Confidence Tier Mapping | ✓ | |
| C.3 Retraction Protocol | ✓ | |
| C.4 Provenance Authority Enforcement | | ✓ |
| C.5 RECC Restrictions in Exports | | ✓ |
| C.6 RECC Violation Quarantine | | ✓ |
| C.7 Five-Point Pre-Materialization Check | ✓ | |

---

## Decision C-2: Retraction Cascade Scope

**Rule:** In the edge-canonical execution lane, retraction cascades via `fandaws:sourceCanonical` provenance links. It does NOT cascade through the `rdfs:subClassOf` hierarchy.

### What This Means

When a restriction on "dog has fur" is retracted:

- The execution artifact for that specific restriction is marked `Retracted`.
- Any derived artifacts that carry `fandaws:sourceCanonical` pointing to the retracted canonical record are also retracted (Rule RT-3).
- Execution artifacts for ancestor concepts (mammal, organism, material entity) are NOT affected. They were compiled from their own canonical records, not from dog's.
- Execution artifacts for sibling concepts (cat, if it also has fur via its own restriction) are NOT affected. Each restriction is an independent canonical record.

### Why Not Hierarchy Cascade

In a quad-store deployment, retraction might cascade through named graph dependencies. In the edge-canonical Map, each execution artifact is keyed independently. There are no inter-artifact references that would make one artifact "dependent" on another through the hierarchy. The only dependency is the `sourceCanonical` link from execution artifact back to canonical record.

If an ancestor's restriction is retracted (e.g., "mammal has hair" is retracted), the ancestor's execution artifact is affected. Descendants that INHERITED "has hair" from mammal do not have their own execution artifacts for "has hair" — they inherit it via the `rdfs:subClassOf` chain in their own execution artifacts. The ancestor's retraction removes the source; the inheritance chain naturally reflects the absence.

### Edge Case: Sub-Property Cascade

Rule RT-3 says retraction cascades to sub-property execution properties. If `rel:has_part` is retracted, and `rel:contains_spatially` was declared `rdfs:subPropertyOf rel:has_part` in the execution lane, then `rel:contains_spatially` is also retracted. This is the one case where cascade follows a declared relationship between execution artifacts, not a `sourceCanonical` link. The cascade is: parent property retracted → all `rdfs:subPropertyOf` children retracted.

This sub-property cascade is Phase D scope (sub-property promotion comes with the ingestion pipeline). For Phase C, retraction cascades via `sourceCanonical` only. The sub-property cascade rule is documented here for completeness but is not tested in the Phase C AVC bundle.

---

## Decision C-3: Confidence Defaults

**Rule:** Every canonical record carries a `fandaws:confidence` field. The default value depends on how the record entered the system.

| Entry Path | Default Confidence | Rationale |
|-----------|-------------------|-----------|
| Conversational assertion (user typed it) | 1.0 | User asserted = fully trusted. Machine-first/human-validate: the human is authoritative. |
| Scope-resolved concept (Phase 12 copy-on-resolve) | 1.0 | User accepted the resolution. Acceptance = endorsement. The system trusts user acceptance. |
| Released quarantine record | 0.7 | System had concerns (quarantined it). Human overrode (released it). The system trusts the human but with reduced confidence reflecting the prior concern. 0.7 places it at the bottom of the "flagged" tier — materialized but annotated. |
| Imported BFO/CCO concepts | N/A | Imported concepts are ingested, not compiled. They don't carry confidence because they don't produce execution artifacts through the compilation pipeline. They are structural anchors, not compiled assertions. |

### Why 0.7 for Released Quarantine

The confidence tier boundaries from Section 4.3.3 are:

```
[0.9–1.0]  → Asserted (full trust)
[0.7–0.9)  → Flagged (materialized with annotation)
[0.5–0.7)  → Tentative (excluded from default reasoning)
< 0.5      → Not materialized
```

A released quarantine record at 0.7 enters at the bottom of the Flagged tier. It's materialized (the human said to release it), but it carries a confidence annotation that signals to downstream consumers: "this assertion had structural concerns that were overridden." A consumer choosing to exclude flagged assertions would exclude it. A consumer accepting all materialized assertions would include it. The confidence score preserves the system's prior judgment without overriding the human's decision.

### Confidence Is Mutable

Confidence can be updated after initial assignment. A released quarantine record that the user later reviews and confirms can be upgraded to 1.0. A conversational assertion that the user later questions can be downgraded. Any confidence change crossing a tier boundary triggers the retraction protocol (Decision C-4 below).

---

## Decision C-4: TentativeGraph in Edge-Canonical

**Rule:** In the edge-canonical execution lane, `fandaws:TentativeGraph` is a boolean flag on the execution artifact, not a separate data structure.

### Implementation

```javascript
// Execution artifact for a tentative restriction
{
  "@id": "fandaws:exec/restriction/dog-has-fur",
  "owl:onProperty": "fandaws:objectProperty/has",
  "owl:someValuesFrom": "fandaws:class/.../fur",
  "fandaws:compilationEpoch": 5,
  "fandaws:compilationStatus": "Compiled",
  "fandaws:confidence": 0.6,
  "fandaws:tentative": true    // ← flag, not a separate graph
}
```

### Export Behavior

The export engine reads from the execution lane. Tentative artifacts are included or excluded based on an export option:

- Default export: tentative artifacts are EXCLUDED. The export contains only assertions with confidence ≥ 0.7.
- Full export (opt-in): tentative artifacts are INCLUDED with `fandaws:tentative true` annotation. Downstream consumers see the flag and can filter.

The spec's "excluded from default reasoning" maps to "excluded from default export." A third-party reasoner loading the default export never sees tentative assertions. A diagnostic consumer loading the full export sees them annotated.

### Why Not a Separate Map

A separate `_tentativeLane` Map would create a third data structure alongside `_canonicalGraph` and `_executionLane`. The complexity cost exceeds the benefit. A boolean flag on the artifact achieves the same filtering capability with zero structural overhead. The export engine already iterates over execution artifacts — adding a `if (artifact.tentative && !options.includeTentative) continue` check is trivial.

---

## Decision C-5: Stale Detection Trigger Scopes

**Rule:** Three trigger scopes determine what gets recompiled when a change is detected.

### Scope 1: Single Artifact

**Trigger:** A single canonical restriction is created, updated, or deleted. Confidence score changes on a single record.

**Recompile:** Only that restriction's execution artifact. Other artifacts in the execution lane are unaffected.

**Example:** User changes "dog has fur" to "dog has hair." Only the dog-fur execution artifact is marked Stale, retracted, and the new dog-hair artifact is compiled. Cat's artifacts, mammal's artifacts — untouched.

### Scope 2: Relation Type

**Trigger:** A relation type schema is modified. A RECC restriction is added, modified, or removed on a relation type class.

**Recompile:** All execution artifacts whose canonical record uses that relation type. The compiler iterates over all canonical restrictions matching the type and recompiles each.

**Example:** The RECC domain restriction on `has_part` is changed from `fan:materialEntity` to `fan:independentContinuant`. Every restriction using `has_part` needs recompilation because the pre-materialization check criteria changed.

**Note:** Relation type schemas don't exist as explicit entities in Phase C (they come in Phase D). This scope is defined now but exercised only when relation type classes are introduced. For Phase C, the trigger is: "a RECC structural conformance rule changes" → all restrictions are rechecked.

### Scope 3: Full Graph

**Trigger:** BFO/CCO version change. Ingestion session completion. Major schema change.

**Recompile:** Everything. All canonical records are re-evaluated. All execution artifacts are regenerated. All epochs increment.

**Example:** BFO 2020 is updated to a hypothetical BFO 2021. All BFO markers change. All disjointness map pairs change. All pre-materialization checks must re-run. Full recompilation.

### Current Phase B Behavior

Phase B's `compile()` runs after every mutation and recompiles the affected artifact. This is Scope 1 by default. Phase C adds the ability to detect Scope 2 and Scope 3 triggers and recompile accordingly. Scope 1 remains the common case.

### Stale Window

Between a trigger event and the recompilation, the affected execution artifacts are in `fandaws:Stale` status. They carry `fandaws:invalidatedAt` and `fandaws:invalidationReason`. The export engine excludes Stale artifacts (Rule CS-3). The stale window should be as short as possible — ideally, stale detection and recompilation happen in the same synchronous pass. But the status exists to handle the case where recompilation is deferred (e.g., batch processing in Phase D).

---

## Decision C-6: Relation Type Class Schemas — Hardcoded Seed Set

**Rule:** Phase C ships with a hardcoded seed set of relation type class schemas. These are bundled with the codebase, similar to how BFO is bundled and ingested. User-defined relation type classes come in Phase D.

### Seed Set

Three relation type classes covering the three canonical forms from FANDAWS v2.1 Section 5.6:

**1. Inherence-Type (`fandaws:relationType/inheres_in`)**

```turtle
fandaws:relationType/inheres_in a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Quality ;
    rdfs:label "inheres in relation" ;
    fandaws:allowsInheresIn true ;
    fandaws:bfoSubcategory bfo:Quality ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:quality ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] .
```

**2. Mereological (`fandaws:relationType/has_part`)**

```turtle
fandaws:relationType/has_part a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ;
    rdfs:label "has part relation" ;
    fandaws:isTransitive true ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom fan:materialEntity ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:materialEntity ] .
```

**3. Deontic (`fandaws:relationType/obligated_to`)**

```turtle
fandaws:relationType/obligated_to a owl:Class ;
    rdfs:subClassOf fan:RelationalQuality ,
                    bfo:Disposition ;
    rdfs:label "obligated to relation" ;
    fandaws:bfoSubcategory bfo:Disposition ;
    rdfs:subClassOf
        [ rdf:type owl:Restriction ;
          owl:onProperty bfo:specifically_depends_on ;
          owl:someValuesFrom bfo:Agent ] ,
        [ rdf:type owl:Restriction ;
          owl:onProperty fan:towards ;
          owl:someValuesFrom fan:Action ] .
```

### How the Seed Set Is Used

The export engine emits these schemas verbatim into the exported Turtle when the graph contains restrictions that use the corresponding verb patterns. If the graph has `has` restrictions, the inherence-type and/or mereological schemas are emitted. If the graph has `obligated_to` restrictions, the deontic schema is emitted.

The schemas are NOT stored in the canonical graph or the execution lane. They are bundled static assets, like the BFO Turtle file. The export engine references them at serialization time.

### Mapping User Verbs to Relation Types

The mapping from user verbs to relation type classes is:

| User Verb | Relation Type Class | RECC Applied? | Rationale |
|-----------|-------------------|---------------|-----------|
| `has` (Tier 1 bare property) | None | No | "Has" is semantically polysemous — it could be mereological ("car has engine"), inherence ("apple has redness"), or deontic ("doctor has obligation"). Applying any single relation type's RECC to an unresolved verb is a category error. Tier 1 bare properties compile to the execution lane with `fandaws:objectProperty/has` but carry no structural conformance restriction. RECC activates only when the verb is resolved to a specific relation type. |
| BFO-matched verb (Tier 2A, e.g., `inheres in`) | Determined by the BFO property's domain/range | Yes | The BFO property's declared domain and range determine which relation type class schema applies. The verb is resolved — RECC can enforce. |
| Unresolved non-"has" verbs (Tier 1) | None | No | Same principle as bare "has." Tier 1 = semantically unresolved = no RECC. Compiles with `fandaws:objectProperty/{verb}` but no structural conformance restriction. |

**Critical principle:** RECC enforcement requires a resolved relation type. Progressive Formalization Tier 1 is the "we don't know what this means yet" stage. RECC is the "we know what this means and can enforce constraints" stage. You cannot enforce constraints on meaning you have not resolved. Forcing mereological RECC on bare "has" would quarantine "a doctor has an obligation" as a false-positive TypeDisjointnessViolation.

### Why Hardcoded and Not Generated

Rule RECC-5: "RECC restrictions are schema-level declarations authored on relation type class schemas; never generated by the compiler." Hardcoding the seed set respects this rule — the schemas are authored artifacts, not compiler output. The compiler reads them; it does not create them.

User-defined relation type classes (Phase D) will be authored through the ingestion pipeline's Phase 2 property disambiguation. That pipeline doesn't exist yet. For Phase C, the seed set provides enough schema coverage to test RECC enforcement in exports without requiring the full ingestion pipeline.

---

## Decision C-7: Quarantine Store Structure

**Rule:** The quarantine store is a separate `_quarantineStore` Map on the StateAdapter, parallel to `_executionLane`. Quarantined records are never in the canonical graph or the execution lane.

### Structure

```javascript
// StateAdapter
{
  _canonicalGraph: Map,      // Canonical Lane (existing)
  _executionLane: Map,       // Execution Lane (Phase B)
  _quarantineStore: Map,     // Quarantine Store (Phase C2)
  _disjointnessMap: Set      // BFO Disjointness Map (Phase B)
}
```

### Quarantine Record Shape

```javascript
{
  quarantineId: "fandaws:quarantine/001",
  type: "QuarantineRecord",
  sourceSystem: "ExternalOntologyX",       // or "conversational"
  importedAt: "2026-04-17T08:00:00Z",
  quarantineReason: "RECC structural conformance violation",
  quarantineStatus: "PendingReview",       // PendingReview | Rejected | Released
  rawAxiom: "dog subClassOf (has_part some running)",
  failureTrace: {
    violationRule: "TypeDisjointnessViolation",
    relation: "has_part",
    subjectNode: "dog",
    objectNode: "running",
    subjectType: "MaterialEntity",
    objectType: "Process",
    disjointPair: ["MaterialEntity", "Process"],
    suggestedRepair: "Review BFO placement of 'running'. Expected: MaterialEntity. Current: Process."
  }
}
```

### Lifecycle

```
Assertion fails normalization or RECC check
    ↓
QuarantineRecord created in _quarantineStore
    → quarantineStatus: PendingReview
    ↓
Human reviews via diagnostic UI (or M2M agent)
    ↓
    ├── Rejected → quarantineStatus: Rejected
    │              (record retained permanently for audit)
    │
    └── Released → quarantineStatus: Released
                   → canonical record created with confidence 0.7
                   → compile() fires on the new canonical record
                   → execution artifact materialized into Flagged tier
```

### What Quarantine Is NOT

- Quarantined records are NOT in the canonical graph. They don't participate in the concept hierarchy, don't have `skos:broader`, don't appear in exports.
- Quarantined records are NOT in the execution lane. They don't have execution artifacts, don't carry epochs, don't appear in OWL reasoning.
- Quarantine is NOT deletion. The record exists and is queryable. It's just not part of the active ontological model.

### Export of Quarantine Records

Quarantine records are NOT included in the default Turtle export. They can be exported separately as a diagnostic artifact (quarantine report). This is a Phase C2 diagnostic UI concern, not a compilation concern.

---

## Decision Audit Trail

| Decision | Description | Status |
|----------|-------------|--------|
| C-1 | Phase split: C1 (internal lifecycle) + C2 (external RECC) | LOCKED |
| C-2 | Retraction cascade via sourceCanonical, not hierarchy | LOCKED |
| C-3 | Confidence defaults: conversational=1.0, resolved=1.0, released=0.7, imported=N/A | LOCKED |
| C-4 | TentativeGraph = boolean flag, not separate structure | LOCKED |
| C-5 | Three stale detection trigger scopes: artifact, type, full | LOCKED |
| C-6 | Relation type class schemas: hardcoded seed set; Tier 1 bare properties carry NO RECC (clarified) | LOCKED |
| C-7 | Quarantine store: separate _quarantineStore Map on StateAdapter | LOCKED |

All decisions LOCKED. C-6 clarified per SME review: bare "has" does not map to mereological RECC. Tier 1 unresolved verbs carry no RECC. RECC activates only on resolved relation types (Tier 2A or Phase D user-defined).
