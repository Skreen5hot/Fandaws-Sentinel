/**
 * Fandaws Sentinel — Stakeholder Review UI
 *
 * Interactive app logic for the single-page stakeholder review site.
 * Imports the bundled Fandaws library from dist/fandaws.js.
 */

import * as Fandaws from '../dist/fandaws.js';

// ─────────────────────────────────────────────────────────
// Tab navigation (ADR-004: dropdown sub-nav)
// ─────────────────────────────────────────────────────────

const navContainer = document.getElementById('nav-tabs');
const sections = document.querySelectorAll('.section');

function activateTab(tabId) {
  navContainer.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  navContainer.querySelectorAll('.nav-dropdown-item').forEach((t) => t.classList.remove('active'));
  sections.forEach((s) => s.classList.remove('active'));

  const dropdown = document.querySelector('.nav-dropdown');
  dropdown?.classList.remove('open');

  const section = document.getElementById(`section-${tabId}`);
  if (section) section.classList.add('active');

  // Lazy-render Mermaid diagram when roadmap tab first becomes visible
  if (tabId === 'roadmap' && window.__mermaid) {
    window.__mermaid.run();
  }

  const topTab = navContainer.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  const dropdownItem = navContainer.querySelector(`.nav-dropdown-item[data-tab="${tabId}"]`);

  if (topTab) {
    topTab.classList.add('active');
  } else if (dropdownItem) {
    dropdownItem.classList.add('active');
    document.getElementById('demos-toggle')?.classList.add('active');
  }
}

navContainer.querySelectorAll('.nav-tab[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

const demosToggle = document.getElementById('demos-toggle');
const demosDropdown = demosToggle?.closest('.nav-dropdown');

demosToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  demosDropdown?.classList.toggle('open');
});

navContainer.querySelectorAll('.nav-dropdown-item').forEach((item) => {
  item.addEventListener('click', () => activateTab(item.dataset.tab));
});

document.addEventListener('click', () => {
  demosDropdown?.classList.remove('open');
});

// ─────────────────────────────────────────────────────────
// Roadmap — phase cards
// ─────────────────────────────────────────────────────────

async function loadRoadmap() {
  try {
    const res = await fetch('data/roadmap.json');
    const data = await res.json();
    const grid = document.getElementById('phase-grid');

    grid.innerHTML = data.phases.map((p) => {
      const statusClass = p.status === 'complete' ? 'complete' : 'not-started';
      const trackLabel = p.track ? `Track ${p.track}` : p.id === 8 ? 'Convergence' : '';
      return `
        <div class="phase-card phase-card--${statusClass}">
          <span class="phase-number">Phase ${p.id}</span>
          ${trackLabel ? `<span class="phase-track">${trackLabel}</span>` : ''}
          <div class="phase-name">${p.name}</div>
          <span class="phase-status phase-status--${statusClass}">
            ${p.status === 'complete' ? 'Complete' : 'Not Started'}
          </span>
          <p class="phase-description">${p.description}</p>
        </div>`;
    }).join('');

    // Update header badge
    const badge = document.getElementById('badge-phase');
    badge.textContent = `Phase ${data.currentPhase} Complete`;
  } catch {
    // roadmap.json not available — leave grid empty
  }
}

// ─────────────────────────────────────────────────────────
// Identity Simplification Playground
// ─────────────────────────────────────────────────────────

const STEP_LABELS = [
  'Trim',
  'Collapse WS',
  'Remove Articles',
  'NFKC',
  'Case Fold',
  'Abbreviations',
];

const GOLDEN_SAMPLES = [
  // Whitespace & articles (en)
  { input: '  A Dog  ', expected: 'dog', note: 'trim + article + case fold' },
  { input: 'The   golden   retriever', expected: 'golden retriever', note: 'article + collapse WS' },
  { input: 'An Apple', expected: 'apple', note: 'article "an" removed' },
  { input: 'The dog', expected: 'dog', note: 'not protected, article stripped' },
  // NFKC normalization
  { input: 'CAF\u00C9', expected: 'caf\u00E9', note: 'case fold preserves diacritics' },
  { input: '\uFB01nance', expected: 'finance', note: 'NFKC fi ligature' },
  { input: '\uFF21\uFF22\uFF23', expected: 'abc', note: 'NFKC fullwidth + case fold' },
  { input: 'x\u00B2', expected: 'x2', note: 'NFKC superscript' },
  // Protected proper nouns
  { input: 'The Hague', expected: 'the hague', protected: true, note: 'protected — article kept' },
  { input: 'The Beatles', expected: 'the beatles', protected: true, note: 'protected — article kept' },
  { input: 'The Gambia', expected: 'the gambia', protected: true, note: 'protected — article kept' },
  // Abbreviation expansion
  { input: 'govt', expected: 'government', abbr: true, note: 'abbreviation expansion' },
  { input: 'The dept of govt', expected: 'department of government', abbr: true, note: 'article + multi-abbreviation' },
  // Turkish dotted I (Section 6.6 i18n)
  { input: '\u0130STANBUL', expected: 'istanbul', locale: 'tr', note: 'Turkish \u0130 \u2192 i (locale-aware)' },
  // CJK pass-through
  { input: '\u6D4B\u8BD5\u6982\u5FF5', expected: '\u6D4B\u8BD5\u6982\u5FF5', locale: 'zh', note: 'CJK no-op (no case concept)' },
];

function buildCorpusTable() {
  const tbody = document.getElementById('corpus-tbody');
  tbody.innerHTML = GOLDEN_SAMPLES.map((s, i) => {
    const inputDisplay = JSON.stringify(s.input);
    return `<tr data-idx="${i}">
      <td>${inputDisplay}</td>
      <td>${JSON.stringify(s.expected)}</td>
      <td style="color: var(--text-muted); font-family: var(--font-sans); font-size: 0.75rem">${s.note || ''}</td>
    </tr>`;
  }).join('');

  tbody.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const sample = GOLDEN_SAMPLES[Number(row.dataset.idx)];
    if (!sample) return;

    document.getElementById('input-term').value = sample.input;

    // Set locale for non-English samples
    if (sample.locale) {
      document.getElementById('input-locale').value = sample.locale;
    } else {
      document.getElementById('input-locale').value = 'en';
    }

    // Set abbreviation table for abbreviation samples
    if (sample.abbr) {
      document.getElementById('input-abbreviations').value = '{"govt": "government", "dept": "department"}';
    } else {
      document.getElementById('input-abbreviations').value = '{}';
    }

    runPipeline();
  });
}

