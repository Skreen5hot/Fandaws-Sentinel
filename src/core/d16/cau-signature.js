/**
 * CAU Signature Extractor — D1.6 §2.2–2.3
 *
 * Parses a candidate ontology and emits a Normalized Logical Signature for
 * each Candidate Alignment Unit (CAU) per D1.6-L1, LS-1, LS-2, LS-3, LS-7.
 *
 * ── CARDINALITY DUAL-READ SCHEMA (SME async decision 2.3, 2026-04-21) ──
 *   Cardinality restrictions appear in BOTH `propertyRestrictionsAsDomain`
 *   AND `cardinalityRestrictions`. This is INTENTIONAL — not a duplication
 *   bug. `propertyRestrictionsAsDomain` is the generic-iteration read path
 *   (any Prolog query that walks all restrictions by domain); the typed
 *   `cardinalityRestrictions` list is the cardinality-specific read path
 *   (queries that perform arithmetic reasoning on min/max/exact cardinality).
 *
 *   **Prolog query discipline:** queries that compute cardinality constraints
 *   MUST read from `cardinalityRestrictions`, NOT from the flat list. Reading
 *   from both double-counts. This contract is enforced by convention, not by
 *   schema — document it explicitly when growing the Prolog predicate library.
 *
 * The 12 axiom-kind fields (D1.6 §2.2):
 *   propertyRestrictionsAsDomain, propertyRestrictionsAsRange,
 *   characteristics, disjointnessAssertions, equivalenceClaims,
 *   universalRestrictions, existentialRestrictions, cardinalityRestrictions,
 *   hasValueRestrictions, normalizedEnumerations, subPropertyClosureUsed,
 *   cycleDetectionTriggered.
 *
 * Pure function: (cauIRI, triples, options) → signature. No I/O, no state.
 * Hash computation is a separate async call to keep extraction sync.
 *
 * Rules implemented:
 *   LS-1: every candidate class is a CAU (uniform unit)
 *   LS-2: exactly one Signature per CAU per session
 *   LS-3: sub-property closure to depth 10
 *   LS-7: deterministic ordering (alphabetical, within-kind canonical)
 *   LS-8: owl:oneOf normalization (placeholder — full normalization pending Band 1 scenarios)
 *   LS-9: cycle detection in sub-property closure
 *
 * Spec: specs/d16/Fandaws_Sentinel_Phase_D1_6_Spec_v1_1_0.md §2.2–2.3
 */

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

const RDF_TYPE = RDF + 'type';
const RDFS_SUBCLASS_OF = RDFS + 'subClassOf';
const RDFS_DOMAIN = RDFS + 'domain';
const RDFS_RANGE = RDFS + 'range';
const RDFS_SUB_PROPERTY_OF = RDFS + 'subPropertyOf';

const OWL_RESTRICTION = OWL + 'Restriction';
const OWL_ON_PROPERTY = OWL + 'onProperty';
const OWL_SOME_VALUES_FROM = OWL + 'someValuesFrom';
const OWL_ALL_VALUES_FROM = OWL + 'allValuesFrom';
const OWL_HAS_VALUE = OWL + 'hasValue';
const OWL_MIN_CARDINALITY = OWL + 'minCardinality';
const OWL_MAX_CARDINALITY = OWL + 'maxCardinality';
const OWL_CARDINALITY = OWL + 'cardinality';
const OWL_MIN_QUALIFIED_CARDINALITY = OWL + 'minQualifiedCardinality';
const OWL_MAX_QUALIFIED_CARDINALITY = OWL + 'maxQualifiedCardinality';
const OWL_QUALIFIED_CARDINALITY = OWL + 'qualifiedCardinality';
const OWL_ON_CLASS = OWL + 'onClass';
const OWL_EQUIVALENT_CLASS = OWL + 'equivalentClass';
const OWL_DISJOINT_WITH = OWL + 'disjointWith';
const OWL_ONE_OF = OWL + 'oneOf';
const RDF_FIRST = RDF + 'first';
const RDF_REST = RDF + 'rest';
const RDF_NIL = RDF + 'nil';
const OWL_TRANSITIVE = OWL + 'TransitiveProperty';
const OWL_SYMMETRIC = OWL + 'SymmetricProperty';
const OWL_REFLEXIVE = OWL + 'ReflexiveProperty';
const OWL_FUNCTIONAL = OWL + 'FunctionalProperty';
const OWL_INVERSE_FUNCTIONAL = OWL + 'InverseFunctionalProperty';

