/**
 * MachineSignal — structured machine-facing interface for conversation prompts.
 *
 * Phase 13 implementation. Generates the layered MachineSignal (common
 * envelope + prompt-type-specific extension) for every ConversationPrompt
 * when callerMode === 'agent'. Returns null when callerMode === 'human'.
 *
 * Decision A: Layered schema (envelope + extension, not flat).
 * Decision B: Prompt type registry with validation.
 * Decision C: Full JSON Schema (draft-07) for expectedSchema.
 *
 * @see docs/architecture/phase-13-locked-decisions.md
 */

// ─────────────────────────────────────────────────────────
// Prompt Type Registry (Decision B)
// ─────────────────────────────────────────────────────────

const PROMPT_TYPE_REGISTRY = new Map([
  ['reclassificationConsequence', {
    constraintType: 'subsumption',
    buildExtension: buildReclassificationExtension,
    buildSchema: buildReclassificationSchema,
  }],
  ['conflictResolution', {
    constraintType: 'scopeLevel',
    buildExtension: buildConflictExtension,
    buildSchema: buildConflictSchema,
  }],
  ['staleCopyPrompt', {
    constraintType: 'scopeLevel',
    buildExtension: buildStaleCopyExtension,
    buildSchema: buildStaleCopySchema,
  }],
  ['refineDisambiguationRequired', {
    constraintType: 'scopeLevel',
    buildExtension: buildRefineDisambiguationExtension,
    buildSchema: buildRefineDisambiguationSchema,
  }],
  ['objectResolution', {
    constraintType: 'inherence',
    buildExtension: buildObjectResolutionExtension,
    buildSchema: buildObjectResolutionSchema,
  }],
  ['homonymDisambiguation', {
    constraintType: 'subsumption',
    buildExtension: buildHomonymExtension,
    buildSchema: buildHomonymSchema,
  }],
  ['importedConceptGuard', {
    constraintType: 'inherence',
    buildExtension: buildImportedGuardExtension,
    buildSchema: buildImportedGuardSchema,
  }],
  ['deadlockRemediation', {
    constraintType: null, // varies by cascade step
    buildExtension: buildDeadlockExtension,
    buildSchema: buildDeadlockSchema,
  }],
  // Pre-existing prompt types not in the locked decisions but emitted by
  // the engine. Added to the registry so they don't throw
  // SchemaValidationError when callerMode='agent'.
  ['disambiguation', {
    constraintType: 'subsumption',
    buildExtension: buildGenericExtension,
    buildSchema: buildGenericSchema,
  }],
  ['confirmation', {
    constraintType: 'subsumption',
    buildExtension: buildGenericExtension,
    buildSchema: buildGenericSchema,
  }],
  ['reclassificationConfirmation', {
    constraintType: 'subsumption',
    buildExtension: buildGenericExtension,
    buildSchema: buildGenericSchema,
  }],
  ['scopeNarrowing', {
    constraintType: 'inherence',
    buildExtension: buildGenericExtension,
    buildSchema: buildGenericSchema,
  }],
  ['bfoCategoryDisambiguation', {
    constraintType: 'subsumption',
    buildExtension: buildGenericExtension,
    buildSchema: buildGenericSchema,
  }],
]);

/**
 * Get all registered prompt type names.
 */
export function getRegisteredPromptTypes() {
  return [...PROMPT_TYPE_REGISTRY.keys()];
}

/**
 * Check if a prompt type is registered.
 */
export function isRegisteredPromptType(promptType) {
  return PROMPT_TYPE_REGISTRY.has(promptType);
}

// ─────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────

/**
 * Build a MachineSignal for a ConversationPrompt.
 *
 * @param {string} callerMode - 'agent' or 'human'
 * @param {object} prompt - ConversationPrompt JSON-LD
 * @param {object} [enrichmentContext={}] - Additional context for extension building
 * @returns {object|null} MachineSignal or null (human mode)
 * @throws {Error} SchemaValidationError if promptType is not registered
 */
export function buildMachineSignal(callerMode, prompt, enrichmentContext = {}) {
  if (callerMode !== 'agent') return null;

  const promptType = prompt['fandaws:promptType'];
  const registration = PROMPT_TYPE_REGISTRY.get(promptType);

  if (!registration) {
    const error = new Error(
      `SchemaValidationError: unregistered prompt type "${promptType}". ` +
      `Registered types: ${[...PROMPT_TYPE_REGISTRY.keys()].join(', ')}`,
    );
    error.type = 'SchemaValidationError';
    error.reason = 'unregistered_prompt_type';
    error.registeredTypes = [...PROMPT_TYPE_REGISTRY.keys()];
    throw error;
  }

  const options = extractOptions(prompt);
  const constraintType = enrichmentContext.constraintType
    || registration.constraintType
    || 'subsumption';

  const envelope = {
    promptType,
    constraintType,
    options,
    expectedSchema: registration.buildSchema(options, enrichmentContext),
  };

  // candidateIRIs — populated for disambiguation and conflict prompts
  if (enrichmentContext.candidateIRIs) {
    envelope.candidateIRIs = enrichmentContext.candidateIRIs;
  }

  // hierarchyContext — populated for disambiguation prompts
  if (enrichmentContext.hierarchyContext) {
    envelope.hierarchyContext = enrichmentContext.hierarchyContext;
  }

  const extension = registration.buildExtension(prompt, enrichmentContext);

  return { envelope, extension };
}

