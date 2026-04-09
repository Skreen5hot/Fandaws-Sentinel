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
      `Property "${attachment?.['fandaws:propertyLabel'] || attachment?.['owl:onProperty']}" added as ${attachment?.['@id']}`,
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
      'fandaws:propertyLabel': prop,
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

  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  const lines = [];
  function renderTree(iri, depth) {
    const children = byParent.get(iri) || [];
    for (const child of children) {
      const prefix = '  '.repeat(depth - 1) + '\u2514\u2500 ';
      lines.push(`${prefix}${cap(child['rdfs:label'])}${annot(child)}`);
      renderTree(child['@id'], depth + 1);
    }
  }

  for (const root of roots) {
    lines.push(`${cap(root['rdfs:label'])}${annot(root)}`);
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
let convPendingOptions = {};

const CONV_SCENARIOS = [
  { label: 'Build taxonomy: dog → animal', utterances: ['A dog is an animal', 'A cat is an animal', 'A poodle is a dog'] },
  { label: 'Add properties: dog has fur', utterances: ['A dog is an animal', 'A dog has fur'] },
  { label: 'Relationships: dog chases cat', utterances: ['A dog is an animal', 'A cat is an animal', 'A dog chases a cat'] },
  { label: 'Full scenario: taxonomy + properties + relationships', utterances: ['A dog is an animal', 'A cat is an animal', 'A dog has fur', 'A dog chases a cat'] },
  { label: 'Homonym detection: mouse (animal vs device)', utterances: ['A rodent is an animal', 'A mouse is a rodent', 'A device is a technology', 'A mouse is a device'] },
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
  convPendingOptions = {};
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
    convPendingOptions = {};
    convPendingUtterance = null;
  }
  promptArea.innerHTML = '';

  convTurnCount++;
  const context = { stateAdapter: convAdapter, graphId: CONV_GRAPH_ID };
  const options = { ...convPendingOptions };
  if (convScopeDecisions.size > 0) options.scopeDecisions = convScopeDecisions;

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
    const promptType = result.prompts[0]['fandaws:promptType'] || 'scopeNarrowing';
    const pipelineLabel = `[${workflow}]`;
    convPendingUtterance = utterance;

    if (promptType === 'reclassificationConfirmation') {
      // ── Reclassification confirmation prompt ──
      const prompt = result.prompts[0];
      const text = prompt['fandaws:text'] || 'Confirm reclassification?';
      sysDiv.innerHTML = `<span class="step-label" style="min-width: 50px; color: var(--text-muted);">Sys</span><span class="step-result step-result--changed">${escapeHtml(pipelineLabel)} ${escapeHtml(text)}</span>`;
      log.appendChild(sysDiv);

      const div = document.createElement('div');
      div.className = 'card';
      div.style.cssText = 'margin-bottom: 8px; padding: 12px;';
      div.innerHTML = `
        <p style="margin-bottom: 8px; color: var(--accent);">Reclassification detected across distant branches</p>
        <button class="btn btn--primary conv-reclass-btn" data-action="move" style="margin-right: 8px;">Same concept &mdash; move it</button>
        <button class="btn conv-reclass-btn" data-action="cancel" style="background: var(--surface-alt); border: 1px solid var(--border);">Cancel</button>
      `;
      promptArea.appendChild(div);

      promptArea.querySelectorAll('.conv-reclass-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          convPendingOptions = { reclassificationConfirmed: btn.dataset.action };
          sendConversation();
        });
      });
    } else if (promptType === 'homonymDisambiguation') {
      // ── Homonym disambiguation prompt ──
      const prompt = result.prompts[0];
      const text = prompt['fandaws:text'] || 'Which did you mean?';
      const ctx = prompt['fandaws:context'] || {};
      const candidates = ctx.candidates || [];
      const promptOptions = prompt['fandaws:options'] || [];
      sysDiv.innerHTML = `<span class="step-label" style="min-width: 50px; color: var(--text-muted);">Sys</span><span class="step-result step-result--changed">${escapeHtml(pipelineLabel)} ${escapeHtml(text)}</span>`;
      log.appendChild(sysDiv);

      const div = document.createElement('div');
      div.className = 'card';
      div.style.cssText = 'margin-bottom: 8px; padding: 12px;';
      let btns = candidates.map((iri, i) =>
        `<button class="btn btn--primary conv-disambig-btn" data-iri="${escapeHtml(iri)}" style="margin-right: 8px; margin-bottom: 4px;">${escapeHtml(promptOptions[i] || iri.split('/').pop())}</button>`,
      ).join('');
      div.innerHTML = `<p style="margin-bottom: 8px; color: var(--accent);">${escapeHtml(text)}</p>${btns}`;
      promptArea.appendChild(div);

      promptArea.querySelectorAll('.conv-disambig-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          convPendingOptions = { resolvedConceptIri: btn.dataset.iri };
          sendConversation();
        });
      });
    } else {
      // ── Scope narrowing prompts ──
      sysDiv.innerHTML = `<span class="step-label" style="min-width: 50px; color: var(--text-muted);">Sys</span><span class="step-result step-result--changed">${escapeHtml(pipelineLabel)} Scope narrowing: answer below</span>`;
      log.appendChild(sysDiv);

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
    }
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
    convPendingOptions = {};
    input.value = '';
  } else {
    sysDiv.innerHTML = `<span class="step-label" style="min-width: 50px; color: var(--text-muted);">Sys</span><span class="step-result" style="color: #f87171;">[${escapeHtml(workflow)}] Error: ${escapeHtml(result.errorReason || 'unknown')}</span>`;
    log.appendChild(sysDiv);
    convPendingUtterance = null;
    convScopeDecisions = new Map();
    convPendingOptions = {};
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
      .map((r) => r['fandaws:propertyLabel'] || r['owl:onProperty']);
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

  // Add property to dog (with ERS register annotation)
  const furProp = Fandaws.createProperty({ id: 'fandaws:restriction/56de7457-e37d-5b39-80ff-ce18950fce9b/dog--fur', verbIri: 'fandaws:property/has', verbLabel: 'has', objectConceptIri: 'fandaws:class/ab397d07-2a1c-5b3f-9672-8aaaebde07da/fur', propertyLabel: 'fur', attachedTo: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', value: 'yes', epistemicRegister: Fandaws.REGISTERS.NORMATIVE });
  dog['rdfs:subClassOf'].push(furProp);

  // Add property to cat
  const whiskersProp = Fandaws.createProperty({ id: 'fandaws:restriction/b43ef6bb-6e59-5ca6-b599-8375e8d85550/cat--whiskers', verbIri: 'fandaws:property/has', verbLabel: 'has', objectConceptIri: 'fandaws:class/c7f5a8e1-9d3b-5e4a-b2c1-d6e8f0a7b934/whiskers', propertyLabel: 'whiskers', attachedTo: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', value: 'yes', epistemicRegister: Fandaws.REGISTERS.NORMATIVE });
  cat['rdfs:subClassOf'].push(whiskersProp);

  // Add relationship: dog chases cat (with ERS register annotation)
  const chaseRel = Fandaws.createRelationship({ id: 'fandaws:rel/5871e405-5c67-5f25-b3bb-4be118e09176/dog--chase--cat', verbIri: 'chase', subject: 'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', object: 'fandaws:class/a09765eb-966f-5fea-b075-eb384156de41/cat', epistemicRegister: Fandaws.REGISTERS.NORMATIVE });
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
    const props = restrictions.filter(r => r['fandaws:restrictionKind'] === 'property').map(r => {
      const reg = r['fandaws:epistemicRegister'];
      const regTag = reg ? ` (${reg.split('/').pop()})` : '';
      return `${r['owl:onProperty']}${regTag}`;
    });
    const rels = restrictions.filter(r => r['fandaws:restrictionKind'] === 'relationship').map(r => {
      const reg = r['fandaws:epistemicRegister'];
      const regTag = reg ? ` (${reg.split('/').pop()})` : '';
      return `${r['owl:onProperty']} → ${r['owl:someValuesFrom'].split('/').pop()}${regTag}`;
    });
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
// ERS Routing Demo (Phase 10b)
// ─────────────────────────────────────────────────────────

const ERS_SCENARIOS = [
  {
    label: 'Triangle has three sides',
    bfo: 'bfo:BFO_0000006', property: 'has_sides', utterance: '', domain: '', bearer: false,
    note: 'SpatialRegion → R1 Axiomatic',
  },
  {
    label: 'Dogs have fur',
    bfo: 'bfo:BFO_0000040', property: 'fur', utterance: '', domain: '', bearer: false,
    note: 'MaterialEntity → R2 Normative',
  },
  {
    label: 'Doctors diagnose diseases',
    bfo: 'bfo:BFO_0000023', property: 'diagnoses', utterance: '', domain: '', bearer: false,
    note: 'Role + behavioral → R2 + sensitivity flag',
  },
  {
    label: 'Doctors have two arms',
    bfo: 'bfo:BFO_0000023', property: 'has_arm', utterance: '', domain: '', bearer: true,
    note: 'Role + structural → Bearer retarget → R2',
  },
  {
    label: 'Teachers should educate',
    bfo: 'bfo:BFO_0000023', property: 'educates', utterance: 'Teachers should educate', domain: '', bearer: false,
    note: 'Role + teleological "should" → R2 + flag',
  },
  {
    label: 'Judges ought to be impartial',
    bfo: 'bfo:BFO_0000023', property: 'adjudicates', utterance: 'Judges ought to be impartial', domain: '', bearer: false,
    note: 'Role + deontic "ought" → R2 + deontic flag',
  },
  {
    label: 'Dog in geometry session',
    bfo: 'bfo:BFO_0000040', property: 'has_fur', utterance: '', domain: 'geometry', bearer: false,
    note: 'BFO overrides session domain (ERS-17 fix)',
  },
  {
    label: 'Unknown concept → fallback',
    bfo: '', property: 'stuff', utterance: '', domain: '', bearer: false,
    note: 'No BFO, no session → R2 via fallback',
  },
];

const BFO_LABEL_MAP = {
  'bfo:BFO_0000040': 'MaterialEntity',
  'bfo:BFO_0000006': 'SpatialRegion',
  'bfo:BFO_0000023': 'Role',
  'bfo:BFO_0000015': 'Process',
  'bfo:BFO_0000019': 'Quality',
  'bfo:BFO_0000016': 'Disposition',
  'bfo:BFO_0000034': 'Function',
  'bfo:BFO_0000031': 'GDC',
  'bfo:BFO_0000008': 'TemporalRegion',
};

function initErsDemo() {
  const scenariosEl = document.getElementById('ers-scenarios');
  if (!scenariosEl) return;

  // Render scenario buttons
  scenariosEl.innerHTML = ERS_SCENARIOS.map((sc, i) =>
    `<button class="desc-example-btn" data-idx="${i}"><strong>${escapeHtml(sc.label)}</strong> — <span style="color: var(--text-muted);">${escapeHtml(sc.note)}</span></button>`,
  ).join('');

  scenariosEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.desc-example-btn');
    if (!btn) return;
    const sc = ERS_SCENARIOS[Number(btn.dataset.idx)];
    if (!sc) return;

    document.getElementById('ers-bfo').value = sc.bfo;
    document.getElementById('ers-property').value = sc.property;
    document.getElementById('ers-utterance').value = sc.utterance;
    document.getElementById('ers-domain').value = sc.domain;
    document.getElementById('ers-bearer').value = sc.bearer ? 'materialEntity' : '';
    runErsRouting();
  });

  document.getElementById('ers-route')?.addEventListener('click', runErsRouting);
  document.getElementById('ers-override-btn')?.addEventListener('click', runErsOverride);
}

function runErsRouting() {
  const bfo = document.getElementById('ers-bfo').value;
  const property = document.getElementById('ers-property').value.trim() || 'unknown';
  const utterance = document.getElementById('ers-utterance').value.trim() || null;
  const domain = document.getElementById('ers-domain').value.trim() || null;
  const hasBearer = document.getElementById('ers-bearer').value === 'materialEntity';

  // Build a minimal graph with one concept
  const conceptId = 'fandaws:class/ers-demo/subject';
  const bearerId = 'fandaws:class/ers-demo/bearer';
  const concept = Fandaws.createConcept({ id: conceptId, label: 'Subject', prefLabel: 'subject' });

  if (bfo) {
    concept['rdfs:subClassOf'].push(bfo);
  }

  const concepts = [concept];

  // If bearer retarget is requested, add a MaterialEntity parent
  if (hasBearer && bfo === 'bfo:BFO_0000023') {
    const bearer = Fandaws.createConcept({ id: bearerId, label: 'Bearer', prefLabel: 'bearer' });
    bearer['rdfs:subClassOf'].push('bfo:BFO_0000040');
    concepts.push(bearer);
    concept['skos:broader'] = bearerId;
  }

  const graph = Fandaws.createKnowledgeGraph({ id: 'fandaws:graph/ers-demo', concepts });

  // Build restriction
  const restriction = {
    '@id': `fandaws:property/ers-demo/${property}`,
    '@type': 'owl:Restriction',
    'owl:onProperty': property,
    'fandaws:attachedTo': conceptId,
    'fandaws:restrictionKind': 'property',
  };

  // Build context
  const context = { graph, utterance };
  if (domain) {
    context.session = { 'fandaws:domain': domain };
  }

  // Route
  const result = Fandaws.routeToRegister(restriction, context);

  // Display result
  renderErsResult(result, bfo, domain, utterance);
}

function renderErsResult(result, bfo, domain, utterance) {
  if (!result) {
    document.getElementById('ers-result-badge').innerHTML =
      '<span style="color: var(--text-muted);">ERS disabled (config gate)</span>';
    return;
  }

  // Register badge
  const registerName = result.register.split('/').pop();
  const badgeClass = `register-badge--${registerName}`;
  const registerLabel = registerName === 'axiomatic' ? 'R1 Axiomatic' : registerName === 'normative' ? 'R2 Normative' : 'R3 Aspirational';
  const method = result.routingRecord['fandaws:routingMethod'].split('/').pop().toUpperCase();
  const trigger = result.routingRecord['fandaws:trigger'] || '';

  document.getElementById('ers-result-badge').innerHTML =
    `<span class="register-badge ${badgeClass}">${escapeHtml(registerLabel)}</span>` +
    `<span style="margin-left: 12px; font-size: 0.82rem; color: var(--text-muted);">Method: ${escapeHtml(method)} | Trigger: ${escapeHtml(trigger)}</span>`;

  // Pipeline trace
  const bfoLabel = bfo ? BFO_LABEL_MAP[bfo] || bfo : null;
  const trace = buildPipelineTrace(result, bfoLabel, domain, utterance);
  document.getElementById('ers-pipeline-trace').innerHTML = trace;

  // Flags
  const flagsEl = document.getElementById('ers-flags');
  if (result.flags.length > 0) {
    flagsEl.innerHTML = result.flags.map((f) =>
      `<span class="badge badge--yellow" style="margin-right: 6px;">${escapeHtml(f)}</span>`,
    ).join('');
  } else {
    flagsEl.textContent = 'None';
  }

  // Routing record JSON-LD
  document.getElementById('ers-routing-record').textContent =
    JSON.stringify(result.routingRecord, null, 2);
}

function buildPipelineTrace(result, bfoLabel, domain, utterance) {
  const method = result.routingRecord['fandaws:routingMethod'];
  const register = result.register;
  const registerShort = register.split('/').pop();

  const steps = [];

  // Step 1: APS
  steps.push({ num: 1, name: 'APS Precedent', cls: 'skip', text: 'skipped (stub)' });

  // Step 2: Session Domain
  if (domain) {
    const axiomaticDomains = Fandaws.AXIOMATIC_DOMAINS || ['mathematics', 'geometry', 'logic', 'set theory'];
    const isAxiomatic = axiomaticDomains.includes(domain.toLowerCase());
    const candidateReg = isAxiomatic ? 'R1' : 'R2';
    if (method === 'fandaws:method/domain') {
      steps.push({ num: 2, name: 'Session Domain', cls: 'match', text: `MATCH: ${domain} → ${candidateReg} ${registerShort}` });
    } else {
      steps.push({ num: 2, name: 'Session Domain', cls: 'skip', text: `candidate: ${candidateReg} (${domain}) — overridden by BFO` });
    }
  } else {
    steps.push({ num: 2, name: 'Session Domain', cls: 'skip', text: 'skipped (no session)' });
  }

  // Step 3: BFO Alignment
  if (method === 'fandaws:method/structural') {
    const retarget = result.flags.includes('bearer-retarget') ? ' (Bearer retarget)' : '';
    const sensitivity = result.flags.includes('role-heightened-sensitivity') ? ' + heightened sensitivity' : '';
    steps.push({ num: 3, name: 'BFO Alignment', cls: 'match', text: `MATCH: ${bfoLabel || 'BFO'} → ${registerShort === 'axiomatic' ? 'R1' : 'R2'}${retarget}${sensitivity}` });
  } else if (bfoLabel) {
    steps.push({ num: 3, name: 'BFO Alignment', cls: 'skip', text: `no match (${bfoLabel})` });
  } else {
    steps.push({ num: 3, name: 'BFO Alignment', cls: 'skip', text: 'skipped (no BFO category)' });
  }

  // Step 4: Domain Whitelist (property-level — stub, deferred to Phase 14+)
  steps.push({ num: 4, name: 'Domain Whitelist', cls: 'skip', text: 'skipped (stub — Phase 14+)' });

  // Step 5: Teleological
  if (result.flags.includes('teleological-signal')) {
    const keywords = [];
    if (utterance) {
      const teleResult = Fandaws.detectTeleological(utterance);
      if (teleResult.keywords.length) keywords.push(...teleResult.keywords);
    }
    const kwText = keywords.length > 0 ? ` "${keywords.join('", "')}"` : '';
    const deontic = result.flags.includes('deontic-role-definition') ? ' + deontic-role-definition' : '';
    steps.push({ num: 5, name: 'Teleological', cls: 'flag', text: `FLAG:${kwText} detected${deontic}` });
  } else if (utterance) {
    steps.push({ num: 5, name: 'Teleological', cls: 'skip', text: 'skipped (no keywords)' });
  } else {
    steps.push({ num: 5, name: 'Teleological', cls: 'skip', text: 'skipped (no utterance)' });
  }

  // Step 6: Fallback
  if (method === 'fandaws:method/fallback') {
    steps.push({ num: 6, name: 'Fallback', cls: 'match', text: 'MATCH: R2 Normative (default)' });
  } else {
    steps.push({ num: 6, name: 'Fallback', cls: 'skip', text: `skipped (resolved at Step ${method === 'fandaws:method/structural' ? '3' : '2'})` });
  }

  return steps.map((s) =>
    `<div class="ers-step">` +
    `<span class="ers-step-num">${s.num}</span>` +
    `<span class="ers-step-name">${escapeHtml(s.name)}</span>` +
    `<span class="ers-step-result ers-step-result--${s.cls}">${escapeHtml(s.text)}</span>` +
    `</div>`,
  ).join('');
}

function runErsOverride() {
  const target = document.getElementById('ers-override-register').value;
  const worldview = document.getElementById('ers-override-worldview').value.trim() || null;

  const result = Fandaws.validateRegisterOverride(target, { worldviewContext: worldview });
  const el = document.getElementById('ers-override-result');

  if (result.accepted) {
    el.innerHTML = `<div class="ers-override-result ers-override-result--accepted">Accepted — override to ${target.split('/').pop()} permitted.</div>`;
  } else {
    el.innerHTML = `<div class="ers-override-result ers-override-result--rejected">Rejected — ${escapeHtml(result.error)}</div>`;
  }
}

// ─────────────────────────────────────────────────────────
// IVNE Compiler Demo
// ─────────────────────────────────────────────────────────

const IVNE_SCENARIOS = [
  {
    label: 'Animal Taxonomy (P1 + P3)',
    note: 'Perfect fidelity — pure hierarchy + disjointness',
    ontology: {
      ontologyIRI: 'http://example.org/animals.owl',
      classes: [
        { iri: 'ex:LivingThing', annotations: [{ property: 'rdfs:label', value: 'Living Thing' }], parents: [] },
        { iri: 'ex:Animal', annotations: [{ property: 'rdfs:label', value: 'Animal' }], parents: ['ex:LivingThing'] },
        { iri: 'ex:Plant', annotations: [{ property: 'rdfs:label', value: 'Plant' }], parents: ['ex:LivingThing'] },
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: ['ex:Animal'] },
        { iri: 'ex:Cat', annotations: [{ property: 'rdfs:label', value: 'Cat' }], parents: ['ex:Animal'] },
      ],
      disjointness: [
        { type: 'DisjointWith', class1: 'ex:Animal', class2: 'ex:Plant' },
        { type: 'DisjointWith', class1: 'ex:Dog', class2: 'ex:Cat' },
      ],
    },
  },
  {
    label: 'Existential Restrictions (P5)',
    note: 'Dog hasFur some Fur — restriction inlining',
    ontology: {
      ontologyIRI: 'http://example.org/restrictions.owl',
      classes: [
        { iri: 'ex:Animal', annotations: [{ property: 'rdfs:label', value: 'Animal' }], parents: [] },
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: ['ex:Animal'] },
        { iri: 'ex:Fur', annotations: [{ property: 'rdfs:label', value: 'Fur' }], parents: [] },
      ],
      restrictions: [
        { type: 'Existential', affectedClass: 'ex:Dog', property: 'hasFur', filler: 'ex:Fur', quantifier: 'existential' },
      ],
    },
  },
  {
    label: 'Union Flattening (Lossy)',
    note: 'Pet = Dog OR Cat — union generalization with loss record',
    ontology: {
      ontologyIRI: 'http://example.org/union.owl',
      classes: [
        { iri: 'ex:Animal', annotations: [{ property: 'rdfs:label', value: 'Animal' }], parents: [] },
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: ['ex:Animal'] },
        { iri: 'ex:Cat', annotations: [{ property: 'rdfs:label', value: 'Cat' }], parents: ['ex:Animal'] },
      ],
      expressions: [
        { type: 'union', operands: ['ex:Dog', 'ex:Cat'] },
      ],
    },
  },
  {
    label: 'P2 Equivalence (Merge Descriptors)',
    note: 'Alpha EquivalentTo Beta — merge descriptor for Termidium',
    ontology: {
      ontologyIRI: 'http://example.org/equivalence.owl',
      classes: [
        { iri: 'ex:Alpha', annotations: [{ property: 'rdfs:label', value: 'Alpha' }], parents: [] },
        { iri: 'ex:Beta', annotations: [{ property: 'rdfs:label', value: 'Beta' }], parents: [] },
      ],
      equivalences: [
        { type: 'EquivalentTo', class1: 'ex:Alpha', class2: 'ex:Beta' },
      ],
    },
  },
  {
    label: 'P6 Universal (Degraded)',
    note: 'Dog eats only Food — universal weakening loss',
    ontology: {
      ontologyIRI: 'http://example.org/universal.owl',
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
        { iri: 'ex:Food', annotations: [{ property: 'rdfs:label', value: 'Food' }], parents: [] },
      ],
      restrictions: [
        { type: 'Universal', affectedClass: 'ex:Dog', property: 'eats', filler: 'ex:Food', quantifier: 'universal' },
      ],
    },
  },
  {
    label: 'P8 Cardinality (Structural Shift)',
    note: 'Dog hasLeg min 4 Leg — existential floor + constraint + degraded loss',
    ontology: {
      ontologyIRI: 'http://example.org/cardinality.owl',
      classes: [
        { iri: 'ex:Dog', annotations: [{ property: 'rdfs:label', value: 'Dog' }], parents: [] },
        { iri: 'ex:Leg', annotations: [{ property: 'rdfs:label', value: 'Leg' }], parents: [] },
        { iri: 'ex:Eye', annotations: [{ property: 'rdfs:label', value: 'Eye' }], parents: [] },
      ],
      restrictions: [
        { type: 'Cardinality', affectedClass: 'ex:Dog', property: 'hasLeg', filler: 'ex:Leg', minCardinality: 4, quantifier: 'existential', sourceAxiom: 'Dog SubClassOf (hasLeg min 4 Leg)' },
        { type: 'Cardinality', affectedClass: 'ex:Dog', property: 'hasEye', filler: 'ex:Eye', maxCardinality: 2, quantifier: 'existential', sourceAxiom: 'Dog SubClassOf (hasEye max 2 Eye)' },
      ],
    },
  },
];

