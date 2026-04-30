/**
 * X9 Step 7.16 (2026-04-29) — Turtle export IRI emission for relation
 * domain/range.
 *
 * User report: rel: ObjectProperty block at lines ~1107-1157 of the
 * exported Turtle had `rdfs:domain http://purl.obolibrary.org/obo/BFO_0000141`
 * — full URI without angle brackets, invalid Turtle. The
 * fandaws:relationDomain / fandaws:relationRange fields hold raw URIs
 * from the parser; the serializer assumed CURIE form and printed them
 * raw.
 *
 * Fix: formatTurtleTerm helper canonicalizes per Turtle term shape rules.
 *
 * Step 7.17 (architectural rewrite — banked separately): during property
 * promotion, when domain/range references a class with a FANDAWS canonical
 * record, rewrite to FANDAWS IRI. Different work; not in this cycle.
 */

import { describe, it, expect } from '@jest/globals';
import { formatTurtleTerm, exportTurtle } from '../../src/core/export-engine/turtle-export.js';
import { createKnowledgeGraph } from '../../src/types/index.js';

describe('Step 7.16 — formatTurtleTerm', () => {
  it('passes through known-prefix CURIE (bfo:BFO_0000141)', () => {
    expect(formatTurtleTerm('bfo:BFO_0000141')).toBe('bfo:BFO_0000141');
  });

  it('passes through fandaws CURIE', () => {
    expect(formatTurtleTerm('fandaws:class/uuid/foo')).toBe('fandaws:class/uuid/foo');
  });

  it('compacts known-prefix full URI to CURIE form', () => {
    expect(formatTurtleTerm('http://purl.obolibrary.org/obo/BFO_0000141')).toBe('bfo:BFO_0000141');
    expect(formatTurtleTerm('http://www.w3.org/2002/07/owl#Class')).toBe('owl:Class');
    expect(formatTurtleTerm('https://fandaws.org/schema/executionProperty/has-part')).toBe('rel:has-part');
  });

  it('wraps unknown-prefix http URI in angle brackets', () => {
    expect(formatTurtleTerm('http://example.org/unknown')).toBe('<http://example.org/unknown>');
  });

  it('wraps unknown-prefix https URI in angle brackets', () => {
    // CCO IRIs are not in ALL_PREFIXES → angle-bracket wrap.
    expect(formatTurtleTerm('https://www.commoncoreontologies.org/ont00000472'))
      .toBe('<https://www.commoncoreontologies.org/ont00000472>');
  });

  it('wraps urn: URIs in angle brackets', () => {
    expect(formatTurtleTerm('urn:isbn:9781234567890')).toBe('<urn:isbn:9781234567890>');
  });

  it('does NOT wrap unknown-prefix CURIE-shaped strings (defensive passthrough)', () => {
    // Covers e.g. 'cco:ont00000472' — colon-prefix that isn't in ALL_PREFIXES
    // and doesn't look like a URI. Pass through; upstream callers should
    // canonicalize OR the value will produce invalid Turtle. Not Step 7.16's
    // problem (Step 7.17 architectural rewrite addresses upstream).
    expect(formatTurtleTerm('cco:ont00000472')).toBe('cco:ont00000472');
  });

  it('handles falsy inputs', () => {
    expect(formatTurtleTerm(null)).toBe('null');
    expect(formatTurtleTerm(undefined)).toBe('undefined');
    expect(formatTurtleTerm('')).toBe('');
  });

  it('handles non-string inputs', () => {
    expect(formatTurtleTerm(42)).toBe('42');
  });
});

describe('Step 7.16 — exportTurtle relation property domain/range emission', () => {
  it('emits angle-bracket-wrapped full URI in rdfs:domain when value is a non-prefixed URI', () => {
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/test' });
    graph['fandaws:concepts'].push({
      '@id': 'fandaws:class/relation/uuid/has-spatial-part',
      '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
      'rdfs:label': 'has spatial part',
      'fandaws:executionPropertyIRI': 'rel:has-spatial-part',
      'fandaws:relationDomain': 'http://purl.obolibrary.org/obo/BFO_0000141',
      'fandaws:relationRange': 'http://purl.obolibrary.org/obo/BFO_0000141',
      'fandaws:relationCharacteristics': [],
    });
    const ttl = exportTurtle(graph);
    // Should NOT contain the unbracketed raw URI
    expect(ttl).not.toMatch(/rdfs:domain http:\/\/purl\.obolibrary\.org/);
    // Should contain the canonicalized form (bfo: prefix is in ALL_PREFIXES → compacted)
    expect(ttl).toMatch(/rdfs:domain bfo:BFO_0000141/);
    expect(ttl).toMatch(/rdfs:range bfo:BFO_0000141/);
  });

  it('emits angle-bracket form for unknown-prefix URI (e.g., CCO source IRI)', () => {
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/test' });
    graph['fandaws:concepts'].push({
      '@id': 'fandaws:class/relation/uuid/some-rel',
      '@type': ['owl:Class', 'fandaws:RelationTypeClass'],
      'rdfs:label': 'some rel',
      'fandaws:executionPropertyIRI': 'rel:some-rel',
      'fandaws:relationDomain': 'https://www.commoncoreontologies.org/ont00000472',
      'fandaws:relationRange': 'https://www.commoncoreontologies.org/ont00000472',
      'fandaws:relationCharacteristics': [],
    });
    const ttl = exportTurtle(graph);
    expect(ttl).toMatch(/rdfs:domain <https:\/\/www\.commoncoreontologies\.org\/ont00000472>/);
    expect(ttl).toMatch(/rdfs:range <https:\/\/www\.commoncoreontologies\.org\/ont00000472>/);
  });
});
