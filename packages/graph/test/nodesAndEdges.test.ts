import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '../src/graphStore.js';

describe('repositories, files, and nodes', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('upserts a repository idempotently, returning the same id', () => {
    const id1 = store.upsertRepository('/repo');
    const id2 = store.upsertRepository('/repo');
    expect(id1).toBe(id2);
  });

  it('upserts a node and can look it up by stable id', () => {
    const repoId = store.upsertRepository('/repo');
    const nodeId = store.upsertNode(repoId, {
      stableId: 'src/a.ts#foo:function',
      type: 'function',
      name: 'foo',
      qualifiedName: 'foo',
      filePath: 'src/a.ts',
      startLine: 1,
      endLine: 3,
    });

    const node = store.getNodeByStableId(repoId, 'src/a.ts#foo:function');
    expect(node?.id).toBe(nodeId);
    expect(node?.name).toBe('foo');
    expect(node?.type).toBe('function');
  });

  it('does not create a duplicate node when upserted twice with the same stable id', () => {
    const repoId = store.upsertRepository('/repo');
    const newNode = {
      stableId: 'src/a.ts#foo:function',
      type: 'function' as const,
      name: 'foo',
      qualifiedName: 'foo',
      filePath: 'src/a.ts',
    };
    const id1 = store.upsertNode(repoId, newNode);
    const id2 = store.upsertNode(repoId, { ...newNode, startLine: 5 });

    expect(id1).toBe(id2);
    expect(store.countNodes(repoId)).toBe(1);
    expect(store.getNodeById(id1)?.startLine).toBe(5);
  });

  it('keeps nodes from different repositories independent', () => {
    const repoA = store.upsertRepository('/repo-a');
    const repoB = store.upsertRepository('/repo-b');
    store.upsertNode(repoA, { stableId: 'src/a.ts#foo:function', type: 'function', name: 'foo' });
    store.upsertNode(repoB, { stableId: 'src/a.ts#foo:function', type: 'function', name: 'foo' });

    expect(store.countNodes(repoA)).toBe(1);
    expect(store.countNodes(repoB)).toBe(1);
  });

  it('finds nodes by file path and qualified name regardless of kind', () => {
    const repoId = store.upsertRepository('/repo');
    store.upsertNode(repoId, {
      stableId: 'src/a.ts#refreshAccessToken:function',
      type: 'function',
      name: 'refreshAccessToken',
      qualifiedName: 'refreshAccessToken',
      filePath: 'src/a.ts',
    });

    const matches = store.findNodesByFilePathAndQualifiedName(repoId, 'src/a.ts', 'refreshAccessToken');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.stableId).toBe('src/a.ts#refreshAccessToken:function');
  });
});

describe('edges', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  function seedTwoNodes(repoId: number) {
    store.upsertNode(repoId, { stableId: 'a', type: 'function', name: 'a' });
    store.upsertNode(repoId, { stableId: 'b', type: 'function', name: 'b' });
  }

  it('creates an edge between two known nodes', () => {
    const repoId = store.upsertRepository('/repo');
    seedTwoNodes(repoId);

    const edgeId = store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'b',
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });

    expect(edgeId).not.toBeNull();
    const a = store.getNodeByStableId(repoId, 'a')!;
    expect(store.listOutgoingEdges(a.id)).toHaveLength(1);
  });

  it('returns null instead of throwing when an endpoint is unresolved', () => {
    const repoId = store.upsertRepository('/repo');
    seedTwoNodes(repoId);

    const edgeId = store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'does-not-exist',
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });

    expect(edgeId).toBeNull();
  });

  it('does not duplicate an edge with the same source/target/type/evidence on re-index', () => {
    const repoId = store.upsertRepository('/repo');
    seedTwoNodes(repoId);
    const params = {
      sourceStableId: 'a',
      targetStableId: 'b',
      type: 'CALLS' as const,
      evidenceType: 'static_analysis' as const,
      certainty: 'HIGH' as const,
    };

    store.upsertEdge(repoId, params);
    store.upsertEdge(repoId, params);

    expect(store.countEdges(repoId)).toBe(1);
  });

  it('keeps a static-analysis edge and an AI-inferred edge as separate rows for the same pair', () => {
    const repoId = store.upsertRepository('/repo');
    seedTwoNodes(repoId);

    store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'b',
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });
    store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'b',
      type: 'CALLS',
      evidenceType: 'ai_inferred',
      certainty: 'LOW',
    });

    // A weaker AI-inferred guess must never silently replace the static-analysis edge.
    expect(store.countEdges(repoId)).toBe(2);
    const a = store.getNodeByStableId(repoId, 'a')!;
    const evidenceTypes = store.listOutgoingEdges(a.id).map((e) => e.evidenceType).sort();
    expect(evidenceTypes).toEqual(['ai_inferred', 'static_analysis']);
  });

  it('lists incoming edges independently of outgoing edges', () => {
    const repoId = store.upsertRepository('/repo');
    seedTwoNodes(repoId);
    store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'b',
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });

    const b = store.getNodeByStableId(repoId, 'b')!;
    expect(store.listIncomingEdges(b.id)).toHaveLength(1);
    expect(store.listOutgoingEdges(b.id)).toHaveLength(0);
  });
});
