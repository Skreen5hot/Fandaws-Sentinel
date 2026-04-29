/**
 * Graph Tree Panel — Left panel showing concept hierarchy.
 *
 * Subscribes to: graph-changed, concept-selected, concept-deselected
 * Emits: concept-selected (via state.selectConcept)
 *
 * X9 Step 7.12 (2026-04-29): tabbed view splits the tree into Concepts
 * (concept-class hierarchy) and Relations (FANDAWS relation-class
 * records, currently typed `fandaws:RelationTypeClass`). Tab labels
 * intentionally use "Relations" rather than "Object Properties" — the
 * Reified Constitutive Relations Specification (in flight) will revise
 * what these records carry; "Relations" is short, accurate at the
 * FANDAWS storage level, and avoids over-committing to OWL-source
 * terminology that may shift when the spec locks. Step 7.12 scope is
 * intentionally minimal: render existing fields only, no schema
 * additions, no anticipatory rendering for the spec-driven richer
 * detail-pane work that lands in its own cycle.
 */
import { escapeHtml, bfoDotClass } from '../utils.js';

/**
 * Detect whether a concept is a FANDAWS relation-class record.
 * Used by the Step 7.12 tab filter.
 * @param {object} concept
 * @returns {boolean}
 */
export function isRelationClass(concept) {
  const t = concept?.['@type'];
  if (!t) return false;
  if (Array.isArray(t)) return t.includes('fandaws:RelationTypeClass');
  return t === 'fandaws:RelationTypeClass';
}

/**
 * Filter a concepts list by tab. Concepts tab = non-relation, non-imported.
 * Relations tab = relation-class records only. Exported for unit testability.
 * @param {object[]} concepts
 * @param {'concepts'|'relations'} tab
 * @returns {object[]}
 */
export function filterConceptsByTab(concepts, tab) {
  if (tab === 'relations') {
    return concepts.filter(c => isRelationClass(c));
  }
  // Default 'concepts' tab: exclude relation-classes; include both
  // user-promoted concepts and BFO infrastructure (fandaws:isImported).
  return concepts.filter(c => !isRelationClass(c));
}

/**
 * Detect BFO category from concept's rdfs:subClassOf entries.
 * @param {object} concept
 * @returns {string} CSS class suffix
 */
function detectBfo(concept) {
  const subs = concept['rdfs:subClassOf'] || [];
  for (const entry of subs) {
    if (typeof entry === 'string' && entry.startsWith('bfo:')) {
      return bfoDotClass(entry);
    }
  }
  return 'default';
}

/**
 * Initialize the Graph Tree panel.
 * @param {HTMLElement} container - #panel-tree
 * @param {import('../workbench-state.js').WorkbenchStateManager} state
 */
