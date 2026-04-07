# Feature Specification: Ontology Ingestion

**System:** Fandaws-Sentinel
**Version:** 1.4
**Status:** Approved for Implementation
**Dependencies:** Classification Workflow (Phase 2), Export Engine (Phase 3), InMemoryStateAdapter indices (Phase 3), OWL Restriction Structural Correction (v1.1, approved), Homonym Detection (v1.3, approved)
**Blocked by:** None for Phase A (BFO ingestion). Phase B (general ontology ingestion) blocked by Workbench v0.2 UI for import controls.
**Scope:** Fandaws-Sentinel single-graph ingestion only. Federation-layer ingestion (cross-agent, cross-scope) is out of scope — see FNSR Termidium spec.
**Supersedes:** Restriction Source Fidelity v1.0 (integrated into this spec as Section 11).

**v1.4 Changes:** Nine developer-review clarifications: (1) RSF-07 marked Phase B — no ingested restrictions in `rdfs:subClassOf` during Phase A; `fandaws:source: "ingested"` is forward-compatibility infrastructure. (2) Verb-to-property resolution does not change object resolution — object concept must exist before property assertion. (3) `owl:equivalentClass` is an array from day one (future CCO classes may have multiple equivalences). (4) BFO ingested on first open of existing graphs via `loadGraph()` trigger. (5) Precise "pristine" definition added to Section 3.6. (6) `verifyIntegrity()` emits warnings (not errors) for unresolved phantom IRIs. (7) `fandaws:contentHash` is SHA-256 of raw source file bytes; re-ingestion short-circuits on hash match. (8) `owl:imports` subject IRI uses `fandaws:graph/{graphId}` with conditional `owl:Ontology` typing. (9) Homonym disambiguation uses hidden label lookup (option b) — bare label triggers prompt when both BFO and user concept match.

**v1.3 Changes:** Semantic policy revision. Added Section 3.6: Semantic Identity Lifecycle (pristine/extended/diverged). Narrowed "self-contained" to subclass tree. Declared `skos:broader` authoritative. Clarified re-ingestion preservation rules as defensive. Added verb-to-property label match fragility note. Fixed `owl:imports` to ontology IRI. Clarified source axioms are archived.

**v1.2 Changes:** Four revisions from semantic review: (1) `rdfs:subClassOf` on ALL concepts now points to Fandaws parent IRIs, not raw BFO IRIs. (2) Added verb-to-property resolution (Section 6.5). (3) Integrated Restriction Source Fidelity spec (Section 11). (4) Strengthened `excludeImported` export commitment (Section 9.3).

**v1.1 Changes:** Corrected the semantic relationship between ingested concepts and their source classes. Ingested concepts now carry `owl:equivalentClass` (identity of categories) pointing to the source IRI, not `rdfs:subClassOf` (which wrongly implied the Fandaws concept is a narrower subclass). Added Section 3.5 clarifying the three-way distinction between `owl:equivalentClass`, `owl:sameAs`, and `skos:closeMatch`.

---

## 1. Problem Statement

### 1.1 The Gap in the Current Graph

Fandaws-Sentinel graphs reference BFO classes they cannot see. The current Turtle export shows:

```turtle
<.../organism> rdfs:subClassOf bfo:BFO_0000040 .
<.../mammal>   rdfs:subClassOf bfo:BFO_0000001 .
```

These `bfo:` IRIs point into the void. There is no concept node in the graph for `BFO_0000040` (MaterialEntity) or `BFO_0000001` (Entity). The system can't traverse the BFO hierarchy, can't validate that a user's BFO mapping is consistent, and can't show the user where their concept sits in the BFO tree.

### 1.2 What Ingestion Does

Ingestion reads an external ontology file (starting with BFO 2020 in Turtle format), translates its classes and structural axioms into Fandaws-Sentinel concepts, and loads them into the graph alongside user-created concepts. After ingestion:

- The BFO hierarchy is navigable via `skos:broader`
- Every `rdfs:subClassOf` on every concept points to a Fandaws IRI that exists in the graph — no phantom references
- Ingested BFO object properties are available for verb resolution in the property workflow
- The Workbench tree panel shows the full ontology structure

### 1.3 What Ingestion Does Not Do

Ingestion does not replace the conversational pipeline. Users still create concepts by saying "a dog is an animal." Ingested concepts provide the foundational scaffolding — the upper-level hierarchy that user concepts attach to. Ingestion does not run on every keystroke, does not require infrastructure, and does not violate any of Fandaws-Sentinel's six architectural constraints.

---

## 2. The Four Critical Decisions

### 2.1 Decision 1: IRI Derivation — From Source IRI, Not Label

Ingested concepts receive Fandaws IRIs derived deterministically from the **source ontology IRI**, not the label:

```javascript
const ingestedIri = generateConceptIri(sourceIri, INGESTION_SCOPE);
// where INGESTION_SCOPE = 'ontology-import'
// uses uuid5(FANDAWS_NAMESPACE, `ontology-import:${sourceIri}`)
```

For BFO class `http://purl.obolibrary.org/obo/BFO_0000040` (MaterialEntity):

```
Input:  uuid5(FANDAWS_NAMESPACE, "ontology-import:http://purl.obolibrary.org/obo/BFO_0000040")
Output: fandaws:class/{deterministic-uuid}/material-entity
```

**Why source IRI, not label:** Labels change across ontology versions. Source IRIs are stable — they are the permanent identity of the class. Re-ingestion of the same source ontology is idempotent: same source IRI → same Fandaws IRI → concept already exists → no mutation.

**The slug tracks the label at ingestion time.** The UUID portion is the stable identity. If BFO renames the class, re-ingestion produces the same UUID with an updated slug. The slug is cosmetic — it is not used for lookup.

**Why Fandaws IRIs, not BFO IRIs as `@id`:** The Fandaws IRI is the *living* node. It accumulates user knowledge over time — concepts classified under it, scope narrowing against it, ERS routing through it, Inspector displaying it. The BFO IRI is the *static interop anchor* — the same IRI in every BFO-compliant system on earth. `owl:equivalentClass` bridges them. Collapsing them into one IRI would put Fandaws application state on a BFO IRI, which is semantically wrong. Fandaws is not making claims about BFO. It's making claims about its own representation that happens to be equivalent to BFO.

### 2.2 Decision 2: Re-Ingestion Semantics — User Content Preserved

When re-ingesting an updated version of a source ontology:

