/**
 * Flattener (τ_F) — compiles OWL class expressions into flat Fandaws concept graphs.
 *
 * The flattener traverses a ParsedOntology and produces:
 *   - Concept nodes (named and generated)
 *   - Restriction descriptors (for τ_R to process)
 *   - Semantic loss records
 *   - IRI mappings (source → Fandaws)
 *   - Disjointness annotations
 *   - Property entity descriptors (from ObjectProperty declarations)
 *
 * After flattening, no anonymous compound class expressions remain.
 * Every node is addressable by IRI.
 *
 * @see docs/architecture/IVNE_v2.1_Specification.md Section 6
 */

import { extractLabel, iriToLocalName, splitCamelCase } from './label-extractor.js';
import { generateUniqueHashIri } from './ivne-iri-generator.js';
import { LOSS_TYPES, createLoss } from './semantic-loss.js';
import {
  gateOneOf,
  gateComplement,
  gateCardinality,
  gateCycle,
  gateMaxConcepts,
} from './pre-filter.js';
import { generateConceptIri, generatePropertyIri } from '../knowledge-engine/iri-generator.js';
import { simplify } from '../identity/identity-simplification.js';
import { inferBfoCategory } from '../knowledge-engine/bfo-heuristic.js';

// ── Concept Construction ──

/**
 * Build a Fandaws concept node from a source OWL class.
 *
 * Bypasses createConcept() to avoid non-deterministic timestamps (D1).
 * Timestamps are injected from the run context.
 *
 * @param {object} params
 * @param {string} params.iri - Fandaws concept IRI
 * @param {string} params.displayLabel - Human-readable label
 * @param {string} params.canonicalLabel - Normalized label
 * @param {string} params.languageTag - BCP 47 language tag
 * @param {string|null} params.parentIri - Parent concept IRI (skos:broader)
 * @param {string} params.runTimestamp - ISO 8601 timestamp
 * @param {string|null} params.importedFrom - Original OWL IRI
 * @param {string} params.sourceOntology - Source ontology IRI
 * @param {string|null} [params.generatedFrom=null] - Canonical expression for generated concepts
 * @param {string} [params.bfoCategory=null] - BFO category
 * @param {boolean} [params.allowRoot=false] - Whether this is a root concept
 * @returns {object} Fandaws concept node (JSON-LD)
 */
function buildConcept({
  iri,
  displayLabel,
  canonicalLabel,
  languageTag,
  parentIri,
  runTimestamp,
  importedFrom,
  sourceOntology,
  generatedFrom = null,
  bfoCategory = null,
  allowRoot = false,
}) {
  return {
    '@id': iri,
    '@type': 'fandaws:Concept',
    'fandaws:displayLabel': displayLabel,
    'fandaws:canonicalLabel': canonicalLabel,
    'fandaws:languageTag': languageTag,
    'skos:broader': parentIri,
    'fandaws:children': [],
    'fandaws:properties': [],
    'fandaws:createdAt': runTimestamp,
    'fandaws:allowRoot': allowRoot,
    'shml:epistemicStatus': 'imported',
    'fandaws:importedFrom': importedFrom,
    'fandaws:generatedFrom': generatedFrom,
    'fandaws:sourceOntology': sourceOntology,
    'fandaws:ivneVersion': '2.1',
    'owl:sameAs': importedFrom,
    'fandaws:bfoCategory': bfoCategory,
  };
}

// ── Flattener State ──

/**
 * Create an internal flattener state object.
 * Tracks all concepts, losses, mappings, and hash IRI generation context.
 */
