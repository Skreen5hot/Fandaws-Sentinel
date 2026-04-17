/**
 * PropertyWorkflow — core property attachment logic.
 *
 * Pure function: takes a ClassificationAction (workflow === 'property'),
 * graph snapshot, and indices, and returns a GraphMutation (or prompts/errors).
 * Never touches the StateAdapter.
 *
 * When a user says "A dog has fur," this module:
 *   1. Locates the subject concept ("dog") in the graph
 *   2. Runs scope narrowing to determine the correct attachment level
 *   3. Checks property redundancy at the determined attachment point
 *   4. Builds a GraphMutation adding the owl:Restriction
 *
 * @see Fandaws_v3.3_Specification.md Section 5.3
 */

import { simplify } from '../identity/identity-simplification.js';
import { generateRestrictionIri, generateConceptIri, DEFAULT_SCOPE } from './iri-generator.js';
import { createProperty } from '../../types/property.js';

// Tier 1 "Human Frame" verb IRI for the implicit "has" of "X has Y".
// See architect-to-dev-communication-2026-04-07.md §3 (Progressive Formalization)
// and Ontology Ingestion Spec v1.4 §6.5. Aligned to fandaws:property/ prefix.
const LOCAL_HAS_VERB_IRI = 'fandaws:objectProperty/has';
const LOCAL_HAS_VERB_LABEL = 'has';
import { createGraphMutation } from '../../types/graph-mutation.js';
import { createConversationPrompt } from '../../types/conversation-prompt.js';
import { checkPropertyRedundancy } from '../validator/property-redundancy.js';
import { isRestrictionNode } from '../../types/type-checks.js';
import { buildAncestorChain, narrowScope } from './scope-narrowing.js';
import { resolveConceptByLabel } from './resolve-concept.js';

/**
 * Find all concepts in the graph that match a canonical label.
 *
 * @param {string} canonicalLabel
 * @param {object} graph - KnowledgeGraph
 * @returns {object[]} Matching concept nodes
 */
function findConceptsByCanonical(canonicalLabel, graph) {
  const concepts = graph['fandaws:concepts'] || [];
  return concepts.filter(
    (c) => c['skos:prefLabel'] === canonicalLabel,
  );
}

/**
 * Check whether a concept already has a property with the given label
 * in its rdfs:subClassOf array.
 *
 * After Restriction Structural Correction v1.1, the noun label lives in
 * `fandaws:propertyLabel`. The legacy `owl:onProperty === propertyLabel`
 * branch handles pre-correction fixtures where a bare string was stored.
 *
 * @param {object} concept - Concept node
 * @param {string} propertyLabel - The property label to check
 * @returns {boolean}
 */
function hasPropertyAlready(concept, propertyLabel) {
  const subClassOf = concept['rdfs:subClassOf'] || [];
  return subClassOf.some(
    (entry) =>
      isRestrictionNode(entry) &&
      entry['fandaws:restrictionKind'] === 'property' &&
      (entry['fandaws:propertyLabel'] === propertyLabel ||
        entry['owl:onProperty'] === propertyLabel),
  );
}

/**
 * Build modifications to remove a property from descendant concepts.
 *
 * @param {object[]} descendantRemovals - From checkPropertyRedundancy
 * @param {object} graph - KnowledgeGraph
 * @returns {object[]} Modification entries for the GraphMutation
 */
function buildDescendantRemovalModifications(descendantRemovals, graph) {
  const concepts = graph['fandaws:concepts'] || [];
  const conceptMap = new Map(concepts.map((c) => [c['@id'], c]));
  const modifications = [];

  for (const removal of descendantRemovals) {
    const concept = conceptMap.get(removal.conceptIri);
    if (!concept) continue;

    const subClassOf = concept['rdfs:subClassOf'] || [];
    const filtered = subClassOf.filter(
      (entry) =>
        !(
          isRestrictionNode(entry) &&
          entry['fandaws:restrictionKind'] === 'property' &&
          (entry['fandaws:propertyLabel'] === removal.propertyLabel ||
            entry['owl:onProperty'] === removal.propertyLabel)
        ),
    );

    modifications.push({
      '@id': removal.conceptIri,
      'fandaws:field': 'rdfs:subClassOf',
      'fandaws:value': filtered,
    });
  }

  return modifications;
}

/**
 * Process a property action ("X has Y") and produce a GraphMutation.
 *
 * @param {object} action - ClassificationAction with workflow === 'property'
 * @param {object} graph - KnowledgeGraph snapshot
 * @param {object} indices - { canonicalLabelToIri, iriToParent, iriToChildren }
 * @param {object} [options={}]
 * @param {string} [options.scope] - Scope IRI for deterministic IRI generation
 * @param {string} [options.locale='en'] - BCP 47 locale
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @param {Map<string, boolean>} [options.scopeDecisions] - Accumulated scope narrowing answers
 * @param {boolean} [options.leapCheckEnabled=true] - Use Leap Check optimization
 * @returns {{ mutation: object|null, prompts: object[], scopeContext: object|null, descendantRemovals: object[], error: boolean, errorReason: string|null }}
 */
