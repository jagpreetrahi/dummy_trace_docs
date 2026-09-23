import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GraphStore } from '@tracedocs/graph';
import { buildServer } from '../src/app.js';
import { seedGraph } from './helpers/seed.js';

describe('GET /api/repositories/:id/search', () => {
  let app: FastifyInstance;
  let store: GraphStore;
  let repositoryId: number;

  beforeEach(async () => {
    ({ store, repositoryId } = seedGraph());
    app = await buildServer(store);
  });

  afterEach(async () => {
    await app.close();
    store.close();
  });

  it('finds a node by substring', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/search?q=fo`,
    });
    const body = response.json();
    expect(body.results.map((n: { name: string }) => n.name)).toEqual(['foo']);
  });

  it('requires a non-empty query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/search?q=`,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/repositories/:id/path', () => {
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

  it('finds the path between two connected nodes', async () => {
    const fileId = nodeIds['src/a.ts#<file>:file']!;
    const barId = nodeIds['src/a.ts#bar:function']!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/path?from=${fileId}&to=${barId}&maxDepth=5`,
    });
    const body = response.json();
    expect(body.path.map((s: { node: { name: string } }) => s.node.name)).toEqual([
      'src/a.ts',
      'foo',
      'bar',
    ]);
  });

  it('returns 404 when no path exists within maxDepth', async () => {
    const fileId = nodeIds['src/a.ts#<file>:file']!;
    const barId = nodeIds['src/a.ts#bar:function']!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/path?from=${fileId}&to=${barId}&maxDepth=1`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when a node id does not belong to the repository', async () => {
    const fileId = nodeIds['src/a.ts#<file>:file']!;
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/path?from=${fileId}&to=999999&maxDepth=5`,
    });
    expect(response.statusCode).toBe(404);
  });
});
