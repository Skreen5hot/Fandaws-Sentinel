# DP-2 Scaffolding — Pre-Implementation Design Sketch (LOCK-IN-PROGRESS)

**Status:** LOCK-IN-PROGRESS 2026-04-23. SME partial-signoff received same day: 7 of 10 decisions locked outright, 2 locked with companion commitments (D2.1 canonicalization linkage to D3.1; D3.2 byte-capture retrofit raised as DP-2.3.0); 1 pending SME delivery (D3.3 config allow-list). 2 pushbacks resolved this revision (P1 explicit scaffold routing; P2 I2 split into I2a/I2b). 4 flags resolved (F1 causal linkage folded in; F2 Plausible schema verified clean; F3 terminal-provisional validator clause added; F4 audit scenario promoted to required). Full lock contingent on SME's Forward-Flag Item 1 operational-definition memo (X1, pre-DP-2.2) and config allow-list (X2, pre-DP-2.3).
**Scope:** Band 6 DP-2 Invariant Enforcement (10 AVC scenarios) + 3 DP-2-dependent scenarios in other bands (Band 3 override, Band 5 NotApplicable provenance, Band 8 end-to-end acceptance). **13 scenarios total**, plus 1 new supplementary audit scenario (F4).
**Target implementation window:** Weeks 9–11 (three sub-waves, sequential). DP-2.1 green-lit on landing this revision. DP-2.2 blocked on X1. DP-2.3 blocked on X2 + DP-2.3.0 byte-capture retrofit.
**Depends on:** Wave 2 closed (SME-validated 2026-04-22). `project_d16_week9_11_backlog.md` forward-flags converge here.

---

## 1. Architectural frame

### 1.1 What DP-2 is

Per D1.6 spec §7.1: every canonical record produced by D1.6 — across all dispositions (Entailed, Plausible, Inconsistent, NotApplicable) and operational states (PendingHumanResolution, IterationNonConvergence) — carries three mandatory fields: `explanation`, `provenance`, `reproducibilityHash`. Missing any ⇒ non-conformant ⇒ fails AVC.

DP-2 is not a helper. It is a **write-path invariant** on canonical record emission. Unlike Wave 0/1/2 which added reasoning primitives, DP-2 adds an enforcement layer and three companion data pipelines that populate the mandatory fields.

### 1.2 CWA posture (handoff memo)

Canonical records are complete by construction: the D1.6 pipeline itself authors every record and owns all inputs. CWA is appropriate across DP-2 modules. Flag: if any sub-wave surfaces an OWA question (e.g., cross-session hash comparison over a record authored by an external system), raise it before proceeding. Per `feedback_absence_not_evidence.md`, do not treat absence of a provenance subfield as evidence of a specific prior state.

### 1.3 Scaffold/production split applied

DP-2's three mandatory fields are co-required — the schema gate rejects a record missing any one. This creates an ordering hazard: if we land the schema gate before emitters for all three fields exist, nothing writes. Per `feedback_scaffold_production_split.md`:

- **DP-2.1** ships the schema gate plus **minimal scaffold emitters** for all three fields (placeholder-shaped but schema-conformant).
- **DP-2.2** replaces the `explanation` and `provenance` scaffolds with production emitters.
- **DP-2.3** replaces the `reproducibilityHash` scaffold with the production deterministic-hash pipeline.

Scaffold handlers remain as regression fallback per the persistent-coexistence rule.

### 1.4 Named invariants introduced

Per `feedback_named_invariants.md`, load-bearing commitments get formal names. **Per SME review pushback P2, I2 is split into I2a (shape-level, enforced from DP-2.1) and I2b (hash-correctness, activates at DP-2.3):**

- **DP-2-I1 (Schema Gate):** no canonical record is persisted unless the top-level shape conforms to §7.2 + §7.3 + §7.4. Enforced at a single chokepoint (`writeCanonicalRecord`). Enforced from DP-2.1.
- **DP-2-I2a (Shape-Level Content Validation):** axiom evidence list non-empty (except NotApplicable, which may be single-element naming the routing trigger per §7.5). Iteration history non-empty. Hash field present and syntactically well-formed (64-char lowercase hex OR the DP-2.1/DP-2.2 interim placeholder form). `validationState` is not terminal-`provisional` (per F3 clarification: `provisional` is reconciliation-pending by design, per NA architecture Commitment 2; a persisted canonical record with `validationState: 'provisional'` means NA-1.2 never ran and is a defect). Enforced from DP-2.1.
- **DP-2-I2b (Hash-Value-Correctness):** hash bytes are the correct output of the §7.4 deterministic computation over the canonical input list. Activates at DP-2.3. During DP-2.1 and DP-2.2, records carry `_scaffold: true` sentinel which is the explicit bypass token for I2b. DP-2.3 landing includes a sweep test asserting zero persisted canonical records retain the sentinel — removal of the sentinel is the I2b activation switch.
- **DP-2-I3 (Deterministic Hash):** identical inputs ⇒ identical Final Hash across sessions. Verified by dual-session run scenario. Activates at DP-2.3.
- **DP-2-I4 (Dictionary Discipline):** individual records reference shared axioms by dictionary ID only; inlining is a content-validation failure per DP-2-R5. Enforced from DP-2.2.

