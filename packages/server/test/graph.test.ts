import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GraphStore } from '@tracedocs/graph';
import { buildServer } from '../src/app.js';
import { seedGraph } from './helpers/seed.js';

describe('GET /api/repositories/:id/graph', () => {
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

  it('returns all nodes and edges within the default limit', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/repositories/${repositoryId}/graph` });
    const body = response.json();
    expect(body.nodes).toHaveLength(3);
    expect(body.edges).toHaveLength(2);
    expect(body.truncated).toBe(false);
  });

  it('filters nodes by type and drops edges that would dangle', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/graph?types=function`,
    });
    const body = response.json();
    expect(body.nodes).toHaveLength(2);
    // The CONTAINS edge (file -> foo) is dropped since the file node isn't
    // in the filtered set; the CALLS edge (foo -> bar) survives.
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0].type).toBe('CALLS');
  });

  it('filters edges independently by edgeTypes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/graph?edgeTypes=CONTAINS`,
    });
    const body = response.json();
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0].type).toBe('CONTAINS');
  });

  it('reports truncated when limit caps the node set', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/graph?limit=2`,
    });
    const body = response.json();
    expect(body.nodes).toHaveLength(2);
    expect(body.truncated).toBe(true);
  });

  it('rejects an unknown node type filter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/repositories/${repositoryId}/graph?types=not-a-real-type`,
    });
    expect(response.statusCode).toBe(400);
  });
});
