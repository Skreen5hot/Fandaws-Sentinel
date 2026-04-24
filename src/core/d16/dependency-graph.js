/**
 * DependencyGraph — D1.6 v1.1.0 amendment infrastructure.
 *
 * Implements the property-linked neighbor relation locked in
 * `specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md`.
 *
 * Two CAUs are neighbors iff:
 *   (1) Domain/range co-occupation: ∃ ObjectProperty P such that one CAU is
 *       in the named-class unfolding of P's domain and the other is in the
 *       named-class unfolding of P's range.
 *   (2) Restriction-mediated: one CAU has a class-axiom restriction whose
 *       `onProperty` filler names the other CAU.
 *
 * Undirected, symmetric, no transitive closure. Self-edges dropped.
 *
 * Hard precondition (§4.9): input CAU set must be post-OERS-resolved.
 * If `owl:equivalentClass` axioms name two in-set CAUs as distinct nodes,
 * the builder detects and applies the caller's chosen recovery strategy
 * (fail-fast default per SME guidance).
 *
 * Scope deferrals (§4, §7, §8 of memo):
 *   - Subsumption-based dependency → NA-1.1 (not this module)
 *   - SWRL/SHACL/property-chain axiom dependency → amendment-governed
 *   - Transitive closure → not stored; cascade reaches via multi-hop propagation
 *
 * Design: specs/d16/dp2-x1-property-linked-neighbor-memo-rev1.md
 * Consumed by: NA-1.3 cascade traversal, DP-2.2 provenance parent-reconciliation
 */

const ANNOTATION_PROPERTY_IRIS = new Set([
  'http://www.w3.org/2000/01/rdf-schema#comment',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://www.w3.org/2000/01/rdf-schema#seeAlso',
  'http://www.w3.org/2000/01/rdf-schema#isDefinedBy',
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://www.w3.org/2004/02/skos/core#altLabel',
  'http://www.w3.org/2004/02/skos/core#definition',
  'http://www.w3.org/2004/02/skos/core#note',
  'http://purl.obolibrary.org/obo/IAO_0000115', // BFO/OBO definition
]);

export class OERSPreconditionError extends Error {
  constructor(equivalentPair, axiomIRI) {
    super(
      `DependencyGraph OERS precondition violated (§4.9 memo): equivalent classes ` +
      `${equivalentPair[0]} ≡ ${equivalentPair[1]} present as distinct nodes in CAU set. ` +
      `Upstream OERS canonicalization must resolve before DependencyGraph construction. ` +
      `Axiom: ${axiomIRI || '(unnamed)'}.`
    );
    this.name = 'OERSPreconditionError';
    this.equivalentPair = equivalentPair;
    this.axiomIRI = axiomIRI;
  }
}

/**
 * Build a DependencyGraph from a CAU set + axiom inputs.
 *
 * Input shape:
 *   cauSet: Array<string>  — CAU IRIs (must be post-OERS-resolved)
 *   objectProperties: Array<{
 *     iri: string,
 *     domain?: Array<string>,      // named-class unfolding of domain
 *     range?: Array<string>,       // named-class unfolding of range
 *     superProperties?: Array<string>, // for §4.3 subproperty-inheritance closure
 *     characteristic?: string      // optional; informational only
 *   }>
 *   restrictions: Array<{
 *     subject: string,             // CAU IRI the restriction is asserted on
 *     onProperty: string,          // ObjectProperty IRI (AnnotationProperty dropped)
 *     target: Array<string>        // named-class unfolding of filler
 *   }>
 *   equivalenceAxioms?: Array<{
 *     classA: string, classB: string, sourceAxiomIRI?: string
 *   }>
 *
 * Options:
 *   onUncanonicalizedEquivalence: 'fail-fast' (default) | 'collapse'
 *     SME-preferred fail-fast surfaces OERS regressions cleanly; graph-collapse
 *     reserved for cases where operators want forward progress with audit trail.
 *
 * @returns {DependencyGraph}
 */
