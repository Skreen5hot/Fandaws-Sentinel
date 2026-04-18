# PROV-O Calibration Study — Gap Finding #001

**Found during:** PROV-O Pass 1 dry run (2026-04-18)
**Severity:** Spec gap — not a code bug
**Status:** Logged for architect decision. Current implementation correctly follows spec.

---

## Gap: Intra-Ontology Hierarchy Propagation Missing from Placement Sandbox

### What happened

20 of 31 PROV-O classes were PlacementRejected because their declared `rdfs:subClassOf` target (e.g., `prov:InstantaneousEvent`, `prov:Entity`, `prov:Influence`) is an intra-ontology class, not a BFO class. The sandbox treats any non-BFO superclass as a failed lookup.

But several of those parent classes were themselves successfully placed in the same ingestion batch:
- `prov:InstantaneousEvent` → placed under Process (label match, 0.4)
- `prov:Entity` → placed under Entity (fallback, 0.1)
- `prov:Agent` → placed under MaterialEntity (fallback, 0.1)

Their children (`prov:Start`, `prov:End`, `prov:Bundle`, `prov:Person`, etc.) could inherit the parent's placement but don't, because the sandbox evaluates each class independently with no second pass.

### What the spec says

Decision D-3 defines four heuristic categories: explicit BFO superclass, property-based inference, label-based, disjointness check. None mention propagation through the source ontology's own hierarchy.

### Why it wasn't caught earlier

The D1 AVC scenarios assume classes either declare BFO superclasses directly (like CCO) or have no BFO alignment. PROV-O is the in-between case: rich internal hierarchy, no BFO alignment. This is the first real-world test of the placement sandbox.

### Proposed resolution (for architect review)

Add a fifth heuristic category or a post-evaluation propagation pass:

1. After independent evaluation, scan classes whose superclass is from the same ontology namespace
2. If the parent was successfully placed (PlacementConfirmed or PlacementAmbiguous with a candidate), propagate the parent's BFO placement to the child at reduced confidence (e.g., parent confidence × 0.8 per hop)
3. Multi-hop chains decay multiplicatively (Start → InstantaneousEvent → Process at parent_conf × 0.8)
4. If the parent was Ambiguous, the child should also be Ambiguous (don't propagate certainty from uncertainty)

### Decision needed

- Confidence decay factor for transitive inheritance
- Whether to propagate from Ambiguous parents (propagate ambiguity?) or only from Confirmed parents
- Whether this is a D-3 amendment or a new D-24 decision
- New AVC scenario(s) covering the propagation case

### Impact on PROV-O Pass 1

Without this fix, PROV-O Pass 1 requires the analyst to manually place ~20 classes that could have been auto-placed. The study is still valid — it just surfaces more human resolution decisions than necessary. The finding itself is a calibration study result.