---

## 2. Sub-wave split

| Sub-wave | Theme | Scenarios | Forward-flags resolved |
|---|---|---|---|
| DP-2.1 | Schema gate + write-path chokepoint + scaffold emitters. Enforces I1 + I2a. | `dp2-schema-validation-rejects-missing-explanation`, `dp2-schema-validation-rejects-empty-axiom-evidence`, new supplementary `dp2-writepath-chokepoint-exclusivity` (per F4) | — |
| DP-2.2 | Explanation builder + provenance builder + axiom dictionary. Activates I4. **Blocked on SME X1 (Item 1 operational definition).** | 4 explanation scenarios (Entailed/Plausible/Inconsistent/NotApplicable) + `dp2-provenance-iteration-history` + `dp2-axiom-dictionary-deduplication` + Band 3 `evidence-inconsistent-override-path` + Band 5 `notapplicable-provenance-fields` | bfo-signature-cache session-hash registry (Item 2) lands here; `applyMutationSequence` must-compute fields (Item 3) land here |
| **DP-2.3.0** | **Byte-capture retrofit (per D3.2 lock).** Upload panel + ingestion session persist `sourceContentHash` + `sourceByteLength`. BFO loader persists `bfoContentHash` + `bfoByteLength`. Prerequisite for DP-2.3.1 hash pipeline. | — (retrofit; verified indirectly via DP-2.3.1/.2 scenarios) | — |
| DP-2.3.1 | Per-round hash computation at iteration boundaries. | (partial) `dp2-reproducibility-hash-per-round-and-final` | — |
| DP-2.3.2 | Final Hash assembly + cross-session equivalence. Activates I2b + I3. **Blocked on SME X2 (config allow-list).** | (completes) `dp2-reproducibility-hash-per-round-and-final`, `dp2-reproducibility-cross-session` | — |
| Acceptance | End-to-end PROV-O through the full pipeline | Band 8 `provo-end-to-end-acceptance` | Terminal gate — closes D1.6 Phase 1 |

Sequential: DP-2.1 → DP-2.2 → DP-2.3.0 → DP-2.3.1 → DP-2.3.2 → Acceptance. Each sub-wave is independently reviewable and independently green-light-able.

---

## 3. DP-2.1 — Schema Gate + Write-Path Chokepoint

### 3.1 Goal

Install the single chokepoint through which every canonical record flows on its way to persistence. Enforce DP-2-I1 (schema gate) at that chokepoint. Ship minimal scaffold emitters for all three mandatory fields so downstream consumers see schema-conformant records from day one.

### 3.2 Deliverables

- **`src/core/d16/canonical-record-writer.js`** (NEW) — exposes `writeCanonicalRecord(record, context)`. `context.phase: 'scaffold' | 'production'` is a **required** field (per P1 pushback resolution). Dispatches to named scaffold-builder or production-builder paths explicitly; there is no absence-based routing. Runs schema validation (I1) then shape-level content validation (I2a); on pass, persists via the existing StateAdapter; on fail, throws a structured `DP2NonConformanceError` naming the failing field and rule. `context.phase` value is logged in the provenance record for audit reconstruction.
- **`src/core/d16/dp2-schema.js`** (NEW) — hand-rolled JSON schema validator (no runtime deps per edge-canonical constraint). Shape-checks `explanation`, `provenance`, `reproducibilityHash` per §7.2/§7.3/§7.4. Emits field-level error paths. Includes the I2a clause rejecting `validationState: 'provisional'` at persist time (per F3 resolution).
- **Scaffold emitters** (named-path dispatch per P1; distinct module entry points):
  - `buildScaffoldExplanation(cau, disposition)` — returns `{ dispositionReason, axiomEvidence: [<trigger-noting stub>], reasoningSteps: [], alternativesConsidered: [], validationState: 'not_inherited', conflictAnnotation: null, reconciliationHistory: [] }`
  - `buildScaffoldProvenance(cau, sessionId)` — returns minimum §7.3 shape with single round-0 iteration entry, empty cross-CAU influences, empty property alignments, defaults for reasoner state.
  - `buildScaffoldReproducibilityHash(cau)` — returns `{ algorithm: 'SHA-256', perRoundHashes: [{ round: 0, hash: '<zeros-placeholder>', inputsHashed: [] }], finalHash: { hash: '<zeros-placeholder>', authoritative: true, inputsHashed: [...canonical list per §7.4] }, _scaffold: true }`. The `_scaffold: true` sentinel is the I2b bypass token; DP-2.3.2 sweep test verifies zero persisted records retain it.