const CHARACTERISTIC_IRIS = {
  [OWL_TRANSITIVE]: 'owl:TransitiveProperty',
  [OWL_SYMMETRIC]: 'owl:SymmetricProperty',
  [OWL_REFLEXIVE]: 'owl:ReflexiveProperty',
  [OWL_FUNCTIONAL]: 'owl:FunctionalProperty',
  [OWL_INVERSE_FUNCTIONAL]: 'owl:InverseFunctionalProperty',
};

const CARDINALITY_KINDS = new Set([
  OWL_MIN_CARDINALITY, OWL_MAX_CARDINALITY, OWL_CARDINALITY,
  OWL_MIN_QUALIFIED_CARDINALITY, OWL_MAX_QUALIFIED_CARDINALITY, OWL_QUALIFIED_CARDINALITY,
]);

const MAX_SUBPROPERTY_DEPTH = 10;

function isBlankNode(value) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('_:')) return true;
  if (/^df_\d+_\d+$/.test(value)) return true;
  if (/^n\d+$/.test(value)) return true;
  if (/^n3-\d+$/.test(value)) return true; // n3.js blank-node ID pattern
  // Fallback: anything without a URI scheme (http:, https:, urn:, mailto:, etc.)
  // AND without a prefix:local form is likely a blank node.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return true;
  return false;
}

function resolveIRI(iri, namespaces) {
  if (!iri || !namespaces) return iri;
  const colon = iri.indexOf(':');
  if (colon <= 0) return iri;
  const prefix = iri.slice(0, colon);
  const local = iri.slice(colon + 1);
  const expansion = namespaces[prefix];
  if (expansion && !iri.startsWith('http://') && !iri.startsWith('https://') && !iri.startsWith('urn:')) {
    return expansion + local;
  }
  return iri;
}

function buildTripleIndex(triples) {
  const bySubject = new Map();
  const byPredicate = new Map();
  for (const t of triples) {
    if (!bySubject.has(t.subject)) bySubject.set(t.subject, []);
    bySubject.get(t.subject).push(t);
    if (!byPredicate.has(t.predicate)) byPredicate.set(t.predicate, []);
    byPredicate.get(t.predicate).push(t);
  }
  return { bySubject, byPredicate };
}

function buildSubPropertyClosure(triples) {
  const subPropOf = new Map();
  for (const t of triples) {
    if (t.predicate === RDFS_SUB_PROPERTY_OF && !isBlankNode(t.subject) && !isBlankNode(t.object)) {
      if (!subPropOf.has(t.subject)) subPropOf.set(t.subject, []);
      subPropOf.get(t.subject).push(t.object);
    }
  }
  return subPropOf;
}

function ancestorsOfProperty(property, subPropOf) {
  const ancestors = new Set();
  const visiting = new Set([property]); // guard set: includes the starting property
  let cycleDetected = false;
  const cycleTrace = [];
  const visit = (p, depth, path) => {
    if (depth > MAX_SUBPROPERTY_DEPTH) return;
    const parents = subPropOf.get(p) || [];
    for (const parent of parents) {
      if (visiting.has(parent)) {
        cycleDetected = true;
        cycleTrace.push({ path: [...path, p, parent], depth: depth + 1 });
        continue;
      }
      visiting.add(parent);
      ancestors.add(parent);
      visit(parent, depth + 1, [...path, p]);
    }
  };
  visit(property, 0, []);
  return { ancestors: [...ancestors], cycleDetected, cycleTrace };
}

