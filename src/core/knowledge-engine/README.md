# KnowledgeEngine

**Spec Reference:** Section 3.2.3

Executes knowledge-building operations against a knowledge graph, producing graph mutations. Contains the core business logic for classification, property, and custom relationship workflows plus all validation rules (deduplication, sanity check, property redundancy prevention, custom relationship validation).

**Input:** `ClassificationAction` node + current `KnowledgeGraph` (JSON-LD)
**Output:** `GraphMutation` node + optional `ConversationPrompt` nodes for disambiguation

Does not apply mutations directly — emits declarative descriptions for the StateAdapter.

**Performance Target:** < 10ms per mutation.