function runPipeline() {
  const input = document.getElementById('input-term').value;
  const locale = document.getElementById('input-locale').value;

  let abbreviationTable = {};
  try {
    abbreviationTable = JSON.parse(document.getElementById('input-abbreviations').value || '{}');
  } catch { /* ignore parse errors */ }

  const protectedRaw = document.getElementById('input-protected').value;
  const protectedProperNouns = protectedRaw
    ? protectedRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const articles = locale === 'en' ? ['a', 'an', 'the'] : [];

  // Run each step individually to show intermediate results
  const steps = [];
  let val = input;

  // Step 1: Trim
  val = Fandaws.trimWhitespace(val);
  steps.push(val);

  // Step 2: Collapse whitespace
  val = Fandaws.collapseWhitespace(val);
  steps.push(val);

  // Step 3: Remove leading articles
  val = Fandaws.removeLeadingArticles(val, { articles, protectedProperNouns });
  steps.push(val);

  // Step 4: NFKC
  val = Fandaws.applyNFKC(val);
  steps.push(val);

  // Step 5: Case fold
  val = Fandaws.caseFold(val, locale);
  steps.push(val);

  // Step 6: Abbreviation expansion
  val = Fandaws.expandAbbreviations(val, abbreviationTable);
  steps.push(val);

  // Render steps
  const container = document.getElementById('pipeline-steps');
  let prev = input;
  container.innerHTML = steps.map((result, i) => {
    const changed = result !== prev;
    prev = result;
    const display = JSON.stringify(result);
    return `
      <div class="pipeline-step">
        <span class="step-number">${i + 1}</span>
        <span class="step-label">${STEP_LABELS[i]}</span>
        <span class="step-result ${changed ? 'step-result--changed' : ''}">${display}</span>
      </div>`;
  }).join('');

  // Final result
  document.getElementById('final-canonical').textContent =
    JSON.stringify({ canonicalLabel: val, languageTag: locale });
}

// Wire up playground inputs
['input-term', 'input-locale', 'input-abbreviations', 'input-protected'].forEach((id) => {
  document.getElementById(id).addEventListener('input', runPipeline);
});

// ─────────────────────────────────────────────────────────
// Type Factory Explorer
// ─────────────────────────────────────────────────────────

const FACTORY_PARAMS = {
  createConcept: [
    { name: 'id', default: 'concept-1' },
    { name: 'label', default: 'Golden Retriever' },
    { name: 'prefLabel', default: 'golden retriever' },
    { name: 'broader', default: '' },
    { name: 'definition', default: 'A friendly dog breed' },
  ],
  createProperty: [
    { name: 'id', default: 'prop-1' },
    { name: 'propertyIri', default: 'has fur' },
    { name: 'attachedTo', default: 'concept-1' },
    { name: 'scope', default: 'concept-specific' },
    { name: 'value', default: '' },
  ],
  createRelationship: [
    { name: 'id', default: 'rel-1' },
    { name: 'verbIri', default: 'chases' },
    { name: 'subject', default: 'concept-dog' },
    { name: 'object', default: 'concept-cat' },
  ],
  createKnowledgeGraph: [
    { name: 'id', default: 'graph-1' },
  ],
  createGraphMutation: [
    { name: 'reason', default: 'User stated: A dog is an animal' },
  ],
  createConversationPrompt: [
    { name: 'promptType', default: 'confirmation' },
    { name: 'text', default: 'You said a dog is an animal. Is that correct?' },
    { name: 'context', default: 'classification' },
  ],
  createDeferredResult: [
    { name: 'operation', default: 'classification' },
    { name: 'input', default: 'dog' },
    { name: 'reason', default: 'Ambiguous term requires clarification' },
  ],
  createValidationResult: [
    { name: 'valid', default: 'true', type: 'boolean' },
  ],
  createConversationSession: [
    { name: 'sessionId', default: 'session-1' },
    { name: 'callerId', default: 'user-1' },
    { name: 'term', default: 'dog' },
    { name: 'workingGraphId', default: 'graph-1' },
  ],
  createScopeConfiguration: [
    { name: 'userGraphId', default: 'user-graph-1' },
  ],
  createScopeEntry: [
    { name: 'graphId', default: 'graph-1' },
    { name: 'label', default: 'My Graph' },
    { name: 'priority', default: '1', type: 'number' },
  ],
  createScopeResolution: [
    { name: 'term', default: 'dog' },
    { name: 'status', default: 'resolved' },
  ],
};

function renderFactoryParams() {
  const factory = document.getElementById('factory-select').value;
  const params = FACTORY_PARAMS[factory] || [];
  const container = document.getElementById('factory-params');

  container.innerHTML = params.map((p) => `
    <div class="field-group">
      <label for="param-${p.name}">${p.name}</label>
      <input type="text" id="param-${p.name}" value="${p.default}" placeholder="${p.name}">
    </div>
  `).join('');
}

function generateFactory() {
  const factoryName = document.getElementById('factory-select').value;
  const fn = Fandaws[factoryName];
  if (!fn) {
    document.getElementById('factory-output').textContent = `Error: ${factoryName} not found in bundle`;
    return;
  }

  const params = FACTORY_PARAMS[factoryName] || [];
  const argsObj = {};
  for (const p of params) {
    const val = document.getElementById(`param-${p.name}`)?.value ?? p.default;
    if (p.type === 'boolean') argsObj[p.name] = val === 'true';
    else if (p.type === 'number') argsObj[p.name] = Number(val);
    else argsObj[p.name] = val || undefined;
  }

  try {
    const result = fn(argsObj);
    document.getElementById('factory-output').textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    document.getElementById('factory-output').textContent = `Error: ${err.message}`;
  }
}

document.getElementById('factory-select').addEventListener('change', renderFactoryParams);
document.getElementById('factory-generate').addEventListener('click', generateFactory);

// ─────────────────────────────────────────────────────────
// Test Results
// ─────────────────────────────────────────────────────────

async function loadTestResults() {
  try {
    const res = await fetch('data/test-results.json');
    const data = await res.json();

    // Summary stats
    document.getElementById('test-summary').innerHTML = [
      { value: data.totalTests, label: 'Total Tests', cls: '' },
      { value: data.passedTests, label: 'Passed', cls: 'green' },
      { value: data.failedTests, label: 'Failed', cls: data.failedTests > 0 ? 'red' : 'muted' },
      { value: data.totalSuites, label: 'Suites', cls: '' },
    ].map((s) => `
      <div class="test-stat">
        <div class="test-stat-value ${s.cls ? `test-stat-value--${s.cls}` : ''}">${s.value}</div>
        <div class="test-stat-label">${s.label}</div>
      </div>
    `).join('');

    // Suite table
    document.getElementById('suite-tbody').innerHTML = data.suites.map((s) => `
      <tr>
        <td>${s.name}</td>
        <td style="color: var(--green)">${s.passed}</td>
        <td style="color: ${s.failed > 0 ? 'var(--red)' : 'var(--text-muted)'}">${s.failed}</td>
        <td style="color: var(--text-muted)">${s.duration}ms</td>
      </tr>
    `).join('');

    // Update header badge
    const badge = document.getElementById('badge-tests');
    badge.textContent = `${data.passedTests}/${data.totalTests} Tests Pass`;
    badge.classList.toggle('badge--red', data.failedTests > 0);
  } catch {
    document.getElementById('badge-tests').textContent = 'Tests: N/A';
  }
}

