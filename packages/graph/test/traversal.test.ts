import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '../src/graphStore.js';

/**
 * Builds: a -> b -> c -> d, plus a cycle d -> a, and an isolated node e.
 */
function buildChainWithCycle(store: GraphStore, repoId: number): void {
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    store.upsertNode(repoId, { stableId: id, type: 'function', name: id });
  }
  const edge = (from: string, to: string) =>
    store.upsertEdge(repoId, {
      sourceStableId: from,
      targetStableId: to,
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });
  edge('a', 'b');
  edge('b', 'c');
  edge('c', 'd');
  edge('d', 'a'); // cycle back to the start
}

describe('traverse', () => {
  let store: GraphStore;
  let repoId: number;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
    repoId = store.upsertRepository('/repo');
    buildChainWithCycle(store, repoId);
  });

  afterEach(() => {
    store.close();
  });

  it('includes the start node at depth 0', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const steps = store.traverse(a.id, { direction: 'out', maxDepth: 0 });
    expect(steps).toEqual([{ node: a, depth: 0, viaEdge: null }]);
  });

  it('respects maxDepth', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const steps = store.traverse(a.id, { direction: 'out', maxDepth: 2 });
    const names = steps.map((s) => s.node.name).sort();
    expect(names).toEqual(['a', 'b', 'c']);
  });

  it('terminates and visits each node at most once despite a cycle', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const steps = store.traverse(a.id, { direction: 'out', maxDepth: 10 });
    const names = steps.map((s) => s.node.name).sort();
    expect(names).toEqual(['a', 'b', 'c', 'd']); // 'e' is unreachable from 'a'
    expect(new Set(names).size).toBe(names.length); // no duplicates
  });

  it('traverses in reverse using direction "in"', () => {
    const c = store.getNodeByStableId(repoId, 'c')!;
    const steps = store.traverse(c.id, { direction: 'in', maxDepth: 1 });
    expect(steps.map((s) => s.node.name).sort()).toEqual(['b', 'c']);
  });

  it('finds no neighbors for an isolated node', () => {
    const e = store.getNodeByStableId(repoId, 'e')!;
    const steps = store.traverse(e.id, { direction: 'both', maxDepth: 5 });
    expect(steps).toEqual([{ node: e, depth: 0, viaEdge: null }]);
  });
});

describe('findPath', () => {
  let store: GraphStore;
  let repoId: number;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
    repoId = store.upsertRepository('/repo');
    buildChainWithCycle(store, repoId);
  });

  afterEach(() => {
    store.close();
  });

  it('finds the direct path between adjacent nodes', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const b = store.getNodeByStableId(repoId, 'b')!;
    const path = store.findPath(a.id, b.id, { maxDepth: 5 });
    expect(path?.map((s) => s.node.name)).toEqual(['a', 'b']);
    expect(path?.[0]?.viaEdge).toBeNull();
    expect(path?.[1]?.viaEdge?.type).toBe('CALLS');
  });

  it('finds the shortest multi-hop path', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const d = store.getNodeByStableId(repoId, 'd')!;
    const path = store.findPath(a.id, d.id, { direction: 'out', maxDepth: 5 });
    expect(path?.map((s) => s.node.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns a single-node path when from equals to', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const path = store.findPath(a.id, a.id, { maxDepth: 5 });
    expect(path).toEqual([{ node: a, viaEdge: null }]);
  });

  it('returns null when no path exists within maxDepth', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const e = store.getNodeByStableId(repoId, 'e')!;
    expect(store.findPath(a.id, e.id, { maxDepth: 10 })).toBeNull();
  });

  it('returns null when the path exceeds maxDepth even though one exists', () => {
    const a = store.getNodeByStableId(repoId, 'a')!;
    const d = store.getNodeByStableId(repoId, 'd')!;
    expect(store.findPath(a.id, d.id, { direction: 'out', maxDepth: 2 })).toBeNull();
  });
});
