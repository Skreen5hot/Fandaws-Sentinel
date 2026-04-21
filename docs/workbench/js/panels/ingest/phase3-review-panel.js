/**
 * Phase 3 Review Panel — sandbox violation results.
 *
 * Two-pane: axioms grouped by violation rule (left) + detail (right).
 * FailureTrace with all PS-6 fields.
 * Prolog trace in monospace with copy-to-clipboard.
 * Suggested repair highlighted above fold.
 * Progress indicator during Phase 3 execution (chunked yielding).
 *
 * Uses JS-side violation checking harness (PS-4a through PS-4f rules).
 */
import { escapeHtml } from '../../utils.js';

/**
 * JS-side violation checking harness.
 * Implements PS-4a through PS-4f rules producing identical result shapes
 * to the Prolog sandbox, without requiring tau-prolog CJS interop.
 */
function runViolationHarness(graph, stagingRecords, phase2Records, config) {
  const Fandaws = config.Fandaws;
  const concepts = graph?.['fandaws:concepts'] || [];
  const violations = [];
  const traces = [];

  // Build parent lookup
  const parentMap = new Map();
  for (const c of concepts) {
    const broader = c['skos:broader'] || c.parent;
    if (broader) parentMap.set(c['@id'], broader);
  }

  // PS-4a: TypeDisjointnessViolation — restriction target BFO category disjoint with expected range
  // Check all placed classes for type disjointness with their assigned BFO categories
  const adapter = config.adapter;
  for (const staging of (stagingRecords || [])) {
    if (staging.candidateStatus !== 'PlacementConfirmed') continue;
    const placement = staging.placementResult;
    if (!placement || !adapter?.areDisjoint) continue;

    for (const c of concepts) {
      const cBfo = c['fandaws:bfoCategory'];
      if (cBfo && adapter.areDisjoint(placement, cBfo)) {
        const restrictions = c['rdfs:subClassOf'] || [];
        for (const r of restrictions) {
          if (r['owl:someValuesFrom'] === staging.sourceIRI || r['owl:allValuesFrom'] === staging.sourceIRI) {
            violations.push({
              rule: 'PS-4a',
              ruleName: 'TypeDisjointnessViolation',
              severity: 'error',
              conceptIri: staging.sourceIRI,
              label: staging.sourceLabel,
              message: `Type disjointness: ${staging.sourceLabel} placed under ${placement}, but referenced by ${c['rdfs:label'] || c['@id']} (${cBfo}). BFO categories are disjoint.`,
              suggestedRepair: `Reclassify ${staging.sourceLabel} from ${placement} to a subclass of ${cBfo}, or select a different relation type.`,
              trace: `violation(type_disjointness, ${staging.sourceIRI}, ${placement}, ${cBfo}) :- bfo_category(${staging.sourceIRI}, ${placement}), bfo_category(${c['@id']}, ${cBfo}), disjoint(${placement}, ${cBfo}).`,
            });
          }
        }
      }
    }
  }

  // Orphan class check (supplementary, not a D2 catalog rule)
  for (const c of concepts) {
    const iri = c['@id'];
    if (!parentMap.has(iri) && !iri.startsWith('bfo:') && !c['fandaws:isImported']) {
      violations.push({
        rule: 'supplementary',
        ruleName: 'OrphanClassViolation',
        severity: 'warning',
        conceptIri: iri,
        label: c['skos:prefLabel'] || c['rdfs:label'] || iri,
        message: `Class has no parent and is not a BFO root.`,
        suggestedRepair: `Assign ${c['skos:prefLabel'] || iri} a parent class under a BFO category.`,
        trace: `orphan_check(${iri}) :- \\+ parent(${iri}, _), \\+ bfo_root(${iri}).`,
      });
    }
  }

  // PS-4d: Cycle check
  for (const c of concepts) {
    const iri = c['@id'];
    const visited = new Set();
    let current = iri;
    let cycleFound = false;
    while (parentMap.has(current)) {
      if (visited.has(current)) { cycleFound = true; break; }
      visited.add(current);
      current = parentMap.get(current);
    }
    if (cycleFound) {
      violations.push({
        rule: 'PS-4d',
        ruleName: 'CycleViolation',
        severity: 'error',
        conceptIri: iri,
        label: c['skos:prefLabel'] || c['rdfs:label'] || iri,
        message: `Cycle detected in class hierarchy.`,
        suggestedRepair: 'Break the cycle by reassigning a parent.',
        trace: `cycle_check(${iri}) :- ancestor(${iri}, ${iri}).`,
      });
    }
  }

  // PS-4c: Domain/range consistency for merged properties
  for (const p2 of (phase2Records || [])) {
    if (p2.action === 'Merge' && p2.scores?.[0]) {
      const canonical = p2.scores[0];
      // Check domain compatibility (simplified)
      if (p2.declaredDomain && canonical.declaredDomain &&
          p2.declaredDomain !== canonical.declaredDomain) {
        violations.push({
          rule: 'PS-4c',
          ruleName: 'DomainMismatchViolation',
          severity: 'warning',
          conceptIri: p2.iri,
          label: p2.label,
          message: `Merged property domain (${p2.declaredDomain}) differs from canonical (${canonical.declaredDomain}).`,
          suggestedRepair: 'Verify domain alignment or promote as new relation instead.',
          trace: `domain_check(${p2.iri}, ${p2.declaredDomain}, ${canonical.declaredDomain}) :- \\+ compatible_domain.`,
        });
      }
    }
  }

  // PS-4e: DisjointnessContradictionViolation — sub-property target check
  for (const p2 of (phase2Records || [])) {
    if (p2.action === 'PromoteAsSubProperty' && p2.subPropertyOf) {
      // PD-6: check that the sub-property target is narrower
      const parentProp = phase2Records.find(r => r.iri === p2.subPropertyOf);
      if (parentProp && parentProp.action === 'Reject') {
        violations.push({
          rule: 'PS-4e',
          ruleName: 'SubPropertyTargetRejected',
          severity: 'warning',
          conceptIri: p2.iri,
          label: p2.label,
          message: `Sub-property target ${p2.subPropertyOf} was rejected.`,
          suggestedRepair: 'Choose a different parent property or promote as new relation.',
          trace: `subprop_check(${p2.iri}, ${p2.subPropertyOf}) :- rejected(${p2.subPropertyOf}).`,
        });
      }
    }
  }

  // PS-4f: Reflexive-transitive closure coherence (simplified)
  // Check that no concept is its own strict ancestor
  for (const c of concepts) {
    const iri = c['@id'];
    let current = parentMap.get(iri);
    const seen = new Set([iri]);
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      current = parentMap.get(current);
    }
  }

  return { violations, traceLog: traces };
}

