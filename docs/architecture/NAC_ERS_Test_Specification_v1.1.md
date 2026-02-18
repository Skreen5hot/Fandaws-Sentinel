# NAC / ERS Test Specification

**Version:** 1.1  
**Phase:** 10b — ERS Core + ExportEngine Retrofit  
**Date:** February 2026  
**Maps to:** ERS Specification v2.3 §13, Implementation Plan Steps 1–10

---

## Test Organization

Tests are organized by module, matching the implementation plan's file manifest. Each test has a unique ID (`{MODULE}-{NUMBER}`), a plain-English description, input, expected output, and the ERS spec section it validates.

---

## 1. Routing Record Factory (`routing-record.test.js`)

These validate the `createRoutingRecord()` factory and register/method constants.

### RRF-01: Factory produces valid shape

**Input:** `createRoutingRecord({ id: 'fandaws:routing/abc123', subjectConcept: 'fandaws:concept/human', restrictionIri: 'fandaws:property/xyz', assignedRegister: REGISTERS.NORMATIVE, routingMethod: ROUTING_METHODS.STRUCTURAL, trigger: 'bfo:MaterialEntity + biological' })`

**Expected:** Object with all six fields present, `@type: 'fandaws:RegisterRoutingRecord'`, `assignedRegister` equals `'fandaws:register/normative'`.

**Validates:** ERS §4.1

### RRF-02: Factory rejects missing required fields

**Input:** `createRoutingRecord({ id: 'fandaws:routing/abc123' })` (missing assignedRegister, routingMethod)

**Expected:** Throws or returns validation error.

### RRF-03: Register constants are correct IRIs

**Input:** Read `REGISTERS.AXIOMATIC`, `REGISTERS.NORMATIVE`, `REGISTERS.ASPIRATIONAL`

**Expected:** `'fandaws:register/axiomatic'`, `'fandaws:register/normative'`, `'fandaws:register/aspirational'`

### RRF-04: Method constants cover all six routing methods

**Input:** Read all values from `ROUTING_METHODS`

**Expected:** APS, DOMAIN, STRUCTURAL, WHITELIST, TELEOLOGICAL, FALLBACK — six entries, all `fandaws:method/` prefixed.

### RRF-05: Factory produces deterministic IDs for identical inputs

**Input:** Call `createRoutingRecord()` twice with identical logical payload.

**Expected:** Both return identical `@id` values. Hash is deterministic.

**Validates:** ERS §4.2 (deterministic hash)

### RRF-06: Factory produces different IDs for different registers

**Input:** Same subject/property/trigger, but one with `REGISTERS.NORMATIVE` and one with `REGISTERS.AXIOMATIC`.

**Expected:** Different `@id` values.

### RRF-07: Timestamp excluded from hash computation

**Input:** Same logical payload, different `createdAt` timestamps.

**Expected:** Identical `@id` values. Timestamp is metadata, not identity.

**Validates:** ERS §4.2

### RRF-08: Factory accepts all valid routing methods

**Input:** Call `createRoutingRecord()` once for each `ROUTING_METHODS` value.

**Expected:** All six produce valid records. No throws.

---

## 2. Property/Relationship Type Layer (`property.test.js`, `relationship.test.js`)

### TYP-01: Property without register fields produces identical output to v1

**Input:** Create property with existing params only (no `epistemicRegister`, no `routingRecord`, no `routingFlags`).

**Expected:** Output is byte-identical to pre-ERS property output. New fields absent, not `null`.

**Validates:** Backward compatibility

### TYP-02: Property with register fields includes them

**Input:** Create property with `epistemicRegister: 'fandaws:register/normative'`, `routingRecord: {...}`, `routingFlags: ['role-heightened-sensitivity']`.

**Expected:** All three fields present in output.

### TYP-03: Property with empty routingFlags omits the field

**Input:** Create property with `routingFlags: []`.

**Expected:** `routingFlags` field absent from output (conditionally included).

### TYP-04: Property with null register omits the field

**Input:** Create property with `epistemicRegister: null`.

**Expected:** `epistemicRegister` field absent from output.

### TYP-05: Relationship with register fields includes them

**Input:** Create relationship with `epistemicRegister: 'fandaws:register/axiomatic'`.

**Expected:** Field present. Relationships support registers identically to properties.

### TYP-06: Relationship without register fields produces identical output to v1

**Input:** Create relationship with existing params only.

**Expected:** Byte-identical to pre-ERS output.

### TYP-07: Context includes register-related entries

**Input:** Read updated `context.js` exports.

**Expected:** Context object includes `fandaws:epistemicRegister`, `fandaws:routingRecord`, `fandaws:routingFlags` prefix mappings.

---

## 3. BFO Register Map (`bfo-register-map.test.js`)

### BFO-01: SpatialRegion → R1

**Input:** `lookupBfoRegister('bfo:SpatialRegion')`

**Expected:** `{ register: REGISTERS.AXIOMATIC, strength: 'structural' }`

**Validates:** ERS §3.1 Domain Safety Matrix

### BFO-02: TemporalRegion → R1

**Input:** `lookupBfoRegister('bfo:TemporalRegion')`

**Expected:** `{ register: REGISTERS.AXIOMATIC, strength: 'structural' }`

### BFO-03: GenericallyDependentContinuant → R1

**Input:** `lookupBfoRegister('bfo:GenericallyDependentContinuant')`

**Expected:** `{ register: REGISTERS.AXIOMATIC, strength: 'structural' }`

### BFO-04: MaterialEntity → R2

**Input:** `lookupBfoRegister('bfo:MaterialEntity')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'structural' }`

### BFO-05: Quality → R2

**Input:** `lookupBfoRegister('bfo:Quality')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'structural' }`