const IVNE_FIXED_CONFIG = {
  runTimestamp: '2025-01-01T00:00:00.000Z',
  scope: 'fandaws:scope/demo',
};

function initIvneDemo() {
  const scenariosEl = document.getElementById('ivne-scenarios');
  const inputEl = document.getElementById('ivne-input');
  const compileBtn = document.getElementById('ivne-compile');
  if (!scenariosEl || !inputEl || !compileBtn) return;

  // Render scenario buttons
  scenariosEl.innerHTML = IVNE_SCENARIOS.map((sc, i) =>
    `<button class="desc-example-btn" data-idx="${i}"><strong>${escapeHtml(sc.label)}</strong> — <span style="color: var(--text-muted);">${escapeHtml(sc.note)}</span></button>`,
  ).join('');

  // Scenario click: fill textarea
  scenariosEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.desc-example-btn');
    if (!btn) return;
    const sc = IVNE_SCENARIOS[Number(btn.dataset.idx)];
    if (!sc) return;
    inputEl.value = JSON.stringify(sc.ontology, null, 2);
    runIvneCompile();
  });

  compileBtn.addEventListener('click', runIvneCompile);

  // Load first scenario by default
  inputEl.value = JSON.stringify(IVNE_SCENARIOS[0].ontology, null, 2);
}