function isInherenceBearingProperty(propertyIRI) {
  // Per D1.6-L1 and §2.3 Step 3: inherence-bearing properties are scoped to the
  // BFO namespace only. Matching on bare suffix (e.g., any "/hasParticipant")
  // would over-match user-namespace properties that happen to share a name.
  const NUMERIC_IDS = new Set([
    'http://purl.obolibrary.org/obo/BFO_0000052', // inheresIn
    'http://purl.obolibrary.org/obo/BFO_0000058', // concretizes
    'http://purl.obolibrary.org/obo/BFO_0000057', // hasParticipant
  ]);
  if (NUMERIC_IDS.has(propertyIRI)) return true;
  const BFO_SYMBOLIC_PREFIX = 'http://purl.obolibrary.org/obo/BFO_';
  if (!propertyIRI.startsWith(BFO_SYMBOLIC_PREFIX)) return false;
  const SYMBOLIC_SUFFIXES = ['inheresIn', 'concretizes', 'hasParticipant'];
  return SYMBOLIC_SUFFIXES.includes(propertyIRI.slice(BFO_SYMBOLIC_PREFIX.length));
}

function diagnosticWeightForRestriction(kind, property, target) {
  if (CARDINALITY_KINDS.has(kind)) {
    return isInherenceBearingProperty(property) ? 'High' : 'Low';
  }
  if (kind === OWL_HAS_VALUE) return 'Low';
  if (kind === OWL_SOME_VALUES_FROM || kind === OWL_ALL_VALUES_FROM) {
    return isInherenceBearingProperty(property) ? 'High' : 'Medium';
  }
  return 'Medium';
}

function walkRdfList(headIRI, index) {
  const out = [];
  let current = headIRI;
  const visited = new Set();
  while (current && current !== RDF_NIL && !visited.has(current)) {
    visited.add(current);
    const cells = index.bySubject.get(current) || [];
    const first = cells.find(c => c.predicate === RDF_FIRST);
    const rest = cells.find(c => c.predicate === RDF_REST);
    if (first) out.push(first.object);
    current = rest ? rest.object : null;
  }
  return out;
}

function typesOfIndividual(individualIRI, index) {
  const out = [];
  for (const t of index.bySubject.get(individualIRI) || []) {
    if (t.predicate === RDF_TYPE && t.object !== 'http://www.w3.org/2002/07/owl#NamedIndividual') {
      out.push(t.object);
    }
  }
  return out;
}

function extractRestrictionFromBlank(blankIRI, index) {
  const ts = index.bySubject.get(blankIRI) || [];
  // owl:Restriction type assertion is optional in terse Turtle fixtures; we
  // infer a restriction whenever owl:onProperty + a restriction-kind predicate
  // are both present on the blank node.
  const onProp = ts.find(t => t.predicate === OWL_ON_PROPERTY);
  if (!onProp) return null;

  const property = onProp.object;
  let kind = null;
  let target = null;

  for (const t of ts) {
    if (t.predicate === OWL_SOME_VALUES_FROM) { kind = OWL_SOME_VALUES_FROM; target = t.object; break; }
    if (t.predicate === OWL_ALL_VALUES_FROM)  { kind = OWL_ALL_VALUES_FROM;  target = t.object; break; }
    if (t.predicate === OWL_HAS_VALUE)        { kind = OWL_HAS_VALUE;        target = t.object; break; }
    if (CARDINALITY_KINDS.has(t.predicate))   { kind = t.predicate;          target = t.object; break; }
  }

  if (!kind) return null;

  return { property, kind, target };
}