function createFlattenState(config, context) {
  return {
    concepts: new Map(),       // iri → concept node
    restrictions: [],           // restriction descriptors for τ_R
    lossRecords: [],           // SemanticLossRecord array
    iriMappings: [],           // { source, fandaws } pairs
    generatedConcepts: [],     // hash-based IRIs
    rejectedAxioms: [],        // rejected by pre-filter
    disjointPairs: [],         // [iriA, iriB] pairs
    propertyEntities: [],      // property entity descriptors
    equivalenceDescriptors: [], // P2 merge hints for downstream Termidium
    // Hash IRI generation context
    hashContext: {
      existing: new Set(),
      generatedFromMap: new Map(),
      config,
    },
    config,
    context,
  };
}

// ── Named Concept Processing ──

/**
 * Process a named OWL class into a Fandaws concept.
 *
 * @param {object} owlClass - From parsedOntology.classes
 * @param {object} state - Flattener state
 * @returns {string} The Fandaws IRI assigned to this class
 */
function processNamedClass(owlClass, state) {
  const { config, context } = state;
  const { locale = 'en', bfoAlignmentMode = 'auto' } = config;

  // Extract label
  const label = extractLabel(owlClass, config);
  const scope = context.scope || 'fandaws:scope/default';

  // Generate deterministic IRI
  const iri = generateConceptIri(label.canonicalLabel, scope);

  // Check if already processed (deduplication within import)
  if (state.concepts.has(iri)) {
    // Record mapping but don't create duplicate
    state.iriMappings.push({ source: owlClass.iri, fandaws: iri });
    return iri;
  }

  // BFO alignment
  let bfoCategory = null;
  if (bfoAlignmentMode !== 'disabled') {
    // Check source annotations first
    if (owlClass.bfoCategory) {
      bfoCategory = owlClass.bfoCategory;
    } else if (bfoAlignmentMode === 'auto') {
      bfoCategory = inferBfoCategory(label.canonicalLabel);
    }
  }

  // Determine parent IRI
  let parentIri = null;
  if (owlClass.parents && owlClass.parents.length > 0) {
    // First parent becomes skos:broader; additional parents handled as multi-parent
    // For now, use first parent — multi-parent is handled during parent resolution
    parentIri = owlClass.parents[0];
  }

  // Determine if this is a root concept (no parents, or parent is owl:Thing)
  const isRoot = !parentIri || parentIri === 'owl:Thing' || parentIri === 'http://www.w3.org/2002/07/owl#Thing';

  const concept = buildConcept({
    iri,
    displayLabel: label.displayLabel,
    canonicalLabel: label.canonicalLabel,
    languageTag: label.languageTag,
    parentIri: isRoot ? null : parentIri, // Resolved later
    runTimestamp: context.runTimestamp,
    importedFrom: owlClass.iri,
    sourceOntology: context.sourceOntology,
    bfoCategory,
    allowRoot: isRoot,
  });

  state.concepts.set(iri, concept);
  state.iriMappings.push({ source: owlClass.iri, fandaws: iri });

  return iri;
}

// ── Expression Flattening ──

/**
 * Flatten an intersection expression (A and B) into named concepts.
 *
 * @param {object} expr - Expression object { type: 'intersection', operands: [iriA, iriB] }
 * @param {object} state - Flattener state
 * @param {Set<string>} visited - Visited set for cycle detection
 * @returns {string} IRI of the generated intersection concept
 */
