/**
 * Phase 1 Review Panel — CandidateClass table with expandable resolution rows.
 *
 * Features:
 *   - Table of CandidateClass records
 *   - Expandable rows for PendingHumanResolution with placement dropdown + justification
 *   - Sort/filter, pagination for >100 rows
 *   - "Run Phase 2" button (blocked by pending items)
 */
import { escapeHtml } from '../../utils.js';

const PAGE_SIZE = 100;

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
    const confidence = record.placementConfidence != null ? record.placementConfidence.toFixed(2) : '-';

    let rowHtml = `
      <tr class="ig-row ${isPending ? 'ig-row--expandable' : ''}" data-index="${index}">
        <td>${escapeHtml(record.sourceLabel || '')}</td>
        <td class="ig-cell-iri" title="${escapeHtml(record.sourceIRI || '')}">${escapeHtml(truncateIri(record.sourceIRI || ''))}</td>
        <td><span class="ig-status-badge ig-status--${statusCls}">${escapeHtml(record.candidateStatus || '-')}</span></td>
        <td>${escapeHtml(record.placementResult || '-')}</td>
        <td>${confidence}</td>
      </tr>
    `;

    if (isPending) {
      rowHtml += `
        <tr class="ig-expand-row" data-index="${index}" style="display:none">
          <td colspan="5">
            <div class="ig-resolve-form">
              <div class="ig-resolve-justification">${escapeHtml(record.placementJustification || 'No placement heuristic matched.')}</div>
              <div class="ig-resolve-controls">
                <select class="ig-placement-select" data-record-iri="${escapeHtml(record.sourceIRI || '')}">
                  <option value="">Select BFO placement...</option>
                  ${BFO_PLACEMENT_OPTIONS.map(opt =>
                    `<option value="${opt}" ${record.placementResult === opt ? 'selected' : ''}>${opt}</option>`
                  ).join('')}
                </select>
                <input type="text" class="ig-justify-input" placeholder="Justification (optional)" />
                <button class="btn btn--primary ig-resolve-btn" data-record-iri="${escapeHtml(record.sourceIRI || '')}">Confirm Placement</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }

    return rowHtml;
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

    // Resolve buttons
    el.querySelectorAll('.ig-resolve-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const iri = btn.dataset.recordIri;
        const form = btn.closest('.ig-resolve-form');
        const select = form.querySelector('.ig-placement-select');
        const justifyInput = form.querySelector('.ig-justify-input');
        const placement = select.value;

        if (!placement) {
          select.style.borderColor = 'var(--red)';
          return;
        }

        // Resolve in adapter
        const adapter = nav.wbState.getAdapter();
        const graphId = nav.wbState.getGraphId();

        // Ensure placement sandbox
        const Fandaws = nav.wbState.Fandaws;
        if (adapter._getPlacementSandbox && !adapter._getPlacementSandbox().evaluatePlacement) {
          adapter.__placementSandbox = {
            evaluatePlacement: Fandaws.evaluatePlacement,
            routePlacement: Fandaws.routePlacement,
          };
        }

        adapter.resolvePlacement(graphId, iri, placement);

        // Update local record
        const record = records.find(r => r.sourceIRI === iri);
        if (record) {
          record.candidateStatus = 'PlacementConfirmed';
          record.normalizationStatus = 'Normalized';
          record.placementResult = placement;
          if (justifyInput.value) {
            record.placementJustification = (record.placementJustification || '') + ' | User: ' + justifyInput.value;
          }
          nav.ingestState.saveStagingRecords(sessionId, records);
        }

        // Update session blocking
        if (getPendingCount() === 0) {
          nav.ingestState.updateSession(sessionId, { blocking: [] });
        }

        render();
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

    // Get canonical relations from the graph
    const concepts = graph?.['fandaws:concepts'] || [];
    const canonicalRelations = [];
    for (const c of concepts) {
      const restrictions = c['rdfs:subClassOf'] || [];
      for (const r of restrictions) {
        if (r['owl:onProperty']) {
          canonicalRelations.push({
            id: r['owl:onProperty'],
            label: (r['fandaws:propertyLabel'] || r['owl:onProperty'] || '').toLowerCase(),
            declaredDomain: c['fandaws:bfoCategory'] || null,
            declaredRange: r['fandaws:rangeBfoCategory'] || null,
            bfoSubcategory: null,
            declaredCharacteristics: [],
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
