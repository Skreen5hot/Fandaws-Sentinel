import { describe, it, expect } from '@jest/globals';
import { createProperty } from '../../../src/types/property.js';

// Restriction Structural Correction v1.1: owl:onProperty stores the verb IRI,
// owl:someValuesFrom stores the noun (object concept IRI). See
// Ontology Ingestion Spec v1.4 §11.2.

const HAS = { verbIri: 'fandaws:objectProperty/has', verbLabel: 'has' };

describe('createProperty', () => {
  it('produces a node with @type owl:Restriction', () => {
    const prop = createProperty({
      id: 'fandaws:property/1b0dd4f6-cd2a-5e27-9ad4-a669b6db8c80/dog-has-fur',
      ...HAS,
      objectConceptIri: 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur',
      propertyLabel: 'fur',
      attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    });
    expect(prop['@type']).toBe('owl:Restriction');
  });

  it('sets all required fields', () => {
    const prop = createProperty({
      id: 'fandaws:property/ef11b461-246b-5b66-9e06-67383dea04b2/animal-has-eyes',
      ...HAS,
      objectConceptIri: 'fandaws:class/00000000-0000-0000-0000-000000000001/eyes',
      propertyLabel: 'eyes',
      attachedTo: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
      scope: 'inherited',
      value: null,
    });
    expect(prop['@id']).toBe('fandaws:property/ef11b461-246b-5b66-9e06-67383dea04b2/animal-has-eyes');
    expect(prop['owl:onProperty']).toBe('fandaws:objectProperty/has');
    expect(prop['owl:someValuesFrom']).toBe('fandaws:class/00000000-0000-0000-0000-000000000001/eyes');
    expect(prop['fandaws:verbLabel']).toBe('has');
    expect(prop['fandaws:propertyLabel']).toBe('eyes');
    expect(prop['fandaws:attachedTo']).toBe('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal');
    expect(prop['fandaws:scope']).toBe('inherited');
    expect(prop['owl:hasValue']).toBeNull();
    expect(prop['fandaws:restrictionKind']).toBe('property');
  });

  it('defaults scope to concept-specific', () => {
    const prop = createProperty({
      id: 'fandaws:property/aecef3b9-51b1-54c9-ace0-4ce49331e2a8/x',
      ...HAS,
      objectConceptIri: 'fandaws:class/00000000-0000-0000-0000-000000000002/x',
      propertyLabel: 'x',
      attachedTo: 'fandaws:class/629fe391-8b95-582f-b445-3ecb957b4431/y',
    });
    expect(prop['fandaws:scope']).toBe('concept-specific');
  });

  it('accepts a property value', () => {
    const prop = createProperty({
      id: 'fandaws:property/12d695aa-1fca-5991-9fda-ebe7d4f37941/dog-has-legs',
      ...HAS,
      objectConceptIri: 'fandaws:class/00000000-0000-0000-0000-000000000003/legs',
      propertyLabel: 'legs',
      attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
      value: 4,
    });
    expect(prop['owl:hasValue']).toBe(4);
  });

  it('returns distinct objects per call', () => {
    const a = createProperty({
      id: 'a',
      ...HAS,
      objectConceptIri: 'fandaws:class/00000000-0000-0000-0000-000000000004/a',
      propertyLabel: 'a',
      attachedTo: 'x',
    });
    const b = createProperty({
      id: 'b',
      ...HAS,
      objectConceptIri: 'fandaws:class/00000000-0000-0000-0000-000000000005/b',
      propertyLabel: 'b',
      attachedTo: 'y',
    });
    expect(a).not.toBe(b);
  });

  it('includes fandaws:propertyLabel field', () => {
    const prop = createProperty({
      id: 'fandaws:property/test',
      ...HAS,
      objectConceptIri: 'fandaws:class/00000000-0000-0000-0000-000000000006/fur',
      propertyLabel: 'fur',
      attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog',
    });
    expect(prop).toHaveProperty('fandaws:propertyLabel', 'fur');
    expect(prop['owl:someValuesFrom']).toBe('fandaws:class/00000000-0000-0000-0000-000000000006/fur');
  });
});
