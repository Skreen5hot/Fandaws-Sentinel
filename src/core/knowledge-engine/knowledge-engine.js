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
import { generateConceptIri, DEFAULT_SCOPE } from './iri-generator.js';
import { inferBfoCategory, inheritBfoCategory, buildBfoCategoryPrompt } from './bfo-heuristic.js';
import { computeProximity, quickProximityCheck } from './proximity.js';
import { createConcept } from '../../types/concept.js';
import { createGraphMutation } from '../../types/graph-mutation.js';
import { createConversationPrompt } from '../../types/conversation-prompt.js';
import { resolveConceptByLabel } from './resolve-concept.js';
import {
  detectReclassificationCase,
  computeLostProperties,
  buildReclassificationConsequencePrompt,
} from './reclassification-consequences.js';

/**
 * Build the reclassification modifications for a single concept: rewrite
 * skos:broader AND swap the corresponding non-restriction string entry in
 * rdfs:subClassOf.  BFO marker entries are NOT touched — the recompute
 * pass handles those separately.
 *
 * @param {object} concept - Concept node
 * @param {string} oldParentIri - Current skos:broader value
 * @param {string} newParentIri - Target parent IRI
 * @returns {object[]} One or two modification entries for a GraphMutation
 */
function buildReclassifyModifications(concept, oldParentIri, newParentIri) {
  const modifications = [
    {
      '@id': concept['@id'],
      'fandaws:field': 'skos:broader',
      'fandaws:value': newParentIri,
      'skos:broader': newParentIri, // dual format for validator cycle check
    },
  ];

  // Swap the parent's string entry in rdfs:subClassOf.
  // Walk the array, replace the first bare-string match for oldParentIri
  // with newParentIri.  Restrictions and BFO markers are untouched.
  const oldSubClassOf = concept['rdfs:subClassOf'] || [];
  let replaced = false;
  const newSubClassOf = oldSubClassOf.map((entry) => {
    if (!replaced && typeof entry === 'string' && entry === oldParentIri) {
      replaced = true;
      return newParentIri;
    }
    return entry;
  });
  // If the old parent wasn't present as a string entry (edge case: root
  // concepts, or data that was never synced), append the new parent.
  if (!replaced && newParentIri) {
    newSubClassOf.push(newParentIri);
  }
  modifications.push({
    '@id': concept['@id'],
    'fandaws:field': 'rdfs:subClassOf',
    'fandaws:value': newSubClassOf,
  });

  return modifications;
}

/**
 * Find the display label for a concept by IRI (linear scan).
 * No IRI→label index exists in the current architecture.
 *
 * @param {string} iri
 * @param {object} graph - KnowledgeGraph
 * @returns {string} Display label or IRI fallback
 */
function findLabelForIri(iri, graph) {
  const c = (graph['fandaws:concepts'] || []).find((n) => n['@id'] === iri);
  return c ? (c['rdfs:label'] || c['skos:prefLabel'] || iri) : iri;
}

/**
 * Find all concepts in the graph that match a canonical label.
 *
 * @param {string} canonicalLabel
 * @param {object} graph - KnowledgeGraph
 * @returns {object[]} Matching concept nodes
 */
