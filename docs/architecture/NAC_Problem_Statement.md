# The Normative-Axiomatic Conflation: A Problem of Human Understanding Inherited by Machines

**Author:** Aaron Damiano
**Organization:** Ontology of Freedom Initiative
**Date:** February 2026
**Status:** Problem Statement v1.1
**Related Specifications:** Fandaws v3.4, IVNE v2.1/v2.4, FNSR DES, IEE

---

## Abstract

A persistent critique of conversational ontology systems — including Fandaws — is their tendency to encode normative claims as definitional axioms, converting statements about what is *typical* of a class into criteria for *membership* in that class. This paper argues that the conflation of normative and axiomatic claims is not a machine defect but a fundamental disorder of human understanding that predates formal knowledge representation by millennia. Humans routinely mistake descriptions of how things *tend to be* for definitions of what things *essentially are*, producing pathological consequences in medicine, law, social identity, and ethics. Knowledge representation systems inherit this disorder from their human operators and, by formalizing it in logical calculi, amplify it into systemic rigidity. The paper defines the problem precisely, traces its manifestations in human thought and institutions, and establishes it as a foundational challenge for any system — human or artificial — that aspires to reason honestly about the nature of things.

---

## 1. The Problem Defined

When a person says "humans have two arms," they are making a claim. But what *kind* of claim? The sentence is grammatically unambiguous and semantically clear. Every competent English speaker understands what it means. And yet the statement is profoundly ambiguous in a way that natural language is not equipped to resolve, because the ambiguity is not linguistic but *ontological*: it concerns the relationship between the claim and the nature of the thing the claim is about.

The statement could mean any of the following:

**Reading 1 (Axiomatic/Definitional):** Having two arms is part of what it *means* to be human. It is a necessary condition for membership in the class. An entity that does not have two arms is, to that extent, not fully human.

**Reading 2 (Normative/Statistical):** Humans *typically* have two arms. The overwhelming majority do. It is the expected developmental outcome. But exceptions exist, and those exceptions do not revoke the humanity of the individuals who exhibit them.

**Reading 3 (Aspirational/Teleological):** The human body plan is *designed for* (or *oriented toward*) two arms. The two-armed state is the telos — the end toward which human development tends. Deviation from the telos is not a definitional failure but a developmental one.

**Reading 3 carries a unique danger that Readings 1, 2, and 4 do not.** It introduces the concept of *purpose* — what a thing is *for*, what it is *meant to be*. In biology, telos might be grounded in evolutionary function and developmental genetics, which at least provides an empirical anchor. But telos generalizes far beyond biology. "Mothers love their children" encodes a telos of motherhood. "Citizens obey the law" encodes a telos of citizenship. "Men provide for families" encodes a telos of masculinity. In every case, the teleological claim smuggles a *value judgment* into what appears to be a *description*. Who defines the telos? In biology, it might be the developmental biologist. In social structures, it is whoever holds the power to declare what a role is *for* — which is to say, it becomes political. A system that encodes teleological claims as a third register does not merely describe the world; it *moralizes* it, implicitly endorsing a vision of how things *ought to be* that may not be shared by all users, all cultures, or all ethical frameworks. This is the Aspirational Danger Zone: the point at which ontology construction becomes indistinguishable from moral legislation. Section 7 addresses the architectural consequences of this danger.

**Reading 4 (Observational/Inductive):** Every human I have personally encountered has had two arms. I am generalizing from my experience. This claim carries no ontological weight whatsoever — it is a report about my sample, not about the nature of humanity.

These four readings are not interchangeable. They differ in logical force, in their tolerance for counterexamples, and in their moral consequences. Reading 1 implies that a one-armed person is ontologically deficient — less than fully human. Reading 2 implies that a one-armed person is statistically unusual but ontologically complete. Reading 3 implies that a one-armed person has experienced a developmental departure from a norm but remains fully oriented toward the human telos. Reading 4 implies nothing about one-armed people at all.

The **Normative-Axiomatic Conflation** (NAC) is the error of treating Reading 2, 3, or 4 as if it were Reading 1 — of converting a claim about what is *typical*, *intended*, or *observed* into a claim about what is *essential*. It is the collapse of the normative into the definitional.

