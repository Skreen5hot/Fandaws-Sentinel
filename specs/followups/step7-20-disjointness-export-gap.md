# Follow-up: Step 7.20 — owl:disjointWith absent from canonical export despite Step 7.13 retention + BFO loading

**Status:** Open
**Opened:** 2026-04-29 (post-Step 7.16 dry-run)
**Severity:** Medium — load-bearing claim of Step 7.13 unverified at export boundary
**Blocks:** Sound disjointness reasoning over the canonical graph; structural completeness of exports

## Context

Geospatial export contains **zero `owl:disjointWith` triples** (verified via grep). This persists despite:

1. **Step 7.13 retention**: parser captures `disjointWith` per-class at [ontology-parser.js:257-260](src/core/ingestion/ontology-parser.js#L257-L260); adapter staging records carry `disjointWith` at [in-memory-state-adapter.js:1416](src/adapters/state/in-memory-state-adapter.js#L1416); `_promoteCandidate` writes `'owl:disjointWith': record.disjointWith || []` at [adapter:1678](src/adapters/state/in-memory-state-adapter.js#L1678).

2. **BFO infrastructure loading via `ensureBfoIngestion`**: BFO 2020 declares extensive disjointness in [data/ontologies/bfo-2020-core.ttl](data/ontologies/bfo-2020-core.ttl) (5+ explicit `owl:disjointWith` triples for top-level categories, e.g., Continuant↔Occurrent, Quality↔Role, ZeroDimensional↔OneDimensional regions).

Two-pronged trace:

### (a) BFO infrastructure path — disjointness retained but NOT on per-concept records

`ensureBfoIngestion` calls `ingestTurtle` which returns:
```js
{ concepts, propertyIndex, parentMap, contentHash, skipped, disjointPairs }
```

Per [turtle-ingestion-adapter.js:344-352](src/adapters/integration/turtle-ingestion-adapter.js#L344-L352), `disjointPairs` is collected as a SEPARATE field, not written onto the individual concept records. The `concepts` array (the BFO infrastructure that gets pushed into `graph['fandaws:concepts']`) has NO `owl:disjointWith` field on the per-concept JSON-LD shape.

The `disjointPairs` are consumed by [adapter:256](src/adapters/state/in-memory-state-adapter.js#L256) to build the **BFO Disjointness Map** — a runtime data structure for the disjointness-firing engine in `three-state-evaluator.js`. This is functional internally, but is NOT round-tripped to the canonical graph nor exported.

### (b) User-promoted CCO concepts path — disjointness retained but source ontology has none

For Geospatial classes promoted via `_promoteCandidate`:
- Parser correctly populates `parsed.classes[i].disjointWith` per Step 7.13 design.
- Staging records carry `disjointWith` (line 1416).
- `_promoteCandidate` writes `'owl:disjointWith': record.disjointWith || []` to canonical (line 1678).

But: GeospatialOntology.ttl source contains **no `owl:disjointWith` triples for the user-promoted classes**. The disjointness retention path is correct; the source just doesn't declare any. So zero output is correct for THIS ontology, but the absence is misleading because BFO infrastructure DOES declare disjointness and that's not flowing through.

### (c) Export path — does the triple-extractor emit `owl:disjointWith` if it's present?

Need to verify by reading [src/core/export-engine/triple-extractor.js](src/core/export-engine/triple-extractor.js) and the Turtle/OWL/RDF-XML serializers. Even if `owl:disjointWith` makes it onto a concept record, the exporter must explicitly serialize it. Banking the audit task; the answer determines whether (a) is the only fix needed or whether (c) also needs work.

## Recommended action

Two-part fix:

**Part 1 — BFO ingestion writes per-concept disjointness.** Modify the ingestion path so each BFO concept's `owl:disjointWith` field is populated from the corresponding entry in `disjointPairs`. The `disjointPairs` data is already present in `ingested.disjointPairs`; just needs to be projected onto each concept before they're added to `graph['fandaws:concepts']`. The runtime BFO Disjointness Map continues to be built from the same data — both consumers benefit.

**Part 2 — Verify export path emits `owl:disjointWith`.** Audit [triple-extractor.js](src/core/export-engine/triple-extractor.js) to confirm `owl:disjointWith` is in the serialized predicates. If it isn't, add it. Apply to all four export formats (Turtle, OWL Manchester, RDF/XML, SKOS where applicable — SKOS may not carry OWL disjointness; document as expected).

## Tasks

- [ ] Audit `extractTriples` and per-format serializers for `owl:disjointWith` handling.
- [ ] Modify `turtle-ingestion-adapter.js` to project `disjointPairs` onto per-concept `owl:disjointWith` arrays.
- [ ] Add tests:
  - BFO infrastructure: after `ensureBfoIngestion`, the `Continuant` concept has `owl:disjointWith` containing the IRI for `Occurrent`.
  - Export round-trip: BFO export contains explicit `owl:disjointWith` triples (count matches BFO source declarations).
  - User-promoted regression: a CCO concept declaring disjointness retains it (already covered by Step 7.13 tests; verify export round-trip).

## Acceptance

Binary completion test:
- Ingest BFO via `ensureBfoIngestion` → export Turtle.
- Grep export for `owl:disjointWith`. Count > 0 (matches source TTL count: ~5 for BFO core).
- Specifically:
  - Continuant disjoint with Occurrent ✓
  - Quality disjoint with Role ✓ (or whatever specific pairs BFO 2020 declares)
- For an ontology that imports BFO and adds disjointness (e.g., a hypothetical CCO module declaring `cco:Foo owl:disjointWith cco:Bar`): user-promoted concepts also export `owl:disjointWith`.

## Out of scope

- BFO Disjointness Map runtime engine — already working; this task is about persistence/export, not the runtime.
- Disjointness reasoning beyond pairs (e.g., `owl:AllDisjointClasses`) — separate scope.
- Spec ratification — `owl:disjointWith` semantics are standard OWL 2; no spec dependency.

## Priority

Medium. Correctness-related but not actively producing wrong output — the absence is silent (BFO disjointness inference still works at runtime via the Disjointness Map; export simply doesn't reflect what's known). Lower priority than Step 7.19 (false-axiom synthesis) but should land before any external consumer relies on the canonical export for OWL reasoning.
