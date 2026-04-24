/**
 * Unit tests — DependencyGraph (DP-2.2 consumer of X1 memo operational def).
 */

import {
  buildDependencyGraph,
  OERSPreconditionError,
} from '../../../src/core/d16/dependency-graph.js';

// X1 worked example (§3 of memo).
const WORKED_EXAMPLE = () => ({
  cauSet: [':Action', ':Agent', ':Plan'],
  objectProperties: [
    { iri: ':performedBy', domain: [':Action'], range: [':Agent'] },
  ],
  restrictions: [
    { subject: ':Action', onProperty: ':hasPlan', target: [':Plan'] },
  ],
});

describe('buildDependencyGraph — X1 worked example', () => {
  it('Action and Agent are neighbors (criterion 1)', () => {
    const g = buildDependencyGraph(WORKED_EXAMPLE());
    expect(g.getNeighbors(':Action').has(':Agent')).toBe(true);
  });

  it('Action and Plan are neighbors (criterion 2)', () => {
    const g = buildDependencyGraph(WORKED_EXAMPLE());
    expect(g.getNeighbors(':Action').has(':Plan')).toBe(true);
  });

  it('Agent and Plan are NOT neighbors (memo §3.3)', () => {
    const g = buildDependencyGraph(WORKED_EXAMPLE());
    expect(g.getNeighbors(':Agent').has(':Plan')).toBe(false);
    expect(g.getNeighbors(':Plan').has(':Agent')).toBe(false);
  });

  it('cascade from :Action reaches {:Agent, :Plan}', () => {
    const g = buildDependencyGraph(WORKED_EXAMPLE());
    expect(g.getNeighbors(':Action')).toEqual(new Set([':Agent', ':Plan']));
  });

  it('cascade from :Plan reaches {:Action} only', () => {
    const g = buildDependencyGraph(WORKED_EXAMPLE());
    expect(g.getNeighbors(':Plan')).toEqual(new Set([':Action']));
  });
});

describe('symmetry (§2.2)', () => {
  it('isNeighbor is symmetric', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [{ iri: ':p', domain: [':A'], range: [':B'] }],
      restrictions: [],
    });
    expect(g.getNeighbors(':A').has(':B')).toBe(true);
    expect(g.getNeighbors(':B').has(':A')).toBe(true);
  });
});

describe('corner cases', () => {
  it('§4.1 self-edges dropped', () => {
    const g = buildDependencyGraph({
      cauSet: [':Self'],
      objectProperties: [],
      restrictions: [{ subject: ':Self', onProperty: ':followedBy', target: [':Self'] }],
    });
    expect(g.getNeighbors(':Self').has(':Self')).toBe(false);
    expect(g.edgeCount()).toBe(0);
  });

  it('§4.2 no transitive closure', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B', ':C'],
      objectProperties: [
        { iri: ':p1', domain: [':A'], range: [':B'] },
        { iri: ':p2', domain: [':B'], range: [':C'] },
      ],
      restrictions: [],
    });
    expect(g.getNeighbors(':A').has(':C')).toBe(false);
    expect(g.getNeighbors(':A').has(':B')).toBe(true);
    expect(g.getNeighbors(':B').has(':C')).toBe(true);
  });

  it('§4.3 subproperty inherits domain/range from superproperty', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [
        { iri: ':super', domain: [':A'], range: [':B'] },
        { iri: ':sub', superProperties: [':super'] },
      ],
      restrictions: [],
    });
    // Sub inherits domain A, range B from super — edge fires under sub too.
    expect(g.getNeighbors(':A').has(':B')).toBe(true);
    const meta = g.getEdgeMetadata(':A', ':B');
    expect(meta.properties.has(':super')).toBe(true);
    expect(meta.properties.has(':sub')).toBe(true);
  });

  it('§4.3 subproperty cycle does not hang (OBO-scale correctness constraint)', () => {
    const g = buildDependencyGraph({
      cauSet: [':X', ':Y'],
      objectProperties: [
        { iri: ':p', domain: [':X'], range: [':Y'], superProperties: [':q'] },
        { iri: ':q', superProperties: [':r'] },
        { iri: ':r', superProperties: [':p'] }, // cycle
      ],
      restrictions: [],
    });
    // Cycle participants share union of domain/range per SCC treatment.
    expect(g.getNeighbors(':X').has(':Y')).toBe(true);
  });

  it('§4.4 disjunctive domain: any named class in DNF contributes', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B', ':Other'],
      objectProperties: [
        { iri: ':p', domain: [':A', ':Other'], range: [':B'] },
      ],
      restrictions: [],
    });
    expect(g.getNeighbors(':A').has(':B')).toBe(true);
    expect(g.getNeighbors(':Other').has(':B')).toBe(true);
  });

  it('§4.5 recursive named-class extraction through restriction targets', () => {
    const g = buildDependencyGraph({
      cauSet: [':C1', ':A', ':B'],
      objectProperties: [],
      restrictions: [
        // C1 SubClassOf ∃P.(A ⊓ ∃Q.B) — after named-class unfolding, targets are {A, B}
        { subject: ':C1', onProperty: ':P', target: [':A', ':B'] },
      ],
    });
    expect(g.getNeighbors(':C1')).toEqual(new Set([':A', ':B']));
    expect(g.getNeighbors(':A').has(':B')).toBe(false); // not transitive
  });

  it('§4.6 annotation properties excluded from criterion 1', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [
        { iri: 'http://www.w3.org/2000/01/rdf-schema#comment', domain: [':A'], range: [':B'] },
      ],
      restrictions: [],
    });
    expect(g.getNeighbors(':A').has(':B')).toBe(false);
    expect(g.edgeCount()).toBe(0);
  });

  it('§4.6 annotation properties excluded from criterion 2', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [],
      restrictions: [
        { subject: ':A', onProperty: 'http://www.w3.org/2004/02/skos/core#prefLabel', target: [':B'] },
      ],
    });
    expect(g.getNeighbors(':A').has(':B')).toBe(false);
  });

  it('§4.10 out-of-scope classes in domain/range produce no edges for out-of-scope classes', () => {
    const g = buildDependencyGraph({
      cauSet: [':InScope'],
      objectProperties: [
        { iri: ':p', domain: [':InScope', ':ImportedOther'], range: [':AlsoImported'] },
      ],
      restrictions: [],
    });
    expect(g.getNeighbors(':InScope').size).toBe(0); // no in-scope co-occupant
    expect(g.nodes().has(':ImportedOther')).toBe(false);
  });
});

