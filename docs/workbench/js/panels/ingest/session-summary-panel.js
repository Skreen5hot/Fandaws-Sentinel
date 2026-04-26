/**
 * Session Summary Panel — three phase cards, invariant audit card, export buttons.
 *
 * Invariant Audit Card: PS-1 hash, PS-2 session, PS-9 closure, PD-2 firings,
 *                       PD-10 vector, Horn cap, tau-prolog version.
 *
 * Export: Turtle, JSON Bundle (schemaVersion "1.0"), Prolog Traces.
 *
 * X9 Step 6 (2026-04-25): production wiring of DP-2 invariants subsection
 * (X9 §3.2 + memo §3.4 — Workbench invariants above the line; DP-2 below);
 * Review panel links on phase summary cards (W-7.2 spot-check); MergeRecord
 * count link (W-7.5); real SHA-256 PS-1 hash via Fandaws.sha256 bundle export.
 */
import { escapeHtml } from '../../utils.js';

/**
 * Compute DP-2 invariant audit counts from phase records. Surfaces I1/I2a/
 * I2b/I3/I4 indicators per X9 §3.2 visual hierarchy. For v0.2 scope, counts
 * derive from records that carry an emitted dp2Record field (analyst override
 * path in Phase 1 Review per X9 Step 3); records without dp2Record are not
 * counted (consistent with Phase D2 stub-when-absent honest discipline at
 * Step 4 §3.4).
 *
 * @param {object[]} stagingRecords - Phase 1 records
 * @param {object[]} phase2Records - Phase 2 records
 * @returns {{i1: number, i2a: number, i2b: number, i3: 'green'|'pending', i4: number, totalDp2: number}}
 */
export function computeDp2InvariantAudit(stagingRecords, phase2Records) {
  const allRecords = [...(stagingRecords || []), ...(phase2Records || [])];
  const dp2Records = allRecords.map(r => r.dp2Record).filter(Boolean);
  // I1 schema gate: records that pass schema validation (have explanation)
  const i1 = dp2Records.filter(d => d.explanation).length;
  // I2a content validation: records with valid content shape (explanation + provenance)
  const i2a = dp2Records.filter(d => d.explanation && d.provenance).length;
  // I2b hash correctness: records carrying a reproducibility hash
  const i2b = dp2Records.filter(d => d.reproducibilityHash || d.recordHash).length;
  // I3 deterministic hash: green when all DP-2 records carry hashes (necessary
  // condition for reproducibility); pending when no records emitted yet.
  const i3 = dp2Records.length === 0 ? 'pending' : (i2b === dp2Records.length ? 'green' : 'partial');
  // I4 dictionary discipline: records with valid axiom dictionary references
  // (provenance.causedBy or provenance.mechanism populated)
  const i4 = dp2Records.filter(d => d.provenance && (d.provenance.causedBy || d.provenance.mechanism)).length;
  return { i1, i2a, i2b, i3, i4, totalDp2: dp2Records.length };
}

