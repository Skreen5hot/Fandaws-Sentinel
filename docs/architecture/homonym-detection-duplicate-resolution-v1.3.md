# Feature Specification: Homonym Detection & Duplicate Resolution

**System:** Fandaws-Sentinel
**Version:** 1.3
**Status:** Ready for Implementation
**Predecessor:** Termidium (Fandaws v1) — silent auto-merge with 8-step proximity heuristic
**Dependencies:** Classification Workflow (Phase 2), Scope Narrowing (Phase 5), InMemoryStateAdapter indices (Phase 3), Property-Concept Reconciliation (approved)
**Blocked by:** None — all prerequisite modules are implemented and tested

**v1.2 Changes:** Complete rewrite following development team verification of core data structures. v1.0 and v1.1 were built around a failure mode (duplicate concept creation) that cannot occur in the current architecture. The actual failure mode is silent reclassification across semantically distant branches. This version is grounded in verified system behavior.

**v1.3 Changes:** Surgical revision following development team review of v1.2. Nine items addressed: (1) Added "Neither — new concept" escape hatch to disambiguation prompt in classification workflow (Sections 7.3, 7.4, 7.5, 8.3). (2) Replaced free-text qualifier parsing with button-driven flow: `[ Accept labels ]` / `[ Customize ]` (Sections 5.2, 8.2); added `qualifyHomonymCustom` prompt type. (3) Removed phantom `canonicalLabel` field from tables — `skos:prefLabel` is the canonical label (Section 5.3). (4) Added `fandaws:` namespace convention note for prompt fields (Section 4.2). (5) Fixed `resolveConceptByLabel` signature: `adapter` parameter, `allowCreate` option (Section 7.2). (6) Added null-parent guards to `computeProximity` and `quickProximityCheck` pseudocode (Sections 3.2, 3.5). (7) Added RCL-10: reclassification of already-qualified homonym. (8) Added DIS-09, DIS-10: three-way homonym creation via "Neither" button. (9) Added DIS-11: chained objectResolution → disambiguation integration test.

---

## 1. Problem Statement

### 1.1 Verified System Behavior

Development team verification (February 2026) confirmed the following invariants in Fandaws-Sentinel:

| Layer | Behavior | Implication |
|-------|----------|-------------|
| `generateConceptIri(label, scope)` | Deterministic from label + scope only. No parent context. | Same label always produces same IRI. |
| `findConceptsByCanonical(label, graph)` | Linear scan of `fandaws:concepts` array by `skos:prefLabel`. Returns all matches. | Finds existing concept regardless of parent. |
| `_applyAdditions()` | Pushes concepts without `@id` dedup check. | Could produce array duplicates, but the pipeline never reaches this point. |
| `canonicalLabelToIri` index | `Map<string, string>`. Silent last-writer-wins on collision. | Index assumes label uniqueness. |
| Classification workflow | `findConceptsByCanonical` finds existing concept → routes to Case A (reclassify). | **Never creates a second concept with the same canonical label.** |

**Consequence:** Two distinct concepts with the same canonical label cannot coexist in the graph through the normal conversational pipeline. The system enforces label uniqueness by reclassifying rather than creating.

### 1.2 The Actual Failure: Silent Reclassification Across Distant Branches

```
User: "mouse is a rodent"       → creates mouse under rodent ✓
User: "mouse is a device"       → findConceptsByCanonical("mouse") finds existing mouse
                                 → Case A: reclassifies mouse from rodent to device
                                 → mouse silently moves, user never asked
```

The user may have intended to create a computer mouse (a different concept). Instead, the system silently moved the animal mouse into the device tree. All of mouse's properties ("has whiskers"), relationships ("chased by cat"), and children ("field mouse") are now attached to a concept classified under device.

This violates the design principle: **the system never assumes — it always confirms with the user before storing anything.** The system assumed the user meant the same mouse.

### 1.3 When Silent Reclassification Is Correct

Not all reclassifications are suspicious. When the user says "tiger is a mammal" after "tiger is a feline," they're correcting a classification within the same domain — feline and mammal are siblings under animal. The system should reclassify silently because the intent is unambiguous.

The distinction is **proximity**. Reclassification within a closely related branch is almost certainly intentional. Reclassification across distant or disconnected branches is potentially a homonym collision that requires user confirmation.

### 1.4 What v1.0/v1.1 Got Wrong

The previous spec versions assumed the system could create duplicate concepts and designed detection, merge, and collision-scan mechanisms to resolve them. Development team verification proved this scenario is architecturally impossible. The following v1.0/v1.1 components are eliminated:

- **Post-reclassification collision scan (v1.1 Section 14):** Cannot occur — there are never two same-label concepts to collide.
- **Concept merge operation (v1.1 Section 14.6):** Nothing to merge — only one concept exists per label.
- **Batch collision report UI (v1.1 Section 14.5):** No collisions to report.
- **`removeConcept()` method (v1.1 Phase F):** No concept deletion needed.

The surviving insight from v1.0/v1.1: **the proximity heuristic, the qualifying label mechanism, and the downstream disambiguation flow are all correct and needed.** They just serve a different trigger.

---

## 2. Solution Overview

When the classification workflow is about to reclassify an existing concept under a new parent, and the existing parent and the new parent are **semantically distant**, the system halts and presents a **Reclassification Confirmation Prompt**. The user chooses whether to move the existing concept, create a new homonym concept, or cancel.

### Core Flow

```
1. User states "mouse is a device"
2. Classification workflow finds existing mouse under rodent
3. System computes proximity between rodent and device
4. Proximity exceeds threshold (distant/disconnected branches)
5. System presents Reclassification Confirmation Prompt
6. User chooses: Move it | Different concept | Cancel
7. System executes the chosen action
```

When proximity is within threshold (closely related branches), the reclassification proceeds silently as it does today. No prompt, no interruption.

---

## 3. Proximity Computation

### 3.1 Purpose

Proximity determines whether a reclassification is routine (within a domain) or suspicious (across domains). It is the **trigger condition** for the confirmation prompt, not a decorative advisory.

### 3.2 Algorithm

Compute the shortest path between the existing concept's current parent and the proposed new parent by traversing `skos:broader` (upward) and `iriToChildren` (downward) links.

