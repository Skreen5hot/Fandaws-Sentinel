# Phase 12 Locked Architectural Decisions
**Companion to phase-12-avc-bundle.json**
**Status: LOCKED — not subject to revision during Phase 12 implementation**

---

## Decision 1: Compatibility Rule for IS_A Chains

**Rule:** Transitive Path Compatibility. Two IS_A chains for the same term are compatible when the less granular chain is a valid transitive closure of the more granular chain. All other cases are conflicts.

### Three Cases

**Case A — Prefix Match (Compatible, silent upgrade)**

```
Local:   dog → mammal
Global:  dog → mammal → animal

Result:  dog → mammal → animal
         (local chain extended with global ancestors)
```

The local chain is a strict prefix of the global chain. No conflict. System auto-resolves and appends the additional ancestors.

**Case B — Transitive Match (Compatible, silent upgrade with edge replacement)**

```
Local:   dog → mammal
Global:  dog → canine → mammal

Result:  dog → canine → mammal
         (direct dog → mammal edge REMOVED)
         (canine inserted as intermediate)
```

The local chain is a valid transitive closure of the global chain (`dog → mammal` is the transitive consequence of `dog → canine` plus `canine → mammal`). The global chain is more granular. System auto-resolves by replacing the direct edge with the inserted intermediate.

**Critical:** The direct `dog → mammal` edge MUST be removed. Keeping both `dog → canine` and `dog → mammal` creates polyhierarchy, which violates the single-inheritance commitment and will fail AVC scenario `no-polyhierarchy-after-transitive-match`.

**Case C — Divergent (Conflict)**

```
Local:   dog → pet
Global:  dog → mammal

Result:  Conflict prompt fires.
         User chooses useDefinition, createDistinct, or refine.
```

Neither chain is a transitive closure of the other. The definitions disagree about what `dog` fundamentally IS. System surfaces the disagreement.

### Edge Cases

- Same terminal ancestor, different intermediates (e.g., `dog → retriever → mammal` vs `dog → canine → mammal`) is a conflict. Neither chain is the transitive closure of the other.
- Completely disjoint chains (`dog → pet → companion` vs `dog → mammal → organism`) is a conflict.
- Identical chains are not a conflict — the resolution is idempotent.

---

## Decision 2: Stale-Copy Action

**Rule:** When a resolved concept exists locally at an older graph version than the source scope, fire `staleCopyPrompt`. The user chooses the action.

### MachineSignal Payload

```
promptType: "staleCopyPrompt"
term: string
localVersion: semver string
sourceVersion: semver string
differences: [
  {
    type: "parentChange" | "restrictionAdded" | "restrictionRemoved" | "relationshipAdded" | "relationshipRemoved" | "labelChange",
    ...fields specific to the difference type
  }
]
options: ["keep_local", "refresh_from_source", "cancel"]
```

### Three User Choices

**keep_local:** Local concept unchanged. Annotation NOT updated (still reflects old version). Session records the decision.

**refresh_from_source:** Local concept replaced by source version. Parent chain updated. Structural differences materialized. Annotation updated with new `graphVersion` and new `resolvedAt` timestamp.

**cancel:** No mutation. Resolution attempt aborted. Local graph unchanged. Resolution status becomes `"cancelled"`.

### When It Fires

The check fires during any resolution attempt for a term that is already present in the local graph with a `fandaws:resolvedFrom` annotation referencing the same source scope. If the source scope's current `graphVersion` differs from the annotation's recorded `graphVersion`, the prompt fires.

If the source scope version matches the annotation, resolution is idempotent (no prompt, no mutation). If the term was not previously resolved (no annotation), this is a first-time resolution (no staleness to check).

---

## Decision 3: Annotation Schemas

Three annotations are locked as ontology contracts. Field names and required/optional status are fixed. Adding fields requires architect sign-off; renaming or removing fields is not permitted.

### fandaws:resolvedFrom

Applied to every concept copied from a source scope into the local graph.

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| graphId | string | yes | Source scope's graph identifier |
| conceptIri | IRI | yes | Concept's IRI in the source scope |
| scopeType | enum: "context" \| "user" \| "global" | yes | Which scope layer the concept came from |
| resolvedAt | ISO datetime | yes | When the resolution occurred |
| graphVersion | semver string | yes | Version of the source graph at time of resolution |

