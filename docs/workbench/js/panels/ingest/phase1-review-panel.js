/**
 * Phase 1 Review Panel — CandidateClass table with expandable resolution rows.
 *
 * Features:
 *   - Table of CandidateClass records
 *   - Expandable rows for PendingHumanResolution with placement dropdown + justification
 *   - Sort/filter, pagination for >100 rows
 *   - "Run Phase 2" button (blocked by pending items)
 *
 * X9 Step 3 (2026-04-25): first production consumer of orchestrator family.
 *   - W-4.4 enforcement: placement + non-empty justification BOTH required for resolve.
 *   - W-D-7 thin-UI-layer: direct orchestrateAnalystOverride invocation; no coordinator.
 *   - X9 §3.2 DP-2 record surfacing: row expansion includes DP-2 subsection when
 *     record carries dp2Record (explanation/provenance/reproducibilityHash).
 *   - X9 §3.4 SWC marker on row header (badge--warning) when record's helper
 *     evidence contains multi-inheritance contradiction reasons
 *     (occurrent_subtree_ancestor / disjointness_explicit_violation).
 */
import { escapeHtml } from '../../utils.js';

const PAGE_SIZE = 100;

// X9 §3.4 — contradiction-reason markers from X5/X6/X7 helper output that
// signal multi-inheritance modeling anomaly (analyst-attention SWC pattern).
export const SWC_CONTRADICTION_REASONS = [
  'occurrent_subtree_ancestor',
  'continuant_subtree_ancestor',
  'disjointness_explicit_violation',
  'process_boundary_ancestor_only',
  'process_boundary_subtree_ancestor',
  'zero_dim_contradiction',
  'temporal_part_decomposition_present',
];

/**
 * Detect SWC (multi-inheritance contradiction) reasons in a staging record.
 * Searches multiple data sources to be resilient to where the dispatcher
 * surfaces evidence: placementJustification text, dp2Record.explanation,
 * helperReasons array.
 * @param {object} record
 * @returns {string[]} list of contradiction reasons found (empty if none)
 */
export function detectSWCReasons(record) {
  if (!record) return [];
  const sources = [
    record.placementJustification || '',
    JSON.stringify(record.dp2Record?.explanation || {}),
    JSON.stringify(record.helperReasons || []),
  ].join(' ');
  return SWC_CONTRADICTION_REASONS.filter(reason => sources.includes(reason));
}

export function truncateHash(hash) {
  if (!hash || typeof hash !== 'string') return '-';
  return hash.length > 16 ? hash.slice(0, 8) + '…' + hash.slice(-8) : hash;
}

const BFO_PLACEMENT_OPTIONS = [
  'MaterialEntity', 'Process', 'Quality', 'RealizableEntity',
  'Role', 'Disposition', 'SpatialRegion', 'TemporalRegion',
  'IndependentContinuant', 'Continuant', 'Occurrent', 'Entity',
];

const STATUS_CLASSES = {
  PlacementConfirmed: 'confirmed',
  PlacementAmbiguous: 'ambiguous',
  PlacementRejected: 'rejected',
  PendingHumanResolution: 'pending',
};