### BFO-06: Disposition → R2

**Input:** `lookupBfoRegister('bfo:Disposition')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'structural' }`

### BFO-07: Function → R2 (NOT R3)

**Input:** `lookupBfoRegister('bfo:Function')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'structural' }`

**Validates:** ERS §3.1, Developer Guide §5.2 — Function ≠ purpose. Biological function is grounded in physical structure, not moral telos. This test exists specifically because an earlier architectural draft routed Function to R3.

### BFO-08: Role → R2 with sensitivity flag

**Input:** `lookupBfoRegister('bfo:Role')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'structural', sensitivity: 'heightened' }`

**Validates:** ERS §3.3, Developer Guide §5.3 — Role defaults to R2, not R3. Most role-properties are normative.

### BFO-09: Process → R2

**Input:** `lookupBfoRegister('bfo:Process')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'structural' }`

### BFO-10: RealizableEntity → R2

**Input:** `lookupBfoRegister('bfo:RealizableEntity')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'structural' }`

### BFO-11: Entity (generic) → R2

**Input:** `lookupBfoRegister('bfo:Entity')`

**Expected:** `{ register: REGISTERS.NORMATIVE, strength: 'fallback' }`

### BFO-12: Unknown IRI → null

**Input:** `lookupBfoRegister('bfo:MadeUpCategory')`

**Expected:** `null`

### BFO-13: Axiomatic domains list is correct

**Input:** Read `AXIOMATIC_DOMAINS`

**Expected:** Contains `'mathematics'`, `'geometry'`, `'formal logic'`. Does not contain `'biology'`, `'medicine'`.

### BFO-14: Function is explicitly listed, not inherited from RealizableEntity

**Input:** Check that `BFO_REGISTER_MAP` has a dedicated `bfo:Function` entry separate from `bfo:RealizableEntity`.

**Expected:** Explicit entry exists. This prevents accidental R3 assignment if someone later modifies the RealizableEntity entry.

**Validates:** Implementation Plan correction #1

---

## 4. Teleological Detector (`teleological-detector.test.js`)

### TEL-01: "should" detected

**Input:** `detectTeleological("Judges should be impartial")`

**Expected:** `{ detected: true, keywords: ['should'] }`

### TEL-02: "meant to" detected

**Input:** `detectTeleological("Hearts are meant to pump blood")`

**Expected:** `{ detected: true, keywords: ['meant to'] }`

### TEL-03: "purpose" detected

**Input:** `detectTeleological("The purpose of a guard is to protect")`

**Expected:** `{ detected: true, keywords: ['purpose'] }`

### TEL-04: "duty" detected

**Input:** `detectTeleological("Judges have a duty to adjudicate")`

**Expected:** `{ detected: true, keywords: ['duty'] }`

### TEL-05: "ought" detected

**Input:** `detectTeleological("Mothers ought to nurture children")`

**Expected:** `{ detected: true, keywords: ['ought'] }`

### TEL-06: "supposed to" detected

**Input:** `detectTeleological("Teachers are supposed to educate")`

**Expected:** `{ detected: true, keywords: ['supposed to'] }`

### TEL-07: "designed to" detected

**Input:** `detectTeleological("Bridges are designed to bear loads")`

**Expected:** `{ detected: true, keywords: ['designed to'] }`

### TEL-08: "intended to" detected

**Input:** `detectTeleological("This tool is intended to cut")`

**Expected:** `{ detected: true, keywords: ['intended to'] }`

### TEL-09: No false positive on neutral language

**Input:** `detectTeleological("Humans have two arms")`

**Expected:** `{ detected: false, keywords: [] }`

### TEL-10: No false positive on "should" inside a longer word

**Input:** `detectTeleological("The shoulder blade is a bone")`

**Expected:** `{ detected: false, keywords: [] }`

**Validates:** ERS §7 — keyword detection must be word-boundary aware, not naive substring matching.

### TEL-11: Case insensitivity

**Input:** `detectTeleological("Judges SHOULD be impartial")`

**Expected:** `{ detected: true, keywords: ['should'] }`

### TEL-12: Multiple keywords in one utterance

**Input:** `detectTeleological("Doctors are meant to heal and should help patients")`

**Expected:** `{ detected: true, keywords: ['meant to', 'should'] }`

### TEL-13: Empty input

**Input:** `detectTeleological("")`

**Expected:** `{ detected: false, keywords: [] }`

### TEL-14: Null/undefined input

**Input:** `detectTeleological(null)`

**Expected:** `{ detected: false, keywords: [] }` — graceful degradation, no throw.

### TEL-15: Detection is flag-only, never returns a register

**Input:** Inspect return shape of any `detectTeleological()` call.

**Expected:** Return object has no `register` field. The detector flags, it never routes.

**Validates:** ERS §3.2 Step 5 — "Flag ONLY. No auto-R3."

---

## 5. Bearer/Role Disambiguator (`bearer-role-disambiguator.test.js`)

### BRD-01: Structural property on Role → re-target to Bearer

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_arm`. Bearer in graph: `Human` (`bfo:MaterialEntity`).

**Expected:** `{ bfoCategory: 'bfo:MaterialEntity', retargeted: true, propertyType: 'structural', sensitivity: false }`

**Validates:** Developer Guide §6.3

### BRD-02: Behavioral property on Role → stay on Role path

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `diagnoses`.

**Expected:** `{ bfoCategory: 'bfo:Role', retargeted: false, propertyType: 'behavioral', sensitivity: true }`

### BRD-03: Credential property on Role → stay on Role path, no sensitivity

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_license`.

**Expected:** `{ bfoCategory: 'bfo:Role', retargeted: false, propertyType: 'credential', sensitivity: false }`

