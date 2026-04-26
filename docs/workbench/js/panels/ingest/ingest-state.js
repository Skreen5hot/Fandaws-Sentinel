/**
 * Ingest State Manager — localStorage persistence for ingestion sessions.
 *
 * Keys:
 *   fandaws:ingest:sessions        — session list (metadata only)
 *   fandaws:ingest:staging:{id}    — Phase 1 staging records for a session
 *   fandaws:ingest:phase2:{id}     — Phase 2 disambiguation records
 *   fandaws:ingest:phase3:{id}     — Phase 3 sandbox results
 *   fandaws:ingest:config:{id}     — Upload config snapshot
 *   fandaws:ingest:activeSession   — currently active session ID
 *   fandaws:ingest:activePanel     — currently active sub-panel
 *
 * Rule W-FS-2: quota probe before session creation.
 * Rule W-SP-1: panel state preserved across mode switches.
 *
 * X9 Step 2 (2026-04-25): per-session Tau Prolog handles managed in-memory
 * via _activePrologSessions Map (X6 §6.2 L2 caller-owned lifecycle; X9 §3.1
 * attach pattern). prologSession is NOT a field on the IngestionSession
 * record — Tau Prolog session is not JSON-serializable, and including it in
 * the localStorage payload would break W-SP-2 page-reload restoration. The
 * Map is in-memory only; on reload, getPrologSession() lazily re-initializes
 * (BFO axiom load is a ~50ms one-time cost per browser session).
 */

const LS_SESSIONS = 'fandaws:ingest:sessions';
const LS_ACTIVE_SESSION = 'fandaws:ingest:activeSession';
const LS_ACTIVE_PANEL = 'fandaws:ingest:activePanel';

/** Max localStorage bytes for quota probing (W-FS-2). */
const QUOTA_PROBE_SIZE = 8192;

/**
 * Safely read JSON from localStorage.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage.
 * @param {string} key
 * @param {*} value
 * @returns {boolean}
 */
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a key from localStorage.
 * @param {string} key
 */
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch { /* */ }
}

export class IngestStateManager {
  /**
   * @param {object} [Fandaws] - bundle global; required for prologSession
   *   lifecycle methods. May be omitted for tests that don't exercise the
   *   dispatcher path (e.g., session-list rendering tests).
   */
  constructor(Fandaws = null) {
    this._sessionCache = null;
    this._Fandaws = Fandaws;
    /** Map<sessionId, prologSession> — in-memory only; not localStorage-serialized. */
    this._activePrologSessions = new Map();
  }

  // ── Session List ──

  /**
   * Load all session metadata objects.
   * @returns {object[]}
   */
  loadSessions() {
    if (!this._sessionCache) {
      this._sessionCache = lsGet(LS_SESSIONS, []);
    }
    return this._sessionCache;
  }

  /**
   * Persist sessions list.
   */
  _saveSessions() {
    lsSet(LS_SESSIONS, this._sessionCache || []);
  }

