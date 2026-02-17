/**
 * Pipeline Contract Tests — verifies handoff contracts between pipeline stages.
 *
 * SUP-01: Parser → Classifier contract (malformed ParseResult)
 * SUP-02: Classifier → KnowledgeEngine contract (unhandled workflows)
 * SUP-03: Full pipeline error propagation
 *
 * @see docs/data/supplemental-test-spec.md
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { classify } from '../../src/core/classifier/classifier.js';
import { parse } from '../../src/core/nl-parser/nl-parser.js';
import { createParseResult } from '../../src/types/parse-result.js';
import { createClassificationAction } from '../../src/types/classification-action.js';
import { processClassification } from '../../src/core/knowledge-engine/knowledge-engine.js';
import { runClassificationPipeline } from '../../src/core/pipeline/classification-pipeline.js';
import { InMemoryStateAdapter } from '../../src/adapters/state/in-memory-state-adapter.js';
import { createKnowledgeGraph } from '../../src/types/knowledge-graph.js';
import { createConcept } from '../../src/types/concept.js';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const GRAPH_ID = 'fandaws:graph/test';

function makeGraph(concepts = []) {
  return createKnowledgeGraph({ id: GRAPH_ID, concepts });
}

function makeConcept(id, label, prefLabel, broader = null) {
  return createConcept({ id, label, prefLabel, broader });
}

function emptyIndices() {
  return {
    canonicalLabelToIri: new Map(),
    iriToParent: new Map(),
    iriToChildren: new Map(),
  };
}

// ─────────────────────────────────────────────────────────
// SUP-01: Parser → Classifier Contract
// ─────────────────────────────────────────────────────────

describe('Parser → Classifier contract (SUP-01)', () => {
  it('SUP-01a: handles ParseResult with null subject', () => {
    const pr = createParseResult({
      predicate: 'is a',
      object: 'animal',
      verbType: 'classification',
      confidence: 1.0,
    });
    const action = classify(pr);
    expect(action['@type']).toBe('fandaws:ClassificationAction');
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('missing-operands');
  });

  it('SUP-01b: handles ParseResult with empty predicate but valid verbType', () => {
    const pr = createParseResult({
      subject: 'dog',
      predicate: '',
      object: 'animal',
      verbType: 'classification',
      confidence: 1.0,
    });
    const action = classify(pr);
    // Classifier routes on verbType, not predicate text
    expect(action['fandaws:error']).toBeFalsy();
    expect(action['fandaws:workflow']).toBe('classification');
  });

  it('SUP-01c: parse error propagates through classifier', () => {
    const pr = parse('dog'); // single word → errorReason: 'no-predicate'
    expect(pr['fandaws:error']).toBe(true);
    expect(pr['fandaws:errorReason']).toBe('no-predicate');

    const action = classify(pr);
    expect(action['fandaws:error']).toBe(true);
    expect(action['fandaws:errorReason']).toBe('no-predicate');
    expect(action['fandaws:workflow']).toBeNull();
  });

  it('SUP-01d: classifier never throws on any malformed input', () => {
    const malformed = [null, undefined, {}, 'string', 42, [], true];
    for (const input of malformed) {
      const action = classify(input);
      expect(action['@type']).toBe('fandaws:ClassificationAction');
      expect(action['fandaws:error']).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────
// SUP-02: Classifier → KnowledgeEngine Contract
// ─────────────────────────────────────────────────────────

describe('Classifier → KnowledgeEngine contract (SUP-02)', () => {
  it('SUP-02a: processClassification rejects property workflow', () => {
    const action = createClassificationAction({
      workflow: 'property',
      subject: 'dog',
      object: 'fur',
    });
    const result = processClassification(action, makeGraph(), emptyIndices());
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('invalid-workflow');
    expect(result.mutation).toBeNull();
  });

  it('SUP-02b: processClassification rejects customRelationship workflow', () => {
    const action = createClassificationAction({
      workflow: 'customRelationship',
      subject: 'dog',
      object: 'cat',
      verb: 'chases',
    });
    const result = processClassification(action, makeGraph(), emptyIndices());
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('invalid-workflow');
  });

  it('SUP-02c: pipeline returns wrong-workflow for relationship utterance', () => {
    const adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());
    const context = { stateAdapter: adapter, graphId: GRAPH_ID };

    const result = runClassificationPipeline('Dogs chase cats', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('wrong-workflow: customRelationship');
  });

  it('SUP-02d: pipeline returns wrong-workflow for property utterance', () => {
    const adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());
    const context = { stateAdapter: adapter, graphId: GRAPH_ID };

    const result = runClassificationPipeline('A dog has fur', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('wrong-workflow: property');
  });
});

// ─────────────────────────────────────────────────────────
// SUP-03: Full Pipeline Error Propagation
// ─────────────────────────────────────────────────────────

describe('Pipeline error propagation (SUP-03)', () => {
  let adapter;
  let context;

  beforeEach(() => {
    adapter = new InMemoryStateAdapter();
    adapter.saveGraph(GRAPH_ID, makeGraph());
    context = { stateAdapter: adapter, graphId: GRAPH_ID };
  });

  it('SUP-03a: circular classification returns error, graph unchanged', () => {
    const animal = makeConcept('fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal', 'Animal', 'animal');
    const dog = makeConcept(
      'fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog', 'fandaws:class/d6123e71-7602-59f2-aaad-b86d549898c3/animal',
    );
    adapter.saveGraph(GRAPH_ID, makeGraph([animal, dog]));

    const result = runClassificationPipeline('An animal is a dog', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toContain('circular');

    // Graph must be unchanged
    const graph = adapter.loadGraph(GRAPH_ID);
    const savedAnimal = graph['fandaws:concepts'].find(
      (c) => c['skos:prefLabel'] === 'animal',
    );
    expect(savedAnimal['skos:broader']).toBeNull();
  });

  it('SUP-03b: unparseable input returns parse-error', () => {
    const result = runClassificationPipeline('!@#$%^&*()', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toMatch(/^parse-error:/);
  });

  it('SUP-03c: empty string returns parse-error: empty-input', () => {
    const result = runClassificationPipeline('', context);
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('parse-error: empty-input');
  });

  it('SUP-03d: validation failure propagates through pipeline', () => {
    const dog = {
      ...makeConcept('fandaws:class/4d6c7722-3b8d-554b-9506-9db415d16cda/dog', 'Dog', 'dog'),
      'fandaws:governanceFlag': {
        'fandaws:severity': 'blocking',
        'fandaws:reason': 'Under governance review.',
      },
    };
    adapter.saveGraph(GRAPH_ID, makeGraph([dog]));

    const result = runClassificationPipeline('A dog is an animal', context);
    expect(result.success).toBe(false);
    expect(result.error).toBe(true);
    expect(result.errorReason).toBe('validation-failed');
  });
});
