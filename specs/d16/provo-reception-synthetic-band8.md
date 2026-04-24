# PROV-O Reception Memo — Band 8 Synthetic Envelope

**Source:** `provo-end-to-end-acceptance` AVC scenario (Band 8 terminal gate).
**Date:** 2026-04-24.
**Scope:** Synthetic 30-CAU PROV-O-shape session. **NOT** real PROV-O Pass 2 calibration.

---

## 1. What this memo reports

This memo captures what the Band 8 synthetic envelope surfaced when the full DP-2 output layer ran end-to-end. It is a **calibration baseline**, not a calibration result — when real PROV-O Pass 2 ingestion runs through the live pipeline (post-D1.6 Phase 1, depending on site-family integration work), the numbers below become the comparison anchor.

The synthetic envelope was authored to exercise the output-layer contract: DP-2 conformance across all four dispositions, Final Hash stability under re-run, session bundle export shape. It does **not** exercise the live integration pipeline (three-state-evaluator, iteration-mechanics, etc. were not invoked during Band 8 execution — canonical records were built directly via the production builders using hand-shaped input data).

## 2. Session shape

- **Session identifier:** `provo-e2e-sessionA` (+ `sessionB` for stability check)
- **Ontology:** 30 synthetic CAUs, IRIs `prov:CAU00` through `prov:CAU29`
- **BFO version:** 2020 v1.0 (synthetic bytes)
- **Curated additions:** v1.0 (synthetic bytes)
- **Session config:** defaults (notApplicableThreshold=40%, inconsistentThreshold=30%, weightVector with structural sum 0.75)
- **Timestamps:** fixed to `2026-04-24T10:00:00Z` for deterministic dual-run

## 3. Disposition distribution (synthetic)

| Disposition | Count | Percentage |
|---|---|---|
| Entailed | 16 | 53% |
| Plausible | 8 | 27% |
| Inconsistent | 3 | 10% |
| NotApplicable | 3 | 10% |

Both Inconsistent (10%) and NotApplicable (10%) are well below their respective DP-1 thresholds (30% and 40%). DP-1 does not fire on this synthetic distribution — `compatibilityDegraded: false` on every record.

## 4. DP-2 conformance

**100% of records are DP-2-conformant:** all 30 records pass I1 (schema gate) + I2a (shape-level content validation) post-finalization. Zero records retain the `_scaffold: true` sentinel post-sweep (I2b active).

Each record carries:

- Non-empty structured `explanation.axiomEvidence` (single-element for NotApplicable per DP-2.1.D3 floor, multi-element for other dispositions).
- Populated `provenance.iterationHistory` (single-pass for all synthetic records).
- `reproducibilityHash.finalHash` computed over the §7.4 six-input canonical list. 64-char lowercase hex. `authoritative: true`.
- `validationState: 'not_inherited'` (no inheritance exercised in the synthetic envelope).
- Empty `reconciliationHistory` (no reconciliation events exercised).

## 5. Final Hash stability (I3 attestation)

Sessions A and B ran with identical inputs. For every CAU, `hashA === hashB`. **Mismatch count: 0.** DP-2-I3 (Deterministic Hash) attested.

This is the concrete evidence that the X2 allow-list + JCS canonicalization + §7.4 six-input discipline produce the reproducibility contract the spec promises. The dual-run test is the regression guard for any future change to:

- The config allow-list (addition or removal)
- The JCS canonicalizer
- The ingestion byte-capture pipeline
- The session-hash registry read path

Any drift in those paths surfaces as a mismatch count > 0 in the Band 8 re-run.

## 6. Session bundle shape

The exported session bundle carries four required components per the scenario contract:

- **axiomDictionary** — size 1 (all Entailed records share the single `bfo:hasParticipant` restriction axiom; Plausible records share one partial-support axiom; Inconsistent and NotApplicable contribute their trigger axioms).
- **iterationHistory** — per-CAU array of rounds; single-round for all synthetic records.
- **dp1Diagnostic** — counts per disposition; `fired: false` on this distribution.
- **perCAURecords** — 30 canonical records with full DP-2 fields.

Bundle serializes to valid JSON via `JSON.stringify` roundtrip.

## 7. What the synthetic envelope doesn't surface

Important caveats for calibration interpretation:

- **No real Tau Prolog evaluation.** The synthetic envelope bypasses `three-state-evaluator.js` and produces records directly. Real Pass 2 would route CAU Signatures through Tau Prolog necessary-condition checks, which could produce different dispositions for the same CAUs.
- **No iteration bounding exercised.** All synthetic records are single-pass. Real Pass 2 would exercise bounded-fallback per Rule IT-1 on any CAU producing contradiction or ambiguity at single-pass.
- **No cross-CAU influences captured.** `provenance.crossCAUInfluences` is empty on all synthetic records. Real Pass 2 would populate this via D2.2.D2 explicit callbacks when Phase 2 property alignments feed back into Phase 1.
- **No NA-1.1 provisional inheritance exercised.** Synthetic NotApplicable records route via `automatic` mechanism; no `default_axiom_poor` or `manual` routing in the envelope, and no taxonomic-descent inheritance.
- **No reconciliation cascade exercised.** `reconciliationHistory` is empty everywhere. Real Pass 2 with NA-1.3/NA-1.4 events would populate these.

These absences are **expected** — Band 8's contract is output-layer conformance, not pipeline exercise. Real Pass 2 calibration (post-site-family integration) is where these surfaces light up.

## 8. Calibration baseline for Pass 2 comparison

When Pass 2 runs live:

- **Disposition distribution** will differ from the synthetic 16/8/3/3 — the synthetic was authored for output-layer coverage, not realism. PROV-O's actual distribution depends on how well PROV-O's upper-level classes align with BFO (per the realist-compatibility question DP-1 was designed for).
- **Final Hash stability** should hold under re-run. If it doesn't, something drifted in byte-capture, snapshot-freeze, or JCS canonicalization. Band 8's dual-run is the canary.
- **Axiom dictionary size** will be larger. Synthetic shares a handful of axioms across 30 CAUs; real PROV-O will have diverse axiom patterns per CAU.
- **Iteration history depth** will include fallback rounds for CAUs that contradict or are ambiguous at single-pass. The synthetic has only round 0 entries.
- **DP-1 may fire** on PROV-O if Schema.org-style classes push NotApplicable or Inconsistent rates over threshold.
- **compatibilityDegraded** may propagate if DP-1 fires and analyst elects exploratoryMode continuation.

## 9. No surprises surfaced

The synthetic envelope produced the contract the spec promised. No edge case surfaced that required post-landing fix. The Band 8 scenario passed on first run.

Honest caveat consistent with §7: this is because the envelope was authored to the contract, not to surprising inputs. Real PROV-O may surface edges the synthetic didn't probe — that's what Pass 2 is for.

## 10. Companion artifacts

- `specs/d16/d16-phase1-closeout.md` — Phase 1 completion record.
- `avc/fandaws-sentinel-d16-avc-bundle.json` — bundle v5 with Band 8 scenario.
- Live pipeline integration work tracked post-Phase 1 (see closeout §6 "open gaps").
