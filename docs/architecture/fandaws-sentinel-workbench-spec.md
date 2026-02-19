# Fandaws Sentinel Workbench — PWA Specification

**Date:** 2026-02-18  
**From:** Stakeholder Review  
**To:** Fandaws Development Team  
**Re:** Unified SME Testing Interface  
**Status:** Specification for Review  
**Authority:** Fandaws v3.4

---

## 1. Problem Statement

The current Fandaws Sentinel demo site is a **developer verification harness**. Each tab (Conversation, Property Demo, Relationship Demo, Export Demo, ERS Demo, IVNE Compiler) operates against its own isolated, preloaded graph. An ontologist who types "A dog is an animal" in the Conversation tab cannot:

- See the ERS routing decision on that classification
- Export the resulting graph as Turtle or SKOS
- Import a BFO fragment via IVNE and then extend it conversationally
- Come back tomorrow and find their work still there
- Work offline at a conference with no WiFi

The SMEs don't want to inspect services one at a time. They want to **use Fandaws as a coherent tool**: converse, import, inspect, export — all operating on the same persistent knowledge graph.

### What This Is NOT

This is not a redesign of Fandaws internals. Every module needed already exists in `dist/fandaws.js` and is tested (1,620 tests, 81 suites, zero failures). This specification defines a **new presentation layer** that wires existing modules to a shared, persistent state.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Fandaws Sentinel Workbench (PWA)                               │
│                                                                 │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Converse  │  │ Import   │  │ Inspect  │  │   Export     │  │
│  │  Panel    │  │  Panel   │  │  Panel   │  │   Panel      │  │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│        │              │             │                │          │
│        ▼              ▼             ▼                ▼          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WorkbenchStateManager                       │   │
│  │  Single InMemoryStateAdapter instance (the "live graph") │   │
│  │  Event bus: graph-changed, concept-selected, export-req  │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              IndexedDB Persistence Layer                  │   │
│  │  DB: "fandaws-workbench"                                  │   │
│  │  Stores: graphs, sessions, preferences                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Service Worker: offline caching of app shell + fandaws.js      │
└─────────────────────────────────────────────────────────────────┘
```

**Key invariant:** There is exactly ONE `InMemoryStateAdapter` instance at any time. Every panel reads from and writes to it. When the graph changes, all panels update reactively.

---

## 3. Interface Layout

### 3.1 Layout Model

Three-panel responsive layout replacing the current tab system:

```
┌──────────────────────────────────────────────────────────┐
│  Header: Fandaws Sentinel Workbench  [graph-selector ▾]  │
├──────────┬───────────────────────────┬───────────────────┤
│          │                           │                   │
│  Left    │       Center              │    Right          │
│  Panel   │       Panel               │    Panel          │
│          │                           │                   │
│  Graph   │   Active Workspace        │   Inspector       │
│  Tree    │   (Converse / Import /    │   (Concept detail │
│  + Nav   │    Export)                 │    ERS routing,   │
│          │                           │    JSON-LD,       │
│          │                           │    BFO category)  │
│          │                           │                   │
├──────────┴───────────────────────────┴───────────────────┤
│  Status bar: 5 concepts | 2 relationships | R2 dominant  │
└──────────────────────────────────────────────────────────┘
```

**Mobile/narrow breakpoint (< 768px):** Collapse to single-panel with bottom tab bar (Graph / Work / Inspect). Same as mobile app conventions the SMEs already know.

**Wide breakpoint (≥ 1200px):** All three panels visible simultaneously. Left panel collapsible.

### 3.2 Left Panel — Graph Navigator

Always-visible tree view of the current knowledge graph. This replaces the static `<pre>` hierarchy dumps in the current demos.

- **Tree rendering:** Indented hierarchy from `skos:broader` / parent index. Expand/collapse nodes.
- **Concept badges:** Small colored dots indicating BFO category (material entity = blue, process = orange, quality = purple, role = green, etc.) and epistemic register (R1 = solid, R2 = outlined, R3 = dashed).
- **Click to inspect:** Selecting a concept populates the Right Panel with its full detail.
- **Search/filter:** Text input at top of tree. Filters by `canonicalLabel` using identity simplification pipeline (the same pipeline in Phase 1 — reuse it).
- **Drag-and-drop reparenting:** Drag a concept onto another to reclassify. This triggers the same classification workflow as typing "X is a Y" in conversation. The Validator catches cycles, the KnowledgeEngine builds the mutation, the StateAdapter commits it. No special code path — just a different input gesture routing to the same pipeline.

### 3.3 Center Panel — Workspace

Switchable workspace modes. **Not tabs** — the workspace content changes but the graph navigator and inspector remain stable.

#### Mode 1: Converse

The existing Conversation Demo, promoted to primary interface. Changes from current implementation:

| Current | Workbench |
|---------|-----------|
| Isolated preloaded graph | Shared live graph |
| Conversation log in right column | Conversation log below input (chat-style) |
| Scope narrowing buttons in left column | Scope narrowing inline in conversation flow |
| Graph state as text dump | Graph state is the Left Panel (always visible) |
| "Reset Graph" destroys everything | "New Graph" creates a named graph in IndexedDB |

**Conversation flow enhancement:** After each utterance, show a collapsed "pipeline trace" row under the system response. Clicking expands to show: parse result → classifier decision → ERS routing → validator result → mutation JSON-LD. This replaces the need to switch to individual demo tabs — the SME sees the internals inline, on-demand, without leaving the conversation.

#### Mode 2: Import

OWL ontology import via IVNE compiler. Two import paths:

**File upload:** Drag-and-drop or file picker for `.owl`, `.ttl`, `.rdf`, `.jsonld` files. The IVNE compiler processes the file and produces compiled concepts + ReductionManifest. The compiled concepts are committed to the live graph via the StateAdapter.

**Paste:** Textarea for pasting OWL/Turtle content directly (the current IVNE Demo textarea, but writing to the live graph instead of an isolated sandbox).

**Import results display:**
- Fidelity score badge (green/yellow/red)
- Concept count: N new, M merged (via Termidium), K rejected
- Semantic loss records (expandable)
- IRI mapping table (source OWL IRI → Fandaws IRI)
- "Accept Import" button — concepts appear in Left Panel tree immediately
- "Reject Import" button — discard, no graph mutation

**Critical design point:** Import operates through the existing IVNE → StateAdapter pipeline. The Workbench adds a staging step (review before commit) that the current IVNE Demo lacks. This is a UI concern, not a pipeline change.

#### Mode 3: Export

Export the live graph (or a selected subtree) to standard formats.

- **Format selector:** SKOS, OWL, Turtle, RDF/XML (existing ExportEngine formats)
- **Scope selector:** Entire graph, or select a root concept to export its subtree only
- **ERS filter:** Export all registers, or filter to R1-only / R2-only / exclude R3
- **Live preview:** Syntax-highlighted output updates as options change (existing Export Demo behavior, but against the live graph)
- **Download button:** Save as `.ttl`, `.rdf`, `.owl`, or `.skos` file
- **Copy to clipboard:** One-click copy (existing)

### 3.4 Right Panel — Inspector

Context-sensitive detail panel. Shows full information about whatever is selected.

**When a concept is selected (from tree or conversation):**

| Section | Content |
|---------|---------|
| Identity | Display label, canonical label, IRI, UUID, BFO category badge |
| Description | Auto-generated description from DescriptionEngine (live) |
| Taxonomy | Parent chain (breadcrumb: Entity → Living Thing → Animal → Dog) |
| Properties | List with epistemic register badges, routing method |
| Relationships | Outgoing and incoming, with verb and register |
| ERS Detail | Full routing record for each property/relationship — pipeline trace showing which step matched |
| JSON-LD | Collapsible raw JSON-LD of the concept node |
| Provenance | `dcterms:created`, `prov:wasDerivedFrom`, import source if IVNE-imported |

**When nothing is selected:** Show graph-level statistics (concept count, relationship count, register distribution, BFO category distribution).

### 3.5 Header

- **Graph selector dropdown:** Switch between saved graphs in IndexedDB. Each graph is a named workspace.
- **New Graph button:** Create an empty graph with a user-provided name.
- **Graph actions menu:** Rename, duplicate, delete, export full graph as JSON-LD snapshot.
- **Badges:** Same as current site — spec version, phase status, test count. But also: graph name, concept count, last modified timestamp.

### 3.6 Status Bar

Single-line persistent status at bottom:
```
📊 12 concepts | 4 relationships | 2 properties | BFO: 8 material, 2 process, 1 quality, 1 role | ERS: 3 R1, 9 R2, 0 R3 | Last saved: 2 min ago
```

Updates reactively on every graph mutation.

---

## 4. IndexedDB Persistence Layer

### 4.1 Database Schema

```
Database: "fandaws-workbench" (version 1)

