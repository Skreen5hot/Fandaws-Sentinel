import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { simplify } from '../../src/core/identity/identity-simplification.js';

const corpusPath = new URL('./identity-simplification-corpus.json', import.meta.url);
const { corpus } = JSON.parse(readFileSync(corpusPath, 'utf-8'));

describe('Identity Simplification — Golden Corpus', () => {
  it(`corpus has 25+ test cases (has ${corpus.length})`, () => {
    expect(corpus.length).toBeGreaterThanOrEqual(25);
  });

  for (const entry of corpus) {
    it(`[${entry.id}] "${entry.input}" → "${entry.expected.canonicalLabel}"`, () => {
      const result = simplify(entry.input, entry.options);
      expect(result).toEqual(entry.expected);
    });
  }
});