| Scenario | Behavior |
|----------|----------|
| Class unchanged | No mutation (idempotent) |
| Class label changed | Update `skos:prefLabel`, `rdfs:label`. IRI unchanged. |
| New class added | Create new concept |
| Class removed upstream | Concept **retained** in graph with `fandaws:upstreamStatus: "deprecated"` annotation. Not deleted. Children not orphaned. |
| User added properties to ingested concept | **Preserved.** Ingestion never modifies user-added restrictions, relationships, or properties. |
| User reclassified ingested concept | **Preserved.** User's `skos:broader` takes precedence. Upstream `skos:broader` recorded in `fandaws:upstreamBroader` for reference. |

The invariant: **ingestion never destroys user work.**

**Note on read-only guard (Section 8.2):** In v0.1, the `importedConceptGuard` prevents users from modifying imported concepts through the conversational pipeline. The preservation rules above are **defensive re-ingestion resilience** — they describe what happens IF user content exists on an ingested concept (from a future version where the guard is relaxed, from direct graph manipulation, or from legacy data). They do not imply the guard is currently relaxed. The guard and the preservation rules coexist: the guard prevents modification today; the preservation rules protect against data loss tomorrow.

### 2.3 Decision 3: Eager Loading for Foundational Ontologies

For BFO (~35 classes) and CCO core (~80 classes), eager loading at graph initialization from bundled files. No network required. Lazy loading deferred to Phase 12 (ScopeResolver) for large ontologies.

### 2.4 Decision 4: IntegrationAdapter, Not Core

The Turtle parser lives in `src/adapters/integration/turtle-ingestion-adapter.js` using the `n3` library. Core receives normalized JSON-LD. The adapter is deterministic: same Turtle file → same JSON-LD output.

---

## 3. Ingested Concept Data Model

### 3.1 Field Layout

```json
{
  "@id": "fandaws:class/{uuid5-from-source-iri}/material-entity",
  "@type": ["owl:Class", "skos:Concept"],
  "rdfs:label": "material entity",
  "skos:prefLabel": "material entity",
  "skos:broader": "fandaws:class/{uuid5}/independent-continuant",
  "skos:definition": "A material entity is an independent continuant that has some portion of matter as proper or improper continuant part.",
  "owl:equivalentClass": ["bfo:BFO_0000040"],
  "rdfs:subClassOf": ["fandaws:class/{uuid5}/independent-continuant"],
  "dcterms:created": "2026-04-07T12:00:00Z",
  "prov:wasDerivedFrom": ["http://purl.obolibrary.org/obo/BFO_0000040"],
  "fandaws:ingestSource": {
    "@type": "fandaws:IngestionRecord",
    "fandaws:sourceOntology": "http://purl.obolibrary.org/obo/bfo/2020/bfo-core.ttl",
    "fandaws:sourceClassIri": "http://purl.obolibrary.org/obo/BFO_0000040",
    "fandaws:sourceVersion": "BFO 2020",
    "fandaws:ingestedAt": "2026-04-07T12:00:00Z",
    "fandaws:contentHash": "sha256:abc123..."
  },
  "fandaws:isImported": true,
  "fandaws:algorithmicDefinition": ""
}
```

### 3.2 Key Fields Explained

| Field | Purpose |
|-------|---------|
| `@id` | Fandaws IRI derived from source IRI via `uuid5`. Stable across re-ingestion. The living node. |
| `skos:broader` | Points to parent concept's **Fandaws IRI**. The BFO hierarchy is translated into Fandaws `skos:broader` links. |
| `owl:equivalentClass` | The **source BFO IRI(s)** (e.g., `["bfo:BFO_0000040"]`). Array — one element per source equivalence. Declares that the Fandaws concept IS the same category as the source class(es). The static interop anchor. Phase A: one element (BFO). Phase B+: may have multiple (BFO + CCO). |
| `rdfs:subClassOf` | The **Fandaws parent IRI** — same target as `skos:broader`. May also contain restriction objects. Does NOT contain raw BFO IRIs. |
| `skos:definition` | Source ontology's definition. Distinct from `fandaws:algorithmicDefinition`. |
| `prov:wasDerivedFrom` | Source class IRI. Provenance — how this concept entered the graph. |
| `fandaws:ingestSource` | Full ingestion envelope: source ontology, version, timestamp, content hash. |
| `fandaws:isImported` | Boolean. UI: collapse by default, exclude from user counts, read-only guard. |
| `fandaws:algorithmicDefinition` | Empty string on ingested concepts. Source ontology's definition lives in `skos:definition`. |

### 3.3 The Self-Contained Subclass Tree

After ingestion, **every IRI in `rdfs:subClassOf` and `skos:broader` on every concept resolves to a node in the graph.** The subclass tree is self-contained — no phantom references in the hierarchy.

The graph is NOT fully self-contained in the strong sense. External IRIs appear in: `owl:equivalentClass` (source BFO class IRIs), `owl:onProperty` (BFO object property IRIs after verb resolution), and `fandaws:sourceAxioms` (opaque source axioms). These are explicit external anchors — the graph knows it references external ontologies and declares `owl:imports` to tell consumers where to find them.

Both `skos:broader` and `rdfs:subClassOf` point to the **same Fandaws parent IRI**:

**Ingested concept (MaterialEntity):**
```json
{
  "owl:equivalentClass": ["bfo:BFO_0000040"],
  "rdfs:subClassOf": ["fandaws:class/{uuid}/independent-continuant"],
  "skos:broader": "fandaws:class/{uuid}/independent-continuant"
}
```

**User concept (organism, classified under MaterialEntity):**
```json
{
  "rdfs:subClassOf": ["fandaws:class/{uuid}/material-entity"],
  "skos:broader": "fandaws:class/{uuid}/material-entity"
}
```

The raw `bfo:` IRI appears in exactly one place: `owl:equivalentClass` on the ingested concept. A reasoner chains: `organism → rdfs:subClassOf → fandaws:MaterialEntity → owl:equivalentClass → bfo:BFO_0000040`. The subclass tree is self-contained; the interop bridge is explicit.

**Authority rule:** `skos:broader` is the **authoritative** hierarchy field. `rdfs:subClassOf` is **derived** from it. Whenever `skos:broader` changes (reclassification, scope narrowing), `rdfs:subClassOf` is updated to match in the same mutation. They never drift because they are always set together. If a consumer observes a discrepancy between the two, `skos:broader` is correct and `rdfs:subClassOf` should be rebuilt.

### 3.4 Why `owl:equivalentClass`, Not `rdfs:subClassOf` for Source Identity

`rdfs:subClassOf` means "every instance of X is also an instance of Y" — subsumption implies the Fandaws concept is *narrower* than the BFO class. It's not narrower. It IS the BFO class, locally represented. `owl:equivalentClass` means "these two class IRIs denote the same category" — identity, not subsumption.

### 3.5 The Three Identity Relations

