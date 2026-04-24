# DP-2 Scaffolding — Locked Decisions

**Status:** Lock-in-progress 2026-04-23 (X1 resolved same day; only X2 remaining). Captures SME dispositions on the 10 design-sketch decisions from `dp2-scaffolding-design-sketch.md`. Analogous to the Wave 2 locked-decisions capture.
**Parent artifact:** `specs/d16/dp2-scaffolding-design-sketch.md` (LOCK-IN-PROGRESS 2026-04-23, revised post-review same day).
**Review cycle:** SME review 2026-04-23 → developer response + revision → SME ACK + X1 delivery → developer X1 ACK (all 2026-04-23). X2 delivery pending; full lock contingent on X2.

---

## 1. Decisions — 10 items

### DP-2.1.D1 — Writer module location

- **Locked:** new module at `src/core/d16/canonical-record-writer.js`.
- **Rejected:** method on StateAdapter.
- **Reason:** StateAdapter is pluggable; DP-2 enforcement is D1.6-specific reasoning discipline. Keeping the enforcement layer out of the adapter contract preserves adapter semantics.
- **Companion commitment:** none.

### DP-2.1.D2 — Schema validator implementation

- **Locked:** hand-rolled validator at `src/core/d16/dp2-schema.js`. No runtime dependency.
- **Rejected:** Ajv or other JSON schema library.
- **Reason:** edge-canonical constraint discourages dep additions for a ~150-line validator over a fully-known shape. Hand-rolled error messages can cite DP-2-R1/R2/R3 directly.
- **Companion commitment:** none.

### DP-2.1.D3 — NotApplicable zero-element evidence

- **Locked with SME endorsement:** single-element evidence list is the floor. Zero-element NotApplicable fails I2a.
- **Rejected:** permissive zero-element for NotApplicable.
- **Reason:** absence-not-evidence. NotApplicable is a positive reasoning decision; the routing trigger (`automatic` / `default_axiom_poor` / `manual`) must be named. Zero-element would be indistinguishable from a crashed evaluator stub.
- **Companion commitment:** none. Non-negotiable per SME.

### DP-2.2.D1 — axiomDictionary keying

- **Locked with linkage to D3.1:** content hash of the axiom's canonical RDF subgraph, using the **same JCS canonicalization** adopted for the DP-2.3.2 Final Hash.
- **Rejected:** text-string keying.
- **Reason:** text keying fails on whitespace / prefix / ordering variants. Content hashing dedupes semantically-equivalent axioms regardless of source syntax.
- **Companion commitment:** **D1 and D3.1 are paired** — changing either requires revisiting the other. Captured explicitly in both decision records.

### DP-2.2.D2 — crossCAUInfluences capture mechanism

- **Locked:** explicit callback from helpers / evaluator into the provenance builder (`recordCrossCAUInfluence(sourceCau, influenceType, targetCau)`).
- **Rejected:** automatic introspection of iteration reasoner state.
- **Reason:** automatic introspection couples provenance to reasoner internals — the coupling transparent-forwarding (`feedback_transparent_callback_forwarding.md`) was established to prevent.
- **Companion commitment:** none.

### DP-2.2.D3 — reconciliationHistory write protocol

- **Locked:** single-writer per event, append-only, no coalescing. F1 causal linkage folded in: each entry carries optional `causedBy: <prior entry ID> | null`, populated when the writer knows causality at write time (e.g., NA-1.4 firing in response to NA-1.3 cascade).
- **Rejected:** coalescing entries by triggering event type.
- **Reason:** coalescing would erase the NA-1.3-vs-NA-1.4 distinction and force audit reconstruction from implicit state. Explicit `causedBy` preserves cascade-causality without forcing callers to infer from timestamp proximity.
- **Companion commitment:** F1 `causedBy` field is schema-optional (to accommodate independent events) but strongly-valued when present.

### DP-2.2.D4 — NotApplicable routing mechanism enum closure

- **Locked:** closed enum in v1.0 — `automatic | default_axiom_poor | manual`.
- **Rejected:** extensible enum.
- **Reason:** matches locked-decision discipline; extension requires amendment cycle.
- **Companion commitment:** none.

### DP-2.3.D1 — Canonical serialization scheme

- **Locked:** RFC 8785 JCS (JSON Canonicalization Scheme).
- **Rejected:** custom canonicalization rules.
- **Reason:** JCS has well-specified edge cases (number canonicalization, Unicode handling, key ordering); custom rules drift. JCS reference implementation is ~100 lines of pure JS, edge-canonical compatible.
- **Companion commitment:** **D3.1 is paired with D2.1** — the JCS canonicalizer is shared between axiomDictionary content hashing and the Final Hash input canonicalization.

### DP-2.3.D2 — BFO version identifier source

- **Locked with byte-capture requirement:** file-content SHA-256 over the **raw ingested bytes** (not re-serialized post-parse).
- **Rejected:** `owl:versionIRI` string from the ontology header.
- **Reason:** `versionIRI` is author-controlled; content SHA makes reproducibility robust to mislabeled versions. SME explicit condition: hash is computed over load-time bytes; re-serialized Turtle would produce a different hash from the source file.
- **Companion commitment:** **DP-2.3.0 byte-capture retrofit** is a net-new sub-step. Current state verified 2026-04-23: neither the Workbench upload panel nor the BFO loader captures content bytes. Retrofit ships before DP-2.3.1 per-round hashing.

### DP-2.3.D3 — Session configuration hash scope

