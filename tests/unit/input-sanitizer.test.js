/**
 * Input Sanitizer — unit tests.
 *
 * Covers: checkCompoundStatement, checkStructuralGrounding,
 * validateConfirmationResponse.
 *
 * v2.1: Uses isConceptNode, skos:broader, rdfs:subClassOf, owl:Restriction.
 */

import { describe, it, expect } from '@jest/globals';
import {
  checkCompoundStatement,
  checkStructuralGrounding,
  validateConfirmationResponse,
} from '../../src/core/validator/input-sanitizer.js';
import { createConcept } from '../../src/types/concept.js';
import { createProperty } from '../../src/types/property.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createGraphMutation } from '../../src/types/graph-mutation.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeMutation(additions = []) {
  return createGraphMutation({ additions, reason: 'test' });
}

function makeConcept(id, label, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
}

function makeProperty(id, propertyIri, attachedTo) {
  return createProperty({ id, propertyIri, attachedTo });
}

// ─────────────────────────────────────────────────────────
// checkCompoundStatement
// ─────────────────────────────────────────────────────────

describe('checkCompoundStatement', () => {
  it('returns null for empty additions', () => {
    const mutation = makeMutation([]);
    expect(checkCompoundStatement(mutation)).toBeNull();
  });

  it('returns null for a single concept addition', () => {
    const mutation = makeMutation([makeConcept('fandaws:concept/dog', 'Dog')]);
    expect(checkCompoundStatement(mutation)).toBeNull();
  });

  it('returns null when only non-concept nodes are added', () => {
    const mutation = makeMutation([
      makeProperty('fandaws:prop/1', 'color', 'fandaws:concept/dog'),
      makeProperty('fandaws:prop/2', 'size', 'fandaws:concept/cat'),
    ]);
    expect(checkCompoundStatement(mutation)).toBeNull();
  });

  it('returns null for two concepts forming a parent→child chain', () => {
    const parent = makeConcept('fandaws:concept/mammal', 'Mammal');
    const child = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/mammal',
    );
    const mutation = makeMutation([parent, child]);
    expect(checkCompoundStatement(mutation)).toBeNull();
  });

  it('returns null for a 3-concept IS_A chain', () => {
    const a = makeConcept('fandaws:concept/animal', 'Animal');
    const b = makeConcept(
      'fandaws:concept/mammal',
      'Mammal',
      'fandaws:concept/animal',
    );
    const c = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/mammal',
    );
    const mutation = makeMutation([a, b, c]);
    expect(checkCompoundStatement(mutation)).toBeNull();
  });

  it('rejects two unrelated concepts', () => {
    const a = makeConcept('fandaws:concept/dog', 'Dog');
    const b = makeConcept('fandaws:concept/planet', 'Planet');
    const mutation = makeMutation([a, b]);
    const result = checkCompoundStatement(mutation);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('compoundStatement');
    expect(result.conceptIris).toHaveLength(2);
  });

  it('rejects three concepts where two are chained but third is unrelated', () => {
    const a = makeConcept('fandaws:concept/animal', 'Animal');
    const b = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const c = makeConcept('fandaws:concept/planet', 'Planet');
    const mutation = makeMutation([a, b, c]);
    const result = checkCompoundStatement(mutation);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('compoundStatement');
  });

  it('ignores non-concept additions when counting', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const prop = makeProperty(
      'fandaws:prop/1',
      'color',
      'fandaws:concept/dog',
    );
    const mutation = makeMutation([concept, prop]);
    expect(checkCompoundStatement(mutation)).toBeNull();
  });

  it('handles mutation with missing additions gracefully', () => {
    const mutation = { '@type': 'fandaws:GraphMutation' };
    expect(checkCompoundStatement(mutation)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// checkStructuralGrounding
// ─────────────────────────────────────────────────────────

describe('checkStructuralGrounding', () => {
  it('returns null when concept has a parent in the graph', () => {
    const parent = makeConcept('fandaws:concept/animal', 'Animal');
    const graph = makeGraph([parent]);
    const child = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const mutation = makeMutation([child]);
    expect(checkStructuralGrounding(child, graph, mutation)).toBeNull();
  });

  it('returns null when concept has a parent in mutation additions', () => {
    const parent = makeConcept('fandaws:concept/animal', 'Animal');
    const child = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const mutation = makeMutation([parent, child]);
    const graph = makeGraph([]);
    expect(checkStructuralGrounding(child, graph, mutation)).toBeNull();
  });

  it('returns null when concept already exists in graph with a parent', () => {
    const existing = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/animal',
    );
    const graph = makeGraph([existing]);
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const mutation = makeMutation([concept]);
    expect(checkStructuralGrounding(concept, graph, mutation)).toBeNull();
  });

  it('returns null when concept has allowRoot flag', () => {
    const concept = {
      ...makeConcept('fandaws:concept/thing', 'Thing'),
      'fandaws:allowRoot': true,
    };
    const graph = makeGraph([]);
    const mutation = makeMutation([concept]);
    expect(checkStructuralGrounding(concept, graph, mutation)).toBeNull();
  });

  it('returns null when concept has restrictions in graph rdfs:subClassOf', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'rdfs:subClassOf': [
        {
          '@id': 'fandaws:prop/color',
          '@type': 'owl:Restriction',
          'owl:onProperty': 'color',
          'fandaws:restrictionKind': 'property',
          'fandaws:attachedTo': 'fandaws:concept/dog',
        },
      ],
    };
    const graph = makeGraph([existing]);
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const mutation = makeMutation([concept]);
    expect(checkStructuralGrounding(concept, graph, mutation)).toBeNull();
  });

  it('returns null when concept has properties in mutation additions', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const prop = makeProperty(
      'fandaws:prop/color',
      'color',
      'fandaws:concept/dog',
    );
    const mutation = makeMutation([concept, prop]);
    const graph = makeGraph([]);
    expect(checkStructuralGrounding(concept, graph, mutation)).toBeNull();
  });

  it('returns violation when concept is completely ungrounded', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const graph = makeGraph([]);
    const mutation = makeMutation([concept]);
    const result = checkStructuralGrounding(concept, graph, mutation);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('structuralGroundingError');
    expect(result.conceptIri).toBe('fandaws:concept/dog');
  });

  it('returns violation when parent IRI is not found anywhere', () => {
    const concept = makeConcept(
      'fandaws:concept/dog',
      'Dog',
      'fandaws:concept/nonexistent',
    );
    const graph = makeGraph([]);
    const mutation = makeMutation([concept]);
    const result = checkStructuralGrounding(concept, graph, mutation);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('structuralGroundingError');
  });

  it('handles graph with missing concepts array', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const graph = { '@type': 'fandaws:KnowledgeGraph' };
    const mutation = makeMutation([concept]);
    const result = checkStructuralGrounding(concept, graph, mutation);
    expect(result).not.toBeNull();
    expect(result.reason).toBe('structuralGroundingError');
  });
});

