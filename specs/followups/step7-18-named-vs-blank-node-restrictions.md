# Follow-up: Step 7.18 — Named restrictions diverge from Step 7.13 blank-node design

**Status:** Open
**Opened:** 2026-04-29 (post-Step 7.16 dry-run)
**Severity:** Low (architectural consistency, no semantic bug)
**Blocks:** Nothing
**Decision needed:** ratify named-IRI restriction shape OR convert to inline blank-nodes per Step 7.13 design

## Context

Step 7.13 ("axiom retention through ingestion") landed a parser path that captures `owl:Restriction` blank-node bodies on each class's `restrictions[]` array, then `_promoteCandidate` writes them as object-form entries in `rdfs:subClassOf`. That design produces inline blank-node restrictions in the export, matching standard OWL 2 Turtle shape:
```turtle
ClassA rdfs:subClassOf [ a owl:Restriction ; owl:onProperty rel:foo ; owl:someValuesFrom ClassB ] .
```

The Phase 3 Finalize path took a **different** approach. [`addRestrictionToClass`](src/adapters/state/in-memory-state-adapter.js#L2299-L2312) at line 2312:

```js
const restrictionId = `${classIRI}#r-${(onPropertyIRI || 'unknown').split(/[/#:]/).pop()}-${(someValuesFromIRI || 'unknown').split(/[/#:]/).pop()}`;
```

This generates a **named-IRI restriction** (`<classIRI#r-onProperty-rangeClass>`) emitted as a top-level `a owl:Restriction` block referenced from the class's `rdfs:subClassOf`. Verified in [Geospatial export lines 592-647](docs/architecture/fandaws-graph%20(1).ttl) — 7 named restrictions on immaterial-entity, each declared as a separate top-level entity.

## Two paths forward

**Option A — Ratify named-IRI restrictions as the canonical shape.**
Reasons that may justify naming:
- Audit reference: Phase 3 NoViolations writes need a stable IRI to correlate with `fandaws:reproducibilityHash` and DP-2 records.
- Spec deduplication: same restriction shape (`onProperty X someValuesFrom Y`) declared on multiple classes can be reused via the named IRI rather than duplicating blank nodes.
- Provenance: `fandaws:propertyLabel`, `fandaws:verbLabel`, `fandaws:restrictionKind`, `fandaws:explanation`, `fandaws:reproducibilityHash` annotations on the named restriction would be lost on a blank node (annotation properties on blank nodes have weaker tooling support).

If ratified: update Step 7.13's design notes to acknowledge the dual shape (parser-extracted = inline blank nodes; Phase 3-synthesized = named IRIs) and document the rationale.

**Option B — Convert Phase 3 synthesis to inline blank-node restrictions.**
Reasons that may justify conversion:
- Consistency with parser-extracted restrictions (Step 7.13 path).
- Standard OWL 2 idiom (most ontologies use blank nodes).
- Avoids accidental coupling between class IRI and restriction IRI (current scheme embeds the class IRI in the restriction IRI, so re-classification of the class would orphan the restriction).
- Simpler export: blank-node serializers handle this natively without round-trip ambiguity.

If converted: refactor `addRestrictionToClass` to push a restriction object directly into `concept['rdfs:subClassOf']` (matching Step 7.13's shape), drop the `restrictionId` minting, move `fandaws:reproducibilityHash` and provenance fields to a separate annotation record OR onto the parent concept's restriction-provenance index.

## Tasks

- [ ] **Decision**: ratify (A) or convert (B). PO call.
- [ ] If (A): write design-rationale doc in `docs/architecture/named-restrictions-rationale.md` covering the audit-reference, deduplication, and provenance reasons; update Step 7.13's design notes.
- [ ] If (B): refactor `addRestrictionToClass`; preserve provenance via separate index; update tests.
- [ ] Either way: update the export-engine round-trip test to assert the chosen shape.

## Out of scope

- Step 7.17 canonicalization (separate spec dependency).
- Finding 2 (Phase 3 domain/range synthesis being semantically unsound) — that's the bigger issue; this Step 7.18 is just about named-vs-blank shape, agnostic of whether the synthesis itself should happen.

## Acceptance

- Decision documented (one of A or B).
- Export-engine round-trip test asserts the chosen shape.
- Step 7.13 design notes reconciled with the chosen shape.

## Priority note

**Step 7.19 (Finding 2) blocks meaningful progress here.** If the Phase 3 domain/range synthesis is removed entirely (as Finding 2 suggests it should be), the named-vs-blank-node question becomes moot for that path — the named restrictions wouldn't exist. Address Step 7.19 first; revisit Step 7.18 once it lands.
