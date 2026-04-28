/**
 * Phase 2 Review Panel — property disambiguation with fingerprint scoring.
 *
 * Two-pane layout: candidate list (left) + detail (right).
 * Six-dimension fingerprint table with weights.
 * Top-N match cards with per-dimension breakdown, margins to 3 decimals.
 *
 * Rules: PD-2 disjoint firing, PD-6 sub-property picker, PD-7 BFO subcategory inheritance,
 *        PD-9 merge rejects owl:topObjectProperty.
 *
 * X9 Step 5 (2026-04-25): production wiring of PD-6 picker greying (W-5.8),
 * PD-7 inherited subcategory read-only (W-5.9), DP-2 record indicator (X9
 * §3.2), W-5.15 pagination + W-5.2 grouping (PendingHumanResolution first).
 */
import { escapeHtml } from '../../utils.js';
import { detectSWCReasons } from './phase1-review-panel.js';

const OWL_TOP_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#topObjectProperty';
const PAGE_SIZE = 100;

// PD-6 broadness markers: canonical targets whose declared domain/range is
// at the top of the BFO hierarchy are structurally broader than any
// candidate sub-property's domain/range. Greyed in the picker per W-5.8.
const BROAD_BFO_CLASSES = new Set([
  'bfo:Entity',
  'bfo:Continuant',
  'bfo:Occurrent',
  'owl:Thing',
  OWL_TOP_OBJECT_PROPERTY,
]);

const DIMENSIONS = ['domain', 'range', 'bfoSubcategory', 'characteristics', 'allowsInheresIn', 'lexical'];
const DIMENSION_LABELS = {
  domain: 'Domain',
  range: 'Range',
  bfoSubcategory: 'BFO Sub.',
  characteristics: 'Chars.',
  allowsInheresIn: 'Inheres In',
  lexical: 'Lexical',
};

// Disposition group ordering per W-5.2: PendingHumanResolution surfaces first,
// then DisambiguationRecord, then RelationDeferred, then NovelPromotionPanel,
// then AutoMerged. RelationDeferred (X9 Step 7.5++ 2026-04-27): declared
// rdfs:subPropertyOf parent is in-session; cascade auto-promotes when parent
// resolves. Distinct from PendingHumanResolution — does NOT block Phase 3.
const DISPOSITION_ORDER = ['PendingHumanResolution', 'DisambiguationRecord', 'RelationDeferred', 'NovelPromotionPanel', 'AutoMerged'];

// X9 Step 7.5++++ (2026-04-28): BFO subcategory options for the
// PromoteAsNewRelation picker. Sourced from FANDAWS v3.4 §6.2 BFO root
// categories that are valid relation parents. "Skip" lets the analyst
// leave the canonical ungraded — Phase 3 will still emit the orphan
// warning in that case (per Step 7.5+++ relation-class orphan logic).
// X9 Step 7.5++++ (2026-04-28): unified picker-candidate lookup. The
// PromoteAsSubProperty Confirm handler reads pickerSelectedParent (a
// canonicalId from the radio); that canonicalId may match either an
// entry in record.scores (seed/graph candidates pre-computed at Phase
// 2 start) OR an in-session promoted sibling (records[i] whose
// canonicalRelationIRI was set by an earlier resolveAction). This
// helper searches both pools so the parent's bfoSubcategory propagates
// to the child via PD-7 inheritance regardless of the parent's source.
// Exported for unit testability.
export function findPickerCandidate(record, parentId, allRecords = []) {
  if (!parentId) return null;
  const fromScores = record.scores?.find(s => s.canonicalId === parentId);
  if (fromScores) return fromScores;
  const sibling = allRecords.find(r =>
    r.canonicalRelationIRI === parentId && r.action !== 'Reject' && r.iri !== record.iri
  );
  if (sibling) {
    return {
      canonicalId: sibling.canonicalRelationIRI,
      bfoSubcategory: sibling.bfoSubcategoryAtPromote || sibling.inheritedBfoSubcategory || null,
      source: 'in-session',
    };
  }
  return null;
}

export const BFO_SUBCATEGORY_OPTIONS = [
  { value: 'bfo:Quality', label: 'bfo:Quality (e.g., color, mass, inheres-in target)' },
  { value: 'bfo:Disposition', label: 'bfo:Disposition (e.g., obligation, capability)' },
  { value: 'bfo:Process', label: 'bfo:Process (e.g., temporal occurrence, activity)' },
  { value: 'bfo:Role', label: 'bfo:Role (e.g., realizable role, contextual function)' },
  { value: 'bfo:RealizableEntity', label: 'bfo:RealizableEntity (general realizable continuant)' },
  { value: 'bfo:GenericallyDependentContinuant', label: 'bfo:GenericallyDependentContinuant (information artifact)' },
  { value: 'bfo:SpecificallyDependentContinuant', label: 'bfo:SpecificallyDependentContinuant' },
  { value: null, label: 'Skip — leave ungraded (Phase 3 will warn)' },
];

