# IVNE Developer Tasks: Transformation Type + Cardinality

**From:** Aaron Damiano  
**Priority:** Task A — this sprint (hours). Task B — next sprint (1–2 days).  
**Context:** External SME review identified two gaps in the IVNE's semantic loss classification system. Both are bounded, well-specified, and don't touch the compilation pipeline itself. The SME is influential and we need their backing — shipping these before the next review turns a critic into an advocate.

---

## Task A: Add `transformationType` to SemanticLossRecord

**Time estimate:** 30–60 minutes + test updates  
**Files touched:** `semantic-loss.js`, `ivne-types.js`, demo display code, affected tests

### What and why

Our loss records currently have two fields that describe what happened: `lossType` (the specific mechanism, e.g., `unionGeneralization`) and `severity` (the impact level, e.g., `lossy`). The SME pointed out these are both useful but neither one answers the question: *what category of semantic transformation did the compiler perform?*

We need a third field — `transformationType` — that classifies each loss using the SME's formal taxonomy. This is the vocabulary the ontology community recognizes. Speaking their language matters.

### The five values

| transformationType | Meaning | When it applies |
|---|---|---|
| `conservativeExtension` | Full logical equivalence preserved | Lossless rewrites (rare — most of our stuff is reduction) |
| `monotonicReduction` | Necessary conditions preserved, sufficiency lost | Intersection flattening (E1, I2 rules) |
| `generalization` | Disjunction replaced with supertype | Union handling (UO2 rule) |
| `structuralShift` | Logical constraint moved to validation/metadata layer | Universal weakening, cardinality (when Task B ships) |
| `rejection` | Construct cannot be represented at all | P7 chains, anything we fully defer |

### Mapping to existing loss types

| Existing `lossType` | → `transformationType` |
|---|---|
| `unionGeneralization` | `generalization` |
| `universalWeakening` | `structuralShift` |
| `intersectionReduction` (if emitted) | `monotonicReduction` |
| `cardinalityLoss` (current P8 rejection) | `rejection` (becomes `structuralShift` after Task B) |

### Implementation steps

1. **`ivne-types.js`** — Add `TRANSFORMATION_TYPE` enum with the five values. Add `transformationType` field to the `SemanticLossRecord` factory function, defaulting to `null`.

   Reference implementation:
   ```js
   const TRANSFORMATION_TYPE = Object.freeze({
     CONSERVATIVE_EXTENSION: 'conservativeExtension',
     MONOTONIC_REDUCTION:    'monotonicReduction',
     GENERALIZATION:         'generalization',
     STRUCTURAL_SHIFT:       'structuralShift',
     REJECTION:              'rejection'
   });
   ```

2. **`semantic-loss.js`** — In `createLossRecord()` (or wherever loss records are constructed), add a lookup that maps `lossType` → `transformationType`. Use the enum constants, not raw strings. Log a warning on unknown mapping so QA catches gaps early.

   Reference implementation:
   ```js
   const { TRANSFORMATION_TYPE } = require('./ivne-types');

   const TRANSFORMATION_MAP = {
     unionGeneralization:   TRANSFORMATION_TYPE.GENERALIZATION,
     universalWeakening:    TRANSFORMATION_TYPE.STRUCTURAL_SHIFT,
     intersectionReduction: TRANSFORMATION_TYPE.MONOTONIC_REDUCTION,
     cardinalityWeakening:  TRANSFORMATION_TYPE.STRUCTURAL_SHIFT,
     // extend as new lossTypes are created
   };

   function createSemanticLossRecord({ lossType, severity, sourceAxiom, lostSemantics, /* ... */ }) {
     const transformationType = TRANSFORMATION_MAP[lossType] || TRANSFORMATION_TYPE.REJECTION;
     if (!TRANSFORMATION_MAP[lossType]) {
       console.warn(`[IVNE] Unknown lossType '${lossType}' — defaulting transformationType to 'rejection'`);
     }
     return {
       '@type': 'fandaws:SemanticLossRecord',
       'fandaws:lossType': lossType,
       'fandaws:severity': severity,
       'fandaws:transformationType': transformationType,
       'fandaws:sourceAxiom': sourceAxiom || '',
       'fandaws:lostSemantics': lostSemantics || '',
       // ... other fields
     };
   }
   ```

   The warning log is important. Without it, a new `lossType` added in a future sprint silently maps to `rejection` and nobody notices until a reviewer asks.

3. **Demo display code** — If the loss record display truncates fields, make sure `transformationType` is visible in the full JSON-LD output. No need to add a separate UI element — the JSON-LD output is where the SME will look.

4. **JSON-LD context** — Add `fandaws:transformationType` to the JSON-LD `@context` definition (in `src/types/context.js` or wherever the context is maintained). Without this, consumers can't interpret the field from exported graphs. Same applies to `fandaws:CardinalityConstraint` when Task B ships.

