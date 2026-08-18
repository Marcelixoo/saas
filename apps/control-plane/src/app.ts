import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { config } from './config';
import { ApiError, errorBody } from './lib/errors';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import type { AppDeps } from './types';

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.decorate('deps', deps);

  app.register(jwt, { secret: config.jwtSecret });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send(errorBody(error.code, error.message));
      return;
    }
    if ((error as { validation?: unknown }).validation) {
      reply.code(400).send(errorBody('VALIDATION_ERROR', error.message));
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    reply.code(500).send(errorBody('INTERNAL_ERROR', 'An unexpected error occurred'));
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.register(authRoutes);
  app.register(organizationRoutes);

  return app;
}
