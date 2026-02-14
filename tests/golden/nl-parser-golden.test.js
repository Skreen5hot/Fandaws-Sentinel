import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { parse } from '../../src/core/nl-parser/nl-parser.js';

const corpusPath = new URL('./nl-parser-corpus.json', import.meta.url);
const { corpus } = JSON.parse(readFileSync(corpusPath, 'utf-8'));

describe('NLParser — Golden Corpus', () => {
  it(`corpus has 40+ test cases (has ${corpus.length})`, () => {
    expect(corpus.length).toBeGreaterThanOrEqual(40);
  });

  for (const entry of corpus) {
    const verbType = entry.expected['fandaws:verbType'] || 'error';
    it(`[${entry.id}] "${entry.input}" → ${verbType}`, () => {
      const result = parse(entry.input, entry.context);
      expect(result).toEqual(entry.expected);
    });
  }
});
