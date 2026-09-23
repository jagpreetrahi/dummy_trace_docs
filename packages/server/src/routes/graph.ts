import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@tracedocs/graph';
import { getRepositoryOrThrow } from '../repositoryLookup.js';
import { graphQuerySchema, repositoryIdParamSchema } from '../schemas.js';
import { parseOrThrow } from '../validate.js';

export function registerGraphRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/repositories/:id/graph', async (request) => {
    const { id } = parseOrThrow(repositoryIdParamSchema, request.params);
    getRepositoryOrThrow(store, id);
    const { types, edgeTypes, limit } = parseOrThrow(graphQuerySchema, request.query);

    const nodes = store.listNodes(id, { ...(types ? { types } : {}), limit });
    // Only edges whose endpoints are both in the returned (possibly
    // filtered/truncated) node set — otherwise the client would be asked
    // to render an edge pointing at a node it was never given.
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = store
      .listEdges(id, edgeTypes ? { types: edgeTypes } : {})
      .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId));

    return { nodes, edges, truncated: nodes.length >= limit };
  });
}