- **Chokepoint wiring:** every call site that previously persisted a canonical record is rerouted through `writeCanonicalRecord`. Known sites from current code:
  - `three-state-evaluator.js` terminals (Entailed / Plausible / Inconsistent routes)
  - `inheritance-cascade.js` NA-1.1 provisional inheritance + NA-1.3 reconciliation paths
  - `reactive-engine.js` NA-1.4 mutation-triggered re-evaluation
  - NotApplicable routing (automatic / default_axiom_poor / manual)
  - Analyst override path (Band 3 `analystOverrideCAU` trigger)

### 3.3 Scenarios covered

| Scenario | Mechanism |
|---|---|
| `dp2-schema-validation-rejects-missing-explanation` | `writeCanonicalRecord` receives a record without `explanation`; schema validator flags the missing top-level key; throws `DP2NonConformanceError` with message `"DP-2 non-conformant: explanation field missing. Rule DP-2-R1 enforces mandatory explanation on all canonical records."`; record not persisted. |
| `dp2-schema-validation-rejects-empty-axiom-evidence` | Content validator runs after schema validator. For non-NotApplicable disposition, `explanation.axiomEvidence.length === 0` fails. For NotApplicable with single-element evidence naming routing trigger, passes. Discrimination enforced by disposition-aware branch in validator. |
| `dp2-writepath-chokepoint-exclusivity` (new; F4) | Belt-and-suspenders regression test: iterate all canonical records in every adapter state and assert each carries all three DP-2 fields and passes the I2a shape-level validator. Failure = a code path bypassed `writeCanonicalRecord`. Tracked in next AVC bundle update. |

### 3.4 Decisions — all LOCKED 2026-04-23

- **DP-2.1.D1 — Writer module location. LOCKED: new module.** `src/core/d16/canonical-record-writer.js`. SME disposition: keeps D1.6-specific enforcement out of the pluggable StateAdapter contract; correct separation.
- **DP-2.1.D2 — Schema validator implementation. LOCKED: hand-rolled.** No Ajv / no runtime dep. SME disposition: matches edge-canonical first principle; citation of DP-2-R1/R2/R3 in error messages is free.
- **DP-2.1.D3 — NotApplicable zero-element evidence. LOCKED with endorsement: single-element floor.** SME disposition: direct application of absence-not-evidence. Zero-element NotApplicable would mean "the system declined to place this CAU and has nothing to say about why" — absence as positive evidence of a reasoning decision. Single-element floor forces the routing trigger to be named explicitly. Non-negotiable.

---

## 4. DP-2.2 — Explanation Builder + Provenance Builder + Axiom Dictionary

### 4.1 Goal

Replace scaffold emitters for `explanation` and `provenance` with production builders that produce content-valid structured output across all four dispositions and all operational states, with session-level axiom dictionary deduplication per DP-2-R5.

### 4.2 Deliverables

- **`src/core/d16/axiom-dictionary.js`** (NEW) — session-scoped `AxiomDictionary` class exposing `intern(axiom): id` and `resolve(id): axiom`. Keying: content hash of the axiom's canonical RDF subgraph representation. Entries persist for the session lifetime; exported in the session bundle per DP-2-R5.
- **`src/core/d16/explanation-builder.js`** (NEW) — per-disposition builders:
  - `buildEntailedExplanation(cau, signature, satisfiedNCs, alternatives, axiomDict)` — populates `dispositionReason` with the satisfying necessary-condition chain; `axiomEvidence` references dictionary IDs for each contributing axiom (weight inferred from contribution role per §7.2); `reasoningSteps` captures each NC evaluation step; `alternativesConsidered` lists rejected BFO categories with reason.
  - `buildPlausibleExplanation(cau, signature, perCategoryEvidence, axiomDict)` — structured evidence for each candidate BFO category. **No prose fields** per scenario `dp2-explanation-mandatory-plausible` negative assertion. Machine-readable JSON only.
  - `buildInconsistentExplanation(cau, signature, disjointnessViolation, axiomDict)` — names the specific disjointness axiom IRI and the conflicting categories array. Contribution role = `triggeredDisjointness`.
  - `buildNotApplicableExplanation(cau, signature, routingMechanism, axiomDict)` — single-element axiom evidence naming the routing trigger; `dispositionReason` documents which of `automatic` / `default_axiom_poor` / `manual` fired.
