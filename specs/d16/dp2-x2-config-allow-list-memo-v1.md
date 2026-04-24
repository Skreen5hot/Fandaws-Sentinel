# SME-DP2-X2 — Session Configuration Hash Allow-List

**Status:** v1.0 2026-04-24. Finalizes the last open item in `specs/d16/dp2-locked-decisions.md` (D3.D3). Delivers the authoritative allow-list for the session-configuration hash input at position 5 of the DP-2.3.2 Final Hash canonical list per D1.6 §7.4.
**Owner:** SME (from `dp2-locked-decisions.md` D3.D3 "field list OWED by SME").
**Consumes:** developer proposal 2026-04-24; `project_d16_dp1_threshold_semantics.md`; `feedback_absence_not_evidence.md`.
**Consumed by:** DP-2.3.2 Final Hash assembly in `src/core/d16/reproducibility-hash.js` (not yet landed); the sweep test that removes the `_scaffold: true` sentinel.
**Scope fence:** defines the field set that hashes into the **D1.6 session configuration hash** only. Upstream Phase D2 ingestion config (Tau Prolog cap, Tau Prolog version) is addressed explicitly in §4.2 with an OUT ruling; that is the boundary, not an omission.
**Gating:** resolution of this memo completes `dp2-locked-decisions.md` full lock. DP-2.3.2 coding unblocked on developer ACK.

---

## 1. Problem statement

D1.6 §7.4 specifies six inputs to the Final Hash canonical list, of which position 5 is the **session configuration hash**. The `dp2-locked-decisions.md` D3.D3 ruling locked the approach — an explicit allow-list, rejecting indiscriminate hashing of all config fields — but deferred the field enumeration to SME delivery.

The developer proposal 2026-04-24 enumerated a three-field candidate set (DP-1 thresholds + `weightVector`), withdrew pre-proposal fields that do not exist in the current codebase (iteration fallback cap, OWA/CWA posture knobs), and surfaced one watch-item (engine-snapshot split-brain). This memo:

- Confirms the three-field allow-list with light refinement to hashing semantics.
- Extends the OUT enumeration to cover two upstream Phase D2 session-config fields (`hornInferenceStepCap`, `tauPrologVersion`) that the developer did not address; rules both OUT with architectural reasoning.
- Corrects one spec citation (W-D-16 is pagination; the correct config-immutability rule is PS-8).
- Establishes amendment criteria for future allow-list extensions.
- Records the split-brain watch-item with implementation guidance for DP-2.3.2.

Load-bearing consequence: under-inclusion silently admits different sessions as reproducible (false-positive cross-session equivalence); over-inclusion silently rejects genuinely reproducible sessions as non-equivalent (false-negative). The allow-list must be tight in both directions.

---

## 2. Allow-list

### 2.1 Formal enumeration

The session configuration hash is the JCS canonicalization (per D3.D1 lock on RFC 8785) of an object with the following structure, hashed via SHA-256 per D3.D2's crypto shim:

```
{
  "notApplicableThreshold": <integer, percent, 0-100>,
  "inconsistentThreshold":  <integer, percent, 0-100>,
  "weightVector": {
    "domain":          <number, 0.0-1.0>,
    "range":           <number, 0.0-1.0>,
    "bfoSubcategory":  <number, 0.0-1.0>,
    "characteristics": <number, 0.0-1.0>,
    "allowsInheresIn": <number, 0.0-1.0>,
    "lexical":         <number, 0.0-1.0>
  }
}
```

Three top-level fields; six sub-fields via `weightVector` expansion. All six `weightVector` keys are required; no optional sub-fields at v1.0.

### 2.2 Field-by-field rationale

