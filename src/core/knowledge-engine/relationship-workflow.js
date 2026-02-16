/**
 * RelationshipWorkflow — core custom relationship logic.
 *
 * Pure function: takes a ClassificationAction (workflow === 'customRelationship'),
 * graph snapshot, and indices, and returns a GraphMutation (or prompts/errors).
 * Never touches the StateAdapter.
 *
 * Four mutation cases:
 *   A: Both concepts exist → add relationship restriction
 *   B: Subject exists, object new → create object + relationship
 *   C: Both new → create both concepts + relationship
 *   D: Subject new, object exists → create subject + relationship
 *
 * @see Fandaws_v3.3_Specification.md Section 5.4
 */

import { simplify } from '../identity/identity-simplification.js';
import { generateConceptIri, generateRelationshipIri } from './iri-generator.js';
import { createConcept } from '../../types/concept.js';
import { createRelationship } from '../../types/relationship.js';
import { createGraphMutation } from '../../types/graph-mutation.js';
import { createConversationPrompt } from '../../types/conversation-prompt.js';
import { normalizeVerb } from '../validator/relationship-validation.js';
import { isRestrictionNode } from '../../types/type-checks.js';

/**
 * Derive a consistent display label from raw text.
 * Capitalizes the first letter to ensure subject and object
 * labels are treated identically regardless of sentence position.
 *
 * @param {string} raw - Raw parsed term
 * @returns {string}
 */
