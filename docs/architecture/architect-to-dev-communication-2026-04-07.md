# Fandaws-Sentinel: Architect Communication to Development Team

**Date:** April 7, 2026
**From:** Aaron (Semantic Architect)
**To:** Development Team
**Subject:** Phase A Review, Architectural Decisions, and Forward Direction

---

## 1. Phase A Delivery: Accepted

Phase A is accepted. The implementation is solid — 1,991 passing tests, zero failures, BFO ingestion in 55ms, and a hand-rolled Turtle parser that honors the no-runtime-deps constraint. Well done.

The four architectural decisions you made during implementation are all correct:

1. **Hand-rolled Turtle parser over `n3`** — Right call. The spec offered `n3` as an option but the no-runtime-deps rule takes precedence. 370 lines for a deterministic, browser-safe parser that handles the BFO subset is exactly the kind of engineering this project needs.

2. **Multi-word verb reconstitution** — Smart. The NL parser splits "inheres in" into separate tokens, and you reconstitute them at lookup time. This is the pragmatic solution to a real tokenization problem that the spec didn't anticipate. Document this in the codebase so future contributors understand why the verb-to-property lookup does a "verb + leading preposition" scan.

3. **Dual-form equivalence index** — Correct. Legacy data may use prefixed (`bfo:BFO_0000040`) or full-URI (`http://purl.obolibrary.org/obo/BFO_0000040`) forms. Storing both ensures phantom migration catches everything. This is defensive engineering that will save debugging time later.

4. **SHA-256 at 11ms vs spec's 1ms target** — Acceptable. Pure-JS SHA on a 50KB file is the bottleneck. The `crypto.subtle` optimization can happen when it matters (larger ontologies in Phase B). For BFO, 11ms is fine — it's still a 5x speedup over full re-ingestion.

---

## 2. Critical Fix: Remove `owl:equivalentProperty owl:topObjectProperty`

During the export review, we identified a critical semantic error carried over from pre-ingestion code. The latest Workbench export confirms it is still present:

```turtle
<https://fandaws.org/schema/objectProperty/has>
    a owl:ObjectProperty ;
    rdfs:label "has" ;
    owl:equivalentProperty owl:topObjectProperty .
```

**The `owl:equivalentProperty` triple must be removed.** Equating `fandaws:objectProperty/has` to `owl:topObjectProperty` tells a reasoner that every class is related to every other class by "has." It creates a universal Cartesian product that destroys the utility of any downstream reasoning.

**The fix is a one-line deletion.** Remove ONLY the `owl:equivalentProperty owl:topObjectProperty` triple. The property declaration itself is correct and must stay:

```turtle
<https://fandaws.org/schema/objectProperty/has>
    a owl:ObjectProperty ;
    rdfs:label "has" .
```

**Do not remove the property declaration.** The bare `owl:ObjectProperty` with no domain, no range, and no equivalence is the Tier 1 Human Frame — it's the deliberate design pattern described in Section 3. A reasoner can traverse it but can't infer anything dangerous from it. That's intentional.

---

## 3. Architectural Pattern: Progressive Formalization

The `owl:equivalentProperty owl:topObjectProperty` was a flawed attempt to solve a real problem: when a user says "dog has fur," they know the relationship exists but haven't specified the formal OWL predicate. We need to capture their intent without breaking the reasoner.

The solution is already implemented. It just needs to be understood as a deliberate design pattern, not a workaround.

### Tier 1: The Human Frame

When a user asserts a property ("dog has fur"), and the verb ("has") doesn't match any ingested BFO object property label, the system mints `fandaws:property/has` — a regular `owl:ObjectProperty` with:

- A label (`rdfs:label "has"`)
- No domain constraint
- No range constraint
- No transitivity, reflexivity, or any other logical characteristic
- **No equivalence to anything**