**`notApplicableThreshold`** — percent threshold for DP-1 diagnostic firing on the NotApplicable rate per Rule DP-1-R2. Default 40% per [src/core/d16/dp1-diagnostic.js:31](src/core/d16/dp1-diagnostic.js#L31). Configurable at session start via `sessionConfig.notApplicableThreshold`. Changing this value changes whether DP-1 fires on a given session outcome, which changes `compatibilityDegraded` propagation into every canonical record's provenance. IN.

**`inconsistentThreshold`** — percent threshold for DP-1 diagnostic firing on the Inconsistent rate per Rule DP-1-R2. Default 30% per [src/core/d16/dp1-diagnostic.js:32](src/core/d16/dp1-diagnostic.js#L32). Same reasoning as above. IN.

**`weightVector`** — six-dimension Phase 2 fingerprint-matching weight vector per Rule PD-10 / Decision D-9, enforced by [src/core/ingestion/fingerprint-matcher.js:17-24](src/core/ingestion/fingerprint-matcher.js#L17-L24) with validation bounds at [lines 34-54](src/core/ingestion/fingerprint-matcher.js#L34-L54): structural sum (`domain + range + bfoSubcategory`) ≥ 0.70; `lexical` ≤ 0.10. The weight vector determines Phase 2 disambiguation match scores, which produce the property alignments that feed into D1.6's reasoning via `provenance.propertyAlignmentsConsumed` (§7.3 schema). Different weights produce different alignment sets, which produce different D1.6 reasoning outputs. IN.

### 2.3 Authoritative source per field

For DP-2.3.2's hash assembly, the authoritative source for each field is:

| Field | Authoritative source | Access path |
|---|---|---|
| `notApplicableThreshold` | Engine `sessionConfig` object | Passed to `runDP1Diagnostic` input; DP-2.3.2 reads from the session's frozen `sessionConfig` snapshot at finalization time |
| `inconsistentThreshold` | Engine `sessionConfig` object | Same as above |
| `weightVector` | Workbench frozen config snapshot | `localStorage` key `fandaws:ingest:config:{sessionId}` per [docs/workbench/js/panels/ingest/ingest-state.js:220-226](docs/workbench/js/panels/ingest/ingest-state.js#L220-L226); written at session start per [upload-panel.js:307-313](docs/workbench/js/panels/ingest/upload-panel.js#L307-L313) |

This split is an implementation reality, not a design choice; the watch-item in §5.1 addresses it.

### 2.4 Effective-value hashing

The hash input MUST use the **effective post-default-resolution** value for each field, not the raw user-provided input. Two sessions with semantically identical configuration — one that omits `notApplicableThreshold` and falls back to the 40% default, one that explicitly sets `notApplicableThreshold: 40` — MUST produce identical config hashes.

Rationale: reproducibility is defined over semantic equivalence, not input-syntax equivalence. Hashing raw inputs would spuriously differentiate sessions that executed identically.

Implementation: DP-2.3.2 resolves defaults before JCS canonicalization. The default-resolution logic already exists in `runDP1Diagnostic` ([dp1-diagnostic.js:53-54](src/core/d16/dp1-diagnostic.js#L53-L54)) and in `buildFingerprint` consumers (`config.weightVector || Fandaws.DEFAULT_WEIGHT_VECTOR` at [phase1-review-panel.js:281](docs/workbench/js/panels/ingest/phase1-review-panel.js#L281)). DP-2.3.2 must consume the same resolution path rather than re-implement it, to avoid drift.

### 2.5 JCS canonicalization determinism

Per D3.D1, the JCS canonicalizer handles key ordering, number representation, and Unicode normalization. The six `weightVector` sub-fields therefore need no explicit ordering directive — JCS sorts keys alphabetically. The hash is stable across re-serializations of semantically-equivalent input objects.

---

## 3. Excluded fields (with rationale)

Per locked-decision discipline, absence from the allow-list is NOT positive evidence that a field is reasoning-neutral. It is a conscious design ruling, amendment-governed. Each excluded field below is ruled OUT with the specific mechanism that keeps its omission sound.

### 3.1 Derived session state (captured elsewhere)

**`compatibilityDegraded`** — derived from DP-1 firing; session-sticky once set per `project_d16_dp1_threshold_semantics.md`. OUT of config hash. Reasoning: `compatibilityDegraded` is an output of DP-1, not an input. Its value is fully determined by `(notApplicableThreshold, inconsistentThreshold, totalCAUs, notApplicableCount, inconsistentCount)`. The thresholds are hashed (§2); the session's CAU counts flow into the per-round hashes via signature and iteration history. Hashing `compatibilityDegraded` would be redundant with its upstream inputs and fragile against future derivation changes. Provenance already captures it at the per-record level via `provenance.compatibilityDegraded` (§7.3).

**`parsedProperties`** — derived from raw ontology bytes via the parser. OUT. Reasoning: fully determined by `(sourceContentHash, parserVersion)`. Source bytes are captured as a separate §7.4 input via DP-2.3.0 byte-capture. If parser version changes alter output, the effect propagates into CAU signatures, which hash separately at §7.4 position 2. Hashing `parsedProperties` would double-count upstream effects.

### 3.2 Upstream Phase D2 configuration (SME extension to developer proposal)

The developer proposal did not address two session-config fields that exist in the Phase D2 ingestion layer. Both are ruled OUT with explicit reasoning.

**`hornInferenceStepCap`** — Tau Prolog inference step cap, 10,000 per Decision D-12, immutable mid-session per Rule PS-8 (`sandbox-inference-cap-immutable-mid-session` scenario). A real session-config field, not a hard-coded constant. OUT of DP-2.3.2 config hash.

Reasoning: the cap affects which axioms survive Phase D2 quarantine, which affects which axioms reach D1.6 signature generation. The effect is fully captured downstream by the CAU signature hash (§7.4 position 2). Two sessions with identical ontology bytes and different caps will produce different signatures iff the cap is binding for at least one axiom; identical signatures will be produced otherwise. In the first case, the signature-hash difference correctly distinguishes them; in the second case, they are genuinely reproducible and the config hash should not spuriously differentiate them.

Including `hornInferenceStepCap` in the config hash would produce false-negative reproducibility matches: two sessions that produce byte-identical canonical records but used different (non-binding) caps would be reported as non-reproducible. That contradicts the reproducibility definition of "identical outputs from identical inputs."

**`tauPrologVersion`** — Tau Prolog engine version string, captured as a first-class session field per phase-d2-avc-bundle scenario 1602. OUT of DP-2.3.2 config hash.

Reasoning: same as `hornInferenceStepCap`. Engine version affects Phase D2 outputs (quarantine decisions), which propagate into D1.6 via signatures. Effect captured downstream at §7.4 position 2. Analogous to the BFO version handling: BFO's effect on reasoning is captured by raw-byte SHA of BFO bytes (§7.4 position 3 via DP-2.3.0) because BFO content is load-time data; Tau Prolog is a software component whose effect on reasoning surfaces through its outputs (the signatures), not through byte-capture of its source.

### 3.3 Separate §7.4 inputs (double-hash hazard)

**BFO version identifier** (§7.4 position 3) and **Curated BFO additions version identifier** (§7.4 position 4). OUT of config hash by structural construction — they are already explicit §7.4 inputs. Per D3.D2, both are raw-byte SHAs captured by DP-2.3.0, not strings.

### 3.4 Metadata, ephemeral, UI

**Session UUID** (`adapterSessionId`), **`logVerbosity`**, **UI preferences** (panel layout, column widths, etc.), **`authorTimestamp`**-type fields. OUT. Reasoning: none of these affect reasoning outputs. Per D3.D3's locked rationale, hashing implementation-only fields falsely invalidates cross-session reproducibility on non-semantic changes.

### 3.5 Declared-but-unused

**`imports`** — recorded at session start per `upload-panel.js:309` but not followed per Decision W-D-19 ("owl:imports recorded but not followed (deferred to v0.3)"). OUT. Reasoning: declared imports produce identical reasoning outputs regardless of their enumerated values, because the v0.2 ingestion pipeline does not traverse them. Hashing would differentiate sessions that are genuinely reproducible.

Amendment trigger flagged in §4.2: if Decision W-D-19 is reversed and imports become followed, `imports` moves to IN and the allow-list is amended synchronously.

### 3.6 Hard-coded constants (not config)

**`MAX_ROUNDS`** — D1.6 iteration fallback cap, constant 3 per [src/core/d16/iteration-mechanics.js:29](src/core/d16/iteration-mechanics.js#L29). OUT. Reasoning: not a configurable field. No user-accessible knob, no session parameter. If a future amendment promotes it to config, trigger flagged in §4.1.

**`ontologyIRI`** — metadata identifier. OUT.

### 3.7 Architecturally non-config

**OWA/CWA posture** — hard-coded per helper in Wave 2 (Option B strict locked 2026-04-22 per `project_d16_wave2_locked_decisions.md`). OUT. Reasoning: posture is a reasoning-layer design choice, not a session-level parameter. Every session uses the same posture by construction.

---

## 4. Amendment criteria

Per locked-decision discipline, additions to the allow-list require an amendment cycle. The following changes in the codebase or the spec trigger an amendment:

### 4.1 New configurable field in the D1.6 or ingestion config surface

If any of the following occurs, the new field must be evaluated against the §3 exclusion categories and either added to the allow-list or documented in the "excluded with rationale" set:

- `MAX_ROUNDS` is promoted from a constant to a configurable field.
- A session-configurable OWA/CWA posture knob is introduced at the reasoning layer.
- DP-1 gains a third threshold (e.g., a separate Plausible-rate threshold).
- The weight vector schema gains a seventh sub-field.
- A new knob is added to Workbench Ingest-mode config beyond the current five-field snapshot.

### 4.2 Reversal of a "declared but unused" ruling

If Decision W-D-19 is reversed and `owl:imports` becomes followed, `imports` moves from §3.5 to the allow-list, since different import sets would then produce different reasoning outputs. The amendment MUST specify whether `imports` hashes as an ordered array (order-sensitive) or as a sorted set (order-insensitive); the default recommendation is sorted set, since import order is traditionally reasoning-irrelevant in OWL.

### 4.3 Scope expansion

If DP-2.3.2's reproducibility envelope is extended to cover Phase D2 outputs (not just D1.6 canonical records), the §3.2 OUT rulings on `hornInferenceStepCap` and `tauPrologVersion` must be revisited. Current scope is D1.6-only; Phase D2 reproducibility is Phase D2's concern and is addressed separately (if at all) via the Phase D2 audit scenarios.

### 4.4 Amendment discipline

Additions, not deletions. Removing a field from the allow-list is a compatibility break — two sessions run under different allow-list versions would hash differently even on identical inputs. If a field becomes semantically obsolete (e.g., a threshold retired from the DP-1 gate), it remains in the allow-list with a documented default and DP-2.3.2 fails the session at persist time if an obsolete field is set to a non-default value.

---

## 5. Watch-items

### 5.1 Engine-Workbench split-brain (developer-flagged 2026-04-24)

The authoritative sources enumerated in §2.3 span two stores: the engine's in-memory `sessionConfig` (DP-1 thresholds) and the Workbench localStorage snapshot (`weightVector`). For the hash to be stable across session lifetime and across the Phase 1 → Phase 2 → Phase 3 → DP-2.3.2 sequence, both stores must be immutable post-session-start.

**PS-8 provides the Workbench-side immutability guarantee** for `hornInferenceStepCap` and `tauPrologVersion`, but does NOT explicitly cover the Workbench config snapshot's `weightVector` field. Implementation of DP-2.3.2 should verify that:

1. The Workbench config snapshot's `weightVector` is not mutated post-session-start by any code path (grep for `saveConfig` callers; all must be session-start only).
2. The engine's `sessionConfig` object is captured into a session-start snapshot at the first DP-1 diagnostic run, and DP-2.3.2 reads from that snapshot at finalization rather than from the live object.

Recommendation (for DP-2.3.2 implementation, outside this memo's scope): consolidate both sources into a unified session-start config snapshot at `sessionStart` lifecycle event. The snapshot is attested via its own hash, stored alongside the session's other finalization artifacts, and fed directly into DP-2.3.2 at finalization time. The developer proposal 2026-04-24 §6 surfaced this correctly as an implementation-concern.

**This memo does not prescribe the implementation.** It asserts that DP-2.3.2 MUST read from an immutable source for each allow-list field. If the developer finds a cleaner implementation that satisfies the immutability requirement, that's within their scope.

### 5.2 Spec citation correction

The `dp2-scaffolding-design-sketch.md` §5.2.2 references "Config immutable post-start per Workbench v0.2 W-D-16." W-D-16 is pagination/virtualization on Phase 1 and Phase 2 Review tables, NOT config immutability. The correct citation is **Rule PS-8** (`sandbox-inference-cap-immutable-mid-session`, per `docs/architecture/phase-d2-avc-bundle.json:1458-1498`). The sketch should be corrected at the next revision; not load-bearing for DP-2.3.2 coding.

### 5.3 Weight vector validation before hash

`validateWeightVector` ([fingerprint-matcher.js:34-54](src/core/ingestion/fingerprint-matcher.js#L34-L54)) enforces the D-9 bounds (structural sum ≥ 0.70; lexical ≤ 0.10). DP-2.3.2 should NOT re-run this validation at hash time — it is the Workbench upload-panel's responsibility to reject invalid vectors at session start. If an invalid vector somehow reaches DP-2.3.2 (e.g., via a bypassed upload path), the hash should proceed over the actual stored values and DP-2.3.2 should emit a provenance warning, not throw. Reproducibility discipline favors hashing what-was-actually-used over hashing what-should-have-been.

---

## 6. Integration

### 6.1 DP-2.3.2 consumption surface

DP-2.3.2's `computeFinalHash` function consumes the session configuration hash as a string at position 5 of the Final Hash input list. Proposed call shape (implementation-flexible):

```js
const configHash = sha256(jcsCanonicalize(assembleConfigInputs(session)));
const finalHash = sha256(jcsCanonicalize([
  cauIRI,
  finalSignatureHash,
  bfoContentHash,
  curatedContentHash,
  configHash,
  finalIterationRoundNumber,
]));
```

`assembleConfigInputs(session)` produces the object shape defined in §2.1 from the authoritative sources defined in §2.3.

### 6.2 Bidirectional traceability

Per `feedback` pattern on bidirectional traceability:

- This memo (§2.1, §2.2) references [fingerprint-matcher.js:17-24](src/core/ingestion/fingerprint-matcher.js#L17-L24) and [dp1-diagnostic.js:31-54](src/core/d16/dp1-diagnostic.js#L31-L54).
- When DP-2.3.2 lands, `reproducibility-hash.js` file header should reference `specs/d16/dp2-x2-config-allow-list-memo-v1.md` as the allow-list authority.
- When `dp2-locked-decisions.md` updates to full-lock status, D3.D3 references this memo as the resolving artifact.

### 6.3 Acceptance test

The Band 8 `provo-end-to-end-acceptance` scenario and Band 6 `dp2-reproducibility-cross-session` scenario together provide the reproducibility envelope test. Specifically, `dp2-reproducibility-cross-session` MUST be extended at DP-2.3.2 landing to include at least one case where two sessions differ ONLY in an excluded field (e.g., `logVerbosity`) and produce identical Final Hashes. This is the regression guard against allow-list drift.

---

## 7. Decision summary

| Aspect | Disposition |
|---|---|
| Allow-list cardinality | 3 top-level fields; 6 sub-fields via `weightVector` |
| Allow-list contents | `notApplicableThreshold`, `inconsistentThreshold`, `weightVector.*` |
| Hashing semantics | Effective post-default-resolution values; JCS canonicalization per D3.D1; SHA-256 per D3.D2 crypto shim |
| Authoritative sources | DP-1 thresholds: engine `sessionConfig`. `weightVector`: Workbench frozen snapshot. Consolidation is an implementation concern (watch-item §5.1) |
| Upstream Phase D2 fields | OUT (`hornInferenceStepCap`, `tauPrologVersion` — effects captured downstream via signature hash) |
| Derived state | OUT (`compatibilityDegraded`, `parsedProperties` — captured via other §7.4 inputs or provenance) |
| Metadata / UI / ephemeral | OUT |
| Declared-but-unused | OUT pending W-D-19 reversal |
| Amendment discipline | Additions via amendment cycle; removals disallowed (compat break) |
| Related spec correction | W-D-16 → PS-8 in sketch §5.2.2 (non-blocking) |

---

## 8. Acknowledgement criteria

This memo is ACK-able if the developer:

1. Confirms the three-field allow-list as the authoritative v1.0 enumeration.
2. Confirms the OUT rulings on `hornInferenceStepCap` and `tauPrologVersion` (the SME extension beyond the developer's proposal). Pushback welcome if Phase D2 scope should be in the D1.6 reproducibility envelope — the door is open for that argument.
3. Plans DP-2.3.2 implementation to consume `assembleConfigInputs` from an immutable session-start snapshot per §5.1 recommendation, OR names an alternative that satisfies the immutability requirement.
4. Flags the W-D-16 → PS-8 correction for incorporation at the next `dp2-scaffolding-design-sketch.md` revision.

On ACK, `dp2-locked-decisions.md` updates to full LOCKED status (analogous to Wave 2's 2026-04-22 lock), and DP-2.3.2 coding proceeds.

---

## 9. References

**Spec artifacts:**
- `specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md` §7.4 (Final Hash canonical input list)
- `specs/d16/dp2-locked-decisions.md` D3.D3 (approach locked; this memo delivers the field list)
- `specs/d16/dp2-scaffolding-design-sketch.md` §5.2.2 (spec citation correction noted)
- `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md` (format precedent)

**Code locations verified:**
- `src/core/d16/dp1-diagnostic.js` — DP-1 thresholds, default constants, sessionConfig surface
- `src/core/d16/iteration-mechanics.js:29` — `MAX_ROUNDS` constant
- `src/core/ingestion/fingerprint-matcher.js:17-24` — `DEFAULT_WEIGHT_VECTOR` definition
- `src/core/ingestion/fingerprint-matcher.js:34-54` — `validateWeightVector` D-9 bounds
- `docs/workbench/js/panels/ingest/upload-panel.js:307-313` — session config snapshot write
- `docs/workbench/js/panels/ingest/ingest-state.js:220-226` — `saveConfig` persistence

**Related rules and decisions:**
- Rule DP-1-R2 (threshold configurability)
- Rule PD-10 / Decision D-9 (weight vector bounds)
- Rule PS-8 / Decision D-12 (inference cap immutability; correct citation for config immutability)
- Decision W-D-19 (imports recorded but not followed)
- Wave 2 Option B lock 2026-04-22 (OWA/CWA posture per-helper)

**Feedback / memory artifacts:**
- `project_d16_dp1_threshold_semantics.md` (compatibilityDegraded sticky semantics)
- `feedback_absence_not_evidence.md` (exclusion grounded as amendment-governed, not evidenced-as-neutral)
- `project_d16_wave2_locked_decisions.md` (OWA/CWA posture locked at reasoning layer)
