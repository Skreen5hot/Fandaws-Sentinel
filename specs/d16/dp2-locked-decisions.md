# DP-2 Scaffolding — Locked Decisions

**Status:** **LOCKED 2026-04-24.** All 10 design-sketch decisions locked. X1 resolved 2026-04-23; X2 resolved 2026-04-24 via `specs/d16/dp2-x2-config-allow-list-memo-v1.md`. Full DP-2 implementation proceeds sub-wave by sub-wave without further design-review cycles. Analogous to Wave 2's 2026-04-22 lock.
**Parent artifact:** `specs/d16/dp2-scaffolding-design-sketch.md` (LOCK-IN-PROGRESS 2026-04-23, revised post-review same day; sketch §5.2.2 carries a non-blocking spec-citation correction — W-D-16 → PS-8 — per X2 memo §5.2).
**Review cycle:** SME review 2026-04-23 → developer response + revision → SME ACK + X1 delivery → developer X1 ACK (all 2026-04-23). DP-2.1 landed 2026-04-24; SME X2 delivery 2026-04-24 completes lock.

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

- **LOCKED 2026-04-24 via `specs/d16/dp2-x2-config-allow-list-memo-v1.md`.** Approach: explicit allow-list of semantically-relevant fields at DP-2.3.2 hash assembly time.
- **Rejected:** hash all config fields indiscriminately.
- **Reason:** hashing implementation-only fields (e.g., `logVerbosity`) would falsely invalidate cross-session reproducibility on log-level changes.
- **Allow-list (v1.0):** three top-level fields, six sub-fields via weightVector expansion.
  - `notApplicableThreshold` (engine sessionConfig; DP-1-R2)
  - `inconsistentThreshold` (engine sessionConfig; DP-1-R2)
  - `weightVector.{domain, range, bfoSubcategory, characteristics, allowsInheresIn, lexical}` (Workbench frozen snapshot; PD-10 / D-9)
- **Explicit OUT (selected):** `compatibilityDegraded` (derived, captured in provenance); `parsedProperties` (derived from source bytes); `hornInferenceStepCap`, `tauPrologVersion` (upstream Phase D2; effects captured via signature hash); `imports` (W-D-19 declared-but-not-followed); `MAX_ROUNDS` (hard-coded constant); session UUID, `logVerbosity`, UI preferences, `authorTimestamp`-type fields (metadata/implementation).
- **Hashing semantics:** effective post-default-resolution values; JCS canonicalization per D3.D1; SHA-256 per D3.D2 crypto shim.
- **Amendment:** additions via amendment cycle (see memo §4). Removals disallowed (compatibility break).
- **Companion commitment:** DP-2.3.2 implementation reads allow-list fields from an immutable session-start snapshot per memo §5.1 (split-brain watch-item).

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
| SME-DP2-X2 | Config hash allow-list field enumeration | **Resolved 2026-04-24.** SME delivered `specs/d16/dp2-x2-config-allow-list-memo-v1.md`. Allow-list: 3 top-level fields (DP-1 thresholds + weightVector 6-tuple); Phase D2 fields (`hornInferenceStepCap`, `tauPrologVersion`) explicitly OUT per §3.2. Full lock achieved. **DP-2.3.2 unblocked** pending developer ACK. |

## 4. Implementation gating

- **DP-2.1** — **GREEN-LIT** 2026-04-23 on SME revision ACK. All DP-2.1 decisions locked.
- **DP-2.2** — **GREEN-LIT** 2026-04-23 on X1 resolution. `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` is the operational-definition reference for `DependencyGraph` construction and `reconciliationHistory` parent-reconciliation semantics.
- **DP-2.3.0 byte-capture** — **LANDED 2026-04-24.** crypto-shim + ingestion-byte-registry + upload-panel hook + bfo-signature-cache onSessionStart bytes extension. 25 unit tests green.
- **DP-2.3.1 per-round hashing** — depends on DP-2.3.0 complete.
- **DP-2.3.2 Final Hash** — **UNBLOCKED 2026-04-24** on X2 delivery. Allow-list authority is `specs/d16/dp2-x2-config-allow-list-memo-v1.md`. Pending developer ACK of memo before coding.
- **Acceptance** — after DP-2.3.2 lands.

## 5. Lock completion criteria

Full lock of this artifact requires:

1. ✅ SME acknowledgement that the revised sketch resolves P1, P2, F1-F4 — **received 2026-04-23.**
2. ✅ SME delivery of X1 (Forward-Flag Item 1 operational-definition memo) — **received 2026-04-23 as REV1; developer ACK same day.**
3. ✅ SME delivery of X2 (config hash field allow-list) — **delivered 2026-04-24 as `specs/d16/dp2-x2-config-allow-list-memo-v1.md`.** Awaiting developer ACK.

**Lock status: LOCKED 2026-04-24** (pending formal developer ACK of X2 memo; analogous to Wave 2's 2026-04-22 lock). Full DP-2 implementation proceeds sub-wave by sub-wave without further design-review cycles.

## 6. Watch-items surfaced during lock-completion

Tracked for empirical observation during implementation; not blocking.

- **§4.9 OERS precondition false-positive risk at OBO-scale ingestion.** Per X1 memo reserved-door framing: if `owl:equivalentClass` axioms in OBO imports produce frequent false-positive "un-canonicalized" detections due to benign cross-import overlaps, §4.9 detection semantics may need refinement to distinguish OERS-resolvable from OERS-resolved equivalences. SME default preference is fail-fast. Developer will surface empirical rate during DP-2.2 integration; if fail-fast blocks PROV-O Pass 2 session startup, recovery-strategy decision re-opens (fail-fast vs graph-collapse with audit trail).

- **Engine-Workbench config split-brain (X2 memo §5.1).** DP-1 thresholds live in engine `sessionConfig`; `weightVector` lives in the Workbench localStorage snapshot. DP-2.3.2 implementation must read from an immutable session-start snapshot for each allow-list field. Recommended: consolidate both sources into a unified session-start config snapshot at `sessionStart` lifecycle event. Developer has flexibility on implementation as long as the immutability requirement holds.

- **Spec citation correction: W-D-16 → PS-8.** The `dp2-scaffolding-design-sketch.md` §5.2.2 references "Config immutable post-start per Workbench v0.2 W-D-16." W-D-16 is pagination, not config immutability. Correct citation is **Rule PS-8**. Non-blocking for DP-2.3.2 coding; incorporate at next sketch revision. Source: X2 memo §5.2.

- **F4 audit scenario reframing for bundle v5.** DP-2.1's writer landed as pure-function (validates and returns; does not persist) per CLAUDE.md core-module discipline. The `dp2-writepath-chokepoint-exclusivity` scenario (F4, pending bundle v5) must therefore audit **call-site discipline** rather than in-adapter scan — every StateAdapter persist-canonical-record call path MUST have a `writeCanonicalRecord` validation predecessor in the same lexical scope. Static analysis / grep-plus-AST tractable. Developer-surfaced 2026-04-24; SME-ACK'd.
