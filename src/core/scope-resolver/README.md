# ScopeResolver

**Spec Reference:** Section 3.2.7

Resolves terms and detects conflicts across a hierarchy of knowledge graphs (scopes). Sits between the OrchestrationAdapter and the core pipeline.

**Input:** Term (string) + `ScopeConfiguration` (JSON-LD) + read access to scope graphs via StateAdapter
**Output:** `ScopeResolution` (JSON-LD) — resolved concept, conflict report, or null result

**Scope Hierarchy:**
1. Context scope (session-bound, highest priority)
2. User scope (personal graph)
3. Global scope (federation of published IPFS graphs)

Pure function. Read-only traversal. No mutations. No direct I/O.