```javascript
function computeProximity(currentParentIri, newParentIri, graph, indices) {
  // Guard: null parent (root concept) → treat as infinite distance
  if (!currentParentIri || !newParentIri) return { steps: Infinity, sharedAncestor: null };

  if (currentParentIri === newParentIri) return { steps: 0 };

  const MAX_DEPTH = 16;

  // Bidirectional BFS
  const forwardVisited = new Map(); // IRI → distance
  const backwardVisited = new Map();
  let forwardQueue = [{ iri: currentParentIri, dist: 0 }];
  let backwardQueue = [{ iri: newParentIri, dist: 0 }];

  forwardVisited.set(currentParentIri, 0);
  backwardVisited.set(newParentIri, 0);

  while (forwardQueue.length > 0 || backwardQueue.length > 0) {
    // Expand forward frontier
    const nextForward = [];
    for (const { iri, dist } of forwardQueue) {
      if (dist >= MAX_DEPTH) continue;
      const neighbors = getNeighbors(iri, indices); // parent + children
      for (const n of neighbors) {
        if (isRoot(n, indices)) continue; // root exclusion
        if (backwardVisited.has(n)) {
          return {
            steps: dist + 1 + backwardVisited.get(n),
            sharedAncestor: n
          };
        }
        if (!forwardVisited.has(n)) {
          forwardVisited.set(n, dist + 1);
          nextForward.push({ iri: n, dist: dist + 1 });
        }
      }
    }
    forwardQueue = nextForward;

    // Expand backward frontier (symmetric)
    // ... same pattern ...
  }

  return { steps: Infinity, sharedAncestor: null };
}

function isRoot(iri, indices) {
  const parent = indices.iriToParent.get(iri);
  return !parent; // no skos:broader = root concept
}

function getNeighbors(iri, indices) {
  const neighbors = [];
  const parent = indices.iriToParent.get(iri);
  if (parent && !isRoot(parent, indices)) neighbors.push(parent);
  const children = indices.iriToChildren.get(iri) || [];
  for (const child of children) neighbors.push(child);
  return neighbors;
}
```

### 3.3 Root Exclusion

Paths that traverse through root concepts (concepts with no `skos:broader`) are excluded. Two concepts cannot be considered "close" solely because both branches eventually reach a root. If the only connecting path passes through a root, proximity is `Infinity`.

This is critical because Fandaws-Sentinel graphs typically have multiple root concepts (animal, artifact, process, etc.). Without root exclusion, every concept would be within a few steps of every other concept.

### 3.4 Prompt Threshold

The confirmation prompt fires when proximity exceeds **3 steps**.

| Proximity | Behavior | Rationale |
|-----------|----------|-----------|
| 0 steps | Same parent. System responds: "[mouse] is already classified under [rodent]." No mutation. | No-op. |
| 1–3 steps | Reclassify silently. | Parents are closely related (siblings, parent-child, cousins). Reclassification is almost certainly intentional correction. |
| 4+ steps | Prompt the user. | Parents are distant enough that the user may intend a different concept. |
| ∞ (no path) | Prompt the user. | Parents are in disconnected trees. Almost certainly a different concept. |

**Why 3, not 8:** The original Termidium threshold of 8 was designed for a different mechanism (auto-merge trigger with a high tolerance for false negatives). As a prompt trigger, the threshold should be lower — it's better to ask one unnecessary question than to silently move a concept across domains. At 3 steps, the prompt fires for inter-domain reclassifications (rodent→device) but not for intra-domain corrections (feline→mammal when both are under animal). The threshold is configurable (see Section 11) and can be tuned based on user feedback.

### 3.5 Short-Circuit: Same-Tree Detection

Before running the BFS, check if the current parent and new parent share a common non-root ancestor reachable by walking `skos:broader` upward from both. If both paths reach the same non-root concept within 3 hops, the proximity is ≤3 and the BFS can be skipped entirely.

```javascript
function quickProximityCheck(currentParentIri, newParentIri, indices) {
  // Guard: null parent (root concept) → cannot be within threshold
  if (!currentParentIri || !newParentIri) return false;

  const currentAncestors = new Set();
  let cursor = currentParentIri;
  for (let i = 0; i < 4; i++) { // 3 hops + self
    if (!cursor || isRoot(cursor, indices)) break;
    currentAncestors.add(cursor);
    cursor = indices.iriToParent.get(cursor);
  }

  cursor = newParentIri;
  for (let i = 0; i < 4; i++) {
    if (!cursor || isRoot(cursor, indices)) break;
    if (currentAncestors.has(cursor)) return true; // within threshold
    cursor = indices.iriToParent.get(cursor);
  }

  return false; // need full BFS
}
```

This avoids the BFS allocation for the common case (intra-domain reclassification). The BFS only runs when the short-circuit fails, which is the case where the prompt is likely to fire anyway.

---

## 4. Reclassification Confirmation Prompt

### 4.1 Trigger Point

The prompt inserts into the classification workflow's Case A path (subject exists, reclassification). Currently, Case A unconditionally updates `skos:broader`. The change:

```
Current Case A logic:
  subject found → update skos:broader to new parent

New Case A logic:
  subject found →
    if existing parent === new parent → "already classified" message
    if proximity(existing parent, new parent) ≤ 3 → reclassify silently (unchanged)
    if proximity > 3 or ∞ → return Reclassification Confirmation Prompt
```

### 4.2 Prompt Structure

**Namespace convention:** Pseudocode throughout this spec uses bare keys (`promptType`, `message`, `context`, `options`) for readability. The implementation MUST use the `fandaws:` namespace prefix to match existing pipeline conventions: `fandaws:promptType`, `fandaws:text`, `fandaws:context`, `fandaws:options`. This applies to all prompt types in this spec.

```javascript
{
  promptType: 'reclassificationConfirmation',
  message: promptMessage,
  context: {
    existingConceptIri: existingMouse['@id'],
    existingParentLabel: 'rodent',
    newParentLabel: 'device',
    subjectLabel: 'mouse',
    proximity: { steps: Infinity, sharedAncestor: null }
  },
  options: ['move', 'new_concept', 'cancel']
}
```

