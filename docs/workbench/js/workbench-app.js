/**
 * Workbench Bootstrap — entry point for docs/workbench.html
 *
 * Creates WorkbenchStateManager, initializes all panels,
 * wires mode switcher and mobile tabs.
 */
import { WorkbenchStateManager } from './workbench-state.js';
import { initGraphTree } from './panels/graph-tree.js';
import { initConverse, showConverse, hideConverse } from './panels/converse.js';
import { initExport, showExport, hideExport } from './panels/export-panel.js';
import { initIngest, showIngest, hideIngest } from './panels/ingest/ingest-mode.js';
import { initInspector } from './panels/inspector.js';
import { initStatusBar } from './panels/status-bar.js';

// The Fandaws global is loaded via the bundle in dist/fandaws.js.
// In the HTML, the bundle is loaded as a classic script that attaches to window.
// We import from the ES module bundle instead.
const Fandaws = await import('../../dist/fandaws.js');

// ── Initialize State ──
const state = new WorkbenchStateManager(Fandaws);

// ── Ingest BFO at startup ──
// Loads bundled BFO 2020 (~36 classes) into the working graph so users
// can attach concepts to a real ontology rather than to phantom IRIs.
const bfoResult = await state.ensureBfo();
if (bfoResult.error) {
  console.warn('[Workbench] BFO ingestion failed:', bfoResult.error);
} else if (bfoResult.ingested) {
  console.log(`[Workbench] BFO ingested: ${bfoResult.conceptsAdded} classes`);
}

// ── Initialize Panels ──
const panelTree = document.getElementById('panel-tree');
const panelWorkspace = document.getElementById('panel-workspace');
const panelInspector = document.getElementById('panel-inspector');
const statusBar = document.getElementById('status-bar');

initGraphTree(panelTree, state);
initConverse(panelWorkspace, state);
initExport(panelWorkspace, state);
initIngest(panelWorkspace, state);
initInspector(panelInspector, state);
initStatusBar(statusBar, state);

// ── Mode Switcher (W-SP-1 + W-SP-2) ──
// X9 Step 7: persist active mode to localStorage so page reload restores
// last-active mode per W-SP-2. Mode-switch state preservation across
// Converse/Ingest/Export modes per W-SP-1 already enforced by show/hide
// pattern (DOM stays alive between mode switches; only visibility toggles).
const LS_ACTIVE_MODE = 'fandaws:wb:activeMode';
const VALID_MODES = new Set(['converse', 'ingest', 'export']);

function readPersistedMode() {
  try {
    const raw = localStorage.getItem(LS_ACTIVE_MODE);
    return VALID_MODES.has(raw) ? raw : 'converse';
  } catch { return 'converse'; }
}

function persistMode(mode) {
  try { localStorage.setItem(LS_ACTIVE_MODE, mode); } catch { /* */ }
}

const modeButtons = document.querySelectorAll('.wb-mode');
let currentMode = readPersistedMode();

function switchMode(mode) {
  if (mode === currentMode) return;
  if (!VALID_MODES.has(mode)) return;
  currentMode = mode;
  persistMode(mode);

  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  if (mode === 'converse') {
    showConverse(panelWorkspace);
    hideExport(panelWorkspace);
    hideIngest(panelWorkspace);
  } else if (mode === 'export') {
    hideConverse(panelWorkspace);
    showExport(panelWorkspace);
    hideIngest(panelWorkspace);
  } else if (mode === 'ingest') {
    hideConverse(panelWorkspace);
    hideExport(panelWorkspace);
    showIngest(panelWorkspace);
  }

  state.bus.emit('workspace-switched', { mode });
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// W-SP-2: restore last-active mode on page load. Default = converse for
// first-time visitors; restored mode for returning analysts.
if (currentMode !== 'converse') {
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
  if (currentMode === 'export') {
    hideConverse(panelWorkspace);
    showExport(panelWorkspace);
  } else if (currentMode === 'ingest') {
    hideConverse(panelWorkspace);
    showIngest(panelWorkspace);
  }
}

// ── Reset Graph Button ──
const resetBtn = document.getElementById('btn-reset-graph');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (confirm('Clear the entire graph and start fresh?')) {
      state.resetGraph();
      // Re-initialize converse panel to clear chat log
      panelWorkspace.querySelector('.wb-converse')?.remove();
      initConverse(panelWorkspace, state);
      // Re-initialize export panel
      panelWorkspace.querySelector('.wb-export')?.remove();
      initExport(panelWorkspace, state);
      // Re-initialize ingest panel
      panelWorkspace.querySelector('.wb-ingest')?.remove();
      initIngest(panelWorkspace, state);
      // Ensure correct mode visibility
      if (currentMode === 'converse') {
        showConverse(panelWorkspace);
        hideExport(panelWorkspace);
        hideIngest(panelWorkspace);
      } else if (currentMode === 'export') {
        hideConverse(panelWorkspace);
        showExport(panelWorkspace);
        hideIngest(panelWorkspace);
      } else if (currentMode === 'ingest') {
        hideConverse(panelWorkspace);
        hideExport(panelWorkspace);
        showIngest(panelWorkspace);
      }
    }
  });
}

// ── Mobile Tabs (< 768px) ──
const mobileTabs = document.querySelectorAll('.wb-mobile-tab');
mobileTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    mobileTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    const panel = tab.dataset.panel;
    panelTree.classList.toggle('wb-panel--visible', panel === 'left');
    panelInspector.classList.toggle('wb-panel--visible', panel === 'right');
  });
});

// ── Update Test Badge ──
const badgeEl = document.getElementById('wb-badge-tests');
if (badgeEl) {
  try {
    const resp = await fetch('data/test-results.json');
    const data = await resp.json();
    if (data.totalTests) {
      badgeEl.textContent = `${data.totalTests} Tests`;
    }
  } catch { /* badge stays at default */ }
}
