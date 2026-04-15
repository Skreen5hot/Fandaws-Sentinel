/**
 * ERS Type Layer — backward compatibility tests.
 *
 * Validates that property/relationship factories produce identical output
 * without ERS fields, and include them when provided.
 *
 * @see docs/architecture/NAC_ERS_Test_Specification_v1.1.md §2 (TYP-01 to TYP-07)
 */

import { describe, it, expect } from '@jest/globals';
import { createProperty } from '../../src/types/property.js';
import { createRelationship } from '../../src/types/relationship.js';
import { FANDAWS_CONTEXT } from '../../src/types/context.js';

describe('ERS Type Layer — Backward Compatibility', () => {
  describe('TYP-01: Property without register fields → identical to v1', () => {
    it('produces output with no register fields present', () => {
      const prop = createProperty({
        id: 'fandaws:property/abc',
        verbIri: 'fandaws:objectProperty/has',
        verbLabel: 'has',
        objectConceptIri: 'has_color',
        propertyLabel: 'has_color',
        attachedTo: 'fandaws:class/dog',
        value: 'brown',
      });

      // ERS fields must be absent, not null
      expect(prop).not.toHaveProperty('fandaws:epistemicRegister');
      expect(prop).not.toHaveProperty('fandaws:routingRecord');
      expect(prop).not.toHaveProperty('fandaws:routingFlags');

      // Core shape unchanged
      expect(prop['@id']).toBe('fandaws:property/abc');
      expect(prop['@type']).toBe('owl:Restriction');
      expect(prop['owl:onProperty']).toBe('fandaws:objectProperty/has');
      expect(prop['owl:someValuesFrom']).toBe('has_color');
      expect(prop['owl:hasValue']).toBe('brown');
      expect(prop['fandaws:attachedTo']).toBe('fandaws:class/dog');
      expect(prop['fandaws:restrictionKind']).toBe('property');
    });
  });

  describe('TYP-02: Property with register fields includes them', () => {
    it('includes all three ERS fields when provided', () => {
      const record = { '@id': 'fandaws:routing/test', '@type': 'fandaws:RegisterRoutingRecord' };
      const prop = createProperty({
        id: 'fandaws:property/xyz',
        verbIri: 'fandaws:objectProperty/has',
        verbLabel: 'has',
        objectConceptIri: 'has_arm',
        propertyLabel: 'has_arm',
        attachedTo: 'fandaws:class/human',
        value: 'two',
        epistemicRegister: 'fandaws:register/normative',
        routingRecord: record,
        routingFlags: ['role-heightened-sensitivity'],
      });

      expect(prop['fandaws:epistemicRegister']).toBe('fandaws:register/normative');
      expect(prop['fandaws:routingRecord']).toBe(record);
      expect(prop['fandaws:routingFlags']).toEqual(['role-heightened-sensitivity']);
    });
  });

  describe('TYP-03: Property with empty routingFlags omits the field', () => {
    it('omits routingFlags when array is empty', () => {
      const prop = createProperty({
        id: 'fandaws:property/xyz',
        verbIri: 'fandaws:objectProperty/has',
        verbLabel: 'has',
        objectConceptIri: 'has_sides',
        propertyLabel: 'has_sides',
        attachedTo: 'fandaws:class/triangle',
        value: 'three',
        routingFlags: [],
      });

      expect(prop).not.toHaveProperty('fandaws:routingFlags');
    });
  });

  describe('TYP-04: Property with null register omits the field', () => {
    it('omits epistemicRegister when null', () => {
      const prop = createProperty({
        id: 'fandaws:property/xyz',
        verbIri: 'fandaws:objectProperty/has',
        verbLabel: 'has',
        objectConceptIri: 'has_sides',
        propertyLabel: 'has_sides',
        attachedTo: 'fandaws:class/triangle',
        value: 'three',
        epistemicRegister: null,
      });

      expect(prop).not.toHaveProperty('fandaws:epistemicRegister');
    });
  });

  describe('TYP-05: Relationship with register fields includes them', () => {
    it('includes epistemicRegister on relationship', () => {
      const rel = createRelationship({
        id: 'fandaws:relationship/abc',
        verbIri: 'chase',
        subject: 'fandaws:class/dog',
        object: 'fandaws:class/cat',
        epistemicRegister: 'fandaws:register/axiomatic',
      });

      expect(rel['fandaws:epistemicRegister']).toBe('fandaws:register/axiomatic');
    });
  });

  describe('TYP-06: Relationship without register fields → identical to v1', () => {
    it('produces output with no register fields present', () => {
      const rel = createRelationship({
        id: 'fandaws:relationship/abc',
        verbIri: 'chase',
        subject: 'fandaws:class/dog',
        object: 'fandaws:class/cat',
      });

      expect(rel).not.toHaveProperty('fandaws:epistemicRegister');
      expect(rel).not.toHaveProperty('fandaws:routingRecord');
      expect(rel).not.toHaveProperty('fandaws:routingFlags');

      // Core shape unchanged
      expect(rel['@id']).toBe('fandaws:relationship/abc');
      expect(rel['@type']).toBe('owl:Restriction');
      expect(rel['owl:onProperty']).toBe('chase');
      expect(rel['owl:someValuesFrom']).toBe('fandaws:class/cat');
      expect(rel['fandaws:attachedTo']).toBe('fandaws:class/dog');
      expect(rel['fandaws:restrictionKind']).toBe('relationship');
    });
  });

  describe('TYP-07: Context includes register-related entries', () => {
    it('includes fandaws:epistemicRegister mapping', () => {
      const ctx = FANDAWS_CONTEXT['@context'];
      expect(ctx['fandaws:epistemicRegister']).toBeDefined();
      expect(ctx['fandaws:epistemicRegister']['@type']).toBe('@id');
    });

    it('includes fandaws:routingRecord mapping', () => {
      const ctx = FANDAWS_CONTEXT['@context'];
      expect(ctx['fandaws:routingRecord']).toBeDefined();
      expect(ctx['fandaws:routingRecord']['@type']).toBe('@id');
    });

    it('includes fandaws:routingFlags mapping', () => {
      const ctx = FANDAWS_CONTEXT['@context'];
      expect(ctx['fandaws:routingFlags']).toBeDefined();
      expect(ctx['fandaws:routingFlags']['@container']).toBe('@set');
    });
  });
});
