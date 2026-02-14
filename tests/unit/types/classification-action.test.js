import { describe, it, expect } from '@jest/globals';
import { createClassificationAction } from '../../../src/types/classification-action.js';

describe('createClassificationAction', () => {
  it('has correct @type', () => {
    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'dog',
      object: 'animal',
    });
    expect(action['@type']).toBe('fandaws:ClassificationAction');
  });

  it('creates a classification workflow action', () => {
    const action = createClassificationAction({
      workflow: 'classification',
      subject: 'dog',
      object: 'animal',
    });
    expect(action['fandaws:workflow']).toBe('classification');
    expect(action['fandaws:subject']).toBe('dog');
    expect(action['fandaws:object']).toBe('animal');
    expect(action['fandaws:verb']).toBeNull();
  });

  it('creates a property workflow action', () => {
    const action = createClassificationAction({
      workflow: 'property',
      subject: 'dog',
      object: 'fur',
    });
    expect(action['fandaws:workflow']).toBe('property');
    expect(action['fandaws:verb']).toBeNull();
  });

  it('creates a customRelationship workflow action with verb', () => {
    const action = createClassificationAction({
      workflow: 'customRelationship',
      subject: 'dogs',
      object: 'cats',
      verb: 'chase',
    });
    expect(action['fandaws:workflow']).toBe('customRelationship');
    expect(action['fandaws:verb']).toBe('chase');
  });

  it('produces fresh objects per call', () => {
    const params = { workflow: 'classification', subject: 'x', object: 'y' };
    const a = createClassificationAction(params);
    const b = createClassificationAction(params);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
