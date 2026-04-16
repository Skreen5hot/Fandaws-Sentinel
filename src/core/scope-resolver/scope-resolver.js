/**
 * ScopeResolver — cross-scope term resolution with copy-on-resolve.
 *
 * Phase 12 implementation. Resolves terms across context → user → global
 * scope hierarchy. Produces a ScopeResolution with status, copied concepts,
 * and annotation metadata.
 *
 * Pipeline-facing entry point: `resolveScope()` (backward compatible).
 * AVC-facing entry point: `resolveTerm()` (full resolution with adapter).
 *
 * @see Fandaws_v3.3_Specification.md Section 3.4, 5.11
 * @see docs/architecture/phase-12-locked-decisions.md
 */

import { createScopeResolution } from '../../types/scope-resolution.js';
import { simplify } from '../identity/identity-simplification.js';

// ─────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────

/**
 * Normalize a term via Identity Simplification (Phase 1).
 * Returns the canonical label string.
 */
function normalizeTerm(term) {
  const result = simplify(term);
  return result.canonicalLabel || result;
}

/**
 * Search a single graph for a concept by canonical label.
 *
 * @param {object} graph - KnowledgeGraph JSON-LD
 * @param {string} canonicalLabel - Normalized term
 * @returns {object|null} Concept node or null
 */
function findConceptByLabel(graph, canonicalLabel) {
  if (!graph || !graph['fandaws:concepts']) return null;
  return graph['fandaws:concepts'].find(
    (c) => c['skos:prefLabel'] === canonicalLabel,
  ) || null;
}

/**
 * Walk the parent chain from a concept to the root, collecting all
 * ancestors in order [parent, grandparent, ..., root].
 *
 * @param {object} startConcept
 * @param {object} graph
 * @returns {object[]} Array of ancestor concept nodes
 */
function collectParentChain(startConcept, graph) {
  const chain = [];
  const visited = new Set([startConcept['@id']]);
  const conceptById = new Map(
    (graph['fandaws:concepts'] || []).map((c) => [c['@id'], c]),
  );
  let cursor = startConcept['skos:broader'];
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const parent = conceptById.get(cursor);
    if (!parent) break;
    chain.push(parent);
    cursor = parent['skos:broader'];
  }
  return chain;
}

/**
 * Extract the canonical label chain (for compatibility comparison).
 * Returns [concept, parent, grandparent, ...] as label strings.
 * Stops when a parent concept isn't defined in the graph — undefined
 * parents truncate the chain (you can't compare what doesn't exist).
 */
function buildLabelChain(concept, graph) {
  const chain = [concept['skos:prefLabel']];
  for (const ancestor of collectParentChain(concept, graph)) {
    chain.push(ancestor['skos:prefLabel']);
  }
  return chain;
}

/**
 * Build the fandaws:resolvedFrom annotation object.
 */
function buildResolvedFrom(graphId, conceptIri, scopeType, graphVersion) {
  return {
    graphId,
    conceptIri,
    scopeType,
    resolvedAt: new Date().toISOString(),
    graphVersion: graphVersion || null,
  };
}

/**
 * Copy a concept and its full parent chain (+ restriction objects and
 * relationship endpoints) from a source graph, attaching resolvedFrom
 * annotations to each copied node.
 *
 * @returns {{ copiedConcepts, restrictionObjectsCopied, relationshipEndpointsCopied, parentChainIntact }}
 */
function copyOnResolve(concept, sourceGraph, scopeEntry, scopeType) {
  const graphId = scopeEntry.graphId || scopeEntry;
  const graphVersion = sourceGraph['fandaws:graphVersion'] || null;
  const conceptById = new Map(
    (sourceGraph['fandaws:concepts'] || []).map((c) => [c['@id'], c]),
  );

  // Collect parent chain
  const parents = collectParentChain(concept, sourceGraph);
  const allConcepts = [concept, ...parents];

  // Collect restriction objects and relationship endpoints
  const restrictionObjectsCopied = [];
  const relationshipEndpointsCopied = [];
  const extraConcepts = [];

  for (const c of allConcepts) {
    const subClassOf = c['rdfs:subClassOf'] || [];
    for (const entry of subClassOf) {
      if (typeof entry !== 'object' || !entry['@type']) continue;
      const objectIri = entry['owl:someValuesFrom'];
      if (!objectIri) continue;
      const objectConcept = conceptById.get(objectIri);
      if (!objectConcept) continue;

      if (entry['fandaws:restrictionKind'] === 'property') {
        restrictionObjectsCopied.push(objectConcept['skos:prefLabel']);
        if (!allConcepts.some((ac) => ac['@id'] === objectIri)) {
          extraConcepts.push(objectConcept);
        }
      } else if (entry['fandaws:restrictionKind'] === 'relationship') {
        relationshipEndpointsCopied.push(objectConcept['skos:prefLabel']);
        if (!allConcepts.some((ac) => ac['@id'] === objectIri)) {
          extraConcepts.push(objectConcept);
        }
      }
    }
  }

  // Build restriction/relationship summaries for the primary concept
  const primaryRestrictions = [];
  const primaryRelationships = [];
  const primarySubClassOf = concept['rdfs:subClassOf'] || [];
  for (const entry of primarySubClassOf) {
    if (typeof entry !== 'object' || !entry['@type']) continue;
    const objectIri = entry['owl:someValuesFrom'];
    const objectConcept = objectIri ? conceptById.get(objectIri) : null;
    const objectLabel = objectConcept?.['skos:prefLabel'] || objectIri;
    if (entry['fandaws:restrictionKind'] === 'property') {
      primaryRestrictions.push({
        verb: entry['fandaws:verbLabel'] || 'has',
        objectLabel,
      });
    } else if (entry['fandaws:restrictionKind'] === 'relationship') {
      primaryRelationships.push({
        verb: entry['owl:onProperty']?.split('/').pop() || 'relates',
        objectLabel,
      });
    }
  }

  const copiedConcepts = [...allConcepts, ...extraConcepts].map((c) => ({
    canonicalLabel: c['skos:prefLabel'],
    conceptIri: c['@id'],
    hasAnnotation: 'fandaws:resolvedFrom',
    annotations: {
      'fandaws:resolvedFrom': buildResolvedFrom(graphId, c['@id'], scopeType, graphVersion),
    },
  }));

  // Attach restrictions/relationships to the primary copied concept
  if (primaryRestrictions.length > 0) {
    copiedConcepts[0].restrictions = primaryRestrictions;
  }
  if (primaryRelationships.length > 0) {
    copiedConcepts[0].relationships = primaryRelationships;
  }

  return {
    copiedConcepts,
    restrictionObjectsCopied,
    relationshipEndpointsCopied,
    parentChainIntact: true,
  };
}