- **`src/core/d16/provenance-builder.js`** (NEW) — `buildProvenance(cau, sessionState, iterationState, overrideInfo)`. Produces §7.3 shape. Consumes:
  - `sessionState.sessionId`, `sessionState.compatibilityDegraded` (sticky once set, per `project_d16_dp1_threshold_semantics`)
  - `iterationState.rounds[]` — each round emits an entry with `{ round, disposition, bfoCategory, reasonerStepsConsumed, timestamp }`
  - `iterationState.crossCAUInfluences[]` — accumulated by the three-state evaluator via explicit callback (see DP-2.2.D2)
  - `iterationState.propertyAlignmentsConsumed[]` — populated by Phase 2 iteration when property disambiguation feeds back into Phase 1
  - `overrideInfo` — analyst override flag + original disposition, if applicable
- **v1.1.0 extension wiring:** `validationState`, `conflictAnnotation`, `reconciliationHistory` fields (per §7.2 v1.1.0 schema discipline):
  - NA-1.1 provisional inheritance sets `validationState: 'provisional'` as an **in-flight transitional state** (per F3 clarification: never persisted to a canonical record — NA-1.2 must complete first, transitioning to `validated_no_conflict` / `soft_conflict_detected` / `hard_conflict_detected`). I2a rejects terminal-`provisional` at the write chokepoint.
  - NA-1.3 reconciliation cascade appends entries to `reconciliationHistory` with `triggeringEvent: 'parent_reconciliation'` (references axiomDictionary IDs per DP-2-R5, not inlined metadata).
  - NA-1.4 reactive engine appends entries with `triggeringEvent: 'na14_mutation'`.
  - Analyst override appends with `triggeringEvent: 'analyst_override'`.
- **Causal linkage in reconciliationHistory (per F1 fold-in):** each entry carries an optional `causedBy: <prior entry ID> | null` field. Null for independent events (e.g., an analyst override with no prior cascade). Non-null when the writer knows at write time that the current entry is a downstream effect of a prior entry — e.g., NA-1.4 firing in response to NA-1.3 cascade sets `causedBy` to the NA-1.3 entry's ID. Preserves cascade-causality for audit reconstruction without forcing callers to infer from timestamp proximity. Schema-optional (to match real-world independent-event cases) but strongly-valued when present.
- **Structured failure reason consumption:** per `feedback_structured_failure_reasons.md`, Wave 0/1/2 helpers already return `reason` enums alongside `result: false`. The explanation builder consumes these directly as `contributionRole` values — no retrofit needed.
- **Session-hash registry** (resolves forward-flag Item 2 from `project_d16_week9_11_backlog.md`): `bfo-signature-cache.js` is extended with a session-scoped hash registry keyed by `(cau IRI, signature content hash)` so provenance can cite the exact signature evaluated at each round without re-hashing.
- **`applyMutationSequence` must-compute fields** (resolves forward-flag Item 3): the canned `true` values in `reactive-engine.js:applyMutationSequence` become real computations sourced from the iteration state. Each mutation emits a `reconciliationHistory` entry.

### 4.3 Scenarios covered

