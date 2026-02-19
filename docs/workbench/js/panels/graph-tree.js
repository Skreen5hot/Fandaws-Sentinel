/**
 * Graph Tree Panel — Left panel showing concept hierarchy.
 *
 * Subscribes to: graph-changed, concept-selected, concept-deselected
 * Emits: concept-selected (via state.selectConcept)
 */
import { escapeHtml, bfoDotClass } from '../utils.js';

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

  function render() {
    const graph = state.getGraph();
    const concepts = graph?.['fandaws:concepts'] || [];

    if (concepts.length === 0) {
      treeContainer.innerHTML = '<div class="wb-tree-empty">No concepts yet. Start conversing to build your graph.</div>';
      return;
    }

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

    treeContainer.innerHTML = html.join('');
  }

  // Click handlers (delegated)
  treeContainer.addEventListener('click', (e) => {
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