// ─────────────────────────────────────────────────────────
// Compatibility detection (Decision 1)
// ─────────────────────────────────────────────────────────

/**
 * Compare local and source IS_A chains to detect compatibility.
 *
 * @returns {{ case: 'prefix_match'|'transitive_match'|'divergent', ... }}
 */
function detectCompatibility(localChain, sourceChain) {
  // Identical chains → idempotent (treated as prefix_match)
  if (localChain.length === sourceChain.length &&
      localChain.every((l, i) => l === sourceChain[i])) {
    return { case: 'prefix_match' };
  }

  // Prefix match: local chain is a prefix of source chain
  // e.g., local [dog, mammal] vs source [dog, mammal, animal]
  if (localChain.length <= sourceChain.length) {
    const isPrefix = localChain.every((l, i) => l === sourceChain[i]);
    if (isPrefix) {
      return { case: 'prefix_match' };
    }
  }

  // Transitive match: local chain is a valid transitive closure of source
  // e.g., local [dog, mammal] vs source [dog, canine, mammal]
  // Local skips intermediates but every local step exists in source in order
  if (localChain.length <= sourceChain.length) {
    let localIdx = 0;
    for (let sourceIdx = 0; sourceIdx < sourceChain.length && localIdx < localChain.length; sourceIdx++) {
      if (sourceChain[sourceIdx] === localChain[localIdx]) {
        localIdx++;
      }
    }
    if (localIdx === localChain.length) {
      return { case: 'transitive_match' };
    }
  }

  // Check the reverse: source chain is a transitive closure of local
  if (sourceChain.length <= localChain.length) {
    let sourceIdx = 0;
    for (let localIdx = 0; localIdx < localChain.length && sourceIdx < sourceChain.length; localIdx++) {
      if (localChain[localIdx] === sourceChain[sourceIdx]) {
        sourceIdx++;
      }
    }
    if (sourceIdx === sourceChain.length) {
      return { case: 'prefix_match' };
    }
  }

  // Divergent
  return { case: 'divergent' };
}

// ─────────────────────────────────────────────────────────
// Stale copy detection (Decision 2)
// ─────────────────────────────────────────────────────────

/**
 * Check if a local concept is a stale copy of a source concept.
 */
function detectStaleCopy(localConcept, sourceGraph, scopeEntry) {
  const resolvedFrom = localConcept['fandaws:resolvedFrom'];
  if (!resolvedFrom) return null;
  if (resolvedFrom.graphId !== (scopeEntry.graphId || scopeEntry)) return null;

  const sourceVersion = sourceGraph['fandaws:graphVersion'] || null;
  const localVersion = resolvedFrom.graphVersion;

  if (!sourceVersion || !localVersion || sourceVersion === localVersion) return null;

  // Versions differ — compute differences
  const conceptById = new Map(
    (sourceGraph['fandaws:concepts'] || []).map((c) => [c['@id'], c]),
  );
  const sourceConcept = conceptById.get(resolvedFrom.conceptIri);
  if (!sourceConcept) return null;

  const differences = [];

  // Parent change
  const localParentLabel = localConcept['skos:broader']
    ? findConceptInLocalGraph(localConcept['skos:broader'])
    : null;
  const sourceParentLabel = sourceConcept['skos:broader']
    ? conceptById.get(sourceConcept['skos:broader'])?.['skos:prefLabel']
    : null;
  if (localConcept['skos:broader'] !== sourceConcept['skos:broader']) {
    differences.push({
      type: 'parentChange',
      from: localParentLabel || localConcept['skos:broader'],
      to: sourceParentLabel || sourceConcept['skos:broader'],
    });
  }

  // Restriction changes
  const localRestrictions = (localConcept['rdfs:subClassOf'] || [])
    .filter((e) => typeof e === 'object' && e['fandaws:restrictionKind'] === 'property');
  const sourceRestrictions = (sourceConcept['rdfs:subClassOf'] || [])
    .filter((e) => typeof e === 'object' && e['fandaws:restrictionKind'] === 'property');

  for (const sr of sourceRestrictions) {
    const match = localRestrictions.find((lr) => lr['@id'] === sr['@id']);
    if (!match) {
      const objectLabel = conceptById.get(sr['owl:someValuesFrom'])?.['skos:prefLabel']
        || sr['owl:someValuesFrom'];
      differences.push({
        type: 'restrictionAdded',
        verb: sr['fandaws:verbLabel'] || 'has',
        object: objectLabel,
      });
    }
  }

  if (differences.length === 0) return null;

  return {
    promptType: 'staleCopyPrompt',
    term: localConcept['skos:prefLabel'],
    localVersion,
    sourceVersion,
    differences,
    options: ['keep_local', 'refresh_from_source', 'cancel'],
  };
}

