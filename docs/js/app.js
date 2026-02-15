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
// Property Workflow Demo
// ─────────────────────────────────────────────────────────

const DEMO_HIERARCHY = [
  { id: 'fandaws:concept/entity', label: 'Entity', prefLabel: 'entity', broader: null },
  { id: 'fandaws:concept/living-thing', label: 'Living Thing', prefLabel: 'living thing', broader: 'fandaws:concept/entity' },
  { id: 'fandaws:concept/animal', label: 'Animal', prefLabel: 'animal', broader: 'fandaws:concept/living-thing' },
  { id: 'fandaws:concept/mammal', label: 'Mammal', prefLabel: 'mammal', broader: 'fandaws:concept/animal' },
  { id: 'fandaws:concept/dog', label: 'Dog', prefLabel: 'dog', broader: 'fandaws:concept/mammal' },
  { id: 'fandaws:concept/cat', label: 'Cat', prefLabel: 'cat', broader: 'fandaws:concept/mammal' },
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
  { id: 'fandaws:concept/entity', label: 'Entity', prefLabel: 'entity', broader: null },
  { id: 'fandaws:concept/living-thing', label: 'Living Thing', prefLabel: 'living thing', broader: 'fandaws:concept/entity' },
  { id: 'fandaws:concept/animal', label: 'Animal', prefLabel: 'animal', broader: 'fandaws:concept/living-thing' },
  { id: 'fandaws:concept/mammal', label: 'Mammal', prefLabel: 'mammal', broader: 'fandaws:concept/animal' },
  { id: 'fandaws:concept/dog', label: 'Dog', prefLabel: 'dog', broader: 'fandaws:concept/mammal' },
  { id: 'fandaws:concept/cat', label: 'Cat', prefLabel: 'cat', broader: 'fandaws:concept/mammal' },
  { id: 'fandaws:concept/elephant', label: 'Elephant', prefLabel: 'elephant', broader: 'fandaws:concept/animal' },
  { id: 'fandaws:concept/hunt', label: 'Hunt', prefLabel: 'hunt', broader: null },
  { id: 'fandaws:concept/predation', label: 'Predation', prefLabel: 'predation', broader: 'fandaws:concept/hunt' },
];

let descProperties = [];

const DESC_EXAMPLES = [
  { label: 'Standard: Dog is a Mammal', concept: 'fandaws:concept/dog', properties: [], rel: null },
  { label: 'Article "an": Animal is a Living Thing', concept: 'fandaws:concept/animal', properties: [], rel: null },
  { label: 'With properties: Dog + fur, four legs', concept: 'fandaws:concept/dog', properties: ['fur', 'four legs'], rel: null },
  { label: 'Oxford comma: Cat + whiskers, claws, tail', concept: 'fandaws:concept/cat', properties: ['whiskers', 'claws', 'tail'], rel: null },
  { label: 'Root concept: Entity', concept: 'fandaws:concept/entity', properties: [], rel: null },
  { label: 'Root + properties: Entity + mass, energy', concept: 'fandaws:concept/entity', properties: ['mass', 'energy'], rel: null },
  { label: 'Process: Predation (hunt + chases)', concept: 'fandaws:concept/predation', properties: [], rel: { verb: 'chases', subject: 'fandaws:concept/dog', object: 'fandaws:concept/cat' } },
];

function initDescriptionDemo() {
  const hierarchyEl = document.getElementById('desc-hierarchy');
  if (!hierarchyEl) return;

  // Render hierarchy tree
  const indent = { 'entity': 0, 'living thing': 1, 'animal': 2, 'mammal': 3, 'dog': 4, 'cat': 4, 'elephant': 3, 'hunt': 0, 'predation': 1 };
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
  conceptSelect.value = 'fandaws:concept/dog';
  subjectSelect.value = 'fandaws:concept/dog';
  objectSelect.value = 'fandaws:concept/cat';

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
// Initialize
// ─────────────────────────────────────────────────────────

loadRoadmap();
loadTestResults();
buildCorpusTable();
renderFactoryParams();
runPipeline();
initPropertyDemo();
initDescriptionDemo();