This error is not new. It is not a product of knowledge representation systems, of OWL, of Description Logics, or of artificial intelligence. It is a disorder of human understanding that has manifested across every domain where humans have attempted to define what things are.

---

## 2. The Disorder in Human Thought

### 2.1 Medicine: The Pathologization of Variation

The history of medicine is, in significant part, a history of normative-axiomatic conflation. Medical science establishes norms — ranges of blood pressure, hormone levels, developmental milestones, cognitive baselines — and then treats deviation from those norms as *pathology*. The norm becomes the definition of health, and anything outside the norm becomes disease.

This works reasonably well when the norm tracks a genuine functional threshold (a blood pressure of 200/120 is dangerous regardless of how common it is). But it produces disordered reasoning when the norm is statistical rather than functional. For much of the twentieth century, left-handedness was treated as a developmental abnormality requiring correction — not because left-handedness caused functional impairment, but because right-handedness was the statistical norm and the norm had been conflated with the definition of "correct" manual development. The axiomatic claim was: "humans are right-handed." The corrective practices — forced retraining, binding the left hand — followed logically from the axiom. The axiom was wrong, not because left-handedness is more common than believed, but because handedness is not a definitional property of humanity at all. It is a normative variation within a class whose definition is indifferent to it.

The same pattern recurs in the medicalization of neurodiversity. Conditions such as autism, ADHD, dyslexia, and various cognitive profiles are defined as *disorders* precisely because they deviate from a statistical norm that has been treated as a definitional requirement. The implicit axiom is: "humans process information in manner X." Anyone who processes information differently is, by the logic of the axiom, disordered — not *differently ordered*, but *defectively ordered*. The normative claim (most humans process information this way) has been conflated with the axiomatic claim (processing information this way is constitutive of normal human functioning). The consequences — stigmatization, forced behavioral modification, institutional exclusion — follow directly from the conflation.

### 2.2 Law and Social Policy: The Encoding of Norms as Rules

Legal systems formalize norms into rules, and in doing so, they commit the NAC at institutional scale. Consider the definition of "family" in social policy. For most of the twentieth century, Western legal systems operated on an implicit axiom: "a family consists of a married man and woman with biological children." This was not presented as a statistical observation (most families look like this) or an aspirational claim (families ought to look like this). It was treated as a *definition* — the necessary and sufficient conditions for family-hood. Single-parent households, same-sex partnerships, chosen families, multigenerational households, and childless couples were not merely *unusual* families; they were, within the logic of the system, *not families at all*. Policy followed: tax benefits, inheritance rights, hospital visitation, child custody — all gated on a definition that was, in reality, a norm mistaken for an axiom.

The legal system did not invent this conflation. It inherited it from the broader culture and encoded it in formal rules, which gave it the force of institutional reality. The formalization amplified the error: a cultural norm, once encoded in law, becomes a definitional boundary enforced by the state. The same dynamic occurs in immigration law (definitions of "legitimate" family structures for visa purposes), employment law (definitions of "normal" work capacity for disability determinations), and education policy (definitions of "grade-level" performance for advancement decisions).

### 2.3 Identity and Self-Understanding: The Internalized Norm

The NAC is not only an institutional problem. It operates at the level of individual identity, where it produces what might be called *existential conflation* — the experience of failing to meet a norm and concluding that one has thereby failed to be the thing one is.

A person who cannot run, in a society that treats bipedal locomotion as definitional of humanity, may internalize the axiom and experience their disability not as a variation within human embodiment but as a *deficiency of humanity*. A person who does not experience romantic attraction, in a society that treats pair-bonding as definitional of adult flourishing, may conclude that they are *broken* rather than *differently constituted*. A person who cannot bear children, in a society that treats fertility as definitional of womanhood, may experience infertility not as a medical condition but as an *ontological failure* — a failure to fully instantiate the category to which they belong.

These are not hypothetical cases. They are lived experiences reported across psychological literature, disability studies, and identity research. The mechanism is consistent: a normative claim about what members of a class *typically* do or are is internalized as an axiomatic claim about what members of the class *must* do or be. The individual who deviates from the norm does not conclude "I am an unusual instance of my class." They conclude "I am not a full instance of my class." The conflation produces shame, identity distortion, and in severe cases, existential crisis.

