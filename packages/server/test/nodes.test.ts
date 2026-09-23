import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GraphStore } from '@tracedocs/graph';
import { buildServer } from '../src/app.js';
import { seedGraph } from './helpers/seed.js';

describe('GET /api/repositories/:id/nodes/:nodeId', () => {
  let app: FastifyInstance;
  let store: GraphStore;
  let repositoryId: number;
  let nodeIds: Record<string, number>;

  beforeEach(async () => {
    ({ store, repositoryId, nodeIds } = seedGraph());
    app = await buildServer(store);
  });

  afterEach(async () => {
    await app.close();
    store.close();
  });

  it('returns node detail with outgoing and incoming edges', async () => {
    const fooId = nodeIds['src/a.ts#foo:function']!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/nodes/${fooId}`,
    });
    const body = response.json();
    expect(body.node.name).toBe('foo');
    expect(body.outgoing).toHaveLength(1);
    expect(body.incoming).toHaveLength(1);
  });

  it('returns 404 for a node id that does not belong to the repository', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/nodes/999999`,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/repositories/:id/nodes/:nodeId/neighbors', () => {
  let app: FastifyInstance;
  let store: GraphStore;
  let repositoryId: number;
  let nodeIds: Record<string, number>;

  beforeEach(async () => {
    ({ store, repositoryId, nodeIds } = seedGraph());
    app = await buildServer(store);
  });

  afterEach(async () => {
    await app.close();
    store.close();
  });

  it('defaults to depth 1 in both directions', async () => {
    const fooId = nodeIds['src/a.ts#foo:function']!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/nodes/${fooId}/neighbors`,
    });
    const body = response.json();
    const names = body.steps.map((s: { node: { name: string } }) => s.node.name).sort();
    expect(names).toEqual(['bar', 'foo', 'src/a.ts']);
  });

  it('respects an explicit depth and direction', async () => {
    const fileId = nodeIds['src/a.ts#<file>:file']!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/nodes/${fileId}/neighbors?direction=out&depth=2`,
    });
    const body = response.json();
    const names = body.steps.map((s: { node: { name: string } }) => s.node.name).sort();
    expect(names).toEqual(['bar', 'foo', 'src/a.ts']);
  });

  it('filters by edge type', async () => {
    const fooId = nodeIds['src/a.ts#foo:function']!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/nodes/${fooId}/neighbors?types=CALLS`,
    });
    const body = response.json();
    const names = body.steps.map((s: { node: { name: string } }) => s.node.name).sort();
    expect(names).toEqual(['bar', 'foo']); // CONTAINS edge to the file is excluded
  });
});
