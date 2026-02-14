# DescriptionEngine

**Spec Reference:** Section 3.2.5

Generates natural-language definitions for concepts based on their position in the knowledge graph.

**Input:** Concept identifier + current `KnowledgeGraph`
**Output:** `Description` node (generated text + template used)

**Templates:**
- Standard: "[Term] is a [parent] that has [prop1], [prop2], [prop3]."
- Process: "[Object] [term] is the [parent+ing] of [object] by [subject]."

**Performance Target:** < 2ms per description.