function runIvneCompile() {
  const inputEl = document.getElementById('ivne-input');
  const statsEl = document.getElementById('ivne-stats');
  const conceptsEl = document.getElementById('ivne-concepts');
  const lossEl = document.getElementById('ivne-loss');
  const manifestEl = document.getElementById('ivne-manifest');
  const deterEl = document.getElementById('ivne-determinism');
  const fullEl = document.getElementById('ivne-full-output');

  let parsed;
  try {
    parsed = JSON.parse(inputEl.value);
  } catch (e) {
    statsEl.innerHTML = `<span style="color: #ff6b6b;">JSON parse error: ${escapeHtml(e.message)}</span>`;
    return;
  }

  try {
    // First compilation
    const { result, canonicalJson, outputHash } = Fandaws.compile(parsed, IVNE_FIXED_CONFIG);

    // Second compilation for determinism proof
    const run2 = Fandaws.compile(parsed, IVNE_FIXED_CONFIG);
    const deterministic = outputHash === run2.outputHash;

    // Stats
    const manifest = result['fandaws:reductionManifest'];
    const stats = manifest['fandaws:statistics'];
    const concepts = result['fandaws:concepts'] || [];
    const lossRecords = result['fandaws:semanticLossRecords'] || [];
    const mergeDescs = result['fandaws:mergeDescriptors'] || [];
    const fidelity = stats.fidelityScore;

    const cardConstraints = result['fandaws:cardinalityConstraints'] || [];
    const fidelityColor = fidelity >= 1.0 ? '#3dd68c' : fidelity >= 0.8 ? '#f0c674' : '#ff6b6b';
    const fidelityLabel = fidelity >= 1.0 ? 'Perfect' : fidelity >= 0.8 ? 'Degraded' : 'Lossy';

    statsEl.innerHTML =
      `<span class="badge badge--green">${concepts.length} concepts</span> ` +
      `<span class="badge" style="background: ${fidelityColor}20; color: ${fidelityColor}; border: 1px solid ${fidelityColor}40;">Fidelity: ${(fidelity * 100).toFixed(1)}% (${fidelityLabel})</span> ` +
      `<span class="badge badge--accent">${lossRecords.length} loss records</span>` +
      (cardConstraints.length > 0 ? ` <span class="badge badge--yellow">${cardConstraints.length} cardinality constraints</span>` : '') +
      (mergeDescs.length > 0 ? ` <span class="badge badge--yellow">${mergeDescs.length} merge descriptors</span>` : '');

    // Concepts
    const conceptLines = concepts.map((c) => {
      const label = c['fandaws:canonicalLabel'] || c['rdfs:label'] || c['@id'];
      const parent = c['skos:broader'] ? ` -> ${c['skos:broader'].split('/').pop()}` : ' (root)';
      const props = (c['fandaws:properties'] || []).map((p) => `${p['fandaws:canonicalLabel']}(${p['fandaws:quantifier']})`);
      const disjoint = c['owl:disjointWith'] ? ` [disjoint: ${c['owl:disjointWith'].map((d) => d.split('/').pop()).join(', ')}]` : '';
      const equiv = c['owl:equivalentClass'] ? ` [equiv: ${c['owl:equivalentClass'].map((e) => e.split('/').pop()).join(', ')}]` : '';
      const propsStr = props.length > 0 ? ` {${props.join(', ')}}` : '';
      return `${label}${parent}${propsStr}${disjoint}${equiv}`;
    });
    conceptsEl.textContent = conceptLines.join('\n') || '(none)';

    // Loss records
    if (lossRecords.length > 0) {
      const lossLines = lossRecords.map((lr) => {
        const sev = lr['fandaws:severity'] || '?';
        const type = lr['fandaws:lossType'] || '?';
        const txType = lr['fandaws:transformationType'] || '?';
        return `[${sev.toUpperCase()}] ${type} (${txType}): ${lr['fandaws:lostSemantics'] || ''}`.substring(0, 150);
      });
      lossEl.textContent = lossLines.join('\n');
    } else {
      lossEl.textContent = 'None — perfect import (no information lost)';
    }

    // Manifest
    const manifestSummary = {
      fidelityScore: stats.fidelityScore,
      totalSourceAxioms: stats.totalSourceAxioms,
      totalCompiledConcepts: stats.totalCompiledConcepts,
      lossBySeverity: stats.lossBySeverity,
      sourceOntology: manifest['fandaws:sourceOntology'],
      ivneRunId: manifest['fandaws:ivneRunId'],
    };
    if (mergeDescs.length > 0) {
      manifestSummary.mergeDescriptors = mergeDescs.length;
    }
    manifestEl.textContent = JSON.stringify(manifestSummary, null, 2);

    // Determinism
    deterEl.innerHTML = deterministic
      ? `<span style="color: #3dd68c;">DETERMINISTIC</span> — SHA-256: <code>${outputHash.substring(0, 24)}...</code> (2 runs identical)`
      : `<span style="color: #ff6b6b;">NON-DETERMINISTIC</span> — Run 1: ${outputHash.substring(0, 12)}... Run 2: ${run2.outputHash.substring(0, 12)}...`;

    // Full output
    fullEl.textContent = JSON.stringify(result, null, 2);
  } catch (e) {
    statsEl.innerHTML = `<span style="color: #ff6b6b;">Compilation error: ${escapeHtml(e.message)}</span>`;
    conceptsEl.textContent = '';
    lossEl.textContent = '';
    manifestEl.textContent = '';
    deterEl.textContent = '';
    fullEl.textContent = e.stack || e.message;
  }
}

