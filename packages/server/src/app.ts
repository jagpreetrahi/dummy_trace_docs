import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { GraphStore } from '@tracedocs/graph';
import { HttpError } from './errors.js';
import { registerGraphRoutes } from './routes/graph.js';
import { registerNodeRoutes } from './routes/nodes.js';
import { registerPathRoutes } from './routes/path.js';
import { registerRepositoryRoutes } from './routes/repositories.js';
import { registerSearchRoutes } from './routes/search.js';

/**
 * Builds a Fastify instance wired to `store`, without binding a port —
 * callers decide whether to `.listen()` (the real server) or use
 * `.inject()` (tests), so tests never need a real network socket.
 */
export async function buildServer(store: GraphStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Local dev tool only: the API and the Vite dev server run on different
  // localhost ports, so the browser needs CORS to call it directly.
  await app.register(cors, { origin: true });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: { message: error.message } });
      return;
    }
    request.log.error(error);
    reply.status(500).send({ error: { message: 'Internal server error' } });
  });

  registerRepositoryRoutes(app, store);
  registerGraphRoutes(app, store);
  registerNodeRoutes(app, store);
  registerSearchRoutes(app, store);
  registerPathRoutes(app, store);

  return app;
}