| Scenario | Mechanism |
|---|---|
| `dp2-explanation-mandatory-entailed` | All Entailed records route through `buildEntailedExplanation`; schema verifies `satisfiedConditionIRIs` non-empty, `axiomsContributing` non-empty, `candidateBFOCategory` required. |
| `dp2-explanation-mandatory-plausible` | `buildPlausibleExplanation` produces machine-readable JSON only. Validator checks absence of any prose-typed field (no free-form strings in evidence positions). |
| `dp2-explanation-mandatory-inconsistent` | `buildInconsistentExplanation` names disjointness axiom IRI + conflicting categories array. |
| `dp2-explanation-mandatory-notapplicable` | All 3 routing mechanisms (automatic, default_axiom_poor, manual) route through `buildNotApplicableExplanation`; each traces to a specific rule. |
| `dp2-provenance-iteration-history` | `buildProvenance` emits one entry per round; single-pass sessions have length 1, N-round fallback have length N. All entries contain `{round, disposition, bfoCategory, reasonerStepsConsumed, timestamp}`. |
| `dp2-axiom-dictionary-deduplication` | Session with 10 CAUs all citing `hasParticipant some Continuant`: the axiom is interned once; all 10 records cite the same dictionary ID. `inspectProvenanceStorage` verifies records contain ID references, not inline text. |
| `evidence-inconsistent-override-path` (Band 3) | Analyst override path calls `writeCanonicalRecord` with `overrideInfo = { analystOverride: true, originalDisposition: 'Inconsistent' }`. Provenance reflects the override; session-level `compatibilityDegraded` is **not** touched (per-CAU flag only, per Rule EV-1). |
| `notapplicable-provenance-fields` (Band 5) | NotApplicable records take the same write-path as Entailed/Plausible/Inconsistent; all three DP-2 fields present and content-valid. |

### 4.4 Decisions — all LOCKED 2026-04-23

- **DP-2.2.D1 — axiomDictionary keying function. LOCKED with linkage to D3.1: content hash of canonical RDF subgraph using JCS canonicalization shared with DP-2.3 Final Hash.** SME disposition: text-string keying fails on whitespace/prefix/ordering variants; content hashing dedupes semantically-equivalent axioms regardless of source syntax. **Companion lock:** the canonicalization used here is the same JCS-based canonicalization adopted in D3.1 — changing one requires revisiting the other.
- **DP-2.2.D2 — crossCAUInfluences capture mechanism. LOCKED: explicit callback.** SME disposition: automatic introspection couples provenance to reasoner internals — the coupling transparent-forwarding was established to prevent. Explicit `recordCrossCAUInfluence(sourceCau, influenceType, targetCau)` callback keeps coupling shallow.
- **DP-2.2.D3 — reconciliationHistory write protocol. LOCKED: single-writer per event, append-only, no coalescing. F1 causal linkage folded in (see §4.2).** SME disposition: coalescing would erase the NA-1.3-vs-NA-1.4 distinction. Per F1, each entry carries optional `causedBy` reference to prior entry when the writer knows causality at write time; preserves cascade-causality for Workbench Phase 2 Review audit rendering.
- **DP-2.2.D4 — NotApplicable routing mechanism enum closure. LOCKED: closed in v1.0.** `automatic | default_axiom_poor | manual`. SME disposition: matches locked-decision discipline; amendment-path preserves extensibility without silent semantics drift.

---

## 5. DP-2.3 — Reproducibility Hash Pipeline

### 5.1 Goal

Replace the scaffold hash placeholder with the production deterministic-hash pipeline. Per-round hashes (diagnostic) and Final Hash (authoritative) computed over canonicalized inputs per §7.4. Cross-session reproducibility verified end-to-end.

### 5.2 Deliverables — three sub-steps

#### DP-2.3.0 — Byte-capture retrofit (per D3.2 lock)

**Prerequisite for DP-2.3.1.** Current state (verified 2026-04-23): byte-capture is **not satisfied** on either the ontology side or the BFO side.

- `docs/workbench/js/panels/ingest/upload-panel.js:230` calls `parseOntology(fileContent, ...)` and retains only `parsed.classes` / `parsed.properties` / `parsed.imports`; raw `fileContent` goes out of scope post-handler.
- `src/core/d16/bfo-signature-cache.js` tracks BFO by `bfoVersion` string only (default constant); no file-content bytes or content SHA.

**Retrofit:**
- Upload panel captures raw `fileContent` at upload time, computes SHA-256 via the DP-2.3 crypto shim, persists `{sourceContentHash, sourceByteLength}` on the IngestionSession record. Raw bytes may be discarded post-hash (hash is what DP-2.3.2 consumes).
- BFO loader captures BFO Turtle bytes at load time, computes SHA-256, persists `{bfoContentHash, bfoByteLength}` on the session-scoped cache entry.

Small work (~an afternoon) but a genuine new line item. Ships before DP-2.3.1 so the hash pipeline has correct inputs from first run.

#### DP-2.3.1 — Per-round hash computation