// ─────────────────────────────────────────────────────────
// Session Lifecycle Demo (Phase 11)
// ─────────────────────────────────────────────────────────

const SESSION_SCENARIOS = [
  {
    label: 'Full Lifecycle',
    note: 'start → run pipeline → pause → resume → complete',
    run(orch, sa, graphId, config) {
      const ctx = { stateAdapter: sa, graphId, config };
      const steps = [];

      const { session } = orch.startSession('demo-user', 'dog', ctx);
      const sid = session['fandaws:sessionId'];
      steps.push({ action: 'startSession("dog")', state: session['fandaws:state'], turns: 0 });

      orch.runPipeline('A dog is an animal', { ...ctx, sessionId: sid });
      const afterRun = sa.loadSession(sid);
      steps.push({ action: 'runPipeline("A dog is an animal")', state: afterRun['fandaws:state'], turns: afterRun['fandaws:dialogueHistory'].length });

      orch.pauseSession(sid, ctx);
      const afterPause = sa.loadSession(sid);
      steps.push({ action: 'pauseSession()', state: afterPause['fandaws:state'], turns: afterPause['fandaws:dialogueHistory'].length });

      const { lastPrompt } = orch.resumeSession(sid, ctx);
      const afterResume = sa.loadSession(sid);
      steps.push({ action: `resumeSession() → lastPrompt: ${lastPrompt ? '"' + lastPrompt['fandaws:content'].substring(0, 40) + '..."' : 'null'}`, state: afterResume['fandaws:state'], turns: afterResume['fandaws:dialogueHistory'].length });

      orch.completeSession(sid, ctx);
      const final = sa.loadSession(sid);
      steps.push({ action: 'completeSession()', state: final['fandaws:state'], turns: final['fandaws:dialogueHistory'].length });

      return { steps, session: final };
    },
  },
  {
    label: 'Nested Negotiation',
    note: '"dog is a canine" triggers child session for unknown parent "canine"',
    run(orch, sa, graphId, config) {
      const ctx = { stateAdapter: sa, graphId, config };
      const steps = [];

      const { session } = orch.startSession('demo-user', 'dog', ctx);
      const parentId = session['fandaws:sessionId'];
      steps.push({ action: 'startSession("dog")', state: session['fandaws:state'], turns: 0 });

      const { parentSession, childSession } = orch.nestSession(parentId, 'canine', ctx);
      steps.push({ action: 'nestSession("canine")', state: `parent=${parentSession['fandaws:state']}, child=${childSession['fandaws:state']}`, turns: parentSession['fandaws:dialogueHistory'].length });

      const childId = childSession['fandaws:sessionId'];
      orch.runPipeline('A canine is a mammal', { ...ctx, sessionId: childId });
      const afterChildRun = sa.loadSession(childId);
      steps.push({ action: 'child: runPipeline("A canine is a mammal")', state: `child=${afterChildRun['fandaws:state']}`, turns: afterChildRun['fandaws:dialogueHistory'].length });

      const { parentSession: resolved } = orch.resolveNestedSession(childId, ctx);
      steps.push({ action: 'resolveNestedSession()', state: `parent=${resolved['fandaws:state']}, child=${sa.loadSession(childId)['fandaws:state']}`, turns: resolved['fandaws:dialogueHistory'].length });

      orch.completeSession(parentId, ctx);
      const final = sa.loadSession(parentId);
      steps.push({ action: 'completeSession()', state: final['fandaws:state'], turns: final['fandaws:dialogueHistory'].length });

      return { steps, session: final };
    },
  },
  {
    label: 'Abandon Cascade',
    note: 'Abandon root session cascades to nested child and grandchild',
    run(orch, sa, graphId, config) {
      const ctx = { stateAdapter: sa, graphId, config };
      const steps = [];

      const { session } = orch.startSession('demo-user', 'dog', ctx);
      const id0 = session['fandaws:sessionId'];
      steps.push({ action: 'startSession("dog")', state: 'negotiating', turns: 0 });

      const { childSession: child1 } = orch.nestSession(id0, 'canine', ctx);
      const id1 = child1['fandaws:sessionId'];
      steps.push({ action: 'nestSession("canine")', state: `root=nested, child=negotiating`, turns: sa.loadSession(id0)['fandaws:dialogueHistory'].length });

      const { childSession: child2 } = orch.nestSession(id1, 'mammal', ctx);
      const id2 = child2['fandaws:sessionId'];
      steps.push({ action: 'nestSession("mammal") from child', state: `child=nested, grandchild=negotiating`, turns: sa.loadSession(id1)['fandaws:dialogueHistory'].length });

      const { abandonedIds } = orch.abandonSession(id0, ctx);
      steps.push({ action: `abandonSession(root) → cascade`, state: `${abandonedIds.length} sessions abandoned`, turns: sa.loadSession(id0)['fandaws:dialogueHistory'].length });

      steps.push({
        action: 'Final states',
        state: `root=${sa.loadSession(id0)['fandaws:state']}, child=${sa.loadSession(id1)['fandaws:state']}, grandchild=${sa.loadSession(id2)['fandaws:state']}`,
        turns: '-',
      });

      return { steps, session: sa.loadSession(id0) };
    },
  },
  {
    label: 'Concurrent Limit (5 max)',
    note: '6th active session rejected — paused sessions do NOT count',
    run(orch, sa, graphId, config) {
      const ctx = { stateAdapter: sa, graphId, config };
      const steps = [];

      for (let i = 1; i <= 5; i++) {
        const { session } = orch.startSession('demo-user', `term-${i}`, ctx);
        steps.push({ action: `startSession("term-${i}")`, state: session['fandaws:state'], turns: 0 });
      }

      const rejected = orch.startSession('demo-user', 'term-6', ctx);
      steps.push({ action: 'startSession("term-6")', state: `REJECTED: ${rejected.errorReason}`, turns: '-' });

      // Pause one, then retry
      const allSessions = sa.listSessions('demo-user');
      const firstId = allSessions[0]['fandaws:sessionId'];
      orch.pauseSession(firstId, ctx);
      steps.push({ action: `pauseSession("${allSessions[0]['fandaws:term']}")`, state: 'paused (no longer counts)', turns: sa.loadSession(firstId)['fandaws:dialogueHistory'].length });

      const retry = orch.startSession('demo-user', 'term-6', ctx);
      steps.push({ action: 'startSession("term-6") retry', state: retry.session ? retry.session['fandaws:state'] : `REJECTED: ${retry.errorReason}`, turns: 0 });

      return { steps, session: retry.session || sa.loadSession(firstId) };
    },
  },
  {
    label: 'Expiry Guard (SC-1)',
    note: 'Expired session with recent activity is protected by grace window',
    run(orch, sa, graphId, config) {
      const ctx = { stateAdapter: sa, graphId, config };
      const steps = [];

      // Create a session manually with past expiresAt
      const expired = Fandaws.createConversationSession({
        sessionId: 'fandaws:session/demo-expired',
        callerId: 'demo-user',
        term: 'stale-concept',
        workingGraphId: graphId,
        state: 'paused',
        expiresAt: '2026-01-01T00:00:00.000Z',
      });
      // Old lastActiveAt — outside grace window
      expired['fandaws:lastActiveAt'] = '2025-12-01T00:00:00.000Z';
      sa.saveSession('fandaws:session/demo-expired', expired);
      steps.push({ action: 'Create paused session (expiresAt: Jan 1, lastActive: Dec 1)', state: 'paused', turns: 0 });

      // Check expiry — should expire (lastActiveAt is old)
      const isExpNow = Fandaws.isExpired(expired, '2026-02-19T12:00:00.000Z', 'PT1H');
      steps.push({ action: `isExpired(now=Feb 19, grace=PT1H)?`, state: isExpNow ? 'YES — expired (lastActive outside grace)' : 'NO', turns: '-' });

      // Now set recent lastActiveAt — within grace window
      const recentSession = { ...expired, 'fandaws:lastActiveAt': '2026-02-19T11:30:00.000Z' };
      const isExpRecent = Fandaws.isExpired(recentSession, '2026-02-19T12:00:00.000Z', 'PT1H');
      steps.push({ action: `isExpired(same session, lastActive=30min ago)?`, state: isExpRecent ? 'YES — expired' : 'NO — grace window protects (SC-1)', turns: '-' });

      // Actually expire via orchestrator
      const { expiredIds } = orch.expireStaleSessions('demo-user', ctx);
      steps.push({ action: `expireStaleSessions()`, state: `${expiredIds.length} expired`, turns: sa.loadSession('fandaws:session/demo-expired')['fandaws:dialogueHistory'].length });

      return { steps, session: sa.loadSession('fandaws:session/demo-expired') };
    },
  },
];

