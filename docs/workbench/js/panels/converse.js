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
  let pendingReclassification = null;
  let pendingQualification = null;
  let pendingBfoCategoryChoice = null;
  let pendingConsequenceChoice = null;

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

    // Handle pendingQualification — user typed a custom qualifier label
    if (pendingQualification) {
      appendMessage('wb-chat-msg--user', escapeHtml(utterance));
      const createOpts = {
        reclassificationConfirmed: 'new_concept',
        relabelExisting: true,
        qualifiers: {
          existing: pendingQualification.autoExisting,
          new: utterance,
        },
      };
      const createResult = state.runUtterance(pendingQualification.originalUtterance, createOpts);
      pendingQualification = null;

      if (createResult.success) {
        appendMessage('wb-chat-msg--system',
          '<span class="wb-workflow-badge wb-workflow-badge--classification">classification</span>' +
          '<div style="margin-top: 4px;">Homonym created with custom label.</div>');
      } else {
        appendMessage('wb-chat-msg--error',
          `<strong>Error:</strong> ${escapeHtml(createResult.errorReason || 'Unknown error')}`);
      }
      pendingUtterance = null;
      scopeDecisions = new Map();
      chatInput.value = '';
      chatInput.focus();
      return;
    }

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

    const options = {};
    if (scopeDecisions.size > 0) options.scopeDecisions = scopeDecisions;
    if (pendingBfoCategoryChoice) options.bfoCategoryChoice = pendingBfoCategoryChoice;
    if (pendingConsequenceChoice) {
      options.reclassificationConsequenceChoice = pendingConsequenceChoice;
      // The consequence prompt fires AFTER the proximity check, so the
      // proximity is already resolved by the time we re-run with the
      // user's consequence choice. Pass reclassificationConfirmed='move'
      // implicitly to skip re-asking proximity.
      options.reclassificationConfirmed = 'move';
    }

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
      } else if (result.prompts.find((p) => p['fandaws:promptType'] === 'reclassificationConfirmation')) {
        // Reclassification confirmation — three-button bubble
        const reclPrompt = result.prompts.find((p) => p['fandaws:promptType'] === 'reclassificationConfirmation');
        const text = reclPrompt['fandaws:text'] || 'Confirm reclassification?';
        const ctx = reclPrompt['fandaws:context'] || {};

        pendingReclassification = {
          originalUtterance: utterance,
          existingConceptIri: ctx.existingConceptIri,
          existingParentLabel: ctx.existingParentLabel,
          newParentLabel: ctx.newParentLabel,
          subjectLabel: ctx.subjectLabel,
        };

        const msgDiv = appendMessage('wb-chat-msg--scope-prompt', `
          <div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>
          <div class="wb-scope-buttons">
            <button class="wb-recl-btn" data-recl-action="move">Same &mdash; move it</button>
            <button class="wb-recl-btn" data-recl-action="new_concept">Different concept</button>
            <button class="wb-recl-btn" data-recl-action="cancel">Cancel</button>
          </div>
        `);

        msgDiv.querySelectorAll('.wb-recl-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const action = btn.dataset.reclAction;
            const buttonsDiv = btn.closest('.wb-scope-buttons');

            if (action === 'move') {
              buttonsDiv.innerHTML = '<em style="color: var(--text-muted);">Moving&hellip;</em>';
              chatInput.value = pendingReclassification.originalUtterance;
              pendingUtterance = pendingReclassification.originalUtterance;
              const reclOpts = {
                reclassificationConfirmed: 'move',
                existingConceptIri: pendingReclassification.existingConceptIri,
              };
              pendingReclassification = null;
              const moveResult = state.runUtterance(pendingUtterance, reclOpts);

              if (moveResult.success) {
                buttonsDiv.innerHTML = '<em style="color: var(--text-muted);">Moved.</em>';
                let descText = moveResult.descriptions?.length > 0
                  ? moveResult.descriptions[0].description : null;
                if (!descText && moveResult.mutation && moveResult.parseResult) {
                  const subjectLabel = moveResult.parseResult['fandaws:subject'];
                  if (subjectLabel) {
                    const graph = state.getGraph();
                    const concepts = graph?.['fandaws:concepts'] || [];
                    const sc = concepts.find((c) =>
                      (c['skos:prefLabel'] || '').toLowerCase() === subjectLabel.toLowerCase()
                      || (c['rdfs:label'] || '').toLowerCase() === subjectLabel.toLowerCase()
                    );
                    if (sc) try { descText = state.Fandaws.describeConcept(sc, graph); } catch { /* */ }
                  }
                }
                let html = '<span class="wb-workflow-badge wb-workflow-badge--classification">classification</span>';
                html += descText
                  ? `<div style="margin-top: 4px;">${linkifyConcepts(descText)}</div>`
                  : '<div style="margin-top: 4px;">Reclassified.</div>';
                appendMessage('wb-chat-msg--system', html);
              } else {
                appendMessage('wb-chat-msg--error',
                  `<strong>Error:</strong> ${escapeHtml(moveResult.errorReason || 'Unknown error')}`);
              }
              pendingUtterance = null;
              scopeDecisions = new Map();
              chatInput.value = '';
            } else if (action === 'cancel') {
              buttonsDiv.innerHTML = '<em style="color: var(--text-muted);">Cancelled.</em>';
              pendingReclassification = null;
              pendingUtterance = null;
              scopeDecisions = new Map();
              chatInput.value = '';
            } else if (action === 'new_concept') {
              buttonsDiv.innerHTML = '<em style="color: var(--text-muted);">Different concept&hellip;</em>';

              // Generate auto-qualifiers from parent labels
              const subjLabel = pendingReclassification.subjectLabel;
              const existingQ = `${subjLabel} (${pendingReclassification.existingParentLabel})`;
              const newQ = `${subjLabel} (${pendingReclassification.newParentLabel})`;

              pendingQualification = {
                originalUtterance: pendingReclassification.originalUtterance,
                existingConceptIri: pendingReclassification.existingConceptIri,
                autoExisting: existingQ,
                autoNew: newQ,
              };
              pendingReclassification = null;

              const qualDiv = appendMessage('wb-chat-msg--scope-prompt', `
                <div>Suggested labels:</div>
                <div style="margin: 4px 0;"><strong>${escapeHtml(existingQ)}</strong> (existing)</div>
                <div style="margin: 4px 0;"><strong>${escapeHtml(newQ)}</strong> (new)</div>
                <div class="wb-scope-buttons">
                  <button class="wb-qual-btn" data-qual-action="accept">Accept labels</button>
                  <button class="wb-qual-btn" data-qual-action="customize">Customize</button>
                </div>
              `);

              qualDiv.querySelectorAll('.wb-qual-btn').forEach((qBtn) => {
                qBtn.addEventListener('click', () => {
                  const qAction = qBtn.dataset.qualAction;
                  const qBtnsDiv = qBtn.closest('.wb-scope-buttons');

                  if (qAction === 'accept') {
                    qBtnsDiv.innerHTML = '<em style="color: var(--text-muted);">Creating&hellip;</em>';
                    const createOpts = {
                      reclassificationConfirmed: 'new_concept',
                      relabelExisting: true,
                      qualifiers: {
                        existing: pendingQualification.autoExisting,
                        new: pendingQualification.autoNew,
                      },
                    };
                    const createResult = state.runUtterance(pendingQualification.originalUtterance, createOpts);
                    pendingQualification = null;

                    if (createResult.success) {
                      qBtnsDiv.innerHTML = '<em style="color: var(--text-muted);">Created.</em>';
                      appendMessage('wb-chat-msg--system',
                        '<span class="wb-workflow-badge wb-workflow-badge--classification">classification</span>' +
                        '<div style="margin-top: 4px;">Homonym created.</div>');
                    } else {
                      appendMessage('wb-chat-msg--error',
                        `<strong>Error:</strong> ${escapeHtml(createResult.errorReason || 'Unknown error')}`);
                    }
                    pendingUtterance = null;
                    scopeDecisions = new Map();
                    chatInput.value = '';
                  } else if (qAction === 'customize') {
                    qBtnsDiv.innerHTML = '<em style="color: var(--text-muted);">Enter custom label&hellip;</em>';
                    appendMessage('wb-chat-msg--scope-prompt',
                      '<div>What should I call the new one? (Type a qualified label, e.g., "mouse (input device)")</div>');
                    // Set flag — next sendUtterance() input becomes the custom qualifier
                    chatInput.value = '';
                    chatInput.focus();
                    // pendingQualification stays set — sendUtterance intercepts it
                  }
                });
              });
            }
          });
        });
      } else if (result.prompts.find((p) => p['fandaws:promptType'] === 'reclassificationConsequence')) {
        // Consequence-Aware Reclassification — user picks how to handle
        // inheritance loss when a reclassification would break inherited
        // properties. Three options: add as additional parent (safest,
        // first), keep current, reclassify anyway. Per architect Q8 the
        // safest option is presented first.
        const cqPrompt = result.prompts.find((p) => p['fandaws:promptType'] === 'reclassificationConsequence');
        const text = cqPrompt['fandaws:text'] || 'Reclassification has consequences.';
        const opts = cqPrompt['fandaws:options'] || [];

        const btnsHtml = opts.map((opt) => `
          <button class="wb-bfo-btn" data-cq-action="${escapeHtml(opt.action)}" title="${escapeHtml(opt.hint || '')}">
            ${escapeHtml(opt.label)}
            <span class="wb-bfo-btn-hint">${escapeHtml(opt.hint || '')}</span>
          </button>
        `).join('');

        // Use <pre> for the text so the multi-line consequence list renders properly
        const msgDiv = appendMessage('wb-chat-msg--scope-prompt', `
          <div style="white-space: pre-wrap;">${escapeHtml(text)}</div>
          <div class="wb-bfo-buttons">${btnsHtml}</div>
        `);

        pendingUtterance = utterance;
        msgDiv.querySelectorAll('.wb-bfo-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const choice = btn.dataset.cqAction;
            const buttonsDiv = btn.closest('.wb-bfo-buttons');
            buttonsDiv.innerHTML = `<em style="color: var(--text-muted);">${escapeHtml(btn.textContent.trim().split('\n')[0])}</em>`;
            pendingConsequenceChoice = choice;
            chatInput.value = pendingUtterance;
            sendUtterance();
          });
        });
      } else if (result.prompts.find((p) => p['fandaws:promptType'] === 'secondaryParentPromotion')) {
        // Secondary Parent Promotion — user is reclassifying to a parent
        // that's already in fandaws:additionalParents. Two options:
        // promote to primary, or keep as-is.
        const spPrompt = result.prompts.find((p) => p['fandaws:promptType'] === 'secondaryParentPromotion');
        const text = spPrompt['fandaws:text'] || 'Make this the primary classification?';

        const msgDiv = appendMessage('wb-chat-msg--scope-prompt', `
          <div>${escapeHtml(text)}</div>
          <div class="wb-scope-buttons">
            <button class="wb-scope-btn" data-sp-action="promote_secondary">Make primary</button>
            <button class="wb-scope-btn" data-sp-action="keep_current">Keep as-is</button>
          </div>
        `);

        pendingUtterance = utterance;
        msgDiv.querySelectorAll('.wb-scope-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const choice = btn.dataset.spAction;
            const buttonsDiv = btn.closest('.wb-scope-buttons');
            buttonsDiv.innerHTML = `<em style="color: var(--text-muted);">${escapeHtml(btn.textContent)}</em>`;
            pendingConsequenceChoice = choice;
            chatInput.value = pendingUtterance;
            sendUtterance();
          });
        });
      } else if (result.prompts.find((p) => p['fandaws:promptType'] === 'bfoCategoryDisambiguation')) {
        // BFO Category Disambiguation — user picks the BFO root category
        // for a brand-new concept. Replaces the old label-suffix heuristic.
        const bfoPrompt = result.prompts.find((p) => p['fandaws:promptType'] === 'bfoCategoryDisambiguation');
        const text = bfoPrompt['fandaws:text'] || 'What kind of thing is this?';
        const opts = bfoPrompt['fandaws:options'] || [];

        const btnsHtml = opts.map((opt) => `
          <button class="wb-bfo-btn" data-bfo-iri="${escapeHtml(opt.sourceIri)}" title="${escapeHtml(opt.hint || '')}">
            ${escapeHtml(opt.label)}
            <span class="wb-bfo-btn-hint">${escapeHtml(opt.hint || '')}</span>
          </button>
        `).join('');

        const msgDiv = appendMessage('wb-chat-msg--scope-prompt', `
          <div>${escapeHtml(text)}</div>
          <div class="wb-bfo-buttons">${btnsHtml}</div>
        `);

        pendingUtterance = utterance;
        msgDiv.querySelectorAll('.wb-bfo-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const choice = btn.dataset.bfoIri;
            const buttonsDiv = btn.closest('.wb-bfo-buttons');
            // Replace buttons with the chosen label
            buttonsDiv.innerHTML = `<em style="color: var(--text-muted);">${escapeHtml(btn.textContent.trim().split('\n')[0])}</em>`;
            // Re-run the utterance with the choice
            pendingBfoCategoryChoice = choice;
            chatInput.value = pendingUtterance;
            sendUtterance();
          });
        });
      } else if (result.prompts.find((p) => p['fandaws:promptType'] === 'homonymDisambiguation')) {
        // Homonym disambiguation — selection buttons per homonym
        const disPrompt = result.prompts.find((p) => p['fandaws:promptType'] === 'homonymDisambiguation');
        const text = disPrompt['fandaws:text'] || 'Which concept did you mean?';
        const ctx = disPrompt['fandaws:context'] || {};
        const opts = disPrompt['fandaws:options'] || [];
        const candidates = ctx.candidates || [];
        const allowCreate = ctx.allowCreate || false;

        let btnsHtml = candidates.map((iri, i) =>
          `<button class="wb-dis-btn" data-dis-iri="${escapeHtml(iri)}">${escapeHtml(opts[i] || iri)}</button>`,
        ).join('');
        if (allowCreate) {
          btnsHtml += '<button class="wb-dis-btn" data-dis-action="neither">Neither &mdash; new concept</button>';
        }

        const msgDiv = appendMessage('wb-chat-msg--scope-prompt', `
          <div>${escapeHtml(text)}</div>
          <div class="wb-scope-buttons">${btnsHtml}</div>
        `);

        msgDiv.querySelectorAll('.wb-dis-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const selectedIri = btn.dataset.disIri;
            const disAction = btn.dataset.disAction;
            const buttonsDiv = btn.closest('.wb-scope-buttons');

            if (disAction === 'neither') {
              // Simplified qualifier flow for Nth homonym
              buttonsDiv.innerHTML = '<em style="color: var(--text-muted);">New concept&hellip;</em>';
              const bareLabel = ctx.bareLabel || 'concept';
              const autoLabel = `${bareLabel} (new)`;

              pendingQualification = {
                originalUtterance: utterance,
                autoExisting: '',
                autoNew: autoLabel,
                isNthHomonym: true,
              };

              const qualDiv = appendMessage('wb-chat-msg--scope-prompt', `
                <div>What should I call the new one? (suggested: <strong>${escapeHtml(autoLabel)}</strong>)</div>
                <div class="wb-scope-buttons">
                  <button class="wb-qual-btn" data-qual-action="accept">Accept label</button>
                  <button class="wb-qual-btn" data-qual-action="customize">Customize</button>
                </div>
              `);

              qualDiv.querySelectorAll('.wb-qual-btn').forEach((qBtn) => {
                qBtn.addEventListener('click', () => {
                  const qAction = qBtn.dataset.qualAction;
                  const qBtnsDiv = qBtn.closest('.wb-scope-buttons');
                  if (qAction === 'accept') {
                    qBtnsDiv.innerHTML = '<em style="color: var(--text-muted);">Creating&hellip;</em>';
                    const createOpts = {
                      disambiguationAction: 'create_new',
                      reclassificationConfirmed: 'new_concept',
                      relabelExisting: false,
                      qualifiers: { existing: '', new: pendingQualification.autoNew },
                    };
                    const createResult = state.runUtterance(pendingQualification.originalUtterance, createOpts);
                    pendingQualification = null;
                    if (createResult.success) {
                      qBtnsDiv.innerHTML = '<em style="color: var(--text-muted);">Created.</em>';
                      appendMessage('wb-chat-msg--system',
                        '<span class="wb-workflow-badge wb-workflow-badge--classification">classification</span>' +
                        '<div style="margin-top: 4px;">Homonym created.</div>');
                    } else {
                      appendMessage('wb-chat-msg--error',
                        `<strong>Error:</strong> ${escapeHtml(createResult.errorReason || 'Unknown error')}`);
                    }
                    pendingUtterance = null;
                    chatInput.value = '';
                  } else if (qAction === 'customize') {
                    qBtnsDiv.innerHTML = '<em style="color: var(--text-muted);">Enter custom label&hellip;</em>';
                    appendMessage('wb-chat-msg--scope-prompt',
                      '<div>Type a qualified label (e.g., "mouse (new category)"):</div>');
                    chatInput.value = '';
                    chatInput.focus();
                  }
                });
              });
            } else {
              // User selected a specific homonym
              buttonsDiv.innerHTML = `<em style="color: var(--text-muted);">${escapeHtml(btn.textContent)}</em>`;
              const resolveOpts = { resolvedConceptIri: selectedIri };
              const resolveResult = state.runUtterance(utterance, resolveOpts);

              if (resolveResult.success) {
                let descText = resolveResult.descriptions?.length > 0
                  ? resolveResult.descriptions[0].description : null;
                const workflowClass = getWorkflowLabel(resolveResult) === 'classification' ? 'classification'
                  : getWorkflowLabel(resolveResult) === 'property' ? 'property' : 'relationship';
                let html = `<span class="wb-workflow-badge wb-workflow-badge--${workflowClass}">${escapeHtml(getWorkflowLabel(resolveResult))}</span>`;
                html += descText
                  ? `<div style="margin-top: 4px;">${linkifyConcepts(descText)}</div>`
                  : '<div style="margin-top: 4px;">Done.</div>';
                appendMessage('wb-chat-msg--system', html);
              } else if (resolveResult.prompts && resolveResult.prompts.length > 0) {
                // May trigger further prompts (e.g., reclassification confirmation)
                // The next sendUtterance cycle will handle them
                chatInput.value = utterance;
                pendingUtterance = utterance;
                // Re-process with the resolved IRI in the options
                return;
              } else {
                appendMessage('wb-chat-msg--error',
                  `<strong>Error:</strong> ${escapeHtml(resolveResult.errorReason || 'Unknown error')}`);
              }
              pendingUtterance = null;
              chatInput.value = '';
            }
          });
        });
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
      pendingBfoCategoryChoice = null;
      pendingConsequenceChoice = null;
      chatInput.value = '';
    } else {
      // Error
      const reason = result.errorReason || 'Unknown error';
      appendMessage('wb-chat-msg--error', `<strong>Error:</strong> ${escapeHtml(reason)}`);
      pendingUtterance = null;
      scopeDecisions = new Map();
      pendingBfoCategoryChoice = null;
      pendingConsequenceChoice = null;
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