function displayLabel(raw) {
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

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
 * Search for an existing relationship in the ancestor chain with the
 * same normalized verb, to establish sub-relationship hierarchy.
 *
 * @param {string} subjectIri - Subject concept IRI
 * @param {string} normalizedVerb - Normalized verb form
 * @param {object} graph - KnowledgeGraph
 * @param {object} indices - Graph indices
 * @returns {string|null} Parent restriction IRI if found
 */
function findParentRelationship(subjectIri, normalizedVerb, graph, indices) {
  let current = indices.iriToParent.get(subjectIri);
  while (current) {
    const concept = (graph['fandaws:concepts'] || []).find((c) => c['@id'] === current);
    if (concept) {
      for (const entry of concept['rdfs:subClassOf'] || []) {
        if (
          isRestrictionNode(entry) &&
          entry['fandaws:restrictionKind'] === 'relationship' &&
          normalizeVerb(entry['owl:onProperty']) === normalizedVerb
        ) {
          return entry['@id'];
        }
      }
    }
    current = indices.iriToParent.get(current);
  }
  return null;
}

/**
 * Process a custom relationship action and produce a GraphMutation.
 *
 * @param {object} action - ClassificationAction with workflow === 'customRelationship'
 * @param {object} graph - KnowledgeGraph snapshot
 * @param {object} indices - Graph indices
 * @param {object} [options={}]
 * @param {string} [options.locale='en']
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @returns {{ mutation: object|null, prompts: object[], error: boolean, errorReason: string|null, normalizedVerb: string|null }}
 */
export function processRelationship(action, graph, indices, options = {}) {
  const {
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
  } = options;

  const noOp = {
    mutation: null,
    prompts: [],
    error: false,
    errorReason: null,
    normalizedVerb: null,
  };

  // ── 1. Validate action ──
  if (!action || action['fandaws:workflow'] !== 'customRelationship') {
    return { ...noOp, error: true, errorReason: 'invalid-workflow' };
  }

  const rawSubject = action['fandaws:subject'];
  const rawObject = action['fandaws:object'];
  const rawVerb = action['fandaws:verb'];

  if (!rawSubject || !rawObject || !rawVerb) {
    return { ...noOp, error: true, errorReason: 'missing-operands' };
  }

  // ── 2. Normalize terms ──
  const simplifyOpts = { locale, abbreviationTable, protectedProperNouns };
  const subjectSimplified = simplify(rawSubject, simplifyOpts);
  const objectSimplified = simplify(rawObject, simplifyOpts);

  const subjectCanonical = subjectSimplified.canonicalLabel;
  const objectCanonical = objectSimplified.canonicalLabel;
  const verb = normalizeVerb(rawVerb);

  if (!verb) {
    return { ...noOp, error: true, errorReason: 'empty-verb' };
  }

  // ── 3. Locate subject in graph ──
  const subjectMatches = findConceptsByCanonical(subjectCanonical, graph);

  // ── 4. Locate object in graph ──
  const objectMatches = findConceptsByCanonical(objectCanonical, graph);

  // ── 5. Disambiguation ──
  if (subjectMatches.length > 1) {
    const prompt = createConversationPrompt({
      promptType: 'disambiguation',
      text: `Multiple meanings found for "${rawSubject}". Which did you mean?`,
      options: subjectMatches.map((c) => c['rdfs:label']),
      context: {
        action: 'customRelationship',
        subject: rawSubject,
        verb: rawVerb,
        object: rawObject,
        candidates: subjectMatches.map((c) => c['@id']),
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  if (objectMatches.length > 1) {
    const prompt = createConversationPrompt({
      promptType: 'disambiguation',
      text: `Multiple meanings found for "${rawObject}". Which did you mean?`,
      options: objectMatches.map((c) => c['rdfs:label']),
      context: {
        action: 'customRelationship',
        subject: rawSubject,
        verb: rawVerb,
        object: rawObject,
        candidates: objectMatches.map((c) => c['@id']),
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  const existingSubject = subjectMatches.length === 1 ? subjectMatches[0] : null;
  const existingObject = objectMatches.length === 1 ? objectMatches[0] : null;

  const subjectIri = existingSubject
    ? existingSubject['@id']
    : generateConceptIri(subjectCanonical);
  const objectIri = existingObject
    ? existingObject['@id']
    : generateConceptIri(objectCanonical);

  // ── 6. Generate relationship IRI and check for duplicates ──
  const relIri = generateRelationshipIri(subjectCanonical, verb, objectCanonical);

  // Early duplicate detection: if a relationship with this IRI already exists, reject
  for (const c of graph['fandaws:concepts'] || []) {
    for (const entry of c['rdfs:subClassOf'] || []) {
      if (isRestrictionNode(entry) && entry['@id'] === relIri) {
        return { ...noOp, error: true, errorReason: 'duplicate-relationship' };
      }
    }
  }

  // Check sub-relationship hierarchy (only if subject exists in graph)
  const parentRelIri = existingSubject
    ? findParentRelationship(subjectIri, verb, graph, indices)
    : null;

  const relNode = createRelationship({
    id: relIri,
    verbIri: verb,
    subject: subjectIri,
    object: objectIri,
    subRestrictionOf: parentRelIri,
  });

  // ── 7. Build mutation based on case ──
  const additions = [relNode];

  // Case C: Both new
  if (!existingSubject && !existingObject) {
    const newSubject = {
      ...createConcept({
        id: subjectIri,
        label: displayLabel(rawSubject),
        prefLabel: subjectCanonical,
      }),
      'fandaws:allowRoot': true,
    };
    const newObject = {
      ...createConcept({
        id: objectIri,
        label: displayLabel(rawObject),
        prefLabel: objectCanonical,
      }),
      'fandaws:allowRoot': true,
    };
    additions.unshift(newSubject, newObject);

    return {
      ...noOp,
      normalizedVerb: verb,
      mutation: createGraphMutation({
        additions,
        reason: `Create "${rawSubject}" and "${rawObject}" with relationship "${verb}"`,
      }),
    };
  }

  // Case B: Subject exists, object new
  if (existingSubject && !existingObject) {
    const newObject = {
      ...createConcept({
        id: objectIri,
        label: displayLabel(rawObject),
        prefLabel: objectCanonical,
      }),
      'fandaws:allowRoot': true,
    };
    additions.unshift(newObject);

    return {
      ...noOp,
      normalizedVerb: verb,
      mutation: createGraphMutation({
        additions,
        reason: `Create "${rawObject}" and add relationship "${rawSubject} ${verb} ${rawObject}"`,
      }),
    };
  }

  // Case D: Subject new, object exists
  if (!existingSubject && existingObject) {
    const newSubject = {
      ...createConcept({
        id: subjectIri,
        label: displayLabel(rawSubject),
        prefLabel: subjectCanonical,
      }),
      'fandaws:allowRoot': true,
    };
    additions.unshift(newSubject);

    return {
      ...noOp,
      normalizedVerb: verb,
      mutation: createGraphMutation({
        additions,
        reason: `Create "${rawSubject}" and add relationship "${rawSubject} ${verb} ${rawObject}"`,
      }),
    };
  }

  // Case A: Both exist
  return {
    ...noOp,
    normalizedVerb: verb,
    mutation: createGraphMutation({
      additions,
      reason: `Add relationship "${rawSubject} ${verb} ${rawObject}"`,
    }),
  };
}
