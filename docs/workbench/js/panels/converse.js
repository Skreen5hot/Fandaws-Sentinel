/**
 * Converse Panel — Center panel chat interface.
 *
 * Adapted from docs/js/app.js sendConversation(). Scope-narrowing
 * buttons render inline as chat bubbles, not in a separate container.
 */
import { escapeHtml, ersRegisterInfo } from '../utils.js';

/**
 * Initialize the Converse panel.
 * @param {HTMLElement} container - #panel-workspace
 * @param {import('../workbench-state.js').WorkbenchStateManager} state
 */
export function initConverse(container, state) {
  let pendingUtterance = null;
  let scopeDecisions = new Map();
  let onboardingShown = true;
  let pendingObjectResolution = null;

  // Build DOM
  container.innerHTML = `
    <div class="wb-converse">
      <div class="wb-chat-log" id="wb-chat-log">
        <div class="wb-chat-msg wb-chat-msg--onboarding" id="wb-onboarding">
          Type a statement like <strong>"A dog is an animal"</strong> to start building your knowledge graph.
        </div>
      </div>
      <div class="wb-chat-input-bar">
        <input type="text" class="wb-chat-input" id="wb-chat-input"
               placeholder="e.g. A dog is an animal" autocomplete="off" />
        <button class="wb-chat-send" id="wb-chat-send">Send</button>
      </div>
    </div>
  `;

  const chatLog = container.querySelector('#wb-chat-log');
  const chatInput = container.querySelector('#wb-chat-input');
  const sendBtn = container.querySelector('#wb-chat-send');

  function scrollToBottom() {
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function removeOnboarding() {
    if (onboardingShown) {
      const el = container.querySelector('#wb-onboarding');
      if (el) el.remove();
      onboardingShown = false;
    }
  }

  function appendMessage(cls, html) {
    const div = document.createElement('div');
    div.className = `wb-chat-msg ${cls}`;
    div.innerHTML = html;
    chatLog.appendChild(div);
    scrollToBottom();
    return div;
  }

  /**
   * Determine workflow label from pipeline result.
   */
  function getWorkflowLabel(result) {
    if (result.classificationAction) {
      return result.classificationAction['fandaws:workflow'] || '?';
    }
    if (result.propertyAction) return 'property';
    if (result.parseResult?.['fandaws:verbType'] === 'customRelationship') return 'relationship';
    return result.parseResult?.['fandaws:verbType'] || '?';
  }

  /**
   * Build collapsed trace HTML from mutation data.
   */
  function buildTraceHtml(result) {
    const workflow = getWorkflowLabel(result);
    const success = result.success ? '<span class="wb-trace-check">&#10003;</span>' : '<span class="wb-trace-fail">&#10007;</span>';

    // Try to extract routing record from mutation additions
    let registerInfo = '';
    if (result.mutation) {
      const additions = result.mutation['fandaws:additions'] || [];
      for (const node of additions) {
        const info = ersRegisterInfo(node);
        if (info) {
          const rr = node['fandaws:routingRecord'];
          const method = rr?.['fandaws:routingMethod'] || '';
          registerInfo = `<span class="wb-register-sm wb-register-sm--${info.cls}">${info.label}</span> ${escapeHtml(method)}`;
          break;
        }
      }
    }

    return `
      <span class="wb-trace-toggle" data-trace-toggle>&#9660; trace</span>
      <div class="wb-trace-details">
        <div class="wb-trace-row">${success} <span>${escapeHtml(workflow)}</span></div>
        ${registerInfo ? `<div class="wb-trace-row">${registerInfo}</div>` : ''}
      </div>
    `;
  }

  /**
   * Make concept names in text clickable.
   */
  function linkifyConcepts(text) {
    const graph = state.getGraph();
    const concepts = graph?.['fandaws:concepts'] || [];
    let result = escapeHtml(text);

    // Sort by label length descending to avoid partial replacements
    const sorted = [...concepts].sort((a, b) =>
      (b['rdfs:label'] || '').length - (a['rdfs:label'] || '').length
    );

    for (const c of sorted) {
      const label = c['rdfs:label'];
      if (!label) continue;
      const escaped = escapeHtml(label);
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      result = result.replace(regex,
        `<span class="wb-concept-link" data-concept-iri="${escapeHtml(c['@id'])}">${escaped}</span>`
      );
    }
    return result;
  }

  /**
   * If an objectResolution prompt is pending and the user typed a short
   * fragment (no verb pattern), auto-expand it into a classification
   * utterance: "{pending term} is {userInput}".
   *
   * @param {string} input - User's raw input
   * @param {{ term: string, subject: string }|null} pending
   * @returns {string} Possibly expanded utterance
   */
  function expandObjectResolution(input, pending) {
    if (!pending || !pending.term) return input;

    const trimmed = input.trim();
    if (!trimmed) return input;

    // If the user started with a pronoun, they're forming their own sentence
    if (/^(it|that|this|they)\b/i.test(trimmed)) return input;

    // If the user typed a full utterance with a verb, send as-is
    if (/\b(is|are|has|have|it'?s)\b/i.test(trimmed) && trimmed.includes(' ')) {
      return input;
    }

    // Single word or fragment without a verb → auto-prefix
    // Uses bare "is" — the parser handles "X is Y" without an article
    return `${pending.term} is ${trimmed}`;
  }

  /**
   * Process and send an utterance.
   */
  function sendUtterance() {
    let utterance = chatInput.value.trim();
    if (!utterance) return;

    removeOnboarding();

    // Auto-expand single-word response to objectResolution prompt
    const rawInput = utterance;
    if (pendingObjectResolution) {
      utterance = expandObjectResolution(utterance, pendingObjectResolution);
    }

    // If this is a new utterance (not re-run for scope), show user bubble
    if (utterance !== pendingUtterance) {
      scopeDecisions = new Map();
      pendingUtterance = null;
      if (utterance !== rawInput) {
        appendMessage('wb-chat-msg--user',
          `${escapeHtml(rawInput)} <span class="wb-auto-expand">&rarr; ${escapeHtml(utterance)}</span>`);
      } else {
        appendMessage('wb-chat-msg--user', escapeHtml(utterance));
      }
    }

    const options = scopeDecisions.size > 0
      ? { scopeDecisions }
      : {};

    const result = state.runUtterance(utterance, options);
    const workflow = getWorkflowLabel(result);

    if (result.prompts && result.prompts.length > 0 && !result.success && !result.error) {
      // Check if this is an objectResolution prompt (user must classify the term)
      const objectPrompt = result.prompts.find(
        (p) => p['fandaws:promptType'] === 'objectResolution',
      );

      if (objectPrompt) {
        // Object resolution — informational bubble, no buttons.
        // Store the original utterance so we can auto-retry after
        // the user classifies the unknown term.
        const text = objectPrompt['fandaws:text'] || 'What is this?';
        const ctx = objectPrompt['fandaws:context'] || {};
        pendingObjectResolution = {
          term: ctx.pendingProperty || '',
          subject: ctx.pendingSubject || '',
          originalUtterance: utterance,
        };
        appendMessage('wb-chat-msg--scope-prompt', `<div>${escapeHtml(text)}</div>`);
        pendingUtterance = null;
        scopeDecisions = new Map();
        chatInput.value = '';
      } else {
        // Scope narrowing — render as chat bubble with buttons
        pendingUtterance = utterance;

        for (const prompt of result.prompts) {
          const text = prompt['fandaws:text'] || 'Scope question';
          const ctx = prompt['fandaws:context'] || {};
          const conceptIri = ctx.conceptIri || '';

          const msgDiv = appendMessage('wb-chat-msg--scope-prompt', `
            <div>${escapeHtml(text)}</div>
            <div class="wb-scope-buttons">
              <button class="wb-scope-btn wb-scope-btn--yes" data-scope-iri="${escapeHtml(conceptIri)}" data-scope-answer="true">Yes</button>
              <button class="wb-scope-btn wb-scope-btn--no" data-scope-iri="${escapeHtml(conceptIri)}" data-scope-answer="false">No</button>
            </div>
          `);

          // Wire scope buttons
          msgDiv.querySelectorAll('.wb-scope-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              const iri = btn.dataset.scopeIri;
              const answer = btn.dataset.scopeAnswer === 'true';
              scopeDecisions.set(iri, answer);

              // Replace buttons with answer text
              const buttonsDiv = btn.closest('.wb-scope-buttons');
              buttonsDiv.innerHTML = `<em style="color: var(--text-muted);">${answer ? 'Yes' : 'No'}</em>`;

              // Re-run pipeline with scope decisions
              chatInput.value = pendingUtterance;
              sendUtterance();
            });
          });
        }
      }
    } else if (result.success) {
      // Success — show workflow badge + description
      let descText = result.descriptions?.length > 0
        ? result.descriptions[0].description
        : null;

      // Fallback: if pipeline returned no descriptions (e.g. reclassification
      // where both concepts already exist), generate one from the subject concept.
      if (!descText && result.mutation && result.parseResult) {
        const subjectLabel = result.parseResult['fandaws:subject'];
        if (subjectLabel) {
          const graph = state.getGraph();
          const concepts = graph?.['fandaws:concepts'] || [];
          const subjectConcept = concepts.find((c) =>
            (c['skos:prefLabel'] || '').toLowerCase() === subjectLabel.toLowerCase()
            || (c['rdfs:label'] || '').toLowerCase() === subjectLabel.toLowerCase()
          );
          if (subjectConcept) {
            try { descText = state.Fandaws.describeConcept(subjectConcept, graph); } catch { /* */ }
          }
        }
      }

      const workflowClass = workflow === 'classification' ? 'classification'
        : workflow === 'property' ? 'property'
        : 'relationship';

      let html = `<span class="wb-workflow-badge wb-workflow-badge--${workflowClass}">${escapeHtml(workflow)}</span>`;

      if (descText) {
        html += `<div style="margin-top: 4px;">${linkifyConcepts(descText)}</div>`;
      } else {
        const mutationNote = result.mutation ? 'Graph updated.' : 'No change (idempotent).';
        html += `<div style="margin-top: 4px;">${escapeHtml(mutationNote)}</div>`;
      }

      html += buildTraceHtml(result);

      appendMessage('wb-chat-msg--system', html);

      // Auto-retry: if this classification resolved a pending objectResolution,
      // re-run the original property/relationship utterance automatically.
      if (pendingObjectResolution && workflow === 'classification') {
        const classifiedLabel = result.parseResult?.['fandaws:subject'];
        if (classifiedLabel && classifiedLabel.toLowerCase() === pendingObjectResolution.term.toLowerCase()) {
          const originalUtterance = pendingObjectResolution.originalUtterance;
          pendingObjectResolution = null;
          pendingUtterance = null;
          scopeDecisions = new Map();
          chatInput.value = originalUtterance;
          appendMessage('wb-chat-msg--system',
            `<div style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">Retrying: ${escapeHtml(originalUtterance)}</div>`
          );
          sendUtterance();
          return;
        } else {
          pendingObjectResolution = null;
        }
      } else if (pendingObjectResolution) {
        pendingObjectResolution = null;
      }

      pendingUtterance = null;
      scopeDecisions = new Map();
      chatInput.value = '';
    } else {
      // Error
      const reason = result.errorReason || 'Unknown error';
      appendMessage('wb-chat-msg--error', `<strong>Error:</strong> ${escapeHtml(reason)}`);
      pendingUtterance = null;
      scopeDecisions = new Map();
    }

    chatInput.focus();
  }

  // Event listeners
  sendBtn.addEventListener('click', sendUtterance);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUtterance();
    }
  });

  // Delegated click for trace toggles and concept links
  chatLog.addEventListener('click', (e) => {
    const traceToggle = e.target.closest('[data-trace-toggle]');
    if (traceToggle) {
      const details = traceToggle.nextElementSibling;
      if (details) details.classList.toggle('open');
      return;
    }

    const conceptLink = e.target.closest('[data-concept-iri]');
    if (conceptLink) {
      state.selectConcept(conceptLink.dataset.conceptIri);
    }
  });

  chatInput.focus();
}

/**
 * Show/hide the converse panel.
 */
export function showConverse(container) {
  const el = container.querySelector('.wb-converse');
  if (el) el.style.display = 'flex';
}

export function hideConverse(container) {
  const el = container.querySelector('.wb-converse');
  if (el) el.style.display = 'none';
}