5. **Tests** — Every existing test that asserts on loss record structure needs the new field added to expected output. Grep for `fandaws:SemanticLossRecord` in test files. The union and universal scenarios in the demo fixtures need updated expectations.

### ⚠️ CI / Golden Hash Warning

Adding `transformationType` to loss records changes the byte-level output for any compilation that produces losses. This means:

- **Golden hashes will change.** The SHA-256 values in `ivne-bfo-golden.test.js`, `ivne-determinism.test.js`, and the demo fixtures will no longer match. This is expected and correct — the output changed because we added a field.
- **Note this in the PR description.** Reviewers must understand that hash changes are intentional, not regressions. A one-liner like "Golden hashes updated: new `transformationType` field on SemanticLossRecord changes output bytes" prevents confusion.
- **Determinism still holds.** The new field is derived deterministically from `lossType` via a static map. No randomness introduced. TA-09 validates this — run it after updating goldens.

### Canonical serialization note

The output hash depends on `JSON.stringify` producing identical output across runs. If any code path uses `Object.keys()` on an object whose key order isn't guaranteed, hashes become flaky. If you don't already have one, add a `stableStringify(obj)` utility that sorts keys before serializing, and use it in both the production hashing path and the test comparison path. This isn't a new problem — but adding a field to loss records is a good moment to verify the hashing path is truly deterministic.

### What NOT to change

- `lossType` stays. It's the specific mechanism. `transformationType` is the categorical classification. They're orthogonal.
- `severity` stays. Impact and transformation category are independent axes.
- No changes to the compilation pipeline, flattener, restriction-lifter, or normalizer.

### Test Cases

File: `tests/unit/ivne/transformation-type.test.js`

**TA-01: Union loss record carries `generalization` transformation type**

```js
// Input: ontology with union axiom (ex:Pet EquivalentTo union(ex:Cat, ex:Dog))
// Action: compile(parsedOntology, config)
// Assert on the loss record for unionGeneralization:
expect(lossRecord['fandaws:lossType']).toBe('unionGeneralization');
expect(lossRecord['fandaws:severity']).toBe('lossy');
expect(lossRecord['fandaws:transformationType']).toBe('generalization');
```

**TA-02: Universal weakening loss record carries `structuralShift` transformation type**

```js
// Input: ontology with universal restriction (ex:Dog SubClassOf (eats only ex:Food))
// Action: compile(parsedOntology, config)
// Assert on the loss record for universalWeakening:
expect(lossRecord['fandaws:lossType']).toBe('universalWeakening');
expect(lossRecord['fandaws:severity']).toBe('degraded');
expect(lossRecord['fandaws:transformationType']).toBe('structuralShift');
```

**TA-03: Perfect imports produce no loss records (transformation type not applicable)**

```js
// Input: simple hierarchy (ex:Dog SubClassOf ex:Animal)
// Action: compile(parsedOntology, config)
// Assert: no loss records at all — transformationType only exists on loss records
expect(result['fandaws:semanticLossRecords']).toHaveLength(0);
```

**TA-04: Unknown lossType defaults to `rejection`**

```js
// Direct unit test on createLossRecord() or the TRANSFORMATION_MAP lookup
// Input: a lossType string not in the map (e.g., 'someUnknownLossType')
// Assert: transformationType falls back to 'rejection'
const record = createLossRecord({
  lossType: 'someUnknownLossType',
  severity: 'lossy',
  // ... other fields
});
expect(record['fandaws:transformationType']).toBe('rejection');
```

**TA-05: TRANSFORMATION_TYPE enum contains exactly five values**

```js
// Import the enum from ivne-types.js
// Assert exhaustive and no extras
expect(Object.keys(TRANSFORMATION_TYPE)).toHaveLength(5);
expect(TRANSFORMATION_TYPE.CONSERVATIVE_EXTENSION).toBe('conservativeExtension');
expect(TRANSFORMATION_TYPE.MONOTONIC_REDUCTION).toBe('monotonicReduction');
expect(TRANSFORMATION_TYPE.GENERALIZATION).toBe('generalization');
expect(TRANSFORMATION_TYPE.STRUCTURAL_SHIFT).toBe('structuralShift');
expect(TRANSFORMATION_TYPE.REJECTION).toBe('rejection');
```

**TA-06: transformationType is `null` when no loss (factory default)**

```js
// Direct unit test on SemanticLossRecord factory with no transformationType argument
// This verifies the default, not a realistic production path
const record = createSemanticLossRecord({ /* minimal fields, no transformationType */ });
expect(record['fandaws:transformationType']).toBeNull();
```

**TA-07: Multiple loss records on same compilation each get correct transformation type**

