/**
 * Upload Panel — file input, paste area, format auto-detection,
 * advanced config with weight vector validation (PD-10).
 *
 * Rule W-FS-1: file size cap 1 MB.
 * Rule W-IM-1: owl:imports recorded but not followed.
 */
import { escapeHtml } from '../../utils.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB (W-FS-1)

export function initUploadPanel(el, nav) {
  let fileContent = null;
  let fileName = null;
  let detectedFormat = null;

  function render() {
    el.innerHTML = `
      <div class="ig-upload-container">
        <div class="ig-upload-header">
          <button class="btn btn--ghost ig-back-btn" id="ig-upload-back">&larr; Sessions</button>
          <h3 class="ig-panel-title">Upload Ontology</h3>
        </div>

        <div class="ig-upload-dropzone" id="ig-dropzone">
          <div class="ig-dropzone-icon">&#128196;</div>
          <p>Drop a Turtle (.ttl) or OWL (.owl, .rdf) file here</p>
          <p class="ig-dropzone-hint">or click to browse &middot; Max 1 MB</p>
          <input type="file" id="ig-file-input" accept=".ttl,.owl,.rdf,.nt,.n3" style="display:none" />
        </div>

        <div class="ig-upload-or">or paste ontology source:</div>

        <textarea class="ig-paste-area" id="ig-paste-area" rows="8"
                  placeholder="@prefix owl: <http://www.w3.org/2002/07/owl#> .&#10;@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .&#10;..."></textarea>

        <div class="ig-format-row" id="ig-format-row" style="display:none">
          <span class="ig-format-label">Detected format:</span>
          <span class="ig-format-value" id="ig-format-value"></span>
          <span class="ig-file-name" id="ig-file-name"></span>
        </div>

        <details class="ig-advanced-config">
          <summary>Advanced Configuration</summary>
          <div class="ig-config-grid">
            <label>domain weight
              <input type="number" class="ig-config-input" id="ig-w-domain" value="0.30" min="0" max="1" step="0.05" />
            </label>
            <label>range weight
              <input type="number" class="ig-config-input" id="ig-w-range" value="0.30" min="0" max="1" step="0.05" />
            </label>
            <label>bfoSubcategory weight
              <input type="number" class="ig-config-input" id="ig-w-bfo" value="0.15" min="0" max="1" step="0.05" />
            </label>
            <label>characteristics weight
              <input type="number" class="ig-config-input" id="ig-w-chars" value="0.10" min="0" max="1" step="0.05" />
            </label>
            <label>allowsInheresIn weight
              <input type="number" class="ig-config-input" id="ig-w-inheres" value="0.05" min="0" max="1" step="0.05" />
            </label>
            <label>lexical weight (max 0.10)
              <input type="number" class="ig-config-input" id="ig-w-lexical" value="0.10" min="0" max="0.10" step="0.05" />
            </label>
          </div>
          <div class="ig-config-validation" id="ig-config-validation"></div>
        </details>

        <div class="ig-upload-actions">
          <button class="btn btn--primary ig-start-btn" id="ig-start-btn" disabled>Start Ingestion</button>
        </div>

        <div class="ig-upload-status" id="ig-upload-status"></div>
      </div>
    `;

    wireEvents();
  }

  function wireEvents() {
    const dropzone = el.querySelector('#ig-dropzone');
    const fileInput = el.querySelector('#ig-file-input');
    const pasteArea = el.querySelector('#ig-paste-area');
    const startBtn = el.querySelector('#ig-start-btn');
    const backBtn = el.querySelector('#ig-upload-back');

    backBtn.addEventListener('click', () => nav.navigateTo('sessions'));

    // Click dropzone opens file picker
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag and drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('ig-dropzone--hover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('ig-dropzone--hover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('ig-dropzone--hover');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handleFile(file);
    });

    // Paste area
    pasteArea.addEventListener('input', () => {
      const text = pasteArea.value.trim();
      if (text) {
        fileContent = text;
        fileName = 'pasted-ontology';
        autoDetect(text, null);
        updateStartButton();
      } else {
        fileContent = null;
        updateStartButton();
      }
    });

    // Weight vector validation on change
    el.querySelectorAll('.ig-config-input').forEach(input => {
      input.addEventListener('input', validateWeights);
    });

    startBtn.addEventListener('click', startIngestion);
  }

  function handleFile(file) {
    const statusEl = el.querySelector('#ig-upload-status');

    if (file.size > MAX_FILE_SIZE) {
      statusEl.innerHTML = `<span class="ig-error">File exceeds 1 MB limit (${(file.size / 1024).toFixed(0)} KB).</span>`;
      return;
    }

    statusEl.innerHTML = '<span class="ig-info">Reading file...</span>';

    const reader = new FileReader();
    reader.onload = () => {
      fileContent = reader.result;
      fileName = file.name;
      autoDetect(fileContent, file.name);
      updateStartButton();
      statusEl.innerHTML = '';
    };
    reader.onerror = () => {
      statusEl.innerHTML = '<span class="ig-error">Failed to read file.</span>';
    };
    reader.readAsText(file);
  }

  function autoDetect(content, filename) {
    try {
      const Fandaws = nav.wbState.Fandaws;
      detectedFormat = Fandaws.detectFormat(filename || '', content.slice(0, 500));
    } catch {
      detectedFormat = 'unknown';
    }

    const row = el.querySelector('#ig-format-row');
    const valEl = el.querySelector('#ig-format-value');
    const nameEl = el.querySelector('#ig-file-name');

    if (row) {
      row.style.display = 'flex';
      valEl.textContent = detectedFormat || 'unknown';
      nameEl.textContent = fileName || '';
    }
  }

  function updateStartButton() {
    const btn = el.querySelector('#ig-start-btn');
    if (btn) btn.disabled = !fileContent;
  }

  function getWeightVector() {
    return {
      domain: parseFloat(el.querySelector('#ig-w-domain')?.value) || 0,
      range: parseFloat(el.querySelector('#ig-w-range')?.value) || 0,
      bfoSubcategory: parseFloat(el.querySelector('#ig-w-bfo')?.value) || 0,
      characteristics: parseFloat(el.querySelector('#ig-w-chars')?.value) || 0,
      allowsInheresIn: parseFloat(el.querySelector('#ig-w-inheres')?.value) || 0,
      lexical: parseFloat(el.querySelector('#ig-w-lexical')?.value) || 0,
    };
  }

  function validateWeights() {
    const valEl = el.querySelector('#ig-config-validation');
    if (!valEl) return true;

    const weights = getWeightVector();
    try {
      const Fandaws = nav.wbState.Fandaws;
      const result = Fandaws.validateWeightVector(weights);
      if (!result.valid) {
        valEl.innerHTML = `<span class="ig-error">${escapeHtml(result.error?.boundViolated || 'Invalid weight vector')}</span>`;
        return false;
      }
      valEl.innerHTML = '<span class="ig-success">Weight vector valid</span>';
      return true;
    } catch (e) {
      valEl.innerHTML = `<span class="ig-error">${escapeHtml(e.message)}</span>`;
      return false;
    }
  }

  async function startIngestion() {
    if (!fileContent) return;

    const statusEl = el.querySelector('#ig-upload-status');
    const startBtn = el.querySelector('#ig-start-btn');

    if (!validateWeights()) {
      statusEl.innerHTML = '<span class="ig-error">Fix weight vector before starting.</span>';
      return;
    }

    startBtn.disabled = true;
    statusEl.innerHTML = '<span class="ig-info">Parsing ontology...</span>';

    try {
      const Fandaws = nav.wbState.Fandaws;

      // Parse ontology
      const parsed = await Fandaws.parseOntology(fileContent, {
        format: detectedFormat !== 'unknown' ? detectedFormat : undefined,
        filename: fileName,
      });

      statusEl.innerHTML = `<span class="ig-info">Parsed: ${parsed.classes.length} classes, ${parsed.properties.length} properties, ${parsed.imports.length} imports. Running Phase 1...</span>`;

      // Record owl:imports but don't follow (W-IM-1)
      const imports = parsed.imports || [];

      // Run Phase 1 via adapter
      const adapter = nav.wbState.getAdapter();
      const graphId = nav.wbState.getGraphId();

      // Ensure placement sandbox is available
      if (adapter._getPlacementSandbox && !adapter._getPlacementSandbox().evaluatePlacement) {
        adapter.__placementSandbox = {
          evaluatePlacement: Fandaws.evaluatePlacement,
          routePlacement: Fandaws.routePlacement,
        };
      }

      const result = adapter.ingestOntology(graphId, {
        sourceOntology: fileName || 'uploaded-ontology',
        classes: parsed.classes,
        properties: parsed.properties,
      });

      if (result.error) {
        statusEl.innerHTML = `<span class="ig-error">${escapeHtml(result.error)}</span>`;
        startBtn.disabled = false;
        return;
      }

      // DP-2.3.0 byte-capture (SME D3.2 lock): compute raw-byte content hash
      // of the source ontology at ingestion time. DP-2.3.2 Final Hash pipeline
      // consumes this via getIngestionHashes(result.sessionId). Failure here
      // is non-fatal for DP-2.1-level session startup but will be load-bearing
      // when DP-2.3.2 lands. Best-effort now; hard-required then.
      if (Fandaws.captureSourceBytes && result.sessionId) {
        try {
          await Fandaws.captureSourceBytes({
            sessionId: result.sessionId,
            bytes: fileContent,
          });
        } catch (hashErr) {
          console.warn('DP-2.3.0 source byte capture failed:', hashErr);
        }
      }

      // Create session in ingest state — async since X9 Step 2 (init
      // per-session Tau Prolog handle alongside session record per X9 §3.1).
      const { id, session, error } = await nav.ingestState.createSession({
        sourceFilename: fileName || 'uploaded-ontology',
        ontologyIRI: parsed.ontologyIRI,
        format: detectedFormat,
        classCount: parsed.classes.length,
        propertyCount: parsed.properties.length,
        importCount: imports.length,
      });

      if (error) {
        statusEl.innerHTML = `<span class="ig-error">${escapeHtml(error)}</span>`;
        startBtn.disabled = false;
        return;
      }

      // Build staging records from the adapter's source axiom graph
      const axiomGraph = adapter.getSourceAxiomGraph();
      const stagingRecords = [];
      for (const [stagingId, record] of axiomGraph.entries()) {
        if (record.type === 'CandidateClass' && record.ingestedInSession === result.sessionId) {
          stagingRecords.push({ ...record, stagingId });
        }
      }

      // Save to ingest state
      nav.ingestState.saveStagingRecords(id, stagingRecords);
      nav.ingestState.saveConfig(id, {
        weightVector: getWeightVector(),
        imports,
        ontologyIRI: parsed.ontologyIRI,
        adapterSessionId: result.sessionId,
        parsedProperties: parsed.properties,
      });

      // Update session phase
      const blocking = result.pipelineState?.phase2Blocked ? ['PendingHumanResolution'] : [];
      nav.ingestState.updateSession(id, {
        phase: 'phase1',
        phase1Complete: true,
        blocking,
      });

      // Navigate to Phase 1 review
      nav.navigateTo('phase1-review', { sessionId: id });

    } catch (e) {
      statusEl.innerHTML = `<span class="ig-error">Ingestion failed: ${escapeHtml(e.message)}</span>`;
      startBtn.disabled = false;
    }
  }

  return {
    show() { render(); },
  };
}
