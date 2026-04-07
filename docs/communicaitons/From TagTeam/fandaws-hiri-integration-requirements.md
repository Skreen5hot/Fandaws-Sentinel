# Fandaws HIRI Integration Requirements for TagTeam.js

**Version**: 2.0
**Date**: 2026-04-06
**From**: TagTeam NLP Team
**To**: Fandaws Graph Team
**Status**: Spec aligned — awaiting Phase F-0 deliverables
**Previous**: v1.0 (2026-03-31) — superseded after Fandaws team review

---

## Revision History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-03-31 | Initial spec — single mixed request |
| 2.0 | 2026-04-06 | Split request into Entity Dictionary + Process Hierarchy + Selectional Restrictions per Fandaws team review. Removed rdfs:domain/range on entity terms. Dropped skos:notation compound flag. Added Role-to-Property mapping. Corrected BFO event-centric architecture description. |

---

## 1. Executive Summary

TagTeam.js is a deterministic semantic parser that converts natural language into BFO/CCO-compliant JSON-LD graphs. It models actions as **BFO Process nodes** (IntentionalAct) with participant roles via `bfo:inheres_in` and `bfo:realized_in` — not as direct Subject→Verb→Object property edges.

Current metrics: Entity F1 93.1%, Role F1 83.0%, ISA corpus 80% pass rate (40 sentences, SHACL-validated).

**What we need from Fandaws**: Three separate TTL exports — an Entity Dictionary, a Process Class Hierarchy, and Selectional Restriction vocabulary — accessible via HIRI content-addressed atoms.

**Expected impact**: Entity typing accuracy from ~85% to ~95%. Role F1 from 83% to ~90%.

---

## 2. What TagTeam Produces Today

For the sentence *"The committee shall review and approve the proposal"*, TagTeam generates:

```
VerbPhrase (Tier 1)          → is_about → DirectiveICE
                                            └─ prescribes → PlanSpecification
                                                              ├─ prescribedAgent → Organization_Committee
                                                              ├─ prescribedPatient → Entity_Proposal
                                                              └─ prescribedActType: "review"
                                            └─ ← is_prescribed_by ─ Obligation
                                                                      ├─ inheres_in → Organization_Committee
                                                                      └─ fulfillmentState: Pending
```

For non-modal sentences, TagTeam produces:
```
IntentionalAct: "arrested"
  AgentRole    → inheres_in → Person_Officer    → realized_in → Act_arrested
  PatientRole  → inheres_in → Person_Suspect    → realized_in → Act_arrested
  LocationRole → inheres_in → Entity_Station    → realized_in → Act_arrested
```

**Key**: Actions are modeled as Process nodes (BFO-compliant event-centric architecture), not as property edges between entities. Role nodes are BFO Roles that inhere in entities and are realized in processes.

---

## 3. What We Need From Fandaws

### 3.1 Entity Dictionary (T-Box + A-Box)

Classes and named individuals with labels for ontology-driven entity type promotion.

| Property | RDF Predicate | Required | Purpose |
|----------|--------------|----------|---------|
| **Canonical label** | `rdfs:label` | Yes | Primary match target |
| **Alternative labels** | `skos:altLabel` | Yes | Acronyms, abbreviations, inflected forms |
| **BFO/CCO type** | `rdf:type` | Yes | Entity classification |
| **Superclass chain** | `rdfs:subClassOf` | Yes | Type inference and hierarchy walking |

**Example — T-Box (Class):**
```turtle
# Government Organization — use CCO 2.0 opaque IRIs, not human-readable CURIEs
cco:ont00001263 rdf:type owl:Class ;
    rdfs:subClassOf cco:ont00001180 ;     # Organization
    rdfs:label "Government Organization"@en .
```

**Example — A-Box (Named Individual):**
```turtle
hiri:abc123def456 rdf:type owl:NamedIndividual , cco:ont00001263 ;
    rdfs:label "Centers for Medicare & Medicaid Services"@en ;
    skos:altLabel "CMS"@en , "Centers for Medicare"@en .
```

**CCO 2.0 IRI Reference** (verified from published CCO OWL):