```js
// Input: ontology that triggers BOTH union and universal losses
// e.g., ex:Pet EquivalentTo union(ex:Cat, ex:Dog)
//       ex:Dog SubClassOf (eats only ex:Food)
// Action: compile(parsedOntology, config)
// Assert: two loss records with independent transformation types
const losses = result['fandaws:semanticLossRecords'];
expect(losses).toHaveLength(2);
const unionLoss = losses.find(l => l['fandaws:lossType'] === 'unionGeneralization');
const univLoss = losses.find(l => l['fandaws:lossType'] === 'universalWeakening');
expect(unionLoss['fandaws:transformationType']).toBe('generalization');
expect(univLoss['fandaws:transformationType']).toBe('structuralShift');
```

**TA-08: transformationType appears in JSON-LD output structure**

```js
// Full compile() integration test
// Assert the field is present at the correct JSON-LD path
// Both in reductionManifest.lossRecords AND top-level semanticLossRecords
const manifestLoss = result['fandaws:reductionManifest']['fandaws:lossRecords'][0];
const topLevelLoss = result['fandaws:semanticLossRecords'][0];
expect(manifestLoss).toHaveProperty('fandaws:transformationType');
expect(topLevelLoss).toHaveProperty('fandaws:transformationType');
expect(manifestLoss['fandaws:transformationType']).toBe(topLevelLoss['fandaws:transformationType']);
```

**TA-09: Determinism — transformation type doesn't affect output hash stability**

```js
// Run compile() twice on same input
// Assert: output hashes identical (transformationType is deterministic, no randomness)
const result1 = compile(parsedOntology, config);
const result2 = compile(parsedOntology, config);
expect(result1['fandaws:reductionManifest']['fandaws:outputHash'])
  .toBe(result2['fandaws:reductionManifest']['fandaws:outputHash']);
```

**TA-10: Existing tests — update expected output (not new tests, but track the work)**

```
// Grep for these patterns and add fandaws:transformationType to expected objects:
//   - adversarial.test.js (any test asserting on loss record shape)
//   - flattener.test.js (union flattening tests)
//   - restriction-lifter.test.js (universal weakening tests)
//   - ivne-bfo-golden.test.js (if any BFO axioms produce loss records)
//   - ivne-determinism.test.js (hash comparison — hashes WILL change, update golden values)
//
// Count before starting. Expected: ~8-12 existing assertions need the new field.
```

**TA-11: Unknown lossType logs a warning**

```js
// The fallback-to-rejection default is invisible without this.
// Mock or spy on console.warn, then create a loss record with an unknown lossType.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

createSemanticLossRecord({
  lossType: 'futureUnknownType',
  severity: 'lossy',
  // ... other fields
});

expect(warnSpy).toHaveBeenCalledWith(
  expect.stringContaining('futureUnknownType')
);
expect(warnSpy).toHaveBeenCalledWith(
  expect.stringContaining('rejection')
);
warnSpy.mockRestore();
```

**TA-12: Mapping coverage CI guard — every lossType in codebase has a TRANSFORMATION_MAP entry**

```js
// This test prevents silent defaults-to-rejection when someone adds a new lossType
// but forgets to update TRANSFORMATION_MAP. It should be the LAST test written
// and updated whenever a new lossType constant is added anywhere.
//
// Import both the map and the known loss type constants:
const { TRANSFORMATION_MAP } = require('../src/semantic-loss');
const { LOSS_TYPES } = require('../src/ivne-types'); // or wherever lossType constants live

// Assert: every known lossType has an entry in the map
for (const [key, value] of Object.entries(LOSS_TYPES)) {
  expect(TRANSFORMATION_MAP).toHaveProperty(
    value,
    // message on failure:
    `LOSS_TYPES.${key} ('${value}') has no entry in TRANSFORMATION_MAP. ` +
    `Add it to semantic-loss.js or this will silently default to 'rejection'.`
  );
}
```

**TA-13: Canonical serialization — output hash uses stable key ordering**

```js
// Verify that the hashing path produces identical hashes regardless of
// JS engine key insertion order. Create two objects with the same fields
// inserted in different order, hash both, compare.
// If your codebase already has a stableStringify utility, this test validates it.
// If it doesn't, this test will fail and tell you to add one.
const obj1 = { b: 2, a: 1, c: 3 };
const obj2 = { a: 1, c: 3, b: 2 };
// Both should produce identical hashes via whatever the production path uses
expect(sha256Hex(stableStringify(obj1))).toBe(sha256Hex(stableStringify(obj2)));
```

---

## Task B: Implement C1 Cardinality Rule (P8)

**Time estimate:** 1–2 days including tests  
**Files touched:** `restriction-lifter.js`, `semantic-loss.js`, `ivne.js`, `ivne-types.js`, new tests  
**Sprint:** Next sprint, not this one. But read this now so you can ask questions.

### What and why