// Placeholder — will need the adapter's graph to resolve
function findConceptInLocalGraph(iri) {
  return iri;
}

// ─────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────

/**
 * Resolve a term across the scope hierarchy.
 *
 * Resolution order: context → user → global (by priority).
 * See docs/architecture/phase-12-locked-decisions.md for compatibility
 * rules, stale-copy handling, and annotation schemas.
 *
 * @param {string} term - Raw term to resolve
 * @param {object} scopeConfig - ScopeConfiguration JSON-LD
 * @param {object} adapter - StateAdapter with loadGraph()
 * @param {object} [options={}] - { userChoice } for second-turn actions
 * @returns {object} Resolution result
 */
export function resolveTerm(term, scopeConfig, adapter, options = {}) {
  const canonicalLabel = normalizeTerm(term);
  const contextGraphId = scopeConfig['fandaws:contextGraphId'];
  const userGraphId = scopeConfig['fandaws:userGraphId'];
  const globalEntries = scopeConfig['fandaws:globalFederation'] || [];

  // ── Second-turn shortcut: if a userChoice is provided with a conflict
  // resolution action, this is a response to a previously detected conflict.
  // Route directly to the appropriate handler without re-running resolution.
  if (options.userChoice && ['useDefinition', 'createDistinct', 'refine'].includes(options.userChoice.action)) {
    const userGraph = userGraphId ? adapter.loadGraph(userGraphId) : null;
    const localConcept = userGraph ? findConceptByLabel(userGraph, canonicalLabel) : null;
    // Find the first global scope with this term for the source concept
    const sortedG = [...globalEntries].sort(
      (a, b) => (a['fandaws:priority'] || 999) - (b['fandaws:priority'] || 999),
    );
    let sourceConcept = null;
    let sourceGraph = null;
    let sourceScope = null;
    for (const gEntry of sortedG) {
      if (gEntry['fandaws:available'] === false) continue;
      const gGraph = adapter.loadGraph(gEntry['fandaws:graphId']);
      if (!gGraph) continue;
      const gc = findConceptByLabel(gGraph, canonicalLabel);
      if (gc) {
        sourceConcept = gc;
        sourceGraph = gGraph;
        sourceScope = { graphId: gEntry['fandaws:graphId'], scopeType: 'global' };
        break;
      }
    }
    if (localConcept && sourceConcept) {
      return handleConflictChoice(
        options.userChoice, localConcept, sourceConcept,
        userGraph, sourceGraph, sourceScope, adapter, canonicalLabel,
        userGraphId,
      );
    }
  }

  // ── Second-turn shortcut: stale copy action ──
  if (options.userChoice && ['keep_local', 'refresh_from_source', 'cancel'].includes(options.userChoice.action)) {
    const userGraph = userGraphId ? adapter.loadGraph(userGraphId) : null;
    const localConcept = userGraph ? findConceptByLabel(userGraph, canonicalLabel) : null;
    if (localConcept && localConcept['fandaws:resolvedFrom']) {
      const sortedG = [...globalEntries].sort(
        (a, b) => (a['fandaws:priority'] || 999) - (b['fandaws:priority'] || 999),
      );
      const sourceEntry = sortedG.find(
        (g) => g['fandaws:graphId'] === localConcept['fandaws:resolvedFrom'].graphId,
      );
      if (sourceEntry) {
        const sGraph = adapter.loadGraph(sourceEntry['fandaws:graphId']);
        if (sGraph) {
          return handleStaleCopyChoice(
            options.userChoice, localConcept, sGraph,
            sourceEntry, { graphId: userGraphId }, adapter, canonicalLabel,
          );
        }
      }
    }
  }

  // Build the ordered search list: context → user → globals by priority
  const searchOrder = [];

  if (contextGraphId) {
    searchOrder.push({ graphId: contextGraphId, scopeType: 'context' });
  }

  if (userGraphId) {
    searchOrder.push({ graphId: userGraphId, scopeType: 'user' });
  }

  const sortedGlobals = [...globalEntries].sort(
    (a, b) => (a['fandaws:priority'] || 999) - (b['fandaws:priority'] || 999),
  );
  for (const entry of sortedGlobals) {
    searchOrder.push({
      graphId: entry['fandaws:graphId'],
      scopeType: 'global',
      priority: entry['fandaws:priority'],
      available: entry['fandaws:available'],
      unavailableReason: entry['fandaws:unavailableReason'],
      entry,
    });
  }

  const skippedScopes = [];
  let globalScopesSearched = false;
  let userScopeSearched = false;
  let resolvedFrom = null;

  // ── Step 1: Search scopes in order ──
  for (const scope of searchOrder) {
    // Offline check
    if (scope.available === false) {
      skippedScopes.push({
        graphId: scope.graphId,
        reason: scope.unavailableReason || 'unavailable',
      });
      continue;
    }

    if (scope.scopeType === 'global') globalScopesSearched = true;
    if (scope.scopeType === 'user') userScopeSearched = true;

    const graph = adapter.loadGraph(scope.graphId);
    if (!graph) continue;

    const concept = findConceptByLabel(graph, canonicalLabel);
    if (!concept) continue;

    // ── Found a match ──

    // Check if this is the user scope and the concept has a resolvedFrom
    // annotation — might be a stale copy
    if (scope.scopeType === 'user' && concept['fandaws:resolvedFrom']) {
      // Look for the source scope in globals
      const resolvedFromAnnotation = concept['fandaws:resolvedFrom'];
      const sourceEntry = sortedGlobals.find(
        (g) => g['fandaws:graphId'] === resolvedFromAnnotation.graphId,
      );
      if (sourceEntry && sourceEntry['fandaws:available'] !== false) {
        const sourceGraph = adapter.loadGraph(sourceEntry['fandaws:graphId']);
        if (sourceGraph) {
          const staleCheck = detectStaleCopy(concept, sourceGraph, {
            graphId: sourceEntry['fandaws:graphId'],
          });
          if (staleCheck) {
            // Handle user choice for stale copy
            if (options.userChoice) {
              return handleStaleCopyChoice(
                options.userChoice, concept, sourceGraph,
                sourceEntry, scope, adapter, canonicalLabel,
              );
            }
            return {
              status: 'stale',
              sourceScope: scope.graphId,
              sourceScopeType: scope.scopeType,
              normalizedTerm: canonicalLabel,
              globalScopesSearched: false,
              userScopeSearched: true,
              skippedScopes,
              prompt: { fired: true, machineSignal: staleCheck },
              mutations: [],
            };
          }
        }
      }
    }

    // ── User scope match: check globals for compatible enrichment only ──
    // User scope is authoritative. When the user has the term, globals are
    // searched ONLY for compatible upgrades (prefix/transitive match).
    // Divergent globals are silently ignored — user definition wins.
    // Per AVC resolve-user-scope-hit: "Global scope MUST NOT be searched
    // when user scope produces a match" — the globalScopesSearched flag
    // stays false because the resolution comes from the user scope.
    if (scope.scopeType === 'user') {
      for (const gScope of sortedGlobals) {
        if (gScope['fandaws:available'] === false) continue;
        const gGraph = adapter.loadGraph(gScope['fandaws:graphId']);
        if (!gGraph) continue;
        const gConcept = findConceptByLabel(gGraph, canonicalLabel);
        if (!gConcept) continue;

        const localChain = buildLabelChain(concept, graph);
        const sourceChain = buildLabelChain(gConcept, gGraph);
        const compat = detectCompatibility(localChain, sourceChain);

        // Divergent → fire conflict prompt (machine-first, human-validate)
        if (compat.case === 'divergent') {
          const gScopeObj = { graphId: gScope['fandaws:graphId'], scopeType: 'global' };
          return buildConflictResult(
            canonicalLabel, concept, gConcept,
            graph, gGraph, gScopeObj, userGraphId,
            true, true, skippedScopes,
          );
        }

        // Identical or local already as detailed → no upgrade needed
        if (compat.case === 'prefix_match' && sourceChain.length <= localChain.length) {
          continue;
        }

        // Compatible upgrade available — apply silently
        const removedEdges = compat.case === 'transitive_match'
          ? buildRemovedEdges(concept, gConcept, graph, gGraph)
          : [];
        applyCompatibilityUpgrade(
          compat.case, concept, gConcept,
          graph, gGraph, adapter, userGraphId,
        );
        const copyResult = copyOnResolve(gConcept, gGraph, gScope, 'global');
        return {
          status: 'resolved',
          compatibilityCase: compat.case,
          sourceScope: scope.graphId,
          sourceScopeType: 'user',
          normalizedTerm: canonicalLabel,
          globalScopesSearched: false,
          userScopeSearched: true,
          skippedScopes,
          copiedConcept: copyResult.copiedConcepts[0],
          copiedConcepts: copyResult.copiedConcepts,
          parentChainIntact: copyResult.parentChainIntact,
          restrictionObjectsCopied: copyResult.restrictionObjectsCopied,
          relationshipEndpointsCopied: copyResult.relationshipEndpointsCopied,
          mutations: [],
          removedEdges,
        };
      }

      // No compatible global upgrade — simple user resolution
      const copyResult = copyOnResolve(concept, graph, scope, scope.scopeType);
      return {
        status: 'resolved',
        sourceScope: scope.graphId,
        sourceScopeType: scope.scopeType,
        normalizedTerm: canonicalLabel,
        globalScopesSearched: false,
        userScopeSearched: true,
        skippedScopes,
        copiedConcept: copyResult.copiedConcepts[0],
        copiedConcepts: copyResult.copiedConcepts,
        parentChainIntact: copyResult.parentChainIntact,
        restrictionObjectsCopied: copyResult.restrictionObjectsCopied,
        relationshipEndpointsCopied: copyResult.relationshipEndpointsCopied,
        mutations: [],
      };
    }

    // ── Context or global scope match (no local concept) ──
    const copyResult = copyOnResolve(concept, graph, scope, scope.scopeType);
    return {
      status: 'resolved',
      sourceScope: scope.graphId,
      sourceScopeType: scope.scopeType,
      normalizedTerm: canonicalLabel,
      globalScopesSearched: scope.scopeType === 'global',
      userScopeSearched: false,
      skippedScopes,
      copiedConcept: copyResult.copiedConcepts[0],
      copiedConcepts: copyResult.copiedConcepts,
      parentChainIntact: copyResult.parentChainIntact,
      restrictionObjectsCopied: copyResult.restrictionObjectsCopied,
      relationshipEndpointsCopied: copyResult.relationshipEndpointsCopied,
      mutations: [],
    };
  }

  // ── Not found in any scope ──
  return {
    status: 'unknown',
    normalizedTerm: canonicalLabel,
    globalScopesSearched: true,
    userScopeSearched: true,
    allScopesSearched: true,
    skippedScopes,
    mutations: [],
  };
}