### BRD-04: Structural "has_weight" on Role → re-target

**Input:** Subject: `Nurse` (BFO: `bfo:Role`). Property: `has_weight`. Bearer: `Human`.

**Expected:** `retargeted: true`, `bfoCategory: 'bfo:MaterialEntity'`

### BRD-05: Structural "has_height" on Role → re-target

**Input:** Subject: `Guard` (BFO: `bfo:Role`). Property: `has_height`. Bearer: `Human`.

**Expected:** `retargeted: true`, `bfoCategory: 'bfo:MaterialEntity'`

### BRD-06: Structural "has_eye_color" on Role → re-target

**Input:** Subject: `Teacher` (BFO: `bfo:Role`). Property: `has_eye_color`. Bearer: `Human`.

**Expected:** `retargeted: true`, `bfoCategory: 'bfo:MaterialEntity'`

### BRD-07: Behavioral "protects" on Role → sensitivity

**Input:** Subject: `Guard` (BFO: `bfo:Role`). Property: `protects`.

**Expected:** `retargeted: false`, `sensitivity: true`

### BRD-08: Behavioral "nurtures" on Role → sensitivity

**Input:** Subject: `Mother` (BFO: `bfo:Role`). Property: `nurtures`.

**Expected:** `retargeted: false`, `sensitivity: true`

### BRD-09: Credential "has_degree" on Role → no sensitivity

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_degree`.

**Expected:** `retargeted: false`, `propertyType: 'credential'`, `sensitivity: false`

### BRD-10: Credential "certified_in" on Role → no sensitivity

**Input:** Subject: `Engineer` (BFO: `bfo:Role`). Property: `certified_in`.

**Expected:** `retargeted: false`, `propertyType: 'credential'`, `sensitivity: false`

### BRD-11: Unknown property on Role → default to unclassified, no sensitivity

**Input:** Subject: `Judge` (BFO: `bfo:Role`). Property: `does_something` (not in any pattern list).

**Expected:** `propertyType: 'unclassified'`, `sensitivity: false` — unknown property type on a Role subject routes via the Role path to R2 but does NOT trigger heightened sensitivity. Only positively-identified behavioral properties trigger sensitivity. An unclassifiable property should not generate IEE review noise.

**Validates:** Reviewer correction — the safe default for unknown properties is R2 Normative without flags, not R2 with sensitivity. Sensitivity is a positive signal ("we detected behavioral language"), not a default state.

### BRD-12: Property on non-Role subject → no disambiguation

**Input:** Subject: `Human` (BFO: `bfo:MaterialEntity`). Property: `has_arm`.

**Expected:** Function returns early or returns `{ bfoCategory: 'bfo:MaterialEntity', retargeted: false, propertyType: null, sensitivity: false }`. Disambiguator only fires for Role subjects.

### BRD-13: Bearer not found → fall back to Role path

**Input:** Subject: `CustomRole` (BFO: `bfo:Role`). Property: `has_arm` (structural). No Bearer class in graph.

**Expected:** `retargeted: false`, `bfoCategory: 'bfo:Role'` — no Bearer available, fall back to Role routing.

**Validates:** Developer Guide §6.4 — "In a cold-start graph where the Bearer isn't specified, the re-targeting falls back to the Role path."

### BRD-14: Ancestor chain walk finds Bearer two levels up

**Input:** Subject: `Surgeon` → `Doctor` → Bearer: `Human` (`bfo:MaterialEntity`). Property: `has_arm` (structural).

**Expected:** `retargeted: true`, `bfoCategory: 'bfo:MaterialEntity'`. Walks `Surgeon → Doctor → Human`.

### BRD-15: Ancestor chain walk finds Bearer through multiple Role ancestors

**Input:** Subject: `ChiefSurgeon` → `Surgeon` → `Doctor` (all `bfo:Role`). Bearer on `Doctor`: `Human`.

**Expected:** `retargeted: true`. Walks through Role ancestors until finding a MaterialEntity bearer.

### BRD-16: Disambiguation on non-Role BFO categories is a no-op

**Input:** Subject: `Triangle` (BFO: `bfo:SpatialRegion`). Property: `has_sides`.

**Expected:** Disambiguator returns immediately. No property-type classification, no re-targeting.

### BRD-17: Structural property with "has_" prefix on non-physical entity

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_jurisdiction` — starts with "has_" but is a credential/institutional concept.

**Expected:** `propertyType: 'credential'` — the credential list should match `has_jurisdiction` before the structural regex catches the `has_` prefix.

**Validates:** Regex ordering matters. Credential patterns checked before structural catch-all.