function flattenIntersection(expr, state, visited) {
  const { context, config } = state;
  const operandIris = expr.operands.map((op) => resolveOperand(op, state, visited));

  // Generate hash IRI for the intersection concept
  const { iri, expression } = generateUniqueHashIri(
    'intersection',
    operandIris,
    state.hashContext,
  );

  if (!state.concepts.has(iri)) {
    const concept = buildConcept({
      iri,
      displayLabel: `intersection(${operandIris.map(i => labelFromIri(i, state)).join(', ')})`,
      canonicalLabel: expression,
      languageTag: config.locale || 'en',
      parentIri: null,
      runTimestamp: context.runTimestamp,
      importedFrom: null,
      sourceOntology: context.sourceOntology,
      generatedFrom: expression,
      allowRoot: true,
    });

    state.concepts.set(iri, concept);
    state.generatedConcepts.push(iri);

    // Each operand becomes a subclass of the intersection concept
    // (spec: "Assert A SubClassOf I_AB AND B SubClassOf I_AB")
    for (const opIri of operandIris) {
      ensureParentLink(opIri, iri, state);
    }

    // Emit informational loss record
    state.lossRecords.push(
      createLoss(LOSS_TYPES.intersectionFlattening, {
        affectedConcepts: [iri, ...operandIris],
        sourceAxiom: expr.sourceAxiom || `intersection(${operandIris.join(', ')})`,
        compiledForm: operandIris.map((i) => `${i} skos:broader ${iri}`).join('; '),
        lostSemantics: 'Intersection flattened. Necessary conditions preserved; sufficient conditions lost.',
        sourceOntology: context.sourceOntology || '',
        ivneRunId: context.ivneRunId || '',
      }),
    );
  }

  return iri;
}

/**
 * Flatten a union expression (A or B) into named concepts. LOSSY.
 *
 * @param {object} expr - Expression object { type: 'union', operands: [iriA, iriB] }
 * @param {object} state - Flattener state
 * @param {Set<string>} visited - Visited set for cycle detection
 * @returns {string} IRI of the generated union concept
 */
function flattenUnion(expr, state, visited) {
  const { context, config } = state;
  const operandIris = expr.operands.map((op) => resolveOperand(op, state, visited));

  const { iri, expression } = generateUniqueHashIri(
    'union',
    operandIris,
    state.hashContext,
  );

  if (!state.concepts.has(iri)) {
    const concept = buildConcept({
      iri,
      displayLabel: `union(${operandIris.map(i => labelFromIri(i, state)).join(', ')})`,
      canonicalLabel: expression,
      languageTag: config.locale || 'en',
      parentIri: null,
      runTimestamp: context.runTimestamp,
      importedFrom: null,
      sourceOntology: context.sourceOntology,
      generatedFrom: expression,
      allowRoot: true,
    });

    // Store disjunct list for downstream CSS consumption
    concept['fandaws:disjuncts'] = operandIris;

    state.concepts.set(iri, concept);
    state.generatedConcepts.push(iri);

    // Each operand becomes a subclass of the union concept
    for (const opIri of operandIris) {
      ensureParentLink(opIri, iri, state);
    }

    // Emit lossy loss record
    state.lossRecords.push(
      createLoss(LOSS_TYPES.unionGeneralization, {
        affectedConcepts: [iri, ...operandIris],
        sourceAxiom: expr.sourceAxiom || `union(${operandIris.join(', ')})`,
        compiledForm: operandIris.map((i) => `${i} skos:broader ${iri}`).join('; '),
        lostSemantics: 'Union generalized. The constraint that instances must be one of the specific disjuncts is lost.',
        sourceOntology: context.sourceOntology || '',
        ivneRunId: context.ivneRunId || '',
      }),
    );
  }

  return iri;
}

// ── Expression Resolution ──

/**
 * Resolve an operand to a Fandaws IRI. The operand may be:
 *   - A string IRI (already resolved or a source IRI)
 *   - A nested expression object (intersection, union, etc.)
 *
 * @param {string|object} operand - IRI string or expression object
 * @param {object} state - Flattener state
 * @param {Set<string>} visited - Visited set for cycle detection
 * @returns {string} Fandaws IRI
 */
function resolveOperand(operand, state, visited) {
  if (typeof operand === 'string') {
    // Look up in IRI mappings
    const mapping = state.iriMappings.find((m) => m.source === operand);
    return mapping ? mapping.fandaws : operand;
  }

  // Nested expression — flatten recursively
  return flattenExpression(operand, state, visited);
}