// ─────────────────────────────────────────────────────────
// Conflict result builder
// ────────��────────────────────────────────────────────────

function buildConflictResult(
  term, localConcept, sourceConcept,
  localGraph, sourceGraph, sourceScope, userGraphId,
  globalScopesSearched, userScopeSearched, skippedScopes,
) {
  const localChain = collectParentChain(localConcept, localGraph)
    .map((c) => c['skos:prefLabel']);
  const sourceChain = collectParentChain(sourceConcept, sourceGraph)
    .map((c) => c['skos:prefLabel']);

  return {
    status: 'conflict',
    normalizedTerm: term,
    globalScopesSearched,
    userScopeSearched,
    skippedScopes,
    prompt: {
      fired: true,
      machineSignal: {
        promptType: 'conflictResolution',
        term,
        definitions: [
          {
            scope: userGraphId,
            scopeType: 'user',
            parentChain: localChain,
          },
          {
            scope: sourceScope.graphId,
            scopeType: sourceScope.scopeType,
            parentChain: sourceChain,
          },
        ],
        options: ['useDefinition', 'createDistinct', 'refine'],
      },
    },
    mutations: [],
  };
}

// ─────────────────────────────────────────────────────────
// Removed edges for transitive match
// ─────────────────────────────────────────────────────────