| Human Name | CCO 2.0 Opaque IRI |
|-----------|-------------------|
| Person | `cco:ont00001262` |
| Organization | `cco:ont00001180` |
| Agent | `cco:ont00001017` |
| IntentionalAct | `cco:ont00000228` |
| Artifact | `cco:ont00000995` |
| InformationContentEntity | `cco:ont00000958` |
| InformationBearingEntity | `cco:ont00000253` |
| Act | `cco:ont00000005` |
| Role | `bfo:BFO_0000023` |

**Note**: Entity terms do NOT carry `rdfs:domain` or `rdfs:range`. Those properties belong exclusively on object properties, not on classes or individuals.

### 3.2 Process Class Hierarchy

The Act/Process subtree with full `rdfs:subClassOf` chains, enabling TagTeam to classify verb lemmas into BFO-compliant process types.

| Property | RDF Predicate | Required | Purpose |
|----------|--------------|----------|---------|
| **Class label** | `rdfs:label` | Yes | Verb lemma matching |
| **Alternative labels** | `skos:altLabel` | Yes | Inflected forms ("provided", "providing") |
| **Superclass chain** | `rdfs:subClassOf` | Yes | Act classification hierarchy |

**Example:**
```turtle
# Act of Transfer — CCO 2.0 opaque IRIs
cco:ont00000387 rdf:type owl:Class ;
    rdfs:subClassOf cco:ont00000228 ;     # IntentionalAct
    rdfs:label "Act of Transfer"@en ;
    skos:altLabel "transfer"@en , "provide"@en , "deliver"@en .
```

### 3.3 Selectional Restriction Vocabulary

OWL restrictions on Process classes that declare the allowed BFO types for participants. This enables top-down validation of bottom-up role assignments.

| Property | RDF Predicate | Purpose |
|----------|--------------|---------|
| **Agent type** | `cco:has_agent_type` | What BFO class can perform this act |
| **Patient type** | `cco:has_patient_type` | What BFO class this act is performed on |

**Example:**
```turtle
# Selectional restrictions on Act of Transfer — CCO 2.0 opaque IRIs
cco:ont00000387 rdf:type owl:Class ;
    cco:has_agent_type cco:ont00001017 ;    # Agent
    cco:has_patient_type cco:ont00000958 .  # InformationContentEntity
```

When TagTeam's parser assigns AgentRole to an entity, it can validate: "Is this entity's type a subclass of `cco:ont00001017` (Agent)?" If not, the role assignment may be incorrect.

### 3.4 Role-to-Property Mapping

Fandaws will provide a supplementary mapping dictionary that aligns NLP semantic roles to their correct CCO/BFO object properties. This ensures TagTeam emits ontologically correct edges.

| NLP Role | BFO/CCO Property | Verified IRI | Status in TagTeam |
|----------|-----------------|-------------|-------------------|
| AgentRole | `has_agent` | `cco:ont00001833` | In @context |
| RecipientRole | `has_recipient` | `cco:ont00001922` | In @context |
| PatientRole / ThemeRole / InstrumentRole | `has_participant` | `obo:BFO_0000057` | In @context |
| LocationRole | `occurs_in` | `obo:BFO_0000066` | **Not yet in @context** |
| Obligation/Disposition bearer | `inheres_in` | `obo:BFO_0000197` | In @context |
| Role realization | `realized_in` | `obo:BFO_0000054` | In @context |
| Role bearing (inverse) | `is_bearer_of` | `obo:BFO_0000196` | In @context |

**Design rationale** (per Fandaws team correction, 2026-04-06):
- CCO provides specific properties only for Agent (`has_agent`) and Recipient (`has_recipient`)
- Patient, Theme, and Instrument all use the generic BFO `has_participant` (`BFO_0000057`) — CCO does not define separate `has_patient` or `has_instrument` properties
- Location uses BFO `occurs_in` (`BFO_0000066`), not a CCO-specific `has_site`
- `inheres_in` uses `BFO_0000197` (CCO 2.0 numbering), not `BFO_0000052` (BFO 2.0 OWL numbering) — CCO renumbered this property

**Action required**: TagTeam must add `occurs_in` (`obo:BFO_0000066`) to the @context before Phase F-2.

**Dual emission**: TagTeam will emit both:
1. **Role nodes** (BFO pattern): `Role → inheres_in → Entity, realized_in → Act` — carries parse confidence
2. **Direct edges** (CCO pattern): `Act → cco:has_agent → Entity` — consumable by OWL reasoners without traversing intermediaries

---

## 4. Build-Time Compilation