Currently when the compiler encounters a cardinality axiom like `Dog SubClassOf (hasLeg min 4)`, it emits a loss record and moves on. The `fandaws:cardinalityConstraints` array on the output is always empty. An external reviewer will see that empty array and correctly ask why we're dropping information when we have infrastructure to preserve it.

The SME gave us the exact strategy: compile it as an existential restriction (the floor) PLUS a cardinality metadata annotation (the constraint). Two-part operation.

### The rewrite rule

**Input:** `A ⊑ (≥n R.B)` (e.g., Dog SubClassOf hasLeg min 4 Leg)

**Output — Part 1 (existential floor):** Create a normal `fandaws:Property` on concept A:
```json
{
  "@type": "fandaws:Property",
  "fandaws:displayLabel": "hasLeg",
  "fandaws:quantifier": "existential",
  "fandaws:value": "ex:Leg"
}
```

This goes in the concept's `fandaws:properties` array, same as any P5 existential. The logical layer sees "Dog has at least one Leg."

**Output — Part 2 (cardinality constraint):** Populate the `fandaws:cardinalityConstraints` array on the `OntologyImportResult`:
```json
{
  "@type": "fandaws:CardinalityConstraint",
  "fandaws:concept": "fandaws:class/.../dog",
  "fandaws:property": "hasLeg",
  "fandaws:filler": "ex:Leg",
  "fandaws:type": "min",
  "fandaws:value": 4
}
```

This is the validation-layer metadata. DES (Phase 14+) will consume this to generate expectations like "dogs typically have exactly 4 legs."

**Output — Part 3 (loss record):** Still emit a `SemanticLossRecord`, but with:
- `severity: "degraded"` (not `lossy` — we preserved the existential)
- `lossType: "cardinalityWeakening"` (new)
- `transformationType: "structuralShift"` (from Task A)
- `lostSemantics`: "Cardinality constraint shifted to validation metadata. Logical layer sees existential only."

### Where to implement

**`restriction-lifter.js`** — This is where P5 existential and P6 universal restrictions are already handled. Add a branch for `min`, `max`, and `exactly` cardinality types. The existential floor creation reuses the existing P5 path. The new part is populating the cardinality constraint object and returning it alongside the property.

**`ivne.js`** — The `compile()` function needs to collect cardinality constraints from the restriction-lifter output and place them on the `OntologyImportResult`. Right now `fandaws:cardinalityConstraints: []` is hardcoded. Wire it up.

**`ivne-types.js`** — Add a `CardinalityConstraint` type factory if one doesn't exist. Fields: `concept`, `property`, `filler`, `type` (enum: `min`, `max`, `exactly`), `value` (integer).

### Property IRI reuse and deduplication

The existential floor created from a cardinality axiom must have the **same `@id`** as a plain existential created from the same property+filler pair. This matters because if someone imports the same ontology with and without cardinality annotations, the property IRIs should match. Generate the property `@id` deterministically from a canonical key:

```js
// Same canonical key → same @id, whether the source was P5 or P8
const canonicalKey = `${conceptIri}|${propertyIri}|${fillerIri || 'owl:Thing'}|existential`;
const id = generatePropertyIri(canonicalKey); // uses existing IRI generator
```

This also handles **TB-12 (deduplication)**: if a concept has both `hasLeg min 4` and `hasLeg max 4`, the `min` creates an existential property and the `max` should detect that a property with that `@id` already exists on the concept and skip creation. Look up by `@id` in the concept's `fandaws:properties` array before appending.

### Handling `max` and `exactly`

- `min n` → existential floor + `min` constraint. Straightforward.
- `max n` → NO existential floor (max 0 means "none allowed"). Constraint only. Loss record with `severity: "lossy"` because the logical layer sees nothing.
- `exactly n` → existential floor (at least one exists) + `exactly` constraint. Loss record with `severity: "degraded"`.

### Test cases (minimum)

1. `min 4` → existential property created + constraint populated + degraded loss record
2. `max 3` → NO property created + constraint populated + lossy loss record
3. `exactly 2` → existential property created + constraint populated + degraded loss record
4. `min 1` → existential property created + constraint populated + degraded loss record (even though min-1 is semantically identical to existential, still record the constraint for DES)
5. `min 0` → no property, no constraint (vacuous — everything satisfies ≥0)
6. Determinism — cardinality scenarios produce identical output across runs
7. Integration — compile() with a mixed ontology (SubClassOf + cardinality + disjointness) produces correct combined output

### Practical Test Cases

File: `tests/unit/ivne/cardinality.test.js` (new file)

---

#### Group 1: restriction-lifter unit tests

**TB-01: `min n` produces existential floor + constraint**