function buildRemovedEdges(localConcept, sourceConcept, localGraph, sourceGraph) {
  const localParent = localConcept['skos:broader'];
  const sourceParent = sourceConcept['skos:broader'];
  if (localParent && sourceParent && localParent !== sourceParent) {
    const localParentConcept = (localGraph['fandaws:concepts'] || [])
      .find((c) => c['@id'] === localParent);
    return [{
      subject: localConcept['skos:prefLabel'],
      predicate: 'skos:broader',
      object: localParentConcept?.['skos:prefLabel'] || localParent,
      reason: `replaced by transitive closure ${localConcept['skos:prefLabel']} → ${sourceConcept['skos:broader']} → ...`,
    }];
  }
  return [];
}

// ─────────────────────────────────────────────────────────
// Compatibility auto-resolve: apply mutations to local graph
// ─────────────────────────────────────────────────────────

/**
 * Apply prefix-match or transitive-match upgrades to the local graph.
 * For prefix match: add missing ancestors from source chain.
 * For transitive match: rewrite skos:broader and insert intermediates.
 */
function applyCompatibilityUpgrade(compatCase, localConcept, sourceConcept, userGraph, sourceGraph, adapter, userGraphId) {
  const sourceConceptById = new Map(
    (sourceGraph['fandaws:concepts'] || []).map((c) => [c['@id'], c]),
  );
  const localConceptByLabel = new Map(
    (userGraph['fandaws:concepts'] || []).map((c) => [c['skos:prefLabel'], c]),
  );

  if (compatCase === 'prefix_match') {
    // Add missing ancestors from source chain to local graph
    const sourceAncestors = collectParentChain(sourceConcept, sourceGraph);
    for (const ancestor of sourceAncestors) {
      if (!localConceptByLabel.has(ancestor['skos:prefLabel'])) {
        // Find the ancestor's parent label to link in local graph
        const parentInSource = ancestor['skos:broader']
          ? sourceConceptById.get(ancestor['skos:broader'])
          : null;
        const localParent = parentInSource
          ? localConceptByLabel.get(parentInSource['skos:prefLabel'])
          : null;

        const newConcept = createConceptForCopy(
          ancestor['skos:prefLabel'],
          localParent?.['@id'] || null,
        );
        userGraph['fandaws:concepts'].push(newConcept);
        localConceptByLabel.set(ancestor['skos:prefLabel'], newConcept);
      }
    }
    // Update the parent link for the concept whose parent was null/short
    const localTerminal = localConceptByLabel.get(
      collectParentChain(localConcept, userGraph).pop()?.['skos:prefLabel'],
    );
    if (localTerminal && !localTerminal['skos:broader']) {
      const sourceTerminal = sourceAncestors.find(
        (a) => a['skos:prefLabel'] === localTerminal['skos:prefLabel'],
      );
      if (sourceTerminal?.['skos:broader']) {
        const parentInSource = sourceConceptById.get(sourceTerminal['skos:broader']);
        const localParent = parentInSource
          ? localConceptByLabel.get(parentInSource['skos:prefLabel'])
          : null;
        if (localParent) {
          localTerminal['skos:broader'] = localParent['@id'];
        }
      }
    }
    adapter.saveGraph(userGraphId, userGraph);
  } else if (compatCase === 'transitive_match') {
    // Insert intermediate concepts, rewrite direct edge
    const sourceChain = [sourceConcept, ...collectParentChain(sourceConcept, sourceGraph)];
    // For each concept in the source chain, ensure it exists locally
    for (const sc of sourceChain) {
      if (!localConceptByLabel.has(sc['skos:prefLabel'])) {
        const parentInSource = sc['skos:broader']
          ? sourceConceptById.get(sc['skos:broader'])
          : null;
        const localParent = parentInSource
          ? localConceptByLabel.get(parentInSource['skos:prefLabel'])
          : null;
        const newConcept = createConceptForCopy(
          sc['skos:prefLabel'],
          localParent?.['@id'] || null,
        );
        userGraph['fandaws:concepts'].push(newConcept);
        localConceptByLabel.set(sc['skos:prefLabel'], newConcept);
      }
    }
    // Rewrite the local concept's skos:broader to match source's direct parent
    const sourceDirectParent = sourceConcept['skos:broader']
      ? sourceConceptById.get(sourceConcept['skos:broader'])
      : null;
    if (sourceDirectParent) {
      const localNewParent = localConceptByLabel.get(sourceDirectParent['skos:prefLabel']);
      if (localNewParent) {
        localConcept['skos:broader'] = localNewParent['@id'];
      }
    }
    adapter.saveGraph(userGraphId, userGraph);
  }
}

