/**
 * Session Summary Panel — three phase cards, invariant audit card, export buttons.
 *
 * Invariant Audit Card: PS-1 hash, PS-2 session, PS-9 closure, PD-2 firings,
 *                       PD-10 vector, Horn cap, tau-prolog version.
 *
 * Export: Turtle, JSON Bundle (schemaVersion "1.0"), Prolog Traces.
 */
import { escapeHtml } from '../../utils.js';

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

    // PS-1 hash placeholder (would use sha256 of canonical graph)
    const ps1Hash = computeSimpleHash(JSON.stringify(staging) + JSON.stringify(phase2));

    el.innerHTML = `
      <div class="ig-summary-container">
        <div class="ig-summary-header">
          <button class="btn btn--ghost ig-back-btn" id="ig-sum-back">&larr; Sessions</button>
          <h3 class="ig-panel-title">Session Summary</h3>
          <span class="ig-summary-filename">${escapeHtml(session.sourceFilename)}</span>
        </div>

        <div class="ig-summary-cards">
          <div class="ig-summary-card ig-summary-card--phase1">
            <h4>Phase 1: Class Placement</h4>
            <div class="ig-summary-stat"><span class="ig-stat-val">${staging.length}</span> classes processed</div>
            <div class="ig-summary-detail">
              <span class="ig-stat-confirmed">${confirmedCount} confirmed</span>
              <span class="ig-stat-ambiguous">${ambiguousCount} resolved ambiguous</span>
              <span class="ig-stat-rejected">${rejectedCount} rejected</span>
            </div>
          </div>

          <div class="ig-summary-card ig-summary-card--phase2">
            <h4>Phase 2: Property Disambiguation</h4>
            <div class="ig-summary-stat"><span class="ig-stat-val">${phase2.length}</span> properties processed</div>
            <div class="ig-summary-detail">
              <span class="ig-stat-merged">${mergedCount} merged</span>
              <span class="ig-stat-novel">${novelCount} new relations</span>
              <span class="ig-stat-subprop">${subPropCount} sub-properties</span>
              <span class="ig-stat-rejected">${rejectedPropCount} rejected</span>
            </div>
          </div>

          <div class="ig-summary-card ig-summary-card--phase3">
            <h4>Phase 3: Sandbox Verification</h4>
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
            <tr><td>PS-1 Content Hash</td><td><code>${escapeHtml(ps1Hash)}</code></td></tr>
            <tr><td>PS-2 Session ID</td><td><code>${escapeHtml(config?.adapterSessionId || sessionId)}</code></td></tr>
            <tr><td>PS-9 Closure</td><td>${staging.length} classes in reflexive-transitive closure</td></tr>
            <tr><td>PD-2 Disjoint Firings</td><td>${pd2Firings}</td></tr>
            <tr><td>PD-10 Weight Vector</td><td><code>${escapeHtml(weightStr || 'default')}</code></td></tr>
            <tr><td>Horn Cap</td><td>JS harness (browser-side)</td></tr>
            <tr><td>Engine</td><td>JS violation harness v0.2 (no tau-prolog CJS)</td></tr>
          </table>
        </div>

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