### 2.4 Philosophy: The Perennial Problem

The NAC is not a modern discovery. It is, in significant part, the problem that drove the ancient Greek distinction between *essential* and *accidental* properties — Aristotle's recognition that some properties of a thing are constitutive of what it *is* (its essence, its *ousia*) while others merely happen to accompany it (its accidents, its *symbebekota*). A human's rationality is essential; a human's eye color is accidental. The distinction is easy to state and extraordinarily difficult to apply, because the boundary between essence and accident is not given by observation. No amount of empirical data about humans will tell you whether "having two arms" is essential or accidental. The data can tell you that most humans have two arms. It cannot tell you whether armedness is part of what it *means* to be human.

This is why the problem is hard. It is not a problem of insufficient data or imprecise language. It is a problem of *metaphysical judgment* — a determination about the nature of things that cannot be settled by empirical investigation alone. Reasonable, intelligent, well-informed people disagree about which properties of a class are definitional and which are normative. Is rationality definitional of humanity (Aristotle) or merely typical (empiricists who note that infants and people with severe cognitive disabilities are fully human)? Is DNA definitional of biological life (molecular biologists) or merely a current implementation detail (astrobiologists who consider silicon-based alternatives)? Is consciousness definitional of personhood (most Western philosophical traditions) or an accidental feature of certain types of persons (traditions that recognize non-conscious persons, or future traditions that may recognize artificial persons)?

These are not questions that a knowledge representation system can answer. They are questions that *humans* have not answered — that humans *cannot* answer without making philosophical commitments that go beyond what the empirical evidence supports. The NAC persists in human thought because the distinction between essence and accident requires a form of judgment that natural language does not enforce, empirical science does not provide, and human cognition does not naturally perform.

### 2.5 The Teleological Variant: When Purpose Becomes Definition

Sections 2.1–2.3 trace the NAC in its normative form: confusing what is *typical* with what is *essential*. But there is a distinct and more dangerous variant that operates through Reading 3 — the *Aspirational/Teleological* reading — where the conflation is not between *frequency* and *essence* but between *purpose* and *essence*. This variant deserves separate treatment because its harms are structurally different and its political valence is higher.

The teleological NAC does not say "most X have property P, therefore all X must have P." It says "X is *for* P, therefore X *is* P." The claim is not about what is statistically common but about what is normatively intended — what a thing's *proper function* is. And once a proper function is encoded as a definitional requirement, anyone who fails to fulfill that function is not merely *atypical* (the normative NAC) but *defective* — failing to achieve the purpose for which they exist.

The history of this variant is at least as destructive as the normative form. The claim "women are *for* bearing children" converts a biological capacity into a definitional purpose. A woman who is infertile, who chooses not to bear children, or who cannot become pregnant is not merely unusual; she has *failed her telos*. The claim "citizens are *for* serving the state" converts a political relationship into a definitional obligation. A citizen who dissents, emigrates, or refuses military service has not merely deviated from a norm; they have *betrayed their purpose*. The claim "men are *for* providing" converts a cultural expectation into an ontological role. A man who is unemployed, who is a caregiver, or who earns less than his partner has not merely broken a pattern; he has *failed to be what a man is for*.

In each case, the mechanism is the same: a claim about what something is *oriented toward* (its telos) is treated as a claim about what something *is* (its ousia). The conflation is harder to detect than the normative variant because teleological claims *feel* deeper than statistical ones. "Most humans have two arms" is clearly a frequency claim that admits exceptions. "Humans are *meant to have* two arms" feels like it says something about the *nature* of humanity — about what the human body plan is *designed* for. And that feeling of depth is precisely what makes the teleological NAC dangerous: it presents contingent value judgments with the phenomenological texture of essential truths.