/**
 * Dispatch expression flattening based on type.
 *
 * @param {object} expr - Expression object with type and operands
 * @param {object} state - Flattener state
 * @param {Set<string>} visited - Visited set for cycle detection
 * @returns {string} Fandaws IRI of the flattened expression
 */
function flattenExpression(expr, state, visited) {
  if (!expr || !expr.type) return null;

  // Cycle detection
  const exprKey = JSON.stringify(expr);
  const cycleResult = gateCycle(exprKey, visited, state.context);
  if (cycleResult.action === 'reject') {
    state.lossRecords.push(cycleResult.lossRecord);
    state.rejectedAxioms.push({ axiom: expr, reason: 'cycleDrop' });
    return null;
  }
  visited.add(exprKey);

  switch (expr.type) {
    case 'intersection':
      return flattenIntersection(expr, state, visited);
    case 'union':
      return flattenUnion(expr, state, visited);
    case 'ComplementOf': {
      const gate = gateComplement(expr, state.context);
      state.lossRecords.push(gate.lossRecord);
      state.rejectedAxioms.push({ axiom: expr, reason: 'complementDrop' });
      return null;
    }
    case 'OneOf': {
      const gate = gateOneOf(expr, state.context);
      state.lossRecords.push(gate.lossRecord);
      state.rejectedAxioms.push({ axiom: expr, reason: 'enumerationDrop' });
      return null;
    }
    default:
      return null;
  }
}

// ── Helpers ──

/**
 * Get a display label from a Fandaws IRI (from concepts map).
 */
function labelFromIri(iri, state) {
  const concept = state.concepts.get(iri);
  if (concept) return concept['fandaws:displayLabel'];
  // Fall back to local name
  const localName = iriToLocalName(iri);
  return localName ? splitCamelCase(localName) : iri;
}

/**
 * Ensure a concept has a parent link to the given parent IRI.
 * If the concept already has a parent, this is a secondary parent — skip
 * (Fandaws uses single parent via skos:broader; multiple parents are not
 * directly supported but the concept retains its primary parent).
 */
function ensureParentLink(childIri, parentIri, state) {
  const child = state.concepts.get(childIri);
  if (child && !child['skos:broader']) {
    child['skos:broader'] = parentIri;
  }
}

// ── Disjointness Processing ──

/**
 * Process disjointness axioms (P3).
 *
 * @param {object} axiom - { type: 'DisjointWith', class1, class2 }
 * @param {object} state - Flattener state
 */
function processDisjointness(axiom, state) {
  const iri1 = resolveSourceIri(axiom.class1, state);
  const iri2 = resolveSourceIri(axiom.class2, state);

  if (iri1 && iri2) {
    state.disjointPairs.push([iri1, iri2]);

    // Add disjointness annotation to both concepts
    const concept1 = state.concepts.get(iri1);
    const concept2 = state.concepts.get(iri2);

    if (concept1) {
      if (!concept1['owl:disjointWith']) concept1['owl:disjointWith'] = [];
      concept1['owl:disjointWith'].push(iri2);
    }
    if (concept2) {
      if (!concept2['owl:disjointWith']) concept2['owl:disjointWith'] = [];
      concept2['owl:disjointWith'].push(iri1);
    }
  }
}

/**
 * Resolve a source OWL IRI to its Fandaws IRI using the mappings.
 */
function resolveSourceIri(sourceIri, state) {
  const mapping = state.iriMappings.find((m) => m.source === sourceIri);
  return mapping ? mapping.fandaws : null;
}

// ── Equivalence Processing (P2) ──

/**
 * Process equivalence axioms (P2).
 *
 * Both equivalent classes are already created as named concepts.
 * This adds owl:equivalentClass annotations and emits merge descriptors
 * for downstream Termidium processing.
 *
 * @param {object} axiom - { type: 'EquivalentTo', class1, class2, sourceAxiom? }
 * @param {object} state - Flattener state
 */