// ─────────────────────────────────────────────────────────
// Property Workflow Demo
// ─────────────────────────────────────────────────────────

const DEMO_HIERARCHY = [
  { id: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', label: 'Entity', prefLabel: 'entity', broader: null },
  { id: 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', label: 'Living Thing', prefLabel: 'living thing', broader: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity' },
  { id: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', label: 'Animal', prefLabel: 'animal', broader: 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing' },
  { id: 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', label: 'Mammal', prefLabel: 'mammal', broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal' },
  { id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', label: 'Dog', prefLabel: 'dog', broader: 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal' },
  { id: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', label: 'Cat', prefLabel: 'cat', broader: 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal' },
];

let propertyAdapter = null;
const PROP_GRAPH_ID = 'fandaws:graph/demo';

function initPropertyDemo() {
  // Render hierarchy tree
  const container = document.getElementById('property-hierarchy');
  if (!container) return;

  const lines = [];
  const indent = { 'entity': 0, 'living thing': 1, 'animal': 2, 'mammal': 3, 'dog': 4, 'cat': 4 };
  for (const c of DEMO_HIERARCHY) {
    const depth = indent[c.prefLabel] || 0;
    const prefix = depth === 0 ? '' : '  '.repeat(depth - 1) + '└─ ';
    lines.push(`${prefix}${c.label}`);
  }
  container.textContent = lines.join('\n');

  // Build adapter + graph
  resetPropertyAdapter();

  // Wire events
  document.getElementById('property-run')?.addEventListener('click', runPropertyDemo);
  document.getElementById('property-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runPropertyDemo();
  });
}

function resetPropertyAdapter() {
  propertyAdapter = new Fandaws.InMemoryStateAdapter();
  const concepts = DEMO_HIERARCHY.map((c) => Fandaws.createConcept(c));
  const graph = Fandaws.createKnowledgeGraph({ id: PROP_GRAPH_ID, concepts });
  propertyAdapter.saveGraph(PROP_GRAPH_ID, graph);
}

let pendingScopeContext = null;
let pendingUtterance = null;
let scopeDecisions = new Map();

function runPropertyDemo() {
  const input = document.getElementById('property-input').value.trim();
  if (!input) return;

  const stages = document.getElementById('property-stages');
  const promptArea = document.getElementById('property-scope-prompts');
  stages.innerHTML = '';
  promptArea.innerHTML = '';

  // Reset state for new utterance
  if (input !== pendingUtterance) {
    pendingScopeContext = null;
    pendingUtterance = input;
    scopeDecisions = new Map();
    resetPropertyAdapter();
  }

  const context = { stateAdapter: propertyAdapter, graphId: PROP_GRAPH_ID };

  // Stage 1: Parse
  let parseResult;
  try {
    parseResult = Fandaws.parse(input);
    addStage(stages, '1. Parse', parseResult
      ? `subject: "${parseResult['fandaws:subject']}", verb: "${parseResult['fandaws:predicate']}", object: "${parseResult['fandaws:object']}"`
      : 'Parse failed', !parseResult);
  } catch (e) {
    addStage(stages, '1. Parse', `Error: ${e.message}`, true);
    return;
  }
  if (!parseResult) return;

  // Stage 2: Classify
  const action = Fandaws.classify(parseResult);
  const workflow = action['fandaws:workflow'];
  addStage(stages, '2. Classify', `workflow: ${workflow}`, workflow !== 'property');
  if (workflow !== 'property') {
    addStage(stages, '', `This demo handles "has/have" property statements. Try "A dog has fur".`, true);
    return;
  }

  // Stage 3: Run property pipeline with current decisions
  const options = scopeDecisions.size > 0 ? { scopeDecisions } : {};
  const result = Fandaws.runPropertyPipeline(input, context, options);

  // Stage 3: Scope narrowing
  if (result.prompts && result.prompts.length > 0 && !result.success) {
    const leapNote = result.prompts.length === 2 ? ' (Leap Check: probing parent + root boundaries)' : '';
    addStage(stages, '3. Scope Narrowing', `${result.prompts.length} prompt(s)${leapNote} — answer below`, false);

    // Render scope prompts as interactive buttons
    for (const prompt of result.prompts) {
      const text = prompt['fandaws:text'] || 'Scope question';
      const ctx = prompt['fandaws:context'] || {};
      const conceptIri = ctx.conceptIri || '';
      const div = document.createElement('div');
      div.className = 'card';
      div.style.cssText = 'margin-bottom: 8px; padding: 12px;';
      div.innerHTML = `
        <p style="margin-bottom: 8px; color: var(--accent);">${escapeHtml(text)}</p>
        <button class="btn btn--primary scope-btn" data-iri="${escapeHtml(conceptIri)}" data-answer="true" style="margin-right: 8px;">Yes</button>
        <button class="btn scope-btn" data-iri="${escapeHtml(conceptIri)}" data-answer="false" style="background: var(--surface-alt); border: 1px solid var(--border);">No</button>
      `;
      promptArea.appendChild(div);
    }

    // Wire scope buttons
    promptArea.querySelectorAll('.scope-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const iri = btn.dataset.iri;
        const answer = btn.dataset.answer === 'true';
        scopeDecisions.set(iri, answer);
        runPropertyDemo(); // re-run with updated decisions
      });
    });

    pendingScopeContext = result.scopeContext;
    return;
  }

  // Stage 3 resolved or skipped — show definitive result
  if (result.success && result.mutation) {
    const additions = result.mutation['fandaws:additions'] || [];
    const attachment = additions[0];
    const attachedTo = attachment?.['fandaws:attachedTo'] || 'N/A';
    const attachedLabel = DEMO_HIERARCHY.find((c) => c.id === attachedTo)?.label || attachedTo;
    const promptCount = scopeDecisions.size;
    const scopeNote = promptCount > 0 ? ` (resolved in ${promptCount} prompt${promptCount > 1 ? 's' : ''})` : ' (root concept — no scope narrowing needed)';

    addStage(stages, '3. Scope Resolved',
      `Attached to: ${attachedLabel} (${attachedTo}), scope: ${attachment?.['fandaws:scope'] || 'N/A'}${scopeNote}`,
      false);

    // Stage 4: Mutation
    addStage(stages, '4. Mutation Applied',
      `Property "${attachment?.['owl:onProperty']}" added as ${attachment?.['@id']}`,
      false);

    // Stage 5: Description
    if (result.descriptions && result.descriptions.length > 0) {
      const descText = result.descriptions.map((d) => `${d.conceptIri}: "${d.description}"`).join('\n');
      addStage(stages, '5. Descriptions', descText, false);
    }

    // Show JSON-LD output
    addStage(stages, 'Mutation JSON-LD', JSON.stringify(result.mutation, null, 2), false, true);
  } else if (result.success && !result.mutation) {
    addStage(stages, '3. Result', 'No-op — property already exists (idempotent)', false);
  } else if (result.error) {
    addStage(stages, '3. Error', `${result.errorReason}: ${JSON.stringify(result.prompts?.[0]?.['fandaws:text'] || '')}`, true);
  }
}