The question for Fandaws is stark: if the system supports an Aspirational register, who supplies the telos? The user? A reference ontology? A particular religious or philosophical tradition? The IEE's twelve-worldview framework? Each answer carries commitments. A system that allows users to encode teleological claims encodes their *values* into the graph — and values, unlike statistical norms, do not have counterexamples that falsify them. You cannot show someone a childless woman and thereby refute the claim "women are for bearing children," because the claim is not empirical; it is normative in the strong sense. The Aspirational register, if implemented, must carry warnings commensurate with this danger — not merely `SemanticLossRecord` annotations but something closer to `WorldviewCommitmentFlag` markers that identify the claim's dependence on a particular evaluative framework. Section 7 addresses this further.

---

## 3. How Machines Inherit the Disorder

### 3.1 The Formalization Amplifier

A knowledge representation system does not create the NAC. It inherits it from the humans who provide its input and, by formalizing it, amplifies its consequences.

When a human user tells a conversational ontology system "humans have two arms," the system faces the same ambiguity described in Section 1. But unlike a human interlocutor — who might pause, ask "do you mean *all* humans?" or internally note the claim as defeasible — the system has no epistemic apparatus for holding the claim in suspension. It has one input pathway and one output format: the claim enters as natural language and exits as a formal axiom. The grammatical structure `{Class} {verb} {property}` maps to the logical structure `Class SubClassOf (Property some Value)` or, worse, `Class SubClassOf (Property exactly n Value)`. The norm becomes an axiom, not because the system chose to conflate them, but because the system's representational vocabulary has no way to express the difference.

The formalization amplifies the error in three ways:

**Rigidity.** A norm, in human thought, is soft. It tolerates exceptions, admits degrees, and can be revised by a single counterexample. An axiom, in a formal system, is hard. It admits no exceptions within the logic. A human who says "humans have two arms" and then encounters a one-armed person can immediately adjust: "well, *most* humans." A formal system that has encoded `Human SubClassOf (has_arm exactly 2 Arm)` cannot adjust without a formal retraction — which may trigger cascading consistency violations across the graph.

**Propagation.** In a reasoning system, axioms propagate. If `Human SubClassOf (has_arm exactly 2 Arm)` is in the graph, then any class that subsumes or intersects Human inherits the constraint. `Athlete SubClassOf Human` now implies athletes have exactly two arms. `Parent SubClassOf Human` implies parents have exactly two arms. The norm-mistaken-for-axiom does not stay local; it infects every downstream classification and inference that touches the class.

**Authority.** A formal ontology carries epistemic authority that a casual human utterance does not. When a person says "humans have two arms," the listener can evaluate the claim against their own judgment. When a knowledge graph contains `Human SubClassOf (has_arm exactly 2 Arm)`, the downstream services that consume the graph — reasoners, validators, ethical evaluation engines — treat it as a given. The OCE checks coherence *against* the axiom. The IEE evaluates ethical implications *on the basis of* the axiom. The DES generates expectations *derived from* the axiom. The norm, once formalized, becomes the ground truth against which all other claims are measured.

### 3.2 The Conversational Trap

The problem is most acute in *conversational* ontology systems — systems like Fandaws where the knowledge graph is built incrementally through natural language dialogue. In these systems, the human user is simultaneously the domain expert and the ontology engineer. They are providing the content (what is true about the world) and the form (how to represent it in the graph). But they are almost never aware that they are doing both.

A trained ontologist, constructing an OWL ontology in Protégé, makes the normative/axiomatic distinction explicitly. They choose between `SubClassOf` (necessary condition) and annotation properties (descriptive metadata). They decide whether a cardinality constraint is `exactly` (definitional) or `min` (existential). They are conscious that each axiom they assert narrows the class's membership criteria. The formal environment forces the distinction because the formal language *has* the distinction.

A conversational user has no such forcing function. They say "humans have two arms" in the same tone, with the same grammar, and with the same confidence as "triangles have three sides." The system receives both claims through the same input pipeline and encodes them in the same representational format. The user has no awareness that they have just made a metaphysical commitment — that they have defined armedness as constitutive of humanity. They made a normative claim. The system heard an axiom.

This is the conversational trap: the very fluency that makes conversational ontology construction accessible to non-specialists is what makes the NAC inevitable. The system is *easy to use* precisely because it does not force the user to distinguish between norms and definitions. But that ease is purchased at the cost of epistemic precision.

---

