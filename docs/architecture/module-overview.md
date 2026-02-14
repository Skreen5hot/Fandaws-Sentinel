# Module Overview

## Architectural Layers

| Layer         | Type     | Modules                                                              |
|---------------|----------|----------------------------------------------------------------------|
| Computation   | CORE     | NLParser, Classifier, KnowledgeEngine, Validator, DescriptionEngine, ExportEngine, ScopeResolver |
| State         | PLUGGABLE| InMemoryStateAdapter, FileSystemStateAdapter                         |
| Orchestration | PLUGGABLE| SynchronousOrchestrationAdapter                                     |
| Integration   | PLUGGABLE| NullIntegrationAdapter                                               |

## Pipeline Flow

```
User Input
    → NLParser (parse utterance → ParseResult)
    → ScopeResolver (check scope hierarchy → ScopeResolution)
    → Classifier (route to workflow → ClassificationAction)
    → KnowledgeEngine (execute workflow → GraphMutation + ConversationPrompts)
    → Validator (check constraints → ValidationResult)
    → StateAdapter (apply mutation → updated KnowledgeGraph)
    → DescriptionEngine (regenerate descriptions)
```

## Key Constraint

All core modules are pure functions: JSON-LD in, JSON-LD out.
No mutable state. No I/O. No probabilistic inference.
