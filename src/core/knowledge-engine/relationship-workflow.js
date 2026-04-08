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
import { generateConceptIri, generateRelationshipIri, DEFAULT_SCOPE } from './iri-generator.js';
import { inferBfoCategory } from './bfo-heuristic.js';
import { createConcept } from '../../types/concept.js';
import { createRelationship } from '../../types/relationship.js';
import { createGraphMutation } from '../../types/graph-mutation.js';
import { createConversationPrompt } from '../../types/conversation-prompt.js';
import { normalizeVerb } from '../validator/relationship-validation.js';
import { isRestrictionNode } from '../../types/type-checks.js';
import { resolveConceptByLabel } from './resolve-concept.js';

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
 * @param {string} [options.scope] - Scope IRI for deterministic IRI generation
 * @param {string} [options.locale='en']
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @returns {{ mutation: object|null, prompts: object[], error: boolean, errorReason: string|null, normalizedVerb: string|null }}
 */
export function processRelationship(action, graph, indices, options = {}, adapter = null) {
  const {
    scope = DEFAULT_SCOPE,
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

  // ── 2. Multi-word verb detection (verb-to-property pre-pass) ──
  // The NL parser splits "pet inheres in animal" as
  //   { subject: pet, verb: inheres, object: in animal }
  // If the object starts with a preposition AND "verb + preposition" matches
  // an ingested object property label, treat the preposition as part of the
  // verb and strip it from the object before normalization.
  let effectiveRawVerb = rawVerb;
  let effectiveRawObject = rawObject;
  if (adapter && typeof adapter.getIngestedPropertyIndex === 'function') {
    const ingestedIndex = adapter.getIngestedPropertyIndex();
    const objLower = (rawObject || '').toLowerCase().trim();
    const prepMatch = objLower.match(/^(in|on|of|to|at|by|with|from|into|onto)\s+(.+)$/);
    if (prepMatch && ingestedIndex) {
      const candidate = `${(rawVerb || '').toLowerCase().trim()} ${prepMatch[1]}`;
      if (ingestedIndex.has(candidate)) {
        effectiveRawVerb = `${rawVerb} ${prepMatch[1]}`;
        // Re-extract original-cased object tail from raw input
        const tailStart = rawObject.toLowerCase().indexOf(prepMatch[1]) + prepMatch[1].length;
        effectiveRawObject = rawObject.slice(tailStart).trim();
      }
    }
  }

  // ── 2. Normalize terms ──
  const simplifyOpts = { locale, abbreviationTable, protectedProperNouns };
  const subjectSimplified = simplify(rawSubject, simplifyOpts);
  const objectSimplified = simplify(effectiveRawObject, simplifyOpts);

  const subjectCanonical = subjectSimplified.canonicalLabel;
  const objectCanonical = objectSimplified.canonicalLabel;
  const verb = normalizeVerb(effectiveRawVerb);

  if (!verb) {
    return { ...noOp, error: true, errorReason: 'empty-verb' };
  }

  // ── 3. Locate subject and object in graph ──
  let existingSubject = null;
  let existingObject = null;

  if (adapter) {
    // Subject resolution
    if (options.resolvedSubjectIri) {
      existingSubject = (graph['fandaws:concepts'] || []).find(
        (c) => c['@id'] === options.resolvedSubjectIri,
      ) || null;
    } else {
      const subjectResolution = resolveConceptByLabel(subjectCanonical, graph, adapter, { allowCreate: false });
      if (subjectResolution.ambiguous) {
        const prompt = createConversationPrompt({
          promptType: 'homonymDisambiguation',
          text: `Which "${rawSubject}" do you mean?`,
          options: subjectResolution.ambiguous.map((c) => c['rdfs:label']),
          context: {
            action: 'customRelationship',
            candidates: subjectResolution.ambiguous.map((c) => c['@id']),
            allowCreate: false,
            bareLabel: rawSubject,
          },
        });
        return { ...noOp, prompts: [prompt] };
      }
      existingSubject = subjectResolution.resolved || null;
    }

    // Object resolution
    if (options.resolvedObjectIri) {
      existingObject = (graph['fandaws:concepts'] || []).find(
        (c) => c['@id'] === options.resolvedObjectIri,
      ) || null;
    } else {
      const objectResolution = resolveConceptByLabel(objectCanonical, graph, adapter, { allowCreate: false });
      if (objectResolution.ambiguous) {
        const prompt = createConversationPrompt({
          promptType: 'homonymDisambiguation',
          text: `Which "${rawObject}" do you mean?`,
          options: objectResolution.ambiguous.map((c) => c['rdfs:label']),
          context: {
            action: 'customRelationship',
            candidates: objectResolution.ambiguous.map((c) => c['@id']),
            allowCreate: false,
            bareLabel: rawObject,
          },
        });
        return { ...noOp, prompts: [prompt] };
      }
      existingObject = objectResolution.resolved || null;
    }
  } else {
    // Legacy path: canonical-only lookup
    const subjectMatches = findConceptsByCanonical(subjectCanonical, graph);
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

    existingSubject = subjectMatches.length === 1 ? subjectMatches[0] : null;
    existingObject = objectMatches.length === 1 ? objectMatches[0] : null;
  }

  // ── importedConceptGuard ──
  // Block direct relationship additions to imported concepts. Subclasses
  // are the supported extension path.
  if (existingSubject && existingSubject['fandaws:isImported']) {
    const sourceLabel = (existingSubject['fandaws:ingestSource'] || {})['fandaws:sourceVersion'] || 'an imported ontology';
    const prompt = createConversationPrompt({
      promptType: 'importedConceptGuard',
      text: `"${rawSubject}" is an imported concept from ${sourceLabel}. Create a subclass to add relationships.`,
      options: null,
      context: {
        action: 'customRelationship',
        subject: rawSubject,
        subjectIri: existingSubject['@id'],
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  const subjectIri = existingSubject
    ? existingSubject['@id']
    : generateConceptIri(subjectCanonical, scope);
  const objectIri = existingObject
    ? existingObject['@id']
    : generateConceptIri(objectCanonical, scope);

  // ── Verb-to-property resolution: Progressive Formalization (Section 6.5) ──
  //
  // Fandaws relationships move through three tiers of semantic precision:
  //
  //   Tier 1 — Human Frame (default)
  //     User says "wolf chases elk" or "dog has fur". The verb is a bare
  //     normalized string ("chase", "has"). The restriction's owl:onProperty
  //     gets that bare verb. A reasoner can traverse it but cannot infer
  //     anything beyond "these two things are connected somehow." This is
  //     intentional — the user knows the relationship exists but hasn't
  //     specified the formal OWL predicate.
  //
  //   Tier 2A — Label Match (this block, implemented in Phase A)
  //     If the verb (or "verb + leading preposition", per Step 2) matches an
  //     ingested object property label like BFO's "inheres in" → bfo:BFO_0000197,
  //     the restriction's owl:onProperty gets the source IRI directly. Full
  //     OWL semantics from the source ontology are now reachable.
  //
  //   Tier 2B — Heuristic Enrichment (parked for v0.2)
  //     A future BFO Relationship Classifier examines the BFO categories of
  //     both endpoints (e.g., bearer + role) to upgrade Tier 1 placeholders
  //     to specific BFO properties (bfo:BFO_0000196 / is_bearer_of) without
  //     requiring the user to type the BFO label.
  //
  // The Tier 1 edge is never wrong — it's incomplete. The system progressively
  // completes it as evidence accumulates. See architect-to-dev-communication-2026-04-07.md §3.
  let resolvedVerbIri = verb;
  if (adapter && typeof adapter.getIngestedPropertyIndex === 'function') {
    const ingestedIndex = adapter.getIngestedPropertyIndex();
    const rawKey = (effectiveRawVerb || '').toLowerCase().trim();
    if (rawKey && ingestedIndex && ingestedIndex.has(rawKey)) {
      resolvedVerbIri = ingestedIndex.get(rawKey);
    }
  }

  // ── 6. Generate relationship IRI and check for duplicates ──
  const relIri = generateRelationshipIri(subjectCanonical, verb, objectCanonical, scope);

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
    verbIri: resolvedVerbIri,
    subject: subjectIri,
    object: objectIri,
    subRestrictionOf: parentRelIri,
  });
  // Tag origin for export filtering / fidelity (Section 11.2)
  relNode['fandaws:source'] = 'user';
  relNode['fandaws:verbLabel'] = verb;

  // ── 7. Build mutation based on case ──
  // Skip the label-based BFO heuristic when BFO is ingested — the recompute
  // pass will assign the correct marker after the mutation. The heuristic
  // misclassifies words like "filament" (-ment) as Process.
  const bfoIngested = indices.bfoEquivalenceIndex && indices.bfoEquivalenceIndex.size > 0;
  const inferBfo = (label) => (bfoIngested ? null : inferBfoCategory(label));
  const additions = [relNode];

  // Case C: Both new
  if (!existingSubject && !existingObject) {
    const newSubject = {
      ...createConcept({
        id: subjectIri,
        label: displayLabel(rawSubject),
        prefLabel: subjectCanonical,
        bfoMapping: inferBfo(subjectCanonical),
      }),
      'fandaws:allowRoot': true,
    };
    const newObject = {
      ...createConcept({
        id: objectIri,
        label: displayLabel(rawObject),
        prefLabel: objectCanonical,
        bfoMapping: inferBfo(objectCanonical),
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
        bfoMapping: inferBfo(objectCanonical),
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
        bfoMapping: inferBfo(subjectCanonical),
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