## 4. The Scope of the Problem

The NAC is not a marginal edge case. It affects the majority of natural language property assertions about biological, social, and cultural classes. Consider a representative sample:

| Claim | Intended Register | Risk if Axiomatized |
|---|---|---|
| "Humans have two arms" | Normative | Amputees and people with limb differences are classified as non-human. |
| "Birds can fly" | Normative | Penguins, ostriches, kiwis, and injured birds are classified as non-birds. |
| "Adults are taller than children" | Normative | A short adult or tall child creates a classification contradiction. |
| "Dogs are loyal" | Aspirational | A feral or aggressive dog is classified as a non-dog. |
| "Mothers love their children" | Aspirational | A mother experiencing postpartum depression or who has abandoned a child is classified as a non-mother. |
| "Doctors help people" | Aspirational | A negligent or criminal doctor is classified as a non-doctor. |
| "Water boils at 100°C" | Conditional | Water at altitude or under pressure violates the axiom. |
| "A year has 365 days" | Normative | Leap years create inconsistency. |
| "Trees have leaves" | Normative | Coniferous trees with needles, deciduous trees in winter, and dead trees are classified as non-trees. |

In every case, the natural language claim is *reasonable* and *understood* by human listeners. No competent speaker would conclude that a penguin is not a bird. But a formal system operating under the axiom `Bird SubClassOf (can_fly value true)` must either (a) classify the penguin as a non-bird, (b) retract the axiom, or (c) maintain an inconsistency in the graph. None of these outcomes matches what the human speaker intended.

The scope of the problem is essentially **every property assertion about any class that admits variation**. The only claims that are safe to axiomatize without risk of NAC are those about classes defined purely by their formal properties: geometric shapes, mathematical structures, logical constants. "A triangle has three sides" is safe because triangularity *is* three-sidedness. "A prime number is divisible only by 1 and itself" is safe because that *is the definition*. For every natural kind, social kind, biological kind, and cultural kind — which is to say, for nearly every concept a conversational ontology system will encounter — the NAC is a live risk.

---

## 5. Why the Problem Resists Simple Solutions

Several apparent solutions suggest themselves. None is sufficient.

### 5.1 "Just Ask the User"

The system could detect property assertions and ask: "Is this a necessary condition for class membership, or a typical property?" This helps, but it transfers the metaphysical burden to a user who may not have the conceptual vocabulary to answer. Most users have never considered whether "having two arms" is essential or accidental to humanity. Asking the question may produce a considered answer, a confused answer, or an impatient "just add it." The question itself presupposes the Aristotelian essence/accident distinction, which not all users share.

### 5.2 "Default to Normative"

The system could treat all property assertions as defeasible defaults unless the user explicitly marks them as definitional. This is safer but produces a weak ontology. If every claim is defeasible, the system cannot distinguish between "triangles have three sides" (genuinely definitional) and "humans have two arms" (genuinely normative). The result is a graph where nothing is certain — where even mathematical definitions are treated as mere tendencies. This undermines the system's utility for any application that requires definitive classification.

### 5.3 "Use Cardinality Ranges"