export function buildDependencyGraph(input, options = {}) {
  const recovery = options.onUncanonicalizedEquivalence || 'fail-fast';
  const cauSet = new Set(input.cauSet || []);
  const objectProperties = Array.isArray(input.objectProperties) ? input.objectProperties : [];
  const restrictions = Array.isArray(input.restrictions) ? input.restrictions : [];
  const equivalenceAxioms = Array.isArray(input.equivalenceAxioms) ? input.equivalenceAxioms : [];

  // §4.9 hard precondition enforcement. Detect un-canonicalized equivalent
  // classes present as distinct CAU nodes.
  const collapseMap = detectUncanonicalizedEquivalences(cauSet, equivalenceAxioms, recovery);

  // Apply collapse-strategy canonicalization if that recovery was chosen.
  const canonicalMap = buildCanonicalMap(cauSet, collapseMap);

  // §4.3 subproperty-inheritance closure with cycle safety.
  const closedProperties = closeSubpropertyInheritance(objectProperties);

  // Build symmetric adjacency per §2.1.
  const adjacency = new Map(); // CAU → Set<CAU>
  const edgeMeta = new Map();  // `${a}::${b}` (sorted) → { criteria: Set<1|2>, properties: Set<string> }

  for (const cau of cauSet) {
    if (collapseMap.has(cau) && !canonicalMap.get(cau).isCanonical) continue;
    adjacency.set(canonicalMap.get(cau).canonical, new Set());
  }

  for (const prop of closedProperties) {
    if (ANNOTATION_PROPERTY_IRIS.has(prop.iri)) continue;
    addCriterion1Edges(prop, cauSet, canonicalMap, adjacency, edgeMeta);
  }

  for (const restr of restrictions) {
    if (ANNOTATION_PROPERTY_IRIS.has(restr.onProperty)) continue;
    addCriterion2Edges(restr, cauSet, canonicalMap, adjacency, edgeMeta);
  }

  return new DependencyGraph(adjacency, edgeMeta, canonicalMap);
}

/**
 * DependencyGraph instance — immutable post-build. Consumers query via
 * `getNeighbors(cau)`.
 */
export class DependencyGraph {
  constructor(adjacency, edgeMeta, canonicalMap) {
    this._adjacency = adjacency;
    this._edgeMeta = edgeMeta;
    this._canonicalMap = canonicalMap;
  }

  /**
   * Return the set of CAU IRIs that are property-linked neighbors of `cau`.
   * Returns empty set if `cau` is not in the graph.
   */
  getNeighbors(cau) {
    const canonical = this._canonicalMap.get(cau);
    const key = canonical ? canonical.canonical : cau;
    const neighbors = this._adjacency.get(key);
    return neighbors ? new Set(neighbors) : new Set();
  }

  /**
   * Return edge metadata: criteria (set of 1 and/or 2) and attributing
   * property IRIs. Per §8 of X1 memo, recommended edge metadata is criterion
   * + outermost-property. Useful for DP-2.2 reconciliationHistory enrichment.
   */
  getEdgeMetadata(a, b) {
    const aK = (this._canonicalMap.get(a) || { canonical: a }).canonical;
    const bK = (this._canonicalMap.get(b) || { canonical: b }).canonical;
    const key = edgeKey(aK, bK);
    const meta = this._edgeMeta.get(key);
    return meta ? {
      criteria: new Set(meta.criteria),
      properties: new Set(meta.properties),
    } : null;
  }

  /**
   * Count of undirected edges in the graph. Diagnostic.
   */
  edgeCount() {
    return this._edgeMeta.size;
  }

  /**
   * All CAU nodes in the graph (post-collapse canonical set).
   */
  nodes() {
    return new Set(this._adjacency.keys());
  }
}

// ── Internals ──────────────────────────────────────────────────────

function detectUncanonicalizedEquivalences(cauSet, equivalenceAxioms, recovery) {
  const collapseMap = new Map(); // non-canonical → canonical
  for (const eq of equivalenceAxioms) {
    const { classA, classB, sourceAxiomIRI } = eq;
    if (!cauSet.has(classA) || !cauSet.has(classB)) continue;
    if (classA === classB) continue;

    if (recovery === 'fail-fast') {
      throw new OERSPreconditionError([classA, classB], sourceAxiomIRI);
    }
    if (recovery === 'collapse') {
      // Pick the lexicographically-lower IRI as canonical. Deterministic.
      const [canon, alias] = classA < classB ? [classA, classB] : [classB, classA];
      collapseMap.set(alias, canon);
    } else {
      throw new TypeError(
        `buildDependencyGraph: unknown onUncanonicalizedEquivalence strategy ${JSON.stringify(recovery)}. ` +
        `Expected 'fail-fast' or 'collapse'.`
      );
    }
  }
  return collapseMap;
}