A reasoner can traverse this property (it's a real object property, not an annotation). But it can't infer anything from it beyond "these two things are connected by something called 'has.'" That's honest. That's what the user actually knows. The graph is navigable and queryable, but the reasoner doesn't hallucinate inferences from a vague verb.

### Tier 2: The Machine Frame

When evidence exists to formalize the relationship, the system upgrades the property IRI:

**Path A — Label match (implemented in Phase A):** The user types "pet inheres in animal." The verb "inheres in" matches BFO's `bfo:BFO_0000197` by label. The restriction gets `owl:onProperty: bfo:BFO_0000197` directly. No placeholder needed. The verb-to-property index you built handles this.

**Path B — Heuristic enrichment (parked for v0.2):** The BFO Relationship Classifier examines the BFO types of both endpoints (pet = SpecificallyDependentContinuant, animal = IndependentContinuant) and determines the correct BFO object property. This upgrades existing `fandaws:property/has` placeholders to precise BFO IRIs.

### The Maturation Path

```
User says "dog has fur"
  → owl:onProperty: fandaws:property/has       (Tier 1 — human frame, no inference)

User says "pet inheres in animal"
  → owl:onProperty: bfo:BFO_0000197            (Tier 2A — label match, full BFO semantics)

Future: BFO Classifier runs on "dog has fur"
  → owl:onProperty: bfo:BFO_0000196            (Tier 2B — heuristic, bearer_of)
```

The Tier 1 edge is never wrong — it's incomplete. The system progressively completes it as evidence accumulates. This is knowledge maturation, not error correction.

### IRI Prefix Alignment Check

The earlier export used `fandaws:objectProperty/has`. The Restriction Structural Correction spec uses `fandaws:property/has`. **Confirm which prefix the codebase currently mints.** If it's `objectProperty/`, the `emitVerbPropertyDeclarations()` filter (which checks for `fandaws:property/`) will miss them. Align to one prefix — the spec says `fandaws:property/`.

---

## 4. Live Export Review: BFO + User Concepts

The latest Workbench export (41 concepts: 36 BFO + 5 user-created) was reviewed. BFO ingestion is correct. Three new issues found in the user concept layer.

### 4.1 Confirmed Correct (BFO Layer)

- ✅ 36 BFO classes with Fandaws IRIs as `@id`
- ✅ `owl:equivalentClass` on every ingested concept pointing to source BFO IRI
- ✅ `skos:broader` and `rdfs:subClassOf` both point to Fandaws parent IRIs on ingested concepts (self-contained subclass tree)
- ✅ Entity is root (no parent)
- ✅ `owl:imports bfo:bfo.owl` with ontology IRI
- ✅ `fandaws:graph/workbench a owl:Ontology` (conditional typing)
- ✅ Definitions from BFO source in `skos:definition`
- ✅ `skos:altLabel` preserved (disposition, process, role, GDC)
- ✅ `prov:wasDerivedFrom` on every ingested concept
- ✅ Internal metadata stripped (`fandaws:isImported`, `fandaws:source`, etc. absent from export)

### 4.2 Issue: `inheritBfoCategory` Emits Phantom BFO IRIs (Medium)

Every user-created concept carries `bfo:BFO_0000001` in `rdfs:subClassOf`:

```turtle
<.../organism> rdfs:subClassOf <.../material-entity>, bfo:BFO_0000001 .
<.../animal>   rdfs:subClassOf <.../organism>, bfo:BFO_0000001 .
<.../dog>      rdfs:subClassOf <.../animal>, <.../restriction/...>, bfo:BFO_0000001 .
<.../hair>     rdfs:subClassOf <.../filamentou-biomaterial>, bfo:BFO_0000001 .
```

`bfo:BFO_0000001` (Entity) IS ingested — it exists as `fandaws:class/fc34d97d.../entity` with `owl:equivalentClass bfo:BFO_0000001`. But the raw BFO IRI in `rdfs:subClassOf` is a phantom reference — it doesn't resolve to any node in the graph. This violates the self-contained subclass tree principle from the Ontology Ingestion spec (Section 3.3).

**Root cause:** `inheritBfoCategory` reads the ingested concept's `owl:equivalentClass` to find the BFO class IRI, then writes that raw BFO IRI back into `rdfs:subClassOf` on the user concept. It should write the **Fandaws Entity IRI** instead.

**Fix:** In `inheritBfoCategory`, after determining the BFO category, look up the corresponding Fandaws IRI via the equivalence index (the same index used for phantom migration). Store the Fandaws IRI in `rdfs:subClassOf`, not the raw `bfo:` IRI. The reasoner reaches the BFO IRI via the `owl:equivalentClass` chain.

```
Current:  organism.rdfs:subClassOf = [..., bfo:BFO_0000001]        ← phantom
Correct:  organism.rdfs:subClassOf = [..., fandaws:class/.../entity] ← resolves
```

This is the same self-contained principle that drove the v1.2 revision of the Ontology Ingestion spec — it applies to `inheritBfoCategory` just as it applies to `skos:broader`. The walk logic is already correct; only the output IRI form needs to change.

### 4.3 Issue: Canonicalization Truncation on "filamentous" (Low)

```turtle
IRI:            .../filamentou-biomaterial     ← missing 's'
rdfs:label:     "filamentous biomaterial"      ← correct
skos:prefLabel: "filamentou biomaterial"       ← truncated
```

The `simplify()` function is truncating "filamentous" to "filamentou" in the canonical form. This propagates to both the IRI slug and `skos:prefLabel`. The `rdfs:label` preserves the original input correctly.

**Fix:** Investigate whether this is a regex boundary, max-length, or suffix-stripping issue in `identity-simplification.js`. Low priority — cosmetic, doesn't affect graph integrity or navigation. But it will produce incorrect labels for any word ending in "-ous" (e.g., "continuous," "ambiguous," "autonomous").

### 4.4 Noted: Restriction Fields Reflect Pre-Spec State (Expected)

The restriction on "dog has hair":

```turtle
<.../restriction/...dog--hair>
    owl:onProperty <https://fandaws.org/schema/objectProperty/has> ;
    owl:someValuesFrom <.../hair> ;
    fandaws:propertyLabel "hair" .
```

Missing: `fandaws:verbLabel`, `fandaws:source`. Uses `objectProperty/has` prefix, not `property/has`. This is expected — the OWL Restriction Structural Correction spec is queued but not yet implemented. Once it ships, new restrictions will carry all three fields and use the correct prefix. Existing restrictions will need the fixture migration described in that spec. No action needed now.

### 4.5 Items to Verify

| Item | Check | Priority |
|------|-------|----------|
| `owl:equivalentProperty` removal | Delete the `owl:topObjectProperty` equivalence triple (Section 2) | **High** |
| `inheritBfoCategory` phantom IRIs | Change output to Fandaws IRI via equivalence index (Section 4.2) | **Medium** |
| `owl:equivalentClass` internal representation | Confirm JSON-LD stores as array `["bfo:BFO_0000040"]`, not bare string | Medium |
| Verb property IRI prefix | Confirm codebase mints `fandaws:property/has`, not `fandaws:objectProperty/has` | Medium |
| Canonicalization truncation | Investigate "filamentous" → "filamentou" in `simplify()` (Section 4.3) | Low |
| Property index persistence | Confirm whether the 45-entry index is rebuilt from bundled Turtle on every `loadGraph()` or persisted in graph metadata | Low |

---

## 5. Approved Specs: Current State

Here's the complete spec landscape as of today. This is your implementation roadmap.

### Ready for Implementation (Queued)

| Spec | Version | Status | Estimated Scope |
|------|---------|--------|----------------|
| Homonym Detection & Duplicate Resolution | v1.3 | Approved | ~400 lines impl, ~350 lines tests, 4 phases |
| OWL Restriction Structural Correction | v1.1 | Approved | ~55 lines impl, ~150 lines tests, 2 phases |
| Ontology Ingestion (includes Restriction Source Fidelity) | v1.4 | **Phase A delivered.** Phase B deferred to Workbench v0.2. | Phase A complete. Phase B ~140 lines. |

### Implementation Order

**The Restriction Structural Correction should ship before Homonym Detection.** Both are approved, but the restriction fix changes the property workflow's restriction construction — every test fixture with restrictions needs updating. Do the fixture migration once, not twice.

Recommended order:
1. **Restriction Structural Correction** (small, mechanical, touches fixtures)
2. **Homonym Detection Phase A** (proximity computation — independent, no fixture impact)
3. **Homonym Detection Phase B** (reclassification confirmation — builds on Phase A)
4. **Homonym Detection Phase C** (homonym creation — builds on Phase B)
5. **Homonym Detection Phase D** (downstream disambiguation — builds on Phase C)

### Architectural Direction (Reference Only — Not Implementation Tasks)

| Spec | Version | Purpose |
|------|---------|---------|
| FNSR Topological Federation Engine (Termidium) | v1.2 | Defines federation layer. Explains why Fandaws makes certain data model decisions. NOT a Fandaws-Sentinel implementation task. |
| FNSR Contradiction Resolution | Integrated into Termidium v1.2 | Fork-and-project architecture. Consumes Fandaws graphs as inputs. Lives outside `src/core/`. |

These specs exist so you understand the downstream context. They inform design decisions (hidden label index, provenance fields, restriction data model) but generate zero tasks for Fandaws-Sentinel.

---

## 6. Phase B Deferred Items (Workbench v0.2)

The following were intentionally deferred from Phase A. They're tracked, not forgotten:

| Item | Spec Reference | Blocked By |
|------|---------------|------------|
| Tree panel imported concept badge + collapse toggle | Ontology Ingestion §8.1 | Workbench v0.2 UI |
| Homonym auto-qualification at ingestion time | Ontology Ingestion §7.2 | Homonym Detection Phase C |
| Post-qualification disambiguation prompt | Ontology Ingestion §7.4 | Homonym Detection Phase D |
| `excludeImported` export option | Ontology Ingestion §9.3 | Workbench v0.2 export UI |
| Upstream class removal + deprecation marking | Ontology Ingestion §2.2 | Re-ingestion diff pipeline |
| Federated lazy-loading config rejection | Termidium spec | Not applicable to Fandaws-Sentinel |
| User-initiated ontology import via file upload | Ontology Ingestion §12 Phase B | Workbench v0.2 import panel |

---

## 7. Data Model Summary (Current State After Phase A)

For reference, here's the complete field layout of a Fandaws-Sentinel concept after all approved specs:

### Ingested Concept (BFO class)

```json
{
  "@id": "fandaws:class/{uuid5-from-source}/material-entity",
  "@type": ["owl:Class", "skos:Concept"],
  "rdfs:label": "material entity",
  "skos:prefLabel": "material entity",
  "skos:broader": "fandaws:class/{uuid5}/independent-continuant",
  "skos:definition": "A material entity is an independent continuant...",
  "owl:equivalentClass": ["bfo:BFO_0000040"],
  "rdfs:subClassOf": ["fandaws:class/{uuid5}/independent-continuant"],
  "dcterms:created": "2026-04-07T19:03:11.132Z",
  "prov:wasDerivedFrom": ["http://purl.obolibrary.org/obo/BFO_0000040"],
  "fandaws:ingestSource": { "...ingestion envelope..." },
  "fandaws:isImported": true,
  "fandaws:algorithmicDefinition": ""
}
```

### User Concept (classified under BFO)

**Current state** (has `inheritBfoCategory` phantom — see Section 4.2):
```json
{
  "@id": "fandaws:class/{uuid5}/organism",
  "@type": ["owl:Class", "skos:Concept"],
  "rdfs:label": "organism",
  "skos:prefLabel": "organism",
  "skos:broader": "fandaws:class/{uuid5}/material-entity",
  "rdfs:subClassOf": [
    "fandaws:class/{uuid5}/material-entity",
    "bfo:BFO_0000001"
  ],
  "fandaws:algorithmicDefinition": "Organism is a Material entity."
}
```

**Correct state** (after `inheritBfoCategory` fix):
```json
{
  "@id": "fandaws:class/{uuid5}/organism",
  "@type": ["owl:Class", "skos:Concept"],
  "rdfs:label": "organism",
  "skos:prefLabel": "organism",
  "skos:broader": "fandaws:class/{uuid5}/material-entity",
  "rdfs:subClassOf": [
    "fandaws:class/{uuid5}/material-entity",
    "fandaws:class/{uuid5}/entity",
    { "@type": "owl:Restriction", "owl:onProperty": "fandaws:property/has", "owl:someValuesFrom": "fandaws:class/{uuid5}/fur", "fandaws:source": "user", "..." }
  ],
  "fandaws:algorithmicDefinition": "Organism is a Material entity that has fur."
}
```

Note: `bfo:BFO_0000001` (phantom) replaced by `fandaws:class/{uuid5}/entity` (resolves to ingested Entity node). The reasoner chains `fandaws:Entity → owl:equivalentClass → bfo:BFO_0000001`.

### Key Invariants

| Rule | Enforced By |
|------|-------------|
| Every `skos:broader` resolves to a node in the graph | Classification workflow + ingestion |
| Every `rdfs:subClassOf` (non-restriction) resolves to a node in the graph | Classification workflow + ingestion + phantom migration + `inheritBfoCategory` fix |
| BFO category markers in `rdfs:subClassOf` use Fandaws IRIs, not raw `bfo:` IRIs | `inheritBfoCategory` (after fix — see Section 4.2) |
| `skos:broader` is authoritative; `rdfs:subClassOf` is derived from it | Set in same mutation, always |
| `owl:equivalentClass` is an array | Ingestion adapter |
| `owl:onProperty` is opaque — may be `fandaws:property/`, `bfo:`, or any IRI | Property workflow + export engine |
| `fandaws:source` on restrictions: `"user"` or `"ingested"` | Property workflow + ingestion adapter |
| Imported concepts are read-only in v0.1 | `importedConceptGuard` |
| Internal `fandaws:` metadata stripped from export | Export exclusion list |
| `fandaws:property/{verb}` declared as `owl:ObjectProperty` in export — with NO equivalence assertions | `emitVerbPropertyDeclarations()` |
| BFO properties (`bfo:`) NOT declared in export | Same function, prefix filter |

---

## 8. Questions? Flag Them.

If anything in this communication or the underlying specs is ambiguous, raise it now. The Q&A cycle on the Ontology Ingestion spec (nine questions, all answered in v1.4) was exactly the right process — you caught real implementation issues that improved the spec. Keep doing that.

The next implementation target is the OWL Restriction Structural Correction (v1.1). It's ~55 lines of implementation, ~150 lines of tests, and it clears the path for the Homonym Detection work. Let me know when you're ready to start.

— Aaron