The system could encode "humans have two arms" as `Human SubClassOf (has_arm min 0 max 2 Arm)` rather than `exactly 2`. This is more tolerant but still wrong: it implies that no human can have *more* than two arms (excluding cases of polymelia) and that having zero arms is within the defined range (which is true but encodes too little information — it doesn't distinguish "zero arms is possible" from "two arms is typical"). The cardinality range is a technical mitigation, not a conceptual solution.

### 5.4 "Let the Ontologist Decide"

In a traditional ontology engineering workflow, a trained ontologist makes these decisions. But Fandaws is not a traditional ontology engineering tool. Its architectural premise is conversational knowledge construction — building ontologies through natural language dialogue, not through formal axiom editing. Requiring a trained ontologist to review every property assertion defeats the purpose of the conversational interface. The system must handle the NAC in its own epistemic pipeline, or it must make the distinction accessible to non-specialists — which brings us back to the challenge of Section 5.1.

### 5.5 "Build Separate Registers"

The most architecturally honest response to the NAC — and the direction this paper ultimately recommends — is to build separate representational registers for axiomatic, normative, and aspirational claims. But intellectual honesty requires acknowledging the costs of this approach, because they are severe.

**UX friction.** If the system must determine which register a claim belongs to, and if linguistic analysis cannot make that determination (Section 1), then the system must either ask the user or apply heuristics. Asking the user breaks conversational flow. A system that responds to "birds fly" with "Is this a definitional requirement or a statistical norm?" has ceased to be a conversational knowledge construction tool and has become an interrogation protocol. The very accessibility that makes Fandaws viable depends on the user being able to speak naturally and have the system *do the right thing*. Register routing threatens to destroy that accessibility.

**Heuristic risk.** The alternative to asking is applying domain heuristics — treating biological property claims as normative-by-default, mathematical property claims as axiomatic-by-default, and social property claims as aspirational-by-default. This reduces UX friction but introduces a different error: the system makes metaphysical judgments silently, on the basis of domain classification rather than conceptual analysis. A heuristic that defaults "birds fly" to normative is correct for penguins but wrong for "triangles have three angles" if the system's domain classifier mistakenly categorizes geometry as a natural kind. And domain classification is itself a form of the NAC: it assumes that the register of a claim is determined by the *domain* of the class, when in reality it is determined by the *nature of the property's relationship to the class*.

**Storage complexity.** Standard OWL 2 DL has no native mechanism for representing defeasible defaults. `SubClassOf` is rigid — it admits no exceptions. Implementing a Normative register requires either (a) reification (storing claims as metadata about claims rather than as first-class axioms), (b) annotation properties (which reasoners ignore), (c) a non-monotonic logic extension (Reiter-style default logic, which no standard OWL reasoner supports), or (d) a parallel representation system that the KnowledgeEngine treats differently from the axiom store. Each option adds complexity to the reasoning pipeline. The IVNE's Dual Representation (P8) is a precedent — it stores cardinality constraints in a "slow lane" that the OCE consumes but the KnowledgeEngine ignores — but extending this pattern to *every property assertion* is a different order of magnitude.

These costs are real. They are not reasons to abandon the register approach, but they are reasons to be honest about what the approach demands. The system that solves the NAC will be more complex, slower, and harder to use than the system that ignores it. The question is whether the cost of ignoring it — silently converting every norm into an axiom, with the consequences catalogued in Sections 2 and 4 — is higher.

---

## 6. The Deeper Issue: Understanding as Such

The NAC resists simple solutions because it is not, at root, a *technical* problem. It is a problem of *understanding* — of how minds (human or artificial) grasp the nature of things.

To correctly classify "humans have two arms" as normative rather than axiomatic requires understanding *what humanity is* — which properties are constitutive and which are contingent. This is not a question that can be answered by examining the sentence, the grammar, the corpus statistics, or the speaker's intent. It is a question about the *nature of the entity being described*, and it requires the kind of judgment that philosophers call *intellectual intuition* — the direct apprehension of essences.

Rudolf Steiner, in *The Philosophy of Freedom*, describes this capacity as *thinking that grasps the concept*. The concept "human" is not a summary of observed properties; it is an *idea* that the mind apprehends through an act of cognition that goes beyond sense experience. When we understand what humanity *is*, we simultaneously understand which properties are essential to it and which are accidental. The person who grasps the concept of humanity *knows* — not through inference but through understanding — that having two arms is not constitutive, because they apprehend humanity as something that transcends any particular bodily configuration.

This is precisely the capacity that a formal system lacks. A knowledge graph has no intellectual intuition. It cannot *grasp concepts*; it can only *store axioms*. It cannot distinguish essential from accidental properties because it has no access to the *idea* of the class — only to the assertions that humans have made about the class. The NAC is, in this sense, a symptom of the fundamental limitation of formal representation: the gap between *knowing what a thing is* and *listing what a thing has*.

### 6.1 What Follows from the Limit

The Steiner limit does not mean the system is helpless. It means the system must be designed with a specific posture: *epistemic humility as an architectural principle*. Three consequences follow.

**First, the system is not permanently dependent on human supervision for every claim.** It is dependent on human judgment for the *initial calibration* of register defaults and domain heuristics. Once a domain expert or ontologist has established that biological property claims about natural kinds are normative-by-default, the system can apply that calibration to thousands of subsequent claims without asking. The human supervision is front-loaded into the heuristic design, not applied to every interaction. The system cannot *grasp* the concept of humanity, but it can *inherit* the judgment of someone who has — encoded as a register default for the class `Human` and its properties.

**Second, the system should get better over time.** Every time a user corrects a register assignment ("no, that's not definitional — most humans have two arms, but not all"), the correction refines the heuristic for that class-property pair. Over many interactions, the system accumulates a corpus of register decisions that function as *precedent*. The APS (Analogical Precedent Service) in the FNSR architecture is designed for exactly this kind of case-based reasoning: when encountering a new property assertion about a biological kind, consult previous register decisions for similar assertions about similar kinds. This is not intellectual intuition. It is pattern matching on the register decisions of people who *have* intellectual intuition. It is, at best, a second-order approximation — but it is a second-order approximation that improves with use.

**Third, when the system does not know, it should say so.** The question for Fandaws is not "how do we solve the NAC?" — because the NAC cannot be solved by any formal system operating on its own. The question is: **how does a system that cannot grasp concepts behave honestly about its inability to do so?** How does it hold natural language claims with appropriate epistemic humility, routing them to the correct representational register while acknowledging that the routing decision may be wrong — and that the ultimate arbiter of that decision is not the system but the understanding that grasps the concept directly?

The answer is: it documents its uncertainty. Just as the IVNE's `SemanticLossRecord` documents what was lost in ontological reduction, the conversational pipeline should emit a `RegisterRoutingRecord` when a claim is assigned to a register by heuristic rather than by explicit user confirmation. The record says: "I treated 'humans have two arms' as normative (Register 2) because biological property claims about natural kinds are normative-by-default in my current configuration. If this is wrong, the user or a domain reviewer can reclassify it." The system is not omniscient. It is transparent about what it does not know. That transparency is itself a form of epistemic honesty — the same principle that governs the IVNE's approach to semantic loss.

This is the architectural challenge that the Fandaws DES, IEE, and conversational pipeline must address. The problem statement is now defined. The solution is the subject of ongoing specification work.

---

## 7. Implications for Fandaws Architecture

This paper does not propose a solution. It establishes the problem as a foundational constraint on any conversational ontology system. The architectural implications are:

1. **The NAC is the default failure mode of conversational knowledge construction.** Any system that accepts natural language property assertions and encodes them as formal axioms will commit the NAC unless it has explicit mechanisms to prevent it. Fandaws currently has no such mechanism for conversationally entered claims (the IVNE's Dual Representation addresses *imported* cardinality only).

2. **The distinction between normative and axiomatic claims is philosophical, not linguistic.** No amount of NLP sophistication will resolve the ambiguity, because the ambiguity is not in the language but in the *nature of the thing described*. The system must either ask the user, apply domain heuristics, or default to one register and document the default. The front-loaded calibration model described in Section 6.1 — where domain experts configure register defaults per class or domain, and the system applies those defaults to subsequent claims — is the most promising compromise between epistemic precision and conversational fluency.

3. **Three epistemic registers must be supported, but with asymmetric safety profiles.** Axiomatic (definitional, necessary), Normative (typical, defeasible), and Aspirational (evaluative, non-descriptive). The current Fandaws pipeline supports only Register 1. Registers 2 and 3 require the DES and IEE respectively. Critically, these registers do not carry equal risk:

   - **Register 1 (Axiomatic)** is dangerous when it contains claims that should be in Register 2. This is the core NAC. The mitigation is to make Register 1 hard to enter by default — requiring explicit confirmation or a domain-level whitelist (mathematics, geometry, formal logic) before a property assertion is encoded as `SubClassOf`.

   - **Register 2 (Normative)** is the safest default for most natural language property assertions. A defeasible default that turns out to be definitional is merely weaker than intended — it produces an ontology that is *too permissive* (admitting exceptions that shouldn't exist) rather than *too restrictive* (excluding instances that should belong). Too-permissive is a lesser harm than too-restrictive.

   - **Register 3 (Aspirational)** is the most dangerous register to automate, for the reasons elaborated in Sections 1 and 2.5. Teleological claims encode *values*, and values masquerading as descriptions can cause the same harms documented in Section 2 — but with the added authority of formal encoding. Register 3 should carry `WorldviewCommitmentFlag` markers identifying the evaluative framework the claim depends on (biological functionalism, a particular religious tradition, a cultural norm, the IEE's twelve-worldview framework). The IEE is the natural custodian of Register 3, as it already operates multi-perspectivally. A claim in Register 3 is not an assertion about the world; it is an assertion about *how a particular evaluative framework sees the world*. The IEE's existing architecture — evaluating claims from multiple worldview perspectives — is designed for exactly this kind of situated evaluation.

4. **Epistemic honesty requires the system to document its routing decisions.** Just as the IVNE's `SemanticLossRecord` documents what was lost in ontological reduction, the conversational pipeline should emit a `RegisterRoutingRecord` when a claim is assigned to a register. The record should include: the claim text, the assigned register, the routing method (explicit user confirmation, domain heuristic, default), the confidence level, and the heuristic or precedent that triggered the assignment. This is not a debugging feature; it is a formal contract — the conversational equivalent of the IVNE's Reduction Manifest.

5. **The system should present register assignments visually, not interrogatively.** The UX concern raised in Section 5.5 is legitimate: asking users to classify every claim breaks conversational flow. The alternative is to *show* rather than *ask*. A visual cue — a dashed edge for normative claims, a solid edge for axiomatic claims, a tinted edge for aspirational claims — communicates the system's register decision without interrupting the dialogue. The user can correct the assignment at any time (by clicking the edge and reclassifying), but the default experience is fluent. The system makes a decision, shows the decision, and trusts the user to correct it if wrong. This is the same pattern the Fandaws semantic firewall already uses for disambiguation: present a best guess, allow correction, and learn from the correction for future encounters.

6. **Domain-level safety classification reduces per-claim overhead.** Not all domains carry equal NAC risk. Classes defined by formal properties (triangles, prime numbers, truth-functional connectives) carry near-zero risk — every property assertion is definitional. Biological natural kinds (humans, birds, trees) carry high normative risk — most property assertions are statistical tendencies. Social and cultural kinds (mothers, doctors, citizens) carry high aspirational risk — many property assertions encode value judgments. A domain safety classification — maintained as a configuration layer, updatable by ontologists and domain experts — allows the system to set appropriate register defaults per domain without interrogating the user for every claim. This is the "Safe Mode List" in practical form: a whitelist of domains where axiomatic encoding is safe, and a default-normative posture for everything else.

7. **The problem is not solvable; it is manageable, and it improves with use.** Humans have not solved the NAC in three thousand years of philosophy. A machine will not solve it either. But a machine that *knows it cannot solve it* — that holds claims with appropriate humility, routes them to registers with documented uncertainty, learns from corrections, and accumulates precedent through the APS — is safer than one that silently converts every norm into an axiom. The system's epistemic honesty about its own limitation is itself a form of competence. And with each corrected routing decision, the system's heuristics improve — not toward omniscience, but toward the practical wisdom of a well-calibrated apprentice who has learned from many teachers what the nature of things requires.

---

## References

- Aristotle. *Metaphysics*, Book Ζ (Zeta). On substance, essence, and accidental properties.
- Steiner, R. (1894). *The Philosophy of Freedom*. On the act of thinking that grasps the concept.
- Smith, B. et al. (2015). "Basic Formal Ontology 2.0." On the distinction between universals, qualities, and dispositions.
- Reiter, R. (1980). "A Logic for Default Reasoning." *Artificial Intelligence*, 13(1-2), 81–132. On non-monotonic reasoning and defeasible defaults.
- Horty, J. F. (2012). *Reasons as Defaults*. On the normative structure of default reasoning.
- Damiano, A. (2026). "IVNE Implementation Specification v2.1." On Dual Representation and SemanticLossRecord as epistemic honesty mechanisms.
- Damiano, A. (2026). "IVNE Companion Theory Paper v2.4." On Restricted Monotonicity and the Entailment Loss Boundary.