function addStage(container, label, content, isError, isPre) {
  const div = document.createElement('div');
  div.className = 'pipeline-step';
  const labelHtml = label ? `<span class="step-label" style="min-width: 140px;">${escapeHtml(label)}</span>` : '';
  if (isPre) {
    div.innerHTML = `${labelHtml}<pre class="step-result" style="white-space: pre-wrap; font-size: 0.7rem; max-height: 200px; overflow-y: auto;">${escapeHtml(content)}</pre>`;
  } else {
    div.innerHTML = `${labelHtml}<span class="step-result ${isError ? '' : 'step-result--changed'}" style="white-space: pre-wrap;">${escapeHtml(content)}</span>`;
  }
  container.appendChild(div);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────
// Description Engine Demo
// ─────────────────────────────────────────────────────────

const DESC_HIERARCHY = [
  { id: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', label: 'Entity', prefLabel: 'entity', broader: null },
  { id: 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', label: 'Living Thing', prefLabel: 'living thing', broader: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity' },
  { id: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', label: 'Animal', prefLabel: 'animal', broader: 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing' },
  { id: 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal', label: 'Mammal', prefLabel: 'mammal', broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal' },
  { id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', label: 'Dog', prefLabel: 'dog', broader: 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal' },
  { id: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', label: 'Cat', prefLabel: 'cat', broader: 'fandaws:class/321f3e84-d57c-5fb1-9be6-6c9ad741e313/mammal' },
  { id: 'fandaws:class/84583835-5246-5db0-a48f-3f64ea197c2e/elephant', label: 'Elephant', prefLabel: 'elephant', broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal' },
  { id: 'fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt', label: 'Hunt', prefLabel: 'hunt', broader: null },
  { id: 'fandaws:class/73765e50-9c16-51b2-8c25-d720762a9127/predation', label: 'Predation', prefLabel: 'predation', broader: 'fandaws:class/f478f91b-88dd-5282-809d-e4d441062919/hunt' },
  { id: 'fandaws:class/6189cbb4-b6dc-56cf-ac11-ea6c4a39df42/university', label: 'University', prefLabel: 'university', broader: null },
  { id: 'fandaws:class/72b2e3ab-38f0-5870-9e7a-c6f93066ea00/oxford', label: 'Oxford', prefLabel: 'oxford', broader: 'fandaws:class/6189cbb4-b6dc-56cf-ac11-ea6c4a39df42/university' },
  { id: 'fandaws:class/27b21777-3336-594a-bab0-8020b8d33dbe/hour', label: 'Hour', prefLabel: 'hour', broader: null },
  { id: 'fandaws:class/d67f6f7b-3981-51d1-88a5-ff5118706b18/minute', label: 'Minute', prefLabel: 'minute', broader: 'fandaws:class/27b21777-3336-594a-bab0-8020b8d33dbe/hour' },
];

let descProperties = [];

const DESC_EXAMPLES = [
  { label: 'Standard: Dog is a Mammal', concept: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', properties: [], rel: null },
  { label: 'Article "an": Animal is a Living Thing', concept: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', properties: [], rel: null },
  { label: 'With properties: Dog + fur, four legs', concept: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', properties: ['fur', 'four legs'], rel: null },
  { label: 'Oxford comma: Cat + whiskers, claws, tail', concept: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', properties: ['whiskers', 'claws', 'tail'], rel: null },
  { label: 'Root concept: Entity', concept: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', properties: [], rel: null },
  { label: 'Root + properties: Entity + mass, energy', concept: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', properties: ['mass', 'energy'], rel: null },
  { label: 'Process: Predation (hunt + chases)', concept: 'fandaws:class/73765e50-9c16-51b2-8c25-d720762a9127/predation', properties: [], rel: { verb: 'chases', subject: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', object: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat' } },
  { label: 'Limitation: "an University" (vowel letter)', concept: 'fandaws:class/72b2e3ab-38f0-5870-9e7a-c6f93066ea00/oxford', properties: [], rel: null },
  { label: 'Limitation: "a Hour" (consonant letter)', concept: 'fandaws:class/d67f6f7b-3981-51d1-88a5-ff5118706b18/minute', properties: [], rel: null },
];

function initDescriptionDemo() {
  const hierarchyEl = document.getElementById('desc-hierarchy');
  if (!hierarchyEl) return;

  // Render hierarchy tree
  const indent = { 'entity': 0, 'living thing': 1, 'animal': 2, 'mammal': 3, 'dog': 4, 'cat': 4, 'elephant': 3, 'hunt': 0, 'predation': 1, 'university': 0, 'oxford': 1, 'hour': 0, 'minute': 1 };
  const lines = [];
  for (const c of DESC_HIERARCHY) {
    const depth = indent[c.prefLabel] || 0;
    const prefix = depth === 0 ? '' : '  '.repeat(depth - 1) + '\u2514\u2500 ';
    lines.push(`${prefix}${c.label}`);
  }
  hierarchyEl.textContent = lines.join('\n');

  // Populate concept dropdowns
  const conceptSelect = document.getElementById('desc-concept');
  const subjectSelect = document.getElementById('desc-rel-subject');
  const objectSelect = document.getElementById('desc-rel-object');

  for (const c of DESC_HIERARCHY) {
    conceptSelect.add(new Option(c.label, c.id));
    subjectSelect.add(new Option(c.label, c.id));
    objectSelect.add(new Option(c.label, c.id));
  }

  // Pre-select interesting defaults
  conceptSelect.value = 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog';
  subjectSelect.value = 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog';
  objectSelect.value = 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat';

  // Render examples
  const examplesEl = document.getElementById('desc-examples');
  examplesEl.innerHTML = DESC_EXAMPLES.map((ex, i) =>
    `<button class="desc-example-btn" data-idx="${i}">${escapeHtml(ex.label)}</button>`,
  ).join('');

  examplesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.desc-example-btn');
    if (!btn) return;
    const ex = DESC_EXAMPLES[Number(btn.dataset.idx)];
    if (!ex) return;

    conceptSelect.value = ex.concept;
    descProperties = [...ex.properties];
    renderDescPropertyTags();

    // Set relationship fields
    document.getElementById('desc-rel-verb').value = ex.rel ? ex.rel.verb : '';
    if (ex.rel) {
      subjectSelect.value = ex.rel.subject;
      objectSelect.value = ex.rel.object;
    }

    updateDescription();
  });

  // Wire events
  conceptSelect.addEventListener('change', updateDescription);
  document.getElementById('desc-rel-verb').addEventListener('input', updateDescription);
  subjectSelect.addEventListener('change', updateDescription);
  objectSelect.addEventListener('change', updateDescription);

  document.getElementById('desc-add-prop-btn').addEventListener('click', () => {
    const input = document.getElementById('desc-add-property');
    const val = input.value.trim();
    if (val && !descProperties.includes(val)) {
      descProperties.push(val);
      renderDescPropertyTags();
      updateDescription();
    }
    input.value = '';
    input.focus();
  });

  document.getElementById('desc-add-property').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('desc-add-prop-btn').click();
    }
  });

  // Initial render
  updateDescription();
}

function renderDescPropertyTags() {
  const container = document.getElementById('desc-property-tags');
  container.innerHTML = descProperties.map((p, i) =>
    `<span class="desc-tag">${escapeHtml(p)}<button class="desc-tag-remove" data-idx="${i}">&times;</button></span>`,
  ).join('');

  container.querySelectorAll('.desc-tag-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      descProperties.splice(Number(btn.dataset.idx), 1);
      renderDescPropertyTags();
      updateDescription();
    });
  });
}

function updateDescription() {
  const conceptId = document.getElementById('desc-concept').value;
  const conceptDef = DESC_HIERARCHY.find((c) => c.id === conceptId);
  if (!conceptDef) return;

  // Build the concept JSON-LD
  const concept = Fandaws.createConcept({
    id: conceptDef.id,
    label: conceptDef.label,
    prefLabel: conceptDef.prefLabel,
    broader: conceptDef.broader,
  });

  // Attach properties
  for (const prop of descProperties) {
    concept['rdfs:subClassOf'].push({
      '@type': 'owl:Restriction',
      'owl:onProperty': prop,
      'fandaws:restrictionKind': 'property',
    });
  }

  // Attach relationship if verb is set
  const verb = document.getElementById('desc-rel-verb').value.trim();
  const subjectIri = document.getElementById('desc-rel-subject').value;
  const objectIri = document.getElementById('desc-rel-object').value;
  let hasRelationship = false;

  if (verb) {
    concept['rdfs:subClassOf'].push({
      '@type': 'owl:Restriction',
      'owl:onProperty': verb,
      'owl:someValuesFrom': objectIri,
      'fandaws:attachedTo': subjectIri,
      'fandaws:restrictionKind': 'relationship',
    });
    hasRelationship = true;
  }

  // Build graph with all hierarchy concepts
  const graphConcepts = DESC_HIERARCHY.map((c) =>
    Fandaws.createConcept({
      id: c.id,
      label: c.label,
      prefLabel: c.prefLabel,
      broader: c.broader,
    }),
  );

  // Replace the target concept in graph with our modified version
  const idx = graphConcepts.findIndex((c) => c['@id'] === concept['@id']);
  if (idx !== -1) graphConcepts[idx] = concept;
  else graphConcepts.push(concept);

  const graph = Fandaws.createKnowledgeGraph({
    id: 'fandaws:graph/desc-demo',
    concepts: graphConcepts,
  });

  // Generate description
  const description = Fandaws.describeConcept(concept, graph);

  // Render description
  document.getElementById('desc-result-text').textContent = description;

  // Determine template used
  let templateName = 'Standard';
  if (!conceptDef.broader) {
    templateName = 'Root';
  } else if (hasRelationship && conceptDef.broader) {
    // Check if parent exists in graph
    const parentExists = DESC_HIERARCHY.some((c) => c.id === conceptDef.broader);
    if (parentExists) templateName = 'Process';
  }
  document.getElementById('desc-template-badge').textContent = templateName;

  // Render breakdown
  const breakdown = document.getElementById('desc-breakdown');
  const parts = [];

  parts.push({ label: 'Display Label', value: conceptDef.label });

  if (conceptDef.broader) {
    const parent = DESC_HIERARCHY.find((c) => c.id === conceptDef.broader);
    parts.push({ label: 'Parent', value: parent ? parent.label : conceptDef.broader });

    if (templateName === 'Standard') {
      const article = 'aeiou'.includes((parent?.label || '')[0]?.toLowerCase() || '') ? 'an' : 'a';
      parts.push({ label: 'Article', value: `"${article}"` });
    }
  } else {
    parts.push({ label: 'Parent', value: '(none — root concept)' });
  }

  if (descProperties.length > 0) {
    parts.push({ label: 'Properties', value: descProperties.join(', ') });
  }

  if (hasRelationship) {
    const subjectLabel = DESC_HIERARCHY.find((c) => c.id === subjectIri)?.label || subjectIri;
    const objectLabel = DESC_HIERARCHY.find((c) => c.id === objectIri)?.label || objectIri;
    parts.push({ label: 'Relationship', value: `${subjectLabel} ${verb} ${objectLabel}` });
  }

  breakdown.innerHTML = parts.map((p) =>
    `<div class="pipeline-step">
      <span class="step-label" style="min-width: 100px;">${escapeHtml(p.label)}</span>
      <span class="step-result step-result--changed">${escapeHtml(p.value)}</span>
    </div>`,
  ).join('');

  // Render JSON-LD
  document.getElementById('desc-json-output').textContent = JSON.stringify(concept, null, 2);
}

// ─────────────────────────────────────────────────────────
// Relationship Workflow Demo (Phase 9)
// ─────────────────────────────────────────────────────────

const REL_GRAPH_ID = 'fandaws:graph/rel-demo';
let relAdapter = null;

const REL_SCENARIOS = [
  {
    label: 'Basic: Dogs chase cats',
    setup: ['A dog is an animal', 'A cat is an animal'],
    utterance: 'A dog chases a cat',
  },
  {
    label: 'Verb normalization: chasing → chase',
    setup: [],
    utterance: 'Dogs chasing cats',
  },
  {
    label: 'Sub-relationship: dog eats meat (under animal eats food)',
    setup: ['An animal is an entity', 'A dog is an animal', 'Food is an entity', 'Meat is a food', 'An animal eats food'],
    utterance: 'A dog eats meat',
  },
  {
    label: 'Multiple relationships on one concept',
    setup: ['A dog is an animal', 'A cat is an animal', 'A home is an entity'],
    utterance: 'A dog guards a home',
    preRel: 'A dog chases a cat',
  },
];

function initRelationshipDemo() {
  const input = document.getElementById('rel-input');
  const sendBtn = document.getElementById('rel-send');
  const resetBtn = document.getElementById('rel-reset');
  const examplesEl = document.getElementById('rel-examples');
  if (!input) return;

  resetRelDemo();

  sendBtn.addEventListener('click', () => runRelDemo());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runRelDemo();
  });
  resetBtn.addEventListener('click', () => {
    resetRelDemo();
    document.getElementById('rel-stages').innerHTML =
      '<div style="color: var(--text-muted);">Graph reset. Type a relationship and click Run.</div>';
    document.getElementById('rel-graph-state').textContent = 'Empty graph — no concepts yet.';
  });

  examplesEl.innerHTML = REL_SCENARIOS.map((sc, i) =>
    `<button class="desc-example-btn" data-idx="${i}">${escapeHtml(sc.label)}</button>`,
  ).join('');

  examplesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.desc-example-btn');
    if (!btn) return;
    const sc = REL_SCENARIOS[Number(btn.dataset.idx)];
    if (!sc) return;

    resetRelDemo();

    // Run setup utterances through orchestrator
    const orchestrator = new Fandaws.SynchronousOrchestrationAdapter();
    const context = { stateAdapter: relAdapter, graphId: REL_GRAPH_ID };
    for (const u of sc.setup) {
      orchestrator.runPipeline(u, context);
    }
    if (sc.preRel) {
      orchestrator.runPipeline(sc.preRel, context);
    }

    document.getElementById('rel-input').value = sc.utterance;
    runRelDemo();
  });
}

