# Follow-up: Step 7.17 — Property domain/range canonicalization at promotion

**Status:** Open
**Opened:** 2026-04-29 (alongside Step 7.16 commit)
**PO directive:** scoped separately as ingestion-layer task; do NOT fold into Step 7.16 syntax fix
**Severity:** Medium — architectural consistency with FANDAWS canonical IRI principle
**Blocks:** Reasoning layer downstream consumers; clean export round-trip
**Spec dependency:** §3 of Reified Constitutive Relations Specification will formalize the canonicalization rule

## Context

Step 7.15 fixed concept-class promotion to preserve declared `rdfs:subClassOf` IRIs while routing them through `owl:equivalentClass` lookup against the canonical graph — when a CCO source IRI matches a graph concept's `owl:equivalentClass`, the parent reference is rewritten to the FANDAWS canonical IRI.

Property promotion (`promoteCanonicalRelation` in [in-memory-state-adapter.js:2055](src/adapters/state/in-memory-state-adapter.js#L2055)) does NOT apply the same rule. Property `declaredDomain` / `declaredRange` are stored as raw source URIs (e.g., `http://purl.obolibrary.org/obo/BFO_0000141`) on the canonical relation record (`fandaws:relationDomain` / `fandaws:relationRange` fields), and then exported as-is.

**Architectural inconsistency:**
- Concept classes are canonicalized to FANDAWS IRIs with `owl:equivalentClass` to source.
- Property domain/range references are **not** canonicalized — they point at source IRIs directly.

**Consequence:** the reasoning layer must dereference `owl:equivalentClass` implicitly to do anything useful with these properties. Concepts and properties have different IRI conventions in the same canonical graph, violating the FANDAWS principle: **FANDAWS IRIs everywhere they exist; source IRIs only where canonical FANDAWS records do not exist or are explicitly preserved as equivalence references.**

## PO Principle (per 2026-04-29 directive)

> "FANDAWS IRIs everywhere they exist; source IRIs only where canonical FANDAWS records do not exist or are explicitly preserved as equivalence references."

To be formalized in §3 of the Reified Constitutive Relations Specification.

## Tasks

- [ ] **Audit `promoteCanonicalRelation`** at [src/adapters/state/in-memory-state-adapter.js:2055](src/adapters/state/in-memory-state-adapter.js#L2055) — mirror Step 7.15's two-pass lookup pattern for `declaredDomain` and `declaredRange`:
  1. **PRIMARY:** if `declaredDomain` resolves to an existing graph concept via `owl:equivalentClass` match, rewrite to the FANDAWS canonical IRI.
  2. **FALLBACK:** preserve source URI as-is (concept not in canonical graph yet).

- [ ] Same treatment for `cascadeSubPropertyResolution` and any other property-write path.

- [ ] **Update `Step 7.16` formatTurtleTerm test cases**: post-7.17, the bulk of relation domain/range references will be FANDAWS IRIs (already CURIE-shaped via `fandaws:` prefix), reducing the angle-bracket-fallback path to genuinely-external references.

- [ ] **Tests**:
  - Property whose declaredDomain matches a graph concept's `owl:equivalentClass` → canonical record's `fandaws:relationDomain` is the FANDAWS IRI, not the source URI.
  - Same for declaredRange.
  - In-session CCO chain: property whose domain points at a CCO concept already promoted earlier in the session → domain rewrites to that concept's FANDAWS IRI.
  - Genuinely-external references (parent ontology not loaded) → source URI preserved as fallback.
  - Round-trip regression: existing Step 7.16 angle-bracket emission still works for genuinely-external references.

- [ ] **Side effect on exported Turtle**: with Step 7.17 in place, the relation domain/range emission will mostly produce `fandaws:` CURIEs rather than `<http://...>` angle-bracketed URIs. This is the architecturally correct shape and validates Step 7.16's helper (which already handles both forms).

## Design notes

The Step 7.15 lookup logic in `_promoteCandidate`:
```js
if (record.superclass) {
  const declaredParent = concepts.find(c => {
    const equiv = c['owl:equivalentClass'];
    if (!equiv) return false;
    if (Array.isArray(equiv)) return equiv.includes(record.superclass);
    return equiv === record.superclass;
  });
  if (declaredParent) broaderIri = declaredParent['@id'];
}
```

Step 7.17 mirror in `promoteCanonicalRelation`:
```js
const concepts = graph['fandaws:concepts'] || [];
const canonicalize = (iri) => {
  if (!iri) return iri;
  const match = concepts.find(c => {
    const equiv = c['owl:equivalentClass'];
    if (!equiv) return false;
    if (Array.isArray(equiv)) return equiv.includes(iri);
    return equiv === iri;
  });
  return match ? match['@id'] : iri;  // FALLBACK preserves source IRI
};
const canonicalDomain = canonicalize(declaredDomain);
const canonicalRange = canonicalize(declaredRange);
// ...
'fandaws:relationDomain': canonicalDomain,
'fandaws:relationRange': canonicalRange,
```

Could be extracted to a private helper `_canonicalizeIri(graphId, iri)` for reuse across promotion paths.

## Out of Scope

- Source-IRI preservation policy when both sides exist (e.g., a concept has both source IRI in `owl:equivalentClass` AND a separate `fandaws:sourceIdentifier`) — banked for §3 spec lock.
- Migration of existing canonical records that were written pre-7.17 with raw URIs — re-ingestion is the cleanest path; in-place migration is a separate concern.
- BFO infrastructure concept loader's behavior — `ensureBfoIngestion` already produces `fandaws:` IRIs for BFO concepts; this is the canonical state Step 7.17 leverages.

## Acceptance

### Binary completion test (per PO 2026-04-29 directive)

A fresh canonical graph export — produced by ingesting an ontology that
imports BFO and references it in property domain/range (e.g.,
GeospatialOntology.ttl) — contains **zero references to `bfo:` or CCO
IRIs in property `rdfs:domain` or `rdfs:range`**, OR every such
reference is **explicitly flagged as an intentional canonicalization
exception** with a stated reason (one-line rationale per exception).

Implementation outline:
- Test fixture: ingest GeospatialOntology.ttl through full pipeline → finalize → export Turtle.
- Programmatic check (test): grep the rel: ObjectProperty block for any `rdfs:domain` or `rdfs:range` line whose value matches `bfo:`, `<http://purl.obolibrary.org/obo/`, `<https://www.commoncoreontologies.org/`, or any other source-IRI prefix declared in the ingestion source. Count = 0.
- Exception list: a structured exception registry (e.g., `specs/canonicalization-exceptions.json`) declares any IRI patterns that intentionally do NOT get canonicalized, each with a stated reason ("BFO-as-canonical-import: cite §3 spec section X.Y"). Test reads this list and excludes matches from the count.
- If count > 0 AND no exception matches → test fails.

This is the binary completion gate. Judgment-call narrative ("looks
mostly canonical now") is not sufficient evidence Step 7.17 is done.

### Manual smoke verification

1. Ingest GeospatialOntology.ttl → finalize.
2. Inspect any property's canonical record (e.g., "has spatial part"). `fandaws:relationDomain` / `fandaws:relationRange` should be FANDAWS IRIs (e.g., `fandaws:class/uuid/immaterial-entity`), NOT raw `http://purl.obolibrary.org/obo/BFO_0000141`.
3. Export Turtle. The `rel: ObjectProperty` block emits `rdfs:domain fandaws:class/...` (CURIE) for in-graph concepts; angle-bracketed source URIs appear ONLY for entries on the canonicalization exception list.
4. Reasoner (downstream) can traverse domain/range without dereferencing `owl:equivalentClass`.
