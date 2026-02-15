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
import { createProperty } from '../../types/property.js';
import { createGraphMutation } from '../../types/graph-mutation.js';
import { createConversationPrompt } from '../../types/conversation-prompt.js';
import { checkPropertyRedundancy } from '../validator/property-redundancy.js';
import { isRestrictionNode } from '../../types/type-checks.js';
import { buildAncestorChain, narrowScope } from './scope-narrowing.js';

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
      entry['owl:onProperty'] === propertyLabel,
  );
}

/**
 * Generate a restriction IRI: fandaws:restriction/{concept-slug}--{property-slug}
 *
 * @param {string} conceptIri - e.g., "fandaws:concept/dog"
 * @param {string} propertyLabel - e.g., "fur"
 * @returns {string}
 */
function generateRestrictionIri(conceptIri, propertyLabel) {
  const conceptSlug = conceptIri.split('/').pop();
  const propertySlug = propertyLabel
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return `fandaws:restriction/${conceptSlug}--${propertySlug}`;
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
          entry['owl:onProperty'] === removal.propertyLabel
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
 * @param {string} [options.locale='en'] - BCP 47 locale
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @param {Map<string, boolean>} [options.scopeDecisions] - Accumulated scope narrowing answers
 * @param {boolean} [options.leapCheckEnabled=true] - Use Leap Check optimization
 * @returns {{ mutation: object|null, prompts: object[], scopeContext: object|null, descendantRemovals: object[], error: boolean, errorReason: string|null }}
 */
export function processProperty(action, graph, indices, options = {}) {
  const {
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
  const subjectMatches = findConceptsByCanonical(subjectCanonical, graph);

  if (subjectMatches.length === 0) {
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

  // ── 4. Disambiguate if multiple subject matches ──
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

  const subject = subjectMatches[0];
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

  // ── 8. Check property redundancy at attachment point ──
  const propertyNode = createProperty({
    id: generateRestrictionIri(attachmentIri, propertyCanonical),
    propertyIri: propertyCanonical,
    attachedTo: attachmentIri,
    scope: attachmentIri === subjectIri ? 'concept-specific' : 'inherited',
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

  // ── 9. Detect property value type ──
  // If the property term matches an existing concept, set owl:hasValue
  const propertyConceptMatches = findConceptsByCanonical(propertyCanonical, graph);
  if (propertyConceptMatches.length === 1) {
    propertyNode['owl:hasValue'] = propertyConceptMatches[0]['@id'];
  }

  // ── 10. Build descendant removal modifications ──
  const descendantMods = buildDescendantRemovalModifications(
    redundancy.descendantRemovals,
    graph,
  );

  // ── 11. Build GraphMutation ──
  const attachmentLabel = (graph['fandaws:concepts'] || []).find(
    (c) => c['@id'] === attachmentIri,
  )?.['rdfs:label'] || attachmentIri;

  const mutation = createGraphMutation({
    additions: [propertyNode],
    modifications: descendantMods,
    reason: `Attach property "${rawProperty}" to "${attachmentLabel}"`,
  });

  // ── 12. Return result ──
  return {
    ...noOp,
    mutation,
    descendantRemovals: redundancy.descendantRemovals,
  };
}
