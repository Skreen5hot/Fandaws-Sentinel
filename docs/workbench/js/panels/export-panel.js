/**
 * Export Panel — Center panel (Export mode) for exporting graph data.
 *
 * Provides format selection, live preview, copy, and download.
 */
import { escapeHtml } from '../utils.js';

/**
 * Initialize the Export panel.
 * @param {HTMLElement} container - #panel-workspace
 * @param {import('../workbench-state.js').WorkbenchStateManager} state
 */
export function initExport(container, state) {
  // Build export DOM (appended to workspace, hidden by default)
  const exportDiv = document.createElement('div');
  exportDiv.className = 'wb-export';
  exportDiv.style.display = 'none';
  exportDiv.innerHTML = `
    <div class="wb-export-controls">
      <select class="wb-export-select" id="wb-export-format">
        <option value="turtle">Turtle</option>
        <option value="owl">OWL 2 (Manchester)</option>
        <option value="skos">SKOS</option>
        <option value="rdfxml">RDF/XML</option>
        <option value="jsonld">JSON-LD Snapshot</option>
      </select>
      <button class="btn btn--primary" id="wb-export-run">Export</button>
      <button class="btn btn--ghost" id="wb-export-copy">Copy</button>
      <button class="btn btn--ghost" id="wb-export-download">Download</button>
    </div>
    <pre class="wb-export-preview" id="wb-export-preview">
      <span class="wb-export-empty">Select a format and click Export to preview your graph.</span>
    </pre>
  `;
  container.appendChild(exportDiv);

  const formatSelect = exportDiv.querySelector('#wb-export-format');
  const runBtn = exportDiv.querySelector('#wb-export-run');
  const copyBtn = exportDiv.querySelector('#wb-export-copy');
  const downloadBtn = exportDiv.querySelector('#wb-export-download');
  const preview = exportDiv.querySelector('#wb-export-preview');

  /** File extensions per format */
  const EXT_MAP = {
    turtle: '.ttl',
    owl: '.omn',
    skos: '.skos.rdf',
    rdfxml: '.rdf',
    jsonld: '.jsonld',
  };

  /** MIME types per format */
  const MIME_MAP = {
    turtle: 'text/turtle',
    owl: 'text/plain',
    skos: 'application/rdf+xml',
    rdfxml: 'application/rdf+xml',
    jsonld: 'application/ld+json',
  };

  function doExport() {
    const graph = state.getGraph();
    if (!graph || (graph['fandaws:concepts'] || []).length === 0) {
      preview.innerHTML = '<span class="wb-export-empty">No concepts in graph. Add some statements first.</span>';
      return;
    }

    const format = formatSelect.value;
    try {
      let output;
      if (format === 'jsonld') {
        output = JSON.stringify(graph, null, 2);
      } else {
        output = state.Fandaws.exportGraph(graph, { format });
      }
      preview.textContent = output;
    } catch (e) {
      preview.innerHTML = `<span style="color: var(--red);">Export error: ${escapeHtml(e.message)}</span>`;
    }
  }

  runBtn.addEventListener('click', doExport);

  copyBtn.addEventListener('click', () => {
    const text = preview.textContent;
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = orig; }, 1500);
      });
    }
  });

  downloadBtn.addEventListener('click', () => {
    const text = preview.textContent;
    if (!text) return;
    const format = formatSelect.value;
    const ext = EXT_MAP[format] || '.txt';
    const mime = MIME_MAP[format] || 'text/plain';
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fandaws-graph${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

export function showExport(container) {
  const el = container.querySelector('.wb-export');
  if (el) el.style.display = 'flex';
}

export function hideExport(container) {
  const el = container.querySelector('.wb-export');
  if (el) el.style.display = 'none';
}
