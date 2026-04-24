# SME-LOCKED Critical NCs — Plain-English Gloss

**Purpose:** gives SME a prose reading of each Prolog body so the semantics can be validated without decomposing Prolog syntax during the live Checkpoint 2 session. Per Aaron 2026-04-21 briefing.

**Coverage:** the 11 items Aaron identified as highest-priority per Advisory 2. Five at priority CRITICAL (the Role/Function/Disposition triad's distinguishing NCs); six at priority High or Critical-v1.0-corrected.

**Validation protocol during Checkpoint 2:** SME reads the Gloss line and confirms it matches their intent from the prose reference. If it matches: tag sign-off in the checkpoint action-items tracker. If it doesn't match: flag which phrase is wrong and propose a correction.

---

## Priority: CRITICAL (5 items — Role/Function/Disposition triad distinguishers)

### RoleNC3 — Social/institutional realization
**Location:** [bfo-signatures-v1.0.json:393-405](bfo-signatures-v1.0.json#L393-L405)

**Prolog:** `cau_realization_requires_social_institutional_context(CAU)`

**Gloss:** Tests whether the CAU's Signature contains axioms indicating that realization (via `bfo:isRealizedIn` or equivalent) requires participation in a social, institutional, or organizational process — not a purely physical or biological one. This distinguishes Role (socially realized) from Function and Disposition (internally/causally realized).

**Source:** Arp/Smith/Spear §5.3.2 — "a role is a realizable entity whose instances are realized through processes in which the bearers of these roles participate as members of a community or organization."

**Expected operationalization:** a CAU satisfies this NC if any of its `bfo:isRealizedIn` targets is a process class that is (directly or transitively) a subclass of a designated "social/institutional process" category. The category list itself is a curated SME artifact — the predicate doesn't encode the list; it queries it.

---

### RoleNC4 — No teleological commitment (negative from Function)
**Location:** [bfo-signatures-v1.0.json:406-418](bfo-signatures-v1.0.json#L406-L418)

**Prolog:** `\+ cau_has_teleological_commitment(CAU)`

**Gloss:** Tests that the CAU's Signature does NOT contain axioms indicating design, manufacture, selection, or evolution of the bearer for this realizable entity. Role is contingent on social context, not on design purpose — presence of teleological commitment would cross the boundary into Function territory.

**Source:** Arp/Smith/Spear §5.3.2-5.3.4, distinguishing Role (socially contingent) from Function (design-purposed).

**OWA caveat:** this is a negative-commitment NC under the closed-world interpretation. Per Advisory 1, SME should decide whether absence of teleological-commitment axioms means "we assert no teleology" (CWA; current encoding) or "we checked via the background theory and found no derivable teleology" (OWA; stricter encoding via OWL-DERIVED).

---

### DispositionNC3 — Causal triggering
**Location:** [bfo-signatures-v1.0.json:462-475](bfo-signatures-v1.0.json#L462-L475)

**Prolog:** `cau_realization_has_triggering_circumstances(CAU)`

**Gloss:** Tests whether the CAU's Signature contains axioms indicating that realization depends on specific triggering circumstances — physical contact, biological state, environmental conditions, etc. This applies to BOTH generic dispositions (causally triggered) AND Functions (triggered within the design-expected operational context). Distinguishes Disposition (including Function) from Role (socially contingent without circumstance-triggering).

**Source:** Arp/Smith/Spear §5.3.4 — "a disposition is a realizable entity whose manifestation depends on the occurrence of triggering conditions."

**Expected operationalization:** a CAU satisfies this NC if any of its `bfo:isRealizedIn` targets can be shown (directly or via background theory) to have an "initiated-by" or "triggered-by" property axiom in its own Signature.

---

### DispositionNC4 — No social/organizational context (negative from Role)
**Location:** [bfo-signatures-v1.0.json:476-488](bfo-signatures-v1.0.json#L476-L488)

**Prolog:** `\+ cau_realization_requires_social_institutional_context(CAU)`

**Gloss:** Tests that the CAU's Signature does NOT require a social, institutional, or organizational process for realization. Disposition is physical/biological; presence of social-context realization axioms would cross into Role territory.

**Source:** Arp/Smith/Spear §5.3 — negative-distinguishing from Role per §5.3.2.

**OWA caveat:** same as RoleNC4. Negative-commitment NC; SME should decide CWA vs OWA encoding.

---

### FunctionNC3 — Teleological commitment
**Location:** [bfo-signatures-v1.0.json:532-545](bfo-signatures-v1.0.json#L532-L545)

**Prolog:** `cau_has_teleological_commitment(CAU)`

**Gloss:** Tests whether the CAU's Signature contains axioms indicating that the bearer was designed, manufactured, selected (e.g., biologically selected via evolution), or evolved to bear this realizable entity. Teleological commitment is what distinguishes Function from both Disposition (no design) and Role (social rather than design-based). Without this NC satisfied, a CAU cannot be placed as Function even if it satisfies all Disposition NCs.

**Source:** Arp/Smith/Spear §5.3.3 — "a function is a realizable entity whose realization is the production of a specific outcome for which the bearer is designed."

**Expected operationalization:** a CAU satisfies this NC if its `bfo:isRealizedIn` targets are subclasses of a designated "design-expected process" or "evolved-for process" category. Like RoleNC3, the category list is a curated SME artifact.

---

## Priority: High / Critical-v1.0-corrected (6 items)

### RoleNC5 — Loseable without bearer destruction
**Location:** [bfo-signatures-v1.0.json:419-431](bfo-signatures-v1.0.json#L419-L431)

**Prolog:** `cau_bearer_survives_role_loss(CAU)`

**Gloss:** Tests whether the CAU's Signature admits that bearer instances can lose or acquire this Role without themselves being destroyed. This reinforces the contingent nature of Role versus the intrinsic nature of Function/Disposition (a bearer typically doesn't lose a Function without being destroyed or significantly altered).

**Source:** Smith, Kumar, Ceusters (2005) §4.3 — on Carcinomas and Other Pathological Entities.

**Expected operationalization:** CAU satisfies this NC if the bearer class has no axiom of form `disjointWith (owl:Class (complement of CAU-role-holder)) → bearer instance destruction`. More practically: if the bearer's class-level Signature doesn't mandate this role, the bearer survives role loss. Default is satisfied; explicit mandating axioms would falsify.

---

### DispositionNC5 — Disjunctive (Function OR non-Function Disposition)
**Location:** [bfo-signatures-v1.0.json:490-504](bfo-signatures-v1.0.json#L490-L504)

**Prolog:** `( cau_has_teleological_commitment(CAU) ; ( \+ cau_has_teleological_commitment(CAU), cau_realization_has_triggering_circumstances(CAU) ) )`

**Gloss:** Tests that the CAU is EITHER (a) a Function (teleological disposition) OR (b) a non-Function Disposition (causal triggering without teleology). The disjunction is structurally necessary because Function is a subclass of Disposition in BFO 2020 — treating "no teleology" as a required Disposition NC would force Functions to fail their parent's NC, producing systematic Inconsistent classifications for every Function-type CAU. The explicit negation in the second disjunct prevents a Function from matching both paths and confusing the evaluation cascade.

**Source:** Arp/Smith/Spear §5.3.3; BFO-OWL `bfo:Function rdfs:subClassOf bfo:Disposition`.

**v1.0 correction:** prior v0.1 formulation was `\+ cau_has_teleological_commitment(CAU)` (single-branch negation). SME fix 2026-04-18 introduced the disjunction. Aaron confirmed the Prolog rendering correct 2026-04-21.

---

### FunctionNC4 — Design-expected realization
**Location:** [bfo-signatures-v1.0.json:546-558](bfo-signatures-v1.0.json#L546-L558)

**Prolog:** `cau_realization_is_design_expected(CAU)`

**Gloss:** Tests whether the CAU's realization (via `bfo:isRealizedIn`) is of a process type that the bearer is either (a) designed to participate in OR (b) evolutionarily shaped to participate in. This reinforces FunctionNC3 — FunctionNC3 establishes that teleology exists; FunctionNC4 establishes that the realization itself is consistent with that teleology (not an accidental realization of a functional disposition in an un-intended context).

**Source:** Spear, Ceusters, Smith (2016) "Functions in Basic Formal Ontology."

**Expected operationalization:** depends on the curated design-expected-process category list (same artifact as FunctionNC3 operationalization). Likely fused in implementation: both NC3 and NC4 query the same category list, with NC4 additionally verifying consistency of the realization target.

---

### SDCNC3 — Bearer is particular, not generic
**Location:** [bfo-signatures-v1.0.json:372-384](bfo-signatures-v1.0.json#L372-L384)

**Prolog:** `cau_bearer_is_particular_not_generic(CAU)`

**Gloss:** Tests that the CAU's Signature requires a specific bearer — meaning the SDC instance cannot be re-bearered onto a different instance. The "specifically" in "specifically dependent continuant" encodes this: an SDC dies with its bearer, rather than migrating. Distinguishes SDC from GDC (which admits multiple concretizations).

**Source:** Arp/Smith/Spear §5.3 — "a specifically dependent continuant is such that its existence requires the existence of that particular bearer."

**Expected operationalization:** CAU satisfies this NC if its `bfo:inheresIn` property restriction targets a specific bearer class with cardinality 1 (or a stricter axiom), AND does NOT have a `bfo:concretizes` restriction (the GDC-style property). The cardinality check is the operational fingerprint of "specifically" — qualified-cardinality 1 on inheresIn.

**Predicate ambiguity note:** how to operationalize "particular" at the Signature level is not fully settled. The current sketch (cardinality 1 on inheresIn + absence of concretizes) is the best candidate but needs SME validation.

---

### QualityNC3 — Always realized when bearer exists
**Location:** [bfo-signatures-v1.0.json:587-599](bfo-signatures-v1.0.json#L587-L599)

**Prolog:** `cau_always_realized_when_bearer_exists(CAU), \+ cau_realization_has_triggering_circumstances(CAU)`

**Gloss:** Tests that the CAU's instances are fully realized whenever their bearer exists — qualities are not latent like dispositions are. A red ball is red whenever it exists; a fragile ball might or might not be shattered. The explicit negation of DispositionNC3 (triggering circumstances) is what separates Quality from Disposition within SDC.

**Source:** Arp/Smith/Spear §5.3.5 — "qualities are those SDCs which are exhibited whenever their bearer exists."

**Expected operationalization:** CAU satisfies this NC if (a) its bearer-relation axioms make the CAU a co-existence commitment rather than a realization-conditional one, AND (b) it lacks the triggering-circumstances axiom signature that would identify it as a Disposition.

**OWA caveat:** the negation part (`\+ cau_realization_has_triggering_circumstances`) is another CWA absence-assertion. Per Advisory 1, may warrant OWA reformulation.

---

### GDCNC3 — Multiple simultaneous concretizations
**Location:** [bfo-signatures-v1.0.json:641-654](bfo-signatures-v1.0.json#L641-L654)

**Prolog:** `cau_admits_multiple_simultaneous_concretizations(CAU), \+ cau_bearer_is_particular_not_generic(CAU)`

**Gloss:** Tests that the CAU's Signature admits multiple simultaneous concretizations — the CAU can exist in PDF form and in printed form and in a database row all at once, because it is generic. The explicit negation of SDCNC3 ("not particular") is the primary discriminator from SDC. A PDF document is a GDC precisely because the same informational content can be concretized in multiple independent bearers simultaneously.

**Source:** Arp/Smith/Spear §5.4 — "generically dependent continuants are those entities that depend for their existence on some bearer or other, but not on a specific bearer."

**Expected operationalization:** CAU satisfies this NC if its `bfo:concretizes` property restriction allows multiple simultaneous targets (no qualified-cardinality 1 axiom), AND it lacks the specific-bearer fingerprint that would identify it as SDC.

---

## Cross-Cutting OWA/CWA Observations

The CRITICAL/High items above contain four negative-commitment clauses that are candidates for OWA-preserving reclassification per Advisory 1:

| NC | Negative clause | Current tag | Candidate change |
|---|---|---|---|
| RoleNC4 | `\+ cau_has_teleological_commitment(CAU)` | CURATED-NC | Body rewrites to OWA-style derivation check; tag stays CURATED-NC (tag classifies epistemic status, not CWA/OWA) |
| DispositionNC4 | `\+ cau_realization_requires_social_institutional_context(CAU)` | CURATED-NC | Same |
| DispositionNC5 (second disjunct) | `\+ cau_has_teleological_commitment(CAU)` inside disjunction | CURATED-NC | Same |
| QualityNC3 (second conjunct) | `\+ cau_realization_has_triggering_circumstances(CAU)` | CURATED-NC | Same |

The pattern SME is guarding against: CWA's negation-as-failure treating "we didn't check" as identical to "we checked and found nothing." The OWA-preserving rewrite would be to make each negative check an explicit derivation attempt against the background theory, treating "derivation failed to find evidence" as a weaker claim than "derivation proved absence."

**Implementation sketch (for discussion, not yet code):**
- CWA current: `\+ cau_has_teleological_commitment(CAU)` — succeeds when the predicate body returns no proof.
- OWA target: `cau_derivation_attempt_exhausted(CAU, teleological_commitment, no_evidence)` — succeeds only after the background theory has been queried and reports "no derivation found," distinguishing that from "haven't tried."

The distinction matters operationally for incomplete Signatures (Schema.org calibration will expose this) and for confidence in Plausible vs Inconsistent routing.