```js
// Input restriction:
const restriction = {
  type: 'min',
  cardinality: 4,
  property: 'ex:hasLeg',
  filler: 'ex:Leg',
  onClass: 'fandaws:class/.../dog',
  sourceAxiom: 'ex:Dog SubClassOf (ex:hasLeg min 4 ex:Leg)'
};

// Action: liftRestriction(restriction, concept, config)

// Assert Part 1 — existential property on the concept:
expect(result.property).toMatchObject({
  '@type': 'fandaws:Property',
  'fandaws:displayLabel': 'hasLeg',
  'fandaws:canonicalLabel': 'hasleg',
  'fandaws:quantifier': 'existential',
  'fandaws:value': 'ex:Leg',
  'shml:epistemicStatus': 'imported'
});

// Assert Part 2 — cardinality constraint returned:
expect(result.cardinalityConstraint).toMatchObject({
  '@type': 'fandaws:CardinalityConstraint',
  'fandaws:concept': 'fandaws:class/.../dog',
  'fandaws:property': 'hasLeg',
  'fandaws:filler': 'ex:Leg',
  'fandaws:type': 'min',
  'fandaws:value': 4
});

// Assert Part 3 — loss record:
expect(result.lossRecord['fandaws:lossType']).toBe('cardinalityWeakening');
expect(result.lossRecord['fandaws:severity']).toBe('degraded');
expect(result.lossRecord['fandaws:transformationType']).toBe('structuralShift');
expect(result.lossRecord['fandaws:sourceAxiom']).toBe(
  'ex:Dog SubClassOf (ex:hasLeg min 4 ex:Leg)'
);
```

**TB-02: `max n` produces constraint only — no existential floor**

```js
// Input: ex:Classroom SubClassOf (hasStudent max 30 ex:Student)
const restriction = {
  type: 'max',
  cardinality: 30,
  property: 'ex:hasStudent',
  filler: 'ex:Student',
  onClass: 'fandaws:class/.../classroom',
  sourceAxiom: 'ex:Classroom SubClassOf (ex:hasStudent max 30 ex:Student)'
};

// Assert: NO property created (max doesn't imply existence)
expect(result.property).toBeNull();

// Assert: constraint created
expect(result.cardinalityConstraint).toMatchObject({
  'fandaws:type': 'max',
  'fandaws:value': 30
});

// Assert: severity is lossy (logical layer sees nothing for this axiom)
expect(result.lossRecord['fandaws:severity']).toBe('lossy');
expect(result.lossRecord['fandaws:lossType']).toBe('cardinalityWeakening');
expect(result.lossRecord['fandaws:transformationType']).toBe('structuralShift');
```

**TB-03: `max 0` produces constraint only — "none allowed" semantics**

```js
// Input: ex:Vegan SubClassOf (eatsMeat max 0 ex:Meat)
// This means "vegans eat zero meat" — a prohibition.
const restriction = {
  type: 'max',
  cardinality: 0,
  property: 'ex:eatsMeat',
  filler: 'ex:Meat',
  onClass: 'fandaws:class/.../vegan',
  sourceAxiom: 'ex:Vegan SubClassOf (ex:eatsMeat max 0 ex:Meat)'
};

// Assert: NO property (definitely no existential — that would assert the opposite)
expect(result.property).toBeNull();

// Assert: constraint records the prohibition
expect(result.cardinalityConstraint).toMatchObject({
  'fandaws:type': 'max',
  'fandaws:value': 0
});

// Assert: lossy — the logical layer has no representation of this constraint
expect(result.lossRecord['fandaws:severity']).toBe('lossy');
```

**TB-04: `exactly n` produces existential floor + constraint**

```js
// Input: ex:Bicycle SubClassOf (hasWheel exactly 2 ex:Wheel)
const restriction = {
  type: 'exactly',
  cardinality: 2,
  property: 'ex:hasWheel',
  filler: 'ex:Wheel',
  onClass: 'fandaws:class/.../bicycle',
  sourceAxiom: 'ex:Bicycle SubClassOf (ex:hasWheel exactly 2 ex:Wheel)'
};

// Assert: existential floor (at least one wheel exists)
expect(result.property).toMatchObject({
  'fandaws:quantifier': 'existential',
  'fandaws:displayLabel': 'hasWheel',
  'fandaws:value': 'ex:Wheel'
});

// Assert: constraint captures exact count
expect(result.cardinalityConstraint).toMatchObject({
  'fandaws:type': 'exactly',
  'fandaws:value': 2
});

// Assert: degraded (existential preserved, exact count shifted to metadata)
expect(result.lossRecord['fandaws:severity']).toBe('degraded');
```

**TB-05: `min 1` still produces constraint — not silently collapsed to plain existential**