function buildCanonicalMap(cauSet, collapseMap) {
  const map = new Map();
  for (const cau of cauSet) {
    if (collapseMap.has(cau)) {
      // Chase to terminal canonical (in case of chained equivalences).
      let canonical = collapseMap.get(cau);
      const seen = new Set([cau]);
      while (collapseMap.has(canonical)) {
        if (seen.has(canonical)) break; // cycle guard
        seen.add(canonical);
        canonical = collapseMap.get(canonical);
      }
      map.set(cau, { canonical, isCanonical: false });
    } else {
      map.set(cau, { canonical: cau, isCanonical: true });
    }
  }
  return map;
}

// §4.3 subproperty-inheritance closure. Per standard OWL 2 semantics,
// subproperty inherits superproperty's domain/range. Requires cycle-safety
// on cyclical subproperty lattices (OBO-Foundry-scale correctness constraint).
function closeSubpropertyInheritance(objectProperties) {
  // Tarjan's SCC approach: nodes in a cycle share the union of their
  // inherited domain/range. Cycle-safe by construction.
  const byIri = new Map();
  for (const p of objectProperties) byIri.set(p.iri, { ...p });

  // Build superProperty graph.
  const graph = new Map();
  for (const p of objectProperties) {
    graph.set(p.iri, (p.superProperties || []).filter((s) => byIri.has(s)));
  }

  // Compute strongly-connected components via Tarjan's algorithm.
  const sccs = computeSCCs(graph);

  // Build SCC adjacency (collapsed DAG).
  const nodeToScc = new Map();
  sccs.forEach((scc, idx) => {
    for (const node of scc) nodeToScc.set(node, idx);
  });
  const sccAdj = new Map();
  for (const [node, supers] of graph.entries()) {
    const fromScc = nodeToScc.get(node);
    if (!sccAdj.has(fromScc)) sccAdj.set(fromScc, new Set());
    for (const sup of supers) {
      const toScc = nodeToScc.get(sup);
      if (toScc !== fromScc) sccAdj.get(fromScc).add(toScc);
    }
  }

  // Compute SCC-level unfoldings via reverse-topological traversal.
  const sccDomain = new Map();
  const sccRange = new Map();
  const order = topologicalOrder(sccAdj, sccs.length);

  for (const sccIdx of order) {
    const domainAccum = new Set();
    const rangeAccum = new Set();
    for (const node of sccs[sccIdx]) {
      const prop = byIri.get(node);
      for (const d of prop.domain || []) domainAccum.add(d);
      for (const r of prop.range || []) rangeAccum.add(r);
    }
    for (const supScc of sccAdj.get(sccIdx) || []) {
      for (const d of sccDomain.get(supScc) || []) domainAccum.add(d);
      for (const r of sccRange.get(supScc) || []) rangeAccum.add(r);
    }
    sccDomain.set(sccIdx, domainAccum);
    sccRange.set(sccIdx, rangeAccum);
  }

  // Emit closed properties.
  const out = [];
  for (const p of objectProperties) {
    const idx = nodeToScc.get(p.iri);
    out.push({
      iri: p.iri,
      domain: Array.from(sccDomain.get(idx) || []),
      range: Array.from(sccRange.get(idx) || []),
      superProperties: p.superProperties || [],
      characteristic: p.characteristic,
    });
  }
  return out;
}

