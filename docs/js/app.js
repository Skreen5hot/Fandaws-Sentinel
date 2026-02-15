/**
 * Fandaws Sentinel — Stakeholder Review UI
 *
 * Interactive app logic for the single-page stakeholder review site.
 * Imports the bundled Fandaws library from dist/fandaws.js.
 */

import * as Fandaws from '../dist/fandaws.js';

// ─────────────────────────────────────────────────────────
// Tab navigation
// ─────────────────────────────────────────────────────────

const tabs = document.querySelectorAll('.nav-tab');
const sections = document.querySelectorAll('.section');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    sections.forEach((s) => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`section-${tab.dataset.tab}`).classList.add('active');
  });
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
// Initialize
// ─────────────────────────────────────────────────────────

loadRoadmap();
loadTestResults();
buildCorpusTable();
renderFactoryParams();
runPipeline();
