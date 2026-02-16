/**
 * Turtle Serializer — convert RDF triples to W3C Turtle syntax.
 *
 * Deterministic output: sorted prefixes, subjects grouped and sorted,
 * predicates and objects sorted within each subject block.
 *
 * @see https://www.w3.org/TR/turtle/
 */

import { compactIri } from './triple-extractor.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

// ── Escaping ──

function escapeTurtleLiteral(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// ── URI Formatting ──

function formatUri(uri, reverseMap) {
  for (const [ns, prefix] of reverseMap) {
    if (uri.startsWith(ns)) {
      return prefix + uri.slice(ns.length);
    }
  }
  return `<${uri}>`;
}

function formatObject(triple, reverseMap) {
  if (triple.objectType === 'uri') {
    return formatUri(triple.object, reverseMap);
  }
  const escaped = escapeTurtleLiteral(triple.object);
  if (triple.datatype) {
    return `"${escaped}"^^<${triple.datatype}>`;
  }
  return `"${escaped}"`;
}

// ── Main Serializer ──

/**
 * Serialize RDF triples to Turtle format.
 *
 * @param {Array<{subject: string, predicate: string, object: string, objectType: 'uri'|'literal', datatype?: string}>} triples
 * @param {Object<string, string>} prefixes - Map of prefix name to namespace URI (e.g., {skos: 'http://...'})
 * @returns {string} Turtle document
 */
export function serializeTurtle(triples, prefixes) {
  const lines = [];

  // Build reverse map for URI compaction (longest match first)
  const reverseMap = Object.entries(prefixes)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([prefix, uri]) => [uri, `${prefix}:`]);

  // Prefix declarations (sorted alphabetically)
  const sortedPrefixes = Object.keys(prefixes).sort();
  for (const prefix of sortedPrefixes) {
    lines.push(`@prefix ${prefix}: <${prefixes[prefix]}> .`);
  }

  if (triples.length === 0) {
    return lines.join('\n') + '\n';
  }

  lines.push('');

  // Group triples by subject
  const subjectMap = new Map();
  for (const t of triples) {
    if (!subjectMap.has(t.subject)) subjectMap.set(t.subject, []);
    subjectMap.get(t.subject).push(t);
  }

  // Sort subjects
  const sortedSubjects = [...subjectMap.keys()].sort();

  for (const subject of sortedSubjects) {
    const subjectTriples = subjectMap.get(subject);
    const formattedSubject = formatUri(subject, reverseMap);

    // Group by predicate
    const predMap = new Map();
    for (const t of subjectTriples) {
      if (!predMap.has(t.predicate)) predMap.set(t.predicate, []);
      predMap.get(t.predicate).push(t);
    }

    // Sort predicates, but put rdf:type first as 'a'
    const predKeys = [...predMap.keys()].sort((a, b) => {
      if (a === RDF_TYPE) return -1;
      if (b === RDF_TYPE) return 1;
      return a.localeCompare(b);
    });

    const predicateParts = [];
    for (const pred of predKeys) {
      const predTriples = predMap.get(pred);
      const formattedPred = pred === RDF_TYPE ? 'a' : formatUri(pred, reverseMap);

      // Sort objects deterministically
      const objects = predTriples
        .map((t) => formatObject(t, reverseMap))
        .sort();

      predicateParts.push(`${formattedPred} ${objects.join(' ,\n        ')}`);
    }

    lines.push(`${formattedSubject}`);
    for (let i = 0; i < predicateParts.length; i++) {
      const sep = i < predicateParts.length - 1 ? ' ;' : ' .';
      lines.push(`    ${predicateParts[i]}${sep}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