- **Approach locked; field list OWED by SME.** Approach: explicit allow-list of semantically-relevant fields, documented in `reproducibility-hash.js`.
- **Rejected:** hash all config fields indiscriminately.
- **Reason:** hashing implementation-only fields (e.g., `logVerbosity`) would falsely invalidate cross-session reproducibility on log-level changes.
- **Companion commitment:** SME-DP2-X2 delivery pre-DP-2.3.2. Developer proposal for SME review: IN = fields that affect reasoning outputs (weight vector bounds, iteration fallback cap, OWA/CWA posture flags). OUT = `logVerbosity`, UI preferences, session UUID. SME may confirm, revise, or replace the list.

---

## 2. Named invariants introduced

- **DP-2-I1 (Schema Gate)** — no record persisted unless top-level shape conforms to §7.2 + §7.3 + §7.4. Enforced from DP-2.1.
- **DP-2-I2a (Shape-Level Content Validation)** — non-empty axiom evidence (except NotApplicable single-element); non-empty iteration history; hash field present and syntactically well-formed; `validationState` not terminal-`provisional`. Enforced from DP-2.1.
- **DP-2-I2b (Hash-Value-Correctness)** — hash bytes are the correct output of the §7.4 deterministic computation. Activates at DP-2.3.2; `_scaffold: true` sentinel is the I2b bypass token during DP-2.1/DP-2.2 interim.
- **DP-2-I3 (Deterministic Hash)** — identical inputs ⇒ identical Final Hash across sessions. Activates at DP-2.3.2.
- **DP-2-I4 (Dictionary Discipline)** — records reference shared axioms by dictionary ID only; inlining fails content validation per DP-2-R5. Enforced from DP-2.2.

## 3. SME-generated items (tracked)

| ID | Origin | Status |
|---|---|---|
| SME-DP2-P1 | §3.2 scaffold routing pushback | **Resolved** — explicit `phase` param |
| SME-DP2-P2 | §1.4 I2 split pushback | **Resolved** — I2a/I2b split per timeline |
| SME-DP2-F1 | Causal linkage flag | **Resolved — folded in** — `causedBy` field |
| SME-DP2-F2 | Plausible schema check | **Resolved — verified clean.** Verification source: `specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md:323-375` (§4.3 Plausible — Flat With Structured Evidence). Fields present: `candidateBFOCategories[]`, per-category `conditionsSatisfied/conditionsTotal`, `satisfiedConditionIRIs[]`, `unsatisfiedConditionIRIs[]`, `axiomsContributing[]`, `disjointViolations[]`, `heuristicSignals[]` (tagged `advisory: true`), `subsumptionResolution{applied, winner, rationale}`. No general ranking/preferred-candidate field. Spec line 374 explicitly prohibits arithmetic scores. `subsumptionResolution.winner` is tightly scoped to §4.6 hierarchical-overlap resolution (most-specific-subsumer per D1.6-L12) — not a cross-category confidence rank. |
| SME-DP2-F3 | validationState terminal semantics | **Resolved** — I2a rejects terminal-`provisional` per NA Commitment 2 |
| SME-DP2-F4 | Audit scenario promotion | **Resolved — promoted to required** — `dp2-writepath-chokepoint-exclusivity`, AVC bundle v5 |
| SME-DP2-X1 | Item 1 operational-definition memo | **Resolved 2026-04-23.** SME delivered `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` REV1. Developer ACK: definition implementable as specified; no corner-case gap affecting DP-2.2 implementation planning. One watch-item tracked (§4.9 OERS false-positive risk at OBO-scale) for empirical surfacing during DP-2.2 integration, not blocking. **DP-2.2 unblocked.** |
| SME-DP2-X2 | Config hash allow-list field enumeration | **Pending SME delivery** — pre-DP-2.3.2 blocker (last remaining lock-completion item) |

## 4. Implementation gating

- **DP-2.1** — **GREEN-LIT** 2026-04-23 on SME revision ACK. All DP-2.1 decisions locked.
- **DP-2.2** — **GREEN-LIT** 2026-04-23 on X1 resolution. `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` is the operational-definition reference for `DependencyGraph` construction and `reconciliationHistory` parent-reconciliation semantics.
- **DP-2.3.0 byte-capture** — unblocked; may run in parallel with DP-2.1 once crypto shim exists.
- **DP-2.3.1 per-round hashing** — depends on DP-2.3.0 complete.
- **DP-2.3.2 Final Hash** — **blocked on X2** (only remaining lock-completion item).
- **Acceptance** — after DP-2.3.2 lands.

## 5. Lock completion criteria

Full lock of this artifact requires:

1. ✅ SME acknowledgement that the revised sketch resolves P1, P2, F1-F4 — **received 2026-04-23.**
2. ✅ SME delivery of X1 (Forward-Flag Item 1 operational-definition memo) — **received 2026-04-23 as REV1; developer ACK same day.**
3. ☐ SME delivery of X2 (config hash field allow-list) — **last remaining item.**

When X2 lands, this artifact's status updates to **LOCKED** (analogous to Wave 2's 2026-04-22 lock) and full DP-2 implementation proceeds sub-wave by sub-wave without further design-review cycles.

## 6. Watch-items surfaced during lock-completion

Tracked for empirical observation during implementation; not blocking.

- **§4.9 OERS precondition false-positive risk at OBO-scale ingestion.** Per X1 memo reserved-door framing: if `owl:equivalentClass` axioms in OBO imports produce frequent false-positive "un-canonicalized" detections due to benign cross-import overlaps, §4.9 detection semantics may need refinement to distinguish OERS-resolvable from OERS-resolved equivalences. SME default preference is fail-fast. Developer will surface empirical rate during DP-2.2 integration; if fail-fast blocks PROV-O Pass 2 session startup, recovery-strategy decision re-opens (fail-fast vs graph-collapse with audit trail).