function computeSCCs(graph) {
  const sccs = [];
  const index = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  let idx = 0;

  const nodes = Array.from(graph.keys());
  for (const n of nodes) {
    if (!index.has(n)) strongConnect(n);
  }

  function strongConnect(v) {
    // Iterative Tarjan to avoid recursion-depth limits on deep lattices.
    const callStack = [{ node: v, state: 'enter', iter: null }];
    while (callStack.length) {
      const frame = callStack[callStack.length - 1];
      if (frame.state === 'enter') {
        index.set(frame.node, idx);
        lowlink.set(frame.node, idx);
        idx++;
        stack.push(frame.node);
        onStack.add(frame.node);
        frame.iter = (graph.get(frame.node) || [])[Symbol.iterator]();
        frame.state = 'loop';
      } else if (frame.state === 'loop') {
        const next = frame.iter.next();
        if (next.done) {
          if (lowlink.get(frame.node) === index.get(frame.node)) {
            const scc = [];
            while (true) {
              const w = stack.pop();
              onStack.delete(w);
              scc.push(w);
              if (w === frame.node) break;
            }
            sccs.push(scc);
          }
          callStack.pop();
          if (callStack.length) {
            const parent = callStack[callStack.length - 1];
            parent.pendingChild = frame.node;
            parent.state = 'afterChild';
          }
        } else {
          const w = next.value;
          if (!index.has(w)) {
            callStack.push({ node: w, state: 'enter', iter: null });
          } else if (onStack.has(w)) {
            lowlink.set(frame.node, Math.min(lowlink.get(frame.node), index.get(w)));
          }
        }
      } else if (frame.state === 'afterChild') {
        const child = frame.pendingChild;
        lowlink.set(frame.node, Math.min(lowlink.get(frame.node), lowlink.get(child)));
        frame.state = 'loop';
      }
    }
  }

  return sccs;
}

function topologicalOrder(sccAdj, sccCount) {
  // Reverse topological: process SCCs with no unvisited super-scc first,
  // so each scc's inheritance is populated by the time its subs run.
  const reverseAdj = new Map();
  for (let i = 0; i < sccCount; i++) reverseAdj.set(i, new Set());
  for (const [from, tos] of sccAdj.entries()) {
    for (const to of tos) reverseAdj.get(to).add(from);
  }
  const inDegree = new Map();
  for (let i = 0; i < sccCount; i++) {
    inDegree.set(i, (sccAdj.get(i) || new Set()).size);
  }
  const queue = [];
  for (let i = 0; i < sccCount; i++) if (inDegree.get(i) === 0) queue.push(i);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const dependent of reverseAdj.get(n)) {
      inDegree.set(dependent, inDegree.get(dependent) - 1);
      if (inDegree.get(dependent) === 0) queue.push(dependent);
    }
  }
  return order;
}

function addCriterion1Edges(prop, cauSet, canonicalMap, adjacency, edgeMeta) {
  const domainCAUs = (prop.domain || []).filter((c) => cauSet.has(c));
  const rangeCAUs = (prop.range || []).filter((c) => cauSet.has(c));
  for (const d of domainCAUs) {
    for (const r of rangeCAUs) {
      addEdge(d, r, 1, prop.iri, canonicalMap, adjacency, edgeMeta);
    }
  }
}

function addCriterion2Edges(restr, cauSet, canonicalMap, adjacency, edgeMeta) {
  if (!cauSet.has(restr.subject)) return;
  const targets = (restr.target || []).filter((c) => cauSet.has(c));
  for (const t of targets) {
    addEdge(restr.subject, t, 2, restr.onProperty, canonicalMap, adjacency, edgeMeta);
  }
}

function addEdge(a, b, criterion, propertyIri, canonicalMap, adjacency, edgeMeta) {
  const aCanon = (canonicalMap.get(a) || { canonical: a }).canonical;
  const bCanon = (canonicalMap.get(b) || { canonical: b }).canonical;
  if (aCanon === bCanon) return; // §4.1 self-edge drop
  if (!adjacency.has(aCanon)) adjacency.set(aCanon, new Set());
  if (!adjacency.has(bCanon)) adjacency.set(bCanon, new Set());
  adjacency.get(aCanon).add(bCanon);
  adjacency.get(bCanon).add(aCanon);

  const key = edgeKey(aCanon, bCanon);
  let meta = edgeMeta.get(key);
  if (!meta) {
    meta = { criteria: new Set(), properties: new Set() };
    edgeMeta.set(key, meta);
  }
  meta.criteria.add(criterion);
  if (propertyIri) meta.properties.add(propertyIri);
}

function edgeKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}