Object Store: "graphs"
  Key: graphId (UUID v4)
  Value: {
    graphId: string,
    name: string,
    createdAt: ISO datetime,
    modifiedAt: ISO datetime,
    snapshot: {
      // Full InMemoryStateAdapter serialization
      concepts: Map<IRI, ConceptNode>,
      indices: {
        canonicalLabel: Map<string, IRI>,
        parent: Map<IRI, IRI>,
        children: Map<IRI, Set<IRI>>,
        properties: Map<IRI, PropertyNode[]>,
        reverseRelationships: Map<IRI, RelationshipNode[]>
      }
    },
    metadata: {
      conceptCount: number,
      relationshipCount: number,
      propertyCount: number,
      bfoDistribution: { [category: string]: number },
      ersDistribution: { R1: number, R2: number, R3: number },
      importHistory: ImportRecord[]
    }
  }

Object Store: "sessions"
  Key: sessionId (UUID v4)
  Value: {
    sessionId: string,
    graphId: string,          // foreign key to graphs
    conversationLog: ConversationEntry[],
    createdAt: ISO datetime,
    modifiedAt: ISO datetime
  }

Object Store: "preferences"
  Key: "user-preferences" (singleton)
  Value: {
    lastOpenGraphId: string,
    theme: "dark" | "light",
    panelLayout: { leftWidth: number, rightWidth: number },
    defaultExportFormat: string,
    showPipelineTraces: boolean,
    autoSaveIntervalMs: number   // default 5000
  }