function shortKindName(kindIRI) {
  if (kindIRI === OWL_SOME_VALUES_FROM) return 'someValuesFrom';
  if (kindIRI === OWL_ALL_VALUES_FROM) return 'allValuesFrom';
  if (kindIRI === OWL_HAS_VALUE) return 'hasValue';
  if (kindIRI === OWL_MIN_CARDINALITY) return 'minCardinality';
  if (kindIRI === OWL_MAX_CARDINALITY) return 'maxCardinality';
  if (kindIRI === OWL_CARDINALITY) return 'cardinality';
  if (kindIRI === OWL_MIN_QUALIFIED_CARDINALITY) return 'minQualifiedCardinality';
  if (kindIRI === OWL_MAX_QUALIFIED_CARDINALITY) return 'maxQualifiedCardinality';
  if (kindIRI === OWL_QUALIFIED_CARDINALITY) return 'qualifiedCardinality';
  return kindIRI;
}

/**
 * Extract the Normalized Logical Signature for one CAU.
 *
 * @param {string} cauIRI — full or prefixed IRI of the CAU
 * @param {Array<{subject,predicate,object,objectType?}>} triples — parsed triples
 * @param {object} [options]
 * @param {Record<string,string>} [options.namespaces] — prefix map for IRI resolution
 * @param {boolean} [options.compactOutput=false] — if true, keep input form; else expand
 * @returns {object} signature (deterministically ordered, hash-ready)
 */