  /**
   * Probe localStorage quota before creating a new session (W-FS-2).
   * Attempts to write a probe blob; if it fails, quota is exhausted.
   * @returns {boolean} true if space available
   */
  probeQuota() {
    const probeKey = 'fandaws:ingest:__quota_probe__';
    const probeData = 'x'.repeat(QUOTA_PROBE_SIZE);
    try {
      localStorage.setItem(probeKey, probeData);
      localStorage.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new ingestion session.
   *
   * X9 Step 2 (2026-04-25): async — initializes per-session Tau Prolog
   * handle alongside the IngestionSession record per X6 §6.2 L2 caller-
   * owned lifecycle. The prologSession is stored in the in-memory
   * _activePrologSessions Map keyed by sessionId; it is NOT included in
   * the IngestionSession record (non-serializable; W-SP-2 reload re-init
   * handled by getPrologSession()).
   *
   * @param {object} opts - { sourceFilename, ontologyIRI, format, classCount, propertyCount, importCount }
   * @returns {Promise<{ id: string, session: object }|{ error: string }>}
   */
  async createSession(opts = {}) {
    if (!this.probeQuota()) {
      return { error: 'localStorage quota exhausted. Delete old sessions to free space.' };
    }

    const id = `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id,
      createdAt: new Date().toISOString(),
      sourceFilename: opts.sourceFilename || 'unknown',
      ontologyIRI: opts.ontologyIRI || null,
      format: opts.format || 'unknown',
      classCount: opts.classCount || 0,
      propertyCount: opts.propertyCount || 0,
      importCount: opts.importCount || 0,
      phase: 'upload',       // upload | phase1 | phase2 | phase3 | complete
      phase1Complete: false,
      phase2Complete: false,
      phase3Complete: false,
      blocking: [],           // e.g. ['PendingHumanResolution']
      summary: null,
      // NOTE: prologSession is intentionally NOT a field here. See class
      // doc-comment + _activePrologSessions Map for X9 §3.1 lifecycle.
    };

    // Initialize per-session Tau Prolog handle if Fandaws bundle available.
    // Init failure is logged but non-fatal at session-creation time — the
    // dispatcher path is invoked only at Phase 1/2/3 Review, where missing
    // prologSession surfaces as a contract-violation error per X8 §4.2
    // Option I throw-not-warn discipline.
    if (this._Fandaws && this._Fandaws.initBucketCPrologSession) {
      try {
        const prologSession = await this._Fandaws.initBucketCPrologSession({
          stepCap: this._Fandaws.BUCKET_C_DEFAULT_STEP_CAP || 10000,
        });
        this._activePrologSessions.set(id, prologSession);
      } catch (err) {
        console.warn(`X9 prologSession init failed for session ${id}: ${err.message}. Lazy re-init via getPrologSession().`);
      }
    }

    const sessions = this.loadSessions();
    sessions.unshift(session);
    this._sessionCache = sessions;
    this._saveSessions();
    this.setActiveSession(id);
    return { id, session };
  }

  /**
   * Get the prologSession for a session, lazily re-initializing if missing
   * (e.g., after page reload — W-SP-2 transparent recovery).
   * @param {string} sessionId
   * @returns {Promise<object|null>} prologSession handle, or null if Fandaws bundle unavailable
   */
  async getPrologSession(sessionId) {
    if (!this._Fandaws || !this._Fandaws.initBucketCPrologSession) return null;
    let prologSession = this._activePrologSessions.get(sessionId);
    if (!prologSession || prologSession.teardownComplete) {
      prologSession = await this._Fandaws.initBucketCPrologSession({
        stepCap: this._Fandaws.BUCKET_C_DEFAULT_STEP_CAP || 10000,
      });
      this._activePrologSessions.set(sessionId, prologSession);
    }
    return prologSession;
  }

  /**
   * Finalize a session — invokes prologSession teardown alongside marking
   * session phase 'complete'. Called from Session Summary "Finalize Session".
   * @param {string} sessionId
   */
  finalizeSession(sessionId) {
    const prologSession = this._activePrologSessions.get(sessionId);
    if (prologSession && this._Fandaws && this._Fandaws.teardownPrologSession) {
      try {
        this._Fandaws.teardownPrologSession(prologSession);
      } catch (err) {
        console.warn(`X9 prologSession teardown error for session ${sessionId}: ${err.message}`);
      }
    }
    this._activePrologSessions.delete(sessionId);
    this.updateSession(sessionId, { phase: 'complete', sessionCompletedAt: new Date().toISOString() });
  }

  /**
   * Get a session by ID.
   * @param {string} id
   * @returns {object|null}
   */
  getSession(id) {
    return this.loadSessions().find(s => s.id === id) || null;
  }

  /**
   * Update a session (merge fields).
   * @param {string} id
   * @param {object} updates
   */
  updateSession(id, updates) {
    const sessions = this.loadSessions();
    const idx = sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    Object.assign(sessions[idx], updates);
    this._sessionCache = sessions;
    this._saveSessions();
  }

  /**
   * Delete a session and all associated data, including teardown of any
   * active prologSession (X9 §3.1 lifecycle).
   * @param {string} id
   */
  deleteSession(id) {
    const prologSession = this._activePrologSessions.get(id);
    if (prologSession && this._Fandaws && this._Fandaws.teardownPrologSession) {
      try { this._Fandaws.teardownPrologSession(prologSession); } catch { /* */ }
    }
    this._activePrologSessions.delete(id);

    const sessions = this.loadSessions().filter(s => s.id !== id);
    this._sessionCache = sessions;
    this._saveSessions();
    lsRemove(`fandaws:ingest:staging:${id}`);
    lsRemove(`fandaws:ingest:phase2:${id}`);
    lsRemove(`fandaws:ingest:phase3:${id}`);
    lsRemove(`fandaws:ingest:config:${id}`);
    if (this.getActiveSession() === id) {
      lsRemove(LS_ACTIVE_SESSION);
    }
  }

  // ── Active Session / Panel ──

  getActiveSession() { return lsGet(LS_ACTIVE_SESSION, null); }
  setActiveSession(id) { lsSet(LS_ACTIVE_SESSION, id); }

  getActivePanel() { return lsGet(LS_ACTIVE_PANEL, 'sessions'); }
  setActivePanel(panel) { lsSet(LS_ACTIVE_PANEL, panel); }

  // ── Staging Records (Phase 1) ──

  saveStagingRecords(sessionId, records) {
    lsSet(`fandaws:ingest:staging:${sessionId}`, records);
  }

  loadStagingRecords(sessionId) {
    return lsGet(`fandaws:ingest:staging:${sessionId}`, []);
  }

  // ── Phase 2 Records ──

  savePhase2Records(sessionId, records) {
    lsSet(`fandaws:ingest:phase2:${sessionId}`, records);
  }

  loadPhase2Records(sessionId) {
    return lsGet(`fandaws:ingest:phase2:${sessionId}`, []);
  }

  // ── Phase 3 Records ──

  savePhase3Records(sessionId, records) {
    lsSet(`fandaws:ingest:phase3:${sessionId}`, records);
  }

  loadPhase3Records(sessionId) {
    return lsGet(`fandaws:ingest:phase3:${sessionId}`, []);
  }

  // ── Upload Config ──

  saveConfig(sessionId, config) {
    lsSet(`fandaws:ingest:config:${sessionId}`, config);
  }

  loadConfig(sessionId) {
    return lsGet(`fandaws:ingest:config:${sessionId}`, null);
  }
}