function resetRelDemo() {
  relAdapter = new Fandaws.InMemoryStateAdapter();
  relAdapter.saveGraph(REL_GRAPH_ID, Fandaws.createKnowledgeGraph({ id: REL_GRAPH_ID, concepts: [] }));
}

function runRelDemo() {
  const input = document.getElementById('rel-input').value.trim();
  if (!input) return;

  const stages = document.getElementById('rel-stages');
  stages.innerHTML = '';

  const context = { stateAdapter: relAdapter, graphId: REL_GRAPH_ID };

  // Stage 1: Parse
  let parseResult;
  try {
    parseResult = Fandaws.parse(input);
    addStage(stages, '1. Parse', parseResult
      ? `subject: "${parseResult['fandaws:subject']}", verb: "${parseResult['fandaws:predicate']}", object: "${parseResult['fandaws:object']}"`
      : 'Parse failed', !parseResult);
  } catch (e) {
    addStage(stages, '1. Parse', `Error: ${e.message}`, true);
    return;
  }
  if (!parseResult) return;

  // Stage 2: Classify
  const action = Fandaws.classify(parseResult);
  const workflow = action['fandaws:workflow'];
  addStage(stages, '2. Classify', `workflow: ${workflow}`, workflow !== 'customRelationship');
  if (workflow !== 'customRelationship') {
    addStage(stages, '', `This demo handles relationship statements (e.g. "A dog chases a cat"). Try a verb other than "is/has".`, true);
    return;
  }

  // Stage 3: Run relationship pipeline
  const result = Fandaws.runRelationshipPipeline(input, context);

  if (result.normalizedVerb) {
    const rawVerb = action['fandaws:verb'] || parseResult['fandaws:predicate'] || '';
    const note = rawVerb !== result.normalizedVerb ? ` (${rawVerb} → ${result.normalizedVerb})` : '';
    addStage(stages, '3. Normalize Verb', `${result.normalizedVerb}${note}`, false);
  }

  if (result.success && result.mutation) {
    const additions = result.mutation['fandaws:additions'] || [];
    const newConcepts = additions.filter((n) => Array.isArray(n['@type']));
    const relNodes = additions.filter((n) => n['fandaws:restrictionKind'] === 'relationship');
    const relNode = relNodes[0];

    addStage(stages, '4. Mutation', `${newConcepts.length} new concept(s), ${relNodes.length} relationship(s)`, false);

    if (relNode) {
      const attachedTo = relNode['fandaws:attachedTo'] || '?';
      const objectIri = relNode['owl:someValuesFrom'] || '?';
      const subRef = relNode['fandaws:subRestrictionOf'];
      const subNote = subRef ? ` (sub-restriction of ${subRef})` : '';
      addStage(stages, '5. Relationship', `${attachedTo.split('/').pop()} --[${relNode['owl:onProperty']}]--> ${objectIri.split('/').pop()}${subNote}`, false);
    }

    if (result.descriptions?.length > 0) {
      const descText = result.descriptions.map((d) => `${d.conceptIri.split('/').pop()}: "${d.description}"`).join('\n');
      addStage(stages, '6. Descriptions', descText, false);
    }

    addStage(stages, 'Mutation JSON-LD', JSON.stringify(result.mutation, null, 2), false, true);
  } else if (result.error) {
    addStage(stages, '4. Error', result.errorReason || 'unknown', true);
  }

  updateRelGraphState();
}

