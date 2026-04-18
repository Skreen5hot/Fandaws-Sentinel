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

let ingestRoot = null;
let ingestState = null;
let panelEls = {};
let panelControllers = {};

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
  ingestState = new IngestStateManager();

  // Build root wrapper
  ingestRoot = document.createElement('div');
  ingestRoot.className = 'wb-ingest';
  ingestRoot.style.display = 'none';

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
