# ExportEngine

**Spec Reference:** Section 3.2.6

Transforms the knowledge graph into external ontology formats. Read-only, deterministic, no mutations, no external services.

**Input:** `KnowledgeGraph` (JSON-LD) + `ExportConfiguration` (target format)
**Output:** Serialized output in requested format

**Supported Formats:**
- SKOS (W3C SKOS Core)
- OWL (W3C OWL 2)
- RDF/XML (W3C RDF)
- Turtle (W3C Turtle)