```

### 4.2 Persistence Strategy

**Auto-save on mutation:** Every `StateAdapter.applyMutation()` call triggers a debounced IndexedDB write (default 5 seconds). The debounce ensures rapid-fire conversation utterances don't thrash the database.

**Snapshot serialization:** The `InMemoryStateAdapter` needs a `serialize()` → JSON and `deserialize(json)` → restored adapter pair. The current adapter stores concepts as a Map and maintains 5 indices. Serialization writes the concept Map; deserialization rebuilds indices from the concept data (indices are derived, not primary).

**This requires a new method pair on InMemoryStateAdapter:**

```javascript
// New methods for Phase 11 or Workbench-specific extension
serialize(): string {
  // JSON.stringify the concept store
  // Indices are NOT serialized — they're rebuilt on load
}

static deserialize(json: string): InMemoryStateAdapter {
  // Parse JSON, create new adapter, rebuild all 5 indices
}
```

These methods are also needed for Phase 11 (Session Lifecycle). Building them for the Workbench is forward-compatible.

### 4.3 Graph Lifecycle

| Action | Behavior |
|--------|----------|
| New Graph | Create empty `InMemoryStateAdapter`, save to IndexedDB with user-provided name |
| Open Graph | Load snapshot from IndexedDB, `deserialize()` into new adapter, set as active |
| Save Graph | `serialize()` active adapter, write to IndexedDB (auto-save handles this) |
| Duplicate Graph | Deep-copy snapshot to new graphId with "(copy)" suffix |
| Delete Graph | Remove from IndexedDB with confirmation dialog |
| Import into Graph | IVNE output committed to active adapter, then auto-saved |
| Export from Graph | Read-only operation on active adapter, no persistence change |

---

## 5. Service Worker & PWA

### 5.1 Manifest

```json
{
  "name": "Fandaws Sentinel Workbench",
  "short_name": "Fandaws",
  "description": "Edge-canonical conversational knowledge-building platform",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#13151d",
  "theme_color": "#6e8ccc",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 5.2 Cache Strategy

**Precache (install):** App shell HTML, CSS, JS, `dist/fandaws.js` bundle (~5.5 MB uncompressed, ~1 MB gzipped). These are the only network resources. Once cached, the entire application runs offline.

**Runtime cache:** Nothing. Fandaws has zero runtime network dependencies. No APIs, no CDNs, no analytics. The Mermaid CDN import in the current site is the only external dependency — for the Workbench, either bundle Mermaid or drop the roadmap diagram (it's a developer artifact, not an SME tool).

### 5.3 Offline Behavior

Identical to online behavior. Every computation runs in the browser. IndexedDB persists locally. The "Install App" prompt enables full PWA standalone mode. This is the edge-canonical promise made real — the SME's laptop IS the server.

---

## 6. Event Bus

The panels need to communicate without tight coupling. A simple publish-subscribe bus:

```javascript
// WorkbenchEventBus
const bus = {
  emit(event, data) { ... },
  on(event, handler) { ... },
  off(event, handler) { ... }
};
```

| Event | Payload | Producers | Consumers |
|-------|---------|-----------|-----------|
| `graph-changed` | `{ mutation, graphSnapshot }` | Converse, Import | Tree, Inspector, Status Bar, Auto-save |
| `concept-selected` | `{ conceptIri }` | Tree, Converse (click on concept in log) | Inspector |
| `concept-deselected` | `{}` | Tree (click elsewhere) | Inspector (show graph stats) |
| `export-requested` | `{ format, scope, ersFilter }` | Export panel | ExportEngine |
| `import-staged` | `{ ivneResult }` | Import panel | Import review UI |
| `import-accepted` | `{ concepts[] }` | Import panel (accept button) | StateAdapter, Tree |
| `workspace-switched` | `{ mode: 'converse' \| 'import' \| 'export' }` | Mode switcher | Center panel |
| `graph-loaded` | `{ graphId, name }` | Graph selector | All panels (re-render) |

---

## 7. Migration from Current Demo Site

### 7.1 What Stays

| Component | Disposition |
|-----------|-------------|
| `dist/fandaws.js` bundle | Unchanged — the Workbench is a new consumer of the same bundle |
| CSS design system (colors, typography, card styles) | Reuse. Dark theme, monospace for code, same palette |
| Identity Playground | Move to a "Tools" submenu. Not primary interface, but useful for SMEs exploring normalization |
| Type Factory Explorer | Move to "Tools" submenu. Developer-oriented, not primary |
| Test Results page | Keep as a separate route (`/tests`), linked from header. Not part of main workspace |
| Roadmap page | Keep as separate route (`/roadmap`). Not part of main workspace |

### 7.2 What Goes

| Component | Reason |
|-----------|--------|
| Property Demo (isolated) | Replaced by Converse panel + Inspector (properties visible on selected concept) |
| Description Demo (isolated) | Replaced by Inspector panel (description always visible for selected concept) |
| Relationship Demo (isolated) | Replaced by Converse panel + Inspector |
| Export Demo (isolated) | Replaced by Export workspace mode (operating on live graph) |
| ERS Demo (isolated) | Replaced by Inspector panel (ERS routing visible per-property) |
| IVNE Demo (isolated) | Replaced by Import workspace mode (writing to live graph) |
| Conversation Demo (isolated) | Promoted and enhanced as Converse workspace mode |

### 7.3 Backward Compatibility

The current demo site (`index.html` + `js/app.js`) should remain deployable at its current URL. The Workbench is a new entry point (`workbench.html` or `/workbench/`). Both consume the same `dist/fandaws.js` bundle. The demo site continues to serve its purpose for developer verification — it's just no longer the SME-facing interface.

---

## 8. File Import Pre-Processing

### 8.1 Supported Import Formats

The IVNE compiler currently accepts a parsed JSON representation of OWL axioms. For SME usability, the Workbench needs to accept common ontology file formats and parse them into IVNE's input schema.

| Format | Extension | Parser Strategy |
|--------|-----------|-----------------|
| OWL/XML | `.owl`, `.owx` | XML → DOM → extract axioms → IVNE JSON |
| RDF/XML | `.rdf` | XML → DOM → RDF triples → extract class axioms → IVNE JSON |
| Turtle | `.ttl` | Lightweight Turtle tokenizer → triples → extract class axioms → IVNE JSON |
| JSON-LD | `.jsonld` | `JSON.parse()` → frame for class declarations → IVNE JSON |
| IVNE JSON | `.json` | Direct passthrough (current IVNE Demo format) |

### 8.2 Parser Scope

These are **format translators**, not full OWL parsers. They extract the subset of OWL 2 DL that IVNE supports (P1–P6 axiom patterns). Unsupported constructs are passed through to IVNE's rejection pipeline with appropriate semantic loss records.

**Implementation note:** The Turtle and RDF/XML parsers are the most work. A pragmatic option is to require IVNE JSON for the initial Workbench release and add file format parsers incrementally. The IVNE Demo's textarea already accepts the JSON format, so SMEs who can export their ontology as JSON-LD can use the Workbench immediately.

### 8.3 Recommended Phasing

| Phase | Scope |
|-------|-------|
| Workbench v1 | IVNE JSON and JSON-LD import only. Paste or file upload. |
| Workbench v2 | Add Turtle parser (highest SME demand — most ontology tools export Turtle) |
| Workbench v3 | Add OWL/XML and RDF/XML parsers |

---

## 9. Pipeline Trace Specification

The inline pipeline trace in Converse mode is the key feature that makes the Workbench superior to the isolated demos. It shows the SME what happened under the hood without forcing them to switch contexts.

### 9.1 Trace Structure

For each utterance, the system stores a trace object:

```javascript
{
  utteranceId: string,
  input: string,                    // raw utterance text
  timestamp: ISO datetime,
  parse: {
    subject: string,
    predicate: string,
    object: string,
    verbType: string,
    confidence: number,
    parserImplementation: string    // "regex-nlparser" or "tagteam-js"
  },
  classification: {
    workflow: string,               // "classification" | "property" | "customRelationship"
    routedBy: string                // "classifier"
  },
  ers: {
    register: string,               // "fandaws:register/axiomatic" etc.
    method: string,                  // "structural" | "session-domain" | "fallback"
    trigger: string,                 // BFO IRI or domain label
    flags: string[],                 // ["teleological", "deontic"] etc.
    pipelineSteps: {
      stepName: string,
      result: "match" | "skip" | "no-match",
      detail: string
    }[]
  },
  validation: {
    valid: boolean,
    failures: string[]               // validation error messages if any
  },
  mutation: object,                  // GraphMutation JSON-LD (existing)
  description: string               // DescriptionEngine output for affected concept(s)
}
```

### 9.2 Trace Display

**Collapsed (default):** Single line under system response:
```
⚙ classification → R2 normative (structural/BFO_0000040) ✓ valid
```

**Expanded (click):** Full accordion with parse, classifier, ERS pipeline steps, validator result, mutation JSON-LD, and description output. Same information currently spread across 7 demo tabs, now inline.

---

## 10. What Fandaws Core Needs (Minimal)

The Workbench is a presentation layer, but it requires two capabilities that the core doesn't currently expose:

### 10.1 StateAdapter Serialization (Required)

```javascript
InMemoryStateAdapter.prototype.serialize() → string
InMemoryStateAdapter.deserialize(string) → InMemoryStateAdapter
```

**Why:** IndexedDB persistence. Without this, the graph dies when the browser tab closes.

**Scope:** ~50 lines. Serialize the concept Map as JSON. Deserialize rebuilds indices using existing `_rebuildIndices()` logic (or equivalent).

**Forward-compatible:** Phase 11 (Session Lifecycle) will need exactly this. Building it now de-risks Phase 11.

### 10.2 Graph Snapshot Event Hook (Required)

```javascript
stateAdapter.onMutation(callback: (mutation) => void)
```

**Why:** The event bus needs to know when the graph changes so panels can update. Currently, `applyMutation()` returns the result but doesn't notify observers.

**Scope:** ~10 lines. Add a listener array to InMemoryStateAdapter, call listeners after successful `applyMutation()`.

**Forward-compatible:** Any reactive UI needs this. It's an oversight that it doesn't exist yet.

### 10.3 IVNE → StateAdapter Bridge (Required)

Currently, IVNE produces an `OntologyImportResult` with compiled concepts in its own format (`fandaws:Concept` with `fandaws:canonicalLabel`, `fandaws:displayLabel`, etc.). The StateAdapter expects concepts created via `createConcept()` factory with the standard schema (`rdfs:label`, `skos:prefLabel`, `skos:broader`, etc.).

**A bridge function is needed:**

```javascript
function commitIvneResult(importResult, stateAdapter) {
  // For each compiled concept in importResult.concepts:
  //   1. Map IVNE concept schema → createConcept() parameters
  //   2. Call stateAdapter.applyMutation() with the appropriate GraphMutation
  //   3. Handle parent ordering (parents must exist before children)
  // Returns: { committed: number, skipped: number, errors: string[] }
}
```

**Scope:** ~100–150 lines. The mapping is mechanical — field names differ between IVNE output and core types, but the data is semantically identical.

**Forward-compatible:** Any system that imports external ontologies (Phase 12 Federation, Phase 14 Ecosystem) needs exactly this bridge.

---

## 11. Implementation Phasing

### Workbench v0.1 — "It Works" (1 sprint)

**Goal:** SMEs can converse, see the graph update, inspect concepts, and export.

- Three-panel layout (tree, converse, inspector)
- Single in-memory graph (no persistence yet — same as current demo, but unified)
- Converse panel wired to shared StateAdapter
- Tree panel rendering from StateAdapter indices
- Inspector panel showing concept detail on click
- Export panel reading from shared StateAdapter
- Status bar with live stats
- Core requirement: `onMutation()` hook on StateAdapter

### Workbench v0.2 — "It Remembers" (1 sprint)

**Goal:** SMEs can close the browser and come back to their graph.

- IndexedDB persistence layer
- Core requirement: `serialize()` / `deserialize()` on StateAdapter
- Auto-save on mutation (debounced)
- Graph selector in header (multiple named graphs)
- New/open/delete graph lifecycle
- Session conversation log persistence

### Workbench v0.3 — "It Imports" (1 sprint)

**Goal:** SMEs can upload an OWL ontology and see it in their graph.

- Import workspace mode
- IVNE JSON and JSON-LD file upload
- Import staging UI (review before commit)
- Core requirement: IVNE → StateAdapter bridge function
- Fidelity score and semantic loss display
- IRI mapping table

### Workbench v0.4 — "It's an App" (1 sprint)

**Goal:** SMEs can install it and use it offline.

- Service worker with precache
- Web app manifest
- Install prompt
- Turtle file import parser
- Pipeline trace inline display in Converse mode

### Workbench v0.5 — "It's Polished" (1 sprint)

**Goal:** SMEs are comfortable recommending it to colleagues.

- Mobile responsive layout
- Drag-and-drop reparenting in tree
- OWL/XML and RDF/XML import parsers
- Light theme option
- Keyboard shortcuts (Ctrl+Enter to send utterance, Ctrl+E to export, etc.)
- Graph duplication
- Full JSON-LD graph snapshot export/import (backup/restore)

---

## 12. What This Means for the Demo Site

The existing demo site remains as-is at its current URL. It continues to serve three audiences:

1. **Developers** verifying individual module behavior
2. **Reviewers** (like this stakeholder review process) examining phase deliveries
3. **Documentation** — each demo tab is a living specification of its module's behavior

The Workbench is a separate deployment (`/workbench/` or `workbench.html`) that links back to the demo site for "see how this works under the hood" deep-dives. The Workbench header could include a "Developer View" link that opens the corresponding demo tab for the currently-selected concept or workflow.

---

## 13. Open Questions for Dev Team

### Q1: State Adapter Extension Strategy

Should `serialize()` / `deserialize()` and `onMutation()` be added directly to `InMemoryStateAdapter`, or should we create a `PersistentStateAdapter` wrapper that decorates the existing adapter? The wrapper approach avoids modifying a module with 93 existing tests, but adds indirection.

**Recommendation:** Direct addition. The methods are natural extensions of the adapter's responsibilities, and the 93 tests won't break (new methods, no changes to existing behavior).

### Q2: IVNE Bridge Ownership

Should the IVNE → StateAdapter bridge live in IVNE code (`src/ivne/bridge.js`), in a new Workbench-specific module (`src/workbench/ivne-bridge.js`), or in a shared integration layer (`src/integration/ivne-state-bridge.js`)?

**Recommendation:** `src/integration/ivne-state-bridge.js`. It's not specific to IVNE internals or to the Workbench UI — it's a general-purpose adapter between two Fandaws subsystems.

### Q3: Conversation Log Schema

Should the conversation log store raw utterances + system responses (simple), or full pipeline traces per utterance (rich)? Rich traces enable the inline pipeline trace display but consume more IndexedDB space.

**Recommendation:** Rich traces. An ontology session with 500 utterances at ~2KB per trace is ~1MB — trivial for IndexedDB. The traces are the primary diagnostic tool for SMEs trying to understand why the system made a particular routing or validation decision.

### Q4: Graph Export as JSON-LD Snapshot

Should the "full graph export" be the same as ExportEngine Turtle/SKOS/OWL output, or should it be a Fandaws-internal JSON-LD snapshot (including indices, ERS routing records, provenance chains) that can be re-imported losslessly?

**Recommendation:** Both. ExportEngine formats are for interoperability with external tools. The JSON-LD snapshot is for backup/restore and sharing between Fandaws Workbench instances. The snapshot is essentially the IndexedDB record serialized as a downloadable file.

### Q5: How Should the Workbench Handle the Description Demo Limitations?

The DescriptionEngine has known limitations ("an University", "a Hour") that the current demo site explicitly showcases. In the unified Workbench, these will appear as incorrect descriptions on real concepts the SME is working with. Should we:

- (A) Fix the a/an heuristic before Workbench launch (requires phonetic lookup)
- (B) Show descriptions with a subtle "auto-generated" indicator
- (C) Allow SMEs to manually edit descriptions (override auto-generation)

**Recommendation:** (B) for v0.1, then (C) for v0.3. Manual description override is an important capability — the auto-generated description is a starting point, not gospel. The SME may know that "A University is an Organization" reads correctly in their domain.

---

## 14. Success Criteria

The Workbench is successful when an SME can complete this workflow in a single session without switching tabs, refreshing, or losing state:

1. Create a new named graph ("Maritime Security Ontology")
2. Converse to build initial taxonomy: "A vessel is a conveyance", "A cargo ship is a vessel", "A tanker is a vessel"
3. Add properties: "A vessel has flag state", "A cargo ship has tonnage"
4. See the ERS routing for each property in the Inspector (flag state → R2 normative, tonnage → R2 normative)
5. Import a BFO fragment via IVNE (material entity hierarchy) and see it merge with the existing taxonomy
6. Export the combined graph as Turtle
7. Close the browser
8. Reopen the browser, find "Maritime Security Ontology" in the graph selector
9. Continue working where they left off

Every step in this workflow is already implemented in Fandaws core. The Workbench just wires them together with persistence and a coherent UI.

---

## 15. Estimated Scope

| Component | New Code | Reused from Existing |
|-----------|----------|---------------------|
| Three-panel layout + CSS | ~400 lines HTML/CSS | Dark theme, card styles, typography from current site |
| Graph tree renderer | ~200 lines JS | StateAdapter indices (parent, children) |
| Converse panel | ~150 lines JS | `SynchronousOrchestrationAdapter`, conversation simulation logic from current demo |
| Inspector panel | ~250 lines JS | DescriptionEngine, ERS routing display, JSON-LD rendering from current demos |
| Export panel | ~100 lines JS | ExportEngine, format selector from current Export Demo |
| Import panel | ~200 lines JS | IVNE compiler from current IVNE Demo |
| IVNE → StateAdapter bridge | ~150 lines JS | IVNE output types, StateAdapter mutation API |
| WorkbenchStateManager + event bus | ~150 lines JS | InMemoryStateAdapter |
| IndexedDB layer | ~200 lines JS | New |
| Service worker | ~50 lines JS | New |
| Pipeline trace capture + display | ~200 lines JS | Existing pipeline modules (instrumentation points needed) |
| StateAdapter extensions (serialize, onMutation) | ~80 lines JS | InMemoryStateAdapter |
| **Total new code** | **~2,130 lines** | |
| **Total reused** | | ~15,000+ lines (the entire Fandaws bundle) |

The Workbench is approximately 2,000 lines of new presentation code wiring together 15,000+ lines of existing, tested engine code.
