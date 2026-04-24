/**
 * Unit tests — axiom dictionary (DP-2.2 / DP-2-R5).
 */

import {
  internAxiom,
  resolveAxiom,
  snapshotDictionary,
  dictionarySize,
  clearDictionary,
  resetForTests,
} from '../../../src/core/d16/axiom-dictionary.js';

beforeEach(() => resetForTests());

describe('internAxiom', () => {
  it('returns a 64-char hex id', async () => {
    const { id } = await internAxiom({
      sessionId: 'sess-1',
      axiom: { iri: 'ex:hasPart', kind: 'restriction', target: 'ex:Continuant' },
    });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns identical ids for semantically equal axioms (key order irrelevant)', async () => {
    const a = await internAxiom({
      sessionId: 'sess-2',
      axiom: { iri: 'ex:P', kind: 'restriction', target: 'ex:T' },
    });
    const b = await internAxiom({
      sessionId: 'sess-2',
      axiom: { target: 'ex:T', iri: 'ex:P', kind: 'restriction' },
    });
    expect(a.id).toBe(b.id);
  });

  it('returns different ids for semantically different axioms', async () => {
    const a = await internAxiom({
      sessionId: 'sess-3',
      axiom: { iri: 'ex:P', target: 'ex:T1' },
    });
    const b = await internAxiom({
      sessionId: 'sess-3',
      axiom: { iri: 'ex:P', target: 'ex:T2' },
    });
    expect(a.id).not.toBe(b.id);
  });

  it('cross-session determinism: same axiom produces same id in different sessions', async () => {
    const axiom = { iri: 'ex:hasParticipant', target: 'bfo:Continuant' };
    const a = await internAxiom({ sessionId: 'sess-A', axiom });
    const b = await internAxiom({ sessionId: 'sess-B', axiom });
    expect(a.id).toBe(b.id);
  });

  it('rejects missing sessionId', async () => {
    await expect(internAxiom({ sessionId: '', axiom: {} })).rejects.toThrow(TypeError);
  });

  it('rejects null axiom', async () => {
    await expect(internAxiom({ sessionId: 'sess-4', axiom: null })).rejects.toThrow(TypeError);
    await expect(internAxiom({ sessionId: 'sess-4', axiom: undefined })).rejects.toThrow(TypeError);
  });
});

describe('dictionary deduplication (dp2-axiom-dictionary-deduplication AVC scenario)', () => {
  it('10 records sharing the same axiom produce a size-1 dictionary', async () => {
    const sharedAxiom = { iri: 'bfo:hasParticipant', target: 'bfo:Continuant', kind: 'existentialRestriction' };
    const ids = [];
    for (let i = 0; i < 10; i++) {
      const { id } = await internAxiom({ sessionId: 'shared-sess', axiom: sharedAxiom });
      ids.push(id);
    }
    expect(new Set(ids).size).toBe(1);
    expect(dictionarySize('shared-sess')).toBe(1);
  });

  it('records with mix of shared + unique axioms dedupe appropriately', async () => {
    const shared = { iri: 'ex:shared' };
    const ids = await Promise.all([
      internAxiom({ sessionId: 'mix', axiom: shared }),
      internAxiom({ sessionId: 'mix', axiom: shared }),
      internAxiom({ sessionId: 'mix', axiom: { iri: 'ex:unique1' } }),
      internAxiom({ sessionId: 'mix', axiom: { iri: 'ex:unique2' } }),
      internAxiom({ sessionId: 'mix', axiom: shared }),
    ]);
    expect(dictionarySize('mix')).toBe(3);
    expect(ids[0].id).toBe(ids[1].id);
    expect(ids[0].id).toBe(ids[4].id);
    expect(ids[0].id).not.toBe(ids[2].id);
    expect(ids[2].id).not.toBe(ids[3].id);
  });
});

describe('resolveAxiom', () => {
  it('recovers axiom content by id', async () => {
    const axiom = { iri: 'ex:rel', kind: 'property' };
    const { id } = await internAxiom({ sessionId: 'resolve-sess', axiom });
    const entry = resolveAxiom('resolve-sess', id);
    expect(entry.axiom).toEqual(axiom);
    expect(entry.hash).toBe(id);
    expect(entry.canonicalForm).toContain('"iri":"ex:rel"');
  });

  it('returns null for unknown session', () => {
    expect(resolveAxiom('no-such-session', 'anyhash')).toBeNull();
  });

  it('returns null for unknown id in known session', async () => {
    await internAxiom({ sessionId: 'known', axiom: { iri: 'x' } });
    expect(resolveAxiom('known', '0'.repeat(64))).toBeNull();
  });
});

describe('snapshotDictionary', () => {
  it('returns empty array for unknown session', () => {
    expect(snapshotDictionary('unknown')).toEqual([]);
  });

  it('returns all interned entries with {id, axiom, canonicalForm}', async () => {
    await internAxiom({ sessionId: 'snap', axiom: { a: 1 } });
    await internAxiom({ sessionId: 'snap', axiom: { b: 2 } });
    const snap = snapshotDictionary('snap');
    expect(snap).toHaveLength(2);
    for (const entry of snap) {
      expect(entry.id).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.canonicalForm).toBeDefined();
      expect(entry.axiom).toBeDefined();
    }
  });
});

describe('session isolation', () => {
  it('clearDictionary removes session entries', async () => {
    await internAxiom({ sessionId: 'clear-me', axiom: { x: 1 } });
    expect(dictionarySize('clear-me')).toBe(1);
    clearDictionary('clear-me');
    expect(dictionarySize('clear-me')).toBe(0);
  });

  it('different sessions have independent dictionaries', async () => {
    await internAxiom({ sessionId: 'A', axiom: { x: 1 } });
    await internAxiom({ sessionId: 'B', axiom: { y: 2 } });
    await internAxiom({ sessionId: 'A', axiom: { z: 3 } });
    expect(dictionarySize('A')).toBe(2);
    expect(dictionarySize('B')).toBe(1);
  });
});
