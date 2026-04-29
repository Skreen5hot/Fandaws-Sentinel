/**
 * Ontology Parser — general-purpose OWL/Turtle class/property extractor.
 *
 * Takes a format-agnostic triple stream (from n3.js or rdfxml-streaming-parser)
 * and produces the D1/D2 pipeline input shape: { classes, properties, imports }.
 *
 * Decision W-D-21: new module separate from BFO-specific turtle-ingestion-adapter.
 * Decision W-D-19: owl:imports recorded but NOT followed.
 *
 * @see docs/architecture/workbench-v0.2-spec.md §12.1
 */

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

const OWL_CLASS = OWL + 'Class';
const OWL_OBJECT_PROPERTY = OWL + 'ObjectProperty';
const OWL_DATATYPE_PROPERTY = OWL + 'DatatypeProperty';
const OWL_TRANSITIVE = OWL + 'TransitiveProperty';
const OWL_SYMMETRIC = OWL + 'SymmetricProperty';
const OWL_REFLEXIVE = OWL + 'ReflexiveProperty';
const OWL_INVERSE_FUNCTIONAL = OWL + 'InverseFunctionalProperty';
const OWL_FUNCTIONAL = OWL + 'FunctionalProperty';
const OWL_EQUIVALENT_CLASS = OWL + 'equivalentClass';
const OWL_DISJOINT_WITH = OWL + 'disjointWith';
const OWL_IMPORTS = OWL + 'imports';
const OWL_ONTOLOGY = OWL + 'Ontology';
const OWL_RESTRICTION = OWL + 'Restriction';
const OWL_ON_PROPERTY = OWL + 'onProperty';
const OWL_SOME_VALUES_FROM = OWL + 'someValuesFrom';
const OWL_ALL_VALUES_FROM = OWL + 'allValuesFrom';
const OWL_HAS_VALUE = OWL + 'hasValue';
const OWL_MIN_CARDINALITY = OWL + 'minCardinality';
const OWL_MIN_QUAL_CARDINALITY = OWL + 'minQualifiedCardinality';
const OWL_MAX_CARDINALITY = OWL + 'maxCardinality';
const OWL_MAX_QUAL_CARDINALITY = OWL + 'maxQualifiedCardinality';
const OWL_CARDINALITY = OWL + 'cardinality';
const OWL_QUAL_CARDINALITY = OWL + 'qualifiedCardinality';

const RDF_TYPE = RDF + 'type';
const RDFS_SUBCLASS_OF = RDFS + 'subClassOf';
const RDFS_DOMAIN = RDFS + 'domain';
const RDFS_RANGE = RDFS + 'range';
const RDFS_LABEL = RDFS + 'label';
const RDFS_SUB_PROPERTY_OF = RDFS + 'subPropertyOf';

// Characteristic type IRIs
const CHARACTERISTIC_TYPES = new Set([
  OWL_TRANSITIVE, OWL_SYMMETRIC, OWL_REFLEXIVE,
  OWL_INVERSE_FUNCTIONAL, OWL_FUNCTIONAL,
]);

// Characteristic names for pipeline output
const CHARACTERISTIC_NAMES = {
  [OWL_TRANSITIVE]: 'owl:TransitiveProperty',
  [OWL_SYMMETRIC]: 'owl:SymmetricProperty',
  [OWL_REFLEXIVE]: 'owl:ReflexiveProperty',
  [OWL_INVERSE_FUNCTIONAL]: 'owl:InverseFunctionalProperty',
  [OWL_FUNCTIONAL]: 'owl:FunctionalProperty',
};

/**
 * Detect format from file extension or content sniff.
 * @param {string} filename
 * @param {string} [contentStart] - First ~200 chars of content
 * @returns {'turtle'|'rdfxml'|'ntriples'|'n3'|'unknown'}
 */