function processEquivalence(axiom, state) {
  const iri1 = resolveSourceIri(axiom.class1, state);
  const iri2 = resolveSourceIri(axiom.class2, state);

  if (iri1 && iri2) {
    // Add owl:equivalentClass annotations to both concepts
    const concept1 = state.concepts.get(iri1);
    const concept2 = state.concepts.get(iri2);

    if (concept1) {
      if (!concept1['owl:equivalentClass']) concept1['owl:equivalentClass'] = [];
      concept1['owl:equivalentClass'].push(iri2);
    }
    if (concept2) {
      if (!concept2['owl:equivalentClass']) concept2['owl:equivalentClass'] = [];
      concept2['owl:equivalentClass'].push(iri1);
    }

    // Emit merge descriptor for downstream Termidium processing
    state.equivalenceDescriptors.push({
      '@type': 'fandaws:EquivalenceDescriptor',
      'fandaws:class1': iri1,
      'fandaws:class2': iri2,
      'fandaws:sourceAxiom': axiom.sourceAxiom || `${axiom.class1} EquivalentTo ${axiom.class2}`,
    });
  }
}

// ── Restriction Processing ──

/**
 * Process a restriction axiom (P5/P6/P8) into a restriction descriptor.
 *
 * Restriction descriptors are passed to the Restriction Lifter (τ_R)
 * for reification or inlining.
 *
 * @param {object} axiom - Parsed restriction axiom
 * @param {object} state - Flattener state
 */
function processRestriction(axiom, state) {
  // Check cardinality gate
  if (axiom.type === 'Cardinality') {
    const gate = gateCardinality(axiom, state.context);
    if (gate.action === 'reject') {
      // Only vacuous-drop (min 0) emits a loss record at the flattener level
      state.lossRecords.push(gate.lossRecord);
      state.rejectedAxioms.push({ axiom, reason: 'vacuousDrop' });
      return;
    }
    // action === 'dual': fall through to create restriction descriptor.
    // NO loss record pushed here — the restriction-lifter emits per-type
    // cardinalityWeakening loss records when it processes the descriptor.
  }

  const classIri = resolveSourceIri(axiom.affectedClass, state);
  if (!classIri) return;

  state.restrictions.push({
    classIri,
    property: axiom.property,
    filler: axiom.filler,
    quantifier: axiom.quantifier || 'existential',
    type: axiom.type,
    sourceAxiom: axiom.sourceAxiom || '',
    cardinality: axiom.type === 'Cardinality' ? {
      min: axiom.minCardinality ?? null,
      max: axiom.maxCardinality ?? null,
      exact: axiom.exactCardinality ?? null,
      qualifiedOver: axiom.filler || null,
    } : null,
  });
}

// ── ObjectProperty Processing (D5) ──

/**
 * Process ObjectProperty declarations from the parsedOntology.properties array.
 *
 * BFO's part_of and has_part are ObjectProperty axioms, not SubClassOf or
 * existential restrictions. The flattener creates property entity descriptors
 * for these, which the restriction lifter can reference.
 *
 * @param {object} prop - Parsed ObjectProperty { iri, labels, domain, range, inverseOf }
 * @param {object} state - Flattener state
 */
function processObjectProperty(prop, state) {
  const { config, context } = state;

  // Extract label
  const label = extractLabel(
    { iri: prop.iri, annotations: prop.annotations || prop.labels || [] },
    config,
  );

  const scope = context.scope || 'fandaws:scope/default';
  const iri = generatePropertyIri(label.canonicalLabel, scope);

  state.propertyEntities.push({
    '@id': iri,
    '@type': 'fandaws:PropertyEntity',
    'fandaws:displayLabel': label.displayLabel,
    'fandaws:canonicalLabel': label.canonicalLabel,
    'fandaws:domain': prop.domain || null,
    'fandaws:range': prop.range || null,
    'fandaws:inverseOf': prop.inverseOf || null,
    'fandaws:importedFrom': prop.iri,
    'fandaws:sourceOntology': context.sourceOntology,
    'shml:epistemicStatus': 'imported',
  });

  state.iriMappings.push({ source: prop.iri, fandaws: iri });
}