describe('OERS precondition (§4.9)', () => {
  it('fail-fast (default) throws on un-canonicalized equivalent classes', () => {
    expect(() => buildDependencyGraph({
      cauSet: [':ex:Person', ':foaf:Person'],
      objectProperties: [],
      restrictions: [],
      equivalenceAxioms: [{ classA: ':ex:Person', classB: ':foaf:Person', sourceAxiomIRI: 'eq1' }],
    })).toThrow(OERSPreconditionError);
  });

  it('OERSPreconditionError carries equivalent pair + axiom IRI', () => {
    try {
      buildDependencyGraph({
        cauSet: [':A', ':B'],
        objectProperties: [],
        restrictions: [],
        equivalenceAxioms: [{ classA: ':A', classB: ':B', sourceAxiomIRI: 'ax-eq-1' }],
      });
    } catch (e) {
      expect(e).toBeInstanceOf(OERSPreconditionError);
      expect(e.equivalentPair).toEqual([':A', ':B']);
      expect(e.axiomIRI).toBe('ax-eq-1');
    }
  });

  it('collapse strategy canonicalizes equivalent classes into a single node', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B', ':C'],
      objectProperties: [
        { iri: ':p', domain: [':A'], range: [':C'] },
      ],
      restrictions: [],
      equivalenceAxioms: [{ classA: ':A', classB: ':B' }],
    }, { onUncanonicalizedEquivalence: 'collapse' });

    // :A and :B collapse — canonical is :A (lex-lower).
    // Query via :B maps to :A.
    expect(g.getNeighbors(':A').has(':C')).toBe(true);
    expect(g.getNeighbors(':B').has(':C')).toBe(true);
  });

  it('rejects unknown recovery strategy', () => {
    expect(() => buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [],
      restrictions: [],
      equivalenceAxioms: [{ classA: ':A', classB: ':B' }],
    }, { onUncanonicalizedEquivalence: 'bogus' })).toThrow(TypeError);
  });

  it('ignores equivalence axioms where classes are not both in CAU set', () => {
    // Imported equivalence between out-of-scope classes doesn't trigger.
    expect(() => buildDependencyGraph({
      cauSet: [':A'],
      objectProperties: [],
      restrictions: [],
      equivalenceAxioms: [{ classA: ':OutA', classB: ':OutB' }],
    })).not.toThrow();
  });
});

describe('edge metadata', () => {
  it('records criterion and attributing property', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [{ iri: ':p', domain: [':A'], range: [':B'] }],
      restrictions: [],
    });
    const meta = g.getEdgeMetadata(':A', ':B');
    expect(meta.criteria.has(1)).toBe(true);
    expect(meta.properties.has(':p')).toBe(true);
  });

  it('same pair linked by both criteria accumulates both in edge metadata', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [{ iri: ':p', domain: [':A'], range: [':B'] }],
      restrictions: [{ subject: ':A', onProperty: ':q', target: [':B'] }],
    });
    const meta = g.getEdgeMetadata(':A', ':B');
    expect(meta.criteria.has(1)).toBe(true);
    expect(meta.criteria.has(2)).toBe(true);
    expect(meta.properties).toEqual(new Set([':p', ':q']));
  });

  it('symmetric edge lookup', () => {
    const g = buildDependencyGraph({
      cauSet: [':A', ':B'],
      objectProperties: [{ iri: ':p', domain: [':A'], range: [':B'] }],
      restrictions: [],
    });
    expect(g.getEdgeMetadata(':A', ':B')).toEqual(g.getEdgeMetadata(':B', ':A'));
  });
});

describe('degenerate cases', () => {
  it('empty CAU set yields empty graph', () => {
    const g = buildDependencyGraph({ cauSet: [], objectProperties: [], restrictions: [] });
    expect(g.edgeCount()).toBe(0);
    expect(g.nodes().size).toBe(0);
  });

  it('no ObjectProperties + no restrictions yields empty edge set', () => {
    const g = buildDependencyGraph({ cauSet: [':A', ':B'], objectProperties: [], restrictions: [] });
    expect(g.edgeCount()).toBe(0);
  });

  it('unknown node returns empty neighbor set', () => {
    const g = buildDependencyGraph({ cauSet: [':A'], objectProperties: [], restrictions: [] });
    expect(g.getNeighbors(':UnknownCAU').size).toBe(0);
  });
});