### BRD-18: Empty graph → graceful degradation

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_arm`. Graph is empty (no concepts, no hierarchy).

**Expected:** No throw. Returns `retargeted: false`, falls back to Role path.

### BRD-19: Late-arriving Bearer (known limitation, documented)

**Input:** Mutation 1: Subject `Doctor` (BFO: `bfo:Role`). Property: `has_arm` (structural). No Bearer in graph yet. Mutation 2 (subsequent): Define `Human` (`bfo:MaterialEntity`) as Bearer of `Doctor`.

**Expected (Mutation 1):** `retargeted: false`. Falls back to Role path (R2, no sensitivity per BRD-11 — `has_arm` is structural but no Bearer available to re-target to).

**Expected (Mutation 2):** Bearer is now available, but the routing record from Mutation 1 is already committed. No retroactive re-routing.

**Known Limitation:** The system does not self-correct previously routed properties when new ontological structure arrives. Retroactive re-routing requires the APS (Phase 14+) or a manual re-evaluation pass. The routing record from Mutation 1 retains `method: STRUCTURAL` with trigger `bfo:Role`, and the Bearer/Role disambiguation's re-targeting opportunity was missed because the Bearer didn't exist yet. Users can manually override the register if needed.

**Validates:** Developer Guide §6.4 — "In a cold-start graph where the Bearer isn't specified, the re-targeting falls back to the Role path."

---

## 6. Core ERS Pipeline (`epistemic-register.test.js`)

### Full Pipeline Traces

These trace complete inputs through all six steps. Each test validates the final register assignment, the routing record, and any flags.

### ERS-01: Geometry — clean R1 via BFO

**Input:** Subject: `Triangle` (BFO: `bfo:SpatialRegion`). Property: `has_sides`. Utterance: `"Triangles have three sides."`

**Expected:** Register: R1. Method: STRUCTURAL. Trigger: `bfo:SpatialRegion`. Flags: []. No ambiguity.

**Validates:** ERS §13.1 DET-1

### ERS-02: Biology — clean R2 via BFO

**Input:** Subject: `Human` (BFO: `bfo:MaterialEntity`). Property: `has_arm`. Utterance: `"Humans have two arms."`

**Expected:** Register: R2. Method: STRUCTURAL. Trigger: `bfo:MaterialEntity`. Flags: [].

**Validates:** ERS §13.1 DET-2

### ERS-03: Information artifact — clean R1 via BFO

**Input:** Subject: `Algorithm` (BFO: `bfo:GenericallyDependentContinuant`). Property: `has_steps`.

**Expected:** Register: R1. Method: STRUCTURAL.

### ERS-04: Quality — clean R2 via BFO

**Input:** Subject: `Color` (BFO: `bfo:Quality`). Property: `has_wavelength`.

**Expected:** Register: R2. Method: STRUCTURAL.

### ERS-05: Disposition — clean R2 via BFO

**Input:** Subject: `Glass` (BFO: `bfo:MaterialEntity`). Property: `is_fragile` (BFO: `bfo:Disposition`).

**Expected:** Register: R2. Method: STRUCTURAL.

### ERS-06: Function — R2, NOT R3

**Input:** Subject: `Heart` (BFO: `bfo:MaterialEntity`). Property: `pumps_blood` (BFO: `bfo:Function`).

**Expected:** Register: R2. Method: STRUCTURAL. Flags: [] — no teleological flag despite "function."

**Validates:** ERS §3.1, Developer Guide §5.2 — Function ≠ purpose.

### ERS-07: Process — clean R2 via BFO

**Input:** Subject: `Mitosis` (BFO: `bfo:Process`). Property: `produces_cells`.

**Expected:** Register: R2. Method: STRUCTURAL.

### ERS-08: Role — non-teleological property → R2 clean

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_license`. Utterance: `"Doctors have medical licenses."`

**Expected:** Register: R2. Method: STRUCTURAL. Flags: []. No sensitivity (credential property).

**Validates:** ERS §13.3 ROLE-1

### ERS-09: Role — teleological keyword → R2 + flags

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `heals`. Utterance: `"Doctors should help people."`

**Expected:** Register: R2. Method: STRUCTURAL. Flags: [`teleological-signal`, `role-heightened-sensitivity`].

**Validates:** ERS §13.3 ROLE-2

### ERS-10: Role — role-specific behavioral keyword → R2 + sensitivity

**Input:** Subject: `Mother` (BFO: `bfo:Role`). Property: `nurtures`. Utterance: `"Mothers nurture children."`

**Expected:** Register: R2. Flags: [`role-heightened-sensitivity`]. RegisterAmbiguity present with aspirational alternate.

**Validates:** ERS §13.3 ROLE-3

### ERS-11: Role — deontic obligation keyword → R2 + deontic flag

**Input:** Subject: `Judge` (BFO: `bfo:Role`). Property: `adjudicates`. Utterance: `"Judges have a duty to adjudicate impartially."`

**Expected:** Register: R2. Flags: [`role-heightened-sensitivity`, `deontic-role-definition`].

**Validates:** ERS §13.3 ROLE-4

