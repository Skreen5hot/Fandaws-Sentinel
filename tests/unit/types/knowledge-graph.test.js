import { describe, it, expect } from '@jest/globals';
import { createKnowledgeGraph } from '../../../src/types/knowledge-graph.js';
import { FANDAWS_CONTEXT } from '../../../src/types/context.js';

describe('createKnowledgeGraph', () => {
  it('produces a node with @type fandaws:KnowledgeGraph', () => {
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/test' });
    expect(graph['@type']).toBe('fandaws:KnowledgeGraph');
  });

  it('includes @context from FANDAWS_CONTEXT', () => {
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/test' });
    expect(graph['@context']).toEqual(FANDAWS_CONTEXT['@context']);
  });

  it('sets @id from the id parameter', () => {
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/my-graph' });
    expect(graph['@id']).toBe('fandaws:graph/my-graph');
  });

  it('defaults concepts to empty array and relationships to vestigial empty array', () => {
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/empty' });
    expect(graph['fandaws:concepts']).toEqual([]);
    expect(graph['fandaws:relationships']).toEqual([]);
  });

  it('accepts concepts array', () => {
    const concepts = [{ '@id': 'fandaws:concept/dog' }];
    const graph = createKnowledgeGraph({
      id: 'fandaws:graph/populated',
      concepts,
    });
    expect(graph['fandaws:concepts']).toBe(concepts);
    expect(graph['fandaws:relationships']).toEqual([]);
  });

  it('includes metadata with createdAt and version', () => {
    const graph = createKnowledgeGraph({ id: 'fandaws:graph/test' });
    const meta = graph['fandaws:metadata'];
    expect(meta).toHaveProperty('fandaws:createdAt');
    expect(meta).toHaveProperty('fandaws:version', '0.1.0');
    expect(new Date(meta['fandaws:createdAt']).toISOString()).toBe(meta['fandaws:createdAt']);
  });

  it('allows metadata overrides', () => {
    const graph = createKnowledgeGraph({
      id: 'fandaws:graph/test',
      metadata: { 'fandaws:version': '1.0.0', 'fandaws:author': 'test' },
    });
    const meta = graph['fandaws:metadata'];
    expect(meta['fandaws:version']).toBe('1.0.0');
    expect(meta['fandaws:author']).toBe('test');
  });
});