export function initPhase1ReviewPanel(el, nav) {
  let sessionId = null;
  let records = [];
  let sortField = 'sourceLabel';
  let sortDir = 'asc';
  let filterText = '';
  let currentPage = 0;

  function getSessionId(data) {
    return data?.sessionId || nav.ingestState.getActiveSession();
  }

  function loadRecords() {
    if (!sessionId) return;
    records = nav.ingestState.loadStagingRecords(sessionId);
  }

  function getFilteredSorted() {
    let filtered = records;
    if (filterText) {
      const lower = filterText.toLowerCase();
      filtered = records.filter(r =>
        (r.sourceLabel || '').toLowerCase().includes(lower) ||
        (r.sourceIRI || '').toLowerCase().includes(lower) ||
        (r.candidateStatus || '').toLowerCase().includes(lower)
      );
    }

    filtered.sort((a, b) => {
      const aVal = (a[sortField] || '').toString().toLowerCase();
      const bVal = (b[sortField] || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }

  function getPendingCount() {
    return records.filter(r =>
      r.normalizationStatus === 'PendingHumanResolution' || r.candidateStatus === 'PlacementAmbiguous'
    ).length;
  }

  function render() {
    loadRecords();
    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    const pageRecords = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    const pendingCount = getPendingCount();

    const summary = `${records.length} total &middot; ${records.filter(r => r.candidateStatus === 'PlacementConfirmed').length} confirmed &middot; ${pendingCount} pending`;

    el.innerHTML = `
      <div class="ig-phase1-container">
        <div class="ig-phase1-header">
          <button class="btn btn--ghost ig-back-btn" id="ig-p1-back">&larr; Sessions</button>
          <h3 class="ig-panel-title">Phase 1: Class Placement Review</h3>
        </div>

        <div class="ig-phase1-toolbar">
          <input type="text" class="ig-filter-input" id="ig-p1-filter" placeholder="Filter by label, IRI, or status..." value="${escapeHtml(filterText)}" />
          <span class="ig-summary">${summary}</span>
        </div>

        <div class="ig-phase1-table-wrap">
          <table class="ig-table">
            <thead>
              <tr>
                <th class="ig-th-sortable" data-sort="sourceLabel">Label ${sortField === 'sourceLabel' ? (sortDir === 'asc' ? '&#9650;' : '&#9660;') : ''}</th>
                <th class="ig-th-sortable" data-sort="sourceIRI">IRI ${sortField === 'sourceIRI' ? (sortDir === 'asc' ? '&#9650;' : '&#9660;') : ''}</th>
                <th class="ig-th-sortable" data-sort="candidateStatus">Status ${sortField === 'candidateStatus' ? (sortDir === 'asc' ? '&#9650;' : '&#9660;') : ''}</th>
                <th>Placement</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody id="ig-p1-tbody">
              ${pageRecords.map((r, i) => renderRow(r, currentPage * PAGE_SIZE + i)).join('')}
            </tbody>
          </table>
        </div>

        ${totalPages > 1 ? `
          <div class="ig-pagination">
            <button class="btn btn--ghost ig-page-btn" id="ig-p1-prev" ${currentPage === 0 ? 'disabled' : ''}>Prev</button>
            <span>Page ${currentPage + 1} of ${totalPages}</span>
            <button class="btn btn--ghost ig-page-btn" id="ig-p1-next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
          </div>
        ` : ''}

        <div class="ig-phase1-actions">
          <button class="btn btn--primary ig-run-phase2-btn" id="ig-run-phase2"
            ${pendingCount > 0 ? 'disabled title="Resolve all pending placements before running Phase 2"' : ''}>
            Run Phase 2 ${pendingCount > 0 ? `(${pendingCount} pending)` : ''}
          </button>
        </div>
      </div>
    `;

    wireEvents();
  }

  function renderRow(record, index) {
    const statusCls = STATUS_CLASSES[record.candidateStatus] || 'default';
    const isPending = record.normalizationStatus === 'PendingHumanResolution' || record.candidateStatus === 'PlacementAmbiguous';
    const hasDp2 = Boolean(record.dp2Record);
    // Even non-pending rows expand if they have DP-2 records to display
    const isExpandable = isPending || hasDp2;
    const confidence = record.placementConfidence != null ? record.placementConfidence.toFixed(2) : '-';

    // X9 §3.4: SWC marker badge on row header when contradiction reasons present
    const swcReasons = detectSWCReasons(record);
    const swcBadge = swcReasons.length > 0
      ? `<span class="badge badge--warning" title="${escapeHtml(swcReasons.join(', '))}">⚠ Multi-inheritance anomaly</span>`
      : '';

    let rowHtml = `
      <tr class="ig-row ${isExpandable ? 'ig-row--expandable' : ''}" data-index="${index}">
        <td>${escapeHtml(record.sourceLabel || '')} ${swcBadge}</td>
        <td class="ig-cell-iri" title="${escapeHtml(record.sourceIRI || '')}">${escapeHtml(truncateIri(record.sourceIRI || ''))}</td>
        <td><span class="ig-status-badge ig-status--${statusCls}">${escapeHtml(record.candidateStatus || '-')}</span></td>
        <td>${escapeHtml(record.placementResult || '-')}</td>
        <td>${confidence}</td>
      </tr>
    `;

    if (isExpandable) {
      const dp2Section = hasDp2 ? renderDp2Section(record.dp2Record) : '';
      const swcSection = swcReasons.length > 0 ? renderSwcSection(swcReasons, record) : '';
      const resolveSection = isPending ? renderResolveSection(record) : '';

      rowHtml += `
        <tr class="ig-expand-row" data-index="${index}" style="display:none">
          <td colspan="5">
            <div class="ig-resolve-form">
              ${swcSection}
              <div class="ig-resolve-justification">${escapeHtml(record.placementJustification || 'No placement heuristic matched.')}</div>
              ${dp2Section}
              ${resolveSection}
            </div>
          </td>
        </tr>
      `;
    }

    return rowHtml;
  }

  function renderResolveSection(record) {
    return `
      <div class="ig-resolve-controls">
        <select class="ig-placement-select" data-record-iri="${escapeHtml(record.sourceIRI || '')}">
          <option value="">Select BFO placement...</option>
          ${BFO_PLACEMENT_OPTIONS.map(opt =>
            `<option value="${opt}" ${record.placementResult === opt ? 'selected' : ''}>${opt}</option>`
          ).join('')}
        </select>
        <input type="text" class="ig-justify-input" placeholder="Justification (required) *" required />
        <button class="btn btn--primary ig-resolve-btn" data-record-iri="${escapeHtml(record.sourceIRI || '')}">Confirm Placement</button>
        <div class="ig-resolve-error" data-record-iri="${escapeHtml(record.sourceIRI || '')}" style="display:none; color: var(--red); margin-top: 4px; font-size: 0.85em;"></div>
      </div>
    `;
  }

  function renderSwcSection(reasons, record) {
    return `
      <div class="ig-swc-block" style="background: var(--yellow-bg); padding: 8px 12px; border-left: 3px solid var(--yellow); margin-bottom: 8px; border-radius: 4px;">
        <strong>⚠ Multi-inheritance modeling anomaly detected.</strong>
        <p style="margin: 4px 0; font-size: 0.9em;">Real-inference dispatcher surfaced contradiction reasons:
          <code>${escapeHtml(reasons.join(', '))}</code>.
          The CAU's signature has structurally incompatible ancestor commitments per X5/X6/X7 contradiction-wins precedence.
          Either confirm the contradiction via analyst override OR consider editing the source ontology before re-ingestion.
        </p>
      </div>
    `;
  }

  function renderDp2Section(dp2) {
    const explanationSummary = dp2.explanation
      ? (dp2.explanation.summary || dp2.explanation.disposition || JSON.stringify(dp2.explanation).slice(0, 200))
      : '-';
    const provenanceSummary = dp2.provenance
      ? (dp2.provenance.mechanism || '-') + (dp2.provenance.causedBy ? ` (caused by: ${escapeHtml(dp2.provenance.causedBy)})` : '')
      : '-';
    const repHash = dp2.reproducibilityHash || dp2.recordHash || '-';
    return `
      <details class="ig-dp2-record" style="margin-top: 8px; border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px;">
        <summary style="cursor: pointer; font-weight: 600; font-size: 0.9em;">DP-2 Record</summary>
        <div style="font-size: 0.85em; margin-top: 6px;">
          <div><strong>Explanation:</strong> ${escapeHtml(String(explanationSummary))}</div>
          <div><strong>Provenance:</strong> ${escapeHtml(provenanceSummary)}</div>
          <div><strong>Reproducibility Hash:</strong>
            <code class="ig-dp2-hash" data-hash="${escapeHtml(repHash)}" title="Click to copy" style="cursor: pointer;">${escapeHtml(truncateHash(repHash))}</code>
          </div>
        </div>
      </details>
    `;
  }

  function truncateIri(iri) {
    if (iri.length <= 50) return iri;
    return '...' + iri.slice(-47);
  }

  function wireEvents() {
    el.querySelector('#ig-p1-back')?.addEventListener('click', () => nav.navigateTo('sessions'));

    // Filter
    el.querySelector('#ig-p1-filter')?.addEventListener('input', (e) => {
      filterText = e.target.value;
      currentPage = 0;
      render();
    });

    // Sort
    el.querySelectorAll('.ig-th-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (sortField === field) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortField = field;
          sortDir = 'asc';
        }
        render();
      });
    });

    // Pagination
    el.querySelector('#ig-p1-prev')?.addEventListener('click', () => { currentPage--; render(); });
    el.querySelector('#ig-p1-next')?.addEventListener('click', () => { currentPage++; render(); });

    // Expandable rows
    el.querySelectorAll('.ig-row--expandable').forEach(row => {
      row.addEventListener('click', () => {
        const idx = row.dataset.index;
        const expandRow = el.querySelector(`.ig-expand-row[data-index="${idx}"]`);
        if (expandRow) {
          expandRow.style.display = expandRow.style.display === 'none' ? 'table-row' : 'none';
        }
      });
    });

    // X9 Step 3 (2026-04-25): resolve handler is async — invokes
    // orchestrateAnalystOverride per W-D-7 thin-UI-layer + X9 §3.3.
    // W-4.4 enforcement: placement + non-empty justification BOTH required.
    // Justification is no longer optional per memo §8 Step 3 reminders.
    el.querySelectorAll('.ig-resolve-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const iri = btn.dataset.recordIri;
        const form = btn.closest('.ig-resolve-form');
        const select = form.querySelector('.ig-placement-select');
        const justifyInput = form.querySelector('.ig-justify-input');
        const errorEl = form.querySelector('.ig-resolve-error');
        const placement = select.value;
        const justification = (justifyInput?.value || '').trim();

        // W-4.4: placement REQUIRED
        if (!placement) {
          select.style.borderColor = 'var(--red)';
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = 'Placement is required.';
          }
          return;
        }
        // W-4.4: justification REQUIRED (non-empty after trim)
        if (!justification) {
          if (justifyInput) justifyInput.style.borderColor = 'var(--red)';
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = 'Justification is required for analyst override (W-4.4).';
          }
          return;
        }

        const Fandaws = nav.wbState.Fandaws;
        const adapter = nav.wbState.getAdapter();
        const graphId = nav.wbState.getGraphId();
        const record = records.find(r => r.sourceIRI === iri);

        // Ensure placement sandbox (legacy adapter scaffolding preserved)
        if (adapter._getPlacementSandbox && !adapter._getPlacementSandbox().evaluatePlacement) {
          adapter.__placementSandbox = {
            evaluatePlacement: Fandaws.evaluatePlacement,
            routePlacement: Fandaws.routePlacement,
          };
        }
        adapter.resolvePlacement(graphId, iri, placement);

        // X9 §3.3: invoke orchestrateAnalystOverride per W-D-7 thin-UI-layer.
        // First production consumer of X3 Commit 1's analyst-override entry point.
        let dp2Record = null;
        if (Fandaws.orchestrateAnalystOverride) {
          try {
            dp2Record = await Fandaws.orchestrateAnalystOverride(iri, {
              overrideMetadata: {
                analystId: 'workbench-user',
                rationale: justification,
                priorAutomatedDisposition: record?.candidateStatus || 'PlacementAmbiguous',
                priorAutomatedBfoCategory: record?.placementResult || null,
                timestamp: new Date().toISOString(),
              },
              overrideResult: {
                disposition: 'Entailed',
                bfoCategory: `bfo:${placement}`,
              },
              explanationInput: {
                sourceIRI: iri,
                analystJustification: justification,
                originalJustification: record?.placementJustification || null,
              },
              iterationState: { phase: 1 },
              sessionState: { backgroundTheoryVersion: 'BFO-2020', compatibilityDegraded: false },
            }, {
              sessionId: sessionId,
              phase: 'production',
            }, adapter);
          } catch (err) {
            // Throw-not-warn: contract violations propagate to UI per
            // feedback_throw_not_warn_enforcement.md. Surface visibly via
            // both inline error AND the shared error banner (X9 Step 7
            // W-EH-2 cross-panel error visibility).
            console.error('orchestrateAnalystOverride failed:', err);
            if (errorEl) {
              errorEl.style.display = 'block';
              errorEl.textContent = `Override failed: ${err.message}`;
            }
            if (typeof nav.showError === 'function') {
              nav.showError(`Analyst override failed: ${err.message}`, 'error');
            }
            return;
          }
        }

        // Update local record with X9 §3.2 DP-2 surfacing fields.
        if (record) {
          record.candidateStatus = 'PlacementConfirmed';
          record.normalizationStatus = 'Normalized';
          record.placementResult = placement;
          record.placementJustification = (record.placementJustification || '') + ' | User: ' + justification;
          if (dp2Record) record.dp2Record = dp2Record;
          nav.ingestState.saveStagingRecords(sessionId, records);
        }

        // Update session blocking
        if (getPendingCount() === 0) {
          nav.ingestState.updateSession(sessionId, { blocking: [] });
        }

        render();
      });
    });

    // DP-2 hash click-to-copy
    el.querySelectorAll('.ig-dp2-hash').forEach(codeEl => {
      codeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const hash = codeEl.dataset.hash;
        if (hash && navigator.clipboard) {
          navigator.clipboard.writeText(hash).then(
            () => { codeEl.title = 'Copied!'; setTimeout(() => { codeEl.title = 'Click to copy'; }, 1500); },
            () => { /* clipboard denied; no-op */ }
          );
        }
      });
    });

    // Run Phase 2
    el.querySelector('#ig-run-phase2')?.addEventListener('click', runPhase2);
  }

  function runPhase2() {
    if (getPendingCount() > 0) return;

    const config = nav.ingestState.loadConfig(sessionId);
    if (!config) return;

    const Fandaws = nav.wbState.Fandaws;
    const adapter = nav.wbState.getAdapter();
    const graphId = nav.wbState.getGraphId();
    const graph = nav.wbState.getGraph();

    const properties = config.parsedProperties || [];
    const weights = config.weightVector || Fandaws.DEFAULT_WEIGHT_VECTOR;

    // Build fingerprints and score against canonical inventory
    const phase2Records = [];

    // Get canonical relations: start with C2 seed relation type schemas
    const canonicalRelations = [
      { id: 'fandaws:class/relation/has-part', label: 'has part',
        fingerprint: Fandaws.buildFingerprint({ declaredDomain: 'bfo:MaterialEntity', declaredRange: 'bfo:MaterialEntity', declaredCharacteristics: ['transitive'], label: 'has part' }) },
      { id: 'fandaws:class/relation/inheres-in', label: 'inheres in',
        fingerprint: Fandaws.buildFingerprint({ declaredDomain: 'bfo:Quality', declaredRange: 'bfo:IndependentContinuant', declaredCharacteristics: [], bfoSubcategory: 'bfo:Quality', label: 'inheres in' }) },
      { id: 'fandaws:class/relation/obligated-to', label: 'obligated to',
        fingerprint: Fandaws.buildFingerprint({ declaredDomain: 'bfo:Agent', declaredRange: 'bfo:Process', declaredCharacteristics: [], bfoSubcategory: 'bfo:Disposition', label: 'obligated to' }) },
    ];

    // Also add any restrictions from the existing graph as canonical relations
    const concepts = graph?.['fandaws:concepts'] || [];
    for (const c of concepts) {
      const restrictions = c['rdfs:subClassOf'] || [];
      for (const r of restrictions) {
        if (r['owl:onProperty'] && r['owl:onProperty'].startsWith('fandaws:objectProperty/')) {
          const verbTail = r['owl:onProperty'].replace('fandaws:objectProperty/', '');
          canonicalRelations.push({
            id: r['owl:onProperty'],
            label: verbTail.replace(/_/g, ' '),
            fingerprint: Fandaws.buildFingerprint({
              declaredDomain: c['fandaws:bfoCategory'] || null,
              declaredRange: null,
              declaredCharacteristics: [],
              label: verbTail.replace(/_/g, ' '),
            }),
          });
        }
      }
    }

    for (const prop of properties) {
      const fingerprint = Fandaws.buildFingerprint({
        declaredDomain: prop.declaredDomain,
        declaredRange: prop.declaredRange,
        declaredCharacteristics: prop.declaredCharacteristics || [],
        bfoSubcategory: null,
        allowsInheresIn: false,
        label: prop.label,
      });

      let scores = [];
      try {
        scores = Fandaws.scoreAgainstAll(fingerprint, canonicalRelations, weights);
      } catch { /* no canonical relations */ }

      let routing;
      try {
        routing = Fandaws.routeCandidate(scores);
      } catch {
        routing = { disposition: 'NovelPromotionPanel', topScore: 0, secondScore: 0, margin: 0 };
      }

      phase2Records.push({
        iri: prop.iri,
        label: prop.label,
        fingerprint,
        scores: scores.slice(0, 10), // top 10
        routing,
        declaredDomain: prop.declaredDomain,
        declaredRange: prop.declaredRange,
        declaredCharacteristics: prop.declaredCharacteristics || [],
        subPropertyOf: prop.subPropertyOf,
        action: null,       // Merge|Reject|PromoteAsSubProperty|PromoteAsNewRelation
        justification: '',
        resolved: routing.disposition === 'AutoMerged',
      });
    }

    nav.ingestState.savePhase2Records(sessionId, phase2Records);
    nav.ingestState.updateSession(sessionId, { phase: 'phase2', phase2Complete: false });
    nav.navigateTo('phase2-review', { sessionId });
  }

  return {
    show(data) {
      sessionId = getSessionId(data);
      sortField = 'sourceLabel';
      sortDir = 'asc';
      filterText = '';
      currentPage = 0;
      render();
    },
  };
}