export function detectFormat(filename, contentStart) {
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'ttl') return 'turtle';
    if (ext === 'owl' || ext === 'rdf') return 'rdfxml';
    if (ext === 'nt') return 'ntriples';
    if (ext === 'n3') return 'n3';
  }
  if (contentStart) {
    const trimmed = contentStart.trim();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rdf:RDF') || trimmed.startsWith('<!DOCTYPE')) return 'rdfxml';
    if (trimmed.startsWith('@prefix') || trimmed.startsWith('@base')) return 'turtle';
    if (/^<[^>]+>\s+<[^>]+>\s+/.test(trimmed)) return 'ntriples';
  }
  return 'unknown';
}

/**
 * Check if a term is a blank node (anonymous class expression).
 *
 * X9 Step 7.7 (2026-04-28): widened to catch `n3-N` style blank-node
 * identifiers emitted by the underlying RDF parser when CCO-style
 * multi-valued rdfs:subClassOf includes anonymous owl:Restriction
 * classes alongside named BFO superclasses. Previously the regex only
 * matched `n\d+$` (e.g., `n5`); the actual emitted format is `n3-0`
 * (digit-hyphen-digit), so blank-node restrictions fell through the
 * filter and overwrote the real BFO superclass IRI in the parser's
 * subClassOf Map. Now matches both `n5` and `n3-0` forms.
 */
export function isBlankNode(value) {
  return value && (
    value.startsWith('_:') ||
    /^df_\d+_\d+$/.test(value) ||
    /^n\d+(-\d+)?$/.test(value)
  );
}

/**
 * Parse an ontology source into the D1/D2 pipeline input shape.
 *
 * @param {string} content - Raw source content (Turtle or RDF/XML)
 * @param {object} options - { format, filename }
 * @returns {Promise<{ classes: object[], properties: object[], imports: string[], ontologyIRI: string|null, tripleCount: number }>}
 */
export async function parseOntology(content, options = {}) {
  const format = options.format || detectFormat(options.filename, content.slice(0, 500));

  if (format === 'unknown') {
    throw new Error('Unable to detect ontology format. Supported: Turtle (.ttl), RDF/XML (.owl, .rdf), N-Triples (.nt), N3 (.n3)');
  }

  const triples = await parseToTriples(content, format);
  return extractPipelineInput(triples);
}

/**
 * Parse content to an array of { subject, predicate, object, objectType } triples.
 * @param {string} content
 * @param {string} format
 * @returns {Promise<object[]>}
 */
async function parseToTriples(content, format) {
  if (format === 'rdfxml') {
    return parseRdfXml(content);
  }
  return parseTurtle(content, format);
}

/**
 * Parse RDF/XML using rdfxml-streaming-parser.
 * Uses a simple SAX-style approach that works in both Node.js and browser.
 */
async function parseRdfXml(content) {
  // Dynamic import for bundler compatibility
  const { RdfXmlParser } = await import('rdfxml-streaming-parser');

  return new Promise((resolve, reject) => {
    const triples = [];
    const parser = new RdfXmlParser();

    parser.on('data', (quad) => {
      triples.push({
        subject: quad.subject.value,
        predicate: quad.predicate.value,
        object: quad.object.value,
        objectType: quad.object.termType,
        language: quad.object.language || null,
      });
    });

    parser.on('end', () => resolve(triples));
    parser.on('error', (err) => reject(err));

    // Feed content as chunks — works in both Node.js streams and browser
    parser.write(content);
    parser.end();
  });
}

/**
 * Parse Turtle/N-Triples/N3 using n3.js.
 */
async function parseTurtle(content, format) {
  const N3 = await import('n3');

  return new Promise((resolve, reject) => {
    const triples = [];
    const n3Format = format === 'ntriples' ? 'N-Triples' : format === 'n3' ? 'N3' : 'Turtle';
    const parser = new N3.Parser({ format: n3Format });

    parser.parse(content, (error, quad) => {
      if (error) {
        reject(error);
        return;
      }
      if (quad) {
        triples.push({
          subject: quad.subject.value,
          predicate: quad.predicate.value,
          object: quad.object.value,
          objectType: quad.object.termType,
          language: quad.object.language || null,
        });
      } else {
        resolve(triples);
      }
    });
  });
}

/**
 * Extract D1/D2 pipeline input from parsed triples.
 */
