import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '@tracedocs/graph';
import { checkAnnotationTargets } from '../src/checkAnnotationTargets.js';

describe('checkAnnotationTargets', () => {
  let store: GraphStore;
  let repositoryId: number;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
    repositoryId = store.upsertRepository('/repo');
    store.upsertNode(repositoryId, {
      stableId: 'src/a.ts#foo:function',
      type: 'function',
      name: 'foo',
      qualifiedName: 'foo',
      filePath: 'src/a.ts',
    });
  });

  afterEach(() => {
    store.close();
  });

  it('finds no issue when the annotation resolves to exactly one symbol', () => {
    const content = '<!-- tracedocs:documents src/a.ts#foo -->\n';
    expect(checkAnnotationTargets(content, store, repositoryId)).toEqual([]);
  });

  it('flags an annotation that resolves to no symbol', () => {
    const content = '<!-- tracedocs:documents src/a.ts#doesNotExist -->\n';
    const issues = checkAnnotationTargets(content, store, repositoryId);
    expect(issues).toEqual([
      expect.objectContaining({ check: 'annotation-target-resolution', severity: 'warning' }),
    ]);
  });

  it('flags an annotation that resolves ambiguously', () => {
    store.upsertNode(repositoryId, {
      stableId: 'src/a.ts#foo:class',
      type: 'class',
      name: 'foo',
      qualifiedName: 'foo',
      filePath: 'src/a.ts',
    });
    const content = '<!-- tracedocs:documents src/a.ts#foo -->\n';
    const issues = checkAnnotationTargets(content, store, repositoryId);
    expect(issues).toEqual([
      expect.objectContaining({ check: 'annotation-target-resolution', severity: 'warning' }),
    ]);
  });

  it('skips a malformed annotation (already reported by checkStructure)', () => {
    const content = '<!-- tracedocs:frobnicate src/a.ts -->\n';
    expect(checkAnnotationTargets(content, store, repositoryId)).toEqual([]);
  });
});
