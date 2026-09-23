import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@tracedocs/graph';
import { NotFoundError } from '../errors.js';
import { getNodeInRepoOrThrow, getRepositoryOrThrow } from '../repositoryLookup.js';
import { pathQuerySchema, repositoryIdParamSchema } from '../schemas.js';
import { parseOrThrow } from '../validate.js';

export function registerPathRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/repositories/:id/path', async (request) => {
    const { id } = parseOrThrow(repositoryIdParamSchema, request.params);
    getRepositoryOrThrow(store, id);
    const { from, to, maxDepth } = parseOrThrow(pathQuerySchema, request.query);
    getNodeInRepoOrThrow(store, id, from);
    getNodeInRepoOrThrow(store, id, to);

    const path = store.findPath(from, to, { maxDepth });
    if (!path) {
      throw new NotFoundError(`No path found between nodes ${from} and ${to} within depth ${maxDepth}`);
    }
    return { path };
  });
}
