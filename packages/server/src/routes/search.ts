import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@tracedocs/graph';
import { getRepositoryOrThrow } from '../repositoryLookup.js';
import { repositoryIdParamSchema, searchQuerySchema } from '../schemas.js';
import { parseOrThrow } from '../validate.js';

export function registerSearchRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/repositories/:id/search', async (request) => {
    const { id } = parseOrThrow(repositoryIdParamSchema, request.params);
    getRepositoryOrThrow(store, id);
    const { q, limit } = parseOrThrow(searchQuerySchema, request.query);
    return { results: store.searchNodes(id, q, limit) };
  });
}
