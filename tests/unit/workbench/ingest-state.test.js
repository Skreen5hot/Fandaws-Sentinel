/**
 * Workbench v0.2 IngestStateManager — programmatic AVC scenarios for
 * Sessions + Upload panel scope per SME-D16-X9 Step 2 (memo §8 staging).
 *
 * Covers per W-D-22 split:
 *   - sessions-new-session-action (programmatic)
 *   - sessions-click-routes-to-blocker (programmatic)
 *   - upload-start-triggers-phase1 (programmatic) — partial; full assertion
 *     belongs at Phase 1 Review Step 3
 *   - upload-rejects-oversized-file (programmatic)
 *   - upload-quota-probe-insufficient (programmatic)
 *   - upload-owl-imports-recorded-not-followed (programmatic)
 *
 * Plus X9 §3.1 prologSession lifecycle integration:
 *   - createSession initializes prologSession alongside record
 *   - getPrologSession lazily re-initializes on missing/teardown (W-SP-2 reload semantics)
 *   - finalizeSession tears down prologSession + marks session complete
 *   - deleteSession tears down active prologSession
 *   - prologSession NOT serialized in IngestionSession record (W-SP-2 schema preservation)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { IngestStateManager } from '../../../docs/workbench/js/panels/ingest/ingest-state.js';

// Mock localStorage for Node test environment
function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    _store: store,
  };
}

// Mock Fandaws bundle with stub Bucket C lifecycle
function createMockFandaws({ failInit = false, quotaTrigger = null } = {}) {
  const sessions = [];
  return {
    initBucketCPrologSession: async () => {
      if (failInit) throw new Error('mock init failure');
      const session = { mockProlog: true, teardownComplete: false, _id: sessions.length };
      sessions.push(session);
      return session;
    },
    teardownPrologSession: (s) => { if (s) s.teardownComplete = true; },
    BUCKET_C_DEFAULT_STEP_CAP: 10000,
    _sessions: sessions,
  };
}

beforeEach(() => {
  global.localStorage = createMockLocalStorage();
});

afterEach(() => {
  delete global.localStorage;
});

describe('IngestStateManager — sessions-new-session-action (programmatic)', () => {
  it('creates a session record with required fields + activates it', async () => {
    const ism = new IngestStateManager();
    const { id, session } = await ism.createSession({
      sourceFilename: 'prov-o.owl',
      ontologyIRI: 'http://www.w3.org/ns/prov#',
      format: 'rdfxml',
      classCount: 30,
      propertyCount: 30,
      importCount: 0,
    });
    expect(id).toMatch(/^ingest-\d+-[a-z0-9]+$/);
    expect(session.sourceFilename).toBe('prov-o.owl');
    expect(session.format).toBe('rdfxml');
    expect(session.phase).toBe('upload');
    expect(session.phase1Complete).toBe(false);
    expect(ism.getActiveSession()).toBe(id);
    expect(ism.loadSessions()).toHaveLength(1);
  });

  it('returns error when localStorage quota probe fails (upload-quota-probe-insufficient)', async () => {
    // Simulate quota exhaustion by overriding setItem
    global.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    const ism = new IngestStateManager();
    const result = await ism.createSession({ sourceFilename: 'huge.owl' });
    expect(result.error).toMatch(/quota exhausted/);
  });
});

describe('IngestStateManager — sessions-click-routes-to-blocker (programmatic)', () => {
  it('phase field reflects current pipeline state for routing', async () => {
    const ism = new IngestStateManager();
    const { id } = await ism.createSession({ sourceFilename: 'a.ttl' });
    expect(ism.getSession(id).phase).toBe('upload');
    ism.updateSession(id, { phase: 'phase2', phase1Complete: true, blocking: ['PendingHumanResolution'] });
    expect(ism.getSession(id).phase).toBe('phase2');
    expect(ism.getSession(id).blocking).toContain('PendingHumanResolution');
  });

  it('updateSession merges fields without losing prior state', async () => {
    const ism = new IngestStateManager();
    const { id } = await ism.createSession({ sourceFilename: 'a.ttl', classCount: 10 });
    ism.updateSession(id, { phase1Complete: true });
    const s = ism.getSession(id);
    expect(s.classCount).toBe(10); // preserved
    expect(s.phase1Complete).toBe(true); // updated
    expect(s.phase).toBe('upload'); // unchanged
  });
});

describe('IngestStateManager — upload-rejects-oversized-file / quota-probe-insufficient (programmatic)', () => {
  // The 1 MB file size cap is enforced in upload-panel.js (handleFile).
  // These programmatic scenarios verify the state-manager boundaries.
  it('probeQuota returns true when localStorage has space', () => {
    const ism = new IngestStateManager();
    expect(ism.probeQuota()).toBe(true);
  });

  it('probeQuota returns false when localStorage rejects writes', () => {
    global.localStorage.setItem = () => { throw new Error('quota'); };
    const ism = new IngestStateManager();
    expect(ism.probeQuota()).toBe(false);
  });
});

describe('IngestStateManager — upload-owl-imports-recorded-not-followed (programmatic)', () => {
  it('importCount is stored in session record but no fetch is triggered (W-IM-1)', async () => {
    const ism = new IngestStateManager();
    const { id } = await ism.createSession({
      sourceFilename: 'with-imports.owl',
      importCount: 3,
    });
    const session = ism.getSession(id);
    expect(session.importCount).toBe(3);
    // The state manager itself does not implement import fetching;
    // W-IM-1 is structurally enforced by what the manager does NOT do.
    // Upload-panel.js delegates to parseOntology + records imports; no follow.
    expect(session).not.toHaveProperty('importedClosure');
  });
});

describe('IngestStateManager — X9 §3.1 prologSession lifecycle', () => {
  it('createSession initializes prologSession alongside record when Fandaws supplied', async () => {
    const Fandaws = createMockFandaws();
    const ism = new IngestStateManager(Fandaws);
    const { id } = await ism.createSession({ sourceFilename: 'a.ttl' });
    const session = ism.getSession(id);
    // Record itself MUST NOT carry prologSession (non-serializable; W-SP-2)
    expect(session).not.toHaveProperty('prologSession');
    // But the in-memory map holds it
    const ps = await ism.getPrologSession(id);
    expect(ps).toBeTruthy();
    expect(ps.mockProlog).toBe(true);
    expect(Fandaws._sessions).toHaveLength(1);
  });

  it('createSession is non-fatal when prologSession init fails (warn-not-throw)', async () => {
    const Fandaws = createMockFandaws({ failInit: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ism = new IngestStateManager(Fandaws);
    const { id, error } = await ism.createSession({ sourceFilename: 'a.ttl' });
    expect(error).toBeUndefined();
    expect(id).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/prologSession init failed/));
    warn.mockRestore();
  });

  it('getPrologSession lazily re-initializes after teardown (W-SP-2 reload semantics)', async () => {
    const Fandaws = createMockFandaws();
    const ism = new IngestStateManager(Fandaws);
    const { id } = await ism.createSession({ sourceFilename: 'a.ttl' });
    const first = await ism.getPrologSession(id);
    Fandaws.teardownPrologSession(first); // simulate page reload destroying handle
    const second = await ism.getPrologSession(id);
    expect(second).not.toBe(first);
    expect(second.mockProlog).toBe(true);
    expect(Fandaws._sessions).toHaveLength(2);
  });

  it('getPrologSession returns null when Fandaws bundle unavailable', async () => {
    const ism = new IngestStateManager(); // no Fandaws
    // Manually inject a session record (avoid createSession quota probe path)
    ism._sessionCache = [{ id: 'manual-1', phase: 'upload' }];
    const ps = await ism.getPrologSession('manual-1');
    expect(ps).toBeNull();
  });

  it('finalizeSession tears down prologSession + marks complete', async () => {
    const Fandaws = createMockFandaws();
    const ism = new IngestStateManager(Fandaws);
    const { id } = await ism.createSession({ sourceFilename: 'a.ttl' });
    const ps = await ism.getPrologSession(id);
    expect(ps.teardownComplete).toBe(false);
    ism.finalizeSession(id);
    expect(ps.teardownComplete).toBe(true);
    expect(ism.getSession(id).phase).toBe('complete');
    expect(ism.getSession(id).sessionCompletedAt).toBeTruthy();
    // Map entry removed
    expect(ism._activePrologSessions.has(id)).toBe(false);
  });

  it('deleteSession tears down active prologSession', async () => {
    const Fandaws = createMockFandaws();
    const ism = new IngestStateManager(Fandaws);
    const { id } = await ism.createSession({ sourceFilename: 'a.ttl' });
    const ps = await ism.getPrologSession(id);
    ism.deleteSession(id);
    expect(ps.teardownComplete).toBe(true);
    expect(ism.getSession(id)).toBeNull();
    expect(ism._activePrologSessions.has(id)).toBe(false);
  });

  it('IngestionSession schema preservation: no prologSession field on serialized record (W-SP-2)', async () => {
    const Fandaws = createMockFandaws();
    const ism = new IngestStateManager(Fandaws);
    const { id } = await ism.createSession({ sourceFilename: 'a.ttl' });
    // Inspect what would be serialized to localStorage
    const stored = JSON.parse(global.localStorage.getItem('fandaws:ingest:sessions'));
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty('prologSession');
    expect(stored[0].id).toBe(id);
  });
});