// ─────────────────────────────────────────────────────────
// validateConfirmationResponse
// ─────────────────────────────────────────────────────────

describe('validateConfirmationResponse', () => {
  it('accepts "yes"', () => {
    expect(validateConfirmationResponse('yes')).toEqual({ accepted: true, value: 'yes' });
  });

  it('accepts "y"', () => {
    expect(validateConfirmationResponse('y')).toEqual({ accepted: true, value: 'yes' });
  });

  it('accepts "YES" (case insensitive)', () => {
    expect(validateConfirmationResponse('YES')).toEqual({ accepted: true, value: 'yes' });
  });

  it('accepts "no"', () => {
    expect(validateConfirmationResponse('no')).toEqual({ accepted: true, value: 'no' });
  });

  it('accepts "n"', () => {
    expect(validateConfirmationResponse('n')).toEqual({ accepted: true, value: 'no' });
  });

  it('accepts "N" (case insensitive)', () => {
    expect(validateConfirmationResponse('N')).toEqual({ accepted: true, value: 'no' });
  });

  it('rejects empty string', () => {
    expect(validateConfirmationResponse('')).toEqual({ accepted: false, value: null });
  });

  it('rejects arbitrary text', () => {
    expect(validateConfirmationResponse('maybe')).toEqual({ accepted: false, value: null });
  });

  it('rejects non-string input', () => {
    expect(validateConfirmationResponse(42)).toEqual({ accepted: false, value: null });
  });

  it('trims whitespace before normalizing', () => {
    expect(validateConfirmationResponse('  Yes  ')).toEqual({ accepted: true, value: 'yes' });
  });
});