function updateRelGraphState() {
  const graph = relAdapter.loadGraph(REL_GRAPH_ID);
  const concepts = graph?.['fandaws:concepts'] || [];
  const display = document.getElementById('rel-graph-state');

  if (concepts.length === 0) {
    display.textContent = 'Empty graph — no concepts yet.';
    return;
  }

  const roots = concepts.filter((c) => !c['skos:broader']);
  const byParent = new Map();
  for (const c of concepts) {
    const parent = c['skos:broader'] || '__root__';
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(c);
  }

  function annot(concept) {
    const subs = concept['rdfs:subClassOf'] || [];
    const rels = subs
      .filter((r) => r['fandaws:restrictionKind'] === 'relationship')
      .map((r) => {
        const obj = r['owl:someValuesFrom'] || '?';
        const objLabel = concepts.find((c) => c['@id'] === obj)?.['rdfs:label'] || obj.split('/').pop();
        return `${r['owl:onProperty']} → ${objLabel}`;
      });
    const props = subs
      .filter((r) => r['fandaws:restrictionKind'] === 'property')
      .map((r) => r['owl:onProperty']);
    const parts = [];
    if (props.length > 0) parts.push(props.join(', '));
    if (rels.length > 0) parts.push(rels.join(', '));
    return parts.length > 0 ? `  [${parts.join(' | ')}]` : '';
  }

  const lines = [];
  function renderTree(iri, depth) {
    const children = byParent.get(iri) || [];
    for (const child of children) {
      const prefix = '  '.repeat(depth - 1) + '\u2514\u2500 ';
      lines.push(`${prefix}${child['rdfs:label']}${annot(child)}`);
      renderTree(child['@id'], depth + 1);
    }
  }

  for (const root of roots) {
    lines.push(`${root['rdfs:label']}${annot(root)}`);
    renderTree(root['@id'], 1);
  }

  display.textContent = `${concepts.length} concept(s):\n\n${lines.join('\n')}`;
}

// ─────────────────────────────────────────────────────────
// Conversation Demo (Phase 8)
// ─────────────────────────────────────────────────────────