function initSessionDemo() {
  const scenariosEl = document.getElementById('session-scenarios');
  const traceEl = document.getElementById('session-state-trace');
  const dialogueEl = document.getElementById('session-dialogue');
  const jsonEl = document.getElementById('session-json');

  if (!scenariosEl) return;

  scenariosEl.innerHTML = SESSION_SCENARIOS.map((sc, i) =>
    `<button class="desc-example-btn" data-idx="${i}"><strong>${escapeHtml(sc.label)}</strong> — <span style="color: var(--text-muted);">${escapeHtml(sc.note)}</span></button>`,
  ).join('');

  scenariosEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.desc-example-btn');
    if (!btn) return;
    const sc = SESSION_SCENARIOS[Number(btn.dataset.idx)];
    if (!sc) return;

    // Fresh adapter and orchestrator for each run
    const sa = new Fandaws.InMemoryStateAdapter();
    const graphId = 'fandaws:graph/demo-session';
    sa.saveGraph(graphId, Fandaws.createKnowledgeGraph({ id: graphId }));
    const orch = new Fandaws.SynchronousOrchestrationAdapter();

    const config = {
      'fandaws:sessionExpiryDuration': 'P7D',
      'fandaws:maxNestingDepth': 10,
      'fandaws:maxConcurrentSessions': 5,
    };

    try {
      const { steps, session } = sc.run(orch, sa, graphId, config);

      // Render state trace
      traceEl.textContent = steps.map((s, i) =>
        `${i + 1}. ${s.action}\n   State: ${s.state}${s.turns !== '-' ? `  |  Turns: ${s.turns}` : ''}`,
      ).join('\n\n');

      // Render dialogue history
      const history = session['fandaws:dialogueHistory'] || [];
      if (history.length > 0) {
        dialogueEl.textContent = history.map((t) => {
          const role = t['fandaws:role'].toUpperCase().padEnd(11);
          const content = (t['fandaws:content'] || '').substring(0, 100);
          return `[${t['fandaws:turnIndex']}] ${role} ${content}`;
        }).join('\n');
      } else {
        dialogueEl.textContent = '(no dialogue turns recorded)';
      }

      // Render JSON
      jsonEl.textContent = JSON.stringify(session, null, 2);
    } catch (err) {
      traceEl.textContent = `Error: ${err.message}`;
      dialogueEl.textContent = '';
      jsonEl.textContent = err.stack || err.message;
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
initErsDemo();
initIvneDemo();
initConversationDemo();
initSessionDemo();