export function initGraphTree(container, state) {
  const treeContainer = container.querySelector('#tree-container');
  const filterInput = container.querySelector('#tree-filter');
  let expandedNodes = new Set();
  // X9 Step 7.12: active tab state (Concepts default; Relations option).
  let activeTreeTab = 'concepts';

  function renderTabs(allConcepts) {
    const conceptsCount = filterConceptsByTab(allConcepts, 'concepts').length;
    const relationsCount = filterConceptsByTab(allConcepts, 'relations').length;
    return `
      <div class="wb-tree-tabs" role="tablist" style="display: flex; gap: 4px; padding: 4px 8px 8px 8px; border-bottom: 1px solid var(--border);">
        <button class="wb-tree-tab ${activeTreeTab === 'concepts' ? 'wb-tree-tab--active' : ''}"
                data-tab="concepts" role="tab"
                style="flex: 1; padding: 4px 8px; font-size: 0.85em; cursor: pointer; background: ${activeTreeTab === 'concepts' ? 'var(--accent-bg, rgba(108, 138, 255, 0.12))' : 'transparent'}; border: 1px solid var(--border); border-radius: 3px; color: ${activeTreeTab === 'concepts' ? 'var(--accent)' : 'inherit'};">
          Concepts (${conceptsCount})
        </button>
        <button class="wb-tree-tab ${activeTreeTab === 'relations' ? 'wb-tree-tab--active' : ''}"
                data-tab="relations" role="tab"
                style="flex: 1; padding: 4px 8px; font-size: 0.85em; cursor: pointer; background: ${activeTreeTab === 'relations' ? 'var(--accent-bg, rgba(108, 138, 255, 0.12))' : 'transparent'}; border: 1px solid var(--border); border-radius: 3px; color: ${activeTreeTab === 'relations' ? 'var(--accent)' : 'inherit'};">
          Relations (${relationsCount})
        </button>
      </div>
    `;
  }

  function render() {
    const graph = state.getGraph();
    const allConcepts = graph?.['fandaws:concepts'] || [];

    if (allConcepts.length === 0) {
      treeContainer.innerHTML = '<div class="wb-tree-empty">No concepts yet. Start conversing to build your graph.</div>';
      return;
    }

    // X9 Step 7.12 (2026-04-29): tab-scoped concept set. Default tab is
    // Concepts (non-relation-class). Relations tab shows only the
    // fandaws:RelationTypeClass entries.
    const concepts = filterConceptsByTab(allConcepts, activeTreeTab);

    const filterText = (filterInput?.value || '').toLowerCase().trim();

    // Build parent→children map
    const byParent = new Map();
    const conceptMap = new Map();
    for (const c of concepts) {
      conceptMap.set(c['@id'], c);
      const parent = c['skos:broader'] || '__root__';
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(c);
    }

    // Find roots: no broader, or broader not in this graph
    const roots = concepts.filter((c) =>
      !c['skos:broader'] || !conceptMap.has(c['skos:broader'])
    );

    // If filtering, find matching concepts and all their ancestors
    let visibleIris = null;
    if (filterText) {
      visibleIris = new Set();
      for (const c of concepts) {
        const label = (c['skos:prefLabel'] || c['rdfs:label'] || '').toLowerCase();
        if (label.includes(filterText)) {
          // Add this concept and all ancestors
          let iri = c['@id'];
          while (iri) {
            visibleIris.add(iri);
            const node = conceptMap.get(iri);
            iri = node?.['skos:broader'] || null;
          }
        }
      }
    }

    const selected = state.getSelectedConceptIri();
    const html = [];

    function renderNode(concept, depth) {
      const iri = concept['@id'];
      if (visibleIris && !visibleIris.has(iri)) return;

      const children = byParent.get(iri) || [];
      const hasChildren = children.length > 0;
      const expanded = expandedNodes.has(iri);
      const isSelected = iri === selected;
      const bfoClass = detectBfo(concept);
      const label = concept['rdfs:label'] || concept['skos:prefLabel'] || iri.split('/').pop();

      const indent = depth * 16;
      const toggleClass = hasChildren
        ? (expanded ? 'wb-tree-toggle--expanded' : '')
        : 'wb-tree-toggle--leaf';

      html.push(`<div class="wb-tree-node${isSelected ? ' wb-tree-node--selected' : ''}" data-iri="${escapeHtml(iri)}" style="padding-left: ${12 + indent}px;">`);
      html.push(`<span class="wb-tree-toggle ${toggleClass}" data-toggle="${escapeHtml(iri)}">&#9654;</span>`);
      html.push(`<span class="wb-tree-bfo-dot wb-bfo-${bfoClass}"></span>`);
      html.push(`<span class="wb-tree-label">${escapeHtml(label)}</span>`);
      html.push('</div>');

      if (hasChildren && (expanded || filterText)) {
        for (const child of children) {
          renderNode(child, depth + 1);
        }
      }
    }

    for (const root of roots) {
      renderNode(root, 0);
    }

    // X9 Step 7.12: tab strip rendered above the tree body. Active-tab
    // visual highlight via wb-tree-tab--active. If the active tab has
    // zero entries (e.g., empty Relations tab), show a quiet empty hint
    // beneath the tabs so the panel doesn't look broken.
    const treeBody = html.length > 0
      ? html.join('')
      : `<div class="wb-tree-empty" style="padding: 12px; font-size: 0.85em; color: var(--muted);">No ${activeTreeTab === 'relations' ? 'relations' : 'concepts'} yet in this graph.</div>`;
    treeContainer.innerHTML = renderTabs(allConcepts) + treeBody;
  }

  // Click handlers (delegated)
  treeContainer.addEventListener('click', (e) => {
    // X9 Step 7.12: tab click — switch active tab and re-render. Resets
    // expandedNodes scope is fine; re-using the same set across tabs is
    // acceptable since IRIs are unique.
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      const next = tab.dataset.tab;
      if (next === 'concepts' || next === 'relations') {
        if (activeTreeTab !== next) {
          activeTreeTab = next;
          render();
        }
      }
      return;
    }

    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const iri = toggle.dataset.toggle;
      if (expandedNodes.has(iri)) expandedNodes.delete(iri);
      else expandedNodes.add(iri);
      render();
      return;
    }

    const node = e.target.closest('.wb-tree-node');
    if (node) {
      const iri = node.dataset.iri;
      if (iri === state.getSelectedConceptIri()) {
        state.deselectConcept();
      } else {
        state.selectConcept(iri);
      }
    }
  });

  // Filter input
  if (filterInput) {
    filterInput.addEventListener('input', () => render());
  }

  // Subscribe to events
  state.bus.on('graph-changed', () => render());
  state.bus.on('concept-selected', () => render());
  state.bus.on('concept-deselected', () => render());

  // Initial render
  render();
}
