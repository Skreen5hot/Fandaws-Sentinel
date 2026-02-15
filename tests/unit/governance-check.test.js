/**
 * Governance Check — unit tests.
 *
 * v2.1: Uses v2.1 concept factories (label/prefLabel/broader).
 */

import { describe, it, expect } from '@jest/globals';
import {
  checkGovernanceBlock,
  createGovernanceEpistemicFailure,
  nullOCECheck,
  nullIEECheck,
} from '../../src/core/validator/governance-check.js';
import { createConcept } from '../../src/types/concept.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: 'fandaws:graph/test', concepts });
}

function makeConcept(id, label, broader = null) {
  return createConcept({
    id,
    label,
    prefLabel: label.toLowerCase(),
    broader,
  });
}

// ─────────────────────────────────────────────────────────
// checkGovernanceBlock
// ─────────────────────────────────────────────────────────

describe('checkGovernanceBlock', () => {
  it('returns { blocked: false } when concept is not in graph', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const graph = makeGraph([]);
    expect(checkGovernanceBlock(concept, graph)).toEqual({ blocked: false });
  });

  it('returns { blocked: false } when concept has no governance flag', () => {
    const existing = makeConcept('fandaws:concept/dog', 'Dog');
    const graph = makeGraph([existing]);
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    expect(checkGovernanceBlock(concept, graph)).toEqual({ blocked: false });
  });

  it('returns { blocked: false } for advisory severity', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'advisory',
        'fandaws:reason': 'Consider renaming.',
      },
    };
    const graph = makeGraph([existing]);
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    expect(checkGovernanceBlock(concept, graph).blocked).toBe(false);
  });

  it('returns { blocked: false } for warning severity', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'warning',
        'fandaws:reason': 'Might overlap with another concept.',
      },
    };
    const graph = makeGraph([existing]);
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    expect(checkGovernanceBlock(concept, graph).blocked).toBe(false);
  });

  it('returns { blocked: true } for blocking severity', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under review by governance team.',
      },
    };
    const graph = makeGraph([existing]);
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const result = checkGovernanceBlock(concept, graph);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBeDefined();
    expect(result.epistemicFailure).toBeDefined();
  });

  it('includes EpistemicFailure node when blocked', () => {
    const existing = {
      ...makeConcept('fandaws:concept/dog', 'Dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:type': 'oce-review',
        'fandaws:reason': 'OCE flagged.',
      },
    };
    const graph = makeGraph([existing]);
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const result = checkGovernanceBlock(concept, graph);
    expect(result.blocked).toBe(true);
    expect(result.flagType).toBe('oce-review');
    const ef = result.epistemicFailure;
    expect(ef['@type']).toBe('fandaws:EpistemicFailure');
    expect(ef['fandaws:conceptId']).toBe('fandaws:concept/dog');
    expect(ef['fandaws:mutationType']).toBe('governanceBlock');
    expect(ef['fandaws:escalatedToHuman']).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// createGovernanceEpistemicFailure
// ─────────────────────────────────────────────────────────

describe('createGovernanceEpistemicFailure', () => {
  it('produces valid EpistemicFailure shape', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const flag = { 'fandaws:severity': 'blocking', 'fandaws:reason': 'Review needed.' };
    const ef = createGovernanceEpistemicFailure(concept, flag);
    expect(ef['@type']).toBe('fandaws:EpistemicFailure');
    expect(ef['fandaws:conceptId']).toBe('fandaws:concept/dog');
    expect(ef['fandaws:mutationType']).toBe('governanceBlock');
    expect(ef['fandaws:rejectionReasons']).toEqual(['Review needed.']);
    expect(ef['fandaws:suggestedActions']).toHaveLength(1);
    expect(ef['fandaws:repairPaths']).toEqual([]);
    expect(ef['fandaws:escalatedToHuman']).toBe(false);
  });

  it('uses default reason when flag has none', () => {
    const concept = makeConcept('fandaws:concept/dog', 'Dog');
    const flag = { 'fandaws:severity': 'blocking' };
    const ef = createGovernanceEpistemicFailure(concept, flag);
    expect(ef['fandaws:rejectionReasons'][0]).toContain('Governance flag');
  });
});

// ─────────────────────────────────────────────────────────
// nullOCECheck / nullIEECheck
// ─────────────────────────────────────────────────────────

describe('nullOCECheck', () => {
  it('always returns coherent', () => {
    const result = nullOCECheck({}, 'fandaws:graph/test');
    expect(result.coherent).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.repairPaths).toEqual([]);
  });
});

describe('nullIEECheck', () => {
  it('always returns not contested', () => {
    const result = nullIEECheck({}, {});
    expect(result.contested).toBe(false);
    expect(result.flags).toEqual([]);
  });
});