### ERS-12: Role — Bearer/Role re-targeting (structural property)

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_arm`. Bearer: `Human` (`bfo:MaterialEntity`). Utterance: `"Doctors have two arms."`

**Expected:** Register: R2. Method: STRUCTURAL. Trigger: `bfo:MaterialEntity` (not `bfo:Role`). Flags: []. Clean routing via Bearer.

**Validates:** Developer Guide §9 Example 4

### ERS-13: Role — behavioral property stays on Role path

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `diagnoses`. Utterance: `"Doctors diagnose diseases."`

**Expected:** Register: R2. Trigger: `bfo:Role`. Flags: [`role-heightened-sensitivity`].

**Validates:** Developer Guide §9 Example 3

### Session Domain Tests

### ERS-14: Session domain "mathematics" → R1

**Input:** Subject: `Number` (no BFO alignment). Session domain: `mathematics`. Utterance: `"Prime numbers have exactly two factors."`

**Expected:** Register: R1. Method: DOMAIN. Step 2 fires before Step 3.

**Validates:** ERS §13.4 FALL-2

### ERS-15: Session domain "biology" → R2

**Input:** Subject: `Cell` (no BFO alignment). Session domain: `biology`.

**Expected:** Register: R2. Method: DOMAIN.

### ERS-16: Session domain "geometry" → R1

**Input:** Subject: `Circle` (no BFO alignment). Session domain: `geometry`.

**Expected:** Register: R1. Method: DOMAIN.

### ERS-17: BFO alignment overrides session domain

**Input:** Subject: `Dog` (BFO: `bfo:MaterialEntity`). Session domain: `geometry`.

**Expected:** Register: R2. Method: STRUCTURAL. BFO alignment overrides session domain.

**Validates:** ERS §3.4 — "BFO alignment takes precedence."

**IMPLEMENTATION MANDATE:** The implementation plan's linear Step 2 → Step 3 ordering will cause this test to fail if Step 2 returns early. The plan is wrong on this point; the spec is authoritative. The correct implementation:

1. Step 2 produces a **candidate** register (geometry → R1 candidate), but does NOT return.
2. Step 3 runs regardless. If BFO alignment produces a result (MaterialEntity → R2), it **overrides** the Step 2 candidate.
3. If Step 3 returns null (no BFO alignment), the Step 2 candidate is used.
4. Step 4–6 only run if both Step 2 and Step 3 returned null.

This preserves session domains for cold-start graphs (their intended purpose: "I'm doing geometry" on an un-aligned concept) without letting them override ontological structure. A dog in a geometry session is still a MaterialEntity. The BFO category is a fact about the concept; the session domain is a hint from the user. Specific beats general.

### ERS-17b: Session domain wins when BFO is absent

**Input:** Subject: `Widget` (no BFO alignment). Session domain: `geometry`.

**Expected:** Register: R1. Method: DOMAIN. Step 2 candidate is used because Step 3 returned null.

**Validates:** Session domains are useful precisely when BFO alignment is missing (cold-start graphs). ERS-17 and ERS-17b together define the precedence: BFO > Session Domain > Fallback.

### ERS-18: No BFO, no session domain → R2 fallback

**Input:** Subject: `Widget` (no BFO alignment). No session domain. Utterance: `"Widgets are blue."`

**Expected:** Register: R2. Method: FALLBACK.

**Validates:** ERS §13.4 FALL-1

### Teleological Integration Tests

### ERS-19: Teleological keyword without Role subject → flag only

**Input:** Subject: `Human` (BFO: `bfo:MaterialEntity`). Utterance: `"Humans should be kind."`

**Expected:** Register: R2. Method: STRUCTURAL. Flags: [`teleological-signal`]. The flag is present but the register is still R2 — teleological detection never auto-routes to R3.

### ERS-20: Teleological keyword with Role subject → double flag

**Input:** Subject: `Teacher` (BFO: `bfo:Role`). Property: `educates`. Utterance: `"Teachers are supposed to educate."`

**Expected:** Register: R2. Flags: [`teleological-signal`, `role-heightened-sensitivity`].

### ERS-21: No teleological keyword, no BFO → clean R2 fallback

**Input:** Subject: `Gadget` (no BFO alignment). Utterance: `"Gadgets have buttons."`

**Expected:** Register: R2. Method: FALLBACK. Flags: [].

### Edge Cases and Graceful Degradation

### ERS-22: Missing graph → fallback

**Input:** Subject concept with no graph context (graph is null/undefined).

**Expected:** Register: R2. Method: FALLBACK. No throw.

### ERS-23: Missing utterance → teleological detection skipped

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `diagnoses`. Utterance: null.

**Expected:** Register: R2. Flags: [`role-heightened-sensitivity`]. Teleological keywords NOT checked (no utterance to scan). No throw.

### ERS-24: Missing session → session domain step skipped

**Input:** Subject: `Number` (no BFO). Session: null.

**Expected:** Register: R2. Method: FALLBACK. Step 2 skipped cleanly.

### ERS-25: Config disables ERS → no annotation

**Input:** Config: `epistemicRegisterEnabled: false`. Any property.

**Expected:** `routeToRegister()` returns null or no-op. No register annotation.

### ERS-26: Subject with multiple BFO ancestors → nearest wins

**Input:** Subject: `Surgeon` → `Doctor` → BFO: `bfo:Role`. Also has ancestor `cco:Organism` → `bfo:MaterialEntity` (via bearer).

**Expected:** Nearest BFO category (`bfo:Role`) wins. Bearer/Role disambiguation handles the MaterialEntity relationship through the bearer path, not the BFO lookup.

### ERS-27: APS stub returns null

**Input:** Any property, any context.

**Expected:** Step 1 produces null. Pipeline continues to Step 2. Routing method is never `APS`.

### ERS-28: Routing record includes correct createdBy

**Input:** Any property routed by the pipeline.

**Expected:** Routing record has `createdBy: 'ers:service'` (not a user ID).

### ERS-29: Routing record method matches the step that fired

**Input:** `Triangle` (BFO: `bfo:SpatialRegion`).

**Expected:** Method: `STRUCTURAL`. (Not FALLBACK, not DOMAIN.)

**Input:** `Number` (no BFO, session domain: `mathematics`).

**Expected:** Method: `DOMAIN`. (Not STRUCTURAL, not FALLBACK.)

**Input:** `Gadget` (no BFO, no session).

**Expected:** Method: `FALLBACK`.

### ERS-30: R3 is never auto-assigned

**Input:** Exhaustively test: every BFO category, every session domain, every teleological keyword combination.

**Expected:** Register is NEVER `REGISTERS.ASPIRATIONAL`. R3 can only be set by user override (Phase 14+). The pipeline cannot produce R3.

**Validates:** Implementation Plan "What Is Deferred" — "R3 auto-routing: Phase 14+. Teleological flags only, never auto-assigns R3."

---

## 7. IRI Generator (`iri-generator.test.js`)

### IRI-01: Deterministic output

**Input:** `generateRoutingRecordIri('fandaws:property/abc', 'fandaws:scope/default')` called twice.

**Expected:** Identical IRI both times.

### IRI-02: Different inputs → different IRIs

**Input:** `generateRoutingRecordIri('fandaws:property/abc', ...)` vs `generateRoutingRecordIri('fandaws:property/xyz', ...)`

**Expected:** Different IRIs.

### IRI-03: IRI has correct prefix

**Input:** Any valid call.

**Expected:** Output starts with `'fandaws:routing/'`.

### IRI-04: Throws on empty restriction IRI

**Input:** `generateRoutingRecordIri('', ...)`

**Expected:** Throws.

---

## 8. Pipeline Integration (`property-pipeline.test.js`, `relationship-pipeline.test.js`)

### PIP-01: Property pipeline annotates restriction nodes with register

**Input:** Run property pipeline with `Triangle` (BFO: `bfo:SpatialRegion`), property `has_sides`.

**Expected:** Output mutation's `fandaws:additions` array contains restriction node with `fandaws:epistemicRegister: 'fandaws:register/axiomatic'`.

### PIP-02: Property pipeline annotates with routing record

**Input:** Same as PIP-01.

**Expected:** Restriction node in additions has `fandaws:routingRecord` with valid `RegisterRoutingRecord` shape.

### PIP-03: Relationship pipeline annotates restriction nodes

**Input:** Run relationship pipeline with `Bird` (BFO: `bfo:MaterialEntity`), relationship `has_habitat`.

**Expected:** Restriction node has `fandaws:epistemicRegister: 'fandaws:register/normative'`.

### PIP-04: ERS disabled → no annotation

**Input:** Config: `epistemicRegisterEnabled: false`. Run property pipeline.

**Expected:** Restriction nodes have no `fandaws:epistemicRegister` field. Pipeline proceeds normally.

### PIP-05: Non-restriction nodes in additions are untouched

**Input:** Mutation with mixed node types in `fandaws:additions` (restriction + concept + label).

**Expected:** Only restriction nodes get ERS annotation. Concepts and labels are unchanged.

### PIP-06: Existing pipeline tests produce identical results

**Input:** Run the full existing property pipeline test suite.

**Expected:** All pre-ERS tests pass with identical output. No regression.

**Validates:** Backward compatibility

### PIP-07: Existing pipeline tests produce identical results (relationships)

**Input:** Run the full existing relationship pipeline test suite.

**Expected:** All pre-ERS tests pass. No regression.

### PIP-08: Pipeline handles multiple restrictions in one mutation

**Input:** Mutation with 3 restriction nodes in `fandaws:additions`.

**Expected:** All three annotated with register metadata. Each has its own routing record with unique `@id`.

### PIP-09: Pipeline handles empty additions array

**Input:** Mutation with `fandaws:additions: []`.

**Expected:** No error. Pipeline proceeds normally.

### PIP-10: Pipeline handles mutation with no additions field

**Input:** Mutation object without `fandaws:additions` key.

**Expected:** No error. Pipeline proceeds normally.

### PIP-11: Flags present only when non-empty

**Input:** Route `Triangle` (BFO: `bfo:SpatialRegion`) — should produce no flags.

**Expected:** Restriction node has NO `fandaws:routingFlags` field. (Not `[]`, absent entirely.)

### PIP-12: Flags present when teleological signal detected

**Input:** Route `Teacher` (BFO: `bfo:Role`), utterance: `"Teachers should educate."`

**Expected:** Restriction node has `fandaws:routingFlags: ['teleological-signal', 'role-heightened-sensitivity']`.

---

## 9. ExportEngine Retrofit (`triple-extractor.test.js`)

### EXP-01: Register metadata emitted as triple (Turtle)

**Input:** Restriction node with `fandaws:epistemicRegister: 'fandaws:register/normative'`. Export format: Turtle.

**Expected:** Output contains triple: `<fandaws:property/xyz> fandaws:epistemicRegister fandaws:register/normative .`

### EXP-02: Register metadata emitted as triple (RDF-XML)

**Input:** Same restriction. Export format: RDF-XML.

**Expected:** Output contains `<fandaws:epistemicRegister rdf:resource="fandaws:register/normative"/>`.

### EXP-03: Register metadata emitted as triple (OWL)

**Input:** Same restriction. Export format: OWL.

**Expected:** Register metadata present in OWL-appropriate syntax.

### EXP-04: No register → no extra triples

**Input:** Pre-ERS restriction node (no `fandaws:epistemicRegister` field). Export.

**Expected:** Output is identical to pre-ERS export. No register triples emitted.

**Validates:** Backward compatibility

### EXP-05: Routing flags emitted sorted

**Input:** Restriction with `routingFlags: ['role-heightened-sensitivity', 'deontic-role-definition']`.

**Expected:** Triples emitted in alphabetical order: `deontic-role-definition` before `role-heightened-sensitivity`.

### EXP-06: Empty routing flags → no flag triples

**Input:** Restriction with `routingFlags: []` or absent.

**Expected:** No flag triples emitted.

### EXP-07: Routing record not emitted in annotation-only profile

**Input:** Restriction with full routing record. Export profile: annotation-only.

**Expected:** Only `epistemicRegister` and `routingFlags` triples emitted. Routing record internals (method, trigger, timestamp) are NOT exported. The audit trail stays internal.

### EXP-08: Multiple restrictions with different registers

**Input:** Two restrictions: one R1, one R2. Export.

**Expected:** Each restriction has its own correct register triple. No cross-contamination.

---

## 10. Manual Override Safety

These validate the safety constraints on user-initiated register overrides. While the visual/batch override UI is deferred to Phase 14+, the override *validation logic* must be implemented now because the `createRoutingRecord()` factory and the pipeline integration accept `method: "override"` records.

### MAN-01: R3 override without worldview tag → rejection

**Input:** User overrides `Human has_arm` to `REGISTERS.ASPIRATIONAL`. No `fandaws:worldviewContext` provided.

**Expected:** Override rejected. Validation error: "Register 3 (Aspirational) requires a non-null fandaws:worldviewContext tag."

**Validates:** ERS §2.3 — "Register 3 entries carry a non-null fandaws:worldviewContext IRI." Developer Guide §4 — mandatory worldview tag. This is the missing safety net: ERS-30 guarantees the pipeline never auto-assigns R3, but MAN-01 guarantees that even a manual override respects the worldview constraint.

### MAN-02: R3 override with worldview tag → accepted

**Input:** User overrides `Judge is_impartial` to `REGISTERS.ASPIRATIONAL` with `fandaws:worldviewContext: 'iee:worldview/unattributed'`.

**Expected:** Override accepted. New `RegisterRoutingRecord` with `method: 'override'`, `assignedRegister: REGISTERS.ASPIRATIONAL`. Previous record's `overriddenBy` points to new record.

### MAN-03: R3 override with specific worldview → accepted

**Input:** User overrides `Judge is_impartial` to `REGISTERS.ASPIRATIONAL` with `fandaws:worldviewContext: 'iee:worldview/deontological'`.

**Expected:** Override accepted. Worldview context preserved in routing record.

### MAN-04: R1/R2 override does not require worldview tag

**Input:** User overrides `Triangle has_sides` from R2 to R1. No worldview context.

**Expected:** Override accepted. Worldview constraint only applies to R3.

### MAN-05: Override produces new routing record, preserves old

**Input:** User overrides `Human has_arm` from R2 to R1.

**Expected:** New `RegisterRoutingRecord` with `method: 'override'`, `previousRegister: 'fandaws:register/normative'`. Old record's `overriddenBy` field points to new record. Both records exist in the graph.

**Validates:** ERS §8.1 — override audit trail.

---

## 11. Adversarial & Boundary Tests

These probe the system's behavior at the edges. They're integration tests that run the full pipeline.

### ADV-01: Extremely long utterance

**Input:** Utterance: 10,000-character string with one teleological keyword buried in the middle.

**Expected:** Keyword detected. Performance within budget (< 10ms for Steps 2–6).

### ADV-02: Utterance in non-English

**Input:** Utterance: `"Los jueces deben ser imparciales"` (Spanish for "Judges should be impartial").

**Expected:** No teleological detection (English keywords only in v1). Flags: []. Falls through to BFO alignment or fallback. Acknowledged limitation.

### ADV-03: Property IRI with no human-readable label

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property IRI: `obo:RO_0000086` (no label, opaque IRI).

**Expected:** Disambiguator returns `propertyType: 'unclassified'`, `sensitivity: false`. Routes to R2 Normative via Role path, but does NOT attach a `role-heightened-sensitivity` flag. The sensitivity flag is reserved for positively-identified behavioral properties — an unclassifiable property should not generate IEE review noise.

**Validates:** Implementation Plan correction #2 — regex is brittle for opaque IRIs. The v1 regex-based disambiguator cannot classify opaque IRIs. The safe behavior is R2 without flags (not R2 with sensitivity). This is a known limitation of the v1 implementation; range-based detection (checking the property's BFO-aligned range rather than its label) is the Phase 14+ upgrade path.

### ADV-04: Circular ancestor chain

**Input:** Concept A → B → A (circular `rdfs:subClassOf`). Bearer/Role disambiguator walks ancestors.

**Expected:** No infinite loop. Disambiguator detects cycle and falls back to Role path.

### ADV-05: Deeply nested ancestor chain (50 levels)

**Input:** 50-level `rdfs:subClassOf` chain before reaching `bfo:MaterialEntity`.

**Expected:** BFO category found. No stack overflow. Performance acceptable.

### ADV-06: Property is both structural and credential

**Input:** Subject: `Doctor` (BFO: `bfo:Role`). Property: `has_surgical_certification` — matches both `has_` prefix (structural) and `certification` (credential).

**Expected:** Credential wins. Credential patterns are checked before structural catch-all.

### ADV-07: Same property on same subject routed twice → identical routing record

**Input:** Route `Human has_arm` through the pipeline twice.

**Expected:** Both produce `RegisterRoutingRecord` with identical `@id` (deterministic hash). Idempotent.

### ADV-08: Concurrent routing of different properties

**Input:** Route `Human has_arm` and `Triangle has_sides` simultaneously.

**Expected:** No shared state corruption. Each gets its own correct register and routing record.

### ADV-09: Teleological keyword in subject name, not utterance

**Input:** Subject: `PurposeDrivenOrganization` (BFO: `bfo:MaterialEntity`). Property: `has_employees`. Utterance: `"PurposeDrivenOrganization has 50 employees."`

**Expected:** Teleological detection flags `"purpose"` in the utterance. This is a false positive at the keyword level, but it's correct behavior — the detector flags, the flag is informational, and the register is still R2 via BFO alignment. The flag doesn't change the routing, only the downstream review priority.

### ADV-10: All six steps return null → fallback fires

**Input:** APS: null (stub). Session: null. BFO: null (unknown category). Whitelist: no match. Teleological: no keywords. Fallback: R2.

**Expected:** Register: R2. Method: FALLBACK. This is the system's safest state — everything unknown defaults to normative.

---

## 12. Regression Safety Net

These verify that the ERS does not break any pre-existing behavior.

### REG-01: Existing property pipeline tests pass unchanged

**Input:** Full existing `property-pipeline.test.js` suite.

**Expected:** 100% pass. Identical output.

### REG-02: Existing relationship pipeline tests pass unchanged

**Input:** Full existing `relationship-pipeline.test.js` suite.

**Expected:** 100% pass. Identical output.

### REG-03: Existing Validator tests pass unchanged

**Input:** Full existing Validator test suite.

**Expected:** 100% pass. Validator does not inspect register fields.

### REG-04: Existing DescriptionEngine tests pass unchanged

**Input:** Full existing DescriptionEngine test suite.

**Expected:** 100% pass. DescriptionEngine reads `owl:onProperty`, not `fandaws:epistemicRegister`.

### REG-05: Existing ExportEngine tests pass unchanged

**Input:** Full existing ExportEngine test suite (pre-ERS tests).

**Expected:** 100% pass. New triples are additive. Old output unchanged.

### REG-06: Existing StateAdapter tests pass unchanged

**Input:** Full existing StateAdapter test suite.

**Expected:** 100% pass. StateAdapter passes through transparent JSON-LD.

### REG-07: Full existing test suite passes

**Input:** `npx --node-options=--experimental-vm-modules jest` (all ~1,098 existing tests).

**Expected:** 100% pass. Zero regressions.

---

## Test Count Summary

| Module | File | Test Count |
|--------|------|-----------|
| Routing Record Factory | `routing-record.test.js` | 8 |
| Type Layer | `property.test.js`, `relationship.test.js` | 7 |
| BFO Register Map | `bfo-register-map.test.js` | 14 |
| Teleological Detector | `teleological-detector.test.js` | 15 |
| Bearer/Role Disambiguator | `bearer-role-disambiguator.test.js` | 19 |
| Core ERS Pipeline | `epistemic-register.test.js` | 31 |
| IRI Generator | `iri-generator.test.js` | 4 |
| Pipeline Integration | `property-pipeline.test.js`, `relationship-pipeline.test.js` | 12 |
| ExportEngine Retrofit | `triple-extractor.test.js` | 8 |
| Manual Override Safety | `override-safety.test.js` | 5 |
| Adversarial / Boundary | `epistemic-register.test.js` (or dedicated) | 10 |
| Regression Safety Net | (existing test files) | 7 |
| **Total new tests** | | **140** |
| **Expected total** | | **~1,238** (1,098 existing + 140 new) |

---

## Implementation Notes

### Priority Order

1. **IRI generator tests (§7) first.** Almost every other module (factory, pipeline, export) depends on generating valid, deterministic IDs. If the ID generator is flaky, hash-dependent tests across the board produce false negatives.
2. **BFO map tests (§3) and teleological tests (§4) second.** Pure functions with zero dependencies beyond constants. If these fail, nothing else works.
3. **Disambiguator tests (§5) third.** Depends on BFO map.
4. **Core pipeline tests (§6) fourth.** Composes all three.
5. **Manual override tests (§10) fifth.** Depends on routing record factory and validation logic.
6. **Pipeline integration tests (§8) sixth.** Depends on core pipeline.
7. **Export tests (§9) seventh.** Depends on pipeline producing annotated nodes.
8. **Adversarial tests (§11) eighth.** Probe boundaries, require the full stack.
9. **Regression tests (§12) run at every step.** The existing suite must pass after every change.

### Critical Test: ERS-30

`ERS-30` (R3 is never auto-assigned) is the single most important test in this specification. If it fails, the system is auto-assigning aspirational register, which means it's making value judgments without human input. This is the core guarantee of Phase 10b: the ERS routes to R1 or R2 only. R3 requires human override.

### Critical Test: ERS-17 + ERS-17b

`ERS-17` and `ERS-17b` together define the precedence chain: **BFO > Session Domain > Fallback.** ERS-17 mandates that Step 2 (session domain) produces a *candidate*, not a final result. Step 3 (BFO) overrides the candidate when alignment is available. Step 2's candidate is only used when Step 3 returns null (cold-start graph with no BFO alignment). The implementation plan's linear Step 2 → return ordering is explicitly rejected; the spec is authoritative. This is not ambiguous — if ERS-17 fails, the precedence logic is wrong.

### Critical Test: MAN-01

`MAN-01` (R3 without worldview tag → rejection) is the companion to ERS-30. Together they form a complete safety net: ERS-30 guarantees the pipeline never *auto-assigns* R3, and MAN-01 guarantees that even a *manual override* to R3 respects the worldview constraint. If both tests pass, R3 entries always have a worldview context — whether assigned by the system (never, per ERS-30) or by the user (only with worldview, per MAN-01).

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | Feb 2026 | Initial test specification. 133 tests across 11 modules. Maps to Implementation Plan Steps 1–10 and ERS Specification v2.3 §13. |
| v1.1 | Feb 2026 | Addressed architectural review. **(1) ERS-17 precedence resolved:** BFO > Session Domain > Fallback. Step 2 produces a candidate; Step 3 overrides it when BFO alignment is available. Implementation plan's linear ordering explicitly rejected; spec is authoritative. Added ERS-17b (session domain wins when BFO absent) as companion test. **(2) Manual Override Safety section added (§10):** 5 tests. MAN-01 validates that R3 override without worldview tag is rejected. MAN-02/MAN-03 validate accepted R3 overrides. MAN-04 confirms R1/R2 overrides don't require worldview. MAN-05 validates override audit trail. **(3) BRD-11 corrected:** Unknown property on Role defaults to unclassified WITHOUT sensitivity flag. Sensitivity is a positive signal, not a default state. Prevents IEE review noise from unclassifiable properties. **(4) BRD-19 added:** Late-arriving Bearer documented as known limitation. No retroactive re-routing; routing record committed at assertion time. Phase 14+ APS concern. **(5) ADV-03 corrected:** Opaque property IRIs fall to unclassified without sensitivity flag, consistent with BRD-11 correction. Documented as v1 regex limitation with range-based detection as upgrade path. **(6) Priority order updated:** IRI generator moved to position #1 per dependency analysis — hash-dependent tests across factory, pipeline, and export produce false negatives if IRI generation is flaky. Total tests: 140 (+7). |

---

*Tests validate the spec, not the implementation. If a test fails, check the spec before changing the test.*
