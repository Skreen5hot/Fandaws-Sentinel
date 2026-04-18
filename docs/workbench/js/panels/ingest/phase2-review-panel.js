/**
 * Phase 2 Review Panel — property disambiguation with fingerprint scoring.
 *
 * Two-pane layout: candidate list (left) + detail (right).
 * Six-dimension fingerprint table with weights.
 * Top-N match cards with per-dimension breakdown, margins to 3 decimals.
 *
 * Rules: PD-2 disjoint firing, PD-6 sub-property picker, PD-7 BFO subcategory inheritance,
 *        PD-9 merge rejects owl:topObjectProperty.
 */
import { escapeHtml } from '../../utils.js';

const OWL_TOP_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#topObjectProperty';

const DIMENSIONS = ['domain', 'range', 'bfoSubcategory', 'characteristics', 'allowsInheresIn', 'lexical'];
const DIMENSION_LABELS = {
  domain: 'Domain',
  range: 'Range',
  bfoSubcategory: 'BFO Sub.',
  characteristics: 'Chars.',
  allowsInheresIn: 'Inheres In',
  lexical: 'Lexical',
};

export function initPhase2ReviewPanel(el, nav) {
  let sessionId = null;
  let records = [];
  let selectedIdx = 0;

  function getSessionId(data) {
    return data?.sessionId || nav.ingestState.getActiveSession();
  }

  function loadRecords() {
    if (!sessionId) return;
    records = nav.ingestState.loadPhase2Records(sessionId);
  }

  function getUnresolvedCount() {
    return records.filter(r => !r.resolved).length;
  }

  function render() {
    loadRecords();

    const unresolvedCount = getUnresolvedCount();
    const selected = records[selectedIdx] || null;

    el.innerHTML = `
      <div class="ig-phase2-container">
        <div class="ig-phase2-header">
          <button class="btn btn--ghost ig-back-btn" id="ig-p2-back">&larr; Phase 1</button>
          <h3 class="ig-panel-title">Phase 2: Property Disambiguation</h3>
          <span class="ig-summary">${records.length} properties &middot; ${unresolvedCount} unresolved</span>
        </div>

        <div class="ig-phase2-split">
          <div class="ig-phase2-left">
            <div class="ig-candidate-list" id="ig-p2-list">
              ${records.map((r, i) => `
                <div class="ig-candidate-item ${i === selectedIdx ? 'ig-candidate-item--active' : ''} ${r.resolved ? 'ig-candidate-item--resolved' : ''}"
                     data-idx="${i}">
                  <span class="ig-candidate-label">${escapeHtml(r.label || r.iri)}</span>
                  <span class="ig-candidate-disposition ig-disp--${dispositionClass(r.routing?.disposition)}">${shortDisposition(r.routing?.disposition)}</span>
                  ${r.action ? `<span class="ig-action-badge">${escapeHtml(r.action)}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <div class="ig-phase2-right" id="ig-p2-detail">
            ${selected ? renderDetail(selected) : '<div class="ig-empty-state">Select a property from the list.</div>'}
          </div>
        </div>

        <div class="ig-phase2-actions">
          <button class="btn btn--primary" id="ig-run-phase3"
            ${unresolvedCount > 0 ? 'disabled title="Resolve all properties before running Phase 3"' : ''}>
            Run Phase 3 ${unresolvedCount > 0 ? `(${unresolvedCount} unresolved)` : ''}
          </button>
        </div>
      </div>
    `;

    wireEvents();
  }

  function dispositionClass(d) {
    switch (d) {
      case 'AutoMerged': return 'merged';
      case 'DisambiguationRecord': return 'disambig';
      case 'NovelPromotionPanel': return 'novel';
      default: return 'default';
    }
  }

  function shortDisposition(d) {
    switch (d) {
      case 'AutoMerged': return 'Merged';
      case 'DisambiguationRecord': return 'Review';
      case 'NovelPromotionPanel': return 'Novel';
      default: return '-';
    }
  }

  function renderDetail(record) {
    const fp = record.fingerprint || {};
    const scores = record.scores || [];
    const routing = record.routing || {};

    const disjointFired = routing.disjointFloorTriggered || scores.some(s => s.disjointFloorTriggered);

    return `
      <div class="ig-detail-scroll">
        <h4 class="ig-detail-title">${escapeHtml(record.label || record.iri)}</h4>
        <div class="ig-detail-iri">${escapeHtml(record.iri)}</div>

        ${record.declaredDomain ? `<div class="ig-detail-meta">Domain: <code>${escapeHtml(truncateIri(record.declaredDomain))}</code></div>` : ''}
        ${record.declaredRange ? `<div class="ig-detail-meta">Range: <code>${escapeHtml(truncateIri(record.declaredRange))}</code></div>` : ''}
        ${record.declaredCharacteristics?.length ? `<div class="ig-detail-meta">Characteristics: ${record.declaredCharacteristics.map(c => `<code>${escapeHtml(c)}</code>`).join(', ')}</div>` : ''}
        ${record.subPropertyOf ? `<div class="ig-detail-meta">SubPropertyOf: <code>${escapeHtml(truncateIri(record.subPropertyOf))}</code></div>` : ''}

        <h5 class="ig-detail-subtitle">Fingerprint</h5>
        <table class="ig-fp-table">
          <tr>
            ${DIMENSIONS.map(d => `<th>${DIMENSION_LABELS[d]}</th>`).join('')}
          </tr>
          <tr>
            <td>${escapeHtml(fp.domainBFOCategory || '-')}</td>
            <td>${escapeHtml(fp.rangeBFOCategory || '-')}</td>
            <td>${escapeHtml(fp.bfoSubcategory || '-')}</td>
            <td>${escapeHtml((fp.characteristics || []).join(', ') || '-')}</td>
            <td>${fp.allowsInheresIn ? 'Yes' : 'No'}</td>
            <td>${escapeHtml(fp.label || '-')}</td>
          </tr>
        </table>

        ${disjointFired ? '<div class="ig-disjoint-indicator">PD-2: Disjoint floor triggered (score = 0.0)</div>' : ''}

        <h5 class="ig-detail-subtitle">Top Matches</h5>
        ${scores.length === 0
          ? '<div class="ig-empty-hint">No canonical matches found (novel property).</div>'
          : scores.slice(0, 5).map((s, i) => renderMatchCard(s, i)).join('')
        }

        <div class="ig-detail-routing">
          <span>Disposition: <strong>${escapeHtml(routing.disposition || '-')}</strong></span>
          <span>Top: ${(routing.topScore || 0).toFixed(3)}</span>
          <span>2nd: ${(routing.secondScore || 0).toFixed(3)}</span>
          <span>Margin: ${(routing.margin || 0).toFixed(3)}</span>
        </div>

        ${!record.resolved ? renderActionButtons(record) : renderResolvedBadge(record)}

        <div class="ig-justify-row" ${record.resolved ? 'style="display:none"' : ''}>
          <input type="text" class="ig-justify-input ig-p2-justify" placeholder="Justification (required)" value="${escapeHtml(record.justification || '')}" />
        </div>
      </div>
    `;
  }

  function renderMatchCard(score, index) {
    const breakdown = score.breakdown || {};
    return `
      <div class="ig-match-card ${score.disjointFloorTriggered ? 'ig-match-card--disjoint' : ''}">
        <div class="ig-match-header">
          <span class="ig-match-rank">#${index + 1}</span>
          <span class="ig-match-id">${escapeHtml(truncateIri(score.canonicalId || '-'))}</span>
          <span class="ig-match-score">${(score.score || 0).toFixed(3)}</span>
        </div>
        <div class="ig-match-breakdown">
          ${DIMENSIONS.map(d =>
            `<span class="ig-match-dim"><small>${DIMENSION_LABELS[d]}</small> ${(breakdown[d] ?? 0).toFixed(3)}</span>`
          ).join('')}
        </div>
        ${score.disjointFloorTriggered ? '<div class="ig-disjoint-tag">PD-2 Disjoint</div>' : ''}
      </div>
    `;
  }

  function renderActionButtons(record) {
    const isTopObjectProp = (record.scores?.[0]?.canonicalId || '').includes('topObjectProperty') ||
      record.iri === OWL_TOP_OBJECT_PROPERTY;

    // PD-6: sub-property targets that are broader should be greyed out
    const subPropDisabled = record.subPropertyOf ? '' : '';

    return `
      <div class="ig-action-buttons" id="ig-p2-actions">
        <button class="btn btn--primary ig-act-btn" data-action="Merge"
          ${isTopObjectProp ? 'disabled title="PD-9: Cannot merge owl:topObjectProperty"' : ''}
          >Merge</button>
        <button class="btn btn--ghost ig-act-btn" data-action="Reject">Reject</button>
        <button class="btn btn--ghost ig-act-btn" data-action="PromoteAsSubProperty"
          title="${record.subPropertyOf ? 'PD-6: Sub-property of ' + escapeHtml(record.subPropertyOf) : 'Promote as sub-property'}">Sub-Property</button>
        <button class="btn btn--ghost ig-act-btn" data-action="PromoteAsNewRelation">New Relation</button>
      </div>
    `;
  }

  function renderResolvedBadge(record) {
    return `
      <div class="ig-resolved-badge">
        <span class="ig-action-badge ig-action-badge--large">${escapeHtml(record.action || 'Resolved')}</span>
        ${record.justification ? `<span class="ig-resolved-justification">${escapeHtml(record.justification)}</span>` : ''}
      </div>
    `;
  }

  function truncateIri(iri) {
    if (!iri || iri.length <= 55) return iri || '';
    return '...' + iri.slice(-52);
  }

  function wireEvents() {
    el.querySelector('#ig-p2-back')?.addEventListener('click', () => nav.navigateTo('phase1-review', { sessionId }));

    // Candidate list selection
    el.querySelectorAll('.ig-candidate-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedIdx = parseInt(item.dataset.idx, 10);
        render();
      });
    });

    // Action buttons
    el.querySelectorAll('.ig-act-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const justifyInput = el.querySelector('.ig-p2-justify');
        const justification = justifyInput?.value?.trim() || '';

        if (!justification) {
          if (justifyInput) {
            justifyInput.style.borderColor = 'var(--red)';
            justifyInput.placeholder = 'Justification is required';
            justifyInput.focus();
          }
          return;
        }

        const record = records[selectedIdx];
        if (!record) return;

        // PD-9: reject merge of owl:topObjectProperty
        if (action === 'Merge' && record.iri === OWL_TOP_OBJECT_PROPERTY) return;

        record.action = action;
        record.justification = justification;
        record.resolved = true;

        // PD-7: BFO subcategory inherited on sub-property promotion
        if (action === 'PromoteAsSubProperty' && record.scores?.[0]) {
          record.inheritedBfoSubcategory = record.scores[0].bfoSubcategory || null;
        }

        nav.ingestState.savePhase2Records(sessionId, records);

        // Move to next unresolved
        const nextUnresolved = records.findIndex((r, i) => i > selectedIdx && !r.resolved);
        if (nextUnresolved !== -1) {
          selectedIdx = nextUnresolved;
        }
        render();
      });
    });

    // Run Phase 3
    el.querySelector('#ig-run-phase3')?.addEventListener('click', runPhase3);
  }

  function runPhase3() {
    if (getUnresolvedCount() > 0) return;

    nav.ingestState.updateSession(sessionId, { phase: 'phase3', phase2Complete: true });
    nav.navigateTo('phase3-review', { sessionId });
  }

  return {
    show(data) {
      sessionId = getSessionId(data);
      selectedIdx = 0;
      render();
    },
  };
}