/**
 * PD-6 broadness check (W-5.8 visible enforcement). Returns true when the
 * canonical scored target is structurally broader than the candidate's
 * domain/range — i.e., promoting candidate as sub-property of this target
 * would violate I-3 / Rule PD-6 (structural narrowing).
 *
 * Pragmatic heuristic for v0.2: top-of-BFO-hierarchy targets always
 * broader. Full BFO subsumption check deferred to v0.3+ when canonical
 * relation registry exposes a subsumption query.
 *
 * @param {object} candidateRecord - the property being promoted
 * @param {object} scoreEntry - top-N candidate canonical relation
 * @returns {boolean}
 */
export function isBroaderThanParent(candidateRecord, scoreEntry) {
  if (!scoreEntry) return false;
  const targetId = scoreEntry.canonicalId || '';
  if (BROAD_BFO_CLASSES.has(targetId) || targetId === OWL_TOP_OBJECT_PROPERTY) return true;
  // Fingerprint-based heuristic: if the canonical's declared domain is
  // a broad-BFO class while the candidate's domain is more specific.
  const canonicalDomain = scoreEntry.canonicalDomain || scoreEntry.declaredDomain;
  const candidateDomain = candidateRecord?.declaredDomain;
  if (canonicalDomain && BROAD_BFO_CLASSES.has(canonicalDomain) && candidateDomain && !BROAD_BFO_CLASSES.has(candidateDomain)) {
    return true;
  }
  return false;
}

/**
 * Group records by disposition with PendingHumanResolution first (W-5.2).
 * @param {object[]} records
 * @returns {Map<string, object[]>}
 */
export function groupByDisposition(records) {
  const groups = new Map();
  for (const order of DISPOSITION_ORDER) groups.set(order, []);
  groups.set('Other', []);
  for (const r of records) {
    const disp = r.routing?.disposition;
    // X9 Step 7.5++: RelationDeferred has its own group (NOT collapsed
    // into PendingHumanResolution); cascade-resolved children stay in
    // their original RelationDeferred group with `resolved: true`.
    // Other unresolved DisambiguationRecord / NovelPromotionPanel still
    // collapse to PendingHumanResolution per W-5.2.
    const key = !r.resolved && (disp === 'DisambiguationRecord' || disp === 'NovelPromotionPanel')
      ? 'PendingHumanResolution'
      : (DISPOSITION_ORDER.includes(disp) ? disp : 'Other');
    groups.get(key).push(r);
  }
  // Drop empty groups for cleaner UI
  for (const [k, v] of groups) if (v.length === 0) groups.delete(k);
  return groups;
}