- **`src/core/d16/reproducibility-hash.js`** (NEW) — `computePerRoundHash(cau, round, roundInputs)` called at every iteration round boundary. Hashes the current round's input set (signature snapshot, reasoner state key, cross-CAU influences consumed this round). Result inserted into `perRoundHashes[]` at that round's entry.
- **`src/core/d16/canonical-serialization.js`** (NEW) — RFC 8785 JCS (JSON Canonicalization Scheme) serializer, ~100 lines. Used for every structured input that feeds a hash. **Shared with DP-2.2 axiomDictionary canonicalization per D2.1-D3.1 linkage lock.**
- **Crypto shim** — `src/core/d16/crypto-shim.js` provides `sha256(bytes)` that resolves to Web Crypto (`crypto.subtle.digest`) in browsers and `node:crypto` in Node. Edge-canonical: no external SHA library. Returns 64-char lowercase hex.

#### DP-2.3.2 — Final Hash + scaffold retirement

- `computeFinalHash(cau, sessionFinalState)` called at session finalization for each canonical record. Hashes the canonical input list per §7.4: `[CAU IRI, final signature hash, BFO version identifier (= bfoContentHash from DP-2.3.0), curated additions version identifier (= curatedContentHash from DP-2.3.0), session configuration hash, final iteration round number]`. Sets `authoritative: true`.
- **BFO version identifier = raw-byte SHA** (per D3.2 lock; owl:versionIRI explicitly rejected as source).
- **Session configuration hash** — JCS over the SME-approved field allow-list (pending X2 SME delivery). Config immutable post-start per Workbench v0.2 W-D-16.
- **`_scaffold: true` retirement** — sentinel removed from all hash records on DP-2.3.2 landing. Sweep test verifies zero persisted records retain the sentinel; this is the I2b activation switch. Scaffold code path retained as fallback per scaffold/production discipline but flag-gated out of default execution.

### 5.3 Scenarios covered

| Scenario | Mechanism |
|---|---|
| `dp2-reproducibility-hash-per-round-and-final` | 2-round fallback session; `perRoundHashes.length === 2`; `finalHash.authoritative === true`; `finalHash.inputsHashed` contains the canonical 6-element list per §7.4. |
| `dp2-reproducibility-cross-session` | Session A and Session B run on identical inputs (same PROV-O file bytes, same BFO file bytes, same curated v1.0, same config). For every CAU, `finalHash.hash` in A equals `finalHash.hash` in B. Mismatch count zero. |

### 5.4 Decisions — dispositions 2026-04-23

- **DP-2.3.D1 — Canonical serialization scheme. LOCKED: JCS (RFC 8785).** SME disposition: number/Unicode/key-ordering edge cases well-specified; ad-hoc canonicalization drifts. Shared with DP-2.2 axiomDictionary per D2.1-D3.1 linkage lock.
- **DP-2.3.D2 — BFO version identifier source. LOCKED with byte-capture requirement: file-content SHA over raw ingested bytes (not re-serialized post-parse).** SME disposition: `versionIRI` is author-controlled; content SHA makes reproducibility robust to mislabeled versions. Byte-capture retrofit raised as **DP-2.3.0** (see §5.2) — currently-not-satisfied on either ontology or BFO side; lands before DP-2.3.1.
- **DP-2.3.D3 — Session configuration hash scope. Approach LOCKED: explicit allow-list of semantically-relevant fields. Field list OWED by SME (X2) — delivery pre-DP-2.3.2.** Developer proposal for SME review: fields that affect reasoning outputs (weight vector bounds, iteration fallback cap, OWA/CWA posture flags). Fields that do NOT hash: `logVerbosity`, UI preferences, session UUID. SME to confirm / revise / replace the list before DP-2.3.2 coding begins.

---

## 6. Acceptance Gate — Band 8 `provo-end-to-end-acceptance`

After DP-2.3 lands, the terminal acceptance scenario runs a full PROV-O session through all three pipeline phases. 30 CAUs evaluated. Three-state disposition distribution captured. All records DP-2-conformant. Final hashes stable under re-run. Session bundle (including axiomDictionary, iteration history, DP-1 diagnostic, per-CAU records) exports as valid JSON.

This closes the 13-scenario block and unblocks D1.6 Phase 1 completion. It also re-enables PROV-O Pass 2 calibration, which was the driver per D1.6 spec §0.5.

---

## 7. Integration considerations

### 7.1 Write-path choke discipline

Every canonical record emission goes through `writeCanonicalRecord`. Any code path that bypasses the chokepoint to persist a record directly is a DP-2 defect. To prevent bypass:

- StateAdapter's record-write methods do **not** get called directly by D1.6 modules. Callers invoke `writeCanonicalRecord`, which in turn calls StateAdapter.
- **Required (per F4 SME decision):** AVC-level audit scenario `dp2-writepath-chokepoint-exclusivity` verifies no canonical record exists in any adapter state whose `explanation`/`provenance`/`reproducibilityHash` fields are absent or shape-invalid. Tracked in next AVC bundle update (bundle v5). Belt-and-suspenders regression insurance against future chokepoint bypass.

### 7.2 Scaffold retirement timing

Scaffold emitters in DP-2.1 stay live through DP-2.2 and DP-2.3 implementation. They are retired from the default path only when the corresponding production emitter is SME-validated. Per scaffold/production discipline, the scaffold code path remains reachable via a feature-flag fallback — not deleted.

### 7.3 Forward-flag convergence

Per handoff memo and `project_d16_week9_11_backlog.md`:

- **Item 1 — operational definition of "property-linked neighbor" (SME-owned). RESOLVED 2026-04-23.** SME delivered `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` (REV1). Developer ACK same day. Definition: two CAUs are property-linked neighbors iff (1) they co-occupy the declared domain/range of any ObjectProperty, or (2) one cites the other via a class-axiom restriction's `onProperty`/target. Symmetric, undirected graph. NC-satisfaction-pattern sharing explicitly excluded. `DependencyGraph.getNeighbors(cau)` is the integration API. **DP-2.2 unblocked.**
- **Item 2 — bfo-signature-cache session-hash registry:** lands in DP-2.2 as prerequisite for provenance's `reasonerState` subfield.
- **Item 3 — `applyMutationSequence` must-compute fields:** lands in DP-2.2 alongside NA-1.4 reactive-engine wiring to provenance.
- **Item 4 — §4.5 convergence argument companion:** already merged; no DP-2 impact.
- **Item 5 — class-subsumption infrastructure for curated-list `include_subclasses: true`:** outside DP-2 scope; tracked separately.
- **Item 6 — CCO Quality exemplar fixture expansion:** outside DP-2 scope; low-pri.

### 7.4 DP-1 interaction (no scope overlap)

DP-1's session-level `compatibilityDegraded` flag is read by the provenance builder (propagated into every record's `provenance.compatibilityDegraded`), but DP-1 thresholds and firing semantics are owned by `dp1-diagnostic.js` (Band 7, complete). DP-2 consumes DP-1 state; it does not modify DP-1 behavior.

### 7.5 Workbench v0.2 panel adaptation

Per D1.6 §9.3, Phase 1 and Phase 2 Review panels adapt to display DP-2 fields. This is Workbench-side work, not DP-2 infrastructure work; it is tracked under the Workbench v0.2 status line (updated in ROADMAP.md on 2026-04-23). DP-2 just needs to ensure `explanation` is structured enough for panel rendering — already required by `dp2-explanation-mandatory-plausible` negative assertion (no prose).

---

## 8. Dependencies

- **Wave 2 closed:** all 10 SME-LOCKED helper items integration-path-complete. DP-2 consumes their `reason` enums.
- **Structured failure reasons (feedback memory):** already in place — no retrofit.
- **Transparent callback forwarding (feedback memory):** extended to the provenance builder's cross-CAU influence capture.
- **`project_d16_dp1_threshold_semantics`:** `compatibilityDegraded` sticky once set; provenance reflects session-level state at record emission time.
- **IndexedDB-backed DependencyGraph infrastructure** (v1.1.0 amendment): required for reconciliationHistory events that cite parent-reconciliation triggers.
- **No new curated lists required** per SME scoping memo 2026-04-22.

---

## 9. NOT in scope for DP-2

- Full AVC bundle v5 authoring (this is spec work; DP-2 is implementation).
- Workbench v0.2 Phase 1/2 Review panel UI adaptations (§9.3 — Workbench side, separate track).
- PROV-O Pass 2 calibration execution itself (DP-2 unblocks it but does not perform it).
- RoleNC5 (deferred to v1.1+ per Wave 3 disposition).
- D2.1 Phase 2 rearchitecture (future spec; out of D1.6 scope).
- Cross-session hash comparison *between* different ontology file versions (reproducibility is defined only for identical inputs; cross-version comparison is a separate capability).
- Extension of the reproducibility hash to cover Phase 3 Tau Prolog trace content (trace stability is handled by the existing D2 Phase 3 sandbox; hash covers final placement only).

---

## 10. Decision summary — post-SME-review 2026-04-23

