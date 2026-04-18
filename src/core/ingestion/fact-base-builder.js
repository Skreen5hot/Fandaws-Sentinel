/**
 * Fact Base Builder — converts canonical graph state to Prolog fact base.
 *
 * Decision D-15 (Rule PS-9): reflexive-transitive closure of subclass
 * asserted as ground facts. No recursive subclass/2 clauses.
 *
 * @see docs/architecture/phase-d2-avc-bundle.json
 */

/**
 * Build a Prolog fact base from the canonical graph.
 *
 * @param {object} graph - Canonical knowledge graph
 * @param {object[]} canonicalRelations - Canonical relation type inventory
 * @param {Set<string>} disjointnessMap - BFO disjointness pairs
 * @returns {{ facts: string, metadata: { conceptCount, subclassFactCount, relationCount } }}
 */
export function buildFactBase(graph, canonicalRelations = [], disjointnessMap = new Set()) {
  const concepts = graph?.['fandaws:concepts'] || [];
  const facts = [];
  let subclassFactCount = 0;

  // ── Concept facts ──
  for (const c of concepts) {
    const id = prologAtom(c['@id']);
    const label = prologAtom(c['skos:prefLabel'] || c['rdfs:label'] || '');
    const bfo = prologAtom(c['fandaws:bfoCategory'] || c.bfoCategory || '');
    facts.push(`concept(${id}).`);
    if (label) facts.push(`label(${id}, ${label}).`);
    if (bfo) facts.push(`bfo_category(${id}, ${bfo}).`);
  }

  // ── Reflexive-transitive closure of subclass (Decision D-15, Rule PS-9) ──
  // Pre-compute ALL subclass pairs as ground facts.
  const parentMap = new Map();
  for (const c of concepts) {
    const broader = c['skos:broader'] || c.parent;
    if (broader) parentMap.set(c['@id'], broader);
  }

  // For each concept, walk up to root and collect all ancestors
  for (const c of concepts) {
    const id = c['@id'];
    // Reflexive
    facts.push(`subclass(${prologAtom(id)}, ${prologAtom(id)}).`);
    subclassFactCount++;

    // Transitive: walk up parent chain
    let current = id;
    while (parentMap.has(current)) {
      const parent = parentMap.get(current);
      facts.push(`subclass(${prologAtom(id)}, ${prologAtom(parent)}).`);
      subclassFactCount++;
      current = parent;
    }
  }

  // ── Canonical relation facts ──
  for (const rel of canonicalRelations) {
    const relId = prologAtom(rel.id);
    const domain = prologAtom(rel.domain);
    const range = prologAtom(rel.range);
    facts.push(`relation(${relId}).`);
    if (domain) facts.push(`relation_domain(${relId}, ${domain}).`);
    if (range) facts.push(`relation_range(${relId}, ${range}).`);
    for (const char of (rel.characteristics || [])) {
      facts.push(`relation_characteristic(${relId}, ${prologAtom(char)}).`);
    }
  }

  // ── Disjointness facts ──
  for (const pair of disjointnessMap) {
    const [a, b] = pair.split('|');
    facts.push(`disjoint(${prologAtom(a)}, ${prologAtom(b)}).`);
    facts.push(`disjoint(${prologAtom(b)}, ${prologAtom(a)}).`);
  }

  // ── Sub-property edges ──
  // (populated from setup if available)

  return {
    facts: facts.join('\n'),
    metadata: {
      conceptCount: concepts.length,
      subclassFactCount,
      relationCount: canonicalRelations.length,
    },
  };
}

/**
 * Extract subclass closure facts for inspection (scenario 25).
 */
export function extractSubclassFacts(graph) {
  const concepts = graph?.['fandaws:concepts'] || [];
  const parentMap = new Map();
  for (const c of concepts) {
    const broader = c['skos:broader'] || c.parent;
    if (broader) parentMap.set(c['@id'], broader);
  }

  const subclassFacts = [];
  for (const c of concepts) {
    const id = c['@id'];
    // Reflexive
    subclassFacts.push(`subclass(${id}, ${id})`);

    // Transitive
    let current = id;
    while (parentMap.has(current)) {
      const parent = parentMap.get(current);
      subclassFacts.push(`subclass(${id}, ${parent})`);
      current = parent;
    }
  }

  return subclassFacts;
}

/**
 * Convert a string to a safe Prolog atom.
 */
function prologAtom(str) {
  if (!str) return "''";
  // Wrap in quotes if contains special chars
  const safe = str.replace(/'/g, "\\'");
  return `'${safe}'`;
}