export function processProperty(action, graph, indices, options = {}, adapter = null) {
  const {
    scope = DEFAULT_SCOPE,
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
    scopeDecisions = new Map(),
    leapCheckEnabled = true,
  } = options;

  const noOp = {
    mutation: null,
    prompts: [],
    scopeContext: null,
    descendantRemovals: [],
    error: false,
    errorReason: null,
  };

  // ── 1. Validate input ──
  if (!action || action['fandaws:workflow'] !== 'property') {
    return { ...noOp, error: true, errorReason: 'invalid-workflow' };
  }

  const rawSubject = action['fandaws:subject'];
  const rawProperty = action['fandaws:object'];

  if (!rawSubject || !rawProperty) {
    return { ...noOp, error: true, errorReason: 'missing-operands' };
  }

  // ── 2. Simplify terms ──
  const simplifyOpts = { locale, abbreviationTable, protectedProperNouns };
  const subjectSimplified = simplify(rawSubject, simplifyOpts);
  const propertySimplified = simplify(rawProperty, simplifyOpts);

  const subjectCanonical = subjectSimplified.canonicalLabel;
  const propertyCanonical = propertySimplified.canonicalLabel;

  // ── 3. Locate subject in graph ──
  let subject = null;

  if (adapter && options.resolvedConceptIri) {
    subject = (graph['fandaws:concepts'] || []).find(
      (c) => c['@id'] === options.resolvedConceptIri,
    ) || null;
  } else if (adapter) {
    const resolution = resolveConceptByLabel(subjectCanonical, graph, adapter, { allowCreate: false });
    if (resolution.ambiguous) {
      const prompt = createConversationPrompt({
        promptType: 'homonymDisambiguation',
        text: `Which "${rawSubject}" do you mean?`,
        options: resolution.ambiguous.map((c) => c['rdfs:label']),
        context: {
          action: 'property',
          candidates: resolution.ambiguous.map((c) => c['@id']),
          allowCreate: false,
          bareLabel: rawSubject,
        },
      });
      return { ...noOp, prompts: [prompt] };
    }
    subject = resolution.resolved || null;
  } else {
    const subjectMatches = findConceptsByCanonical(subjectCanonical, graph);
    if (subjectMatches.length > 1) {
      const prompt = createConversationPrompt({
        promptType: 'disambiguation',
        text: `Multiple meanings found for "${rawSubject}". Which did you mean?`,
        options: subjectMatches.map((c) => c['rdfs:label']),
        context: {
          action: 'property',
          subject: rawSubject,
          property: rawProperty,
          candidates: subjectMatches.map((c) => c['@id']),
        },
      });
      return { ...noOp, prompts: [prompt] };
    }
    subject = subjectMatches[0] || null;
  }

  if (!subject) {
    const prompt = createConversationPrompt({
      promptType: 'disambiguation',
      text: `I don't know what "${rawSubject}" is yet. Please classify it first (e.g., "A ${rawSubject} is a ...").`,
      options: null,
      context: {
        action: 'property',
        subject: rawSubject,
        property: rawProperty,
        reason: 'unknown-subject',
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  // ── importedConceptGuard ──
  // Block direct property additions to imported concepts. Subclasses
  // are the supported extension path.
  if (subject['fandaws:isImported']) {
    const sourceLabel = (subject['fandaws:ingestSource'] || {})['fandaws:sourceVersion'] || 'an imported ontology';
    const prompt = createConversationPrompt({
      promptType: 'importedConceptGuard',
      text: `"${rawSubject}" is an imported concept from ${sourceLabel}. Create a subclass to add properties.`,
      options: null,
      context: {
        action: 'property',
        subject: rawSubject,
        subjectIri: subject['@id'],
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  const subjectIri = subject['@id'];

  // ── 5. Build ancestor chain ──
  const ancestorChain = buildAncestorChain(subjectIri, indices.iriToParent);

  // ── 6. Run scope narrowing ──
  const scopeResult = narrowScope(
    subjectIri,
    ancestorChain,
    propertyCanonical,
    scopeDecisions,
    graph,
    { leapCheckEnabled },
  );

  if (!scopeResult.resolved) {
    return {
      ...noOp,
      prompts: scopeResult.prompts,
      scopeContext: {
        subjectIri,
        propertyLabel: propertyCanonical,
        rawSubject,
        rawProperty,
        ancestorChain,
      },
    };
  }

  const attachmentIri = scopeResult.attachmentIri;

  // ── 7. Idempotency check at attachment point ──
  const attachmentConcept = (graph['fandaws:concepts'] || []).find(
    (c) => c['@id'] === attachmentIri,
  );
  if (attachmentConcept && hasPropertyAlready(attachmentConcept, propertyCanonical)) {
    return noOp; // already has this property at target — no-op
  }

  // ── 8. Resolve property object concept ──
  const propertyConceptMatches = findConceptsByCanonical(propertyCanonical, graph);
  let propertyConceptIri;

  if (propertyConceptMatches.length === 1) {
    propertyConceptIri = propertyConceptMatches[0]['@id'];
  } else if (propertyConceptMatches.length === 0) {
    // Property term not in graph — ask the user to classify it
    const prompt = createConversationPrompt({
      promptType: 'objectResolution',
      text: `I don't know what "${rawProperty}" is yet. Can you tell me? (e.g., "${rawProperty} is a ...")`,
      options: null,
      context: {
        action: 'property',
        pendingSubject: rawSubject,
        pendingProperty: rawProperty,
      },
    });
    return { ...noOp, prompts: [prompt] };
  } else {
    // Defensive: canonicalLabel index guarantees ≤1 match,
    // but guard against future multi-scope scenarios.
    const prompt = createConversationPrompt({
      promptType: 'disambiguation',
      text: `Multiple meanings found for "${rawProperty}". Which did you mean?`,
      options: propertyConceptMatches.map((c) => c['rdfs:label']),
      context: {
        action: 'property',
        subject: rawSubject,
        property: rawProperty,
        candidates: propertyConceptMatches.map((c) => c['@id']),
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  // ── CC Path B: Conversational Consistency Check (FANDAWS v2.1 Section 3.8.2) ──
  // Pre-commit gate: check BFO disjointness between subject and object.
  // If disjoint, fire conversationalConsistencyCheck prompt BEFORE creating
  // any restriction. The user/agent decides whether to proceed.
  if (adapter && !options.consistencyCheckOverride) {
    const subjectBfo = adapter._getBfoCategory
      ? adapter._getBfoCategory(subject, graph['fandaws:concepts'] || [])
      : null;
    const objectConcept = (graph['fandaws:concepts'] || []).find(
      (c) => c['@id'] === propertyConceptIri,
    );
    const objectBfo = (adapter._getBfoCategory && objectConcept)
      ? adapter._getBfoCategory(objectConcept, graph['fandaws:concepts'] || [])
      : null;

    if (subjectBfo && objectBfo && adapter.areDisjoint && adapter.areDisjoint(subjectBfo, objectBfo)) {
      const prompt = createConversationPrompt({
        promptType: 'conversationalConsistencyCheck',
        text: `Warning — type mismatch: "${rawSubject}" (${subjectBfo}) and "${rawProperty}" (${objectBfo}) are in disjoint BFO categories. This assertion would create a structurally invalid triple.`,
        options: ['assert_anyway', 'cancel'],
        context: {
          action: 'property',
          subject: rawSubject,
          object: rawProperty,
          subjectIri,
          objectIri: propertyConceptIri,
          subjectBFO: subjectBfo,
          objectBFO: objectBfo,
          disjoint: true,
        },
      });
      return { ...noOp, prompts: [prompt] };
    }
  }

  // ── 9. Verb-to-property resolution (Section 6.5) ──
  // The verb in "X has Y" is the implicit "has". Look it up in the ingested
  // object-property index by label. If a BFO/CCO property uses "has" as its
  // label, owl:onProperty points at that IRI directly. Otherwise the
  // restriction carries the local fandaws:objectProperty/has placeholder (Tier 1
  // Human Frame — see architect-to-dev §3).
  let verbIri = LOCAL_HAS_VERB_IRI;
  if (adapter && typeof adapter.getIngestedPropertyIndex === 'function') {
    const ingestedIndex = adapter.getIngestedPropertyIndex();
    const verbKey = LOCAL_HAS_VERB_LABEL;
    if (ingestedIndex && ingestedIndex.has(verbKey)) {
      verbIri = ingestedIndex.get(verbKey);
    }
  }

  // ── 10. Check property redundancy at attachment point ──
  const attachmentCanonical = attachmentConcept
    ? attachmentConcept['skos:prefLabel']
    : subjectCanonical;
  const propertyNode = createProperty({
    id: generateRestrictionIri(attachmentCanonical, propertyCanonical, scope),
    verbIri,
    verbLabel: LOCAL_HAS_VERB_LABEL,
    objectConceptIri: propertyConceptIri,
    propertyLabel: propertyCanonical,
    attachedTo: attachmentIri,
    scope: attachmentIri === subjectIri ? 'concept-specific' : 'inherited',
    source: 'user',
  });

  const redundancy = checkPropertyRedundancy(propertyNode, graph);

  if (redundancy.violations.length > 0) {
    return {
      ...noOp,
      error: true,
      errorReason: 'redundancy-violation',
      prompts: redundancy.violations.map((v) =>
        createConversationPrompt({
          promptType: 'confirmation',
          text: v.message,
          options: null,
          context: { violation: v },
        }),
      ),
    };
  }

  // ── 11. Build descendant removal modifications ──
  const descendantMods = buildDescendantRemovalModifications(
    redundancy.descendantRemovals,
    graph,
  );

  // ── 12. Build GraphMutation ──
  const attachmentLabel = (graph['fandaws:concepts'] || []).find(
    (c) => c['@id'] === attachmentIri,
  )?.['rdfs:label'] || attachmentIri;

  const mutation = createGraphMutation({
    additions: [propertyNode],
    modifications: descendantMods,
    reason: `Attach property "${rawProperty}" to "${attachmentLabel}"`,
  });

  // ── 13. Return result ──
  return {
    ...noOp,
    mutation,
    descendantRemovals: redundancy.descendantRemovals,
  };
}
