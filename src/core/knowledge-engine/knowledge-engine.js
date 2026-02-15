/**
 * KnowledgeEngine — core classification logic.
 *
 * Pure function: takes a ClassificationAction, graph snapshot, and indices,
 * and returns a GraphMutation (or prompts/errors). Never touches the StateAdapter.
 *
 * Four mutation cases:
 *   A: Both concepts exist, not linked → modification (set subject.broader)
 *   B: Object exists, subject new → addition (create subject with broader)
 *   C: Both new → additions (create both, object as root with allowRoot)
 *   D: Object new, subject exists → auto-create or negotiate
 *
 * v2.1: Uses standard OWL/SKOS/PROV vocabulary for concept fields.
 *
 * @see v2.1 Concept JSON-LD Specification
 */

import { simplify } from '../identity/identity-simplification.js';
import { generateConceptIri } from './iri-generator.js';
import { createConcept } from '../../types/concept.js';
import { createGraphMutation } from '../../types/graph-mutation.js';
import { createConversationPrompt } from '../../types/conversation-prompt.js';

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
 * Walk from a concept upward through parents, checking for a target IRI.
 * Returns true if targetIri is encountered (circular reference).
 *
 * @param {string} startIri - IRI to start walking from
 * @param {string} targetIri - IRI to look for in the ancestor chain
 * @param {Map<string, string|null>} iriToParent - Parent index
 * @returns {boolean}
 */
function wouldCreateCycle(startIri, targetIri, iriToParent) {
  let current = startIri;
  const visited = new Set();

  while (current != null) {
    if (current === targetIri) return true;
    if (visited.has(current)) return false; // existing cycle, bail
    visited.add(current);
    current = iriToParent.get(current) ?? null;
  }

  return false;
}

/**
 * Process a classification action ("X is a Y") and produce a GraphMutation.
 *
 * @param {object} action - ClassificationAction with workflow === 'classification'
 * @param {object} graph - KnowledgeGraph snapshot
 * @param {object} indices - { canonicalLabelToIri, iriToParent, iriToChildren }
 * @param {object} [options={}]
 * @param {string} [options.graphId] - Graph identifier
 * @param {string} [options.locale='en'] - BCP 47 locale
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @param {boolean} [options.negotiateUnknownParent=false]
 * @returns {{ mutation: object|null, prompts: object[], sessionUpdates: object|null, error: boolean, errorReason: string|null }}
 */