### 4.3 Prompt Message

Plain language, framed as a question the SME can answer without ontological expertise:

**Template:**
```
"[mouse] already exists in your graph under [rodent].

Is this the same [mouse], or a different one?

  • Same — move [mouse] from [rodent] to [device]
  • Different — create a new, separate [mouse] under [device]
  • Cancel — never mind"
```

**With proximity context (when path exists):**
```
"[mouse] already exists in your graph under [rodent].
[rodent] and [device] are {N} steps apart in your graph.

Is this the same [mouse], or a different one?
..."
```

**When disconnected:**
```
"[mouse] already exists in your graph under [rodent].
[rodent] and [device] are in completely separate branches of your graph.

Is this the same [mouse], or a different one?
..."
```

No categorical labels ("likely duplicate," "likely homonym"). The step count and structural description provide the information. The user interprets it.

### 4.4 User Choices

**Same (move):** The existing concept's `skos:broader` is updated to the new parent. IRI preserved. Properties, relationships, and children remain attached. This is identical to the current silent reclassification behavior — the only difference is that the user explicitly confirmed it.

After the move, scope narrowing may fire as usual: "Does [device] also have [whiskers]?" This is existing behavior for properties inherited from the old parent lineage and does not need special handling.

**Different (new concept):** Creates a genuine homonym. This requires the qualifying label workflow described in Section 5. The new concept gets a distinct canonical label, a distinct IRI, and the existing concept is relabeled for disambiguation. No concept is deleted.

**Cancel:** No mutation. The utterance is discarded.

---

## 5. Homonym Creation: The "Different Concept" Path

### 5.1 The IRI Problem

When the user chooses "Different concept," the system must create a second concept with the same base name. But `generateConceptIri("mouse")` always produces the same IRI. Two concepts cannot share an IRI.

**Solution:** Collect a qualifying label from the user *before* creating the concept. The qualifying label becomes part of the canonical label, which produces a distinct IRI.

### 5.2 Qualifier Collection Flow

Immediately after the user clicks "Different," the system presents a qualifier prompt with two buttons:

```
"To tell them apart, I'll label them:
  • mouse (rodent) — the existing one
  • mouse (device) — the new one"

  [ Accept labels ]  [ Customize ]
```

The auto-generated qualifiers use the parent label. This is a `promptType: 'qualifyHomonym'` ConversationPrompt with `options: ['accept', 'customize']`.

**Accept labels:** Apply the auto-generated qualifiers immediately. No further input needed.

**Customize:** The system presents a follow-up text prompt for the new concept's label only:

```
"What should I call the new one?"
```

This is a `promptType: 'qualifyHomonymCustom'` ConversationPrompt (free-text input, no buttons). The user types a label (e.g., "computer mouse" or "mouse (peripheral)"). The existing concept gets the auto-generated qualifier from its parent. If the user also wants to rename the existing concept, they can do so later through the Inspector (v0.5 polish — label editing).

This button-driven approach avoids parsing ambiguity between affirmative responses and custom labels (e.g., "Yes, but call it computer mouse"), and is consistent with every other prompt in the system: buttons for bounded choices, text input only for genuinely open-ended responses.

### 5.3 Qualifier Application

Once qualifiers are confirmed, the system applies them in a single mutation.

**Note on canonical labels:** The canonical label is stored as `skos:prefLabel`. The `canonicalLabelToIri` index reads from this field. All references to "canonical label" in this spec refer to the value of `skos:prefLabel`. There is no separate `canonicalLabel` field on the concept.

**Existing concept (mouse under rodent):**

| Field | Before | After |
|-------|--------|-------|
| `@id` | `fandaws:class/{uuid5}/mouse` | `fandaws:class/{uuid5}/mouse` **(unchanged)** |
| `skos:prefLabel` | `mouse` | `mouse (rodent)` |
| `rdfs:label` | `Mouse` | `Mouse (rodent)` |
| `skos:hiddenLabel` | — | `mouse` **(new)** |

**New concept (mouse under device):**

| Field | Value |
|-------|-------|
| `@id` | `fandaws:class/{different-uuid5}/mouse-device` (generated from `"mouse (device)"`) |
| `skos:prefLabel` | `mouse (device)` |
| `rdfs:label` | `Mouse (device)` |
| `skos:hiddenLabel` | `mouse` |
| `skos:broader` | IRI of device concept |

### 5.4 IRI Stability Guarantee

**The existing concept's `@id` is NEVER regenerated.** When the canonical label changes from `mouse` to `mouse (rodent)`, the IRI remains `fandaws:class/{uuid5}/mouse`. The IRI slug ("mouse") diverges from the canonical label ("mouse (rodent)"). This is by design — IRI stability is a graph integrity invariant. All existing properties, relationships, child references, and reverse relationships continue to resolve correctly.

The new concept's IRI is generated from its qualified canonical label: `generateConceptIri("mouse (device)")` → `fandaws:class/{different-uuid5}/mouse-device`. No collision with the existing concept's IRI.

### 5.5 Index Update

After qualifier application:

- `canonicalLabelToIri` now has two distinct entries: `"mouse (rodent)" → iri-A`, `"mouse (device)" → iri-B` (keyed by `skos:prefLabel`)
- The bare label `"mouse"` has zero entries in `canonicalLabelToIri` (both `skos:prefLabel` values now include qualifiers)
- A new `hiddenLabelToIri` index maps `"mouse" → [iri-A, iri-B]` for downstream disambiguation

---

## 6. Hidden Label Index

### 6.1 Purpose

After homonym creation, the bare label "mouse" no longer exists in the `canonicalLabelToIri` index. But users will continue to type "mouse" in their utterances — they won't type "mouse (rodent)" naturally. The hidden label index provides a fallback lookup path.

### 6.2 Data Structure

New index in `InMemoryStateAdapter`: `hiddenLabelToIri` (`Map<string, string[]>`).

Unlike `canonicalLabelToIri` (one label → one IRI), the hidden label index maps one label to multiple IRIs because multiple homonyms share the same base name.