/**
 * Validate an agent response against a MachineSignal's expectedSchema.
 *
 * @param {object} response - Agent's response object
 * @param {object} expectedSchema - JSON Schema from the MachineSignal
 * @returns {{ valid: boolean, errors?: string[] }}
 */
export function validateAgentResponse(response, expectedSchema) {
  // Minimal JSON Schema validation for draft-07
  // Check required properties
  const required = expectedSchema.required || [];
  const properties = expectedSchema.properties || {};
  const errors = [];

  for (const field of required) {
    if (!(field in response)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check enum constraints on properties
  for (const [field, schema] of Object.entries(properties)) {
    if (field in response && schema.enum) {
      if (!schema.enum.includes(response[field])) {
        errors.push(`Invalid value for ${field}: "${response[field]}". Expected one of: ${schema.enum.join(', ')}`);
      }
    }
  }

  // Check additionalProperties
  if (expectedSchema.additionalProperties === false) {
    const allowed = new Set(Object.keys(properties));
    for (const key of Object.keys(response)) {
      if (!allowed.has(key)) {
        errors.push(`Unexpected property: ${key}`);
      }
    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function extractOptions(prompt) {
  const opts = prompt['fandaws:options'];
  if (!opts) return [];
  if (Array.isArray(opts)) {
    return opts.map((o) => (typeof o === 'object' ? o.action : o)).filter(Boolean);
  }
  return [];
}

// ─────────────────────────────────────────────────────────
// Schema builders (Decision C — JSON Schema draft-07)
// ─────────────────────────────────────────────────────────

function makeChoiceSchema(options) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      choice: {
        type: 'string',
        enum: options,
      },
    },
    required: ['choice'],
    additionalProperties: false,
  };
}

function buildReclassificationSchema(options) {
  return makeChoiceSchema(options);
}

function buildConflictSchema(options) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      choice: { type: 'string', enum: options },
      selected: { type: 'string', description: 'Scope graphId for useDefinition' },
      disambiguations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            suffix: { type: 'string' },
          },
        },
        description: 'For createDistinct',
      },
      newDisplayLabel: { type: 'string', description: 'For refine' },
      refineReason: { type: 'string', description: 'For refine' },
    },
    required: ['choice'],
  };
}

function buildStaleCopySchema(options) {
  return makeChoiceSchema(options);
}

function buildRefineDisambiguationSchema(options) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      newDisplayLabel: { type: 'string', minLength: 1 },
    },
    required: ['newDisplayLabel'],
    additionalProperties: false,
  };
}

function buildObjectResolutionSchema(options) {
  return makeChoiceSchema(options.length > 0 ? options : ['classify', 'skip']);
}

function buildHomonymSchema(options) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      selectedIRI: { type: 'string', description: 'IRI of the selected candidate' },
    },
    required: ['selectedIRI'],
    additionalProperties: false,
  };
}

function buildImportedGuardSchema() {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      acknowledged: { type: 'boolean' },
    },
    required: ['acknowledged'],
    additionalProperties: false,
  };
}

function buildDeadlockSchema(options) {
  return makeChoiceSchema(options);
}

// ─────────────────────────────────────────────────────────
// Extension builders (prompt-type-specific payloads)
// ─────────────────────────────────────────────────────────

function buildReclassificationExtension(prompt, ctx) {
  const context = prompt['fandaws:context'] || {};
  return {
    caseType: context.caseType || ctx.caseType || null,
    subject: context.subjectLabel || ctx.subject || null,
    currentParent: ctx.currentParent || null,
    proposedParent: ctx.proposedParent || null,
    lostProperties: ctx.lostProperties || [],
  };
}

function buildConflictExtension(prompt, ctx) {
  return {
    term: ctx.term || null,
    definitions: ctx.definitions || [],
  };
}

function buildStaleCopyExtension(prompt, ctx) {
  return {
    term: ctx.term || null,
    localVersion: ctx.localVersion || null,
    sourceVersion: ctx.sourceVersion || null,
    differences: ctx.differences || [],
  };
}

function buildRefineDisambiguationExtension(prompt, ctx) {
  return {
    attemptedLabel: ctx.attemptedLabel || null,
    conflictingTerm: ctx.conflictingTerm || null,
  };
}

function buildObjectResolutionExtension(prompt, ctx) {
  return {
    term: ctx.term || null,
    missingClassification: ctx.missingClassification || null,
  };
}

function buildHomonymExtension(prompt, ctx) {
  return {
    candidates: ctx.candidates || [],
    hierarchyContext: ctx.hierarchyContext || null,
  };
}

function buildImportedGuardExtension(prompt, ctx) {
  const context = prompt['fandaws:context'] || {};
  return {
    blockedConcept: context.subjectLabel || ctx.blockedConcept || null,
    reason: ctx.reason || 'Imported concepts are read-only',
    isImported: true,
  };
}

function buildGenericExtension(prompt, ctx) {
  return { ...ctx };
}

function buildGenericSchema(options) {
  if (options && options.length > 0) {
    return makeChoiceSchema(options);
  }
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      acknowledged: { type: 'boolean' },
    },
    required: ['acknowledged'],
  };
}

function buildDeadlockExtension(prompt, ctx) {
  return {
    concept: ctx.concept || null,
    mutationType: ctx.mutationType || null,
    rejectionCount: ctx.rejectionCount || 0,
    suggestedRepair: ctx.suggestedRepair || undefined,
    deferralReason: ctx.deferralReason || undefined,
  };
}