export function initPhase2ReviewPanel(el, nav) {
  let sessionId = null;
  let records = [];
  let selectedIdx = 0;
  let currentPage = 0;
  // PD-6 picker state — when analyst clicks PromoteAsSubProperty, picker
  // appears showing top-N canonical candidates with broader-than-parent
  // options greyed out (W-5.8). Picker auto-applies PD-7 BFO subcategory
  // inheritance to the selected parent when analyst confirms.
  let pickerOpen = false;
  let pickerSelectedParent = null;
  // X9 Step 7.5++++ (2026-04-28): BFO subcategory picker state — when
  // analyst clicks PromoteAsNewRelation, picker appears in place of the
  // action buttons offering the 7 BFO root categories + Skip. Selection
  // populates promoteCanonicalRelation's bfoSubcategory parameter so the
  // canonical root has BFO grounding (Phase 3 OrphanClassViolation
  // suppressed via Step 7.5+++ relation-class orphan logic).
  let bfoPickerOpen = false;
  let pickerSelectedBfo = null;

  function getSessionId(data) {
    return data?.sessionId || nav.ingestState.getActiveSession();
  }

  function loadRecords() {
    if (!sessionId) return;
    records = nav.ingestState.loadPhase2Records(sessionId);
  }

  function getUnresolvedCount() {
    // X9 Step 7.5++ (2026-04-27): RelationDeferred is non-blocking.
    // It awaits reactive cascade from a resolved parent — analyst doesn't
    // act on these rows directly. Mirrors Phase 1+'s PlacementDeferred /
    // getPendingCount semantics; does NOT block "Run Phase 3".
    return records.filter(r =>
      !r.resolved && r.routing?.disposition !== 'RelationDeferred'
    ).length;
  }

  function getDeferredCount() {
    return records.filter(r =>
      r.routing?.disposition === 'RelationDeferred' && !r.resolved
    ).length;
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
          <span class="ig-summary">${records.length} properties &middot; ${unresolvedCount} unresolved${getDeferredCount() > 0 ? ` &middot; ${getDeferredCount()} deferred` : ''}</span>
        </div>

        <div class="ig-phase2-split">
          <div class="ig-phase2-left">
            ${renderGroupedList()}
            ${renderPagination()}
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

  // X9 §3.2 + W-5.2/W-5.15 — grouped, paginated candidate list with
  // PendingHumanResolution surfacing first per spec acceptance.
  function renderGroupedList() {
    const grouped = groupByDisposition(records);
    const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
    if (currentPage >= totalPages) currentPage = totalPages - 1;

    // Slice page across groups while preserving group ordering. Each group
    // shows all items belonging to it (grouping preserved across pages
    // per W-5.15 acceptance).
    const startIdx = currentPage * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;

    let globalIdx = -1;
    return `<div class="ig-candidate-list" id="ig-p2-list">${
      [...grouped.entries()].map(([groupKey, items]) => {
        const groupItemsHtml = items.map(r => {
          globalIdx++;
          const idx = records.indexOf(r);
          // Skip rendering items outside the current page slice
          if (globalIdx < startIdx || globalIdx >= endIdx) return '';
          const swcReasons = detectSWCReasons(r);
          const swcBadge = swcReasons.length > 0
            ? `<span class="badge badge--warning" title="${escapeHtml(swcReasons.join(', '))}">⚠</span>`
            : '';
          // X9 §3.2 DP-2 indicator — small icon when canonical record carries
          // a DP-2 record. Click opens the side-panel detail view with DP-2
          // fields inline. Lower priority than fingerprint per W-2.
          const dp2Indicator = r.dp2Record
            ? `<span class="ig-dp2-icon" title="DP-2 record available — see detail">⓲</span>`
            : '';
          return `
            <div class="ig-candidate-item ${idx === selectedIdx ? 'ig-candidate-item--active' : ''} ${r.resolved ? 'ig-candidate-item--resolved' : ''}"
                 data-idx="${idx}">
              <span class="ig-candidate-label">${escapeHtml(r.label || r.iri)}</span>
              ${swcBadge}
              ${dp2Indicator}
              <span class="ig-candidate-disposition ig-disp--${dispositionClass(r.routing?.disposition)}">${shortDisposition(r.routing?.disposition)}</span>
              ${r.action ? `<span class="ig-action-badge">${escapeHtml(r.action)}</span>` : ''}
            </div>
          `;
        }).filter(Boolean).join('');

        if (!groupItemsHtml) return '';
        return `
          <div class="ig-candidate-group" data-group="${escapeHtml(groupKey)}">
            <div class="ig-candidate-group-header">${escapeHtml(groupKey)} (${items.length})</div>
            ${groupItemsHtml}
          </div>
        `;
      }).join('')
    }</div>`;
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
    if (totalPages <= 1) return '';
    return `
      <div class="ig-pagination">
        <button class="btn btn--ghost ig-page-btn" id="ig-p2-prev" ${currentPage === 0 ? 'disabled' : ''}>Prev</button>
        <span>Page ${currentPage + 1} of ${totalPages}</span>
        <button class="btn btn--ghost ig-page-btn" id="ig-p2-next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
      </div>
    `;
  }

  function dispositionClass(d) {
    switch (d) {
      case 'AutoMerged': return 'merged';
      case 'DisambiguationRecord': return 'disambig';
      case 'NovelPromotionPanel': return 'novel';
      case 'RelationDeferred': return 'deferred';
      default: return 'default';
    }
  }

  function shortDisposition(d) {
    switch (d) {
      case 'AutoMerged': return 'Merged';
      case 'DisambiguationRecord': return 'Review';
      case 'NovelPromotionPanel': return 'Novel';
      case 'RelationDeferred': return 'Deferred';
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

        ${renderInheritedSubcategorySection(record)}

        ${!record.resolved
          ? (record.routing?.disposition === 'RelationDeferred'
              ? renderRelationDeferredBanner(record)
              : (bfoPickerOpen && record === records[selectedIdx]
                  ? renderBfoSubcategoryPicker(record)
                  : (pickerOpen && record === records[selectedIdx]
                      ? renderSubPropertyPicker(record)
                      : renderActionButtons(record))))
          : renderResolvedBadge(record)}

        <div class="ig-justify-row" ${record.resolved ? 'style="display:none"' : ''}>
          <input type="text" class="ig-justify-input ig-p2-justify" placeholder="Justification (required) *" required value="${escapeHtml(record.justification || '')}" />
        </div>

        ${renderDp2Section(record)}
      </div>
    `;
  }

  // X9 §3.2 + W-2 hierarchy: DP-2 record subsection. Lower priority than
  // fingerprint per memo §3.5; collapses by default. When present, shows
  // explanation/provenance/reproducibilityHash with click-to-copy.
  function renderDp2Section(record) {
    const dp2 = record.dp2Record;
    if (!dp2) return '';
    const explanationSummary = dp2.explanation
      ? (dp2.explanation.summary || dp2.explanation.disposition || JSON.stringify(dp2.explanation).slice(0, 200))
      : '-';
    const provenanceSummary = dp2.provenance
      ? (dp2.provenance.mechanism || '-') + (dp2.provenance.causedBy ? ` (caused by: ${escapeHtml(dp2.provenance.causedBy)})` : '')
      : '-';
    const repHash = dp2.reproducibilityHash || dp2.recordHash || '-';
    const truncated = repHash.length > 16 ? repHash.slice(0, 8) + '…' + repHash.slice(-8) : repHash;
    return `
      <details class="ig-dp2-record" style="margin-top: 12px; border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px;">
        <summary style="cursor: pointer; font-weight: 600; font-size: 0.9em;">DP-2 Record</summary>
        <div style="font-size: 0.85em; margin-top: 6px;">
          <div><strong>Explanation:</strong> ${escapeHtml(String(explanationSummary))}</div>
          <div><strong>Provenance:</strong> ${escapeHtml(provenanceSummary)}</div>
          <div><strong>Reproducibility Hash:</strong>
            <code class="ig-dp2-hash" data-hash="${escapeHtml(repHash)}" title="Click to copy" style="cursor: pointer;">${escapeHtml(truncated)}</code>
          </div>
        </div>
      </details>
    `;
  }

  // PD-7 (W-5.9): inherited BFO subcategory displayed as read-only field
  // when sub-property promotion has been resolved. Tooltip cites the rule.
  function renderInheritedSubcategorySection(record) {
    if (record.action !== 'PromoteAsSubProperty') return '';
    const inherited = record.inheritedBfoSubcategory || record.scores?.[0]?.bfoSubcategory || '-';
    return `
      <div class="ig-pd7-inheritance" style="background: var(--green-bg); padding: 6px 10px; border-radius: 4px; margin-top: 8px;">
        <strong>BFO Subcategory (inherited per PD-7):</strong>
        <input type="text" readonly value="${escapeHtml(inherited)}"
               title="PD-7 (Rule W-5.9): BFO subcategory auto-inherits from parent property; child field is read-only"
               style="background: transparent; border: none; font-family: monospace; margin-left: 6px;" />
      </div>
    `;
  }

  // PD-6 picker (W-5.8): when analyst chooses PromoteAsSubProperty, picker
  // shows top-N canonical candidates as parent options. Broader-than-parent
  // targets are GREYED OUT with tooltip explaining the structural-narrowing
  // rule. Critical Invariant W-3 affordance — analyst sees the invariant
  // holding, not just the system enforcing it silently.
  function renderSubPropertyPicker(record) {
    // X9 Step 7.5++++ (2026-04-28): two-source candidate list.
    // (1) In-session promoted siblings: properties the analyst already
    //     resolved via Merge / PromoteAsNewRelation / PromoteAsSubProperty
    //     within this Phase 2 session. canonicalId = the minted/merged
    //     IRI. canonicalDomain projected from declaredDomain so PD-6
    //     broadness greying still applies via isBroaderThanParent.
    // (2) Score-ranked seed/graph candidates: existing record.scores
    //     pre-computed at Phase 2 start.
    // In-session entries appear first with an "in-session" badge instead
    // of a score column. PD-6 broadness greying applies uniformly.
    const inSessionSiblings = (records || [])
      .filter(r => r.canonicalRelationIRI && r.action !== 'Reject' && r.iri !== record.iri)
      .map(r => ({
        canonicalId: r.canonicalRelationIRI,
        label: r.label,
        canonicalDomain: r.declaredDomain,
        bfoSubcategory: r.bfoSubcategoryAtPromote || r.inheritedBfoSubcategory || null,
        source: 'in-session',
      }));
    const scoredCandidates = (record.scores || [])
      .slice(0, 10)
      .map(s => ({ ...s, source: 'scored' }));

    const allCandidates = [...inSessionSiblings, ...scoredCandidates];

    return `
      <div class="ig-subprop-picker" id="ig-p2-picker" style="background: var(--surface-2); padding: 12px; border-radius: 6px; border: 1px solid var(--border);">
        <h6 style="margin: 0 0 8px 0;">Select parent property (PD-6 Sub-Property Promotion)</h6>
        <div class="ig-picker-help" style="font-size: 0.85em; margin-bottom: 8px; color: var(--muted);">
          Per Invariant I-3 / Rule PD-6: child sub-property's range cannot be broader than its parent's. Broader-than-parent options are greyed out.
          ${inSessionSiblings.length > 0 ? `<br/><strong>${inSessionSiblings.length} in-session sibling${inSessionSiblings.length === 1 ? '' : 's'}</strong> available as parent candidates.` : ''}
        </div>
        <div class="ig-picker-list">
          ${allCandidates.length === 0
            ? '<div style="padding: 8px; color: var(--muted); font-style: italic;">No candidate parents available. Promote as New Relation instead.</div>'
            : allCandidates.map((s, i) => {
                const broader = isBroaderThanParent(record, s);
                const disabledAttr = broader ? 'disabled' : '';
                const isInSession = s.source === 'in-session';
                const tooltipText = broader
                  ? 'Target broader than parent — not allowed (Invariant I-3, Rule PD-6)'
                  : (isInSession ? `In-session sibling: ${s.label || s.canonicalId}` : `Score ${(s.score || 0).toFixed(3)}`);
                const radioId = `ig-pd6-radio-${i}`;
                const trailingMeta = broader
                  ? '<span style="margin-left: 8px; color: var(--muted);">⚠ broader-than-parent (PD-6)</span>'
                  : (isInSession
                      ? `<span class="ig-picker-source ig-disp--deferred" style="margin-left: 8px; padding: 1px 6px; border-radius: 3px; font-size: 0.75em;">in-session</span>${s.bfoSubcategory ? `<span style="margin-left: 6px; color: var(--muted); font-size: 0.85em;">BFO: ${escapeHtml(s.bfoSubcategory)}</span>` : ''}`
                      : `<span style="margin-left: 8px;">score: ${(s.score || 0).toFixed(3)}</span>`);
                return `
                  <label class="ig-picker-option ${broader ? 'ig-picker-option--disabled' : ''} ${isInSession ? 'ig-picker-option--in-session' : ''}"
                         style="display: block; padding: 6px 8px; cursor: ${broader ? 'not-allowed' : 'pointer'}; ${broader ? 'opacity: 0.4;' : ''}"
                         title="${escapeHtml(tooltipText)}">
                    <input type="radio" name="ig-p2-pd6-parent" value="${escapeHtml(s.canonicalId || '')}" id="${radioId}" ${disabledAttr} />
                    <span style="margin-left: 6px;">
                      <code>${escapeHtml(truncateIri(s.canonicalId || ''))}</code>
                      ${isInSession && s.label ? `<span style="margin-left: 6px; color: var(--muted); font-size: 0.85em;">(${escapeHtml(s.label)})</span>` : ''}
                      ${trailingMeta}
                    </span>
                  </label>
                `;
              }).join('')
          }
        </div>
        <div class="ig-picker-actions" style="margin-top: 10px;">
          <button class="btn btn--primary" id="ig-pd6-confirm">Confirm Parent Selection</button>
          <button class="btn btn--ghost" id="ig-pd6-cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  // X9 Step 7.5++++ (2026-04-28): BFO subcategory picker for
  // PromoteAsNewRelation. Mirrors the PD-6 sub-property picker pattern:
  // appears inline in the detail pane in place of action buttons; radio
  // list of BFO root categories + Skip; Confirm fires resolveAction with
  // pickerSelectedBfo populated. Selection writes to canonical record's
  // fandaws:bfoSubcategory so Phase 3 OrphanClassViolation is suppressed.
  function renderBfoSubcategoryPicker(record) {
    return `
      <div class="ig-bfo-picker" id="ig-p2-bfo-picker" style="background: var(--surface-2); padding: 12px; border-radius: 6px; border: 1px solid var(--border);">
        <h6 style="margin: 0 0 8px 0;">Select BFO subcategory (Promote as New Relation)</h6>
        <div class="ig-bfo-picker-help" style="font-size: 0.85em; margin-bottom: 8px; color: var(--muted);">
          Per Step 7.5++++: a relation class needs a BFO category to be non-orphan in Phase 3.
          The category becomes the BFO subcategory inherited (PD-7) by any cascaded sub-properties.
        </div>
        <div class="ig-bfo-picker-list">
          ${BFO_SUBCATEGORY_OPTIONS.map((opt, i) => {
            const radioId = `ig-bfo-radio-${i}`;
            const valueAttr = opt.value === null ? '' : escapeHtml(opt.value);
            return `
              <label class="ig-bfo-picker-option" style="display: block; padding: 6px 8px; cursor: pointer;">
                <input type="radio" name="ig-p2-bfo-cat" value="${valueAttr}" id="${radioId}" data-skip="${opt.value === null ? 'true' : 'false'}" />
                <span style="margin-left: 6px;">${escapeHtml(opt.label)}</span>
              </label>
            `;
          }).join('')}
        </div>
        <div class="ig-bfo-picker-actions" style="margin-top: 10px;">
          <button class="btn btn--primary" id="ig-bfo-confirm">Confirm BFO Subcategory</button>
          <button class="btn btn--ghost" id="ig-bfo-cancel">Cancel</button>
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

  // X9 Step 7.5++ (2026-04-27): RelationDeferred banner shown in detail
  // pane in place of action buttons. Communicates that the row awaits
  // reactive cascade from the parent property's resolution; no analyst
  // action is appropriate here. Hides the justification input via CSS
  // because justification is not required for deferred rows.
  // X9 Step 7.5+++++ (2026-04-28): Override escape hatch — analyst can
  // detach a deferred row from its declared subPropertyOf parent when
  // (a) parent was Rejected, (b) parent's own cascade chain stalls, or
  // (c) analyst wants to root the property independently. Override
  // flips disposition RelationDeferred → NovelPromotionPanel so the
  // regular action buttons (Merge / Reject / Sub-Property / New Relation)
  // surface for manual resolution. Mirrors the Step 7.5++ Reject-cascade
  // revert path but driven by analyst action.
  function renderRelationDeferredBanner(record) {
    const parent = record.routing?.parentPropertyIRI || record.subPropertyOf || '';
    return `
      <div class="ig-deferred-banner" style="background: rgba(95, 190, 216, 0.12); color: #5fbed8; padding: 10px 14px; border-left: 3px solid #5fbed8; border-radius: 4px; margin-top: 8px;">
        <strong>⏳ Awaiting Parent Resolution</strong>
        <p style="margin: 4px 0 0 0; font-size: 0.9em;">
          This property declares <code>rdfs:subPropertyOf</code> →
          <code>${escapeHtml(truncateIri(parent))}</code> — also being ingested
          in this session. When the analyst resolves the parent (Merge / New Relation /
          Sub-Property), this row auto-promotes as <code>PromoteAsSubProperty</code>
          of the parent's canonical IRI.
        </p>
        <div style="margin-top: 8px;">
          <button class="btn btn--ghost ig-deferred-override" id="ig-deferred-override"
                  title="Detach this row from its declared subPropertyOf parent and resolve it manually (Step 7.5+++++)"
                  style="font-size: 0.85em;">
            Override → resolve manually
          </button>
          <span style="margin-left: 8px; font-size: 0.8em; color: var(--muted);">
            Use when the parent was Rejected or you want to root this property independently.
          </span>
        </div>
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

    // Pagination buttons (W-5.15)
    el.querySelector('#ig-p2-prev')?.addEventListener('click', () => { currentPage--; render(); });
    el.querySelector('#ig-p2-next')?.addEventListener('click', () => { currentPage++; render(); });

    // PD-6 sub-property picker controls (W-5.8)
    el.querySelector('#ig-pd6-confirm')?.addEventListener('click', () => {
      const record = records[selectedIdx];
      if (!record) return;
      const checkedRadio = el.querySelector('input[name="ig-p2-pd6-parent"]:checked');
      if (!checkedRadio) {
        const help = el.querySelector('.ig-picker-help');
        if (help) help.style.color = 'var(--red)';
        return;
      }
      pickerSelectedParent = checkedRadio.value;
      pickerOpen = false;
      // Trigger the resolve flow as PromoteAsSubProperty with the selected parent.
      resolveAction('PromoteAsSubProperty');
    });
    el.querySelector('#ig-pd6-cancel')?.addEventListener('click', () => {
      pickerOpen = false;
      pickerSelectedParent = null;
      render();
    });

    // X9 Step 7.5++++ (2026-04-28): BFO subcategory picker controls
    // (mirror of PD-6 picker handlers above).
    el.querySelector('#ig-bfo-confirm')?.addEventListener('click', () => {
      const record = records[selectedIdx];
      if (!record) return;
      const checkedRadio = el.querySelector('input[name="ig-p2-bfo-cat"]:checked');
      if (!checkedRadio) {
        const help = el.querySelector('.ig-bfo-picker-help');
        if (help) help.style.color = 'var(--red)';
        return;
      }
      // "Skip" entry has empty value + data-skip='true' — leaves bfoSubcategory null.
      pickerSelectedBfo = checkedRadio.dataset.skip === 'true' ? null : checkedRadio.value;
      bfoPickerOpen = false;
      // Trigger the resolve flow as PromoteAsNewRelation with the selected category.
      resolveAction('PromoteAsNewRelation');
    });
    el.querySelector('#ig-bfo-cancel')?.addEventListener('click', () => {
      bfoPickerOpen = false;
      pickerSelectedBfo = null;
      render();
    });

    // X9 Step 7.5+++++ (2026-04-28): Override button on RelationDeferred
    // banner. Flips the row's disposition from RelationDeferred to
    // NovelPromotionPanel so the standard action buttons render. The
    // analyst can then Merge / Reject / Sub-Property / New Relation
    // manually. Original subPropertyOf is preserved on the record for
    // reference; cascadeRevertedFrom annotation marks the override path
    // (parallel to the Step 7.5++ Reject-cascade revert annotation).
    el.querySelector('#ig-deferred-override')?.addEventListener('click', () => {
      const record = records[selectedIdx];
      if (!record) return;
      record.routing = {
        ...record.routing,
        disposition: 'NovelPromotionPanel',
        cascadeRevertedFrom: 'RelationDeferred',
        overrideTrigger: 'AnalystManualOverride',
      };
      // Clear parentPropertyInOntology so subsequent cascade evaluations
      // don't re-defer the row; analyst has explicitly opted out of the
      // declared subPropertyOf chain for this row.
      record.parentPropertyInOntology = false;
      nav.ingestState.savePhase2Records(sessionId, records);
      render();
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

    // Action buttons
    el.querySelectorAll('.ig-act-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        // PD-6 (W-5.8): PromoteAsSubProperty opens picker FIRST so the
        // analyst sees broader-than-parent options greyed out before
        // committing. Picker confirm calls resolveAction internally.
        if (action === 'PromoteAsSubProperty' && !pickerOpen) {
          pickerOpen = true;
          pickerSelectedParent = null;
          render();
          return;
        }
        // X9 Step 7.5++++ (2026-04-28): PromoteAsNewRelation opens the
        // BFO subcategory picker FIRST so the analyst can root the
        // canonical relation in BFO (or explicitly Skip). Picker confirm
        // calls resolveAction internally.
        if (action === 'PromoteAsNewRelation' && !bfoPickerOpen) {
          bfoPickerOpen = true;
          pickerSelectedBfo = null;
          render();
          return;
        }
        resolveAction(action);
      });
    });

    function resolveAction(action) {
      const justifyInput = el.querySelector('.ig-p2-justify');
      const justification = justifyInput?.value?.trim() || '';

      if (!justification) {
        if (justifyInput) {
          justifyInput.style.borderColor = 'var(--red)';
          justifyInput.placeholder = 'Justification is required (W-5.10)';
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

      // PD-7 (W-5.9): BFO subcategory auto-inherits on sub-property promotion.
      // When PD-6 picker selected an explicit parent, use that; otherwise
      // fall back to top-scored canonical (legacy single-click flow).
      // X9 Step 7.5++++ (2026-04-28): findPickerCandidate searches BOTH
      // record.scores (seed/graph candidates) and in-session promoted
      // siblings — so analyst can sub-property under a property they
      // resolved earlier in this same Phase 2 session.
      let selectedParentIRI = null;
      if (action === 'PromoteAsSubProperty') {
        const parent = pickerSelectedParent
          ? findPickerCandidate(record, pickerSelectedParent, records)
          : record.scores?.[0];
        if (parent) {
          record.inheritedBfoSubcategory = parent.bfoSubcategory || null;
          record.selectedParentIRI = parent.canonicalId;
          selectedParentIRI = parent.canonicalId;
        }
      }

      // ── Gap A/B fix: write to canonical graph, trigger compile() ──
      const adapter = nav.wbState.getAdapter();
      const graphId = nav.wbState.getGraphId();
      const adapterSessionId = nav.ingestState.loadConfig(sessionId)?.adapterSessionId;

      // X9 Step 7.5++ (2026-04-27): track the parent's canonical IRI for
      // cascade-after-resolve. Set inside each action branch below; null
      // when action === 'Reject' (cascade reverts deferred children to Novel).
      let resolvedParentCanonicalIRI = null;

      try {
        if (action === 'Merge') {
          // Gap A: MergeRecord + owl:equivalentProperty
          const targetIRI = record.scores?.[0]?.canonicalId;
          if (targetIRI) {
            const result = adapter.mergeCanonicalRelation(graphId, {
              candidateIRI: record.iri,
              candidateLabel: record.label,
              targetCanonicalIRI: targetIRI,
              mergeConfidence: record.scores[0].score,
              justification,
              ingestedInSession: adapterSessionId,
              mergeTrigger: 'HumanConfirmed',
            });
            record.executionPropertyIRI = result.executionPropertyIRI;
            record.mergeRecordId = result.mergeRecordId;
            // Cascade target: the merge target's canonical IRI becomes
            // the parent for any deferred children of THIS source IRI.
            resolvedParentCanonicalIRI = targetIRI;
          }
        } else if (action === 'PromoteAsNewRelation') {
          // Gap B: mint fresh fandaws:class/relation/UUID concept.
          // X9 Step 7.5++++ (2026-04-28): bfoSubcategory comes from the
          // BFO picker selection (pickerSelectedBfo). null means analyst
          // chose "Skip" — canonical is born ungraded; Phase 3 will warn.
          // The chosen subcategory is stored on the Phase 2 record as
          // bfoSubcategoryAtPromote so subsequent in-session sub-property
          // pickers can show the BFO grounding alongside the canonical IRI.
          const result = adapter.promoteCanonicalRelation(graphId, {
            candidateIRI: record.iri,
            candidateLabel: record.label,
            declaredDomain: record.declaredDomain,
            declaredRange: record.declaredRange,
            characteristics: record.declaredCharacteristics || [],
            bfoSubcategory: pickerSelectedBfo || null,
            justification,
            ingestedInSession: adapterSessionId,
          });
          record.canonicalRelationIRI = result.canonicalRelationIRI;
          record.executionPropertyIRI = result.executionPropertyIRI;
          record.bfoSubcategoryAtPromote = pickerSelectedBfo || null;
          resolvedParentCanonicalIRI = result.canonicalRelationIRI;
        } else if (action === 'PromoteAsSubProperty') {
          // Gap B: mint sub-property; parent is the PD-6-picker-selected
          // canonical (or top-scored canonical for legacy single-click flow).
          const parentIRI = selectedParentIRI || record.scores?.[0]?.canonicalId;
          const result = adapter.promoteCanonicalRelation(graphId, {
            candidateIRI: record.iri,
            candidateLabel: record.label,
            declaredDomain: record.declaredDomain,
            declaredRange: record.declaredRange,
            characteristics: record.declaredCharacteristics || [],
            bfoSubcategory: record.inheritedBfoSubcategory || null,
            justification,
            ingestedInSession: adapterSessionId,
            subPropertyOf: parentIRI,
          });
          record.canonicalRelationIRI = result.canonicalRelationIRI;
          record.executionPropertyIRI = result.executionPropertyIRI;
          resolvedParentCanonicalIRI = result.canonicalRelationIRI;
        }
        // Reject: no canonical mutation needed — resolution is recorded only
      } catch (err) {
        console.warn('[phase2-review] canonical write failed:', err);
      }

      // X9 Step 7.5++ (2026-04-27): single-engine reactive cascade. After
      // the parent property resolves, propagate to any RelationDeferred
      // children whose subPropertyOf points to this source IRI. The
      // cascade reuses promoteCanonicalRelation (same canonical-write
      // engine the manual Sub-Property action uses above) — single code
      // path per X3 §3.4 / X4 §3.3 architectural lock.
      if (adapter.cascadeSubPropertyResolution && adapterSessionId) {
        try {
          const cascadeResult = adapter.cascadeSubPropertyResolution(
            graphId,
            adapterSessionId,
            record.iri,                        // resolvedParentSourceIRI
            resolvedParentCanonicalIRI,        // null when Reject
            action,
          );
          // Update Phase 2 localStorage records with cascade outcomes.
          for (const cascaded of cascadeResult.cascaded) {
            const child = records.find(r => r.iri === cascaded.candidateIRI);
            if (child) {
              child.action = 'PromoteAsSubProperty';
              child.resolved = true;
              child.justification = `Cascade from parent ${record.iri} (${action}).`;
              child.canonicalRelationIRI = cascaded.canonicalRelationIRI;
              child.executionPropertyIRI = cascaded.executionPropertyIRI;
              child.selectedParentIRI = resolvedParentCanonicalIRI;
              child.inheritedBfoSubcategory = cascaded.inheritedBfoSubcategory || null;
            }
          }
          // Reject path: revert deferred children to NovelPromotionPanel
          // so the analyst handles them manually (parent has vanished).
          for (const revertedIRI of cascadeResult.revertedToNovel) {
            const child = records.find(r => r.iri === revertedIRI);
            if (child) {
              child.routing = {
                ...child.routing,
                disposition: 'NovelPromotionPanel',
                cascadeRevertedFrom: 'RelationDeferred',
              };
              child.parentPropertyInOntology = false;
            }
          }
          if (cascadeResult.conflicts && cascadeResult.conflicts.length > 0 && typeof nav.showError === 'function') {
            const summary = cascadeResult.conflicts.map(c => `${c.iri} (${c.reason})`).join('; ');
            nav.showError(`Sub-property cascade surfaced ${cascadeResult.conflicts.length} issue(s): ${summary}`, 'warning');
          }
        } catch (cascadeErr) {
          console.error('cascadeSubPropertyResolution failed:', cascadeErr);
          if (typeof nav.showError === 'function') {
            nav.showError(`Sub-property cascade failed: ${cascadeErr.message}`, 'error');
          }
        }
      }

      nav.ingestState.savePhase2Records(sessionId, records);

      // Reset PD-6 picker state + X9 Step 7.5++++ BFO picker state
      pickerOpen = false;
      pickerSelectedParent = null;
      bfoPickerOpen = false;
      pickerSelectedBfo = null;

      // Move to next unresolved
      const nextUnresolved = records.findIndex((r, i) => i > selectedIdx && !r.resolved);
      if (nextUnresolved !== -1) {
        selectedIdx = nextUnresolved;
      }
      render();
    }

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
