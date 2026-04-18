/**
 * Sessions Panel — ingestion session list with cards, badges, and routing.
 */
import { escapeHtml } from '../../utils.js';

const PHASE_LABELS = {
  upload: 'Upload',
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  phase3: 'Phase 3',
  complete: 'Complete',
};

const PHASE_CLASSES = {
  upload: 'upload',
  phase1: 'phase1',
  phase2: 'phase2',
  phase3: 'phase3',
  complete: 'complete',
};

/**
 * Map session phase to the sub-panel it should route to.
 */
function phaseToPanel(phase) {
  switch (phase) {
    case 'upload': return 'upload';
    case 'phase1': return 'phase1-review';
    case 'phase2': return 'phase2-review';
    case 'phase3': return 'phase3-review';
    case 'complete': return 'session-summary';
    default: return 'upload';
  }
}

/**
 * Initialize sessions panel.
 * @param {HTMLElement} el
 * @param {object} nav - { navigateTo, ingestState, wbState }
 * @returns {{ show: Function }}
 */
export function initSessionsPanel(el, nav) {
  function render() {
    const sessions = nav.ingestState.loadSessions();

    if (sessions.length === 0) {
      el.innerHTML = `
        <div class="ig-sessions-header">
          <h3 class="ig-panel-title">Ingestion Sessions</h3>
          <button class="btn btn--primary ig-new-session-btn" id="ig-new-session">New Ingestion Session</button>
        </div>
        <div class="ig-empty-state">
          <div class="ig-empty-icon">&#128230;</div>
          <p>No ingestion sessions yet.</p>
          <p class="ig-empty-hint">Upload an OWL or Turtle ontology file to begin.</p>
        </div>
      `;
    } else {
      const cardsHtml = sessions.map(s => {
        const phaseBadge = `<span class="ig-phase-badge ig-phase-badge--${PHASE_CLASSES[s.phase] || 'upload'}">${escapeHtml(PHASE_LABELS[s.phase] || s.phase)}</span>`;
        const blockingPills = (s.blocking || []).map(b =>
          `<span class="ig-blocking-pill">${escapeHtml(b)}</span>`
        ).join('');
        const date = new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        return `
          <div class="ig-session-card" data-session-id="${escapeHtml(s.id)}">
            <div class="ig-session-card-header">
              <span class="ig-session-filename">${escapeHtml(s.sourceFilename)}</span>
              ${phaseBadge}
            </div>
            <div class="ig-session-card-meta">
              <span>${date}</span>
              <span>${s.classCount} classes</span>
              <span>${s.propertyCount} properties</span>
            </div>
            ${blockingPills ? `<div class="ig-session-card-blocking">${blockingPills}</div>` : ''}
            <div class="ig-session-card-actions">
              <button class="btn btn--ghost ig-session-open" data-session-id="${escapeHtml(s.id)}">Open</button>
              <button class="btn btn--ghost ig-session-delete" data-session-id="${escapeHtml(s.id)}" title="Delete session">&#10005;</button>
            </div>
          </div>
        `;
      }).join('');

      el.innerHTML = `
        <div class="ig-sessions-header">
          <h3 class="ig-panel-title">Ingestion Sessions</h3>
          <button class="btn btn--primary ig-new-session-btn" id="ig-new-session">New Ingestion Session</button>
        </div>
        <div class="ig-session-list">${cardsHtml}</div>
      `;
    }

    // Wire events
    el.querySelector('#ig-new-session')?.addEventListener('click', () => {
      nav.navigateTo('upload');
    });

    el.querySelectorAll('.ig-session-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.sessionId;
        const session = nav.ingestState.getSession(id);
        if (!session) return;
        nav.ingestState.setActiveSession(id);
        nav.navigateTo(phaseToPanel(session.phase), { sessionId: id });
      });
    });

    el.querySelectorAll('.ig-session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.sessionId;
        if (confirm('Delete this ingestion session? This cannot be undone.')) {
          nav.ingestState.deleteSession(id);
          render();
        }
      });
    });

    // Card click routes to session
    el.querySelectorAll('.ig-session-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.sessionId;
        const session = nav.ingestState.getSession(id);
        if (!session) return;
        nav.ingestState.setActiveSession(id);
        nav.navigateTo(phaseToPanel(session.phase), { sessionId: id });
      });
    });
  }

  return {
    show() { render(); },
  };
}
