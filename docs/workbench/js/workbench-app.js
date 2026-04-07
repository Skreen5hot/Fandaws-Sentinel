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
initInspector(panelInspector, state);
initStatusBar(statusBar, state);

// ── Mode Switcher ──
const modeButtons = document.querySelectorAll('.wb-mode');
let currentMode = 'converse';

function switchMode(mode) {
  if (mode === currentMode) return;
  currentMode = mode;

  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  if (mode === 'converse') {
    showConverse(panelWorkspace);
    hideExport(panelWorkspace);
  } else if (mode === 'export') {
    hideConverse(panelWorkspace);
    showExport(panelWorkspace);
  }

  state.bus.emit('workspace-switched', { mode });
}

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

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
      // Ensure correct mode visibility
      if (currentMode === 'converse') {
        showConverse(panelWorkspace);
        hideExport(panelWorkspace);
      } else {
        hideConverse(panelWorkspace);
        showExport(panelWorkspace);
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
