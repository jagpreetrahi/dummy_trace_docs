import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@tracedocs/graph';
import { getNodeInRepoOrThrow, getRepositoryOrThrow } from '../repositoryLookup.js';
import { neighborsQuerySchema, nodeIdParamSchema } from '../schemas.js';
import { parseOrThrow } from '../validate.js';

export function registerNodeRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/repositories/:id/nodes/:nodeId', async (request) => {
    const { id, nodeId } = parseOrThrow(nodeIdParamSchema, request.params);
    getRepositoryOrThrow(store, id);
    const node = getNodeInRepoOrThrow(store, id, nodeId);
    return {
      node,
      outgoing: store.listOutgoingEdges(nodeId),
      incoming: store.listIncomingEdges(nodeId),
    };
  });

  app.get('/api/repositories/:id/nodes/:nodeId/neighbors', async (request) => {
    const { id, nodeId } = parseOrThrow(nodeIdParamSchema, request.params);
    getRepositoryOrThrow(store, id);
    getNodeInRepoOrThrow(store, id, nodeId);
    const { direction, depth, types } = parseOrThrow(neighborsQuerySchema, request.query);

    const steps = store.traverse(nodeId, {
      direction,
      maxDepth: depth,
      ...(types ? { edgeTypes: types } : {}),
    });
    return { steps };
  });
}
