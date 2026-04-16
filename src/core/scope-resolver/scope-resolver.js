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
 */
function normalizeTerm(term) {
  return simplify(term);
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

  const copiedConcepts = [...allConcepts, ...extraConcepts].map((c) => ({
    canonicalLabel: c['skos:prefLabel'],
    conceptIri: c['@id'],
    hasAnnotation: 'fandaws:resolvedFrom',
    annotations: {
      'fandaws:resolvedFrom': buildResolvedFrom(graphId, c['@id'], scopeType, graphVersion),
    },
  }));

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

    // Check for local-vs-source compatibility (user scope has concept,
    // and we also find it in a global scope)
    if (scope.scopeType !== 'user') {
      // This is a context or global scope match.
      // Check if user scope also has the concept (for compatibility detection)
      const userGraph = userGraphId ? adapter.loadGraph(userGraphId) : null;
      const localConcept = userGraph ? findConceptByLabel(userGraph, canonicalLabel) : null;

      if (localConcept) {
        // Both local and source have the concept — check compatibility
        const localChain = buildLabelChain(localConcept, userGraph);
        const sourceChain = buildLabelChain(concept, graph);
        const compat = detectCompatibility(localChain, sourceChain);

        if (compat.case === 'divergent') {
          // Conflict — fire prompt
          if (options.userChoice) {
            return handleConflictChoice(
              options.userChoice, localConcept, concept,
              userGraph, graph, scope, adapter, canonicalLabel,
              userGraphId,
            );
          }
          return buildConflictResult(
            canonicalLabel, localConcept, concept,
            userGraph, graph, scope, userGraphId,
            globalScopesSearched, userScopeSearched, skippedScopes,
          );
        }

        // Compatible — auto-resolve
        const copyResult = copyOnResolve(concept, graph, scope, scope.scopeType);
        return {
          status: 'resolved',
          compatibilityCase: compat.case,
          sourceScope: scope.graphId,
          sourceScopeType: scope.scopeType,
          normalizedTerm: canonicalLabel,
          globalScopesSearched: scope.scopeType === 'global',
          userScopeSearched: true,
          skippedScopes,
          copiedConcept: copyResult.copiedConcepts[0],
          copiedConcepts: copyResult.copiedConcepts,
          parentChainIntact: copyResult.parentChainIntact,
          restrictionObjectsCopied: copyResult.restrictionObjectsCopied,
          relationshipEndpointsCopied: copyResult.relationshipEndpointsCopied,
          mutations: [],
          removedEdges: compat.case === 'transitive_match'
            ? buildRemovedEdges(localConcept, concept, userGraph, graph)
            : [],
        };
      }
    }

    // Simple resolution — no local concept to compare against
    const copyResult = copyOnResolve(concept, graph, scope, scope.scopeType);
    return {
      status: 'resolved',
      sourceScope: scope.graphId,
      sourceScopeType: scope.scopeType,
      normalizedTerm: canonicalLabel,
      globalScopesSearched: scope.scopeType === 'global',
      userScopeSearched: scope.scopeType === 'user' || userScopeSearched,
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
// Conflict choice handlers
// ─────────────────────────────────────────────────────────

function handleConflictChoice(
  userChoice, localConcept, sourceConcept,
  localGraph, sourceGraph, sourceScope, adapter, term, userGraphId,
) {
  // TODO: implement useDefinition, createDistinct, refine
  return { status: 'conflict', mutations: [] };
}

function handleStaleCopyChoice(
  userChoice, localConcept, sourceGraph,
  sourceEntry, localScope, adapter, term,
) {
  // TODO: implement keep_local, refresh_from_source, cancel
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
