/**
 * Ingest Mode — top-level controller for the six-panel ingestion workflow.
 *
 * Sub-panels: sessions, upload, phase1-review, phase2-review, phase3-review, session-summary
 *
 * Lifecycle: init() creates DOM + wires sub-panels.
 *            show()/hide() toggle visibility.
 *            Panel state persists across mode switches (W-SP-1).
 */

import { IngestStateManager } from './ingest-state.js';
import { initSessionsPanel } from './sessions-panel.js';
import { initUploadPanel } from './upload-panel.js';
import { initPhase1ReviewPanel } from './phase1-review-panel.js';
import { initPhase2ReviewPanel } from './phase2-review-panel.js';
import { initPhase3ReviewPanel } from './phase3-review-panel.js';
import { initSessionSummaryPanel } from './session-summary-panel.js';

const PANEL_IDS = ['sessions', 'upload', 'phase1-review', 'phase2-review', 'phase3-review', 'session-summary'];

// X9 Step 7 (2026-04-25): panels where active session ID strip surfaces
// (W-SI-1 single-active-session display). Excludes Sessions panel which has
// its own session list header — surfacing redundant session ID would clutter.
const PANELS_WITH_SESSION_ID_STRIP = new Set(['upload', 'phase1-review', 'phase2-review', 'phase3-review', 'session-summary']);

let ingestRoot = null;
let ingestState = null;
let panelEls = {};
let panelControllers = {};
let sessionIdStrip = null;
let errorBanner = null;

/**
 * X9 Step 7: surface the active session ID at the top of every Ingest
 * sub-panel except Sessions (W-SI-1). Updated on each navigateTo() call.
 */
function updateSessionIdStrip(panelName) {
  if (!sessionIdStrip) return;
  if (!PANELS_WITH_SESSION_ID_STRIP.has(panelName)) {
    sessionIdStrip.style.display = 'none';
    return;
  }
  const activeId = ingestState.getActiveSession();
  if (!activeId) {
    sessionIdStrip.style.display = 'none';
    return;
  }
  sessionIdStrip.style.display = 'block';
  sessionIdStrip.innerHTML = `<span class="ig-session-id-label">Active session:</span> <code class="ig-session-id-value">${activeId}</code>`;
}

/**
 * X9 Step 7 W-EH-1/2/3: shared error banner for cross-panel error
 * visibility. Panels invoke nav.showError(message, severity) to surface
 * pipeline / parse / invariant-firing errors in a consistent location.
 * @param {string} message
 * @param {'error'|'warning'|'info'} [severity='error']
 */
function showError(message, severity = 'error') {
  if (!errorBanner) return;
  const sevClass = severity === 'warning' ? 'badge--warning' : severity === 'info' ? 'badge--accent' : '';
  errorBanner.innerHTML = `
    <div class="ig-error-banner ig-error-banner--${severity}">
      <span class="badge ${sevClass}">${severity.toUpperCase()}</span>
      <span class="ig-error-message">${escapeForBanner(message)}</span>
      <button class="ig-error-dismiss" type="button" aria-label="Dismiss error">×</button>
    </div>
  `;
  errorBanner.style.display = 'block';
  errorBanner.querySelector('.ig-error-dismiss')?.addEventListener('click', () => {
    errorBanner.style.display = 'none';
    errorBanner.innerHTML = '';
  });
}

function escapeForBanner(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Navigate to a sub-panel within ingest mode.
 * @param {string} panelName
 * @param {object} [data] - optional context data passed to panel show()
 */
function navigateTo(panelName, data) {
  if (!PANEL_IDS.includes(panelName)) return;
  ingestState.setActivePanel(panelName);

  for (const id of PANEL_IDS) {
    const el = panelEls[id];
    if (!el) continue;
    el.style.display = id === panelName ? 'flex' : 'none';
  }

  // W-SI-1: refresh active session ID strip on every navigation
  updateSessionIdStrip(panelName);

  // Notify the target panel controller
  if (panelControllers[panelName]?.show) {
    panelControllers[panelName].show(data);
  }
}

/**
 * Initialize ingest mode.
 * @param {HTMLElement} container - #panel-workspace
 * @param {import('../../workbench-state.js').WorkbenchStateManager} state
 */
export function initIngest(container, state) {
  // Pass the Fandaws bundle reference so the state manager can manage
  // per-session Tau Prolog handles (X9 §3.1 prologSession lifecycle).
  ingestState = new IngestStateManager(state.Fandaws);

  // Build root wrapper
  ingestRoot = document.createElement('div');
  ingestRoot.className = 'wb-ingest';
  ingestRoot.style.display = 'none';

  // X9 Step 7: persistent active-session-ID strip + error banner attached to
  // the wrapper so they surface across all sub-panels uniformly (W-SI-1, W-EH).
  sessionIdStrip = document.createElement('div');
  sessionIdStrip.className = 'wb-ingest-session-strip';
  sessionIdStrip.style.display = 'none';
  ingestRoot.appendChild(sessionIdStrip);

  errorBanner = document.createElement('div');
  errorBanner.className = 'wb-ingest-error-banner';
  errorBanner.style.display = 'none';
  ingestRoot.appendChild(errorBanner);

  // Create sub-panel containers
  for (const id of PANEL_IDS) {
    const el = document.createElement('div');
    el.className = `wb-ingest-panel wb-ingest-panel--${id}`;
    el.dataset.ingestPanel = id;
    el.style.display = 'none';
    panelEls[id] = el;
    ingestRoot.appendChild(el);
  }

  container.appendChild(ingestRoot);

  // Navigation helper exposed to child panels
  const nav = {
    navigateTo,
    ingestState,
    wbState: state,
    // X9 Step 7 W-EH: shared error-banner surfacing for child panels
    showError,
  };

  // Initialize sub-panels
  panelControllers['sessions'] = initSessionsPanel(panelEls['sessions'], nav);
  panelControllers['upload'] = initUploadPanel(panelEls['upload'], nav);
  panelControllers['phase1-review'] = initPhase1ReviewPanel(panelEls['phase1-review'], nav);
  panelControllers['phase2-review'] = initPhase2ReviewPanel(panelEls['phase2-review'], nav);
  panelControllers['phase3-review'] = initPhase3ReviewPanel(panelEls['phase3-review'], nav);
  panelControllers['session-summary'] = initSessionSummaryPanel(panelEls['session-summary'], nav);
}

/**
 * Show ingest mode — restore last active sub-panel.
 */
export function showIngest(container) {
  if (!ingestRoot) return;
  ingestRoot.style.display = 'flex';
  const lastPanel = ingestState.getActivePanel() || 'sessions';
  navigateTo(lastPanel);
}

/**
 * Hide ingest mode.
 */
export function hideIngest(container) {
  if (!ingestRoot) return;
  ingestRoot.style.display = 'none';
}