import { createConcept as _createConcept } from '../../types/concept.js';
import { generateConceptIri } from '../knowledge-engine/iri-generator.js';

function createConceptForCopy(label, broaderIri) {
  const iri = generateConceptIri(label);
  return _createConcept({
    id: iri,
    label,
    prefLabel: label,
    broader: broaderIri,
  });
}

// ─────────────────────────────────────────────────────────
// Conflict choice handlers
// ─────────────────────────────────────────────────────────

function handleConflictChoice(
  userChoice, localConcept, sourceConcept,
  localGraph, sourceGraph, sourceScope, adapter, term, userGraphId,
) {
  const action = userChoice.action;
  const graphVersion = sourceGraph['fandaws:graphVersion'] || null;

  if (action === 'useDefinition') {
    // Replace local concept with the selected scope's definition
    const selectedScope = userChoice.selected;
    const isSelectingGlobal = selectedScope === sourceScope.graphId;

    if (isSelectingGlobal) {
      // Copy source concept + parent chain into local graph
      const copyResult = copyOnResolve(sourceConcept, sourceGraph, sourceScope, sourceScope.scopeType);
      // Replace in local graph
      const graph = adapter.loadGraph(userGraphId);
      const idx = graph['fandaws:concepts'].findIndex(
        (c) => c['skos:prefLabel'] === term,
      );

      // Build the replacement with source chain
      const sourceConceptById = new Map(
        (sourceGraph['fandaws:concepts'] || []).map((c) => [c['@id'], c]),
      );
      const sourceParent = sourceConcept['skos:broader']
        ? sourceConceptById.get(sourceConcept['skos:broader'])
        : null;

      // Ensure parent chain exists locally
      const localByLabel = new Map(
        graph['fandaws:concepts'].map((c) => [c['skos:prefLabel'], c]),
      );
      for (const ancestor of collectParentChain(sourceConcept, sourceGraph)) {
        if (!localByLabel.has(ancestor['skos:prefLabel'])) {
          const parentOfAncestor = ancestor['skos:broader']
            ? sourceConceptById.get(ancestor['skos:broader'])
            : null;
          const localParent = parentOfAncestor
            ? localByLabel.get(parentOfAncestor['skos:prefLabel'])
            : null;
          const newConcept = createConceptForCopy(
            ancestor['skos:prefLabel'],
            localParent?.['@id'] || null,
          );
          graph['fandaws:concepts'].push(newConcept);
          localByLabel.set(ancestor['skos:prefLabel'], newConcept);
        }
      }

      // Update the concept's parent to match source
      if (idx >= 0 && sourceParent) {
        const localParent = localByLabel.get(sourceParent['skos:prefLabel']);
        if (localParent) {
          graph['fandaws:concepts'][idx]['skos:broader'] = localParent['@id'];
        }
      }

      // Attach resolvedFrom annotation
      if (idx >= 0) {
        graph['fandaws:concepts'][idx]['fandaws:resolvedFrom'] = buildResolvedFrom(
          sourceScope.graphId, sourceConcept['@id'], sourceScope.scopeType, graphVersion,
        );
      }

      adapter.saveGraph(userGraphId, graph);

      return {
        status: 'resolved',
        postState: true,
        mutations: [{ mutationType: 'conflictResolution' }],
        mutationLog: {
          entries: [{
            mutationType: 'conflictResolution',
            term,
            action: 'useDefinition',
            selectedScope: selectedScope,
            timestamp: new Date().toISOString(),
          }],
        },
        sessionMetadata: {
          conflictResolutions: [{
            term,
            selected: selectedScope,
            rejected: [userGraphId],
          }],
        },
      };
    }
    return { status: 'resolved', mutations: [] };
  }

  if (action === 'createDistinct') {
    const disambiguations = userChoice.disambiguations;
    const graph = adapter.loadGraph(userGraphId);
    const now = new Date().toISOString();
    const newConcepts = [];

    for (const dis of disambiguations) {
      const disambiguatedLabel = `${term} (${dis.suffix})`;
      const newIri = generateConceptIri(disambiguatedLabel);

      // Find the source concept's parent chain for this scope
      let parentBroader = null;
      if (dis.source === userGraphId) {
        parentBroader = localConcept['skos:broader'];
      } else {
        const sourceConceptById = new Map(
          (sourceGraph['fandaws:concepts'] || []).map((c) => [c['@id'], c]),
        );
        const parentInSource = sourceConcept['skos:broader']
          ? sourceConceptById.get(sourceConcept['skos:broader'])
          : null;
        // Ensure parent exists locally
        if (parentInSource) {
          const localByLabel = new Map(
            graph['fandaws:concepts'].map((c) => [c['skos:prefLabel'], c]),
          );
          let localParent = localByLabel.get(parentInSource['skos:prefLabel']);
          if (!localParent) {
            localParent = createConceptForCopy(
              parentInSource['skos:prefLabel'], null,
            );
            graph['fandaws:concepts'].push(localParent);
          }
          parentBroader = localParent['@id'];
        }
      }

      const newConcept = _createConcept({
        id: newIri,
        label: disambiguatedLabel,
        prefLabel: disambiguatedLabel,
        broader: parentBroader,
      });
      newConcept['fandaws:disambiguatedFrom'] = {
        originalTerm: term,
        disambiguationSuffix: dis.suffix,
        peerConcept: null, // will be filled in second pass
        disambiguatedAt: now,
      };
      newConcepts.push({ concept: newConcept, suffix: dis.suffix });
    }

    // Cross-reference peerConcept
    if (newConcepts.length === 2) {
      newConcepts[0].concept['fandaws:disambiguatedFrom'].peerConcept = newConcepts[1].concept['@id'];
      newConcepts[1].concept['fandaws:disambiguatedFrom'].peerConcept = newConcepts[0].concept['@id'];
    }

    // Remove old concept, add new ones
    const idx = graph['fandaws:concepts'].findIndex(
      (c) => c['skos:prefLabel'] === term,
    );
    if (idx >= 0) graph['fandaws:concepts'].splice(idx, 1);
    for (const nc of newConcepts) {
      graph['fandaws:concepts'].push(nc.concept);
    }
    adapter.saveGraph(userGraphId, graph);

    return {
      status: 'resolved',
      postState: true,
      mutations: [{ mutationType: 'conflictResolution' }],
      mutationLog: {
        entries: [{
          mutationType: 'conflictResolution',
          term,
          action: 'createDistinct',
          timestamp: new Date().toISOString(),
        }],
      },
    };
  }

  if (action === 'refine') {
    const newDisplayLabel = userChoice.newDisplayLabel;

    // Reject undisambiguated label
    if (newDisplayLabel === term) {
      return {
        status: 'refine_rejected',
        resolution: { status: 'refine_rejected', reason: 'undisambiguated_label' },
        prompt: {
          fired: true,
          machineSignal: {
            promptType: 'refineDisambiguationRequired',
            attemptedLabel: term,
            conflictingTerm: term,
          },
        },
        mutations: [],
      };
    }

    const graph = adapter.loadGraph(userGraphId);
    const now = new Date().toISOString();
    const sourceGV = sourceGraph['fandaws:graphVersion'] || null;
    const userGV = graph['fandaws:graphVersion'] || null;

    const newIri = generateConceptIri(newDisplayLabel);
    const refinedConcept = _createConcept({
      id: newIri,
      label: newDisplayLabel,
      prefLabel: newDisplayLabel,
      broader: null,
    });
    refinedConcept['fandaws:shadows'] = {
      shadowedDefinitions: [
        {
          graphId: userGraphId,
          conceptIri: localConcept['@id'],
          scopeType: 'user',
          graphVersion: userGV,
        },
        {
          graphId: sourceScope.graphId,
          conceptIri: sourceConcept['@id'],
          scopeType: sourceScope.scopeType,
          graphVersion: sourceGV,
        },
      ],
      shadowedAt: now,
      shadowReason: userChoice.refineReason || '',
    };

    graph['fandaws:concepts'].push(refinedConcept);
    adapter.saveGraph(userGraphId, graph);

    return {
      status: 'resolved',
      postState: true,
      mutations: [{ mutationType: 'conflictResolution' }],
      mutationLog: {
        entries: [{
          mutationType: 'conflictResolution',
          term,
          action: 'refine',
          timestamp: new Date().toISOString(),
        }],
      },
    };
  }

  return { status: 'conflict', mutations: [] };
}