| ID | Topic | Disposition |
|---|---|---|
| DP-2.1.D1 | Writer module location | **LOCKED** — new module |
| DP-2.1.D2 | Schema validator approach | **LOCKED** — hand-rolled, no dep |
| DP-2.1.D3 | NotApplicable zero-element evidence | **LOCKED with endorsement** — single-element floor |
| DP-2.2.D1 | axiomDictionary keying | **LOCKED with linkage to D3.1** — content hash via shared JCS canonicalization |
| DP-2.2.D2 | crossCAUInfluences capture | **LOCKED** — explicit callback |
| DP-2.2.D3 | reconciliationHistory write protocol | **LOCKED** — single-writer, no coalescing, F1 causal linkage folded in (`causedBy` field) |
| DP-2.2.D4 | NotApplicable mechanism enum closure | **LOCKED** — closed in v1.0 |
| DP-2.3.D1 | Canonical serialization | **LOCKED** — JCS (RFC 8785) |
| DP-2.3.D2 | BFO version identifier | **LOCKED with byte-capture requirement** — raw-bytes SHA; retrofit = DP-2.3.0 |
| DP-2.3.D3 | Config hash field scope | **Approach LOCKED** (explicit allow-list); **field list OWED by SME (X2)** pre-DP-2.3.2 |

**SME-generated review items (tracked):**

| ID | Status |
|---|---|
| SME-DP2-P1 (§3.2 scaffold routing) | **Resolved** — explicit `phase: 'scaffold' | 'production'` routing; §3.2 revised |
| SME-DP2-P2 (§1.4 I2 split) | **Resolved** — I2a enforced from DP-2.1, I2b from DP-2.3.2; §1.4 revised |
| SME-DP2-F1 (causal linkage) | **Resolved — folded in** — `causedBy` optional field added to reconciliationHistory |
| SME-DP2-F2 (Plausible schema) | **Resolved — verified clean** — §4.3 schema contains no general ranking field; `subsumptionResolution.winner` scoped to §4.6 overlap only |
| SME-DP2-F3 (validationState terminal) | **Resolved** — per NA Commitment 2, `provisional` is reconciliation-pending; I2a rejects terminal-`provisional` at persist |
| SME-DP2-F4 (audit scenario promotion) | **Resolved — promoted to required** — `dp2-writepath-chokepoint-exclusivity` tracked for AVC bundle v5 |
| SME-DP2-X1 (Forward-Flag Item 1 memo) | **Pending SME delivery** — pre-DP-2.2 blocker |
| SME-DP2-X2 (config allow-list) | **Pending SME delivery** — pre-DP-2.3.2 blocker |

---

## 11. Implementation gating

Per the Wave 2 design-sketch discipline and the DP-2 coding-halt directive in the handoff memo: no DP-2 code written as of this revision. No `canonical-record-writer.js`, `axiom-dictionary.js`, `reproducibility-hash.js`, or related modules exist in `src/core/d16/`.

**Implementation gating post-revision (updated 2026-04-23 post-X1 resolution):**

- **DP-2.1** — **LANDED 2026-04-23.** Modules `src/core/d16/dp2-schema.js` + `src/core/d16/canonical-record-writer.js` shipped. 43/43 unit tests pass; 2/2 Band 6 DP-2.1 AVC scenarios pass (`dp2-schema-validation-rejects-missing-explanation`, `dp2-schema-validation-rejects-empty-axiom-evidence`). Zero regressions across 108 test suites / 2,359 passing. F4 supplementary scenario `dp2-writepath-chokepoint-exclusivity` deferred to AVC bundle v5 (requires SME authorization per handoff-memo NOT-TO-DO discipline).
- **DP-2.2** — **GREEN-LIT.** X1 memo (REV1) delivered and ACK'd same day; `DependencyGraph` operational definition locked.
- **DP-2.3.0 byte-capture** — **LANDED 2026-04-24.** Modules `src/core/d16/crypto-shim.js` + `src/core/d16/ingestion-byte-registry.js` shipped. Upload panel + bfo-signature-cache integration wired. 25/25 unit tests green (includes NIST SHA-256 vectors). Registry exposed via `Fandaws.captureSourceBytes` / `captureBFOBytes` / `captureCuratedBytes` / `getIngestionHashes`.
- **DP-2.3.1 per-round hashing** — depends on DP-2.3.0 complete.
- **DP-2.3.2 Final Hash + scaffold retirement** — **blocked on SME-DP2-X2** (config allow-list, last remaining gating item).
- **Acceptance** — after DP-2.3.2 + supplementary audit scenario landing.

Companion artifact `dp2-locked-decisions.md` captures the 10 design-sketch decisions as a standalone reference analogous to Wave 2's locked-decisions pattern.