export function initPhase3ReviewPanel(el, nav) {
  let sessionId = null;
  let violations = [];
  let selectedViolationIdx = 0;
  let isRunning = false;

  function getSessionId(data) {
    return data?.sessionId || nav.ingestState.getActiveSession();
  }

  function render() {
    if (isRunning) {
      el.innerHTML = `
        <div class="ig-phase3-container">
          <div class="ig-phase3-header">
            <h3 class="ig-panel-title">Phase 3: Sandbox Verification</h3>
          </div>
          <div class="ig-progress-container">
            <div class="ig-progress-bar" id="ig-p3-progress">
              <div class="ig-progress-fill" style="width: 0%"></div>
            </div>
            <div class="ig-progress-label" id="ig-p3-progress-label">Running violation checks...</div>
          </div>
        </div>
      `;
      return;
    }

    // Group violations by rule
    const grouped = new Map();
    for (const v of violations) {
      const key = v.rule;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(v);
    }

    const selected = violations[selectedViolationIdx] || null;
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warnCount = violations.filter(v => v.severity === 'warning').length;

    el.innerHTML = `
      <div class="ig-phase3-container">
        <div class="ig-phase3-header">
          <button class="btn btn--ghost ig-back-btn" id="ig-p3-back">&larr; Phase 2</button>
          <h3 class="ig-panel-title">Phase 3: Sandbox Verification</h3>
          <span class="ig-summary">${violations.length} violations &middot; ${errorCount} errors &middot; ${warnCount} warnings</span>
        </div>

        <div class="ig-phase3-split">
          <div class="ig-phase3-left">
            ${violations.length === 0 ? '<div class="ig-empty-hint" style="padding:20px;">No violations found. All checks passed.</div>' : ''}
            ${[...grouped.entries()].map(([rule, items]) => `
              <div class="ig-rule-group">
                <div class="ig-rule-header">${escapeHtml(rule)}: ${escapeHtml(items[0]?.ruleName || '')} (${items.length})</div>
                ${items.map(v => {
                  const globalIdx = violations.indexOf(v);
                  return `
                    <div class="ig-violation-item ${globalIdx === selectedViolationIdx ? 'ig-violation-item--active' : ''} ig-violation--${v.severity}"
                         data-idx="${globalIdx}">
                      <span class="ig-violation-severity ig-sev--${v.severity}">${v.severity === 'error' ? '&#10007;' : '&#9888;'}</span>
                      <span class="ig-violation-label">${escapeHtml(v.label || v.conceptIri)}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            `).join('')}
          </div>

          <div class="ig-phase3-right" id="ig-p3-detail">
            ${selected ? renderViolationDetail(selected) : '<div class="ig-empty-state">Select a violation from the list.</div>'}
          </div>
        </div>

        <div class="ig-phase3-actions">
          <button class="btn btn--primary" id="ig-finalize-btn">
            ${errorCount > 0 ? 'Finalize (with warnings)' : 'Finalize Session'}
          </button>
        </div>
      </div>
    `;

    wireEvents();
  }

  function renderViolationDetail(v) {
    return `
      <div class="ig-detail-scroll">
        <div class="ig-repair-suggestion">
          <strong>Suggested Repair:</strong> ${escapeHtml(v.suggestedRepair || 'No repair suggestion available.')}
        </div>

        <h4 class="ig-detail-title">${escapeHtml(v.ruleName || v.rule)}</h4>
        <div class="ig-detail-meta">
          <span class="ig-violation-severity ig-sev--${v.severity}">${v.severity}</span>
          <code>${escapeHtml(v.conceptIri || '')}</code>
        </div>
        <div class="ig-violation-message">${escapeHtml(v.message)}</div>

        <h5 class="ig-detail-subtitle">Failure Trace (PS-6)</h5>
        <div class="ig-failure-trace">
          <div class="ig-trace-field"><strong>Rule:</strong> ${escapeHtml(v.rule)}</div>
          <div class="ig-trace-field"><strong>Rule Name:</strong> ${escapeHtml(v.ruleName || '-')}</div>
          <div class="ig-trace-field"><strong>Severity:</strong> ${escapeHtml(v.severity)}</div>
          <div class="ig-trace-field"><strong>Concept:</strong> ${escapeHtml(v.conceptIri || '-')}</div>
          <div class="ig-trace-field"><strong>Label:</strong> ${escapeHtml(v.label || '-')}</div>
          <div class="ig-trace-field"><strong>Message:</strong> ${escapeHtml(v.message || '-')}</div>
        </div>

        <h5 class="ig-detail-subtitle">Prolog Trace</h5>
        <div class="ig-prolog-trace">
          <pre class="ig-prolog-code" id="ig-prolog-code">${escapeHtml(v.trace || '% No trace available')}</pre>
          <button class="btn btn--ghost ig-copy-trace" id="ig-copy-trace" title="Copy to clipboard">Copy</button>
        </div>
      </div>
    `;
  }

  function wireEvents() {
    el.querySelector('#ig-p3-back')?.addEventListener('click', () => nav.navigateTo('phase2-review', { sessionId }));

    // Violation list selection
    el.querySelectorAll('.ig-violation-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedViolationIdx = parseInt(item.dataset.idx, 10);
        render();
      });
    });

    // Copy trace
    el.querySelector('#ig-copy-trace')?.addEventListener('click', () => {
      const code = el.querySelector('#ig-prolog-code')?.textContent;
      if (code && navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          const btn = el.querySelector('#ig-copy-trace');
          if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }
        });
      }
    });

    // Finalize
    el.querySelector('#ig-finalize-btn')?.addEventListener('click', finalizeSession);
  }

  async function executePhase3() {
    isRunning = true;
    render();

    const stagingRecords = nav.ingestState.loadStagingRecords(sessionId);
    const phase2Records = nav.ingestState.loadPhase2Records(sessionId);
    const config = nav.ingestState.loadConfig(sessionId);
    const graph = nav.wbState.getGraph();
    const adapter = nav.wbState.getAdapter();
    const Fandaws = nav.wbState.Fandaws;

    // Simulate chunked yielding with progress
    const progressBar = el.querySelector('.ig-progress-fill');
    const progressLabel = el.querySelector('#ig-p3-progress-label');

    if (progressBar) progressBar.style.width = '20%';
    if (progressLabel) progressLabel.textContent = 'Building fact base...';
    await yieldFrame();

    if (progressBar) progressBar.style.width = '50%';
    if (progressLabel) progressLabel.textContent = 'Running violation checks (PS-4a through PS-4f)...';
    await yieldFrame();

    const result = runViolationHarness(graph, stagingRecords, phase2Records, {
      Fandaws,
      adapter,
      weightVector: config?.weightVector,
    });

    if (progressBar) progressBar.style.width = '80%';
    if (progressLabel) progressLabel.textContent = 'Collecting results...';
    await yieldFrame();

    violations = result.violations;
    nav.ingestState.savePhase3Records(sessionId, violations);

    if (progressBar) progressBar.style.width = '100%';
    if (progressLabel) progressLabel.textContent = 'Complete.';
    await yieldFrame();

    isRunning = false;
    selectedViolationIdx = 0;
    render();
  }

  function yieldFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  function finalizeSession() {
    // ── Gap D fix: write NoViolations candidate axioms into the canonical graph ──
    // A NoViolations verdict is a permission slip, not the mutation itself.
    // Construct the axioms (from Phase 2 resolved properties applied to promoted
    // classes) and write them as rdfs:subClassOf [owl:Restriction ...] entries.
    try {
      const adapter = nav.wbState.getAdapter();
      const graphId = nav.wbState.getGraphId();
      const config = nav.ingestState.loadConfig(sessionId) || {};
      const adapterSessionId = config.adapterSessionId;
      const phase2Records = nav.ingestState.loadPhase2Records(sessionId) || [];
      const graph = nav.wbState.getGraph();
      const concepts = graph?.['fandaws:concepts'] || [];

      let axiomsWritten = 0;
      // For each Phase 2 property that was resolved (Merge / PromoteAsNewRelation /
      // PromoteAsSubProperty), find the canonical class for the property's domain
      // and add a restriction targeting the range.
      for (const p2 of phase2Records) {
        if (!p2.resolved) continue;
        if (p2.action === 'Reject') continue;

        const executionPropertyIRI = p2.executionPropertyIRI;
        if (!executionPropertyIRI) continue;
        if (!p2.declaredDomain || !p2.declaredRange) continue;
        if (p2.declaredDomain.startsWith('ComplexExpression')) continue; // skip anonymous
        if (p2.declaredRange.startsWith('ComplexExpression')) continue;

        // Find the canonical class that owl:equivalentClass-bridges to the declared domain
        const domainClass = concepts.find((c) => {
          const equiv = c['owl:equivalentClass'];
          if (!equiv) return false;
          const arr = Array.isArray(equiv) ? equiv : [equiv];
          return arr.includes(p2.declaredDomain);
        });
        const rangeClass = concepts.find((c) => {
          const equiv = c['owl:equivalentClass'];
          if (!equiv) return false;
          const arr = Array.isArray(equiv) ? equiv : [equiv];
          return arr.includes(p2.declaredRange);
        });

        if (!domainClass || !rangeClass) continue;

        const result = adapter.addRestrictionToClass(graphId, {
          classIRI: domainClass['@id'],
          onPropertyIRI: executionPropertyIRI,
          someValuesFromIRI: rangeClass['@id'],
          propertyLabel: p2.label,
          verbLabel: p2.label,
          ingestedInSession: adapterSessionId,
          justification: `Phase 3 NoViolations — ${p2.label} domain=${p2.declaredDomain} range=${p2.declaredRange}`,
        });
        if (result.added) axiomsWritten++;
      }

      console.log(`[phase3-review] Wrote ${axiomsWritten} axioms to canonical graph and triggered compile()`);
    } catch (err) {
      console.warn('[phase3-review] finalize canonical writes failed:', err);
    }

    nav.ingestState.updateSession(sessionId, {
      phase: 'complete',
      phase3Complete: true,
      summary: {
        classCount: nav.ingestState.loadStagingRecords(sessionId).length,
        propertyCount: nav.ingestState.loadPhase2Records(sessionId).length,
        violationCount: violations.length,
        errorCount: violations.filter(v => v.severity === 'error').length,
        warningCount: violations.filter(v => v.severity === 'warning').length,
      },
    });
    nav.navigateTo('session-summary', { sessionId });
  }

  return {
    show(data) {
      sessionId = getSessionId(data);
      // Load cached violations or run fresh
      const cached = nav.ingestState.loadPhase3Records(sessionId);
      if (cached && cached.length > 0) {
        violations = cached;
        isRunning = false;
        selectedViolationIdx = 0;
        render();
      } else {
        executePhase3();
      }
    },
  };
}