```js
// Input: ex:Parent SubClassOf (hasChild min 1 ex:Person)
// min-1 is semantically identical to an existential. But we still record the
// constraint so DES can distinguish "has at least one" from "has at least four."
const restriction = {
  type: 'min',
  cardinality: 1,
  property: 'ex:hasChild',
  filler: 'ex:Person',
  onClass: 'fandaws:class/.../parent',
  sourceAxiom: 'ex:Parent SubClassOf (ex:hasChild min 1 ex:Person)'
};

// Assert: existential property created (same as plain P5)
expect(result.property).not.toBeNull();
expect(result.property['fandaws:quantifier']).toBe('existential');

// Assert: constraint STILL created (DES needs to know it was explicitly min-1)
expect(result.cardinalityConstraint).toMatchObject({
  'fandaws:type': 'min',
  'fandaws:value': 1
});

// Assert: degraded loss record (the cardinality metadata is shifted, even if value is 1)
expect(result.lossRecord['fandaws:severity']).toBe('degraded');
```

**TB-06: `min 0` is vacuous — no output at all**

```js
// Input: ex:Thing SubClassOf (hasPart min 0 ex:Part)
// Every individual satisfies ≥0. This axiom carries no information.
const restriction = {
  type: 'min',
  cardinality: 0,
  property: 'ex:hasPart',
  filler: 'ex:Part',
  onClass: 'fandaws:class/.../thing',
  sourceAxiom: 'ex:Thing SubClassOf (ex:hasPart min 0 ex:Part)'
};

// Assert: no property, no constraint, no loss record
expect(result.property).toBeNull();
expect(result.cardinalityConstraint).toBeNull();
expect(result.lossRecord).toBeNull();
```

**TB-07: Loss record `sourceAxiom` is never empty for cardinality**

```js
// Regression test — Correction 3 from last review fixed empty sourceAxiom on
// universal weakening. Verify cardinality doesn't repeat that mistake.
// Run all cardinality types (min, max, exactly) and assert:
for (const result of [minResult, maxResult, exactlyResult]) {
  if (result.lossRecord) {
    expect(result.lossRecord['fandaws:sourceAxiom']).toBeTruthy();
    expect(result.lossRecord['fandaws:sourceAxiom'].length).toBeGreaterThan(0);
  }
}
```

**TB-08: Loss record `lostSemantics` message varies by cardinality type**

```js
// Each cardinality type should have a specific explanation, not a generic one.
// min:
expect(minResult.lossRecord['fandaws:lostSemantics']).toContain('min');
expect(minResult.lossRecord['fandaws:lostSemantics']).toContain('existential');

// max:
expect(maxResult.lossRecord['fandaws:lostSemantics']).toContain('max');
expect(maxResult.lossRecord['fandaws:lostSemantics']).toContain('no existential');
// or similar — the developer writes the exact message, this test enforces it's specific

// exactly:
expect(exactlyResult.lossRecord['fandaws:lostSemantics']).toContain('exactly');
```

---

#### Group 2: compile() integration tests

**TB-09: Cardinality constraints appear on OntologyImportResult**

```js
// Input ontology with one cardinality axiom:
//   ex:Dog SubClassOf ex:Animal
//   ex:Dog SubClassOf (ex:hasLeg min 4 ex:Leg)
const result = compile(parsedOntology, config);

// Assert: cardinalityConstraints array is no longer empty
expect(result['fandaws:cardinalityConstraints']).toHaveLength(1);
expect(result['fandaws:cardinalityConstraints'][0]).toMatchObject({
  '@type': 'fandaws:CardinalityConstraint',
  'fandaws:concept': expect.stringContaining('/dog'),
  'fandaws:property': 'hasLeg',
  'fandaws:filler': 'ex:Leg',
  'fandaws:type': 'min',
  'fandaws:value': 4
});

// Assert: Dog concept also has the existential property
const dog = result['fandaws:concepts'].find(c =>
  c['fandaws:canonicalLabel'] === 'dog'
);
expect(dog['fandaws:properties']).toHaveLength(1);
expect(dog['fandaws:properties'][0]['fandaws:quantifier']).toBe('existential');
```

**TB-10: Mixed ontology — SubClassOf + cardinality + disjointness produce combined output**

```js
// Input ontology (6 axioms):
//   ex:Animal SubClassOf ex:LivingThing          (P1)
//   ex:Dog SubClassOf ex:Animal                   (P1)
//   ex:Cat SubClassOf ex:Animal                   (P1)
//   ex:Dog DisjointWith ex:Cat                    (P3)
//   ex:Dog SubClassOf (ex:hasLeg min 4 ex:Leg)    (P8 — cardinality)
//   ex:Cat SubClassOf (ex:hasWhisker min 12 ex:Whisker)  (P8 — cardinality)

const result = compile(parsedOntology, config);

// Assert: hierarchy correct
expect(result['fandaws:concepts']).toHaveLength(6); // LivingThing, Animal, Dog, Cat, Leg, Whisker

// Assert: two cardinality constraints
expect(result['fandaws:cardinalityConstraints']).toHaveLength(2);

// Assert: two loss records (one per cardinality axiom), both structuralShift
const losses = result['fandaws:semanticLossRecords'];
expect(losses).toHaveLength(2);
expect(losses.every(l => l['fandaws:transformationType'] === 'structuralShift')).toBe(true);

// Assert: fidelity score accounts for degraded losses, not 0
const fidelity = result['fandaws:reductionManifest']['fandaws:statistics']['fidelityScore'];
expect(fidelity).toBeGreaterThan(0);
expect(fidelity).toBeLessThan(1);
```