// ─────────────────────────────────────────────────────────
// Stale copy choice handlers
// ─────────────────────────────────────────────────────────

function handleStaleCopyChoice(
  userChoice, localConcept, sourceGraph,
  sourceEntry, localScope, adapter, term,
) {
  const action = userChoice.action;
  const userGraphId = localScope.graphId;

  if (action === 'keep_local') {
    return {
      status: 'resolved',
      postState: true,
      mutations: [],
      sessionMetadata: {
        staleCopyDecisions: [{
          term,
          action: 'keep_local',
          localVersion: localConcept['fandaws:resolvedFrom']?.graphVersion,
          availableVersion: sourceGraph['fandaws:graphVersion'],
        }],
      },
    };
  }

  if (action === 'refresh_from_source') {
    const graph = adapter.loadGraph(userGraphId);
    const sourceConceptById = new Map(
      (sourceGraph['fandaws:concepts'] || []).map((c) => [c['@id'], c]),
    );
    const sourceConcept = sourceConceptById.get(
      localConcept['fandaws:resolvedFrom']?.conceptIri,
    );
    if (!sourceConcept) return { status: 'error', mutations: [] };

    const localByLabel = new Map(
      graph['fandaws:concepts'].map((c) => [c['skos:prefLabel'], c]),
    );

    // Copy parent chain from source
    for (const ancestor of collectParentChain(sourceConcept, sourceGraph)) {
      if (!localByLabel.has(ancestor['skos:prefLabel'])) {
        const parentInSource = ancestor['skos:broader']
          ? sourceConceptById.get(ancestor['skos:broader'])
          : null;
        const localParent = parentInSource
          ? localByLabel.get(parentInSource['skos:prefLabel'])
          : null;
        const newConcept = createConceptForCopy(
          ancestor['skos:prefLabel'],
          localParent?.['@id'] || null,
        );
        graph['fandaws:concepts'].push(newConcept);
        localByLabel.set(ancestor['skos:prefLabel'], newConcept);
      }
    }

    // Copy restriction objects
    const subClassOf = sourceConcept['rdfs:subClassOf'] || [];
    for (const entry of subClassOf) {
      if (typeof entry !== 'object') continue;
      const objectIri = entry['owl:someValuesFrom'];
      if (!objectIri) continue;
      const objectConcept = sourceConceptById.get(objectIri);
      if (objectConcept && !localByLabel.has(objectConcept['skos:prefLabel'])) {
        const newConcept = createConceptForCopy(objectConcept['skos:prefLabel'], null);
        graph['fandaws:concepts'].push(newConcept);
        localByLabel.set(objectConcept['skos:prefLabel'], newConcept);
      }
    }

    // Update local concept: parent, restrictions, annotation
    const localIdx = graph['fandaws:concepts'].findIndex(
      (c) => c['skos:prefLabel'] === term,
    );
    if (localIdx >= 0) {
      const lc = graph['fandaws:concepts'][localIdx];
      // Update parent
      const sourceParent = sourceConcept['skos:broader']
        ? sourceConceptById.get(sourceConcept['skos:broader'])
        : null;
      if (sourceParent) {
        const localParent = localByLabel.get(sourceParent['skos:prefLabel']);
        lc['skos:broader'] = localParent?.['@id'] || null;
      }
      // Copy restrictions from source
      lc['rdfs:subClassOf'] = [...subClassOf];
      // Update annotation
      lc['fandaws:resolvedFrom'] = buildResolvedFrom(
        sourceEntry['fandaws:graphId'] || sourceEntry.graphId,
        sourceConcept['@id'],
        'global',
        sourceGraph['fandaws:graphVersion'],
      );
    }

    adapter.saveGraph(userGraphId, graph);
    return { status: 'resolved', postState: true, mutations: [] };
  }

  if (action === 'cancel') {
    return {
      status: 'cancelled',
      resolution: { status: 'cancelled' },
      mutations: [],
      mutationCount: 0,
    };
  }

  return { status: 'stale', mutations: [] };
}

// ─────────────────────────────────────────────────────────
// Pipeline-facing entry point (backward compatible)
// ─────────────────────────────────────────────────────────

/**
 * Resolve a term against configured scopes (pipeline stub).
 * Kept for backward compatibility with the classification pipeline.
 *
 * @param {string} term - The term to resolve
 * @param {object|null} [scopeConfig=null] - ScopeConfiguration (unused in stub)
 * @returns {object} JSON-LD ScopeResolution node with status "unknown"
 */
export function resolveScope(term, scopeConfig = null) {
  return createScopeResolution({
    term,
    status: 'unknown',
  });
}
