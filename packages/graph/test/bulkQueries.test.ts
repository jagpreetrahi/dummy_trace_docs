import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '../src/graphStore.js';

describe('listRepositories / getRepository', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('lists all repositories', () => {
    store.upsertRepository('/repo-a');
    store.upsertRepository('/repo-b');
    const repos = store.listRepositories();
    expect(repos.map((r) => r.repositoryRoot).sort()).toEqual(['/repo-a', '/repo-b']);
  });

  it('reflects markRepositoryIndexed', () => {
    const id = store.upsertRepository('/repo');
    store.markRepositoryIndexed(id, 'abc123', '2024-01-01T00:00:00.000Z');
    const repo = store.getRepository(id);
    expect(repo).toEqual({
      id,
      repositoryRoot: '/repo',
      currentRevision: 'abc123',
      indexedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('returns undefined for an unknown repository id', () => {
    expect(store.getRepository(9999)).toBeUndefined();
  });
});

describe('listNodes / listEdges', () => {
  let store: GraphStore;
  let repoId: number;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
    repoId = store.upsertRepository('/repo');
    store.upsertNode(repoId, { stableId: 'a', type: 'function', name: 'a' });
    store.upsertNode(repoId, { stableId: 'b', type: 'class', name: 'b' });
    store.upsertNode(repoId, { stableId: 'c', type: 'function', name: 'c' });
    store.upsertEdge(repoId, {
      sourceStableId: 'a',
      targetStableId: 'c',
      type: 'CALLS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });
    store.upsertEdge(repoId, {
      sourceStableId: 'b',
      targetStableId: 'a',
      type: 'CONTAINS',
      evidenceType: 'static_analysis',
      certainty: 'HIGH',
    });
  });

  afterEach(() => {
    store.close();
  });

  it('lists all nodes with no filter', () => {
    expect(store.listNodes(repoId)).toHaveLength(3);
  });

  it('filters nodes by type', () => {
    const functions = store.listNodes(repoId, { types: ['function'] });
    expect(functions.map((n) => n.stableId).sort()).toEqual(['a', 'c']);
  });

  it('caps results with limit', () => {
    expect(store.listNodes(repoId, { limit: 1 })).toHaveLength(1);
  });

  it('lists all edges with no filter', () => {
    expect(store.listEdges(repoId)).toHaveLength(2);
  });

  it('filters edges by type', () => {
    const calls = store.listEdges(repoId, { types: ['CALLS'] });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.type).toBe('CALLS');
  });
});

describe('searchNodes', () => {
  let store: GraphStore;
  let repoId: number;

  beforeEach(() => {
    store = GraphStore.open(':memory:');
    repoId = store.upsertRepository('/repo');
    store.upsertNode(repoId, {
      stableId: 's1',
      type: 'function',
      name: 'refreshAccessToken',
      filePath: 'src/auth/token.ts',
    });
    store.upsertNode(repoId, { stableId: 's2', type: 'function', name: 'unrelated', filePath: 'src/other.ts' });
  });

  afterEach(() => {
    store.close();
  });

  it('matches by name substring, case-insensitively', () => {
    const results = store.searchNodes(repoId, 'accesstoken');
    expect(results.map((n) => n.stableId)).toEqual(['s1']);
  });

  it('matches by file path substring', () => {
    const results = store.searchNodes(repoId, 'auth/token');
    expect(results.map((n) => n.stableId)).toEqual(['s1']);
  });

  it('returns no results for a non-matching query', () => {
    expect(store.searchNodes(repoId, 'doesnotexist')).toEqual([]);
  });

  it('treats % and _ in the query as literal characters, not wildcards', () => {
    store.upsertNode(repoId, { stableId: 's3', type: 'function', name: 'a%b_c' });
    expect(store.searchNodes(repoId, '%b_')).toEqual([expect.objectContaining({ stableId: 's3' })]);
    expect(store.searchNodes(repoId, 'axb')).toEqual([]);
  });
});

describe('countFiles', () => {
  it('counts files for a repository', () => {
    const store = GraphStore.open(':memory:');
    const repoId = store.upsertRepository('/repo');
    store.upsertFile(repoId, 'a.ts', 'typescript', 'hash1', '2024-01-01T00:00:00.000Z');
    store.upsertFile(repoId, 'b.ts', 'typescript', 'hash2', '2024-01-01T00:00:00.000Z');
    expect(store.countFiles(repoId)).toBe(2);
    store.close();
  });
});