**TB-11: Multiple cardinality constraints on same concept**

```js
// Input: ex:Human SubClassOf (ex:hasArm min 2 ex:Arm)
//        ex:Human SubClassOf (ex:hasLeg min 2 ex:Leg)
//        ex:Human SubClassOf (ex:hasHead exactly 1 ex:Head)
const result = compile(parsedOntology, config);

// Assert: three constraints, all on the same concept
expect(result['fandaws:cardinalityConstraints']).toHaveLength(3);
const humanIri = result['fandaws:cardinalityConstraints'][0]['fandaws:concept'];
expect(result['fandaws:cardinalityConstraints'].every(
  c => c['fandaws:concept'] === humanIri
)).toBe(true);

// Assert: human has three existential properties (arm, leg, head)
const human = result['fandaws:concepts'].find(c =>
  c['fandaws:canonicalLabel'] === 'human'
);
expect(human['fandaws:properties']).toHaveLength(3);
```

**TB-12: `max` cardinality does NOT create duplicate existential when concept already has one**

```js
// Input: ex:Dog SubClassOf (ex:hasLeg min 4 ex:Leg)    ← creates existential
//        ex:Dog SubClassOf (ex:hasLeg max 4 ex:Leg)     ← should NOT create existential
const result = compile(parsedOntology, config);

// Assert: Dog has exactly ONE hasLeg property (from the min), not two
const dog = result['fandaws:concepts'].find(c =>
  c['fandaws:canonicalLabel'] === 'dog'
);
const legProps = dog['fandaws:properties'].filter(p =>
  p['fandaws:canonicalLabel'] === 'hasleg'
);
expect(legProps).toHaveLength(1);

// Assert: TWO cardinality constraints (one min, one max)
const legConstraints = result['fandaws:cardinalityConstraints'].filter(
  c => c['fandaws:property'] === 'hasLeg'
);
expect(legConstraints).toHaveLength(2);
```

**TB-13: Fidelity score weights cardinality loss as degraded (0.5), not lossy (1.0)**

```js
// Input: 4 axioms total, 1 is cardinality (min)
// Expected: 1 degraded loss → fidelity = 1.0 - (0.5 * 1 / 4) = 0.875
const result = compile(parsedOntology, config);
const fidelity = result['fandaws:reductionManifest']['fandaws:statistics']['fidelityScore'];
expect(fidelity).toBeCloseTo(0.875, 2);
// Note: exact formula may differ — adjust expected value to match
// the actual fidelity formula. The point is: it's NOT 0.0 and NOT 1.0.
```

---

#### Group 3: Determinism and regression

**TB-14: Determinism — cardinality output is byte-identical across runs**

```js
// Input: ontology with cardinality axioms
const result1 = compile(parsedOntology, config);
const result2 = compile(parsedOntology, config);

// Assert: output hashes match
expect(result1['fandaws:reductionManifest']['fandaws:outputHash'])
  .toBe(result2['fandaws:reductionManifest']['fandaws:outputHash']);

// Assert: constraint array is identical (order matters for determinism)
expect(JSON.stringify(result1['fandaws:cardinalityConstraints']))
  .toBe(JSON.stringify(result2['fandaws:cardinalityConstraints']));
```

**TB-15: Cardinality IRI generation is stable and deterministic**

```js
// The existential property created from a cardinality axiom must have the same
// @id as a plain existential from the same property+filler pair.
// This matters because if someone imports the same ontology with and without
// cardinality, the property IRIs should match.
const cardinalityResult = compile(ontologyWithCardinality, config);
const existentialResult = compile(ontologyWithPlainExistential, config);

const cardProp = cardinalityResult['fandaws:concepts']
  .find(c => c['fandaws:canonicalLabel'] === 'dog')['fandaws:properties'][0];
const existProp = existentialResult['fandaws:concepts']
  .find(c => c['fandaws:canonicalLabel'] === 'dog')['fandaws:properties'][0];

expect(cardProp['@id']).toBe(existProp['@id']);
```

**TB-16: Reduction manifest statistics include cardinality in property count**

