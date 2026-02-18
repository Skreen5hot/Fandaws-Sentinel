/**
 * Label Extractor — Unit Tests
 *
 * Tests OWL label extraction priority, IRI local name extraction,
 * camelCase splitting, and integration with identity simplification.
 */

import { describe, it, expect } from '@jest/globals';
import {
  extractLabel,
  iriToLocalName,
  splitCamelCase,
} from '../../../src/core/ivne/label-extractor.js';

// ── iriToLocalName ──

describe('iriToLocalName', () => {
  it('extracts fragment after #', () => {
    expect(iriToLocalName('http://www.w3.org/2002/07/owl#Class')).toBe('Class');
  });

  it('extracts last path segment after /', () => {
    expect(iriToLocalName('http://purl.obolibrary.org/obo/BFO_0000001')).toBe('BFO_0000001');
  });

  it('extracts local name from prefixed IRI', () => {
    expect(iriToLocalName('bfo:BFO_0000001')).toBe('BFO_0000001');
  });

  it('prefers fragment over path', () => {
    expect(iriToLocalName('http://example.org/path#Fragment')).toBe('Fragment');
  });

  it('returns empty string for null input', () => {
    expect(iriToLocalName(null)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(iriToLocalName('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(iriToLocalName(123)).toBe('');
  });

  it('returns empty string if IRI ends with # and has no fragment', () => {
    expect(iriToLocalName('http://example.org/ontology#')).toBe('');
  });

  it('handles IRI with only a scheme and local name', () => {
    expect(iriToLocalName('urn:example:Entity')).toBe('Entity');
  });
});

// ── splitCamelCase ──

describe('splitCamelCase', () => {
  it('splits PascalCase', () => {
    expect(splitCamelCase('MaterialEntity')).toBe('Material Entity');
  });

  it('splits camelCase', () => {
    expect(splitCamelCase('hasParticipantAt')).toBe('has Participant At');
  });

  it('splits consecutive uppercase letters', () => {
    expect(splitCamelCase('XMLParser')).toBe('XML Parser');
  });

  it('replaces underscores with spaces', () => {
    expect(splitCamelCase('BFO_0000001')).toBe('BFO 0000001');
  });

  it('handles already-separated words', () => {
    expect(splitCamelCase('already lowercase')).toBe('already lowercase');
  });

  it('handles single word', () => {
    expect(splitCamelCase('entity')).toBe('entity');
  });

  it('returns empty string for null', () => {
    expect(splitCamelCase(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(splitCamelCase('')).toBe('');
  });

  it('collapses multiple spaces', () => {
    expect(splitCamelCase('already__separated')).toBe('already separated');
  });
});

// ── extractLabel ──

describe('extractLabel', () => {
  it('extracts rdfs:label as first priority', () => {
    const owlClass = {
      iri: 'http://purl.obolibrary.org/obo/BFO_0000001',
      annotations: [
        { property: 'rdfs:label', value: 'Entity', language: 'en' },
        { property: 'skos:prefLabel', value: 'BFO Entity', language: 'en' },
      ],
    };
    const result = extractLabel(owlClass);
    expect(result.displayLabel).toBe('Entity');
    expect(result.source).toBe('rdfs:label');
  });

  it('falls back to skos:prefLabel when rdfs:label absent', () => {
    const owlClass = {
      iri: 'http://purl.obolibrary.org/obo/BFO_0000002',
      annotations: [
        { property: 'skos:prefLabel', value: 'Continuant', language: 'en' },
      ],
    };
    const result = extractLabel(owlClass);
    expect(result.displayLabel).toBe('Continuant');
    expect(result.source).toBe('skos:prefLabel');
  });

  it('falls back to URI fragment when no annotations present', () => {
    const owlClass = {
      iri: 'http://example.org/ontology#MaterialEntity',
      annotations: [],
    };
    const result = extractLabel(owlClass);
    expect(result.displayLabel).toBe('Material Entity');
    expect(result.source).toBe('uriFragment');
  });

  it('produces a canonical label via simplify()', () => {
    const owlClass = {
      iri: 'http://purl.obolibrary.org/obo/BFO_0000040',
      annotations: [
        { property: 'rdfs:label', value: '  Material Entity  ', language: 'en' },
      ],
    };
    const result = extractLabel(owlClass);
    expect(result.canonicalLabel).toBe('material entity');
  });

  it('falls back to full IRI when all extraction methods fail', () => {
    const owlClass = {
      iri: '',
      annotations: [],
    };
    const result = extractLabel(owlClass);
    expect(result.source).toBe('iri');
  });

  it('prefers locale-matched annotation', () => {
    const owlClass = {
      iri: 'http://example.org/test',
      annotations: [
        { property: 'rdfs:label', value: 'Entität', language: 'de' },
        { property: 'rdfs:label', value: 'Entity', language: 'en' },
      ],
    };
    const result = extractLabel(owlClass, { locale: 'en' });
    expect(result.displayLabel).toBe('Entity');
  });

  it('falls back to untagged annotation when locale not matched', () => {
    const owlClass = {
      iri: 'http://example.org/test',
      annotations: [
        { property: 'rdfs:label', value: 'Entität', language: 'de' },
        { property: 'rdfs:label', value: 'Entity' },
      ],
    };
    const result = extractLabel(owlClass, { locale: 'fr' });
    expect(result.displayLabel).toBe('Entity');
  });

  it('respects custom labelExtractionPriority', () => {
    const owlClass = {
      iri: 'http://example.org/ontology#MyClass',
      annotations: [
        { property: 'rdfs:label', value: 'My Class Label', language: 'en' },
        { property: 'skos:prefLabel', value: 'Preferred', language: 'en' },
      ],
    };
    // Put skos:prefLabel first
    const result = extractLabel(owlClass, {
      labelExtractionPriority: ['skos:prefLabel', 'rdfs:label', 'uriFragment'],
    });
    expect(result.displayLabel).toBe('Preferred');
    expect(result.source).toBe('skos:prefLabel');
  });

  it('handles missing annotations array', () => {
    const owlClass = {
      iri: 'http://example.org/ontology#SomeClass',
    };
    const result = extractLabel(owlClass);
    expect(result.displayLabel).toBe('Some Class');
    expect(result.source).toBe('uriFragment');
  });

  it('returns languageTag from simplify', () => {
    const owlClass = {
      iri: 'http://example.org/test',
      annotations: [
        { property: 'rdfs:label', value: 'Test', language: 'en' },
      ],
    };
    const result = extractLabel(owlClass, { locale: 'en' });
    expect(result.languageTag).toBe('en');
  });

  it('handles BFO-style numeric IRI with underscore', () => {
    const owlClass = {
      iri: 'http://purl.obolibrary.org/obo/BFO_0000002',
      annotations: [],
    };
    const result = extractLabel(owlClass);
    // iriToLocalName → "BFO_0000002", splitCamelCase → "BFO 0000002"
    expect(result.displayLabel).toBe('BFO 0000002');
    expect(result.source).toBe('uriFragment');
  });

  it('skips whitespace-only annotation values', () => {
    const owlClass = {
      iri: 'http://example.org/ontology#FallbackClass',
      annotations: [
        { property: 'rdfs:label', value: '   ', language: 'en' },
      ],
    };
    const result = extractLabel(owlClass);
    // rdfs:label is whitespace-only, so falls through to uriFragment
    expect(result.source).toBe('uriFragment');
    expect(result.displayLabel).toBe('Fallback Class');
  });

  it('passes abbreviationTable to simplify', () => {
    const owlClass = {
      iri: 'http://example.org/test',
      annotations: [
        { property: 'rdfs:label', value: 'govt entity', language: 'en' },
      ],
    };
    const result = extractLabel(owlClass, {
      abbreviationTable: { govt: 'government' },
    });
    expect(result.canonicalLabel).toBe('government entity');
  });
});