export function processClassification(action, graph, indices, options = {}) {
  const {
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
    negotiateUnknownParent = false,
  } = options;

  const noOp = { mutation: null, prompts: [], sessionUpdates: null, error: false, errorReason: null };

  // ── 1. Validate input ──
  if (!action || action['fandaws:workflow'] !== 'classification') {
    return { ...noOp, error: true, errorReason: 'invalid-workflow' };
  }

  const rawSubject = action['fandaws:subject'];
  const rawObject = action['fandaws:object'];

  if (!rawSubject || !rawObject) {
    return { ...noOp, error: true, errorReason: 'missing-operands' };
  }

  // ── 2. Simplify terms ──
  const simplifyOpts = { locale, abbreviationTable, protectedProperNouns };
  const subjectSimplified = simplify(rawSubject, simplifyOpts);
  const objectSimplified = simplify(rawObject, simplifyOpts);

  const subjectCanonical = subjectSimplified.canonicalLabel;
  const objectCanonical = objectSimplified.canonicalLabel;

  // ── 3. Self-classification check ──
  if (subjectCanonical === objectCanonical) {
    return { ...noOp, error: true, errorReason: 'self-classification' };
  }

  // ── 4. Lookup existing concepts ──
  const subjectMatches = findConceptsByCanonical(subjectCanonical, graph);
  const objectMatches = findConceptsByCanonical(objectCanonical, graph);

  // ── 5. Disambiguation ──
  if (objectMatches.length > 1) {
    const prompt = createConversationPrompt({
      promptType: 'disambiguation',
      text: `Multiple meanings found for "${rawObject}". Which did you mean?`,
      options: objectMatches.map((c) => c['rdfs:label']),
      context: {
        action: 'classification',
        subject: rawSubject,
        object: rawObject,
        candidates: objectMatches.map((c) => c['@id']),
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  if (subjectMatches.length > 1) {
    const prompt = createConversationPrompt({
      promptType: 'disambiguation',
      text: `Multiple meanings found for "${rawSubject}". Which did you mean?`,
      options: subjectMatches.map((c) => c['rdfs:label']),
      context: {
        action: 'classification',
        subject: rawSubject,
        object: rawObject,
        candidates: subjectMatches.map((c) => c['@id']),
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  const existingSubject = subjectMatches[0] || null;
  const existingObject = objectMatches[0] || null;

  const subjectIri = existingSubject
    ? existingSubject['@id']
    : generateConceptIri(subjectCanonical);
  const objectIri = existingObject
    ? existingObject['@id']
    : generateConceptIri(objectCanonical);

  // ── 6. Re-assertion idempotency ──
  if (existingSubject && existingSubject['skos:broader'] === objectIri) {
    return noOp; // already classified — no-op
  }

  // ── 7. Circular check (both exist) ──
  if (existingSubject && existingObject) {
    if (wouldCreateCycle(objectIri, subjectIri, indices.iriToParent)) {
      return { ...noOp, error: true, errorReason: 'circular-classification' };
    }
  }

  // ── 8. Build mutation ──

  // Case A: Both exist, not linked
  if (existingSubject && existingObject) {
    const mutation = createGraphMutation({
      modifications: [
        {
          '@id': subjectIri,
          'fandaws:field': 'skos:broader',
          'fandaws:value': objectIri,
          'skos:broader': objectIri, // dual format for validator cycle check
        },
      ],
      reason: `Classify "${rawSubject}" as "${rawObject}"`,
    });
    return { ...noOp, mutation };
  }

  // Case B: Object exists, subject new
  if (!existingSubject && existingObject) {
    const newSubject = createConcept({
      id: subjectIri,
      label: rawSubject,
      prefLabel: subjectCanonical,
      broader: objectIri,
    });

    const mutation = createGraphMutation({
      additions: [newSubject],
      reason: `Create "${rawSubject}" as child of "${rawObject}"`,
    });
    return { ...noOp, mutation };
  }

  // Case C: Both new
  if (!existingSubject && !existingObject) {
    const newObject = {
      ...createConcept({
        id: objectIri,
        label: rawObject,
        prefLabel: objectCanonical,
      }),
      'fandaws:allowRoot': true,
    };

    const newSubject = createConcept({
      id: subjectIri,
      label: rawSubject,
      prefLabel: subjectCanonical,
      broader: objectIri,
    });

    const mutation = createGraphMutation({
      additions: [newObject, newSubject],
      reason: `Create "${rawObject}" and "${rawSubject}" (IS_A)`,
    });
    return { ...noOp, mutation };
  }

  // Case D: Object new, subject exists
  if (existingSubject && !existingObject) {
    if (negotiateUnknownParent) {
      const prompt = createConversationPrompt({
        promptType: 'disambiguation',
        text: `I don't know what "${rawObject}" is yet. What is "${rawObject}"?`,
        options: null,
        context: {
          action: 'classification',
          subject: rawSubject,
          object: rawObject,
          subjectIri,
          pendingParentLabel: rawObject,
        },
      });
      return {
        ...noOp,
        prompts: [prompt],
        sessionUpdates: {
          state: 'negotiating',
          pendingClassification: {
            subjectIri,
            objectLabel: rawObject,
            objectCanonical: objectCanonical,
          },
        },
      };
    }

    // Auto-create object as root
    const newObject = {
      ...createConcept({
        id: objectIri,
        label: rawObject,
        prefLabel: objectCanonical,
      }),
      'fandaws:allowRoot': true,
    };

    const mutation = createGraphMutation({
      additions: [newObject],
      modifications: [
        {
          '@id': subjectIri,
          'fandaws:field': 'skos:broader',
          'fandaws:value': objectIri,
          'skos:broader': objectIri,
        },
      ],
      reason: `Create "${rawObject}" and classify "${rawSubject}" under it`,
    });
    return { ...noOp, mutation };
  }

  // Should not reach here
  return { ...noOp, error: true, errorReason: 'unexpected-state' };
}
