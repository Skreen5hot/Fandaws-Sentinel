/**
 * RDF/XML Serializer — convert RDF triples to W3C RDF/XML syntax.
 *
 * Deterministic output: sorted namespace declarations, subjects sorted
 * by rdf:about, predicates sorted within each Description block.
 *
 * @see https://www.w3.org/TR/rdf-syntax-grammar/
 */

import { compactIri } from './triple-extractor.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

// ── XML Escaping ──

function escapeXmlText(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── URI to QName ──

function uriToQName(uri, prefixes) {
  // Sorted by longest namespace first to avoid partial matches
  const entries = Object.entries(prefixes)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [prefix, ns] of entries) {
    if (uri.startsWith(ns)) {
      return `${prefix}:${uri.slice(ns.length)}`;
    }
  }
  return null;
}

// ── Main Serializer ──

/**
 * Serialize RDF triples to RDF/XML format.
 *
 * @param {Array<{subject: string, predicate: string, object: string, objectType: 'uri'|'literal', datatype?: string}>} triples
 * @param {Object<string, string>} prefixes - Map of prefix name to namespace URI
 * @returns {string} RDF/XML document
 */
export function serializeRdfXml(triples, prefixes) {
  const lines = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Ensure rdf prefix is present
  const allPrefixes = { rdf: RDF_NS, ...prefixes };

  // rdf:RDF root with namespace declarations (sorted)
  const nsAttrs = Object.keys(allPrefixes)
    .sort()
    .map((p) => `  xmlns:${p}="${escapeXmlAttr(allPrefixes[p])}"`)
    .join('\n');

  lines.push(`<rdf:RDF\n${nsAttrs}>`);

  if (triples.length === 0) {
    lines.push('</rdf:RDF>');
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

    lines.push(`  <rdf:Description rdf:about="${escapeXmlAttr(subject)}">`);

    // Separate rdf:type triples from others, sort all
    const typeTriples = subjectTriples
      .filter((t) => t.predicate === RDF_TYPE)
      .sort((a, b) => a.object.localeCompare(b.object));

    const otherTriples = subjectTriples
      .filter((t) => t.predicate !== RDF_TYPE)
      .sort((a, b) => {
        const cmp = a.predicate.localeCompare(b.predicate);
        if (cmp !== 0) return cmp;
        return a.object.localeCompare(b.object);
      });

    // Emit rdf:type first
    for (const t of typeTriples) {
      lines.push(`    <rdf:type rdf:resource="${escapeXmlAttr(t.object)}" />`);
    }

    // Emit other predicates
    for (const t of otherTriples) {
      const qname = uriToQName(t.predicate, allPrefixes);
      const tag = qname || t.predicate;

      if (t.objectType === 'uri') {
        lines.push(`    <${tag} rdf:resource="${escapeXmlAttr(t.object)}" />`);
      } else if (t.datatype) {
        lines.push(`    <${tag} rdf:datatype="${escapeXmlAttr(t.datatype)}">${escapeXmlText(t.object)}</${tag}>`);
      } else {
        lines.push(`    <${tag}>${escapeXmlText(t.object)}</${tag}>`);
      }
    }

    lines.push('  </rdf:Description>');
    lines.push('');
  }

  lines.push('</rdf:RDF>');
  return lines.join('\n') + '\n';
}