```js
// The existential floor from cardinality should count in totalProperties
const result = compile(parsedOntology, config); // 1 min cardinality axiom
const stats = result['fandaws:reductionManifest']['fandaws:statistics'];
expect(stats.totalProperties).toBe(1); // the existential floor counts
```

---

#### Group 4: Edge cases and adversarial

**TB-17: Cardinality with no filler (unqualified)**

```js
// Input: ex:Dog SubClassOf (ex:hasLeg min 4)  ← no filler class specified
// OWL allows unqualified cardinality (range is owl:Thing)
// Assert: existential floor has fandaws:value: 'owl:Thing' (or null with documented convention)
// Assert: constraint filler is 'owl:Thing'
// This is an architectural decision — document whichever way you go and test it.
```

**TB-18: Cardinality value of very large number**

```js
// Input: ex:Library SubClassOf (ex:hasBook min 1000000 ex:Book)
// Assert: compiles normally, constraint value is 1000000 (integer, not string)
expect(typeof result.cardinalityConstraint['fandaws:value']).toBe('number');
expect(result.cardinalityConstraint['fandaws:value']).toBe(1000000);
```

**TB-19: Cardinality on a concept that also has other restriction types**

```js
// Input: ex:Dog SubClassOf ex:Animal                    (P1)
//        ex:Dog SubClassOf (ex:hasFur some ex:Fur)      (P5 — existential)
//        ex:Dog SubClassOf (ex:eats only ex:Food)       (P6 — universal)
//        ex:Dog SubClassOf (ex:hasLeg min 4 ex:Leg)     (P8 — cardinality)
const result = compile(parsedOntology, config);

const dog = result['fandaws:concepts'].find(c =>
  c['fandaws:canonicalLabel'] === 'dog'
);

// Assert: three properties (hasFur existential, eats universal, hasLeg existential floor)
expect(dog['fandaws:properties']).toHaveLength(3);

// Assert: one cardinality constraint
expect(result['fandaws:cardinalityConstraints']).toHaveLength(1);

// Assert: two loss records (universal + cardinality), NOT three
// The existential from P5 has no loss record
const losses = result['fandaws:semanticLossRecords'];
expect(losses).toHaveLength(2);
expect(losses.map(l => l['fandaws:lossType']).sort())
  .toEqual(['cardinalityWeakening', 'universalWeakening']);
```

**TB-20: Cardinality on generated concept (intersection intermediate)**

```js
// Input: complex axiom that produces a generated intermediate concept
//        with a cardinality restriction on it
// This is rare but possible in medical ontologies.
// Assert: the constraint's fandaws:concept points to the generated IRI (fandaws:gen/...)
// Assert: the generated concept has the existential property
// This test ensures the cardinality path works for non-named classes.
```

### What changes from current behavior

Currently P8 axioms are silently skipped (or produce a rejection-level loss record). After this task, they produce compiled output (existential + constraint) with a degraded loss record. The `fandaws:cardinalityConstraints` array stops being empty. The fidelity score for cardinality-heavy ontologies goes up. The `transformationType` on these loss records is `structuralShift` (from Task A).

---

## Test Summary

| Group | Tests | Scope |
|---|---|---|
| Task A: transformation type | TA-01 through TA-13 | 12 new tests + ~8-12 existing test updates |
| Task B: restriction-lifter unit | TB-01 through TB-08 | 8 new unit tests |
| Task B: compile() integration | TB-09 through TB-13 | 5 new integration tests |
| Task B: determinism/regression | TB-14 through TB-16 | 3 new tests |
| Task B: edge cases/adversarial | TB-17 through TB-20 | 4 new tests |
| **Total new tests** | **32** | + ~8-12 existing test updates for Task A |

Estimated test count after both tasks: **~1,655** (current 1,620 + 32 new + ~3 from fixture updates).

---

## Docs / Context Updates (Do With Each Task)

These are small but the SME will check for them. Missing context entries make the new fields invisible to consumers.

**With Task A:**
- [ ] Add `fandaws:transformationType` to the JSON-LD `@context` in `src/types/context.js`
- [ ] Add a one-line description of each transformation type value to the IVNE section of the developer guide
- [ ] PR description includes: "Golden hashes updated: new `transformationType` field on SemanticLossRecord changes output bytes"

**With Task B:**
- [ ] Add `fandaws:CardinalityConstraint` type to the JSON-LD `@context`
- [ ] Add `fandaws:cardinalityConstraints` array to the `@context`
- [ ] Update the IVNE PAB table in the developer guide: P8 moves from "Deferred" to "Implemented (structural shift)"
- [ ] PR description includes: "cardinalityConstraints array now populated for min/max/exactly axioms. Fidelity scores for cardinality-heavy ontologies will increase."

---

## Questions? 

If anything above is unclear or you see a conflict with existing code, flag it before starting. These tasks are well-bounded but touch the type system, so get the types right first and the rest follows.