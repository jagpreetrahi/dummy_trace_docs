import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '../src/graphStore.js';

describe('deleteNodesForFile', () => {
  let store: GraphStore;
  let repoId: number;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
    repoId = store.upsertRepository('/repo');
  });

  afterEach(() => {
    store.close();
  });

  it('removes only nodes belonging to the given file', () => {
    store.upsertNode(repoId, { stableId: 'a', type: 'function', name: 'a', filePath: 'src/a.ts' });
    store.upsertNode(repoId, { stableId: 'b', type: 'function', name: 'b', filePath: 'src/b.ts' });

    store.deleteNodesForFile(repoId, 'src/a.ts');

    expect(store.getNodeByStableId(repoId, 'a')).toBeUndefined();
    expect(store.getNodeByStableId(repoId, 'b')).toBeDefined();
  });

  it('cascades to edges owned entirely within the deleted file', () => {
    store.upsertNode(repoId, { stableId: 'a', type: 'function', name: 'a', filePath: 'src/a.ts' });
    store.upsertNode(repoId, { stableId: 'a2', type: 'function', name: 'a2', filePath: 'src/a.ts' });
    store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'a2',
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });

    store.deleteNodesForFile(repoId, 'src/a.ts');

    expect(store.countEdges(repoId)).toBe(0);
  });

  it('reports a cross-file edge as dangling and removes it', () => {
    store.upsertNode(repoId, { stableId: 'a', type: 'file', name: 'a.ts', filePath: 'src/a.ts' });
    store.upsertNode(repoId, { stableId: 'b', type: 'file', name: 'b.ts', filePath: 'src/b.ts' });
    store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'b',
      type: 'IMPORTS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });

    const dangling = store.deleteNodesForFile(repoId, 'src/b.ts');

    expect(dangling).toEqual([
      { sourceStableId: 'a', targetStableId: 'b', edgeType: 'IMPORTS' },
    ]);
    expect(store.countEdges(repoId)).toBe(0);
  });

  it('is a no-op when the file has no nodes', () => {
    const dangling = store.deleteNodesForFile(repoId, 'src/does-not-exist.ts');
    expect(dangling).toEqual([]);
  });
});
