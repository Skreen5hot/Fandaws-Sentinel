# Validator

**Spec Reference:** Section 3.2.4, Section 6

Enforces structural integrity constraints on proposed graph mutations before they are applied. All rules are pure functions — no I/O, no state mutation.

**Input:** `GraphMutation` node + current `KnowledgeGraph`
**Output:** `ValidationResult` node (valid/invalid + violation descriptors)

**Validation Rules:**
- Input Sanitization (Section 6.1)
- Termidium Deduplication (Section 6.2)
- Property Redundancy Prevention (Section 6.3)
- Custom Relationship Validation (Section 6.4)
- Sanity Check / Circular Hierarchy Prevention (Section 6.5)
- Identity Simplification (Section 6.6)

**Performance Target:** < 15ms for full check suite.