const CONV_GRAPH_ID = 'fandaws:graph/conversation';
let convAdapter = null;
let convOrchestrator = null;
let convTurnCount = 0;
let convPendingUtterance = null;
let convScopeDecisions = new Map();

const CONV_SCENARIOS = [
  { label: 'Build taxonomy: dog → animal', utterances: ['A dog is an animal', 'A cat is an animal', 'A poodle is a dog'] },
  { label: 'Add properties: dog has fur', utterances: ['A dog is an animal', 'A dog has fur'] },
  { label: 'Relationships: dog chases cat', utterances: ['A dog is an animal', 'A cat is an animal', 'A dog chases a cat'] },
  { label: 'Full scenario: taxonomy + properties + relationships', utterances: ['A dog is an animal', 'A cat is an animal', 'A dog has fur', 'A dog chases a cat'] },
  { label: 'Error: circular classification', utterances: ['A dog is an animal', 'An animal is a dog'] },
];

function initConversationDemo() {
  const input = document.getElementById('conv-input');
  const sendBtn = document.getElementById('conv-send');
  const resetBtn = document.getElementById('conv-reset');
  const examplesEl = document.getElementById('conv-examples');
  if (!input) return;

  resetConversation();

  sendBtn.addEventListener('click', () => sendConversation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendConversation();
  });
  resetBtn.addEventListener('click', () => {
    resetConversation();
    document.getElementById('conv-log').innerHTML =
      '<div style="color: var(--text-muted);">Graph reset. Type an utterance and click Send.</div>';
    document.getElementById('conv-graph-state').textContent = 'Empty graph — no concepts yet.';
  });

  // Render scenario buttons
  examplesEl.innerHTML = CONV_SCENARIOS.map((sc, i) =>
    `<button class="desc-example-btn" data-idx="${i}">${escapeHtml(sc.label)}</button>`,
  ).join('');

  examplesEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.desc-example-btn');
    if (!btn) return;
    const sc = CONV_SCENARIOS[Number(btn.dataset.idx)];
    if (!sc) return;

    resetConversation();
    document.getElementById('conv-log').innerHTML = '';

    for (const utterance of sc.utterances) {
      document.getElementById('conv-input').value = utterance;
      sendConversation();
    }
  });
}

function resetConversation() {
  convAdapter = new Fandaws.InMemoryStateAdapter();
  convAdapter.saveGraph(CONV_GRAPH_ID, Fandaws.createKnowledgeGraph({ id: CONV_GRAPH_ID, concepts: [] }));
  convOrchestrator = new Fandaws.SynchronousOrchestrationAdapter();
  convTurnCount = 0;
  convPendingUtterance = null;
  convScopeDecisions = new Map();
  document.getElementById('conv-scope-prompts').innerHTML = '';
}

function sendConversation() {
  const input = document.getElementById('conv-input');
  const utterance = input.value.trim();
  if (!utterance) return;

  const log = document.getElementById('conv-log');
  const promptArea = document.getElementById('conv-scope-prompts');

  // Clear previous prompts if this is a new utterance
  if (utterance !== convPendingUtterance) {
    convScopeDecisions = new Map();
    convPendingUtterance = null;
  }
  promptArea.innerHTML = '';

  convTurnCount++;
  const context = { stateAdapter: convAdapter, graphId: CONV_GRAPH_ID };
  const options = convScopeDecisions.size > 0 ? { scopeDecisions: convScopeDecisions } : {};

  const result = convOrchestrator.runPipeline(utterance, context, options);

  // Add user turn to log
  if (convPendingUtterance !== utterance) {
    const userDiv = document.createElement('div');
    userDiv.className = 'pipeline-step';
    userDiv.innerHTML = `<span class="step-number">${convTurnCount}</span><span class="step-label" style="min-width: 50px; color: var(--accent);">You</span><span class="step-result" style="color: var(--text-primary);">${escapeHtml(utterance)}</span>`;
    log.appendChild(userDiv);
  }

  // Determine workflow used
  const workflow = result.classificationAction
    ? result.classificationAction['fandaws:workflow']
    : result.propertyAction
      ? 'property'
      : result.parseResult?.['fandaws:verbType'] || '?';

  // Add system response
  const sysDiv = document.createElement('div');
  sysDiv.className = 'pipeline-step';

  if (result.prompts && result.prompts.length > 0 && !result.success && !result.error) {
    // Scope narrowing prompts
    const pipelineLabel = `[${workflow}]`;
    sysDiv.innerHTML = `<span class="step-label" style="min-width: 50px; color: var(--text-muted);">Sys</span><span class="step-result step-result--changed">${escapeHtml(pipelineLabel)} Scope narrowing: answer below</span>`;
    log.appendChild(sysDiv);

    // Render scope prompts
    convPendingUtterance = utterance;
    for (const prompt of result.prompts) {
      const text = prompt['fandaws:text'] || 'Scope question';
      const ctx = prompt['fandaws:context'] || {};
      const conceptIri = ctx.conceptIri || '';
      const div = document.createElement('div');
      div.className = 'card';
      div.style.cssText = 'margin-bottom: 8px; padding: 12px;';
      div.innerHTML = `
        <p style="margin-bottom: 8px; color: var(--accent);">${escapeHtml(text)}</p>
        <button class="btn btn--primary conv-scope-btn" data-iri="${escapeHtml(conceptIri)}" data-answer="true" style="margin-right: 8px;">Yes</button>
        <button class="btn conv-scope-btn" data-iri="${escapeHtml(conceptIri)}" data-answer="false" style="background: var(--surface-alt); border: 1px solid var(--border);">No</button>
      `;
      promptArea.appendChild(div);
    }

    promptArea.querySelectorAll('.conv-scope-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        convScopeDecisions.set(btn.dataset.iri, btn.dataset.answer === 'true');
        sendConversation();
      });
    });
  } else if (result.success) {
    const conceptCount = (result.graph?.['fandaws:concepts'] || []).length;
    const mutationNote = result.mutation ? 'graph updated' : 'no-op (idempotent)';
    const descNote = result.descriptions?.length > 0
      ? ` — "${result.descriptions[0].description}"`
      : '';
    sysDiv.innerHTML = `<span class="step-label" style="min-width: 50px; color: var(--text-muted);">Sys</span><span class="step-result step-result--changed">[${escapeHtml(workflow)}] ${escapeHtml(mutationNote)}, ${conceptCount} concept(s)${escapeHtml(descNote)}</span>`;
    log.appendChild(sysDiv);
    convPendingUtterance = null;
    convScopeDecisions = new Map();
    input.value = '';
  } else {
    sysDiv.innerHTML = `<span class="step-label" style="min-width: 50px; color: var(--text-muted);">Sys</span><span class="step-result" style="color: #f87171;">[${escapeHtml(workflow)}] Error: ${escapeHtml(result.errorReason || 'unknown')}</span>`;
    log.appendChild(sysDiv);
    convPendingUtterance = null;
    convScopeDecisions = new Map();
  }

  // Scroll log to bottom
  log.scrollTop = log.scrollHeight;

  // Update graph state display
  updateConvGraphState();
}