function extractPipelineInput(triples) {
  const classIRIs = new Set();
  const propertyIRIs = new Set();
  const subClassOf = new Map(); // IRI → parent IRI
  const domains = new Map();    // property IRI → domain IRI
  const ranges = new Map();     // property IRI → range IRI
  const labels = new Map();     // IRI → { label, lang }
  const characteristics = new Map(); // property IRI → Set<characteristic>
  const equivalentClasses = new Map(); // IRI → [IRI, ...]
  const disjointWith = new Map(); // IRI → [IRI, ...]
  const subPropertyOf = new Map(); // IRI → parent IRI
  const imports = [];
  let ontologyIRI = null;

  for (const t of triples) {
    const { subject, predicate, object, objectType, language } = t;

    if (predicate === RDF_TYPE) {
      if (object === OWL_CLASS && !isBlankNode(subject)) classIRIs.add(subject);
      if (object === OWL_OBJECT_PROPERTY && !isBlankNode(subject)) propertyIRIs.add(subject);
      if (object === OWL_ONTOLOGY && !isBlankNode(subject)) ontologyIRI = subject;
      // Property characteristics via rdf:type
      if (CHARACTERISTIC_TYPES.has(object) && !isBlankNode(subject)) {
        if (!characteristics.has(subject)) characteristics.set(subject, new Set());
        characteristics.get(subject).add(CHARACTERISTIC_NAMES[object]);
        // Also register as property if not already
        propertyIRIs.add(subject);
      }
    }

    if (predicate === RDFS_SUBCLASS_OF && !isBlankNode(subject)) {
      // Only store named-node superclasses; blank nodes are complex expressions.
      // X9 Step 7.7 (2026-04-28): first-named-wins guard. CCO-style ontologies
      // declare `rdfs:subClassOf NamedClass , [owl:Restriction ...]` —
      // multiple subClassOf triples for one class. If a named IRI was already
      // stored, don't overwrite it with a later named IRI (preserves first-
      // declared semantics). Blank-node restrictions are rejected by the
      // isBlankNode check above; this guard handles the multi-named case.
      if (!isBlankNode(object) && !subClassOf.has(subject)) {
        subClassOf.set(subject, object);
      }
    }

    if (predicate === RDFS_DOMAIN) {
      domains.set(subject, isBlankNode(object) ? `ComplexExpression:${object}` : object);
    }

    if (predicate === RDFS_RANGE) {
      ranges.set(subject, isBlankNode(object) ? `ComplexExpression:${object}` : object);
    }

    if (predicate === RDFS_LABEL) {
      // Prefer @en labels, fall back to no-language labels
      const existing = labels.get(subject);
      if (!existing) {
        labels.set(subject, { label: object, lang: language });
      } else if (language === 'en' && existing.lang !== 'en') {
        labels.set(subject, { label: object, lang: language });
      }
    }

    if (predicate === OWL_EQUIVALENT_CLASS) {
      if (!equivalentClasses.has(subject)) equivalentClasses.set(subject, []);
      equivalentClasses.get(subject).push(object);
    }

    if (predicate === OWL_DISJOINT_WITH) {
      if (!disjointWith.has(subject)) disjointWith.set(subject, []);
      disjointWith.get(subject).push(object);
    }

    if (predicate === RDFS_SUB_PROPERTY_OF && !isBlankNode(subject) && !isBlankNode(object)) {
      subPropertyOf.set(subject, object);
    }

    if (predicate === OWL_IMPORTS) {
      imports.push(object);
    }
  }

  // X9 Step 7.13 (2026-04-29): two-pass owl:Restriction capture.
  // CCO and BFO routinely declare `subClassOf [owl:Restriction;
  // owl:onProperty X; owl:someValuesFrom Y]` against blank-node
  // restriction objects. The first pass above filters those at line ~229
  // via the isBlankNode guard (Step 7.7) — the named-node parent IRI is
  // preserved, but the restriction expression is silently dropped.
  // This second pass walks every blank-node subject collecting OWL
  // restriction predicates into a structured object, then walks the
  // subClassOf-with-bnode-object triples to attach restrictions to the
  // named class. Output appears as parsed.classes[i].restrictions —
  // an additive field; consumers without restriction-awareness ignore it.
  // Phase 3 orphan rule (Step 7.5+++) already filters restriction objects
  // from parent attribution via the `owl:onProperty` field check.
  const restrictionsByClass = new Map(); // classIRI → restriction[]
  const blankNodeRestrictions = new Map(); // bnodeID → { @type, owl:onProperty, owl:someValuesFrom?, ... }

  for (const t of triples) {
    if (!isBlankNode(t.subject)) continue;
    if (!blankNodeRestrictions.has(t.subject)) {
      blankNodeRestrictions.set(t.subject, {});
    }
    const r = blankNodeRestrictions.get(t.subject);
    switch (t.predicate) {
      case RDF_TYPE:
        if (t.object === OWL_RESTRICTION) r['@type'] = 'owl:Restriction';
        break;
      case OWL_ON_PROPERTY:
        r['owl:onProperty'] = t.object; break;
      case OWL_SOME_VALUES_FROM:
        r['owl:someValuesFrom'] = t.object; break;
      case OWL_ALL_VALUES_FROM:
        r['owl:allValuesFrom'] = t.object; break;
      case OWL_HAS_VALUE:
        r['owl:hasValue'] = t.object; break;
      case OWL_MIN_CARDINALITY:
      case OWL_MIN_QUAL_CARDINALITY:
        r['owl:minCardinality'] = t.object; break;
      case OWL_MAX_CARDINALITY:
      case OWL_MAX_QUAL_CARDINALITY:
        r['owl:maxCardinality'] = t.object; break;
      case OWL_CARDINALITY:
      case OWL_QUAL_CARDINALITY:
        r['owl:cardinality'] = t.object; break;
    }
  }

  for (const t of triples) {
    if (t.predicate !== RDFS_SUBCLASS_OF) continue;
    if (isBlankNode(t.subject)) continue;
    if (!isBlankNode(t.object)) continue;
    const r = blankNodeRestrictions.get(t.object);
    // Only attach well-formed restrictions: must declare @type owl:Restriction
    // AND carry an owl:onProperty. Other blank-node expressions (e.g.,
    // owl:intersectionOf list nodes used by Group of Agents in CCO) are
    // not retained at this stage; future scope can extend.
    if (r && r['@type'] === 'owl:Restriction' && r['owl:onProperty']) {
      if (!restrictionsByClass.has(t.subject)) {
        restrictionsByClass.set(t.subject, []);
      }
      restrictionsByClass.get(t.subject).push(r);
    }
  }

  // Build classes array
  const classes = [];
  for (const iri of classIRIs) {
    const labelEntry = labels.get(iri);
    const label = labelEntry?.label || iri.split(/[/#]/).pop();
    const superclass = subClassOf.get(iri) || null;

    classes.push({
      iri,
      label,
      superclass,
      equivalentClass: equivalentClasses.get(iri) || [],
      disjointWith: disjointWith.get(iri) || [],
      // X9 Step 7.13: owl:Restriction blank-node objects retained per class.
      restrictions: restrictionsByClass.get(iri) || [],
    });
  }

  // Build properties array
  const properties = [];
  for (const iri of propertyIRIs) {
    const labelEntry = labels.get(iri);
    const label = labelEntry?.label || iri.split(/[/#]/).pop();
    const domain = domains.get(iri) || null;
    const range = ranges.get(iri) || null;
    const chars = characteristics.get(iri) ? [...characteristics.get(iri)] : [];
    const parent = subPropertyOf.get(iri) || null;

    properties.push({
      iri,
      label,
      declaredDomain: domain,
      declaredRange: range,
      declaredCharacteristics: chars,
      subPropertyOf: parent,
    });
  }

  // Sort for determinism
  classes.sort((a, b) => a.iri.localeCompare(b.iri));
  properties.sort((a, b) => a.iri.localeCompare(b.iri));

  return {
    classes,
    properties,
    imports,
    ontologyIRI,
    tripleCount: triples.length,
  };
}