| Relation | Domain | Meaning | When to use |
|----------|--------|---------|-------------|
| `owl:equivalentClass` | Classes | "Same category." | Ingested concept → source class. Identity. Emitted on export when concept is pristine (Section 3.6). |
| `rdfs:subClassOf` | Classes | "Every instance of X is an instance of Y." | Used for hierarchy. Also emitted on export for extended concepts (Section 3.6). |
| `skos:closeMatch` | Concepts | "Approximately similar." | NOT used for ingestion. Emitted on export for diverged concepts (Section 3.6). |
| `owl:sameAs` | Individuals | "Same thing in the world." | NOT used — Fandaws is T-Box (classes), not A-Box (individuals). |

### 3.6 Semantic Identity Lifecycle

An imported concept's relationship to its source class is not static. The concept begins as a semantic alias and may progressively diverge as users modify it. The export relation must honestly reflect this state.

**The internal field `owl:equivalentClass` is permanent.** It records what source class the Fandaws concept was ingested from. It is provenance — it never changes, regardless of user modifications. It is NOT emitted directly in the export. Instead, the export engine reads the concept's modification state to decide which external relation to emit.

**The `fandaws:locallyModified` field** tracks the modification state:

| State | `fandaws:locallyModified` | Condition | Export relation emitted |
|-------|--------------------------|-----------|----------------------|
| **Pristine** | absent or `null` | No user modifications. Concept's modeling content is identical to source class. | `owl:equivalentClass` → "This IS the BFO class." |
| **Extended** | `"extended"` | User added properties or children to the concept, but did not reclassify it. The concept is the source class plus local assertions. | `rdfs:subClassOf` → "This is a local specialization of the BFO class." |
| **Diverged** | `"diverged"` | User reclassified the concept (changed `skos:broader`). The concept's position in the hierarchy no longer matches the source ontology. | `skos:closeMatch` → "This was originally the BFO class but has been locally remodeled." |

