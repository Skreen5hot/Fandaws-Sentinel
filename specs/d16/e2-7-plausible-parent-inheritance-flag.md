# E2.7 — NA-1.1 Plausible-Parent Inheritance: Three Options + Candidate Scenario

**For:** SME Checkpoint 2, Block 2
**Anticipated by:** Aaron Week 4 clearance memo 2026-04-21
**Surfaced by:** Week 4 Band 5 scaffold implementation
**Decision time budget:** 5 minutes
**Implementation cost of switching:** 10-minute `applyProvisionalInheritance` branch + 1 new AVC scenario

> ✅ **RESOLVED 2026-04-21 (SME async): Option 1.** Scaffold stands as-is. Rationale reframed per SME Annotation 2 (NA-1.2's role clarified below); R4 added per SME Additional Consideration. The AVC scenario `taxonomic-descent-plausible-inheritance-clean` baked with Option 1 assertions is Week 5 work. Document retained as archival record of the option space.

---

## The question

When a parent CAU has a **Plausible** (not Entailed) disposition, how does its axiom-poor child inherit placement under NA-1.1 taxonomic descent? Spec amendment 01 §1 says "inherit" without qualification on parent disposition. Three operationally-distinct semantics fit that wording.

---

## Option 1 — Inherit regardless of parent disposition *(what the Week 4 scaffold implements)*

**Operational behavior.** Child receives parent's `(disposition, bfoCategory)` tuple verbatim, with `validationState: 'provisional'`.

**Evidence record for an axiom-poor child of a Plausible parent:**
```
{
  "disposition": "Plausible",
  "bfoCategory": "bfo:Process",
  "routingMechanism": "na_1_1_inheritance",
  "explanation": {
    "dispositionReason": "Provisionally inherited via taxonomic descent from parent ex:Parent",
    "validationState": "provisional",
    "conflictAnnotation": null,
    "reconciliationHistory": []
  },
  "notRoutedToNotApplicable": true
}
```

**Upside.** Axiom-poor descendants get a starting placement; downstream Phase 2 property alignment has a category to refine against.
**Downside.** If the parent is wrong, the error cascades through the whole subtree. Plausible uncertainty propagates; doesn't attenuate.

## Option 2 — Recompute (Plausible-parent inheritance disallowed)

**Operational behavior.** Child with no horizontal axioms AND a Plausible parent is routed to `NotApplicable` per D1.6-L13 axiom-poor default, NOT inherited. Only Entailed parents propagate.

**Evidence record:**
```
{
  "disposition": "NotApplicable",
  "bfoCategory": null,
  "routingMechanism": "na_1_13_axiom_poor_default",
  "explanation": {
    "dispositionReason": "Axiom-poor child; parent Plausible and therefore not authoritative for inheritance",
    "analystConfirmationRequired": true
  }
}
```

**Upside.** No false propagation. Plausible uncertainty doesn't compound across a subtree.
**Downside.** En masse NotApplicable routing for axiom-poor descendants of Plausible parents; materially expands Plausible Purgatory surface (Advisory 3 concern).

## Option 3 — Inherit disposition, discard bfoCategory hint

**Operational behavior.** Child inherits Plausible disposition (preserving the uncertainty signal) but does NOT inherit the bfoCategory — because the parent's category is only plausibly correct, propagating it as concrete is a type-error.

**Evidence record:**
```
{
  "disposition": "Plausible",
  "bfoCategory": null,
  "routingMechanism": "na_1_1_inheritance_without_category_hint",
  "explanation": {
    "dispositionReason": "Plausible inherited from parent ex:Parent; category intentionally not inherited (parent category non-authoritative)",
    "validationState": "provisional",
    "inheritedFromPlausibleParent": true
  }
}
```

**Upside.** Propagates uncertainty without false specificity; mathematically honest.
**Downside.** Child has no category hint for Phase 2 property alignment to work against; effectively equivalent to "I know I'm uncertain but not about what."

---

## Candidate AVC scenario: `taxonomic-descent-plausible-inheritance-clean`

```json
{
  "id": "taxonomic-descent-plausible-inheritance-clean",
  "band": 5,
  "verifies": ["Rule NA-1.1", "D1.6-L25", "SME decision E2.7"],
  "description": "Axiom-poor child of a Plausible parent inherits per NA-1.1. No NA-1.2 signal conflict fires. This scenario asserts the inherit-regardless-of-parent-disposition semantic (Option 1).",
  "setup": {
    "candidateOntology": "ex:Parent [rich axioms yielding Plausible bfo:Process — multiple candidate matches, no subsumption resolution]; ex:Child rdfs:subClassOf ex:Parent, zero horizontal axioms",
    "parentPriorPlacement": { "disposition": "Plausible", "bfoCategory": "bfo:Process" }
  },
  "trigger": { "type": "evaluateCAU", "cauIRI": "ex:Child" },
  "expect": {
    "disposition": "Plausible",
    "bfoCategory": "bfo:Process",
    "routingMechanism": "na_1_1_inheritance",
    "explanation": {
      "dispositionReason": "Provisionally inherited via taxonomic descent from parent ex:Parent",
      "validationState": "provisional"
    },
    "notRoutedToNotApplicable": true
  }
}
```

**Per-option assertion delta:**

| Field | Option 1 (scaffold) | Option 2 (recompute) | Option 3 (discard-hint) |
|---|---|---|---|
| `disposition` | `Plausible` | `NotApplicable` | `Plausible` |
| `bfoCategory` | `bfo:Process` | `null` | `null` (or field absent) |
| `routingMechanism` | `na_1_1_inheritance` | `na_1_13_axiom_poor_default` | `na_1_1_inheritance_without_category_hint` |
| `notRoutedToNotApplicable` | `true` | `false` (IS NotApplicable) | `true` |

SME's decision picks one column; the scenario bakes that column into the bundle as the authoritative contract.

---

## Cases considered and rejected as options

**R1 — Inherit parent placement AND the parent's unreconciled NC list.** Would require tracking satisfied/unsatisfied NCs through inheritance. **Rejected:** entangles NA-1.1 structural inheritance with NA-1.2 reconciliation. The amendment §1-2 split is intentional — NA-1.1 is structural inheritance, NA-1.2 is signal reconciliation. Fusing them would force reconciliation logic to run during inheritance propagation, which breaks the convergence guarantees established at Week 3: the cascade is bounded because inheritance is a single structural pass. Adding NA-1.2 reconciliation inline would introduce potential reconciliation-oscillation that the convergence argument doesn't cover. (SME clarification 2026-04-21.)

**R2 — Child promoted to Entailed if child's own NCs are satisfied.** **Rejected:** this isn't an inheritance variant; it's the non-inheritance path (independent evaluation) mislabeled. Treating it as an "inheritance option" conflates two concepts. Independent evaluation already runs for children with horizontal axioms via the standard three-state evaluation pipeline.

**R3 — New `validationState: 'hypothesis'` level between `provisional` and `validated_no_conflict`.** **Rejected:** the two-state validation axis is not arbitrary — it maps to the reconciliation-complete vs reconciliation-pending distinction that NA-1.3 (reconciliation cascade) and NA-1.4 (reactive re-evaluation) require. Adding a third state between the two would require rewriting NA-1.3 and NA-1.4's update semantics — a deeper architectural commitment than "amendment expansion." If SME wants finer-grained validation states later, that requires a coordinated revision across NA-1.3 and NA-1.4, not a standalone addition. (SME clarification 2026-04-21.)

**R4 — Inheritance with strengthened provisional flagging for analyst UI.** Idea: Plausible-parent inheritance proceeds exactly as Option 1, but the child's `validationState` becomes `provisional_from_plausible_ancestor` rather than plain `provisional` — creating an analyst-visible trace of the lineage's epistemic status. **Rejected:** this doesn't change the decision logic; it adds a UI surface for analysts to see the inheritance lineage's epistemic status. That's a Workbench v0.2.1 display concern (Weeks 12-13), not a Band 5 reasoning concern. The `reconciliationHistory` field in amendment §4's evidence schema already captures ancestor-provenance; the Workbench surface can render it when v0.2.1 work lands. No change to the reasoning decision. (SME clarification 2026-04-21.)

---

## Recommendation

**Option 1 (scaffold as-is).** Rationale: preserves NA-1.1's operational value for axiom-poor descendants, keeps the inheritance contract uniform across parent dispositions, and treats the Plausible-through-axiom-poor-chain behavior as ontologically correct rather than as a failure mode requiring mitigation.

**On the role of NA-1.2 (reframed per SME 2026-04-21).** NA-1.2 fires at the first descendant whose axioms constitute conflicting signals — that is exactly the point at which correction becomes ontologically warranted. Descendants without conflicting signals continue to inherit because they have no independent standing for independent judgment. A system that broke the cascade or "corrected" it in the absence of evidence would be manufacturing false precision. Plausible cascade through axiom-poor descendants is not a failure mode being mitigated by NA-1.2; it is the system correctly reporting that those descendants inherit the parent's uncertainty because they provide no independent evidence.

**Option 2 rejected.** Materially expands Plausible Purgatory (Advisory 3) and, substantively, would reintroduce exactly the OBO-scale failure mode the amendment was written to fix. In NCBITaxon, mid-level genus classes are often Plausibly placed (axioms underdetermine between Material Entity and Independent Continuant more broadly). Under Option 2, every leaf species below those genera routes to NotApplicable — the en-masse failure the amendment addresses. Option 2 isn't a refinement of the amendment; it's a reversion.

**Option 3 rejected.** Loses the category hint that downstream Phase 2 property alignment needs to work against.

If SME picks Option 2 or Option 3 (neither preferred), the `applyProvisionalInheritance` helper in [src/core/d16/inheritance-cascade.js](../../src/core/d16/inheritance-cascade.js) gets a `parent.disposition === 'Plausible'` branch; ~10 minutes plus scenario authoring.
