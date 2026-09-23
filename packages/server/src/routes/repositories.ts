import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@tracedocs/graph';
import { indexRepository } from '@tracedocs/indexer';
import { getRepositoryOrThrow } from '../repositoryLookup.js';
import { indexBodySchema, repositoryIdParamSchema } from '../schemas.js';
import { parseOrThrow } from '../validate.js';

function withCounts(store: GraphStore, repo: { id: number }) {
  return {
    fileCount: store.countFiles(repo.id),
    nodeCount: store.countNodes(repo.id),
    edgeCount: store.countEdges(repo.id),
  };
}

export function registerRepositoryRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/repositories', async () => {
    const repositories = store.listRepositories().map((repo) => ({ ...repo, ...withCounts(store, repo) }));
    return { repositories };
  });

  app.get('/api/repositories/:id', async (request) => {
    const { id } = parseOrThrow(repositoryIdParamSchema, request.params);
    const repo = getRepositoryOrThrow(store, id);
    return {
      ...repo,
      ...withCounts(store, repo),
      nodesByType: store.countNodesByType(id),
      edgesByType: store.countEdgesByType(id),
    };
  });

  app.post('/api/repositories/index', async (request) => {
    const { path } = parseOrThrow(indexBodySchema, request.body);
    return indexRepository(path, store);
  });
}
