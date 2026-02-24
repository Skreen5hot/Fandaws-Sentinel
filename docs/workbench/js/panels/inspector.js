/**
 * Inspector Panel — Right panel showing concept detail or graph dashboard.
 *
 * Subscribes to: concept-selected, concept-deselected, graph-changed
 */
import { escapeHtml, bfoLabel, bfoDotClass, ersRegisterInfo } from '../utils.js';

/**
 * Initialize the Inspector panel.
 * @param {HTMLElement} container - #panel-inspector
 * @param {import('../workbench-state.js').WorkbenchStateManager} state
 */
export function initInspector(container, state) {
  // Add panel header + scrollable inspector body
  container.innerHTML = `
    <div class="wb-panel-header"><h2 class="wb-panel-title">Inspector</h2></div>
    <div class="wb-inspector" id="wb-inspector"></div>
  `;

  const inspectorBody = container.querySelector('#wb-inspector');

  function renderConceptView(iri) {
    const concept = state.getConceptByIri(iri);
    if (!concept) {
      renderDashboard();
      return;
    }

    const graph = state.getGraph();
    const indices = state.getIndices();
    const subs = concept['rdfs:subClassOf'] || [];

    // Identity
    const label = concept['rdfs:label'] || '';
    const prefLabel = concept['skos:prefLabel'] || '';
    const bfoEntries = subs.filter((e) => typeof e === 'string' && e.startsWith('bfo:'));
    const bfoLabelText = bfoEntries.length > 0 ? bfoLabel(bfoEntries[0]) : null;
    const bfoDot = bfoEntries.length > 0 ? bfoDotClass(bfoEntries[0]) : 'default';

    // Description
    let description = '';
    try {
      description = state.Fandaws.describeConcept(concept, graph) || '';
    } catch { /* description engine may fail gracefully */ }

    // Taxonomy breadcrumb
    const breadcrumb = [];
    let walkIri = iri;
    while (walkIri) {
      const c = state.getConceptByIri(walkIri);
      if (c) breadcrumb.unshift({ iri: walkIri, label: c['rdfs:label'] || walkIri.split('/').pop() });
      walkIri = indices?.iriToParent?.get(walkIri) || null;
    }

    // Properties
    const properties = subs.filter((r) =>
      typeof r === 'object' && r['fandaws:restrictionKind'] === 'property'
    );

    // Relationships (outgoing)
    const relationships = subs.filter((r) =>
      typeof r === 'object' && r['fandaws:restrictionKind'] === 'relationship'
    );

    // Incoming relationships
    const incomingIris = indices?.iriToReverseRelationships?.get(iri);
    const incomingRels = [];
    if (incomingIris) {
      for (const sourceIri of incomingIris) {
        const sourceConcept = state.getConceptByIri(sourceIri);
        if (!sourceConcept) continue;
        const sourceSubs = sourceConcept['rdfs:subClassOf'] || [];
        for (const r of sourceSubs) {
          if (typeof r === 'object' && r['fandaws:restrictionKind'] === 'relationship' && r['owl:someValuesFrom'] === iri) {
            incomingRels.push({ source: sourceConcept, restriction: r });
          }
        }
      }
    }

    // Register helper
    function registerBadge(restriction) {
      const info = ersRegisterInfo(restriction);
      if (!info) return '';
      return ` <span class="wb-register-sm wb-register-sm--${info.cls}">${info.label}</span>`;
    }

    let html = '';

    // Identity section
    html += `<div class="wb-inspector-section">`;
    html += `<div class="wb-inspector-section-title">Identity</div>`;
    html += `<div class="wb-inspector-label">${escapeHtml(label)}`;
    if (bfoLabelText) html += ` <span class="wb-tree-bfo-dot wb-bfo-${bfoDot}" style="display: inline-block; vertical-align: middle;"></span> <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(bfoLabelText)}</span>`;
    html += `</div>`;
    html += `<div class="wb-inspector-iri">${escapeHtml(iri)}</div>`;
    if (prefLabel && prefLabel !== label.toLowerCase()) {
      html += `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">prefLabel: ${escapeHtml(prefLabel)}</div>`;
    }
    // Homonym advisory (if concept has skos:hiddenLabel)
    const hiddenLabel = concept['skos:hiddenLabel'];
    if (hiddenLabel) {
      const siblings = state.findConceptsByHiddenLabel(hiddenLabel)
        .filter((c) => c['@id'] !== iri);
      if (siblings.length > 0) {
        html += `<div style="font-size: 0.78rem; color: var(--accent-primary); margin-top: 4px;">`;
        html += `Homonym of: `;
        html += siblings.map((s) =>
          `<a href="#" data-concept-iri="${escapeHtml(s['@id'])}" style="color: var(--accent-primary); text-decoration: underline;">${escapeHtml(s['rdfs:label'] || s['skos:prefLabel'])}</a>`,
        ).join(', ');
        html += `</div>`;
      }
      html += `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">hiddenLabel: ${escapeHtml(hiddenLabel)}</div>`;
    }
    html += `</div>`;

    // Description section
    if (description) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">Description <span class="wb-inspector-auto-tag">auto-generated</span></div>`;
      html += `<div class="wb-inspector-description">${escapeHtml(description)}</div>`;
      html += `</div>`;
    }

    // Taxonomy breadcrumb
    if (breadcrumb.length > 1) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">Taxonomy</div>`;
      html += `<div class="wb-inspector-breadcrumb">`;
      for (let i = 0; i < breadcrumb.length; i++) {
        if (i > 0) html += `<span class="wb-inspector-breadcrumb-sep">&rsaquo;</span>`;
        const cls = breadcrumb[i].iri === iri ? '' : ' data-concept-iri="' + escapeHtml(breadcrumb[i].iri) + '"';
        const style = breadcrumb[i].iri === iri ? ' style="color: var(--text); font-weight: 600;"' : '';
        html += `<span class="wb-inspector-breadcrumb-item"${cls}${style}>${escapeHtml(breadcrumb[i].label)}</span>`;
      }
      html += `</div></div>`;
    }

    // Properties section
    if (properties.length > 0) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">Properties (${properties.length})</div>`;
      for (const p of properties) {
        const propName = p['fandaws:propertyLabel'] || (p['owl:onProperty'] || '').split('/').pop();
        const value = p['owl:hasValue'] || p['owl:someValuesFrom'] || '';
        html += `<div class="wb-inspector-prop">${escapeHtml(propName)}`;
        if (value) html += `: <span style="color: var(--text-muted);">${escapeHtml(String(value))}</span>`;
        html += registerBadge(p);
        html += `</div>`;
      }
      html += `</div>`;
    }

    // Relationships section
    if (relationships.length > 0 || incomingRels.length > 0) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">Relationships</div>`;

      for (const r of relationships) {
        const verb = (r['owl:onProperty'] || '').split('/').pop();
        const objectIri = r['owl:someValuesFrom'] || '';
        const objectConcept = state.getConceptByIri(objectIri);
        const objectLabel = objectConcept?.['rdfs:label'] || objectIri.split('/').pop();
        html += `<div class="wb-inspector-rel">${escapeHtml(verb)} &rarr; <span class="wb-concept-link" data-concept-iri="${escapeHtml(objectIri)}">${escapeHtml(objectLabel)}</span>`;
        html += registerBadge(r);
        html += `</div>`;
      }

      for (const { source, restriction } of incomingRels) {
        const verb = (restriction['owl:onProperty'] || '').split('/').pop();
        const sourceLabel = source['rdfs:label'] || '';
        html += `<div class="wb-inspector-rel"><span class="wb-concept-link" data-concept-iri="${escapeHtml(source['@id'])}">${escapeHtml(sourceLabel)}</span> ${escapeHtml(verb)} &rarr; <em>this</em>`;
        html += registerBadge(restriction);
        html += `</div>`;
      }

      html += `</div>`;
    }

    // JSON-LD section (collapsible)
    html += `<div class="wb-inspector-section">`;
    html += `<div class="wb-inspector-jsonld-toggle" id="wb-jsonld-toggle">&#9654; JSON-LD</div>`;
    html += `<pre class="wb-inspector-jsonld" id="wb-jsonld-content" style="display: none;">${escapeHtml(JSON.stringify(concept, null, 2))}</pre>`;
    html += `</div>`;

    inspectorBody.innerHTML = html;

    // Wire JSON-LD toggle
    const jsonToggle = inspectorBody.querySelector('#wb-jsonld-toggle');
    const jsonContent = inspectorBody.querySelector('#wb-jsonld-content');
    if (jsonToggle && jsonContent) {
      jsonToggle.addEventListener('click', () => {
        const open = jsonContent.style.display !== 'none';
        jsonContent.style.display = open ? 'none' : 'block';
        jsonToggle.innerHTML = open ? '&#9654; JSON-LD' : '&#9660; JSON-LD';
      });
    }

    // Wire concept links
    inspectorBody.addEventListener('click', (e) => {
      const link = e.target.closest('[data-concept-iri]');
      if (link) state.selectConcept(link.dataset.conceptIri);
    });
  }

  function renderDashboard() {
    const graph = state.getGraph();
    const concepts = graph?.['fandaws:concepts'] || [];

    // Count stats
    let propCount = 0;
    let relCount = 0;
    const bfoCounts = {};
    const ersCounts = { R1: 0, R2: 0, R3: 0 };

    for (const c of concepts) {
      const subs = c['rdfs:subClassOf'] || [];
      for (const entry of subs) {
        if (typeof entry === 'string' && entry.startsWith('bfo:')) {
          const label = bfoLabel(entry);
          bfoCounts[label] = (bfoCounts[label] || 0) + 1;
        }
        if (typeof entry === 'object') {
          if (entry['fandaws:restrictionKind'] === 'property') propCount++;
          if (entry['fandaws:restrictionKind'] === 'relationship') relCount++;
          const info = ersRegisterInfo(entry);
          if (info) ersCounts[info.label]++;
        }
      }
    }

    // Find roots
    const conceptMap = new Map(concepts.map((c) => [c['@id'], c]));
    const roots = concepts.filter((c) => !c['skos:broader'] || !conceptMap.has(c['skos:broader']));

    let html = '';

    // Counts
    html += `<div class="wb-inspector-section">`;
    html += `<div class="wb-inspector-section-title">Graph Overview</div>`;
    html += `<div class="wb-dashboard-stat"><span class="wb-dashboard-stat-value">${concepts.length}</span><span class="wb-dashboard-stat-label">concepts</span></div>`;
    html += `<div class="wb-dashboard-stat"><span class="wb-dashboard-stat-value">${relCount}</span><span class="wb-dashboard-stat-label">relationships</span></div>`;
    html += `<div class="wb-dashboard-stat"><span class="wb-dashboard-stat-value">${propCount}</span><span class="wb-dashboard-stat-label">properties</span></div>`;
    html += `</div>`;

    // BFO distribution
    const bfoKeys = Object.keys(bfoCounts);
    if (bfoKeys.length > 0) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">BFO Distribution</div>`;
      html += `<div class="wb-dashboard-dist">`;
      for (const key of bfoKeys) {
        html += `<div class="wb-dashboard-dist-item">${escapeHtml(key)}: ${bfoCounts[key]}</div>`;
      }
      html += `</div></div>`;
    }

    // ERS distribution
    if (ersCounts.R1 + ersCounts.R2 + ersCounts.R3 > 0) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">ERS Distribution</div>`;
      html += `<div class="wb-dashboard-dist">`;
      if (ersCounts.R1 > 0) html += `<div class="wb-dashboard-dist-item"><span class="wb-register-sm wb-register-sm--r1">R1</span> Axiomatic: ${ersCounts.R1}</div>`;
      if (ersCounts.R2 > 0) html += `<div class="wb-dashboard-dist-item"><span class="wb-register-sm wb-register-sm--r2">R2</span> Normative: ${ersCounts.R2}</div>`;
      if (ersCounts.R3 > 0) html += `<div class="wb-dashboard-dist-item"><span class="wb-register-sm wb-register-sm--r3">R3</span> Aspirational: ${ersCounts.R3}</div>`;
      html += `</div></div>`;
    }

    // Root concepts
    if (roots.length > 0) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">Root Concepts</div>`;
      for (const root of roots) {
        html += `<div class="wb-dashboard-root" data-concept-iri="${escapeHtml(root['@id'])}">${escapeHtml(root['rdfs:label'] || root['@id'])}</div>`;
      }
      html += `</div>`;
    }

    // Graph metadata
    if (graph) {
      html += `<div class="wb-inspector-section">`;
      html += `<div class="wb-inspector-section-title">Graph Metadata</div>`;
      html += `<div class="wb-inspector-iri">${escapeHtml(graph['@id'] || '')}</div>`;
      const meta = graph['fandaws:metadata'];
      if (meta?.['fandaws:createdAt']) {
        html += `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Created: ${escapeHtml(meta['fandaws:createdAt'])}</div>`;
      }
      html += `</div>`;
    }

    inspectorBody.innerHTML = html;

    // Wire root concept clicks
    inspectorBody.addEventListener('click', (e) => {
      const link = e.target.closest('[data-concept-iri]');
      if (link) state.selectConcept(link.dataset.conceptIri);
    });
  }

  // Subscribe to events
  state.bus.on('concept-selected', (data) => renderConceptView(data.conceptIri));
  state.bus.on('concept-deselected', () => renderDashboard());
  state.bus.on('graph-changed', () => {
    const sel = state.getSelectedConceptIri();
    if (sel) renderConceptView(sel);
    else renderDashboard();
  });

  // Initial render
  renderDashboard();
}