```javascript
// In _rebuildIndices():
this._hiddenLabelIndex.clear();
for (const concept of concepts) {
  const hidden = concept['skos:hiddenLabel'];
  if (hidden) {
    const existing = this._hiddenLabelIndex.get(hidden) || [];
    existing.push(concept['@id']);
    this._hiddenLabelIndex.set(hidden, existing);
  }
}
```

### 6.3 Query Method

```javascript
findConceptsByHiddenLabel(label, graphId) {
  const graph = this._graphs.get(graphId);
  if (!graph) return [];
  const iris = this._hiddenLabelIndex.get(label) || [];
  return iris.map(iri =>
    graph['fandaws:concepts'].find(c => c['@id'] === iri)
  ).filter(Boolean);
}
```

### 6.4 Serialization

The hidden label index is derived data (rebuilt from concept `skos:hiddenLabel` fields during `_rebuildIndices()`). It is NOT serialized. On `deserialize()`, `_rebuildIndices()` reconstructs it. This is consistent with the existing 5 indices, which are all derived and rebuilt on load.

---

## 7. Downstream Homonym Disambiguation

### 7.1 The Problem

After homonyms exist, every workflow that resolves concepts by label must handle the bare label "mouse" correctly. The user types "mouse has whiskers" — which mouse?

### 7.2 Resolution Chain

All concept-resolving workflows (`processClassification`, `processProperty`, `processRelationship`) use `findConceptsByCanonical(label, graph)`. After homonym creation, this returns zero results for bare "mouse" (canonical labels are now "mouse (rodent)" and "mouse (device)").

Add a fallback step after the canonical lookup:

```javascript
function resolveConceptByLabel(label, graph, adapter, options = {}) {
  const { allowCreate = false } = options;

  // Step 1: Exact canonical match (linear scan of skos:prefLabel)
  const canonical = findConceptsByCanonical(label, graph);
  if (canonical.length === 1) return { resolved: canonical[0] };
  if (canonical.length > 1) return { ambiguous: canonical, allowCreate }; // shouldn't happen, defensive

  // Step 2: Hidden label fallback
  const hidden = adapter.findConceptsByHiddenLabel(label, graph['@id']);
  if (hidden.length === 0) return { notFound: true };
  if (hidden.length === 1) return { resolved: hidden[0] };
  return { ambiguous: hidden, allowCreate };
}
```

The `allowCreate` flag is passed through in the `ambiguous` return so the calling workflow knows whether to include a "Neither — new concept" option in the disambiguation prompt. The classification workflow passes `allowCreate: true`; property and relationship workflows pass `allowCreate: false` (or omit it, using the default).

### 7.3 Disambiguation Prompt

When `resolveConceptByLabel` returns `{ ambiguous: [...], allowCreate }`, the workflow returns a `promptType: 'homonymDisambiguation'` ConversationPrompt:

```
"There are two concepts named 'mouse' in your graph:
  • mouse (rodent) — under animal → mammal → rodent
  • mouse (device) — under artifact → device

Which one do you mean?"

  [ mouse (rodent) ]  [ mouse (device) ]
```

When `allowCreate` is true (classification workflow only), an additional button is appended:

```
  [ mouse (rodent) ]  [ mouse (device) ]  [ Neither — new concept ]
```

"Neither" feeds into the qualifier collection flow (Section 5.2) to create a new homonym. This handles the three-way (and N-way) homonym case: if "mouse (rodent)" and "mouse (device)" both exist and the user says "mouse is a pet" meaning a third mouse, they aren't forced to pick an existing one.

Property and relationship workflows omit the "Neither" button because they don't create concepts — the user must select one of the existing homonyms.

The user clicks a button. For existing concept selection, the selected concept IRI is passed back to the workflow via options: `{ resolvedConceptIri: selectedIri }`. For "Neither," the workflow routes to the homonym creation path with `{ resolvedConceptIri: 'new', targetParentLabel: '...' }`, which triggers the qualifier prompt.

### 7.4 Rendering in Converse Panel

The disambiguation prompt renders as a system bubble with selection buttons — one per homonym, showing the qualified label and the parent path. When `allowCreate` is true, a final "Neither — new concept" button is appended. The button count varies with the number of homonyms (2+ for selection, optionally +1 for "Neither"). See Section 8.3 for rendering details.

### 7.5 Integration Points

The `resolveConceptByLabel` function replaces direct calls to `findConceptsByCanonical` in:

| Workflow | Resolution Points | `allowCreate` |
|----------|-------------------|---------------|
| `processClassification` | Subject resolution, object resolution | `true` (subject may be new homonym) |
| `processProperty` (property-workflow.js) | Object resolution (the property term) | `false` (cannot create concepts) |
| `processRelationship` (relationship-workflow.js) | Subject resolution, object resolution | `false` (cannot create concepts) |

Each workflow already handles ConversationPrompt returns (for scope narrowing, object resolution, etc.). Adding a disambiguation prompt return follows the same pattern.

---

## 8. Workbench UI Rendering

### 8.1 Converse Panel — Reclassification Confirmation

Three action buttons. Renders as a system bubble.

```
[system bubble]
  "mouse already exists in your graph under rodent.
   rodent and device are in completely separate branches.

   Is this the same mouse, or a different one?"

  [ Same — move it ]  [ Different concept ]  [ Cancel ]
```

**Same** → `state.runUtterance(originalUtterance, { reclassificationConfirmed: 'move', existingConceptIri: '...' })`
**Different** → triggers qualifier collection flow (Section 5.2). Qualifier prompt renders as next system bubble.
**Cancel** → "Cancelled." system bubble. No engine call.

### 8.2 Converse Panel — Qualifier Collection

System bubble with two action buttons:

```
[system bubble]
  "To tell them apart, I'll label them:
   • mouse (rodent) — the existing one
   • mouse (device) — the new one"

  [ Accept labels ]  [ Customize ]
```

**Accept labels** → call `state.runUtterance(originalUtterance, { reclassificationConfirmed: 'new_concept', qualifiers: { existing: 'mouse (rodent)', new: 'mouse (device)' } })`.

**Customize** → set panel-level `_pendingQualification` state. Render follow-up text prompt:

```
[system bubble]
  "What should I call the new one?"
```

