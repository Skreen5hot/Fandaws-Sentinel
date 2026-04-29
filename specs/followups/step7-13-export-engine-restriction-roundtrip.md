# Follow-up: Export-engine restriction round-trip (Step 7.13 follow-on)

**Status:** Open
**Opened:** 2026-04-29 (with Step 7.13 commit `acbd4ff`)
**PO directive:** open as explicit follow-up, NOT verification-time bank
**Severity:** Medium — structural integrity / honesty of export boundary
**Blocks:** Nothing (Step 7.13 ingestion-side fix is independently valuable)

## Context

Step 7.13 extended `_promoteCandidate` so canonical concepts carry both IRI parents AND `owl:Restriction` objects in their `rdfs:subClassOf` array (proper OWL 2 JSON-LD shape). BFO axioms and CCO restrictions now flow through ingestion → canonical graph successfully.

This follow-up tracks the symmetric question on the export side: **does the export engine serialize the new object-form `rdfs:subClassOf` entries correctly?**

If Turtle / OWL / RDF-XML / SKOS exporters drop or malform restriction objects on export, we have a **one-way mirror at the export boundary** — the canonical graph preserves axioms internally but the exported artifact silently strips them. That's structurally dishonest and needs to be fixed consciously.

## Why This Matters

Step 7.13's architectural payload is "ingest preserves OWL semantics." If export drops them, we publish ontologies that are semantically thinner than what we ingested. The system needs to be honest about what it preserves end-to-end. This is the export-side complement to Step 7.13's ingest-side fix.

## Tasks

- [ ] **Audit current export engines** for `rdfs:subClassOf` array handling:
  - [src/core/export-engine/turtle-export.js](src/core/export-engine/turtle-export.js)
  - [src/core/export-engine/owl-export.js](src/core/export-engine/owl-export.js)
  - [src/core/export-engine/rdf-xml-export.js](src/core/export-engine/rdf-xml-export.js)
  - [src/core/export-engine/skos-export.js](src/core/export-engine/skos-export.js)
  - [src/core/export-engine/triple-extractor.js](src/core/export-engine/triple-extractor.js) (shared triple emission)

- [ ] **Test ingestion → export round-trip** for CCO Eye Color shape: parse → ingest → export Turtle → re-parse → assert restriction object preserved.

- [ ] **Implement object-form serialization** if any exporter drops restrictions. Each format's standard restriction syntax:
  - **Turtle**: `subClassOf [ rdf:type owl:Restriction ; owl:onProperty X ; owl:someValuesFrom Y ]`
  - **OWL Manchester**: `SubClassOf: X some Y`
  - **RDF/XML**: nested `<owl:Restriction>` element
  - **SKOS**: N/A — SKOS doesn't carry OWL restrictions; either drop with a warning comment in the output, or skip restriction emission entirely for SKOS export.

- [ ] **Test `owl:disjointWith` export** for each format (Step 7.13 also added this; same export-boundary concern).

- [ ] **Add regression test** that round-trips Step 7.13's `EYE_COLOR_RESTRICTION` fixture (from [tests/unit/ingestion/step7-13-axiom-retention.test.js](tests/unit/ingestion/step7-13-axiom-retention.test.js)) through every exporter.

## Out of Scope (explicit)

- Phase 3 cardinality validation — separate Phase D2 enhancement, banked.
- `owl:intersectionOf` blank-node expression retention — Step 7.13 only handled `owl:Restriction` blank nodes; intersection class expressions banked separately.
- Detail-pane human-readable rendering of restriction objects in the workbench — separate UX banked item.

## Acceptance

When this is fixed:
1. Ingest CCO AgentOntology.ttl, finalize session.
2. Export Turtle from the resulting canonical graph.
3. Re-parse the exported Turtle.
4. Assert: every concept that originally carried a restriction in the source still carries a structurally equivalent restriction in the re-parse.
5. Same for OWL/Manchester and RDF/XML formats.
6. `owl:disjointWith` pairs round-trip identically.
