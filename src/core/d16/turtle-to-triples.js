/**
 * Minimal Turtle → triples parser for D1.6 test scenarios.
 *
 * The shipped src/core/ingestion/ontology-parser.js flattens triples into a
 * classes/properties view. D1.6 Signature extraction needs raw triples (to
 * walk blank-node restriction patterns). This module provides the raw view.
 *
 * Uses n3.js (already a dependency) via dynamic import for ESM/bundler
 * compatibility — same pattern as ontology-parser.js.
 */

export async function turtleToTriples(content) {
  const N3 = await import('n3');
  return new Promise((resolve, reject) => {
    const triples = [];
    const prefixes = extractPrefixes(content);
    const parser = new N3.Parser({ format: 'Turtle' });
    parser.parse(content, (error, quad, prefixMap) => {
      if (error) { reject(error); return; }
      if (quad) {
        triples.push({
          subject: quad.subject.value,
          predicate: quad.predicate.value,
          object: quad.object.value,
          objectType: quad.object.termType,
        });
      } else {
        resolve({ triples, prefixes });
      }
    });
  });
}

function extractPrefixes(content) {
  const prefixes = {
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    owl: 'http://www.w3.org/2002/07/owl#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
  };
  const re = /@prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\./g;
  let m;
  while ((m = re.exec(content)) !== null) {
    prefixes[m[1]] = m[2];
  }
  return prefixes;
}

export function compactIRI(iri, prefixes) {
  if (!iri || typeof iri !== 'string') return iri;
  if (iri.startsWith('_:') || /^df_\d+_\d+$/.test(iri) || /^n\d+$/.test(iri)) return iri;
  let best = null;
  for (const [prefix, expansion] of Object.entries(prefixes)) {
    if (iri.startsWith(expansion) && (!best || expansion.length > best.expansion.length)) {
      best = { prefix, expansion };
    }
  }
  if (!best) return iri;
  return `${best.prefix}:${iri.slice(best.expansion.length)}`;
}

export function expandIRI(iri, prefixes) {
  if (!iri || typeof iri !== 'string') return iri;
  if (iri.startsWith('http://') || iri.startsWith('https://') || iri.startsWith('urn:')) return iri;
  const colon = iri.indexOf(':');
  if (colon <= 0) return iri;
  const prefix = iri.slice(0, colon);
  const local = iri.slice(colon + 1);
  if (prefixes[prefix]) return prefixes[prefix] + local;
  return iri;
}

export function compactSignature(signature, prefixes) {
  const compactStr = (s) => compactIRI(s, prefixes);
  const compactObj = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(compactObj);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && /^https?:\/\//.test(v)) out[k] = compactStr(v);
      else out[k] = compactObj(v);
    }
    return out;
  };
  return {
    ...signature,
    cauIRI: compactStr(signature.cauIRI),
    propertyRestrictionsAsDomain: signature.propertyRestrictionsAsDomain.map(compactObj),
    propertyRestrictionsAsRange: signature.propertyRestrictionsAsRange.map(compactObj),
    characteristics: signature.characteristics.map(compactObj),
    disjointnessAssertions: signature.disjointnessAssertions.map(compactStr),
    equivalenceClaims: signature.equivalenceClaims.map(compactStr),
    universalRestrictions: signature.universalRestrictions.map(compactObj),
    existentialRestrictions: signature.existentialRestrictions.map(compactObj),
    cardinalityRestrictions: signature.cardinalityRestrictions.map(compactObj),
    hasValueRestrictions: signature.hasValueRestrictions.map(compactObj),
    normalizedEnumerations: signature.normalizedEnumerations.map(compactObj),
  };
}
