# Follow-up: Step 7.19 — Phase 3 Finalize synthesizes false universal axioms from rdfs:domain/range

**Status:** Open
**Opened:** 2026-04-29 (post-Step 7.16 dry-run)
**Severity:** **HIGH** — generates semantically incorrect axioms in canonical records
**Blocks:** Sound reasoning over the canonical graph; downstream entailments
**PO directive:** "highest-priority unaddressed item — generating false universal axioms in canonical records is the kind of thing that will surface as wrong reasoning later"

## Context

The Geospatial export shows 7 named restrictions on `immaterial-entity` (lines 592-647):
```turtle
<...immaterial-entity#r-coincides_with-immaterial-entity>
    a owl:Restriction ;
    owl:onProperty rel:coincides_with ;
    owl:someValuesFrom <...immaterial-entity> .

<...immaterial-entity#r-connected_with-immaterial-entity>
    a owl:Restriction ;
    owl:onProperty rel:connected_with ;
    owl:someValuesFrom <...immaterial-entity> .

[... 5 more, all someValuesFrom immaterial-entity ...]
```

All 7 GeospatialOntology object properties (`coincides_with`, `connected_with`, `disconnected_with`, `externally_connects_with`, `has_spatial_part`, `partially_overlaps_with`, `spatial_part_of`) declare:
- `rdfs:domain obo:BFO_0000141` (immaterial-entity)
- `rdfs:range obo:BFO_0000141` (immaterial-entity)

The Phase 3 Finalize path at [phase3-review-panel.js:577-613](docs/workbench/js/panels/ingest/phase3-review-panel.js#L577-L613) iterates each resolved Phase 2 property and calls `adapter.addRestrictionToClass({classIRI: domainClass, onPropertyIRI, someValuesFromIRI: rangeClass, ...})`. Verified by reading the call site and the comment on line 610: `Phase 3 NoViolations — ${p2.label} domain=${p2.declaredDomain} range=${p2.declaredRange}`.

## The semantic bug

`rdfs:domain X` is **conditional**:
> ∀ y, z. (y rel z) → (y ∈ X)

`subClassOf [Restriction onProperty rel someValuesFrom Y]` is **universal-existential**:
> ∀ x ∈ X. ∃ z. (x rel z) ∧ (z ∈ Y)

These are NOT equivalent. The synthesizer is **strengthening** every domain/range pair into a universal claim that "every member of the domain HAS some range relationship via this property." For a transitive/symmetric/optional property, this is straightforwardly false.

Example: `coincides_with` has domain immaterial-entity and range immaterial-entity. The Phase 3 synthesis writes `immaterial-entity rdfs:subClassOf [Restriction onProperty rel:coincides_with someValuesFrom immaterial-entity]`. This entails: **every immaterial entity coincides with some immaterial entity.** The source ontology never says this — it just says coincides_with relates immaterial entities (when it relates anything).

Same shape for `disconnected_with`: the synthesis entails "every immaterial entity is disconnected with some immaterial entity," which is plausibly meaningful for a generic existential but is being asserted on EVERY class that happens to be the domain — including reflexive cases where the entity could be coincident-with itself, contradicting the disconnected claim.

## What the synthesizer was probably trying to do

The justification string at line 610 says "Phase 3 NoViolations" — implying this is supposed to be a "after Phase 3 sandbox passed, write something to the canonical graph as evidence." Two plausible original intents:

1. **Witness an existential constraint for properties marked existential by the analyst.** If Phase 2 had a "this property is existential on its domain" flag, then synthesizing the restriction would be correct. But there's no such flag in Phase 2's resolved record.

2. **Mirror the OWL 2 RL profile rule** that translates `rdfs:domain` into a `subClassOf [Restriction allValuesFrom-inverse]` — but that's a `allValuesFrom` on the **inverse** of the property, not `someValuesFrom` on the property itself. Even that translation is conservative under OWA/CWA discipline.

Either way, the current code does neither correctly. It asserts a universal-existential claim that the source ontology does not make.

## Recommended action

**Remove the synthesis entirely.** Phase 3 Finalize should NOT manufacture restriction axioms from declared `rdfs:domain` / `rdfs:range`. Domain/range live on the property record (`fandaws:relationDomain` / `fandaws:relationRange`); the reasoner can read them directly when needed for argument-position checking. There's no need to reify them onto the domain class.

Surface: [docs/workbench/js/panels/ingest/phase3-review-panel.js:574-613](docs/workbench/js/panels/ingest/phase3-review-panel.js#L574-L613). Delete the loop that calls `addRestrictionToClass` from `declaredDomain`/`declaredRange`. Keep `addRestrictionToClass` itself as an adapter API for future legitimate use (e.g., parser-extracted restrictions, analyst-asserted axioms in Phase 2.5+ surfaces).

If Phase 3 Finalize needs to write SOMETHING as a "NoViolations attestation" record, write it as a separate annotation (e.g., `fandaws:phase3Verified` boolean on each property's canonical record) rather than synthesizing fake axioms.

## Tasks

- [ ] Delete the synthesis loop at [phase3-review-panel.js:574-613](docs/workbench/js/panels/ingest/phase3-review-panel.js#L574-L613) (the `for (const p2 of phase2Records)` block that calls `addRestrictionToClass`).
- [ ] Remove the now-unused `axiomsWritten` counter and the `[phase3-review] Wrote N axioms` log line.
- [ ] Optionally: replace with a `fandaws:phase3Verified: true` annotation per property canonical record if the attestation signal is needed downstream.
- [ ] Update tests that assert the synthesis happens (if any exist) — invert to assert no synthesis.
- [ ] Add a regression test: ingest a property with declared domain/range → finalize → assert the domain class's `rdfs:subClassOf` does NOT contain a synthesized restriction.

## Acceptance

Binary completion test:
- Ingest GeospatialOntology.ttl → finalize.
- Inspect `immaterial-entity` canonical record.
- `rdfs:subClassOf` array contains zero restrictions whose `owl:onProperty` corresponds to a `rel:` property declared in the same session.
- Specifically: no `<immaterial-entity#r-...>` named restrictions in the export.
- Console no longer logs `Wrote N axioms to canonical graph` from the phase3 panel finalize step (or logs `Wrote 0 axioms` consistently).

## Out of scope

- Step 7.18 (named-vs-blank-node restrictions) — moot if synthesis is removed; revisit if synthesis is preserved in some form.
- Parser-extracted restrictions (Step 7.13) — those represent restrictions actually declared in the source ontology and should continue to be retained. This task is only about the SYNTHESIZED ones.
- Phase 3 sandbox verification semantics — Phase 3 should still validate consistency; just shouldn't manufacture axioms as a side effect.
- Spec ratification — domain/range semantics are well-established in OWL 2; no spec dependency.

## Priority

**HIGH — fix soon.** The longer this synthesis runs, the more downstream artifacts will encode the false universal axioms. Reasoning over canonical graphs that include these restrictions will produce wrong entailments. This is a correctness bug, not a quality-of-life issue.