User types response (e.g., "computer mouse"). Panel calls `state.runUtterance(originalUtterance, { reclassificationConfirmed: 'new_concept', qualifiers: { existing: 'mouse (rodent)', new: 'computer mouse' } })`. The existing concept always gets the auto-generated qualifier from its parent.

### 8.3 Converse Panel — Homonym Disambiguation

Selection buttons, one per homonym. When triggered from the classification workflow, includes "Neither" option.

```
[system bubble]
  "Which mouse do you mean?"

  [ mouse (rodent) ]  [ mouse (device) ]  [ Neither — new concept ]
```

When triggered from property or relationship workflows, "Neither" is omitted:

```
[system bubble]
  "Which mouse do you mean?"

  [ mouse (rodent) ]  [ mouse (device) ]
```

### 8.4 Graph Tree Panel

After homonym creation: two nodes with qualified labels appear in their respective parent subtrees. No special tree rendering needed — the qualified labels (`mouse (rodent)`, `mouse (device)`) are distinct `skos:prefLabel` values and render as normal tree nodes.

### 8.5 Inspector Panel

When a concept has a `skos:hiddenLabel` (indicating it's a homonym), the Inspector shows an advisory in the Identity section:

```
⚠ Homonym: another concept named "mouse" exists under "device"
```

Clicking the advisory selects the other concept in the tree for comparison. This is a passive display driven by the hidden label index: look up `skos:hiddenLabel` in `hiddenLabelToIri`, filter out the current concept's IRI, display the remaining entries.

---

## 9. Interaction with Existing Systems

### 9.1 Scope Narrowing

Scope narrowing fires after reclassification, as it does today. When the user confirms "Same — move it" and mouse moves from rodent to device, scope narrowing may ask: "Does [device] also have [whiskers]?" This is correct behavior — the user should decide whether properties from the old context still apply.

When the user creates a homonym ("Different concept"), the new concept starts with no properties. Scope narrowing does not fire because there are no properties to inherit.

### 9.2 Property-Concept Reconciliation

The property workflow's object resolution ("dog has fur" → "What is fur?") occurs before concept resolution. If the user classifies fur and a homonym of "fur" exists, `resolveConceptByLabel` will trigger disambiguation. The property workflow is unaffected — it receives the resolved concept IRI regardless of which homonym was selected.

### 9.3 ERS Routing

After reclassification ("Same — move it"), the concept may have a different BFO category inherited from the new parent. ERS re-routes on the next property or relationship addition. No special handling.

After homonym creation, each homonym has its own BFO category from its own parent lineage. ERS routes them independently.

### 9.4 Export Engine

`skos:hiddenLabel` is a standard SKOS field. The `triple-extractor.js` will emit it as a literal triple in all export formats with no changes. The qualified labels in `skos:prefLabel` and `rdfs:label` appear as normal label triples.

### 9.5 IVNE Import (v0.3)

When importing concepts via IVNE, each imported concept may share a canonical label with an existing concept. The import staging UI should detect these and present per-concept resolution options (Move / New Concept / Skip) in the review table before committing. This reuses the same prompt logic as conversational detection but batched for import efficiency.

### 9.6 Description Engine

The DescriptionEngine reads `skos:prefLabel` for human-readable output. After homonym creation, `skos:prefLabel` includes the qualifier: "mouse (rodent) is a rodent that has whiskers." This works without changes. If the qualifier makes descriptions awkward, a future polish pass (v0.5) can use `skos:hiddenLabel` with contextual parenthetical.

### 9.7 StateAdapter Serialization

The hidden label index is derived data, rebuilt by `_rebuildIndices()` during `deserialize()`. No changes to the `serialize()`/`deserialize()` methods from the Workbench v0.1 spec. The index is reconstructed from `skos:hiddenLabel` fields on concepts, which are persisted as normal concept data.

---

## 10. Implementation Phasing

### Phase A: Proximity Computation

**Scope:** Implement the proximity function. This is the foundational gate for all subsequent phases.

**Changes:**
- New file: `src/core/knowledge-engine/proximity.js` (~80 lines) — `computeProximity()` with bidirectional BFS and root exclusion. `quickProximityCheck()` short-circuit for common case.
- Tests: `tests/unit/proximity.test.js` (~15 cases)

**Test cases:**
- PROX-01: Same parent → 0 steps
- PROX-02: Sibling parents (share immediate parent) → 2 steps
- PROX-03: Parent-child relationship → 1 step
- PROX-04: Cousin parents (share grandparent) → 4 steps
- PROX-05: Distant parents across deep branches → correct count
- PROX-06: Disconnected trees (no shared non-root ancestor) → Infinity
- PROX-07: Path through root only → Infinity (root exclusion)
- PROX-08: Path through root AND through non-root → returns non-root path (shorter)
- PROX-09: MAX_DEPTH exceeded → Infinity
- PROX-10: Empty graph → Infinity
- PROX-11: quickProximityCheck returns true for parents within 3 hops of shared ancestor
- PROX-12: quickProximityCheck returns false for distant parents
- PROX-13: Single-node graph (one root) → 0 if same, Infinity if different
- PROX-14: Linear chain of 20 concepts → correct count at each pair
- PROX-15: Graph with multiple roots → paths between roots return Infinity

**Estimated scope:** ~80 lines implementation, ~120 lines tests.

### Phase B: Reclassification Confirmation Prompt

**Scope:** Add proximity check to the classification workflow's Case A path. Present the confirmation prompt when proximity > 3. Handle "Same — move it" and "Cancel." Defer "Different concept."

**Depends on:** Phase A.

**Changes:**
- `knowledge-engine.js` (~40 lines) — Import `computeProximity`, `quickProximityCheck`. In Case A, before reclassification: compute proximity. If ≤3, reclassify silently (unchanged). If >3, return `reclassificationConfirmation` ConversationPrompt. Handle `options.reclassificationConfirmed === 'move'` by proceeding with reclassification.
- `converse.js` (~30 lines) — Render `reclassificationConfirmation` prompt with three buttons. "Different concept" button disabled/grayed with tooltip "Coming soon" for Phase B.

**Test cases:**
- RCL-01: Reclassification with proximity ≤3 → reclassifies silently, no prompt
- RCL-02: Reclassification with proximity >3 → returns prompt, no mutation
- RCL-03: Reclassification with disconnected trees → returns prompt, no mutation
- RCL-04: User confirms "move" → reclassification proceeds, IRI unchanged, properties/children preserved
- RCL-05: User cancels → no mutation
- RCL-06: Same parent → "already classified" message, no prompt, no mutation
- RCL-07: Reclassification of root concept (no existing parent) → proximity from null parent treated as Infinity → prompt fires
- RCL-08: Reclassification where new parent is descendant of current parent → proximity = depth difference → evaluated normally
- RCL-09: All existing classification tests pass unchanged (no current tests involve reclassification across distant branches)
- RCL-10: Reclassification of qualified homonym ("mouse (rodent) is a mammal") within close proximity → reclassifies silently, qualified label and `skos:hiddenLabel` preserved

**Estimated scope:** ~70 lines implementation, ~80 lines tests.

### Phase C: Homonym Creation + Qualifying Labels

**Scope:** Handle the "Different concept" choice. Collect qualifying labels. Create new concept with qualified canonical label. Relabel existing concept. Set up hidden label index.

**Depends on:** Phase B.

**Changes:**
- `knowledge-engine.js` (~60 lines) — Handle `options.reclassificationConfirmed === 'new_concept'`. Expect `options.qualifiers` with confirmed labels. Rename existing concept's canonical/pref/rdfs labels with qualifier. Set `skos:hiddenLabel` on existing concept. Create new concept with qualified canonical label → new IRI via `generateConceptIri(qualifiedLabel)`. Set `skos:hiddenLabel` on new concept. Both operations in single mutation.
- `in-memory-state-adapter.js` (~30 lines) — Add `_hiddenLabelIndex` (`Map<string, string[]>`). Add population in `_rebuildIndices()`. Add `findConceptsByHiddenLabel(label, graphId)` method.
- `state-adapter.js` (~2 lines) — Abstract stub for `findConceptsByHiddenLabel()`.
- `converse.js` (~50 lines) — Enable "Different concept" button. On click, render `qualifyHomonym` prompt with `[ Accept labels ]` and `[ Customize ]` buttons. On "Accept," call `state.runUtterance()` with auto-generated qualifiers. On "Customize," set `_pendingQualification` state, render `qualifyHomonymCustom` text prompt ("What should I call the new one?"), parse user response as the new concept's label, call `state.runUtterance()` with custom qualifier for new concept and auto-generated qualifier for existing concept.
- `inspector.js` (~15 lines) — In Identity section, check `skos:hiddenLabel`. If present, query `findConceptsByHiddenLabel`, filter out self, display homonym advisory for each remaining match.

**Test cases:**
- HOM-01: "Different concept" with "Accept labels" → existing concept relabeled, new concept created with auto-generated qualified labels
- HOM-02: Existing concept's IRI unchanged after relabeling
- HOM-03: New concept's IRI generated from qualified `skos:prefLabel` (different from existing IRI)
- HOM-04: Both concepts have `skos:hiddenLabel: "mouse"`
- HOM-05: `canonicalLabelToIri` has two entries: `"mouse (rodent)" → iri-A`, `"mouse (device)" → iri-B`
- HOM-06: `hiddenLabelToIri` has one entry: `"mouse" → [iri-A, iri-B]`
- HOM-07: `findConceptsByHiddenLabel("mouse")` returns both concepts
- HOM-08: "Customize" → user types "computer mouse" → new concept's `skos:prefLabel` is "computer mouse", existing concept gets auto-generated qualifier
- HOM-09: Serialize → deserialize → hidden label index rebuilt correctly
- HOM-10: Properties on existing concept preserved after relabeling
- HOM-11: Children of existing concept preserved (their `skos:broader` still points to same IRI)
- HOM-12: Inspector shows homonym advisory when concept with `skos:hiddenLabel` is selected

**Estimated scope:** ~160 lines implementation, ~100 lines tests.

### Phase D: Downstream Disambiguation

**Scope:** Add hidden-label fallback to all concept resolution points. Render disambiguation prompts.

**Depends on:** Phase C.

**Changes:**
- New utility: `src/core/knowledge-engine/resolve-concept.js` (~35 lines) — `resolveConceptByLabel(label, graph, adapter, { allowCreate })` function with canonical → hidden label fallback chain. Returns `{ resolved, ambiguous, allowCreate, notFound }`. The `allowCreate` flag is passed through in the `ambiguous` result so the calling workflow knows whether to include the "Neither — new concept" option.
- `knowledge-engine.js` (~25 lines) — Replace `findConceptsByCanonical` calls in subject/object resolution with `resolveConceptByLabel(..., { allowCreate: true })`. Handle `ambiguous` return by emitting `homonymDisambiguation` prompt with "Neither" option. Handle `options.resolvedConceptIri` to resume with selected concept. Handle `options.resolvedConceptIri === 'create_new'` to route to homonym creation path (Section 5).
- `property-workflow.js` (~15 lines) — Same replacement in object resolution, with `allowCreate: false` (default).
- `relationship-workflow.js` (~15 lines) — Same replacement in subject/object resolution, with `allowCreate: false` (default).
- `converse.js` (~25 lines) — Render `homonymDisambiguation` prompt with selection buttons. Conditionally render "Neither — new concept" button when `allowCreate` is true in the prompt context.

**Test cases:**
- DIS-01: "Mouse has whiskers" with two homonyms → disambiguation prompt
- DIS-02: User selects mouse (rodent) → property attached to correct concept
- DIS-03: "Cat chases mouse" with two homonyms → disambiguation prompt for object
- DIS-04: User selects → relationship created with correct concept
- DIS-05: "Mouse is a mammal" with two homonyms → disambiguation prompt, then reclassification of selected concept
- DIS-06: Bare label with only one hidden-label match (asymmetric homonym removal) → auto-resolves, no prompt
- DIS-07: Bare label with no canonical or hidden match → notFound (existing behavior)
- DIS-08: Qualified label typed by user ("mouse (rodent) has whiskers") → canonical match, no disambiguation needed
- DIS-09: Three homonyms exist, user says "mouse is a pet" → disambiguation shows all three + "Neither — new concept" button
- DIS-10: User clicks "Neither — new concept" → qualifier prompt → third homonym created with `skos:hiddenLabel: "mouse"`, hidden label index has three entries
- DIS-11: "Cat chases mouse" where cat doesn't exist AND mouse is ambiguous → objectResolution fires first for cat, after cat is classified, re-run triggers disambiguation for mouse. Two prompt types chain across turns without interference.

**Estimated scope:** ~115 lines implementation, ~90 lines tests.

### Phase E: IVNE Import Batch Resolution (v0.3 aligned)

**Scope:** Detect label collisions during IVNE import. Present batch resolution in import staging UI.

**Depends on:** Phase C.

**Changes:**
- `ivne-state-bridge.js` (~40 lines) — Before committing each imported concept, check `findConceptsByCanonical` for existing same-label concept. Collect collisions into batch report.
- `import-panel.js` (~80 lines) — Display collision table in staging UI. Per-collision options: Move existing / Create homonym / Skip. Collect qualifiers for homonym choices. Commit after all resolved.

**Test cases:**
- IMP-01: Import with no label collisions → no prompts, all concepts committed
- IMP-02: Import with one collision → displayed in staging UI
- IMP-03: User chooses "Move" → existing concept reclassified
- IMP-04: User chooses "Create homonym" → qualifier prompt, both concepts coexist
- IMP-05: User chooses "Skip" → imported concept discarded

**Estimated scope:** ~120 lines implementation, ~50 lines tests.

---

## 11. Configurable Threshold

The proximity threshold (default: 3 steps) is stored in the Workbench preferences (IndexedDB `preferences` store, field `proximityThreshold`). The WorkbenchStateManager reads it at initialization and passes it to the proximity check.

This allows SMEs to tune sensitivity:
- Lower threshold (1–2) → prompt fires more often, fewer silent reclassifications
- Higher threshold (5–8) → prompt fires less often, closer to current behavior
- Threshold of 0 → prompt fires on every reclassification (maximum caution)
- Threshold of 999 → prompt never fires (current behavior, no interruption)

Default is 3 for v1. Adjustable in Workbench settings UI (v0.5).

---

## 12. Files Changed (All Phases)

| File | Phase | Change |
|------|-------|--------|
| `src/core/knowledge-engine/proximity.js` | A | NEW — proximity computation |
| `src/core/knowledge-engine/resolve-concept.js` | D | NEW — concept resolution with hidden-label fallback and `allowCreate` flag |
| `src/core/knowledge-engine/knowledge-engine.js` | B, C, D | Proximity gate in Case A, homonym creation handler, resolveConceptByLabel integration |
| `src/core/knowledge-engine/property-workflow.js` | D | resolveConceptByLabel integration |
| `src/core/knowledge-engine/relationship-workflow.js` | D | resolveConceptByLabel integration |
| `src/adapters/state/in-memory-state-adapter.js` | C | Hidden label index, `findConceptsByHiddenLabel()` |
| `src/adapters/state/state-adapter.js` | C | Abstract stub |
| `docs/workbench/js/panels/converse.js` | B, C, D | Render reclassification confirmation, qualifier collection, disambiguation prompts |
| `docs/workbench/js/panels/inspector.js` | C | Homonym advisory display |
| `src/integration/ivne-state-bridge.js` | E | Label collision detection during import |
| `docs/workbench/js/panels/import-panel.js` | E | Collision resolution table |

### Files NOT Changed

- `identity-simplification.js` — Canonicalization is upstream. No changes.
- `iri-generator.js` — `generateConceptIri()` works correctly as-is. Qualified labels produce distinct IRIs.
- `nl-parser.js` — Parsing is upstream. No changes.
- `scope-narrowing.js` — Receives concept IRI, not label. No changes.
- `validator/` — Structural integrity checks. No label uniqueness concern.
- `export-engine/` — `skos:hiddenLabel` is a standard SKOS field. No special handling.
- `description-engine.js` — Reads `skos:prefLabel`. Qualified labels work automatically.
- `in-memory-state-adapter.js serialize()/deserialize()` — Hidden label index is derived, rebuilt on load. No serialization changes.

---

## 13. Acceptance Criteria

### Phase A
- `computeProximity(siblingA, siblingB)` returns correct step count
- Root-only paths return Infinity
- Disconnected trees return Infinity
- `quickProximityCheck` short-circuits correctly for close parents

### Phase B
- "Mouse is a rodent" → "mouse is a device" → prompt fires (rodent and device are disconnected)
- User clicks "Same — move it" → mouse reclassified under device, IRI unchanged
- User clicks "Cancel" → no mutation, mouse stays under rodent
- "Tiger is a feline" → "tiger is a mammal" → reclassifies silently (feline and mammal are close)
- "Dog is an animal" → "dog is an animal" → "already classified" message
- All existing classification tests pass unchanged

### Phase C
- "Mouse is a rodent" → "mouse is a device" → user clicks "Different" → qualifier prompt appears with `[ Accept labels ]` and `[ Customize ]` buttons
- User clicks "Accept labels" → existing mouse relabeled "mouse (rodent)" (IRI unchanged), new mouse created as "mouse (device)" (new IRI)
- User clicks "Customize" → text prompt appears → user types "computer mouse" → new concept labeled "computer mouse", existing labeled "mouse (rodent)"
- Both have `skos:hiddenLabel: "mouse"`
- Inspector shows homonym advisory on both

### Phase D
- "Mouse has whiskers" with two homonyms → disambiguation prompt (no "Neither" button — property workflow)
- User selects mouse (rodent) → property on correct concept
- "Cat chases mouse" with two homonyms → disambiguation prompt (no "Neither" button — relationship workflow)
- Typing "mouse (rodent) has whiskers" → direct canonical match, no disambiguation
- "Mouse is a pet" with two homonyms → disambiguation prompt WITH "Neither — new concept" button (classification workflow)
- User clicks "Neither" → qualifier prompt → third homonym created
- Chained prompts: "cat chases mouse" where cat unknown and mouse ambiguous → objectResolution for cat, then disambiguation for mouse, both resolve correctly

### Full Sequence (End-to-End)
```
1. "mammal is an animal"
2. "rodent is a mammal"
3. "mouse is a rodent"
4. "mouse has whiskers"                     → property on mouse
5. "device is an artifact"
6. "mouse is a device"
   → Prompt: "mouse exists under rodent.
     rodent and device are in separate branches.
     Same mouse, or different?"
7. User: Different
   → Prompt: "Label them mouse (rodent) and mouse (device)?
     [ Accept labels ] [ Customize ]"
8. User: Accept labels
   → Existing mouse relabeled "mouse (rodent)", IRI unchanged
   → New "mouse (device)" created under device
9. "mouse has a scroll wheel"
   → Prompt: "Which mouse? mouse (rodent) or mouse (device)?"
10. User: mouse (device)
    → Property "scroll wheel" on mouse (device)
11. "mouse has a tail"
    → Prompt: "Which mouse?"
12. User: mouse (rodent)
    → Property "tail" on mouse (rodent)
13. "mouse is a pet"
    → Prompt: "Which mouse?
      [ mouse (rodent) ] [ mouse (device) ] [ Neither — new concept ]"
14. User: Neither — new concept
    → Prompt: "What should I call the new one?"
15. User: "pet mouse"
    → New "pet mouse" created under pet, skos:hiddenLabel "mouse"
    → Future "mouse" references disambiguate across all three
16. Export as Turtle
    → Three mouse concepts with distinct IRIs
    → Each has correct properties
    → All have skos:hiddenLabel "mouse"
```

---

## 14. Relationship to Original Termidium Spec

| Termidium Feature | Fandaws-Sentinel v1.3 Equivalent | Status |
|-------------------|-----------------------------|--------|
| 8-step proximity threshold (auto-merge trigger) | Proximity threshold (configurable, default 3) as prompt trigger | Reframed — prompt trigger not merge trigger |
| Silent background merging | Reclassification Confirmation Prompt | Replaced — never assume principle |
| Root exclusion from path calculation | Root exclusion preserved in proximity BFS | Preserved |
| Merge Step 1: keep deeper copy | Not applicable — user chooses "Same" or "Different," no depth heuristic | Eliminated |
| Merge Steps 2–4: consolidate + transfer + delete | Not applicable — no concept deletion occurs in any path | Eliminated |
| Merge Step 5: self-referencing detection | Not needed — identity simplification prevents "X is X" at parse time | Already handled |
| Merge Step 6: recursive propagation | Not applicable — no merge cascade | Eliminated |
| Homonym coexistence | "Different concept" with qualifying labels + hidden label disambiguation | Enhanced |
| Post-merge child duplicate detection | Not applicable — no merge | Eliminated |

**Key architectural difference:** Termidium solved duplicate resolution through post-hoc merging (detect duplicates, then consolidate them). Fandaws-Sentinel v1.3 solves it through pre-hoc gating (detect the intent before the mutation, then route to the correct action). No concept is ever deleted. No properties are ever transferred between concepts. The graph only grows — concepts are created and relabeled, never absorbed.

---

## 15. Summary of Prompt Types

This feature introduces four new ConversationPrompt types:

| `fandaws:promptType` | Trigger | Rendering | User Action |
|----------------------|---------|-----------|-------------|
| `reclassificationConfirmation` | Classification Case A where proximity > threshold | Three buttons: Same, Different, Cancel | Button click → options passed to `runUtterance()` |
| `qualifyHomonym` | After user clicks "Different" (or "Neither — new concept") | Two buttons: Accept labels, Customize | Button click → accept applies auto-generated labels; customize triggers `qualifyHomonymCustom` |
| `qualifyHomonymCustom` | After user clicks "Customize" in qualifier prompt | Text input: "What should I call the new one?" | Free text → custom label for new concept |
| `homonymDisambiguation` | Any workflow resolves a bare label matching multiple homonyms via hidden label index | Selection buttons, one per homonym. Classification workflow adds "Neither — new concept" button. | Button click → selected concept IRI passed to workflow; "Neither" routes to qualifier flow |

These join the existing prompt types: scope narrowing (yes/no buttons) and `objectResolution` (open-ended text input from property-concept reconciliation).

---

## 16. Risk Assessment

### 16.1 Prompt Frequency

The proximity threshold controls prompt frequency. At threshold 3, the prompt fires only for cross-domain reclassifications (rare in normal ontology building). Within-domain corrections ("tiger is a mammal" → "tiger is a feline") pass silently. If user feedback indicates the threshold is too aggressive, increase it. If too permissive, decrease it. The configurable threshold (Section 11) provides the escape valve.

### 16.2 IRI Slug Divergence

After qualifying labels are applied, the existing concept's IRI slug no longer matches its canonical label (`fandaws:class/.../mouse` with canonical label `mouse (rodent)`). This is cosmetically imperfect but structurally safe. The slug is a human convenience in the IRI, not a semantic commitment. No system component uses the slug for lookup — all resolution goes through `findConceptsByCanonical` (label-based) or direct IRI reference.

### 16.3 Hidden Label Index Growth

Each homonym pair adds two entries to the hidden label index. In a graph with N homonym pairs, the index has N base labels mapping to 2N IRIs. This is bounded by the total number of concepts and is negligible for storage and lookup performance.

### 16.4 N-Way Homonyms

If the user creates "mouse (rodent)" and "mouse (device)", and later says "mouse is a pet" intending a third mouse, the disambiguation prompt shows all existing homonyms plus a "Neither — new concept" button (Section 7.3). The user clicks "Neither," provides a qualifier ("pet mouse"), and a third homonym is created. The hidden label index supports this: `"mouse" → [iri-A, iri-B, iri-C]`. Future disambiguation prompts show all three plus "Neither." No special handling needed beyond what Sections 5–7 specify. The "Neither" button is only available in the classification workflow; property and relationship workflows require the user to pick an existing homonym.

### 16.5 No Data Loss Path

Unlike v1.0/v1.1 (which included merge operations that delete concepts), this design has no data loss path. Every user action either preserves the existing concept (move, cancel) or creates a new concept (homonym). No concept is ever deleted. No properties are ever discarded. The worst outcome is an unwanted reclassification, which the user can reverse by reclassifying back.