export function extractCAUSignature(cauIRI, triples, options = {}) {
  const namespaces = options.namespaces || {};
  const resolvedCAU = resolveIRI(cauIRI, namespaces);
  const index = buildTripleIndex(triples);
  const subPropOf = buildSubPropertyClosure(triples);

  const propertyRestrictionsAsDomain = [];
  const propertyRestrictionsAsRange = [];
  const universalRestrictions = [];
  const existentialRestrictions = [];
  const cardinalityRestrictions = [];
  const hasValueRestrictions = [];
  const disjointnessAssertions = [];
  const equivalenceClaims = [];
  const characteristics = [];
  const normalizedEnumerations = [];

  let subPropertyClosureUsed = false;
  let subPropertyClosureDepth = 0;
  let cycleDetectionTriggered = false;
  const cycleTrace = [];

  // Direct triples where the CAU is the subject. Check both resolved and raw
  // form (handles cases where caller passes compact vs expanded IRI).
  const directTriples = new Set([
    ...(index.bySubject.get(resolvedCAU) || []),
    ...(resolvedCAU !== cauIRI ? (index.bySubject.get(cauIRI) || []) : []),
  ]);

  for (const t of directTriples) {
    // disjointWith
    if (t.predicate === OWL_DISJOINT_WITH && !isBlankNode(t.object)) {
      disjointnessAssertions.push(t.object);
      continue;
    }
    // equivalentClass — named node: record as an equivalence claim.
    // Blank node: don't record the raw bNode IRI (it's a modeling artifact);
    // the oneOf-via-equivalent-class normalization below will surface the
    // semantic content.
    if (t.predicate === OWL_EQUIVALENT_CLASS) {
      if (!isBlankNode(t.object)) equivalenceClaims.push(t.object);
      // fall through — the oneOf-via-equivalent-class logic runs in the
      // dedicated loop below
    }
    // subClassOf → may be named or blank-node restriction
    if (t.predicate === RDFS_SUBCLASS_OF && isBlankNode(t.object)) {
      const r = extractRestrictionFromBlank(t.object, index);
      if (r) {
        const kindShort = shortKindName(r.kind);
        const weight = diagnosticWeightForRestriction(r.kind, r.property, r.target);
        propertyRestrictionsAsDomain.push({
          property: r.property,
          restrictionKind: kindShort,
          target: r.target,
          diagnosticWeight: weight,
          directlyDeclared: true,
        });
        if (r.kind === OWL_SOME_VALUES_FROM) {
          existentialRestrictions.push({ onProperty: r.property, someValuesFrom: r.target });
        } else if (r.kind === OWL_ALL_VALUES_FROM) {
          universalRestrictions.push({ onProperty: r.property, allValuesFrom: r.target });
        } else if (r.kind === OWL_HAS_VALUE) {
          hasValueRestrictions.push({ onProperty: r.property, hasValue: r.target, diagnosticWeight: weight });
        } else if (CARDINALITY_KINDS.has(r.kind)) {
          const numericValue = Number(r.target);
          const record = { onProperty: r.property, diagnosticWeight: weight };
          record[kindShort] = Number.isFinite(numericValue) ? numericValue : r.target;
          cardinalityRestrictions.push(record);
        }
        // Sub-property closure (LS-3): add restrictions under each ancestor property.
        const { ancestors, cycleDetected, cycleTrace: trace } = ancestorsOfProperty(r.property, subPropOf);
        if (ancestors.length > 0) {
          subPropertyClosureUsed = true;
          subPropertyClosureDepth = Math.max(subPropertyClosureDepth, ancestors.length);
        }
        if (cycleDetected) {
          cycleDetectionTriggered = true;
          cycleTrace.push(...trace);
        }
        for (const anc of ancestors) {
          // Recompute diagnostic weight per ancestor: if the ancestor is an
          // inherence-bearing BFO property, the inherited restriction carries
          // its full weight (e.g., cco:hasAgent closure to bfo:hasParticipant
          // surfaces a High-weight restriction on the BFO side).
          const ancWeight = diagnosticWeightForRestriction(r.kind, anc, r.target);
          propertyRestrictionsAsDomain.push({
            property: anc,
            restrictionKind: kindShort,
            target: r.target,
            diagnosticWeight: ancWeight,
            inheritedViaSubPropertyOf: r.property,
          });
        }
      }
      continue;
    }
  }

  // Range-side restrictions: find blank-node restrictions where someValuesFrom/allValuesFrom points at cauIRI
  const rangeCandidates = new Set([
    ...(index.byPredicate.get(OWL_SOME_VALUES_FROM) || []),
    ...(index.byPredicate.get(OWL_ALL_VALUES_FROM) || []),
  ]);
  for (const t of rangeCandidates) {
    if (t.object !== resolvedCAU && t.object !== cauIRI) continue;
    // Find the containing restriction's onProperty
    const sibs = index.bySubject.get(t.subject) || [];
    const onProp = sibs.find(s => s.predicate === OWL_ON_PROPERTY);
    if (!onProp) continue;
    propertyRestrictionsAsRange.push({
      property: onProp.object,
      restrictionKind: shortKindName(t.predicate),
      sourceClass: null,
      diagnosticWeight: 'Medium',
    });
  }

  // Property characteristics where CAU participates as domain or range
  const relatedProps = new Set();
  for (const t of triples) {
    if (t.predicate === RDFS_DOMAIN && t.object === resolvedCAU) relatedProps.add(t.subject);
    if (t.predicate === RDFS_RANGE && t.object === resolvedCAU) relatedProps.add(t.subject);
  }
  for (const prop of relatedProps) {
    const sibs = index.bySubject.get(prop) || [];
    for (const s of sibs) {
      if (s.predicate === RDF_TYPE && CHARACTERISTIC_IRIS[s.object]) {
        characteristics.push({ property: prop, characteristic: CHARACTERISTIC_IRIS[s.object] });
      }
    }
  }

  // owl:oneOf normalization (LS-8, Q-V1.0-7). Source patterns:
  //   (a) Direct:   CAU owl:oneOf ( m1 m2 m3 )
  //   (b) Via equivalent class: CAU owl:equivalentClass [ owl:oneOf (...) ]
  // Homogeneous → normalized struct with singular memberType.
  // Heterogeneous or undecidable → dropped with provenance note.
  const droppedAxioms = [];
  const oneOfSources = [];
  for (const t of directTriples) {
    if (t.predicate === OWL_ONE_OF) oneOfSources.push(t.object);
    if (t.predicate === OWL_EQUIVALENT_CLASS && isBlankNode(t.object)) {
      for (const sib of index.bySubject.get(t.object) || []) {
        if (sib.predicate === OWL_ONE_OF) oneOfSources.push(sib.object);
      }
    }
  }
  for (const listHead of oneOfSources) {
    const members = walkRdfList(listHead, index);
    const memberTypes = members.map(m => typesOfIndividual(m, index));
    const distinctTypes = [...new Set(memberTypes.flat())];
    const allHaveType = memberTypes.every(list => list.length > 0);
    const homogeneous = allHaveType && distinctTypes.length === 1;
    if (homogeneous) {
      normalizedEnumerations.push({
        kind: 'enumeration',
        cardinality: members.length,
        memberType: distinctTypes[0],
      });
    } else {
      droppedAxioms.push({
        axiomType: 'owl:oneOf',
        reason: 'heterogeneous or undecidable member types; treated as modeling artifact per Q-V1.0-7 resolution',
      });
    }
  }

  // Canonical ordering (LS-7): directly-declared entries first, then alphabetical by property IRI.
  const byIRI = (a, b) => (a.property || a).localeCompare(b.property || b);
  propertyRestrictionsAsDomain.sort((a, b) => {
    const aDirect = a.directlyDeclared ? 0 : 1;
    const bDirect = b.directlyDeclared ? 0 : 1;
    if (aDirect !== bDirect) return aDirect - bDirect;
    return byIRI(a, b);
  });
  propertyRestrictionsAsRange.sort(byIRI);
  characteristics.sort(byIRI);
  universalRestrictions.sort((a, b) => a.onProperty.localeCompare(b.onProperty));
  existentialRestrictions.sort((a, b) => a.onProperty.localeCompare(b.onProperty));
  cardinalityRestrictions.sort((a, b) => a.onProperty.localeCompare(b.onProperty));
  hasValueRestrictions.sort((a, b) => a.onProperty.localeCompare(b.onProperty));
  disjointnessAssertions.sort();
  equivalenceClaims.sort();

  const signature = {
    cauIRI,
    propertyRestrictionsAsDomain,
    propertyRestrictionsAsRange,
    characteristics,
    disjointnessAssertions,
    equivalenceClaims,
    universalRestrictions,
    existentialRestrictions,
    cardinalityRestrictions,
    hasValueRestrictions,
    normalizedEnumerations,
    subPropertyClosureUsed: subPropertyClosureUsed
      ? { applied: true, maxDepthTraversed: subPropertyClosureDepth }
      : { applied: false, maxDepthTraversed: 0 },
    cycleDetectionTriggered,
  };
  if (cycleDetectionTriggered && cycleTrace.length > 0) {
    signature._cycleTrace = cycleTrace; // internal; handler shapes provenance from this
  }
  if (droppedAxioms.length > 0) {
    signature._droppedAxioms = droppedAxioms; // internal; handler surfaces in provenance
  }
  return signature;
}

/**
 * Compute SHA-256 hash of a canonicalized signature record. Async because it
 * uses Web Crypto (universally available in Node 18+ and browsers).
 *
 * @param {object} signature
 * @returns {Promise<string>} lowercase hex digest
 */
export async function hashSignature(signature) {
  const canonical = canonicalizeForHash(signature);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function canonicalizeForHash(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalizeForHash).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalizeForHash(obj[k])).join(',') + '}';
}

/**
 * Convenience wrapper: extract + hash in one call.
 *
 * @returns {Promise<{signature: object, hash: string, hashAlgorithm: 'SHA-256'}>}
 */
export async function computeSignatureRecord(cauIRI, triples, options = {}) {
  const signature = extractCAUSignature(cauIRI, triples, options);
  const hash = await hashSignature(signature);
  return { signature, hash, hashAlgorithm: 'SHA-256' };
}