**Precise definition of "pristine":** A concept is pristine when (a) it has no `rdfs:subClassOf` restriction objects beyond those present at ingestion (which for BFO in Phase A means zero restrictions — BFO's anonymous restrictions are archived in `fandaws:sourceAxioms`, not placed in `rdfs:subClassOf`), and (b) its `skos:broader` matches its ingested value (if `fandaws:upstreamBroader` is present, the concept has been reclassified and is NOT pristine; if `fandaws:upstreamBroader` is absent, the current `skos:broader` IS the ingested value). "Pristine" refers to the concept's modeling content, not its byte-level representation — fields like `@id`, `fandaws:isImported`, and `fandaws:ingestSource` are always different from the source class.

**How the flag is set:**

- On ingestion: `fandaws:locallyModified` is absent (pristine).
- If the `importedConceptGuard` is relaxed in a future version and the property workflow adds a restriction to an imported concept: set `fandaws:locallyModified: "extended"`.
- If the user reclassifies an imported concept (changes `skos:broader`): set `fandaws:locallyModified: "diverged"`.
- If the user removes all local modifications (returns concept to pristine state): clear `fandaws:locallyModified`.

**In v0.1, all imported concepts are pristine** because the read-only guard prevents modification. The lifecycle machinery exists in the data model and export engine but is not exercised until the guard is relaxed.

**Export behavior:**

```javascript
function emitSourceRelations(concept) {
  const sourceIris = concept['owl:equivalentClass']; // Array
  if (!sourceIris || sourceIris.length === 0) return []; // not an ingested concept

  const modified = concept['fandaws:locallyModified'];

  let predicate;
  if (!modified) {
    predicate = 'owl:equivalentClass'; // Pristine — full identity
  } else if (modified === 'extended') {
    predicate = 'rdfs:subClassOf';     // Extended — local specialization
  } else if (modified === 'diverged') {
    predicate = 'skos:closeMatch';     // Diverged — approximate match only
  }

  // Emit one triple per source equivalence
  return sourceIris.map(iri => ({ predicate, object: iri }));
}
```

**Why this works:** The reasoner gets an honest signal. A pristine concept can be fully unified with BFO (`owl:equivalentClass`). An extended concept is recognized as a subclass of BFO that adds local properties. A diverged concept is recognized as merely related to BFO. The degradation is automatic, auditable, and reversible.

**`fandaws:locallyModified` is internal metadata.** It is NOT emitted in the export (see Section 9.4 export exclusion list). The export engine uses it to select the export relation, then discards it.

---

## 4. Source Annotation Mapping

### 4.1 Predicate Translation Table

| Source Predicate | Fandaws Field | Notes |
|-----------------|---------------|-------|
| `rdfs:label` | `rdfs:label`, `skos:prefLabel` | Primary label. Canonicalized for `skos:prefLabel`. |
| `rdfs:comment` | `skos:definition` | BFO uses `rdfs:comment` for definitions. |
| `skos:definition` | `skos:definition` | Direct mapping. |
| `obo:IAO_0000115` | `skos:definition` | OBO Foundry definition annotation. |
| `skos:altLabel` | `skos:altLabel` | Preserved as-is. |
| `skos:example` | `skos:example` | Preserved if present. |
| `rdfs:subClassOf` (named class) | `skos:broader` (Fandaws parent IRI) + `rdfs:subClassOf` (Fandaws parent IRI) + `owl:equivalentClass` (own source IRI) | All hierarchy pointers use Fandaws IRIs. Source identity via equivalentClass. |
| `rdfs:subClassOf` (anonymous restriction) | Preserved in `fandaws:sourceAxioms` | Complex restrictions passed through. Not translated into Fandaws restriction model. |
| `owl:disjointWith` | Preserved in `fandaws:sourceAxioms` | Structural axiom preserved for validation. |
| `dc:identifier` | `fandaws:sourceIdentifier` | Preserved for reference. |
| `dc:creator`, `dc:contributor` | Not imported | Author metadata not relevant to concept semantics. |

### 4.2 Priority for Definition Field

1. `skos:definition` (most specific)
2. `obo:IAO_0000115` (OBO Foundry standard)
3. `rdfs:comment` (general fallback)

---

## 5. The BFO Ingestion Pipeline

### 5.1 Input

BFO 2020 core ontology in Turtle format. Ships as bundled file: `data/ontologies/bfo-2020-core.ttl`. No network required.

### 5.2 Pipeline Steps

```
1. TurtleIngestionAdapter reads bfo-2020-core.ttl
2. n3 parser produces triples
3. Adapter groups triples by subject IRI
4. Adapter extracts owl:ObjectProperty declarations → builds property label index
5. For each class subject:
   a. Mint Fandaws IRI from source IRI (uuid5)
   b. Extract label, definition, subClassOf (parent)
   c. Build parent map (source IRI → Fandaws IRI)
   d. Set owl:equivalentClass to the concept's own source IRI
   e. Set rdfs:subClassOf to the Fandaws parent IRI (looked up via parent map)
   f. Set skos:broader to the same Fandaws parent IRI
   g. Construct Fandaws concept JSON-LD
6. Adapter outputs: { concepts: [...], objectProperties: [...] }
7. Knowledge engine receives arrays
8. For each concept: check if @id already exists
   a. Exists + unchanged → skip (idempotent)
   b. Exists + changed → update label/definition (preserving user content)
   c. Not exists → create via bulk mutation
9. Store objectProperties in ingested property index
10. StateAdapter applies mutations
11. _rebuildIndices() runs once (bulk rebuild, not per-concept)
12. Graph now contains BFO hierarchy as navigable Fandaws concepts
```

### 5.3 Bulk Mutation

Ingestion does not call `processClassification()`. It produces a single `GraphMutation` with all additions. The StateAdapter applies the full set and rebuilds indices once. Target: <100ms for BFO.

### 5.4 Determinism Guarantee

Same Turtle file → same concept array → same graph. Verified by sorting concepts by `@id`, using `uuid5`, content-hashing the source file, and CI test asserting byte equality across two ingestions.

**`fandaws:contentHash` computation:** SHA-256 of the raw source file bytes, before parsing. No canonicalization step, no dependency on parser output format. This is the simplest, most reproducible hash.

**Re-ingestion short-circuit:** On re-ingestion, the pipeline compares the new file's hash against the stored `fandaws:contentHash` on any existing ingested concept from the same source ontology. If they match, the entire pipeline is skipped — no parsing, no concept construction, no mutation check. This reduces re-ingestion of an unchanged BFO from ~100ms to ~1ms.

```
1. Compute sha256(newFileBytes)
2. Find any concept with fandaws:ingestSource.fandaws:sourceOntology matching this source
3. Compare sha256 against that concept's fandaws:ingestSource.fandaws:contentHash
4. Match → skip entire pipeline (return immediately)
5. Mismatch → run full pipeline (class-by-class diff)
```

### 5.5 Pipeline Trigger for Existing Graphs

New graphs receive BFO ingestion during creation. Existing pre-ingestion graphs receive BFO ingestion on first open.

When `loadGraph()` deserializes an existing graph, the ingestion pipeline checks whether BFO has already been applied:

```
1. deserialize() rebuilds graph from JSON
2. Check: any concept with fandaws:ingestSource.fandaws:sourceOntology matching BFO ontology IRI?
3. If no → run BFO ingestion pipeline → run phantom reference migration (Section 6.4) → rebuild indices
4. If yes → check contentHash for re-ingestion short-circuit (Section 5.4)
```

This is the same pipeline as new graph creation — the only difference is that existing graphs may have phantom BFO references to migrate. The user sees the graph with BFO already present on open; there is no "open, then wait for ingestion" split. The <100ms target applies to this path as well.

---

## 6. Hierarchy Translation

### 6.1 BFO Class Hierarchy → Fandaws `skos:broader` and `rdfs:subClassOf`

```
Source (BFO Turtle):
  bfo:BFO_0000040 rdfs:subClassOf bfo:BFO_0000004 .
  (MaterialEntity is a subclass of IndependentContinuant)

Fandaws (after ingestion):
  fandaws:class/{uuid}/material-entity
    owl:equivalentClass → bfo:BFO_0000040                           (identity)
    rdfs:subClassOf     → fandaws:class/{uuid}/independent-continuant (Fandaws parent)
    skos:broader        → fandaws:class/{uuid}/independent-continuant (same Fandaws parent)
```

Both `rdfs:subClassOf` and `skos:broader` point to the Fandaws IRI of the parent. The raw BFO parent IRI (`bfo:BFO_0000004`) does not appear on the child concept — it's accessible via the parent's `owl:equivalentClass`. The graph is self-contained.

### 6.2 Root Concept Handling

BFO's root class (`bfo:BFO_0000001`, Entity) has no `rdfs:subClassOf`. In Fandaws, this becomes a root concept (no `skos:broader`). It appears at the top level of the tree panel.

### 6.3 User Concepts Attach to Ingested Concepts

After BFO is ingested, a user says "an organism is a material entity." The classification workflow:

1. Parses "organism" (subject) and "material entity" (object)
2. `findConceptsByCanonical("material entity")` finds the ingested BFO concept
3. Creates "organism" with `skos:broader` pointing to the ingested concept's Fandaws IRI
4. Sets `rdfs:subClassOf` to the **same Fandaws parent IRI** — `fandaws:class/{uuid}/material-entity`
5. ERS routes "organism" based on the BFO category of its parent (reads parent's `owl:equivalentClass` → `bfo:BFO_0000040`)

No phantom IRIs. Both `skos:broader` and `rdfs:subClassOf` point to the same Fandaws node that exists in the graph.

### 6.4 Migration of Existing BFO References

Pre-ingestion graphs contain `rdfs:subClassOf: bfo:BFO_0000040` on user concepts — phantom references. After ingestion, these should be rewritten to point to the corresponding Fandaws IRI.

**Migration step (runs once, after BFO ingestion on an existing graph):**

```javascript
function migratePhantomBfoReferences(graph, equivalenceIndex) {
  // equivalenceIndex: Map<bfo IRI, Fandaws IRI> built from ingested concepts
  for (const concept of graph['fandaws:concepts']) {
    if (concept['fandaws:isImported']) continue; // skip ingested concepts themselves

    const subClassOf = concept['rdfs:subClassOf'] || [];
    concept['rdfs:subClassOf'] = subClassOf.map(entry => {
      if (typeof entry === 'string' && equivalenceIndex.has(entry)) {
        return equivalenceIndex.get(entry); // bfo:BFO_0000040 → fandaws:class/{uuid}/material-entity
      }
      return entry; // restrictions and non-BFO IRIs unchanged
    });
  }
}
```

This is a one-time migration per graph. After migration, no user concept references raw BFO IRIs in `rdfs:subClassOf`. The equivalence index is built during ingestion (Step 5c of the pipeline).

**Unresolved phantom IRIs:** If a user concept references a source IRI that has no corresponding ingested concept (e.g., a CCO reference before CCO is ingested), the migration leaves it unchanged. `verifyIntegrity()` emits a **warning** (not an error) for these:

```javascript
if (typeof entry === 'string' && !conceptIris.has(entry)) {
  warnings.push({
    concept: concept['@id'],
    field: 'rdfs:subClassOf',
    unresolvedIri: entry,
    reason: 'References a class not present in the graph. May resolve when its source ontology is ingested.'
  });
}
```

Warnings are logged but do not fail the integrity check. The self-contained subclass tree claim (Section 3.3) holds for concepts whose source ontologies have been ingested; unresolved phantoms from not-yet-ingested ontologies are expected transitional state.

### 6.5 Verb-to-Property Resolution

BFO defines object properties (`bfo:BFO_0000052` / `inheres_in`, `bfo:BFO_0000176` / `part_of`, etc.). After ingestion, these are available in the graph. When the user asserts a property, the property workflow should use the BFO object property IRI when the user's verb matches an ingested property label, rather than minting a redundant `fandaws:property/{verb}`.

**Ingested Property Index:** During ingestion (pipeline Step 4), the adapter extracts all `owl:ObjectProperty` declarations from the source Turtle and builds an index keyed by label:

```javascript
// Built during ingestion, stored on the adapter/state
const ingestedPropertyIndex = new Map();
// e.g., "inheres in" → "bfo:BFO_0000052"
//       "part of"     → "bfo:BFO_0000176"
//       "has part"    → "bfo:BFO_0000110"
```

**Resolution in property workflow:** Before minting `fandaws:property/{verb}`, the workflow checks the index:

```javascript
function resolveVerbToProperty(verb, ingestedPropertyIndex) {
  const label = verb.toLowerCase().trim();

  // Check ingested properties by label
  const match = ingestedPropertyIndex.get(label);
  if (match) return match; // bfo:BFO_0000052

  // No match — mint local verb IRI (existing behavior)
  return mintVerbPropertyIri(verb); // fandaws:property/has
}
```

**Priority:** Exact label match → BFO IRI. No match → local `fandaws:property/{verb}`. The parked BFO Relationship Classifier heuristic is a future third tier that would resolve verbs like "has" to specific BFO properties based on endpoint types.

**Consequence:** When a user types "pet inheres in animal," the restriction gets `owl:onProperty: bfo:BFO_0000052` — the real BFO object property. When they type "pet has animal," it gets `fandaws:property/has` — the placeholder. No namespace pollution for verbs that match BFO labels.

**Object concept still required:** Verb-to-property resolution only changes what goes in `owl:onProperty`. It does not change the object resolution flow. "Pet inheres in animal" still requires "animal" to be a known concept — either already in the graph or created in a prior turn. If "animal" is unknown, the existing property-concept reconciliation flow fires (objectResolution prompt: "What is animal?"). Test scenarios for verb resolution must include setup turns that pre-classify the object concept.

**Label match fragility:** Exact label matching is a convenience lookup, not a semantic identity mechanism. Known failure modes:

- **Synonyms miss:** "part of" matches `bfo:BFO_0000176`, but "is a part of" does not.
- **Punctuation variants miss:** "inheres_in" (underscore) does not match "inheres in" (space).
- **Inverse labels miss:** "has part" matches `bfo:BFO_0000110`, but "part of" is a different property (`bfo:BFO_0000176`).
- **Language variants miss:** Non-English labels are not indexed.

The label index handles the easy cases (user types the exact BFO label). For everything else, the fallback to `fandaws:property/{verb}` is safe — the local verb IRI is a valid placeholder that the parked BFO Relationship Classifier heuristic can later upgrade by examining BFO type pairs rather than relying on labels.

---

## 7. Homonym Detection Interaction

### 7.1 The Problem

If a user has already created a concept labeled "entity" and BFO ingestion imports a concept also labeled "entity," the canonical labels collide.

### 7.2 Resolution: Ingestion-Time Homonym Check

| Check Result | Action |
|-------------|--------|
| No match | Create the ingested concept normally. |
| Match with same `prov:wasDerivedFrom` | Already ingested. Skip (idempotent). |
| Match with different or no `prov:wasDerivedFrom` | Label collision. Auto-qualify: "entity (bfo)" and "entity (user)". Both get `skos:hiddenLabel: "entity"`. |

### 7.3 Auto-Qualification vs Prompt

BFO ingestion (automatic at graph init): auto-qualifies without prompting. User-initiated import (Phase B): batch collision resolution table in import panel.

### 7.4 Post-Qualification Resolution Flow

After auto-qualification, the bare label "entity" no longer appears in `canonicalLabelToIri` (both are now "entity (bfo)" and "entity (user)"). When the user types "an organism is an entity," the resolution chain from the Homonym Detection spec applies:

1. `findConceptsByCanonical("entity")` → zero results (both qualified)
2. `findConceptsByHiddenLabel("entity")` → two results (both have `skos:hiddenLabel: "entity"`)
3. Disambiguation prompt: "Which entity? [entity (bfo)] [entity (user)]"
4. User selects → classification proceeds with selected concept

This is consistent with the existing homonym detection workflow. The prompt fires once per ambiguous bare label reference. After selection, users learn to type the qualified label directly ("entity (bfo)"), which resolves via canonical match with no prompt.

For foundational classification, users will almost always pick the BFO version. A future UX enhancement (not this spec) could add a preference: "When a bare label matches both a BFO concept and a user concept, default to BFO." This would auto-resolve the common case without prompting. The default behavior is the honest one — prompt, don't assume.

---

## 8. Workbench Display

### 8.1 The `fandaws:isImported` Flag

- **Tree panel:** Imported concepts collapsed by default. Toggle to expand.
- **Search:** Included but visually badged ("BFO", "CCO").
- **Concept count:** "12 concepts (+ 35 BFO)".
- **Inspector:** Shows ingestion provenance. Imported concepts are read-only.

### 8.2 Read-Only Constraint on Imported Concepts

Guard in `processClassification()`, `processProperty()`, `processRelationship()`:

```javascript
if (subjectConcept['fandaws:isImported'] && action !== 'query') {
  return {
    ...noOp,
    prompts: [{
      'fandaws:promptType': 'importedConceptGuard',
      'fandaws:text': `"${rawSubject}" is an imported concept from ${source}. Create a subclass to add properties.`,
    }]
  };
}
```

Users CAN classify their own concepts under imported concepts. Only modifications to the imported concept itself are blocked.

---

## 9. Export Engine Integration

### 9.1 Exported Triples for Ingested Concepts

```turtle
fandaws:class/{uuid}/material-entity
  a owl:Class, skos:Concept ;
  owl:equivalentClass bfo:BFO_0000040 ;
  rdfs:subClassOf fandaws:class/{uuid}/independent-continuant ;
  skos:broader fandaws:class/{uuid}/independent-continuant ;
  rdfs:label "material entity" ;
  skos:prefLabel "material entity" ;
  skos:definition "A material entity is an independent continuant..." .
```

The `owl:equivalentClass` triple connects the Fandaws IRI to the BFO IRI for reasoner unification.

### 9.2 Source Ontology Import Declaration

The export engine emits an `owl:imports` declaration using the **ontology IRI** (not the document URL). The subject is the graph's own identity IRI:

```turtle
fandaws:graph/{graphId}
  a owl:Ontology ;
  owl:imports <http://purl.obolibrary.org/obo/bfo.owl> .
```

**Subject IRI:** The `fandaws:graph/{graphId}` IRI is the graph's existing identity, already constructed by the export engine for graph-level metadata. The `a owl:Ontology` typing is added **conditionally** — only when the graph contains any concepts with `fandaws:isImported: true`. Graphs with no imported concepts do not receive `owl:Ontology` typing or `owl:imports` declarations.

**Ontology IRI vs document URL:** `owl:imports` references the ontology's logical identity, not its physical location. BFO's ontology IRI is `http://purl.obolibrary.org/obo/bfo.owl`; its Turtle document might be at `bfo-2020-core.ttl` or another URL. Consumers resolve the ontology IRI to a document via standard OWL mechanisms (content negotiation, catalog files).

### 9.3 Export Mode: Exclude Imported Concepts

The `excludeImported: true` export option produces a graph with **zero Fandaws proxy IRIs** for BFO classes. The export engine:

1. Skips all concepts with `fandaws:isImported: true`
2. Rewrites `rdfs:subClassOf` on user concepts: replaces Fandaws parent IRIs with the parent's `owl:equivalentClass[0]` value (the primary source BFO IRI)
3. Rewrites `skos:broader` similarly (or omits if consumer doesn't need SKOS)
4. Strips `owl:equivalentClass` triples (both IRIs are no longer in the graph)
5. Retains `owl:imports` declaration so the consumer knows to load BFO separately

The resulting export looks exactly like a pre-ingestion Fandaws graph: user concepts with direct `rdfs:subClassOf bfo:...` assertions. This satisfies the purist perspective while the full export (default) satisfies the self-contained graph perspective.

### 9.4 Export Exclusion List

The following `fandaws:` fields are application metadata and are NOT emitted in any export format:

| Field | Reason |
|-------|--------|
| `fandaws:isImported` | UI state — downstream reasoners don't care |
| `fandaws:ingestSource` | Ingestion provenance — internal bookkeeping |
| `fandaws:source` | Restriction origin ("user" / "ingested") — redundancy check state |
| `fandaws:routingRecord` | ERS routing — internal pipeline state |
| `fandaws:restrictionKind` | Internal restriction classification |
| `fandaws:attachedTo` | Internal restriction→concept linkage |
| `fandaws:upstreamStatus` | Re-ingestion tracking |
| `fandaws:upstreamBroader` | Re-ingestion tracking |
| `fandaws:sourceIdentifier` | Source ontology internal IDs |
| `fandaws:locallyModified` | Semantic identity lifecycle state (Section 3.6) — drives export relation selection, not emitted itself |
| `fandaws:algorithmicDefinition` | Emitted separately as `fandaws:algorithmicDefinition` annotation property (already handled) |

Fields that ARE emitted: `owl:onProperty`, `owl:someValuesFrom`, `fandaws:propertyLabel`, `fandaws:verbLabel`, `fandaws:epistemicRegister`, `skos:*`, `rdfs:*`, `dcterms:*`, `prov:*`. The source identity relation (`owl:equivalentClass`, `rdfs:subClassOf`, or `skos:closeMatch`) is emitted conditionally based on the concept's modification state — see Section 3.6.

---

## 10. Source Axiom Handling

### 10.1 What Fandaws Translates

| Axiom Type | Treatment |
|-----------|-----------|
| `rdfs:subClassOf` (named class) | Translated to `skos:broader` + `rdfs:subClassOf` (both Fandaws parent IRI). Own source IRI → `owl:equivalentClass`. |
| `rdfs:label` | Translated to `rdfs:label` + `skos:prefLabel` |
| `rdfs:comment` / `skos:definition` / `obo:IAO_0000115` | Translated to `skos:definition` |
| `skos:altLabel` | Preserved |
| `owl:ObjectProperty` declarations | Indexed for verb-to-property resolution (Section 6.5) |

### 10.2 What Fandaws Passes Through

`owl:disjointWith`, anonymous restrictions, `owl:equivalentClass` (source-level, between source classes), property chain axioms → stored in `fandaws:sourceAxioms`.

**These axioms are archived, not actively enforced.** The core pipeline does not reason over them. The Validator does not check them. They are preserved for future downstream consumers (OCE, OntoGrade, external reasoners) that can interpret OWL DL axioms. If enforcement of source axioms (e.g., BFO disjointness checking) is needed, it requires a separate validation spec — it is not provided by ingestion.

### 10.3 What Fandaws Drops

`dc:creator`, `dc:contributor`, `owl:versionInfo` on individual classes, `rdfs:isDefinedBy`. Classes with `owl:deprecated true` are not ingested (logged as skipped).

---

## 11. Restriction Source Fidelity (Integrated from Standalone Spec)

This section addresses two pre-ingestion prerequisites that ensure restrictions from different sources (user conversational pipeline vs ontology ingestion) coexist correctly.

### 11.1 Fix 1: Preserve Source `owl:onProperty` IRI

The export engine and all restriction-reading code paths must treat `owl:onProperty` as an opaque IRI. They must not assume it starts with `fandaws:property/`, must not coerce it, and must not fail on unexpected prefixes.

The `emitVerbPropertyDeclarations()` function (from the OWL Restriction Structural Correction spec) declares only `fandaws:property/` IRIs as `owl:ObjectProperty`. BFO property IRIs (`bfo:BFO_0000052`, etc.) are silently skipped — they are defined by their source ontologies.

```javascript
// In emitVerbPropertyDeclarations():
if (prop && prop.startsWith('fandaws:property/')) {
  verbIris.add(prop);  // Declare local verb properties only
}
// bfo: properties, cco: properties, etc. → silently skipped
```

### 11.2 Fix 2: `fandaws:source` Field on Restrictions

Every restriction carries `fandaws:source` indicating its origin:

| Value | Meaning | Set by |
|-------|---------|--------|
| `"user"` | Created by conversational property workflow | `property-workflow.js` |
| `"ingested"` | Created by ontology ingestion | `turtle-ingestion-adapter.js` |

**Property workflow** adds `fandaws:source: 'user'` to every new restriction:

```javascript
const restriction = {
  '@type': 'owl:Restriction',
  'owl:onProperty': verbIri,
  'owl:someValuesFrom': objectConceptIri,
  'fandaws:propertyLabel': propertyLabel,
  'fandaws:verbLabel': verb,
  'fandaws:source': 'user',
  // ... other fields
};
```

**Ingestion adapter** sets `fandaws:source: 'ingested'` on restrictions translated from source ontology axioms.

### 11.3 Redundancy Check Scoping

The property workflow's redundancy check scans only `fandaws:source: "user"` restrictions:

```javascript
const existingRestrictions = getRestrictions(concept)
  .filter(r => r['fandaws:source'] === 'user' || !r['fandaws:source']);

const duplicate = existingRestrictions.find(
  r => r['fandaws:propertyLabel'] === newPropertyLabel
);
```

Missing `fandaws:source` is treated as `"user"` (backward compatibility — all pre-fix restrictions were user-created).

A user CAN create a restriction with the same `fandaws:propertyLabel` as an ingested restriction, **but only when the user's verb does NOT label-match an ingested BFO property** (Section 6.5). If the verb matches a BFO property, the workflow uses the BFO IRI in `owl:onProperty` rather than minting a local one — no coexistence needed because the property IRI is the same.

### 11.4 Export: `fandaws:source` Is Stripped

`fandaws:source` is application metadata. It does not appear in any export format. See Section 9.4 (Export Exclusion List).

---

## 12. Implementation Phasing

### Phase A: BFO Ingestion + Restriction Source Fidelity

**Scope:** Ingest BFO 2020 core from bundled Turtle file. Auto-loads on new graph creation. Read-only imported concepts. Verb-to-property resolution. `fandaws:source` on restrictions. Export exclusion list.

**Changes:**

- New: `src/adapters/integration/turtle-ingestion-adapter.js` (~250 lines) — Turtle parser, concept constructor, annotation mapper, IRI minting, homonym check, object property index builder.
- New: `data/ontologies/bfo-2020-core.ttl` — Bundled BFO source file.
- `src/core/knowledge-engine/knowledge-engine.js` (~20 lines) — `importedConceptGuard`. Phantom BFO reference migration on first ingestion.
- `src/core/knowledge-engine/property-workflow.js` (~20 lines) — `fandaws:source: 'user'` on restrictions. `resolveVerbToProperty()` check before minting verb IRI. Redundancy scoping to user restrictions.
- `src/adapters/state/in-memory-state-adapter.js` (~10 lines) — Bulk mutation support.
- `src/export/triple-extractor.js` (~15 lines) — Export exclusion list. Verify `owl:onProperty` passthrough. `owl:imports` declaration.
- `docs/workbench/js/panels/tree-panel.js` (~30 lines) — Imported concept collapse/toggle.
- `docs/workbench/js/panels/inspector.js` (~15 lines) — Ingestion provenance display.
- `docs/workbench/js/panels/converse.js` (~10 lines) — `importedConceptGuard` prompt.

**Test cases:**

| ID | Description | Expected |
|----|-------------|----------|
| ING-01 | Ingest BFO from Turtle file | 35 concepts created, all `fandaws:isImported: true` |
| ING-02 | BFO hierarchy navigable via `skos:broader` | Entity → Continuant → ... → MaterialEntity traversable |
| ING-03 | Re-ingest same BFO file | Zero mutations (idempotent) |
| ING-04 | IRI derived from source IRI | `uuid5` from BFO IRI matches expected |
| ING-05 | User creates concept under imported parent | organism.skos:broader AND organism.rdfs:subClassOf both = MaterialEntity Fandaws IRI |
| ING-05a | Ingested concept carries `owl:equivalentClass` array | MaterialEntity.owl:equivalentClass === ["bfo:BFO_0000040"] (array with one element in Phase A) |
| ING-05b | Ingested concept's `rdfs:subClassOf` is Fandaws parent IRI | MaterialEntity.rdfs:subClassOf = fandaws:class/{uuid}/independent-continuant (NOT bfo:BFO_0000004) |
| ING-06 | User tries to modify imported concept | importedConceptGuard prompt |
| ING-07 | Label collision with user concept | Auto-qualified "entity (user)" and "entity (bfo)" |
| ING-08 | `prov:wasDerivedFrom` set correctly | Points to source BFO IRI |
| ING-09 | `fandaws:ingestSource` envelope complete | All fields present |
| ING-10 | Export includes `owl:equivalentClass` triples | Fandaws → BFO IRI bridge exported |
| ING-11 | Export emits `owl:imports` declaration | References BFO ontology IRI (`bfo.owl`), not document URL |
| ING-12 | Serialize/deserialize roundtrip preserves ingestion metadata | All fields survive |
| ING-13 | Determinism: ingest twice, assert byte equality | Identical graphs |
| ING-14 | `verifyIntegrity()` passes after ingestion | No violations |
| ING-15 | Workbench tree shows imported concepts collapsed | `fandaws:isImported` flag respected |
| ING-16 | `skos:definition` populated from BFO `rdfs:comment` | Definition present |
| ING-17 | Deprecated BFO classes skipped | `owl:deprecated true` not ingested |
| ING-18 | Bulk mutation performance | BFO ingestion <100ms |
| ING-19 | Phantom BFO reference migration | Existing `rdfs:subClassOf: bfo:BFO_0000040` rewritten to Fandaws IRI |
| ING-20 | Verb "inheres in" resolves to `bfo:BFO_0000052` | Property index label match |
| ING-21 | Verb "has" mints `fandaws:property/has` (no BFO match) | Fallback to local verb IRI |
| ING-22 | Ingested object property index built from BFO | All BFO object properties indexed by label |
| ING-23 | Export emits `owl:equivalentClass` for pristine imported concept | No `fandaws:locallyModified` → `owl:equivalentClass` in Turtle output |
| ING-24 | Export emits `rdfs:subClassOf` for extended imported concept | `fandaws:locallyModified: "extended"` → `rdfs:subClassOf` to source IRI in output (future — guard relaxed) |
| ING-25 | Export emits `skos:closeMatch` for diverged imported concept | `fandaws:locallyModified: "diverged"` → `skos:closeMatch` to source IRI in output (future — guard relaxed) |
| ING-26 | Existing graph trigger: BFO ingested on first open | Open pre-ingestion graph → BFO concepts created, phantom references migrated |
| ING-27 | Re-ingestion short-circuit on hash match | Same BFO file → contentHash matches → pipeline skipped (~1ms, no mutations) |
| ING-28 | Homonym disambiguation after auto-qualification | Bare "entity" → hidden label lookup → prompt with "entity (bfo)" and "entity (user)" |
| ING-29 | `owl:imports` subject IRI uses `fandaws:graph/{graphId}` | Conditional `owl:Ontology` typing only when imported concepts exist |
| ING-30 | Unresolved phantom IRI produces warning not error | `rdfs:subClassOf: cco:XXX` (no CCO ingested) → `verifyIntegrity()` warning, not failure |
| RSF-01 | User restriction has `fandaws:source: "user"` | Field present |
| RSF-02 | Legacy restriction (no `fandaws:source`) treated as user | Redundancy check includes it |
| RSF-03 | Export emits `owl:onProperty` as-is for `fandaws:property/has` | No coercion |
| RSF-04 | Export emits `owl:onProperty` as-is for `bfo:BFO_0000052` | No coercion, no declaration |
| RSF-05 | Export declares `fandaws:property/has` as `owl:ObjectProperty` | Declaration emitted |
| RSF-06 | Export does NOT declare `bfo:BFO_0000052` | BFO properties skipped |
| RSF-07 | User restriction coexists with ingested restriction (same label, different `owl:onProperty`) | Both present — Phase B test (requires source ontology with class-level restrictions; BFO has none) |
| RSF-08 | User restriction with same label as existing user restriction | Redundancy check catches it |
| RSF-09 | Serialize/deserialize roundtrip preserves `fandaws:source` | Field survives |
| RSF-10 | `verifyIntegrity()` passes with mixed source restrictions | No violations |
| RSF-11 | All existing property workflow tests pass (regression) | No breakage |
| RSF-12 | Export does NOT emit `fandaws:source` | Stripped from output |
| RSF-13 | Export exclusion list strips all internal `fandaws:` fields | No `fandaws:routingRecord`, `fandaws:restrictionKind`, etc. in output |

**Estimated scope:** ~370 lines implementation, ~400 lines tests.

### Phase B: User-Initiated Ontology Import (Workbench v0.2)

Deferred. File upload, batch collision resolution, selective import, `excludeImported` export option.

---

## 13. Files Changed

| File | Phase | Change |
|------|-------|--------|
| `src/adapters/integration/turtle-ingestion-adapter.js` | A | NEW — Parser, concept constructor, property index builder |
| `data/ontologies/bfo-2020-core.ttl` | A | NEW — Bundled BFO source |
| `src/core/knowledge-engine/knowledge-engine.js` | A | `importedConceptGuard`, phantom reference migration |
| `src/core/knowledge-engine/property-workflow.js` | A | `fandaws:source: 'user'`, verb-to-property resolution, redundancy scoping |
| `src/adapters/state/in-memory-state-adapter.js` | A | Bulk mutation support |
| `src/export/triple-extractor.js` | A | Export exclusion list, `owl:imports`, property IRI passthrough verification |
| `docs/workbench/js/panels/tree-panel.js` | A | Imported concept collapse/toggle |
| `docs/workbench/js/panels/inspector.js` | A | Ingestion provenance display |
| `docs/workbench/js/panels/converse.js` | A | `importedConceptGuard` prompt |

### Files NOT Changed

- `identity-simplification.js`, `iri-generator.js`, `nl-parser.js` — Upstream of ingestion.
- `scope-narrowing.js`, `proximity.js` — Imported concepts are read-only.
- `verb-property.js` — `mintVerbPropertyIri()` unchanged; `resolveVerbToProperty()` calls it as fallback.
- `description-engine.js` — Reads `skos:definition` (populated by ingestion). No changes.

---

## 14. Acceptance Criteria

### Full Sequence (End-to-End)

```
1. New graph created
   → BFO ingested automatically from bundled file
   → Tree shows: Entity → Continuant → ... → MaterialEntity (collapsed, marked [BFO])
   → MaterialEntity.owl:equivalentClass = ["bfo:BFO_0000040"]  (array)
   → MaterialEntity.rdfs:subClassOf = fandaws:class/{uuid}/independent-continuant
   → All imported concepts pristine (no fandaws:locallyModified)
   → Ingested property index built (inheres in → bfo:BFO_0000052, part of → bfo:BFO_0000176, ...)
2. "An organism is a material entity"
   → organism.skos:broader = fandaws:class/{uuid}/material-entity
   → organism.rdfs:subClassOf = fandaws:class/{uuid}/material-entity
   → (no bfo: IRIs anywhere on organism except via parent chain)
3. "Dogs have fur"
   → restriction.fandaws:source = "user"
   → restriction.owl:onProperty = fandaws:property/has  (no BFO label match for "has")
4. "An animal is a material entity"  (setup — object concept must exist before property assertion)
5. "Pet inheres in animal"
   → verb "inheres in" → label index match → bfo:BFO_0000052
   → restriction.owl:onProperty = bfo:BFO_0000052
   → restriction.fandaws:source = "user"
6. "Material entity has mass"
   → Guard prompt: "Material entity is an imported BFO concept."
7. Export as Turtle (default)
   → fandaws:graph/{graphId} a owl:Ontology  (conditional — graph has imported concepts)
   → owl:imports <http://purl.obolibrary.org/obo/bfo.owl>  (ontology IRI)
   → BFO classes with owl:equivalentClass triples (all pristine → full identity)
   → User concepts with rdfs:subClassOf pointing to Fandaws parent IRIs
   → fandaws:source, fandaws:locallyModified, fandaws:isImported NOT in output
   → fandaws:property/has declared as owl:ObjectProperty
   → bfo:BFO_0000052 NOT declared (it's BFO's property)
8. Export as Turtle (excludeImported — Phase B)
   → BFO proxy nodes stripped
   → User concepts' rdfs:subClassOf rewritten to raw bfo: IRIs
   → Zero fandaws:class/ IRIs for BFO classes in output
9. Close and reopen graph
   → loadGraph() detects BFO already ingested (contentHash match) → skip re-ingestion (~1ms)
   → All content unchanged
10. Open pre-ingestion legacy graph
    → loadGraph() detects no BFO ingestion → run full pipeline → phantom migration
    → Existing rdfs:subClassOf: bfo:BFO_0000040 rewritten to fandaws:class/{uuid}/material-entity
    → User content preserved
```

---

## 15. Risk Assessment

### 15.1 Graph Size Increase

BFO adds ~35 concepts. Negligible for storage and index performance.

### 15.2 Startup Time

Target: <100ms for BFO ingestion. Achievable — 35 classes, `n3` parser is fast.

### 15.3 `n3` Library Dependency

Pure JavaScript, no native modules, deterministic. Hand-rolled Turtle parser (~500 lines) is feasible as alternative.

### 15.4 Phantom Reference Migration

One-time migration rewrites `rdfs:subClassOf: bfo:...` to Fandaws IRIs on existing user concepts. Migration runs after first ingestion on a pre-existing graph. Idempotent — running it twice produces the same result. If a BFO IRI in `rdfs:subClassOf` has no corresponding ingested concept (e.g., a CCO reference before CCO is ingested), it is left unchanged.

### 15.5 No Data Loss Path

Ingestion is additive. Phantom reference migration is a rewrite (same semantic meaning, different IRI form), not a deletion. `fandaws:source` addition is a new field, not a modification. The worst outcome is a cosmetic IRI change in `rdfs:subClassOf` that points to the same concept via a different identifier.

---

## 16. Future: Lazy Loading and ScopeResolver (Not This Spec)

Large ontologies require on-demand resolution via ScopeResolver (Phase 12). A manifest declares dependencies. The resolver fetches classes on demand from a content-addressed ontology index. Out of scope for v1.2.