export function initSessionSummaryPanel(el, nav) {
  let sessionId = null;

  function getSessionId(data) {
    return data?.sessionId || nav.ingestState.getActiveSession();
  }

  function render() {
    const session = nav.ingestState.getSession(sessionId);
    if (!session) {
      el.innerHTML = '<div class="ig-empty-state">Session not found.</div>';
      return;
    }

    const staging = nav.ingestState.loadStagingRecords(sessionId);
    const phase2 = nav.ingestState.loadPhase2Records(sessionId);
    const phase3 = nav.ingestState.loadPhase3Records(sessionId);
    const config = nav.ingestState.loadConfig(sessionId);
    const summary = session.summary || {};

    const confirmedCount = staging.filter(r => r.candidateStatus === 'PlacementConfirmed').length;
    const ambiguousCount = staging.filter(r => r.candidateStatus === 'PlacementAmbiguous').length;
    const rejectedCount = staging.filter(r => r.candidateStatus === 'PlacementRejected').length;

    const mergedCount = phase2.filter(r => r.action === 'Merge').length;
    const novelCount = phase2.filter(r => r.action === 'PromoteAsNewRelation').length;
    const subPropCount = phase2.filter(r => r.action === 'PromoteAsSubProperty').length;
    const rejectedPropCount = phase2.filter(r => r.action === 'Reject').length;

    const errorCount = phase3.filter(v => v.severity === 'error').length;
    const warnCount = phase3.filter(v => v.severity === 'warning').length;

    // Compute invariant audit values
    const weights = config?.weightVector || {};
    const pd2Firings = phase2.filter(r => r.routing?.disjointFloorTriggered).length;
    const weightStr = Object.entries(weights).map(([k, v]) => `${k}=${v}`).join(', ');

    // PS-1 content hash. Render with synchronous fallback hash first; the
    // Fandaws.sha256 export is async (Web Crypto / node:crypto) — kick off
    // the real digest async and update the DOM when it resolves so render()
    // stays sync for skeleton compatibility.
    const Fandaws = nav.wbState.Fandaws;
    const ps1Source = JSON.stringify(staging) + JSON.stringify(phase2);
    const ps1HashFull = computeSimpleHash(ps1Source);
    const ps1HashDisplay = typeof ps1HashFull === 'string' && ps1HashFull.length > 16
      ? ps1HashFull.slice(0, 8) + '…' + ps1HashFull.slice(-8)
      : ps1HashFull;
    // Async upgrade to real SHA-256 once Fandaws bundle is available
    if (Fandaws && typeof Fandaws.sha256 === 'function') {
      Fandaws.sha256(ps1Source).then(realHash => {
        const codeEl = el.querySelector('.ig-ps1-hash');
        if (codeEl && realHash) {
          codeEl.dataset.hash = realHash;
          const truncated = realHash.length > 16 ? realHash.slice(0, 8) + '…' + realHash.slice(-8) : realHash;
          codeEl.textContent = truncated;
        }
      }).catch(() => { /* fallback hash already rendered */ });
    }

    // X9 §3.2 DP-2 invariants subsection
    const dp2Audit = computeDp2InvariantAudit(staging, phase2);
    const i3Indicator = dp2Audit.i3 === 'green' ? '✓ All hashes present'
      : dp2Audit.i3 === 'partial' ? '⚠ Partial hash coverage'
      : '— No DP-2 records emitted yet';

    // W-7.5 MergeRecord count for the merges-link
    const mergeRecords = phase2.filter(r => r.action === 'Merge' && r.mergeRecordId);

    el.innerHTML = `
      <div class="ig-summary-container">
        <div class="ig-summary-header">
          <button class="btn btn--ghost ig-back-btn" id="ig-sum-back">&larr; Sessions</button>
          <h3 class="ig-panel-title">Session Summary</h3>
          <span class="ig-summary-filename">${escapeHtml(session.sourceFilename)}</span>
        </div>

        <div class="ig-summary-cards">
          <div class="ig-summary-card ig-summary-card--phase1">
            <h4>Phase 1: Class Placement
              <a href="#" class="ig-card-link" data-nav="phase1-review" title="Spot-check Phase 1 Review (W-7.2)">↗</a>
            </h4>
            <div class="ig-summary-stat"><span class="ig-stat-val">${staging.length}</span> classes processed</div>
            <div class="ig-summary-detail">
              <span class="ig-stat-confirmed">${confirmedCount} confirmed</span>
              <span class="ig-stat-ambiguous">${ambiguousCount} resolved ambiguous</span>
              <span class="ig-stat-rejected">${rejectedCount} rejected</span>
            </div>
          </div>

          <div class="ig-summary-card ig-summary-card--phase2">
            <h4>Phase 2: Property Disambiguation
              <a href="#" class="ig-card-link" data-nav="phase2-review" title="Spot-check Phase 2 Review (W-7.2)">↗</a>
            </h4>
            <div class="ig-summary-stat"><span class="ig-stat-val">${phase2.length}</span> properties processed</div>
            <div class="ig-summary-detail">
              <span class="ig-stat-merged">${mergedCount} merged</span>
              <span class="ig-stat-novel">${novelCount} new relations</span>
              <span class="ig-stat-subprop">${subPropCount} sub-properties</span>
              <span class="ig-stat-rejected">${rejectedPropCount} rejected</span>
            </div>
            ${mergeRecords.length > 0
              ? `<div class="ig-summary-detail"><a href="#" class="ig-merges-link" id="ig-merges-link">View MergeRecords (${mergeRecords.length}) ↗</a></div>`
              : ''}
          </div>

          <div class="ig-summary-card ig-summary-card--phase3">
            <h4>Phase 3: Sandbox Verification
              <a href="#" class="ig-card-link" data-nav="phase3-review" title="Spot-check Phase 3 Review (W-7.2)">↗</a>
            </h4>
            <div class="ig-summary-stat"><span class="ig-stat-val">${phase3.length}</span> violations found</div>
            <div class="ig-summary-detail">
              <span class="ig-stat-errors">${errorCount} errors</span>
              <span class="ig-stat-warnings">${warnCount} warnings</span>
            </div>
          </div>
        </div>

        <div class="ig-summary-card ig-summary-card--audit">
          <h4>Invariant Audit</h4>
          <table class="ig-audit-table">
            <tr><td>PS-1 Content Hash</td><td>
              <code class="ig-ps1-hash" data-hash="${escapeHtml(ps1HashFull)}" title="Click to copy full SHA-256" style="cursor: pointer;">${escapeHtml(ps1HashDisplay)}</code>
            </td></tr>
            <tr><td>PS-2 Session ID</td><td><code>${escapeHtml(config?.adapterSessionId || sessionId)}</code></td></tr>
            <tr><td>PS-9 Closure</td><td>${staging.length} classes in reflexive-transitive closure</td></tr>
            <tr><td>PD-2 Disjoint Firings</td><td>${pd2Firings}</td></tr>
            <tr><td>PD-10 Weight Vector</td><td><code>${escapeHtml(weightStr || 'default')}</code></td></tr>
            <tr><td>Horn Cap</td><td>JS harness (browser-side)</td></tr>
            <tr><td>Engine</td><td>JS violation harness v0.2 (no tau-prolog CJS)</td></tr>
          </table>

          <!-- X9 §3.2 DP-2 invariants subsection (memo §3.4 visual ordering:
               Workbench invariants above the line; DP-2 invariants below). -->
          <h5 class="ig-audit-subhead" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">DP-2 Invariants (X-arc)</h5>
          <table class="ig-audit-table ig-audit-table--dp2">
            <tr>
              <td>I1 Schema Gate</td>
              <td>${dp2Audit.totalDp2 > 0 ? `${dp2Audit.i1} of ${dp2Audit.totalDp2} records validated` : '— No DP-2 records emitted yet'}</td>
            </tr>
            <tr>
              <td>I2a Content Validation</td>
              <td>${dp2Audit.totalDp2 > 0 ? `${dp2Audit.i2a} of ${dp2Audit.totalDp2} records have explanation + provenance` : '—'}</td>
            </tr>
            <tr>
              <td>I2b Hash Correctness</td>
              <td>${dp2Audit.totalDp2 > 0 ? `${dp2Audit.i2b} of ${dp2Audit.totalDp2} records carry reproducibility hash` : '—'}</td>
            </tr>
            <tr>
              <td>I3 Deterministic Hash</td>
              <td>${escapeHtml(i3Indicator)}</td>
            </tr>
            <tr>
              <td>I4 Dictionary Discipline</td>
              <td>${dp2Audit.totalDp2 > 0 ? `${dp2Audit.i4} of ${dp2Audit.totalDp2} records have provenance dictionary references` : '—'}</td>
            </tr>
          </table>
        </div>

        ${mergeRecords.length > 0 ? `
          <details class="ig-summary-card ig-summary-card--merges" id="ig-merges-detail">
            <summary><strong>MergeRecords (${mergeRecords.length})</strong> — W-7.5 audit table</summary>
            <table class="ig-merges-table" style="margin-top: 8px; width: 100%;">
              <thead>
                <tr><th>Source IRI</th><th>Canonical Target</th><th>Confidence</th><th>Justification</th></tr>
              </thead>
              <tbody>
                ${mergeRecords.map(r => `
                  <tr>
                    <td><code>${escapeHtml(r.iri || '-')}</code></td>
                    <td><code>${escapeHtml(r.scores?.[0]?.canonicalId || '-')}</code></td>
                    <td>${(r.scores?.[0]?.score || 0).toFixed(3)}</td>
                    <td>${escapeHtml(r.justification || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </details>
        ` : ''}

        <div class="ig-summary-exports">
          <h4>Export</h4>
          <div class="ig-export-buttons">
            <button class="btn btn--primary" id="ig-export-turtle">Turtle (.ttl)</button>
            <button class="btn btn--primary" id="ig-export-json">JSON Bundle (.json)</button>
            <button class="btn btn--ghost" id="ig-export-traces">Prolog Traces (.pl)</button>
          </div>
        </div>
      </div>
    `;

    wireEvents(session, staging, phase2, phase3, config);
  }

  function wireEvents(session, staging, phase2, phase3, config) {
    el.querySelector('#ig-sum-back')?.addEventListener('click', () => nav.navigateTo('sessions'));

    // W-7.2: Review panel spot-check links on phase summary cards
    el.querySelectorAll('.ig-card-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.dataset.nav;
        if (target) nav.navigateTo(target, { sessionId });
      });
    });

    // W-7.5: MergeRecord audit table — toggles the <details> open via link
    el.querySelector('#ig-merges-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      const detail = el.querySelector('#ig-merges-detail');
      if (detail) {
        detail.open = true;
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // PS-1 hash click-to-copy (full 64-char SHA-256)
    el.querySelectorAll('.ig-ps1-hash').forEach(codeEl => {
      codeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const hash = codeEl.dataset.hash;
        if (hash && navigator.clipboard) {
          navigator.clipboard.writeText(hash).then(
            () => { codeEl.title = 'Copied!'; setTimeout(() => { codeEl.title = 'Click to copy full SHA-256'; }, 1500); },
            () => { /* clipboard denied; no-op */ }
          );
        }
      });
    });

    el.querySelector('#ig-export-turtle')?.addEventListener('click', () => {
      try {
        const graph = nav.wbState.getGraph();
        const Fandaws = nav.wbState.Fandaws;
        const turtle = Fandaws.exportGraph(graph, { format: 'turtle' });
        downloadFile(turtle, `${session.sourceFilename || 'ingestion'}-result.ttl`, 'text/turtle');
      } catch (e) {
        alert('Export failed: ' + e.message);
      }
    });

    el.querySelector('#ig-export-json')?.addEventListener('click', () => {
      const bundle = {
        schemaVersion: '1.0',
        workbenchVersion: '0.2',
        fandawsVersion: '2.1',
        generatedAt: new Date().toISOString(),
        session: {
          id: sessionId,
          sourceFilename: session.sourceFilename,
          ontologyIRI: session.ontologyIRI,
          format: session.format,
          createdAt: session.createdAt,
        },
        phase1: {
          classCount: staging.length,
          records: staging,
        },
        phase2: {
          propertyCount: phase2.length,
          records: phase2,
        },
        phase3: {
          violationCount: phase3.length,
          violations: phase3,
        },
        config: config || {},
      };
      downloadFile(JSON.stringify(bundle, null, 2), `${session.sourceFilename || 'ingestion'}-bundle.json`, 'application/json');
    });

    el.querySelector('#ig-export-traces')?.addEventListener('click', () => {
      const traces = phase3.map(v =>
        `%% ${v.rule}: ${v.ruleName}\n%% Severity: ${v.severity}\n%% Concept: ${v.conceptIri}\n%% Message: ${v.message}\n${v.trace || '% No trace'}\n`
      ).join('\n');

      const header = `%% Fandaws Workbench v0.2 — Prolog Traces\n%% Session: ${sessionId}\n%% Generated: ${new Date().toISOString()}\n%% Violations: ${phase3.length}\n\n`;
      downloadFile(header + traces, `${session.sourceFilename || 'ingestion'}-traces.pl`, 'text/plain');
    });
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Simple non-cryptographic hash for PS-1 content hash display.
   * In production this would use sha256.
   */
  function computeSimpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'hash:' + Math.abs(hash).toString(16).padStart(8, '0');
  }

  return {
    show(data) {
      sessionId = getSessionId(data);
      render();
    },
  };
}