function updateConvGraphState() {
  const graph = convAdapter.loadGraph(CONV_GRAPH_ID);
  const concepts = graph?.['fandaws:concepts'] || [];
  const display = document.getElementById('conv-graph-state');

  if (concepts.length === 0) {
    display.textContent = 'Empty graph — no concepts yet.';
    return;
  }

  // Build a compact tree view
  const roots = concepts.filter((c) => !c['skos:broader']);
  const byParent = new Map();
  for (const c of concepts) {
    const parent = c['skos:broader'] || '__root__';
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(c);
  }

  function conceptAnnotations(concept) {
    const subs = concept['rdfs:subClassOf'] || [];
    const props = subs
      .filter((r) => r['fandaws:restrictionKind'] === 'property')
      .map((r) => r['owl:onProperty']);
    const rels = subs
      .filter((r) => r['fandaws:restrictionKind'] === 'relationship')
      .map((r) => {
        const obj = r['owl:someValuesFrom'] || '?';
        const objLabel = concepts.find((c) => c['@id'] === obj)?.['rdfs:label'] || obj.split('/').pop();
        return `${r['owl:onProperty']} → ${objLabel}`;
      });
    const parts = [];
    if (props.length > 0) parts.push(props.join(', '));
    if (rels.length > 0) parts.push(rels.join(', '));
    return parts.length > 0 ? `  [${parts.join(' | ')}]` : '';
  }

  const lines = [];
  function renderTree(iri, depth) {
    const children = byParent.get(iri) || [];
    for (const child of children) {
      const prefix = depth === 0 ? '' : '  '.repeat(depth - 1) + '\u2514\u2500 ';
      lines.push(`${prefix}${child['rdfs:label']}${conceptAnnotations(child)}`);
      renderTree(child['@id'], depth + 1);
    }
  }

  // Render roots first, then recurse
  for (const root of roots) {
    lines.push(`${root['rdfs:label']}${conceptAnnotations(root)}`);
    renderTree(root['@id'], 1);
  }

  display.textContent = `${concepts.length} concept(s):\n\n${lines.join('\n')}`;
}

// ─────────────────────────────────────────────────────────
// Export Demo (Phase 10)
// ─────────────────────────────────────────────────────────

function buildExportGraph() {
  const BFO_MATERIAL = 'bfo:BFO_0000040';
  const entity = Fandaws.createConcept({ id: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', label: 'Entity', prefLabel: 'entity', bfoMapping: 'bfo:BFO_0000001' });
  const living = Fandaws.createConcept({ id: 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', label: 'Living Thing', prefLabel: 'living thing', broader: 'fandaws:class/d0327e06-5470-5b21-85ca-12f8915c8967/entity', bfoMapping: BFO_MATERIAL });
  const animal = Fandaws.createConcept({ id: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', label: 'Animal', prefLabel: 'animal', broader: 'fandaws:class/bd079fd1-5b5c-59be-9590-6ee2649e5fc6/living-thing', definition: 'Animal is a Living Thing.', bfoMapping: BFO_MATERIAL });
  const dog = Fandaws.createConcept({ id: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', label: 'Dog', prefLabel: 'dog', broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', definition: 'Dog is an Animal that has fur.', bfoMapping: BFO_MATERIAL });
  const cat = Fandaws.createConcept({ id: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', label: 'Cat', prefLabel: 'cat', broader: 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', definition: 'Cat is an Animal that has whiskers.', bfoMapping: BFO_MATERIAL });

  // Add property to dog (restriction IRI follows fandaws:restriction/{uuid5}/{concept}--{prop} format)
  const furProp = Fandaws.createProperty({ id: 'fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur', propertyIri: 'fur', attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', value: 'yes' });
  dog['rdfs:subClassOf'].push(furProp);

  // Add property to cat
  const whiskersProp = Fandaws.createProperty({ id: 'fandaws:restriction/b43ef6bb-6e59-5ca6-b599-8375e8d85550/cat--whiskers', propertyIri: 'whiskers', attachedTo: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', value: 'yes' });
  cat['rdfs:subClassOf'].push(whiskersProp);

  // Add relationship: dog chases cat
  const chaseRel = Fandaws.createRelationship({ id: 'fandaws:rel/5871e405-5c67-5f25-b3bb-4be118e09176/dog--chase--cat', verbIri: 'chase', subject: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', object: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat' });
  dog['rdfs:subClassOf'].push(chaseRel);

  return Fandaws.createKnowledgeGraph({ id: 'fandaws:graph/export-demo', concepts: [entity, living, animal, dog, cat] });
}

function initExportDemo() {
  const formatSelect = document.getElementById('export-format');
  const runBtn = document.getElementById('export-run');
  const copyBtn = document.getElementById('export-copy');
  const outputEl = document.getElementById('export-output');
  const graphInfoEl = document.getElementById('export-graph-info');
  if (!runBtn) return;

  const graph = buildExportGraph();

  // Show graph info
  const concepts = graph['fandaws:concepts'] || [];
  const lines = concepts.map(c => {
    const parent = c['skos:broader'] ? ` → ${c['skos:broader'].split('/').pop()}` : ' (root)';
    const restrictions = (c['rdfs:subClassOf'] || []);
    const props = restrictions.filter(r => r['fandaws:restrictionKind'] === 'property').map(r => r['owl:onProperty']);
    const rels = restrictions.filter(r => r['fandaws:restrictionKind'] === 'relationship').map(r => `${r['owl:onProperty']} → ${r['owl:someValuesFrom'].split('/').pop()}`);
    let info = `${c['rdfs:label']}${parent}`;
    if (props.length) info += ` [props: ${props.join(', ')}]`;
    if (rels.length) info += ` [rels: ${rels.join(', ')}]`;
    return info;
  });
  graphInfoEl.textContent = `${concepts.length} concepts:\n${lines.join('\n')}`;

  runBtn.addEventListener('click', () => {
    const format = formatSelect.value;
    try {
      const result = Fandaws.exportGraph(graph, { format });
      outputEl.textContent = result;
    } catch (e) {
      outputEl.textContent = `Error: ${e.message}`;
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = outputEl.textContent;
    if (text && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 1500);
      });
    }
  });
}

// ─────────────────────────────────────────────────────────
// Initialize
// ─────────────────────────────────────────────────────────

loadRoadmap();
loadTestResults();
buildCorpusTable();
renderFactoryParams();
runPipeline();
initPropertyDemo();
initDescriptionDemo();
initRelationshipDemo();
initExportDemo();
initConversationDemo();