**Note:** No `resolvedBy` user-tracking field. User provenance is handled at the metadata envelope level, not inside this annotation.

### fandaws:shadows

Applied to a concept that supersedes one or more other concepts via the `refine` resolution action.

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| shadowedDefinitions | array of objects | yes | List of concepts being shadowed |
| shadowedAt | ISO datetime | yes | When the shadowing occurred |
| shadowReason | string | yes | Human-readable justification |

Each entry in `shadowedDefinitions` has the shape:

| Sub-field | Type | Required |
|-----------|------|----------|
| graphId | string | yes |
| conceptIri | IRI | yes |
| scopeType | enum: "context" \| "user" \| "global" | yes |
| graphVersion | semver string | yes |

### fandaws:disambiguatedFrom

Applied to each concept produced by the `createDistinct` resolution action.

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| originalTerm | string | yes | The ambiguous term that was split |
| disambiguationSuffix | string | yes | The suffix used for this concept |
| peerConcept | IRI | yes | IRI of the OTHER concept in the disambiguation pair |
| disambiguatedAt | ISO datetime | yes | When the disambiguation occurred |

**Symmetry requirement:** When `createDistinct` produces two concepts A and B, A's `peerConcept` points to B's IRI, and B's `peerConcept` points to A's IRI. Symmetric cross-reference.

---

## Supplemental: IRI Minting Rules

Three rules govern how IRIs are assigned during resolution outcomes.

### IRI-1: Fresh IRIs on createDistinct

Both disambiguated concepts receive freshly minted local IRIs. The source scope's IRIs are NOT retained as primary IRIs.

**Pattern:** `fandaws:class/{uuid}/{original-term}-{suffix}`

**Example:** `createDistinct` on `dog` with suffixes `pet` and `animal` produces `fandaws:class/abc123.../dog-pet` and `fandaws:class/def456.../dog-animal`. Neither concept's IRI equals `user:dog` or `cco:dog`.

**Reasoning:** Under createDistinct, both concepts are local. Neither IS the source concept unchanged. Retaining a source IRI on one of them would imply "this one is canonical; the other is a divergence," which misrepresents the user's claim that both are distinct local concepts.

The source IRIs are preserved via:
- `fandaws:disambiguatedFrom.peerConcept` (the other concept's IRI)
- The copied parent chain (ancestors retain their source IRIs per IRI-3)

### IRI-2: Fresh IRI on refine

The refined concept receives a freshly minted local IRI. It does NOT inherit the IRI of any shadowed concept.

**Pattern:** `fandaws:class/{uuid}/{disambiguated-label-slug}`

**Example:** `refine` with new display label `"dog (domain-specific)"` produces `fandaws:class/xyz789.../dog-domain-specific`. The IRI does not equal `user:dog-existing` (the shadowed local concept) or `cco:dog` (the shadowed global concept).

**Reasoning:** The refined concept is a NEW concept that shadows old ones. If it inherited an existing IRI, downstream references to that IRI would silently rewrite to the refined meaning, corrupting provenance. Fresh IRI preserves immutability of existing references.

**Corollary:** The shadowed local concept (`user:dog-existing` in the example) REMAINS in the graph. It is not deleted or modified. It is simply no longer the active resolution for the term `dog`.

### IRI-3: Source IRI preserved on useDefinition

The copied concept retains the source scope's IRI in the local graph. No re-minting occurs.

**Example:** `useDefinition` selecting `cco:dog` from the global scope results in `cco:dog` existing in the local graph with the same IRI. The local graph's export will reference `cco:dog`.

**Reasoning:** useDefinition is "I accept this external definition as-is." The IRI is part of the definition. Re-minting would silently create a new identity for a concept that is meant to be the source scope's concept.

---

## Decision Audit Trail

| Decision | Approved Date | Version |
|----------|---------------|---------|
| Decision 1 (Transitive Path Compatibility) | 2026-04-16 | v1 — locked |
| Decision 2 (Stale-Copy Prompt) | 2026-04-16 | v1 — locked |
| Decision 3 (Annotation Schemas) | 2026-04-16 | v1 — locked |
| IRI Minting Rules (IRI-1, IRI-2, IRI-3) | 2026-04-16 | v1 — locked |

Changes to any locked decision require architect review and bundle version bump.