// ── Parent Resolution ──

/**
 * Resolve parent IRIs from source OWL IRIs to Fandaws IRIs.
 *
 * This runs after all classes are processed, replacing source IRIs
 * in skos:broader with Fandaws IRIs.
 *
 * @param {object} state - Flattener state
 */
function resolveParents(state) {
  for (const [, concept] of state.concepts) {
    if (concept['skos:broader']) {
      const resolved = resolveSourceIri(concept['skos:broader'], state);
      if (resolved) {
        concept['skos:broader'] = resolved;
      }
    }
  }
}

// ── Public API ──

/**
 * Flatten a parsed ontology into Fandaws concepts and restriction descriptors.
 *
 * This is the τ_F phase of the IVNE transformation pipeline.
 *
 * @param {object} parsedOntology - Parsed OWL ontology
 * @param {object[]} parsedOntology.classes - Named OWL classes
 * @param {object[]} [parsedOntology.properties=[]] - ObjectProperty declarations
 * @param {object[]} [parsedOntology.restrictions=[]] - Restriction axioms
 * @param {object[]} [parsedOntology.disjointness=[]] - Disjointness axioms
 * @param {object[]} [parsedOntology.equivalences=[]] - Equivalence axioms
 * @param {object[]} [parsedOntology.expressions=[]] - Compound class expressions
 * @param {object} config - IVNE configuration
 * @param {object} context - Compilation context
 * @param {string} context.runTimestamp - ISO 8601 timestamp
 * @param {string} context.sourceOntology - Source ontology IRI
 * @param {string} [context.ivneRunId=''] - Run ID
 * @param {string} [context.scope='fandaws:scope/default'] - Scope IRI
 * @returns {object} Flattening result
 */
export function flatten(parsedOntology, config, context) {
  const state = createFlattenState(config, context);
  const classes = parsedOntology.classes || [];
  const properties = parsedOntology.properties || [];
  const restrictions = parsedOntology.restrictions || [];
  const disjointness = parsedOntology.disjointness || [];
  const expressions = parsedOntology.expressions || [];

  // Phase 1: Process all named classes
  for (const owlClass of classes) {
    // Max concepts gate
    const maxGate = gateMaxConcepts(state.concepts.size, config);
    if (maxGate.action === 'error') {
      throw new Error(maxGate.message);
    }

    processNamedClass(owlClass, state);
  }

  // Phase 2: Resolve parent IRIs
  resolveParents(state);

  // Phase 3: Process compound expressions (intersection, union, etc.)
  for (const expr of expressions) {
    const visited = new Set();
    flattenExpression(expr, state, visited);
  }

  // Phase 4: Process ObjectProperty declarations (D5)
  for (const prop of properties) {
    processObjectProperty(prop, state);
  }

  // Phase 5: Process restriction axioms
  for (const restriction of restrictions) {
    processRestriction(restriction, state);
  }

  // Phase 6: Process disjointness axioms (P3)
  for (const axiom of disjointness) {
    processDisjointness(axiom, state);
  }

  // Phase 7: Process equivalence axioms (P2)
  const equivalences = parsedOntology.equivalences || [];
  for (const axiom of equivalences) {
    processEquivalence(axiom, state);
  }

  return {
    concepts: Array.from(state.concepts.values()),
    restrictions: state.restrictions,
    lossRecords: state.lossRecords,
    iriMappings: state.iriMappings,
    generatedConcepts: state.generatedConcepts,
    rejectedAxioms: state.rejectedAxioms,
    disjointPairs: state.disjointPairs,
    propertyEntities: state.propertyEntities,
    equivalenceDescriptors: state.equivalenceDescriptors,
  };
}