export function findConceptsByCanonical(canonicalLabel, graph) {
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
 * @param {string} [options.scope] - Scope IRI for deterministic IRI generation
 * @param {string} [options.locale='en'] - BCP 47 locale
 * @param {Record<string, string>} [options.abbreviationTable={}]
 * @param {string[]} [options.protectedProperNouns=[]]
 * @param {boolean} [options.negotiateUnknownParent=false]
 * @returns {{ mutation: object|null, prompts: object[], sessionUpdates: object|null, error: boolean, errorReason: string|null }}
 */
export function processClassification(action, graph, indices, options = {}, adapter = null) {
  const {
    scope = DEFAULT_SCOPE,
    locale = 'en',
    abbreviationTable = {},
    protectedProperNouns = [],
    negotiateUnknownParent = false,
    reclassificationConfirmed,
    proximityThreshold = 3,
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
  //
  // "A table is a table" is trivially true — no structural change possible.
  // Treat as a silent no-op (machine-first, human-validate) rather than an
  // engine error so the user is not shown an error for a well-formed
  // (if pointless) utterance.
  if (subjectCanonical === objectCanonical) {
    return noOp;
  }

  // ── 4. Lookup existing concepts ──
  let existingSubject = null;
  let existingObject = null;

  if (adapter) {
    // When adapter is provided, use resolveConceptByLabel with hidden-label fallback.
    // resolvedConceptIri bypasses resolution (user already selected from disambiguation).
    if (options.disambiguationAction === 'create_new') {
      // "Neither — new concept" path: pick any existing homonym as reference.
      // existingSubject is needed so Case A fires and the new_concept handler runs.
      const subjectResolution = resolveConceptByLabel(subjectCanonical, graph, adapter, { allowCreate: true });
      existingSubject = subjectResolution.ambiguous?.[0] || subjectResolution.resolved || null;
    } else if (options.resolvedConceptIri) {
      existingSubject = (graph['fandaws:concepts'] || []).find(
        (c) => c['@id'] === options.resolvedConceptIri,
      ) || null;
    } else {
      const subjectResolution = resolveConceptByLabel(subjectCanonical, graph, adapter, { allowCreate: true });
      if (subjectResolution.ambiguous) {
        const prompt = createConversationPrompt({
          promptType: 'homonymDisambiguation',
          text: `Which "${rawSubject}" do you mean?`,
          options: subjectResolution.ambiguous.map((c) => c['rdfs:label']),
          context: {
            action: 'classification',
            candidates: subjectResolution.ambiguous.map((c) => c['@id']),
            allowCreate: true,
            bareLabel: rawSubject,
          },
        });
        return { ...noOp, prompts: [prompt] };
      }
      existingSubject = subjectResolution.resolved || null;
    }

    const objectResolution = resolveConceptByLabel(objectCanonical, graph, adapter, { allowCreate: false });
    if (objectResolution.ambiguous) {
      const prompt = createConversationPrompt({
        promptType: 'homonymDisambiguation',
        text: `Which "${rawObject}" do you mean?`,
        options: objectResolution.ambiguous.map((c) => c['rdfs:label']),
        context: {
          action: 'classification',
          candidates: objectResolution.ambiguous.map((c) => c['@id']),
          allowCreate: false,
          bareLabel: rawObject,
        },
      });
      return { ...noOp, prompts: [prompt] };
    }
    existingObject = objectResolution.resolved || null;
  } else {
    // Legacy path: no adapter, canonical-only lookup
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

    existingSubject = subjectMatches[0] || null;
    existingObject = objectMatches[0] || null;
  }

  const subjectIri = existingSubject
    ? existingSubject['@id']
    : generateConceptIri(subjectCanonical, scope);
  const objectIri = existingObject
    ? existingObject['@id']
    : generateConceptIri(objectCanonical, scope);

  // ── importedConceptGuard ──
  // The subject of the classification is being modified (its skos:broader
  // would change). If it's an imported concept, block — users must create
  // a subclass instead. Allowed: classifying a USER concept under an
  // imported parent (object can be imported).
  if (existingSubject && existingSubject['fandaws:isImported']) {
    const sourceLabel = (existingSubject['fandaws:ingestSource'] || {})['fandaws:sourceVersion'] || 'an imported ontology';
    const prompt = createConversationPrompt({
      promptType: 'importedConceptGuard',
      text: `"${rawSubject}" is an imported concept from ${sourceLabel}. Create a subclass to add to it.`,
      options: null,
      context: {
        action: 'classification',
        subject: rawSubject,
        subjectIri: existingSubject['@id'],
      },
    });
    return { ...noOp, prompts: [prompt] };
  }

  // ── 6. Re-assertion idempotency ──
  //
  // Exact-match idempotency only: the user is literally re-typing what is
  // already in skos:broader.  Transitive redundancy ("dog is an animal" when
  // dog's broader is mammal which is under animal) is NOT idempotent — it
  // is a reclassification request (weakening) that should flow through to
  // the Case A consequence detection, which will compute the inheritance
  // loss and prompt the user.  Short-circuiting on transitive redundancy
  // would make the consequence prompt unreachable for every weakening case.
  if (existingSubject && existingSubject['skos:broader'] === objectIri) {
    return noOp; // already classified — exact-match no-op
  }

  // ── 7. Circular check (both exist) ──
  if (existingSubject && existingObject) {
    if (wouldCreateCycle(objectIri, subjectIri, indices.iriToParent)) {
      return { ...noOp, error: true, errorReason: 'circular-classification' };
    }
  }

  // ── 8. Build mutation ──

  // Case A: Both exist, not linked — proximity-gated reclassification
  if (existingSubject && existingObject) {
    // Homonym creation: "Different concept" choice
    if (reclassificationConfirmed === 'new_concept') {
      // Guard: malformed qualifier options.
      // When relabelExisting=false (Nth homonym), existing qualifier may be empty.
      if (!options.qualifiers?.new) {
        return noOp;
      }
      if (options.relabelExisting !== false && !options.qualifiers?.existing) {
        return noOp;
      }

      const { existing: existingQualifiedLabel, new: newQualifiedLabel } = options.qualifiers;
      const newCanonical = simplify(newQualifiedLabel, simplifyOpts).canonicalLabel;
      const newIri = generateConceptIri(newCanonical, scope);
      const newBfo = inheritBfoCategory(existingObject, newCanonical, { graph, iriToParent: indices.iriToParent });

      // The bare label that triggered the homonym (e.g., "mouse" for both
      // "mouse (rodent)" and "mouse (input device)") is stored in
      // skos:altLabel on each homonym sibling. This is semantically correct
      // — the bare label IS an alternative way to refer to the qualified
      // concept — and discoverable in displays/exports. (Was previously
      // skos:hiddenLabel, which is for misspellings/typos that should NOT
      // be surfaced in displays.)
      const bareLabel = options.disambiguationAction === 'create_new'
        ? subjectCanonical
        : existingSubject['skos:prefLabel'];

      const newConcept = createConcept({
        id: newIri,
        label: newQualifiedLabel.charAt(0).toUpperCase() + newQualifiedLabel.slice(1),
        prefLabel: newCanonical,
        broader: objectIri,
        bfoMapping: newBfo,
        altLabel: [bareLabel],
      });

      // Build mutation
      const modifications = [];

      // Only relabel existing concept if relabelExisting is true.
      // First homonym split: true (default). Nth homonym via "Neither": false.
      if (options.relabelExisting !== false) {
        const existingQualifiedCanonical = simplify(existingQualifiedLabel, simplifyOpts).canonicalLabel;
        // Append the bare label to the existing concept's altLabel array
        // (read from snapshot — modifications haven't been applied yet).
        const existingAltLabels = existingSubject['skos:altLabel'] || [];
        const newAltLabel = existingAltLabels.includes(existingSubject['skos:prefLabel'])
          ? existingAltLabels
          : [...existingAltLabels, existingSubject['skos:prefLabel']];
        modifications.push(
          { '@id': subjectIri, 'fandaws:field': 'skos:prefLabel', 'fandaws:value': existingQualifiedCanonical },
          { '@id': subjectIri, 'fandaws:field': 'rdfs:label', 'fandaws:value': existingQualifiedLabel.charAt(0).toUpperCase() + existingQualifiedLabel.slice(1) },
          { '@id': subjectIri, 'fandaws:field': 'skos:altLabel', 'fandaws:value': newAltLabel },
        );
      }

      const mutation = createGraphMutation({
        additions: [newConcept],
        modifications,
        reason: `Create homonym "${newQualifiedLabel}"` + (modifications.length > 0 ? ` and relabel existing as "${existingQualifiedLabel}"` : ''),
      });
      return { ...noOp, mutation };
    }

    // ── Consequence-Aware Reclassification (April 9, 2026 spec) ──
    //
    // The user is asking to reclassify an existing subject under an existing
    // object (Case A). Before any silent mutation, the machine computes the
    // structural consequences and presents them to the user. The human
    // decides. (Machine-first, human-validate.)
    //
    // Q4: skos:broader is the sole source of truth for "old parent".
    const currentParentIri = existingSubject['skos:broader'];

    // Handle the user's choice from the consequence prompt (if provided).
    // These short-circuit the proximity check since the user has already
    // made an informed decision.
    if (options.reclassificationConsequenceChoice === 'keep_current') {
      return noOp;
    }
    if (options.reclassificationConsequenceChoice === 'reclassify_only') {
      // Re-home direct children to old parent, then move concept alone.
      // Both skos:broader AND rdfs:subClassOf are updated for each affected
      // concept. BFO marker recompute fires automatically after applyMutation.
      const directChildIris = indices.iriToChildren
        ? [...(indices.iriToChildren.get(subjectIri) || [])]
        : [];
      const concepts = graph['fandaws:concepts'] || [];
      const conceptById = new Map(concepts.map((c) => [c['@id'], c]));
      const modifications = [];
      for (const childIri of directChildIris) {
        const childConcept = conceptById.get(childIri);
        if (childConcept) {
          modifications.push(
            ...buildReclassifyModifications(childConcept, subjectIri, currentParentIri),
          );
        }
      }
      modifications.push(
        ...buildReclassifyModifications(existingSubject, currentParentIri, objectIri),
      );
      const mutation = createGraphMutation({
        modifications,
        reason: `Reclassify "${rawSubject}" under "${rawObject}" (children re-homed to "${findLabelForIri(currentParentIri, graph)}")`,
      });
      return { ...noOp, mutation };
    }
    // 'reclassify_subtree' falls through to the standard reclassification
    // mutation builder below (children naturally follow via skos:broader chain).

    // Confirmed move — skip proximity check
    if (reclassificationConfirmed === 'move') {
      // fall through to build mutation
    } else if (reclassificationConfirmed === 'cancel') {
      return noOp;
    } else {
      // Only check proximity if subject already has a parent (reclassification).
      // If broader is null, this is a first-time classification — proceed silently.
      if (currentParentIri != null && !quickProximityCheck(currentParentIri, objectIri, indices)) {
        const proximity = computeProximity(currentParentIri, objectIri, indices);

        if (proximity.steps > proximityThreshold) {
          const existingParentLabel = currentParentIri
            ? findLabelForIri(currentParentIri, graph)
            : '(root)';
          const newParentLabel = findLabelForIri(objectIri, graph);

          const distanceText = proximity.steps === Infinity
            ? 'These appear to be in completely different branches.'
            : `They are ${proximity.steps} steps apart in the taxonomy.`;

          const prompt = createConversationPrompt({
            promptType: 'reclassificationConfirmation',
            text: `"${rawSubject}" already exists under "${existingParentLabel}".\n${distanceText}\n\nIs this the same "${rawSubject}", or a different one?`,
            options: ['move', 'new_concept', 'cancel'],
            context: {
              existingConceptIri: subjectIri,
              existingParentLabel,
              newParentLabel,
              subjectLabel: rawSubject,
              proximity,
            },
          });
          return { ...noOp, prompts: [prompt] };
        }
      }
      // Within threshold — fall through to consequence check then mutation
    }

    // Consequence detection: only fires for reclassification (currentParentIri
    // is set) and only when the user hasn't yet picked a consequence action
    // (reclassify_subtree skips this — the user already accepted the move).
    if (
      currentParentIri != null
      && options.reclassificationConsequenceChoice !== 'reclassify_subtree'
    ) {
      const caseInfo = detectReclassificationCase(currentParentIri, objectIri, indices.iriToParent);
      // Strengthening is safe — no consequence prompt.
      if (caseInfo.case !== 'strengthening') {
        const lostProperties = computeLostProperties(subjectIri, caseInfo, graph, indices.iriToChildren);

        // CC Path A: Check for type-invalid restrictions after reclassification.
        // Scan all restrictions where the reclassified concept appears as the
        // object (owl:someValuesFrom). If the subject's BFO category is disjoint
        // with the object's NEW BFO category, the restriction is type-invalid.
        const invalidRestrictions = [];
        if (adapter && adapter.areDisjoint) {
          const newParentBfo = adapter._getBfoCategory
            ? adapter._getBfoCategory(existingObject, graph['fandaws:concepts'] || [])
            : null;
          if (newParentBfo) {
            for (const concept of (graph['fandaws:concepts'] || [])) {
              const subClassOf = concept['rdfs:subClassOf'] || [];
              for (const entry of subClassOf) {
                if (typeof entry !== 'object' || !entry['@type']) continue;
                if (entry['owl:someValuesFrom'] === subjectIri) {
                  const restrictionSubjectBfo = adapter._getBfoCategory(concept, graph['fandaws:concepts'] || []);
                  if (restrictionSubjectBfo && adapter.areDisjoint(restrictionSubjectBfo, newParentBfo)) {
                    invalidRestrictions.push({
                      subject: concept['rdfs:label'] || concept['skos:prefLabel'],
                      relation: entry['fandaws:verbLabel'] || 'has',
                      object: rawSubject,
                      subjectBFO: restrictionSubjectBfo,
                      objectNewBFO: newParentBfo,
                      disjoint: true,
                    });
                  }
                }
              }
            }
          }
        }

        if (lostProperties.length > 0 || invalidRestrictions.length > 0) {
          const prompt = buildReclassificationConsequencePrompt({
            subjectLabel: rawSubject,
            oldParentLabel: findLabelForIri(currentParentIri, graph),
            newParentLabel: findLabelForIri(objectIri, graph),
            caseInfo,
            lostProperties,
            graph,
            context: {
              subjectIri,
              objectIri,
              subjectLabel: rawSubject,
              oldParentLabel: findLabelForIri(currentParentIri, graph),
              newParentLabel: findLabelForIri(objectIri, graph),
              caseType: caseInfo.case,
              lostPropertyCount: lostProperties.length,
              invalidRestrictions,
            },
          });
          return { ...noOp, prompts: [prompt] };
        }
      }
    }

    const reclassifyMods = buildReclassifyModifications(existingSubject, currentParentIri, objectIri);
    const mutation = createGraphMutation({
      modifications: reclassifyMods,
      reason: `Classify "${rawSubject}" as "${rawObject}"`,
    });
    return { ...noOp, mutation };
  }

  // Case B: Object exists, subject new
  if (!existingSubject && existingObject) {
    const subjectBfo = inheritBfoCategory(existingObject, subjectCanonical, { graph, iriToParent: indices.iriToParent });
    const newSubject = createConcept({
      id: subjectIri,
      label: rawSubject,
      prefLabel: subjectCanonical,
      broader: objectIri,
      bfoMapping: subjectBfo,
    });

    const mutation = createGraphMutation({
      additions: [newSubject],
      reason: `Create "${rawSubject}" as child of "${rawObject}"`,
    });
    return { ...noOp, mutation };
  }

  // Case C: Both new
  if (!existingSubject && !existingObject) {
    const bfoIngested = indices.bfoEquivalenceIndex && indices.bfoEquivalenceIndex.size > 0;

    // BFO Category Disambiguation (heuristic matrix #1):
    // When BFO is ingested AND we're about to create a brand-new root
    // concept (the new object), we no longer guess its category from
    // its label. Instead we ask the user to pick from the 11 BFO
    // top-level categories. The user's choice arrives in
    // options.bfoCategoryChoice on the re-invocation.
    if (bfoIngested && !options.bfoCategoryChoice) {
      return {
        ...noOp,
        prompts: [
          buildBfoCategoryPrompt(rawObject, {
            action: 'classification',
            subject: rawSubject,
            object: rawObject,
            subjectCanonical,
            objectCanonical,
            // The user is creating a hierarchy "subject is a object" where
            // the object is a brand-new root. The prompt anchors the OBJECT.
            anchorTarget: 'object',
          }),
        ],
      };
    }

    // If user provided a BFO category choice, look up its Fandaws IRI
    // and use it as the new object's parent (so the object isn't a root).
    let newObjectBroader = null;
    if (bfoIngested && options.bfoCategoryChoice) {
      const choice = options.bfoCategoryChoice;
      const fandawsIri = indices.bfoEquivalenceIndex.get(choice)
        || indices.bfoEquivalenceIndex.get(choice.replace('http://purl.obolibrary.org/obo/', 'bfo:'));
      if (fandawsIri) {
        newObjectBroader = fandawsIri;
      }
    }

    // Pre-ingestion fallback: only run the suffix heuristic when BFO is
    // not ingested. With BFO ingested the recompute pass handles markers.
    const objectBfo = bfoIngested ? null : inferBfoCategory(objectCanonical);
    const newObject = {
      ...createConcept({
        id: objectIri,
        label: rawObject,
        prefLabel: objectCanonical,
        broader: newObjectBroader,
        bfoMapping: objectBfo,
      }),
      'fandaws:allowRoot': newObjectBroader == null,
    };

    // Child inherits BFO from parent
    const subjectBfo = bfoIngested
      ? null
      : inheritBfoCategory(newObject, subjectCanonical);
    const newSubject = createConcept({
      id: subjectIri,
      label: rawSubject,
      prefLabel: subjectCanonical,
      broader: objectIri,
      bfoMapping: subjectBfo,
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

    // Auto-create object. With BFO ingested, ask the user which BFO
    // category the new object belongs under (heuristic matrix #1).
    const bfoIngested = indices.bfoEquivalenceIndex && indices.bfoEquivalenceIndex.size > 0;

    if (bfoIngested && !options.bfoCategoryChoice) {
      return {
        ...noOp,
        prompts: [
          buildBfoCategoryPrompt(rawObject, {
            action: 'classification',
            subject: rawSubject,
            object: rawObject,
            subjectCanonical,
            objectCanonical,
            anchorTarget: 'object',
          }),
        ],
      };
    }

    // Resolve the user's BFO category choice to a Fandaws IRI parent
    let newObjectBroader = null;
    if (bfoIngested && options.bfoCategoryChoice) {
      const choice = options.bfoCategoryChoice;
      const fandawsIri = indices.bfoEquivalenceIndex.get(choice)
        || indices.bfoEquivalenceIndex.get(choice.replace('http://purl.obolibrary.org/obo/', 'bfo:'));
      if (fandawsIri) {
        newObjectBroader = fandawsIri;
      }
    }

    const objectBfo = bfoIngested ? null : inferBfoCategory(objectCanonical);
    const newObject = {
      ...createConcept({
        id: objectIri,
        label: rawObject,
        prefLabel: objectCanonical,
        broader: newObjectBroader,
        bfoMapping: objectBfo,
      }),
      'fandaws:allowRoot': newObjectBroader == null,
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