TagTeam compiles Fandaws TTL exports into two artifacts shipped with the bundle:

```
Fandaws TTL files
    │
    ▼  TagTeam Compiler Script
    │
    ├── bloom-filter.bin (~225KB)
    │     Every rdfs:label + skos:altLabel → hashed
    │     Purpose: instant "might exist" check at parse time
    │
    └── core-vocabulary.json (~500KB)
          Top 2,000 terms by frequency
          { hiri, label, altLabels[], type, superclassChain[] }
          Purpose: covers ~80% of lookups without network
```

## 5. Runtime Lookup

```
1. Parse sentence (15ms) → extract entity candidates

2. Bloom filter check (<1ms per term):
   "CMS"     → MAYBE (check cache)
   "records"  → NO (common noun, skip)

3. Cache / core-vocabulary lookup (<1ms):
   "CMS" → HIT: { type: GovernmentOrganization, hiri: "hiri:abc123..." }

4. IPFS fetch (50-200ms, cache miss only):
   Unknown term → fetch HIRI atom → cache result

5. Enrich graph:
   - Tier 2 type: cco:ont00001263 / Government Organization (not guessed "Entity")
   - Role validation: has_agent_type = cco:ont00001017 (Agent) → CMS is Agent ✓
```

---

## 6. Domain Coverage Priority

| Priority | Domain | Estimated Terms |
|----------|--------|----------------|
| 1 | **US Government** — agency names, acronyms | ~500 |
| 2 | **Legal/Regulatory** — agreement types, compliance terms | ~2,000 |
| 3 | **Healthcare** — programs, conditions, procedures | ~5,000 |
| 4 | **General** — common nouns with BFO type annotations | ~50,000 |

Priorities 1-2 are needed for the ISA corpus to reach 90%+.

---

## 7. Integration Timeline

| Phase | What | Who | Dependency |
|-------|------|-----|------------|
| **F-0** | Fandaws exports Priority 1-2 TTL files (Entity Dictionary + Process Hierarchy + Selectional Restrictions) | Fandaws | — |
| **F-1** | TagTeam builds compiler (TTL → bloom + core vocab) | TagTeam | F-0 |
| **F-2** | TagTeam adds CCO direct edges to Act nodes (`has_agent`, `has_patient`, `has_instrument`, `has_site`) | TagTeam | F-0 (for IRI confirmation) |
| **F-3** | Wire entity type promotion from Fandaws dictionary | TagTeam | F-1 |
| **F-4** | Wire selectional restriction validation into role mapper | TagTeam | F-1 |
| **F-5** | Domain manifests + production tuning | Both | F-3, F-4 |

**F-0 is the critical dependency.** TagTeam cannot begin F-1 without TTL files from Fandaws.

---

## 8. Validation Criteria

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| Entity typing accuracy | ~85% | ≥95% | Spot-check 100 entities |
| Role F1 | 83.0% | ≥90% | Gold evaluation (200 sentences) |
| ISA corpus pass rate | 80% | ≥90% | 40 SHACL-validated sentences |
| NER boundary accuracy | 93.1% | ≥95% | Entity fragmentation tests |
| Latency (sync) | 15ms | <25ms | p50 with bloom+cache |

---

## 9. TagTeam Action Items (Pre-Fandaws)

Before Phase F-0 deliverables arrive, TagTeam will:

1. **Add `occurs_in` to @context**: Map to `obo:BFO_0000066` — the only missing property after Fandaws IRI clarification. Agent, Recipient, Participant, inheres_in, realized_in are already present.
2. **Emit dual pattern**: Role nodes (for parse confidence) + BFO/CCO direct edges on IntentionalAct nodes (for OWL reasoner consumption): `has_agent`, `has_participant`, `has_recipient`, `occurs_in`
3. **Build compiler scaffolding**: TTL → bloom filter + core vocabulary JSON (can be tested with constitution.ttl)

---

## 10. Contact

- **Repository**: `github.com/Skreen5hot/TagTeam.js` (branch: `dev`)
- **Key files**: `src/graph/SemanticGraphBuilder.js`, `src/ontology/OntologyTextTagger.js`
- **Test runner**: `dist/isa-test-runner-cms-dhs.html` (40-sentence ISA corpus)
- **Spec**: `docs/development/PLANNED_WORK.md` v3.0
- **Developer Guide**: `docs/guides/DEVELOPER_GUIDE.md`
