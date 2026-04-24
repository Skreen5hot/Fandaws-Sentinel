/**
 * Unit tests — DP-2.3.0 crypto shim + ingestion byte registry.
 *
 * Verifies:
 *   - sha256 produces 64-char lowercase hex for strings and Uint8Array
 *   - sha256 matches known test vectors (NIST FIPS 180-4)
 *   - byteLengthOf matches UTF-8 encoding length
 *   - Registry captures source/BFO/curated hashes per session
 *   - Idempotent re-capture with same bytes succeeds
 *   - Re-capture with different bytes throws (SME D3.2 determinism lock)
 *   - getHashes returns present-only fields
 *   - clearSession / resetForTests behavior
 */

import { sha256, byteLengthOf } from '../../../src/core/d16/crypto-shim.js';
import {
  captureSource,
  captureBFO,
  captureCurated,
  getHashes,
  clearSession,
  resetForTests,
} from '../../../src/core/d16/ingestion-byte-registry.js';

beforeEach(() => resetForTests());

// ── crypto-shim ────────────────────────────────────────────────────

describe('sha256', () => {
  // NIST FIPS 180-4 test vectors
  it('matches known vector for "abc"', async () => {
    const hash = await sha256('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches known vector for empty string', async () => {
    const hash = await sha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces 64-char lowercase hex', async () => {
    const hash = await sha256('any input');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts Uint8Array input', async () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63]); // "abc"
    const hash = await sha256(bytes);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('produces stable hash for identical input across invocations', async () => {
    const h1 = await sha256('stable-input');
    const h2 = await sha256('stable-input');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', async () => {
    const h1 = await sha256('a');
    const h2 = await sha256('b');
    expect(h1).not.toBe(h2);
  });

  it('is whitespace-sensitive (justifying D2.1 JCS canonicalization lock)', async () => {
    const h1 = await sha256('a b');
    const h2 = await sha256('a  b'); // extra space
    expect(h1).not.toBe(h2);
  });

  it('rejects non-string non-bytes input with TypeError', async () => {
    await expect(sha256(42)).rejects.toThrow(TypeError);
    await expect(sha256({})).rejects.toThrow(TypeError);
    await expect(sha256(null)).rejects.toThrow(TypeError);
  });
});

describe('byteLengthOf', () => {
  it('returns UTF-8 byte length for ASCII', () => {
    expect(byteLengthOf('abc')).toBe(3);
  });

  it('returns UTF-8 byte length for multi-byte characters', () => {
    expect(byteLengthOf('é')).toBe(2);        // U+00E9 in UTF-8
    expect(byteLengthOf('☃')).toBe(3);       // U+2603 in UTF-8
    expect(byteLengthOf('🦀')).toBe(4);      // U+1F980 in UTF-8 (surrogate pair)
  });

  it('returns raw length for Uint8Array', () => {
    expect(byteLengthOf(new Uint8Array([1, 2, 3, 4, 5]))).toBe(5);
  });

  it('returns 0 for empty input', () => {
    expect(byteLengthOf('')).toBe(0);
    expect(byteLengthOf(new Uint8Array(0))).toBe(0);
  });
});

// ── ingestion-byte-registry ────────────────────────────────────────

describe('captureSource', () => {
  it('stores sourceContentHash + sourceByteLength per session', async () => {
    const { sourceContentHash, sourceByteLength } = await captureSource({
      sessionId: 'sess-001',
      bytes: '<owl:Class rdf:about="ex:Foo"/>',
    });
    expect(sourceContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceByteLength).toBe(31);

    const stored = getHashes('sess-001');
    expect(stored.sourceContentHash).toBe(sourceContentHash);
    expect(stored.sourceByteLength).toBe(sourceByteLength);
  });

  it('is idempotent for identical bytes', async () => {
    const r1 = await captureSource({ sessionId: 'sess-002', bytes: 'same content' });
    const r2 = await captureSource({ sessionId: 'sess-002', bytes: 'same content' });
    expect(r1.sourceContentHash).toBe(r2.sourceContentHash);
  });

  it('rejects re-capture with different bytes (D3.2 determinism)', async () => {
    await captureSource({ sessionId: 'sess-003', bytes: 'first content' });
    await expect(captureSource({ sessionId: 'sess-003', bytes: 'different content' }))
      .rejects.toThrow(/byte-capture lock/);
  });

  it('rejects missing sessionId', async () => {
    await expect(captureSource({ sessionId: '', bytes: 'x' })).rejects.toThrow(TypeError);
    await expect(captureSource({ sessionId: null, bytes: 'x' })).rejects.toThrow(TypeError);
  });

  it('rejects missing bytes', async () => {
    await expect(captureSource({ sessionId: 'sess-004', bytes: null })).rejects.toThrow(TypeError);
    await expect(captureSource({ sessionId: 'sess-004', bytes: undefined })).rejects.toThrow(TypeError);
  });
});

describe('captureBFO and captureCurated', () => {
  it('captures bfo hash + length independently of source', async () => {
    const sid = 'sess-bfo-001';
    await captureSource({ sessionId: sid, bytes: 'source content' });
    const { bfoContentHash, bfoByteLength } = await captureBFO({ sessionId: sid, bytes: '@prefix bfo: <...> .' });
    expect(bfoContentHash).toMatch(/^[0-9a-f]{64}$/);

    const hashes = getHashes(sid);
    expect(hashes.sourceContentHash).toBeDefined();
    expect(hashes.bfoContentHash).toBe(bfoContentHash);
    expect(hashes.bfoByteLength).toBe(bfoByteLength);
  });

  it('captures curated additions independently of source and bfo', async () => {
    const sid = 'sess-curated-001';
    await captureCurated({ sessionId: sid, bytes: 'curated:Process rdfs:subClassOf bfo:Process' });
    const hashes = getHashes(sid);
    expect(hashes.curatedContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes.sourceContentHash).toBeUndefined();
    expect(hashes.bfoContentHash).toBeUndefined();
  });

  it('captures all three independently in one session', async () => {
    const sid = 'sess-trio-001';
    await captureSource({ sessionId: sid, bytes: 'source' });
    await captureBFO({ sessionId: sid, bytes: 'bfo' });
    await captureCurated({ sessionId: sid, bytes: 'curated' });
    const hashes = getHashes(sid);
    expect(hashes.sourceContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes.bfoContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes.curatedContentHash).toMatch(/^[0-9a-f]{64}$/);
    // Three distinct inputs produce three distinct hashes.
    expect(new Set([hashes.sourceContentHash, hashes.bfoContentHash, hashes.curatedContentHash]).size).toBe(3);
  });
});

describe('getHashes and clearSession', () => {
  it('returns null for unknown session', () => {
    expect(getHashes('never-captured')).toBeNull();
  });

  it('returns a snapshot that cannot leak back into registry state', async () => {
    const sid = 'sess-snapshot-001';
    await captureSource({ sessionId: sid, bytes: 'x' });
    const snapshot = getHashes(sid);
    snapshot.sourceContentHash = 'tampered';
    expect(getHashes(sid).sourceContentHash).not.toBe('tampered');
  });

  it('clearSession removes the entry', async () => {
    const sid = 'sess-clear-001';
    await captureSource({ sessionId: sid, bytes: 'x' });
    expect(getHashes(sid)).not.toBeNull();
    clearSession(sid);
    expect(getHashes(sid)).toBeNull();
  });

  it('clearSession on unknown session is a no-op', () => {
    expect(() => clearSession('never-was')).not.toThrow();
  });
});

describe('cross-session determinism (D3.2 SME lock rationale)', () => {
  it('identical bytes across sessions produce identical hashes', async () => {
    const content = '<owl:Class rdf:about="ex:PROV-O-fixture"/>';
    const a = await captureSource({ sessionId: 'sess-A', bytes: content });
    const b = await captureSource({ sessionId: 'sess-B', bytes: content });
    expect(a.sourceContentHash).toBe(b.sourceContentHash);
    expect(a.sourceByteLength).toBe(b.sourceByteLength);
  });
});
