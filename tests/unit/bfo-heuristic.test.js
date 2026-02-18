/**
 * BFO Heuristic — unit tests.
 *
 * Covers: BFO constants, suffix heuristic, exception map,
 * inheritance, adversarial cases, edge cases.
 */

import { describe, it, expect } from '@jest/globals';
import {
  BFO,
  HEURISTIC_EXCEPTIONS,
  inferBfoCategory,
  inheritBfoCategory,
} from '../../src/core/knowledge-engine/bfo-heuristic.js';

describe('BFO Heuristic', () => {
  describe('BFO constants', () => {
    it('has 11 category entries', () => {
      expect(Object.keys(BFO)).toHaveLength(11);
    });

    it('all values use bfo:BFO_ prefix', () => {
      for (const [key, value] of Object.entries(BFO)) {
        expect(value).toMatch(/^bfo:BFO_\d{7}$/);
      }
    });

    it('all values are unique', () => {
      const values = Object.values(BFO);
      expect(new Set(values).size).toBe(values.length);
    });

    it('contains materialEntity as default category', () => {
      expect(BFO.materialEntity).toBe('bfo:BFO_0000040');
    });

    it('contains process for occurrents', () => {
      expect(BFO.process).toBe('bfo:BFO_0000015');
    });

    it('contains quality for attributes', () => {
      expect(BFO.quality).toBe('bfo:BFO_0000019');
    });

    it('contains temporalRegion for time entities', () => {
      expect(BFO.temporalRegion).toBe('bfo:BFO_0000008');
    });

    it('contains genDepContinuant for information entities', () => {
      expect(BFO.genDepContinuant).toBe('bfo:BFO_0000031');
    });
  });

  describe('inferBfoCategory — suffix heuristic', () => {
    it('maps -ing suffix to process', () => {
      expect(inferBfoCategory('running')).toBe(BFO.process);
    });

    it('maps -tion suffix to process', () => {
      expect(inferBfoCategory('digestion')).toBe(BFO.process);
    });

    it('maps -sion suffix to process', () => {
      expect(inferBfoCategory('explosion')).toBe(BFO.process);
    });

    it('maps -ment suffix to process', () => {
      expect(inferBfoCategory('movement')).toBe(BFO.process);
    });

    it('maps -sis suffix to process', () => {
      expect(inferBfoCategory('photosynthesis')).toBe(BFO.process);
    });

    it('maps -ness suffix to quality', () => {
      expect(inferBfoCategory('redness')).toBe(BFO.quality);
    });

    it('maps -ity suffix to quality', () => {
      expect(inferBfoCategory('fragility')).toBe(BFO.quality);
    });

    it('maps -ence suffix to quality', () => {
      expect(inferBfoCategory('tolerance')).toBe(BFO.quality);
    });

    it('defaults to materialEntity for unmatched labels', () => {
      expect(inferBfoCategory('dog')).toBe(BFO.materialEntity);
    });

    it('defaults to materialEntity for "table"', () => {
      expect(inferBfoCategory('table')).toBe(BFO.materialEntity);
    });

    it('defaults to materialEntity for "water"', () => {
      expect(inferBfoCategory('water')).toBe(BFO.materialEntity);
    });

    it('uses last word for multi-word labels', () => {
      expect(inferBfoCategory('rapid movement')).toBe(BFO.process);
    });

    it('does not match suffix if word equals suffix', () => {
      // "ing" alone should not match (word length must exceed suffix length)
      expect(inferBfoCategory('ing')).toBe(BFO.materialEntity);
    });
  });

  describe('inferBfoCategory — heuristic exceptions', () => {
    it('maps "building" to materialEntity (not process)', () => {
      expect(inferBfoCategory('building')).toBe(BFO.materialEntity);
    });

    it('maps "king" to role (not process)', () => {
      expect(inferBfoCategory('king')).toBe(BFO.role);
    });

    it('maps "thing" to entity (not process)', () => {
      expect(inferBfoCategory('thing')).toBe(BFO.entity);
    });

    it('maps "nothing" to entity (not process)', () => {
      expect(inferBfoCategory('nothing')).toBe(BFO.entity);
    });

    it('maps "something" to entity (not process)', () => {
      expect(inferBfoCategory('something')).toBe(BFO.entity);
    });

    it('maps "flooring" to materialEntity (not process)', () => {
      expect(inferBfoCategory('flooring')).toBe(BFO.materialEntity);
    });

    it('maps "ceiling" to materialEntity (not process)', () => {
      expect(inferBfoCategory('ceiling')).toBe(BFO.materialEntity);
    });

    it('maps "ring" to materialEntity (not process)', () => {
      expect(inferBfoCategory('ring')).toBe(BFO.materialEntity);
    });

    it('maps "string" to materialEntity (not process)', () => {
      expect(inferBfoCategory('string')).toBe(BFO.materialEntity);
    });

    it('maps "spring" to materialEntity (not process)', () => {
      expect(inferBfoCategory('spring')).toBe(BFO.materialEntity);
    });

    it('maps "nation" to genDepContinuant (not process)', () => {
      expect(inferBfoCategory('nation')).toBe(BFO.genDepContinuant);
    });

    it('maps "station" to materialEntity (not process)', () => {
      expect(inferBfoCategory('station')).toBe(BFO.materialEntity);
    });

    it('maps "university" to materialEntity (not quality)', () => {
      expect(inferBfoCategory('university')).toBe(BFO.materialEntity);
    });

    it('maps "electricity" to disposition (not quality)', () => {
      expect(inferBfoCategory('electricity')).toBe(BFO.disposition);
    });

    it('maps "city" to materialEntity (not quality)', () => {
      expect(inferBfoCategory('city')).toBe(BFO.materialEntity);
    });

    it('maps "community" to genDepContinuant (not quality)', () => {
      expect(inferBfoCategory('community')).toBe(BFO.genDepContinuant);
    });

    it('exception applies to last word in multi-word label', () => {
      expect(inferBfoCategory('tall building')).toBe(BFO.materialEntity);
    });
  });

  describe('inferBfoCategory — edge cases', () => {
    it('handles null input', () => {
      expect(inferBfoCategory(null)).toBe(BFO.materialEntity);
    });

    it('handles undefined input', () => {
      expect(inferBfoCategory(undefined)).toBe(BFO.materialEntity);
    });

    it('handles empty string', () => {
      expect(inferBfoCategory('')).toBe(BFO.materialEntity);
    });

    it('is case-insensitive', () => {
      expect(inferBfoCategory('Running')).toBe(BFO.process);
      expect(inferBfoCategory('BUILDING')).toBe(BFO.materialEntity);
    });
  });

  describe('inheritBfoCategory', () => {
    it('inherits parent bfoMapping when present', () => {
      const parent = { bfoMapping: BFO.process };
      expect(inheritBfoCategory(parent, 'running')).toBe(BFO.process);
    });

    it('inherits parent bfoMapping even when child heuristic differs', () => {
      const parent = { bfoMapping: BFO.disposition };
      // "migration" would heuristically be process, but parent says disposition
      expect(inheritBfoCategory(parent, 'migration')).toBe(BFO.disposition);
    });

    it('falls back to heuristic when parent has no bfoMapping', () => {
      const parent = {};
      expect(inheritBfoCategory(parent, 'running')).toBe(BFO.process);
    });

    it('falls back to heuristic when parent is null', () => {
      expect(inheritBfoCategory(null, 'dog')).toBe(BFO.materialEntity);
    });

    it('detects BFO IRI in parent rdfs:subClassOf array', () => {
      const parent = {
        'rdfs:subClassOf': [BFO.quality, { '@type': 'owl:Restriction' }],
      };
      expect(inheritBfoCategory(parent, 'dog')).toBe(BFO.quality);
    });

    it('ignores non-BFO strings in rdfs:subClassOf', () => {
      const parent = {
        'rdfs:subClassOf': ['fandaws:class/something'],
      };
      expect(inheritBfoCategory(parent, 'dog')).toBe(BFO.materialEntity);
    });
  });

  describe('HEURISTIC_EXCEPTIONS map', () => {
    it('has at least 16 entries', () => {
      expect(Object.keys(HEURISTIC_EXCEPTIONS).length).toBeGreaterThanOrEqual(16);
    });

    it('all values are valid BFO IRIs', () => {
      for (const value of Object.values(HEURISTIC_EXCEPTIONS)) {
        expect(value).toMatch(/^bfo:BFO_\d{7}$/);
      }
    });
  });
});
