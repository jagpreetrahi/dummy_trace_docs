import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GraphStore } from '@tracedocs/graph';
import { buildServer } from '../src/app.js';
import { seedGraph } from './helpers/seed.js';

describe('GET /api/repositories', () => {
  let app: FastifyInstance;
  let store: GraphStore;

  beforeEach(async () => {
    ({ store } = seedGraph());
    app = await buildServer(store);
  });

  afterEach(async () => {
    await app.close();
    store.close();
  });

  it('lists repositories with counts', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/repositories' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.repositories).toHaveLength(1);
    expect(body.repositories[0]).toMatchObject({
      repositoryRoot: '/repo',
      currentRevision: 'abc123',
      fileCount: 1,
      nodeCount: 3,
      edgeCount: 2,
    });
  });
});

describe('GET /api/repositories/:id', () => {
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

  it('returns repository detail with per-type breakdowns', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/repositories/${repositoryId}` });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.nodesByType).toEqual({ file: 1, function: 2 });
    expect(body.edgesByType).toEqual({ CONTAINS: 1, CALLS: 1 });
  });

  it('returns 404 for an unknown repository id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/repositories/9999' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.message).toMatch(/not found/i);
  });

  it('returns 400 for a non-numeric repository id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/repositories/not-a-number' });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/repositories/index', () => {
  it('returns 400 when path is missing', async () => {
    const { store } = seedGraph();
    const app = await buildServer(store);
    const response = await app.inject({ method: 'POST', url: '/api/repositories/index', payload: {} });
    expect(response.statusCode).toBe(400);
    await app.close();
    store.close();
  });
});
